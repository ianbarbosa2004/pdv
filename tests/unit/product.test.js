import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDuplicatedProductDraft,
  formatProductStockForInput,
  getDuplicatedProductName,
  normalizeProductPackageQuantity
} from "../../src/shared/product.js";
import { formatMaskedNumber, normalizeMaskedNumber } from "../../src/ui/number-mask.js";
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
      costPolicyProduct: "average",
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
      packageQuantityProduct: "1",
      priceProduct: "12.5",
      costPriceProduct: "8.5",
      costPolicyProduct: "average",
      stockQuantityProduct: "0",
      controlsStockProduct: true,
      isBuffetProduct: true,
      isFractionalProduct: true,
      printsPlace: "COZINHA",
      showsInPdvProduct: false
    }
  );
});

test("normaliza conteúdo por unidade e estoque de forma idêntica nos modais", () => {
  assert.equal(normalizeProductPackageQuantity("10"), "10");
  assert.equal(normalizeProductPackageQuantity(null), "1");
  assert.equal(formatProductStockForInput("0.000", false), "0");
  assert.equal(formatProductStockForInput("1.250", true), "1.250");
});

test("conteúdo por unidade usa máscara de milésimos", () => {
  assert.equal(formatMaskedNumber("1.25", 3), "1,250");
  assert.equal(normalizeMaskedNumber("1,250", 3), "1.250");
});

test("mantém os controles de catálogo compartilhados para edição e duplicação", async () => {
  const source = await readFile(new URL("../../src/catalog/catalog-screen.js", import.meta.url), "utf8");
  const viewsSource = await readFile(new URL("../../src/tools/views-screen.js", import.meta.url), "utf8");
  const sharedListSource = await readFile(new URL("../../src/tools/product-list-view.js", import.meta.url), "utf8");
  assert.match(source, /data-edit="\$\{product\.idProduct\}"/);
  assert.match(source, /data-duplicate="\$\{product\.idProduct\}"/);
  assert.doesNotMatch(source, /<span>Código PDV<\/span>/);
  assert.match(source, /pdvCodeProduct: productId\s*\? editingProduct\?\.pdvCodeProduct/);
  assert.match(source, /product-cost-stock-row/);
  assert.match(source, /"Custo", "product-cost-column"/);
  assert.match(source, /product-cost-column">R\$/);
  assert.doesNotMatch(source, /product-stock-column/);
  assert.match(source, /packageQuantityProduct: "1"/);
  assert.match(
    source,
    /value="\$\{escapeHtml\(formatMaskedNumber\(normalizeProductPackageQuantity\(newProductDraft\.packageQuantityProduct\), 3\)\)\}"/
  );
  assert.match(
    source,
    /value="\$\{escapeHtml\(formatMaskedNumber\(normalizeProductPackageQuantity\(editingProduct\.packageQuantityProduct\), 3\)\)\}"/
  );
  assert.match(source, /packageQuantityProduct: normalizeMaskedNumber\(formData\.get\("packageQuantityProduct"\), 3\)/u);
  assert.match(source, /name="packageQuantityProduct" data-number-mask="fractional-3"/u);
  assert.match(viewsSource, /name="packageQuantityProduct" data-number-mask="fractional-3"/u);
  assert.match(viewsSource, /normalizeProductPackageQuantity\(product\.packageQuantityProduct\)/u);
  assert.match(viewsSource, /formatProductStockForInput\(product\.stockQuantityProduct, product\.isFractionalProduct\)/u);
  assert.doesNotMatch(viewsSource, /normalizeMaskedNumber\(product\.packageQuantityProduct/u);
  assert.match(viewsSource, /name="skuProduct" data-uppercase-mask/u);
  assert.match(viewsSource, /product-sale-price-row/u);
  assert.match(viewsSource, /product-cost-stock-row/u);
  assert.match(viewsSource, /name="printsPlace"/u);
  assert.match(viewsSource, /name="controlsStockProduct"/u);
  assert.match(source, /field-help-tooltip/);
  assert.match(source, /pointerenter.*is-help-visible/);
  assert.doesNotMatch(source, /field-help-trigger:hover \.field-help-tooltip/);
  assert.match(source, /units\.filter\(\(unit\) => Number\(unit\.isTaxableUnit\) === 1\)/);
  assert.match(source, /product-visibility-column">PDV/);
  assert.match(source, /product-status-column">Status/);
  assert.doesNotMatch(sharedListSource, /costPriceProduct", "Preço de custo"/);
  assert.doesNotMatch(sharedListSource, /formatMoney\(product\.costPriceProduct\)/);
  assert.doesNotMatch(source, /renderProductRecipeLinks|data-product-recipe-target|api\/product-recipes/);
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

test("exibe a descrição do NCM carregada sob demanda e abre a consulta pelo input ou pela lupa", async () => {
  const source = await readFile(new URL("../../src/catalog/catalog-screen.js", import.meta.url), "utf8");

  assert.match(source, /ncmDescriptions\.set\(code, ncm\?\.descriptionNcm \|\| "Descrição não encontrada"\)/u);
  assert.match(source, /\/api\/ncm-cest\/ncms\?page=1&pageSize=1&search=/u);
  assert.match(source, /<input name="ncmProduct"[\s\S]*data-open-ncm/u);
  assert.match(source, /root\.querySelectorAll\("\[data-open-ncm\]"\)/u);
});

test("mantém NCM e CEST em linhas fiscais de largura total no cadastro e em Views", async () => {
  const catalogSource = await readFile(new URL("../../src/catalog/catalog-screen.js", import.meta.url), "utf8");
  const viewsSource = await readFile(new URL("../../src/tools/views-screen.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../../src/styles.css", import.meta.url), "utf8");

  assert.match(catalogSource, /class="form-field catalog-fiscal-field"><span>NCM/u);
  assert.match(catalogSource, /class="form-field catalog-fiscal-field"><span>CEST/u);
  assert.match(viewsSource, /class="form-field catalog-fiscal-field"><span>NCM/u);
  assert.match(viewsSource, /class="form-field catalog-fiscal-field"><span>CEST/u);
  assert.match(viewsSource, /loadNcmDescription\(editingProduct\?\.ncmProduct\)/u);
  assert.match(viewsSource, /ncmDescriptions\.get\(String\(product\.ncmProduct/u);
  assert.match(styles, /\.classic-form-grid \.catalog-fiscal-field\s*\{[\s\S]*grid-column: 1 \/ -1;/u);
  assert.match(styles, /\.catalog-fiscal-field \.catalog-lookup-field\s*\{[\s\S]*width: 100%;/u);
});

test("exibe a descrição completa do NCM com quebra de linha", async () => {
  const styles = await readFile(new URL("../../src/styles.css", import.meta.url), "utf8");

  assert.match(styles, /\.catalog-lookup-description\s*\{[\s\S]*overflow-wrap: anywhere;/u);
  assert.match(styles, /\.catalog-lookup-description\s*\{[\s\S]*white-space: normal;/u);
  assert.match(styles, /\.catalog-lookup-description\s*\{[\s\S]*word-break: break-word;/u);
  assert.doesNotMatch(styles, /\.catalog-lookup-description\s*\{[\s\S]*text-overflow: ellipsis;/u);
  assert.doesNotMatch(styles, /\.catalog-lookup-description\s*\{[^}]*white-space: nowrap;/u);
  assert.match(styles, /\.catalog-fiscal-field \.catalog-lookup-field\s*\{[\s\S]*min-width: 0;/u);
  assert.match(styles, /\.catalog-lookup-description\s*\{[\s\S]*max-width: 100%;/u);
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
