package com.codechecker.service;

import com.codechecker.analyzer.CodeQualityAnalyzer;
import com.codechecker.analyzer.DbQueryAnalyzer;
import com.codechecker.analyzer.SlownessAnalyzer;
import com.codechecker.diagram.DiagramGenerator;
import com.codechecker.diagram.DbQueryDiagramGenerator;
import com.codechecker.diagram.PlantUmlRenderer;
import com.codechecker.diagram.SlowChainDiagramGenerator;
import com.codechecker.entity.*;
import com.codechecker.model.*;
import com.codechecker.parser.ControllerParser;
import com.codechecker.parser.ExternalCallParser;
import com.codechecker.parser.RepositoryParser;
import com.codechecker.parser.ServiceParser;
import com.codechecker.parser.StrutsXmlParser;
import com.codechecker.parser.WsdlParser;
import com.codechecker.report.CsvReportGenerator;
import com.codechecker.report.HtmlReportGenerator;
import com.codechecker.report.MarkdownReportGenerator;
import com.codechecker.repository.ScanRunRepository;
import com.codechecker.scanner.ProjectScanner;
import com.codechecker.websocket.ScanProgressPublisher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * ScanOrchestrator — THE CORE of CodeChecker.
 * 
 * Coordinates all agent phases in sequence:
 * 1. ProjectScanner → find .java files
 * 2. ControllerParser → extract endpoints via AST
 * 3. SlownessAnalyzer → apply A2 rules, estimate timing
 * 4. DbQueryAnalyzer → apply A3 rules, rate queries
 * 5. DiagramGenerator → build .puml per endpoint
 * 6. PlantUmlRenderer → render .puml → .png
 * 7. Save results to DB
 * 
 * Runs asynchronously on a background thread. Publishes progress via WebSocket
 * at each step so the frontend can show live progress.
 */
