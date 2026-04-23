import React from "react";
import type { EndpointResult } from "../api";
import {
  InfoBanner,
  SectionLabel,
  DetailTable,
  TipBox,
} from "./ui/config-primitives";
import { cn } from "@/lib/utils";

interface StrutsConfigPanelProps {
  endpoint: EndpointResult;
  requestPayload: string;
}

const StrutsConfigPanel: React.FC<StrutsConfigPanelProps> = ({
  endpoint,
  requestPayload,
}) => {
  const isStruts1 = endpoint.framework === "STRUTS1";
  const actionClassName = endpoint.controllerClass?.split(".").pop() || "—";

  const detailRows = [
    { label: "HTTP Method", value: "POST" },
    { label: "Content-Type", value: "application/x-www-form-urlencoded" },
    { label: "Framework", value: endpoint.framework || "STRUTS2" },
    { label: "Action Class", value: actionClassName },
    { label: "URL Pattern", value: endpoint.path || "—" },
  ];

  const formPairs = (requestPayload || "")
    .split("&")
    .map((p) => {
      const [k, ...rest] = p.split("=");
      return {
        key: decodeURIComponent(k || ""),
        val: decodeURIComponent(rest.join("=") || ""),
      };
    })
    .filter((p) => p.key);

  return (
    <div className="flex flex-col gap-4">
      <InfoBanner
        title={
          isStruts1 ? "Struts 1 Action (.do)" : "Struts 2 Action (.action)"
        }
        subtitle="Requests use POST with application/x-www-form-urlencoded form data"
        color="#f97316"
      />

      {/* Action details */}
      <div>
        <SectionLabel>Action Details</SectionLabel>
        <DetailTable rows={detailRows} />
      </div>

      {/* Form parameters preview */}
      <div>
        <SectionLabel>Form Parameters</SectionLabel>
        <div className="overflow-hidden rounded border border-border">
          {/* Header row */}
          <div className="grid grid-cols-2 border-b border-border bg-white/[0.03] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-wide text-txt-muted">
            <span>Parameter</span>
            <span>Value</span>
          </div>
          {formPairs.length > 0 ? (
            formPairs.map((pair, idx) => (
              <div
                key={idx}
                className={cn(
                  "grid grid-cols-2 px-3 py-1.5 text-[0.75rem]",
                  idx < formPairs.length - 1 && "border-b border-border",
                  idx % 2 === 0 ? "bg-white/[0.015]" : "bg-transparent",
                )}
              >
                <span className="font-mono text-struts">{pair.key}</span>
                <span className="font-mono text-txt-primary">
                  {pair.val || (
                    <span className="italic text-txt-muted">empty</span>
                  )}
                </span>
              </div>
            ))
          ) : (
            <div className="py-2.5 text-center text-[0.75rem] text-txt-muted">
              No form parameters — edit in Body tab &larr;
            </div>
          )}
        </div>
        <p className="mt-1 text-[0.65rem] text-txt-muted">
          Edit form parameters (key=value&amp;key2=value2) in the Body tab
        </p>
      </div>

      {/* Struts tip */}
      <TipBox color="#f97316">
        Struts actions accept form-encoded parameters. Use the Body tab to set{" "}
        <code className="text-struts">param1=value1&amp;param2=value2</code>{" "}
        format.
      </TipBox>
    </div>
  );
};

export default StrutsConfigPanel;
