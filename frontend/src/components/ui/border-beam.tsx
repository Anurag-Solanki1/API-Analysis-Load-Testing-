import React from "react";
import { cn } from "@/lib/utils";

/**
 * BorderBeam — Magic UI inspired animated border highlight.
 * Renders an animated dot that travels along the edges of its parent.
 * Parent must have `position: relative; overflow: hidden`.
 */
interface BorderBeamProps {
  className?: string;
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
}

const BorderBeam: React.FC<BorderBeamProps> = ({
  className,
  size = 200,
  duration = 12,
  delay = 0,
  colorFrom = "#6366f1",
  colorTo = "#a78bfa",
}) => (
  <div
    style={
      {
        "--size": size,
        "--duration": duration,
        "--anchor": 90,
        "--border-width": 1.5,
        "--color-from": colorFrom,
        "--color-to": colorTo,
        "--delay": `-${delay}s`,
      } as React.CSSProperties
    }
    className={cn(
      "pointer-events-none absolute inset-0 rounded-[inherit] [border:calc(var(--border-width)*1px)_solid_transparent]",
      "![mask-clip:padding-box,border-box] ![mask-composite:intersect] [mask:linear-gradient(transparent,transparent),linear-gradient(white,white)]",
      "after:absolute after:aspect-square after:w-[calc(var(--size)*1px)] after:animate-border-beam",
      "after:[animation-delay:var(--delay)] after:[background:linear-gradient(to_left,var(--color-from),var(--color-to),transparent)]",
      "after:[offset-anchor:calc(var(--anchor)*1%)_50%] after:[offset-path:rect(0_auto_auto_0_round_calc(var(--size)*1px))]",
      className,
    )}
  />
);

export { BorderBeam };
