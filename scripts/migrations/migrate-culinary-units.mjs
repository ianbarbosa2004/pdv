import mysql from "mysql2/promise";
import { loadMigrationConfig } from "../../src/server/config.js";

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
  ["colher_cafe", "Colher de Café", "common", "general", "Medida culinária variável conforme o estado físico (~2,5ml em líquidos)"],
  ["colher_cha", "Colher de Chá", "common", "general", "Medida culinária variável conforme o estado físico (~5ml em líquidos)"],
  ["colher_sobremesa", "Colher de Sobremesa", "common", "general", "Medida culinária variável conforme o estado físico (~10ml em líquidos)"],
  ["colher_sopa", "Colher de Sopa", "common", "general", "Medida culinária variável conforme o estado físico (~10ml em líquidos)"],
  ["dose_jigger", "Dose / Jigger", "common", "general", "Dose de destilado variável; referência de 45ml"],
  ["xicara_cha", "Xícara de Chá", "common", "general", "Medida culinária variável conforme o estado físico (~200ml em líquidos)"],
  ["duzia", "Dúzia", "un", "unit", "Quantidade equivalente a 12 unidades"]
];

const normalizeCulinaryUnitName = (value) => {
  const minorWords = new Set(["a", "as", "à", "às", "ao", "aos", "da", "das", "de", "do", "dos", "e"]);
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR")
    .split(/(\s+|\/|-)/u)
    .map((part, index) => {
      if (!part || /^\s+$/u.test(part) || part === "/" || part === "-") return part;
      if (index > 0 && minorWords.has(part)) return part;
      return `${part.charAt(0).toLocaleUpperCase("pt-BR")}${part.slice(1)}`;
    })
    .join("");
};

