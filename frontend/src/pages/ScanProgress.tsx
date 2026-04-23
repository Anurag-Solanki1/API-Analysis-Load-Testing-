import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getScanStatus, stopScan, getWebSocketUrl } from "../api";
import { Client } from "@stomp/stompjs";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Loader2, StopCircle, Search, AlertTriangle, Map } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import MagicCard from "@/components/ui/magic-card";
import ShimmerButton from "@/components/ui/shimmer-button";

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

  const StatusIcon = isRunning ? Loader2 : isComplete ? CheckCircle2 : XCircle;
  const statusColor = isFailed ? "#ef4444" : isComplete ? "#22c55e" : "#6366f1";

  return (
    <div>
      <PageHeader
        title="Scan Progress"
        subtitle={`Scan ID: ${scanId}`}
        gradient={isFailed ? "from-red-400 to-orange-400" : isComplete ? "from-green-400 to-cyan-400" : "from-indigo-400 to-purple-400"}
      />

      <MagicCard
        accentColor={statusColor}
        beam={isRunning}
        className="mb-6 p-6"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl border"
              style={{
                background: `${statusColor}15`,
                borderColor: `${statusColor}25`,
              }}
            >
              <StatusIcon
                size={22}
                style={{ color: statusColor }}
                className={isRunning ? "animate-spin" : ""}
              />
            </div>
            <div>
              <div className="text-[0.95rem] font-semibold">
                {isRunning
                  ? "Scanning..."
                  : isComplete
                    ? "Scan Complete!"
                    : "Scan " + status}
              </div>
              <div className="text-[0.78rem] text-txt-muted">
                {progress}% complete
              </div>
            </div>
          </div>
          <span className={`badge badge-${status.toLowerCase()}`}>
            {status}
          </span>
        </div>

        {/* Progress bar */}
        <div className="progress-bar-container">
          <motion.div
            className="progress-bar-fill"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{
              background: isFailed
                ? "linear-gradient(90deg, var(--danger), #f87171)"
                : undefined,
            }}
          />
        </div>
      </MagicCard>

      <MagicCard accentColor="#818cf8" hover={false} className="mb-6 p-6">
        <h3 className="mb-3 text-[0.9rem] font-semibold">Live Output</h3>
        <div className="progress-log" ref={logRef}>
          {logs.length === 0 && (
            <div className="progress-log-entry">
              <span className="message text-txt-muted">
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

      <div className="flex flex-wrap gap-2">
        {isRunning && (
          <ShimmerButton
            shimmerColor="rgba(239,68,68,0.3)"
            onClick={() => {
              stopScan(scanId!);
              setStatus("STOPPING");
            }}
          >
            <StopCircle size={15} /> Stop Scan
          </ShimmerButton>
        )}
        {isComplete && (
          <>
            <ShimmerButton onClick={() => navigate(`/results/${scanId}`)}>
              📈 View Results
            </ShimmerButton>
            <ShimmerButton onClick={() => navigate(`/issues/${scanId}`)}>
              <AlertTriangle size={15} /> View Issues
            </ShimmerButton>
            <ShimmerButton onClick={() => navigate(`/diagrams/${scanId}`)}>
              <Map size={15} /> View Diagrams
            </ShimmerButton>
          </>
        )}
        <button
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-[0.82rem] font-medium text-txt-secondary transition-all hover:border-white/20 hover:text-txt-primary"
          onClick={() => navigate("/scan")}
        >
          <Search size={15} /> New Scan
        </button>
      </div>
    </div>
  );
}
