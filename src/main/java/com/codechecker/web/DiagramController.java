package com.codechecker.web;

import com.codechecker.entity.ScanRun;
import com.codechecker.repository.ScanRunRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Collectors;

/**
 * REST controller for serving generated diagrams.
 */
@RestController
@RequestMapping("/api/diagrams")
public class DiagramController {

    @Autowired
    private ScanRunRepository scanRunRepository;

    @Autowired
    private com.codechecker.security.SecurityUtils securityUtils;

    /** Validate that a path variable contains only safe characters (UUID-like segments, no traversal). */
    private boolean isSafePathSegment(String segment) {
        return segment != null && segment.matches("[a-zA-Z0-9._-]+");
    }

    /**
     * GET /api/diagrams/{scanId} — List all diagram files for a scan.
     */
    @GetMapping("/{scanId}")
    public ResponseEntity<?> listDiagrams(@PathVariable String scanId) {
        if (!isSafePathSegment(scanId)) {
            return ResponseEntity.badRequest().body("Invalid scan ID");
        }
        Optional<ScanRun> optScan = scanRunRepository.findById(scanId);
        if (optScan.isEmpty() || !securityUtils.canAccessScan(optScan.get())) {
            return ResponseEntity.status(403).body("Not authorized to view this scan's diagrams");
        }
        
        Path outputDir = Paths.get("codechecker-output", scanId);
        if (!Files.exists(outputDir)) {
            return ResponseEntity.notFound().build();
        }

        try (var files = Files.walk(outputDir)) {
            List<Map<String, String>> diagrams = files
                    .filter(f -> f.toString().endsWith(".puml") || f.toString().endsWith(".png"))
                    .map(f -> {
                        Map<String, String> info = new LinkedHashMap<>();
                        info.put("name", f.getFileName().toString());
                        info.put("type", f.toString().endsWith(".png") ? "png" : "puml");
                        info.put("path", "/api/diagrams/" + scanId + "/" + f.getFileName().toString());
                        return info;
                    })
                    .collect(Collectors.toList());

            return ResponseEntity.ok(diagrams);
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body("Error listing diagrams: " + e.getMessage());
        }
    }

    /**
     * GET /api/diagrams/{scanId}/{filename}.png — Serve a PNG diagram image.
     */
    @GetMapping(value = "/{scanId}/{filename}.png", produces = MediaType.IMAGE_PNG_VALUE)
    public ResponseEntity<Resource> getPngDiagram(@PathVariable String scanId, @PathVariable String filename) {
        if (!isSafePathSegment(scanId) || !isSafePathSegment(filename)) {
            return ResponseEntity.badRequest().build();
        }
        Optional<ScanRun> optScan = scanRunRepository.findById(scanId);
        if (optScan.isEmpty() || !securityUtils.canAccessScan(optScan.get())) {
            return ResponseEntity.status(403).build();
        }
        
        Path pngFile = Paths.get("codechecker-output", scanId, filename + ".png");
        if (!Files.exists(pngFile)) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(new FileSystemResource(pngFile.toFile()));
    }

    /**
     * GET /api/diagrams/{scanId}/{filename}.puml — Serve PUML source text.
     */
    @GetMapping(value = "/{scanId}/{filename}.puml", produces = "text/plain")
    public ResponseEntity<String> getPumlSource(@PathVariable String scanId, @PathVariable String filename) {
        if (!isSafePathSegment(scanId) || !isSafePathSegment(filename)) {
            return ResponseEntity.badRequest().body("Invalid path");
        }
        Optional<ScanRun> optScan = scanRunRepository.findById(scanId);
        if (optScan.isEmpty() || !securityUtils.canAccessScan(optScan.get())) {
            return ResponseEntity.status(403).body("Not authorized to view this scan's diagrams");
        }
        
        Path pumlFile = Paths.get("codechecker-output", scanId, filename + ".puml");
        if (!Files.exists(pumlFile)) {
            return ResponseEntity.notFound().build();
        }
        try {
            return ResponseEntity.ok(Files.readString(pumlFile));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body("Error reading file: " + e.getMessage());
        }
    }
}
