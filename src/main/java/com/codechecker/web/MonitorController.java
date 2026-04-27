package com.codechecker.web;

import com.codechecker.entity.GatewayConfigEntity;
import com.codechecker.model.GatewayHit;
import com.codechecker.repository.GatewayConfigRepository;
import com.codechecker.service.GatewayMonitorService;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.codechecker.entity.ScanRun;
import com.codechecker.repository.ScanRunRepository;

/**
 * Management endpoints for the gateway monitor.
 *
 * GET  /api/monitor/config/{projectName}          – get configured target URL
 * POST /api/monitor/config                        – save / update target URL
 * GET  /api/monitor/{projectName}/recent          – last 200 hits (ring buffer)
 * GET  /api/monitor/{projectName}/history         – paginated full history from DB
 * GET  /api/monitor/{projectName}/history/count   – total hit count for a project
 * DELETE /api/monitor/{projectName}/hits          – clear all hits
 */
@RestController
@RequestMapping("/api/monitor")
public class MonitorController {

    private final GatewayConfigRepository configRepo;
    private final GatewayMonitorService monitorService;
    private final com.codechecker.security.SecurityUtils securityUtils;
    private final ScanRunRepository scanRunRepository;

    public MonitorController(GatewayConfigRepository configRepo,
            GatewayMonitorService monitorService,
            com.codechecker.security.SecurityUtils securityUtils,
            ScanRunRepository scanRunRepository) {
        this.configRepo = configRepo;
        this.monitorService = monitorService;
        this.securityUtils = securityUtils;
        this.scanRunRepository = scanRunRepository;
    }

    private com.codechecker.entity.UserEntity resolveTargetUser(String scanId) {
        if (scanId != null && !scanId.isBlank()) {
            Optional<ScanRun> optScan = scanRunRepository.findById(scanId);
            if (optScan.isEmpty() || !securityUtils.canAccessScan(optScan.get())) {
                throw new org.springframework.security.access.AccessDeniedException("Cannot access scan");
            }
            return optScan.get().getUser();
        }
        return securityUtils.getCurrentUser();
    }

    /** Return the gateway config for a project (404 if not set yet). */
    @GetMapping("/config/{projectName}")
    public ResponseEntity<GatewayConfigEntity> getConfig(@PathVariable String projectName,
            @RequestParam(required = false) String scanId) {
        com.codechecker.entity.UserEntity user = resolveTargetUser(scanId);
        return configRepo.findByUserAndProjectName(user, projectName)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /** Create or update the target base URL for a project. */
    @PostMapping("/config")
    public GatewayConfigEntity saveConfig(@RequestBody Map<String, String> body) {
        String projectName = body.get("projectName");
        String targetBaseUrl = body.get("targetBaseUrl");
        if (projectName == null || projectName.isBlank()
                || targetBaseUrl == null || targetBaseUrl.isBlank()) {
            throw new IllegalArgumentException("projectName and targetBaseUrl are required");
        }
        com.codechecker.entity.UserEntity user = securityUtils.getCurrentUser();
        Optional<GatewayConfigEntity> existing = configRepo.findByUserAndProjectName(user, projectName);
        GatewayConfigEntity cfg = existing.orElseGet(() -> {
            GatewayConfigEntity e = new GatewayConfigEntity();
            e.setUser(user);
            e.setProjectName(projectName);
            e.setCreatedAt(LocalDateTime.now());
            return e;
        });
        cfg.setTargetBaseUrl(targetBaseUrl);
        cfg.setUpdatedAt(LocalDateTime.now());
        return configRepo.save(cfg);
    }

    /** Return the last 200 gateway hits for a project (newest first). */
    @GetMapping("/{projectName}/recent")
    public List<GatewayHit> getRecentHits(@PathVariable String projectName,
            @RequestParam(required = false) String scanId) {
        com.codechecker.entity.UserEntity user = resolveTargetUser(scanId);
        return monitorService.getRecent(user, projectName);
    }

    /**
     * Paginated hit history from the DB (up to last 7 days).
     *
     * Query params:
     *   page  – 0-based page index, default 0
     *   size  – rows per page, default 50, max 200
     *   date  – optional YYYY-MM-DD to filter to a specific day
     */
    @GetMapping("/{projectName}/history")
    public Page<GatewayHit> getHistory(
            @PathVariable String projectName,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String date,
            @RequestParam(required = false) String scanId) {
        LocalDate localDate = null;
        if (date != null && !date.isBlank()) {
            try {
                localDate = LocalDate.parse(date);
            } catch (Exception ignored) { /* bad format — ignore date filter */ }
        }
        com.codechecker.entity.UserEntity user = resolveTargetUser(scanId);
        return monitorService.getHistory(user, projectName, page, size, localDate);
    }

    /** Total number of persisted hits for a project. */
    @GetMapping("/{projectName}/history/count")
    public Map<String, Long> getHitCount(@PathVariable String projectName,
            @RequestParam(required = false) String scanId) {
        com.codechecker.entity.UserEntity user = resolveTargetUser(scanId);
        return Map.of("count", monitorService.countHits(user, projectName));
    }

    /** Clear the in-memory hit buffer and DB records for a project. */
    @DeleteMapping("/{projectName}/hits")
    public ResponseEntity<Void> clearHits(@PathVariable String projectName) {
        com.codechecker.entity.UserEntity user = securityUtils.getCurrentUser();
        monitorService.clear(user, projectName);
        return ResponseEntity.noContent().build();
    }
}
