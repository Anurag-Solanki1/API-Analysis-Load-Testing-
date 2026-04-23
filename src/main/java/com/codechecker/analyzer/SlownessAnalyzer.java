package com.codechecker.analyzer;

import com.codechecker.model.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Optional;

/**
 * SlownessAnalyzer — Agent Component #5
 * 
 * Applies A2 rules to detect performance issues on each endpoint.
 * Estimates p50/p95 timing and generates issues for slow patterns.
 */
@Service
public class SlownessAnalyzer {

    private static final Logger log = LoggerFactory.getLogger(SlownessAnalyzer.class);

    /**
     * Analyze an endpoint for slowness patterns and estimate timing.
     */
    public void analyze(EndpointInfo endpoint) {
        int totalP50 = 15; // base: HTTP routing (10ms) + controller binding (5ms)

        // Check each service call
        for (ServiceCallInfo svc : endpoint.getServiceCalls()) {
            totalP50 += analyzeServiceCall(svc, endpoint);
        }

        // Add response mapping overhead
        totalP50 += 3;

        // Set timing estimates
        endpoint.setEstimatedP50Ms(totalP50);
        endpoint.setEstimatedP95Ms((int) (totalP50 * 2.5)); // p95 ≈ 2.5x p50

        // Rate the endpoint
        int p95 = endpoint.getEstimatedP95Ms();
        if (p95 < 200) {
            endpoint.setPerformanceRating("FAST");
        } else if (p95 < 1000) {
            endpoint.setPerformanceRating("MODERATE");
        } else if (p95 < 3000) {
            endpoint.setPerformanceRating("SLOW");
        } else {
            endpoint.setPerformanceRating("CRITICAL");
        }

        // Run all A2 rules
        checkN1Query(endpoint);
        checkFindAllNoPaging(endpoint);
        checkSyncRestCall(endpoint);
        checkRestCallInTx(endpoint);
        checkNoRestTimeout(endpoint);
        checkNoCircuitBreaker(endpoint);
        checkMissingCache(endpoint);
        checkSaveInLoop(endpoint);
        checkNoSoapTimeout(endpoint);
        checkSoapInTx(endpoint);

        log.debug("Analyzed {} {} — rating: {}, p50: {}ms, p95: {}ms, issues: {}",
                endpoint.getHttpMethod(), endpoint.getPath(),
                endpoint.getPerformanceRating(),
                endpoint.getEstimatedP50Ms(), endpoint.getEstimatedP95Ms(),
                endpoint.getIssues().size());
    }

    private int analyzeServiceCall(ServiceCallInfo svc, EndpointInfo endpoint) {
        int cost = 5; // base service method cost

        // Check repository calls
        for (RepositoryCallInfo repo : svc.getRepoCalls()) {
            int repoCost = repo.getEstimatedMs() > 0 ? repo.getEstimatedMs() : 10;
            if (repo.isInsideLoop()) {
                int iterations = repo.getEstimatedIterations() > 0 ? repo.getEstimatedIterations() : 10;
                cost += repoCost * iterations;
            } else {
                cost += repoCost;
            }
        }

        // Check external calls
        for (ExternalCallInfo ext : svc.getExternalCalls()) {
            if (!ext.isAsync()) {
                cost += ext.getEstimatedMs() > 0 ? ext.getEstimatedMs() : 500;
            }
        }

        // Check nested service calls recursively
        for (ServiceCallInfo nested : svc.getNestedServiceCalls()) {
            cost += analyzeServiceCall(nested, endpoint);
        }

        svc.setEstimatedMs(cost);
        return svc.isAsync() ? 0 : cost;
    }

    // ═══════════ A2 RULES ═══════════

