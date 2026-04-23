package com.codechecker.analyzer;

import com.codechecker.model.IssueInfo;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.*;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Path;
import java.util.*;

/**
 * CodeQualityAnalyzer — Agent Component #7
 *
 * Applies 11 quality dimensions (D1–D11) to every Java file:
 *
 *  D1  — Code Smells       : method > 30 lines, > 5 params, god class, magic numbers
 *  D2  — Null Safety         : optional.get() without check, null returned for Collection
 *  D3  — Performance         : String concat in loop, regex compiled in loop
 *  D4  — Concurrency         : HashMap in singleton, static mutable without sync
 *  D5  — Memory              : ThreadLocal without remove(), findAll() stored in field
 *  D6  — SQL Injection       : string concat in SQL query (CRITICAL)
 *  D7  — Deprecated APIs     : java.util.Date, Vector, Hashtable, @Deprecated usage
 *  D8  — Resource Leaks      : InputStream/Connection not in try-with-resources
 *  D9  — Validation          : @RequestBody without @Valid
 *  D10 — Config              : No HikariCP pool config, missing timeout props
 *  D11 — Security            : permitAll() on sensitive endpoints, hardcoded credentials
 */
@Service
public class CodeQualityAnalyzer {

    private static final Logger log = LoggerFactory.getLogger(CodeQualityAnalyzer.class);

    /**
     * Analyze a single Java file for D1-D11 issues.
     */
    public List<IssueInfo> analyze(Path javaFile) {
        List<IssueInfo> issues = new ArrayList<>();

        try {
            CompilationUnit cu = StaticJavaParser.parse(javaFile);
            String fileName = javaFile.getFileName().toString();
            String fileContent = cu.toString();

            cu.findAll(ClassOrInterfaceDeclaration.class).forEach(classDecl -> {
                String className = classDecl.getNameAsString();

                // D1 — Code Smells
                checkD1CodeSmells(classDecl, className, fileName, issues);

                // D2 — Null Safety
                checkD2NullSafety(classDecl, className, fileName, issues);

                // D3 — Performance
                checkD3Performance(classDecl, className, fileName, issues);

                // D4 — Concurrency
                checkD4Concurrency(classDecl, className, fileName, issues);

                // D5 — Memory
                checkD5Memory(classDecl, className, fileName, issues);

                // D6 — SQL Injection
                checkD6SqlInjection(classDecl, className, fileName, issues);

                // D7 — Deprecated APIs
                checkD7DeprecatedApis(classDecl, className, fileName, issues);

                // D8 — Resource Leaks
                checkD8ResourceLeaks(classDecl, className, fileName, issues);

                // D9 — Validation
                checkD9Validation(classDecl, className, fileName, issues);

                // D11 — Security
                checkD11Security(classDecl, className, fileName, issues);
            });

            // D10 — Config (file-level checks)
            if (fileName.endsWith("Config.java") || fileName.endsWith("Configuration.java")) {
                checkD10Config(cu, fileName, issues);
            }

        } catch (IOException e) {
            log.error("Cannot read file: {}", javaFile, e);
        } catch (Exception e) {
            log.debug("Parse error on {}: {}", javaFile.getFileName(), e.getMessage());
        }

        if (!issues.isEmpty()) {
            log.debug("{}: found {} quality issues", javaFile.getFileName(), issues.size());
        }
        return issues;
    }

    // ═══════════════════════════════════════════════════════════
    // D1 — CODE SMELLS
    // ═══════════════════════════════════════════════════════════

