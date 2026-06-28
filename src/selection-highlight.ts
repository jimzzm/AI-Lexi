import { EditorView, Decoration } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
/**
 * SelectionHighlight - Shared CM6 selection highlight for chat and inline edit
 *
 * Provides a reusable mechanism to highlight selected text in the editor
 * when focus moves elsewhere (e.g., to an input field).
 */





export interface LexiSelectionHighlighter {
  show: (editorView: EditorView, from: number, to: number) => void;
  hide: (editorView: EditorView) => void;
}

function createLexiSelectionHighlighter(): LexiSelectionHighlighter {
  const showHighlight = StateEffect.define<{ from: number; to: number }>();
  const hideHighlight = StateEffect.define<null>();

  const selectionHighlightField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update: (deco, tr) => {
      for (const e of tr.effects) {
        if (e.is(showHighlight)) {
          const builder = new RangeSetBuilder<Decoration>();
          builder.add(e.value.from, e.value.to, Decoration.mark({
            class: 'ai-lexi-selection-highlight',
          }));
          return builder.finish();
        } else if (e.is(hideHighlight)) {
          return Decoration.none;
        }
      }
      return deco.map(tr.changes);
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  function ensureHighlightField(editorView: EditorView): void {
    try {
      editorView.dispatch({
        effects: StateEffect.appendConfig.of(selectionHighlightField),
      });
    } catch (e) {
      // 静默，某些 CM6 版本不支持运行时 appendConfig
    }
  }

  function show(editorView: EditorView, from: number, to: number): void {
    ensureHighlightField(editorView);
    editorView.dispatch({
      effects: showHighlight.of({ from, to }),
    });
  }

  function hide(editorView: EditorView): void {
    try {
      editorView.dispatch({
        effects: hideHighlight.of(null),
      });
    } catch {
    }
  }

  return { show, hide };
}

const lexiDefaultHighlighter = createLexiSelectionHighlighter();

export function lexiShowSelectionHighlight(editorView: EditorView, from: number, to: number): void {
  lexiDefaultHighlighter.show(editorView, from, to);
}

export function lexiHideSelectionHighlight(editorView: EditorView): void {
  lexiDefaultHighlighter.hide(editorView);
}
