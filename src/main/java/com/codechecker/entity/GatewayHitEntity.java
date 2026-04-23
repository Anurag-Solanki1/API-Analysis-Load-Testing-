package com.codechecker.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "gateway_hits")
public class GatewayHitEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String projectName;

    private String method;
    private String path;
    private int statusCode;
    private long durationMs;
    private String hitTime;
    private String source;
    private String requestUrl;

    @Lob
    @Column(columnDefinition = "CLOB")
    private String requestHeadersJson;

    @Lob
    @Column(columnDefinition = "CLOB")
    private String requestBody;

    @Lob
    @Column(columnDefinition = "CLOB")
    private String responseHeadersJson;

    @Lob
    @Column(columnDefinition = "CLOB")
    private String responseBody;

    @Lob
    @Column(columnDefinition = "CLOB")
    private String errorMessage;

    @Column(nullable = false)
    private LocalDateTime recordedAt;

    // Getters and Setters

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getProjectName() {
        return projectName;
    }

    public void setProjectName(String projectName) {
        this.projectName = projectName;
    }

    public String getMethod() {
        return method;
    }

    public void setMethod(String method) {
        this.method = method;
    }

    public String getPath() {
        return path;
    }

    public void setPath(String path) {
        this.path = path;
    }

    public int getStatusCode() {
        return statusCode;
    }

    public void setStatusCode(int statusCode) {
        this.statusCode = statusCode;
    }

    public long getDurationMs() {
        return durationMs;
    }

    public void setDurationMs(long durationMs) {
        this.durationMs = durationMs;
    }

    public String getHitTime() {
        return hitTime;
    }

    public void setHitTime(String hitTime) {
        this.hitTime = hitTime;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public String getRequestUrl() {
        return requestUrl;
    }

    public void setRequestUrl(String requestUrl) {
        this.requestUrl = requestUrl;
    }

    public String getRequestHeadersJson() {
        return requestHeadersJson;
    }

    public void setRequestHeadersJson(String requestHeadersJson) {
        this.requestHeadersJson = requestHeadersJson;
    }

    public String getRequestBody() {
        return requestBody;
    }

    public void setRequestBody(String requestBody) {
        this.requestBody = requestBody;
    }

    public String getResponseHeadersJson() {
        return responseHeadersJson;
    }

    public void setResponseHeadersJson(String responseHeadersJson) {
        this.responseHeadersJson = responseHeadersJson;
    }

    public String getResponseBody() {
        return responseBody;
    }

    public void setResponseBody(String responseBody) {
        this.responseBody = responseBody;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
    }

    public LocalDateTime getRecordedAt() {
        return recordedAt;
    }

    public void setRecordedAt(LocalDateTime recordedAt) {
        this.recordedAt = recordedAt;
    }
}
