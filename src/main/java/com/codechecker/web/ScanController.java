package com.codechecker.web;

import com.codechecker.entity.ScanRun;
import com.codechecker.model.ScanRequest;
import com.codechecker.model.ScanStatus;
import com.codechecker.repository.ScanRunRepository;
import com.codechecker.service.ScanOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * REST controller for starting and managing scans.
 */
@RestController
@RequestMapping("/api/scan")
public class ScanController {

    @Autowired private ScanOrchestrator scanOrchestrator;
    @Autowired private ScanRunRepository scanRunRepository;
    @Autowired private com.codechecker.security.SecurityUtils securityUtils;

    /**
     * POST /api/scan — Start a new scan.
     * Returns immediately with the scanId. Frontend watches WebSocket for progress.
     */
    @PostMapping
    public ResponseEntity<Map<String, String>> startScan(@RequestBody ScanRequest request) {
        if (request.getProjectPath() == null || request.getProjectPath().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "projectPath is required"));
        }

        com.codechecker.entity.UserEntity currentUser = securityUtils.getCurrentUser();
        String scanId = UUID.randomUUID().toString();

        // Kick off async scan
        scanOrchestrator.runScan(request, scanId, currentUser);

        Map<String, String> response = new LinkedHashMap<>();
        response.put("scanId", scanId);
        response.put("status", "RUNNING");
        response.put("message", "Scan started for " + request.getProjectName());

        return ResponseEntity.ok(response);
    }

    /**
     * GET /api/scan/{id}/status — Get scan status.
     */
    @GetMapping("/{id}/status")
    public ResponseEntity<?> getScanStatus(@PathVariable String id) {
        return scanRunRepository.findById(id)
                .map(scan -> {
                    Map<String, Object> status = new LinkedHashMap<>();
                    status.put("scanId", scan.getId());
                    status.put("status", scan.getStatus());
                    status.put("projectName", scan.getProjectName());
                    status.put("startedAt", scan.getStartedAt());
                    status.put("completedAt", scan.getCompletedAt());
                    status.put("healthScore", scan.getHealthScore());
                    status.put("grade", scan.getGrade());
                    status.put("totalEndpoints", scan.getTotalEndpoints());
                    status.put("totalIssues", scan.getTotalIssues());
                    status.put("criticalCount", scan.getCriticalCount());
                    status.put("diagramsGenerated", scan.getDiagramsGenerated());
                    return ResponseEntity.ok(status);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * DELETE /api/scan/{id} — Stop a running scan.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, String>> stopScan(@PathVariable String id) {
        scanOrchestrator.stopScan(id);
        Map<String, String> response = Map.of("scanId", id, "status", "STOPPING");
        return ResponseEntity.ok(response);
    }

    /**
     * GET /api/scan/history — All past scans.
     */
    @GetMapping("/history")
    public ResponseEntity<List<ScanRun>> getScanHistory() {
        com.codechecker.entity.UserEntity currentUser = securityUtils.getCurrentUser();
        List<ScanRun> scans = scanRunRepository.findByUserOrderByStartedAtDesc(currentUser);
        return ResponseEntity.ok(scans);
    }

    /**
     * PUT /api/scan/{id}/visibility — Toggle scan visibility.
     */
    @PutMapping("/{id}/visibility")
    public ResponseEntity<?> toggleVisibility(@PathVariable String id, @RequestBody Map<String, Boolean> body) {
        com.codechecker.entity.UserEntity currentUser = securityUtils.getCurrentUser();
        Optional<ScanRun> optScan = scanRunRepository.findById(id);
        if (optScan.isEmpty()) return ResponseEntity.notFound().build();
        
        ScanRun scan = optScan.get();
        if (!scan.getUser().getId().equals(currentUser.getId())) {
            return ResponseEntity.status(403).body("Not authorized to modify this scan");
        }
        
        boolean isPublic = body.getOrDefault("isPublic", false);
        scan.setPublic(isPublic);
        scanRunRepository.save(scan);
        
        return ResponseEntity.ok(Map.of("scanId", id, "isPublic", isPublic));
    }
}
