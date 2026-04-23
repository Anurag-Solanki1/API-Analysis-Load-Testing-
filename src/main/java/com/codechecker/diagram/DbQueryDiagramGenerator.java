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
 * DbQueryDiagramGenerator
 *
 * For each repository class, generates a diagram showing:
 *  - All query methods with reconstructed SQL
 *  - Query rating (FAST/MODERATE/SLOW/CRITICAL/DANGEROUS)
 *  - Index status (HAS INDEX / MISSING INDEX)
 *  - Pagination status
 *  - Which API endpoints call each query
 *  - N+1 loop markers
 */
@Service
public class DbQueryDiagramGenerator {

    private static final Logger log = LoggerFactory.getLogger(DbQueryDiagramGenerator.class);

    /**
     * Generate a per-repository query map diagram.
     */
    public String generateRepoQueryMap(String repoClassName, List<RepositoryCallInfo> queries,
                                        List<EndpointInfo> callingEndpoints, Path outputDir) throws IOException {
        String filename = "codechecker-db-class-" + repoClassName;
        String date = LocalDate.now().toString();

        StringBuilder puml = new StringBuilder();
        puml.append("@startuml ").append(filename.replace("-", "_")).append("\n");
        puml.append("top to bottom direction\n");
        puml.append("skinparam defaultFontSize 11\n");
        puml.append("skinparam defaultFontName Arial\n");
        puml.append("skinparam titleFontSize 14\n");
        puml.append("skinparam titleFontStyle bold\n");
        puml.append("skinparam rectangle {\n  RoundCorner 8\n  BorderThickness 2\n}\n\n");

        puml.append("title A3 - DB Query Map - ").append(repoClassName)
                .append("\\n").append(queries.size()).append(" queries analyzed - ").append(date).append("\n\n");

        // Repository overview
        long criticalCount = queries.stream()
                .filter(q -> "CRITICAL".equals(q.getPerformanceRating()) || "DANGEROUS".equals(q.getPerformanceRating()))
                .count();
        long slowCount = queries.stream().filter(q -> "SLOW".equals(q.getPerformanceRating())).count();
        long missingIndexCount = queries.stream().filter(q -> !q.isHasIndex()).count();
        long n1Count = queries.stream().filter(RepositoryCallInfo::isInsideLoop).count();
        long injectCount = queries.stream().filter(RepositoryCallInfo::isHasSqlInjection).count();

        puml.append("rectangle \" ").append(repoClassName)
                .append("\\n Queries: ").append(queries.size())
                .append("\\n Critical/Dangerous: ").append(criticalCount)
                .append("\\n Slow: ").append(slowCount)
                .append("\\n Missing Index: ").append(missingIndexCount)
                .append("\\n N+1 Risk: ").append(n1Count)
                .append(injectCount > 0 ? "\\n SQL INJECTION: " + injectCount : "")
                .append("\\n Table: ").append(queries.isEmpty() ? "UNKNOWN" : queries.get(0).getTableName())
                .append(" \" as overview #D6EAF8\n\n");

        // Query method blocks
        for (int i = 0; i < queries.size(); i++) {
            RepositoryCallInfo q = queries.get(i);
            String color = ratingColor(q.getPerformanceRating());
            String queryId = "q" + i;

            puml.append("rectangle \" ").append(sanitize(q.getMethodName())).append("() line ")
                    .append(q.getLineNumber())
                    .append("\\n Type: ").append(q.getQueryType());

            if (q.getReconstructedSql() != null) {
                puml.append("\\n SQL: ").append(sanitize(truncate(q.getReconstructedSql(), 60)));
            }

            puml.append("\\n Rating: ").append(q.getPerformanceRating());

            // Index analysis
            if (!q.isHasIndex()) {
                puml.append("\\n INDEX: MISSING — add @Index on filter column");
            } else {
                puml.append("\\n INDEX: present");
            }

            // Pagination
            if (!q.isHasPagination() && "SELECT".equalsIgnoreCase(q.getQueryType())) {
                puml.append("\\n PAGINATION: none — may return full table");
            } else if (q.isHasPagination()) {
                puml.append("\\n PAGINATION: yes");
            }

            // Full entity load warning
            if (q.isSelectStar()) {
                puml.append("\\n FULL ENTITY LOAD (SELECT *)");
            }

            // SQL injection
            if (q.isHasSqlInjection()) {
                puml.append("\\n SQL INJECTION: string concatenation detected");
            }

            // N+1 loop risk
            if (q.isInsideLoop()) {
                puml.append("\\n N+1: called inside loop — use batch query");
            }

            // Tag write operations (transaction must be checked at service layer)
            if ("INSERT".equalsIgnoreCase(q.getQueryType())
                    || "UPDATE".equalsIgnoreCase(q.getQueryType())
                    || "DELETE".equalsIgnoreCase(q.getQueryType())) {
                puml.append("\\n WRITE OP: verify @Transactional at service layer");
            }

            puml.append(" \" as ").append(queryId).append(" ").append(color).append("\n\n");

            // Link from overview
            puml.append("overview --> ").append(queryId).append("\n");
        }

        // Database node
        puml.append("\ndatabase \" Database\\n Table: ")
                .append(queries.isEmpty() ? "UNKNOWN" : queries.get(0).getTableName())
                .append(" \" as db #D6EAF8\n\n");

        // Link queries to DB
        for (int i = 0; i < queries.size(); i++) {
            puml.append("q").append(i).append(" --> db\n");
        }

        // Calling endpoints
        if (!callingEndpoints.isEmpty()) {
            puml.append("\npackage \"Calling APIs\" {\n");
            for (int i = 0; i < Math.min(callingEndpoints.size(), 10); i++) {
                EndpointInfo ep = callingEndpoints.get(i);
                puml.append("  rectangle \" ").append(ep.getHttpMethod()).append(" ").append(ep.getPath())
                        .append(" \" as api").append(i).append(" #EBF5FB\n");
            }
            puml.append("}\n\n");

            for (int i = 0; i < Math.min(callingEndpoints.size(), 10); i++) {
                puml.append("api").append(i).append(" --> overview\n");
            }
        }

        puml.append("@enduml\n");

        Path file = outputDir.resolve(filename + ".puml");
        Files.writeString(file, puml.toString());
        log.info("Generated DB query diagram: {}", file.getFileName());
        return file.toString();
    }

