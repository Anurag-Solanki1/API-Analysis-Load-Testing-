package com.codechecker.parser;

import com.codechecker.model.EndpointInfo;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.expr.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Path;
import java.util.*;

/**
 * ControllerParser — Agent Component #2
 *
 * Uses JavaParser to read the AST of controller files and extract every HTTP
 * endpoint.
 * Supports Spring MVC, JAX-RS (SeedStack), and detects auth/validation
 * annotations.
 */
@Service
public class ControllerParser {

    private static final Logger log = LoggerFactory.getLogger(ControllerParser.class);

    // Spring MVC mapping annotations
    private static final Map<String, String> SPRING_MAPPINGS = Map.of(
            "GetMapping", "GET",
            "PostMapping", "POST",
            "PutMapping", "PUT",
            "DeleteMapping", "DELETE",
            "PatchMapping", "PATCH");

    // JAX-RS method annotations
    private static final Map<String, String> JAXRS_METHODS = Map.of(
            "GET", "GET",
            "POST", "POST",
            "PUT", "PUT",
            "DELETE", "DELETE",
            "PATCH", "PATCH");

    /**
     * Parse a controller file and extract all endpoints.
     */
    public List<EndpointInfo> parse(Path controllerFile) {
        List<EndpointInfo> endpoints = new ArrayList<>();

        try {
            CompilationUnit cu = StaticJavaParser.parse(controllerFile);
            String fileContent = cu.toString();

            cu.findAll(ClassOrInterfaceDeclaration.class).forEach(classDecl -> {
                String className = classDecl.getNameAsString();

                // Determine framework type
                String framework = detectFramework(classDecl);

                // Get class-level base path
                String basePath = extractClassLevelPath(classDecl, framework);

                // Parse each method
                classDecl.getMethods().forEach(method -> {
                    Optional<EndpointInfo> endpoint = extractEndpoint(method, className, basePath, framework,
                            controllerFile);
                    endpoint.ifPresent(ep -> {
                        log.debug("Found endpoint: {} {} in {}", ep.getHttpMethod(), ep.getPath(), className);
                        endpoints.add(ep);
                    });
                });
            });

        } catch (IOException e) {
            log.error("Failed to parse controller: {}", controllerFile, e);
        } catch (Exception e) {
            log.error("JavaParser error on file: {}", controllerFile, e);
        }

        return endpoints;
    }

    private String detectFramework(ClassOrInterfaceDeclaration classDecl) {
        if (hasAnnotation(classDecl, "RestController") || hasAnnotation(classDecl, "Controller")) {
            return "SPRING_MVC";
        }
        if (hasAnnotation(classDecl, "Path")) {
            return "SEEDSTACK_JAXRS";
        }
        // Struts2 — ActionSupport or @Action annotation at class level
        if (classDecl.getExtendedTypes().stream().anyMatch(t -> t.getNameAsString().equals("ActionSupport"))) {
            return "STRUTS2";
        }
        // Struts1 — extends Action, DispatchAction, MappingDispatchAction,
        // LookupDispatchAction
        if (classDecl.getExtendedTypes().stream().anyMatch(t -> {
            String name = t.getNameAsString();
            return name.equals("Action") || name.equals("DispatchAction")
                    || name.equals("MappingDispatchAction") || name.equals("LookupDispatchAction");
        })) {
            return "STRUTS1";
        }
        // JAX-WS SOAP
        if (hasAnnotation(classDecl, "WebService")) {
            return "JAX_WS";
        }
        // Spring-WS SOAP
        if (hasAnnotation(classDecl, "Endpoint")) {
            return "SPRING_WS";
        }
        return "SPRING_MVC"; // default
    }

    private String extractClassLevelPath(ClassOrInterfaceDeclaration classDecl, String framework) {
        if ("SPRING_MVC".equals(framework)) {
            return extractAnnotationValue(classDecl, "RequestMapping")
                    .orElse("");
        }
        if ("SEEDSTACK_JAXRS".equals(framework)) {
            return extractAnnotationValue(classDecl, "Path")
                    .orElse("");
        }
        if ("STRUTS2".equals(framework)) {
            // Struts2 @Namespace annotation defines the namespace prefix
            return extractAnnotationValue(classDecl, "Namespace")
                    .orElse("");
        }
        if ("JAX_WS".equals(framework)) {
            // JAX-WS @WebService serviceName becomes the path prefix
            return extractAnnotationAttributeByName(classDecl, "WebService", "serviceName")
                    .or(() -> extractAnnotationValue(classDecl, "WebService"))
                    .map(s -> "/ws/" + s)
                    .orElse("/ws/" + classDecl.getNameAsString());
        }
        if ("SPRING_WS".equals(framework)) {
            return "/ws";
        }
        return "";
    }

