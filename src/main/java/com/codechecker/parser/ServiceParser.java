package com.codechecker.parser;

import com.codechecker.model.*;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;

/**
 * ServiceParser — Agent Component #3
 *
 * For each endpoint, recursively traces the call chain through service layers
 * until it hits a terminal: DB call, external HTTP/SOAP call, or return.
 *
 * Detects:
 *  - Loop context (N+1 risk)
 *  - Conditional branches (if/else/switch)
 *  - @Transactional boundaries
 *  - @Async methods
 *  - @Cacheable annotations
 *  - Recursive/nested service calls
 */
@Service
public class ServiceParser {

    private static final Logger log = LoggerFactory.getLogger(ServiceParser.class);

    // Max recursion depth to prevent infinite loops on circular dependencies
    private static final int MAX_DEPTH = 10;

    // Known external call patterns
    private static final Set<String> REST_CALL_METHODS = Set.of(
            "getForObject", "getForEntity", "postForObject", "postForEntity",
            "exchange", "execute", "put", "delete", "patchForObject",
            "block", "retrieve", "bodyToMono", "bodyToFlux"
    );

    private static final Set<String> SOAP_CALL_METHODS = Set.of(
            "marshalSendAndReceive", "sendAndReceive", "sendSourceAndReceive",
            "sendSourceAndReceiveToResult"
    );

    private static final Set<String> REPO_INDICATORS = Set.of(
            "Repository", "Repo", "DAO", "Dao", "JpaRepository",
            "CrudRepository", "PagingAndSortingRepository"
    );

    /**
     * Trace the call chain for an endpoint through all service files.
     * Updates the endpoint's serviceCalls, repoCalls, and externalCalls.
     */
    public void traceChain(EndpointInfo endpoint, List<Path> serviceFiles,
                           List<Path> repoFiles, List<Path> allFiles) {

        // Build a map of className -> parsed CompilationUnit for fast lookup
        Map<String, CompilationUnit> classMap = new HashMap<>();
        Map<String, Path> classPathMap = new HashMap<>();
        for (Path file : allFiles) {
            try {
                CompilationUnit cu = StaticJavaParser.parse(file);
                cu.findAll(ClassOrInterfaceDeclaration.class).forEach(c -> {
                    classMap.put(c.getNameAsString(), cu);
                    classPathMap.put(c.getNameAsString(), file);
                });
            } catch (Exception e) {
                log.debug("Could not parse file for class map: {}", file.getFileName());
            }
        }

        // For each service call from the controller, trace recursively
        Set<String> visited = new HashSet<>();
        List<ServiceCallInfo> enrichedCalls = new ArrayList<>();

        for (ServiceCallInfo svcCall : endpoint.getServiceCalls()) {
            ServiceCallInfo enriched = traceServiceMethod(
                    svcCall.getClassName(), svcCall.getMethodName(),
                    classMap, classPathMap, visited, 0
            );
            if (enriched != null) {
                // Preserve original metadata from controller parser
                enriched.setLineNumber(svcCall.getLineNumber());
                enriched.setConditional(svcCall.isConditional());
                enriched.setCondition(svcCall.getCondition());
                enriched.setInsideLoop(svcCall.isInsideLoop());
                enrichedCalls.add(enriched);

                // Collect all external calls and bubble up to endpoint level
                collectExternalCalls(enriched, endpoint);
            } else {
                enrichedCalls.add(svcCall);
            }
        }

        endpoint.setServiceCalls(enrichedCalls);
    }

