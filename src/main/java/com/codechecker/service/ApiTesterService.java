package com.codechecker.service;

import com.codechecker.entity.ApiTestRunEntity;
import com.codechecker.model.ApiTestRequest;
import com.codechecker.model.GatewayHit;
import com.codechecker.repository.ApiTestRunRepository;
import com.codechecker.service.GatewayMonitorService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Async;

@Service
public class ApiTesterService {

    private static final Logger log = LoggerFactory.getLogger(ApiTesterService.class);
    private final ApiTestRunRepository repository;
    private final GatewayMonitorService monitorService;
    private final HttpClient httpClient;
    private final ExecutorService executorService;

    /**
     * Thread-local that holds the gateway-measured duration (ms) returned via the
     * X-CodeChecker-Duration-Ms response header. When set, the live-test loop uses
     * this value instead of the raw wall-clock timer so load-test metrics align
     * with what the gateway/APM panels show.
     */
    private static final ThreadLocal<Long> GATEWAY_LATENCY_TL = new ThreadLocal<>();

    /**
     * Tracks cancellation per live run: runId -> true=running, false=stop
     * requested.
     */
    private final ConcurrentHashMap<String, Boolean> liveCancels = new ConcurrentHashMap<>();

    @Autowired(required = false)
    private SimpMessagingTemplate messagingTemplate;

