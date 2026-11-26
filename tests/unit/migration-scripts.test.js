import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("migração de custos reprocessa entradas confirmadas por política", async () => {
  const source = await readFile(
    "scripts/migrations/migrate-recalculate-product-costs.mjs",
    "utf8"
  );
  assert.match(source, /calculateCostUpdateSequence/u);
  assert.match(source, /calculateCostForPolicyChange/u);
  assert.match(source, /statusFiscalEntry = 'confirmed'/u);
  assert.match(source, /process\.argv\.includes\("--apply"\)/u);
  assert.match(source, /entryDateFiscalDocumentItem/u);
  assert.match(source, /packageQuantityProduct/u);
});

test("migração de receitas usa perda e quantidade informada sem persistir quantidade útil", async () => {
  const source = await readFile(
    "scripts/migrations/migrate-recalculate-recipe-usable-quantities.mjs",
    "utf8"
  );
  assert.match(source, /propagateRecipeCosts/u);
  assert.match(source, /lossPercentRecipeComponent/u);
  assert.match(source, /quantityRecipeComponent/u);
  assert.match(source, /process\.argv\.includes\("--apply"\)/u);
});

test("migrações usam usuário root e solicitação oculta da senha", async () => {
  const migrations = [
    "migrate-embalagens-to-uso-consumo.mjs",
    "migrate-culinary-units.mjs",
    "migrate-cutover-measurement-units.mjs",
    "migrate-margin-balancers-group-only.mjs",
    "migrate-products-physical-state-fk.mjs",
    "migrate-recalculate-product-costs.mjs",
    "migrate-recalculate-recipe-usable-quantities.mjs",
    "migrate-remove-nfce-certificate-path.mjs",
    "migrate-unify-measurement-units.mjs",
    "migrate-uppercase-data.mjs"
  ];

  for (const migration of migrations) {
    const source = await readFile(`scripts/migrations/${migration}`, "utf8");
    assert.match(source, /loadRootMigrationConfig/u, migration);
  }
});

test("comandos npm de migração não dependem de arquivo .env", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  for (const [name, command] of Object.entries(packageJson.scripts)) {
    if (!name.startsWith("migrate:")) continue;
    assert.doesNotMatch(command, /--env-file=\.env/u, name);
  }
});