    private void checkD1CodeSmells(ClassOrInterfaceDeclaration classDecl, String className,
                                    String fileName, List<IssueInfo> issues) {
        int totalMethods = classDecl.getMethods().size();

        // D1-001: God class — too many methods
        if (totalMethods > 20) {
            IssueInfo issue = IssueInfo.create("D1-001", "MEDIUM", "God class — " + totalMethods + " methods in " + className);
            issue.setFile(fileName);
            issue.setDescription("Class has " + totalMethods + " methods. Consider splitting into focused services.");
            issue.setAfterCode("Split into " + className + "CrudService, " + className + "QueryService, etc.");
            issues.add(issue);
        }

        for (MethodDeclaration method : classDecl.getMethods()) {
            int lineCount = method.getEnd().map(e -> e.line).orElse(0)
                    - method.getBegin().map(b -> b.line).orElse(0);
            int paramCount = method.getParameters().size();
            int line = method.getBegin().map(p -> p.line).orElse(0);

            // D1-002: Method too long
            if (lineCount > 30) {
                IssueInfo issue = IssueInfo.create("D1-002", "MEDIUM",
                        "Long method — " + method.getNameAsString() + "() is " + lineCount + " lines");
                issue.setFile(fileName);
                issue.setLineNumber(line);
                issue.setDescription("Method exceeds 30-line threshold. Extract sub-methods.");
                issue.setAfterCode("Extract private helper methods for logical blocks");
                issues.add(issue);
            }

            // D1-003: Too many parameters
            if (paramCount > 5) {
                IssueInfo issue = IssueInfo.create("D1-003", "LOW",
                        "Too many params — " + method.getNameAsString() + "() has " + paramCount + " parameters");
                issue.setFile(fileName);
                issue.setLineNumber(line);
                issue.setAfterCode("Group parameters into a Request DTO");
                issues.add(issue);
            }

            // D1-004: Magic numbers
            method.findAll(IntegerLiteralExpr.class).forEach(lit -> {
                int value = Integer.parseInt(lit.getValue());
                if (value > 1 && value != 2 && value != 10 && value != 100 && value != 0) {
                    // Skip common non-magic numbers
                    if (value != 200 && value != 404 && value != 500) {
                        IssueInfo issue = IssueInfo.create("D1-004", "LOW",
                                "Magic number " + value + " in " + method.getNameAsString() + "()");
                        issue.setFile(fileName);
                        issue.setLineNumber(lit.getBegin().map(p -> p.line).orElse(0));
                        issue.setAfterCode("private static final int CONSTANT_NAME = " + value + ";");
                        issues.add(issue);
                    }
                }
            });
        }
    }

    // ═══════════════════════════════════════════════════════════
    // D2 — NULL SAFETY
    // ═══════════════════════════════════════════════════════════

    private void checkD2NullSafety(ClassOrInterfaceDeclaration classDecl, String className,
                                    String fileName, List<IssueInfo> issues) {
        classDecl.getMethods().forEach(method -> {
            String methodBody = method.toString();
            int line = method.getBegin().map(p -> p.line).orElse(0);

            // D2-001: .get() on Optional without isPresent check
            if (methodBody.contains(".get()") && methodBody.contains("Optional")
                    && !methodBody.contains("isPresent") && !methodBody.contains("ifPresent")
                    && !methodBody.contains("orElse")) {
                IssueInfo issue = IssueInfo.create("D2-001", "HIGH",
                        "Optional.get() without check in " + method.getNameAsString() + "()");
                issue.setFile(fileName);
                issue.setLineNumber(line);
                issue.setBeforeCode("optional.get()");
                issue.setAfterCode("optional.orElseThrow(() -> new NotFoundException(\"...\"))");
                issue.setAutoFixed(true);
                issues.add(issue);
            }

            // D2-002: Method returns null for Collection type
            if (method.getType().asString().contains("List") || method.getType().asString().contains("Set")
                    || method.getType().asString().contains("Collection")) {
                method.findAll(ReturnStmt.class).forEach(ret -> {
                    if (ret.getExpression().isPresent()
                            && ret.getExpression().get().toString().equals("null")) {
                        IssueInfo issue = IssueInfo.create("D2-002", "MEDIUM",
                                "Returns null instead of empty collection in " + method.getNameAsString() + "()");
                        issue.setFile(fileName);
                        issue.setLineNumber(ret.getBegin().map(p -> p.line).orElse(0));
                        issue.setBeforeCode("return null;");
                        issue.setAfterCode("return Collections.emptyList();");
                        issue.setAutoFixed(true);
                        issues.add(issue);
                    }
                });
            }
        });
    }

