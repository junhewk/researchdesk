"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useEventStream } from "@/lib/hooks/useEventStream";
import { MessageBlock } from "@/components/MessageBlock";
import { StatusPill } from "@/components/StatusPill";
import { ActivityDrawer, type ActivityEntry } from "@/components/ActivityDrawer";
import {
  PlanCard,
  FileEditCard,
  FileSearchCard,
  type StreamCardEntry,
} from "@/components/StreamCards";
import {
  isFileEditTool,
  isFileSearchTool,
  isPlanTool,
  isShellTool,
  routeToolBlock,
  summarizeFileEditInput,
  summarizeFileSearchInput,
  summarizeSearchResultText,
  summarizeShellInput,
} from "@/lib/streamRouting";
import type {
  SupervisorEvent,
  AgentEvent,
  AgentMessageBlock,
  SessionStatus,
  Workflow,
} from "@/server/types";

interface DisplayItem {
  id: string;
  kind:
    | "user"
    | "assistant"
    | "plan"
    | "file_edit"
    | "file_search"
    | "shell";
  payload: unknown;
}

interface SessionStreamProps {
  sessionId: string;
  workflow?: Workflow;
  onSuggestionCreated?: (data: unknown) => void;
  onStatusChange?: (status: SessionStatus) => void;
  onTurnComplete?: () => void;
  onFileEdit?: (entry: {
    path: string;
    insertions: number;
    deletions: number;
    tool: string;
    pending: boolean;
    isError: boolean;
  }) => void;
}

function textFromBlock(block: AgentMessageBlock): string {
  const text = block.text;
  const thinking = block.thinking;
  if (typeof text === "string") return text;
  if (typeof thinking === "string") return thinking;
  return "";
}

function hasVisibleDialogue(block: AgentMessageBlock): boolean {
  return (
    (block.type === "text" || block.type === "thinking") &&
    textFromBlock(block).trim().length > 0
  );
}

function assistantDialogueBlocksOf(blocks: AgentMessageBlock[]): AgentMessageBlock[] {
  return blocks.filter((b) => hasVisibleDialogue(b));
}

function userDialogueBlocksOf(blocks: AgentMessageBlock[]): AgentMessageBlock[] {
  return blocks.filter((b) => b.type === "text" && textFromBlock(b).trim().length > 0);
}

function toolUseBlocksOf(blocks: AgentMessageBlock[]): AgentMessageBlock[] {
  return blocks.filter((b) => b.type === "tool_use");
}

function toolResultBlocksOf(blocks: AgentMessageBlock[]): AgentMessageBlock[] {
  return blocks.filter((b) => b.type === "tool_result" && typeof b.tool_use_id === "string");
}

