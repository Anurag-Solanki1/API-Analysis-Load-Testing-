import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { startScan } from "../api";
import PageHeader from "@/components/ui/page-header";
import MagicCard from "@/components/ui/magic-card";
import ShimmerButton from "@/components/ui/shimmer-button";

export default function NewScan() {
  const [projectName, setProjectName] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [outputPath, setOutputPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectPath.trim()) {
      setError("Project path is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await startScan({
        projectName: projectName || projectPath.split("/").pop() || "Project",
        projectPath: projectPath.trim(),
        outputPath: outputPath.trim() || undefined,
      });
      navigate(`/scan/${result.scanId}`);
    } catch (err) {
      setError("Failed to start scan. Make sure the backend is running.");
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="New Scan"
        subtitle="Point API Analysis at a Java project to analyze its API health"
        gradient="from-cyan-400 to-indigo-400"
      />

      <MagicCard accentColor="#6366f1" className="max-w-[640px] p-6">
        <div
          style={{
            marginBottom: "1.25rem",
            padding: "0.75rem",
            background: "rgba(99,102,241,0.06)",
            border: "1px solid rgba(99,102,241,0.15)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <div
            style={{
              fontSize: "0.78rem",
              fontWeight: 600,
              color: "var(--accent-light)",
              marginBottom: "0.35rem",
            }}
          >
            Supported Frameworks
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {[
              { label: "Spring MVC / Boot", color: "#22c55e" },
              { label: "JAX-RS (SeedStack)", color: "#6366f1" },
              { label: "Struts 2 (Action)", color: "#f59e0b" },
              { label: "Struts 1 (ActionForm)", color: "#fb923c" },
              { label: "JAX-WS (SOAP)", color: "#06b6d4" },
              { label: "Spring-WS (SOAP)", color: "#8b5cf6" },
            ].map((fw) => (
              <span
                key={fw.label}
                style={{
                  fontSize: "0.68rem",
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: `${fw.color}15`,
                  color: fw.color,
                  border: `1px solid ${fw.color}30`,
                  fontWeight: 600,
                }}
              >
                {fw.label}
              </span>
            ))}
          </div>
          <p
            style={{
              fontSize: "0.72rem",
              color: "var(--text-muted)",
              marginTop: "0.4rem",
              marginBottom: 0,
            }}
          >
            The scanner auto-detects the framework from source code annotations
            and class hierarchies.
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Project Name</label>
            <input
              className="form-input"
              type="text"
              placeholder="e.g. my-spring-boot-app"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Project Path *</label>
            <input
              className="form-input"
              type="text"
              placeholder="/Users/you/workspace/my-app"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              required
            />
            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                marginTop: 4,
              }}
            >
              Absolute path to the root of your Java project (Spring, Struts, or
              SOAP)
            </p>
          </div>

          <div className="form-group">
            <label>Output Directory (optional)</label>
            <input
              className="form-input"
              type="text"
              placeholder="api-analysis-output (default)"
              value={outputPath}
              onChange={(e) => setOutputPath(e.target.value)}
            />
          </div>

          {error && (
            <div
              style={{
                padding: "0.75rem",
                background: "var(--danger-bg)",
                border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: "var(--radius-sm)",
                color: "var(--danger)",
                fontSize: "0.85rem",
                marginBottom: "1rem",
              }}
            >
              {error}
            </div>
          )}

          <ShimmerButton type="submit" disabled={loading} className="w-full">
            {loading ? (
              <>
                <span className="animate-pulse">⏳</span> Starting scan...
              </>
            ) : (
              <>🚀 Start Scan</>
            )}
          </ShimmerButton>
        </form>
      </MagicCard>
    </div>
  );
}
