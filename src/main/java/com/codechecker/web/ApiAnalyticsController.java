package com.codechecker.web;

import com.codechecker.entity.ApiLogEntryEntity;
import com.codechecker.repository.ApiLogEntryRepository;
import com.codechecker.service.LogIngestionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/analytics")
public class ApiAnalyticsController {

    private final LogIngestionService ingestionService;
    private final ApiLogEntryRepository repository;

    public ApiAnalyticsController(LogIngestionService ingestionService, ApiLogEntryRepository repository) {
        this.ingestionService = ingestionService;
        this.repository = repository;
    }

    @PostMapping("/import")
    public ResponseEntity<Map<String, Object>> importLogs(
            @RequestParam String projectName,
            @RequestBody String logData) {
        LogIngestionService.ParseResult result = ingestionService.parseAndSaveLogs(projectName, logData);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("message", "Successfully parsed logs");
        response.put("count", result.count);
        response.put("issues", result.issues);
        response.put("slowCount", result.slowCount);
        response.put("batchId", result.batchId);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/timeline")
    public ResponseEntity<List<ApiLogEntryEntity>> getTimeline(
            @RequestParam String projectName,
            @RequestParam String endpointPath,
            @RequestParam String httpMethod) {
        List<ApiLogEntryEntity> entries = repository.findByProjectNameAndEndpointPathAndHttpMethodOrderByTimestampDesc(
                projectName, endpointPath, httpMethod);
        return ResponseEntity.ok(entries);
    }

    /** Return all log entries for a project sorted by timestamp ascending. */
    @GetMapping("/all")
    public ResponseEntity<List<ApiLogEntryEntity>> getAllForProject(
            @RequestParam String projectName) {
        List<ApiLogEntryEntity> entries = repository.findByProjectNameOrderByTimestampAsc(projectName);
        return ResponseEntity.ok(entries);
    }

    /** Return log entries for a specific import batch. */
    @GetMapping("/batch")
    public ResponseEntity<List<ApiLogEntryEntity>> getBatch(
            @RequestParam String projectName,
            @RequestParam String batchId) {
        List<ApiLogEntryEntity> entries =
                repository.findByProjectNameAndImportBatchIdOrderByTimestampAsc(projectName, batchId);
        return ResponseEntity.ok(entries);
    }

    /** Return batch summary list for a project: [{batchId, importNumber, count, firstTimestamp}, ...] */
    @GetMapping("/batches")
    public ResponseEntity<List<Map<String, Object>>> getBatches(
            @RequestParam String projectName) {
        List<Object[]> rows = repository.findBatchSummariesByProjectName(projectName);
        int total = rows.size();
        List<Map<String, Object>> result = rows.stream().map(row -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("batchId", row[0]);
            m.put("count", row[1]);
            m.put("firstTimestamp", row[2] != null ? row[2].toString() : null);
            m.put("lastTimestamp", row[3] != null ? row[3].toString() : null);
            return m;
        }).collect(Collectors.toList());
        // Add 1-based import number (newest = highest number)
        for (int i = 0; i < result.size(); i++) {
            result.get(i).put("importNumber", total - i);
        }
        return ResponseEntity.ok(result);
    }

    /** Delete all stored log entries for a project. */
    @DeleteMapping("/all")
    public ResponseEntity<Void> clearAll(@RequestParam String projectName) {
        repository.deleteByProjectName(projectName);
        return ResponseEntity.noContent().build();
    }

    /** Delete a specific import batch. */
    @DeleteMapping("/batch")
    public ResponseEntity<Void> clearBatch(@RequestParam String batchId) {
        repository.deleteByImportBatchId(batchId);
        return ResponseEntity.noContent().build();
    }
}
