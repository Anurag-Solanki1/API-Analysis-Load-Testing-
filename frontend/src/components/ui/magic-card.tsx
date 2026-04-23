import React, { useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BorderBeam } from "./border-beam";

/**
 * MagicCard — A card component with mouse-tracking glow, optional animated
 * border beam, and dot-pattern background. Combines Magic UI + Aceternity patterns.
 */
interface MagicCardProps {
  children: React.ReactNode;
  className?: string;
  /** Show the animated border beam. Default: false. */
  beam?: boolean;
  beamColor?: string;
  /** Gradient bar color at top of card. If false, no bar. */
  accentColor?: string | false;
  /** Enable hover lift animation. Default: true. */
  hover?: boolean;
  /** Enable glassmorphism variant. Default: false. */
  glass?: boolean;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
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
      glass = false,
      ...props
    },
    ref,
  ) => {
    const innerRef = useRef<HTMLDivElement>(null);
    const cardRef = (ref as React.RefObject<HTMLDivElement>) || innerRef;

    const handleMouseMove = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        const el = cardRef.current ?? (e.currentTarget as HTMLDivElement);
        const rect = el.getBoundingClientRect();
        el.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
        el.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
      },
      [cardRef],
    );

    const Wrapper = hover ? motion.div : "div";
    const hoverProps = hover
      ? { whileHover: { y: -3, transition: { duration: 0.2 } } }
      : {};

    return (
      <Wrapper
        ref={cardRef as any}
        className={cn(
          "group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-surface-card transition-all duration-200 hover:border-white/[0.12]",
          glass &&
            "bg-white/[0.03] backdrop-blur-xl border-white/[0.08]",
          className,
        )}
        onMouseMove={handleMouseMove}
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

        {/* Mouse-tracking hover glow */}
        <div
          className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background: `radial-gradient(600px circle at var(--mouse-x,50%) var(--mouse-y,50%), ${accentColor && typeof accentColor === "string" ? accentColor + "18" : "rgba(99,102,241,0.1)"}, transparent 40%)`,
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
