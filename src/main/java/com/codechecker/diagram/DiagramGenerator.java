package com.codechecker.diagram;

import com.codechecker.model.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.*;
import java.time.LocalDate;
import java.util.List;

/**
 * DiagramGenerator — Agent Component #8
 * 
 * Generates PlantUML .puml files for each endpoint, showing full call chain,
 * conditions, timing, issues, and suggested fixes with proper color coding.
 */
@Service
public class DiagramGenerator {

    private static final Logger log = LoggerFactory.getLogger(DiagramGenerator.class);

    /**
     * Generate a per-endpoint PlantUML diagram.
     * Returns the path to the generated .puml file.
     */
    public String generateApiDiagram(EndpointInfo endpoint, Path outputDir) throws IOException {
        String slug = toSlug(endpoint.getHttpMethod() + "-" + endpoint.getPath());
        String filename = "codechecker-api-" + slug;
        String rating = endpoint.getPerformanceRating() != null ? endpoint.getPerformanceRating() : "UNKNOWN";
        String date = LocalDate.now().toString();

        StringBuilder puml = new StringBuilder();
        puml.append("@startuml ").append(filename.replace("-", "_")).append("\n");
        puml.append("left to right direction\n");
        puml.append("skinparam defaultFontSize 11\n");
        puml.append("skinparam defaultFontName Arial\n");
        puml.append("skinparam titleFontSize 14\n");
        puml.append("skinparam titleFontStyle bold\n");
        puml.append("skinparam rectangle {\n  RoundCorner 8\n  BorderThickness 2\n}\n");
        puml.append("skinparam database {\n  BorderColor #2C3E50\n  BorderThickness 2\n}\n");
        puml.append("skinparam cloud {\n  BorderColor #8E44AD\n  BorderThickness 2\n}\n\n");

        puml.append("title A1 - ").append(endpoint.getHttpMethod()).append(" ").append(endpoint.getPath())
                .append(" - ").append(endpoint.getControllerClass()).append(".").append(endpoint.getControllerMethod()).append("()")
                .append("\\nRated: ").append(rating).append(" - ").append(date).append("\n\n");

        // HTTP Client
        puml.append("rectangle \" HTTP Client \" as client #EBF5FB\n\n");

        // HTTP Request block
        puml.append("rectangle \" HTTP Request\\n ").append(endpoint.getHttpMethod()).append(" ")
                .append(endpoint.getPath())
                .append("\\n Auth: ").append(endpoint.getAuthExpression())
                .append("\\n @Valid: ").append(endpoint.isHasValidation() ? "YES" : "NO")
                .append(" \" as req #EBF5FB\n\n");

        // Controller block
        String ctrlColor = "#D6EAF8";
        puml.append("rectangle \" ").append(endpoint.getControllerClass())
                .append("\\n ").append(endpoint.getControllerMethod()).append("() line ").append(endpoint.getControllerLine())
                .append("\\n Framework: ").append(endpoint.getFramework())
                .append("\\n Issues: ").append(endpoint.getIssues().isEmpty() ? "NONE" : endpoint.getIssues().size())
                .append(" \" as ctrl ").append(ctrlColor).append("\n\n");

        // Service blocks
        int svcIdx = 1;
        for (ServiceCallInfo svc : endpoint.getServiceCalls()) {
            String svcColor = hasCriticalIssue(svc, endpoint) ? "#FADBD8" : "#D5F5E3";
            puml.append("rectangle \" ").append(sanitize(svc.getClassName()))
                    .append("\\n ").append(sanitize(svc.getMethodName())).append("() line ").append(svc.getLineNumber());
            if (svc.isTransactional()) {
                puml.append("\\n @Transactional");
            }
            if (svc.isAsync()) {
                puml.append("\\n @Async — non-blocking");
            }
            if (svc.isConditional()) {
                puml.append("\\n Called when: ").append(sanitize(svc.getCondition()));
            }
            puml.append(" \" as svc").append(svcIdx).append(" ").append(svcColor).append("\n\n");
            svcIdx++;
        }

        // Repository blocks
        int repoIdx = 1;
        for (ServiceCallInfo svc : endpoint.getServiceCalls()) {
            for (RepositoryCallInfo repo : svc.getRepoCalls()) {
                String repoColor = "FAST".equals(repo.getPerformanceRating()) ? "#D5F5E3"
                        : "CRITICAL".equals(repo.getPerformanceRating()) || "DANGEROUS".equals(repo.getPerformanceRating()) ? "#E74C3C"
                        : "#FFF8E1";
                puml.append("rectangle \" ").append(sanitize(repo.getClassName()))
                        .append("\\n ").append(sanitize(repo.getMethodName())).append("()");
                if (repo.getQueryType() != null) {
                    puml.append("\\n Query: ").append(repo.getQueryType());
                }
                if (repo.getReconstructedSql() != null) {
                    puml.append("\\n SQL: ").append(sanitize(truncate(repo.getReconstructedSql(), 60)));
                }
                if (repo.isInsideLoop()) {
                    puml.append("\\n IN LOOP — N+1 risk");
                }
                puml.append(" \" as repo").append(repoIdx).append(" ").append(repoColor).append("\n\n");
                repoIdx++;
            }
        }

        // Database
        puml.append("database \" Database \" as db #D6EAF8\n\n");

        // External call blocks
        int extIdx = 1;
        for (ExternalCallInfo ext : endpoint.getExternalCalls()) {
            String extColor = ext.isHasTimeout() ? "#FDEBD0" : "#E74C3C";
            puml.append("cloud \" ").append(ext.getType()).append(" Call")
                    .append("\\n ").append(ext.getHttpMethod() != null ? ext.getHttpMethod() : "").append(" ").append(ext.getUrl() != null ? sanitize(ext.getUrl()) : "UNKNOWN")
                    .append("\\n Timeout: ").append(ext.isHasTimeout() ? ext.getReadTimeoutMs() + "ms" : "NOT SET")
                    .append("\\n Async: ").append(ext.isAsync() ? "YES" : "SYNCHRONOUS")
                    .append("\\n In @Tx: ").append(ext.isInsideTransaction() ? "YES" : "NO")
                    .append(" \" as ext").append(extIdx).append(" ").append(extColor).append("\n\n");
            extIdx++;
        }

        // Response block
        puml.append("rectangle \" Response\\n 200 OK \" as resp #E8F8E8\n\n");

        // Issues block
        if (!endpoint.getIssues().isEmpty()) {
            puml.append("rectangle \" Issues on ").append(endpoint.getHttpMethod()).append(" ").append(endpoint.getPath()).append("\\n");
            for (IssueInfo issue : endpoint.getIssues()) {
                puml.append(" ").append(issue.getRuleId()).append(" ").append(issue.getSeverity())
                        .append(": ").append(sanitize(truncate(issue.getTitle(), 50))).append("\\n");
            }
            puml.append(" \" as issues #FEF9E7\n\n");
        }

        // Rating block (no estimated timing — only measured data from load tests is meaningful)
        String timingColor = "FAST".equals(rating) ? "#D5F5E3" : "SLOW".equals(rating) || "CRITICAL".equals(rating) ? "#FADBD8" : "#FDEBD0";
        puml.append("rectangle \" Performance - ").append(endpoint.getHttpMethod()).append(" ").append(endpoint.getPath())
                .append("\\n Rating: ").append(rating)
                .append("\\n Measured data available from APM load test")
                .append(" \" as timing ").append(timingColor).append("\n\n");

        // Arrows
        puml.append("client -[#2196F3,thickness=2]-> req\n");
        puml.append("req -[#2196F3,thickness=2]-> ctrl : ").append(endpoint.getHttpMethod()).append(" ").append(endpoint.getPath()).append("\n");

        svcIdx = 1;
        for (ServiceCallInfo svc : endpoint.getServiceCalls()) {
            String arrowColor = hasCriticalIssue(svc, endpoint) ? "#E74C3C" : "#27AE60";
            puml.append("ctrl -[").append(arrowColor).append(",thickness=2]-> svc").append(svcIdx)
                    .append(" : ").append(sanitize(svc.getMethodName())).append("()\n");
            svcIdx++;
        }

        repoIdx = 1;
        svcIdx = 1;
        for (ServiceCallInfo svc : endpoint.getServiceCalls()) {
            for (RepositoryCallInfo repo : svc.getRepoCalls()) {
                String arrowColor = repo.isInsideLoop() ? "#E74C3C" : "#8B4513";
                puml.append("svc").append(svcIdx).append(" -[").append(arrowColor)
                        .append(",thickness=2]-> repo").append(repoIdx).append("\n");
                puml.append("repo").append(repoIdx).append(" -[#8B4513,thickness=2]-> db\n");
                repoIdx++;
            }
            svcIdx++;
        }

        extIdx = 1;
        for (ExternalCallInfo ext : endpoint.getExternalCalls()) {
            String arrowColor = ext.isHasTimeout() ? "#27AE60" : "#E74C3C";
            String arrowStyle = arrowColor + ",dashed,thickness=2";
            puml.append("ctrl -[").append(arrowStyle).append("]-> ext").append(extIdx).append("\n");
            extIdx++;
        }

        puml.append("ctrl -[#27AE60,thickness=2]-> resp\n");
        puml.append("resp -[#2196F3,thickness=2]-> client\n");
        puml.append("timing --> resp\n");

        if (!endpoint.getIssues().isEmpty()) {
            puml.append("issues --> ctrl\n");
        }

        puml.append("@enduml\n");

        // Write file
        Path pumlFile = outputDir.resolve(filename + ".puml");
        Files.writeString(pumlFile, puml.toString());
        log.info("Generated diagram: {}", pumlFile.getFileName());

        return pumlFile.toString();
    }

