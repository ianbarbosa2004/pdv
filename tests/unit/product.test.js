import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDuplicatedProductDraft,
  getDuplicatedProductName
} from "../../src/shared/product.js";
import { readFile } from "node:fs/promises";

test("gera nomes identificáveis e únicos para duplicação de produto", () => {
  assert.equal(
    getDuplicatedProductName("Arroz", ["Arroz", "Arroz - cópia"]),
    "Arroz - cópia 2"
  );
  assert.equal(
    getDuplicatedProductName("Arroz - cópia 2", ["Arroz - cópia", "Arroz - cópia 2"]),
    "Arroz - cópia 3"
  );
});

test("duplica somente os dados cadastrais e limpa identidade, estoque e status", () => {
  assert.deepEqual(
    buildDuplicatedProductDraft({
      nameProduct: "Arroz",
      skuProduct: "ARZ-1",
      pdvCodeProduct: "10",
      idGroup: 2,
      idFiscalOperationSaleProduct: 3,
      idProductTypeProduct: 4,
      idPhysicalStateProduct: 5,
      idUnitProduct: 6,
      priceProduct: 12.5,
      costPriceProduct: 8.5,
      stockQuantityProduct: 100,
      controlsStockProduct: 1,
      isBuffetProduct: 1,
      isFractionalProduct: 1,
      printsPlace: "COZINHA",
      showsInPdvProduct: 1
    }),
    {
      nameProduct: "Arroz - cópia",
      skuProduct: "",
      pdvCodeProduct: "",
      idGroup: "2",
      idFiscalOperationSaleProduct: "3",
      idProductTypeProduct: "4",
      idPhysicalStateProduct: "5",
      idUnitProduct: "6",
      priceProduct: "12.5",
      costPriceProduct: "8.5",
      stockQuantityProduct: "0",
      controlsStockProduct: true,
      isBuffetProduct: true,
      isFractionalProduct: true,
      printsPlace: "COZINHA",
      showsInPdvProduct: false
    }
  );
});

test("mantém os controles de catálogo compartilhados para edição e duplicação", async () => {
  const source = await readFile(new URL("../../src/catalog/catalog-screen.js", import.meta.url), "utf8");
  const sharedListSource = await readFile(new URL("../../src/tools/product-list-view.js", import.meta.url), "utf8");
  assert.match(source, /data-edit="\$\{product\.idProduct\}"/);
  assert.match(source, /data-duplicate="\$\{product\.idProduct\}"/);
  assert.doesNotMatch(source, /<span>Código PDV<\/span>/);
  assert.match(source, /pdvCodeProduct: productId\s*\? editingProduct\?\.pdvCodeProduct/);
  assert.match(source, /product-cost-stock-row/);
  assert.doesNotMatch(source, /"Custo", "product-cost-column"/);
  assert.doesNotMatch(source, /product-cost-column">R\$/);
  assert.match(source, /product-stock-column/);
  assert.match(source, /units\.filter\(\(unit\) => Number\(unit\.isTaxableUnit\) === 1\)/);
  assert.match(source, /product-visibility-column">PDV/);
  assert.match(source, /product-status-column">Status/);
  assert.doesNotMatch(sharedListSource, /costPriceProduct", "Preço de custo"/);
  assert.doesNotMatch(sharedListSource, /formatMoney\(product\.costPriceProduct\)/);
  assert.match(source, /const renderProductRecipeLinks = \(\) =>/);
  assert.ok(
    source.indexOf("const renderNcmField =") < source.indexOf("const renderProductRecipeLinks ="),
    "recipe-link renderer must be available outside the NCM renderer"
  );
});

test("gera Código PDV de novos produtos pelo ID e preserva o valor de produtos antigos", async () => {
  const source = await readFile(new URL("../../src/server/server.js", import.meta.url), "utf8");
  assert.match(source, /const pdvCodeProduct = String\(result\.insertId\);/);
  assert.match(source, /UPDATE products SET pdvCodeProduct = \? WHERE idProduct = \?/);
  assert.match(
    source,
    /SELECT pdvCodeProduct FROM products WHERE idProduct = \?[\s\S]*?const pdvCodeProduct = existingProductRows\[0\]\.pdvCodeProduct;/
  );
  assert.doesNotMatch(
    source,
    /UPDATE products SET idGroup = \?, skuProduct = \?, pdvCodeProduct = \?, nameProduct/
  );
});

test("mantém o rascunho editado antes de renderizar o estado de salvamento", async () => {
  const source = await readFile(new URL("../../src/catalog/catalog-screen.js", import.meta.url), "utf8");
  const submitStart = source.indexOf("const createProduct = async");
  const submitBody = source.slice(submitStart, source.indexOf("const updateProductStatus", submitStart));
  assert.match(submitBody, /if \(!productId\) captureNewProductDraft\(formData\);\s*submitting = true;/);
});

test("mantém a mesma quantidade de colunas e parâmetros nos INSERTs de produtos", async () => {
  const source = await readFile(new URL("../../src/server/server.js", import.meta.url), "utf8");
  let offset = 0;
  let insertCount = 0;
  while ((offset = source.indexOf("INSERT INTO products", offset)) >= 0) {
    const columnsStart = source.indexOf("(", offset);
    const columnsEnd = source.indexOf(")", columnsStart);
    const valuesStart = source.indexOf("VALUES", columnsEnd);
    const queryEnd = source.indexOf("`", valuesStart);
    const columns = source.slice(columnsStart + 1, columnsEnd).split(",").filter(Boolean);
    const placeholders = (source.slice(valuesStart, queryEnd).match(/\?/g) || []);
    assert.equal(
      placeholders.length,
      columns.length,
      `INSERT de produtos deve ter ${columns.length} parâmetros, mas tem ${placeholders.length}`
    );
    insertCount += 1;
    offset = queryEnd + 1;
  }
  assert.equal(insertCount, 2);
});
