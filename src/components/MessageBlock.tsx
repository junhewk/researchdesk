"use client";

import { MarkdownText } from "@/components/MarkdownText";
import type { AgentMessageBlock } from "@/server/types";

interface MessageBlockProps {
  role: string;
  content: unknown;
}

function truncate(text: string, max = 300): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

function textFromBlock(block: AgentMessageBlock): string {
  const text = block.text;
  const thinking = block.thinking;
  if (typeof text === "string") return text;
  if (typeof thinking === "string") return thinking;
  return "";
}

function renderAssistantBlocks(blocks: AgentMessageBlock[]) {
  return (
    <div className="space-y-2.5">
      {blocks.map((block, i) => {
        const text = textFromBlock(block);
        if (block.type === "text" && text.trim()) {
          return <MarkdownText key={i} text={text} />;
        }
        if (block.type === "thinking" && text.trim()) {
          return (
            <div key={i} className="pl-3 border-l border-[color:var(--color-rule)] italic text-[12px] text-[color:var(--color-sepia)] leading-relaxed font-display">
              <MarkdownText text={text} compact muted />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function parseContent(content: unknown): AgentMessageBlock[] {
  if (Array.isArray(content)) return content as AgentMessageBlock[];
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed as AgentMessageBlock[];
    } catch { /* not JSON */ }
    return [{ type: "text", text: content }];
  }
  if (content && typeof content === "object") {
    return [content as AgentMessageBlock];
  }
  return [];
}

export function MessageBlock({ role, content }: MessageBlockProps) {
  if (role === "system") {
    const text = typeof content === "string" ? content : JSON.stringify(content);
    return (
      <div className="text-center text-[10px] text-[color:var(--color-sepia)] font-mono py-1">
        {truncate(text, 120)}
      </div>
    );
  }

  if (role === "user") {
    const text =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? (content as AgentMessageBlock[])
            .filter((b) => b.type === "text" && textFromBlock(b).trim())
            .map(textFromBlock)
            .join("\n")
          : JSON.stringify(content);
    if (!text.trim()) return null;
    return (
      <div className="py-1">
        <div className="label mb-1 text-[color:var(--color-ink)]">You</div>
        <MarkdownText text={text} compact />
      </div>
    );
  }

  if (role === "assistant") {
    const blocks = parseContent(content);
    if (
      !blocks.some(
        (b) => (b.type === "text" || b.type === "thinking") && textFromBlock(b).trim(),
      )
    ) return null;
    return (
      <div className="py-1">
        <div className="label mb-1 text-[color:var(--color-redink)]">Agent</div>
        {renderAssistantBlocks(blocks)}
      </div>
    );
  }

  return null;
}
