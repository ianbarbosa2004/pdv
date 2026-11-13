import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStockConsumptionPlan,
  calculateComponentCost,
  calculateCostPerYieldUnit,
  calculateGrossQuantity,
  expandRecipeComponents,
  findRecipeCycles,
  validateRecipeDefinition
} from "../../src/shared/recipe.js";
import {
  filterRecipeComponentOptions,
  formatRecipeComponentUnit,
  getAvailableRecipeConversions,
  getCompatibleCulinaryUnits,
  formatCulinaryUnit,
  formatCulinaryUnitName,
  getProductTargetCulinaryUnitId,
  resolveRecipeComponentConversionFactor
} from "../../src/shared/recipe-component.js";

test("filtra componentes por busca sem diferenciar caixa ou acentos", () => {
  assert.deepEqual(
    filterRecipeComponentOptions([
      { searchText: "Feijão Rico MP-1" },
      { searchText: "Ovo Frito MP-2" }
    ], "feijao"),
    [{ searchText: "Feijão Rico MP-1" }]
  );
});

test("filtra unidade culinária e conversão conforme o componente", () => {
  const product = { unit: { codeUnit: "KG", descriptionUnit: "QUILOGRAMA" } };
  const liquidProduct = { unit: { codeUnit: "LT", descriptionUnit: "LITRO" } };
  const culinaryUnits = [
    { idCulinaryUnit: 1, baseUnitCulinaryUnit: "g" },
    { idCulinaryUnit: 2, baseUnitCulinaryUnit: "ml" },
    { idCulinaryUnit: 3, baseUnitCulinaryUnit: "common" }
  ];
  assert.deepEqual(getCompatibleCulinaryUnits(product, culinaryUnits), [culinaryUnits[0], culinaryUnits[2]]);
  assert.deepEqual(getCompatibleCulinaryUnits(liquidProduct, culinaryUnits), [culinaryUnits[1], culinaryUnits[2]]);
  assert.deepEqual(
    getAvailableRecipeConversions({
      culinaryUnitId: 1,
      physicalStateId: 5,
      conversions: [
        { idFromCulinaryUnitConversion: 1, idPhysicalStateCulinaryUnitConversion: 5 },
        { idFromCulinaryUnitConversion: 1, idPhysicalStateCulinaryUnitConversion: 6 },
        { idFromCulinaryUnitConversion: 2, idPhysicalStateCulinaryUnitConversion: 5 }
      ]
    }),
    [{ idFromCulinaryUnitConversion: 1, idPhysicalStateCulinaryUnitConversion: 5 }]
  );
  assert.deepEqual(
    getAvailableRecipeConversions({
      culinaryUnitId: 10,
      physicalStateId: 5,
      targetCulinaryUnitId: 11,
      selectedConversionId: 20,
      conversions: [
        { idFromCulinaryUnitConversion: 10, idToCulinaryUnitConversion: 11, idPhysicalStateCulinaryUnitConversion: 5 },
        { idFromCulinaryUnitConversion: 10, idToCulinaryUnitConversion: 10, idPhysicalStateCulinaryUnitConversion: 5 },
        { idCulinaryUnitConversion: 20, idFromCulinaryUnitConversion: 10, idToCulinaryUnitConversion: 12, idPhysicalStateCulinaryUnitConversion: 5 },
        { idFromCulinaryUnitConversion: 11, idToCulinaryUnitConversion: 10, idPhysicalStateCulinaryUnitConversion: 5 }
      ]
    }),
    [
      { idFromCulinaryUnitConversion: 10, idToCulinaryUnitConversion: 11, idPhysicalStateCulinaryUnitConversion: 5 },
      { idCulinaryUnitConversion: 20, idFromCulinaryUnitConversion: 10, idToCulinaryUnitConversion: 12, idPhysicalStateCulinaryUnitConversion: 5 }
    ]
  );
  assert.deepEqual(
    getAvailableRecipeConversions({
      culinaryUnitId: 10,
      physicalStateId: 5,
      conversions: [
        { idFromCulinaryUnitConversion: 10, idToCulinaryUnitConversion: 11, idPhysicalStateCulinaryUnitConversion: 5 },
        { idFromCulinaryUnitConversion: 10, idToCulinaryUnitConversion: 12, idPhysicalStateCulinaryUnitConversion: 5 }
      ]
    }),
    [
      { idFromCulinaryUnitConversion: 10, idToCulinaryUnitConversion: 11, idPhysicalStateCulinaryUnitConversion: 5 },
      { idFromCulinaryUnitConversion: 10, idToCulinaryUnitConversion: 12, idPhysicalStateCulinaryUnitConversion: 5 }
    ]
  );
  assert.equal(
    getProductTargetCulinaryUnitId(
      { idUnitProduct: 7, codeUnit: "KG" },
      [{ idCulinaryUnit: 10, codeCulinaryUnit: "kg" }],
      [{ idUnit: 7, codeUnit: "KG", descriptionUnit: "QUILOGRAMA" }]
    ),
    10
  );
  assert.equal(formatRecipeComponentUnit({ codeUnit: "KG", descriptionUnit: "QUILOGRAMA" }), "KG - QUILOGRAMA");
  assert.equal(
    formatCulinaryUnit({ nameCulinaryUnit: "Colher de sopa", baseUnitCulinaryUnit: "ml" }),
    "Colher de sopa (ml)"
  );
  assert.equal(
    formatCulinaryUnit({ nameCulinaryUnit: "Colher de sopa", baseUnitCulinaryUnit: "common" }),
    "Colher de sopa (Comum)"
  );
  assert.equal(
    formatCulinaryUnitName({ nameCulinaryUnit: "Quilograma", baseUnitCulinaryUnit: "g" }),
    "Quilograma"
  );
});

