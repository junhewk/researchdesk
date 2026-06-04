import type { AgentEffort, Provider, Session } from "@/server/types";

export type AgentEffortInput = AgentEffort | "";

export interface AgentChoiceOption<T extends string> {
  value: T;
  label: string;
  detail?: string;
}

const API_MODEL_OPTIONS: Array<AgentChoiceOption<string>> = [
  { value: "", label: "default", detail: "use provider default" },
];

const API_EFFORT_OPTIONS: Array<AgentChoiceOption<AgentEffortInput>> = [
  { value: "", label: "default", detail: "not used by API providers" },
];

export function modelOptionsForProvider(
  provider: Provider,
): Array<AgentChoiceOption<string>> {
  void provider;
  return API_MODEL_OPTIONS;
}

export function effortOptionsForProvider(
  provider: Provider,
): Array<AgentChoiceOption<AgentEffortInput>> {
  void provider;
  return API_EFFORT_OPTIONS;
}

export function supportsModelEffort(provider: Provider): boolean {
  void provider;
  return false;
}

export function normalizeModelForProvider(
  provider: Provider,
  model: string,
): string {
  const options = modelOptionsForProvider(provider);
  return options.some((opt) => opt.value === model) ? model : "";
}

export function normalizeEffortForProvider(
  provider: Provider,
  effort: AgentEffortInput,
): AgentEffortInput {
  const options = effortOptionsForProvider(provider);
  return options.some((opt) => opt.value === effort) ? effort : "";
}

export function agentRunLabel(
  input: Pick<Session, "provider" | "model" | "effort">,
): string {
  const parts: string[] = [input.provider];
  if (input.model) parts.push(input.model);
  if (input.effort) parts.push(input.effort);
  return parts.join(" / ");
}
