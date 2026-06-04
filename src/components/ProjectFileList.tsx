"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Folder, FolderOpen, RefreshCcw, Upload } from "lucide-react";
import { fetchJson } from "@/lib/api";

interface ProjectInfo {
  project_root: string | null;
  primary_file: string | null;
  is_git: boolean;
  files: Array<{ relative_path: string; size: number; modified_at: number }>;
}

interface ProjectFileListProps {
  manuscriptId: string;
  refreshSignal?: number;
}

const ROLE_BY_PREFIX: Array<{ test: RegExp; role: string }> = [
  { test: /^manuscript([._-]|$)|main([._-]|$)/i, role: "manuscript" },
  { test: /append?ic|appendix|appendi|supp/i, role: "appendix" },
  { test: /\.(png|jpe?g|gif|webp|svg)$/i, role: "figure" },
  { test: /response|reply/i, role: "response" },
  { test: /revision_table|change[_-]?log|changes/i, role: "revision-table" },
  { test: /letter|decision/i, role: "letter" },
];

function inferRole(rel: string): string {
  const base = rel.split("/").pop() ?? rel;
  for (const { test, role } of ROLE_BY_PREFIX) {
    if (test.test(base)) return role;
  }
  return "other";
}

const ROLE_COLOR: Record<string, string> = {
  manuscript: "text-[color:var(--color-redink)]",
  appendix: "text-[color:var(--color-rewrite)]",
  response: "text-[color:var(--color-evidence)]",
  "revision-table": "text-[color:var(--color-mechanical)]",
  letter: "text-[color:var(--color-structural)]",
  figure: "text-[color:var(--color-ok)]",
  other: "text-[color:var(--color-sepia)]",
};

export function ProjectFileList({ manuscriptId, refreshSignal }: ProjectFileListProps) {
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const data = await fetchJson<ProjectInfo>(`/api/manuscripts/${manuscriptId}/project`);
      setInfo(data);
    } catch {
      setInfo(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, [manuscriptId, refreshSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const linkFolder = async () => {
    const path = window.prompt("Absolute path to project folder");
    if (!path) return;
    setLinking(true);
    setLinkError(null);
    try {
      const res = await fetch(`/api/manuscripts/${manuscriptId}/project`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_root: path.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setLinkError(data.error || "link failed");
      } else {
        await reload();
      }
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "link failed");
    } finally {
      setLinking(false);
    }
  };

  const setPrimary = async (path: string) => {
    await fetch(`/api/manuscripts/${manuscriptId}/project`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primary_file: path }),
    });
    await reload();
  };

  const importFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setImporting(true);
    setLinkError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const upload = await fetchJson<{
        original_file: string;
        content_md: string;
      }>("/api/upload", {
        method: "POST",
        body: formData,
      });
      const res = await fetch(`/api/manuscripts/${manuscriptId}/project`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          import_file: {
            filename: upload.original_file || file.name,
            content_md: upload.content_md,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "import failed");
      }
      await reload();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "import failed");
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <div className="text-[12px] text-[color:var(--color-sepia)]">Loading project…</div>
    );
  }

  if (!info?.project_root) {
    return (
      <div className="space-y-2">
        <div className="label">Project folder</div>
        <p className="text-[12px] text-[color:var(--color-sepia)]">
          Not linked. Auto-provision on next save, or link an existing folder now.
        </p>
        <button
          type="button"
          onClick={linkFolder}
          disabled={linking}
          className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] text-[color:var(--color-ink)] border border-[color:var(--color-rule)] hover:border-[color:var(--color-ink)]"
        >
          <Folder className="h-3.5 w-3.5" />
          {linking ? "Linking…" : "Link folder"}
        </button>
        {linkError && (
          <p className="font-mono text-[10px] text-[color:var(--color-redink)]">{linkError}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="label">Project folder</div>
        <span className="font-mono text-[10px] text-[color:var(--color-sepia)] tabular">
          {info.is_git ? "git" : "snapshot"}
        </span>
      </div>
      <div className="font-mono text-[11px] text-[color:var(--color-ink-soft)] break-all">
        {info.project_root}
      </div>
      <div className="flex items-center gap-2">
        <input
          ref={importInputRef}
          type="file"
          accept=".docx,.pdf,.md,.markdown"
          className="hidden"
          onChange={(event) => importFile(event.target.files)}
        />
        <button
          type="button"
          onClick={() => importInputRef.current?.click()}
          disabled={importing}
          title="Add a decision letter, response letter, or supplementary Markdown reference"
          className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] text-[color:var(--color-sepia)] border border-[color:var(--color-rule)] hover:border-[color:var(--color-ink)] hover:text-[color:var(--color-ink)] disabled:opacity-40"
        >
          <Upload className="h-3.5 w-3.5" />
          {importing ? "Adding…" : "Add file"}
        </button>
        <button
          type="button"
          onClick={linkFolder}
          disabled={linking}
          title="Link a different folder"
          className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] text-[color:var(--color-sepia)] border border-[color:var(--color-rule)] hover:border-[color:var(--color-ink)] hover:text-[color:var(--color-ink)]"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Relink
        </button>
        <button
          type="button"
          onClick={reload}
          title="Refresh file list"
          className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] text-[color:var(--color-sepia)] border border-[color:var(--color-rule)] hover:border-[color:var(--color-ink)] hover:text-[color:var(--color-ink)]"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          Reload
        </button>
      </div>

      <div>
        <div className="label mb-2">Files</div>
        <ul className="space-y-1">
          {info.files.length === 0 ? (
            <li className="text-[12px] text-[color:var(--color-sepia)] italic">No .md files.</li>
          ) : (
            info.files.map((f) => {
              const role = inferRole(f.relative_path);
              const isPrimary = f.relative_path === info.primary_file;
              const canBePrimary = /\.(md|markdown)$/i.test(f.relative_path);
              return (
                <li key={f.relative_path} className="flex items-baseline gap-2">
                  <button
                    type="button"
                    onClick={() => canBePrimary && setPrimary(f.relative_path)}
                    disabled={!canBePrimary}
                    title={
                      isPrimary
                        ? "Primary file"
                        : canBePrimary
                          ? "Set as primary"
                          : "Reference file"
                    }
                    className={`flex-1 text-left font-mono text-[11px] truncate ${
                      isPrimary
                        ? "text-[color:var(--color-ink)] font-bold"
                        : canBePrimary
                          ? "text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]"
                          : "text-[color:var(--color-sepia)]"
                    }`}
                  >
                    {f.relative_path}
                  </button>
                  <span className={`font-mono text-[10px] uppercase tracking-wide ${ROLE_COLOR[role]}`}>
                    {role}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      </div>
      {linkError && (
        <p className="font-mono text-[10px] text-[color:var(--color-redink)]">{linkError}</p>
      )}
    </div>
  );
}

export function projectFileLink(_manuscriptId: string): string | null {
  void _manuscriptId;
  return null;
}

export { ExternalLink };
