package com.codechecker.model;

/**
 * Represents an external HTTP/SOAP call found in the call chain.
 */
public class ExternalCallInfo {
    private String type;              // REST, SOAP
    private String httpMethod;        // GET, POST, etc.
    private String url;
    private String callingClass;
    private String callingMethod;
    private int lineNumber;
    private boolean hasTimeout;
    private int connectTimeoutMs;
    private int readTimeoutMs;
    private boolean isAsync;
    private boolean isInsideTransaction;
    private boolean hasCircuitBreaker;
    private String circuitBreakerConfig;
    private boolean isConditional;
    private String condition;
    private int estimatedMs;

    public ExternalCallInfo() {}

    // Getters and setters
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getHttpMethod() { return httpMethod; }
    public void setHttpMethod(String httpMethod) { this.httpMethod = httpMethod; }

    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }

    public String getCallingClass() { return callingClass; }
    public void setCallingClass(String callingClass) { this.callingClass = callingClass; }

    public String getCallingMethod() { return callingMethod; }
    public void setCallingMethod(String callingMethod) { this.callingMethod = callingMethod; }

    public int getLineNumber() { return lineNumber; }
    public void setLineNumber(int lineNumber) { this.lineNumber = lineNumber; }

    public boolean isHasTimeout() { return hasTimeout; }
    public void setHasTimeout(boolean hasTimeout) { this.hasTimeout = hasTimeout; }

    public int getConnectTimeoutMs() { return connectTimeoutMs; }
    public void setConnectTimeoutMs(int connectTimeoutMs) { this.connectTimeoutMs = connectTimeoutMs; }

    public int getReadTimeoutMs() { return readTimeoutMs; }
    public void setReadTimeoutMs(int readTimeoutMs) { this.readTimeoutMs = readTimeoutMs; }

    public boolean isAsync() { return isAsync; }
    public void setAsync(boolean async) { isAsync = async; }

    public boolean isInsideTransaction() { return isInsideTransaction; }
    public void setInsideTransaction(boolean insideTransaction) { isInsideTransaction = insideTransaction; }

    public boolean isHasCircuitBreaker() { return hasCircuitBreaker; }
    public void setHasCircuitBreaker(boolean hasCircuitBreaker) { this.hasCircuitBreaker = hasCircuitBreaker; }

    public String getCircuitBreakerConfig() { return circuitBreakerConfig; }
    public void setCircuitBreakerConfig(String circuitBreakerConfig) { this.circuitBreakerConfig = circuitBreakerConfig; }

    public boolean isConditional() { return isConditional; }
    public void setConditional(boolean conditional) { isConditional = conditional; }

    public String getCondition() { return condition; }
    public void setCondition(String condition) { this.condition = condition; }

    public int getEstimatedMs() { return estimatedMs; }
    public void setEstimatedMs(int estimatedMs) { this.estimatedMs = estimatedMs; }
}
