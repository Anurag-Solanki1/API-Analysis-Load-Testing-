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
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/test")
public class ApiTestController {

    private final ApiTesterService testerService;
    private final ApiTestRunRepository runRepository;
    private final ScanRunRepository scanRunRepository;

    public ApiTestController(ApiTesterService testerService, ApiTestRunRepository runRepository,
            ScanRunRepository scanRunRepository) {
        this.testerService = testerService;
        this.runRepository = runRepository;
        this.scanRunRepository = scanRunRepository;
    }

    @PostMapping("/run")
    public ApiTestRunEntity runTest(@RequestBody ApiTestRequest request) {
        return testerService.runTest(request);
    }

    @GetMapping("/history")
    public List<ApiTestRunEntity> getHistory(
            @RequestParam String projectName,
            @RequestParam String endpointPath,
            @RequestParam String httpMethod) {
        return runRepository.findByProjectNameAndEndpointPathAndHttpMethodOrderByStartedAtDesc(projectName,
                endpointPath, httpMethod);
    }

    @GetMapping("/projects")
    public List<String> getProjects() {
        return scanRunRepository.findAllByOrderByStartedAtDesc().stream()
                .map(ScanRun::getProjectName)
                .distinct()
                .collect(Collectors.toList());
    }

    @GetMapping("/endpoints")
    public List<EndpointResultEntity> getProjectEndpoints(@RequestParam String projectName) {
        List<ScanRun> runs = scanRunRepository.findByProjectNameOrderByStartedAtDesc(projectName);
        if (runs.isEmpty())
            return List.of();
        return runs.get(0).getEndpoints();
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
        testerService.runLiveTest(request);
        return ResponseEntity.ok(Map.of("runId", request.getLiveRunId(), "status", "RUNNING"));
    }

    /**
     * DELETE /api/test/run-live/{runId} — cancel an in-progress live test.
     */
    @DeleteMapping("/run-live/{runId}")
    public ResponseEntity<Map<String, String>> cancelLiveTest(@PathVariable String runId) {
        testerService.cancelLiveTest(runId);
        return ResponseEntity.ok(Map.of("runId", runId, "status", "CANCELLED"));
    }
}
