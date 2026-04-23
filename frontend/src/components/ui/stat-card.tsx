import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import NumberTicker from "./number-ticker";

/**
 * StatCard — Reusable KPI card used across Dashboard, Results, Trends pages.
 * Features:
 *  - Gradient accent bar at top (Magic UI style)
 *  - Animated number ticker
 *  - Hover glow effect (Aceternity style)
 *  - Optional trend badge
 */
interface StatCardProps {
  label: string;
  value: number | string;
  color: string;
  className?: string;
  trend?: { dir: "up" | "down" | "flat"; diff: string };
  suffix?: string;
  animateNumber?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  color,
  className,
  trend,
  suffix,
  animateNumber = true,
}) => {
  const numVal = typeof value === "number" ? value : parseFloat(value);
  const isNum = !isNaN(numVal);

  return (
    <motion.div
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className={cn(
        "group relative overflow-hidden rounded-[14px] border p-5 transition-all duration-200",
        className,
      )}
      style={{
        background: `linear-gradient(135deg, ${color}1a, transparent)`,
        borderColor: `${color}1f`,
      }}
    >
      {/* Top accent bar */}
      <div
        className="absolute inset-x-0 top-0 h-0.5"
        style={{
          background: `linear-gradient(90deg, ${color}, ${color}99)`,
        }}
      />

      {/* Hover glow */}
      <div
        className="pointer-events-none absolute -inset-px rounded-[14px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(400px circle at 50% 50%, ${color}15, transparent 60%)`,
        }}
      />

      <div className="relative z-10">
        <div className="mb-1.5 text-[0.65rem] font-bold uppercase tracking-[0.08em] text-txt-muted">
          {label}
        </div>
        <div className="flex items-baseline gap-2">
          <span
            className="text-[2rem] font-extrabold leading-none tracking-tight"
            style={{ color }}
          >
            {isNum && animateNumber ? (
              <NumberTicker value={numVal} />
            ) : (
              String(value)
            )}
            {suffix && (
              <span className="ml-0.5 text-lg font-semibold">{suffix}</span>
            )}
          </span>
          {trend && (
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[0.72rem] font-bold",
                trend.dir === "up" && "bg-green-500/10 text-green-400",
                trend.dir === "down" && "bg-red-500/10 text-red-400",
                trend.dir === "flat" && "bg-slate-500/10 text-slate-400",
              )}
            >
              {trend.dir === "up" ? "▲" : trend.dir === "down" ? "▼" : "—"}{" "}
              {trend.diff}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default StatCard;
