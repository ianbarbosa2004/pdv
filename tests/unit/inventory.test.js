import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateCostUpdate,
  calculateCostForPolicyChange,
  calculateCostUpdateSequence,
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

test("usa a última entrada ao confirmar várias linhas do mesmo produto", () => {
  const result = calculateCostUpdateSequence({
    policy: COST_POLICIES.LAST,
    previousStock: 1,
    previousCost: 37.98,
    entries: [
      { receivedQuantity: 1, receivedUnitCost: 34.98 },
      { receivedQuantity: 2, receivedUnitCost: 32 }
    ]
  });

  assert.equal(result.nextCost, 32);
  assert.equal(result.nextStock, 4);
});

test("propaga o custo médio sequencialmente entre linhas do mesmo produto", () => {
  const result = calculateCostUpdateSequence({
    policy: COST_POLICIES.AVERAGE,
    previousStock: 2,
    previousCost: 37.98,
    entries: [
      { receivedQuantity: 1, receivedUnitCost: 34.98 },
      { receivedQuantity: 2, receivedUnitCost: 32 }
    ]
  });

  assert.ok(Math.abs(result.steps[0].nextCost - 36.98) < 0.005);
  assert.ok(Math.abs(result.nextCost - 34.988) < 0.005);
});

test("recalcula o custo ao trocar a política a partir das entradas confirmadas", () => {
  const entries = [
    { quantity: 10, unitCost: 37.98 },
    { quantity: 10, unitCost: 32 }
  ];

  assert.equal(
    calculateCostForPolicyChange({
      policy: COST_POLICIES.LAST,
      previousCost: 37.98,
      entries
    }),
    32
  );
  assert.ok(Math.abs(
    calculateCostForPolicyChange({
      policy: COST_POLICIES.AVERAGE,
      previousCost: 30,
      previousStock: 10,
      entries
    }) - 33.32666666666667
  ) < 0.005);
});

test("recalcula custo médio de troca de política incluindo o saldo inicial", () => {
  const result = calculateCostForPolicyChange({
    policy: COST_POLICIES.AVERAGE,
    previousCost: 37.98,
    previousStock: 10,
    entries: [
      { quantity: 1, unitCost: 34.98 },
      { quantity: 2, unitCost: 32 }
    ]
  });

  assert.ok(Math.abs(result - 36.829) < 0.005);
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