    public ApiTesterService(ApiTestRunRepository repository, GatewayMonitorService monitorService) {
        this.repository = repository;
        this.monitorService = monitorService;
        this.executorService = Executors.newFixedThreadPool(10);
        // Build an HttpClient that trusts all certificates so HTTPS APIs with
        // self-signed / internal-CA certs don't throw SSLHandshakeException.
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
                    .executor(executorService)
                    .sslContext(sc)
                    .connectTimeout(Duration.ofSeconds(10))
                    .build();
        } catch (Exception e) {
            log.warn("Could not configure custom SSL context, using default: {}", e.getMessage());
            client = HttpClient.newBuilder()
                    .executor(executorService)
                    .connectTimeout(Duration.ofSeconds(10))
                    .build();
        }
        this.httpClient = client;
    }

    public ApiTestRunEntity runTest(ApiTestRequest request, com.codechecker.entity.UserEntity user) {
        ApiTestRunEntity run = new ApiTestRunEntity();
        run.setUser(user);
        run.setProjectName(request.getProjectName());
        run.setHttpMethod(request.getHttpMethod());
        run.setEndpointPath(request.getEndpointPath());
        run.setEnvironmentUrl(request.getEnvironmentUrl());
        // NOTE: authToken is intentionally NOT persisted — tokens are secrets
        //       and must never be stored in the database.
        run.setRequestPayload(request.getRequestPayload());
        run.setTotalHits(request.getTotalHits());
        run.setStartedAt(LocalDateTime.now());

        // Build URL with path params and query params
        String urlString = buildUrl(request);

        log.info("Starting load test: {} x {} hits", urlString, request.getTotalHits());

        // Batch hits in small groups to avoid Tomcat thread deadlock
        // when load-testing against the same server (e.g. localhost).
        // Only 3 concurrent connections at a time prevents thread starvation.
        int batchSize = 3;
        int hitNumber = 0;
        List<Long> latencies = new ArrayList<>();

        for (int batchStart = 0; batchStart < request.getTotalHits(); batchStart += batchSize) {
            if (isCancelled(request.getLiveRunId()))
                break;
            int batchEnd = Math.min(batchStart + batchSize, request.getTotalHits());
            List<CompletableFuture<Long>> batch = new ArrayList<>();

            for (int i = batchStart; i < batchEnd; i++) {
                batch.add(executeHit(urlString, request));
            }

            // Wait for this batch to complete before starting next
            for (CompletableFuture<Long> f : batch) {
                Long lat = f.join();
                latencies.add(lat);
                hitNumber++;
            }
            log.debug("Batch complete: {}/{} hits done", Math.min(batchEnd, request.getTotalHits()),
                    request.getTotalHits());
        }

        List<Integer> successfulLatencies = new ArrayList<>();
        int success = 0;
        int failed = 0;

        for (Long lat : latencies) {
            if (lat >= 0) {
                success++;
                successfulLatencies.add(lat.intValue());
            } else {
                failed++;
            }
        }

        run.setSuccessfulHits(success);
        run.setFailedHits(failed);
        run.setHitLatencies(successfulLatencies);

        if (!successfulLatencies.isEmpty()) {
            double avg = successfulLatencies.stream().mapToInt(Integer::intValue).average().orElse(0.0);
            run.setAverageLatencyMs((int) avg);

            List<Integer> sorted = new ArrayList<>(successfulLatencies);
            Collections.sort(sorted);
            int p90Index = (int) Math.ceil(90.0 / 100.0 * sorted.size()) - 1;
            if (p90Index < 0)
                p90Index = 0;
            if (p90Index >= sorted.size())
                p90Index = sorted.size() - 1;
            run.setP90LatencyMs(sorted.get(p90Index));
        } else {
            run.setAverageLatencyMs(0);
            run.setP90LatencyMs(0);
        }

        return repository.save(run);
    }

    private CompletableFuture<Long> executeHit(String url, ApiTestRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            long startNs = System.nanoTime();
            try {
                HttpRequest.Builder builder = HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .timeout(Duration.ofSeconds(30));

                applyAuth(builder, request);

                if (request.getCustomHeaders() != null) {
                    for (Map.Entry<String, String> h : request.getCustomHeaders().entrySet()) {
                        if (h.getKey() != null && !h.getKey().isBlank()) {
                            try {
                                builder.header(h.getKey().trim(),
                                        h.getValue() != null ? h.getValue() : "");
                            } catch (Exception ex) {
                                log.warn("Skipping invalid header '{}': {}", h.getKey(), ex.getMessage());
                            }
                        }
                    }
                }

                String method = request.getHttpMethod();
                String m = method != null ? method.toUpperCase() : "GET";

                // SOAP → always POST with text/xml and SOAPAction header
                if (m.equals("SOAP")) {
                    m = "POST";
                    String ct = request.getContentType() != null && !request.getContentType().isBlank()
                            ? request.getContentType()
                            : "text/xml";
                    try {
                        builder.header("Content-Type", ct);
                    } catch (Exception ignored) {
                    }
                    // Extract operation name from path for SOAPAction header
                    String soapAction = "";
                    String ep = request.getEndpointPath();
                    if (ep != null && ep.contains("/")) {
                        soapAction = ep.substring(ep.lastIndexOf('/') + 1);
                    }
                    try {
                        builder.header("SOAPAction", "\"" + soapAction + "\"");
                    } catch (Exception ignored) {
                    }
                }

                boolean hasBody = m.equals("POST") || m.equals("PUT") || m.equals("PATCH");

                if (hasBody) {
                    // Only set Content-Type if not already set (e.g. by SOAP block above)
                    String ct = request.getContentType() != null && !request.getContentType().isBlank()
                            ? request.getContentType()
                            : "application/json";
                    try {
                        builder.header("Content-Type", ct);
                    } catch (Exception ignored) {
                    }
                }

                String payload = request.getRequestPayload();
                HttpRequest.BodyPublisher bodyOpt = hasBody && payload != null && !payload.isBlank()
                        ? HttpRequest.BodyPublishers.ofString(payload)
                        : HttpRequest.BodyPublishers.noBody();

                switch (m) {
                    case "POST" -> builder.POST(bodyOpt);
                    case "PUT" -> builder.PUT(bodyOpt);
                    case "DELETE" -> builder.DELETE();
                    case "PATCH" -> builder.method("PATCH", bodyOpt);
                    default -> builder.GET();
                }

                HttpResponse<Void> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.discarding());
                long wallMs = java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startNs);
                long latency = response.headers().firstValueAsLong("x-codechecker-duration-ms")
                        .orElse(wallMs);
                int status = response.statusCode();
                if (status < 400) {
                    log.debug("Hit OK: {} {} {}ms", status, url, latency);
                    return latency;
                } else {
                    log.warn("Hit failed: {} {} {}ms", status, url, latency);
                    return -1L;
                }

            } catch (Exception e) {
                log.warn("Hit exception for {}: {}", url, e.getMessage());
                return -1L;
            }
        }, executorService);
    }

    // ── Live-test helpers ────────────────────────────────────────────────

    /**
     * JMeter-style thread group load test.
     *
     * <ul>
     * <li><b>Threads</b> = {@code maxConcurrentUsers} – number of virtual
     * users.</li>
     * <li><b>Total Requests</b> = {@code totalHits} – requests shared evenly across
     * threads.
     * {@code requestsPerThread = ceil(totalHits / threads)}</li>
     * <li><b>Ramp-up interval</b> = {@code rampUpIntervalSeconds} – delay (seconds)
     * between
     * starting each successive thread. Thread 0 starts immediately, thread 1 after
     * 1×interval, thread 2 after 2×interval, etc. 0 = all start together.</li>
     * </ul>
     *
     * Each thread fires exactly {@code requestsPerThread} requests sequentially (no
     * tight loop),
     * so total requests = threads × requestsPerThread ≈ totalHits.
     * Progress snapshots are pushed via WebSocket every 1 second.
     */
    @Async("scanExecutor")
    public CompletableFuture<Void> runLiveTest(ApiTestRequest request, com.codechecker.entity.UserEntity user) {
        String runId = request.getLiveRunId();
        liveCancels.put(runId, true);

        String url = buildUrl(request);

        int threads = Math.max(1, Math.min(
                request.getMaxConcurrentUsers() > 0 ? request.getMaxConcurrentUsers() : 1, 500));
        int totalRequests = Math.max(1, request.getTotalHits());
        int requestsPerThread = (int) Math.ceil((double) totalRequests / threads);
        long rampUpMs = Math.round(request.getRampUpIntervalSeconds() * 1000.0); // ms between thread starts
        long thinkTimeMs = Math.round(request.getThinkTimeSeconds() * 1000.0); // ms between requests within a thread

        long startTime = System.currentTimeMillis();

        // Shared counters
        AtomicLong total = new AtomicLong();
        AtomicLong success = new AtomicLong();
        AtomicLong failed = new AtomicLong();
        AtomicLong successSum = new AtomicLong();
        AtomicLong failedSum = new AtomicLong();
        AtomicLong minMs = new AtomicLong(Long.MAX_VALUE);
        AtomicLong maxMs = new AtomicLong(0);
        ConcurrentLinkedDeque<Long> latencies = new ConcurrentLinkedDeque<>();
        ConcurrentHashMap<Integer, AtomicLong> statusDist = new ConcurrentHashMap<>();

        log.info("Live test {} — {} threads, {} req/thread, ramp-up {}ms", runId, threads, requestsPerThread, rampUpMs);
        log.info("  → URL: {}", url);
        log.info("  → Method: {}", request.getHttpMethod());
        if (request.getCustomHeaders() != null && !request.getCustomHeaders().isEmpty())
            log.info("  → Headers: {}", request.getCustomHeaders());
        if (request.getAuthType() != null && !"none".equalsIgnoreCase(request.getAuthType()))
            log.info("  → Auth: {} (token length={})", request.getAuthType(),
                    request.getAuthToken() != null ? request.getAuthToken().length() : 0);

        // Push progress snapshot every 1 second
        ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
        scheduler.scheduleAtFixedRate(() -> {
            if (!isCancelled(runId))
                publishProgress(user, runId, total, success, failed, successSum, failedSum,
                        minMs, maxMs, statusDist, startTime, false, null, threads, requestsPerThread);
        }, 1, 1, TimeUnit.SECONDS);

        // Spawn threads with ramp-up delay
        ExecutorService testPool = Executors.newFixedThreadPool(threads);
        for (int i = 0; i < threads; i++) {
            final int threadIndex = i;
            testPool.submit(() -> {
                // Ramp-up: sleep before this thread starts firing
                if (rampUpMs > 0 && threadIndex > 0) {
                    try {
                        Thread.sleep(threadIndex * rampUpMs);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                }

                // Each thread fires exactly requestsPerThread requests
                for (int r = 0; r < requestsPerThread && !isCancelled(runId); r++) {
                    GATEWAY_LATENCY_TL.remove();
                    long hitStartNs = System.nanoTime();
                    int code = executeHitWithStatus(url, request.getHttpMethod(), request);
                    long wallMs = java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - hitStartNs);
                    // Prefer the gateway-measured latency (returned in X-CodeChecker-Duration-Ms)
                    // so load-test stats match the APM/monitor panels (no proxy overhead).
                    Long gwMs = GATEWAY_LATENCY_TL.get();
                    long lat = (gwMs != null) ? gwMs : wallMs;

                    total.incrementAndGet();
                    statusDist.computeIfAbsent(code, k -> new AtomicLong()).incrementAndGet();

                    if (code >= 200 && code < 400) {
                        minMs.accumulateAndGet(lat, Math::min);
                        maxMs.accumulateAndGet(lat, Math::max);
                        if (latencies.size() < 100_000)
                            latencies.add(lat);
                        success.incrementAndGet();
                        successSum.addAndGet(lat);
                    } else {
                        failed.incrementAndGet();
                        failedSum.addAndGet(lat);
                    }
                    // NOTE: the gateway proxy (GatewayController) records the hit when
                    // it detects the X-CodeChecker-Source: load-test header, so we do
                    // NOT record here to avoid double-counting.

                    // Think time: pause between requests within the thread
                    if (thinkTimeMs > 0 && r < requestsPerThread - 1 && !isCancelled(runId)) {
                        try {
                            Thread.sleep(thinkTimeMs);
                        } catch (InterruptedException ex) {
                            Thread.currentThread().interrupt();
                            break;
                        }
                    }
                }
            });
        }

        testPool.shutdown();
        long maxWaitMs = (threads * rampUpMs) + (long) requestsPerThread * 60_000L + 30_000L;
        try {
            testPool.awaitTermination(maxWaitMs, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        scheduler.shutdownNow();

        // Compute percentiles
        List<Long> sorted = new ArrayList<>(latencies);
        Collections.sort(sorted);
        Map<String, Long> pct = new LinkedHashMap<>();
        if (!sorted.isEmpty()) {
            pct.put("p50", sorted.get(pctIndex(sorted.size(), 50)));
            pct.put("p90", sorted.get(pctIndex(sorted.size(), 90)));
            pct.put("p95", sorted.get(pctIndex(sorted.size(), 95)));
            pct.put("p99", sorted.get(pctIndex(sorted.size(), 99)));
        }

        publishProgress(user, runId, total, success, failed, successSum, failedSum,
                minMs, maxMs, statusDist, startTime, true, pct, threads, requestsPerThread);

        // Persist result
        try {
            ApiTestRunEntity run = new ApiTestRunEntity();
            run.setUser(user);
            run.setProjectName(request.getProjectName());
            run.setHttpMethod(request.getHttpMethod());
            run.setEndpointPath(request.getEndpointPath());
            run.setEnvironmentUrl(request.getEnvironmentUrl());
            run.setAuthToken(request.getAuthToken());
            run.setRequestPayload(request.getRequestPayload());
            run.setTotalHits((int) total.get());
            run.setSuccessfulHits((int) success.get());
            run.setFailedHits((int) failed.get());
            run.setStartedAt(LocalDateTime.ofEpochSecond(startTime / 1000, 0, ZoneOffset.UTC));
            long s = success.get();
            run.setAverageLatencyMs(s > 0 ? (int) (successSum.get() / s) : 0);
            if (pct.containsKey("p90"))
                run.setP90LatencyMs(pct.get("p90").intValue());
            List<Integer> latInts = new ArrayList<>();
            sorted.forEach(l -> latInts.add(l.intValue()));
            run.setHitLatencies(latInts);
            repository.save(run);
        } catch (Exception e) {
            log.warn("Failed to persist live test result: {}", e.getMessage());
        }

        liveCancels.remove(runId);
        return CompletableFuture.completedFuture(null);
    }

    private void publishProgress(com.codechecker.entity.UserEntity user, String runId,
            AtomicLong total, AtomicLong success, AtomicLong failed,
            AtomicLong successSum, AtomicLong failedSum,
            AtomicLong minMs, AtomicLong maxMs,
            ConcurrentHashMap<Integer, AtomicLong> statusDist,
            long startTime, boolean complete, Map<String, Long> percentiles,
            int threads, int requestsPerThread) {
        if (messagingTemplate == null)
            return;
        long t = total.get(), s = success.get(), f = failed.get();
        long elapsed = Math.max(1, System.currentTimeMillis() - startTime);
        double throughput = s * 1000.0 / elapsed;
        long avgAll = t > 0 ? (successSum.get() + failedSum.get()) / t : 0;
        long avgSucc = s > 0 ? successSum.get() / s : 0;
        long avgFail = f > 0 ? failedSum.get() / f : 0;
        long min = minMs.get() == Long.MAX_VALUE ? 0 : minMs.get();

        Map<String, Object> msg = new LinkedHashMap<>();
        msg.put("type", complete ? "COMPLETE" : "PROGRESS");
        msg.put("totalRequests", t);
        msg.put("plannedTotalRequests", (long) threads * requestsPerThread);
        msg.put("successfulRequests", s);
        msg.put("failedRequests", f);
        msg.put("averageResponseTimeMs", avgAll);
        msg.put("successAvgMs", avgSucc);
        msg.put("failedAvgMs", avgFail);
        msg.put("minResponseTimeMs", min);
        msg.put("maxResponseTimeMs", maxMs.get());
        msg.put("throughput", Math.round(throughput * 100.0) / 100.0);
        msg.put("elapsedSeconds", elapsed / 1000);
        msg.put("threads", threads);
        msg.put("requestsPerThread", requestsPerThread);
        Map<String, Long> dist = new LinkedHashMap<>();
        statusDist.forEach((code, cnt) -> dist.put(String.valueOf(code), cnt.get()));
        msg.put("statusCodeDistribution", dist);
        if (percentiles != null)
            msg.put("percentiles", percentiles);
        try {
            messagingTemplate.convertAndSend("/topic/live-test/" + user.getEmail() + "/" + runId, msg);
        } catch (Exception e) {
            log.warn("Progress publish failed for {}: {}", runId, e.getMessage());
        }
    }

    private int executeHitWithStatus(String url, String method, ApiTestRequest request) {
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(30))
                    // Mark this as a load-test request so the gateway records
                    // it with source="load-test" instead of "gateway"
                    .header("X-CodeChecker-Source", "load-test");

            // Auth
            applyAuth(builder, request);

            // Custom headers
            if (request.getCustomHeaders() != null) {
                for (Map.Entry<String, String> h : request.getCustomHeaders().entrySet()) {
                    if (h.getKey() != null && !h.getKey().isBlank()) {
                        try {
                            builder.header(h.getKey().trim(),
                                    h.getValue() != null ? h.getValue() : "");
                        } catch (Exception ex) {
                            log.warn("Skipping invalid header '{}': {}", h.getKey(), ex.getMessage());
                        }
                    }
                }
            }

            String m = method != null ? method.toUpperCase() : "GET";

            // SOAP → always POST with text/xml and SOAPAction header
            if (m.equals("SOAP")) {
                m = "POST";
                String ct = request.getContentType() != null && !request.getContentType().isBlank()
                        ? request.getContentType()
                        : "text/xml";
                try {
                    builder.header("Content-Type", ct);
                } catch (Exception ignored) {
                }
                String soapAction = "";
                String ep = request.getEndpointPath();
                if (ep != null && ep.contains("/")) {
                    soapAction = ep.substring(ep.lastIndexOf('/') + 1);
                }
                try {
                    builder.header("SOAPAction", "\"" + soapAction + "\"");
                } catch (Exception ignored) {
                }
            }

            boolean hasBody = m.equals("POST") || m.equals("PUT") || m.equals("PATCH");

            if (hasBody) {
                String ct = request.getContentType() != null && !request.getContentType().isBlank()
                        ? request.getContentType()
                        : "application/json";
                try {
                    builder.header("Content-Type", ct);
                } catch (Exception ignored) {
                }
            }

            String payload = request.getRequestPayload();
            HttpRequest.BodyPublisher body = hasBody && payload != null && !payload.isBlank()
                    ? HttpRequest.BodyPublishers.ofString(payload)
                    : HttpRequest.BodyPublishers.noBody();
            switch (m) {
                case "POST" -> builder.POST(body);
                case "PUT" -> builder.PUT(body);
                case "DELETE" -> builder.DELETE();
                case "PATCH" -> builder.method("PATCH", body);
                default -> builder.GET();
            }
            HttpResponse<Void> httpResp = httpClient.send(builder.build(), HttpResponse.BodyHandlers.discarding());
            int status = httpResp.statusCode();
            log.debug("Hit {} {} → {} ", m, url, status);
            // Replace wall-clock latency with the gateway-measured duration when available,
            // so load-test metrics match what the gateway/APM panels show.
            httpResp.headers().firstValueAsLong("x-codechecker-duration-ms")
                    .ifPresent(gatewayMs -> {
                        // store in thread-local so the caller loop can pick it up
                        GATEWAY_LATENCY_TL.set(gatewayMs);
                    });
            return status;
        } catch (Exception e) {
            log.warn("Hit exception for {} {}: {}", method, url, e.getMessage());
            return -1;
        }
    }

    private void applyAuth(HttpRequest.Builder builder, ApiTestRequest request) {
        String token = request.getAuthToken();
        String type = request.getAuthType();
        if (token == null || token.isBlank())
            return;
        if (type == null)
            type = "bearer";
        switch (type.toLowerCase()) {
            case "bearer" -> builder.header("Authorization",
                    token.startsWith("Bearer ") ? token : "Bearer " + token);
            case "basic" -> builder.header("Authorization",
                    token.startsWith("Basic ") ? token : "Basic " + token);
            case "apikey" -> {
                String hdr = request.getApiKeyHeader() != null && !request.getApiKeyHeader().isBlank()
                        ? request.getApiKeyHeader()
                        : "X-Api-Key";
                builder.header(hdr, token);
            }
            // "none" or anything else: no auth header
        }
    }

    private String buildUrl(ApiTestRequest request) {
        String path = request.getEndpointPath();

        // 1. Substitute named path parameters, e.g. {id} -> 42 (URL-encode values)
        if (request.getPathParams() != null) {
            for (Map.Entry<String, String> e : request.getPathParams().entrySet()) {
                String key = e.getKey().startsWith("{") ? e.getKey() : "{" + e.getKey() + "}";
                String encoded = java.net.URLEncoder
                        .encode(e.getValue(), java.nio.charset.StandardCharsets.UTF_8)
                        .replace("+", "%20");
                path = path.replace(key, encoded);
            }
        }
        // 2. Replace any remaining {param} tokens with "1"
        path = path.replaceAll("\\{[^/]+\\}", "1").replace("*", "");

        String base = request.getEnvironmentUrl().stripTrailing();
        // Strip any accidentally-included query string from the base URL
        int qIdx = base.indexOf('?');
        if (qIdx >= 0)
            base = base.substring(0, qIdx);
        // Remove trailing slash from base
        if (base.endsWith("/"))
            base = base.substring(0, base.length() - 1);

        String url = base + path;

        // Encode any raw spaces left in the URL (e.g. from manually typed baseUrl)
        url = url.replace(" ", "%20");

        // 3. Append query parameters (use %20 not + for spaces)
        if (request.getQueryParams() != null && !request.getQueryParams().isEmpty()) {
            StringBuilder qs = new StringBuilder();
            for (Map.Entry<String, String> e : request.getQueryParams().entrySet()) {
                if (qs.length() > 0)
                    qs.append('&');
                qs.append(java.net.URLEncoder.encode(e.getKey(), java.nio.charset.StandardCharsets.UTF_8).replace("+",
                        "%20"))
                        .append('=')
                        .append(java.net.URLEncoder.encode(e.getValue(), java.nio.charset.StandardCharsets.UTF_8)
                                .replace("+", "%20"));
            }
            url = url + (url.contains("?") ? "&" : "?") + qs;
        }
        return url;
    }

    private int pctIndex(int size, int pct) {
        int idx = (int) Math.ceil(pct / 100.0 * size) - 1;
        return Math.max(0, Math.min(idx, size - 1));
    }

    private boolean isCancelled(String liveRunId) {
        if (liveRunId == null)
            return false;
        return Boolean.FALSE.equals(liveCancels.get(liveRunId));
    }

    /** Cancel a running live test. */
    public void cancelLiveTest(String runId, com.codechecker.entity.UserEntity user) {
        liveCancels.put(runId, false);
    }
}
