"use client";

import { useEffect, useRef, useState } from "react";

interface DiagramProps {
  source: string;
  id?: string;
}

export function Diagram({ source, id }: DiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const elementId = useRef(
    id ?? `mermaid-${Math.random().toString(36).slice(2, 10)}`,
  );

  useEffect(() => {
    let cancelled = false;
    async function render() {
      const target = containerRef.current;
      if (!target) return;

      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          securityLevel: "strict",
          fontFamily: "var(--font-body), serif",
        });
        const { svg } = await mermaid.render(elementId.current, source);
        if (cancelled) return;
        target.innerHTML = svg;
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Diagram parse error");
      }
    }
    render();
    return () => {
      cancelled = true;
    };
  }, [source]);

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-display italic text-[color:var(--color-redink)]">
          Diagram parse error: {error}
        </p>
        <pre className="font-mono text-[11px] text-[color:var(--color-sepia)] whitespace-pre-wrap pl-3 border-l border-[color:var(--color-rule)]">
          {source}
        </pre>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="overflow-x-auto" />
  );
}
