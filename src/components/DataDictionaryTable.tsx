"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  DataDictionaryField,
  DataDictionaryFieldType,
} from "@/server/types";

interface Props {
  protocolId: string;
  fields: DataDictionaryField[];
  validation: {
    missing_in_dictionary: string[];
    unused_in_sap: string[];
  };
}

const TYPES: DataDictionaryFieldType[] = [
  "int",
  "real",
  "text",
  "date",
  "categorical",
  "boolean",
];

export function DataDictionaryTable({ protocolId, fields, validation }: Props) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    field_name: "",
    label: "",
    data_type: "text" as DataDictionaryFieldType,
    units: "",
    required: false,
  });

  const refresh = () => router.refresh();

  const submit = () => {
    if (!draft.field_name.trim()) return;
    startTransition(async () => {
      await fetch(`/api/protocols/${protocolId}/data-dictionary/fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field_name: draft.field_name.trim(),
          label: draft.label.trim() || null,
          data_type: draft.data_type,
          units: draft.units.trim() || null,
          required: draft.required,
        }),
      });
      setDraft({
        field_name: "",
        label: "",
        data_type: "text",
        units: "",
        required: false,
      });
      setAdding(false);
      refresh();
    });
  };

  const remove = (fid: string) => {
    startTransition(async () => {
      await fetch(`/api/protocols/${protocolId}/data-dictionary/fields/${fid}`, {
        method: "DELETE",
      });
      refresh();
    });
  };

  const patch = (fid: string, body: Partial<DataDictionaryField>) => {
    startTransition(async () => {
      await fetch(`/api/protocols/${protocolId}/data-dictionary/fields/${fid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      refresh();
    });
  };

  return (
    <div>
      {(validation.missing_in_dictionary.length > 0 ||
        validation.unused_in_sap.length > 0) && (
        <div className="mb-6 border-l-2 border-[color:var(--color-tertiary)] bg-[color:var(--color-tertiary-container)] pl-4 py-2 text-[12px]">
          {validation.missing_in_dictionary.length > 0 && (
            <p>
              SAP references{" "}
              <strong>
                {validation.missing_in_dictionary.length} variable
                {validation.missing_in_dictionary.length === 1 ? "" : "s"}
              </strong>{" "}
              not in this dictionary:{" "}
              <span className="font-mono">
                {validation.missing_in_dictionary.join(", ")}
              </span>
            </p>
          )}
          {validation.unused_in_sap.length > 0 && (
            <p className="mt-1">
              Dictionary has{" "}
              <strong>
                {validation.unused_in_sap.length} field
                {validation.unused_in_sap.length === 1 ? "" : "s"}
              </strong>{" "}
              not referenced in the SAP:{" "}
              <span className="font-mono">
                {validation.unused_in_sap.join(", ")}
              </span>
            </p>
          )}
        </div>
      )}

      <table className="w-full text-[12px] border-t border-[color:var(--color-outline-variant)]">
        <thead className="text-[10px] uppercase tracking-wide text-[color:var(--color-on-surface-variant)] font-mono">
          <tr className="border-b border-[color:var(--color-outline-variant)]">
            <th className="text-left py-2 pr-3">field_name</th>
            <th className="text-left py-2 pr-3">label</th>
            <th className="text-left py-2 pr-3">type</th>
            <th className="text-left py-2 pr-3">units</th>
            <th className="text-left py-2 pr-3">req</th>
            <th className="text-left py-2 pr-3"></th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr
              key={f.id}
              className="border-b border-[color:var(--color-outline-variant)] align-top"
            >
              <td className="py-2 pr-3 font-mono">{f.field_name}</td>
              <td className="py-2 pr-3">
                <input
                  defaultValue={f.label ?? ""}
                  onBlur={(e) =>
                    e.target.value !== (f.label ?? "") &&
                    patch(f.id, { label: e.target.value || null })
                  }
                  className="w-full bg-transparent border-b border-[color:var(--color-outline-variant)] py-0.5 focus:outline-none focus:border-[color:var(--color-primary)]"
                />
              </td>
              <td className="py-2 pr-3">
                <select
                  defaultValue={f.data_type}
                  onChange={(e) =>
                    patch(f.id, {
                      data_type: e.target.value as DataDictionaryFieldType,
                    })
                  }
                  className="bg-transparent border border-[color:var(--color-outline-variant)] px-1 py-0.5 font-mono"
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-2 pr-3 font-mono">
                <input
                  defaultValue={f.units ?? ""}
                  onBlur={(e) =>
                    e.target.value !== (f.units ?? "") &&
                    patch(f.id, { units: e.target.value || null })
                  }
                  className="w-20 bg-transparent border-b border-[color:var(--color-outline-variant)] py-0.5 focus:outline-none focus:border-[color:var(--color-primary)]"
                />
              </td>
              <td className="py-2 pr-3">
                <input
                  type="checkbox"
                  defaultChecked={f.required}
                  onChange={(e) =>
                    patch(f.id, { required: e.target.checked })
                  }
                />
              </td>
              <td className="py-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(f.id)}
                  className="text-[10px] uppercase font-mono text-[color:var(--color-error)]"
                >
                  delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {adding ? (
        <div className="mt-4 border border-[color:var(--color-outline-variant)] p-3 space-y-2 text-[12px]">
          <input
            placeholder="field_name (snake_case)"
            value={draft.field_name}
            onChange={(e) =>
              setDraft({ ...draft, field_name: e.target.value })
            }
            className="w-full font-mono border-b border-[color:var(--color-outline-variant)] bg-transparent py-1 focus:outline-none"
          />
          <input
            placeholder="Human-readable label"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            className="w-full border-b border-[color:var(--color-outline-variant)] bg-transparent py-1 focus:outline-none"
          />
          <div className="flex gap-2 items-center">
            <select
              value={draft.data_type}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  data_type: e.target.value as DataDictionaryFieldType,
                })
              }
              className="font-mono border border-[color:var(--color-outline-variant)] px-1 py-0.5"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              placeholder="units"
              value={draft.units}
              onChange={(e) => setDraft({ ...draft, units: e.target.value })}
              className="w-24 font-mono border border-[color:var(--color-outline-variant)] px-1 py-0.5"
            />
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={draft.required}
                onChange={(e) =>
                  setDraft({ ...draft, required: e.target.checked })
                }
              />
              required
            </label>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="ml-auto text-[11px] font-mono uppercase tracking-wide bg-[color:var(--color-primary)] text-[color:var(--color-on-primary)] px-2 py-0.5"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="text-[11px] font-mono uppercase tracking-wide border border-[color:var(--color-outline-variant)] px-2 py-0.5"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-4 text-[11px] font-mono uppercase tracking-wide border border-[color:var(--color-outline-variant)] px-2 py-0.5 hover:bg-[color:var(--color-surface-container)]"
        >
          + Add field
        </button>
      )}
    </div>
  );
}
