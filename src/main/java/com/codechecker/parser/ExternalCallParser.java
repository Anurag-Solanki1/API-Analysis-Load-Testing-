package com.codechecker.parser;

import com.codechecker.model.ExternalCallInfo;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.expr.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Path;
import java.util.*;

/**
 * ExternalCallParser — Agent Component #5
 *
 * Scans all service/controller files for outbound REST and SOAP calls.
 * Detects:
 *  - RestTemplate calls (getForObject, exchange, postForEntity, etc.)
 *  - WebClient calls (retrieve, bodyToMono, bodyToFlux)
 *  - Feign client method calls (interfaces with @FeignClient)
 *  - WebServiceTemplate SOAP calls
 *  - Manual HttpURLConnection / HttpClient usage
 *  - Timeout configuration present/absent
 *  - Circuit breaker annotations (@CircuitBreaker, @Retry)
 *  - Whether call is inside @Transactional method
 *  - Whether call is @Async
 */
@Service
public class ExternalCallParser {

    private static final Logger log = LoggerFactory.getLogger(ExternalCallParser.class);

    // REST clients
    private static final Set<String> REST_CLIENT_TYPES = Set.of(
            "RestTemplate", "WebClient", "HttpClient", "OkHttpClient",
            "FeignClient", "RestOperations", "AsyncRestTemplate"
    );

    private static final Map<String, String> REST_METHOD_MAP = Map.ofEntries(
            Map.entry("getForObject", "GET"), Map.entry("getForEntity", "GET"),
            Map.entry("postForObject", "POST"), Map.entry("postForEntity", "POST"),
            Map.entry("put", "PUT"), Map.entry("patchForObject", "PATCH"),
            Map.entry("delete", "DELETE"), Map.entry("exchange", "DYNAMIC"),
            Map.entry("execute", "DYNAMIC"),
            // WebClient
            Map.entry("get", "GET"), Map.entry("post", "POST"),
            Map.entry("retrieve", "DYNAMIC")
    );

    // SOAP clients
    private static final Set<String> SOAP_CLIENT_TYPES = Set.of(
            "WebServiceTemplate", "WebServiceGatewaySupport",
            "SoapClient", "JaxWsPortProxyFactoryBean"
    );

    private static final Set<String> SOAP_METHODS = Set.of(
            "marshalSendAndReceive", "sendAndReceive",
            "sendSourceAndReceive", "sendSourceAndReceiveToResult",
            "callWebService"
    );

