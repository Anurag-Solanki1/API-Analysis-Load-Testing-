import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { startScan } from "../api";
import { Rocket, AlertCircle } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import MagicCard from "@/components/ui/magic-card";
import ShimmerButton from "@/components/ui/shimmer-button";
import GridPattern from "@/components/ui/grid-pattern";
import Spotlight from "@/components/ui/spotlight";

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

  const frameworks = [
    { label: "Spring MVC / Boot", color: "#22c55e" },
    { label: "JAX-RS (SeedStack)", color: "#6366f1" },
    { label: "Struts 2 (Action)", color: "#f59e0b" },
    { label: "Struts 1 (ActionForm)", color: "#fb923c" },
    { label: "JAX-WS (SOAP)", color: "#06b6d4" },
    { label: "Spring-WS (SOAP)", color: "#8b5cf6" },
  ];

  return (
    <div className="relative">
      <Spotlight className="-top-20 left-10" fill="rgba(6, 182, 212, 0.08)" />

      <PageHeader
        title="New Scan"
        subtitle="Point API Analysis at a Java project to analyze its API health"
        gradient="from-cyan-400 to-indigo-400"
      />

      <MagicCard accentColor="#6366f1" beam className="relative max-w-[640px] p-6">
        <GridPattern className="opacity-20" size={30} />

        <div className="relative z-10">
          {/* Supported Frameworks */}
          <div className="mb-5 rounded-xl border border-indigo-500/15 bg-indigo-500/[0.06] p-4">
            <div className="mb-2 text-[0.78rem] font-bold text-indigo-400">
              Supported Frameworks
            </div>
            <div className="flex flex-wrap gap-2">
              {frameworks.map((fw) => (
                <span
                  key={fw.label}
                  className="rounded-md border px-2.5 py-0.5 text-[0.68rem] font-semibold"
                  style={{
                    background: `${fw.color}15`,
                    color: fw.color,
                    borderColor: `${fw.color}30`,
                  }}
                >
                  {fw.label}
                </span>
              ))}
            </div>
            <p className="mt-2 mb-0 text-[0.72rem] text-txt-muted">
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
              <p className="mt-1 text-[0.75rem] text-txt-muted">
                Absolute path to the root of your Java project (Spring, Struts, or SOAP)
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
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-[0.85rem] text-red-400">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <ShimmerButton type="submit" disabled={loading} className="w-full">
              {loading ? (
                <>
                  <span className="animate-pulse">⏳</span> Starting scan...
                </>
              ) : (
                <>
                  <Rocket size={16} /> Start Scan
                </>
              )}
            </ShimmerButton>
          </form>
        </div>
      </MagicCard>
    </div>
  );
}
