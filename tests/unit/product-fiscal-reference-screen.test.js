import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Produtos Vinculados expõe consulta fiscal e edição local do produto", async () => {
  const source = await readFile("src/stock/product-fiscal-reference-screen.js", "utf8");
  const server = await readFile("src/server/server.js", "utf8");
  const styles = await readFile("src/styles.css", "utf8");

  assert.match(source, /\/api\/stock\/product-fiscal-references/u);
  assert.match(source, /classic-content/u);
  assert.match(source, /classic-form-panel product-fiscal-reference-details/u);
  assert.match(source, /classic-grid-panel product-fiscal-reference-list/u);
  assert.match(source, /classic-list-header/u);
  assert.match(source, /readonly value=/gu);
  for (const field of [
    "descriptionProductType",
    "descriptionGroup",
    "operationNatureFiscalOperation",
    "codeUnit",
    "descriptionFiscalProductReference",
    "cfopProductFiscalReference",
    "fiscalUnitProductReference",
    "conversionFactor",
    "ncmProductFiscalReference",
    "cestProductFiscalReference"
  ]) {
    assert.match(source, new RegExp(field, "u"));
  }
  assert.match(source, /sortState = \{ key: "nameProduct", direction: "asc" \}/u);
  assert.match(source, /setSelectionRange/u);
  assert.match(source, /Vínculos Fiscais/u);
  assert.match(source, /data-fiscal-edit-form/u);
  assert.match(source, /\/api\/products\?includeInactive=1/u);
  assert.match(source, /\/api\/products\/fiscal/u);
  assert.match(source, /selectedProductId = editingProduct\.idProduct/u);
  assert.match(source, /await load\(\)/u);
  assert.match(source, /renderSuccessFeedback\(message, escapeHtml\)/u);
  assert.match(source, /createFeedbackTimer\(\)/u);
  assert.match(source, /clearRenderedFeedback\(root\)/u);
  assert.doesNotMatch(source, /<div class="feedback success">/u);
  assert.match(server, /request\.method === "PUT" && request\.url === "\/api\/products\/fiscal"/u);
  assert.match(server, /UPDATE products SET ncmProduct = \?, cestProduct = \?/u);
  assert.doesNotMatch(source, /data-back/u);
  assert.match(
    styles,
    /\.product-fiscal-reference-list \.ok-column[\s\S]*?width: 70px[\s\S]*?min-width: 70px[\s\S]*?max-width: 70px/u
  );
});

test("vínculos fiscais são migrados e sincronizados apenas para itens concluídos", async () => {
  const server = await readFile("src/server/server.js", "utf8");
  const schema = await readFile("src/server/schema-manager.js", "utf8");
  const navigation = await readFile("src/shared/navigation-defaults.js", "utf8");

  assert.match(schema, /CREATE TABLE IF NOT EXISTS product_fiscal_references/u);
  assert.match(schema, /idProductFiscalReference BIGINT UNSIGNED NULL/u);
  assert.match(schema, /descriptionFiscalOperation VARCHAR\(180\) NOT NULL DEFAULT ''/u);
  assert.match(schema, /let fiscalOperationSchemaPromise = null/u);
  assert.match(schema, /hasCompleteLegacyFiscalEntryColumns/u);
  assert.match(schema, /hasLegacyFiscalEntryColumns/u);
  assert.doesNotMatch(
    schema,
    /fkFiscalEntryItemsDocumentItem[\s\S]*ON DELETE RESTRICT,\s*\)/u
  );
  assert.match(
    schema,
    /pfr\.descriptionFiscalProductReference COLLATE utf8mb4_unicode_ci/u
  );
  assert.match(
    server,
    /s\.documentSupplier COLLATE utf8mb4_unicode_ci/u
  );
  assert.match(schema, /UPDATE fiscal_entry_items ei[\s\S]*SET ei\.idProductFiscalReference/u);
  assert.match(schema, /WHERE ei\.status = 'linked' AND ei\.selected = 1/u);
  assert.match(server, /request\.url === "\/api\/stock\/product-fiscal-references"/u);
  assert.match(server, /INSERT INTO product_fiscal_references/u);
  assert.match(server, /idStockUnit, conversionFactor/u);
  assert.match(server, /productFiscalReferences/u);
  assert.match(server, /pfr\.idProduct, pfr\.idStockUnit, pfr\.conversionFactor/u);
  assert.doesNotMatch(server, /COALESCE\(pfr\.idProduct, ei\.idProduct\)/u);
  assert.ok((server.match(/DELETE references_for_product/g) || []).length >= 2);
  assert.match(navigation, /"product-fiscal-references"/u);
});

test("Pré-entrada reutiliza conversão quando há um único vínculo fiscal correspondente", async () => {
  const source = await readFile("src/stock/fiscal-document-queue-screen.js", "utf8");

  assert.match(source, /const applyStoredFiscalReferences = \(entry\)/u);
  assert.match(source, /matches\.length !== 1/u);
  assert.match(source, /item\.idStockUnit = reference\.idStockUnit/u);
  assert.match(source, /item\.conversionFactor = reference\.conversionFactor/u);
  assert.match(source, /applyStoredFiscalReferences\(result\)/u);
});
