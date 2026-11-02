import mysql from "mysql2/promise";
import { getConfig } from "../../src/server/config.js";

const physicalStates = [
  ["liquid_light", "Líquido Fluído / Leve", "Água, sucos, destilados, azeite, vinagre"],
  ["liquid_viscous", "Líquido Viscoso / Denso", "Leite condensado, mel, xaropes densos, melaço"],
  ["powder_light", "Pó Fino / Leve", "Farinha de trigo, fermento, cacau em pó, amido de milho"],
  ["powder_heavy", "Granulado / Pó Pesado", "Açúcar refinado, sal, café moído, grãos crus"],
  ["pasty", "Pastoso / Emulsão", "Maionese, requeijão, manteiga, ketchup, catupiry"],
  ["solid_chopped", "Sólido Picado / Cubos", "Bacon picado, alho picado, ervas e legumes em cubos"],
  ["solid_whole", "Sólido Inteiro / Peça", "Ovos, frutas, legumes e peças inteiras"],
  ["solid_sliced", "Sólido Fatiado", "Frutas, legumes, carnes e queijos fatiados"],
  ["solid_grated", "Sólido Ralado / Triturado", "Queijos, coco, alho e outros ingredientes ralados ou triturados"],
  ["frozen", "Congelado", "Polpas, legumes e outros alimentos mantidos congelados"]
];

const units = [
  ["g", "Grama", "g", "weight", "Massa/Peso base em gramas"],
  ["ml", "Mililitro", "ml", "volume", "Volume base em mililitros"],
  ["un", "Unidade", "un", "unit", "Contagem unitária"],
  ["kg", "Quilograma", "g", "weight", "Massa equivalente a 1.000 gramas"],
  ["l", "Litro", "ml", "volume", "Volume equivalente a 1.000 mililitros"],
  ["gota", "Gota", "ml", "volume", "Gotas (extratos, adoçantes, bitters)"],
  ["pitada", "Pitada (Pinch)", "g", "weight", "Pitada de condimentos sólidos/pós"],
  ["colher_cafe", "Colher de Café", "ml", "volume", "Colher de café padrão (~2,5ml)"],
  ["colher_cha", "Colher de Chá", "ml", "volume", "Colher de chá padrão (~5ml)"],
  ["colher_sobremesa", "Colher de Sobremesa", "ml", "volume", "Colher de sobremesa padrão (~10ml)"],
  ["colher_sopa", "Colher de Sopa", "ml", "volume", "Colher de sopa padrão (~15ml)"],
  ["dose_jigger", "Dose / Jigger", "ml", "volume", "Dose padrão de bar (50ml)"],
  ["xicara_cha", "Xícara de Chá", "ml", "volume", "Xícara de chá padrão (~240ml)"],
  ["duzia", "Dúzia", "un", "unit", "Quantidade equivalente a 12 unidades"]
];

