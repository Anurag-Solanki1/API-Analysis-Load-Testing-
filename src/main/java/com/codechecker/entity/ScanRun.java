package com.codechecker.entity;

import com.codechecker.model.ScanStatus;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "scan_runs")
public class ScanRun {
    @Id
    private String id;

    private String projectName;
    private String projectPath;
    private String outputPath;

    @Enumerated(EnumType.STRING)
    private ScanStatus status;

    private Instant startedAt;
    private Instant completedAt;
    private Integer healthScore;
    private String grade;
    private String releaseDecision;
    private Integer totalEndpoints;
    private Integer totalIssues;
    private Integer criticalCount;
    private Integer totalFiles;
    private Integer diagramsGenerated;
    private Integer scanMode;
    private String frameworkSummary; // JSON string e.g. {"SPRING_MVC":5,"STRUTS2":3,"JAX_WS":2}

    @OneToMany(mappedBy = "scanRun", cascade = CascadeType.ALL, orphanRemoval = true)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private List<EndpointResultEntity> endpoints = new ArrayList<>();

    @OneToMany(mappedBy = "scanRun", cascade = CascadeType.ALL, orphanRemoval = true)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private List<IssueResultEntity> issues = new ArrayList<>();

    public ScanRun() {
    }

    // Getters and setters
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getProjectName() {
        return projectName;
    }

    public void setProjectName(String projectName) {
        this.projectName = projectName;
    }

    public String getProjectPath() {
        return projectPath;
    }

    public void setProjectPath(String projectPath) {
        this.projectPath = projectPath;
    }

    public String getOutputPath() {
        return outputPath;
    }

    public void setOutputPath(String outputPath) {
        this.outputPath = outputPath;
    }

    public ScanStatus getStatus() {
        return status;
    }

    public void setStatus(ScanStatus status) {
        this.status = status;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(Instant startedAt) {
        this.startedAt = startedAt;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public void setCompletedAt(Instant completedAt) {
        this.completedAt = completedAt;
    }

    public Integer getHealthScore() {
        return healthScore;
    }

    public void setHealthScore(Integer healthScore) {
        this.healthScore = healthScore;
    }

    public String getGrade() {
        return grade;
    }

    public void setGrade(String grade) {
        this.grade = grade;
    }

    public String getReleaseDecision() {
        return releaseDecision;
    }

    public void setReleaseDecision(String releaseDecision) {
        this.releaseDecision = releaseDecision;
    }

    public Integer getTotalEndpoints() {
        return totalEndpoints;
    }

    public void setTotalEndpoints(Integer totalEndpoints) {
        this.totalEndpoints = totalEndpoints;
    }

    public Integer getTotalIssues() {
        return totalIssues;
    }

    public void setTotalIssues(Integer totalIssues) {
        this.totalIssues = totalIssues;
    }

    public Integer getCriticalCount() {
        return criticalCount;
    }

    public void setCriticalCount(Integer criticalCount) {
        this.criticalCount = criticalCount;
    }

    public Integer getTotalFiles() {
        return totalFiles;
    }

    public void setTotalFiles(Integer totalFiles) {
        this.totalFiles = totalFiles;
    }

    public Integer getDiagramsGenerated() {
        return diagramsGenerated;
    }

    public void setDiagramsGenerated(Integer diagramsGenerated) {
        this.diagramsGenerated = diagramsGenerated;
    }

    public Integer getScanMode() {
        return scanMode;
    }

    public void setScanMode(Integer scanMode) {
        this.scanMode = scanMode;
    }

    public List<EndpointResultEntity> getEndpoints() {
        return endpoints;
    }

    public void setEndpoints(List<EndpointResultEntity> endpoints) {
        this.endpoints = endpoints;
    }

    public List<IssueResultEntity> getIssues() {
        return issues;
    }

    public void setIssues(List<IssueResultEntity> issues) {
        this.issues = issues;
    }

    public String getFrameworkSummary() {
        return frameworkSummary;
    }

    public void setFrameworkSummary(String frameworkSummary) {
        this.frameworkSummary = frameworkSummary;
    }
}
