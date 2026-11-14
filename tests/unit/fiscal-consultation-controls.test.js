import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../../src-tauri/src/lib.rs", import.meta.url),
  "utf8"
);

test("navegador fiscal oferece cópia do DOM sem importar", () => {
  assert.match(source, /copyButton\.textContent = "Copiar DOM"/u);
  assert.ok(source.includes('.replace(/[\\r\\n]+/g, "")'));
  assert.ok(source.includes('.replace(/>\\s+</g, "><")'));
  assert.match(source, /navigator\.clipboard\.writeText\(sanitizedHtml\)/u);
  assert.match(source, /Erro ao copiar DOM:/u);
  assert.match(source, /toolbar\.append\(status, readButton, copyButton, closeButton\)/u);
});