    private Optional<EndpointInfo> extractEndpoint(MethodDeclaration method, String className,
            String basePath, String framework, Path sourceFile) {
        String httpMethod = null;
        String methodPath = "";

        if ("SPRING_MVC".equals(framework)) {
            // Check for @GetMapping, @PostMapping, etc.
            for (Map.Entry<String, String> entry : SPRING_MAPPINGS.entrySet()) {
                if (hasAnnotation(method, entry.getKey())) {
                    httpMethod = entry.getValue();
                    methodPath = extractAnnotationValue(method, entry.getKey()).orElse("");
                    break;
                }
            }

            // Check for @RequestMapping with method attribute
            if (httpMethod == null && hasAnnotation(method, "RequestMapping")) {
                httpMethod = extractRequestMappingMethod(method);
                methodPath = extractAnnotationValue(method, "RequestMapping").orElse("");
            }
        } else if ("SEEDSTACK_JAXRS".equals(framework)) {
            for (Map.Entry<String, String> entry : JAXRS_METHODS.entrySet()) {
                if (hasAnnotation(method, entry.getKey())) {
                    httpMethod = entry.getValue();
                    break;
                }
            }
            methodPath = extractAnnotationValue(method, "Path").orElse("");
        } else if ("STRUTS2".equals(framework)) {
            // Struts2: @Action annotated methods
            if (hasAnnotation(method, "Action")) {
                httpMethod = "POST";
                methodPath = extractAnnotationValue(method, "Action")
                        .orElse(method.getNameAsString()) + ".action";
            }
            // Struts2: execute() is the default action entry point
            else if ("execute".equals(method.getNameAsString())
                    && method.getParameters().isEmpty()) {
                httpMethod = "POST";
                methodPath = "/" + className.replace("Action", "").toLowerCase() + ".action";
            }
            // Struts2: any public String method returning "success"/"input" etc.
            else if (method.isPublic()
                    && method.getType().asString().equals("String")
                    && !method.getNameAsString().startsWith("get")
                    && !method.getNameAsString().startsWith("set")
                    && !method.getNameAsString().startsWith("is")
                    && !method.getNameAsString().equals("validate")
                    && !method.getNameAsString().equals("toString")
                    && !method.getNameAsString().equals("hashCode")
                    && !method.getNameAsString().equals("equals")) {
                httpMethod = "POST";
                methodPath = "/" + method.getNameAsString() + ".action";
            }
        } else if ("STRUTS1".equals(framework)) {
            // Struts1: execute() is the standard entry point
            if ("execute".equals(method.getNameAsString())) {
                httpMethod = "POST";
                methodPath = "/" + className.replace("Action", "").toLowerCase() + ".do";
            }
            // Struts1 DispatchAction: public methods that take the standard 4-param
            // signature
            else if (method.isPublic()
                    && method.getParameters().size() == 4
                    && method.getType().asString().contains("ActionForward")) {
                httpMethod = "POST";
                methodPath = "/" + method.getNameAsString() + ".do";
            }
        } else if ("JAX_WS".equals(framework)) {
            // JAX-WS: @WebMethod annotated methods
            if (hasAnnotation(method, "WebMethod")) {
                httpMethod = "SOAP";
                String opName = extractAnnotationAttributeByName(method, "WebMethod", "operationName")
                        .or(() -> extractAnnotationValue(method, "WebMethod"))
                        .orElse(method.getNameAsString());
                methodPath = "/" + opName;
            }
            // JAX-WS: all public methods on a @WebService class are implicitly exposed
            else if (method.isPublic()
                    && !method.isStatic()
                    && !method.getType().isVoidType()
                    && !method.getNameAsString().startsWith("get")
                    && !method.getNameAsString().startsWith("set")
                    && !method.getNameAsString().equals("toString")
                    && !method.getNameAsString().equals("hashCode")
                    && !method.getNameAsString().equals("equals")) {
                httpMethod = "SOAP";
                methodPath = "/" + method.getNameAsString();
            }
        } else if ("SPRING_WS".equals(framework)) {
            // Spring-WS: @PayloadRoot annotated methods
            if (hasAnnotation(method, "PayloadRoot")) {
                httpMethod = "SOAP";
                String localPart = extractAnnotationAttributeByName(method, "PayloadRoot", "localPart")
                        .orElse(method.getNameAsString());
                methodPath = "/" + localPart;
            }
        }

        if (httpMethod == null) {
            return Optional.empty();
        }

        // Build the endpoint info
        EndpointInfo endpoint = new EndpointInfo();
        endpoint.setHttpMethod(httpMethod);
        endpoint.setPath(normalizePath(basePath + methodPath));
        endpoint.setControllerClass(className);
        endpoint.setControllerMethod(method.getNameAsString());
        endpoint.setControllerLine(method.getBegin().map(p -> p.line).orElse(0));
        endpoint.setFramework(framework);

        // Extract auth
        endpoint.setAuthExpression(extractAuth(method));

        // Extract @Valid
        endpoint.setHasValidation(hasValidation(method));

        // Extract service calls from method body
        extractServiceCalls(method, endpoint);

        return Optional.of(endpoint);
    }

