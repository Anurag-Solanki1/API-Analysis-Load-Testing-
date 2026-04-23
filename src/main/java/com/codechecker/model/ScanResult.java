package com.codechecker.model;

import java.util.List;

/**
 * Complete result of a scan run.
 */
public class ScanResult {
    private String scanId;
    private String projectName;
    private String projectPath;
    private int totalEndpoints;
    private int diagramsGenerated;
    private List<EndpointInfo> allEndpoints;
    private List<IssueInfo> allIssues;
    private String outputPath;
    private int healthScore;
    private String grade;
    private String releaseDecision;
    private int totalFiles;
    private int criticalCount;
    private int highCount;
    private int mediumCount;
    private int lowCount;

    public ScanResult() {}

    // Getters and setters
    public String getScanId() { return scanId; }
    public void setScanId(String scanId) { this.scanId = scanId; }

    public String getProjectName() { return projectName; }
    public void setProjectName(String projectName) { this.projectName = projectName; }

    public String getProjectPath() { return projectPath; }
    public void setProjectPath(String projectPath) { this.projectPath = projectPath; }

    public int getTotalEndpoints() { return totalEndpoints; }
    public void setTotalEndpoints(int totalEndpoints) { this.totalEndpoints = totalEndpoints; }

    public int getDiagramsGenerated() { return diagramsGenerated; }
    public void setDiagramsGenerated(int diagramsGenerated) { this.diagramsGenerated = diagramsGenerated; }

    public List<EndpointInfo> getAllEndpoints() { return allEndpoints; }
    public void setAllEndpoints(List<EndpointInfo> allEndpoints) { this.allEndpoints = allEndpoints; }

    public List<IssueInfo> getAllIssues() { return allIssues; }
    public void setAllIssues(List<IssueInfo> allIssues) { this.allIssues = allIssues; }

    public String getOutputPath() { return outputPath; }
    public void setOutputPath(String outputPath) { this.outputPath = outputPath; }

    public int getHealthScore() { return healthScore; }
    public void setHealthScore(int healthScore) { this.healthScore = healthScore; }

    public String getGrade() { return grade; }
    public void setGrade(String grade) { this.grade = grade; }

    public String getReleaseDecision() { return releaseDecision; }
    public void setReleaseDecision(String releaseDecision) { this.releaseDecision = releaseDecision; }

    public int getTotalFiles() { return totalFiles; }
    public void setTotalFiles(int totalFiles) { this.totalFiles = totalFiles; }

    public int getCriticalCount() { return criticalCount; }
    public void setCriticalCount(int criticalCount) { this.criticalCount = criticalCount; }

    public int getHighCount() { return highCount; }
    public void setHighCount(int highCount) { this.highCount = highCount; }

    public int getMediumCount() { return mediumCount; }
    public void setMediumCount(int mediumCount) { this.mediumCount = mediumCount; }

    public int getLowCount() { return lowCount; }
    public void setLowCount(int lowCount) { this.lowCount = lowCount; }
}
