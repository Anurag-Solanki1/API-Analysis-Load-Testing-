package com.codechecker.web;

import com.codechecker.entity.GatewayConfigEntity;
import com.codechecker.model.GatewayHit;
import com.codechecker.repository.GatewayConfigRepository;
import com.codechecker.service.GatewayMonitorService;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.security.cert.X509Certificate;

/**
 * Reverse-proxy gateway.
 *
 * Any request to /api/gateway/{projectName}/your/real/path
 * is forwarded to <configuredTargetBaseUrl>/your/real/path
 *
 * Latency is measured, the hit is stored in memory and broadcast via WebSocket
 * to /topic/monitor/{projectName} so the dashboard updates in real time.
 */
@RestController
@RequestMapping("/api/gateway")
public class GatewayController {

    private static final Logger log = LoggerFactory.getLogger(GatewayController.class);

    // Headers that must not be forwarded (hop-by-hop or restricted by HttpClient)
    private static final Set<String> SKIP_REQUEST_HEADERS = Set.of(
            "host", "connection", "transfer-encoding", "upgrade",
            "proxy-authenticate", "proxy-authorization", "te", "trailer",
            "content-length", "expect",
            // internal load-test marker — stripped before forwarding upstream
            "x-codechecker-source");

    /** Header injected by ApiTesterService to mark synthetic load-test requests. */
    private static final String LOAD_TEST_HEADER = "x-codechecker-source";
    private static final String LOAD_TEST_VALUE = "load-test";
    private static final Set<String> SKIP_RESPONSE_HEADERS = Set.of(
            "connection", "transfer-encoding", "keep-alive");

    private final GatewayConfigRepository configRepo;
    private final GatewayMonitorService monitorService;
    private final HttpClient httpClient;

    public GatewayController(GatewayConfigRepository configRepo,
            GatewayMonitorService monitorService) {
        this.configRepo = configRepo;
        this.monitorService = monitorService;
        HttpClient client;
        try {
            SSLContext sc = SSLContext.getInstance("TLS");
            sc.init(null, new TrustManager[] { new X509TrustManager() {
                public void checkClientTrusted(X509Certificate[] c, String a) {
                }

                public void checkServerTrusted(X509Certificate[] c, String a) {
                }

                public X509Certificate[] getAcceptedIssuers() {
                    return new X509Certificate[0];
                }
            } }, new java.security.SecureRandom());
            client = HttpClient.newBuilder()
                    .sslContext(sc)
                    .connectTimeout(Duration.ofSeconds(10))
                    .followRedirects(HttpClient.Redirect.NORMAL)
                    .build();
        } catch (Exception e) {
            log.warn("Could not configure custom SSL context for gateway, using default: {}", e.getMessage());
            client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .followRedirects(HttpClient.Redirect.NORMAL)
                    .build();
        }
        this.httpClient = client;
    }

    /**
     * Catch-all proxy for every HTTP method applied to every sub-path under
     * /api/gateway/{userEmail}/{projectName}/**
     */
    @RequestMapping(value = "/{userEmail}/{projectName}/**", method = { RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT,
            RequestMethod.DELETE, RequestMethod.PATCH,
            RequestMethod.HEAD, RequestMethod.OPTIONS })
    public ResponseEntity<byte[]> proxy(
            @PathVariable String userEmail,
            @PathVariable String projectName,
            HttpServletRequest request) {

        Optional<GatewayConfigEntity> cfg = configRepo.findByUser_EmailAndProjectName(userEmail, projectName);
        if (cfg.isEmpty()) {
            return ResponseEntity.status(503)
                    .body(("Gateway not configured for project '" + projectName + "' and user '" + userEmail +
                            "'. Set the target URL via the Monitor tab first.").getBytes());
        }

        String targetBase = cfg.get().getTargetBaseUrl().replaceAll("/+$", "");
        String prefix = "/api/gateway/" + userEmail + "/" + projectName;

        // Extract downstream path (strip context path + gateway prefix).
        // URL-decode rawUri first so project names with spaces (%20) don't
        // cause an off-by-one in the substring offset.
        String rawUri = URLDecoder.decode(request.getRequestURI(), StandardCharsets.UTF_8);
        String ctxPath = request.getContextPath();
        if (!ctxPath.isEmpty())
            rawUri = rawUri.substring(ctxPath.length());
        String downstreamPath = rawUri.substring(prefix.length());
        if (downstreamPath.isEmpty())
            downstreamPath = "/";

        String query = request.getQueryString();
        String fullUrl = targetBase + downstreamPath + (query != null ? "?" + query : "");

        log.debug("Gateway → {} {} → {}", request.getMethod(), downstreamPath, fullUrl);

        // Determine if this is a load test up-front so error hits can be tagged correctly
        boolean isLoadTest = LOAD_TEST_VALUE.equalsIgnoreCase(request.getHeader(LOAD_TEST_HEADER));

        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(fullUrl))
                    .timeout(Duration.ofSeconds(30));

