import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("não fecha modais quando a seleção de texto termina no backdrop", async () => {
  const source = await readFile("src/ui/modal.js", "utf8");

  assert.match(source, /pointerdown/u);
  assert.match(source, /pointerStartedOnBackdrop/u);
  assert.match(source, /event\.target === modal/u);
  assert.match(source, /stopImmediatePropagation/u);
});

test("mantém o foco no campo de busca do modal de componentes após apagar com Backspace", async () => {
  const source = await readFile("src/catalog/recipe-screen.js", "utf8");
  const handlerStart = source.indexOf(
    'componentEditorRoot.querySelector("[data-component-search]")?.addEventListener("input"'
  );
  const handler = handlerStart >= 0 ? source.slice(handlerStart, source.indexOf("\n    });", handlerStart) + 7) : "";

  assert.ok(handler, "handler de busca do modal não encontrado");
  assert.match(handler, /render\(\);/u);
  assert.match(handler, /const searchInput = root\.querySelector\("\[data-component-search\]"\)/u);
  assert.match(handler, /searchInput\?\.focus\(\)/u);
});