    /**
     * Generate the project-wide DB query summary diagram.
     */
    public String generateQuerySummary(Map<String, List<RepositoryCallInfo>> allRepoQueries,
                                        Path outputDir, String projectName) throws IOException {
        StringBuilder puml = new StringBuilder();
        puml.append("@startuml codechecker_db_query_map\n");
        puml.append("top to bottom direction\n");
        puml.append("skinparam defaultFontSize 11\n");
        puml.append("skinparam defaultFontName Arial\n");
        puml.append("skinparam titleFontSize 14\n");
        puml.append("skinparam titleFontStyle bold\n");
        puml.append("skinparam rectangle {\n  RoundCorner 8\n  BorderThickness 2\n}\n\n");

        int totalQueries = allRepoQueries.values().stream().mapToInt(List::size).sum();
        puml.append("title A3 - DB Query Map - ").append(projectName)
                .append("\\n").append(allRepoQueries.size()).append(" repositories — ")
                .append(totalQueries).append(" queries - ").append(LocalDate.now()).append("\n\n");

        puml.append("database \" Database \" as db #D6EAF8\n\n");

        int repoIdx = 0;
        for (Map.Entry<String, List<RepositoryCallInfo>> entry : allRepoQueries.entrySet()) {
            String repoName = entry.getKey();
            List<RepositoryCallInfo> queries = entry.getValue();
            long critical = queries.stream()
                    .filter(q -> "CRITICAL".equals(q.getPerformanceRating())
                            || "DANGEROUS".equals(q.getPerformanceRating()))
                    .count();

            String color = critical > 0 ? "#FADBD8" : "#D5F5E3";

            puml.append("rectangle \" ").append(repoName)
                    .append("\\n ").append(queries.size()).append(" queries")
                    .append("\\n Critical: ").append(critical)
                    .append(" \" as repo").append(repoIdx).append(" ").append(color).append("\n");
            puml.append("repo").append(repoIdx).append(" --> db\n\n");
            repoIdx++;
        }

        puml.append("@enduml\n");

        Path file = outputDir.resolve("codechecker-db-query-map.puml");
        Files.writeString(file, puml.toString());
        return file.toString();
    }

    private String ratingColor(String rating) {
        if (rating == null) return "#D6EAF8";
        return switch (rating) {
            case "FAST" -> "#D5F5E3";
            case "MODERATE" -> "#FFF8E1";
            case "SLOW" -> "#FDEBD0";
            case "CRITICAL" -> "#FADBD8";
            case "DANGEROUS" -> "#E74C3C";
            default -> "#D6EAF8";
        };
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