    /** A2-001: N+1 Query — repo call inside loop */
    private void checkN1Query(EndpointInfo endpoint) {
        for (ServiceCallInfo svc : endpoint.getServiceCalls()) {
            for (RepositoryCallInfo repo : svc.getRepoCalls()) {
                if (repo.isInsideLoop()) {
                    IssueInfo issue = IssueInfo.create("A2-001", "CRITICAL",
                            "N+1 Query — " + repo.getClassName() + "." + repo.getMethodName() + "() called in loop");
                    issue.setDescription("Repository method called inside a loop causes N+1 query pattern. " +
                            "Each iteration fires a separate DB query.");
                    issue.setFile(endpoint.getControllerClass() + " → " + svc.getClassName());
                    issue.setLineNumber(repo.getLineNumber());
                    issue.setBeforeCode("for(item : items) { " + repo.getClassName() + "." + repo.getMethodName() + "(item.getId()); }");
                    issue.setAfterCode("@EntityGraph(attributePaths={\"field\"}) on repository method — 1 query replaces N+1");
                    issue.setAutoFixed(true);
                    issue.setAffectedEndpoint(endpoint.getHttpMethod() + " " + endpoint.getPath());
                    endpoint.addIssue(issue);
                }
            }
            checkNestedN1(svc.getNestedServiceCalls(), endpoint);
        }
    }

    private void checkNestedN1(java.util.List<ServiceCallInfo> calls, EndpointInfo endpoint) {
        for (ServiceCallInfo svc : calls) {
            for (RepositoryCallInfo repo : svc.getRepoCalls()) {
                if (repo.isInsideLoop()) {
                    IssueInfo issue = IssueInfo.create("A2-001", "CRITICAL",
                            "N+1 Query — " + repo.getClassName() + "." + repo.getMethodName() + "() in nested loop");
                    issue.setAffectedEndpoint(endpoint.getHttpMethod() + " " + endpoint.getPath());
                    endpoint.addIssue(issue);
                }
            }
            checkNestedN1(svc.getNestedServiceCalls(), endpoint);
        }
    }

    /** A2-002: findAll() without Pageable */
    private void checkFindAllNoPaging(EndpointInfo endpoint) {
        for (ServiceCallInfo svc : endpoint.getServiceCalls()) {
            for (RepositoryCallInfo repo : svc.getRepoCalls()) {
                if (repo.getMethodName() != null && repo.getMethodName().equals("findAll") && !repo.isHasPagination()) {
                    IssueInfo issue = IssueInfo.create("A2-002", "CRITICAL",
                            "findAll() without pagination — " + repo.getClassName());
                    issue.setDescription("findAll() loads entire table into heap memory on every call.");
                    issue.setBeforeCode(repo.getClassName() + ".findAll()");
                    issue.setAfterCode(repo.getClassName() + ".findAll(PageRequest.of(0, 20))");
                    issue.setAutoFixed(true);
                    issue.setAffectedEndpoint(endpoint.getHttpMethod() + " " + endpoint.getPath());
                    endpoint.addIssue(issue);
                }
            }
        }
    }

    /** A2-003: Sync REST call on request thread */
    private void checkSyncRestCall(EndpointInfo endpoint) {
        for (ExternalCallInfo ext : endpoint.getExternalCalls()) {
            if ("REST".equals(ext.getType()) && !ext.isAsync()) {
                IssueInfo issue = IssueInfo.create("A2-003", "HIGH",
                        "Synchronous REST call — " + ext.getCallingClass() + "." + ext.getCallingMethod() + "()");
                issue.setDescription("REST call blocks the request thread for entire external call duration.");
                issue.setBeforeCode("restTemplate.postForObject(url, body, Response.class)");
                issue.setAfterCode("@Async CompletableFuture<Response> — wrap in async method");
                issue.setAffectedEndpoint(endpoint.getHttpMethod() + " " + endpoint.getPath());
                endpoint.addIssue(issue);
            }
        }
    }

    /** A2-004: External call inside @Transactional */
    private void checkRestCallInTx(EndpointInfo endpoint) {
        for (ExternalCallInfo ext : endpoint.getExternalCalls()) {
            if (ext.isInsideTransaction() && "REST".equals(ext.getType())) {
                IssueInfo issue = IssueInfo.create("A2-004", "CRITICAL",
                        "REST call inside @Transactional — DB connection held during external call");
                issue.setDescription("DB connection occupied during entire external REST call. " +
                        "Under load → connection pool exhaustion.");
                issue.setBeforeCode("@Transactional public void process() { restTemplate.post(...); }");
                issue.setAfterCode("Move external call to separate non-@Transactional method");
                issue.setAffectedEndpoint(endpoint.getHttpMethod() + " " + endpoint.getPath());
                endpoint.addIssue(issue);
            }
        }
    }

