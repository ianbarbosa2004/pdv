import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateFormationComponentCost,
  filterFormationProducts,
  formatFormationQuantity,
  isEligibleFormationProduct,
  parseFormationNumber
} from "../../src/catalog/product-formation-screen.js";
import { readFile } from "node:fs/promises";
import { formatRecipeComponentLabel, formatRecipeComponentUnit } from "../../src/shared/recipe-component.js";

const products = [
  { idProduct: 1, pdvCodeProduct: "10", nameProduct: "Produto acabado", descriptionProductType: "PRODUTO ACABADO", formation: { idRecipe: 4 } },
  { idProduct: 2, pdvCodeProduct: "11", nameProduct: "Mercadoria", descriptionProductType: "MERCADORIA PARA REVENDA", formation: null },
  { idProduct: 3, pdvCodeProduct: "12", nameProduct: "Matéria-prima", descriptionProductType: "MATÉRIA-PRIMA", formation: null }
];

test("filtra somente produtos aptos para venda", () => {
  assert.equal(isEligibleFormationProduct(products[0]), true);
  assert.equal(isEligibleFormationProduct(products[1]), true);
  assert.equal(isEligibleFormationProduct(products[2]), false);
  assert.deepEqual(filterFormationProducts(products).map(({ idProduct }) => idProduct), [1, 2]);
});

test("aplica filtros de ficha e pesquisa", () => {
  assert.deepEqual(filterFormationProducts(products, { filter: "with" }).map(({ idProduct }) => idProduct), [1]);
  assert.deepEqual(filterFormationProducts(products, { filter: "without" }).map(({ idProduct }) => idProduct), [2]);
  assert.deepEqual(filterFormationProducts(products, { searchTerm: "mercadoria" }).map(({ idProduct }) => idProduct), [2]);
});

test("mantém campos numéricos em padrão decimal americano e calcula custo", () => {
  assert.equal(parseFormationNumber("1.2500"), 1.25);
  assert.equal(parseFormationNumber("1,2500"), 1.25);
  assert.equal(formatFormationQuantity("1.25"), "1.250");
  assert.equal(calculateFormationComponentCost({ quantity: "2.0000", unitCost: "3.50" }), 7);
});

test("arredonda custo da Formação para cima em duas casas", () => {
  assert.equal(calculateFormationComponentCost({ quantity: "1", unitCost: "5.001" }), 5.01);
  assert.equal(calculateFormationComponentCost({ quantity: "1", unitCost: "5.024" }), 5.03);
  assert.equal(calculateFormationComponentCost({ quantity: "1", unitCost: "5.020" }), 5.02);
});

test("calcula custo proporcional ao conteúdo da embalagem do óleo", () => {
  assert.equal(calculateFormationComponentCost({
    quantity: "30",
    unitCost: "6.29",
    conversionFactor: "0.0011111111111111111"
  }), 0.21);
});

test("Ficha Técnica resolve conversão culinária dos componentes de produto", async () => {
  const [screenSource, serverSource] = await Promise.all([
    readFile("src/catalog/product-formation-screen.js", "utf8"),
    readFile("src/server/server.js", "utf8")
  ]);
  assert.match(screenSource, /resolveRecipeComponentConversionFactor/u);
  assert.match(screenSource, /api\/unit-conversions/u);
  assert.match(serverSource, /products\.packageQuantityProduct/u);
  assert.match(serverSource, /components\.idCulinaryUnitRecipeComponent AS culinaryUnitId/u);
  assert.match(serverSource, /components\.idCulinaryUnitConversionRecipeComponent AS conversionId/u);
});

test("Ficha Técnica mostra a unidade cadastrada no produto, não a conversão", async () => {
  const source = await readFile("src/catalog/product-formation-screen.js", "utf8");
  assert.match(
    source,
    /const componentUnit = \(component\) =>[\s\S]*?component\.componentCodeUnit[\s\S]*?component\.componentDescriptionUnit/u
  );
  assert.doesNotMatch(
    source,
    /const componentUnit = \(component\) =>[\s\S]*?fromCodeCulinaryUnit/u
  );
});

test("Ficha Técnica somente leitura usa o custo persistido do componente", async () => {
  const source = await readFile("src/catalog/product-formation-screen.js", "utf8");
  assert.match(
    source,
    /const snapshotCost = Number\(component\.costFormationComponent\)[\s\S]*?if \(form\.readOnly && Number\.isFinite\(snapshotCost\)\) return snapshotCost/u
  );
});

test("padroniza sigla e descrição da unidade final", () => {
  assert.equal(formatRecipeComponentUnit({ codeUnit: "Unidade", descriptionUnit: "Unidade" }), "UN - Unidade");
  assert.equal(formatRecipeComponentUnit({ codeUnit: "ML", descriptionUnit: "Mililitro" }), "ML - Mililitro");
});

test("diferencia Receita e Composição no componente", () => {
  assert.equal(formatRecipeComponentLabel({ kindRecipe: "production", nameRecipe: "Molho" }), "Receita - Molho");
  assert.equal(formatRecipeComponentLabel({ kindRecipe: "composition", nameRecipe: "Kit" }), "Composição - Kit");
  assert.equal(formatRecipeComponentLabel({ kind: "COMPOSITION", nameRecipe: "Kit" }), "Composição - Kit");
  assert.equal(formatRecipeComponentUnit({ codeUnit: "KG", descriptionUnit: "Quilograma" }), "KG - Quilograma");
});

test("Ficha Técnica recupera o tipo das Receitas quando o endpoint de formações está desatualizado", async () => {
  const source = await readFile("src/catalog/product-formation-screen.js", "utf8");
  assert.match(source, /recipes\.some\(\(recipe\) => !recipe\.kindRecipe\)/u);
  assert.match(source, /\/api\/recipes\?includeArchived=1/u);
  assert.match(source, /kindRecipe: recipe\.kindRecipe \|\| recipeTypes\.get\(String\(recipe\.idRecipe\)\)\?\.kindRecipe/u);
});