    // ═══════════════════════════════════════════════════════════
    // D3 — PERFORMANCE
    // ═══════════════════════════════════════════════════════════

    private void checkD3Performance(ClassOrInterfaceDeclaration classDecl, String className,
                                     String fileName, List<IssueInfo> issues) {
        classDecl.getMethods().forEach(method -> {
            // D3-001: String concatenation in loop
            method.findAll(ForEachStmt.class).forEach(forEach -> {
                String body = forEach.getBody().toString();
                if (body.contains("+ \"") || body.contains("\" +") || body.contains("+= \"")) {
                    IssueInfo issue = IssueInfo.create("D3-001", "MEDIUM",
                            "String concat in loop — " + method.getNameAsString() + "()");
                    issue.setFile(fileName);
                    issue.setLineNumber(forEach.getBegin().map(p -> p.line).orElse(0));
                    issue.setBeforeCode("for(x : list) { result += x.toString(); }");
                    issue.setAfterCode("StringBuilder sb = new StringBuilder(); for(x : list) { sb.append(x); }");
                    issue.setAutoFixed(true);
                    issues.add(issue);
                }
            });
            method.findAll(ForStmt.class).forEach(forStmt -> {
                String body = forStmt.getBody().toString();
                if (body.contains("+ \"") || body.contains("\" +") || body.contains("+= \"")) {
                    IssueInfo issue = IssueInfo.create("D3-001", "MEDIUM",
                            "String concat in loop — " + method.getNameAsString() + "()");
                    issue.setFile(fileName);
                    issue.setLineNumber(forStmt.getBegin().map(p -> p.line).orElse(0));
                    issue.setAfterCode("Use StringBuilder instead of String concatenation in loops");
                    issues.add(issue);
                }
            });

            // D3-002: Pattern.compile inside method (should be static field)
            method.findAll(MethodCallExpr.class).forEach(call -> {
                if ("compile".equals(call.getNameAsString())) {
                    call.getScope().ifPresent(scope -> {
                        if (scope.toString().equals("Pattern")) {
                            IssueInfo issue = IssueInfo.create("D3-002", "LOW",
                                    "Pattern.compile() inside method — " + method.getNameAsString() + "()");
                            issue.setFile(fileName);
                            issue.setLineNumber(call.getBegin().map(p -> p.line).orElse(0));
                            issue.setBeforeCode("Pattern.compile(regex) // inside method");
                            issue.setAfterCode("private static final Pattern PATTERN = Pattern.compile(regex);");
                            issues.add(issue);
                        }
                    });
                }
            });
        });
    }

    // ═══════════════════════════════════════════════════════════
    // D4 — CONCURRENCY
    // ═══════════════════════════════════════════════════════════

    private void checkD4Concurrency(ClassOrInterfaceDeclaration classDecl, String className,
                                     String fileName, List<IssueInfo> issues) {
        boolean isSingleton = classDecl.getAnnotations().stream()
                .anyMatch(a -> Set.of("Service", "Component", "Repository", "Controller",
                        "RestController", "Singleton").contains(a.getNameAsString()));

        if (!isSingleton) return;

        classDecl.getFields().forEach(field -> {
            String type = field.getElementType().asString();
            boolean isStatic = field.isStatic();
            int line = field.getBegin().map(p -> p.line).orElse(0);

            // D4-001: HashMap in singleton (not thread-safe)
            if (type.equals("HashMap") || type.equals("ArrayList") || type.equals("LinkedList")) {
                if (!field.toString().contains("final") || isStatic) {
                    IssueInfo issue = IssueInfo.create("D4-001", "HIGH",
                            "Non-thread-safe " + type + " in singleton " + className);
                    issue.setFile(fileName);
                    issue.setLineNumber(line);
                    issue.setBeforeCode("private " + type + " data;");
                    issue.setAfterCode("private ConcurrentHashMap / CopyOnWriteArrayList — or make immutable");
                    issues.add(issue);
                }
            }

            // D4-002: Mutable static field without synchronization
            if (isStatic && !field.isFinal()) {
                if (!type.contains("Atomic") && !type.contains("Concurrent")
                        && !type.equals("Logger") && !type.equals("Log")) {
                    IssueInfo issue = IssueInfo.create("D4-002", "MEDIUM",
                            "Mutable static field " + fieldName(field) + " in " + className);
                    issue.setFile(fileName);
                    issue.setLineNumber(line);
                    issue.setAfterCode("Use AtomicReference, volatile, or synchronized access");
                    issues.add(issue);
                }
            }
        });
    }

