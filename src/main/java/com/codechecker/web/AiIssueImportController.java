package com.codechecker.web;

import com.codechecker.entity.IssueResultEntity;
import com.codechecker.entity.ScanRun;
import com.codechecker.repository.IssueResultRepository;
import com.codechecker.repository.ScanRunRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Imports AI-discovered issues written by the GitHub Copilot apichecker-agent.
 *
 * Flow:
 * 1. User runs the apichecker agent in VS Code Copilot Chat:
 * "ai issues <scanId>"
 * 2. Agent writes: codechecker-output/<scanId>/codechecker-ai-issues.json
 * 3. Frontend calls POST /api/ai/import/<scanId>
 * 4. This controller reads the JSON, saves issues with source="AI_AGENT"
 */
@RestController
@RequestMapping("/api/ai")
public class AiIssueImportController {

    @Autowired
    private ScanRunRepository scanRunRepository;
    @Autowired
    private IssueResultRepository issueResultRepository;
    @Autowired
    private ObjectMapper objectMapper;

    /**
     * Check whether the agent-written JSON file exists and how many issues it has.
     */
    @GetMapping("/status/{scanId}")
    public ResponseEntity<?> getStatus(@PathVariable String scanId) {
        Map<String, Object> resp = new LinkedHashMap<>();

        Optional<ScanRun> opt = scanRunRepository.findById(scanId);
        if (opt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Path jsonFile = resolveAiIssuesFile(opt.get(), scanId);
        boolean fileExists = Files.exists(jsonFile);
        long fileIssueCount = 0;
        if (fileExists) {
            try {
                List<Map<String, Object>> items = objectMapper.readValue(
                        jsonFile.toFile(), new TypeReference<>() {
                        });
                fileIssueCount = items.size();
            } catch (Exception ignored) {
            }
        }

        long importedCount = issueResultRepository.findByScanRunIdAndSource(scanId, "AI_AGENT").size();

        resp.put("fileExists", fileExists);
        resp.put("fileIssueCount", fileIssueCount);
        resp.put("importedCount", importedCount);
        resp.put("filePath", jsonFile.toString());
        resp.put("projectPath", opt.get().getProjectPath());
        resp.put("projectName", opt.get().getProjectName());
        return ResponseEntity.ok(resp);
    }

    /**
     * Read codechecker-ai-issues.json and persist every issue as source="AI_AGENT".
     */
    @PostMapping("/import/{scanId}")
    public ResponseEntity<?> importAiIssues(@PathVariable String scanId) {
        Optional<ScanRun> opt = scanRunRepository.findById(scanId);
        if (opt.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Scan not found: " + scanId));
        }
        ScanRun scan = opt.get();
        Path jsonFile = resolveAiIssuesFile(scan, scanId);

        if (!Files.exists(jsonFile)) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "AI issues file not found. Ask the Copilot agent: ai issues " + scanId,
                    "expectedPath", jsonFile.toString()));
        }

        List<Map<String, Object>> items;
        try {
            items = objectMapper.readValue(jsonFile.toFile(), new TypeReference<>() {
            });
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Failed to parse ai-issues JSON: " + e.getMessage()));
        }

        // Remove previous AI issues for this scan before re-importing
        issueResultRepository.deleteByScanRunIdAndSource(scanId, "AI_AGENT");

        List<IssueResultEntity> saved = new ArrayList<>();
        for (Map<String, Object> item : items) {
            IssueResultEntity issue = new IssueResultEntity();
            issue.setScanRun(scan);
            issue.setSource("AI_AGENT");
            issue.setRuleId(str(item, "ruleId"));
            issue.setSeverity(str(item, "severity"));
            issue.setTitle(str(item, "title"));
            issue.setDescription(str(item, "description"));
            issue.setFile(str(item, "file"));
            issue.setLineNumber(intVal(item, "lineNumber"));
            issue.setBeforeCode(str(item, "beforeCode"));
            issue.setAfterCode(str(item, "afterCode"));
            issue.setAffectedEndpoint(str(item, "affectedEndpoint"));
            issue.setCategory(str(item, "category"));
            issue.setAutoFixed(false);
            saved.add(issue);
        }
        issueResultRepository.saveAll(saved);

        return ResponseEntity.ok(Map.of(
                "imported", saved.size(),
                "scanId", scanId));
    }

    /** Remove all AI_AGENT issues for a scan (allows re-running the agent). */
    @DeleteMapping("/issues/{scanId}")
    public ResponseEntity<?> deleteAiIssues(@PathVariable String scanId) {
        if (!scanRunRepository.existsById(scanId)) {
            return ResponseEntity.notFound().build();
        }
        issueResultRepository.deleteByScanRunIdAndSource(scanId, "AI_AGENT");
        return ResponseEntity.ok(Map.of("deleted", true, "scanId", scanId));
    }

    /**
     * Apply a code fix: find {@code beforeCode} in the target file and replace it
     * with {@code afterCode}. The file path is resolved relative to the scan's
     * project path.
     *
     * Request body fields:
     * scanId – id of the scan (used to locate projectPath)
     * filePath – relative path within the project (e.g. "src/main/java/…/Foo.java")
     * beforeCode – exact text to search for in the file
     * afterCode – replacement text
     */
    @PostMapping("/apply-fix")
    public ResponseEntity<?> applyFix(@RequestBody Map<String, String> body) {
        String scanId = body.get("scanId");
        String filePath = body.get("filePath");
        String before = body.get("beforeCode");
        String after = body.get("afterCode");

        if (scanId == null || filePath == null || before == null || after == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "scanId, filePath, beforeCode and afterCode are required"));
        }

        Optional<ScanRun> opt = scanRunRepository.findById(scanId);
        if (opt.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Scan not found: " + scanId));
        }

        String projectPath = opt.get().getProjectPath();
        if (projectPath == null || projectPath.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No project path stored for this scan"));
        }

        // Sanitise filePath: strip leading slashes / backslashes to keep it relative
        String sanitised = filePath.replaceAll("^[/\\\\]+", "");
        Path target = Paths.get(projectPath).resolve(sanitised).normalize();

        // Safety: resolved path must be inside the project root
        if (!target.startsWith(Paths.get(projectPath).normalize())) {
            return ResponseEntity.badRequest().body(Map.of("error", "File path escapes project root"));
        }

        if (!Files.exists(target)) {
            return ResponseEntity.badRequest().body(Map.of("error", "File not found: " + target));
        }

        try {
            String original = Files.readString(target);
            if (!original.contains(before)) {
                return ResponseEntity.badRequest().body(Map.of(
                        "error", "beforeCode not found in file — the file may have changed since the scan",
                        "file", target.toString()));
            }
            // Replace only the FIRST occurrence to be safe
            String updated = original.replaceFirst(java.util.regex.Pattern.quote(before),
                    java.util.regex.Matcher.quoteReplacement(after));
            Files.writeString(target, updated);
            return ResponseEntity.ok(Map.of("applied", true, "file", target.toString()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to apply fix: " + e.getMessage()));
        }
    }

    /**
     * Append a fix entry to the per-scan fix queue.
     * Each entry starts with status "PENDING". The apichecker-agent reads this
     * file, applies all PENDING fixes across the workspace, then updates each
     * entry to "FIXED" so it is never re-applied.
     *
     * Request body fields: scanId, ruleId, title, file, lineNumber,
     * beforeCode, afterCode
     */
    @PostMapping("/prepare-fix")
    public ResponseEntity<?> prepareFix(@RequestBody Map<String, String> body) {
        String scanId = body.get("scanId");
        String ruleId = body.get("ruleId");
        String title = body.get("title");
        String file = body.get("file");
        String lineNumber = body.get("lineNumber");
        String beforeCode = body.get("beforeCode");
        String afterCode = body.get("afterCode");

        if (scanId == null || ruleId == null || beforeCode == null || afterCode == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "scanId, ruleId, beforeCode and afterCode are required"));
        }

        Optional<ScanRun> opt = scanRunRepository.findById(scanId);
        if (opt.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Scan not found: " + scanId));
        }

        ScanRun scan = opt.get();
        String outputBase = scan.getOutputPath() != null
                ? scan.getOutputPath()
                : Paths.get("codechecker-output", scanId).toString();

        Path queueFile = Paths.get(outputBase, "codechecker-fix-queue.json");

        try {
            // Read existing queue or start fresh
            List<Map<String, Object>> queue = new ArrayList<>();
            if (Files.exists(queueFile)) {
                try {
                    queue = objectMapper.readValue(queueFile.toFile(), new TypeReference<>() {
                    });
                } catch (Exception ignored) {
                    queue = new ArrayList<>();
                }
            }

            // Build new PENDING entry
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("status", "PENDING");
            entry.put("scanId", scanId);
            entry.put("ruleId", ruleId);
            entry.put("title", title != null ? title : "");
            entry.put("file", file != null ? file : "");
            entry.put("lineNumber", lineNumber != null ? lineNumber : "0");
            entry.put("beforeCode", beforeCode);
            entry.put("afterCode", afterCode);
            entry.put("projectPath", scan.getProjectPath() != null ? scan.getProjectPath() : "");
            entry.put("queuedAt", java.time.Instant.now().toString());
            queue.add(entry);

            // Write updated queue back
            Files.createDirectories(queueFile.getParent());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(queueFile.toFile(), queue);

            long pendingCount = queue.stream()
                    .filter(e -> "PENDING".equals(e.get("status")))
                    .count();

            String command = "apply fix for scan " + scanId;
            return ResponseEntity.ok(Map.of(
                    "command", command,
                    "queueFile", queueFile.toString(),
                    "pendingCount", pendingCount,
                    "projectPath", scan.getProjectPath() != null ? scan.getProjectPath() : ""));
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to update fix queue: " + e.getMessage()));
        }
    }

    /**
     * Queue multiple issues at once. Accepts an array of issues in the request body
     * along with the scanId, and appends each as a PENDING entry to the fix queue.
     */
    @PostMapping("/bulk-prepare-fix")
    public ResponseEntity<?> bulkPrepareFix(@RequestBody Map<String, Object> body) {
        String scanId = (String) body.get("scanId");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> issuesList = (List<Map<String, Object>>) body.get("issues");

        if (scanId == null || issuesList == null || issuesList.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "scanId and a non-empty issues array are required"));
        }

        Optional<ScanRun> opt = scanRunRepository.findById(scanId);
        if (opt.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Scan not found: " + scanId));
        }

        ScanRun scan = opt.get();
        String outputBase = scan.getOutputPath() != null
                ? scan.getOutputPath()
                : Paths.get("codechecker-output", scanId).toString();

        Path queueFile = Paths.get(outputBase, "codechecker-fix-queue.json");

        try {
            List<Map<String, Object>> queue = new ArrayList<>();
            if (Files.exists(queueFile)) {
                try {
                    queue = objectMapper.readValue(queueFile.toFile(), new TypeReference<>() {
                    });
                } catch (Exception ignored) {
                    queue = new ArrayList<>();
                }
            }

            // Collect ruleIds already in queue to avoid duplicates
            Set<String> existingRuleIds = new HashSet<>();
            for (Map<String, Object> e : queue) {
                Object rid = e.get("ruleId");
                if (rid != null)
                    existingRuleIds.add(rid.toString());
            }

            int added = 0;
            for (Map<String, Object> issue : issuesList) {
                String ruleId = issue.get("ruleId") != null ? issue.get("ruleId").toString() : null;
                if (ruleId == null || existingRuleIds.contains(ruleId))
                    continue;

                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("status", "PENDING");
                entry.put("scanId", scanId);
                entry.put("ruleId", ruleId);
                entry.put("title", issue.getOrDefault("title", ""));
                entry.put("file", issue.getOrDefault("file", ""));
                entry.put("lineNumber", issue.getOrDefault("lineNumber", "0").toString());
                entry.put("beforeCode", issue.getOrDefault("beforeCode", ""));
                entry.put("afterCode", issue.getOrDefault("afterCode", ""));
                entry.put("projectPath", scan.getProjectPath() != null ? scan.getProjectPath() : "");
                entry.put("queuedAt", java.time.Instant.now().toString());
                queue.add(entry);
                existingRuleIds.add(ruleId);
                added++;
            }

            Files.createDirectories(queueFile.getParent());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(queueFile.toFile(), queue);

            long pendingCount = queue.stream()
                    .filter(e -> "PENDING".equals(e.get("status")))
                    .count();

            String command = "apply fix for scan " + scanId;
            return ResponseEntity.ok(Map.of(
                    "command", command,
                    "queueFile", queueFile.toString(),
                    "added", added,
                    "pendingCount", pendingCount,
                    "projectPath", scan.getProjectPath() != null ? scan.getProjectPath() : ""));
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to update fix queue: " + e.getMessage()));
        }
    }

    /**
     * Verify whether a fix has actually been applied by checking if the
     * beforeCode still exists in the target file. Returns verified=true
     * if the beforeCode is gone (fix applied), false otherwise.
     */
    @GetMapping("/verify-fix/{scanId}/{ruleId}")
    public ResponseEntity<?> verifyFix(@PathVariable String scanId, @PathVariable String ruleId) {
        Optional<ScanRun> opt = scanRunRepository.findById(scanId);
        if (opt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        ScanRun scan = opt.get();
        String outputBase = scan.getOutputPath() != null
                ? scan.getOutputPath()
                : Paths.get("codechecker-output", scanId).toString();
        Path queueFile = Paths.get(outputBase, "codechecker-fix-queue.json");

        if (!Files.exists(queueFile)) {
            return ResponseEntity.ok(Map.of("verified", false, "reason", "No fix queue found"));
        }

        try {
            List<Map<String, Object>> queue = objectMapper.readValue(queueFile.toFile(), new TypeReference<>() {
            });
            Map<String, Object> entry = null;
            for (Map<String, Object> e : queue) {
                if (ruleId.equals(e.get("ruleId"))) {
                    entry = e;
                    break;
                }
            }
            if (entry == null) {
                return ResponseEntity.ok(Map.of("verified", false, "reason", "Rule not in fix queue"));
            }
            if (!"FIXED".equals(entry.get("status"))) {
                return ResponseEntity.ok(Map.of("verified", false, "reason",
                        "Fix not yet applied (status=" + entry.get("status") + ")"));
            }

            String beforeCode = entry.get("beforeCode") != null ? entry.get("beforeCode").toString() : "";
            String filePath = entry.get("file") != null ? entry.get("file").toString() : "";
            String projectPath = entry.get("projectPath") != null ? entry.get("projectPath").toString() : "";

            if (beforeCode.isEmpty() || filePath.isEmpty()) {
                return ResponseEntity
                        .ok(Map.of("verified", false, "reason", "Missing beforeCode or file in queue entry"));
            }

            String sanitised = filePath.replaceAll("^[/\\\\]+", "");
            Path target;
            if (projectPath.isEmpty()) {
                target = Paths.get(sanitised);
            } else {
                target = Paths.get(projectPath).resolve(sanitised).normalize();
            }

            if (!Files.exists(target)) {
                return ResponseEntity.ok(
                        Map.of("verified", false, "reason", "File not found: " + target, "file", target.toString()));
            }

            String content = Files.readString(target);
            boolean codeGone = !content.contains(beforeCode);
            return ResponseEntity.ok(Map.of(
                    "verified", codeGone,
                    "ruleId", ruleId,
                    "file", target.toString(),
                    "reason", codeGone ? "beforeCode no longer present in file" : "beforeCode still found in file"));
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Verification failed: " + e.getMessage()));
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /**
     * Return the current fix queue for a scan so the UI can show which issues
     * have been marked FIXED by the agent.
     */
    @GetMapping("/fix-queue/{scanId}")
    public ResponseEntity<?> getFixQueue(@PathVariable String scanId) {
        Optional<ScanRun> opt = scanRunRepository.findById(scanId);
        if (opt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        ScanRun scan = opt.get();
        String outputBase = scan.getOutputPath() != null
                ? scan.getOutputPath()
                : Paths.get("codechecker-output", scanId).toString();
        Path queueFile = Paths.get(outputBase, "codechecker-fix-queue.json");
        if (!Files.exists(queueFile)) {
            return ResponseEntity.ok(List.of());
        }
        try {
            List<Map<String, Object>> queue = objectMapper.readValue(queueFile.toFile(), new TypeReference<>() {
            });
            return ResponseEntity.ok(queue);
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to read fix queue: " + e.getMessage()));
        }
    }

    private Path resolveAiIssuesFile(ScanRun scan, String scanId) {
        String base = scan.getOutputPath() != null
                ? scan.getOutputPath()
                : Paths.get("codechecker-output", scanId).toString();
        return Paths.get(base, "codechecker-ai-issues.json");
    }

    private String str(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v != null ? v.toString() : null;
    }

    private Integer intVal(Map<String, Object> m, String key) {
        Object v = m.get(key);
        if (v == null)
            return 0;
        try {
            return Integer.parseInt(v.toString());
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
