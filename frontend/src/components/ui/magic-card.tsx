import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BorderBeam } from "./border-beam";

/**
 * MagicCard — A card component with optional animated border beam,
 * hover glow, and dot-pattern background. Combines Magic UI + Aceternity patterns.
 */
interface MagicCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  /** Show the animated border beam. Default: false. */
  beam?: boolean;
  beamColor?: string;
  /** Gradient bar color at top of card. If false, no bar. */
  accentColor?: string | false;
  /** Enable hover lift animation. Default: true. */
  hover?: boolean;
}

const MagicCard = React.forwardRef<HTMLDivElement, MagicCardProps>(
  (
    {
      children,
      className,
      beam = false,
      beamColor,
      accentColor,
      hover = true,
      ...props
    },
    ref,
  ) => {
    const Wrapper = hover ? motion.div : "div";
    const hoverProps = hover
      ? { whileHover: { y: -2, transition: { duration: 0.2 } } }
      : {};

    return (
      <Wrapper
        ref={ref as any}
        className={cn(
          "group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-surface-card transition-colors duration-200 hover:border-white/[0.12]",
          className,
        )}
        {...hoverProps}
        {...props}
      >
        {/* Top accent bar */}
        {accentColor && (
          <div
            className="absolute inset-x-0 top-0 h-0.5"
            style={{
              background:
                typeof accentColor === "string"
                  ? `linear-gradient(90deg, ${accentColor}, ${accentColor}88)`
                  : "linear-gradient(90deg, #6366f1, #a78bfa)",
            }}
          />
        )}

        {/* Hover glow */}
        <div
          className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: `radial-gradient(600px circle at var(--mouse-x,50%) var(--mouse-y,50%), rgba(99,102,241,0.08), transparent 40%)`,
          }}
        />

        {/* Content */}
        <div className="relative z-10">{children}</div>

        {/* Optional Magic UI border beam */}
        {beam && (
          <BorderBeam
            size={150}
            duration={10}
            colorFrom={beamColor || "#6366f1"}
            colorTo={beamColor ? `${beamColor}88` : "#a78bfa"}
          />
        )}
      </Wrapper>
    );
  },
);

MagicCard.displayName = "MagicCard";

export default MagicCard;
