import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("a fila fiscal não registra eventos Tauri no navegador", async () => {
  const source = await readFile(
    new URL("../../src/stock/fiscal-document-queue-screen.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /const isTauriWindow = \(\) => Boolean\(window\.__TAURI_INTERNALS__\);/);
  assert.match(source, /if \(isTauriWindow\(\)\) \{\s+void listen\("fiscal-dom-read"/s);
  assert.match(source, /if \(!isTauriWindow\(\)\) \{\s+fiscalBrowserError = "A consulta fiscal interativa exige o aplicativo Tauri\."/s);
});
