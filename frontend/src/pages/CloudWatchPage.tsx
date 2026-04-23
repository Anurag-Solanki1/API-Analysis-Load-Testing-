import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  ArrowLeft,
  UploadCloud,
  Cloud,
  CheckCircle,
  AlertCircle,
  Trash2,
  History,
  Clock,
} from "lucide-react";
import {
  uploadCloudwatchLogs,
  getAllProjectAnalytics,
  clearProjectAnalytics,
  getProjectBatches,
  getBatchLogs,
  deleteBatch,
} from "../api";
import type { ApiLogEntry, CwBatchSummary } from "../api";
import PageHeader from "@/components/ui/page-header";
import MagicCard from "@/components/ui/magic-card";
import { AnimatedList } from "@/components/ui/animated-list";
import StatCard from "@/components/ui/stat-card";

const CloudWatchPage: React.FC = () => {
  const { projectName } = useParams<{ projectName: string }>();
  const navigate = useNavigate();

  const [logs, setLogs] = useState<ApiLogEntry[]>([]);
  const [logFileStr, setLogFileStr] = useState("");
  const [uploading, setUploading] = useState(false);
  const [importCount, setImportCount] = useState<number | null>(null);
  const [importIssues, setImportIssues] = useState<string[]>([]);
  const [clearing, setClearing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [traceOf, setTraceOf] = useState<number | null>(null);

  // ── Batch / import history ────────────────────────────────────────────
  const [batches, setBatches] = useState<CwBatchSummary[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | "all">("all");
  const [historyOpen, setHistoryOpen] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load existing data on mount ──────────────────────────────────────
  useEffect(() => {
    if (!projectName) return;
    getAllProjectAnalytics(projectName)
      .then((data) => setLogs(Array.isArray(data) ? data : []))
      .catch(() => setLogs([]));
    getProjectBatches(projectName)
      .then((data) => setBatches(data))
      .catch(() => setBatches([]));
  }, [projectName]);



  const handleSelectBatch = async (id: string | "all") => {
    setActiveBatchId(id);
    setTraceOf(null);
    if (!projectName) return;
    if (id === "all") {
      const data = await getAllProjectAnalytics(projectName).catch(() => []);
      setLogs(data);
    } else {
      const data = await getBatchLogs(projectName, id).catch(() => []);
      setLogs(data);
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    try {
      await deleteBatch(batchId);
    } catch {
      showToast("❌ Failed to delete batch — please try again.");
      return;
    }
    const freshBatches = await getProjectBatches(projectName!).catch(
      () => [] as CwBatchSummary[],
    );
    setBatches(freshBatches);
    // If we deleted the active batch, switch to all
    const nextId = activeBatchId === batchId ? "all" : activeBatchId;
    await handleSelectBatch(nextId);
    showToast("Import batch deleted.");
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // ── File picker ───────────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setLogFileStr((ev.target?.result as string) ?? "");
    reader.readAsText(file);
    e.target.value = "";
  };

  // ── Import / upload ───────────────────────────────────────────────────
  const handleImport = async () => {
    if (!projectName || !logFileStr) return;
    setUploading(true);
    try {
      const res = await uploadCloudwatchLogs(projectName, logFileStr);
      setImportCount(res.count);
      setImportIssues(res.issues ?? []);
      // After import always show the combined "all" view (preserves full history view)
      const [freshBatches, freshAll] = await Promise.all([
        getProjectBatches(projectName).catch(() => [] as CwBatchSummary[]),
        getAllProjectAnalytics(projectName).catch(() => [] as ApiLogEntry[]),
      ]);
      setBatches(freshBatches);
      setLogs(freshAll);
      setActiveBatchId("all");
      setLogFileStr("");
      showToast(
        `✓ Imported ${res.count} API calls${res.slowCount > 0 ? ` · ${res.slowCount} slow` : ""}`,
      );
    } catch {
      showToast("❌ Import failed — check the log format.");
    } finally {
      setUploading(false);
    }
  };

  // ── Clear all logs for this project ──────────────────────────────────
  const handleClear = async () => {
    if (!projectName) return;
    setClearing(true);
    try {
      await clearProjectAnalytics(projectName);
      setLogs([]);
      setBatches([]);
      setActiveBatchId("all");
      setImportCount(null);
      setImportIssues([]);
      showToast("Cleared all CloudWatch data for this project.");
    } catch {
      showToast("❌ Failed to clear — please try again.");
    } finally {
      setClearing(false);
    }
  };

  // ── Derived analytics ─────────────────────────────────────────────────

  const slowCount = logs.filter((l) => l.durationMs > 1000).length;

  // Only include entries where we actually measured a duration (>0ms).
  // Single-log-line requests have lastEpoch === firstEpoch → 0ms: not a real measurement.
  const timedLogs = logs.filter((l) => l.durationMs > 0);
  const avgDuration =
    timedLogs.length > 0
      ? Math.round(
          timedLogs.reduce((a, l) => a + l.durationMs, 0) / timedLogs.length,
        )
      : 0;

  // Per-endpoint aggregation for bar chart (exclude 0ms entries from avg)
  const endpointMap: Record<
    string,
    { count: number; totalMs: number; timedCount: number }
  > = {};
  logs.forEach((l) => {
    if (!endpointMap[l.endpointPath])
      endpointMap[l.endpointPath] = { count: 0, totalMs: 0, timedCount: 0 };
    endpointMap[l.endpointPath].count++;
    if (l.durationMs > 0) {
      endpointMap[l.endpointPath].totalMs += l.durationMs;
      endpointMap[l.endpointPath].timedCount++;
    }
  });
  const barData = Object.entries(endpointMap)
    .filter(([, { timedCount }]) => timedCount > 0)
    .map(([path, { count, totalMs, timedCount }]) => ({
      path: path.length > 35 ? "…" + path.slice(-32) : path,
      fullPath: path,
      avg: Math.round(totalMs / timedCount),
      count,
      timedCount,
    }))
    .sort((a, b) => b.avg - a.avg);

  // Timeline points — exclude 0ms (no real measurement) and cap at 200
  const timelineData = timedLogs.slice(-200).map((l) => ({
    time:
      l.timestamp.split("T")[1]?.substring(0, 8) ||
      l.timestamp.substring(11, 19),
    ms: l.durationMs,
    path: l.endpointPath,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* ── Page header ── */}
      <PageHeader
        title={projectName ?? "CloudWatch"}
        subtitle="☁️ CloudWatch Log Analysis"
        gradient="from-amber-400 to-orange-400"
      >
        <button
          className="btn btn-outline btn-sm"
          onClick={() => navigate("/cloudwatch")}
        >
          <ArrowLeft style={{ width: 15, height: 15 }} /> Projects
        </button>
      </PageHeader>

      {/* ── Import History panel (shown when batches exist) ── */}
      {batches.length > 0 && (
        <div
          className="card"
          style={{ padding: 0, border: "1px solid rgba(251,146,60,0.2)" }}
        >
          {/* Header row */}
          <div
            style={{
              padding: "0.75rem 1.25rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(251,146,60,0.04)",
              borderBottom: historyOpen
                ? "1px solid rgba(251,146,60,0.12)"
                : "none",
              cursor: "pointer",
              userSelect: "none",
            }}
            onClick={() => setHistoryOpen((o) => !o)}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                fontSize: "0.8rem",
                fontWeight: 700,
                color: "#fb923c",
              }}
            >
              <History style={{ width: 15, height: 15 }} />
              Import History
              <span
                style={{
                  background: "rgba(251,146,60,0.18)",
                  borderRadius: 999,
                  padding: "0.1rem 0.55rem",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  color: "#fb923c",
                }}
              >
                {batches.length}
              </span>
            </div>
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
              {historyOpen ? "▲" : "▼"}
            </span>
          </div>

          {historyOpen && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.6rem",
                padding: "0.9rem 1.25rem",
              }}
            >
              {/* "All" pill */}
              <button
                onClick={() => handleSelectBatch("all")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.35rem 0.85rem",
                  borderRadius: 8,
                  border: `1px solid ${activeBatchId === "all" ? "#fb923c" : "rgba(255,255,255,0.1)"}`,
                  background:
                    activeBatchId === "all"
                      ? "rgba(251,146,60,0.14)"
                      : "rgba(255,255,255,0.03)",
                  color:
                    activeBatchId === "all" ? "#fb923c" : "var(--text-muted)",
                  fontWeight: activeBatchId === "all" ? 700 : 400,
                  fontSize: "0.78rem",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                All imports
              </button>

              {/* Per-batch pills */}
              {batches.map((b) => {
                // Show the log date range (from the log timestamps, not import time)
                const fmtDay = (ts: string | null) => {
                  if (!ts) return null;
                  const d = new Date(
                    ts.replace("T", " ").replace(/\.\d+$/, ""),
                  );
                  return isNaN(d.getTime())
                    ? null
                    : d.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      });
                };
                const firstDay = fmtDay(b.firstTimestamp);
                const lastDay = fmtDay(b.lastTimestamp);
                const dateRange =
                  firstDay && lastDay && firstDay !== lastDay
                    ? `${firstDay} – ${lastDay}`
                    : (firstDay ?? `Import ${b.importNumber}`);
                const label = `#${b.importNumber} · ${dateRange}`;
                const isActive = activeBatchId === b.batchId;
                return (
                  <div
                    key={b.batchId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0,
                      borderRadius: 8,
                      border: `1px solid ${isActive ? "#fb923c" : "rgba(255,255,255,0.1)"}`,
                      background: isActive
                        ? "rgba(251,146,60,0.14)"
                        : "rgba(255,255,255,0.03)",
                      overflow: "hidden",
                    }}
                  >
                    <button
                      onClick={() => handleSelectBatch(b.batchId)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        padding: "0.35rem 0.75rem",
                        background: "transparent",
                        border: "none",
                        color: isActive ? "#fb923c" : "var(--text-muted)",
                        fontWeight: isActive ? 700 : 400,
                        fontSize: "0.78rem",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Clock style={{ width: 12, height: 12, flexShrink: 0 }} />
                      {label}
                      <span
                        style={{
                          fontSize: "0.68rem",
                          opacity: 0.7,
                          marginLeft: 2,
                        }}
                      >
                        · {b.count} calls
                      </span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteBatch(b.batchId);
                      }}
                      title="Delete this import"
                      style={{
                        padding: "0.35rem 0.5rem",
                        background: "transparent",
                        border: "none",
                        borderLeft: "1px solid rgba(255,255,255,0.07)",
                        cursor: "pointer",
                        color: "rgba(239,68,68,0.55)",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <Trash2 style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Import card ── */}
      <div
        className="card"
        style={{
          padding: 0,
          border: "1px solid rgba(251,146,60,0.3)",
          background: "rgba(251,146,60,0.015)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1rem 1.5rem",
            borderBottom: "1px solid rgba(251,146,60,0.15)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "rgba(251,146,60,0.045)",
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "rgba(251,146,60,0.18)",
                border: "1px solid rgba(251,146,60,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Cloud style={{ width: 19, height: 19, color: "#fb923c" }} />
            </div>
            <div>
              <h3 style={{ fontSize: "0.92rem", fontWeight: 700, margin: 0 }}>
                Import CloudWatch Logs
              </h3>
              <p
                style={{
                  fontSize: "0.72rem",
                  color: "var(--text-muted)",
                  margin: 0,
                }}
              >
                AWS Logs Insights CSV export or plain-text log lines
              </p>
            </div>
          </div>
          {logs.length > 0 && (
            <button
              className="btn btn-outline btn-sm"
              style={{
                fontSize: "0.72rem",
                borderColor: "rgba(239,68,68,0.4)",
                color: "var(--danger)",
              }}
              disabled={clearing}
              onClick={handleClear}
            >
              <Trash2 style={{ width: 13, height: 13, marginRight: 4 }} />
              {clearing ? "Clearing…" : "Clear All"}
            </button>
          )}
        </div>

        {/* Upload area — two-column */}
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}
        >
          {/* Left — drop zone */}
          <div
            style={{
              padding: "1.75rem 1.5rem",
              borderRight: "1px solid rgba(251,146,60,0.12)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.85rem",
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,.log"
              style={{ display: "none" }}
              onChange={handleFileSelect}
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: "2px dashed rgba(251,146,60,0.4)",
                borderRadius: 12,
                padding: "2.5rem 1rem",
                width: "100%",
                textAlign: "center",
                cursor: "pointer",
                background: "rgba(251,146,60,0.03)",
                transition: "border-color 0.2s, background 0.2s",
              }}
            >
              <UploadCloud
                style={{
                  width: 36,
                  height: 36,
                  color: "#fb923c",
                  opacity: 0.7,
                  display: "block",
                  margin: "0 auto 0.75rem",
                }}
              />
              <div
                style={{
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                Drop file here
              </div>
              <div
                style={{
                  fontSize: "0.7rem",
                  color: "var(--text-muted)",
                  marginTop: "0.3rem",
                }}
              >
                or click to browse · .csv .txt .log
              </div>
            </div>
            {logFileStr && (
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "#fb923c",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  fontWeight: 600,
                }}
              >
                <CheckCircle style={{ width: 13, height: 13 }} />
                File ready — {logFileStr
                  .split("\n")
                  .length.toLocaleString()}{" "}
                lines
              </div>
            )}
          </div>

          {/* Right — paste + import button */}
          <div
            style={{
              padding: "1.75rem 1.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <div
              style={{
                fontSize: "0.68rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-muted)",
              }}
            >
              Or paste log content
            </div>
            <textarea
              placeholder={
                'timestamp,message\n1711282805000,"{...}"\n\nor plain-text:\n2026-04-02T10:00:01Z GET /api/users 200 45ms'
              }
              className="form-input"
              style={{
                flex: 1,
                minHeight: 140,
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                resize: "vertical",
              }}
              value={logFileStr}
              onChange={(e) => setLogFileStr(e.target.value)}
            />
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={uploading || !logFileStr}
              style={{
                justifyContent: "center",
                background:
                  uploading || !logFileStr
                    ? undefined
                    : "linear-gradient(135deg,#f97316,#fb923c)",
                borderColor: "transparent",
              }}
            >
              <UploadCloud style={{ width: 14, height: 14, marginRight: 6 }} />
              {uploading ? "Parsing…" : "Import Logs"}
            </button>

            {importCount !== null && (
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontSize: "0.76rem",
                    color: "var(--success)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    fontWeight: 600,
                  }}
                >
                  <CheckCircle style={{ width: 13, height: 13 }} />
                  {importCount} calls imported
                </span>
                {importIssues.length > 0 && (
                  <span
                    style={{
                      fontSize: "0.76rem",
                      color: "var(--danger)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      fontWeight: 600,
                    }}
                  >
                    <AlertCircle style={{ width: 13, height: 13 }} />
                    {importIssues.length} issues
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Results (only shown when data exists) ── */}
      {logs.length > 0 && (
        <>
          {/* Stat row */}
          <AnimatedList
            stagger={0.08}
            className="grid grid-cols-2 sm:grid-cols-4 gap-4"
          >
            <AnimatedList.Item>
              <StatCard
                label="Total Calls"
                value={timedLogs.length}
                color="#fb923c"
                suffix={
                  logs.length > timedLogs.length
                    ? ` / ${logs.length}`
                    : undefined
                }
              />
            </AnimatedList.Item>
            <AnimatedList.Item>
              <StatCard
                label="Unique Endpoints"
                value={new Set(timedLogs.map((l) => l.endpointPath)).size}
                color="#6366f1"
              />
            </AnimatedList.Item>
            <AnimatedList.Item>
              <StatCard
                label="Avg Duration"
                value={timedLogs.length > 0 ? `${avgDuration}ms` : "—"}
                color="#818cf8"
                animateNumber={false}
              />
            </AnimatedList.Item>
            <AnimatedList.Item>
              <StatCard
                label="Slow (> 1s)"
                value={slowCount}
                color={slowCount > 0 ? "#ef4444" : "#22c55e"}
              />
            </AnimatedList.Item>
          </AnimatedList>

          {/* Charts card — only shown when there is timed data */}
          {(barData.length > 0 || timelineData.length > 0) && (
            <MagicCard accentColor="#fb923c" hover={false} className="p-0">
              {/* Bar chart — avg duration per endpoint */}
              {barData.length > 0 && (
                <div
                  style={{
                    padding: "1.25rem 1.5rem",
                    borderBottom:
                      timelineData.length > 0
                        ? "1px solid rgba(251,146,60,0.1)"
                        : "none",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--text-muted)",
                      marginBottom: "1rem",
                    }}
                  >
                    Avg Response Time per Endpoint
                  </div>
                  <ResponsiveContainer
                    width="100%"
                    height={Math.max(120, barData.length * 40)}
                  >
                    <BarChart
                      data={barData}
                      layout="vertical"
                      margin={{ top: 0, right: 24, left: 12, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.05)"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        stroke="#64748b"
                        fontSize={11}
                        tickFormatter={(v) => `${v}ms`}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="path"
                        stroke="#64748b"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        width={160}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1a1f2e",
                          borderColor: "#334155",
                          borderRadius: 8,
                          color: "#e2e8f0",
                          fontSize: "0.8rem",
                        }}
                        formatter={(value: any) => [
                          `${value}ms`,
                          "Avg Duration",
                        ]}
                        labelFormatter={(label) => {
                          const entry = barData.find((d) => d.path === label);
                          if (!entry) return label;
                          const extra =
                            entry.timedCount < entry.count
                              ? ` · ${entry.timedCount} timed / ${entry.count} total`
                              : ` · ${entry.count} calls`;
                          return `${entry.fullPath}${extra}`;
                        }}
                      />
                      <Bar dataKey="avg" fill="#fb923c" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Area chart — response time timeline */}
              {timelineData.length > 0 && (
                <div style={{ padding: "1.25rem 1.5rem" }}>
                  <div
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--text-muted)",
                      marginBottom: "1rem",
                    }}
                  >
                    Response Time Timeline
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart
                      data={timelineData}
                      margin={{ top: 6, right: 20, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="cwPageGrad"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#fb923c"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="#fb923c"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.06)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="time"
                        stroke="#64748b"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                      />
                      <YAxis
                        stroke="#64748b"
                        fontSize={11}
                        tickFormatter={(v) => `${v}ms`}
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1a1f2e",
                          borderColor: "#334155",
                          borderRadius: 8,
                          color: "#e2e8f0",
                          fontSize: "0.8rem",
                        }}
                        labelFormatter={(label) => `Time: ${label}`}
                        formatter={(value: any, _name: any, props: any) => [
                          `${value}ms`,
                          props.payload?.path ?? "Duration",
                        ]}
                        itemStyle={{ color: "#fb923c", fontWeight: 600 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="ms"
                        stroke="#fb923c"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#cwPageGrad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </MagicCard>
          )}

          {/* Issues panel — deduplicated */}
          {importIssues.length > 0 &&
            (() => {
              const counts: Record<string, number> = {};
              importIssues.forEach((msg) => {
                // Normalise: strip trailing line numbers / filenames so
                // repeated "Skipping line X" msgs collapse into one entry.
                const key = msg
                  .replace(/\bline\s+\d+\b/gi, "line N")
                  .replace(/\b\d{4,}\b/g, "N");
                counts[key] = (counts[key] ?? 0) + 1;
              });
              const unique = Object.entries(counts).sort((a, b) => b[1] - a[1]);
              return (
                <div
                  className="card"
                  style={{
                    background: "rgba(239,68,68,0.04)",
                    border: "1px solid rgba(239,68,68,0.2)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      color: "var(--danger)",
                      marginBottom: "0.75rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                    }}
                  >
                    <AlertCircle style={{ width: 14, height: 14 }} />
                    {unique.length} Issue Type{unique.length !== 1 ? "s" : ""}{" "}
                    Detected
                    <span
                      style={{
                        fontWeight: 400,
                        color: "var(--text-muted)",
                        fontSize: "0.72rem",
                      }}
                    >
                      ({importIssues.length} total occurrences)
                    </span>
                  </div>
                  <ul
                    style={{
                      margin: 0,
                      padding: "0 0 0 1rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.35rem",
                    }}
                  >
                    {unique.map(([msg, count]) => (
                      <li
                        key={msg}
                        style={{
                          fontSize: "0.78rem",
                          color: "var(--text-secondary)",
                          fontFamily: "var(--font-mono)",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "1rem",
                        }}
                      >
                        <span>{msg}</span>
                        {count > 1 && (
                          <span
                            style={{
                              flexShrink: 0,
                              fontSize: "0.7rem",
                              fontFamily: "var(--font-sans, Arial)",
                              color: "var(--danger)",
                              fontWeight: 600,
                              background: "rgba(239,68,68,0.1)",
                              borderRadius: 4,
                              padding: "0.1rem 0.4rem",
                            }}
                          >
                            ×{count}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}

          {/* Request Calls & Trace table */}
          <MagicCard accentColor="#fb923c" hover={false} className="p-0">
            <div
              style={{
                padding: "1rem 1.5rem",
                borderBottom: "1px solid rgba(251,146,60,0.1)",
                fontSize: "0.68rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-muted)",
              }}
            >
              Request Calls &amp; Java Trace — {logs.length} calls
              {activeBatchId !== "all" && (
                <span
                  style={{
                    fontWeight: 400,
                    marginLeft: "0.5rem",
                    color: "#fb923c",
                  }}
                >
                  (single import)
                </span>
              )}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.8rem",
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    {["Time", "Method", "Endpoint", "Duration", "Trace"].map(
                      (h) => (
                        <th
                          key={h}
                          style={{
                            padding: "0.6rem 1rem",
                            textAlign: "left",
                            fontWeight: 700,
                            fontSize: "0.7rem",
                            color: "var(--text-muted)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {logs
                    .filter((log) => log.traceLog && log.traceLog.trim() !== "")
                    .map((log) => {
                      const traceLines = log.traceLog
                        ? log.traceLog.split("\n").map((l) => {
                            const parts = l.split("|");
                            return {
                              t: parts[0] ?? "",
                              lvl: parts[1] ?? "",
                              cls: parts[2] ?? "",
                              msg: parts.slice(3).join("|"),
                            };
                          })
                        : [];
                      const isExpanded = traceOf === log.id;
                      const isSlow = log.durationMs > 1000;
                      const methodColors: Record<string, string> = {
                        GET: "#22c55e",
                        POST: "#3b82f6",
                        PUT: "#f59e0b",
                        DELETE: "#ef4444",
                        PATCH: "#a855f7",
                      };
                      return (
                        <React.Fragment key={log.id}>
                          <tr
                            style={{
                              borderBottom: isExpanded
                                ? "none"
                                : "1px solid rgba(255,255,255,0.04)",
                              background: isExpanded
                                ? "rgba(251,146,60,0.06)"
                                : undefined,
                            }}
                          >
                            <td
                              style={{
                                padding: "0.55rem 1rem",
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.75rem",
                                color: "var(--text-muted)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {log.timestamp.includes("T")
                                ? log.timestamp.substring(11, 19)
                                : log.timestamp.substring(11, 19)}
                            </td>
                            <td style={{ padding: "0.55rem 1rem" }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "0.15rem 0.5rem",
                                  borderRadius: 4,
                                  fontSize: "0.68rem",
                                  fontWeight: 700,
                                  background: `${methodColors[log.httpMethod] ?? "#64748b"}22`,
                                  color:
                                    methodColors[log.httpMethod] ?? "#64748b",
                                  border: `1px solid ${methodColors[log.httpMethod] ?? "#64748b"}44`,
                                }}
                              >
                                {log.httpMethod}
                              </span>
                            </td>
                            <td
                              style={{
                                padding: "0.55rem 1rem",
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.78rem",
                                color: "var(--accent-light)",
                              }}
                            >
                              {log.endpointPath}
                            </td>
                            <td
                              style={{
                                padding: "0.55rem 1rem",
                                fontFamily: "var(--font-mono)",
                                fontWeight: 600,
                                color: isSlow
                                  ? "var(--danger)"
                                  : log.durationMs > 500
                                    ? "#f59e0b"
                                    : "var(--success)",
                              }}
                            >
                              {log.durationMs}ms
                              {isSlow && (
                                <span
                                  style={{
                                    marginLeft: 5,
                                    fontSize: "0.65rem",
                                    color: "var(--danger)",
                                  }}
                                >
                                  SLOW
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "0.55rem 1rem" }}>
                              {traceLines.length > 0 ? (
                                <button
                                  onClick={() =>
                                    setTraceOf(isExpanded ? null : log.id)
                                  }
                                  style={{
                                    background: "rgba(251,146,60,0.12)",
                                    border: "1px solid rgba(251,146,60,0.3)",
                                    borderRadius: 6,
                                    color: "#fb923c",
                                    fontSize: "0.7rem",
                                    fontWeight: 600,
                                    padding: "0.2rem 0.6rem",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.3rem",
                                  }}
                                >
                                  {isExpanded ? "▲" : "▼"} {traceLines.length}{" "}
                                  steps
                                </button>
                              ) : (
                                <span
                                  style={{
                                    fontSize: "0.7rem",
                                    color: "var(--text-muted)",
                                  }}
                                >
                                  —
                                </span>
                              )}
                            </td>
                          </tr>
                          {isExpanded && traceLines.length > 0 && (
                            <tr
                              style={{
                                borderBottom:
                                  "1px solid rgba(255,255,255,0.04)",
                              }}
                            >
                              <td
                                colSpan={5}
                                style={{
                                  padding: 0,
                                  background: "rgba(0,0,0,0.25)",
                                }}
                              >
                                <div
                                  style={{
                                    padding: "0.75rem 1.25rem",
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.72rem",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.25rem",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns:
                                        "80px 46px 240px 1fr",
                                      gap: "0.5rem",
                                      marginBottom: "0.3rem",
                                      borderBottom:
                                        "1px solid rgba(255,255,255,0.06)",
                                      paddingBottom: "0.25rem",
                                      fontSize: "0.65rem",
                                      color: "var(--text-muted)",
                                      fontWeight: 700,
                                      textTransform: "uppercase",
                                      letterSpacing: "0.06em",
                                    }}
                                  >
                                    <span>Time</span>
                                    <span>Level</span>
                                    <span>Class</span>
                                    <span>Message</span>
                                  </div>
                                  {traceLines.map((line, idx) => (
                                    <div
                                      key={idx}
                                      style={{
                                        display: "grid",
                                        gridTemplateColumns:
                                          "80px 46px 240px 1fr",
                                        gap: "0.5rem",
                                        padding: "0.15rem 0",
                                        borderBottom:
                                          idx < traceLines.length - 1
                                            ? "1px solid rgba(255,255,255,0.03)"
                                            : "none",
                                      }}
                                    >
                                      <span
                                        style={{ color: "var(--text-muted)" }}
                                      >
                                        {line.t}
                                      </span>
                                      <span
                                        style={{
                                          color:
                                            line.lvl === "ERROR"
                                              ? "var(--danger)"
                                              : line.lvl === "WARN"
                                                ? "#f59e0b"
                                                : "#64748b",
                                          fontWeight:
                                            line.lvl === "ERROR" ? 700 : 400,
                                        }}
                                      >
                                        {line.lvl}
                                      </span>
                                      <span
                                        style={{
                                          color: "#fb923c",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          whiteSpace: "nowrap",
                                        }}
                                        title={line.cls}
                                      >
                                        {line.cls}
                                      </span>
                                      <span
                                        style={{
                                          color: "var(--text-secondary)",
                                          whiteSpace: "pre-wrap",
                                          wordBreak: "break-word",
                                        }}
                                      >
                                        {line.msg}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </MagicCard>
        </>
      )}

      {/* ── Empty state (no data yet, no file selected) ── */}
      {logs.length === 0 && !logFileStr && (
        <div
          style={{
            textAlign: "center",
            padding: "2.5rem 1rem",
            color: "var(--text-muted)",
          }}
        >
          <Cloud
            style={{
              width: 44,
              height: 44,
              color: "#fb923c",
              opacity: 0.35,
              display: "block",
              margin: "0 auto 0.75rem",
            }}
          />
          <p style={{ fontSize: "0.85rem" }}>
            Upload or paste a CloudWatch Logs Insights CSV export to begin
            analysis.
          </p>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "1.5rem",
            right: "1.5rem",
            background: "#1e293b",
            border: "1px solid rgba(251,146,60,0.4)",
            color: "#f1f5f9",
            padding: "0.75rem 1.25rem",
            borderRadius: 10,
            fontSize: "0.82rem",
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            zIndex: 9999,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
};

export default CloudWatchPage;