    /**
     * Generate a project-wide API connectivity map.
     */
    public String generateConnectivityDiagram(List<EndpointInfo> endpoints, Path outputDir,
                                               String projectName) throws IOException {
        StringBuilder puml = new StringBuilder();
        puml.append("@startuml codechecker_api_connectivity\n");
        puml.append("top to bottom direction\n");
        puml.append("skinparam defaultFontSize 11\n");
        puml.append("skinparam defaultFontName Arial\n");
        puml.append("skinparam titleFontSize 14\n");
        puml.append("skinparam titleFontStyle bold\n");
        puml.append("skinparam rectangle {\n  RoundCorner 8\n  BorderThickness 2\n}\n");
        puml.append("skinparam package {\n  BorderThickness 2\n  RoundCorner 6\n}\n\n");

        puml.append("title A1 - Full API Connectivity Map - ").append(projectName)
                .append("\\nAll ").append(endpoints.size()).append(" endpoints - ").append(LocalDate.now()).append("\n\n");

        // Group endpoints
        puml.append("package \"REST Endpoints [").append(endpoints.size()).append("]\" #EBF5FB {\n");
        int epIdx = 1;
        for (EndpointInfo ep : endpoints) {
            String color = ratingColor(ep.getPerformanceRating());
            puml.append("  rectangle \" ").append(ep.getHttpMethod()).append(" ").append(ep.getPath())
                    .append("\\n ~").append(ep.getEstimatedP50Ms()).append("ms | ").append(ep.getPerformanceRating())
                    .append(" \" as ep").append(epIdx).append(" ").append(color).append("\n");
            epIdx++;
        }
        puml.append("}\n\n");

        puml.append("@enduml\n");

        Path file = outputDir.resolve("codechecker-api-connectivity.puml");
        Files.writeString(file, puml.toString());
        return file.toString();
    }

