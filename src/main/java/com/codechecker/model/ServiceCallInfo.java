package com.codechecker.model;

import java.util.ArrayList;
import java.util.List;

/**
 * Represents a service method call in the call chain.
 */
public class ServiceCallInfo {
    private String className;
    private String methodName;
    private int lineNumber;
    private boolean isAsync;
    private boolean isTransactional;
    private String transactionalPropagation;
    private boolean isInsideLoop;
    private String loopVariable;
    private boolean isConditional;
    private String condition;
    private boolean conditionValue; // true/false branch
    private List<RepositoryCallInfo> repoCalls = new ArrayList<>();
    private List<ExternalCallInfo> externalCalls = new ArrayList<>();
    private List<ServiceCallInfo> nestedServiceCalls = new ArrayList<>();
    private int estimatedMs;

    public ServiceCallInfo() {}

    // Getters and setters
    public String getClassName() { return className; }
    public void setClassName(String className) { this.className = className; }

    public String getMethodName() { return methodName; }
    public void setMethodName(String methodName) { this.methodName = methodName; }

    public int getLineNumber() { return lineNumber; }
    public void setLineNumber(int lineNumber) { this.lineNumber = lineNumber; }

    public boolean isAsync() { return isAsync; }
    public void setAsync(boolean async) { isAsync = async; }

    public boolean isTransactional() { return isTransactional; }
    public void setTransactional(boolean transactional) { isTransactional = transactional; }

    public String getTransactionalPropagation() { return transactionalPropagation; }
    public void setTransactionalPropagation(String transactionalPropagation) { this.transactionalPropagation = transactionalPropagation; }

    public boolean isInsideLoop() { return isInsideLoop; }
    public void setInsideLoop(boolean insideLoop) { isInsideLoop = insideLoop; }

    public String getLoopVariable() { return loopVariable; }
    public void setLoopVariable(String loopVariable) { this.loopVariable = loopVariable; }

    public boolean isConditional() { return isConditional; }
    public void setConditional(boolean conditional) { isConditional = conditional; }

    public String getCondition() { return condition; }
    public void setCondition(String condition) { this.condition = condition; }

    public boolean isConditionValue() { return conditionValue; }
    public void setConditionValue(boolean conditionValue) { this.conditionValue = conditionValue; }

    public List<RepositoryCallInfo> getRepoCalls() { return repoCalls; }
    public void setRepoCalls(List<RepositoryCallInfo> repoCalls) { this.repoCalls = repoCalls; }

    public List<ExternalCallInfo> getExternalCalls() { return externalCalls; }
    public void setExternalCalls(List<ExternalCallInfo> externalCalls) { this.externalCalls = externalCalls; }

    public List<ServiceCallInfo> getNestedServiceCalls() { return nestedServiceCalls; }
    public void setNestedServiceCalls(List<ServiceCallInfo> nestedServiceCalls) { this.nestedServiceCalls = nestedServiceCalls; }

    public int getEstimatedMs() { return estimatedMs; }
    public void setEstimatedMs(int estimatedMs) { this.estimatedMs = estimatedMs; }
}
