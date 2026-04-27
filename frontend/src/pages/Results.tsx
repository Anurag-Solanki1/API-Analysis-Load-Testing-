import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getScanSummary, getEndpoints, getIssues, toggleScanVisibility } from "../api";
import type { ScanSummary, EndpointResult, IssueResult } from "../api";
import PageHeader from "@/components/ui/page-header";
import MagicCard from "@/components/ui/magic-card";
import { AnimatedList } from "@/components/ui/animated-list";
import StatCard from "@/components/ui/stat-card";
import ShimmerButton from "@/components/ui/shimmer-button";

type LtEntry = {
  successAvgMs: number;
  totalRequests?: number;
  successfulRequests?: number;
  percentiles?: { p50: number; p90: number; p95: number; p99: number };
  runAt?: string;
};

/**
 * Scan ALL lt-history entries in localStorage for a given method+path and
 * compute a CUMULATIVE weighted average across every run ever recorded.
 * When runIndex is provided (0 = most recent), returns stats for that specific run only.
 * Weight = successfulRequests (or totalRequests) so a 100-hit run counts
 * more than a 5-hit run.  Percentiles are approximated as a weighted median
 * of the per-run values.
 */
function findBestEntry(
  projectName: string,
  method: string,
  path: string,
  runIndex: number | null = null,
): LtEntry | null {
  try {
    // Look up ONLY the exact key for this project+method+path
    const exactKey = `lt-history:${projectName}:${method}:${path}`;
    const allRuns: LtEntry[] = [];
    const raw = localStorage.getItem(exactKey);
    if (raw) {
      const arr: LtEntry[] = JSON.parse(raw);
      allRuns.push(...arr);
    }
    if (allRuns.length === 0) return null;

    // If a specific run index is requested, return that run directly
    // allRuns is newest-first (localStorage stores newest at index 0),
    // so index 0 = oldest when reversed: allRuns.length-1-runIndex gives oldest=0
    if (runIndex !== null) {
      return allRuns[allRuns.length - 1 - runIndex] ?? null;
    }
    let totalWeight = 0;
    let weightedAvgSum = 0;
    const weightedP: {
      p50: number;
      p90: number;
      p95: number;
      p99: number;
      w: number;
    }[] = [];

    for (const run of allRuns) {
      const w = run.successfulRequests ?? run.totalRequests ?? 1;
      weightedAvgSum += run.successAvgMs * w;
      totalWeight += w;
      if (run.percentiles) {
        weightedP.push({ ...run.percentiles, w });
      }
    }

    const cumulativeAvg = totalWeight > 0 ? weightedAvgSum / totalWeight : 0;

    // Weighted percentiles: sort each pN array by value, find weight-median
    let cumulativeP: LtEntry["percentiles"] | undefined;
    if (weightedP.length > 0) {
      const wavg = (vals: { v: number; w: number }[]) => {
        const sorted = [...vals].sort((a, b) => a.v - b.v);
        const half = sorted.reduce((s, x) => s + x.w, 0) / 2;
        let acc = 0;
        for (const x of sorted) {
          acc += x.w;
          if (acc >= half) return x.v;
        }
        return sorted[sorted.length - 1].v;
      };
      cumulativeP = {
        p50: wavg(weightedP.map((x) => ({ v: x.p50, w: x.w }))),
        p90: wavg(weightedP.map((x) => ({ v: x.p90, w: x.w }))),
        p95: wavg(weightedP.map((x) => ({ v: x.p95, w: x.w }))),
        p99: wavg(weightedP.map((x) => ({ v: x.p99, w: x.w }))),
      };
    }

    return {
      successAvgMs: cumulativeAvg,
      totalRequests: totalWeight,
      percentiles: cumulativeP,
    };
  } catch {
    return null;
  }
}

/** Derive a performance rating from a measured avg ms. */
function ratingFromAvg(avgMs: number): "fast" | "moderate" | "slow" {
  if (avgMs < 300) return "fast";
  if (avgMs <= 1000) return "moderate";
  return "slow";
}

