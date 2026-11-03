import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCashAmount } from "../../src/server/cash-service.js";

test("normalizes cash amounts to cents", () => {
  assert.equal(normalizeCashAmount("12.50"), 1250);
  assert.equal(normalizeCashAmount(0), 0);
});

test("rejects malformed or negative cash amounts", () => {
  assert.throws(() => normalizeCashAmount("-1.00"), /inválido|negativo/);
  assert.throws(() => normalizeCashAmount("1.234"), /inválido/);
});

