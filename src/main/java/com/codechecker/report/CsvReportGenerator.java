package com.codechecker.report;

import com.codechecker.model.*;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.*;
import java.util.List;

/**
 * Generates CSV report files: codechecker-report.csv and codechecker-suggested-fixes.csv
 */
@Service
public class CsvReportGenerator {

    public String generateReportCsv(ScanResult result, Path outputDir) throws IOException {
        StringBuilder csv = new StringBuilder();
        csv.append("Rule,Severity,Title,File,Line,Category,Affected Endpoint,Auto-Fixed\n");

        if (result.getAllIssues() != null) {
            for (IssueInfo issue : result.getAllIssues()) {
                csv.append(escape(issue.getRuleId())).append(",");
                csv.append(escape(issue.getSeverity())).append(",");
                csv.append(escape(issue.getTitle())).append(",");
                csv.append(escape(issue.getFile())).append(",");
                csv.append(issue.getLineNumber()).append(",");
                csv.append(escape(issue.getCategory())).append(",");
                csv.append(escape(issue.getAffectedEndpoint())).append(",");
                csv.append(issue.isAutoFixed() ? "YES" : "NO").append("\n");
            }
        }

        Path file = outputDir.resolve("codechecker-report.csv");
        Files.writeString(file, csv.toString());
        return file.toString();
    }

    public String generateFixesCsv(ScanResult result, Path outputDir) throws IOException {
        StringBuilder csv = new StringBuilder();
        csv.append("Rule,File,Line,Before,After,Severity\n");

        if (result.getAllIssues() != null) {
            for (IssueInfo issue : result.getAllIssues()) {
                if (issue.getBeforeCode() != null || issue.getAfterCode() != null) {
                    csv.append(escape(issue.getRuleId())).append(",");
                    csv.append(escape(issue.getFile())).append(",");
                    csv.append(issue.getLineNumber()).append(",");
                    csv.append(escape(issue.getBeforeCode())).append(",");
                    csv.append(escape(issue.getAfterCode())).append(",");
                    csv.append(escape(issue.getSeverity())).append("\n");
                }
            }
        }

        Path file = outputDir.resolve("codechecker-suggested-fixes.csv");
        Files.writeString(file, csv.toString());
        return file.toString();
    }

    private String escape(String value) {
        if (value == null) return "";
        // Wrap in quotes and escape internal quotes
        value = value.replace("\"", "\"\"");
        if (value.contains(",") || value.contains("\n") || value.contains("\"")) {
            return "\"" + value + "\"";
        }
        return value;
    }
}
