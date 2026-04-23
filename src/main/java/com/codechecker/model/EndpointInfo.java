package com.codechecker.model;

import java.util.ArrayList;
import java.util.List;

/**
 * Rich model representing a single discovered API endpoint and all analysis results.
 * This is the central data structure the agent builds during scanning.
 */
public class EndpointInfo {
    // --- Discovery fields ---
    private String httpMethod;          // GET, POST, PUT, DELETE, PATCH, SOAP
    private String path;                // /api/orders/{id}
    private String controllerClass;     // OrderController
    private String controllerMethod;    // createOrder
    private int controllerLine;         // line number in source
    private String framework;           // SPRING_MVC, SEEDSTACK_JAXRS, STRUTS2, JAX_WS, SPRING_WS

    // --- Auth & validation ---
    private String authExpression;      // hasRole('USER') or NO AUTH
    private boolean hasValidation;      // @Valid present?

    // --- Call chain ---
    private List<ServiceCallInfo> serviceCalls = new ArrayList<>();
    private List<RepositoryCallInfo> repoCalls = new ArrayList<>();
    private List<ExternalCallInfo> externalCalls = new ArrayList<>();

    // --- Analysis results ---
    private String performanceRating;   // FAST, MODERATE, SLOW, CRITICAL
    private int estimatedP50Ms;
    private int estimatedP95Ms;
    private List<IssueInfo> issues = new ArrayList<>();
    private String diagramPath;         // generated .puml/.png path

    // --- Transactional scope ---
    private boolean hasTransactional;
    private String transactionalScope;  // REQUIRED, REQUIRES_NEW, etc.

    // Getters and setters
    public String getHttpMethod() { return httpMethod; }
    public void setHttpMethod(String httpMethod) { this.httpMethod = httpMethod; }

    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }

    public String getControllerClass() { return controllerClass; }
    public void setControllerClass(String controllerClass) { this.controllerClass = controllerClass; }

    public String getControllerMethod() { return controllerMethod; }
    public void setControllerMethod(String controllerMethod) { this.controllerMethod = controllerMethod; }

    public int getControllerLine() { return controllerLine; }
    public void setControllerLine(int controllerLine) { this.controllerLine = controllerLine; }

    public String getFramework() { return framework; }
    public void setFramework(String framework) { this.framework = framework; }

    public String getAuthExpression() { return authExpression; }
    public void setAuthExpression(String authExpression) { this.authExpression = authExpression; }

    public boolean isHasValidation() { return hasValidation; }
    public void setHasValidation(boolean hasValidation) { this.hasValidation = hasValidation; }

    public List<ServiceCallInfo> getServiceCalls() { return serviceCalls; }
    public void setServiceCalls(List<ServiceCallInfo> serviceCalls) { this.serviceCalls = serviceCalls; }

    public List<RepositoryCallInfo> getRepoCalls() { return repoCalls; }
    public void setRepoCalls(List<RepositoryCallInfo> repoCalls) { this.repoCalls = repoCalls; }

    public List<ExternalCallInfo> getExternalCalls() { return externalCalls; }
    public void setExternalCalls(List<ExternalCallInfo> externalCalls) { this.externalCalls = externalCalls; }

    public String getPerformanceRating() { return performanceRating; }
    public void setPerformanceRating(String performanceRating) { this.performanceRating = performanceRating; }

    public int getEstimatedP50Ms() { return estimatedP50Ms; }
    public void setEstimatedP50Ms(int estimatedP50Ms) { this.estimatedP50Ms = estimatedP50Ms; }

    public int getEstimatedP95Ms() { return estimatedP95Ms; }
    public void setEstimatedP95Ms(int estimatedP95Ms) { this.estimatedP95Ms = estimatedP95Ms; }

    public List<IssueInfo> getIssues() { return issues; }
    public void setIssues(List<IssueInfo> issues) { this.issues = issues; }

    public String getDiagramPath() { return diagramPath; }
    public void setDiagramPath(String diagramPath) { this.diagramPath = diagramPath; }

    public boolean isHasTransactional() { return hasTransactional; }
    public void setHasTransactional(boolean hasTransactional) { this.hasTransactional = hasTransactional; }

    public String getTransactionalScope() { return transactionalScope; }
    public void setTransactionalScope(String transactionalScope) { this.transactionalScope = transactionalScope; }

    public void addIssue(IssueInfo issue) {
        this.issues.add(issue);
    }

    public void addServiceCall(ServiceCallInfo call) {
        this.serviceCalls.add(call);
    }

    public void addExternalCall(ExternalCallInfo call) {
        this.externalCalls.add(call);
    }
}