const conversions = [
  ["gota", "ml", "liquid_light", 0.05, "Adoçante, corante, amargo/bitters"],
  ["colher_cha", "ml", "liquid_light", 5, "Essências, suco de limão concentrado"],
  ["colher_cafe", "ml", "liquid_light", 2.5, "Referência volumétrica aproximada; fonte Anvisa/SES-RS"],
  ["colher_cha", "ml", "liquid_light", 5, "Essências, suco de limão concentrado; referência Anvisa"],
  ["colher_sobremesa", "ml", "liquid_light", 10, "Referência volumétrica aproximada; fonte SES-RS"],
  ["colher_sopa", "ml", "liquid_light", 10, "Azeite, molho de soja, vinagre, xaropes; referência Anvisa"],
  ["dose_jigger", "ml", "liquid_light", 45, "Destilados; referência brasileira aproximada"],
  ["xicara_cha", "ml", "liquid_light", 200, "Água, leite, sucos, caldos fluídos; referência Anvisa"],
  ["colher_cafe", "ml", "liquid_viscous", 2.5, "Volume aproximado; a massa depende da densidade"],
  ["colher_cha", "ml", "liquid_viscous", 5, "Volume aproximado; a massa depende da densidade"],
  ["colher_sobremesa", "ml", "liquid_viscous", 10, "Volume aproximado; a massa depende da densidade"],
  ["colher_sopa", "ml", "liquid_viscous", 10, "Volume aproximado; a massa depende da densidade"],
  ["xicara_cha", "ml", "liquid_viscous", 200, "Volume aproximado; a massa depende da densidade"],
  ["colher_cha", "g", "liquid_viscous", 7, "Mel, melaço, glicose"],
  ["colher_cafe", "g", "liquid_viscous", 3.5, "Referência aproximada; massa depende da densidade"],
  ["colher_sobremesa", "g", "liquid_viscous", 14, "Referência aproximada; massa depende da densidade"],
  ["colher_sopa", "g", "liquid_viscous", 20, "Leite condensado, mel, cobertura de chocolate"],
  ["xicara_cha", "g", "liquid_viscous", 300, "Leite condensado, doce de leite concentrado"],
  ["pitada", "g", "powder_light", 0.5, "Pimenta, canela em pó, noz-moscada"],
  ["colher_cha", "g", "powder_light", 3, "Fermento em pó, bicarbonato, cacau"],
  ["colher_cafe", "g", "powder_light", 1.5, "Referência aproximada para pós leves"],
  ["colher_sobremesa", "g", "powder_light", 6, "Referência aproximada para pós leves"],
  ["colher_sopa", "g", "powder_light", 10, "Farinha de trigo, leite em pó, amido de milho"],
  ["xicara_cha", "g", "powder_light", 120, "Farinha de trigo peneirada, cacau em pó"],
  ["pitada", "g", "powder_heavy", 0.5, "Sal refinado"],
  ["colher_cha", "g", "powder_heavy", 5, "Sal refinado, açúcar refinado"],
  ["colher_cafe", "g", "powder_heavy", 2.5, "Referência aproximada para pós densos"],
  ["colher_sobremesa", "g", "powder_heavy", 10, "Referência aproximada para pós densos"],
  ["colher_sopa", "g", "powder_heavy", 15, "Açúcar refinado, sal grosso, café moído"],
  ["xicara_cha", "g", "powder_heavy", 190, "Açúcar refinado, arroz cru, feijão cru"],
  ["colher_cha", "g", "pasty", 5, "Manteiga, margarina, mostarda, ketchup"],
  ["colher_cafe", "g", "pasty", 2.5, "Referência aproximada para pastosos"],
  ["colher_sobremesa", "g", "pasty", 10, "Referência aproximada para pastosos"],
  ["colher_cha", "g", "solid_chopped", 5, "Referência aproximada para sólidos picados"],
  ["colher_cafe", "g", "solid_chopped", 2.5, "Referência aproximada para sólidos picados"],
  ["colher_sobremesa", "g", "solid_chopped", 10, "Referência aproximada para sólidos picados"],
  ["colher_cha", "g", "solid_whole", 5, "Referência aproximada para sólidos inteiros fracionados"],
  ["colher_cafe", "g", "solid_whole", 2.5, "Referência aproximada para sólidos inteiros fracionados"],
  ["colher_sobremesa", "g", "solid_whole", 10, "Referência aproximada para sólidos inteiros fracionados"],
  ["colher_cha", "g", "solid_sliced", 5, "Referência aproximada para sólidos fatiados"],
  ["colher_cafe", "g", "solid_sliced", 2.5, "Referência aproximada para sólidos fatiados"],
  ["colher_sobremesa", "g", "solid_sliced", 10, "Referência aproximada para sólidos fatiados"],
  ["colher_cha", "g", "solid_grated", 5, "Referência aproximada para sólidos ralados ou triturados"],
  ["colher_cafe", "g", "solid_grated", 2.5, "Referência aproximada para sólidos ralados ou triturados"],
  ["colher_sobremesa", "g", "solid_grated", 10, "Referência aproximada para sólidos ralados ou triturados"],
  ["colher_cha", "g", "frozen", 5, "Referência aproximada para alimentos congelados"],
  ["colher_cafe", "g", "frozen", 2.5, "Referência aproximada para alimentos congelados"],
  ["colher_sobremesa", "g", "frozen", 10, "Referência aproximada para alimentos congelados"],
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
  ["g", "kg", "liquid_light", 0.001, "Conversão universal de massa"],
  ["g", "kg", "liquid_viscous", 0.001, "Conversão universal de massa"],
  ["g", "kg", "powder_light", 0.001, "Conversão universal de massa"],
  ["g", "kg", "powder_heavy", 0.001, "Conversão universal de massa"],
  ["g", "kg", "pasty", 0.001, "Conversão universal de massa"],
  ["g", "kg", "solid_chopped", 0.001, "Conversão universal de massa"],
  ["g", "kg", "solid_whole", 0.001, "Conversão universal de massa"],
  ["g", "kg", "solid_sliced", 0.001, "Conversão universal de massa"],
  ["g", "kg", "solid_grated", 0.001, "Conversão universal de massa"],
  ["g", "kg", "frozen", 0.001, "Conversão universal de massa"],
  ["l", "ml", "liquid_light", 1000, "Conversão universal de volume"],
  ["l", "ml", "liquid_viscous", 1000, "Conversão universal de volume"],
  ["ml", "l", "liquid_light", 0.001, "Conversão universal de volume"],
  ["ml", "l", "liquid_viscous", 0.001, "Conversão universal de volume"],
  ["colher_cafe", "ml", "liquid_light", 2.5, "Referência volumétrica aproximada; fonte Anvisa/SES-RS"],
  ["colher_sobremesa", "ml", "liquid_light", 10, "Referência volumétrica aproximada; fonte SES-RS"],
  ["duzia", "un", "solid_whole", 12, "Conversão de contagem"]
];

