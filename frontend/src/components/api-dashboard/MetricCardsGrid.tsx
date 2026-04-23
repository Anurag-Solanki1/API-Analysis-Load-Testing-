import React from "react";
import { motion } from "framer-motion";
import MetricCard from "./MetricCard";
import type { ApiLogEntry } from "@/api";

interface LiveStats {
  type: string;
  totalRequests: number;
  plannedTotalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTimeMs: number;
  successAvgMs: number;
  failedAvgMs: number;
  minResponseTimeMs: number;
  maxResponseTimeMs: number;
  throughput: number;
  elapsedSeconds: number;
  threads: number;
  requestsPerThread: number;
  statusCodeDistribution: Record<string, number>;
  percentiles?: { p50: number; p90: number; p95: number; p99: number };
}

interface HistoryEntry {
  id: string;
  runAt: string;
  url: string;
  method: string;
  threads: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successAvgMs: number;
  minResponseTimeMs: number;
  maxResponseTimeMs: number;
  throughput: number;
  percentiles?: { p50: number; p90: number; p95: number; p99: number };
  statusCodeDistribution: Record<string, number>;
}

interface MetricCardsGridProps {
  liveStats: LiveStats | null;
  liveTestHistory: HistoryEntry[];
  ltSelectedRunId: string | null;
  onSelectRun: (id: string | null) => void;
  apmLogs: ApiLogEntry[];
  apmAverage: number;
  apmErrors: number;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, scale: 0.95 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.25 } },
};

