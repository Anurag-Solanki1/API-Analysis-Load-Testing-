package com.codechecker.model;

/**
 * Represents a single detected issue/finding from the analysis agent.
 */
public class IssueInfo {
    private String ruleId;           // A2-001, A3-007, D1-001, etc.
    private String severity;         // CRITICAL, HIGH, MEDIUM, LOW
    private String title;
    private String description;
    private String file;
    private int lineNumber;
    private String beforeCode;       // Original code snippet
    private String afterCode;        // Suggested fix code snippet
    private boolean autoFixed;       // Whether suggested fix was generated
    private String affectedEndpoint; // Which API is affected
    private String category;         // A2, A3, D1, D2, etc.
    private int deductionPoints;     // Health score deduction

    public IssueInfo() {}

    // Builder-style construction
    public static IssueInfo create(String ruleId, String severity, String title) {
        IssueInfo info = new IssueInfo();
        info.setRuleId(ruleId);
        info.setSeverity(severity);
        info.setTitle(title);
        info.setCategory(ruleId.replaceAll("-\\d+", ""));
        info.setDeductionPoints(calculateDeduction(severity));
        return info;
    }

    private static int calculateDeduction(String severity) {
        return switch (severity) {
            case "CRITICAL", "DANGEROUS" -> 15;
            case "HIGH" -> 8;
            case "MEDIUM" -> 5;
            case "LOW" -> 2;
            default -> 0;
        };
    }

    // Getters and setters
    public String getRuleId() { return ruleId; }
    public void setRuleId(String ruleId) { this.ruleId = ruleId; }

    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getFile() { return file; }
    public void setFile(String file) { this.file = file; }

    public int getLineNumber() { return lineNumber; }
    public void setLineNumber(int lineNumber) { this.lineNumber = lineNumber; }

    public String getBeforeCode() { return beforeCode; }
    public void setBeforeCode(String beforeCode) { this.beforeCode = beforeCode; }

    public String getAfterCode() { return afterCode; }
    public void setAfterCode(String afterCode) { this.afterCode = afterCode; }

    public boolean isAutoFixed() { return autoFixed; }
    public void setAutoFixed(boolean autoFixed) { this.autoFixed = autoFixed; }

    public String getAffectedEndpoint() { return affectedEndpoint; }
    public void setAffectedEndpoint(String affectedEndpoint) { this.affectedEndpoint = affectedEndpoint; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public int getDeductionPoints() { return deductionPoints; }
    public void setDeductionPoints(int deductionPoints) { this.deductionPoints = deductionPoints; }
}
