import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateCostUpdate,
  calculateFiscalItemImpact,
  calculateInventoryAdjustment,
  COST_POLICIES
} from "../../src/shared/inventory.js";

test("calcula quantidade convertida e custo unitário fiscal", () => {
  assert.deepEqual(
    calculateFiscalItemImpact({
      sourceQuantity: 2,
      sourceTotal: 72,
      conversionFactor: 24
    }),
    {
      quantity: 48,
      unitCost: 1.5,
      total: 72
    }
  );
});

test("usa último custo quando essa política está selecionada", () => {
  assert.deepEqual(
    calculateCostUpdate({
      policy: COST_POLICIES.LAST,
      previousStock: 10,
      previousCost: 4,
      receivedQuantity: 5,
      receivedUnitCost: 7
    }),
    {
      policy: "last",
      previousStock: 10,
      nextStock: 15,
      previousCost: 4,
      nextCost: 7,
      quantity: 5,
      unitCost: 7
    }
  );
});

test("calcula custo médio ponderado somente com saldo positivo", () => {
  const positiveStock = calculateCostUpdate({
    policy: COST_POLICIES.AVERAGE,
    previousStock: 10,
    previousCost: 4,
    receivedQuantity: 5,
    receivedUnitCost: 7
  });
  const nonPositiveStock = calculateCostUpdate({
    policy: COST_POLICIES.AVERAGE,
    previousStock: -2,
    previousCost: 4,
    receivedQuantity: 5,
    receivedUnitCost: 7
  });
  assert.equal(positiveStock.nextCost, 5);
  assert.equal(nonPositiveStock.nextCost, 7);
});

test("calcula ajuste de inventário sem alterar custo", () => {
  assert.deepEqual(
    calculateInventoryAdjustment({
      previousStock: -2,
      countedQuantity: 5
    }),
    {
      previousStock: -2,
      countedQuantity: 5,
      quantityDelta: 7
    }
  );
});

test("rejeita quantidade convertida inválida", () => {
  assert.throws(
    () => calculateFiscalItemImpact({
      sourceQuantity: 0,
      sourceTotal: 10,
      conversionFactor: 1
    }),
    /quantidade convertida deve ser positiva/
  );
});
