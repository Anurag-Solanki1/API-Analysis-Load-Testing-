import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * GlowCard — Aceternity UI inspired card with animated border glow on hover.
 */
interface GlowCardProps {
  children: React.ReactNode;
  glowColor?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

const GlowCard = React.forwardRef<HTMLDivElement, GlowCardProps>(
  (
    { children, glowColor = "rgba(99,102,241,0.15)", className, ...props },
    ref,
  ) => (
    <motion.div
      ref={ref}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className={cn(
        "group relative overflow-hidden rounded-xl border border-white/[0.06] bg-surface-card p-5 transition-colors hover:border-white/[0.12]",
        className,
      )}
      {...props}
    >
      {/* Glow effect on hover */}
      <div
        className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), ${glowColor}, transparent 40%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </motion.div>
  ),
);

GlowCard.displayName = "GlowCard";

export { GlowCard };