@Service
public class ScanOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(ScanOrchestrator.class);

    @Autowired
    private ProjectScanner projectScanner;
    @Autowired
    private ControllerParser controllerParser;
    @Autowired
    private ServiceParser serviceParser;
    @Autowired
    private RepositoryParser repositoryParser;
    @Autowired
    private ExternalCallParser externalCallParser;
    @Autowired
    private SlownessAnalyzer slownessAnalyzer;
    @Autowired
    private DbQueryAnalyzer dbQueryAnalyzer;
    @Autowired
    private CodeQualityAnalyzer codeQualityAnalyzer;
    @Autowired
    private DiagramGenerator diagramGenerator;
    @Autowired
    private SlowChainDiagramGenerator slowChainDiagramGenerator;
    @Autowired
    private DbQueryDiagramGenerator dbQueryDiagramGenerator;
    @Autowired
    private PlantUmlRenderer plantUmlRenderer;
    @Autowired
    private ScanProgressPublisher progressPublisher;
    @Autowired
    private ScanRunRepository scanRunRepository;
    @Autowired
    private MarkdownReportGenerator markdownReportGenerator;
    @Autowired
    private CsvReportGenerator csvReportGenerator;
    @Autowired
    private HtmlReportGenerator htmlReportGenerator;
    @Autowired
    private StrutsXmlParser strutsXmlParser;
    @Autowired
    private WsdlParser wsdlParser;

    // Track running scans for cancellation
    private final Map<String, Boolean> runningScanFlags = new ConcurrentHashMap<>();

    /**
     * Run a complete scan asynchronously.
     * Returns immediately with the scanId; frontend watches WebSocket for progress.
     */
    @Async("scanExecutor")
    public CompletableFuture<ScanResult> runScan(ScanRequest request, String scanId, UserEntity currentUser) {
        log.info("Starting scan {} for project: {}", scanId, request.getProjectPath());
        runningScanFlags.put(scanId, true);

        // Create scan run record
        ScanRun scanRun = new ScanRun();
        scanRun.setId(scanId);
        scanRun.setProjectName(request.getProjectName());
        scanRun.setProjectPath(request.getProjectPath());
        scanRun.setOutputPath(request.getOutputPath());
        scanRun.setStatus(ScanStatus.RUNNING);
        scanRun.setStartedAt(Instant.now());
        scanRun.setScanMode(request.getScanMode());
        scanRun.setUser(currentUser);
        scanRunRepository.save(scanRun);

        try {
            // ═══ STEP 1: Find all Java files ═══
            progressPublisher.publish(scanId, "PHASE_START", "Scanning project files...", 5);
            List<Path> javaFiles = projectScanner.findJavaFiles(request.getProjectPath());
            checkCancelled(scanId);

            Map<String, List<Path>> categorized = projectScanner.categorize(javaFiles);
            progressPublisher.publish(scanId, "FILES_FOUND",
                    "Found " + javaFiles.size() + " Java files", 10);

            // ═══ STEP 2: Parse Controllers → Extract Endpoints ═══
            progressPublisher.publish(scanId, "PHASE_START", "Parsing controllers...", 15);
            List<EndpointInfo> endpoints = new ArrayList<>();
            List<Path> controllers = categorized.getOrDefault("controllers", List.of());
            List<Path> soapEndpoints = categorized.getOrDefault("soapEndpoints", List.of());
            List<Path> allControllers = new ArrayList<>(controllers);
            allControllers.addAll(soapEndpoints);

            for (Path file : allControllers) {
                checkCancelled(scanId);
                List<EndpointInfo> parsed = controllerParser.parse(file);
                endpoints.addAll(parsed);
                progressPublisher.publish(scanId, "FILE_PARSED",
                        "Parsed: " + file.getFileName() + " — " + parsed.size() + " endpoints", 15);
            }
            // ═══ STEP 2a: Parse Struts XML configs & WSDL files ═══
            checkCancelled(scanId);
            progressPublisher.publish(scanId, "PHASE_START", "Scanning Struts XML & WSDL configs...", 20);
            List<EndpointInfo> strutsXmlEndpoints = strutsXmlParser.parseProject(request.getProjectPath());
            List<EndpointInfo> wsdlEndpoints = wsdlParser.parseProject(request.getProjectPath());
            // Merge XML-discovered endpoints, avoiding duplicates by path
            Set<String> existingPaths = new HashSet<>();
            endpoints.forEach(ep -> existingPaths.add(ep.getHttpMethod() + ":" + ep.getPath()));
            for (EndpointInfo xmlEp : strutsXmlEndpoints) {
                if (existingPaths.add(xmlEp.getHttpMethod() + ":" + xmlEp.getPath())) {
                    endpoints.add(xmlEp);
                }
            }
            for (EndpointInfo wsdlEp : wsdlEndpoints) {
                if (existingPaths.add(wsdlEp.getHttpMethod() + ":" + wsdlEp.getPath())) {
                    endpoints.add(wsdlEp);
                }
            }
            if (!strutsXmlEndpoints.isEmpty() || !wsdlEndpoints.isEmpty()) {
                progressPublisher.publish(scanId, "FILE_PARSED",
                        "XML configs: " + strutsXmlEndpoints.size() + " Struts + "
                                + wsdlEndpoints.size() + " WSDL endpoints",
                        22);
            }

            progressPublisher.publish(scanId, "PHASE_DONE",
                    "Found " + endpoints.size() + " endpoints", 25);

            // ═══ STEP 2b: Parse Repositories → Extract SQL ═══
            progressPublisher.publish(scanId, "PHASE_START", "Parsing repository queries...", 27);
            Map<String, Map<String, RepositoryCallInfo>> parsedRepos = new LinkedHashMap<>();
            List<Path> repoFiles = categorized.getOrDefault("repositories", List.of());
            for (Path file : repoFiles) {
                checkCancelled(scanId);
                Map<String, RepositoryCallInfo> methods = repositoryParser.parse(file);
                String repoName = file.getFileName().toString().replace(".java", "");
                parsedRepos.put(repoName, methods);
                progressPublisher.publish(scanId, "FILE_PARSED",
                        "Parsed repo: " + file.getFileName() + " — " + methods.size() + " queries", 28);
            }

            // ═══ STEP 3: Trace Call Chains (Service → Repo → External) ═══
            progressPublisher.publish(scanId, "PHASE_START", "Tracing call chains...", 30);
            List<Path> serviceFiles = categorized.getOrDefault("services", List.of());
            for (EndpointInfo endpoint : endpoints) {
                checkCancelled(scanId);
                serviceParser.traceChain(endpoint, serviceFiles, repoFiles, javaFiles);
                // Enrich repo calls with parsed SQL data
                for (ServiceCallInfo svc : endpoint.getServiceCalls()) {
                    for (RepositoryCallInfo repo : svc.getRepoCalls()) {
                        repositoryParser.enrichFromParsedRepos(repo, parsedRepos);
                    }
                }
                progressPublisher.publish(scanId, "CHAIN_TRACED",
                        "Traced chain for " + endpoint.getHttpMethod() + " " + endpoint.getPath(), 35);
            }
            progressPublisher.publish(scanId, "PHASE_DONE", "Call chains traced", 40);

            // ═══ STEP 4: Run D1-D11 Code Quality Analyzer ═══
            progressPublisher.publish(scanId, "PHASE_START", "Running code quality analysis (D1-D11)...", 42);
            List<IssueInfo> codeQualityIssues = new ArrayList<>();
            for (Path file : javaFiles) {
                checkCancelled(scanId);
                List<IssueInfo> fileIssues = codeQualityAnalyzer.analyze(file);
                codeQualityIssues.addAll(fileIssues);
            }
            progressPublisher.publish(scanId, "PHASE_DONE",
                    "Code quality: " + codeQualityIssues.size() + " issues found", 50);

            // ═══ STEP 5: Run Slowness Analyzer (A2 rules) ═══
            progressPublisher.publish(scanId, "PHASE_START", "Running slowness analysis (A2)...", 52);
            for (EndpointInfo endpoint : endpoints) {
                checkCancelled(scanId);
                slownessAnalyzer.analyze(endpoint);
            }
            progressPublisher.publish(scanId, "PHASE_DONE", "Slowness analysis complete", 58);

            // ═══ STEP 6: Run DB Query Analyzer (A3 rules) ═══
            progressPublisher.publish(scanId, "PHASE_START", "Running DB query analysis (A3)...", 60);
            for (EndpointInfo endpoint : endpoints) {
                checkCancelled(scanId);
                dbQueryAnalyzer.analyze(endpoint);
            }
            progressPublisher.publish(scanId, "PHASE_DONE", "DB analysis complete", 65);

            // ═══ STEP 7: Generate Diagrams ═══
            progressPublisher.publish(scanId, "PHASE_START", "Generating diagrams...", 68);
            Path outputDir = Paths.get(
                    request.getOutputPath() != null ? request.getOutputPath() : "codechecker-output",
                    scanId);
            Files.createDirectories(outputDir);

            int diagramCount = 0;
            // Per-endpoint API diagrams
            for (EndpointInfo endpoint : endpoints) {
                checkCancelled(scanId);
                try {
                    String pumlPath = diagramGenerator.generateApiDiagram(endpoint, outputDir);
                    endpoint.setDiagramPath(pumlPath);
                    diagramCount++;
                    progressPublisher.publish(scanId, "DIAGRAM_DONE",
                            "Generated diagram for " + endpoint.getHttpMethod() + " " + endpoint.getPath(), 72);
                } catch (Exception e) {
                    log.error("Failed to generate diagram for {} {}", endpoint.getHttpMethod(), endpoint.getPath(), e);
                }
            }

            // Slow-chain diagrams for SLOW/CRITICAL endpoints
            for (EndpointInfo endpoint : endpoints) {
                if ("SLOW".equals(endpoint.getPerformanceRating())
                        || "CRITICAL".equals(endpoint.getPerformanceRating())) {
                    try {
                        slowChainDiagramGenerator.generate(endpoint, outputDir);
                        diagramCount++;
                    } catch (Exception e) {
                        log.error("Failed to generate slow chain for {} {}",
                                endpoint.getHttpMethod(), endpoint.getPath(), e);
                    }
                }
            }

            // DB query per-repository diagrams
            for (Map.Entry<String, Map<String, RepositoryCallInfo>> entry : parsedRepos.entrySet()) {
                try {
                    List<RepositoryCallInfo> queries = new ArrayList<>(entry.getValue().values());
                    List<EndpointInfo> callingApis = findEndpointsCallingRepo(entry.getKey(), endpoints);
                    dbQueryDiagramGenerator.generateRepoQueryMap(entry.getKey(), queries, callingApis, outputDir);
                    diagramCount++;
                } catch (Exception e) {
                    log.error("Failed to generate DB diagram for {}", entry.getKey(), e);
                }
            }

            // Project-wide DB query summary
            try {
                Map<String, List<RepositoryCallInfo>> allRepoQueries = new LinkedHashMap<>();
                parsedRepos.forEach((name, methods) -> allRepoQueries.put(name, new ArrayList<>(methods.values())));
                dbQueryDiagramGenerator.generateQuerySummary(allRepoQueries, outputDir,
                        request.getProjectName() != null ? request.getProjectName() : "Project");
                diagramCount++;
            } catch (Exception e) {
                log.error("Failed to generate DB query summary", e);
            }

            // Connectivity diagram
            try {
                diagramGenerator.generateConnectivityDiagram(endpoints, outputDir,
                        request.getProjectName() != null ? request.getProjectName() : "Project");
                diagramCount++;
            } catch (Exception e) {
                log.error("Failed to generate connectivity diagram", e);
            }

            progressPublisher.publish(scanId, "PHASE_DONE",
                    diagramCount + " diagrams generated", 82);

            // ═══ STEP 8: Render PNG files ═══
            progressPublisher.publish(scanId, "PHASE_START", "Rendering PNG images...", 84);
            try (var pumlFiles = Files.walk(outputDir)) {
                pumlFiles.filter(f -> f.toString().endsWith(".puml")).forEach(pumlFile -> {
                    plantUmlRenderer.renderPumlFile(pumlFile);
                });
            }
            progressPublisher.publish(scanId, "PHASE_DONE", "PNG rendering complete", 90);

            // ═══ STEP 9: Generate Reports ═══
            progressPublisher.publish(scanId, "PHASE_START", "Generating reports...", 92);

            // Collect all issues (from endpoints + code quality)
            List<IssueInfo> allIssues = endpoints.stream()
                    .flatMap(ep -> ep.getIssues().stream())
                    .collect(Collectors.toList());
            allIssues.addAll(codeQualityIssues);

            int healthScore = calculateHealthScore(allIssues);
            String grade = calculateGrade(healthScore);
            String releaseDecision = calculateReleaseDecision(healthScore, allIssues);

            // Build result
            ScanResult result = new ScanResult();
            result.setScanId(scanId);
            result.setProjectName(request.getProjectName());
            result.setProjectPath(request.getProjectPath());
            result.setTotalEndpoints(endpoints.size());
            result.setDiagramsGenerated(diagramCount);
            result.setAllEndpoints(endpoints);
            result.setAllIssues(allIssues);
            result.setOutputPath(outputDir.toString());
            result.setHealthScore(healthScore);
            result.setGrade(grade);
            result.setReleaseDecision(releaseDecision);
            result.setTotalFiles(javaFiles.size());
            result.setCriticalCount((int) allIssues.stream().filter(i -> "CRITICAL".equals(i.getSeverity())).count());
            result.setHighCount((int) allIssues.stream().filter(i -> "HIGH".equals(i.getSeverity())).count());
            result.setMediumCount((int) allIssues.stream().filter(i -> "MEDIUM".equals(i.getSeverity())).count());
            result.setLowCount((int) allIssues.stream().filter(i -> "LOW".equals(i.getSeverity())).count());

            // Persist to DB
            scanRun.setStatus(ScanStatus.COMPLETE);
            scanRun.setCompletedAt(Instant.now());
            scanRun.setHealthScore(healthScore);
            scanRun.setGrade(grade);
            scanRun.setReleaseDecision(releaseDecision);
            scanRun.setTotalEndpoints(endpoints.size());
            scanRun.setTotalIssues(allIssues.size());
            scanRun.setCriticalCount(result.getCriticalCount());
            scanRun.setTotalFiles(javaFiles.size());
            scanRun.setDiagramsGenerated(diagramCount);

            // Compute framework summary (JSON map: framework → count)
            Map<String, Long> fwCounts = endpoints.stream()
                    .collect(Collectors.groupingBy(
                            ep -> ep.getFramework() != null ? ep.getFramework() : "UNKNOWN",
                            Collectors.counting()));
            try {
                scanRun.setFrameworkSummary(
                        new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(fwCounts));
            } catch (Exception e) {
                log.warn("Failed to serialize framework summary", e);
            }

            // Persist endpoint results
            for (EndpointInfo ep : endpoints) {
                EndpointResultEntity entity = new EndpointResultEntity();
                entity.setScanRun(scanRun);
                entity.setHttpMethod(ep.getHttpMethod());
                entity.setPath(ep.getPath());
                entity.setControllerClass(ep.getControllerClass());
                entity.setControllerMethod(ep.getControllerMethod());
                entity.setPerformanceRating(ep.getPerformanceRating());
                entity.setEstimatedP50Ms(ep.getEstimatedP50Ms());
                entity.setEstimatedP95Ms(ep.getEstimatedP95Ms());
                entity.setDiagramPath(ep.getDiagramPath());
                entity.setIssueCount(ep.getIssues().size());
                entity.setFramework(ep.getFramework());
                scanRun.getEndpoints().add(entity);
            }

            // Persist issue results
            for (IssueInfo issue : allIssues) {
                IssueResultEntity entity = new IssueResultEntity();
                entity.setScanRun(scanRun);
                entity.setRuleId(issue.getRuleId());
                entity.setSeverity(issue.getSeverity());
                entity.setTitle(issue.getTitle());
                entity.setDescription(issue.getDescription());
                entity.setFile(issue.getFile());
                entity.setLineNumber(issue.getLineNumber());
                entity.setBeforeCode(issue.getBeforeCode());
                entity.setAfterCode(issue.getAfterCode());
                entity.setAutoFixed(issue.isAutoFixed());
                entity.setAffectedEndpoint(issue.getAffectedEndpoint());
                entity.setCategory(issue.getCategory());
                scanRun.getIssues().add(entity);
            }

            scanRunRepository.save(scanRun);

            // Generate reports
            try {
                markdownReportGenerator.generateSummary(result, outputDir);
                progressPublisher.publish(scanId, "REPORT_DONE", "Generated codechecker-summary.md", 94);
            } catch (Exception e) {
                log.error("Failed to generate markdown report", e);
            }
            try {
                csvReportGenerator.generateReportCsv(result, outputDir);
                csvReportGenerator.generateFixesCsv(result, outputDir);
                progressPublisher.publish(scanId, "REPORT_DONE", "Generated CSV reports", 96);
            } catch (Exception e) {
                log.error("Failed to generate CSV reports", e);
            }
            try {
                htmlReportGenerator.generateReport(result, outputDir);
                progressPublisher.publish(scanId, "REPORT_DONE", "Generated HTML report", 98);
            } catch (Exception e) {
                log.error("Failed to generate HTML report", e);
            }

            progressPublisher.publish(scanId, "SCAN_COMPLETE",
                    "Scan complete! Score: " + healthScore + "/100 (" + grade + ") — "
                            + endpoints.size() + " endpoints, " + allIssues.size() + " issues, "
                            + diagramCount + " diagrams",
                    100);

            runningScanFlags.remove(scanId);
            return CompletableFuture.completedFuture(result);

        } catch (ScanCancelledException e) {
            log.info("Scan {} was cancelled", scanId);
            scanRun.setStatus(ScanStatus.STOPPED);
            scanRun.setCompletedAt(Instant.now());
            scanRunRepository.save(scanRun);
            progressPublisher.publish(scanId, "SCAN_STOPPED", "Scan was cancelled", -1);
            runningScanFlags.remove(scanId);
            return CompletableFuture.completedFuture(null);

        } catch (Exception e) {
            log.error("Scan {} failed", scanId, e);
            scanRun.setStatus(ScanStatus.FAILED);
            scanRun.setCompletedAt(Instant.now());
            scanRunRepository.save(scanRun);
            progressPublisher.publish(scanId, "SCAN_FAILED", "Scan failed: " + e.getMessage(), -1);
            runningScanFlags.remove(scanId);
            throw new RuntimeException("Scan failed", e);
        }
    }

    /**
     * Stop a running scan.
     */
    public void stopScan(String scanId) {
        runningScanFlags.put(scanId, false);
    }

    private void checkCancelled(String scanId) {
        Boolean running = runningScanFlags.get(scanId);
        if (running != null && !running) {
            throw new ScanCancelledException();
        }
    }

    private int calculateHealthScore(List<IssueInfo> issues) {
        double totalDeduction = 0;
        for (IssueInfo issue : issues) {
            totalDeduction += issue.getDeductionPoints();
        }
        // Use an exponential curve so score drops gracefully but rarely hits 0
        int score = (int) Math.round(100 * Math.exp(-totalDeduction / 250.0));
        return Math.max(0, Math.min(100, score));
    }

    private String calculateGrade(int score) {
        if (score >= 90)
            return "A";
        if (score >= 75)
            return "B";
        if (score >= 60)
            return "C";
        if (score >= 40)
            return "D";
        return "F";
    }

    private String calculateReleaseDecision(int score, List<IssueInfo> issues) {
        boolean hasCritical = issues.stream()
                .anyMatch(i -> "CRITICAL".equals(i.getSeverity()) || "DANGEROUS".equals(i.getSeverity()));

        if (hasCritical)
            return "BLOCKED — critical issues must be resolved";
        if (score >= 90)
            return "APPROVED";
        if (score >= 75)
            return "APPROVED — minor follow-ups recommended";
        if (score >= 60)
            return "APPROVED WITH CONDITIONS — fix plan required";
        if (score >= 40)
            return "HOLD — significant risks";
        return "BLOCKED — must not release";
    }

    private List<EndpointInfo> findEndpointsCallingRepo(String repoName, List<EndpointInfo> endpoints) {
        List<EndpointInfo> result = new ArrayList<>();
        for (EndpointInfo ep : endpoints) {
            for (ServiceCallInfo svc : ep.getServiceCalls()) {
                boolean callsRepo = svc.getRepoCalls().stream()
                        .anyMatch(r -> r.getClassName() != null && r.getClassName().contains(repoName));
                if (callsRepo) {
                    result.add(ep);
                    break;
                }
            }
        }
        return result;
    }

    private static class ScanCancelledException extends RuntimeException {
        ScanCancelledException() {
            super("Scan cancelled");
        }
    }
}