const MetricCardsGrid: React.FC<MetricCardsGridProps> = ({
  liveStats,
  liveTestHistory,
  ltSelectedRunId,
  onSelectRun,
  apmLogs,
  apmAverage,
  apmErrors,
}) => {
  const hasLive = liveStats !== null && liveStats.totalRequests > 0;
  const hasHistory = liveTestHistory.length > 0;

  // ── Compute cumulative stats ──
  const totalHitsAll = liveTestHistory.reduce((s, e) => s + e.totalRequests, 0);
  const totalFailedAll = liveTestHistory.reduce(
    (s, e) => s + e.failedRequests,
    0,
  );
  const avgLatencyAll =
    totalHitsAll > 0
      ? Math.round(
          liveTestHistory.reduce(
            (s, e) => s + e.successAvgMs * e.totalRequests,
            0,
          ) / totalHitsAll,
        )
      : 0;
  const minAll = hasHistory
    ? Math.min(...liveTestHistory.map((e) => e.minResponseTimeMs))
    : 0;
  const maxAll = hasHistory
    ? Math.max(...liveTestHistory.map((e) => e.maxResponseTimeMs))
    : 0;
  const throughputAll = hasHistory
    ? parseFloat(
        (
          liveTestHistory.reduce((s, e) => s + e.throughput, 0) /
          liveTestHistory.length
        ).toFixed(1),
      )
    : 0;
  const p90All =
    hasHistory && liveTestHistory[0].percentiles
      ? Math.round(
          liveTestHistory.reduce(
            (s, e) => s + (e.percentiles?.p90 ?? 0) * e.totalRequests,
            0,
          ) / totalHitsAll,
        )
      : null;
  const p99All =
    hasHistory && liveTestHistory[0].percentiles
      ? Math.round(
          liveTestHistory.reduce(
            (s, e) => s + (e.percentiles?.p99 ?? 0) * e.totalRequests,
            0,
          ) / totalHitsAll,
        )
      : null;

  const selectedEntry = ltSelectedRunId
    ? (liveTestHistory.find((e) => e.id === ltSelectedRunId) ?? null)
    : null;

  // ── Resolve displayed values ──
  let dispHits: number, dispAvg: number, dispErrCount: number;
  let dispErrRate: string, dispP90: string, dispP99: string;
  let dispMin: string, dispMax: string, dispThroughput: string;

  if (hasLive) {
    const ls = liveStats!;
    dispHits = ls.totalRequests;
    dispAvg = ls.successAvgMs;
    dispErrCount = ls.failedRequests;
    dispErrRate =
      ls.totalRequests > 0
        ? ((ls.failedRequests / ls.totalRequests) * 100).toFixed(1)
        : "0";
    dispP90 = ls.percentiles ? `${ls.percentiles.p90 ?? 0}ms` : "—";
    dispP99 = ls.percentiles ? `${ls.percentiles.p99 ?? 0}ms` : "—";
    dispMin = `${ls.minResponseTimeMs}ms`;
    dispMax = `${ls.maxResponseTimeMs}ms`;
    dispThroughput = `${ls.throughput} req/s`;
  } else if (selectedEntry) {
    dispHits = selectedEntry.totalRequests;
    dispAvg = selectedEntry.successAvgMs;
    dispErrCount = selectedEntry.failedRequests;
    dispErrRate =
      selectedEntry.totalRequests > 0
        ? (
            (selectedEntry.failedRequests / selectedEntry.totalRequests) *
            100
          ).toFixed(1)
        : "0";
    dispP90 = selectedEntry.percentiles
      ? `${selectedEntry.percentiles.p90 ?? 0}ms`
      : "—";
    dispP99 = selectedEntry.percentiles
      ? `${selectedEntry.percentiles.p99 ?? 0}ms`
      : "—";
    dispMin = `${selectedEntry.minResponseTimeMs}ms`;
    dispMax = `${selectedEntry.maxResponseTimeMs}ms`;
    dispThroughput = `${selectedEntry.throughput} req/s`;
  } else if (hasHistory) {
    dispHits = totalHitsAll;
    dispAvg = avgLatencyAll;
    dispErrCount = totalFailedAll;
    dispErrRate =
      totalHitsAll > 0
        ? ((totalFailedAll / totalHitsAll) * 100).toFixed(1)
        : "0";
    dispP90 = p90All !== null ? `${p90All}ms` : "—";
    dispP99 = p99All !== null ? `${p99All}ms` : "—";
    dispMin = `${minAll}ms`;
    dispMax = `${maxAll}ms`;
    dispThroughput = `${throughputAll} req/s`;
  } else {
    dispHits = apmLogs.length;
    dispAvg = apmAverage;
    dispErrCount = apmErrors;
    dispErrRate =
      apmLogs.length > 0
        ? ((apmErrors / apmLogs.length) * 100).toFixed(1)
        : "0";
    dispP90 = "—";
    dispP99 = "—";
    dispMin = "—";
    dispMax = "—";
    dispThroughput = "—";
  }

  const cards = [
    { label: "Total Hits", value: dispHits.toLocaleString(), color: "#818cf8" },
    { label: "Avg Latency", value: `${dispAvg}ms`, color: "#3b82f6" },
    { label: "P90", value: dispP90, color: "#f59e0b" },
    { label: "P99", value: dispP99, color: "#ef4444" },
    { label: "Min", value: dispMin, color: "#22c55e" },
    { label: "Max", value: dispMax, color: "#f59e0b" },
    {
      label: "Error Rate",
      value: `${dispErrRate}%`,
      color: dispErrCount > 0 ? "#ef4444" : "#22c55e",
    },
    { label: "Throughput", value: dispThroughput, color: "#a78bfa" },
  ];

  return (
    <>
      {/* Run selector */}
      {!hasLive && hasHistory && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-txt-muted">Showing:</span>
          <button
            onClick={() => onSelectRun(null)}
            className={`rounded-md border px-3 py-1 text-xs font-semibold transition-colors ${
              ltSelectedRunId === null
                ? "border-indigo-500 bg-indigo-600 text-white"
                : "border-border bg-surface-card text-txt-secondary hover:bg-surface-card-hover"
            }`}
          >
            All Runs (avg)
          </button>
          {[...liveTestHistory].reverse().map((entry, idx) => (
            <button
              key={entry.id}
              onClick={() => onSelectRun(entry.id)}
              title={`Run #${idx + 1} — ${entry.runAt}`}
              className={`rounded-md border px-3 py-1 text-xs font-semibold transition-colors ${
                ltSelectedRunId === entry.id
                  ? "border-indigo-500 bg-indigo-600 text-white"
                  : "border-border bg-surface-card text-txt-secondary hover:bg-surface-card-hover"
              }`}
            >
              Run #{idx + 1}
            </button>
          ))}
        </div>
      )}

      {/* Cards grid */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-4 gap-3"
      >
        {cards.map((c) => (
          <motion.div key={c.label} variants={item}>
            <MetricCard label={c.label} value={c.value} color={c.color} />
          </motion.div>
        ))}
      </motion.div>
    </>
  );
};

export default MetricCardsGrid;