    /**
     * Scan a file for all external REST and SOAP calls.
     */
    public List<ExternalCallInfo> parseFile(Path javaFile) {
        List<ExternalCallInfo> calls = new ArrayList<>();

        try {
            CompilationUnit cu = StaticJavaParser.parse(javaFile);

            cu.findAll(ClassOrInterfaceDeclaration.class).forEach(classDecl -> {
                String className = classDecl.getNameAsString();

                // Check if class has @FeignClient → all its methods are REST calls
                if (hasAnnotation(classDecl, "FeignClient")) {
                    parseFeignClient(classDecl, className, calls);
                    return;
                }

                // Extract field types for scope resolution
                Map<String, String> fieldTypes = extractFieldTypes(classDecl);

                // Check which fields are timeout-configured
                Set<String> timeoutConfigured = detectTimeoutConfig(classDecl);

                classDecl.getMethods().forEach(method -> {
                    String methodName = method.getNameAsString();
                    boolean isTransactional = hasAnnotation(method, "Transactional");
                    boolean isAsync = hasAnnotation(method, "Async");
                    boolean hasCircuitBreaker = hasAnnotation(method, "CircuitBreaker")
                            || hasAnnotation(method, "Retry")
                            || hasAnnotation(method, "Bulkhead");

                    method.findAll(MethodCallExpr.class).forEach(call -> {
                        call.getScope().ifPresent(scope -> {
                            String scopeName = scope.toString();
                            String calledMethodName = call.getNameAsString();
                            String resolvedType = fieldTypes.getOrDefault(scopeName, scopeName);
                            int line = call.getBegin().map(p -> p.line).orElse(0);

                            // REST call detection
                            if (isRestClient(resolvedType, calledMethodName)) {
                                ExternalCallInfo ext = new ExternalCallInfo();
                                ext.setType("REST");
                                ext.setCallingClass(className);
                                ext.setCallingMethod(methodName);
                                ext.setLineNumber(line);
                                ext.setInsideTransaction(isTransactional);
                                ext.setAsync(isAsync);
                                ext.setHasCircuitBreaker(hasCircuitBreaker);
                                ext.setHasTimeout(timeoutConfigured.contains(scopeName));

                                // Detect HTTP method
                                String httpMethod = REST_METHOD_MAP.getOrDefault(calledMethodName, "UNKNOWN");
                                ext.setHttpMethod(httpMethod);

                                // Extract URL
                                extractUrl(call, ext);

                                // Check condition context
                                checkConditionContext(call, ext);

                                ext.setEstimatedMs(500); // default

                                calls.add(ext);
                                log.debug("Found REST call: {}.{}.{} → {} {}",
                                        className, methodName, line, httpMethod, ext.getUrl());
                            }

                            // SOAP call detection
                            else if (isSoapClient(resolvedType, calledMethodName)) {
                                ExternalCallInfo ext = new ExternalCallInfo();
                                ext.setType("SOAP");
                                ext.setCallingClass(className);
                                ext.setCallingMethod(methodName);
                                ext.setLineNumber(line);
                                ext.setInsideTransaction(isTransactional);
                                ext.setAsync(isAsync);
                                ext.setHasCircuitBreaker(hasCircuitBreaker);
                                ext.setHasTimeout(timeoutConfigured.contains(scopeName));

                                extractUrl(call, ext);
                                checkConditionContext(call, ext);

                                ext.setEstimatedMs(800);

                                calls.add(ext);
                                log.debug("Found SOAP call: {}.{} line {}", className, methodName, line);
                            }
                        });
                    });
                });
            });

        } catch (IOException e) {
            log.error("Could not parse file: {}", javaFile, e);
        } catch (Exception e) {
            log.debug("JavaParser error on: {}", javaFile.getFileName());
        }

        return calls;
    }

    /**
     * Parse @FeignClient interfaces — every method is a REST call.
     */
    private void parseFeignClient(ClassOrInterfaceDeclaration classDecl, String className,
                                   List<ExternalCallInfo> calls) {
        String baseUrl = extractAnnotationValue(classDecl, "FeignClient").orElse("FEIGN_URL");

        classDecl.getMethods().forEach(method -> {
            ExternalCallInfo ext = new ExternalCallInfo();
            ext.setType("REST");
            ext.setCallingClass(className);
            ext.setCallingMethod(method.getNameAsString());
            ext.setLineNumber(method.getBegin().map(p -> p.line).orElse(0));
            ext.setHasTimeout(true); // Feign has built-in timeouts
            ext.setHasCircuitBreaker(false);
            ext.setUrl(baseUrl);

            // Detect HTTP method from annotations
            if (hasAnnotation(method, "GetMapping") || hasAnnotation(method, "GET")) {
                ext.setHttpMethod("GET");
            } else if (hasAnnotation(method, "PostMapping") || hasAnnotation(method, "POST")) {
                ext.setHttpMethod("POST");
            } else if (hasAnnotation(method, "PutMapping") || hasAnnotation(method, "PUT")) {
                ext.setHttpMethod("PUT");
            } else if (hasAnnotation(method, "DeleteMapping") || hasAnnotation(method, "DELETE")) {
                ext.setHttpMethod("DELETE");
            } else {
                ext.setHttpMethod("GET"); // default
            }

            ext.setEstimatedMs(300);
            calls.add(ext);
        });
    }

    // ─── Detection Helpers ───

    private boolean isRestClient(String typeName, String calledMethod) {
        for (String clientType : REST_CLIENT_TYPES) {
            if (typeName.contains(clientType)) return true;
        }
        return REST_METHOD_MAP.containsKey(calledMethod)
                && (typeName.toLowerCase().contains("rest") || typeName.toLowerCase().contains("http")
                || typeName.toLowerCase().contains("client") || typeName.toLowerCase().contains("web"));
    }

