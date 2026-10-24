import test from "node:test";
import assert from "node:assert/strict";
import { calculateSaleTotals } from "../src/shared/sale.js";

test("calcula quantidade e total da venda", () => {
  const result = calculateSaleTotals([
    { price: 5.5, quantity: 2 },
    { price: 4, quantity: 1 }
  ]);

  assert.deepEqual(result, {
    itemCount: 3,
    subtotal: 15,
    total: 15
  });
});

test("ignora quantidade e preço inválidos sem produzir total negativo", () => {
  const result = calculateSaleTotals([
    { price: -10, quantity: 2 },
    { price: 8, quantity: 0 },
    { price: 3, quantity: 1 }
  ]);

  assert.deepEqual(result, {
    itemCount: 1,
    subtotal: 3,
    total: 3
  });
});
