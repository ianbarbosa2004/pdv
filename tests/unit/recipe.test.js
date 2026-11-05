import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStockConsumptionPlan,
  calculateComponentCost,
  calculateGrossQuantity,
  expandRecipeComponents,
  findRecipeCycles,
  validateRecipeDefinition
} from "../../src/shared/recipe.js";

test("calculates gross quantity and cost including loss", () => {
  assert.equal(calculateGrossQuantity(0.8, 20), 1);
  assert.equal(calculateComponentCost({ quantity: 0.8, lossPercent: 20, unitCost: 10 }), 10);
});

test("rejects invalid recipe definitions", () => {
  assert.deepEqual(
    validateRecipeDefinition({
      kind: "production",
      resultProductId: 10,
      components: [{ productId: 20, quantity: 0, lossPercent: 100 }]
    }),
    [
      "Componente 1: informe uma quantidade maior que zero.",
      "Componente 1: a perda deve estar entre 0 e 99,99%."
    ]
  );
});

test("accepts a standalone named recipe with product or recipe components", () => {
  assert.deepEqual(
    validateRecipeDefinition({
      kind: "production",
      name: "Feijão Rico",
      components: [{ productId: 20, quantity: 1 }, { recipeId: 30, quantity: 1 }]
    }),
    []
  );
});

test("detects direct and indirect composition cycles", () => {
  assert.deepEqual(
    findRecipeCycles([
      { resultProductId: 1, components: [{ productId: 2 }] },
      { resultProductId: 2, components: [{ productId: 1 }] }
    ]),
    [["1", "2", "1"]]
  );
});

test("detects cycles between standalone recipes", () => {
  assert.deepEqual(
    findRecipeCycles([
      { recipeId: 1, components: [{ recipeId: 2 }] },
      { recipeId: 2, components: [{ recipeId: 1 }] }
    ]),
    [["1", "2", "1"]]
  );
});

test("expands nested compositions and aggregates repeated components", () => {
  const products = new Map([
    ["10", { idProduct: 10, controlsStockProduct: 0 }],
    ["20", { idProduct: 20, controlsStockProduct: 1 }],
    ["30", { idProduct: 30, controlsStockProduct: 1 }]
  ]);
  const components = expandRecipeComponents({
    productId: 10,
    quantity: 2,
    definitions: [
      { resultProductId: 10, components: [{ productId: 20, quantity: 3, lossPercent: 0 }, { productId: 30, quantity: 1, lossPercent: 0 }] },
      { resultProductId: 20, components: [{ productId: 30, quantity: 2, lossPercent: 0 }] }
    ],
    products
  });

  assert.deepEqual(
    components.map(({ productId, quantity }) => ({ productId, quantity })),
    [{ productId: 30, quantity: 14 }]
  );
});

test("consumes the root product when it controls stock and components otherwise", () => {
  const componentProducts = new Map([
    ["20", { idProduct: 20, controlsStockProduct: 1 }],
    ["30", { idProduct: 30, controlsStockProduct: 0 }]
  ]);
  const definitions = [{ resultProductId: 10, components: [{ productId: 20, quantity: 2, lossPercent: 0 }, { productId: 30, quantity: 1, lossPercent: 0 }] }];

  assert.deepEqual(
    buildStockConsumptionPlan({
      rootProduct: { idProduct: 10, controlsStockProduct: 0 },
      quantity: 3,
      definitions,
      products: componentProducts
    }).map(({ productId, quantity }) => ({ productId, quantity })),
    [{ productId: 20, quantity: 6 }]
  );
  assert.deepEqual(
    buildStockConsumptionPlan({
      rootProduct: { idProduct: 10, controlsStockProduct: 1 },
      quantity: 3,
      definitions,
      products: componentProducts
    }).map(({ productId, quantity }) => ({ productId, quantity })),
    [{ productId: 10, quantity: 3 }]
  );
});
