import React from "react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  color: string;
  className?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  color,
  className,
}) => (
  <div
    className={cn(
      "group relative overflow-hidden rounded-xl border p-4 transition-all duration-200 hover:scale-[1.02]",
      className,
    )}
    style={{
      background: `linear-gradient(135deg, ${color}18, transparent)`,
      borderColor: `${color}1f`,
    }}
  >
    {/* Top accent bar */}
    <div
      className="absolute inset-x-0 top-0 h-0.5"
      style={{
        background: `linear-gradient(90deg, ${color}, ${color}66)`,
      }}
    />
    <div className="mb-1.5 text-[0.65rem] font-bold uppercase tracking-widest text-txt-muted">
      {label}
    </div>
    <div
      className="text-2xl font-extrabold leading-none tracking-tight"
      style={{ color }}
    >
      {value}
    </div>
  </div>
);

export default MetricCard;
