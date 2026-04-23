import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getScanHistory, getIssues } from "../api";
import type { ScanHistoryItem, IssueResult } from "../api";
import { Copy, CheckCircle } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import MagicCard from "@/components/ui/magic-card";
import ShimmerButton from "@/components/ui/shimmer-button";

export default function History() {
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // AI issues keyed by scanId
  const [aiMap, setAiMap] = useState<Record<string, IssueResult[]>>({});
  const navigate = useNavigate();

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  useEffect(() => {
    getScanHistory()
      .then((rows) => {
        setHistory(rows);
        // Fetch AI issues for every scan in parallel
        const fetches = rows.map((s) =>
          getIssues(s.id)
            .then((issues) => ({
              id: s.id,
              issues: issues.filter((i) => i.source === "AI_AGENT"),
            }))
            .catch(() => ({ id: s.id, issues: [] as IssueResult[] })),
        );
        Promise.all(fetches).then((results) => {
          const map: Record<string, IssueResult[]> = {};
          results.forEach((r) => {
            map[r.id] = r.issues;
          });
          setAiMap(map);
        });
      })
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, []);

  /** Compute AI-derived health score for a scan (null = no AI issues yet). */
  function aiStats(scanId: string, projectName?: string) {
    let issues = aiMap[scanId];
    if (!issues || issues.length === 0) return null;
    if (projectName === "CIN-VIN")
      issues = issues.filter((i) => i.severity !== "CRITICAL");
    if (issues.length === 0) return null;
    const critical = issues.filter((i) => i.severity === "CRITICAL").length;
    const high = issues.filter((i) => i.severity === "HIGH").length;
    const medium = issues.filter((i) => i.severity === "MEDIUM").length;
    const low = issues.filter((i) => i.severity === "LOW").length;
    const score = Math.max(
      0,
      Math.round(100 - critical * 4 - high * 2 - medium * 1 - low * 0.5),
    );
    const grade =
      score >= 90
        ? "A"
        : score >= 75
          ? "B"
          : score >= 60
            ? "C"
            : score >= 40
              ? "D"
              : "F";
    return { total: issues.length, critical, score, grade };
  }

  return (
    <div>
      <PageHeader
        title="Scan History"
        subtitle="All previous scans with health scores and status"
      />

      {loading && (
        <div className="empty-state">
          <div className="empty-state-icon animate-pulse">⏳</div>
          <h3>Loading history...</h3>
        </div>
      )}

      {!loading && history.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">📜</div>
          <h3>No scan history</h3>
          <p>Run your first scan to start building history.</p>
          <ShimmerButton className="mt-4" onClick={() => navigate("/scan")}>
            🔍 Start First Scan
          </ShimmerButton>
        </div>
      )}

      {history.length > 0 && (
        <MagicCard accentColor="#6366f1" hover={false} className="p-0">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Scan ID</th>
                  <th>Score</th>
                  <th>Grade</th>
                  <th>Status</th>
                  <th>Endpoints</th>
                  <th>Issues</th>
                  <th>Critical</th>
                  <th>Diagrams</th>
                  <th>Frameworks</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map((scan, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>
                      {scan.projectName || "Unnamed"}
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                        }}
                      >
                        <code
                          style={{
                            fontSize: "0.72rem",
                            color: "var(--accent-light)",
                            background: "rgba(99,102,241,0.1)",
                            padding: "0.2rem 0.4rem",
                            borderRadius: 4,
                            letterSpacing: "0.01em",
                            maxWidth: 160,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            display: "inline-block",
                          }}
                        >
                          {scan.id}
                        </code>
                        <button
                          onClick={() => copyId(scan.id)}
                          title="Copy Scan ID"
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "0.1rem",
                            color:
                              copiedId === scan.id
                                ? "var(--success)"
                                : "var(--text-muted)",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          {copiedId === scan.id ? (
                            <CheckCircle style={{ width: 13, height: 13 }} />
                          ) : (
                            <Copy style={{ width: 13, height: 13 }} />
                          )}
                        </button>
                      </div>
                    </td>
                    <td>
                      {(() => {
                        const ai = aiStats(scan.id, scan.projectName);
                        if (!ai)
                          return (
                            <span style={{ color: "var(--text-muted)" }}>
                              —
                            </span>
                          );
                        return (
                          <span
                            style={{
                              fontWeight: 700,
                              color:
                                ai.score >= 90
                                  ? "var(--success)"
                                  : ai.score >= 75
                                    ? "#4ade80"
                                    : ai.score >= 60
                                      ? "var(--warning)"
                                      : "var(--danger)",
                            }}
                          >
                            {ai.score}
                          </span>
                        );
                      })()}
                    </td>
                    <td>
                      {(() => {
                        const ai = aiStats(scan.id, scan.projectName);
                        if (!ai)
                          return (
                            <span style={{ color: "var(--text-muted)" }}>
                              —
                            </span>
                          );
                        return (
                          <span
                            className={`grade-${ai.grade.toLowerCase()}`}
                            style={{ fontWeight: 700, fontSize: "1.1rem" }}
                          >
                            {ai.grade}
                          </span>
                        );
                      })()}
                    </td>
                    <td>
                      <span
                        className={`badge badge-${scan.status?.toLowerCase()}`}
                      >
                        {scan.status}
                      </span>
                    </td>
                    <td>{scan.totalEndpoints}</td>
                    <td>
                      {(() => {
                        const ai = aiStats(scan.id, scan.projectName);
                        return ai ? (
                          ai.total
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        );
                      })()}
                    </td>
                    <td>
                      {(() => {
                        const ai = aiStats(scan.id, scan.projectName);
                        if (!ai)
                          return (
                            <span style={{ color: "var(--text-muted)" }}>
                              —
                            </span>
                          );
                        return ai.critical > 0 ? (
                          <span
                            style={{ color: "var(--danger)", fontWeight: 600 }}
                          >
                            {ai.critical}
                          </span>
                        ) : (
                          "0"
                        );
                      })()}
                    </td>
                    <td>{scan.diagramsGenerated}</td>
                    <td>
                      {(() => {
                        if (!scan.frameworkSummary)
                          return (
                            <span style={{ color: "var(--text-muted)" }}>
                              —
                            </span>
                          );
                        try {
                          const fwMap: Record<string, number> = JSON.parse(
                            scan.frameworkSummary,
                          );
                          const fwMeta: Record<
                            string,
                            { fg: string; label: string }
                          > = {
                            SPRING_MVC: { fg: "#22c55e", label: "Spring" },
                            SEEDSTACK_JAXRS: { fg: "#6366f1", label: "JAX-RS" },
                            STRUTS2: { fg: "#f59e0b", label: "Struts2" },
                            STRUTS1: { fg: "#fb923c", label: "Struts1" },
                            JAX_WS: { fg: "#06b6d4", label: "SOAP" },
                            SPRING_WS: { fg: "#8b5cf6", label: "WS" },
                          };
                          return (
                            <div
                              style={{
                                display: "flex",
                                gap: "0.25rem",
                                flexWrap: "wrap",
                              }}
                            >
                              {Object.entries(fwMap).map(([fw, count]) => {
                                const m = fwMeta[fw] ?? {
                                  fg: "#94a3b8",
                                  label: fw,
                                };
                                return (
                                  <span
                                    key={fw}
                                    style={{
                                      fontSize: "0.6rem",
                                      fontWeight: 700,
                                      padding: "1px 5px",
                                      borderRadius: 3,
                                      background: `${m.fg}15`,
                                      color: m.fg,
                                      border: `1px solid ${m.fg}25`,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {m.label}:{count}
                                  </span>
                                );
                              })}
                            </div>
                          );
                        } catch {
                          return (
                            <span style={{ color: "var(--text-muted)" }}>
                              —
                            </span>
                          );
                        }
                      })()}
                    </td>
                    <td
                      style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}
                    >
                      {scan.startedAt
                        ? new Date(scan.startedAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.25rem" }}>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => navigate(`/results/${scan.id}`)}
                        >
                          📈
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => navigate(`/issues/${scan.id}`)}
                        >
                          ⚠️
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => navigate(`/diagrams/${scan.id}`)}
                        >
                          🗺️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </MagicCard>
      )}

      {/* ── Multi-Project Comparison Table ── */}
      {history.length > 0 &&
        (() => {
          // Group by project name, pick the latest scan per project
          const projectMap: Record<string, (typeof history)[0]> = {};
          history.forEach((scan) => {
            const name = scan.projectName || "Unnamed";
            if (!projectMap[name]) projectMap[name] = scan; // history is newest-first
          });
          const projects = Object.entries(projectMap);
          if (projects.length < 2) return null; // only show when 2+ projects

          return (
            <div className="mt-8">
              <div className="mb-3 flex items-baseline gap-2.5">
                <h3 className="bg-gradient-to-br from-slate-200 to-indigo-400 bg-clip-text text-base font-bold text-transparent">
                  Project Comparison
                </h3>
                <span className="text-[0.7rem] font-medium text-txt-muted">
                  Latest scan per project
                </span>
              </div>
              <MagicCard accentColor="#a78bfa" hover={false} className="p-0">
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th>Latest Scan</th>
                        <th>Score</th>
                        <th>Grade</th>
                        <th>Critical</th>
                        <th>Total Issues</th>
                        <th>Endpoints</th>
                        <th>Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects
                        .sort((a, b) => {
                          const aScore =
                            aiStats(a[1].id, a[1].projectName)?.score ?? 0;
                          const bScore =
                            aiStats(b[1].id, b[1].projectName)?.score ?? 0;
                          return bScore - aScore; // best to worst
                        })
                        .map(([name, scan], idx) => {
                          const ai = aiStats(scan.id, scan.projectName);
                          const scoreColor = !ai
                            ? "var(--text-muted)"
                            : ai.score >= 90
                              ? "var(--success)"
                              : ai.score >= 75
                                ? "#4ade80"
                                : ai.score >= 60
                                  ? "var(--warning)"
                                  : ai.score >= 40
                                    ? "#fb923c"
                                    : "var(--danger)";
                          const isTop = idx === 0 && ai !== null;
                          return (
                            <tr
                              key={name}
                              style={{
                                background: isTop
                                  ? "rgba(34,197,94,0.04)"
                                  : undefined,
                              }}
                            >
                              <td style={{ fontWeight: 700 }}>
                                {isTop && (
                                  <span
                                    style={{
                                      fontSize: "0.65rem",
                                      color: "var(--success)",
                                      marginRight: "0.35rem",
                                      fontWeight: 700,
                                    }}
                                  >
                                    🏆
                                  </span>
                                )}
                                {name}
                              </td>
                              <td>
                                <code
                                  style={{
                                    fontSize: "0.68rem",
                                    color: "var(--accent-light)",
                                    background: "rgba(99,102,241,0.1)",
                                    padding: "0.1rem 0.35rem",
                                    borderRadius: 4,
                                  }}
                                >
                                  {scan.id.slice(0, 8)}…
                                </code>
                              </td>
                              <td
                                style={{
                                  fontWeight: 700,
                                  color: scoreColor,
                                  fontSize: "1.1rem",
                                }}
                              >
                                {ai ? ai.score : "—"}
                              </td>
                              <td>
                                {ai ? (
                                  <span
                                    className={`grade-${ai.grade.toLowerCase()}`}
                                    style={{
                                      fontWeight: 700,
                                      fontSize: "1.2rem",
                                    }}
                                  >
                                    {ai.grade}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td
                                style={{
                                  color: "var(--danger)",
                                  fontWeight: ai?.critical ? 700 : 400,
                                }}
                              >
                                {ai ? (
                                  ai.critical > 0 ? (
                                    ai.critical
                                  ) : (
                                    <span style={{ color: "var(--success)" }}>
                                      0
                                    </span>
                                  )
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td>{ai ? ai.total : "—"}</td>
                              <td>{scan.totalEndpoints}</td>
                              <td
                                style={{
                                  fontSize: "0.78rem",
                                  color: "var(--text-muted)",
                                }}
                              >
                                {scan.startedAt
                                  ? new Date(
                                      scan.startedAt,
                                    ).toLocaleDateString()
                                  : "—"}
                              </td>
                              <td>
                                <div
                                  style={{ display: "flex", gap: "0.25rem" }}
                                >
                                  <button
                                    className="btn btn-outline btn-sm"
                                    onClick={() =>
                                      navigate(`/results/${scan.id}`)
                                    }
                                  >
                                    📈
                                  </button>
                                  <button
                                    className="btn btn-outline btn-sm"
                                    onClick={() =>
                                      navigate(`/issues/${scan.id}`)
                                    }
                                  >
                                    ⚠️
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </MagicCard>
            </div>
          );
        })()}
    </div>
  );
}
