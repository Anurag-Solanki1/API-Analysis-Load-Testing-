package com.codechecker.diagram;

import com.codechecker.model.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.*;
import java.time.LocalDate;
import java.util.*;

/**
 * SlowChainDiagramGenerator
 *
 * For SLOW/CRITICAL endpoints, generates a detailed timing diagram showing:
 *  - Every method hop with individual timing
 *  - N+1 loop markers with estimated total cost
 *  - @Transactional boundary (TX OPEN / TX CLOSE)
 *  - External call timing with timeout status
 *  - Root cause annotation (why the endpoint is slow)
 *  - Suggested fix inline on each slow node
 */
@Service
public class SlowChainDiagramGenerator {

    private static final Logger log = LoggerFactory.getLogger(SlowChainDiagramGenerator.class);

    /**
     * Generate a slow-chain diagram for a SLOW or CRITICAL endpoint.
     */
    public String generate(EndpointInfo endpoint, Path outputDir) throws IOException {
        String slug = DiagramGenerator.toSlug(endpoint.getHttpMethod() + "-" + endpoint.getPath());
        String filename = "codechecker-api-slow-" + slug;
        String date = LocalDate.now().toString();

        StringBuilder puml = new StringBuilder();
        puml.append("@startuml ").append(filename.replace("-", "_")).append("\n");
        puml.append("left to right direction\n");
        puml.append("skinparam defaultFontSize 11\n");
        puml.append("skinparam defaultFontName Arial\n");
        puml.append("skinparam titleFontSize 14\n");
        puml.append("skinparam titleFontStyle bold\n");
        puml.append("skinparam rectangle {\n  RoundCorner 8\n  BorderThickness 2\n}\n\n");

        puml.append("title A2 - SLOW API Analysis\\n")
                .append(endpoint.getHttpMethod()).append(" ").append(endpoint.getPath())
                .append("\\np50: ~").append(endpoint.getEstimatedP50Ms()).append("ms")
                .append(" | p95: ~").append(endpoint.getEstimatedP95Ms()).append("ms")
                .append(" | Rating: ").append(endpoint.getPerformanceRating())
                .append("\\n").append(date).append("\n\n");

        // Root cause summary box
        puml.append("rectangle \" ROOT CAUSE ANALYSIS\\n");
        List<String> rootCauses = identifyRootCauses(endpoint);
        for (String cause : rootCauses) {
            puml.append(" ").append(sanitize(cause)).append("\\n");
        }
        puml.append(" \" as rootcause #FADBD8\n\n");

        // HTTP entry
        puml.append("rectangle \" HTTP Request\\n ").append(endpoint.getHttpMethod())
                .append(" ").append(endpoint.getPath())
                .append("\\n ~10ms routing \" as http #EBF5FB\n\n");

        // Controller
        puml.append("rectangle \" ").append(endpoint.getControllerClass())
                .append(".").append(endpoint.getControllerMethod()).append("()\\n ~5ms binding \" as ctrl #D6EAF8\n\n");

        // Iterate through service calls with detailed timing
        int nodeCount = 0;
        for (int i = 0; i < endpoint.getServiceCalls().size(); i++) {
            ServiceCallInfo svc = endpoint.getServiceCalls().get(i);
            nodeCount += generateServiceNode(puml, svc, "svc" + i, 0);
        }

        // Timing summary
        puml.append("rectangle \" TIMING BREAKDOWN\\n");
        puml.append(" Total p50: ~").append(endpoint.getEstimatedP50Ms()).append("ms\\n");
        puml.append(" Total p95: ~").append(endpoint.getEstimatedP95Ms()).append("ms\\n");
        puml.append(" \" as timebox #FADBD8\n\n");

        // Arrows
        puml.append("http --> ctrl\n");
        for (int i = 0; i < endpoint.getServiceCalls().size(); i++) {
            puml.append("ctrl -[#E74C3C,thickness=2]-> svc").append(i).append("_0\n");
        }
        puml.append("rootcause -[hidden]-> http\n");
        puml.append("timebox -[hidden]-> ctrl\n");

        puml.append("@enduml\n");

        Path file = outputDir.resolve(filename + ".puml");
        Files.writeString(file, puml.toString());
        log.info("Generated slow-chain diagram: {}", file.getFileName());
        return file.toString();
    }

