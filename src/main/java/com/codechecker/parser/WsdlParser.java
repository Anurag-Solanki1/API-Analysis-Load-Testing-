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
 * WsdlParser — Parses WSDL files to discover SOAP operations.
 *
 * Supports both WSDL 1.1 and basic WSDL 2.0 formats.
 * Extracts operations from portType/binding definitions and maps them
 * as SOAP endpoints for analysis.
 */
@Service
public class WsdlParser {

    private static final Logger log = LoggerFactory.getLogger(WsdlParser.class);

    private static final Set<String> EXCLUDED_DIRS = Set.of(
            "target", "build", ".git", ".idea", ".vscode", "node_modules",
            ".gradle", ".mvn", "test", "tests", ".settings");

    /**
     * Find and parse all WSDL files in the project.
     */
    public List<EndpointInfo> parseProject(String projectPath) {
        List<EndpointInfo> endpoints = new ArrayList<>();
        Path root = Paths.get(projectPath);

        if (!Files.exists(root)) {
            return endpoints;
        }

        try {
            List<Path> wsdlFiles = findWsdlFiles(root);
            for (Path wsdlFile : wsdlFiles) {
                endpoints.addAll(parseWsdl(wsdlFile));
            }
        } catch (IOException e) {
            log.warn("Failed to scan for WSDL files in {}", projectPath, e);
        }

        if (!endpoints.isEmpty()) {
            log.info("Discovered {} SOAP operations from WSDL files", endpoints.size());
        }

        return endpoints;
    }

    private List<Path> findWsdlFiles(Path root) throws IOException {
        List<Path> wsdlFiles = new ArrayList<>();

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
                if (file.toString().toLowerCase().endsWith(".wsdl")) {
                    wsdlFiles.add(file);
                }
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFileFailed(Path file, IOException exc) {
                return FileVisitResult.CONTINUE;
            }
        });

        return wsdlFiles;
    }

    /**
     * Parse a single WSDL file and extract SOAP operations.
     */
    private List<EndpointInfo> parseWsdl(Path wsdlFile) {
        List<EndpointInfo> endpoints = new ArrayList<>();
        log.info("Parsing WSDL: {}", wsdlFile);

        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.parse(wsdlFile.toFile());
            doc.getDocumentElement().normalize();

            // Extract service name from <wsdl:service> or <definitions> name attribute
            String serviceName = extractServiceName(doc, wsdlFile);

            // Extract service URL from <soap:address location="..."/>
            String serviceUrl = extractServiceLocation(doc);

            // Parse operations from <portType> elements (WSDL 1.1)
            NodeList portTypes = doc.getElementsByTagNameNS("*", "portType");
            for (int i = 0; i < portTypes.getLength(); i++) {
                Element portType = (Element) portTypes.item(i);
                String portTypeName = portType.getAttribute("name");

                NodeList operations = portType.getElementsByTagNameNS("*", "operation");
                for (int j = 0; j < operations.getLength(); j++) {
                    Element operation = (Element) operations.item(j);
                    String opName = operation.getAttribute("name");

                    if (opName == null || opName.isEmpty())
                        continue;

                    EndpointInfo ep = new EndpointInfo();
                    ep.setHttpMethod("SOAP");
                    String basePath = serviceUrl != null && !serviceUrl.isEmpty()
                            ? extractPathFromUrl(serviceUrl)
                            : "/ws/" + serviceName;
                    ep.setPath(basePath + "/" + opName);
                    ep.setControllerClass(portTypeName != null && !portTypeName.isEmpty()
                            ? portTypeName
                            : serviceName);
                    ep.setControllerMethod(opName);
                    ep.setFramework("JAX_WS");
                    ep.setAuthExpression("NO AUTH");

                    endpoints.add(ep);
                    log.debug("WSDL operation: SOAP {} → {}.{}()",
                            ep.getPath(), ep.getControllerClass(), opName);
                }
            }

            // WSDL 2.0 — <interface> instead of <portType>
            if (endpoints.isEmpty()) {
                NodeList interfaces = doc.getElementsByTagNameNS("*", "interface");
                for (int i = 0; i < interfaces.getLength(); i++) {
                    Element iface = (Element) interfaces.item(i);
                    String ifaceName = iface.getAttribute("name");

                    NodeList operations = iface.getElementsByTagNameNS("*", "operation");
                    for (int j = 0; j < operations.getLength(); j++) {
                        Element operation = (Element) operations.item(j);
                        String opName = operation.getAttribute("name");
                        if (opName == null || opName.isEmpty())
                            continue;

                        EndpointInfo ep = new EndpointInfo();
                        ep.setHttpMethod("SOAP");
                        ep.setPath("/ws/" + serviceName + "/" + opName);
                        ep.setControllerClass(ifaceName != null && !ifaceName.isEmpty()
                                ? ifaceName
                                : serviceName);
                        ep.setControllerMethod(opName);
                        ep.setFramework("JAX_WS");
                        ep.setAuthExpression("NO AUTH");
                        endpoints.add(ep);
                    }
                }
            }

        } catch (Exception e) {
            log.error("Failed to parse WSDL: {}", wsdlFile, e);
        }

        return endpoints;
    }

    private String extractServiceName(Document doc, Path wsdlFile) {
        // Try <service name="...">
        NodeList services = doc.getElementsByTagNameNS("*", "service");
        if (services.getLength() > 0) {
            String name = ((Element) services.item(0)).getAttribute("name");
            if (name != null && !name.isEmpty())
                return name;
        }
        // Try <definitions name="...">
        String defName = doc.getDocumentElement().getAttribute("name");
        if (defName != null && !defName.isEmpty())
            return defName;
        // Fall back to filename
        String fileName = wsdlFile.getFileName().toString();
        return fileName.replace(".wsdl", "").replace(".WSDL", "");
    }

    private String extractServiceLocation(Document doc) {
        // Look for <soap:address location="..."/> or <soap12:address location="..."/>
        NodeList addresses = doc.getElementsByTagNameNS("*", "address");
        for (int i = 0; i < addresses.getLength(); i++) {
            Element addr = (Element) addresses.item(i);
            String location = addr.getAttribute("location");
            if (location != null && !location.isEmpty()) {
                return location;
            }
        }
        return null;
    }

    private String extractPathFromUrl(String url) {
        try {
            java.net.URI uri = new java.net.URI(url);
            String path = uri.getPath();
            return (path != null && !path.isEmpty()) ? path : "/ws";
        } catch (Exception e) {
            return "/ws";
        }
    }
}
