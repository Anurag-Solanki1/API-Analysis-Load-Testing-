import React from "react";
import { cn } from "@/lib/utils";

/**
 * SectionLabel — uppercase muted label used throughout config panels.
 */
const SectionLabel: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <label
    className={cn(
      "mb-1.5 block text-[0.7rem] font-bold uppercase tracking-wider text-txt-muted",
      className,
    )}
  >
    {children}
  </label>
);

/**
 * DetailTable — a striped key-value table for protocol/action details.
 */
interface DetailRow {
  label: string;
  value: string;
}

const DetailTable: React.FC<{
  rows: DetailRow[];
  className?: string;
}> = ({ rows, className }) => (
  <div
    className={cn("overflow-hidden rounded border border-border", className)}
  >
    {rows.map((row, idx) => (
      <div
        key={row.label}
        className={cn(
          "grid grid-cols-2 px-3 py-1.5 text-[0.75rem]",
          idx < rows.length - 1 && "border-b border-border",
          idx % 2 === 0 ? "bg-white/[0.015]" : "bg-transparent",
        )}
      >
        <span className="text-txt-muted">{row.label}</span>
        <span className="font-mono text-txt-primary break-all">
          {row.value}
        </span>
      </div>
    ))}
  </div>
);

/**
 * InfoBanner — colored info bar with title and subtitle.
 */
const InfoBanner: React.FC<{
  title: string;
  subtitle: string;
  color: string;
  className?: string;
}> = ({ title, subtitle, color, className }) => (
  <div
    className={cn(
      "flex items-center gap-2 rounded border px-3 py-2.5",
      className,
    )}
    style={{
      background: `${color}14`,
      borderColor: `${color}40`,
    }}
  >
    <div>
      <div className="text-[0.78rem] font-bold" style={{ color }}>
        {title}
      </div>
      <div className="mt-0.5 text-[0.68rem] text-txt-muted">{subtitle}</div>
    </div>
  </div>
);

/**
 * TipBox — a muted info tip with a highlighted keyword.
 */
const TipBox: React.FC<{
  color: string;
  children: React.ReactNode;
  className?: string;
}> = ({ color, children, className }) => (
  <div
    className={cn(
      "rounded border px-2.5 py-2 text-[0.7rem] leading-relaxed text-txt-muted",
      className,
    )}
    style={{
      background: `${color}0f`,
      borderColor: `${color}33`,
    }}
  >
    <strong style={{ color }}>Tip:</strong> {children}
  </div>
);

export { SectionLabel, DetailTable, InfoBanner, TipBox };
