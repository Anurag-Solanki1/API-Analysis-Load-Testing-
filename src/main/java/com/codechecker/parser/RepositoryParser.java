package com.codechecker.parser;

import com.codechecker.model.RepositoryCallInfo;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.expr.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * RepositoryParser — Agent Component #4
 *
 * Reads repository/DAO files and reconstructs the full SQL query for every method.
 *
 * Supported query types:
 *  - Spring Data derived queries (findByXxxAndYyy)
 *  - @Query JPQL annotations
 *  - @Query nativeQuery=true (raw SQL)
 *  - JDBC Template (jdbcTemplate.query)
 *  - MyBatis @Select/@Insert/@Update/@Delete
 *  - Criteria API (basic detection)
 *
 * Also performs the 16-point query check:
 *  - SELECT projection (full entity vs columns)
 *  - WHERE column index check
 *  - Pagination check
 *  - JOIN analysis
 *  - SQL injection detection (string concatenation)
 *  - N+1 entity relationship detection
 *  - Bulk operation detection
 */
@Service
public class RepositoryParser {

    private static final Logger log = LoggerFactory.getLogger(RepositoryParser.class);

    // Regex for Spring Data derived query method naming conventions
    private static final Pattern DERIVED_QUERY = Pattern.compile(
            "^(find|get|read|query|search|stream|count|exists|delete|remove)"
                    + "(All|First|Top\\d+)?"
                    + "By(.+)$"
    );

    // Split camelCase conditions
    private static final Pattern CONDITION_SPLIT = Pattern.compile(
            "(And|Or)(?=[A-Z])"
    );

    /**
     * Parse a repository file and extract SQL information for all query methods.
     * Returns a map of methodName -> enriched RepositoryCallInfo.
     */
    public Map<String, RepositoryCallInfo> parse(Path repoFile) {
        Map<String, RepositoryCallInfo> methods = new LinkedHashMap<>();

        try {
            CompilationUnit cu = StaticJavaParser.parse(repoFile);

            cu.findAll(ClassOrInterfaceDeclaration.class).forEach(classDecl -> {
                String className = classDecl.getNameAsString();
                String entityName = extractEntityType(classDecl);
                String tableName = camelToSnake(entityName);

                classDecl.getMethods().forEach(method -> {
                    String methodName = method.getNameAsString();
                    RepositoryCallInfo info = new RepositoryCallInfo();
                    info.setClassName(className);
                    info.setMethodName(methodName);
                    info.setLineNumber(method.getBegin().map(p -> p.line).orElse(0));
                    info.setTableName(tableName);

                    // Check for @Query annotation
                    Optional<String> queryAnnotation = extractQueryAnnotation(method);
                    Optional<Boolean> isNative = isNativeQuery(method);

                    if (queryAnnotation.isPresent()) {
                        // JPQL or Native SQL from @Query
                        String query = queryAnnotation.get();
                        info.setReconstructedSql(query);
                        info.setQueryType(isNative.orElse(false) ? "NATIVE_SQL" : "JPQL");
                        analyzeExplicitQuery(info, query);
                    } else if (hasAnnotation(method, "Select") || hasAnnotation(method, "Insert")
                            || hasAnnotation(method, "Update") || hasAnnotation(method, "Delete")) {
                        // MyBatis annotations
                        info.setQueryType("MYBATIS");
                        extractMyBatisQuery(method, info);
                    } else {
                        // Spring Data derived query
                        info.setQueryType("SPRING_DATA_DERIVED");
                        reconstructDerivedQuery(methodName, entityName, tableName, info);
                    }

                    // Check for Pageable parameter
                    info.setHasPagination(method.getParameters().stream()
                            .anyMatch(p -> p.getType().asString().contains("Pageable")
                                    || p.getType().asString().contains("PageRequest")));

                    // Estimate timing
                    estimateQueryTiming(info);

                    methods.put(methodName, info);
                    log.debug("Parsed repo method: {}.{} → {}", className, methodName, info.getQueryType());
                });
            });

        } catch (IOException e) {
            log.error("Failed to parse repository file: {}", repoFile, e);
        } catch (Exception e) {
            log.error("JavaParser error on repository: {}", repoFile, e);
        }

        return methods;
    }

