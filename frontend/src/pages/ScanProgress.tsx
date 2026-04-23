import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getScanStatus, stopScan, getWebSocketUrl } from "../api";
import { Client } from "@stomp/stompjs";
import PageHeader from "@/components/ui/page-header";
import MagicCard from "@/components/ui/magic-card";

interface LogEntry {
  time: string;
  type: string;
  message: string;
}

export default function ScanProgress() {
  const { scanId } = useParams<{ scanId: string }>();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("RUNNING");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!scanId) return;

    // Poll status
    const interval = setInterval(async () => {
      try {
        const s = await getScanStatus(scanId);
        setStatus(s.status);
        if (
          s.status === "COMPLETE" ||
          s.status === "FAILED" ||
          s.status === "STOPPED"
        ) {
          clearInterval(interval);
          if (s.status === "COMPLETE") {
            setProgress(100);
          }
        }
      } catch {
        // ignore
      }
    }, 2000);

    // WebSocket for real-time progress
    const client = new Client({
      brokerURL: getWebSocketUrl(),
      reconnectDelay: 3000,
      onConnect: () => {
        client.subscribe(`/topic/scan/${scanId}`, (message) => {
          const update = JSON.parse(message.body);
          setProgress(update.progress || 0);
          setLogs((prev) => [
            ...prev,
            {
              time: new Date().toLocaleTimeString(),
              type: update.type || "",
              message: update.message || "",
            },
          ]);
        });
      },
      onStompError: () => {
        console.error("STOMP error");
      },
    });

    client.activate();

    return () => {
      clearInterval(interval);
      client.deactivate();
    };
  }, [scanId]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const isRunning = status === "RUNNING";
  const isComplete = status === "COMPLETE";
  const isFailed = status === "FAILED" || status === "STOPPED";

  return (
    <div>
      <PageHeader
        title="Scan Progress"
        subtitle={`Scan ID: ${scanId}`}
        gradient="from-green-400 to-cyan-400"
      />

      <MagicCard
        accentColor={isFailed ? "#ef4444" : isComplete ? "#22c55e" : "#6366f1"}
        className="mb-6 p-6"
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.75rem",
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}
          >
            <span style={{ fontSize: "1.5rem" }}>
              {isRunning ? "🔄" : isComplete ? "✅" : "❌"}
            </span>
            <div>
              <div style={{ fontWeight: 600 }}>
                {isRunning
                  ? "Scanning..."
                  : isComplete
                    ? "Scan Complete!"
                    : "Scan " + status}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                {progress}% complete
              </div>
            </div>
          </div>
          <span className={`badge badge-${status.toLowerCase()}`}>
            {status}
          </span>
        </div>

        <div className="progress-bar-container">
          <div
            className="progress-bar-fill"
            style={{
              width: `${progress}%`,
              background: isFailed
                ? "linear-gradient(90deg, var(--danger), #f87171)"
                : undefined,
            }}
          />
        </div>
      </MagicCard>

      <MagicCard accentColor="#818cf8" hover={false} className="mb-6 p-6">
        <h3
          style={{
            fontSize: "0.9rem",
            fontWeight: 600,
            marginBottom: "0.75rem",
          }}
        >
          Live Output
        </h3>
        <div className="progress-log" ref={logRef}>
          {logs.length === 0 && (
            <div className="progress-log-entry">
              <span className="message" style={{ color: "var(--text-muted)" }}>
                {isRunning ? "Waiting for updates..." : "No log entries"}
              </span>
            </div>
          )}
          {logs.map((log, i) => (
            <div
              key={i}
              className={`progress-log-entry ${log.type === "PHASE_START" || log.type === "PHASE_DONE" ? "phase" : ""} ${log.type === "SCAN_COMPLETE" ? "complete" : ""} ${log.type === "SCAN_FAILED" ? "error" : ""}`}
            >
              <span className="time">{log.time}</span>
              <span className="message">{log.message}</span>
            </div>
          ))}
        </div>
      </MagicCard>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        {isRunning && (
          <button
            className="btn btn-danger"
            onClick={() => {
              stopScan(scanId!);
              setStatus("STOPPING");
            }}
          >
            ⛔ Stop Scan
          </button>
        )}
        {isComplete && (
          <>
            <button
              className="btn btn-primary"
              onClick={() => navigate(`/results/${scanId}`)}
            >
              📈 View Results
            </button>
            <button
              className="btn btn-outline"
              onClick={() => navigate(`/issues/${scanId}`)}
            >
              ⚠️ View Issues
            </button>
            <button
              className="btn btn-outline"
              onClick={() => navigate(`/diagrams/${scanId}`)}
            >
              🗺️ View Diagrams
            </button>
          </>
        )}
        <button className="btn btn-outline" onClick={() => navigate("/scan")}>
          🔍 New Scan
        </button>
      </div>
    </div>
  );
}