    private String extractAuth(MethodDeclaration method) {
        Optional<String> preAuth = extractAnnotationValue(method, "PreAuthorize");
        if (preAuth.isPresent())
            return preAuth.get();

        Optional<String> secured = extractAnnotationValue(method, "Secured");
        if (secured.isPresent())
            return secured.get();

        Optional<String> rolesAllowed = extractAnnotationValue(method, "RolesAllowed");
        if (rolesAllowed.isPresent())
            return rolesAllowed.get();

        return "NO AUTH";
    }

    private boolean hasValidation(MethodDeclaration method) {
        for (Parameter param : method.getParameters()) {
            if (param.getAnnotations().stream()
                    .anyMatch(a -> a.getNameAsString().equals("Valid"))) {
                return true;
            }
        }
        return false;
    }

    private void extractServiceCalls(MethodDeclaration method, EndpointInfo endpoint) {
        // Find method calls to injected services within the method body
        method.findAll(MethodCallExpr.class).forEach(call -> {
            call.getScope().ifPresent(scope -> {
                String scopeName = scope.toString();
                String methodName = call.getNameAsString();

                // Build a basic service call record
                com.codechecker.model.ServiceCallInfo serviceCall = new com.codechecker.model.ServiceCallInfo();
                serviceCall.setClassName(scopeName);
                serviceCall.setMethodName(methodName);
                serviceCall.setLineNumber(call.getBegin().map(p -> p.line).orElse(0));

                // Check if inside a control flow construct
                checkIfInsideLoop(call, serviceCall);
                checkIfInsideCondition(call, serviceCall);

                endpoint.addServiceCall(serviceCall);
            });
        });
    }

    private void checkIfInsideLoop(MethodCallExpr call, com.codechecker.model.ServiceCallInfo serviceCall) {
        // Walk up AST parents to find enclosing for/while/forEach
        var parent = call.getParentNode();
        while (parent.isPresent()) {
            var node = parent.get();
            if (node instanceof com.github.javaparser.ast.stmt.ForEachStmt
                    || node instanceof com.github.javaparser.ast.stmt.ForStmt
                    || node instanceof com.github.javaparser.ast.stmt.WhileStmt) {
                serviceCall.setInsideLoop(true);
                return;
            }
            parent = node.getParentNode();
        }
    }

    private void checkIfInsideCondition(MethodCallExpr call, com.codechecker.model.ServiceCallInfo serviceCall) {
        var parent = call.getParentNode();
        while (parent.isPresent()) {
            var node = parent.get();
            if (node instanceof com.github.javaparser.ast.stmt.IfStmt ifStmt) {
                serviceCall.setConditional(true);
                serviceCall.setCondition(ifStmt.getCondition().toString());
                return;
            }
            parent = node.getParentNode();
        }
    }