    /** A2-005: No timeout on REST client */
    private void checkNoRestTimeout(EndpointInfo endpoint) {
        for (ExternalCallInfo ext : endpoint.getExternalCalls()) {
            if ("REST".equals(ext.getType()) && !ext.isHasTimeout()) {
                IssueInfo issue = IssueInfo.create("A2-005", "HIGH",
                        "No timeout on REST client — " + ext.getUrl());
                issue.setDescription("If external service hangs, thread blocked indefinitely.");
                issue.setAfterCode("setConnectTimeout(3000) + setReadTimeout(10000)");
                issue.setAffectedEndpoint(endpoint.getHttpMethod() + " " + endpoint.getPath());
                endpoint.addIssue(issue);
            }
        }
    }

    /** A2-006: No circuit breaker on external call */
    private void checkNoCircuitBreaker(EndpointInfo endpoint) {
        for (ExternalCallInfo ext : endpoint.getExternalCalls()) {
            if (!ext.isHasCircuitBreaker()) {
                IssueInfo issue = IssueInfo.create("A2-006", "MEDIUM",
                        "No circuit breaker on external call — " + ext.getUrl());
                issue.setAfterCode("@CircuitBreaker(name=\"cb\", fallbackMethod=\"fallback\")");
                issue.setAffectedEndpoint(endpoint.getHttpMethod() + " " + endpoint.getPath());
                endpoint.addIssue(issue);
            }
        }
    }

    /** A2-007: No @Cacheable on stable GET endpoint */
    private void checkMissingCache(EndpointInfo endpoint) {
        if ("GET".equals(endpoint.getHttpMethod()) && endpoint.getPerformanceRating() != null) {
            // Check if any service call could benefit from caching
            // (simplified — in real impl, check if data is stable/reference)
        }
    }

    /** A2-008: save() in loop */
    private void checkSaveInLoop(EndpointInfo endpoint) {
        for (ServiceCallInfo svc : endpoint.getServiceCalls()) {
            for (RepositoryCallInfo repo : svc.getRepoCalls()) {
                if (repo.isInsideLoop() && repo.getMethodName() != null
                        && repo.getMethodName().startsWith("save")) {
                    IssueInfo issue = IssueInfo.create("A2-008", "CRITICAL",
                            "save() in loop — row-by-row inserts in " + repo.getClassName());
                    issue.setBeforeCode("for(item : list) { repo.save(item); }");
                    issue.setAfterCode("repo.saveAll(list); // + hibernate.jdbc.batch_size=50");
                    issue.setAutoFixed(true);
                    issue.setAffectedEndpoint(endpoint.getHttpMethod() + " " + endpoint.getPath());
                    endpoint.addIssue(issue);
                }
            }
        }
    }

    /** A2-009: No timeout on SOAP client */
    private void checkNoSoapTimeout(EndpointInfo endpoint) {
        for (ExternalCallInfo ext : endpoint.getExternalCalls()) {
            if ("SOAP".equals(ext.getType()) && !ext.isHasTimeout()) {
                IssueInfo issue = IssueInfo.create("A2-009", "HIGH",
                        "No timeout on SOAP client — " + ext.getUrl());
                issue.setAfterCode("HttpComponentsMessageSender with connection+read timeout");
                issue.setAffectedEndpoint(endpoint.getHttpMethod() + " " + endpoint.getPath());
                endpoint.addIssue(issue);
            }
        }
    }

    /** A2-010: SOAP call inside @Transactional */
    private void checkSoapInTx(EndpointInfo endpoint) {
        for (ExternalCallInfo ext : endpoint.getExternalCalls()) {
            if ("SOAP".equals(ext.getType()) && ext.isInsideTransaction()) {
                IssueInfo issue = IssueInfo.create("A2-010", "CRITICAL",
                        "SOAP call inside @Transactional — DB connection held during SOAP call");
                issue.setAfterCode("Move SOAP call outside @Transactional method");
                issue.setAffectedEndpoint(endpoint.getHttpMethod() + " " + endpoint.getPath());
                endpoint.addIssue(issue);
            }
        }
    }
}
