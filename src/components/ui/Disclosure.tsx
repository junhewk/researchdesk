"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Editorial progressive-disclosure section. A native `<details>` styled to the
 * manuscript aesthetic: a small-caps mono summary with a hairline rule and a
 * chevron that rotates open — no card fill, no heavy borders. Use it to keep the
 * basics visible and tuck advanced/expert controls behind a click.
 *
 * Native `<details>` means it works without JS, is keyboard-accessible for free,
 * and matches the lightweight `<details>` already used in the workspace.
 */
export function Disclosure({
  summary = "Advanced",
  children,
  defaultOpen = false,
  className,
  summaryClassName,
  contentClassName,
}: {
  /** the always-visible summary line (defaults to "Advanced") */
  summary?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  summaryClassName?: string;
  contentClassName?: string;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn("group border-t border-[color:var(--color-outline-variant)]", className)}
    >
      <summary
        className={cn(
          "label flex cursor-pointer list-none items-center gap-1.5 py-2 marker:hidden select-none",
          "hover:text-[color:var(--color-on-surface)]",
          summaryClassName,
        )}
      >
        <ChevronDown
          className="h-3 w-3 transition-transform group-open:rotate-180"
          strokeWidth={2}
        />
        {summary}
      </summary>
      <div className={cn("pb-3", contentClassName)}>{children}</div>
    </details>
  );
}
