import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * NumberTicker — Magic UI animated number counter.
 * Animates from 0 to the given value on mount.
 */
interface NumberTickerProps {
  value: number | string;
  className?: string;
  duration?: number;
  formatOptions?: Intl.NumberFormatOptions;
}

const NumberTicker: React.FC<NumberTickerProps> = ({
  value,
  className,
  duration = 1.2,
  formatOptions,
}) => {
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  const [display, setDisplay] = React.useState("0");
  const ref = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (isNaN(numValue)) {
      setDisplay(String(value));
      return;
    }

    let start = 0;
    const end = numValue;
    const startTime = performance.now();
    const durationMs = duration * 1000;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (end - start) * eased);
      setDisplay(
        formatOptions
          ? new Intl.NumberFormat(undefined, formatOptions).format(current)
          : current.toLocaleString(),
      );
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    requestAnimationFrame(step);
  }, [numValue, duration]);

  return (
    <motion.span
      ref={ref}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn("tabular-nums", className)}
    >
      {display}
    </motion.span>
  );
};

export default NumberTicker;
