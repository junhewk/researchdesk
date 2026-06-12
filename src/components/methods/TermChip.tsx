"use client";

import { InfoTip } from "@/components/ui/InfoTip";
import type { TermInfo } from "@/lib/methodsLabels";
import { cn } from "@/lib/utils";

/**
 * Outlined small-caps chip with a plain-language explanation on hover.
 * The single component for decision states, severities, gates, and
 * confidentiality badges across the Methods Workbench.
 */
export function TermChip({
  info,
  styleClass,
  className,
}: {
  info: TermInfo;
  styleClass?: string;
  className?: string;
}) {
  return (
    <InfoTip explain={info.explain} underline={false}>
      <span
        className={cn(
          "px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border",
          styleClass ??
            "text-[color:var(--color-on-surface-variant)] border-[color:var(--color-outline-variant)]",
          className,
        )}
      >
        {info.label}
      </span>
    </InfoTip>
  );
}
