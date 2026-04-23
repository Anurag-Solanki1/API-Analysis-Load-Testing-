import React from "react";
import { cn } from "@/lib/utils";

/**
 * Spotlight — Aceternity UI inspired spotlight gradient overlay.
 * Place inside a relatively-positioned container for a dramatic glow effect.
 */
interface SpotlightProps {
  className?: string;
  fill?: string;
}

const Spotlight: React.FC<SpotlightProps> = ({
  className,
  fill = "rgba(99, 102, 241, 0.12)",
}) => (
  <div
    className={cn(
      "pointer-events-none absolute -top-40 left-0 z-0 h-[500px] w-[600px] animate-spotlight opacity-0",
      className,
    )}
    style={{
      background: `radial-gradient(ellipse 60% 50% at 50% 0%, ${fill}, transparent 70%)`,
    }}
  />
);

export default Spotlight;
