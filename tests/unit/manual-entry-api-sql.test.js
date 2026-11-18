import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("manual entries preserve the shared transactional lifecycle", async () => {
  const source = await readFile("src/server/server.js", "utf8");
  const schema = await readFile("database/schema.sql", "utf8");

  assert.match(source, /POST" && request\.url === "\/api\/stock\/manual-entries"/u);
  assert.match(source, /originFiscalDocument = 'manual'/u);
  assert.match(source, /ensureManualDocumentIsUnique/u);
  assert.match(source, /totalPaymentsFiscalEntry/u);
  assert.match(source, /paymentsTotal = Number\(payments\.reduce\(\(sum, payment\) => sum \+ payment\.amount, 0\)\.toFixed\(2\)\)/u);
  assert.match(source, /item\.quantity \* item\.unitPrice\)\.toFixed\(2\)/u);
  assert.match(source, /unitPrice <= 0/u);
  assert.match(source, /p\.ncmProduct, p\.cestProduct/u);
  assert.match(source, /ncmProductFiscalReference, cestProductFiscalReference/u);
  assert.match(source, /VALUES \(\?, \?, 1, 1, \?, \?, \?, \?\)/u);
  assert.match(source, /VALUES \(\?, \?, 1, \?, \?, \?, \?\)/u);
  assert.match(source, /VALUES \(\?, \?, \?, 1, 'linked'\)/u);
  assert.match(source, /fiscalEntryConfirmMatch/u);
  assert.match(source, /fiscalEntryReverseMatch/u);
  assert.match(source, /fiscalEntryDeleteMatch/u);
  assert.match(source, /Já existe uma Entrada Manual com este fornecedor/u);
  assert.match(schema, /originFiscalDocument ENUM\('imported', 'manual'\)/u);
  assert.match(schema, /idSupplierFiscalDocument BIGINT UNSIGNED NULL/u);
});

test("manual entry fiscal references never pass NULL to NOT NULL NCM and CEST columns", async () => {
  const source = await readFile("src/server/server.js", "utf8");
  const schema = await readFile("database/schema.sql", "utf8");

  assert.match(schema, /ncmProductFiscalReference VARCHAR\(20\) NOT NULL/u);
  assert.match(schema, /cestProductFiscalReference VARCHAR\(20\) NOT NULL/u);

  assert.doesNotMatch(
    source,
    /item\.product\.ncmProduct\s*\|\|\s*null|item\.product\.cestProduct\s*\|\|\s*null/gu
  );
});
