import assert from "node:assert/strict";
import test from "node:test";
import { rerenderPreservingInputSelection } from "../../src/ui/input-selection.js";

test("preserva seleção e direção do cursor ao recriar um campo de pesquisa", () => {
  const input = {
    selectionStart: 2,
    selectionEnd: 4,
    selectionDirection: "backward"
  };
  const nextInput = {
    focused: false,
    selection: null,
    focus() {
      this.focused = true;
    },
    setSelectionRange(start, end, direction) {
      this.selection = [start, end, direction];
    }
  };
  let rendered = false;

  rerenderPreservingInputSelection(
    input,
    () => { rendered = true; },
    () => nextInput
  );

  assert.equal(rendered, true);
  assert.equal(nextInput.focused, true);
  assert.deepEqual(nextInput.selection, [2, 4, "backward"]);
});
