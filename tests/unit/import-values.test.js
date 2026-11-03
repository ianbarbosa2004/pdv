import test from "node:test";
import assert from "node:assert/strict";
import { parseImportBoolean, parseImportStatus } from "../../src/shared/import-values.js";

test("interprets the CSV value não as false for stock control", () => {
  assert.equal(parseImportBoolean("não", 1, "Controla estoque"), 0);
});

test("accepts Portuguese, English, numeric and unaccented boolean aliases", () => {
  for (const value of ["sim", "s", "true", "1", "yes", "y"]) {
    assert.equal(parseImportBoolean(value, 0), 1);
  }
  for (const value of ["não", "nao", "n", "false", "0", "no"]) {
    assert.equal(parseImportBoolean(value, 1), 0);
  }
});

test("rejects an unknown CSV boolean instead of silently treating it as false", () => {
  assert.throws(
    () => parseImportBoolean("talvez", 1, "Controla estoque"),
    /Controla estoque deve ser/
  );
});

test("interprets CSV product status as active or inactive", () => {
  for (const value of ["ATIVO", "ativo", "1", "sim"]) {
    assert.equal(parseImportStatus(value, 0), 1);
  }
  for (const value of ["INATIVO", "inativo", "0", "não"]) {
    assert.equal(parseImportStatus(value, 1), 0);
  }
});

test("rejects an unknown CSV product status", () => {
  assert.throws(
    () => parseImportStatus("pendente"),
    /Status deve ser/
  );
});
