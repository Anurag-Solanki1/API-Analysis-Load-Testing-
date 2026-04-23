package com.codechecker.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "endpoint_results")
public class EndpointResultEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "scan_run_id")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private ScanRun scanRun;

    private String httpMethod;
    private String path;
    private String controllerClass;
    private String controllerMethod;
    private String performanceRating;
    private Integer estimatedP50Ms;
    private Integer estimatedP95Ms;
    private String diagramPath;
    private Integer issueCount;
    private String framework;

    public EndpointResultEntity() {}

    // Getters and setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public ScanRun getScanRun() { return scanRun; }
    public void setScanRun(ScanRun scanRun) { this.scanRun = scanRun; }

    public String getHttpMethod() { return httpMethod; }
    public void setHttpMethod(String httpMethod) { this.httpMethod = httpMethod; }

    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }

    public String getControllerClass() { return controllerClass; }
    public void setControllerClass(String controllerClass) { this.controllerClass = controllerClass; }

    public String getControllerMethod() { return controllerMethod; }
    public void setControllerMethod(String controllerMethod) { this.controllerMethod = controllerMethod; }

    public String getPerformanceRating() { return performanceRating; }
    public void setPerformanceRating(String performanceRating) { this.performanceRating = performanceRating; }

    public Integer getEstimatedP50Ms() { return estimatedP50Ms; }
    public void setEstimatedP50Ms(Integer estimatedP50Ms) { this.estimatedP50Ms = estimatedP50Ms; }

    public Integer getEstimatedP95Ms() { return estimatedP95Ms; }
    public void setEstimatedP95Ms(Integer estimatedP95Ms) { this.estimatedP95Ms = estimatedP95Ms; }

    public String getDiagramPath() { return diagramPath; }
    public void setDiagramPath(String diagramPath) { this.diagramPath = diagramPath; }

    public Integer getIssueCount() { return issueCount; }
    public void setIssueCount(Integer issueCount) { this.issueCount = issueCount; }

    public String getFramework() { return framework; }
    public void setFramework(String framework) { this.framework = framework; }
}
