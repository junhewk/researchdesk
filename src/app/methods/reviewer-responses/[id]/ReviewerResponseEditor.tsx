"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ReviewerResponseItem } from "@/server/types";

interface Props {
  responseId: string;
  items: ReviewerResponseItem[];
  compiled: boolean;
  manuscriptId: string;
}

interface RowProps {
  item: ReviewerResponseItem;
  responseId: string;
  onSaved: () => void;
}

function Row({ item, responseId, onSaved }: RowProps) {
  const [response, setResponse] = useState(item.response_md ?? "");
  const [pointer, setPointer] = useState(item.change_pointer_md ?? "");
  const [busy, startTransition] = useTransition();

  const save = (status?: "drafting" | "accepted" | "declined") => {
    startTransition(async () => {
      await fetch(`/api/reviewer-responses/${responseId}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response_md: response,
          change_pointer_md: pointer,
          status,
        }),
      });
      onSaved();
    });
  };

  return (
    <li className="py-5">
      <blockquote className="mb-3 border-l-2 border-[color:var(--color-outline-variant)] pl-3 text-[13px] italic text-[color:var(--color-on-surface-variant)] whitespace-pre-wrap">
        {item.comment_excerpt}
      </blockquote>
      <div className="space-y-2">
        <input
          type="text"
          value={pointer}
          onChange={(e) => setPointer(e.target.value)}
          placeholder="Change pointer (e.g. §3.2, p. 7 lines 14-22)"
          className="w-full text-[12px] font-mono border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-2 py-1"
        />
        <textarea
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="Drafted response. Acknowledge the concern, state what you changed, give the rationale."
          rows={5}
          className="w-full text-[13px] border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-2 py-1.5 resize-y"
        />
      </div>
      <div className="mt-2 flex gap-2 flex-wrap items-center">
        <span className="text-[11px] font-mono uppercase text-[color:var(--color-on-surface-variant)]">
          {item.status}
        </span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => save("drafting")}
            disabled={busy}
            className="text-[11px] font-mono uppercase tracking-wide border border-[color:var(--color-outline-variant)] px-2 py-0.5 hover:bg-[color:var(--color-surface-container)]"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => save("accepted")}
            disabled={busy}
            className="text-[11px] font-mono uppercase tracking-wide bg-[color:var(--color-secondary)] text-[color:var(--color-on-secondary)] px-2 py-0.5"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => save("declined")}
            disabled={busy}
            className="text-[11px] font-mono uppercase tracking-wide border border-[color:var(--color-outline-variant)] px-2 py-0.5"
          >
            Decline
          </button>
        </div>
      </div>
    </li>
  );
}

export function ReviewerResponseEditor({
  responseId,
  items,
  compiled,
  manuscriptId,
}: Props) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const refresh = () => router.refresh();

  const compile = () => {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/reviewer-responses/${responseId}/compile`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `failed (${res.status})`);
        return;
      }
      refresh();
    });
  };

  if (items.length === 0) {
    return (
      <p className="text-[13px] text-[color:var(--color-on-surface-variant)] italic">
        No items yet. The seeder reads reviewer reports and decision letters
        via the letters API — upload one to seed items.
      </p>
    );
  }

  return (
    <div>
      <ul className="divide-y divide-[color:var(--color-outline-variant)] border-t border-[color:var(--color-outline-variant)]">
        {items.map((it) => (
          <Row
            key={it.id}
            item={it}
            responseId={responseId}
            onSaved={refresh}
          />
        ))}
      </ul>

      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          onClick={compile}
          disabled={busy}
          className="inline-flex items-center justify-center rounded bg-[color:var(--color-primary)] px-4 py-2 text-[13px] font-medium text-[color:var(--color-on-primary)] hover:bg-[color:var(--color-primary-container)] disabled:opacity-40 transition-colors"
        >
          {compiled ? "Re-compile letter" : "Compile to response letter"}
        </button>
        {compiled && (
          <a
            href={`/my-articles/${manuscriptId}/workspace`}
            className="text-[12px] underline underline-offset-2"
          >
            View attached asset →
          </a>
        )}
        {error && (
          <span className="text-[11px] text-[color:var(--color-error)]">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
