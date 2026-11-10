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

const ensureColumn = async (connection, tableName, columnName, definition) => {
  if (!await columnExists(connection, tableName, columnName)) {
    await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${columnName} ${definition}`);
  }
};

const ensureSchema = async (connection) => {
  await connection.query(
    `ALTER TABLE units MODIFY COLUMN codeUnit VARCHAR(20) NOT NULL`
  );
  await ensureColumn(connection, "units", "isTaxableUnit", "TINYINT(1) NOT NULL DEFAULT 0");
  await ensureColumn(connection, "units", "isCulinaryUnit", "TINYINT(1) NOT NULL DEFAULT 0");
  await ensureColumn(connection, "units", "baseUnitUnit", "ENUM('g', 'ml', 'un', 'common') NULL");
  await ensureColumn(connection, "units", "categoryUnit", "ENUM('weight', 'volume', 'unit', 'general') NULL");

  await connection.query(`
    CREATE TABLE IF NOT EXISTS unit_migration_map (
      idLegacyCulinaryUnit INT NOT NULL,
      idUnifiedUnit BIGINT UNSIGNED NOT NULL,
      createdAtUnitMigrationMap TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (idLegacyCulinaryUnit),
      CONSTRAINT fkUnitMigrationMapUnified
        FOREIGN KEY (idUnifiedUnit) REFERENCES units (idUnit)
        ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await connection.query(`
    CREATE TABLE IF NOT EXISTS unit_conversions (
      idUnitConversion INT NOT NULL AUTO_INCREMENT,
      idFromUnitConversion BIGINT UNSIGNED NOT NULL,
      idToUnitConversion BIGINT UNSIGNED NOT NULL,
      idPhysicalStateUnitConversion INT NOT NULL,
      factorUnitConversion DECIMAL(10, 4) NOT NULL,
      notesUnitConversion VARCHAR(150) NULL,
      PRIMARY KEY (idUnitConversion),
      UNIQUE KEY uqUnitConversions (idFromUnitConversion, idToUnitConversion, idPhysicalStateUnitConversion),
      CONSTRAINT fkUnitConversionsFrom
        FOREIGN KEY (idFromUnitConversion) REFERENCES units (idUnit)
        ON DELETE CASCADE,
      CONSTRAINT fkUnitConversionsTo
        FOREIGN KEY (idToUnitConversion) REFERENCES units (idUnit)
        ON DELETE CASCADE,
      CONSTRAINT fkUnitConversionsPhysicalState
        FOREIGN KEY (idPhysicalStateUnitConversion) REFERENCES physical_states (idPhysicalState)
        ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await connection.query(`
    CREATE TABLE IF NOT EXISTS unit_conversion_migration_map (
      idLegacyCulinaryUnitConversion INT NOT NULL,
      idUnifiedUnitConversion INT NOT NULL,
      createdAtUnitConversionMigrationMap TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (idLegacyCulinaryUnitConversion),
      CONSTRAINT fkUnitConversionMigrationMapUnified
        FOREIGN KEY (idUnifiedUnitConversion) REFERENCES unit_conversions (idUnitConversion)
        ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

const normalizeCode = (value) => {
  const code = String(value ?? "").trim().toUpperCase();
  return code === "DUZIA" ? "DZ" : code;
};

const copyUnits = async (connection) => {
  await connection.query(
    `UPDATE units
     SET isTaxableUnit = 1
     WHERE isTaxableUnit = 0 AND isCulinaryUnit = 0`
  );

  const [culinaryUnits] = await connection.query(
    `SELECT idCulinaryUnit, codeCulinaryUnit, nameCulinaryUnit,
            baseUnitCulinaryUnit, categoryCulinaryUnit,
            descriptionCulinaryUnit, isActiveCulinaryUnit
     FROM culinary_units
     ORDER BY idCulinaryUnit`
  );
  for (const culinaryUnit of culinaryUnits) {
    const code = normalizeCode(culinaryUnit.codeCulinaryUnit);
    const [existing] = await connection.execute(
      `SELECT idUnit
       FROM units
       WHERE UPPER(codeUnit) = ?
       LIMIT 1`,
      [code]
    );
    let unifiedId = existing[0]?.idUnit;
    if (unifiedId) {
      await connection.execute(
        `UPDATE units
         SET isCulinaryUnit = 1,
             descriptionUnit = ?,
             isTaxableUnit = ?,
             baseUnitUnit = ?,
             categoryUnit = ?,
             isActiveUnit = ?
         WHERE idUnit = ?`,
        [
          culinaryUnit.nameCulinaryUnit || culinaryUnit.descriptionCulinaryUnit || code,
          culinaryUnit.categoryCulinaryUnit === "general" ? 0 : 1,
          culinaryUnit.baseUnitCulinaryUnit,
          culinaryUnit.categoryCulinaryUnit,
          culinaryUnit.isActiveCulinaryUnit ? 1 : 0,
          unifiedId
        ]
      );
    } else {
      const [result] = await connection.execute(
        `INSERT INTO units
          (codeUnit, descriptionUnit, isActiveUnit, isTaxableUnit,
           isCulinaryUnit, baseUnitUnit, categoryUnit)
         VALUES (?, ?, ?, ?, 1, ?, ?)` ,
        [
          code,
          culinaryUnit.nameCulinaryUnit || culinaryUnit.descriptionCulinaryUnit || code,
          culinaryUnit.isActiveCulinaryUnit ? 1 : 0,
          culinaryUnit.categoryCulinaryUnit === "general" ? 0 : 1,
          culinaryUnit.baseUnitCulinaryUnit,
          culinaryUnit.categoryCulinaryUnit
        ]
      );
      unifiedId = result.insertId;
    }
    await connection.execute(
      `INSERT INTO unit_migration_map (idLegacyCulinaryUnit, idUnifiedUnit)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE idUnifiedUnit = VALUES(idUnifiedUnit)`,
      [culinaryUnit.idCulinaryUnit, unifiedId]
    );
  }
  return culinaryUnits.length;
};

const copyConversions = async (connection) => {
  const [legacyConversions] = await connection.query(`
    SELECT idCulinaryUnitConversion,
           idFromCulinaryUnitConversion,
           idToCulinaryUnitConversion,
           idPhysicalStateCulinaryUnitConversion,
           factorCulinaryUnitConversion,
           notesCulinaryUnitConversion
    FROM culinary_unit_conversions
    ORDER BY idCulinaryUnitConversion
  `);
  let affectedRows = 0;
  for (const conversion of legacyConversions) {
    const [existing] = await connection.execute(
      `SELECT source.idUnifiedUnit AS sourceId, target.idUnifiedUnit AS targetId
       FROM unit_migration_map source
       INNER JOIN unit_migration_map target
         ON target.idLegacyCulinaryUnit = ?
       WHERE source.idLegacyCulinaryUnit = ?`,
      [conversion.idToCulinaryUnitConversion, conversion.idFromCulinaryUnitConversion]
    );
    if (!existing.length) {
      throw new Error(`Conversão ${conversion.idCulinaryUnitConversion} não possui unidades mapeadas.`);
    }
    const [result] = await connection.execute(`
      INSERT INTO unit_conversions
      (idFromUnitConversion, idToUnitConversion,
       idPhysicalStateUnitConversion, factorUnitConversion,
       notesUnitConversion)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        factorUnitConversion = VALUES(factorUnitConversion),
        notesUnitConversion = VALUES(notesUnitConversion),
        idUnitConversion = LAST_INSERT_ID(idUnitConversion)
    `, [
      existing[0].sourceId,
      existing[0].targetId,
      conversion.idPhysicalStateCulinaryUnitConversion,
      conversion.factorCulinaryUnitConversion,
      conversion.notesCulinaryUnitConversion
    ]);
    const unifiedId = result.insertId;
    await connection.execute(
      `INSERT INTO unit_conversion_migration_map
        (idLegacyCulinaryUnitConversion, idUnifiedUnitConversion)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE idUnifiedUnitConversion = VALUES(idUnifiedUnitConversion)`,
      [conversion.idCulinaryUnitConversion, unifiedId]
    );
    affectedRows += result.affectedRows;
  }
  return affectedRows;
};

const createCommercialUnitConversions = async (connection) => {
  const [massResult] = await connection.execute(`
    INSERT INTO unit_conversions
      (idFromUnitConversion, idToUnitConversion,
       idPhysicalStateUnitConversion, factorUnitConversion,
       notesUnitConversion)
    SELECT source.idUnit, target.idUnit,
           base.idPhysicalStateUnitConversion,
           base.factorUnitConversion / 1000,
           'Conversão derivada para unidade comercial'
    FROM unit_conversions base
    INNER JOIN units source ON source.idUnit = base.idFromUnitConversion
    INNER JOIN units baseTarget
      ON baseTarget.idUnit = base.idToUnitConversion
     AND LOWER(baseTarget.codeUnit) = 'g'
    INNER JOIN units target ON LOWER(target.codeUnit) = 'kg'
    WHERE LOWER(source.codeUnit) <> 'kg'
    ON DUPLICATE KEY UPDATE
      factorUnitConversion = VALUES(factorUnitConversion),
      notesUnitConversion = VALUES(notesUnitConversion)
  `);
  const [volumeResult] = await connection.execute(`
    INSERT INTO unit_conversions
      (idFromUnitConversion, idToUnitConversion,
       idPhysicalStateUnitConversion, factorUnitConversion,
       notesUnitConversion)
    SELECT source.idUnit, target.idUnit,
           base.idPhysicalStateUnitConversion,
           base.factorUnitConversion / 1000,
           'Conversão derivada para unidade comercial'
    FROM unit_conversions base
    INNER JOIN units source ON source.idUnit = base.idFromUnitConversion
    INNER JOIN units baseTarget
      ON baseTarget.idUnit = base.idToUnitConversion
     AND LOWER(baseTarget.codeUnit) = 'ml'
    INNER JOIN units target ON LOWER(target.codeUnit) = 'l'
    WHERE LOWER(source.codeUnit) <> 'l'
    ON DUPLICATE KEY UPDATE
      factorUnitConversion = VALUES(factorUnitConversion),
      notesUnitConversion = VALUES(notesUnitConversion)
  `);
  const [fixedResult] = await connection.execute(`
    INSERT INTO unit_conversions
      (idFromUnitConversion, idToUnitConversion,
       idPhysicalStateUnitConversion, factorUnitConversion,
       notesUnitConversion)
    SELECT source.idUnit, target.idUnit, state.idPhysicalState,
           CASE LOWER(source.codeUnit)
             WHEN 'g' THEN 1
             WHEN 'kg' THEN 1000
             WHEN 'ml' THEN 1
             WHEN 'l' THEN 1000
             WHEN 'un' THEN 1
             WHEN 'dz' THEN 12
             WHEN 'duzia' THEN 12
           END
           / CASE LOWER(target.codeUnit)
             WHEN 'g' THEN 1
             WHEN 'kg' THEN 1000
             WHEN 'ml' THEN 1
             WHEN 'l' THEN 1000
             WHEN 'un' THEN 1
             WHEN 'dz' THEN 12
             WHEN 'duzia' THEN 12
           END,
           'Conversão universal entre unidades fixas'
    FROM units source
    INNER JOIN units target
      ON target.baseUnitUnit = source.baseUnitUnit
     AND LOWER(target.codeUnit) IN ('g', 'kg', 'ml', 'l', 'un', 'dz', 'duzia')
    CROSS JOIN physical_states state
    WHERE LOWER(source.codeUnit) IN ('g', 'kg', 'ml', 'l', 'un', 'dz', 'duzia')
    ON DUPLICATE KEY UPDATE
      factorUnitConversion = VALUES(factorUnitConversion),
      notesUnitConversion = VALUES(notesUnitConversion)
  `);
  return Number(massResult.affectedRows)
    + Number(volumeResult.affectedRows)
    + Number(fixedResult.affectedRows);
};

const validate = async (connection) => {
  const [[legacyUnits]] = await connection.query(
    "SELECT COUNT(*) AS count FROM culinary_units"
  );
  const [[mappedUnits]] = await connection.query(
    "SELECT COUNT(*) AS count FROM unit_migration_map"
  );
  const [[legacyConversions]] = await connection.query(
    "SELECT COUNT(*) AS count FROM culinary_unit_conversions"
  );
  const [[unifiedConversions]] = await connection.query(
    "SELECT COUNT(*) AS count FROM unit_conversions"
  );
  const [[unmappedConversions]] = await connection.query(`
    SELECT COUNT(*) AS count
    FROM culinary_unit_conversions conversions
    LEFT JOIN unit_migration_map source_map
      ON source_map.idLegacyCulinaryUnit = conversions.idFromCulinaryUnitConversion
    LEFT JOIN unit_migration_map target_map
      ON target_map.idLegacyCulinaryUnit = conversions.idToCulinaryUnitConversion
    WHERE source_map.idUnifiedUnit IS NULL
       OR target_map.idUnifiedUnit IS NULL
  `);
  const [[mappedConversions]] = await connection.query(
    "SELECT COUNT(*) AS count FROM unit_conversion_migration_map"
  );
  const [[unmappedUnits]] = await connection.query(`
    SELECT COUNT(*) AS count
    FROM culinary_units legacy
    LEFT JOIN unit_migration_map map
      ON map.idLegacyCulinaryUnit = legacy.idCulinaryUnit
    WHERE map.idUnifiedUnit IS NULL
  `);
  const [[duplicateCodes]] = await connection.query(`
    SELECT COUNT(*) AS count
    FROM (
      SELECT UPPER(codeUnit) AS normalizedCode
      FROM units
      GROUP BY UPPER(codeUnit)
      HAVING COUNT(*) > 1
    ) duplicates
  `);
  if (Number(mappedUnits.count) !== Number(legacyUnits.count)) {
    throw new Error(`Mapeamento incompleto: ${mappedUnits.count}/${legacyUnits.count} unidades culinárias.`);
  }
  if (Number(unmappedUnits.count) !== 0) {
    throw new Error(`Existem ${unmappedUnits.count} unidades culinárias sem unidade unificada.`);
  }
  if (Number(duplicateCodes.count) !== 0) {
    throw new Error(`Existem ${duplicateCodes.count} códigos duplicados no catálogo unificado.`);
  }
  if (Number(unmappedConversions.count) !== 0) {
    throw new Error(`Existem ${unmappedConversions.count} conversões sem unidades unificadas.`);
  }
  if (Number(mappedConversions.count) !== Number(legacyConversions.count)) {
    throw new Error(`Mapeamento de conversões incompleto: ${mappedConversions.count}/${legacyConversions.count}.`);
  }
  return {
    legacyUnits: Number(legacyUnits.count),
    mappedUnits: Number(mappedUnits.count),
    legacyConversions: Number(legacyConversions.count),
    unifiedConversions: Number(unifiedConversions.count)
  };
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
    if (!await tableExists(connection, "units")) {
      throw new Error("A tabela units não existe. Execute o schema inicial antes desta migração.");
    }
    if (!await tableExists(connection, "culinary_units")) {
      throw new Error("A tabela culinary_units não existe. Execute a migração de unidades culinárias antes desta migração.");
    }
    await ensureSchema(connection);
    await connection.beginTransaction();
    const unitCount = await copyUnits(connection);
    const conversionRows = await copyConversions(connection);
    const commercialConversionRows = await createCommercialUnitConversions(connection);
    const result = await validate(connection);
    await connection.commit();
    console.log(
      `Migração concluída com segurança: ${unitCount} unidades legadas processadas, ` +
      `${conversionRows + commercialConversionRows} conversões copiadas/atualizadas, ` +
      `${result.unifiedConversions} conversões no catálogo unificado.`
    );
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error(`Falha na unificação das unidades: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
};

main();