    private boolean isSoapClient(String typeName, String calledMethod) {
        for (String soapType : SOAP_CLIENT_TYPES) {
            if (typeName.contains(soapType)) return true;
        }
        return SOAP_METHODS.contains(calledMethod);
    }

    /**
     * Detect if a field has timeout configuration.
     * Checks constructor/factory method building for ClientProperties, timeout config, etc.
     */
    private Set<String> detectTimeoutConfig(ClassOrInterfaceDeclaration classDecl) {
        Set<String> configured = new HashSet<>();
        String classContent = classDecl.toString();

        // Search for timeout patterns
        if (classContent.contains("setConnectTimeout") || classContent.contains("connectTimeout")
                || classContent.contains("setReadTimeout") || classContent.contains("readTimeout")
                || classContent.contains("timeout(") || classContent.contains("Duration.of")) {

            // Mark all REST client fields as having timeout
            classDecl.getFields().forEach(field -> {
                String typeName = field.getElementType().asString();
                if (REST_CLIENT_TYPES.stream().anyMatch(typeName::contains)) {
                    field.getVariables().forEach(v -> configured.add(v.getNameAsString()));
                }
            });
        }

        return configured;
    }

    private void extractUrl(MethodCallExpr call, ExternalCallInfo ext) {
        if (!call.getArguments().isEmpty()) {
            Expression firstArg = call.getArgument(0);
            String argStr = firstArg.toString().replace("\"", "");

            if (argStr.startsWith("http://") || argStr.startsWith("https://")) {
                ext.setUrl(argStr);
            } else if (argStr.contains("://")) {
                ext.setUrl(argStr);
            } else if (argStr.startsWith("$") || argStr.contains("property")) {
                ext.setUrl("RESOLVED_FROM_CONFIG: " + argStr);
            } else {
                ext.setUrl("DYNAMIC_URL: " + truncate(argStr, 60));
            }
        } else {
            ext.setUrl("NOT_FOUND");
        }
    }

    private void checkConditionContext(MethodCallExpr call, ExternalCallInfo ext) {
        var parent = call.getParentNode();
        while (parent.isPresent()) {
            var node = parent.get();
            if (node instanceof com.github.javaparser.ast.stmt.IfStmt ifStmt) {
                ext.setConditional(true);
                ext.setCondition(ifStmt.getCondition().toString());
                return;
            }
            parent = node.getParentNode();
        }
    }

    // ─── Annotation Utilities ───

    private Map<String, String> extractFieldTypes(ClassOrInterfaceDeclaration clazz) {
        Map<String, String> fieldTypes = new HashMap<>();
        clazz.getFields().forEach(field -> {
            String typeName = field.getElementType().asString();
            field.getVariables().forEach(var -> fieldTypes.put(var.getNameAsString(), typeName));
        });
        clazz.getConstructors().forEach(ctor ->
                ctor.getParameters().forEach(p ->
                        fieldTypes.put(p.getNameAsString(), p.getType().asString())));
        return fieldTypes;
    }

    private boolean hasAnnotation(ClassOrInterfaceDeclaration classDecl, String name) {
        return classDecl.getAnnotations().stream().anyMatch(a -> a.getNameAsString().equals(name));
    }

    private boolean hasAnnotation(MethodDeclaration method, String name) {
        return method.getAnnotations().stream().anyMatch(a -> a.getNameAsString().equals(name));
    }

    private Optional<String> extractAnnotationValue(ClassOrInterfaceDeclaration classDecl, String name) {
        return classDecl.getAnnotations().stream()
                .filter(a -> a.getNameAsString().equals(name))
                .findFirst()
                .flatMap(a -> {
                    if (a instanceof SingleMemberAnnotationExpr s) {
                        return Optional.of(s.getMemberValue().toString().replace("\"", ""));
                    }
                    if (a instanceof NormalAnnotationExpr n) {
                        for (var pair : n.getPairs()) {
                            if ("url".equals(pair.getNameAsString()) || "value".equals(pair.getNameAsString())
                                    || "name".equals(pair.getNameAsString())) {
                                return Optional.of(pair.getValue().toString().replace("\"", ""));
                            }
                        }
                    }
                    return Optional.empty();
                });
    }

    private String truncate(String text, int max) {
        return text.length() > max ? text.substring(0, max) + "..." : text;
    }
}
