import React, { useEffect, useState } from "react";
import { getTestProjects } from "../api";
import { useNavigate } from "react-router-dom";
import { Database, Server, ChevronRight, Activity, Zap } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import MagicCard from "@/components/ui/magic-card";
import { AnimatedList } from "@/components/ui/animated-list";
import ShimmerButton from "@/components/ui/shimmer-button";

const ApiList: React.FC<{ basePath?: string }> = ({ basePath = "/apis" }) => {
  const [projects, setProjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchProjects() {
      try {
        const data = await getTestProjects();
        setProjects(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchProjects();
  }, []);

  return (
    <>
      <PageHeader
        title={
          basePath === "/apm"
            ? "APM & Load Test"
            : basePath === "/cloudwatch"
              ? "CloudWatch Logs"
              : "Local API Workspaces"
        }
        subtitle={
          basePath === "/apm"
            ? "Select a project to run load tests, view real-time APM metrics, and analyse CloudWatch logs."
            : basePath === "/cloudwatch"
              ? "Select a project to import AWS CloudWatch Logs Insights exports and analyse per-endpoint timing."
              : "Select a scanned application to access real-time APM telemetry, CloudWatch analytics, and active load testing."
        }
        gradient={
          basePath === "/apm"
            ? "from-amber-400 to-yellow-400"
            : basePath === "/cloudwatch"
              ? "from-blue-400 to-cyan-400"
              : "from-indigo-400 to-purple-400"
        }
      />

      {loading ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Activity
              style={{
                width: 48,
                height: 48,
                color: "var(--accent-light)",
                animation: "pulse 2s ease-in-out infinite",
              }}
            />
          </div>
          <h3>Discovering API Clusters...</h3>
          <p>Scanning your workspace for previously analyzed projects.</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Database
              style={{ width: 48, height: 48, color: "var(--text-muted)" }}
            />
          </div>
          <h3>No API Workspaces Found</h3>
          <p>
            Run a static code scan on a project first so the analyzer can
            discover the API architecture.
          </p>
          <ShimmerButton onClick={() => navigate("/scan")} className="mt-6">
            <Zap style={{ width: 16, height: 16 }} /> Start New Scan
          </ShimmerButton>
        </div>
      ) : (
        <AnimatedList
          stagger={0.08}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {projects.map((p) => (
            <AnimatedList.Item key={p}>
              <MagicCard
                accentColor={
                  basePath === "/apm"
                    ? "#f59e0b"
                    : basePath === "/cloudwatch"
                      ? "#3b82f6"
                      : "#6366f1"
                }
                className="cursor-pointer p-6"
                onClick={() => navigate(`${basePath}/${encodeURIComponent(p)}`)}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: "1rem",
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background:
                        basePath === "/apm"
                          ? "rgba(245,158,11,0.1)"
                          : basePath === "/cloudwatch"
                            ? "rgba(59,130,246,0.1)"
                            : "rgba(99,102,241,0.1)",
                      border: `1px solid ${basePath === "/apm" ? "rgba(245,158,11,0.15)" : basePath === "/cloudwatch" ? "rgba(59,130,246,0.15)" : "rgba(99,102,241,0.15)"}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Server
                      style={{
                        width: 22,
                        height: 22,
                        color:
                          basePath === "/apm"
                            ? "#f59e0b"
                            : basePath === "/cloudwatch"
                              ? "#3b82f6"
                              : "var(--accent-light)",
                      }}
                    />
                  </div>
                  <ChevronRight
                    style={{
                      width: 18,
                      height: 18,
                      color: "var(--text-muted)",
                      opacity: 0.5,
                    }}
                  />
                </div>
                <h3
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    marginBottom: "0.3rem",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {p}
                </h3>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    margin: 0,
                  }}
                >
                  {basePath === "/apm"
                    ? "Load Test & APM Dashboard"
                    : basePath === "/cloudwatch"
                      ? "CloudWatch Log Analysis"
                      : "Live Gateway Monitor"}
                </p>
              </MagicCard>
            </AnimatedList.Item>
          ))}
        </AnimatedList>
      )}
    </>
  );
};

export default ApiList;
