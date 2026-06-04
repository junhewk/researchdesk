"use client";

import type { AgentEffort, Provider } from "@/server/types";
import {
  effortOptionsForProvider,
  modelOptionsForProvider,
  type AgentEffortInput,
} from "@/lib/agentChoices";

interface AgentModelEffortPickerProps {
  provider: Provider;
  model: string;
  effort: AgentEffortInput;
  onModelChange: (model: string) => void;
  onEffortChange: (effort: AgentEffortInput) => void;
  disabled?: boolean;
}

export function AgentModelEffortPicker({
  provider,
  model,
  effort,
  onModelChange,
  onEffortChange,
  disabled = false,
}: AgentModelEffortPickerProps) {
  const modelOptions = modelOptionsForProvider(provider);
  const effortOptions = effortOptionsForProvider(provider);
  const controlClass =
    "w-full bg-transparent border-0 border-b border-[color:var(--color-rule)] py-1 text-[12px] font-mono text-[color:var(--color-ink)] focus:outline-none focus:border-[color:var(--color-ink)] disabled:opacity-40";

  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block">
        <span className="label block mb-1">Model</span>
        <select
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={disabled}
          className={controlClass}
        >
          {modelOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="label block mb-1">Effort</span>
        <select
          value={effort}
          onChange={(e) => onEffortChange(e.target.value as AgentEffort | "")}
          disabled={disabled}
          className={controlClass}
        >
          {effortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
