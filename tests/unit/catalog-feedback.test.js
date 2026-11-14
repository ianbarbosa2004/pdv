import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("cadastros de clientes e consumidores fazem uma única renderização final após salvar", async () => {
  const source = await readFile(
    new URL("../../src/catalog/customer-consumer-screen.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /const load = async \(\{ captureDraft = true, renderState = true \} = \{\}\)/);
  assert.match(source, /await load\(\{ captureDraft: false, renderState: false \}\)/);
  assert.match(source, /finally \{ loading = false; if \(renderState\) render\(\{ captureDraft \}\); \}/);
});

test("fornecedores fazem uma única renderização final após salvar", async () => {
  const source = await readFile(
    new URL("../../src/catalog/supplier-screen.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /const load = async \(\{ renderState = true \} = \{\}\)/);
  assert.match(source, /await load\(\{ renderState: false \}\)/);
  assert.match(source, /if \(renderState\) renderPreservingFormDraft\(root, render\)/);
});