const createSchema = async (connection) => {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS culinary_units (
      idCulinaryUnit INT AUTO_INCREMENT PRIMARY KEY,
      codeCulinaryUnit VARCHAR(20) NOT NULL UNIQUE,
      nameCulinaryUnit VARCHAR(50) NOT NULL,
      baseUnitCulinaryUnit ENUM('g', 'ml', 'un', 'common') NOT NULL,
      categoryCulinaryUnit ENUM('weight', 'volume', 'unit', 'general') NOT NULL,
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

const ensureConversionUniqueIndex = async (connection) => {
  const [indexes] = await connection.execute(
    `SELECT INDEX_NAME,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS indexColumns
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'culinary_unit_conversions'
       AND NON_UNIQUE = 0
     GROUP BY INDEX_NAME`
  );
  const hasUniqueIndex = indexes.some(({ indexColumns }) =>
    indexColumns === "idFromCulinaryUnitConversion,idToCulinaryUnitConversion,idPhysicalStateCulinaryUnitConversion"
  );
  if (hasUniqueIndex) return;
  await connection.execute(
    `DELETE duplicate
     FROM culinary_unit_conversions duplicate
     INNER JOIN culinary_unit_conversions original
       ON original.idFromCulinaryUnitConversion = duplicate.idFromCulinaryUnitConversion
      AND original.idToCulinaryUnitConversion = duplicate.idToCulinaryUnitConversion
      AND original.idPhysicalStateCulinaryUnitConversion = duplicate.idPhysicalStateCulinaryUnitConversion
      AND original.idCulinaryUnitConversion < duplicate.idCulinaryUnitConversion`
  );
  await connection.execute(
    `ALTER TABLE culinary_unit_conversions
     ADD UNIQUE KEY uqCulinaryUnitConversions
     (idFromCulinaryUnitConversion, idToCulinaryUnitConversion, idPhysicalStateCulinaryUnitConversion)`
  );
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
  await renameColumn(connection, "culinary_units", "base_unit", "baseUnitCulinaryUnit", "ENUM('g', 'ml', 'un', 'common') NOT NULL");
  await renameColumn(connection, "culinary_units", "category", "categoryCulinaryUnit", "ENUM('weight', 'volume', 'unit', 'general') NOT NULL");
  await renameColumn(connection, "culinary_units", "description", "descriptionCulinaryUnit", "VARCHAR(100) NULL");
  await connection.query(
    `ALTER TABLE culinary_units
     MODIFY COLUMN baseUnitCulinaryUnit ENUM('g', 'ml', 'un', 'common') NOT NULL,
     MODIFY COLUMN categoryCulinaryUnit ENUM('weight', 'volume', 'unit', 'general') NOT NULL`
  );
  if (!(await columnExists(connection, "culinary_units", "isActiveCulinaryUnit"))) {
    await connection.query(
      "ALTER TABLE culinary_units ADD COLUMN isActiveCulinaryUnit TINYINT(1) NOT NULL DEFAULT 1"
    );
  }
  if (!(await columnExists(connection, "physical_states", "isActivePhysicalState"))) {
    await connection.query(
      "ALTER TABLE physical_states ADD COLUMN isActivePhysicalState TINYINT(1) NOT NULL DEFAULT 1"
    );
  }

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
           descriptionPhysicalState = VALUES(descriptionPhysicalState),
           isActivePhysicalState = 1`,
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
         descriptionCulinaryUnit = VALUES(descriptionCulinaryUnit),
         isActiveCulinaryUnit = 1`,
      [code, normalizeCulinaryUnitName(name), baseUnit, category, description]
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
  await connection.execute(`
    INSERT INTO culinary_unit_conversions
      (idFromCulinaryUnitConversion, idToCulinaryUnitConversion,
       idPhysicalStateCulinaryUnitConversion, factorCulinaryUnitConversion,
       notesCulinaryUnitConversion)
    SELECT source.idCulinaryUnit, target.idCulinaryUnit, state.idPhysicalState,
           CASE source.codeCulinaryUnit
             WHEN 'g' THEN 1
             WHEN 'kg' THEN 1000
             WHEN 'ml' THEN 1
             WHEN 'l' THEN 1000
             WHEN 'un' THEN 1
             WHEN 'duzia' THEN 12
           END
           / CASE target.codeCulinaryUnit
             WHEN 'g' THEN 1
             WHEN 'kg' THEN 1000
             WHEN 'ml' THEN 1
             WHEN 'l' THEN 1000
             WHEN 'un' THEN 1
             WHEN 'duzia' THEN 12
           END,
           'Conversão universal entre unidades fixas'
    FROM culinary_units source
    INNER JOIN culinary_units target
      ON target.baseUnitCulinaryUnit = source.baseUnitCulinaryUnit
     AND target.codeCulinaryUnit IN ('g', 'kg', 'ml', 'l', 'un', 'duzia')
    CROSS JOIN physical_states state
    WHERE source.codeCulinaryUnit IN ('g', 'kg', 'ml', 'l', 'un', 'duzia')
    ON DUPLICATE KEY UPDATE
      factorCulinaryUnitConversion = VALUES(factorCulinaryUnitConversion),
      notesCulinaryUnitConversion = VALUES(notesCulinaryUnitConversion)
  `);
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
    await createSchema(connection);
    await migrateColumnNames(connection);
    await ensureConversionUniqueIndex(connection);
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
