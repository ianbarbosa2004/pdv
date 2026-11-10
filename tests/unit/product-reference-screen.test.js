import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("tela de Unidades expõe todos os campos do catálogo e switches booleanos", async () => {
  const source = await readFile("src/catalog/product-reference-screen.js", "utf8");

  assert.match(source, /String\(value \?\? ""\)/u);
  assert.match(source, /\$\{isUnits \? "Nova" : "Novo"\} \$\{definition\.singular\}/u);
  assert.match(source, /const load = async \(\{ showLoading = true \} = \{\}\) =>/u);
  assert.match(source, /submitting = false;\s+await load\(\{ showLoading: false \}\);/u);
  assert.match(source, /if \(submitting\) \{\s+submitting = false;\s+render\(\);\s+\}/u);
  for (const field of [
    "codeUnit",
    "descriptionUnit",
    "baseUnitUnit",
    "categoryUnit",
    "isActiveUnit",
    "isTaxableUnit",
    "isCulinaryUnit"
  ]) {
    assert.match(source, new RegExp(`["']${field}["']`, "u"));
  }
  assert.match(source, /type="checkbox"/u);
  assert.match(source, /data-unit-flag/u);
  assert.match(source, /definition\.endpoint\}\/flags/u);
});

test("API persiste flags, base e categoria das unidades", async () => {
  const source = await readFile("src/server/server.js", "utf8");
  const schemaSource = await readFile("src/server/schema-manager.js", "utf8");

  assert.match(source, /isActiveUnit, isTaxableUnit, isCulinaryUnit, baseUnitUnit, categoryUnit/u);
  assert.match(source, /UPDATE units[\s\S]*isCulinaryUnit = \?, baseUnitUnit = \?, categoryUnit = \?/u);
  assert.match(source, /request\.url === "\/api\/units\/flags"/u);
  assert.match(source, /parseBooleanFlag\(payload\.value/u);
  assert.match(schemaSource, /let productCatalogSchemaPromise = null/u);
  assert.match(schemaSource, /if \(productCatalogSchemaPromise\) return productCatalogSchemaPromise/u);
});

test("publicação consolida Dúzia pelo registro usado nas conversões", async () => {
  const source = await readFile("src/server/schema-manager.js", "utf8");

  assert.match(source, /\["DZ", "Dúzia", "un", "unit", 1\]/u);
  assert.match(source, /\["DZ", "UN", 12, "Conversão universal de contagem"\]/u);
  assert.match(source, /LOWER\(TRIM\(unit\.codeUnit\)\) IN \('duzia', 'dz'\)/u);
  assert.match(source, /conversionReferenceCount DESC/u);
  assert.match(source, /DELETE FROM units WHERE idUnit = \?/u);
  assert.match(source, /codeUnit = 'DZ'/u);
  assert.match(source, /descriptionUnit = 'Dúzia'/u);
});
