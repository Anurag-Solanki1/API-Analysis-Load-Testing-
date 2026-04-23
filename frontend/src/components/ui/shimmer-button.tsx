import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * ShimmerButton — Magic UI button with animated shimmer/glow effect.
 */
interface ShimmerButtonProps {
  children: React.ReactNode;
  shimmerColor?: string;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}

const ShimmerButton = React.forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  (
    { children, shimmerColor = "rgba(99,102,241,0.3)", className, ...props },
    ref,
  ) => (
    <motion.button
      ref={ref}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-lg border border-white/10 bg-surface-card px-5 py-2.5 text-sm font-semibold text-txt-primary shadow-md transition-colors hover:border-white/20",
        className,
      )}
      {...props}
    >
      {/* Shimmer sweep */}
      <div className="absolute inset-0 -translate-x-full animate-shimmer-slide bg-gradient-to-r from-transparent via-white/[0.06] to-transparent group-hover:duration-1000" />
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </motion.button>
  ),
);

ShimmerButton.displayName = "ShimmerButton";

export default ShimmerButton;
