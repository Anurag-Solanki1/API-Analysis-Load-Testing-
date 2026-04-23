package com.codechecker.model;

/**
 * Represents a repository/DAO method call with its reconstructed SQL.
 */
public class RepositoryCallInfo {
    private String className;
    private String methodName;
    private int lineNumber;
    private String queryType;          // SPRING_DATA_DERIVED, JPQL, NATIVE_SQL, JDBC, HIBERNATE_HQL, MYBATIS, CRITERIA_API
    private String reconstructedSql;   // Full SQL text
    private String tableName;
    private boolean isInsideLoop;       // N+1 flag
    private int estimatedIterations;    // Loop iteration count
    private boolean hasIndex;
    private String indexName;
    private boolean hasPagination;
    private boolean isSelectStar;       // Full entity load
    private boolean hasSqlInjection;    // String concatenation in query
    private String performanceRating;   // FAST, MODERATE, SLOW, CRITICAL, DANGEROUS
    private int estimatedMs;
    private int estimatedRowsScanned;
    private int estimatedRowsReturned;

    public RepositoryCallInfo() {}

    // Getters and setters
    public String getClassName() { return className; }
    public void setClassName(String className) { this.className = className; }

    public String getMethodName() { return methodName; }
    public void setMethodName(String methodName) { this.methodName = methodName; }

    public int getLineNumber() { return lineNumber; }
    public void setLineNumber(int lineNumber) { this.lineNumber = lineNumber; }

    public String getQueryType() { return queryType; }
    public void setQueryType(String queryType) { this.queryType = queryType; }

    public String getReconstructedSql() { return reconstructedSql; }
    public void setReconstructedSql(String reconstructedSql) { this.reconstructedSql = reconstructedSql; }

    public String getTableName() { return tableName; }
    public void setTableName(String tableName) { this.tableName = tableName; }

    public boolean isInsideLoop() { return isInsideLoop; }
    public void setInsideLoop(boolean insideLoop) { isInsideLoop = insideLoop; }

    public int getEstimatedIterations() { return estimatedIterations; }
    public void setEstimatedIterations(int estimatedIterations) { this.estimatedIterations = estimatedIterations; }

    public boolean isHasIndex() { return hasIndex; }
    public void setHasIndex(boolean hasIndex) { this.hasIndex = hasIndex; }

    public String getIndexName() { return indexName; }
    public void setIndexName(String indexName) { this.indexName = indexName; }

    public boolean isHasPagination() { return hasPagination; }
    public void setHasPagination(boolean hasPagination) { this.hasPagination = hasPagination; }

    public boolean isSelectStar() { return isSelectStar; }
    public void setSelectStar(boolean selectStar) { isSelectStar = selectStar; }

    public boolean isHasSqlInjection() { return hasSqlInjection; }
    public void setHasSqlInjection(boolean hasSqlInjection) { this.hasSqlInjection = hasSqlInjection; }

    public String getPerformanceRating() { return performanceRating; }
    public void setPerformanceRating(String performanceRating) { this.performanceRating = performanceRating; }

    public int getEstimatedMs() { return estimatedMs; }
    public void setEstimatedMs(int estimatedMs) { this.estimatedMs = estimatedMs; }

    public int getEstimatedRowsScanned() { return estimatedRowsScanned; }
    public void setEstimatedRowsScanned(int estimatedRowsScanned) { this.estimatedRowsScanned = estimatedRowsScanned; }

    public int getEstimatedRowsReturned() { return estimatedRowsReturned; }
    public void setEstimatedRowsReturned(int estimatedRowsReturned) { this.estimatedRowsReturned = estimatedRowsReturned; }
}