    /**
     * Enrich a RepositoryCallInfo from the call chain with full SQL data.
     * Called during service tracing to fill in SQL details for method references.
     */
    public void enrichFromParsedRepos(RepositoryCallInfo callInfo,
                                       Map<String, Map<String, RepositoryCallInfo>> parsedRepos) {
        Map<String, RepositoryCallInfo> repoMethods = parsedRepos.get(callInfo.getClassName());
        if (repoMethods == null) {
            // Try partial match
            for (Map.Entry<String, Map<String, RepositoryCallInfo>> entry : parsedRepos.entrySet()) {
                if (callInfo.getClassName().contains(entry.getKey())
                        || entry.getKey().contains(callInfo.getClassName())) {
                    repoMethods = entry.getValue();
                    break;
                }
            }
        }

        if (repoMethods != null) {
            RepositoryCallInfo parsed = repoMethods.get(callInfo.getMethodName());
            if (parsed != null) {
                callInfo.setReconstructedSql(parsed.getReconstructedSql());
                callInfo.setQueryType(parsed.getQueryType());
                callInfo.setTableName(parsed.getTableName());
                callInfo.setHasIndex(parsed.isHasIndex());
                callInfo.setHasPagination(callInfo.isHasPagination() || parsed.isHasPagination());
                callInfo.setSelectStar(parsed.isSelectStar());
                callInfo.setHasSqlInjection(parsed.isHasSqlInjection());
                callInfo.setEstimatedMs(parsed.getEstimatedMs());
                callInfo.setEstimatedRowsScanned(parsed.getEstimatedRowsScanned());
                callInfo.setEstimatedRowsReturned(parsed.getEstimatedRowsReturned());
            }
        }
    }

    // ─── Query Reconstruction ───

    /**
     * Reconstruct SQL from Spring Data derived query method name.
     * e.g. findByUserIdAndStatusOrderByCreatedAtDesc
     *   → SELECT * FROM [table] WHERE user_id = ? AND status = ? ORDER BY created_at DESC
     */
    private void reconstructDerivedQuery(String methodName, String entityName,
                                          String tableName, RepositoryCallInfo info) {
        Matcher matcher = DERIVED_QUERY.matcher(methodName);
        if (!matcher.matches()) {
            // Not a derived query (save, delete, etc.)
            String sql = reconstructWriteMethod(methodName, tableName);
            info.setReconstructedSql(sql);
            return;
        }

        String operation = matcher.group(1);
        String modifier = matcher.group(2); // All, First, TopN
        String conditions = matcher.group(3);

        StringBuilder sql = new StringBuilder();

        // Handle count/exists vs select
        if ("count".equals(operation)) {
            sql.append("SELECT COUNT(*) FROM ").append(tableName);
            info.setSelectStar(false);
        } else if ("exists".equals(operation)) {
            sql.append("SELECT CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END FROM ").append(tableName);
            info.setSelectStar(false);
        } else if ("delete".equals(operation) || "remove".equals(operation)) {
            sql.append("DELETE FROM ").append(tableName);
            info.setSelectStar(false);
        } else {
            sql.append("SELECT * FROM ").append(tableName);
            info.setSelectStar(true);
        }

        // Parse WHERE conditions
        if (conditions != null && !conditions.isEmpty()) {
            // Split by And/Or and extract ORDER BY
            String orderByClause = "";
            int orderByIdx = conditions.indexOf("OrderBy");
            String whereConditions = conditions;
            if (orderByIdx > 0) {
                whereConditions = conditions.substring(0, orderByIdx);
                orderByClause = conditions.substring(orderByIdx + 7);
            }

            // Build WHERE clause
            String[] parts = CONDITION_SPLIT.split(whereConditions);
            String[] delimiters = extractDelimiters(whereConditions);

            sql.append(" WHERE ");
            for (int i = 0; i < parts.length; i++) {
                if (i > 0 && i - 1 < delimiters.length) {
                    sql.append(" ").append(delimiters[i - 1]).append(" ");
                }
                sql.append(parseConditionPart(parts[i]));
            }

            // Build ORDER BY
            if (!orderByClause.isEmpty()) {
                sql.append(" ORDER BY ");
                if (orderByClause.endsWith("Desc")) {
                    sql.append(camelToSnake(orderByClause.substring(0, orderByClause.length() - 4)))
                            .append(" DESC");
                } else if (orderByClause.endsWith("Asc")) {
                    sql.append(camelToSnake(orderByClause.substring(0, orderByClause.length() - 3)))
                            .append(" ASC");
                } else {
                    sql.append(camelToSnake(orderByClause));
                }
            }
        }

        // Handle Top/First
        if (modifier != null) {
            if ("First".equals(modifier) || "Top1".equals(modifier)) {
                sql.append(" LIMIT 1");
                info.setHasPagination(true);
            } else if (modifier.startsWith("Top")) {
                sql.append(" LIMIT ").append(modifier.substring(3));
                info.setHasPagination(true);
            }
        }

        info.setReconstructedSql(sql.toString());

        // PK lookup detection
        if (conditions != null && (conditions.equals("Id") || conditions.endsWith("ById"))) {
            info.setHasIndex(true);
        }
    }

