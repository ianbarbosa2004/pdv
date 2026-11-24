import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { selectWritableLogDirectory } from "../../scripts/writable-log-directory.mjs";

test("selects the first directory that accepts a write probe", async () => {
  const root = await mkdtemp(join(tmpdir(), "pdv-log-dir-"));
  const candidate = join(root, "logs");

  try {
    assert.equal(selectWritableLogDirectory([candidate]), candidate);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("returns an empty path when no candidate is writable", () => {
  assert.equal(selectWritableLogDirectory([null, ""]), "");
});
