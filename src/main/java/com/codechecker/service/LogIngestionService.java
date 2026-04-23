package com.codechecker.service;

import com.codechecker.entity.ApiLogEntryEntity;
import com.codechecker.repository.ApiLogEntryRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class LogIngestionService {

    private final ApiLogEntryRepository repository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** Matches "Request received: GET /path/to/endpoint - description" */
    private static final Pattern REQUEST_RECEIVED = Pattern
            .compile("Request received:\\s+(GET|POST|PUT|DELETE|PATCH)\\s+(/[^\\s\\-]*)");

    /** Replaces pure-numeric or UUID path segments with {id} */
    private static final Pattern PATH_ID_SEGMENT = Pattern
            .compile("/(\\d+|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?=/|$)");

    /** Matches inline duration hints: "in 45ms", "took 45ms", "duration=45ms" */
    private static final Pattern DURATION_IN_MSG = Pattern
            .compile("(?:in|took|duration\\s*[=:])\\s*(\\d+)\\s*ms", Pattern.CASE_INSENSITIVE);

    /** Matches common request-id labels in plain-text log lines */
    private static final Pattern REQUEST_ID_IN_MSG = Pattern
            .compile("(?:REQUEST_ID|requestId|x-request-id|traceId)[=:\\s]+([A-Za-z0-9%\\-]+)",
                    Pattern.CASE_INSENSITIVE);

    /** CloudWatch message timestamp: "2026-03-24 14:20:05.733" */
    private static final DateTimeFormatter CW_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS");

    // ── Result DTO
    // ────────────────────────────────────────────────────────────────

    public static class ParseResult {
        public final int count;
        public final List<String> issues;
        public final int slowCount;
        public final String batchId;

        public ParseResult(int count, List<String> issues, int slowCount, String batchId) {
            this.count = count;
            this.issues = issues;
            this.slowCount = slowCount;
            this.batchId = batchId;
        }
    }

    public LogIngestionService(ApiLogEntryRepository repository) {
        this.repository = repository;
    }

    // ── Entry point: auto-detect format
    // ───────────────────────────────────────────

    public ParseResult parseAndSaveLogs(String projectName, String logData) {
        String trimmed = logData.trim();
        String batchId = java.util.UUID.randomUUID().toString();
        // Normalize CloudWatch Logs Insights export header: "@timestamp,@message" (or
        // with spaces)
        // → the canonical form expected by our CSV parser.
        String normalized = trimmed.replaceFirst(
                "^@timestamp,\\s*@message",
                "timestamp,message");
        if (normalized.startsWith("timestamp,message")) {
            return parseCsvCloudWatchLogs(projectName, normalized, batchId);
        }
        return parsePlainText(projectName, normalized, batchId);
    }

    // ── Format 1: plain text "ISO_TS METHOD PATH STATUS_CODE DURATIONms" ─────────

    private ParseResult parsePlainText(String projectName, String logData, String batchId) {
        List<ApiLogEntryEntity> entities = new ArrayList<>();
        for (String line : logData.split("\\r?\\n")) {
            if (line.trim().isEmpty())
                continue;
            try {
                String[] parts = line.split("\\s+");
                if (parts.length < 5)
                    continue;
                ApiLogEntryEntity e = new ApiLogEntryEntity();
                e.setProjectName(projectName);
                e.setTimestamp(Instant.parse(parts[0]).atZone(ZoneOffset.UTC).toLocalDateTime());
                e.setHttpMethod(parts[1]);
                e.setEndpointPath(parts[2]);
                e.setStatusCode(Integer.parseInt(parts[3]));
                e.setDurationMs(Integer.parseInt(parts[4].replace("ms", "")));
                e.setImportBatchId(batchId);
                entities.add(e);
            } catch (Exception ex) {
                System.err.println("Skipping plain-text log line: " + line);
            }
        }
        repository.saveAll(entities);
        return new ParseResult(entities.size(), Collections.emptyList(), 0, batchId);
    }

    // ── Format 2: AWS CloudWatch Logs Insights CSV export
    // ─────────────────────────
    //
    // CSV header: timestamp,message
    // Each row: <epoch_ms>,"{...json...}"
    //
    // The JSON contains:
    // timestamp – "2026-03-24 14:20:05.733"
    // level – INFO / WARN / ERROR
    // mdc – { REQUEST_ID: "..." }
    // message – application log text
    //
    // Strategy:
    // 1. Group all log entries by REQUEST_ID
    // 2. For each group, extract method+path from "Request received: METHOD PATH"
    // message
    // 3. Duration = (last epoch ms) - (first epoch ms) in the group
    // 4. Status = 200 unless any entry is ERROR level
    // 5. Flag slow requests (>1000 ms) and ERROR entries as issues

    private ParseResult parseCsvCloudWatchLogs(String projectName, String csv, String batchId) {
        String[] lines = csv.split("\\r?\\n");

        // requestId -> list of [epochMs, level, message, timestampStr]
        Map<String, List<Object[]>> groups = new LinkedHashMap<>();

        for (int i = 1; i < lines.length; i++) { // skip header row
            String line = lines[i];
            if (line.trim().isEmpty())
                continue;
            try {
                // Split on first comma only (epoch has no commas)
                int comma = line.indexOf(',');
                if (comma < 0)
                    continue;

                // Parse timestamp: supports both epoch-ms (long) and ISO strings like
                // "2024-03-24 14:20:05.733" as exported by CloudWatch Logs Insights.
                String tsRaw = line.substring(0, comma).trim();
                if (tsRaw.startsWith("\"") && tsRaw.endsWith("\"")) {
                    tsRaw = tsRaw.substring(1, tsRaw.length() - 1);
                }
                long epochMs;
                try {
                    epochMs = Long.parseLong(tsRaw);
                } catch (NumberFormatException nfe) {
                    try {
                        epochMs = LocalDateTime.parse(tsRaw, CW_FMT)
                                .toInstant(ZoneOffset.UTC).toEpochMilli();
                    } catch (Exception ex) {
                        continue; // unparseable timestamp — skip this row
                    }
                }
                String msgCsv = line.substring(comma + 1).trim();

                // Strip outer CSV double-quotes and unescape "" -> "
                if (msgCsv.startsWith("\"") && msgCsv.endsWith("\"")) {
                    msgCsv = msgCsv.substring(1, msgCsv.length() - 1).replace("\"\"", "\"");
                }

                JsonNode node;
                String requestId, level, msg, ts, loggerClass;
                try {
                    node = objectMapper.readTree(msgCsv);
                    // Extract REQUEST_ID from MDC (structured JSON logging)
                    JsonNode mdc = node.path("mdc");
                    if (!mdc.has("REQUEST_ID"))
                        continue;
                    requestId = mdc.get("REQUEST_ID").asText();
                    if (requestId.isBlank())
                        continue;
                    level = node.path("level").asText("INFO");
                    msg = node.path("message").asText("");
                    ts = node.path("timestamp").asText("");
                    loggerClass = node.path("logger").asText("");
                } catch (Exception jsonEx) {
                    // Plain-text message: try to find a request-id in the text;
                    // fall back to a per-line synthetic key so each line becomes its own entry.
                    Matcher ridM = REQUEST_ID_IN_MSG.matcher(msgCsv);
                    requestId = ridM.find() ? ridM.group(1) : ("__line_" + i);
                    level = (msgCsv.toLowerCase().contains("error") ||
                            msgCsv.toLowerCase().contains("exception")) ? "ERROR" : "INFO";
                    msg = msgCsv;
                    ts = null;
                    loggerClass = "";
                }

                groups.computeIfAbsent(requestId, k -> new ArrayList<>())
                        .add(new Object[] { epochMs, level, msg, ts, loggerClass });

            } catch (Exception e) {
                // skip unparseable lines silently
            }
        }

        List<ApiLogEntryEntity> entities = new ArrayList<>();
        List<String> issues = new ArrayList<>();
        int slowCount = 0;

        for (Map.Entry<String, List<Object[]>> entry : groups.entrySet()) {
            List<Object[]> rows = entry.getValue();
            if (rows.isEmpty())
                continue;

            long firstEpoch = Long.MAX_VALUE;
            long lastEpoch = Long.MIN_VALUE;
            String method = null, path = null, firstTs = null;
            boolean hasError = false;
            List<String> errorMessages = new ArrayList<>();

            for (Object[] row : rows) {
                long ep = (Long) row[0];
                String lvl = (String) row[1];
                String msg = (String) row[2];
                String ts = (String) row[3];

                if (ep < firstEpoch) {
                    firstEpoch = ep;
                    firstTs = ts;
                }
                if (ep > lastEpoch) {
                    lastEpoch = ep;
                }

                if ("ERROR".equalsIgnoreCase(lvl)) {
                    hasError = true;
                    errorMessages.add(msg);
                }

                // Capture method + path from first "Request received:" entry
                if (method == null) {
                    Matcher m = REQUEST_RECEIVED.matcher(msg);
                    if (m.find()) {
                        method = m.group(1);
                        path = normalizePath(m.group(2));
                    }
                }

                // Flag "not found" entries as issues (configuration/data issues)
                if (msg.toLowerCase().contains("not found")) {
                    String rid = entry.getKey();
                    String ridShort = rid.length() > 8 ? rid.substring(0, 8) + "…" : rid;
                    issues.add("⚠ Not found: \"" + msg + "\" [" + ridShort + "]");
                }
            }

            // Fallback: infer method/path from logger class name (Resource > Service > skip)
            if (method == null || path == null) {
                String infMethod = null, infPath = null;
                boolean foundEndpoint = false;
                for (Object[] row : rows) {
                    String[] inf = inferFromLogger((String) row[4], (String) row[2]);
                    if (inf == null) continue;
                    if ("endpoint".equals(inf[2]) && !foundEndpoint) {
                        infMethod = inf[0]; infPath = inf[1]; foundEndpoint = true; break;
                    }
                    if (infMethod == null) { infMethod = inf[0]; infPath = inf[1]; }
                }
                if (infMethod != null) { method = infMethod; path = normalizePath(infPath); }
            }
            // Still skip if no endpoint could be identified from any log class
            if (method == null || path == null)
                continue;

            int durationMs = (int) Math.max(0, lastEpoch - firstEpoch);

            // For single-line plain-text entries the epoch spread is 0 ms.
            // Try to extract a duration directly from the message text (e.g. "in 45ms").
            if (durationMs == 0 && rows.size() == 1) {
                Matcher dm = DURATION_IN_MSG.matcher((String) rows.get(0)[2]);
                if (dm.find()) {
                    durationMs = Integer.parseInt(dm.group(1));
                }
            }
            String rid = entry.getKey();
            String ridShort = rid.length() > 8 ? rid.substring(0, 8) + "…" : rid;

            if (durationMs > 1000) {
                slowCount++;
                issues.add("🐢 Slow: " + method + " " + path + " took " + durationMs + "ms [" + ridShort + "]");
            }
            for (String em : errorMessages) {
                issues.add("❌ Error in " + method + " " + path + ": " + em + " [" + ridShort + "]");
            }

            // Build call-chain trace string: "HH:mm:ss|LEVEL|ShortClass|message" per line
            StringBuilder traceBuilder = new StringBuilder();
            for (Object[] row : rows) {
                String rowTs  = (String) row[3];
                String rowLvl = (String) row[1];
                String rowCls = (String) row[4];
                String rowMsg = (String) row[2];
                String shortTime = rowTs != null && rowTs.length() >= 19 ? rowTs.substring(11, 19) : "?";
                String shortCls  = (rowCls == null || rowCls.isEmpty()) ? "?"
                        : rowCls.substring(rowCls.lastIndexOf('.') + 1);
                if (traceBuilder.length() > 0) traceBuilder.append("\n");
                traceBuilder.append(shortTime).append("|")
                        .append(rowLvl).append("|")
                        .append(shortCls).append("|")
                        .append(rowMsg.replace("\n", " ").replace("|", "¦"));
            }

            ApiLogEntryEntity e = new ApiLogEntryEntity();
            e.setProjectName(projectName);
            e.setHttpMethod(method);
            e.setEndpointPath(path);
            e.setStatusCode(hasError ? 500 : 200);
            e.setDurationMs(durationMs);
            e.setTraceLog(traceBuilder.length() > 0 ? traceBuilder.toString() : null);
            e.setImportBatchId(batchId);
            try {
                e.setTimestamp(firstTs != null && !firstTs.isEmpty()
                        ? LocalDateTime.parse(firstTs, CW_FMT)
                        : LocalDateTime.ofInstant(Instant.ofEpochMilli(firstEpoch), ZoneOffset.UTC));
            } catch (Exception ex) {
                e.setTimestamp(LocalDateTime.ofInstant(Instant.ofEpochMilli(firstEpoch), ZoneOffset.UTC));
            }
            entities.add(e);
        }

        repository.saveAll(entities);
        return new ParseResult(entities.size(), issues, slowCount, batchId);
    }

    /**
     * Infer HTTP method and endpoint path from a Java logger class FQCN and its message.
     * Returns String[]{method, path, "endpoint"|"service"} or null when the class has no
     * routing meaning (e.g. JpaRepository / plain Repository classes).
     */
    private String[] inferFromLogger(String fqcn, String message) {
        if (fqcn == null || fqcn.isBlank()) return null;
        String simple = fqcn.substring(fqcn.lastIndexOf('.') + 1);
        // Repository classes have no REST routing info – skip them
        if (simple.endsWith("JpaRepository") || simple.endsWith("Repository")) return null;
        boolean isEndpoint = simple.endsWith("Resource") || simple.endsWith("Controller")
                || simple.endsWith("Handler") || simple.endsWith("Endpoint");
        boolean isService  = simple.endsWith("ServiceImpl") || simple.endsWith("Service");
        if (!isEndpoint && !isService) return null;
        String base = simple.replaceAll("(Resource|Controller|Handler|Endpoint|ServiceImpl|Service)$", "");
        if (base.isEmpty()) return null;
        String path = "/" + Character.toLowerCase(base.charAt(0)) + base.substring(1);
        String msgLc = message == null ? "" : message.toLowerCase().trim();
        String method = "GET";
        if (msgLc.contains("updat"))  method = "PUT";
        else if (msgLc.contains("creat") || msgLc.contains("adding") || msgLc.contains("added") || msgLc.contains("insert")) method = "POST";
        else if (msgLc.contains("delet") || msgLc.contains("remov"))  method = "DELETE";
        return new String[]{ method, path, isEndpoint ? "endpoint" : "service" };
    }

    /** Replace pure-numeric and UUID path segments with {id}. */
    private String normalizePath(String path) {
        return PATH_ID_SEGMENT.matcher(path).replaceAll("/{id}");
    }
}