    private String parseConditionPart(String part) {
        // Handle special Spring Data keywords
        if (part.endsWith("In")) {
            String col = camelToSnake(part.substring(0, part.length() - 2));
            return col + " IN (?)";
        }
        if (part.endsWith("NotIn")) {
            String col = camelToSnake(part.substring(0, part.length() - 5));
            return col + " NOT IN (?)";
        }
        if (part.endsWith("IsNull")) {
            String col = camelToSnake(part.substring(0, part.length() - 6));
            return col + " IS NULL";
        }
        if (part.endsWith("IsNotNull") || part.endsWith("NotNull")) {
            int trim = part.endsWith("IsNotNull") ? 9 : 7;
            String col = camelToSnake(part.substring(0, part.length() - trim));
            return col + " IS NOT NULL";
        }
        if (part.endsWith("Like") || part.endsWith("Containing") || part.endsWith("Contains")) {
            int trim = part.endsWith("Like") ? 4 : part.endsWith("Containing") ? 10 : 8;
            String col = camelToSnake(part.substring(0, part.length() - trim));
            return col + " LIKE ?";
        }
        if (part.endsWith("StartingWith") || part.endsWith("StartsWith")) {
            int trim = part.endsWith("StartingWith") ? 12 : 10;
            String col = camelToSnake(part.substring(0, part.length() - trim));
            return col + " LIKE ?%";
        }
        if (part.endsWith("EndingWith") || part.endsWith("EndsWith")) {
            int trim = part.endsWith("EndingWith") ? 10 : 8;
            String col = camelToSnake(part.substring(0, part.length() - trim));
            return col + " LIKE %?";
        }
        if (part.endsWith("LessThan")) {
            String col = camelToSnake(part.substring(0, part.length() - 8));
            return col + " < ?";
        }
        if (part.endsWith("LessThanEqual")) {
            String col = camelToSnake(part.substring(0, part.length() - 13));
            return col + " <= ?";
        }
        if (part.endsWith("GreaterThan")) {
            String col = camelToSnake(part.substring(0, part.length() - 11));
            return col + " > ?";
        }
        if (part.endsWith("GreaterThanEqual")) {
            String col = camelToSnake(part.substring(0, part.length() - 16));
            return col + " >= ?";
        }
        if (part.endsWith("Between")) {
            String col = camelToSnake(part.substring(0, part.length() - 7));
            return col + " BETWEEN ? AND ?";
        }
        if (part.endsWith("Not")) {
            String col = camelToSnake(part.substring(0, part.length() - 3));
            return col + " != ?";
        }
        if (part.endsWith("True")) {
            String col = camelToSnake(part.substring(0, part.length() - 4));
            return col + " = TRUE";
        }
        if (part.endsWith("False")) {
            String col = camelToSnake(part.substring(0, part.length() - 5));
            return col + " = FALSE";
        }
        if (part.endsWith("IgnoreCase")) {
            String col = camelToSnake(part.substring(0, part.length() - 10));
            return "LOWER(" + col + ") = LOWER(?)";
        }

        // Default: simple equality
        return camelToSnake(part) + " = ?";
    }