export default function Results() {
  const { scanId: paramScanId } = useParams<{ scanId: string }>();
  const [scanId, setScanId] = useState(paramScanId || "");
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [endpoints, setEndpoints] = useState<EndpointResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [aiIssues, setAiIssues] = useState<IssueResult[]>([]);
  /** measured avg ms per "METHOD:path" key */
  const [measuredAvg, setMeasuredAvg] = useState<Record<string, number>>({});
  /** measured p50/p95 ms per "METHOD:path" key */
  const [measuredPct, setMeasuredPct] = useState<
    Record<string, { p50: number; p95: number }>
  >({});
  /** null = cumulative all-runs avg; N = show only the Nth run (0 = most recent) */
  const [ltRunIndex, setLtRunIndex] = useState<number | null>(null);
  /** maximum number of runs available across any endpoint's history */
  const [maxRunCount, setMaxRunCount] = useState(0);
  const navigate = useNavigate();

  /** Compute the max number of load-test runs for THIS project's lt-history keys. */
  const refreshMaxRunCount = (pName?: string) => {
    const prefix = pName ? `lt-history:${pName}:` : null;
    let max = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith("lt-history:")) continue;
      if (prefix && !key.startsWith(prefix)) continue;
      try {
        const arr = JSON.parse(localStorage.getItem(key) ?? "[]");
        if (Array.isArray(arr) && arr.length > max) max = arr.length;
      } catch {
        /* ignore */
      }
    }
    setMaxRunCount(max);
  };

  /** Read load-test results from localStorage for the current project's endpoint list. */
  const refreshMeasured = (
    eps: EndpointResult[],
    runIndex: number | null = null,
    pName?: string,
  ) => {
    const projName = pName || summary?.projectName || "";
    if (!projName || !Array.isArray(eps)) return;
    const avgMap: Record<string, number> = {};
    const pctMap: Record<string, { p50: number; p95: number }> = {};
    for (const ep of eps) {
      const entry = findBestEntry(projName, ep.httpMethod, ep.path, runIndex);
      if (!entry) continue;
      const k = `${ep.httpMethod}:${ep.path}`;
      avgMap[k] = entry.successAvgMs;
      if (entry.percentiles) {
        pctMap[k] = { p50: entry.percentiles.p50, p95: entry.percentiles.p95 };
      }
    }
    setMeasuredAvg(avgMap);
    setMeasuredPct(pctMap);
  };

  useEffect(() => {
    if (paramScanId) {
      loadResults(paramScanId);
    }
  }, [paramScanId]);

  /** Refresh measured data whenever endpoints are loaded or a load test writes to localStorage. */
  useEffect(() => {
    if (endpoints.length === 0 || !summary?.projectName) return;
    const pName = summary.projectName;
    refreshMeasured(endpoints, ltRunIndex, pName);
    refreshMaxRunCount(pName);
    // Also refresh automatically when ApiDashboard writes new test results
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith(`lt-history:${pName}:`)) {
        refreshMeasured(endpoints, ltRunIndex, pName);
        refreshMaxRunCount(pName);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [endpoints, ltRunIndex, summary?.projectName]);

  const loadResults = async (id: string) => {
    setLoading(true);
    setError("");
    try {
      const [sum, eps] = await Promise.all([
        getScanSummary(id),
        getEndpoints(id),
      ]);
      setSummary(sum);
      setEndpoints(eps);
      setScanId(id);
      setIsPublic(sum.isPublic || false);
      // Fetch AI issues separately — non-fatal if not yet imported
      getIssues(id)
        .then((issues) => {
          let ai = issues.filter((i) => i.source === "AI_AGENT");
          // Hide critical issues for CIN-VIN project
          if (sum.projectName === "CIN-VIN") {
            ai = ai.filter((i) => i.severity !== "CRITICAL");
          }
          setAiIssues(ai);
        })
        .catch(() => {});
    } catch {
      setError("Could not load results. Check the scan ID.");
    }
    setLoading(false);
  };

  const hasMeasured = Object.keys(measuredAvg).length > 0;

  const handleToggleVisibility = async () => {
    if (!scanId || togglingVisibility) return;
    setTogglingVisibility(true);
    try {
      const res = await toggleScanVisibility(scanId, !isPublic);
      setIsPublic(res.isPublic);
    } catch (err) {
      console.error("Failed to toggle visibility", err);
    } finally {
      setTogglingVisibility(false);
    }
  };

  const exportPdf = () => {
    if (!summary) return;
    const escHtml = (s: string) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    const gradeColor = (g: string | null) =>
      g === "A"
        ? "#22c55e"
        : g === "B"
          ? "#86efac"
          : g === "C"
            ? "#fbbf24"
            : g === "D"
              ? "#fb923c"
              : g === "F"
                ? "#ef4444"
                : "#94a3b8";
    const ratColor = (r: string) =>
      r === "fast" ? "#22c55e" : r === "moderate" ? "#fbbf24" : "#ef4444";
    const epRows = endpoints
      .map((ep) => {
        const key = `${ep.httpMethod}:${ep.path}`;
        const avgMs = measuredAvg[key];
        const rating =
          avgMs != null
            ? avgMs < 300
              ? "fast"
              : avgMs <= 1000
                ? "moderate"
                : "slow"
            : (ep.performanceRating?.toLowerCase() ?? "");
        return `<tr>
        <td style="color:${["get", "post", "put", "delete", "patch"].includes(ep.httpMethod.toLowerCase()) ? "#6366f1" : "#94a3b8"};font-weight:700">${escHtml(ep.httpMethod)}</td>
        <td style="font-family:monospace;font-size:11px">${escHtml(ep.path)}</td>
        <td style="font-size:11px;color:#64748b">${escHtml(ep.controllerClass ?? "")}.${escHtml(ep.controllerMethod ?? "")}()</td>
        <td style="color:${ratColor(rating)};font-weight:600;text-transform:uppercase;font-size:11px">${escHtml(rating)}</td>
        <td style="font-family:monospace;font-weight:600">${avgMs != null ? `${Math.round(avgMs)}ms` : "—"}</td>
      </tr>`;
      })
      .join("");
    const issueRows = aiIssues
      .map((iss) => {
        const sevColor =
          iss.severity === "CRITICAL"
            ? "#ef4444"
            : iss.severity === "HIGH"
              ? "#fb923c"
              : iss.severity === "MEDIUM"
                ? "#fbbf24"
                : "#94a3b8";
        return `<tr>
        <td style="color:${sevColor};font-weight:700;font-size:11px">${escHtml(iss.severity ?? "")}</td>
        <td style="font-weight:600;font-size:11px">${escHtml(iss.ruleId ?? "")} — ${escHtml(iss.title ?? "")}</td>
        <td style="font-size:11px;color:#64748b;font-family:monospace">${escHtml(iss.file ?? "")}${iss.lineNumber > 0 ? `:${iss.lineNumber}` : ""}</td>
      </tr>`;
      })
      .join("");
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>CodeChecker Report — ${escHtml(summary.projectName ?? "")}</title>
<style>
  body{font-family:system-ui,sans-serif;font-size:13px;color:#1e293b;margin:32px;line-height:1.5}
  h1{font-size:20px;font-weight:800;margin-bottom:4px}
  h2{font-size:14px;font-weight:700;margin:24px 0 8px;border-bottom:2px solid #e2e8f0;padding-bottom:4px}
  .meta{color:#64748b;font-size:12px;margin-bottom:20px}
  .score-box{display:inline-flex;align-items:center;gap:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 20px;margin-bottom:20px}
  .score-num{font-size:32px;font-weight:800}
  .grade{font-size:28px;font-weight:800}
  .stat-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:20px}
  .stat{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;text-align:center}
  .stat-v{font-size:20px;font-weight:800}
  .stat-l{font-size:11px;color:#64748b;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#f1f5f9;padding:6px 10px;text-align:left;font-weight:700;font-size:11px;border-bottom:2px solid #e2e8f0}
  td{padding:5px 10px;border-bottom:1px solid #f1f5f9}
  .release{font-size:13px;font-weight:700;padding:8px 16px;border-radius:6px;display:inline-block;margin-bottom:16px}
  .ok{background:#f0fdf4;color:#16a34a;border:1px solid #86efac}
  .warn{background:#fffbeb;color:#d97706;border:1px solid #fbbf24}
  .bad{background:#fff5f5;color:#dc2626;border:1px solid #fca5a5}
  @media print{button{display:none}}
</style></head><body>
<div style="background:#f0f4ff;border:1px solid #93c5fd;border-radius:6px;padding:10px 16px;margin-bottom:16px;font-size:12px" class="no-print">
  <strong>Tip:</strong> Press <kbd>Ctrl+P</kbd> → Save as PDF to download.
  <button onclick="window.print()" style="float:right;padding:4px 12px;background:#3b82f6;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">\ud83d\uddb6 Print / Save PDF</button>
</div>
<h1>CodeChecker Report</h1>
<div class="meta">Project: <strong>${escHtml(summary.projectName ?? "")}</strong> &nbsp;|&nbsp; Scan ID: <code>${escHtml(scanId)}</code> &nbsp;|&nbsp; ${summary.startedAt ? new Date(summary.startedAt).toLocaleString() : ""}</div>
<div class="score-box">
  <div><div class="score-num" style="color:${gradeColor(aiGrade)}">${aiScore ?? "—"}</div><div style="font-size:11px;color:#64748b">Health Score</div></div>
  <div><div class="grade" style="color:${gradeColor(aiGrade)}">${aiGrade ?? "—"}</div><div style="font-size:11px;color:#64748b">Grade</div></div>
</div>
${aiRelease ? `<div class="release ${aiRelease.startsWith("\u2713") ? "ok" : aiRelease.startsWith("\u26a0") ? "warn" : "bad"}">${escHtml(aiRelease)}</div>` : ""}
<div class="stat-grid">
  <div class="stat"><div class="stat-v">${summary.totalEndpoints}</div><div class="stat-l">Endpoints</div></div>
  <div class="stat"><div class="stat-v" style="color:#ef4444">${aiTotal > 0 ? aiCritical : "—"}</div><div class="stat-l">Critical Issues</div></div>
  <div class="stat"><div class="stat-v" style="color:#fb923c">${aiTotal > 0 ? aiTotal : "—"}</div><div class="stat-l">Total Issues</div></div>
  <div class="stat"><div class="stat-v">${summary.diagramsGenerated}</div><div class="stat-l">Diagrams</div></div>
  <div class="stat"><div class="stat-v">${summary.totalFiles}</div><div class="stat-l">Java Files</div></div>
</div>
${
  aiIssues.length > 0
    ? `<h2>AI Issues (${aiIssues.length})</h2>
<table><thead><tr><th>Severity</th><th>Issue</th><th>Location</th></tr></thead><tbody>${issueRows}</tbody></table>`
    : ""
}
<h2>API Endpoints (${endpoints.length})</h2>
<table><thead><tr><th>Method</th><th>Path</th><th>Controller</th><th>Rating</th><th>Avg Latency</th></tr></thead><tbody>${epRows}</tbody></table>
</body></html>`;
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  const scoreColor = (score: number | null | undefined) =>
    !score
      ? "var(--text-muted)"
      : score >= 90
        ? "var(--success)"
        : score >= 75
          ? "#4ade80"
          : score >= 60
            ? "var(--warning)"
            : score >= 40
              ? "#fb923c"
              : "var(--danger)";

  // AI-derived stats (override static analysis values)
  const aiTotal = aiIssues.length;
  const aiCritical = aiIssues.filter((i) => i.severity === "CRITICAL").length;
  const aiHigh = aiIssues.filter((i) => i.severity === "HIGH").length;
  const aiMedium = aiIssues.filter((i) => i.severity === "MEDIUM").length;
  const aiLow = aiIssues.filter((i) => i.severity === "LOW").length;
  const aiScore: number | null =
    aiTotal > 0
      ? Math.max(
          0,
          Math.round(
            100 - aiCritical * 4 - aiHigh * 2 - aiMedium * 1 - aiLow * 0.5,
          ),
        )
      : null;
  const aiGrade =
    aiScore === null
      ? null
      : aiScore >= 90
        ? "A"
        : aiScore >= 75
          ? "B"
          : aiScore >= 60
            ? "C"
            : aiScore >= 40
              ? "D"
              : "F";
  const aiRelease =
    aiScore === null
      ? null
      : aiScore >= 75
        ? "✓ SAFE TO RELEASE"
        : aiScore >= 50
          ? "⚠ RELEASE WITH CAUTION"
          : "✗ DO NOT RELEASE";

  const circumference = 2 * Math.PI * 70;
  const safeScore = aiScore ?? 0;
  const offset = circumference - (safeScore / 100) * circumference;

  return (
    <div>
      <PageHeader
        title="Scan Results"
        subtitle="Comprehensive analysis results and API performance breakdown"
        gradient="from-emerald-400 to-indigo-400"
      >
        {summary && (
          <div className="flex items-center gap-4 mt-2">
            <button
              onClick={handleToggleVisibility}
              disabled={togglingVisibility}
              className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all ${
                isPublic
                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/50 hover:bg-indigo-500/30"
                  : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
              }`}
            >
              <span className="relative flex h-3 w-3">
                {isPublic && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-3 w-3 ${
                    isPublic ? "bg-indigo-500" : "bg-gray-500"
                  }`}
                ></span>
              </span>
              {togglingVisibility ? "Saving..." : isPublic ? "Public on Community" : "Private Scan"}
            </button>
            <ShimmerButton onClick={exportPdf}>
              📄 Export PDF
            </ShimmerButton>
          </div>
        )}
      </PageHeader>

      {!paramScanId && (
        <div
          className="card animate-in"
          style={{ marginBottom: "1.5rem", maxWidth: 500 }}
        >
          <div className="form-group">
            <label>Scan ID</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                className="form-input"
                placeholder="Enter scan ID..."
                value={scanId}
                onChange={(e) => setScanId(e.target.value)}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={() => loadResults(scanId)}
              >
                Load
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ color: "var(--danger)", marginBottom: "1rem" }}>
          {error}
        </div>
      )}
      {loading && (
        <div className="empty-state">
          <div className="empty-state-icon animate-pulse">⏳</div>
          <h3>Loading results...</h3>
        </div>
      )}

      {summary && (
        <>
          <div
            style={{
              display: "flex",
              gap: "2rem",
              marginBottom: "2rem",
              flexWrap: "wrap",
            }}
          >
            {/* Health Score Ring */}
            <MagicCard
              accentColor="#6366f1"
              beam
              className="flex items-center gap-8 flex-1 min-w-[400px] p-6"
            >
              <div className="health-score-ring">
                <svg viewBox="0 0 160 160">
                  <circle className="ring-bg" cx="80" cy="80" r="70" />
                  <circle
                    className="ring-fill"
                    cx="80"
                    cy="80"
                    r="70"
                    stroke={scoreColor(summary.healthScore)}
                    strokeDasharray={circumference}
                    strokeDashoffset={isFinite(offset) ? offset : circumference}
                  />
                </svg>
                <div className="health-score-value">
                  <span
                    className="score-number"
                    style={{ color: scoreColor(aiScore) }}
                  >
                    {aiScore ?? "—"}
                  </span>
                  <span
                    className={`score-grade grade-${(aiGrade ?? "na").toLowerCase()}`}
                  >
                    {aiGrade ?? "—"}
                  </span>
                </div>
              </div>
              <div>
                <h3
                  style={{
                    fontSize: "1.1rem",
                    fontWeight: 600,
                    marginBottom: "0.5rem",
                  }}
                >
                  {summary.projectName || "Project"}
                </h3>
                {aiScore === null && (
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--text-muted)",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Run AI analysis on the Issues page to see the score.
                  </p>
                )}
                {aiScore !== null && aiScore === 0 && (
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--danger)",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Score is 0/100 — severe code quality issues detected.
                  </p>
                )}
                {summary.totalEndpoints === 0 &&
                  summary.status === "COMPLETE" && (
                    <p
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--warning)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      ⚠ No endpoint data found — the scan may have been
                      cancelled early.
                    </p>
                  )}
                {summary.status && summary.status !== "COMPLETE" && (
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--warning)",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Scan status: <strong>{summary.status}</strong>
                  </p>
                )}
                <p
                  style={{
                    fontSize: "0.85rem",
                    color: aiRelease
                      ? aiRelease.startsWith("✓")
                        ? "var(--success)"
                        : aiRelease.startsWith("⚠")
                          ? "var(--warning)"
                          : "var(--danger)"
                      : "var(--text-secondary)",
                    marginBottom: "0.75rem",
                    fontWeight: aiRelease ? 600 : 400,
                  }}
                >
                  {aiRelease ?? summary.releaseDecision}
                </p>
                <div
                  style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}
                >
                  Scanned:{" "}
                  {summary.startedAt
                    ? new Date(summary.startedAt).toLocaleString()
                    : "—"}
                </div>
              </div>
            </MagicCard>
          </div>

          <AnimatedList
            stagger={0.08}
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6"
          >
            <AnimatedList.Item>
              <StatCard
                label="Endpoints"
                value={summary.totalEndpoints}
                color="#6366f1"
              />
            </AnimatedList.Item>
            <AnimatedList.Item>
              <StatCard
                label="Critical Issues"
                value={aiTotal > 0 ? aiCritical : "—"}
                color="#ef4444"
                animateNumber={aiTotal > 0}
              />
            </AnimatedList.Item>
            <AnimatedList.Item>
              <StatCard
                label="Total Issues"
                value={aiTotal > 0 ? aiTotal : "—"}
                color="#f59e0b"
                animateNumber={aiTotal > 0}
              />
            </AnimatedList.Item>
            <AnimatedList.Item>
              <StatCard
                label="Diagrams"
                value={summary.diagramsGenerated}
                color="#06b6d4"
              />
            </AnimatedList.Item>
            <AnimatedList.Item>
              <StatCard
                label="Java Files"
                value={summary.totalFiles}
                color="#22c55e"
              />
            </AnimatedList.Item>
          </AnimatedList>

          {/* Performance Distribution */}
          {(() => {
            // Recompute distribution from measured load-test data when available
            let distFast = summary.fastEndpoints;
            let distModerate = summary.moderateEndpoints;
            let distSlow = summary.slowEndpoints;
            let distCritical = summary.criticalEndpoints;
            if (hasMeasured) {
              distFast = 0;
              distModerate = 0;
              distSlow = 0;
              distCritical = 0;
              for (const ep of endpoints) {
                const key = `${ep.httpMethod}:${ep.path}`;
                const avgMs = measuredAvg[key];
                if (avgMs != null) {
                  if (avgMs < 300) distFast++;
                  else if (avgMs <= 1000) distModerate++;
                  else if (avgMs <= 3000) distSlow++;
                  else distCritical++;
                } else {
                  // No measured data — fall back to static rating
                  const r = ep.performanceRating?.toLowerCase();
                  if (r === "fast") distFast++;
                  else if (r === "moderate") distModerate++;
                  else if (r === "slow") distSlow++;
                  else if (r === "critical") distCritical++;
                }
              }
            }
            return (
              <MagicCard
                accentColor="#22c55e"
                hover={false}
                className="p-6 mb-6"
              >
                <h3
                  style={{
                    fontSize: "1rem",
                    fontWeight: 600,
                    marginBottom: "1rem",
                  }}
                >
                  API Performance Distribution
                  {hasMeasured && (
                    <span
                      style={{
                        marginLeft: "0.5rem",
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        background: "rgba(99,102,241,0.12)",
                        color: "var(--accent-light)",
                        border: "1px solid rgba(99,102,241,0.25)",
                        borderRadius: "4px",
                        padding: "0.1rem 0.4rem",
                        letterSpacing: "0.03em",
                        verticalAlign: "middle",
                      }}
                    >
                      LIVE ratings
                    </span>
                  )}
                </h3>
                <div
                  style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span className="badge badge-fast">FAST</span>
                    <span style={{ fontWeight: 600 }}>{distFast}</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span className="badge badge-moderate">MODERATE</span>
                    <span style={{ fontWeight: 600 }}>{distModerate}</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span className="badge badge-slow">SLOW</span>
                    <span style={{ fontWeight: 600 }}>{distSlow}</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span className="badge badge-critical">CRITICAL</span>
                    <span style={{ fontWeight: 600 }}>{distCritical}</span>
                  </div>
                </div>
              </MagicCard>
            );
          })()}

          {/* Framework Distribution */}
          {endpoints.length > 0 &&
            (() => {
              const fwCounts: Record<string, number> = {};
              endpoints.forEach((ep) => {
                const fw = ep.framework || "UNKNOWN";
                fwCounts[fw] = (fwCounts[fw] || 0) + 1;
              });
              const fwMeta: Record<
                string,
                { bg: string; fg: string; label: string }
              > = {
                SPRING_MVC: {
                  bg: "rgba(34,197,94,0.12)",
                  fg: "#22c55e",
                  label: "Spring MVC",
                },
                SEEDSTACK_JAXRS: {
                  bg: "rgba(99,102,241,0.12)",
                  fg: "#6366f1",
                  label: "JAX-RS",
                },
                STRUTS2: {
                  bg: "rgba(245,158,11,0.12)",
                  fg: "#f59e0b",
                  label: "Struts 2",
                },
                STRUTS1: {
                  bg: "rgba(251,146,60,0.12)",
                  fg: "#fb923c",
                  label: "Struts 1",
                },
                JAX_WS: {
                  bg: "rgba(6,182,212,0.12)",
                  fg: "#06b6d4",
                  label: "JAX-WS (SOAP)",
                },
                SPRING_WS: {
                  bg: "rgba(139,92,246,0.12)",
                  fg: "#8b5cf6",
                  label: "Spring-WS (SOAP)",
                },
              };
              return (
                <MagicCard
                  accentColor="#06b6d4"
                  hover={false}
                  className="p-6 mb-6"
                >
                  <h3
                    style={{
                      fontSize: "1rem",
                      fontWeight: 600,
                      marginBottom: "1rem",
                    }}
                  >
                    Framework Distribution
                  </h3>
                  <div
                    style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}
                  >
                    {Object.entries(fwCounts).map(([fw, count]) => {
                      const meta = fwMeta[fw] ?? {
                        bg: "rgba(148,163,184,0.12)",
                        fg: "#94a3b8",
                        label: fw,
                      };
                      const pct = Math.round((count / endpoints.length) * 100);
                      return (
                        <div
                          key={fw}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.6rem",
                            padding: "0.5rem 0.85rem",
                            borderRadius: "var(--radius-sm)",
                            background: meta.bg,
                            border: `1px solid ${meta.fg}25`,
                            minWidth: 140,
                          }}
                        >
                          <span
                            style={{
                              fontSize: "1.1rem",
                              fontWeight: 800,
                              color: meta.fg,
                              lineHeight: 1,
                            }}
                          >
                            {count}
                          </span>
                          <div>
                            <div
                              style={{
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                color: meta.fg,
                              }}
                            >
                              {meta.label}
                            </div>
                            <div
                              style={{
                                fontSize: "0.62rem",
                                color: "var(--text-muted)",
                              }}
                            >
                              {pct}% of endpoints
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </MagicCard>
              );
            })()}

          {/* Endpoints Table */}
          <MagicCard accentColor="#6366f1" hover={false} className="p-6">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom:
                  hasMeasured && maxRunCount > 0 ? "0.5rem" : "1rem",
              }}
            >
              <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>
                API Endpoints ({endpoints.length})
              </h3>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => navigate(`/issues/${scanId}`)}
                >
                  ⚠️ View Issues
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => navigate(`/diagrams/${scanId}`)}
                >
                  🗺️ View Diagrams
                </button>
              </div>
            </div>
            {/* Load-test run selector — only shown when history exists */}
            {hasMeasured && maxRunCount > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                  marginBottom: "1rem",
                }}
              >
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    fontWeight: 600,
                  }}
                >
                  Load test view:
                </span>
                <button
                  onClick={() => setLtRunIndex(null)}
                  style={{
                    padding: "0.25rem 0.75rem",
                    borderRadius: "0.375rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    border: "1px solid var(--border)",
                    background:
                      ltRunIndex === null ? "#6366f1" : "var(--bg-card)",
                    color:
                      ltRunIndex === null ? "#fff" : "var(--text-secondary)",
                  }}
                >
                  All Runs (avg)
                </button>
                {Array.from({ length: maxRunCount }, (_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setLtRunIndex(idx)}
                    style={{
                      padding: "0.25rem 0.75rem",
                      borderRadius: "0.375rem",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      border: "1px solid var(--border)",
                      background:
                        ltRunIndex === idx ? "#6366f1" : "var(--bg-card)",
                      color:
                        ltRunIndex === idx ? "#fff" : "var(--text-secondary)",
                    }}
                  >
                    Run #{idx + 1}
                  </button>
                ))}
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Path</th>
                    <th>Controller</th>
                    <th>Rating</th>
                    <th>Average</th>
                    <th>p50</th>
                    <th>p95</th>
                    <th>Issues</th>
                    <th>Framework</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(endpoints) ? endpoints : []).map((ep, i) => {
                    const key = `${ep.httpMethod}:${ep.path}`;
                    const avgMs = measuredAvg[key] ?? null;
                    const liveRating =
                      avgMs !== null ? ratingFromAvg(avgMs) : null;
                    const displayRating =
                      liveRating ?? ep.performanceRating?.toLowerCase();
                    const displayLabel = displayRating
                      ? displayRating.charAt(0).toUpperCase() +
                        displayRating.slice(1)
                      : ep.performanceRating;
                    return (
                      <tr key={i}>
                        <td>
                          <span
                            className={`badge badge-${ep.httpMethod?.toLowerCase()}`}
                          >
                            {ep.httpMethod}
                          </span>
                        </td>
                        <td
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.8rem",
                          }}
                        >
                          {ep.path}
                        </td>
                        <td
                          style={{
                            fontSize: "0.8rem",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {ep.controllerClass}.{ep.controllerMethod}()
                        </td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.4rem",
                            }}
                          >
                            <span className={`badge badge-${displayRating}`}>
                              {displayLabel}
                            </span>
                            {liveRating && (
                              <span
                                title="Based on measured load-test average"
                                style={{
                                  fontSize: "0.6rem",
                                  background: "rgba(99,102,241,0.12)",
                                  color: "var(--accent-light)",
                                  border: "1px solid rgba(99,102,241,0.25)",
                                  borderRadius: "4px",
                                  padding: "0.05rem 0.3rem",
                                  fontWeight: 600,
                                  letterSpacing: "0.03em",
                                }}
                              >
                                LIVE
                              </span>
                            )}
                          </div>
                        </td>
                        <td
                          style={{
                            fontWeight: avgMs !== null ? 600 : 400,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {avgMs !== null ? (
                            <span
                              style={{
                                color:
                                  liveRating === "fast"
                                    ? "var(--success)"
                                    : liveRating === "moderate"
                                      ? "var(--warning)"
                                      : "var(--danger)",
                              }}
                            >
                              {Math.round(avgMs)}ms
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>
                              —
                            </span>
                          )}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {measuredPct[key]?.p50 != null ? (
                            <span
                              style={{
                                fontWeight: 600,
                                color: "var(--text-primary)",
                              }}
                            >
                              {measuredPct[key].p50}ms
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>
                              —
                            </span>
                          )}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {measuredPct[key]?.p95 != null ? (
                            <span
                              style={{
                                fontWeight: 600,
                                color: "var(--text-primary)",
                              }}
                            >
                              {measuredPct[key].p95}ms
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>
                              —
                            </span>
                          )}
                        </td>
                        <td style={{ color: "var(--text-muted)" }}>—</td>
                        <td>
                          {(() => {
                            const fwColors: Record<
                              string,
                              { bg: string; fg: string; label: string }
                            > = {
                              SPRING_MVC: {
                                bg: "rgba(34,197,94,0.12)",
                                fg: "#22c55e",
                                label: "Spring MVC",
                              },
                              SEEDSTACK_JAXRS: {
                                bg: "rgba(99,102,241,0.12)",
                                fg: "#6366f1",
                                label: "JAX-RS",
                              },
                              STRUTS2: {
                                bg: "rgba(245,158,11,0.12)",
                                fg: "#f59e0b",
                                label: "Struts 2",
                              },
                              STRUTS1: {
                                bg: "rgba(251,146,60,0.12)",
                                fg: "#fb923c",
                                label: "Struts 1",
                              },
                              JAX_WS: {
                                bg: "rgba(6,182,212,0.12)",
                                fg: "#06b6d4",
                                label: "JAX-WS",
                              },
                              SPRING_WS: {
                                bg: "rgba(139,92,246,0.12)",
                                fg: "#8b5cf6",
                                label: "Spring-WS",
                              },
                            };
                            const fw = fwColors[ep.framework] ?? {
                              bg: "rgba(148,163,184,0.12)",
                              fg: "#94a3b8",
                              label: ep.framework || "—",
                            };
                            return (
                              <span
                                style={{
                                  fontSize: "0.65rem",
                                  fontWeight: 700,
                                  padding: "2px 7px",
                                  borderRadius: 4,
                                  background: fw.bg,
                                  color: fw.fg,
                                  border: `1px solid ${fw.fg}30`,
                                  letterSpacing: "0.02em",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {fw.label}
                              </span>
                            );
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </MagicCard>

          {/* ── Endpoint Module / Controller Map ── */}
          {endpoints.length > 0 &&
            (() => {
              // Group endpoints by controller class
              const byController: Record<string, typeof endpoints> = {};
              endpoints.forEach((ep) => {
                const ctrl = ep.controllerClass ?? "Unknown";
                if (!byController[ctrl]) byController[ctrl] = [];
                byController[ctrl].push(ep);
              });
              const controllers = Object.entries(byController);
              return (
                <MagicCard
                  accentColor="#a78bfa"
                  hover={false}
                  className="p-6 mt-6"
                >
                  <h3
                    style={{
                      fontSize: "1rem",
                      fontWeight: 600,
                      marginBottom: "1rem",
                    }}
                  >
                    \ud83d\uddfa\ufe0f Controller Module Map
                    <span
                      style={{
                        marginLeft: "0.5rem",
                        fontSize: "0.7rem",
                        color: "var(--text-muted)",
                        fontWeight: 400,
                      }}
                    >
                      {controllers.length} controller
                      {controllers.length !== 1 ? "s" : ""}, {endpoints.length}{" "}
                      endpoint{endpoints.length !== 1 ? "s" : ""}
                    </span>
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(260px, 1fr))",
                      gap: "0.75rem",
                    }}
                  >
                    {controllers.map(([ctrl, eps]) => {
                      const hasIssues = aiIssues.some((iss) =>
                        iss.file?.includes(ctrl),
                      );
                      const critCount = aiIssues.filter(
                        (iss) =>
                          iss.file?.includes(ctrl) &&
                          iss.severity === "CRITICAL",
                      ).length;
                      return (
                        <div
                          key={ctrl}
                          style={{
                            border: `1px solid ${critCount > 0 ? "rgba(239,68,68,0.3)" : hasIssues ? "rgba(251,146,60,0.3)" : "var(--border)"}`,
                            borderRadius: "var(--radius)",
                            overflow: "hidden",
                            background:
                              critCount > 0
                                ? "rgba(239,68,68,0.03)"
                                : "transparent",
                          }}
                        >
                          <div
                            style={{
                              padding: "0.5rem 0.75rem",
                              background: "rgba(255,255,255,0.03)",
                              borderBottom: "1px solid var(--border)",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "0.78rem",
                                fontWeight: 700,
                                fontFamily: "var(--font-mono)",
                                color: "var(--accent-light)",
                              }}
                            >
                              {ctrl}
                            </span>
                            <div style={{ display: "flex", gap: "0.3rem" }}>
                              {critCount > 0 && (
                                <span
                                  style={{
                                    fontSize: "0.62rem",
                                    background: "rgba(239,68,68,0.15)",
                                    color: "var(--danger)",
                                    border: "1px solid rgba(239,68,68,0.3)",
                                    borderRadius: 4,
                                    padding: "0 5px",
                                  }}
                                >
                                  {critCount} CRIT
                                </span>
                              )}
                              <span
                                style={{
                                  fontSize: "0.62rem",
                                  background: "rgba(99,102,241,0.1)",
                                  color: "var(--accent-light)",
                                  border: "1px solid rgba(99,102,241,0.2)",
                                  borderRadius: 4,
                                  padding: "0 5px",
                                }}
                              >
                                {eps.length} ep
                              </span>
                            </div>
                          </div>
                          <div style={{ padding: "0.4rem 0.75rem" }}>
                            {eps.map((ep, idx) => {
                              const key = `${ep.httpMethod}:${ep.path}`;
                              const avgMs = measuredAvg[key];
                              return (
                                <div
                                  key={idx}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.4rem",
                                    padding: "0.2rem 0",
                                    fontSize: "0.72rem",
                                    borderBottom:
                                      idx < eps.length - 1
                                        ? "1px solid rgba(255,255,255,0.04)"
                                        : "none",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "0.62rem",
                                      fontWeight: 700,
                                      minWidth: 36,
                                      color:
                                        (
                                          {
                                            GET: "#22c55e",
                                            POST: "#6366f1",
                                            PUT: "#f59e0b",
                                            DELETE: "#ef4444",
                                            PATCH: "#8b5cf6",
                                            SOAP: "#06b6d4",
                                          } as Record<string, string>
                                        )[ep.httpMethod] ?? "var(--text-muted)",
                                    }}
                                  >
                                    {ep.httpMethod}
                                  </span>
                                  <span
                                    style={{
                                      fontFamily: "var(--font-mono)",
                                      color: "var(--text-secondary)",
                                      flex: 1,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                    title={ep.path}
                                  >
                                    {ep.path}
                                  </span>
                                  {avgMs != null && (
                                    <span
                                      style={{
                                        fontSize: "0.62rem",
                                        fontWeight: 600,
                                        color:
                                          avgMs < 300
                                            ? "var(--success)"
                                            : avgMs <= 1000
                                              ? "var(--warning)"
                                              : "var(--danger)",
                                        flexShrink: 0,
                                      }}
                                    >
                                      {Math.round(avgMs)}ms
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </MagicCard>
              );
            })()}
        </>
      )}
    </div>
  );
}
