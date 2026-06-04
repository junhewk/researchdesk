import {
  ViewPlugin,
  Decoration,
  type DecorationSet,
  EditorView,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

const MARKER_RE = /<!--\s*([\s\S]*?)\s*\/\s*([\s\S]*?)\s*-->/g;

const deletedMark = Decoration.mark({ class: "cm-change-deleted" });
const insertedMark = Decoration.mark({ class: "cm-change-inserted" });
const delimiterMark = Decoration.mark({ class: "cm-change-delimiter" });

class SeparatorWidget extends WidgetType {
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-change-separator";
    span.textContent = " → ";
    return span;
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc.toString();
  let match;

  MARKER_RE.lastIndex = 0;
  while ((match = MARKER_RE.exec(doc)) !== null) {
    const fullStart = match.index;
    const fullEnd = match.index + match[0].length;
    const deleted = match[1];
    const inserted = match[2];

    const deletedStart = match[0].indexOf(deleted) + fullStart;
    const deletedEnd = deletedStart + deleted.length;

    const slashIndex = match[0].indexOf("/", deletedEnd - fullStart);
    const insertedStart = match[0].indexOf(inserted, slashIndex) + fullStart;
    const insertedEnd = insertedStart + inserted.length;

    builder.add(fullStart, fullStart + 4, delimiterMark);

    if (deleted.trim()) {
      builder.add(deletedStart, deletedEnd, deletedMark);
    }

    builder.add(fullStart + slashIndex, fullStart + slashIndex + 1, Decoration.replace({
      widget: new SeparatorWidget(),
    }));

    if (inserted.trim()) {
      builder.add(insertedStart, insertedEnd, insertedMark);
    }

    builder.add(fullEnd - 3, fullEnd, delimiterMark);
  }

  return builder.finish();
}

export const changeMarkerHighlight = [
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    { decorations: (v) => v.decorations },
  ),
  EditorView.baseTheme({
    "&": {
      fontFamily: "var(--font-body)",
      fontSize: "15px",
      lineHeight: "1.7",
    },
    ".cm-content": {
      fontFamily: "var(--font-body)",
      caretColor: "#a4121c",
    },
    ".cm-change-deleted": {
      backgroundColor: "var(--color-change-deleted-bg, #f0dcda)",
      textDecoration: "line-through",
      textDecorationColor: "#a4121c",
      textDecorationThickness: "1.5px",
      color: "var(--color-change-deleted-ink, #8a1218)",
      fontStyle: "italic",
    },
    ".cm-change-inserted": {
      backgroundColor: "var(--color-change-inserted-bg, #e3ead5)",
      color: "var(--color-change-inserted-ink, #2f5622)",
      fontWeight: "500",
    },
    ".cm-change-delimiter": {
      color: "#b0a78f",
      fontSize: "0.7em",
      fontFamily: "var(--font-mono)",
    },
    ".cm-change-separator": {
      color: "#a4121c",
      fontFamily: "var(--font-display)",
      fontStyle: "italic",
      padding: "0 4px",
    },
  }),
];
