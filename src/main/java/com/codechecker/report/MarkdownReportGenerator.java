package com.codechecker.report;

import com.codechecker.model.*;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.*;
import java.time.LocalDate;
import java.util.List;

/**
 * Generates the codechecker-summary.md executive summary report.
 */
@Service
public class MarkdownReportGenerator {

    public String generateSummary(ScanResult result, Path outputDir) throws IOException {
        StringBuilder md = new StringBuilder();
        md.append("# CodeChecker — Project Health Summary\n\n");

        md.append("| Property | Value |\n");
        md.append("| --- | --- |\n");
        md.append("| Project | ").append(result.getScanId()).append(" |\n");
        if (result.getProjectName() != null && !result.getScanId().equals(result.getProjectName())) {
            md.append("| Project Name | ").append(result.getProjectName()).append(" |\n");
        }
        if (result.getProjectPath() != null) {
            md.append("| Project Path | ").append(result.getProjectPath()).append(" |\n");
        }
        md.append("| Scan Date | ").append(LocalDate.now()).append(" |\n");
        md.append("| Java Files | ").append(result.getTotalFiles()).append(" |\n");
        md.append("| Total Findings | ").append(result.getAllIssues() != null ? result.getAllIssues().size() : 0).append(" |\n");
        md.append("| Diagrams Generated | ").append(result.getDiagramsGenerated()).append(" |\n\n");

        md.append("## Health Score: ").append(result.getHealthScore()).append("/100 — Grade: ").append(result.getGrade()).append("\n\n");

        md.append("## Release Decision\n\n");
        md.append("**STATUS:** ").append(result.getReleaseDecision()).append("\n\n");

        // Issue summary by severity
        md.append("## Issue Summary\n\n");
        md.append("| Severity | Count |\n");
        md.append("| --- | --- |\n");
        md.append("| CRITICAL | ").append(result.getCriticalCount()).append(" |\n");
        md.append("| HIGH | ").append(result.getHighCount()).append(" |\n");
        md.append("| MEDIUM | ").append(result.getMediumCount()).append(" |\n");
        md.append("| LOW | ").append(result.getLowCount()).append(" |\n\n");

        // API Performance table
        if (result.getAllEndpoints() != null && !result.getAllEndpoints().isEmpty()) {
            md.append("## API Performance\n\n");
            md.append("| Endpoint | Method | Rating | p50 | p95 | Issues |\n");
            md.append("| --- | --- | --- | --- | --- | --- |\n");
            for (EndpointInfo ep : result.getAllEndpoints()) {
                md.append("| ").append(ep.getPath())
                        .append(" | ").append(ep.getHttpMethod())
                        .append(" | ").append(ep.getPerformanceRating())
                        .append(" | ~").append(ep.getEstimatedP50Ms()).append("ms")
                        .append(" | ~").append(ep.getEstimatedP95Ms()).append("ms")
                        .append(" | ").append(ep.getIssues().size())
                        .append(" |\n");
            }
            md.append("\n");
        }

        // Top issues
        if (result.getAllIssues() != null && !result.getAllIssues().isEmpty()) {
            md.append("## Top Issues\n\n");
            md.append("| # | Rule | Severity | Title | Affected API |\n");
            md.append("| --- | --- | --- | --- | --- |\n");
            List<IssueInfo> topIssues = result.getAllIssues().stream()
                    .sorted((a, b) -> severityRank(b.getSeverity()) - severityRank(a.getSeverity()))
                    .limit(20)
                    .toList();
            int idx = 1;
            for (IssueInfo issue : topIssues) {
                md.append("| ").append(idx++)
                        .append(" | ").append(issue.getRuleId())
                        .append(" | ").append(issue.getSeverity())
                        .append(" | ").append(issue.getTitle())
                        .append(" | ").append(issue.getAffectedEndpoint() != null ? issue.getAffectedEndpoint() : "N/A")
                        .append(" |\n");
            }
        }

        String content = md.toString();
        Path file = outputDir.resolve("codechecker-summary.md");
        Files.writeString(file, content);
        return file.toString();
    }

    private int severityRank(String severity) {
        return switch (severity) {
            case "CRITICAL", "DANGEROUS" -> 4;
            case "HIGH" -> 3;
            case "MEDIUM" -> 2;
            case "LOW" -> 1;
            default -> 0;
        };
    }
}
