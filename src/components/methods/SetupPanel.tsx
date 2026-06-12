"use client";

import Link from "next/link";
import { useState } from "react";
import { ProviderHealthPanel } from "@/components/ProviderHealthPanel";

const STORAGE_KEY = "reviewer.methods.setup.v1";

/**
 * First-run orientation for the Methods Workbench: what the AI needs to run,
 * whether it's working right now, and how a study flows. Dismissible; reopens
 * from the "Setup & how it works" link.
 */
export function SetupPanel() {
  // Lazy init from localStorage (same pattern as the local-provider picker):
  // SSR renders the collapsed link; the client corrects it on hydration.
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(STORAGE_KEY) !== "dismissed";
    } catch {
      return true;
    }
  });

  function dismiss() {
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "dismissed");
    } catch {
      /* ignore */
    }
  }

  if (!open) {
    return (
      <div className="mb-8 text-right">
        <button
          onClick={() => setOpen(true)}
          className="text-[11px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-redink)]"
        >
          Setup &amp; how it works ▸
        </button>
      </div>
    );
  }

  return (
    <section className="mb-12 border-y-2 border-[color:var(--color-ink)] py-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="label">Before you start</h2>
        <button
          onClick={dismiss}
          className="text-[11px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-redink)]"
        >
          Dismiss — I&apos;m set up
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-5">
          <div>
            <h3 className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--color-on-surface-variant)] mb-1.5">
              ① How the assistant runs
            </h3>
            <p className="text-[13px] leading-relaxed">
              The workbench uses an AI assistant to propose design options,
              read your notes, and check for methodological risks.{" "}
              <strong>Cloud</strong> (OpenAI, Gemini, DeepSeek) is easiest —
              it needs an API key, and study text leaves your computer.{" "}
              <strong>Local</strong> (Ollama, LM Studio) is private and free —
              it needs one of those apps installed. Mark a study{" "}
              <em>private</em> when you create it to force everything local.
            </p>
          </div>
          <div>
            <h3 className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--color-on-surface-variant)] mb-1.5">
              ② How a study works here
            </h3>
            <ol className="text-[13px] leading-relaxed space-y-1.5 list-none">
              <li>
                <span className="font-mono text-[11px]">1.</span> Start a study
                — a working title, your question, and the study type.
              </li>
              <li>
                <span className="font-mono text-[11px]">2.</span> Paste your
                background notes as evidence — the assistant turns them into
                items you can attach to decisions.
              </li>
              <li>
                <span className="font-mono text-[11px]">3.</span> Work through
                the decision cards. Ask for options whenever you&apos;re unsure
                — the assistant proposes, you decide.
              </li>
              <li>
                <span className="font-mono text-[11px]">4.</span> Export the
                protocol, analysis plan, and reporting checklist — they compile
                themselves from your decisions.
              </li>
            </ol>
            <p className="mt-3">
              <Link
                href="/methods-workbench/new"
                className="text-[13px] underline underline-offset-4 hover:text-[color:var(--color-redink)]"
              >
                Start a study →
              </Link>
            </p>
          </div>
        </div>

        <div>
          <ProviderHealthPanel compact />
          <p className="mt-2 text-[11px] text-[color:var(--color-on-surface-variant)]">
            At least one ✓ is enough to use the assistant.{" "}
            <Link href="/settings" className="underline underline-offset-2">
              Configuration details are in Settings.
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
