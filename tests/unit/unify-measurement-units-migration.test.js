import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("resolve conversões usando a coluna canônica do mapa de unidades", async () => {
  const migration = await readFile(
    "scripts/migrations/migrate-unify-measurement-units.mjs",
    "utf8"
  );

  assert.match(migration, /source\.idUnifiedUnit AS sourceId/u);
  assert.match(migration, /target\.idUnifiedUnit AS targetId/u);
  assert.match(
    migration,
    /SELECT source\.idUnit, target\.idUnit,[\s\S]*?INNER JOIN units source ON source\.idUnit = base\.idFromUnitConversion/u
  );
});

test("corte migra referências de receitas antes de remover tabelas legadas", async () => {
  const migration = await readFile(
    "scripts/migrations/migrate-cutover-measurement-units.mjs",
    "utf8"
  );

  assert.match(migration, /UPDATE recipe_definitions recipes[\s\S]*unit_migration_map/u);
  assert.match(migration, /UPDATE recipe_components components[\s\S]*unit_conversion_migration_map/u);
  assert.match(migration, /validateCanonicalReferences/u);
  assert.match(migration, /MODIFY COLUMN idCulinaryUnitRecipeComponent BIGINT UNSIGNED/u);
  assert.match(migration, /MODIFY COLUMN idCulinaryUnitConversionRecipeComponent BIGINT UNSIGNED/u);
  assert.match(migration, /DROP TABLE unit_conversion_migration_map/u);
  assert.match(migration, /DROP TABLE culinary_unit_conversions/u);
});