const conversions = [
  ["gota", "ml", "liquid_light", 0.05, "Adoçante, corante, amargo/bitters"],
  ["colher_cha", "ml", "liquid_light", 5, "Essências, suco de limão concentrado"],
  ["colher_sopa", "ml", "liquid_light", 15, "Azeite, molho de soja, vinagre, xaropes"],
  ["dose_jigger", "ml", "liquid_light", 50, "Destilados (Cachaça, Gin, Rum, Vodka)"],
  ["xicara_cha", "ml", "liquid_light", 240, "Água, leite, sucos, caldos fluídos"],
  ["colher_cha", "g", "liquid_viscous", 7, "Mel, melaço, glicose"],
  ["colher_sopa", "g", "liquid_viscous", 20, "Leite condensado, mel, cobertura de chocolate"],
  ["xicara_cha", "g", "liquid_viscous", 300, "Leite condensado, doce de leite concentrado"],
  ["pitada", "g", "powder_light", 0.5, "Pimenta, canela em pó, noz-moscada"],
  ["colher_cha", "g", "powder_light", 3, "Fermento em pó, bicarbonato, cacau"],
  ["colher_sopa", "g", "powder_light", 10, "Farinha de trigo, leite em pó, amido de milho"],
  ["xicara_cha", "g", "powder_light", 120, "Farinha de trigo peneirada, cacau em pó"],
  ["pitada", "g", "powder_heavy", 0.5, "Sal refinado"],
  ["colher_cha", "g", "powder_heavy", 5, "Sal refinado, açúcar refinado"],
  ["colher_sopa", "g", "powder_heavy", 15, "Açúcar refinado, sal grosso, café moído"],
  ["xicara_cha", "g", "powder_heavy", 190, "Açúcar refinado, arroz cru, feijão cru"],
  ["colher_cha", "g", "pasty", 5, "Manteiga, margarina, mostarda, ketchup"],
  ["colher_sopa", "g", "pasty", 16, "Requeijão, maionese, catupiry, cream cheese"],
  ["xicara_cha", "g", "pasty", 230, "Maionese base, requeijão cremoso"],
  ["colher_sopa", "g", "solid_chopped", 10, "Cheiro-verde picado, alho picado/triturado"],
  ["xicara_cha", "g", "solid_chopped", 115, "Bacon picado, alho picado, ervas e legumes em cubos"],
  ["colher_sopa", "g", "solid_whole", 10, "Referência aproximada para sólidos inteiros fracionados"],
  ["xicara_cha", "g", "solid_whole", 115, "Referência aproximada para sólidos inteiros fracionados"],
  ["colher_sopa", "g", "solid_sliced", 10, "Referência aproximada para sólidos fatiados"],
  ["xicara_cha", "g", "solid_sliced", 115, "Referência aproximada para sólidos fatiados"],
  ["colher_sopa", "g", "solid_grated", 10, "Referência aproximada para sólidos ralados ou triturados"],
  ["xicara_cha", "g", "solid_grated", 115, "Referência aproximada para sólidos ralados ou triturados"],
  ["colher_sopa", "g", "frozen", 10, "Referência aproximada para alimentos congelados"],
  ["xicara_cha", "g", "frozen", 115, "Referência aproximada para alimentos congelados"],
  ["kg", "g", "liquid_light", 1000, "Conversão universal de massa"],
  ["kg", "g", "liquid_viscous", 1000, "Conversão universal de massa"],
  ["kg", "g", "powder_light", 1000, "Conversão universal de massa"],
  ["kg", "g", "powder_heavy", 1000, "Conversão universal de massa"],
  ["kg", "g", "pasty", 1000, "Conversão universal de massa"],
  ["kg", "g", "solid_chopped", 1000, "Conversão universal de massa"],
  ["kg", "g", "solid_whole", 1000, "Conversão universal de massa"],
  ["kg", "g", "solid_sliced", 1000, "Conversão universal de massa"],
  ["kg", "g", "solid_grated", 1000, "Conversão universal de massa"],
  ["kg", "g", "frozen", 1000, "Conversão universal de massa"],
  ["l", "ml", "liquid_light", 1000, "Conversão universal de volume"],
  ["l", "ml", "liquid_viscous", 1000, "Conversão universal de volume"],
  ["colher_cafe", "ml", "liquid_light", 2.5, "Medida culinária volumétrica aproximada"],
  ["colher_sobremesa", "ml", "liquid_light", 10, "Medida culinária volumétrica aproximada"],
  ["duzia", "un", "solid_whole", 12, "Conversão de contagem"]
];