    // ─── Utility Methods ───

    private boolean hasCriticalIssue(ServiceCallInfo svc, EndpointInfo endpoint) {
        return endpoint.getIssues().stream()
                .anyMatch(i -> "CRITICAL".equals(i.getSeverity())
                        && i.getAffectedEndpoint() != null
                        && i.getAffectedEndpoint().contains(endpoint.getPath()));
    }

    private String ratingColor(String rating) {
        if (rating == null) return "#D6EAF8";
        return switch (rating) {
            case "FAST" -> "#D5F5E3";
            case "MODERATE" -> "#FDEBD0";
            case "SLOW" -> "#FADBD8";
            case "CRITICAL" -> "#E74C3C";
            default -> "#D6EAF8";
        };
    }

    private String sanitize(String text) {
        if (text == null) return "UNKNOWN";
        return text.replace("\"", "'")
                .replace("<", "(")
                .replace(">", ")")
                .replace("{", "(")
                .replace("}", ")")
                .replace("[", "(")
                .replace("]", ")")
                .replace("\n", " ")
                .replace("\r", "");
    }

    private String truncate(String text, int maxLen) {
        if (text == null) return "";
        return text.length() > maxLen ? text.substring(0, maxLen) + "..." : text;
    }

    public static String toSlug(String input) {
        return input.toLowerCase()
                .replaceAll("[{}]", "")
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-|-$", "");
    }
}