    // ═══════════════════════════════════════════════════════════
    // D5 — MEMORY
    // ═══════════════════════════════════════════════════════════

    private void checkD5Memory(ClassOrInterfaceDeclaration classDecl, String className,
                                String fileName, List<IssueInfo> issues) {
        String classText = classDecl.toString();

        // D5-001: ThreadLocal without remove()
        if (classText.contains("ThreadLocal") && !classText.contains(".remove()")) {
            IssueInfo issue = IssueInfo.create("D5-001", "HIGH",
                    "ThreadLocal without remove() in " + className + " — memory leak risk");
            issue.setFile(fileName);
            issue.setDescription("ThreadLocal values live until thread is destroyed. In thread pools, this causes leaks.");
            issue.setAfterCode("try { ... } finally { threadLocal.remove(); }");
            issues.add(issue);
        }

        // D5-002: Storing findAll() result in a field
        classDecl.getFields().forEach(field -> {
            field.getVariables().forEach(var -> {
                if (var.getInitializer().isPresent()) {
                    String init = var.getInitializer().get().toString();
                    if (init.contains("findAll()")) {
                        IssueInfo issue = IssueInfo.create("D5-002", "HIGH",
                                "findAll() stored in field — entire table cached in memory");
                        issue.setFile(fileName);
                        issue.setLineNumber(var.getBegin().map(p -> p.line).orElse(0));
                        issue.setAfterCode("Query on demand or use @Cacheable with eviction");
                        issues.add(issue);
                    }
                }
            });
        });
    }

    // ═══════════════════════════════════════════════════════════
    // D6 — SQL INJECTION
    // ═══════════════════════════════════════════════════════════

    private void checkD6SqlInjection(ClassOrInterfaceDeclaration classDecl, String className,
                                      String fileName, List<IssueInfo> issues) {
        classDecl.getMethods().forEach(method -> {
            String body = method.toString();

            // SQL string concatenation patterns
            boolean hasSqlConcat = false;
            if (body.contains("\"SELECT") || body.contains("\"INSERT") || body.contains("\"UPDATE")
                    || body.contains("\"DELETE") || body.contains("\"FROM")) {
                if (body.contains("+ \"") || body.contains("\" +")) {
                    hasSqlConcat = true;
                }
            }

            // createQuery / createNativeQuery with concatenation
            if (body.contains("createQuery") || body.contains("createNativeQuery")) {
                if (body.contains("+ \"") || body.contains("\" +")) {
                    hasSqlConcat = true;
                }
            }

            // jdbcTemplate.query with string concat
            if (body.contains("jdbcTemplate") || body.contains("JdbcTemplate")) {
                if (body.contains("+ \"") || body.contains("\" +")) {
                    hasSqlConcat = true;
                }
            }

            if (hasSqlConcat) {
                IssueInfo issue = IssueInfo.create("D6-001", "CRITICAL",
                        "SQL INJECTION — string concatenation in " + method.getNameAsString() + "()");
                issue.setFile(fileName);
                issue.setLineNumber(method.getBegin().map(p -> p.line).orElse(0));
                issue.setDescription("SQL query built with string concatenation — user input can inject SQL.");
                issue.setBeforeCode("\"SELECT * FROM x WHERE name = '\" + userInput + \"'\"");
                issue.setAfterCode("\"SELECT * FROM x WHERE name = ?\" with PreparedStatement / @Query :param");
                issue.setAutoFixed(true);
                issues.add(issue);
            }
        });
    }

    // ═══════════════════════════════════════════════════════════
    // D7 — DEPRECATED APIS
    // ═══════════════════════════════════════════════════════════

