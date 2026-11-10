import assert from "node:assert/strict";
import test from "node:test";

test("preserva a posição do cursor ao rerenderizar a pesquisa culinária", async () => {
  const { preserveCulinarySearchSelection } = await import("../../src/catalog/culinary-reference-screen.js");
  let rendered = false;
  let focused = false;
  let selection = null;
  const input = {
    selectionStart: 2,
    selectionEnd: 2,
    selectionDirection: "none"
  };
  const nextInput = {
    focus() {
      focused = true;
    },
    setSelectionRange(start, end, direction) {
      selection = [start, end, direction];
    }
  };

  preserveCulinarySearchSelection(
    input,
    () => {
      rendered = true;
    },
    () => nextInput
  );

  assert.equal(rendered, true);
  assert.equal(focused, true);
  assert.deepEqual(selection, [2, 2, "none"]);
});
