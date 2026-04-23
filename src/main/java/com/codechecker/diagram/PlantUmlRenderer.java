package com.codechecker.diagram;

import net.sourceforge.plantuml.SourceStringReader;
import net.sourceforge.plantuml.FileFormatOption;
import net.sourceforge.plantuml.FileFormat;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.*;
import java.nio.file.*;

/**
 * PlantUmlRenderer — renders .puml source to .png image files.
 * Uses the PlantUML library directly (no external process needed).
 */
@Service
public class PlantUmlRenderer {

    private static final Logger log = LoggerFactory.getLogger(PlantUmlRenderer.class);

    /**
     * Render a .puml file to a .png image in the same directory.
     */
    public String renderToFile(String pumlSource, Path outputDir, String filename) {
        try {
            Path pngFile = outputDir.resolve(filename + ".png");

            SourceStringReader reader = new SourceStringReader(pumlSource);
            try (OutputStream os = Files.newOutputStream(pngFile)) {
                reader.outputImage(os, new FileFormatOption(FileFormat.PNG));
            }

            log.info("Rendered PNG: {}", pngFile.getFileName());
            return pngFile.toString();

        } catch (Exception e) {
            log.error("Failed to render PlantUML diagram: {}", filename, e);
            return null;
        }
    }

    /**
     * Render a .puml file that already exists on disk.
     */
    public String renderPumlFile(Path pumlFile) {
        try {
            String source = Files.readString(pumlFile);
            String baseName = pumlFile.getFileName().toString().replace(".puml", "");
            return renderToFile(source, pumlFile.getParent(), baseName);
        } catch (IOException e) {
            log.error("Failed to read PUML file: {}", pumlFile, e);
            return null;
        }
    }
}
