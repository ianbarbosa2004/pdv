import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { selectCurrentInstallerFiles } from "../../scripts/release-installer-selection.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("keeps MSI and NSIS installers on the same upgrade identity", async () => {
  const config = JSON.parse(await readFile(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
  const windows = config.bundle.windows;

  assert.equal(windows.allowDowngrades, false);
  assert.equal(windows.nsis.installMode, "perMachine");
  assert.equal(windows.wix.upgradeCode, "b7ae7388-17ff-5008-a042-60036fbb382e");
});

test("selects only the MSI and EXE for the current release version", () => {
  const selected = selectCurrentInstallerFiles([
    "PDV Zanzibar_0.16.3_x64_en-US.msi",
    "PDV Zanzibar_0.17.0_x64_en-US.msi",
    "PDV Zanzibar_0.17.0_x64-setup.exe",
    "PDV Zanzibar_0.18.0_x64_en-US.msi"
  ], {
    projectName: "PDV Zanzibar",
    version: "0.17.0"
  });

  assert.deepEqual([...selected.entries()], [
    [".exe", "PDV Zanzibar_0.17.0_x64-setup.exe"],
    [".msi", "PDV Zanzibar_0.17.0_x64_en-US.msi"]
  ]);
});

test("rejects duplicate installers for the current version", () => {
  assert.throws(() => selectCurrentInstallerFiles([
    "PDV Zanzibar_0.17.0_x64_en-US.msi",
    "PDV Zanzibar_0.17.0_x64_pt-BR.msi",
    "PDV Zanzibar_0.17.0_x64-setup.exe"
  ], {
    projectName: "PDV Zanzibar",
    version: "0.17.0"
  }), /Mais de um instalador \.msi/);
});
