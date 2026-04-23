package com.codechecker.scanner;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;
import java.util.stream.Collectors;

/**
 * ProjectScanner — Agent Component #1
 * 
 * Walks the project directory tree, finds all .java files, and categorizes them
 * into controllers, services, repositories, entities, configs, and other.
 * 
 * Detection is based on file content — scanning for Spring/JAX-RS/Struts
 * annotations.
 */
@Service
public class ProjectScanner {

    private static final Logger log = LoggerFactory.getLogger(ProjectScanner.class);

    private static final Set<String> EXCLUDED_DIRS = Set.of(
            "target", "build", ".git", ".idea", ".vscode", "node_modules",
            ".gradle", ".mvn", "test", "tests", ".settings");

    /**
     * Find all .java files in the project, excluding build/test directories.
     */
    public List<Path> findJavaFiles(String projectPath) throws IOException {
        Path root = Paths.get(projectPath);
        if (!Files.exists(root)) {
            throw new IOException("Project path does not exist: " + projectPath);
        }

        List<Path> javaFiles = new ArrayList<>();

        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                String dirName = dir.getFileName().toString();
                if (EXCLUDED_DIRS.contains(dirName)) {
                    return FileVisitResult.SKIP_SUBTREE;
                }
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                if (file.toString().endsWith(".java")) {
                    javaFiles.add(file);
                }
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFileFailed(Path file, IOException exc) {
                log.warn("Failed to access file: {}", file);
                return FileVisitResult.CONTINUE;
            }
        });

        log.info("Found {} Java files in {}", javaFiles.size(), projectPath);
        return javaFiles;
    }

    /**
     * Categorize Java files by their role based on annotations and naming
     * conventions.
     */
    public Map<String, List<Path>> categorize(List<Path> javaFiles) {
        Map<String, List<Path>> categorized = new LinkedHashMap<>();
        categorized.put("controllers", new ArrayList<>());
        categorized.put("services", new ArrayList<>());
        categorized.put("repositories", new ArrayList<>());
        categorized.put("entities", new ArrayList<>());
        categorized.put("configs", new ArrayList<>());
        categorized.put("soapEndpoints", new ArrayList<>());
        categorized.put("other", new ArrayList<>());

        for (Path file : javaFiles) {
            try {
                String content = Files.readString(file);
                String fileName = file.getFileName().toString();
                String category = detectCategory(content, fileName);
                categorized.get(category).add(file);
            } catch (IOException e) {
                log.warn("Could not read file for categorization: {}", file);
                categorized.get("other").add(file);
            }
        }

        // Log categorization results
        categorized.forEach((cat, files) -> {
            if (!files.isEmpty()) {
                log.info("  {} → {} files", cat, files.size());
            }
        });

        return categorized;
    }

    /**
     * Detect the category of a Java file by scanning its content for known
     * annotations.
     */
    private String detectCategory(String content, String fileName) {
        // Controllers — Spring MVC
        if (content.contains("@RestController") || content.contains("@Controller")) {
            return "controllers";
        }

        // Controllers — SeedStack / JAX-RS
        if ((fileName.endsWith("Resource.java") && content.contains("@Path"))
                || content.contains("javax.ws.rs.Path")
                || content.contains("jakarta.ws.rs.Path")) {
            return "controllers";
        }

        // Controllers — Struts2
        if (content.contains("extends ActionSupport") || content.contains("@Action")) {
            return "controllers";
        }

        // Controllers — Struts1 (Action, DispatchAction, MappingDispatchAction,
        // LookupDispatchAction)
        if (content.contains("extends Action") || content.contains("extends DispatchAction")
                || content.contains("extends MappingDispatchAction")
                || content.contains("extends LookupDispatchAction")) {
            return "controllers";
        }

        // SOAP Endpoints
        if (content.contains("@WebService") && content.contains("@WebMethod")) {
            return "soapEndpoints";
        }
        // SOAP — @WebService class without explicit @WebMethod (all public methods
        // exposed)
        if (content.contains("@WebService")) {
            return "soapEndpoints";
        }
        if (content.contains("@Endpoint") && content.contains("@PayloadRoot")) {
            return "soapEndpoints";
        }

        // Repositories
        if (content.contains("@Repository")
                || content.contains("extends JpaRepository")
                || content.contains("extends CrudRepository")
                || content.contains("extends PagingAndSortingRepository")
                || (content.contains("@Mapper") && content.contains("@Select"))) {
            return "repositories";
        }

        // Entities
        if (content.contains("@Entity") || content.contains("@Table")) {
            return "entities";
        }

        // Services
        if (content.contains("@Service") || content.contains("@Component")) {
            return "services";
        }

        // Config
        if (content.contains("@Configuration") || content.contains("@EnableWebSocket")
                || content.contains("@EnableAsync") || content.contains("@EnableWebMvc")) {
            return "configs";
        }

        return "other";
    }

    /**
     * Discover modules from pom.xml or build.gradle files.
     */
    public List<String> discoverModules(String projectPath) throws IOException {
        List<String> modules = new ArrayList<>();
        Path root = Paths.get(projectPath);

        // Check for Maven multi-module
        Path pomXml = root.resolve("pom.xml");
        if (Files.exists(pomXml)) {
            String pomContent = Files.readString(pomXml);
            // Simple regex to find <module> entries
            java.util.regex.Pattern pattern = java.util.regex.Pattern.compile("<module>([^<]+)</module>");
            java.util.regex.Matcher matcher = pattern.matcher(pomContent);
            while (matcher.find()) {
                modules.add(matcher.group(1));
            }
        }

        // Check for Gradle multi-module
        Path settingsGradle = root.resolve("settings.gradle");
        if (Files.exists(settingsGradle)) {
            String settingsContent = Files.readString(settingsGradle);
            java.util.regex.Pattern pattern = java.util.regex.Pattern.compile("include\\s+['\"]([^'\"]+)['\"]");
            java.util.regex.Matcher matcher = pattern.matcher(settingsContent);
            while (matcher.find()) {
                modules.add(matcher.group(1).replace(":", ""));
            }
        }

        if (modules.isEmpty()) {
            modules.add("root-project");
        }

        log.info("Discovered {} modules: {}", modules.size(), modules);
        return modules;
    }
}
