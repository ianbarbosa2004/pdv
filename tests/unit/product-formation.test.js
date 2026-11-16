import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateFormationComponentCost,
  filterFormationProducts,
  formatFormationQuantity,
  isEligibleFormationProduct,
  parseFormationNumber
} from "../../src/catalog/product-formation-screen.js";
import { formatRecipeComponentUnit } from "../../src/shared/recipe-component.js";

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
  assert.equal(formatFormationQuantity("1.25"), "1.2500");
  assert.equal(calculateFormationComponentCost({ quantity: "2.0000", unitCost: "3.50" }), 7);
});

test("arredonda custo da Formação para cima em duas casas", () => {
  assert.equal(calculateFormationComponentCost({ quantity: "1", unitCost: "5.001" }), 5.01);
  assert.equal(calculateFormationComponentCost({ quantity: "1", unitCost: "5.024" }), 5.03);
  assert.equal(calculateFormationComponentCost({ quantity: "1", unitCost: "5.020" }), 5.02);
});

test("padroniza sigla e descrição da unidade final", () => {
  assert.equal(formatRecipeComponentUnit({ codeUnit: "Unidade", descriptionUnit: "Unidade" }), "UN - Unidade");
  assert.equal(formatRecipeComponentUnit({ codeUnit: "KG", descriptionUnit: "Quilograma" }), "KG - Quilograma");
});
