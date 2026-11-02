import test from "node:test";
import assert from "node:assert/strict";
import { formatBrazilianDecimal, parseBrazilianDecimal } from "../../src/shared/decimal.js";

test("interpreta fator decimal no padrão brasileiro", () => {
  assert.equal(parseBrazilianDecimal("1,000"), 1);
  assert.equal(parseBrazilianDecimal("1.234,500"), 1234.5);
  assert.equal(formatBrazilianDecimal(1), "1,000");
  assert.equal(formatBrazilianDecimal("0,050"), "0,050");
});
