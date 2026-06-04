"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import {
  acceptAllChanges,
  rejectAllChanges,
  countChanges,
} from "@/lib/changeMarkers";
import { changeMarkerHighlight } from "./ChangeMarkerPlugin";

interface RevisionEditorProps {
  initialContent: string;
  onSave?: (content: string) => void;
  readOnly?: boolean;
}

export function RevisionEditor({ initialContent, onSave, readOnly }: RevisionEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [changeCount, setChangeCount] = useState(() => countChanges(initialContent));

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        markdown(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        changeMarkerHighlight,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            setChangeCount(countChanges(update.state.doc.toString()));
          }
        }),
        ...(readOnly ? [EditorState.readOnly.of(true)] : []),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [initialContent, readOnly]);

  const getContent = useCallback(() => {
    return viewRef.current?.state.doc.toString() ?? initialContent;
  }, [initialContent]);

  const replaceContent = useCallback((newContent: string) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: newContent },
    });
  }, []);

  const handleAcceptAll = () => {
    const content = getContent();
    replaceContent(acceptAllChanges(content));
  };

  const handleRejectAll = () => {
    const content = getContent();
    replaceContent(rejectAllChanges(content));
  };

  const handleSave = () => {
    onSave?.(getContent());
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-[color:var(--color-rule)] px-4 py-2 text-[11px]">
        <span className="text-[color:var(--color-sepia)] font-mono tabular">
          {changeCount} mark{changeCount !== 1 ? "s" : ""}
        </span>
        <button
          onClick={handleAcceptAll}
          disabled={changeCount === 0}
          className="text-[color:var(--color-ok)] hover:underline disabled:opacity-30 disabled:no-underline"
        >
          Accept all
        </button>
        <button
          onClick={handleRejectAll}
          disabled={changeCount === 0}
          className="text-[color:var(--color-redink)] hover:underline disabled:opacity-30 disabled:no-underline"
        >
          Reject all
        </button>
        {onSave && (
          <button
            onClick={handleSave}
            className="ml-auto px-3 py-1 bg-[color:var(--color-ink)] text-[color:var(--color-paper)] text-[11px] hover:bg-[color:var(--color-redink)] transition-colors"
          >
            Save
          </button>
        )}
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto px-6 py-4" />
    </div>
  );
}
