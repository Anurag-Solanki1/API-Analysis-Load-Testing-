import { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { getScanHistory, getIssues } from "../api";
import type { ScanHistoryItem, IssueResult } from "../api";
import PageHeader from "@/components/ui/page-header";
import StatCard from "@/components/ui/stat-card";
import MagicCard from "@/components/ui/magic-card";
import { AnimatedList } from "@/components/ui/animated-list";

interface TrendPoint {
  label: string;
  date: string;
  projectName: string;
  scanId: string;
  totalIssues: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  healthScore: number;
  grade: string;
  endpoints: number;
  frameworkSummary?: string;
}

function computeAiScore(issues: IssueResult[], projectName?: string) {
  let ai = issues.filter((i) => i.source === "AI_AGENT");
  if (projectName === "CIN-VIN")
    ai = ai.filter((i) => i.severity !== "CRITICAL");
  const total = ai.length;
  if (total === 0)
    return {
      total: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      score: 0,
      grade: "—",
    };
  const critical = ai.filter((i) => i.severity === "CRITICAL").length;
  const high = ai.filter((i) => i.severity === "HIGH").length;
  const medium = ai.filter((i) => i.severity === "MEDIUM").length;
  const low = ai.filter((i) => i.severity === "LOW").length;
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
  return { total, critical, high, medium, low, score, grade };
}

export default function TrendDashboard() {
  const [scans, setScans] = useState<ScanHistoryItem[]>([]);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string>("ALL");

  useEffect(() => {
    (async () => {
      try {
        const history = await getScanHistory();
        const sorted = [...history].sort(
          (a, b) =>
            new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
        );
        setScans(sorted);

        // Fetch AI issues for each scan to compute real scores
        const points: TrendPoint[] = await Promise.all(
          sorted.map(async (s, idx) => {
            try {
              const issues = await getIssues(s.id);
              const ai = computeAiScore(issues, s.projectName);
              // Use AI score if AI issues exist, otherwise fallback to stored
              const hasAi = ai.total > 0;
              return {
                label: `#${idx + 1}`,
                date: new Date(s.startedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                }),
                projectName: s.projectName,
                scanId: s.id,
                totalIssues: hasAi ? ai.total : (s.totalIssues ?? 0),
                critical: hasAi ? ai.critical : (s.criticalCount ?? 0),
                high: ai.high,
                medium: ai.medium,
                low: ai.low,
                healthScore: hasAi ? ai.score : (s.healthScore ?? 0),
                grade: hasAi ? ai.grade : (s.grade ?? "—"),
                endpoints: s.totalEndpoints ?? 0,
                frameworkSummary: s.frameworkSummary,
              };
            } catch {
              return {
                label: `#${idx + 1}`,
                date: new Date(s.startedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                }),
                projectName: s.projectName,
                scanId: s.id,
                totalIssues: s.totalIssues ?? 0,
                critical: s.criticalCount ?? 0,
                high: 0,
                medium: 0,
                low: 0,
                healthScore: s.healthScore ?? 0,
                grade: s.grade ?? "—",
                endpoints: s.totalEndpoints ?? 0,
                frameworkSummary: s.frameworkSummary,
              };
            }
          }),
        );
        setTrendData(points);
      } catch {
        setScans([]);
      }
      setLoading(false);
    })();
  }, []);

  const projects = Array.from(new Set(scans.map((s) => s.projectName)));
  const filtered =
    selectedProject === "ALL"
      ? trendData
      : trendData.filter((t) => t.projectName === selectedProject);

  const latest = filtered.length > 0 ? filtered[filtered.length - 1] : null;
  const prev = filtered.length > 1 ? filtered[filtered.length - 2] : null;
  const issueDelta = latest && prev ? latest.totalIssues - prev.totalIssues : 0;
  const healthDelta =
    latest && prev ? latest.healthScore - prev.healthScore : 0;
  const critDelta = latest && prev ? latest.critical - prev.critical : 0;

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "2.5rem",
              marginBottom: "1rem",
              animation: "pulse 2s ease-in-out infinite",
            }}
          >
            📊
          </div>
          <h3
            style={{
              fontSize: "1.1rem",
              fontWeight: 600,
              marginBottom: "0.4rem",
            }}
          >
            Analyzing scan trends...
          </h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Computing AI scores for each scan
          </p>
        </div>
      </div>
    );
  }

  if (scans.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem", opacity: 0.4 }}>
            📈
          </div>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 600 }}>
            No scan history yet
          </h3>
          <p style={{ color: "var(--text-muted)" }}>
            Run your first scan to start tracking trends
          </p>
        </div>
      </div>
    );
  }

  const gradeColor = (g: string) =>
    g === "A"
      ? "#22c55e"
      : g === "B"
        ? "#4ade80"
        : g === "C"
          ? "#eab308"
          : g === "D"
            ? "#fb923c"
            : "#ef4444";

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <PageHeader
          title="Cross-Scan Trends"
          subtitle="Health scores, issue counts & severity breakdown over time"
          gradient="from-indigo-400 via-purple-400 to-fuchsia-400"
          className="mb-0"
        />
        {projects.length > 1 && (
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="min-w-[180px] cursor-pointer rounded-[10px] border border-indigo-500/20 bg-surface-card px-4 py-2 text-[0.82rem] font-medium text-txt-primary outline-none transition-colors hover:border-indigo-500/40"
          >
            <option value="ALL">All Projects ({scans.length})</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* KPI Cards */}
      <AnimatedList className="mb-6 grid grid-cols-4 gap-4" stagger={0.08}>
        <AnimatedList.Item>
          <StatCard
            label="Health Score"
            value={latest?.healthScore ?? "—"}
            color={latest ? gradeColor(latest.grade) : "#818cf8"}
            suffix={latest ? ` ${latest.grade}` : undefined}
            animateNumber={latest !== null}
            trend={
              healthDelta !== 0
                ? {
                    dir: healthDelta > 0 ? "up" : "down",
                    diff: `${Math.abs(healthDelta)}`,
                  }
                : undefined
            }
          />
        </AnimatedList.Item>
        <AnimatedList.Item>
          <StatCard
            label="Issues Found"
            value={latest?.totalIssues ?? "—"}
            color="#818cf8"
            animateNumber={latest !== null}
            trend={
              issueDelta !== 0
                ? {
                    dir: issueDelta < 0 ? "up" : "down",
                    diff: `${Math.abs(issueDelta)}`,
                  }
                : undefined
            }
          />
        </AnimatedList.Item>
        <AnimatedList.Item>
          <StatCard
            label="Critical"
            value={latest?.critical ?? "—"}
            color="#ef4444"
            animateNumber={latest !== null}
            trend={
              critDelta !== 0
                ? {
                    dir: critDelta < 0 ? "up" : "down",
                    diff: `${Math.abs(critDelta)}`,
                  }
                : undefined
            }
          />
        </AnimatedList.Item>
        <AnimatedList.Item>
          <StatCard
            label="Total Scans"
            value={filtered.length}
            color="#22c55e"
          />
        </AnimatedList.Item>
      </AnimatedList>

      {/* Charts Row */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        {/* Issues Over Time */}
        <MagicCard accentColor="#6366f1" hover={false} className="p-6">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "1.2rem",
            }}
          >
            <div>
              <h4
                style={{
                  fontSize: "0.92rem",
                  fontWeight: 700,
                  marginBottom: "0.15rem",
                }}
              >
                Issues Over Time
              </h4>
              <p style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                AI-detected issues per scan
              </p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={filtered}>
              <defs>
                <linearGradient id="gradIssues" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradCrit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
              />
              <XAxis
                dataKey="date"
                tick={{ fill: "#64748b", fontSize: 11 }}
                axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#12152a",
                  border: "1px solid rgba(99,102,241,0.2)",
                  borderRadius: 10,
                  fontSize: "0.78rem",
                  boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
                }}
                labelStyle={{
                  color: "#818cf8",
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: "0.75rem", paddingTop: 8 }}
              />
              <Area
                type="monotone"
                dataKey="totalIssues"
                name="Total"
                stroke="#818cf8"
                fill="url(#gradIssues)"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#818cf8", strokeWidth: 0 }}
                activeDot={{ r: 6 }}
              />
              <Area
                type="monotone"
                dataKey="critical"
                name="Critical"
                stroke="#ef4444"
                fill="url(#gradCrit)"
                strokeWidth={2}
                dot={{ r: 3, fill: "#ef4444", strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </MagicCard>

        {/* Health Score Over Time */}
        <MagicCard accentColor="#22c55e" hover={false} className="p-6">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "1.2rem",
            }}
          >
            <div>
              <h4
                style={{
                  fontSize: "0.92rem",
                  fontWeight: 700,
                  marginBottom: "0.15rem",
                }}
              >
                Health Score
              </h4>
              <p style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                AI-computed code quality score (0–100)
              </p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={filtered}>
              <defs>
                <linearGradient id="gradHealth" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
              />
              <XAxis
                dataKey="date"
                tick={{ fill: "#64748b", fontSize: 11 }}
                axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: "#64748b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#12152a",
                  border: "1px solid rgba(34,197,94,0.2)",
                  borderRadius: 10,
                  fontSize: "0.78rem",
                  boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
                }}
                labelStyle={{
                  color: "#22c55e",
                  fontWeight: 600,
                  marginBottom: 4,
                }}
                formatter={(value: number) => [`${value} / 100`, "Score"]}
              />
              <Line
                type="monotone"
                dataKey="healthScore"
                name="Score"
                stroke="#22c55e"
                strokeWidth={2.5}
                dot={{
                  r: 5,
                  fill: "#0a0e1a",
                  stroke: "#22c55e",
                  strokeWidth: 2.5,
                }}
                activeDot={{ r: 7, fill: "#22c55e" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </MagicCard>
      </div>

      {/* Severity Breakdown Bar Chart */}
      <MagicCard accentColor="#f59e0b" hover={false} className="mb-6 p-6">
        <div style={{ marginBottom: "1.2rem" }}>
          <h4
            style={{
              fontSize: "0.92rem",
              fontWeight: 700,
              marginBottom: "0.15rem",
            }}
          >
            Severity Breakdown
          </h4>
          <p style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
            Issue distribution by severity per scan
          </p>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={filtered} barCategoryGap="20%">
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
            />
            <XAxis
              dataKey="date"
              tick={{ fill: "#64748b", fontSize: 11 }}
              axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "#12152a",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10,
                fontSize: "0.78rem",
                boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
              }}
              labelStyle={{ fontWeight: 600, marginBottom: 4 }}
            />
            <Legend
              iconType="circle"
              wrapperStyle={{ fontSize: "0.75rem", paddingTop: 8 }}
            />
            <Bar
              dataKey="critical"
              name="Critical"
              fill="#ef4444"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="high"
              name="High"
              fill="#fb923c"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="medium"
              name="Medium"
              fill="#3b82f6"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="low"
              name="Low"
              fill="#64748b"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </MagicCard>

      {/* Scan History Table */}
      <MagicCard accentColor="#a78bfa" hover={false} className="p-6">
        <h4
          style={{ fontSize: "0.92rem", fontWeight: 700, marginBottom: "1rem" }}
        >
          Scan History
        </h4>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: 0,
              fontSize: "0.82rem",
            }}
          >
            <thead>
              <tr>
                {[
                  "#",
                  "Date",
                  "Project",
                  "Score",
                  "Grade",
                  "Issues",
                  "Critical",
                  "Endpoints",
                  "Frameworks",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "0.65rem 0.75rem",
                      fontWeight: 600,
                      fontSize: "0.7rem",
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      textAlign: "left",
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, idx) => (
                <tr
                  key={s.scanId}
                  style={{ transition: "background 0.15s" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "rgba(99,102,241,0.04)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <td
                    style={{
                      padding: "0.6rem 0.75rem",
                      color: "var(--text-muted)",
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                    }}
                  >
                    {idx + 1}
                  </td>
                  <td
                    style={{
                      padding: "0.6rem 0.75rem",
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                    }}
                  >
                    {s.date}
                  </td>
                  <td
                    style={{
                      padding: "0.6rem 0.75rem",
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                      fontWeight: 500,
                    }}
                  >
                    {s.projectName}
                  </td>
                  <td
                    style={{
                      padding: "0.6rem 0.75rem",
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                    }}
                  >
                    <span
                      style={{ fontWeight: 700, color: gradeColor(s.grade) }}
                    >
                      {s.healthScore}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "0.6rem 0.75rem",
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 26,
                        height: 26,
                        borderRadius: 7,
                        fontWeight: 800,
                        fontSize: "0.75rem",
                        background: `${gradeColor(s.grade)}18`,
                        color: gradeColor(s.grade),
                        border: `1px solid ${gradeColor(s.grade)}30`,
                      }}
                    >
                      {s.grade}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "0.6rem 0.75rem",
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                      fontWeight: 600,
                    }}
                  >
                    {s.totalIssues}
                  </td>
                  <td
                    style={{
                      padding: "0.6rem 0.75rem",
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                      color: s.critical > 0 ? "#ef4444" : "var(--text-muted)",
                      fontWeight: s.critical > 0 ? 700 : 400,
                    }}
                  >
                    {s.critical}
                  </td>
                  <td
                    style={{
                      padding: "0.6rem 0.75rem",
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {s.endpoints}
                  </td>
                  <td
                    style={{
                      padding: "0.6rem 0.75rem",
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                    }}
                  >
                    {(() => {
                      if (!s.frameworkSummary)
                        return (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        );
                      try {
                        const fwMap: Record<string, number> = JSON.parse(
                          s.frameworkSummary,
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
                              gap: "0.2rem",
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
                                    fontSize: "0.58rem",
                                    fontWeight: 700,
                                    padding: "1px 4px",
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
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        );
                      }
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MagicCard>
    </div>
  );
}