    private int generateServiceNode(StringBuilder puml, ServiceCallInfo svc,
                                     String prefix, int depth) {
        String indent = "  ".repeat(depth);
        String nodeId = prefix + "_" + depth;
        String color = svc.getEstimatedMs() > 100 ? "#FADBD8"
                : svc.getEstimatedMs() > 30 ? "#FDEBD0" : "#D5F5E3";

        // Service method node
        puml.append(indent).append("rectangle \" ").append(sanitize(svc.getClassName()))
                .append(".").append(sanitize(svc.getMethodName())).append("()\\n line ")
                .append(svc.getLineNumber());
        if (svc.isTransactional()) {
            puml.append("\\n TX OPEN — @Transactional");
        }
        if (svc.isAsync()) {
            puml.append("\\n @Async — NON-BLOCKING");
        }
        if (svc.isInsideLoop()) {
            puml.append("\\n IN LOOP — multiplied cost!");
        }
        if (svc.isConditional()) {
            puml.append("\\n When: ").append(sanitize(truncate(svc.getCondition(), 40)));
        }
        puml.append("\\n ~").append(svc.getEstimatedMs()).append("ms");
        puml.append(" \" as ").append(nodeId).append(" ").append(color).append("\n\n");

        int count = 1;

        // Repository calls
        for (int j = 0; j < svc.getRepoCalls().size(); j++) {
            RepositoryCallInfo repo = svc.getRepoCalls().get(j);
            String repoId = nodeId + "_repo" + j;
            String repoColor = repo.isInsideLoop() ? "#E74C3C"
                    : "DANGEROUS".equals(repo.getPerformanceRating()) ? "#E74C3C"
                    : "FAST".equals(repo.getPerformanceRating()) ? "#D5F5E3" : "#FDEBD0";

            puml.append(indent).append("rectangle \" DB: ").append(sanitize(repo.getClassName()))
                    .append(".").append(sanitize(repo.getMethodName())).append("()");
            if (repo.getReconstructedSql() != null) {
                puml.append("\\n SQL: ").append(sanitize(truncate(repo.getReconstructedSql(), 50)));
            }
            if (repo.isInsideLoop()) {
                puml.append("\\n IN LOOP x").append(repo.getEstimatedIterations())
                        .append(" — N+1 PATTERN — ~").append(repo.getEstimatedMs() * repo.getEstimatedIterations()).append("ms TOTAL");
            } else {
                puml.append("\\n ~").append(repo.getEstimatedMs()).append("ms");
            }
            puml.append(" \" as ").append(repoId).append(" ").append(repoColor).append("\n");
            puml.append(indent).append(nodeId).append(" --> ").append(repoId).append("\n\n");
            count++;
        }

        // External calls
        for (int j = 0; j < svc.getExternalCalls().size(); j++) {
            ExternalCallInfo ext = svc.getExternalCalls().get(j);
            String extId = nodeId + "_ext" + j;
            String extColor = ext.isInsideTransaction() ? "#E74C3C" : ext.isHasTimeout() ? "#FDEBD0" : "#FADBD8";

            puml.append(indent).append("cloud \" ").append(ext.getType()).append(": ")
                    .append(ext.getHttpMethod() != null ? ext.getHttpMethod() : "").append(" ")
                    .append(sanitize(truncate(ext.getUrl() != null ? ext.getUrl() : "UNKNOWN", 40)));
            if (ext.isInsideTransaction()) {
                puml.append("\\n IN @TX — connection held!");
            }
            if (!ext.isHasTimeout()) {
                puml.append("\\n NO TIMEOUT — thread could hang");
            }
            puml.append("\\n ~").append(ext.getEstimatedMs()).append("ms");
            puml.append(" \" as ").append(extId).append(" ").append(extColor).append("\n");
            puml.append(indent).append(nodeId).append(" --> ").append(extId).append("\n\n");
            count++;
        }

        // Nested service calls
        for (int k = 0; k < svc.getNestedServiceCalls().size(); k++) {
            String nestedId = prefix + "_n" + k;
            count += generateServiceNode(puml, svc.getNestedServiceCalls().get(k), nestedId, depth + 1);
            puml.append(indent).append(nodeId).append(" --> ").append(nestedId).append("_").append(depth + 1).append("\n");
        }

        return count;
    }

    private List<String> identifyRootCauses(EndpointInfo endpoint) {
        List<String> causes = new ArrayList<>();
        for (IssueInfo issue : endpoint.getIssues()) {
            if ("CRITICAL".equals(issue.getSeverity()) || "HIGH".equals(issue.getSeverity())) {
                causes.add(issue.getRuleId() + ": " + issue.getTitle());
            }
        }
        if (causes.isEmpty()) {
            causes.add("No critical root cause — review all service layer calls");
        }
        return causes;
    }

    private String sanitize(String text) {
        if (text == null) return "UNKNOWN";
        return text.replace("\"", "'").replace("<", "(").replace(">", ")")
                .replace("{", "(").replace("}", ")")
                .replace("[", "(").replace("]", ")")
                .replace("\n", " ").replace("\r", "");
    }

    private String truncate(String text, int max) {
        return text != null && text.length() > max ? text.substring(0, max) + "..." : text;
    }
}
