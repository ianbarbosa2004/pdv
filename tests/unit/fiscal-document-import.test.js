import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../../src/server/server.js", import.meta.url), "utf8");
const schemaManagerSource = await readFile(new URL("../../src/server/schema-manager.js", import.meta.url), "utf8");

test("importação fiscal rejeita uma chave já presente na fila ou nos documentos", () => {
  const importBlock = source.slice(
    source.indexOf('request.url === "/api/stock/fiscal-document-queue/import"'),
    source.indexOf('const fiscalEntryListMatch')
  );
  assert.match(importBlock, /FROM fiscal_document_queue[\s\S]*accessKeyFiscalDocumentQueue/u);
  assert.match(importBlock, /FROM fiscal_documents[\s\S]*accessKeyFiscalDocument/u);
  assert.match(importBlock, /Esta chave de acesso já foi importada/u);
});

test("importação fiscal mantém os placeholders alinhados às colunas do documento", () => {
  const match = source.match(
    /INSERT INTO fiscal_documents\s*\(([\s\S]*?)\)\s*VALUES \(([^)]*)\)/u
  );
  assert.ok(match, "SQL de inserção do documento fiscal não encontrado");
  assert.equal((match[1].match(/[\w]+/gu) || []).length, 37);
  assert.equal((match[2].match(/\?/gu) || []).length, 37);
});

test("schema fiscal mantém os campos de endereço do emitente", () => {
  for (const column of [
    "issuerAddressFiscalDocument",
    "issuerAddressNumberFiscalDocument",
    "issuerNeighborhoodFiscalDocument",
    "issuerCityFiscalDocument",
    "issuerStateFiscalDocument",
    "issuerZipCodeFiscalDocument"
  ]) {
    assert.match(schemaManagerSource, new RegExp(`\\b${column}\\b`, "u"));
  }
});

test("a pré-entrada usa somente pagamentos confirmados pelo operador", () => {
  const importStart = source.indexOf(
    'request.url === "/api/stock/fiscal-document-queue/import"'
  );
  const importEnd = source.indexOf("const fiscalEntryListMatch", importStart);
  const importBlock = source.slice(importStart, importEnd);
  const entryReadStart = source.indexOf('request.url.match(/^\\/api\\/stock\\/fiscal-entries\\/(\\d+)$/)');
  const entryReadEnd = source.indexOf("const fiscalEntryDeleteMatch", entryReadStart);
  const entryReadBlock = source.slice(entryReadStart, entryReadEnd);

  assert.doesNotMatch(importBlock, /fiscal_document_payments/u);
  assert.doesNotMatch(entryReadBlock, /fiscal_document_payments/u);
  assert.match(entryReadBlock, /FROM fiscal_entry_payments/u);
  assert.doesNotMatch(schemaManagerSource, /CREATE TABLE IF NOT EXISTS fiscal_document_payments/u);
});
