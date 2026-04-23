package com.codechecker.model;

import java.time.Instant;

/**
 * WebSocket message sent to frontend during scan progress.
 */
public class ScanUpdate {
    private String type;       // PHASE_START, FILE_PARSED, DIAGRAM_DONE, SCAN_COMPLETE, SCAN_FAILED
    private String message;
    private int progress;      // 0-100
    private Instant timestamp;

    public ScanUpdate() {}

    public ScanUpdate(String type, String message, int progress) {
        this.type = type;
        this.message = message;
        this.progress = progress;
        this.timestamp = Instant.now();
    }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }

    public int getProgress() { return progress; }
    public void setProgress(int progress) { this.progress = progress; }

    public Instant getTimestamp() { return timestamp; }
    public void setTimestamp(Instant timestamp) { this.timestamp = timestamp; }
}
