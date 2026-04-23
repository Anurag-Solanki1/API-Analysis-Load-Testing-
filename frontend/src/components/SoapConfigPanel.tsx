import React from "react";
import type { EndpointResult } from "../api";
import {
  InfoBanner,
  SectionLabel,
  DetailTable,
  TipBox,
} from "./ui/config-primitives";

interface SoapConfigPanelProps {
  endpoint: EndpointResult;
  requestPayload: string;
}

const SoapConfigPanel: React.FC<SoapConfigPanelProps> = ({
  endpoint,
  requestPayload,
}) => {
  const operationName = endpoint.path?.split("/").pop() || "YourOperation";
  const serviceName = endpoint.controllerClass?.split(".").pop() || "—";

  const protocolRows = [
    { label: "HTTP Method", value: "POST" },
    { label: "Content-Type", value: "text/xml" },
    { label: "Framework", value: endpoint.framework || "JAX_WS" },
    { label: "Service", value: serviceName },
  ];

  return (
    <div className="flex flex-col gap-4">
      <InfoBanner
        title="SOAP Web Service"
        subtitle="Requests are sent as HTTP POST with Content-Type: text/xml and SOAPAction header"
        color="#06b6d4"
      />

      {/* SOAPAction */}
      <div>
        <SectionLabel>SOAPAction</SectionLabel>
        <div className="break-all rounded border border-border bg-surface-secondary px-2.5 py-1.5 font-mono text-[0.78rem] text-soap">
          "{operationName}"
        </div>
        <p className="mt-1 text-[0.65rem] text-txt-muted">
          Auto-derived from endpoint path. Added as SOAPAction header.
        </p>
      </div>

      {/* Protocol details */}
      <div>
        <SectionLabel>Protocol Details</SectionLabel>
        <DetailTable rows={protocolRows} />
      </div>

      {/* SOAP Envelope preview */}
      <div>
        <SectionLabel>SOAP Envelope Preview</SectionLabel>
        <pre className="m-0 max-h-[220px] overflow-y-auto whitespace-pre-wrap break-words rounded border border-border bg-surface-secondary px-3 py-2.5 font-mono text-[0.72rem] leading-relaxed text-soap">
          {requestPayload || "(configure in Body tab \u2190)"}
        </pre>
        <p className="mt-1 text-[0.65rem] text-txt-muted">
          Edit the XML envelope in the Body tab on the left panel
        </p>
      </div>

      {/* WS-Security note */}
      <TipBox color="#facc15">
        For WS-Security, add security tokens directly inside the SOAP Header
        element in the Body tab. Use the Auth tab for HTTP-level authentication
        (Basic/Bearer).
      </TipBox>
    </div>
  );
};

export default SoapConfigPanel;
