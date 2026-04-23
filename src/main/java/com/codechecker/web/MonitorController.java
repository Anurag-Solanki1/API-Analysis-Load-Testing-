package com.codechecker.web;

import com.codechecker.entity.GatewayConfigEntity;
import com.codechecker.model.GatewayHit;
import com.codechecker.repository.GatewayConfigRepository;
import com.codechecker.service.GatewayMonitorService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Management endpoints for the gateway monitor.
 *
 * GET /api/monitor/config/{projectName} - get configured target URL
 * POST /api/monitor/config - save / update target URL
 * GET /api/monitor/{projectName}/recent - last 200 hits (ring buffer)
 */
@RestController
@RequestMapping("/api/monitor")
public class MonitorController {

    private final GatewayConfigRepository configRepo;
    private final GatewayMonitorService monitorService;

    public MonitorController(GatewayConfigRepository configRepo,
            GatewayMonitorService monitorService) {
        this.configRepo = configRepo;
        this.monitorService = monitorService;
    }

    /** Return the gateway config for a project (404 if not set yet). */
    @GetMapping("/config/{projectName}")
    public ResponseEntity<GatewayConfigEntity> getConfig(@PathVariable String projectName) {
        return configRepo.findByProjectName(projectName)
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
        Optional<GatewayConfigEntity> existing = configRepo.findByProjectName(projectName);
        GatewayConfigEntity cfg = existing.orElseGet(() -> {
            GatewayConfigEntity e = new GatewayConfigEntity();
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
    public List<GatewayHit> getRecentHits(@PathVariable String projectName) {
        return monitorService.getRecent(projectName);
    }

    /** Clear the in-memory hit buffer for a project. */
    @DeleteMapping("/{projectName}/hits")
    public ResponseEntity<Void> clearHits(@PathVariable String projectName) {
        monitorService.clear(projectName);
        return ResponseEntity.noContent().build();
    }
}