function isErrorBlock(block: AgentMessageBlock): boolean {
  return Boolean(block.is_error ?? block.isError);
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function SessionStream({
  sessionId,
  workflow = "review",
  onSuggestionCreated,
  onStatusChange,
  onTurnComplete,
  onFileEdit,
}: SessionStreamProps) {
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [status, setStatus] = useState<SessionStatus>("new");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const counter = useRef(0);
  // tool_use_id -> last seen card id, used to attach diff/results in place.
  const cardIdById = useRef(new Map<string, string>());

  const upsertActivity = useCallback((entry: ActivityEntry) => {
    setActivity((prev) => {
      const idx = prev.findIndex((a) => a.id === entry.id);
      if (idx === -1) return [...prev, entry];
      const next = [...prev];
      next[idx] = { ...next[idx], ...entry };
      return next;
    });
  }, []);

  const attachActivityResult = useCallback(
    (toolUseId: string, content: unknown, isError: boolean) => {
      setActivity((prev) => {
        const idx = prev.findIndex((a) => a.id === toolUseId);
        if (idx === -1) {
          return [
            ...prev,
            {
              id: toolUseId,
              name: "(unknown)",
              input: undefined,
              result: content,
              isError,
              pending: false,
            },
          ];
        }
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          result: content,
          isError,
          pending: false,
        };
        return next;
      });
    },
    [],
  );

  const handleToolUse = useCallback(
    (
      toolUseId: string,
      name: string,
      input: unknown,
    ) => {
      const lane = routeToolBlock(name, workflow);

      if (lane === "primary") {
        if (isPlanTool(name)) {
          const todos = (input as { todos?: Array<{ content: string; status: string }> })
            ?.todos ?? [];
          setItems((prev) => {
            // Plan updates in place: find an existing plan item and replace, or append.
            const idx = prev.findIndex((it) => it.kind === "plan");
            const planItem: DisplayItem = {
              id: idx >= 0 ? prev[idx].id : `plan-${counter.current++}`,
              kind: "plan",
              payload: { todos },
            };
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = planItem;
              return next;
            }
            return [...prev, planItem];
          });
          return;
        }
        if (isFileEditTool(name)) {
          const summary = summarizeFileEditInput(name, input);
          const cardId = `${toolUseId}-edit-${counter.current++}`;
          cardIdById.current.set(toolUseId, cardId);
          const entry: StreamCardEntry = {
            kind: "file_edit",
            id: cardId,
            tool: name,
            path: summary.path,
            insertions: summary.insertions,
            deletions: summary.deletions,
            diff: summary.diff,
            pending: true,
          };
          setItems((prev) => [...prev, { id: cardId, kind: "file_edit", payload: entry }]);
          onFileEdit?.({
            path: summary.path,
            insertions: summary.insertions,
            deletions: summary.deletions,
            tool: name,
            pending: true,
            isError: false,
          });
          return;
        }
        if (isFileSearchTool(name)) {
          const summary = summarizeFileSearchInput(name, input);
          const cardId = `${toolUseId}-search-${counter.current++}`;
          cardIdById.current.set(toolUseId, cardId);
          const entry: StreamCardEntry = {
            kind: "file_search",
            id: cardId,
            tool: name,
            pattern: summary.pattern,
            summary: "",
            pending: true,
          };
          setItems((prev) => [...prev, { id: cardId, kind: "file_search", payload: entry }]);
          return;
        }
        if (isShellTool(name)) {
          const summary = summarizeShellInput(input);
          const cardId = `${toolUseId}-shell-${counter.current++}`;
          cardIdById.current.set(toolUseId, cardId);
          const entry: StreamCardEntry = {
            kind: "file_search",
            id: cardId,
            tool: "shell",
            pattern: summary.command,
            summary: "",
            pending: true,
          };
          setItems((prev) => [...prev, { id: cardId, kind: "file_search", payload: entry }]);
          return;
        }
      }

      // Drawer fallback for non-primary tool calls.
      upsertActivity({
        id: toolUseId,
        name,
        input,
        pending: true,
      });
    },
    [workflow, upsertActivity, onFileEdit],
  );

  const handleToolResult = useCallback(
    (toolUseId: string, content: unknown, isError: boolean) => {
      const cardId = cardIdById.current.get(toolUseId);
      if (cardId) {
        setItems((prev) =>
          prev.map((it) => {
            if (it.id !== cardId) return it;
            if (it.kind === "file_edit") {
              const payload = it.payload as Extract<StreamCardEntry, { kind: "file_edit" }>;
              const updated: Extract<StreamCardEntry, { kind: "file_edit" }> = {
                ...payload,
                pending: false,
                isError,
              };
              onFileEdit?.({
                path: payload.path,
                insertions: payload.insertions,
                deletions: payload.deletions,
                tool: payload.tool,
                pending: false,
                isError,
              });
              return { ...it, payload: updated };
            }
            if (it.kind === "file_search") {
              const payload = it.payload as Extract<StreamCardEntry, { kind: "file_search" }>;
              const updated: Extract<StreamCardEntry, { kind: "file_search" }> = {
                ...payload,
                pending: false,
                isError,
                summary: isError ? "error" : summarizeSearchResultText(content),
              };
              return { ...it, payload: updated };
            }
            return it;
          }),
        );
        return;
      }
      attachActivityResult(toolUseId, content, isError);
    },
    [attachActivityResult, onFileEdit],
  );

  // Load existing messages on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        if (data.status) {
          setStatus(data.status);
          onStatusChange?.(data.status);
        }

        if (Array.isArray(data.messages)) {
          for (const m of data.messages as Array<{
            id?: string;
            role: string;
            content_json?: string;
          }>) {
            const parsed: unknown = m.content_json ? safeJsonParse(m.content_json) : "";

            if (m.role === "assistant" && Array.isArray(parsed)) {
              const blocks = parsed as AgentMessageBlock[];
              const visible = assistantDialogueBlocksOf(blocks);
              if (visible.length > 0) {
                setItems((prev) => [
                  ...prev,
                  {
                    id: m.id ?? `loaded-${counter.current++}`,
                    kind: "assistant",
                    payload: visible,
                  },
                ]);
              }
              for (const b of toolUseBlocksOf(blocks)) {
                const toolUseId = (b.id as string | undefined) ?? `loaded-${counter.current++}`;
                handleToolUse(
                  toolUseId,
                  (b.name as string | undefined) ?? "tool",
                  b.input,
                );
                if (
                  onSuggestionCreated &&
                  (b.name === "create_suggestion" || b.name === "create_review_item")
                ) {
                  onSuggestionCreated(b.input);
                }
              }
            } else if (m.role === "user") {
              if (Array.isArray(parsed)) {
                const blocks = parsed as AgentMessageBlock[];
                for (const b of toolResultBlocksOf(blocks)) {
                  handleToolResult(
                    b.tool_use_id as string,
                    b.content,
                    isErrorBlock(b),
                  );
                }
                const visible = userDialogueBlocksOf(blocks);
                if (visible.length > 0) {
                  setItems((prev) => [
                    ...prev,
                    {
                      id: m.id ?? `loaded-${counter.current++}`,
                      kind: "user",
                      payload: visible,
                    },
                  ]);
                }
              } else if (typeof parsed === "string" && parsed.trim().length > 0) {
                setItems((prev) => [
                  ...prev,
                  {
                    id: m.id ?? `loaded-${counter.current++}`,
                    kind: "user",
                    payload: parsed,
                  },
                ]);
              }
            } else if (m.role === "tool_use") {
              const data = parsed as { id?: string; name?: string; input?: unknown };
              const id = data.id ?? `loaded-${counter.current++}`;
              handleToolUse(id, data.name ?? "tool", data.input);
            } else if (m.role === "tool_result") {
              const data = parsed as {
                tool_use_id?: string;
                content?: unknown;
                is_error?: boolean;
              };
              if (data.tool_use_id) {
                handleToolResult(
                  data.tool_use_id,
                  data.content,
                  Boolean(data.is_error),
                );
              }
            }
          }
        }
      } catch {
        // fetch failed; continue with empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId, onStatusChange, onSuggestionCreated, handleToolUse, handleToolResult]);

  const handleEvent = useCallback(
    (event: SupervisorEvent) => {
      if (event.kind === "status_change") {
        const newStatus = (event.payload as { status: SessionStatus }).status;
        setStatus(newStatus);
        onStatusChange?.(newStatus);
        return;
      }

      if (event.kind === "agent_event") {
        const agentEvent = event.payload as AgentEvent;

        if (agentEvent.type === "assistant" || agentEvent.type === "user") {
          const msg = (agentEvent as { message?: { content?: AgentMessageBlock[] } }).message;
          const blocks = msg?.content ?? [];

          if (agentEvent.type === "assistant") {
            const visible = assistantDialogueBlocksOf(blocks);
            if (visible.length > 0) {
              setItems((prev) => [
                ...prev,
                {
                  id: `stream-${counter.current++}`,
                  kind: "assistant",
                  payload: visible,
                },
              ]);
            }
            for (const block of blocks) {
              if (block.type === "tool_use") {
                const toolUseId = (block.id as string | undefined) ?? `stream-${counter.current++}`;
                handleToolUse(
                  toolUseId,
                  (block.name as string | undefined) ?? "tool",
                  block.input,
                );
                if (
                  onSuggestionCreated &&
                  (block.name === "create_suggestion" || block.name === "create_review_item")
                ) {
                  onSuggestionCreated(block.input);
                }
              }
            }
          } else {
            for (const block of toolResultBlocksOf(blocks)) {
              handleToolResult(
                block.tool_use_id as string,
                block.content,
                isErrorBlock(block),
              );
            }
            const visible = userDialogueBlocksOf(blocks);
            if (visible.length > 0) {
              setItems((prev) => [
                ...prev,
                {
                  id: `stream-${counter.current++}`,
                  kind: "user",
                  payload: visible,
                },
              ]);
            }
          }
        }

        if (agentEvent.type === "tool_use") {
          const tu = agentEvent as { id?: string; name?: string; input?: unknown };
          const id = tu.id ?? `stream-${counter.current++}`;
          handleToolUse(id, tu.name ?? "tool", tu.input);
          if (
            onSuggestionCreated &&
            (tu.name === "create_suggestion" || tu.name === "create_review_item")
          ) {
            onSuggestionCreated(tu.input);
          }
        }

        if (agentEvent.type === "tool_result") {
          const tr = agentEvent as {
            tool_use_id?: string;
            content?: unknown;
            is_error?: boolean;
          };
          if (tr.tool_use_id) {
            handleToolResult(tr.tool_use_id, tr.content, Boolean(tr.is_error));
          }
        }

        if (agentEvent.type === "result") {
          setStatus("idle");
          onStatusChange?.("idle");
          onTurnComplete?.();
        }
      }
    },
    [onSuggestionCreated, onStatusChange, onTurnComplete, handleToolUse, handleToolResult],
  );

  useEventStream({ sessionId, onEvent: handleEvent });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [items]);

  if (loading) {
    return (
      <div className="py-12 text-center text-[14px] text-[color:var(--color-sepia)]">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 pb-3 mb-3 border-b border-[color:var(--color-rule)]">
        <StatusPill status={status} />
        <span className="font-mono text-[10px] text-[color:var(--color-sepia)] tabular">
          {items.filter((i) => i.kind === "user" || i.kind === "assistant").length} turn
          {items.filter((i) => i.kind === "user" || i.kind === "assistant").length !== 1 ? "s" : ""}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="py-12 text-center font-display italic text-[15px] text-[color:var(--color-sepia)]">
            Awaiting input.
          </p>
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              if (item.kind === "user" || item.kind === "assistant") {
                return (
                  <MessageBlock
                    key={item.id}
                    role={item.kind}
                    content={item.payload}
                  />
                );
              }
              if (item.kind === "plan") {
                const todos = (item.payload as { todos: Array<{ content: string; status: string }> }).todos;
                return <PlanCard key={item.id} todos={todos} />;
              }
              if (item.kind === "file_edit") {
                return (
                  <FileEditCard
                    key={item.id}
                    entry={item.payload as Extract<StreamCardEntry, { kind: "file_edit" }>}
                  />
                );
              }
              if (item.kind === "file_search") {
                return (
                  <FileSearchCard
                    key={item.id}
                    entry={item.payload as Extract<StreamCardEntry, { kind: "file_search" }>}
                  />
                );
              }
              return null;
            })}
          </div>
        )}
      </div>

      <ActivityDrawer entries={activity} />
    </div>
  );
}
