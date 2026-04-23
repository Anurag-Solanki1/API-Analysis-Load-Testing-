package com.codechecker.model;

import java.util.List;

/**
 * Request DTO for starting a new scan.
 */
public class ScanRequest {
    private String projectName;
    private String projectPath;
    private String outputPath;
    private int scanMode = 1; // 1=Full, 2=Single API, 3=Deep Workspace
    private String apiPath;   // For mode 2/3
    private List<String> phasesToRun; // e.g. ["D1-D11", "A1", "A2", "A3"]

    public ScanRequest() {}

    public String getProjectName() { return projectName; }
    public void setProjectName(String projectName) { this.projectName = projectName; }

    public String getProjectPath() { return projectPath; }
    public void setProjectPath(String projectPath) { this.projectPath = projectPath; }

    public String getOutputPath() { return outputPath; }
    public void setOutputPath(String outputPath) { this.outputPath = outputPath; }

    public int getScanMode() { return scanMode; }
    public void setScanMode(int scanMode) { this.scanMode = scanMode; }

    public String getApiPath() { return apiPath; }
    public void setApiPath(String apiPath) { this.apiPath = apiPath; }

    public List<String> getPhasesToRun() { return phasesToRun; }
    public void setPhasesToRun(List<String> phasesToRun) { this.phasesToRun = phasesToRun; }
}
