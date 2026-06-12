import { EventEmitter } from "events";
import type { AgentEffort, AgentEvent, Provider, Workflow, ToolDefinition } from "./types";

export interface StartOptions {
  workflow: Workflow;
  manuscriptId: string;
  systemPrompt: string;
  tools: ToolDefinition[];
  resumeSessionId?: string | null;
  model?: string | null;
  effort?: AgentEffort | null;
  initialMessage?: string;
  cwd?: string;
  /** Methods-pass context (workflow "methods"): which structured study pass
   * to run, plus its target. manuscriptId carries the study id. */
  pass?: "card_proposal" | "evidence_extraction" | "preflight_risk";
  targetCardType?: string;
  snapshotId?: string;
}

export interface AgentProcessEvents {
  event: (ev: AgentEvent) => void;
  stderr: (line: string) => void;
  exit: (info: { code: number | null; signal: NodeJS.Signals | null }) => void;
  error: (err: Error) => void;
}

export interface AgentProcess extends EventEmitter {
  start(opts: StartOptions): void;
  readonly currentSessionId: string | null;
  readonly isAlive: boolean;
  writeUserMessage(content: string): void;
  writeToolResult(toolUseId: string, result: unknown): void;
  writeControlResponse(requestId: string, body: { behavior: string; [k: string]: unknown }): void;
  interrupt(): Promise<void>;
  shutdown(): Promise<void>;
}

export function providerSupportsWorkflow(
  provider: Provider,
  workflow: Workflow,
): boolean {
  void provider;
  if (workflow === "revision") return false;
  return true;
}

export async function createAgentProcess(
  provider: Provider,
  sessionId: string,
): Promise<AgentProcess> {
  const { ApiAgentProcess } = await import("./apiAgent/process");
  return new ApiAgentProcess(sessionId, provider);
}
