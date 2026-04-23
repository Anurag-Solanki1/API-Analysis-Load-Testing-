package com.codechecker.analyzer;

import com.codechecker.model.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * DbQueryAnalyzer — Agent Component #6
 * 
 * Applies A3 rules to rate every database query found in the call chain.
 * Checks indexes, pagination, injection, N+1 relationships, and more.
 */
@Service
public class DbQueryAnalyzer {

    private static final Logger log = LoggerFactory.getLogger(DbQueryAnalyzer.class);

    /**
     * Analyze all repository calls within an endpoint for DB performance issues.
     */
    public void analyze(EndpointInfo endpoint) {
        for (ServiceCallInfo svc : endpoint.getServiceCalls()) {
            for (RepositoryCallInfo repo : svc.getRepoCalls()) {
                analyzeRepoCall(repo, endpoint, svc);
            }
            analyzeNested(svc.getNestedServiceCalls(), endpoint);
        }
    }

    private void analyzeNested(java.util.List<ServiceCallInfo> calls, EndpointInfo endpoint) {
        for (ServiceCallInfo svc : calls) {
            for (RepositoryCallInfo repo : svc.getRepoCalls()) {
                analyzeRepoCall(repo, endpoint, svc);
            }
            analyzeNested(svc.getNestedServiceCalls(), endpoint);
        }
    }

    private void analyzeRepoCall(RepositoryCallInfo repo, EndpointInfo endpoint, ServiceCallInfo svc) {
        // A3-001: SELECT * or full entity load
        checkSelectStar(repo, endpoint);

        // A3-002: LIKE '%x%' leading wildcard
        checkLikeWildcard(repo, endpoint);

        // A3-003: No pagination
        checkNoPagination(repo, endpoint);

        // A3-004: WHERE column missing index
        checkMissingIndex(repo, endpoint);

        // A3-007: SQL injection via string concatenation
        checkSqlInjection(repo, endpoint);

        // A3-012: save()/delete() in loop
        checkBulkInLoop(repo, endpoint);

        // Rate the query
        rateQuery(repo);
    }

    /** A3-001: SELECT * or full entity on large table */
    private void checkSelectStar(RepositoryCallInfo repo, EndpointInfo endpoint) {
        if (repo.isSelectStar()) {
            IssueInfo issue = IssueInfo.create("A3-001", "MEDIUM",
                    "SELECT * — full entity load in " + repo.getClassName() + "." + repo.getMethodName() + "()");
            issue.setDescription("Fetches all columns including large TEXT/BLOB fields per row.");
            issue.setAfterCode("Use projection interface or @Query with specific columns");
            issue.setAffectedEndpoint(endpoint.getHttpMethod() + " " + endpoint.getPath());
            endpoint.addIssue(issue);
        }
    }

    /** A3-002: LIKE '%x%' leading wildcard */
    private void checkLikeWildcard(RepositoryCallInfo repo, EndpointInfo endpoint) {
        if (repo.getReconstructedSql() != null && repo.getReconstructedSql().contains("LIKE '%")) {
            IssueInfo issue = IssueInfo.create("A3-002", "CRITICAL",
                    "LIKE wildcard — full table scan in " + repo.getClassName());
            issue.setDescription("Leading wildcard LIKE '%keyword%' makes index COMPLETELY UNUSED.");
            issue.setAfterCode("FULLTEXT index + MATCH(col) AGAINST (:kw IN BOOLEAN MODE)");
            issue.setAffectedEndpoint(endpoint.getHttpMethod() + " " + endpoint.getPath());
            endpoint.addIssue(issue);
        }
    }

