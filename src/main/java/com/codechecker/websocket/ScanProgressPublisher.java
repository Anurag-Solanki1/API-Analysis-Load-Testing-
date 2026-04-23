package com.codechecker.websocket;

import com.codechecker.model.ScanUpdate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

/**
 * Publishes scan progress updates to connected WebSocket clients.
 * Frontend subscribes to /topic/scan/{scanId} to receive real-time updates.
 */
@Component
public class ScanProgressPublisher {

    private static final Logger log = LoggerFactory.getLogger(ScanProgressPublisher.class);

    @Autowired
    @Lazy
    private SimpMessagingTemplate messagingTemplate;

    /**
     * Publish a progress update for a specific scan.
     *
     * @param scanId   UUID of the scan
     * @param type     Event type (PHASE_START, FILE_PARSED, DIAGRAM_DONE,
     *                 SCAN_COMPLETE, etc.)
     * @param message  Human-readable progress message
     * @param progress Percentage 0-100 (-1 for error)
     */
    public void publish(String scanId, String type, String message, int progress) {
        ScanUpdate update = new ScanUpdate(type, message, progress);

        try {
            messagingTemplate.convertAndSend("/topic/scan/" + scanId, update);
            log.debug("[{}] {}% {} — {}", scanId.substring(0, 8), progress, type, message);
        } catch (Exception e) {
            log.warn("Failed to publish WebSocket update for scan {}: {}", scanId, e.getMessage());
        }
    }
}
