import React from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import type { EndpointResult } from "@/api";

const METHOD_COLORS: Record<string, string> = {
  GET: "#22c55e",
  POST: "#3b82f6",
  PUT: "#f59e0b",
  DELETE: "#ef4444",
  PATCH: "#a78bfa",
  SOAP: "#06b6d4",
};

const FW_META: Record<string, { fg: string; label: string }> = {
  SEEDSTACK_JAXRS: { fg: "#6366f1", label: "JAX-RS" },
  STRUTS2: { fg: "#f59e0b", label: "Struts 2" },
  STRUTS1: { fg: "#fb923c", label: "Struts 1" },
  JAX_WS: { fg: "#06b6d4", label: "SOAP (JAX-WS)" },
  SPRING_WS: { fg: "#8b5cf6", label: "SOAP (Spring-WS)" },
};

interface EndpointPickerProps {
  projectName: string;
  endpoints: EndpointResult[];
  isApmMode: boolean;
  onSelect: (ep: EndpointResult) => void;
  onBack: () => void;
  getMethodBadge: (method: string) => string;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" as const } },
};

const EndpointPicker: React.FC<EndpointPickerProps> = ({
  projectName,
  endpoints,
  isApmMode,
  onSelect,
  onBack,
  getMethodBadge,
}) => {
  const filtered = (Array.isArray(endpoints) ? endpoints : []).filter(
    (ep) => ep.diagramPath && ep.diagramPath.trim() !== "",
  );

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <div className="mb-1 flex items-center gap-3">
          <button className="btn btn-outline btn-sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h2 className="m-0 text-2xl font-extrabold tracking-tight">
            <span className="bg-gradient-to-br from-slate-200 to-indigo-400 bg-clip-text text-transparent">
              {projectName}
            </span>
          </h2>
        </div>
        <p className="ml-[5.5rem] text-sm text-txt-muted">
          {isApmMode
            ? "Select an endpoint to open its APM dashboard, run load tests, and analyse CloudWatch logs."
            : "Select an endpoint to open the Live Monitor and observe real user traffic through the Gateway."}
        </p>
      </div>

      {/* Endpoint grid */}
      {filtered.length === 0 ? (
        <div className="text-sm text-txt-muted py-4">
          No endpoints with a generated trace found. Run a full scan to generate
          traces.
        </div>
      ) : (
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4"
        >
          {filtered.map((ep, idx) => {
            const mColor =
              METHOD_COLORS[ep.httpMethod.toUpperCase()] ?? "#6366f1";
            const fw = FW_META[ep.framework];

            return (
              <motion.div
                key={`${idx}-${ep.httpMethod}${ep.path}`}
                variants={item}
                whileHover={{
                  y: -3,
                  boxShadow: `0 6px 24px rgba(0,0,0,0.25), 0 0 0 1px ${mColor}22`,
                  borderColor: `${mColor}33`,
                }}
                onClick={() => onSelect(ep)}
                className="relative cursor-pointer overflow-hidden rounded-xl border border-white/[0.06] bg-surface-card p-5 flex flex-col gap-3 transition-colors"
              >
                {/* Top accent line */}
                <div
                  className="absolute inset-x-0 top-0 h-0.5"
                  style={{
                    background: `linear-gradient(90deg, ${mColor}, ${mColor}88)`,
                  }}
                />

                <div className="flex items-center justify-between">
                  <span className={`badge ${getMethodBadge(ep.httpMethod)}`}>
                    {ep.httpMethod}
                  </span>
                  {ep.issueCount > 0 && (
                    <span className="badge badge-high">
                      {ep.issueCount} issues
                    </span>
                  )}
                </div>

                <code className="text-sm text-txt-primary break-all leading-relaxed">
                  {ep.path}
                </code>

                <div className="text-[0.72rem] text-txt-muted">
                  {ep.controllerClass}.{ep.controllerMethod}()
                </div>

                {fw && ep.framework !== "SPRING_MVC" && (
                  <span
                    className="self-start rounded text-[0.6rem] font-bold px-1.5 py-px border"
                    style={{
                      background: `${fw.fg}12`,
                      color: fw.fg,
                      borderColor: `${fw.fg}25`,
                    }}
                  >
                    {fw.label}
                  </span>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </>
  );
};

export default EndpointPicker;
