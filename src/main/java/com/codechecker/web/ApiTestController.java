package com.codechecker.web;

import com.codechecker.entity.ApiTestRunEntity;
import com.codechecker.model.ApiTestRequest;
import com.codechecker.repository.ApiTestRunRepository;
import com.codechecker.service.ApiTesterService;
import com.codechecker.repository.ScanRunRepository;
import com.codechecker.entity.ScanRun;
import com.codechecker.entity.EndpointResultEntity;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.transaction.annotation.Transactional;

@RestController
@RequestMapping("/api/test")
@Transactional(readOnly = true)
public class ApiTestController {

    private final ApiTesterService testerService;
    private final ApiTestRunRepository runRepository;
    private final ScanRunRepository scanRunRepository;
    private final com.codechecker.security.SecurityUtils securityUtils;

    public ApiTestController(ApiTesterService testerService, ApiTestRunRepository runRepository,
            ScanRunRepository scanRunRepository, com.codechecker.security.SecurityUtils securityUtils) {
        this.testerService = testerService;
        this.runRepository = runRepository;
        this.scanRunRepository = scanRunRepository;
        this.securityUtils = securityUtils;
    }

    @PostMapping("/run")
    public ApiTestRunEntity runTest(@RequestBody ApiTestRequest request) {
        com.codechecker.entity.UserEntity user = securityUtils.getCurrentUser();
        return testerService.runTest(request, user);
    }

    @GetMapping("/history")
    public ResponseEntity<List<ApiTestRunEntity>> getHistory(
            @RequestParam String projectName,
            @RequestParam String endpointPath,
            @RequestParam String httpMethod,
            @RequestParam(required = false) String scanId) {

        com.codechecker.entity.UserEntity targetUser = null;

        if (scanId != null && !scanId.isBlank()) {
            Optional<ScanRun> optScan = scanRunRepository.findById(scanId);
            if (optScan.isEmpty() || !securityUtils.canAccessScan(optScan.get())) {
                return ResponseEntity.status(403).build();
            }
            targetUser = optScan.get().getUser();
        } else {
            targetUser = securityUtils.getCurrentUser();
        }

        List<ApiTestRunEntity> history = runRepository.findByUserAndProjectNameAndEndpointPathAndHttpMethodOrderByStartedAtDesc(
                targetUser, projectName, endpointPath, httpMethod);
        return ResponseEntity.ok(history);
    }

    @GetMapping("/projects")
    public List<String> getProjects() {
        com.codechecker.entity.UserEntity user = securityUtils.getCurrentUser();
        return scanRunRepository.findByUserOrderByStartedAtDesc(user).stream()
                .map(ScanRun::getProjectName)
                .distinct()
                .collect(Collectors.toList());
    }

    @GetMapping("/endpoints")
    public ResponseEntity<List<EndpointResultEntity>> getProjectEndpoints(
            @RequestParam String projectName,
            @RequestParam(required = false) String scanId) {

        List<ScanRun> runs;
        if (scanId != null && !scanId.isBlank()) {
            Optional<ScanRun> optScan = scanRunRepository.findById(scanId);
            if (optScan.isEmpty() || !securityUtils.canAccessScan(optScan.get())) {
                return ResponseEntity.status(403).build();
            }
            runs = List.of(optScan.get());
        } else {
            com.codechecker.entity.UserEntity user = securityUtils.getCurrentUser();
            runs = scanRunRepository.findByUserAndProjectNameOrderByStartedAtDesc(user, projectName);
        }

        if (runs.isEmpty())
            return ResponseEntity.ok(List.of());
        List<EndpointResultEntity> endpoints = runs.get(0).getEndpoints();
        endpoints.size(); // Force hibernate proxy initialization
        return ResponseEntity.ok(endpoints);
    }

    /**
     * POST /api/test/run-live — start an async live test.
     * Each individual hit is pushed via WebSocket to /topic/live-test/{liveRunId}.
     * Frontend must subscribe BEFORE calling this endpoint.
     */
    @PostMapping("/run-live")
    public ResponseEntity<Map<String, String>> startLiveTest(@RequestBody ApiTestRequest request) {
        if (request.getLiveRunId() == null || request.getLiveRunId().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "liveRunId is required"));
        }
        com.codechecker.entity.UserEntity user = securityUtils.getCurrentUser();
        testerService.runLiveTest(request, user);
        return ResponseEntity.ok(Map.of("runId", request.getLiveRunId(), "status", "RUNNING"));
    }

    /**
     * DELETE /api/test/run-live/{runId} — cancel an in-progress live test.
     */
    @DeleteMapping("/run-live/{runId}")
    public ResponseEntity<Map<String, String>> cancelLiveTest(@PathVariable String runId) {
        com.codechecker.entity.UserEntity user = securityUtils.getCurrentUser();
        testerService.cancelLiveTest(runId, user);
        return ResponseEntity.ok(Map.of("runId", runId, "status", "CANCELLED"));
    }
}
