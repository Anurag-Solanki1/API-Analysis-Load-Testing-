package com.codechecker.parser;

import com.codechecker.model.EndpointInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.w3c.dom.*;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;

/**
 * StrutsXmlParser — Parses struts.xml (Struts 2) and struts-config.xml (Struts
 * 1)
 * to discover action mappings that are defined via XML rather than annotations.
 *
 * Struts 2 format (struts.xml):
 * <package name="..." namespace="/admin" extends="struts-default">
 * <action name="listUsers" class="com.example.UserAction" method="list">
 * <result>/WEB-INF/views/users.jsp</result>
 * </action>
 * </package>
 *
 * Struts 1 format (struts-config.xml):
 * <action-mappings>
 * <action path="/login" type="com.example.LoginAction"
 * name="loginForm" scope="request" validate="true">
 * <forward name="success" path="/WEB-INF/views/home.jsp"/>
 * </action>
 * </action-mappings>
 */
@Service
public class StrutsXmlParser {

    private static final Logger log = LoggerFactory.getLogger(StrutsXmlParser.class);

    private static final Set<String> EXCLUDED_DIRS = Set.of(
            "target", "build", ".git", ".idea", ".vscode", "node_modules",
            ".gradle", ".mvn", "test", "tests", ".settings");

    /**
     * Find and parse all struts XML config files in the project.
     * Returns endpoints discovered from XML action mappings.
     */
    public List<EndpointInfo> parseProject(String projectPath) {
        List<EndpointInfo> endpoints = new ArrayList<>();
        Path root = Paths.get(projectPath);

        if (!Files.exists(root)) {
            return endpoints;
        }

        try {
            List<Path> configFiles = findStrutsConfigs(root);
            for (Path configFile : configFiles) {
                String fileName = configFile.getFileName().toString().toLowerCase();
                if (fileName.equals("struts.xml") || fileName.startsWith("struts-")
                        && !fileName.equals("struts-config.xml")) {
                    endpoints.addAll(parseStruts2Xml(configFile));
                } else if (fileName.equals("struts-config.xml")) {
                    endpoints.addAll(parseStruts1Xml(configFile));
                }
            }
        } catch (IOException e) {
            log.warn("Failed to scan for Struts config files in {}", projectPath, e);
        }

        if (!endpoints.isEmpty()) {
            log.info("Discovered {} endpoints from Struts XML configs", endpoints.size());
        }

        return endpoints;
    }

    /**
     * Find struts.xml and struts-config.xml files in the project.
     */
    private List<Path> findStrutsConfigs(Path root) throws IOException {
        List<Path> configs = new ArrayList<>();

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
                String name = file.getFileName().toString().toLowerCase();
                if (name.equals("struts.xml") || name.equals("struts-config.xml")) {
                    configs.add(file);
                }
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFileFailed(Path file, IOException exc) {
                return FileVisitResult.CONTINUE;
            }
        });

        return configs;
    }

    /**
     * Parse Struts 2 struts.xml format.
     */
    private List<EndpointInfo> parseStruts2Xml(Path configFile) {
        List<EndpointInfo> endpoints = new ArrayList<>();
        log.info("Parsing Struts 2 config: {}", configFile);

        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.parse(configFile.toFile());
            doc.getDocumentElement().normalize();

            NodeList packages = doc.getElementsByTagName("package");
            for (int i = 0; i < packages.getLength(); i++) {
                Element pkg = (Element) packages.item(i);
                String namespace = pkg.getAttribute("namespace");
                if (namespace.isEmpty())
                    namespace = "/";

                NodeList actions = pkg.getElementsByTagName("action");
                for (int j = 0; j < actions.getLength(); j++) {
                    Element action = (Element) actions.item(j);
                    String actionName = action.getAttribute("name");
                    String actionClass = action.getAttribute("class");
                    String actionMethod = action.getAttribute("method");

                    if (actionName == null || actionName.isEmpty())
                        continue;

                    EndpointInfo ep = new EndpointInfo();
                    ep.setHttpMethod("POST");
                    String path = namespace.endsWith("/")
                            ? namespace + actionName + ".action"
                            : namespace + "/" + actionName + ".action";
                    ep.setPath(path);
                    ep.setControllerClass(extractSimpleClassName(actionClass));
                    ep.setControllerMethod(actionMethod != null && !actionMethod.isEmpty()
                            ? actionMethod
                            : "execute");
                    ep.setFramework("STRUTS2");
                    ep.setAuthExpression("NO AUTH");

                    endpoints.add(ep);
                    log.debug("Struts2 XML action: {} → {}.{}()",
                            path, ep.getControllerClass(), ep.getControllerMethod());
                }
            }
        } catch (Exception e) {
            log.error("Failed to parse Struts 2 XML: {}", configFile, e);
        }

        return endpoints;
    }

    /**
     * Parse Struts 1 struts-config.xml format.
     */
    private List<EndpointInfo> parseStruts1Xml(Path configFile) {
        List<EndpointInfo> endpoints = new ArrayList<>();
        log.info("Parsing Struts 1 config: {}", configFile);

        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.parse(configFile.toFile());
            doc.getDocumentElement().normalize();

            NodeList actions = doc.getElementsByTagName("action");
            for (int i = 0; i < actions.getLength(); i++) {
                Element action = (Element) actions.item(i);
                String actionPath = action.getAttribute("path");
                String actionType = action.getAttribute("type");
                String actionParameter = action.getAttribute("parameter");

                if (actionPath == null || actionPath.isEmpty())
                    continue;

                EndpointInfo ep = new EndpointInfo();
                ep.setHttpMethod("POST");
                String fullPath = actionPath.endsWith(".do") ? actionPath : actionPath + ".do";
                ep.setPath(fullPath);
                ep.setControllerClass(extractSimpleClassName(actionType));
                ep.setControllerMethod(actionParameter != null && !actionParameter.isEmpty()
                        ? actionParameter
                        : "execute");
                ep.setFramework("STRUTS1");
                ep.setAuthExpression("NO AUTH");

                // Check for form validation
                String validate = action.getAttribute("validate");
                ep.setHasValidation("true".equalsIgnoreCase(validate));

                endpoints.add(ep);
                log.debug("Struts1 XML action: {} → {}.{}()",
                        fullPath, ep.getControllerClass(), ep.getControllerMethod());
            }
        } catch (Exception e) {
            log.error("Failed to parse Struts 1 XML: {}", configFile, e);
        }

        return endpoints;
    }

    /**
     * Extract simple class name from fully qualified name.
     */
    private String extractSimpleClassName(String fqcn) {
        if (fqcn == null || fqcn.isEmpty())
            return "UnknownAction";
        int lastDot = fqcn.lastIndexOf('.');
        return lastDot >= 0 ? fqcn.substring(lastDot + 1) : fqcn;
    }
}
