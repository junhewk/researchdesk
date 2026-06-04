"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownTextProps {
  text: string;
  compact?: boolean;
  muted?: boolean;
}

export function MarkdownText({ text, compact, muted }: MarkdownTextProps) {
  return (
    <div
      className={`space-y-2 ${compact ? "text-[12px]" : "text-[14px]"} ${
        muted ? "text-[color:var(--color-sepia)]" : "text-[color:var(--color-ink)]"
      }`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-3 mb-1 font-display text-[20px] leading-tight">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-3 mb-1 font-display text-[17px] leading-tight">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-2.5 mb-1 font-display text-[15px] leading-tight">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="whitespace-pre-wrap leading-[1.65]">{children}</p>
          ),
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-[1.6]">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l border-[color:var(--color-rule)] pl-3 italic text-[color:var(--color-sepia)]">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const inline = !className;
            if (inline) {
              return (
                <code className="rounded-[2px] bg-[color:var(--color-paper-2)] px-1 py-0.5 font-mono text-[0.92em]">
                  {children}
                </code>
              );
            }
            return <code className={`${className} font-mono text-[11px]`}>{children}</code>;
          },
          pre: ({ children }) => (
            <pre className="overflow-x-auto border border-[color:var(--color-rule)] bg-[color:var(--color-paper-2)] p-3 font-mono text-[11px] leading-relaxed">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse font-mono text-[11px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-[color:var(--color-rule)] bg-[color:var(--color-paper-2)] px-2 py-1 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-[color:var(--color-rule)] px-2 py-1 align-top">{children}</td>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-[color:var(--color-redink)]"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="border-[color:var(--color-rule)]" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
