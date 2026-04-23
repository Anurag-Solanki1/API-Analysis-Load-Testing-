package com.codechecker.model;

/**
 * Scan status enum tracking the lifecycle of a scan run.
 */
public enum ScanStatus {
    QUEUED,
    RUNNING,
    COMPLETE,
    FAILED,
    STOPPED
}
