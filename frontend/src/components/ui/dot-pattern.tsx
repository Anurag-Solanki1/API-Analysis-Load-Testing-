import React from "react";
import { cn } from "@/lib/utils";

/**
 * DotPattern — Magic UI subtle dot background overlay.
 */
interface DotPatternProps {
  className?: string;
  cx?: number;
  cy?: number;
  cr?: number;
  width?: number;
  height?: number;
}

const DotPattern: React.FC<DotPatternProps> = ({
  className,
  width = 16,
  height = 16,
  cx = 1,
  cy = 1,
  cr = 1,
}) => {
  const id = React.useId();
  return (
    <svg
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full fill-white/[0.04]",
        className,
      )}
    >
      <defs>
        <pattern
          id={id}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
          patternContentUnits="userSpaceOnUse"
        >
          <circle cx={cx} cy={cy} r={cr} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
};

export default DotPattern;
