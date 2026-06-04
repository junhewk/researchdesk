"use client";

import { useState } from "react";

interface RewritePanelProps {
  originalText: string;
  suggestion: string;
  onSave: (rewrittenText: string) => void;
  onDismiss: () => void;
}

export function RewritePanel({ originalText, suggestion, onSave, onDismiss }: RewritePanelProps) {
  const [rewrittenText, setRewrittenText] = useState(originalText);

  return (
    <div className="flex h-full flex-col p-6 gap-5">
      <div>
        <div className="label mb-1 text-[color:var(--color-rewrite)]">Rewrite</div>
        <h3 className="font-display text-[22px] tracking-tight"
            style={{ fontVariationSettings: "'opsz' 36, 'wght' 420" }}>
          Your revision
        </h3>
      </div>

      <div>
        <div className="label mb-1">Suggestion</div>
        <p className="font-display italic text-[14px] leading-relaxed text-[color:var(--color-ink-soft)] border-l border-[color:var(--color-redink)] pl-3">
          {suggestion}
        </p>
      </div>

      <div>
        <div className="label mb-1">Original</div>
        <p className="text-[13px] leading-relaxed text-[color:var(--color-sepia)] pl-3 border-l border-[color:var(--color-rule)]">
          {originalText}
        </p>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-baseline justify-between mb-1">
          <span className="label">Your rewrite</span>
          <span className="font-mono text-[10px] text-[color:var(--color-sepia)] tabular">
            {rewrittenText.length} chars
          </span>
        </div>
        <textarea
          value={rewrittenText}
          onChange={(e) => setRewrittenText(e.target.value)}
          className="flex-1 min-h-[160px] resize-none bg-transparent border border-[color:var(--color-rule)] px-3 py-2 text-[13px] font-body leading-relaxed focus:outline-none focus:border-[color:var(--color-ink)]"
          placeholder="Compose your revision…"
        />
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => onSave(rewrittenText)}
          className="flex-1 px-4 py-2 bg-[color:var(--color-ink)] text-[color:var(--color-paper)] text-[12px] hover:bg-[color:var(--color-redink)] transition-colors"
        >
          Save rewrite
        </button>
        <button
          onClick={onDismiss}
          className="px-4 py-2 text-[color:var(--color-sepia)] text-[12px] hover:text-[color:var(--color-ink)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
