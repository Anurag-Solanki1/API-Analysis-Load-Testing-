package com.codechecker.web;

import com.codechecker.entity.*;
import com.codechecker.repository.IssueResultRepository;
import com.codechecker.repository.ScanRunRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

import org.springframework.transaction.annotation.Transactional;

/**
 * REST controller for retrieving scan results.
 */
@RestController
@RequestMapping("/api/results")
@Transactional(readOnly = true)
public class ResultController {

    @Autowired
    private ScanRunRepository scanRunRepository;
    @Autowired
    private IssueResultRepository issueResultRepository;
    @Autowired
    private com.codechecker.security.SecurityUtils securityUtils;

    /**
     * GET /api/results/{scanId} — Full scan result.
     */
    @GetMapping("/{scanId}")
    public ResponseEntity<?> getFullResult(@PathVariable String scanId) {
        return scanRunRepository.findById(scanId)
                .filter(scan -> securityUtils.canAccessScan(scan))
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.status(403).build());
    }

    /**
     * GET /api/results/{scanId}/summary — Health score and summary counts.
     */
    @GetMapping("/{scanId}/summary")
    public ResponseEntity<?> getSummary(@PathVariable String scanId) {
        return scanRunRepository.findById(scanId)
                .filter(scan -> securityUtils.canAccessScan(scan))
                .map(scan -> {
                    Map<String, Object> summary = new LinkedHashMap<>();
                    summary.put("scanId", scan.getId());
                    summary.put("projectName", scan.getProjectName());
                    summary.put("projectPath", scan.getProjectPath());
                    summary.put("healthScore", scan.getHealthScore());
                    summary.put("grade", scan.getGrade());
                    summary.put("releaseDecision", scan.getReleaseDecision());
                    summary.put("status", scan.getStatus() != null ? scan.getStatus().name() : null);
                    summary.put("totalEndpoints", scan.getTotalEndpoints());
                    summary.put("totalIssues", scan.getTotalIssues());
                    summary.put("criticalCount", scan.getCriticalCount());
                    summary.put("totalFiles", scan.getTotalFiles());
                    summary.put("diagramsGenerated", scan.getDiagramsGenerated());
                    summary.put("startedAt", scan.getStartedAt());
                    summary.put("completedAt", scan.getCompletedAt());
                    summary.put("isPublic", scan.isPublic());

                    // Count by rating
                    long fast = scan.getEndpoints().stream().filter(e -> "FAST".equals(e.getPerformanceRating()))
                            .count();
                    long moderate = scan.getEndpoints().stream()
                            .filter(e -> "MODERATE".equals(e.getPerformanceRating())).count();
                    long slow = scan.getEndpoints().stream().filter(e -> "SLOW".equals(e.getPerformanceRating()))
                            .count();
                    long critical = scan.getEndpoints().stream()
                            .filter(e -> "CRITICAL".equals(e.getPerformanceRating())).count();
                    summary.put("fastEndpoints", fast);
                    summary.put("moderateEndpoints", moderate);
                    summary.put("slowEndpoints", slow);
                    summary.put("criticalEndpoints", critical);

                    return ResponseEntity.ok(summary);
                })
                .orElse(ResponseEntity.status(403).build());
    }

    /**
     * GET /api/results/{scanId}/endpoints — All APIs with ratings.
     */
    @GetMapping("/{scanId}/endpoints")
    public ResponseEntity<?> getEndpoints(@PathVariable String scanId) {
        return scanRunRepository.findById(scanId)
                .filter(scan -> securityUtils.canAccessScan(scan))
                .map(scan -> {
                    scan.getEndpoints().size(); // Force hibernate proxy initialization
                    return ResponseEntity.ok(scan.getEndpoints());
                })
                .orElse(ResponseEntity.status(403).build());
    }

    /**
     * GET /api/results/{scanId}/issues — All issues, optionally filtered.
     */
    @GetMapping("/{scanId}/issues")
    public ResponseEntity<?> getIssues(
            @PathVariable String scanId,
            @RequestParam(required = false) String severity,
            @RequestParam(required = false) String category) {

        Optional<ScanRun> optScan = scanRunRepository.findById(scanId);
        if (optScan.isEmpty() || !securityUtils.canAccessScan(optScan.get())) {
            return ResponseEntity.status(403).build();
        }

        List<IssueResultEntity> issues;
        if (severity != null) {
            issues = issueResultRepository.findByScanRunIdAndSeverity(scanId, severity);
        } else if (category != null) {
            issues = issueResultRepository.findByScanRunIdAndCategory(scanId, category);
        } else {
            issues = issueResultRepository.findByScanRunId(scanId);
        }

        return ResponseEntity.ok(issues);
    }
}