            // Forward request headers (skip hop-by-hop and HttpClient-restricted ones)
            java.util.Enumeration<String> names = request.getHeaderNames();
            while (names.hasMoreElements()) {
                String name = names.nextElement();
                if (!SKIP_REQUEST_HEADERS.contains(name.toLowerCase())) {
                    try {
                        builder.header(name, request.getHeader(name));
                    } catch (Exception ex) {
                        log.debug("Skipping restricted header '{}': {}", name, ex.getMessage());
                    }
                }
            }

            byte[] bodyBytes = request.getInputStream().readAllBytes();
            HttpRequest.BodyPublisher bodyPublisher = bodyBytes.length > 0
                    ? HttpRequest.BodyPublishers.ofByteArray(bodyBytes)
                    : HttpRequest.BodyPublishers.noBody();

            switch (request.getMethod().toUpperCase()) {
                case "POST" -> builder.POST(bodyPublisher);
                case "PUT" -> builder.PUT(bodyPublisher);
                case "DELETE" -> builder.DELETE();
                case "PATCH" -> builder.method("PATCH", bodyPublisher);
                case "HEAD" -> builder.method("HEAD", HttpRequest.BodyPublishers.noBody());
                default -> builder.GET();
            }

            long startNs = System.nanoTime();
            HttpResponse<byte[]> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray());
            long durationMs = java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startNs);

            // Broadcast hit to dashboard
            // If the request was injected by ApiTesterService (load-test), tag it
            // so it appears as a "load-test" hit, not a real "gateway" hit.
            String timeStr = LocalDateTime.now().toString().substring(0, 23); // e.g. 2026-04-24T01:02:45.123
            GatewayHit hit = new GatewayHit(
                    request.getMethod(), downstreamPath,
                    response.statusCode(), durationMs,
                    timeStr, projectName,
                    isLoadTest ? "load-test" : null);

            // ── Rich log fields ─────────────────────────────────────────────────
            hit.setRequestUrl(fullUrl);

            // Capture selected request headers (mask Authorization value)
            Map<String, String> reqHdrs = new LinkedHashMap<>();
            java.util.Enumeration<String> hdrNames = request.getHeaderNames();
            while (hdrNames.hasMoreElements()) {
                String name = hdrNames.nextElement();
                String lower = name.toLowerCase();
                if (SKIP_REQUEST_HEADERS.contains(lower))
                    continue;
                String value = request.getHeader(name);
                if (lower.equals("authorization") && value != null && value.length() > 20) {
                    // Show type prefix only, mask the credential
                    int sp = value.indexOf(' ');
                    value = (sp > 0 ? value.substring(0, sp + 1) : "") + "***";
                }
                reqHdrs.put(name, value);
            }
            hit.setRequestHeaders(reqHdrs);

            // Capture request body (truncated to 2 KB)
            if (bodyBytes.length > 0) {
                String bodyStr = new String(bodyBytes, StandardCharsets.UTF_8);
                hit.setRequestBody(bodyStr.length() > 2048 ? bodyStr.substring(0, 2048) + "… [truncated]" : bodyStr);
            }

            // Capture selected response headers
            Map<String, String> respHdrs = new LinkedHashMap<>();
            response.headers().map().forEach((name, values) -> {
                String lower = name.toLowerCase();
                if (!SKIP_RESPONSE_HEADERS.contains(lower) && !lower.startsWith(":") && respHdrs.size() < 15) {
                    respHdrs.put(name, String.join(", ", values));
                }
            });
            hit.setResponseHeaders(respHdrs);

            // Capture response body (truncated to 2 KB); extra useful on errors
            byte[] respBytes = response.body();
            if (respBytes != null && respBytes.length > 0) {
                String respStr = new String(respBytes, StandardCharsets.UTF_8);
                hit.setResponseBody(respStr.length() > 2048 ? respStr.substring(0, 2048) + "… [truncated]" : respStr);
            }

            // Set error message for non-2xx responses
            if (response.statusCode() >= 400) {
                hit.setErrorMessage(httpStatusLabel(response.statusCode()));
            }
            // ─────────────────────────────────────────────────────────────────────

            // Only record hit if it is NOT a load test hit.
            if (!isLoadTest) {
                com.codechecker.entity.UserEntity user = cfg.get().getUser();
                monitorService.record(user, projectName, hit);
            }

            // Build response, forwarding headers from target
            HttpHeaders responseHeaders = new HttpHeaders();
            response.headers().map().forEach((name, values) -> {
                if (!SKIP_RESPONSE_HEADERS.contains(name.toLowerCase())) {
                    values.forEach(v -> responseHeaders.add(name, v));
                }
            });

            // Expose measured duration so callers (e.g. ApiTesterService) can use
            // the gateway-side latency rather than their own round-trip timer,
            // which includes servlet dispatch overhead and is ~10 ms higher.
            responseHeaders.set("X-CodeChecker-Duration-Ms", String.valueOf(durationMs));

            return ResponseEntity.status(response.statusCode())
                    .headers(responseHeaders)
                    .body(response.body());

        } catch (Exception e) {
            log.warn("Gateway proxy error for {}: {}", fullUrl, e.getMessage());
            long durationMs = 0;
            GatewayHit errHit = new GatewayHit(request.getMethod(), downstreamPath,
                    -1, durationMs,
                    LocalDateTime.now().toString().substring(0, 23), projectName,
                    isLoadTest ? "load-test" : null);
            errHit.setRequestUrl(fullUrl);
            String errMsg = e.getMessage();
            if (errMsg == null) errMsg = e.toString();
            errHit.setErrorMessage("Connection failed: " + errMsg);
            if (!isLoadTest) {
                com.codechecker.entity.UserEntity user = cfg.get().getUser();
                monitorService.record(user, projectName, errHit);
            }
            return ResponseEntity.status(502)
                    .body(("Gateway error: " + errMsg).getBytes());
        }
    }

    /** Short human-readable label for HTTP error codes. */
    private static String httpStatusLabel(int code) {
        return switch (code) {
            case 400 -> "400 Bad Request — malformed request body or invalid parameters";
            case 401 -> "401 Unauthorized — missing or invalid auth token";
            case 403 -> "403 Forbidden — insufficient permissions";
            case 404 -> "404 Not Found — endpoint or resource does not exist";
            case 405 -> "405 Method Not Allowed — HTTP method not supported on this path";
            case 408 -> "408 Request Timeout — server took too long to respond";
            case 409 -> "409 Conflict — resource state conflict (e.g. duplicate entry)";
            case 413 -> "413 Payload Too Large — request body exceeds server limit";
            case 422 -> "422 Unprocessable Entity — validation failed on request body";
            case 429 -> "429 Too Many Requests — rate limit hit";
            case 500 -> "500 Internal Server Error — unhandled exception in the server";
            case 502 -> "502 Bad Gateway — upstream server returned invalid response";
            case 503 -> "503 Service Unavailable — server overloaded or down";
            case 504 -> "504 Gateway Timeout — upstream server did not respond in time";
            default -> code >= 500 ? code + " Server Error" : code + " Client Error";
        };
    }
}
