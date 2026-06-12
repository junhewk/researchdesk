"use client";

import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Editorial inline explanation. Wraps any label in a hover/focus tooltip
 * styled to the manuscript aesthetic: hairline ink border, paper surface,
 * no rounding. The trigger gets a dotted underline as the affordance.
 */
export function InfoTip({
  explain,
  children,
  className,
  underline = true,
}: {
  explain: string;
  children: React.ReactNode;
  className?: string;
  underline?: boolean;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className={cn(
              "cursor-help",
              underline &&
                "border-b border-dotted border-[color:var(--color-outline)]",
              className,
            )}
          >
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent
          sideOffset={6}
          className="rounded-none bg-[color:var(--color-surface)] border border-[color:var(--color-ink)] px-2.5 py-1.5 text-[11px] leading-snug max-w-[260px] text-[color:var(--color-on-surface)] shadow-none font-normal normal-case tracking-normal font-sans"
        >
          {explain}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
