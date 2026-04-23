import React from "react";
import { cn } from "@/lib/utils";

/**
 * PageHeader — Shared gradient page title with subtitle.
 * Replaces repeated inline-styled page headers across all pages.
 */
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  className?: string;
  gradient?: string;
  children?: React.ReactNode;
}

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  className,
  gradient = "from-slate-200 to-indigo-400",
  children,
}) => (
  <div className={cn("mb-8", className)}>
    <h2 className="mb-1 text-[1.6rem] font-extrabold tracking-tight">
      <span
        className={cn(
          "bg-gradient-to-br bg-clip-text text-transparent",
          gradient,
        )}
      >
        {title}
      </span>
    </h2>
    {subtitle && <p className="text-sm text-txt-muted">{subtitle}</p>}
    {children}
  </div>
);

export default PageHeader;
