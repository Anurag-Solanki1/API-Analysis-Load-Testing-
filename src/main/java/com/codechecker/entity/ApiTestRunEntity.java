package com.codechecker.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.List;

@Entity
@Table(name = "api_test_runs")
public class ApiTestRunEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private UserEntity user;

    private String projectName;
    private String httpMethod;
    private String endpointPath;
    private String environmentUrl;

    // Auth tokens are sensitive credentials — never expose them in API responses.
    // Kept in the schema for backward compatibility with existing rows.
    @JsonIgnore
    @Column(length = 2000)
    private String authToken;

    @Lob
    private String requestPayload;

    private int totalHits;
    private int successfulHits;
    private int failedHits;
    
    private int averageLatencyMs;
    private int p90LatencyMs;

    private LocalDateTime startedAt;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "api_test_latencies", joinColumns = @JoinColumn(name = "test_run_id"))
    @Column(name = "latency_ms")
    private List<Integer> hitLatencies;

    // Getters and Setters

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getProjectName() { return projectName; }
    public void setProjectName(String projectName) { this.projectName = projectName; }

    public String getHttpMethod() { return httpMethod; }
    public void setHttpMethod(String httpMethod) { this.httpMethod = httpMethod; }

    public String getEndpointPath() { return endpointPath; }
    public void setEndpointPath(String endpointPath) { this.endpointPath = endpointPath; }

    public String getEnvironmentUrl() { return environmentUrl; }
    public void setEnvironmentUrl(String environmentUrl) { this.environmentUrl = environmentUrl; }

    /** @deprecated Auth tokens are not exposed via API — use {@link #setAuthToken} only for legacy reads. */
    @JsonIgnore
    public String getAuthToken() { return authToken; }
    public void setAuthToken(String authToken) { this.authToken = authToken; }

    public String getRequestPayload() { return requestPayload; }
    public void setRequestPayload(String requestPayload) { this.requestPayload = requestPayload; }

    public int getTotalHits() { return totalHits; }
    public void setTotalHits(int totalHits) { this.totalHits = totalHits; }

    public int getSuccessfulHits() { return successfulHits; }
    public void setSuccessfulHits(int successfulHits) { this.successfulHits = successfulHits; }

    public int getFailedHits() { return failedHits; }
    public void setFailedHits(int failedHits) { this.failedHits = failedHits; }

    public int getAverageLatencyMs() { return averageLatencyMs; }
    public void setAverageLatencyMs(int averageLatencyMs) { this.averageLatencyMs = averageLatencyMs; }

    public int getP90LatencyMs() { return p90LatencyMs; }
    public void setP90LatencyMs(int p90LatencyMs) { this.p90LatencyMs = p90LatencyMs; }

    public LocalDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(LocalDateTime startedAt) { this.startedAt = startedAt; }

    public List<Integer> getHitLatencies() { return hitLatencies; }
    public void setHitLatencies(List<Integer> hitLatencies) { this.hitLatencies = hitLatencies; }

    public UserEntity getUser() { return user; }
    public void setUser(UserEntity user) { this.user = user; }
}
