import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getScanHistory, getIssues, getEndpoints } from "../api";
import type { ScanHistoryItem, IssueResult, EndpointResult } from "../api";
import { motion } from "framer-motion";
import PageHeader from "@/components/ui/page-header";
import StatCard from "@/components/ui/stat-card";
import MagicCard from "@/components/ui/magic-card";
import DotPattern from "@/components/ui/dot-pattern";
import { AnimatedList } from "@/components/ui/animated-list";
import ShimmerButton from "@/components/ui/shimmer-button";

export default function Dashboard() {
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [latestAiIssues, setLatestAiIssues] = useState<IssueResult[]>([]);
  const [prevAiIssues, setPrevAiIssues] = useState<IssueResult[]>([]);
  const [latestEndpoints, setLatestEndpoints] = useState<EndpointResult[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    getScanHistory()
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, []);

  // Fetch AI issues for the latest scan whenever history loads
  const latestScanId = history[0]?.id;
  const prevScanId = history[1]?.id;
  useEffect(() => {
    if (!latestScanId) return;
    getIssues(latestScanId)
      .then((issues) => {
        let ai = issues.filter((i) => i.source === "AI_AGENT");
        if (history[0]?.projectName === "CIN-VIN")
          ai = ai.filter((i) => i.severity !== "CRITICAL");
        setLatestAiIssues(ai);
      })
      .catch(() => {});
    getEndpoints(latestScanId)
      .then(setLatestEndpoints)
      .catch(() => {});
  }, [latestScanId]);
  useEffect(() => {
    if (!prevScanId) return;
    getIssues(prevScanId)
      .then((issues) => {
        let ai = issues.filter((i) => i.source === "AI_AGENT");
        if (history[1]?.projectName === "CIN-VIN")
          ai = ai.filter((i) => i.severity !== "CRITICAL");
        setPrevAiIssues(ai);
      })
      .catch(() => {});
  }, [prevScanId]);

  const latestScan = history[0];
  const totalEndpoints = history.reduce(
    (sum, s) => sum + (s.totalEndpoints || 0),
    0,
  );

  // AI-derived values for the previous scan (for trend comparison)
  const prevAiTotal = prevAiIssues.length;
  const prevAiCritical = prevAiIssues.filter(
    (i) => i.severity === "CRITICAL",
  ).length;
  const prevAiHigh = prevAiIssues.filter((i) => i.severity === "HIGH").length;
  const prevAiMedium = prevAiIssues.filter(
    (i) => i.severity === "MEDIUM",
  ).length;
  const prevAiLow = prevAiIssues.filter((i) => i.severity === "LOW").length;
  const prevAiScore: number | null =
    prevAiTotal > 0
      ? Math.max(
          0,
          Math.round(
            100 -
              prevAiCritical * 4 -
              prevAiHigh * 2 -
              prevAiMedium * 1 -
              prevAiLow * 0.5,
          ),
        )
      : null;

  // AI-derived values for the latest scan
  const aiTotal = latestAiIssues.length;
  const aiCritical = latestAiIssues.filter(
    (i) => i.severity === "CRITICAL",
  ).length;
  const aiHigh = latestAiIssues.filter((i) => i.severity === "HIGH").length;
  const aiMedium = latestAiIssues.filter((i) => i.severity === "MEDIUM").length;
  const aiLow = latestAiIssues.filter((i) => i.severity === "LOW").length;
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

  // Trend arrow vs previous scan
  // Use AI score comparison first; fall back to raw healthScore stored on the scan record
  const effectivePrev: number | null =
    prevAiScore !== null ? prevAiScore : (history[1]?.healthScore ?? null);
  const effectiveCurrent: number | null =
    aiScore !== null ? aiScore : (latestScan?.healthScore ?? null);

  const trendArrow =
    effectiveCurrent !== null && effectivePrev !== null
      ? effectiveCurrent > effectivePrev
        ? {
            dir: "▲",
            color: "var(--success)",
            diff: `+${effectiveCurrent - effectivePrev}`,
          }
        : effectiveCurrent < effectivePrev
          ? {
              dir: "▼",
              color: "var(--danger)",
              diff: `${effectiveCurrent - effectivePrev}`,
            }
          : { dir: "—", color: "var(--text-muted)", diff: "0" }
      : null;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Java project health intelligence at a glance"
      />

      {/* KPI Cards */}
      <AnimatedList className="mb-6 grid grid-cols-4 gap-4" stagger={0.08}>
        <AnimatedList.Item>
          <StatCard
            label="Total Scans"
            value={history.length}
            color="#818cf8"
          />
        </AnimatedList.Item>
        <AnimatedList.Item>
          <StatCard
            label="APIs Analyzed"
            value={totalEndpoints}
            color="#22c55e"
          />
        </AnimatedList.Item>
        <AnimatedList.Item>
          <StatCard
            label="Issues Found"
            value={aiTotal > 0 ? aiTotal : "—"}
            color="#f59e0b"
            animateNumber={aiTotal > 0}
          />
        </AnimatedList.Item>
        <AnimatedList.Item>
          <StatCard
            label="Health Score"
            value={aiScore ?? "—"}
            color="#3b82f6"
            animateNumber={aiScore !== null}
            trend={
              trendArrow
                ? {
                    dir:
                      trendArrow.dir === "▲"
                        ? "up"
                        : trendArrow.dir === "▼"
                          ? "down"
                          : "flat",
                    diff: trendArrow.diff,
                  }
                : undefined
            }
          />
        </AnimatedList.Item>
      </AnimatedList>

      {/* Latest Scan Card */}
      {latestScan && (
        <MagicCard accentColor="#6366f1" beam className="mb-6 p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2.5">
                <h3 className="text-[1.05rem] font-bold">
                  {latestScan.projectName || "Project"}
                </h3>
                <span
                  className={`badge badge-${latestScan.status?.toLowerCase()}`}
                >
                  {latestScan.status}
                </span>
              </div>
              <p className="text-[0.78rem] text-txt-muted">
                Latest scan · {new Date(latestScan.startedAt).toLocaleString()}
              </p>
            </div>
            {aiGrade && (
              <div
                className="flex h-[52px] w-[52px] items-center justify-center rounded-[14px] border"
                style={{
                  background:
                    aiGrade === "A"
                      ? "rgba(34,197,94,0.1)"
                      : aiGrade === "B"
                        ? "rgba(74,222,128,0.1)"
                        : aiGrade === "C"
                          ? "rgba(234,179,8,0.1)"
                          : aiGrade === "D"
                            ? "rgba(251,146,60,0.1)"
                            : "rgba(239,68,68,0.1)",
                  borderColor:
                    aiGrade === "A"
                      ? "rgba(34,197,94,0.2)"
                      : aiGrade === "B"
                        ? "rgba(74,222,128,0.2)"
                        : aiGrade === "C"
                          ? "rgba(234,179,8,0.2)"
                          : aiGrade === "D"
                            ? "rgba(251,146,60,0.2)"
                            : "rgba(239,68,68,0.2)",
                }}
              >
                <span
                  className={`grade-${aiGrade.toLowerCase()}`}
                  style={{ fontSize: "1.6rem", fontWeight: 800 }}
                >
                  {aiGrade}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-5 gap-3 border-y border-white/[0.04] py-4">
            {[
              {
                value: aiScore ?? "—",
                label: "Health Score",
                color: "#818cf8",
              },
              {
                value: latestScan.totalEndpoints,
                label: "Endpoints",
                color: "var(--text-primary)",
              },
              {
                value: aiTotal > 0 ? aiTotal : "—",
                label: "Issues",
                color: "var(--text-primary)",
              },
              {
                value: aiTotal > 0 ? aiCritical : "—",
                label: "Critical",
                color: "#ef4444",
              },
              {
                value: latestScan.diagramsGenerated,
                label: "Diagrams",
                color: "var(--text-primary)",
              },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <div
                  className="mb-1 text-[1.4rem] font-extrabold leading-none"
                  style={{ color: item.color }}
                >
                  {item.value}
                </div>
                <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-txt-muted">
                  {item.label}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => navigate(`/results/${latestScan.id}`)}
            >
              View Results
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => navigate(`/issues/${latestScan.id}`)}
            >
              View Issues
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => navigate(`/diagrams/${latestScan.id}`)}
            >
              View Diagrams
            </button>
          </div>
        </MagicCard>
      )}

      {/* Quick Actions */}
      <div className="mb-6 flex gap-2.5">
        <ShimmerButton onClick={() => navigate("/scan")}>
          🔍 Start New Scan
        </ShimmerButton>
        <ShimmerButton onClick={() => navigate("/history")}>
          📜 View History
        </ShimmerButton>
        <ShimmerButton onClick={() => navigate("/trends")}>
          📈 View Trends
        </ShimmerButton>
      </div>

      {loading && (
        <div className="empty-state">
          <div className="empty-state-icon animate-pulse">⏳</div>
          <h3>Loading...</h3>
        </div>
      )}

      {/* ── How It Works ── */}
      {!loading && history.length > 0 && (
        <MagicCard accentColor={false} className="mb-6 p-6">
          <DotPattern className="opacity-40" />
          <div className="relative z-10">
            <h3 className="mb-4 pl-3 text-[0.85rem] font-bold text-indigo-400">
              How CodeChecker Works
            </h3>
            <AnimatedList className="grid grid-cols-4 gap-3" stagger={0.1}>
              {[
                {
                  step: "1",
                  icon: "🔍",
                  title: "Scan",
                  desc: "Extract all API endpoints from Spring, Struts, and SOAP projects. Generate UML diagrams and map flows.",
                  color: "#6366f1",
                },
                {
                  step: "2",
                  icon: "🤖",
                  title: "AI Analyse",
                  desc: "Detect OWASP Top 10 issues, anti-patterns, missing @Transactional, PII leaks.",
                  color: "#a78bfa",
                },
                {
                  step: "3",
                  icon: "⚡",
                  title: "Load Test",
                  desc: "Fire concurrent users, stream P50/P90/P99 latency. SLA breach alerts.",
                  color: "#f59e0b",
                },
                {
                  step: "4",
                  icon: "📈",
                  title: "Compare",
                  desc: "Trend health scores across scans. Track improvements and regressions.",
                  color: "#22c55e",
                },
              ].map(({ step, icon, title, desc, color }) => (
                <AnimatedList.Item key={step}>
                  <motion.div
                    whileHover={{ y: -2 }}
                    className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-4 transition-colors hover:border-white/[0.08]"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <div
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[0.65rem] font-extrabold"
                        style={{
                          background: `${color}20`,
                          color,
                        }}
                      >
                        {step}
                      </div>
                      <span className="text-[0.8rem] font-bold">
                        {icon} {title}
                      </span>
                    </div>
                    <div className="text-[0.7rem] leading-relaxed text-txt-muted">
                      {desc}
                    </div>
                  </motion.div>
                </AnimatedList.Item>
              ))}
            </AnimatedList>
          </div>
        </MagicCard>
      )}

      {/* Framework Distribution — latest scan */}
      {latestEndpoints.length > 0 &&
        (() => {
          const fwCounts: Record<string, number> = {};
          latestEndpoints.forEach((ep) => {
            const fw = ep.framework || "UNKNOWN";
            fwCounts[fw] = (fwCounts[fw] || 0) + 1;
          });
          const fwMeta: Record<string, { fg: string; label: string }> = {
            SPRING_MVC: { fg: "#22c55e", label: "Spring MVC" },
            SEEDSTACK_JAXRS: { fg: "#6366f1", label: "JAX-RS" },
            STRUTS2: { fg: "#f59e0b", label: "Struts 2" },
            STRUTS1: { fg: "#fb923c", label: "Struts 1" },
            JAX_WS: { fg: "#06b6d4", label: "JAX-WS (SOAP)" },
            SPRING_WS: { fg: "#8b5cf6", label: "Spring-WS (SOAP)" },
          };
          return (
            <MagicCard accentColor="#06b6d4" className="mb-6 p-6">
              <h3 className="mb-4 text-[0.85rem] font-bold text-cyan-400">
                Framework Distribution — Latest Scan
              </h3>
              <AnimatedList className="flex flex-wrap gap-3">
                {Object.entries(fwCounts).map(([fw, count]) => {
                  const meta = fwMeta[fw] ?? { fg: "#94a3b8", label: fw };
                  const pct = Math.round(
                    (count / latestEndpoints.length) * 100,
                  );
                  return (
                    <AnimatedList.Item key={fw}>
                      <motion.div
                        whileHover={{ scale: 1.04 }}
                        className="flex min-w-[130px] items-center gap-2.5 rounded-[10px] border px-3.5 py-2.5"
                        style={{
                          background: `${meta.fg}10`,
                          borderColor: `${meta.fg}20`,
                        }}
                      >
                        <span
                          className="text-[1.3rem] font-extrabold leading-none"
                          style={{ color: meta.fg }}
                        >
                          {count}
                        </span>
                        <div>
                          <div
                            className="text-[0.72rem] font-bold"
                            style={{ color: meta.fg }}
                          >
                            {meta.label}
                          </div>
                          <div className="text-[0.6rem] text-txt-muted">
                            {pct}%
                          </div>
                        </div>
                      </motion.div>
                    </AnimatedList.Item>
                  );
                })}
              </AnimatedList>
            </MagicCard>
          );
        })()}

      {!loading && history.length === 0 && (
        <div className="empty-state" style={{ marginTop: "2rem" }}>
          <div className="empty-state-icon">🚀</div>
          <h3>Welcome to API Analysis</h3>
          <p>Analyzing Java APIs for Performance and Issues.</p>
          <ShimmerButton className="mt-4" onClick={() => navigate("/scan")}>
            Start Your First Scan
          </ShimmerButton>
        </div>
      )}
    </div>
  );
}
