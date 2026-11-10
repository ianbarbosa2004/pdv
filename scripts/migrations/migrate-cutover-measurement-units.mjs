import mysql from "mysql2/promise";
import { loadMigrationConfig } from "../../src/server/config.js";

const tableExists = async (connection, tableName) => {
  const [rows] = await connection.execute(
    `SELECT 1
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
};

const requireTable = async (connection, tableName) => {
  if (!await tableExists(connection, tableName)) {
    throw new Error(`A tabela ${tableName} não existe.`);
  }
};

const countRows = async (connection, sql) => {
  const [[row]] = await connection.query(sql);
  return Number(row.count);
};

const migrateRecipeReferences = async (connection) => {
  const unmappedUnitReferences = await countRows(connection, `
    SELECT COUNT(*) AS count
    FROM recipe_definitions recipes
    LEFT JOIN unit_migration_map map
      ON map.idLegacyCulinaryUnit = recipes.idCulinaryUnitYieldRecipe
    WHERE recipes.idCulinaryUnitYieldRecipe IS NOT NULL
      AND map.idUnifiedUnit IS NULL
  `) + await countRows(connection, `
    SELECT COUNT(*) AS count
    FROM recipe_components components
    LEFT JOIN unit_migration_map map
      ON map.idLegacyCulinaryUnit = components.idCulinaryUnitRecipeComponent
    WHERE components.idCulinaryUnitRecipeComponent IS NOT NULL
      AND map.idUnifiedUnit IS NULL
  `);
  const unmappedConversionReferences = await countRows(connection, `
    SELECT COUNT(*) AS count
    FROM recipe_components components
    LEFT JOIN unit_conversion_migration_map map
      ON map.idLegacyCulinaryUnitConversion = components.idCulinaryUnitConversionRecipeComponent
    WHERE components.idCulinaryUnitConversionRecipeComponent IS NOT NULL
      AND map.idUnifiedUnitConversion IS NULL
  `);
  if (unmappedUnitReferences || unmappedConversionReferences) {
    throw new Error(
      `Existem referências sem mapeamento: ${unmappedUnitReferences} unidades e ` +
      `${unmappedConversionReferences} conversões.`
    );
  }

  await connection.query(`
    UPDATE recipe_definitions recipes
    INNER JOIN unit_migration_map map
      ON map.idLegacyCulinaryUnit = recipes.idCulinaryUnitYieldRecipe
    SET recipes.idCulinaryUnitYieldRecipe = map.idUnifiedUnit
    WHERE recipes.idCulinaryUnitYieldRecipe IS NOT NULL
  `);
  await connection.query(`
    UPDATE recipe_components components
    INNER JOIN unit_migration_map map
      ON map.idLegacyCulinaryUnit = components.idCulinaryUnitRecipeComponent
    SET components.idCulinaryUnitRecipeComponent = map.idUnifiedUnit
    WHERE components.idCulinaryUnitRecipeComponent IS NOT NULL
  `);
  await connection.query(`
    UPDATE recipe_components components
    INNER JOIN unit_conversion_migration_map map
      ON map.idLegacyCulinaryUnitConversion = components.idCulinaryUnitConversionRecipeComponent
    SET components.idCulinaryUnitConversionRecipeComponent = map.idUnifiedUnitConversion
    WHERE components.idCulinaryUnitConversionRecipeComponent IS NOT NULL
  `);
  await connection.query(
    "ALTER TABLE recipe_definitions MODIFY COLUMN idCulinaryUnitYieldRecipe BIGINT UNSIGNED NULL"
  );
  await connection.query(
    "ALTER TABLE recipe_components MODIFY COLUMN idCulinaryUnitRecipeComponent BIGINT UNSIGNED NULL"
  );
  await connection.query(
    "ALTER TABLE recipe_components MODIFY COLUMN idCulinaryUnitConversionRecipeComponent BIGINT UNSIGNED NULL"
  );
};

const validateCanonicalReferences = async (connection) => {
  const orphanUnits = await countRows(connection, `
    SELECT COUNT(*) AS count
    FROM recipe_components components
    LEFT JOIN units ON units.idUnit = components.idCulinaryUnitRecipeComponent
    WHERE components.idCulinaryUnitRecipeComponent IS NOT NULL
      AND units.idUnit IS NULL
  `) + await countRows(connection, `
    SELECT COUNT(*) AS count
    FROM recipe_definitions recipes
    LEFT JOIN units ON units.idUnit = recipes.idCulinaryUnitYieldRecipe
    WHERE recipes.idCulinaryUnitYieldRecipe IS NOT NULL
      AND units.idUnit IS NULL
  `);
  const orphanConversions = await countRows(connection, `
    SELECT COUNT(*) AS count
    FROM recipe_components components
    LEFT JOIN unit_conversions conversions
      ON conversions.idUnitConversion = components.idCulinaryUnitConversionRecipeComponent
    WHERE components.idCulinaryUnitConversionRecipeComponent IS NOT NULL
      AND conversions.idUnitConversion IS NULL
  `);
  if (orphanUnits || orphanConversions) {
    throw new Error(
      `Referências órfãs após a conversão: ${orphanUnits} unidades e ` +
      `${orphanConversions} conversões.`
    );
  }
};

const main = async () => {
  const config = await loadMigrationConfig();
  const connection = await mysql.createConnection({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
    charset: "utf8mb4",
    connectTimeout: 5000
  });

  try {
    await requireTable(connection, "units");
    await requireTable(connection, "unit_conversions");
    await requireTable(connection, "recipe_definitions");
    await requireTable(connection, "recipe_components");

    const hasLegacyUnits = await tableExists(connection, "culinary_units");
    const hasUnitMap = await tableExists(connection, "unit_migration_map");
    const hasConversionMap = await tableExists(connection, "unit_conversion_migration_map");
    if (!hasLegacyUnits && !hasUnitMap && !hasConversionMap) {
      console.log("Corte já aplicado: nenhuma tabela legada foi encontrada.");
      return;
    }
    if (!hasUnitMap || !hasConversionMap) {
      throw new Error("Os mapas de migração são necessários para validar o corte.");
    }

    await connection.beginTransaction();
    await migrateRecipeReferences(connection);
    await validateCanonicalReferences(connection);
    await connection.query("DROP TABLE unit_conversion_migration_map");
    await connection.query("DROP TABLE unit_migration_map");
    if (await tableExists(connection, "culinary_unit_conversions")) {
      await connection.query("DROP TABLE culinary_unit_conversions");
    }
    if (await tableExists(connection, "culinary_units")) {
      await connection.query("DROP TABLE culinary_units");
    }
    await connection.commit();
    console.log("Corte concluído: referências de Receitas migradas e tabelas legadas removidas.");
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error(`Falha no corte do catálogo de unidades: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
};

main();