    /**
     * Recursively trace a service method's call chain.
     */
    private ServiceCallInfo traceServiceMethod(String className, String methodName,
                                                Map<String, CompilationUnit> classMap,
                                                Map<String, Path> classPathMap,
                                                Set<String> visited, int depth) {

        String key = className + "." + methodName;
        if (depth > MAX_DEPTH || visited.contains(key)) {
            return null; // Prevent infinite recursion
        }
        visited.add(key);

        CompilationUnit cu = classMap.get(className);
        if (cu == null) {
            // Try partial match (field name vs class name)
            for (Map.Entry<String, CompilationUnit> entry : classMap.entrySet()) {
                if (entry.getKey().toLowerCase().contains(className.toLowerCase())) {
                    cu = entry.getValue();
                    className = entry.getKey();
                    break;
                }
            }
            if (cu == null) return null;
        }

        String finalClassName = className;
        CompilationUnit finalCu = cu;

        // Find the class declaration
        Optional<ClassOrInterfaceDeclaration> classDecl = cu.findAll(ClassOrInterfaceDeclaration.class)
                .stream()
                .filter(c -> c.getNameAsString().equals(finalClassName))
                .findFirst();

        if (classDecl.isEmpty()) return null;

        ClassOrInterfaceDeclaration clazz = classDecl.get();

        // Find the method
        Optional<MethodDeclaration> methodDecl = clazz.getMethods().stream()
                .filter(m -> m.getNameAsString().equals(methodName))
                .findFirst();

        if (methodDecl.isEmpty()) return null;

        MethodDeclaration method = methodDecl.get();

        ServiceCallInfo info = new ServiceCallInfo();
        info.setClassName(className);
        info.setMethodName(methodName);
        info.setLineNumber(method.getBegin().map(p -> p.line).orElse(0));

        // Check annotations
        info.setTransactional(hasAnnotation(method, "Transactional"));
        if (info.isTransactional()) {
            info.setTransactionalPropagation(extractAnnotationValue(method, "Transactional").orElse("REQUIRED"));
        }
        info.setAsync(hasAnnotation(method, "Async"));

        // Detect injected fields in the class for matching method calls
        Map<String, String> fieldTypes = extractFieldTypes(clazz);

        // Walk through the method body and analyze each statement
        method.getBody().ifPresent(body -> {
            analyzeBlock(body, info, fieldTypes, classMap, classPathMap, visited, depth, false);
        });

        return info;
    }

    /**
     * Analyze a block of statements for service/repo/external calls.
     */
    private void analyzeBlock(BlockStmt block, ServiceCallInfo parentInfo,
                              Map<String, String> fieldTypes,
                              Map<String, CompilationUnit> classMap,
                              Map<String, Path> classPathMap,
                              Set<String> visited, int depth, boolean insideLoop) {

        for (com.github.javaparser.ast.Node stmt : block.getChildNodes()) {

            // Handle for-each loops
            if (stmt instanceof ForEachStmt forEach) {
                forEach.getBody().findAll(MethodCallExpr.class).forEach(call ->
                        processMethodCall(call, parentInfo, fieldTypes, classMap, classPathMap,
                                visited, depth, true, null));

                if (forEach.getBody() instanceof BlockStmt loopBody) {
                    analyzeBlock(loopBody, parentInfo, fieldTypes, classMap, classPathMap,
                            visited, depth, true);
                }
                continue;
            }

            // Handle for loops
            if (stmt instanceof ForStmt forStmt) {
                forStmt.getBody().findAll(MethodCallExpr.class).forEach(call ->
                        processMethodCall(call, parentInfo, fieldTypes, classMap, classPathMap,
                                visited, depth, true, null));
                continue;
            }

            // Handle while loops
            if (stmt instanceof WhileStmt whileStmt) {
                whileStmt.getBody().findAll(MethodCallExpr.class).forEach(call ->
                        processMethodCall(call, parentInfo, fieldTypes, classMap, classPathMap,
                                visited, depth, true, null));
                continue;
            }

            // Handle if/else conditions
            if (stmt instanceof IfStmt ifStmt) {
                String condition = ifStmt.getCondition().toString();

                // Process then branch
                ifStmt.getThenStmt().findAll(MethodCallExpr.class).forEach(call ->
                        processMethodCall(call, parentInfo, fieldTypes, classMap, classPathMap,
                                visited, depth, insideLoop, condition));

                // Process else branch
                ifStmt.getElseStmt().ifPresent(elseStmt ->
                        elseStmt.findAll(MethodCallExpr.class).forEach(call ->
                                processMethodCall(call, parentInfo, fieldTypes, classMap, classPathMap,
                                        visited, depth, insideLoop, "NOT(" + condition + ")")));
                continue;
            }

            // Handle try blocks
            if (stmt instanceof TryStmt tryStmt) {
                tryStmt.getTryBlock().findAll(MethodCallExpr.class).forEach(call ->
                        processMethodCall(call, parentInfo, fieldTypes, classMap, classPathMap,
                                visited, depth, insideLoop, null));
                continue;
            }

            // Handle expression statements (most method calls)
            if (stmt instanceof ExpressionStmt exprStmt) {
                exprStmt.findAll(MethodCallExpr.class).forEach(call ->
                        processMethodCall(call, parentInfo, fieldTypes, classMap, classPathMap,
                                visited, depth, insideLoop, null));
                continue;
            }

            // Handle return statements
            if (stmt instanceof ReturnStmt returnStmt) {
                returnStmt.findAll(MethodCallExpr.class).forEach(call ->
                        processMethodCall(call, parentInfo, fieldTypes, classMap, classPathMap,
                                visited, depth, insideLoop, null));
            }
        }
    }