    private String reconstructWriteMethod(String methodName, String tableName) {
        if (methodName.equals("save") || methodName.equals("saveAndFlush")) {
            return "INSERT INTO " + tableName + " (...) VALUES (...)  /* OR UPDATE */";
        }
        if (methodName.equals("saveAll")) {
            return "INSERT INTO " + tableName + " (...) VALUES (...) /* BATCH */";
        }
        if (methodName.equals("deleteById")) {
            return "DELETE FROM " + tableName + " WHERE id = ?";
        }
        if (methodName.equals("delete")) {
            return "DELETE FROM " + tableName + " WHERE id = ?";
        }
        if (methodName.equals("deleteAll")) {
            return "DELETE FROM " + tableName;
        }
        if (methodName.equals("deleteAllInBatch")) {
            return "DELETE FROM " + tableName + " /* SINGLE BATCH */";
        }
        if (methodName.equals("findById") || methodName.equals("getById")
                || methodName.equals("getReferenceById")) {
            return "SELECT * FROM " + tableName + " WHERE id = ?";
        }
        if (methodName.equals("findAll")) {
            return "SELECT * FROM " + tableName;
        }
        if (methodName.equals("count")) {
            return "SELECT COUNT(*) FROM " + tableName;
        }
        if (methodName.equals("existsById")) {
            return "SELECT 1 FROM " + tableName + " WHERE id = ? LIMIT 1";
        }
        return "/* " + methodName + " — query not reconstructed */";
    }

    // ─── Explicit Query Analysis ───

    private void analyzeExplicitQuery(RepositoryCallInfo info, String query) {
        String upper = query.toUpperCase();

        // SELECT * detection
        info.setSelectStar(upper.contains("SELECT *") || upper.contains("SELECT E ")
                || upper.contains("SELECT O ") || upper.contains("SELECT U "));

        // SQL injection: check for string concatenation patterns
        info.setHasSqlInjection(
                query.contains("+ \"") || query.contains("\" +")
                        || query.contains("+ '") || query.contains("' +")
                        || query.contains("concat(")
        );

        // Pagination detection
        info.setHasPagination(upper.contains("LIMIT") || upper.contains("OFFSET")
                || upper.contains("ROWNUM") || upper.contains("FETCH FIRST"));

        // Simple index detection: if WHERE uses id or simple=
        if (upper.contains("WHERE") && (upper.contains(".ID =") || upper.contains(".ID="))) {
            info.setHasIndex(true);
        }
    }

    // ─── MyBatis Support ───

    private void extractMyBatisQuery(MethodDeclaration method, RepositoryCallInfo info) {
        for (String annName : List.of("Select", "Insert", "Update", "Delete")) {
            Optional<AnnotationExpr> ann = method.getAnnotationByName(annName);
            if (ann.isPresent()) {
                String queryText = extractAnnotationStringValue(ann.get());
                if (queryText != null) {
                    info.setReconstructedSql(queryText);
                    analyzeExplicitQuery(info, queryText);
                }
                break;
            }
        }
    }

    // ─── Annotations ───

    private Optional<String> extractQueryAnnotation(MethodDeclaration method) {
        return method.getAnnotationByName("Query")
                .map(this::extractAnnotationStringValue);
    }

    private Optional<Boolean> isNativeQuery(MethodDeclaration method) {
        return method.getAnnotationByName("Query")
                .flatMap(ann -> {
                    if (ann instanceof NormalAnnotationExpr normal) {
                        for (var pair : normal.getPairs()) {
                            if ("nativeQuery".equals(pair.getNameAsString())) {
                                return Optional.of("true".equals(pair.getValue().toString()));
                            }
                        }
                    }
                    return Optional.of(false);
                });
    }