test("calculates gross quantity and cost including loss", () => {
  assert.equal(calculateGrossQuantity(0.8, 20), 1);
  assert.equal(calculateComponentCost({ quantity: 0.8, lossPercent: 20, unitCost: 10 }), 10);
  assert.equal(
    calculateComponentCost({
      quantity: 800,
      conversionFactor: 0.001,
      unitCost: 43.12
    }),
    34.496
  );
});

test("calcula o custo por unidade final pelo rendimento", () => {
  assert.equal(calculateCostPerYieldUnit(30, 3), 10);
  assert.equal(calculateCostPerYieldUnit(30, 0), null);
});

test("resolves fator pela unidade culinária e unidade do produto", () => {
  const product = { idUnitProduct: 20, idPhysicalStateProduct: 5 };
  const conversions = [{
    idCulinaryUnitConversion: 30,
    idFromCulinaryUnitConversion: 10,
    idToCulinaryUnitConversion: 20,
    idPhysicalStateCulinaryUnitConversion: 5,
    factorCulinaryUnitConversion: 0.001
  }];
  assert.equal(
    resolveRecipeComponentConversionFactor({
      component: { culinaryUnitId: 10, conversionId: "" },
      product,
      conversions
    }),
    0.001
  );
  assert.equal(
    calculateComponentCost({
      quantity: 3,
      unitCost: 26000,
      conversionFactor: resolveRecipeComponentConversionFactor({
        component: { culinaryUnitId: 10, conversionId: "" },
        product,
        conversions
      })
    }),
    78
  );
});

test("usa o fator da conversão explícita para quilograma no cálculo do custo", () => {
  const product = {
    idUnitProduct: 20,
    idPhysicalStateProduct: 5,
    unit: { codeUnit: "KG", descriptionUnit: "QUILOGRAMA" }
  };
  const conversions = [{
    idCulinaryUnitConversion: 30,
    idFromCulinaryUnitConversion: 10,
    idToCulinaryUnitConversion: 20,
    idPhysicalStateCulinaryUnitConversion: 5,
    factorCulinaryUnitConversion: 0.01
  }];
  const conversionFactor = resolveRecipeComponentConversionFactor({
    component: { culinaryUnitId: 10, conversionId: 30 },
    product,
    conversions
  });
  assert.equal(conversionFactor, 0.01);
  assert.equal(
    calculateComponentCost({ quantity: 2, unitCost: 240, conversionFactor }),
    4.8
  );
});

test("calcula o custo proporcional ao conteúdo da embalagem do produto", () => {
  const product = {
    idUnitProduct: 20,
    idPhysicalStateProduct: 5,
    packageQuantityProduct: 750
  };
  const conversions = [{
    idCulinaryUnitConversion: 30,
    idFromCulinaryUnitConversion: 10,
    idToCulinaryUnitConversion: 20,
    idPhysicalStateCulinaryUnitConversion: 5,
    factorCulinaryUnitConversion: 10
  }];
  const conversionFactor = resolveRecipeComponentConversionFactor({
    component: { culinaryUnitId: 10, conversionId: 30 },
    product,
    conversions
  });
  assert.equal(conversionFactor, 10 / 750);
  assert.equal(
    calculateComponentCost({ quantity: 1, unitCost: 30, conversionFactor }),
    0.4
  );
});

test("rejects invalid recipe definitions", () => {
  assert.deepEqual(
    validateRecipeDefinition({
      kind: "production",
      resultProductId: 10,
      components: [{ productId: 20, culinaryUnitId: 10, quantity: 0, lossPercent: 100 }]
    }),
    [
      "Componente 1: informe uma quantidade maior que zero.",
      "Componente 1: a perda deve estar entre 0 e 99,99%.",
      "Componente 1: informe a conversão."
    ]
  );
});

test("accepts a standalone named recipe with product or recipe components", () => {
  assert.deepEqual(
    validateRecipeDefinition({
      kind: "production",
      name: "Feijão Rico",
      components: [{ productId: 20, culinaryUnitId: 10, conversionId: 40, quantity: 1 }, { recipeId: 30, quantity: 1 }]
    }),
    []
  );
});

test("requires culinary unit for product recipe components", () => {
  assert.deepEqual(
    validateRecipeDefinition({
      kind: "production",
      name: "Feijão Rico",
      components: [{ productId: 20, quantity: 1 }]
    }),
    [
      "Componente 1: informe a unidade culinária.",
      "Componente 1: informe a conversão."
    ]
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
