"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

export interface PromptComposerHandle {
  focus: () => void;
}

export interface SlashCommand {
  command: string;
  title: string;
  detail?: string;
}

interface PromptComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  /** If true, Enter submits (Shift+Enter newline). If false, Enter is always a newline. */
  submitOnEnter?: boolean;
  textareaClassName?: string;
  ariaLabel?: string;
  slashCommands?: SlashCommand[];
}

function slashTokenAtCursor(draft: string, caret: number) {
  const pos = Math.max(0, Math.min(caret, draft.length));
  let start = pos;
  while (start > 0 && !/\s/.test(draft[start - 1])) start -= 1;
  if (draft[start] !== "/") return null;
  let end = pos;
  while (end < draft.length && /[A-Za-z-]/.test(draft[end])) end += 1;
  const query = draft.slice(start + 1, pos).toLowerCase();
  return {
    start,
    end,
    query,
    key: `${start}:${end}:${query}`,
  };
}

function replaceDraftRange(
  draft: string,
  start: number,
  end: number,
  replacement: string,
): { value: string; caret: number } {
  const before = draft.slice(0, start);
  const after = draft.slice(end);
  return {
    value: `${before}${replacement}${after}`,
    caret: start + replacement.length,
  };
}

export const PromptComposer = forwardRef<PromptComposerHandle, PromptComposerProps>(
  function PromptComposer(
    {
      value,
      onChange,
      onSubmit,
      placeholder,
      disabled,
      rows = 1,
      submitOnEnter = false,
      textareaClassName,
      ariaLabel,
      slashCommands = [],
    },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [caret, setCaret] = useState(0);
    const [commandSelected, setCommandSelected] = useState(0);
    const [dismissedKey, setDismissedKey] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
    }));

    const slashMatch = useMemo(
      () => (slashCommands.length > 0 ? slashTokenAtCursor(value, caret) : null),
      [slashCommands.length, value, caret],
    );

    const commandResults = useMemo(() => {
      if (!slashMatch) return [];
      const q = slashMatch.query;
      return slashCommands
        .filter((item) => item.command.toLowerCase().slice(1).startsWith(q))
        .slice(0, 8);
    }, [slashCommands, slashMatch]);

    const commandOpen =
      !!slashMatch &&
      commandResults.length > 0 &&
      dismissedKey !== slashMatch.key;

    const boundedSelected =
      commandResults.length > 0
        ? Math.min(commandSelected, commandResults.length - 1)
        : 0;

    // Note: commandSelected is bounded by `boundedSelected` below — when the
    // slash token changes (and thus commandResults shrinks/swaps), the bound
    // clamps stale selection without needing a reset effect.

    const acceptCommand = useCallback(
      (cmd: SlashCommand) => {
        if (!slashMatch) return;
        // Insert command + space, ready for the user to type the rest.
        const replacement = `${cmd.command} `;
        const next = replaceDraftRange(value, slashMatch.start, slashMatch.end, replacement);
        onChange(next.value);
        setDismissedKey(slashMatch.key);
        // Restore caret position after React commits the new value.
        requestAnimationFrame(() => {
          const el = textareaRef.current;
          if (el) {
            el.focus();
            el.setSelectionRange(next.caret, next.caret);
            setCaret(next.caret);
          }
        });
      },
      [onChange, slashMatch, value],
    );

    const onKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (commandOpen) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setCommandSelected((s) => (s + 1) % commandResults.length);
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setCommandSelected(
              (s) => (s - 1 + commandResults.length) % commandResults.length,
            );
            return;
          }
          if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            acceptCommand(commandResults[boundedSelected]);
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            if (slashMatch) setDismissedKey(slashMatch.key);
            return;
          }
        }
        if (submitOnEnter && e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (!disabled) onSubmit?.();
        }
      },
      [
        acceptCommand,
        boundedSelected,
        commandOpen,
        commandResults,
        disabled,
        onSubmit,
        slashMatch,
        submitOnEnter,
      ],
    );

    const syncCaret = useCallback(() => {
      const el = textareaRef.current;
      if (el) setCaret(el.selectionStart);
    }, []);

    return (
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            // After value changes the caret often shifts; sync immediately.
            requestAnimationFrame(syncCaret);
          }}
          onKeyDown={onKeyDown}
          onKeyUp={syncCaret}
          onClick={syncCaret}
          onSelect={syncCaret}
          rows={rows}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className={
            textareaClassName ??
            "w-full min-h-[44px] max-h-[180px] resize-none rounded border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-3 py-2 text-[14px] leading-6 text-[color:var(--color-on-surface)] outline-none focus:border-[color:var(--color-primary)] disabled:opacity-50"
          }
        />
        {commandOpen && slashMatch && (
          <div
            role="listbox"
            className="absolute bottom-full left-0 mb-2 w-full max-w-md rounded border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] shadow-[0_4px_12px_rgba(22,40,57,0.08)]"
          >
            <ul className="py-1">
              {commandResults.map((cmd, i) => {
                const active = i === boundedSelected;
                return (
                  <li key={cmd.command}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        // onMouseDown so we don't lose focus before insertion.
                        e.preventDefault();
                        acceptCommand(cmd);
                      }}
                      onMouseEnter={() => setCommandSelected(i)}
                      className={`flex w-full items-baseline gap-3 px-3 py-2 text-left transition-colors ${
                        active
                          ? "bg-[color:var(--color-surface-container)]"
                          : "hover:bg-[color:var(--color-surface-container-low)]"
                      }`}
                    >
                      <span className="font-mono text-[13px] font-semibold text-[color:var(--color-primary)]">
                        {cmd.command}
                      </span>
                      <span className="flex-1 min-w-0 text-[13px] text-[color:var(--color-on-surface)] truncate">
                        {cmd.title}
                      </span>
                      {cmd.detail && (
                        <span className="hidden sm:inline text-[12px] text-[color:var(--color-on-surface-variant)] truncate">
                          {cmd.detail}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    );
  },
);