    /**
     * Process a single method call expression — determine if it's a service, repo, or external call.
     */
    private void processMethodCall(MethodCallExpr call, ServiceCallInfo parentInfo,
                                    Map<String, String> fieldTypes,
                                    Map<String, CompilationUnit> classMap,
                                    Map<String, Path> classPathMap,
                                    Set<String> visited, int depth,
                                    boolean insideLoop, String condition) {

        call.getScope().ifPresent(scope -> {
            String scopeName = scope.toString();
            String calledMethodName = call.getNameAsString();
            int line = call.getBegin().map(p -> p.line).orElse(0);

            // Resolve the actual type from field declarations
            String resolvedType = fieldTypes.getOrDefault(scopeName, scopeName);

            // Check if this is a repository call
            if (isRepositoryCall(resolvedType, calledMethodName)) {
                RepositoryCallInfo repoCall = new RepositoryCallInfo();
                repoCall.setClassName(resolvedType);
                repoCall.setMethodName(calledMethodName);
                repoCall.setLineNumber(line);
                repoCall.setInsideLoop(insideLoop);
                if (insideLoop) {
                    repoCall.setEstimatedIterations(10); // default assumption
                }
                repoCall.setEstimatedMs(estimateRepoCallTime(calledMethodName));

                // Detect method naming patterns for query analysis
                detectQueryCharacteristics(repoCall, calledMethodName);

                parentInfo.getRepoCalls().add(repoCall);
                return;
            }

            // Check if this is a REST external call
            if (REST_CALL_METHODS.contains(calledMethodName) || isRestTemplateCall(resolvedType)) {
                ExternalCallInfo extCall = new ExternalCallInfo();
                extCall.setType("REST");
                extCall.setCallingClass(parentInfo.getClassName());
                extCall.setCallingMethod(parentInfo.getMethodName());
                extCall.setLineNumber(line);
                extCall.setInsideTransaction(parentInfo.isTransactional());
                extCall.setConditional(condition != null);
                extCall.setCondition(condition);
                extCall.setEstimatedMs(500); // default REST call estimate

                // Try to extract URL from arguments
                extractUrlFromArgs(call, extCall);

                // Detect HTTP method
                detectHttpMethod(calledMethodName, extCall);

                parentInfo.getExternalCalls().add(extCall);
                return;
            }

            // Check if this is a SOAP call
            if (SOAP_CALL_METHODS.contains(calledMethodName) || isSoapCall(resolvedType)) {
                ExternalCallInfo extCall = new ExternalCallInfo();
                extCall.setType("SOAP");
                extCall.setCallingClass(parentInfo.getClassName());
                extCall.setCallingMethod(parentInfo.getMethodName());
                extCall.setLineNumber(line);
                extCall.setInsideTransaction(parentInfo.isTransactional());
                extCall.setConditional(condition != null);
                extCall.setCondition(condition);
                extCall.setEstimatedMs(800); // SOAP calls tend to be slower

                parentInfo.getExternalCalls().add(extCall);
                return;
            }

            // Otherwise it might be another service call — trace recursively
            if (classMap.containsKey(resolvedType) || looksLikeServiceField(scopeName, resolvedType)) {
                ServiceCallInfo nestedCall = traceServiceMethod(
                        resolvedType, calledMethodName,
                        classMap, classPathMap, new HashSet<>(visited), depth + 1
                );
                if (nestedCall != null) {
                    nestedCall.setInsideLoop(insideLoop);
                    nestedCall.setConditional(condition != null);
                    nestedCall.setCondition(condition);
                    parentInfo.getNestedServiceCalls().add(nestedCall);
                }
            }
        });
    }

