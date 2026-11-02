import test from "node:test";
import assert from "node:assert/strict";
import { buildViewsGroupTree, filterViewsProducts, isNoCostProduct } from "../../src/tools/views-model.js";
import { isRawMaterialWithoutPhysicalState } from "../../src/tools/no-physical-state-screen.js";

test("builds an alphabetized group tree with product counts", () => {
  const tree = buildViewsGroupTree(
    [
      { idGroup: 2, descriptionGroup: "Bebidas", descriptionClass: "Mercearia" },
      { idGroup: 1, descriptionGroup: "Alimentos", descriptionClass: "Mercearia" }
    ],
    [
      { idProduct: 10, idGroup: 2 },
      { idProduct: 11, idGroup: 2 },
      { idProduct: 12, idGroup: 1 }
    ]
  );

  assert.deepEqual(
    tree.map(({ idGroup, label, productCount }) => ({
      idGroup,
      label,
      productCount
    })),
    [
      { idGroup: 1, label: "Mercearia - Alimentos", productCount: 1 },
      { idGroup: 2, label: "Mercearia - Bebidas", productCount: 2 }
    ]
  );
});

test("filters products by selected group and restores all products for Todos", () => {
  const products = [
    { idProduct: 1, idGroup: 10, nameProduct: "Café" },
    { idProduct: 2, idGroup: 20, nameProduct: "Leite" }
  ];

  assert.deepEqual(
    filterViewsProducts(products, 10).map(({ idProduct }) => idProduct),
    [1]
  );
  assert.deepEqual(
    filterViewsProducts(products, null).map(({ idProduct }) => idProduct),
    [1, 2]
  );
});

test("identifies products with zero cost", () => {
  assert.equal(isNoCostProduct({ costPriceProduct: 0 }), true);
  assert.equal(isNoCostProduct({ costPriceProduct: "0.00" }), true);
  assert.equal(isNoCostProduct({ costPriceProduct: 12.5 }), false);
});

test("filters only raw materials without a physical state", () => {
  assert.equal(isRawMaterialWithoutPhysicalState({
    descriptionProductType: "MATÉRIA-PRIMA",
    idPhysicalStateProduct: 0
  }), true);
  assert.equal(isRawMaterialWithoutPhysicalState({
    descriptionProductType: "MATÉRIA-PRIMA",
    idPhysicalStateProduct: 2
  }), false);
  assert.equal(isRawMaterialWithoutPhysicalState({
    descriptionProductType: "PRODUTO ACABADO",
    idPhysicalStateProduct: 0
  }), false);
});