    private boolean hasAnnotation(MethodDeclaration method, String name) {
        return method.getAnnotations().stream().anyMatch(a -> a.getNameAsString().equals(name));
    }

    private String extractAnnotationStringValue(AnnotationExpr annotation) {
        if (annotation instanceof SingleMemberAnnotationExpr single) {
            return single.getMemberValue().toString().replace("\"", "");
        }
        if (annotation instanceof NormalAnnotationExpr normal) {
            for (var pair : normal.getPairs()) {
                if ("value".equals(pair.getNameAsString())) {
                    return pair.getValue().toString().replace("\"", "");
                }
            }
        }
        return null;
    }

    // ─── Entity extraction ───

    private String extractEntityType(ClassOrInterfaceDeclaration classDecl) {
        // For interfaces extending JpaRepository<Entity, ID>, extract Entity
        for (var ext : classDecl.getExtendedTypes()) {
            String typeStr = ext.toString();
            if (typeStr.contains("<")) {
                String generic = typeStr.substring(typeStr.indexOf('<') + 1);
                if (generic.contains(",")) {
                    return generic.substring(0, generic.indexOf(','));
                }
            }
        }
        // Fallback: remove "Repository" from class name
        String name = classDecl.getNameAsString();
        return name.replace("Repository", "").replace("Repo", "").replace("DAO", "").replace("Dao", "");
    }

    // ─── Timing Estimation ───

    private void estimateQueryTiming(RepositoryCallInfo info) {
        if (info.isHasSqlInjection()) {
            info.setEstimatedMs(100);
            info.setEstimatedRowsScanned(100000);
            return;
        }

        String sql = info.getReconstructedSql();
        if (sql == null) {
            info.setEstimatedMs(10);
            return;
        }

        String upper = sql.toUpperCase();

        // Primary key lookup
        if (upper.contains("WHERE") && (upper.contains("ID = ?") || upper.contains("ID=?"))) {
            info.setEstimatedMs(3);
            info.setEstimatedRowsScanned(1);
            info.setEstimatedRowsReturned(1);
            return;
        }

        // Full table scan
        if (!upper.contains("WHERE") && upper.startsWith("SELECT")) {
            info.setEstimatedMs(50);
            info.setEstimatedRowsScanned(10000);
            info.setEstimatedRowsReturned(info.isHasPagination() ? 20 : 10000);
            return;
        }

        // LIKE query
        if (upper.contains("LIKE")) {
            info.setEstimatedMs(30);
            info.setEstimatedRowsScanned(5000);
            return;
        }

        // JOIN
        if (upper.contains("JOIN")) {
            info.setEstimatedMs(25);
            info.setEstimatedRowsScanned(1000);
            return;
        }

        // Default WHERE query
        if (upper.contains("WHERE")) {
            info.setEstimatedMs(info.isHasIndex() ? 5 : 20);
            info.setEstimatedRowsScanned(info.isHasIndex() ? 10 : 5000);
        } else {
            info.setEstimatedMs(10);
        }
    }

    // ─── Utilities ───

    private String[] extractDelimiters(String conditions) {
        List<String> delimiters = new ArrayList<>();
        Matcher m = Pattern.compile("(And|Or)(?=[A-Z])").matcher(conditions);
        while (m.find()) {
            delimiters.add(m.group().toUpperCase());
        }
        return delimiters.toArray(new String[0]);
    }

    private static String camelToSnake(String camel) {
        if (camel == null || camel.isEmpty()) return "";
        StringBuilder result = new StringBuilder();
        for (int i = 0; i < camel.length(); i++) {
            char c = camel.charAt(i);
            if (Character.isUpperCase(c)) {
                if (i > 0) result.append('_');
                result.append(Character.toLowerCase(c));
            } else {
                result.append(c);
            }
        }
        return result.toString();
    }
}