    // ─── Detection Helpers ───

    private boolean isRepositoryCall(String typeName, String methodName) {
        for (String indicator : REPO_INDICATORS) {
            if (typeName.contains(indicator)) return true;
        }
        // Common Spring Data method names
        return Set.of("save", "saveAll", "findById", "findAll", "findBy",
                "deleteById", "delete", "deleteAll", "count", "existsById",
                "flush", "saveAndFlush").contains(methodName)
                && !typeName.contains("Service") && !typeName.contains("Controller");
    }

    private boolean isRestTemplateCall(String typeName) {
        return typeName.contains("restTemplate") || typeName.contains("RestTemplate")
                || typeName.contains("webClient") || typeName.contains("WebClient")
                || typeName.contains("feignClient") || typeName.contains("FeignClient")
                || typeName.contains("httpClient") || typeName.contains("HttpClient");
    }

    private boolean isSoapCall(String typeName) {
        return typeName.contains("webServiceTemplate") || typeName.contains("WebServiceTemplate")
                || typeName.contains("soapClient") || typeName.contains("ServicePort")
                || typeName.contains("_Service") || typeName.contains("Stub");
    }

    private boolean looksLikeServiceField(String fieldName, String typeName) {
        String lower = (fieldName + typeName).toLowerCase();
        return lower.contains("service") || lower.contains("helper")
                || lower.contains("handler") || lower.contains("processor")
                || lower.contains("manager") || lower.contains("facade")
                || lower.contains("delegate") || lower.contains("validator")
                || lower.contains("mapper") || lower.contains("converter");
    }

    private void detectQueryCharacteristics(RepositoryCallInfo repo, String methodName) {
        // Spring Data derived query method name analysis
        if (methodName.equals("findAll")) {
            repo.setSelectStar(true);
            repo.setQueryType("SPRING_DATA_DERIVED");
        } else if (methodName.startsWith("findBy") || methodName.startsWith("findAll")) {
            repo.setQueryType("SPRING_DATA_DERIVED");
            repo.setSelectStar(true); // Spring Data returns full entity by default
            // Check if it might have pagination (method with Pageable param)
        } else if (methodName.startsWith("save") || methodName.startsWith("delete")) {
            repo.setQueryType("SPRING_DATA_WRITE");
            repo.setEstimatedMs(5);
        } else if (methodName.equals("findById") || methodName.equals("getById") || methodName.equals("getReferenceById")) {
            repo.setQueryType("SPRING_DATA_DERIVED");
            repo.setHasIndex(true); // PK lookups are always indexed
            repo.setSelectStar(true);
            repo.setEstimatedMs(5);
        } else if (methodName.startsWith("count") || methodName.startsWith("exists")) {
            repo.setQueryType("SPRING_DATA_DERIVED");
            repo.setEstimatedMs(5);
        } else {
            repo.setQueryType("UNKNOWN");
        }
    }