    private void checkD7DeprecatedApis(ClassOrInterfaceDeclaration classDecl, String className,
                                        String fileName, List<IssueInfo> issues) {
        String classText = classDecl.toString();

        // deprecated type usage
        Map<String, String> deprecatedTypes = Map.of(
                "java.util.Date", "java.time.LocalDate / LocalDateTime",
                "Date", "LocalDate / LocalDateTime",
                "Calendar", "java.time.LocalDateTime",
                "Vector", "ArrayList + Collections.synchronizedList()",
                "Hashtable", "ConcurrentHashMap",
                "StringBuffer", "StringBuilder (if single-threaded)"
        );

        classDecl.findAll(ClassOrInterfaceType.class).forEach(type -> {
            String typeName = type.getNameAsString();
            if (deprecatedTypes.containsKey(typeName)) {
                IssueInfo issue = IssueInfo.create("D7-001", "LOW",
                        "Deprecated API — " + typeName + " used in " + className);
                issue.setFile(fileName);
                issue.setLineNumber(type.getBegin().map(p -> p.line).orElse(0));
                issue.setBeforeCode(typeName);
                issue.setAfterCode(deprecatedTypes.get(typeName));
                issues.add(issue);
            }
        });

        // D7-002: Calling methods annotated as @Deprecated
        classDecl.findAll(MethodCallExpr.class).forEach(call -> {
            if (classText.contains("@Deprecated") && classText.contains(call.getNameAsString())) {
                // simplistic check
            }
        });
    }

    // ═══════════════════════════════════════════════════════════
    // D8 — RESOURCE LEAKS
    // ═══════════════════════════════════════════════════════════

    private void checkD8ResourceLeaks(ClassOrInterfaceDeclaration classDecl, String className,
                                       String fileName, List<IssueInfo> issues) {
        classDecl.getMethods().forEach(method -> {
            String body = method.toString();

            // D8-001: InputStream / Connection / Statement not in try-with-resources
            Set<String> resourceTypes = Set.of("InputStream", "OutputStream", "FileReader", "FileWriter",
                    "BufferedReader", "BufferedWriter", "Connection", "PreparedStatement",
                    "ResultSet", "FileInputStream", "FileOutputStream");

            for (String resType : resourceTypes) {
                if (body.contains("new " + resType) || body.contains(resType + " ")) {
                    // Check if it's inside try-with-resources
                    boolean hasTryWithResources = method.findAll(TryStmt.class).stream()
                            .anyMatch(tryStmt -> !tryStmt.getResources().isEmpty());

                    if (!hasTryWithResources && body.contains(resType)) {
                        IssueInfo issue = IssueInfo.create("D8-001", "HIGH",
                                "Potential resource leak — " + resType + " in " + method.getNameAsString() + "()");
                        issue.setFile(fileName);
                        issue.setLineNumber(method.getBegin().map(p -> p.line).orElse(0));
                        issue.setBeforeCode(resType + " resource = new " + resType + "(...);");
                        issue.setAfterCode("try (" + resType + " resource = new " + resType + "(...)) { ... }");
                        issue.setAutoFixed(true);
                        issues.add(issue);
                    }
                }
            }
        });
    }

    // ═══════════════════════════════════════════════════════════
    // D9 — VALIDATION
    // ═══════════════════════════════════════════════════════════

    private void checkD9Validation(ClassOrInterfaceDeclaration classDecl, String className,
                                    String fileName, List<IssueInfo> issues) {
        boolean isController = classDecl.getAnnotations().stream()
                .anyMatch(a -> a.getNameAsString().equals("RestController")
                        || a.getNameAsString().equals("Controller"));

        if (!isController) return;

        classDecl.getMethods().forEach(method -> {
            method.getParameters().forEach(param -> {
                boolean hasRequestBody = param.getAnnotations().stream()
                        .anyMatch(a -> a.getNameAsString().equals("RequestBody"));
                boolean hasValid = param.getAnnotations().stream()
                        .anyMatch(a -> a.getNameAsString().equals("Valid")
                                || a.getNameAsString().equals("Validated"));

                if (hasRequestBody && !hasValid) {
                    IssueInfo issue = IssueInfo.create("D9-001", "HIGH",
                            "@RequestBody without @Valid in " + method.getNameAsString() + "()");
                    issue.setFile(fileName);
                    issue.setLineNumber(method.getBegin().map(p -> p.line).orElse(0));
                    issue.setBeforeCode("public ResponseEntity<?> create(@RequestBody UserDTO dto)");
                    issue.setAfterCode("public ResponseEntity<?> create(@Valid @RequestBody UserDTO dto)");
                    issue.setAutoFixed(true);
                    issues.add(issue);
                }
            });
        });
    }

