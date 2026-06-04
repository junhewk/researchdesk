"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { CATEGORY_STYLES, REVISION_STATUS_STYLES } from "@/lib/styles";

interface Suggestion {
  id?: string;
  commentary_id?: string;
  category: "mechanical" | "rewrite";
  suggestion: string;
  revised_text?: string;
  status?: string;
}

interface SuggestionListProps {
  suggestions: Suggestion[];
  onApply?: (suggestion: Suggestion) => void;
  onDismiss?: (suggestion: Suggestion) => void;
  onOverrideCategory?: (suggestion: Suggestion, newCategory: "mechanical" | "rewrite") => void;
}

export function SuggestionList({ suggestions, onApply, onDismiss, onOverrideCategory }: SuggestionListProps) {
  if (suggestions.length === 0) {
    return (
      <p className="py-4 text-[13px] text-[color:var(--color-sepia)] italic font-display">
        None yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[color:var(--color-rule)] border-t border-[color:var(--color-rule)]">
      {suggestions.map((s, i) => (
        <SuggestionItem
          key={s.id || i}
          suggestion={s}
          onApply={onApply}
          onDismiss={onDismiss}
          onOverrideCategory={onOverrideCategory}
        />
      ))}
    </ul>
  );
}

function SuggestionItem({
  suggestion,
  onApply,
  onDismiss,
  onOverrideCategory,
}: {
  suggestion: Suggestion;
  onApply?: (s: Suggestion) => void;
  onDismiss?: (s: Suggestion) => void;
  onOverrideCategory?: (s: Suggestion, cat: "mechanical" | "rewrite") => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const otherCategory = suggestion.category === "mechanical" ? "rewrite" : "mechanical";

  return (
    <li className="py-4">
      <div className="flex items-center gap-2 mb-1.5 text-[10px]">
        <span className={cn("px-1.5 py-0.5 tracking-wide uppercase font-mono", CATEGORY_STYLES[suggestion.category])}>
          {suggestion.category}
        </span>
        {suggestion.status && (
          <span className={cn("px-1.5 py-0.5 tracking-wide uppercase font-mono", REVISION_STATUS_STYLES[suggestion.status] || "")}>
            {suggestion.status}
          </span>
        )}
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-auto text-[color:var(--color-sepia)] hover:text-[color:var(--color-ink)]"
        >
          {expanded ? "−" : "+"}
        </button>
      </div>
      <p className={cn("text-[13px] leading-relaxed text-[color:var(--color-ink)]", !expanded && "line-clamp-3")}>
        {suggestion.suggestion}
      </p>
      {expanded && suggestion.revised_text && (
        <pre className="mt-2 pl-3 border-l border-[color:var(--color-redink)] font-mono text-[11px] text-[color:var(--color-ink-soft)] whitespace-pre-wrap">
          {suggestion.revised_text}
        </pre>
      )}
      {expanded && (
        <div className="mt-3 flex gap-4 text-[11px]">
          {onApply && suggestion.status !== "applied" && (
            <button onClick={() => onApply(suggestion)} className="text-[color:var(--color-ok)] hover:underline">
              Apply
            </button>
          )}
          {onDismiss && suggestion.status !== "dismissed" && (
            <button onClick={() => onDismiss(suggestion)} className="text-[color:var(--color-redink)] hover:underline">
              Dismiss
            </button>
          )}
          {onOverrideCategory && (
            <button
              onClick={() => onOverrideCategory(suggestion, otherCategory)}
              className="text-[color:var(--color-sepia)] hover:text-[color:var(--color-ink)]"
            >
              Reclassify as {otherCategory}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
