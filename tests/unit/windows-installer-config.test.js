import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("keeps MSI and NSIS installers on the same upgrade identity", async () => {
  const config = JSON.parse(await readFile(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
  const windows = config.bundle.windows;

  assert.equal(windows.allowDowngrades, false);
  assert.equal(windows.nsis.installMode, "perMachine");
  assert.equal(windows.wix.upgradeCode, "b7ae7388-17ff-5008-a042-60036fbb382e");
});
