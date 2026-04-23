import React from "react";
import { cn } from "@/lib/utils";

/**
 * GridPattern — Animated grid background pattern (Aceternity style).
 * Renders a subtle CSS grid overlay for depth.
 */
interface GridPatternProps {
  className?: string;
  size?: number;
  color?: string;
}

const GridPattern: React.FC<GridPatternProps> = ({
  className,
  size = 40,
  color = "rgba(99, 102, 241, 0.04)",
}) => {
  const id = React.useId();
  return (
    <svg
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full",
        className,
      )}
    >
      <defs>
        <pattern
          id={id}
          width={size}
          height={size}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${size} 0 L 0 0 0 ${size}`}
            fill="none"
            stroke={color}
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
};

export default GridPattern;
