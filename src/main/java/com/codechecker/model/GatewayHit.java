package com.codechecker.model;

import java.util.Map;

public class GatewayHit {

    private String method;
    private String path;
    private int statusCode;
    private long durationMs;
    private String time;
    private String projectName;
    /** "gateway" (real proxy hit) or "load-test" (synthetic load test hit) */
    private String source;

    // Rich log fields (populated by GatewayController for full request/response visibility)
    private String requestUrl;
    private Map<String, String> requestHeaders;
    private String requestBody;
    private Map<String, String> responseHeaders;
    private String responseBody;
    private String errorMessage;

    public GatewayHit() {
    }

    public GatewayHit(String method, String path, int statusCode, long durationMs,
            String time, String projectName) {
        this.method = method;
        this.path = path;
        this.statusCode = statusCode;
        this.durationMs = durationMs;
        this.time = time;
        this.projectName = projectName;
        this.source = "gateway";
    }

    public GatewayHit(String method, String path, int statusCode, long durationMs,
            String time, String projectName, String source) {
        this(method, path, statusCode, durationMs, time, projectName);
        this.source = source;
    }

    public String getMethod() { return method; }
    public void setMethod(String method) { this.method = method; }

    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }

    public int getStatusCode() { return statusCode; }
    public void setStatusCode(int statusCode) { this.statusCode = statusCode; }

    public long getDurationMs() { return durationMs; }
    public void setDurationMs(long durationMs) { this.durationMs = durationMs; }

    public String getTime() { return time; }
    public void setTime(String time) { this.time = time; }

    public String getProjectName() { return projectName; }
    public void setProjectName(String projectName) { this.projectName = projectName; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }

    public String getRequestUrl() { return requestUrl; }
    public void setRequestUrl(String requestUrl) { this.requestUrl = requestUrl; }

    public Map<String, String> getRequestHeaders() { return requestHeaders; }
    public void setRequestHeaders(Map<String, String> requestHeaders) { this.requestHeaders = requestHeaders; }

    public String getRequestBody() { return requestBody; }
    public void setRequestBody(String requestBody) { this.requestBody = requestBody; }

    public Map<String, String> getResponseHeaders() { return responseHeaders; }
    public void setResponseHeaders(Map<String, String> responseHeaders) { this.responseHeaders = responseHeaders; }

    public String getResponseBody() { return responseBody; }
    public void setResponseBody(String responseBody) { this.responseBody = responseBody; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
}
