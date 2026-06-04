import type { Workflow } from "@/server/types";

export type BlockLane = "dialogue" | "drawer" | "primary";

const REVISION_PRIMARY_TOOLS = new Set([
  "Edit",
  "Write",
  "MultiEdit",
  "TodoWrite",
  "Glob",
  "Grep",
  "NotebookEdit",
  "Read",
]);

// Codex-side equivalents: command_execution wraps shell calls (cat/grep/sed),
// which the user expects to see during a revision. The Codex `shell` tool is
// emitted with name "shell".
const REVISION_PRIMARY_TOOLS_CODEX = new Set(["shell"]);

export function routeToolBlock(
  toolName: string,
  workflow: Workflow,
): BlockLane {
  if (workflow !== "revision") return "drawer";
  if (REVISION_PRIMARY_TOOLS.has(toolName)) return "primary";
  if (REVISION_PRIMARY_TOOLS_CODEX.has(toolName)) return "primary";
  return "drawer";
}

export function isFileEditTool(name: string): boolean {
  return name === "Edit" || name === "Write" || name === "MultiEdit";
}

export function isFileSearchTool(name: string): boolean {
  return name === "Glob" || name === "Grep" || name === "Read";
}

export function isPlanTool(name: string): boolean {
  return name === "TodoWrite";
}

export function isShellTool(name: string): boolean {
  return name === "shell" || name === "Bash";
}

interface EditInput {
  file_path?: string;
  filePath?: string;
  path?: string;
  old_string?: string;
  oldString?: string;
  new_string?: string;
  newString?: string;
  content?: string;
  edits?: Array<{ old_string?: string; new_string?: string }>;
}

export function summarizeFileEditInput(
  toolName: string,
  input: unknown,
): { path: string; insertions: number; deletions: number; diff: string } {
  const obj = (input ?? {}) as EditInput;
  const filePath = obj.file_path || obj.filePath || obj.path || "(unknown)";
  let insertions = 0;
  let deletions = 0;
  const hunks: string[] = [];

  const addHunk = (oldText: string, newText: string) => {
    const oldLines = oldText ? oldText.split("\n") : [];
    const newLines = newText ? newText.split("\n") : [];
    deletions += oldLines.length;
    insertions += newLines.length;
    hunks.push(
      [
        ...oldLines.map((l) => `- ${l}`),
        ...newLines.map((l) => `+ ${l}`),
      ].join("\n"),
    );
  };

  if (toolName === "Write" && typeof obj.content === "string") {
    insertions = obj.content.split("\n").length;
    hunks.push(
      obj.content
        .split("\n")
        .map((l) => `+ ${l}`)
        .join("\n"),
    );
  } else if (Array.isArray(obj.edits)) {
    for (const edit of obj.edits) {
      addHunk(edit.old_string ?? "", edit.new_string ?? "");
    }
  } else {
    addHunk(
      obj.old_string ?? obj.oldString ?? "",
      obj.new_string ?? obj.newString ?? "",
    );
  }

  return {
    path: filePath,
    insertions,
    deletions,
    diff: hunks.join("\n\n"),
  };
}

interface SearchInput {
  pattern?: string;
  query?: string;
  glob?: string;
  path?: string;
  file_path?: string;
}

export function summarizeFileSearchInput(
  toolName: string,
  input: unknown,
): { pattern: string } {
  const obj = (input ?? {}) as SearchInput;
  if (toolName === "Read") {
    return { pattern: obj.file_path || obj.path || "(file)" };
  }
  return {
    pattern:
      obj.pattern ||
      obj.query ||
      obj.glob ||
      obj.path ||
      "(query)",
  };
}

interface ShellInput {
  command?: string | string[];
  cmd?: string;
}

export function summarizeShellInput(input: unknown): { command: string } {
  const obj = (input ?? {}) as ShellInput;
  const cmd = obj.command ?? obj.cmd;
  if (Array.isArray(cmd)) return { command: cmd.join(" ") };
  return { command: typeof cmd === "string" ? cmd : "(command)" };
}

export function summarizeSearchResultText(content: unknown): string {
  if (typeof content !== "string") {
    try {
      const text = JSON.stringify(content);
      const matches = text.match(/\\n/g);
      if (matches) return `${matches.length + 1} hits`;
      return "ok";
    } catch {
      return "ok";
    }
  }
  const lines = content.split("\n").filter(Boolean);
  if (lines.length === 0) return "no hits";
  if (lines.length === 1) return "1 hit";
  return `${lines.length} hits`;
}
