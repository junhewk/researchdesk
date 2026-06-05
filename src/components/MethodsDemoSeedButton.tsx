"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Loader2 } from "lucide-react";

interface MethodsDemoSeedResponse {
  studyId: string;
  created: boolean;
  links?: {
    workbenchOverview?: string;
  };
  error?: string;
}

export function MethodsDemoSeedButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seedDemo = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/demo/methods-workbench/seed", {
        method: "POST",
      });
      const data = (await response.json().catch(() => null)) as
        | MethodsDemoSeedResponse
        | null;

      if (!response.ok || !data) {
        throw new Error(data?.error || `Methods demo failed (${response.status})`);
      }

      router.push(data.links?.workbenchOverview ?? `/methods-workbench/${data.studyId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Methods demo failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={seedDemo}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-4 py-2.5 text-[14px] font-medium text-[color:var(--color-on-surface)] transition-colors hover:border-[color:var(--color-outline)] hover:bg-[color:var(--color-surface-container-low)] disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
        ) : (
          <Database className="h-4 w-4" strokeWidth={2} />
        )}
        {loading ? "Seeding..." : "Seed Methods Demo"}
      </button>
      {error && (
        <span className="max-w-[240px] text-right text-[11px] leading-snug text-[color:var(--color-error)]">
          {error}
        </span>
      )}
    </div>
  );
}