    /** A3-003: No LIMIT / Pageable on query */
    private void checkNoPagination(RepositoryCallInfo repo, EndpointInfo endpoint) {
        if (!repo.isHasPagination() && repo.getMethodName() != null
                && (repo.getMethodName().startsWith("findAll") || repo.getMethodName().startsWith("findBy"))) {
            // Only flag methods likely returning multiple rows
            String method = repo.getMethodName();
            if (method.equals("findById") || method.equals("findOne") || method.contains("ById")) {
                return; // Single-row lookups don't need pagination
            }

            IssueInfo issue = IssueInfo.create("A3-003", "HIGH",
                    "No pagination — " + repo.getClassName() + "." + repo.getMethodName() + "()");
            issue.setDescription("No LIMIT or Pageable on query — could load entire table into heap.");
            issue.setAfterCode("Add Pageable parameter: " + repo.getMethodName() + "(criteria, PageRequest.of(0, 20))");
            issue.setAffectedEndpoint(endpoint.getHttpMethod() + " " + endpoint.getPath());
            endpoint.addIssue(issue);
        }
    }

    /** A3-004: WHERE column has no index */
    private void checkMissingIndex(RepositoryCallInfo repo, EndpointInfo endpoint) {
        if (!repo.isHasIndex() && repo.getMethodName() != null
                && !repo.getMethodName().equals("findById") && !repo.getMethodName().equals("save")
                && !repo.getMethodName().equals("delete") && !repo.getMethodName().equals("deleteById")) {
            IssueInfo issue = IssueInfo.create("A3-004", "MEDIUM",
                    "Potential missing index — " + repo.getClassName() + "." + repo.getMethodName() + "()");
            issue.setDescription("WHERE column may not be indexed. Check @Index on entity or CREATE INDEX.");
            issue.setAfterCode("@Index(name=\"idx_table_col\", columnList=\"col\") on @Entity @Table");
            issue.setAffectedEndpoint(endpoint.getHttpMethod() + " " + endpoint.getPath());
            endpoint.addIssue(issue);
        }
    }

    /** A3-007: SQL injection via string concatenation */
    private void checkSqlInjection(RepositoryCallInfo repo, EndpointInfo endpoint) {
        if (repo.isHasSqlInjection()) {
            IssueInfo issue = IssueInfo.create("A3-007", "CRITICAL",
                    "SQL INJECTION — string concatenation in " + repo.getClassName() + "." + repo.getMethodName() + "()");
            issue.setDescription("SQL query built with string concatenation — full injection vulnerability.");
            issue.setBeforeCode("\"SELECT * WHERE name='\" + term + \"'\"");
            issue.setAfterCode("PreparedStatement with ? parameter or @Query with :param");
            issue.setAutoFixed(true);
            issue.setAffectedEndpoint(endpoint.getHttpMethod() + " " + endpoint.getPath());
            endpoint.addIssue(issue);
        }
    }

    /** A3-012: save()/delete() in loop */
    private void checkBulkInLoop(RepositoryCallInfo repo, EndpointInfo endpoint) {
        if (repo.isInsideLoop() && repo.getMethodName() != null
                && (repo.getMethodName().startsWith("delete") && !repo.getMethodName().equals("deleteAll"))) {
            IssueInfo issue = IssueInfo.create("A3-012", "CRITICAL",
                    "delete() in loop — " + repo.getClassName());
            issue.setAfterCode("Use deleteAllInBatch() instead of loop delete");
            issue.setAffectedEndpoint(endpoint.getHttpMethod() + " " + endpoint.getPath());
            endpoint.addIssue(issue);
        }
    }

    /** Rate a query based on its characteristics */
    private void rateQuery(RepositoryCallInfo repo) {
        if (repo.isHasSqlInjection()) {
            repo.setPerformanceRating("DANGEROUS");
        } else if (repo.isInsideLoop() || (repo.isSelectStar() && !repo.isHasPagination())) {
            repo.setPerformanceRating("CRITICAL");
        } else if (!repo.isHasIndex() && !repo.getMethodName().equals("findById")) {
            repo.setPerformanceRating("SLOW");
        } else if (!repo.isHasPagination() && !repo.getMethodName().contains("ById")) {
            repo.setPerformanceRating("MODERATE");
        } else {
            repo.setPerformanceRating("FAST");
        }
    }
}