    // --- Annotation utility methods ---

    private boolean hasAnnotation(ClassOrInterfaceDeclaration classDecl, String annotationName) {
        return classDecl.getAnnotations().stream()
                .anyMatch(a -> a.getNameAsString().equals(annotationName));
    }

    private boolean hasAnnotation(MethodDeclaration method, String annotationName) {
        return method.getAnnotations().stream()
                .anyMatch(a -> a.getNameAsString().equals(annotationName));
    }

    private Optional<String> extractAnnotationValue(ClassOrInterfaceDeclaration classDecl, String annotationName) {
        return classDecl.getAnnotations().stream()
                .filter(a -> a.getNameAsString().equals(annotationName))
                .findFirst()
                .flatMap(this::getAnnotationStringValue);
    }

    private Optional<String> extractAnnotationValue(MethodDeclaration method, String annotationName) {
        return method.getAnnotations().stream()
                .filter(a -> a.getNameAsString().equals(annotationName))
                .findFirst()
                .flatMap(this::getAnnotationStringValue);
    }

    private Optional<String> getAnnotationStringValue(AnnotationExpr annotation) {
        if (annotation instanceof SingleMemberAnnotationExpr single) {
            return Optional.of(cleanStringLiteral(single.getMemberValue().toString()));
        }
        if (annotation instanceof NormalAnnotationExpr normal) {
            // Look for "value" or "path" member
            for (var pair : normal.getPairs()) {
                String name = pair.getNameAsString();
                if ("value".equals(name) || "path".equals(name)) {
                    return Optional.of(cleanStringLiteral(pair.getValue().toString()));
                }
            }
        }
        return Optional.empty();
    }

    /**
     * Extract a specific named attribute from an annotation on a class declaration.
     */
    private Optional<String> extractAnnotationAttributeByName(ClassOrInterfaceDeclaration classDecl,
            String annotationName, String attributeName) {
        return classDecl.getAnnotations().stream()
                .filter(a -> a.getNameAsString().equals(annotationName))
                .findFirst()
                .flatMap(a -> getNamedAttribute(a, attributeName));
    }

    /**
     * Extract a specific named attribute from an annotation on a method
     * declaration.
     */
    private Optional<String> extractAnnotationAttributeByName(MethodDeclaration method,
            String annotationName, String attributeName) {
        return method.getAnnotations().stream()
                .filter(a -> a.getNameAsString().equals(annotationName))
                .findFirst()
                .flatMap(a -> getNamedAttribute(a, attributeName));
    }

    private Optional<String> getNamedAttribute(AnnotationExpr annotation, String attributeName) {
        if (annotation instanceof NormalAnnotationExpr normal) {
            for (var pair : normal.getPairs()) {
                if (attributeName.equals(pair.getNameAsString())) {
                    return Optional.of(cleanStringLiteral(pair.getValue().toString()));
                }
            }
        }
        return Optional.empty();
    }

    private String extractRequestMappingMethod(MethodDeclaration method) {
        return method.getAnnotations().stream()
                .filter(a -> a.getNameAsString().equals("RequestMapping"))
                .findFirst()
                .flatMap(a -> {
                    if (a instanceof NormalAnnotationExpr normal) {
                        for (var pair : normal.getPairs()) {
                            if ("method".equals(pair.getNameAsString())) {
                                String val = pair.getValue().toString();
                                if (val.contains("GET"))
                                    return Optional.of("GET");
                                if (val.contains("POST"))
                                    return Optional.of("POST");
                                if (val.contains("PUT"))
                                    return Optional.of("PUT");
                                if (val.contains("DELETE"))
                                    return Optional.of("DELETE");
                                if (val.contains("PATCH"))
                                    return Optional.of("PATCH");
                            }
                        }
                    }
                    return Optional.of("GET"); // default
                })
                .orElse("GET");
    }

    private String cleanStringLiteral(String value) {
        return value.replace("\"", "").replace("{", "").replace("}", "").trim();
    }

    private String normalizePath(String path) {
        if (path.isEmpty())
            return "/";
        path = path.replace("//", "/");
        if (!path.startsWith("/"))
            path = "/" + path;
        return path;
    }
}