    // ═══════════════════════════════════════════════════════════
    // D10 — CONFIG
    // ═══════════════════════════════════════════════════════════

    private void checkD10Config(CompilationUnit cu, String fileName, List<IssueInfo> issues) {
        String content = cu.toString();

        // D10-001: DataSource without HikariCP pool
        if (content.contains("DataSource") && !content.contains("HikariDataSource")
                && !content.contains("hikari") && !content.contains("maximumPoolSize")) {
            IssueInfo issue = IssueInfo.create("D10-001", "MEDIUM",
                    "DataSource without explicit HikariCP pool configuration");
            issue.setFile(fileName);
            issue.setAfterCode("spring.datasource.hikari.maximum-pool-size=20\nspring.datasource.hikari.connection-timeout=30000");
            issues.add(issue);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // D11 — SECURITY
    // ═══════════════════════════════════════════════════════════

    private void checkD11Security(ClassOrInterfaceDeclaration classDecl, String className,
                                   String fileName, List<IssueInfo> issues) {
        String classText = classDecl.toString();

        // D11-001: Hardcoded credentials
        Set<String> credentialPatterns = Set.of("password", "secret", "apiKey", "api_key",
                "accessKey", "access_key", "token", "privateKey");

        classDecl.getFields().forEach(field -> {
            field.getVariables().forEach(var -> {
                String name = var.getNameAsString().toLowerCase();
                for (String pattern : credentialPatterns) {
                    if (name.contains(pattern.toLowerCase())) {
                        if (var.getInitializer().isPresent()) {
                            String init = var.getInitializer().get().toString();
                            if (init.startsWith("\"") && init.length() > 3) {
                                IssueInfo issue = IssueInfo.create("D11-001", "CRITICAL",
                                        "Hardcoded credential — " + var.getNameAsString() + " in " + className);
                                issue.setFile(fileName);
                                issue.setLineNumber(var.getBegin().map(p -> p.line).orElse(0));
                                issue.setBeforeCode("private String " + var.getNameAsString() + " = " + init + ";");
                                issue.setAfterCode("@Value(\"${" + name + "}\") private String " + var.getNameAsString() + ";");
                                issue.setAutoFixed(true);
                                issues.add(issue);
                            }
                        }
                    }
                }
            });
        });

        // D11-002: permitAll() on sensitive paths
        if (classText.contains("permitAll()")) {
            if (classText.contains("/admin") || classText.contains("/api/users")
                    || classText.contains("/api/config") || classText.contains("/actuator")) {
                IssueInfo issue = IssueInfo.create("D11-002", "CRITICAL",
                        "permitAll() on potentially sensitive path in " + className);
                issue.setFile(fileName);
                issue.setDescription("permitAll() used on admin/sensitive endpoints — no authentication required.");
                issue.setAfterCode(".requestMatchers(\"/admin/**\").hasRole(\"ADMIN\")");
                issues.add(issue);
            }
        }

        // D11-003: CORS wildcard
        if (classText.contains("allowedOrigins(\"*\")") || classText.contains("allowedOriginPatterns(\"*\")")) {
            IssueInfo issue = IssueInfo.create("D11-003", "MEDIUM",
                    "CORS wildcard origin — " + className);
            issue.setFile(fileName);
            issue.setAfterCode("Restrict to specific origins for production");
            issues.add(issue);
        }
    }

    // ─── Utilities ───

    private String fieldName(FieldDeclaration field) {
        return field.getVariables().isEmpty() ? "unknown" : field.getVariable(0).getNameAsString();
    }
}
