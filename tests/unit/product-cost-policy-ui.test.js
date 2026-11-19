import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("expõe a política de custo no cadastro e na edição de produtos", async () => {
  const source = await readFile(
    new URL("../../src/catalog/catalog-screen.js", import.meta.url),
    "utf8"
  );
  const productSource = await readFile(
    new URL("../../src/shared/product.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /name="costPolicyProduct"/u);
  assert.match(source, /field-label-with-help/u);
  assert.match(source, /<strong>Último custo:<\/strong> usa o valor unitário da entrada mais recente/u);
  assert.match(source, /Último custo/u);
  assert.match(source, /Custo médio/u);
  assert.match(source, /costPolicyProduct: normalizeCostPolicy\(formData\.get\("costPolicyProduct"\)\)/u);
  assert.match(productSource, /costPolicyProduct: String\(product\?\.costPolicyProduct \|\| "last"\)/u);
});

test("expõe a política de custo no modal de edição das Views", async () => {
  const source = await readFile(
    new URL("../../src/tools/views-screen.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /renderCostPolicyOptions/u);
  assert.match(source, /field-help-tooltip/u);
  assert.match(source, /<strong>Custo médio:<\/strong> recalcula o valor pela média ponderada/u);
  assert.match(source, /name="costPolicyProduct"/u);
  assert.match(source, /costPolicyProduct: normalizeCostPolicy\(formData\.get\("costPolicyProduct"\)\)/u);
});

test("edita a política pelo backend com replay fiscal, cascata e resposta efetiva", async () => {
  const source = await readFile(
    new URL("../../src/server/server.js", import.meta.url),
    "utf8"
  );
  const schemaSource = await readFile(
    new URL("../../src/server/schema-manager.js", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(source, /if \(normalizeCostPolicy\(existingProductRows\[0\]\.costPolicyProduct\) !== costPolicyProduct\)/u);
  assert.match(source, /WHERE pfr\.idProduct = \? AND entry\.statusFiscalEntry = 'confirmed'/u);
  assert.match(schemaSource, /entryDateFiscalDocumentItem DATE NULL/u);
  assert.match(source, /ORDER BY i\.entryDateFiscalDocumentItem ASC[\s\S]*?i\.idFiscalDocument ASC[\s\S]*?i\.lineNumberFiscalDocumentItem ASC[\s\S]*?i\.idFiscalDocumentItem ASC/u);
  assert.match(source, /calculateCostUpdateSequence/u);
  assert.match(source, /effectivePriceProduct, effectiveCostPriceProduct/u);
  assert.match(source, /propagateRecipeCosts\(connection, \[idProduct\]\)/u);
  assert.match(source, /priceProduct: effectivePriceProduct/u);
  assert.match(source, /costPriceProduct: effectiveCostPriceProduct/u);
});
