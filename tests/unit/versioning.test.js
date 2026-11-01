import test from "node:test";
import assert from "node:assert/strict";
import { bumpVersion } from "../../scripts/versioning.mjs";

test("increments patch versions", () => {
  assert.equal(bumpVersion("0.1.2", "patch"), "0.1.3");
});

test("increments minor and resets patch", () => {
  assert.equal(bumpVersion("0.1.9", "minor"), "0.2.0");
});

test("increments major and resets minor and patch", () => {
  assert.equal(bumpVersion("0.9.9", "major"), "1.0.0");
});

test("rejects invalid version levels", () => {
  assert.throws(() => bumpVersion("0.1.2", "release"), /Nível de versão inválido/);
});
