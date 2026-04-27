package com.codechecker.web;

import com.codechecker.entity.ScanRun;
import com.codechecker.repository.ScanRunRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/community")
@Transactional(readOnly = true)
public class CommunityController {

    private final ScanRunRepository scanRunRepository;

    public CommunityController(ScanRunRepository scanRunRepository) {
        this.scanRunRepository = scanRunRepository;
    }

    @GetMapping("/scans")
    public ResponseEntity<List<Map<String, Object>>> getPublicScans() {
        List<ScanRun> publicScans = scanRunRepository.findByIsPublicTrueOrderByStartedAtDesc();
        
        List<Map<String, Object>> response = publicScans.stream().map(scan -> {
            return Map.<String, Object>of(
                "id", scan.getId(),
                "projectName", scan.getProjectName(),
                "startedAt", scan.getStartedAt() != null ? scan.getStartedAt().toString() : "",
                "completedAt", scan.getCompletedAt() != null ? scan.getCompletedAt().toString() : "",
                "healthScore", scan.getHealthScore() != null ? scan.getHealthScore() : 0,
                "grade", scan.getGrade() != null ? scan.getGrade() : "F",
                "totalEndpoints", scan.getTotalEndpoints() != null ? scan.getTotalEndpoints() : 0,
                "ownerName", scan.getUser() != null ? scan.getUser().getName() : "Anonymous",
                "ownerPicture", scan.getUser() != null ? scan.getUser().getPictureUrl() : ""
            );
        }).collect(Collectors.toList());

        return ResponseEntity.ok(response);
    }
}
