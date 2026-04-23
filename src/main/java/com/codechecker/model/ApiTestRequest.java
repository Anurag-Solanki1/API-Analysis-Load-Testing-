package com.codechecker.model;

import java.util.Map;

public class ApiTestRequest {
    private String projectName;
    private String httpMethod;
    private String endpointPath;
    private String environmentUrl;
    private String authToken;
    private String authType; // "bearer", "basic", "apikey", "none"
    private String apiKeyHeader; // header name when authType=apikey
    private String requestPayload;
    private String contentType; // e.g. "application/json", "application/x-www-form-urlencoded"
    private int totalHits;
    /**
     * Custom request headers, e.g. {"X-Api-Key": "abc", "Accept":
     * "application/json"}
     */
    private Map<String, String> customHeaders;
    /** Query parameters appended to the URL, e.g. {"page": "1", "size": "20"} */
    private Map<String, String> queryParams;
    /** Path variable substitutions, e.g. {"{id}": "42", "{userId}": "7"} */
    private Map<String, String> pathParams;

    public String getProjectName() {
        return projectName;
    }

    public void setProjectName(String projectName) {
        this.projectName = projectName;
    }

    public String getHttpMethod() {
        return httpMethod;
    }

    public void setHttpMethod(String httpMethod) {
        this.httpMethod = httpMethod;
    }

    public String getEndpointPath() {
        return endpointPath;
    }

    public void setEndpointPath(String endpointPath) {
        this.endpointPath = endpointPath;
    }

    public String getEnvironmentUrl() {
        return environmentUrl;
    }

    public void setEnvironmentUrl(String environmentUrl) {
        this.environmentUrl = environmentUrl;
    }

    public String getAuthToken() {
        return authToken;
    }

    public void setAuthToken(String authToken) {
        this.authToken = authToken;
    }

    public String getAuthType() {
        return authType;
    }

    public void setAuthType(String authType) {
        this.authType = authType;
    }

    public String getApiKeyHeader() {
        return apiKeyHeader;
    }

    public void setApiKeyHeader(String apiKeyHeader) {
        this.apiKeyHeader = apiKeyHeader;
    }

    public String getRequestPayload() {
        return requestPayload;
    }

    public void setRequestPayload(String requestPayload) {
        this.requestPayload = requestPayload;
    }

    public String getContentType() {
        return contentType;
    }

    public void setContentType(String contentType) {
        this.contentType = contentType;
    }

    public int getTotalHits() {
        return totalHits;
    }

    public void setTotalHits(int totalHits) {
        this.totalHits = totalHits;
    }

    public Map<String, String> getCustomHeaders() {
        return customHeaders;
    }

    public void setCustomHeaders(Map<String, String> customHeaders) {
        this.customHeaders = customHeaders;
    }

    public Map<String, String> getQueryParams() {
        return queryParams;
    }

    public void setQueryParams(Map<String, String> queryParams) {
        this.queryParams = queryParams;
    }

    public Map<String, String> getPathParams() {
        return pathParams;
    }

    public void setPathParams(Map<String, String> pathParams) {
        this.pathParams = pathParams;
    }

    private String liveRunId;
    /**
     * Number of virtual users / threads – each fires (totalHits / threads)
     * requests.
     */
    private int maxConcurrentUsers = 1;
    /**
     * Legacy field kept for backward compatibility.
     * 
     * @deprecated Use totalHits / maxConcurrentUsers to derive per-thread count.
     */
    @Deprecated
    private int testDurationSeconds = 30;
    /**
     * Seconds to wait between launching each successive thread (ramp-up interval).
     * Thread 0 starts immediately, thread 1 starts after rampUpIntervalSeconds,
     * thread 2 after 2 * rampUpIntervalSeconds, etc.
     * 0 means all threads start simultaneously.
     */
    private double rampUpIntervalSeconds = 0;
    /**
     * Seconds to wait between consecutive requests within a single thread (think time).
     * 0 means fire requests back-to-back.
     */
    private double thinkTimeSeconds = 0;

    public String getLiveRunId() {
        return liveRunId;
    }

    public void setLiveRunId(String liveRunId) {
        this.liveRunId = liveRunId;
    }

    public int getMaxConcurrentUsers() {
        return maxConcurrentUsers;
    }

    public void setMaxConcurrentUsers(int maxConcurrentUsers) {
        this.maxConcurrentUsers = maxConcurrentUsers;
    }

    public int getTestDurationSeconds() {
        return testDurationSeconds;
    }

    public void setTestDurationSeconds(int testDurationSeconds) {
        this.testDurationSeconds = testDurationSeconds;
    }

    public double getRampUpIntervalSeconds() {
        return rampUpIntervalSeconds;
    }

    public void setRampUpIntervalSeconds(double rampUpIntervalSeconds) {
        this.rampUpIntervalSeconds = rampUpIntervalSeconds;
    }

    public double getThinkTimeSeconds() {
        return thinkTimeSeconds;
    }

    public void setThinkTimeSeconds(double thinkTimeSeconds) {
        this.thinkTimeSeconds = thinkTimeSeconds;
    }
}