    private int estimateRepoCallTime(String methodName) {
        if (methodName.equals("findById") || methodName.equals("existsById")
                || methodName.startsWith("count")) {
            return 5; // PK lookup
        }
        if (methodName.startsWith("save") || methodName.startsWith("delete")) {
            return 5; // Write ops
        }
        if (methodName.equals("findAll")) {
            return 50; // Full table scan
        }
        return 15; // Default estimated DB call
    }

    private void extractUrlFromArgs(MethodCallExpr call, ExternalCallInfo extCall) {
        if (!call.getArguments().isEmpty()) {
            String firstArg = call.getArgument(0).toString();
            // Clean up string literals
            firstArg = firstArg.replace("\"", "").trim();
            if (firstArg.startsWith("http") || firstArg.startsWith("$")) {
                extCall.setUrl(firstArg);
            } else {
                extCall.setUrl("RESOLVED_AT_RUNTIME");
            }
        }
    }

    private void detectHttpMethod(String calledMethodName, ExternalCallInfo extCall) {
        if (calledMethodName.contains("get") || calledMethodName.contains("Get")) {
            extCall.setHttpMethod("GET");
        } else if (calledMethodName.contains("post") || calledMethodName.contains("Post")) {
            extCall.setHttpMethod("POST");
        } else if (calledMethodName.contains("put") || calledMethodName.contains("Put")) {
            extCall.setHttpMethod("PUT");
        } else if (calledMethodName.contains("delete") || calledMethodName.contains("Delete")) {
            extCall.setHttpMethod("DELETE");
        } else if (calledMethodName.contains("patch") || calledMethodName.contains("Patch")) {
            extCall.setHttpMethod("PATCH");
        } else {
            extCall.setHttpMethod("UNKNOWN");
        }
    }

    /**
     * Extract @Autowired / @Inject field types from the class.
     * Returns map of fieldName -> typeName.
     */
    private Map<String, String> extractFieldTypes(ClassOrInterfaceDeclaration clazz) {
        Map<String, String> fieldTypes = new HashMap<>();

        clazz.getFields().forEach(field -> {
            String typeName = field.getElementType().asString();
            field.getVariables().forEach(var -> {
                fieldTypes.put(var.getNameAsString(), typeName);
            });
        });

        // Also check constructor parameters
        clazz.getConstructors().forEach(constructor -> {
            constructor.getParameters().forEach(param -> {
                fieldTypes.put(param.getNameAsString(), param.getType().asString());
            });
        });

        return fieldTypes;
    }

    /**
     * Collect all external calls from nested service calls and add to endpoint level.
     */
    private void collectExternalCalls(ServiceCallInfo svc, EndpointInfo endpoint) {
        for (ExternalCallInfo ext : svc.getExternalCalls()) {
            endpoint.addExternalCall(ext);
        }
        for (ServiceCallInfo nested : svc.getNestedServiceCalls()) {
            collectExternalCalls(nested, endpoint);
        }
    }

    // ─── Annotation Utilities ───

    private boolean hasAnnotation(MethodDeclaration method, String name) {
        return method.getAnnotations().stream()
                .anyMatch(a -> a.getNameAsString().equals(name));
    }

    private Optional<String> extractAnnotationValue(MethodDeclaration method, String name) {
        return method.getAnnotations().stream()
                .filter(a -> a.getNameAsString().equals(name))
                .findFirst()
                .flatMap(a -> {
                    if (a instanceof NormalAnnotationExpr normal) {
                        for (var pair : normal.getPairs()) {
                            return Optional.of(pair.getValue().toString());
                        }
                    }
                    return Optional.empty();
                });
    }
}