const createSchema = async (connection) => {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS culinary_units (
      idCulinaryUnit INT AUTO_INCREMENT PRIMARY KEY,
      codeCulinaryUnit VARCHAR(20) NOT NULL UNIQUE,
      nameCulinaryUnit VARCHAR(50) NOT NULL,
      baseUnitCulinaryUnit ENUM('g', 'ml', 'un') NOT NULL,
      categoryCulinaryUnit ENUM('weight', 'volume', 'unit') NOT NULL,
      descriptionCulinaryUnit VARCHAR(100) NULL,
      isActiveCulinaryUnit TINYINT(1) NOT NULL DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await connection.query(`
    CREATE TABLE IF NOT EXISTS physical_states (
      idPhysicalState INT AUTO_INCREMENT PRIMARY KEY,
      codePhysicalState VARCHAR(30) NOT NULL UNIQUE,
      namePhysicalState VARCHAR(50) NOT NULL,
      descriptionPhysicalState VARCHAR(150) NULL,
      isActivePhysicalState TINYINT(1) NOT NULL DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await connection.query(`
    CREATE TABLE IF NOT EXISTS culinary_unit_conversions (
      idCulinaryUnitConversion INT AUTO_INCREMENT PRIMARY KEY,
      idFromCulinaryUnitConversion INT NOT NULL,
      idToCulinaryUnitConversion INT NOT NULL,
      idPhysicalStateCulinaryUnitConversion INT NOT NULL,
      factorCulinaryUnitConversion DECIMAL(10, 4) NOT NULL,
      notesCulinaryUnitConversion VARCHAR(150) NULL,
      FOREIGN KEY (idFromCulinaryUnitConversion) REFERENCES culinary_units(idCulinaryUnit) ON DELETE CASCADE,
      FOREIGN KEY (idToCulinaryUnitConversion) REFERENCES culinary_units(idCulinaryUnit) ON DELETE CASCADE,
      FOREIGN KEY (idPhysicalStateCulinaryUnitConversion) REFERENCES physical_states(idPhysicalState) ON DELETE RESTRICT,
      UNIQUE KEY uqCulinaryUnitConversions (idFromCulinaryUnitConversion, idToCulinaryUnitConversion, idPhysicalStateCulinaryUnitConversion)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

const columnExists = async (connection, tableName, columnName) => {
  const [rows] = await connection.execute(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
};

const renameColumn = async (connection, tableName, oldName, newName, definition) => {
  if (await columnExists(connection, tableName, oldName)) {
    await connection.query(
      `ALTER TABLE \`${tableName}\` CHANGE COLUMN \`${oldName}\` \`${newName}\` ${definition}`
    );
  }
};

const migrateColumnNames = async (connection) => {
  await renameColumn(connection, "physical_states", "id", "idPhysicalState", "INT NOT NULL AUTO_INCREMENT");
  await renameColumn(connection, "physical_states", "code", "codePhysicalState", "VARCHAR(30) NOT NULL");
  await renameColumn(connection, "physical_states", "name", "namePhysicalState", "VARCHAR(50) NOT NULL");
  await renameColumn(connection, "physical_states", "description", "descriptionPhysicalState", "VARCHAR(150) NULL");

  await renameColumn(connection, "culinary_units", "id", "idCulinaryUnit", "INT NOT NULL AUTO_INCREMENT");
  await renameColumn(connection, "culinary_units", "code", "codeCulinaryUnit", "VARCHAR(20) NOT NULL");
  await renameColumn(connection, "culinary_units", "name", "nameCulinaryUnit", "VARCHAR(50) NOT NULL");
  await renameColumn(connection, "culinary_units", "base_unit", "baseUnitCulinaryUnit", "ENUM('g', 'ml', 'un') NOT NULL");
  await renameColumn(connection, "culinary_units", "category", "categoryCulinaryUnit", "ENUM('weight', 'volume', 'unit') NOT NULL");
  await renameColumn(connection, "culinary_units", "description", "descriptionCulinaryUnit", "VARCHAR(100) NULL");

  await renameColumn(connection, "culinary_unit_conversions", "id", "idCulinaryUnitConversion", "INT NOT NULL AUTO_INCREMENT");
  await renameColumn(connection, "culinary_unit_conversions", "from_unit_id", "idFromCulinaryUnitConversion", "INT NOT NULL");
  await renameColumn(connection, "culinary_unit_conversions", "to_unit_id", "idToCulinaryUnitConversion", "INT NOT NULL");
  await renameColumn(connection, "culinary_unit_conversions", "physical_state_id", "idPhysicalStateCulinaryUnitConversion", "INT NOT NULL");
  await renameColumn(connection, "culinary_unit_conversions", "factor", "factorCulinaryUnitConversion", "DECIMAL(10, 4) NOT NULL");
  await renameColumn(connection, "culinary_unit_conversions", "notes", "notesCulinaryUnitConversion", "VARCHAR(150) NULL");
};

const upsertReferenceRows = async (connection) => {
  for (const [code, name, description] of physicalStates) {
    await connection.execute(
      `INSERT INTO physical_states (codePhysicalState, namePhysicalState, descriptionPhysicalState)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         namePhysicalState = VALUES(namePhysicalState),
         descriptionPhysicalState = VALUES(descriptionPhysicalState)`,
      [code, name, description]
    );
  }
  for (const [code, name, baseUnit, category, description] of units) {
    await connection.execute(
      `INSERT INTO culinary_units
        (codeCulinaryUnit, nameCulinaryUnit, baseUnitCulinaryUnit, categoryCulinaryUnit, descriptionCulinaryUnit)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         nameCulinaryUnit = VALUES(nameCulinaryUnit),
         baseUnitCulinaryUnit = VALUES(baseUnitCulinaryUnit),
         categoryCulinaryUnit = VALUES(categoryCulinaryUnit),
         descriptionCulinaryUnit = VALUES(descriptionCulinaryUnit)`,
      [code, name, baseUnit, category, description]
    );
  }
};

const loadIds = async (connection, table, codes) => {
  const placeholders = codes.map(() => "?").join(", ");
  const [rows] = await connection.execute(
    `SELECT ${table === "culinary_units" ? "idCulinaryUnit AS id, codeCulinaryUnit" : "idPhysicalState AS id, codePhysicalState"} AS code
     FROM ${table}
     WHERE ${table === "culinary_units" ? "codeCulinaryUnit" : "codePhysicalState"} IN (${placeholders})`,
    codes
  );
  return new Map(rows.map(({ id, code }) => [code, id]));
};

const upsertConversions = async (connection) => {
  const unitIds = await loadIds(connection, "culinary_units", [...new Set(conversions.flatMap(([from, to]) => [from, to]))]);
  const stateIds = await loadIds(connection, "physical_states", [...new Set(conversions.map(([, , state]) => state))]);
  for (const [fromCode, toCode, stateCode, factor, notes] of conversions) {
    const fromUnitId = unitIds.get(fromCode);
    const toUnitId = unitIds.get(toCode);
    const physicalStateId = stateIds.get(stateCode);
    if (!fromUnitId || !toUnitId || !physicalStateId) {
      throw new Error(`Referência de conversão não encontrada: ${fromCode} -> ${toCode} / ${stateCode}.`);
    }
    await connection.execute(
      `INSERT INTO culinary_unit_conversions
        (idFromCulinaryUnitConversion, idToCulinaryUnitConversion,
         idPhysicalStateCulinaryUnitConversion, factorCulinaryUnitConversion,
         notesCulinaryUnitConversion)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         factorCulinaryUnitConversion = VALUES(factorCulinaryUnitConversion),
         notesCulinaryUnitConversion = VALUES(notesCulinaryUnitConversion)`,
      [fromUnitId, toUnitId, physicalStateId, factor, notes]
    );
  }
  const [baseUnits] = await connection.execute(
    `SELECT idCulinaryUnit FROM culinary_units WHERE codeCulinaryUnit IN ('g', 'ml', 'un')`
  );
  const [states] = await connection.execute("SELECT idPhysicalState FROM physical_states");
  for (const { idCulinaryUnit } of baseUnits) {
    for (const { idPhysicalState } of states) {
      await connection.execute(
        `INSERT INTO culinary_unit_conversions
          (idFromCulinaryUnitConversion, idToCulinaryUnitConversion,
           idPhysicalStateCulinaryUnitConversion, factorCulinaryUnitConversion,
           notesCulinaryUnitConversion)
         VALUES (?, ?, ?, 1.0000, ?)
         ON DUPLICATE KEY UPDATE
           factorCulinaryUnitConversion = VALUES(factorCulinaryUnitConversion),
           notesCulinaryUnitConversion = VALUES(notesCulinaryUnitConversion)`,
        [idCulinaryUnit, idCulinaryUnit, idPhysicalState, "Unidade base"]
      );
    }
  }
};

const main = async () => {
  const config = getConfig();
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
    await createSchema(connection);
    await migrateColumnNames(connection);
    await connection.beginTransaction();
    await upsertReferenceRows(connection);
    await upsertConversions(connection);
    await connection.commit();

    const [[unitCount]] = await connection.query("SELECT COUNT(*) AS count FROM culinary_units");
    const [[stateCount]] = await connection.query("SELECT COUNT(*) AS count FROM physical_states");
    const [[conversionCount]] = await connection.query("SELECT COUNT(*) AS count FROM culinary_unit_conversions");
    console.log(`Migração concluída: ${unitCount.count} unidades, ${stateCount.count} estados e ${conversionCount.count} conversões.`);
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    await connection.end();
  }
};

main().catch((error) => {
  console.error(`Falha na migração de unidades culinárias: ${error.message}`);
  process.exitCode = 1;
});
