import mysql from "mysql2/promise";
import { getConfig } from "../../src/server/config.js";

const textColumns = [
  ["classes", ["descriptionClass"]],
  ["groups", ["descriptionGroup"]],
  ["products", ["nameProduct"]],
  ["product_types", ["descriptionProductType"]],
  ["units", ["descriptionUnit"]],
  ["ncm_catalog", ["descriptionNcm"]],
  ["cest_catalog", ["descriptionCest", "segmentCest"]],
  ["payment_methods", ["namePaymentMethod"]],
  ["suppliers", [
    "companyNameSupplier", "tradeNameSupplier", "contactNameSupplier", "addressSupplier",
    "addressComplementSupplier", "neighborhoodSupplier", "citySupplier", "countrySupplier",
    "notesSupplier"
  ]],
  ["customers", ["nameCustomer", "addressCustomer", "notesCustomer"]],
  ["consumers", ["nameConsumer", "nicknameConsumer", "notesConsumer"]],
  ["fiscal_operations", [
    "descriptionFiscalOperation", "operationNatureFiscalOperation",
    "icmsExemptionReasonFiscalOperation", "legalBasisFiscalOperation"
  ]],
  ["fiscal_catalog_items", ["descriptionFiscalCatalogItem"]],
  ["sale_items", ["productNameSaleItem"]]
];

const uniqueTextColumns = new Set([
  "classes.descriptionClass",
  "groups.descriptionGroup",
  "product_types.descriptionProductType",
  "payment_methods.namePaymentMethod"
]);

const quoteIdentifier = (value) => `\`${String(value).replaceAll("`", "``")}\``;

const getExistingColumns = async (connection) => {
  const [rows] = await connection.query(
    `SELECT TABLE_NAME, COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()`
  );
  const tables = new Map();
  for (const row of rows) {
    if (!tables.has(row.TABLE_NAME)) tables.set(row.TABLE_NAME, new Set());
    tables.get(row.TABLE_NAME).add(row.COLUMN_NAME);
  }
  return tables;
};

const findUniqueCollisions = async (connection, table, column) => {
  const [rows] = await connection.query(
    `SELECT UPPER(${quoteIdentifier(column)}) AS normalizedValue, COUNT(*) AS amount
     FROM ${quoteIdentifier(table)}
     WHERE ${quoteIdentifier(column)} IS NOT NULL
     GROUP BY UPPER(${quoteIdentifier(column)})
     HAVING COUNT(*) > 1
     LIMIT 20`
  );
  return rows;
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
    const existingTables = await getExistingColumns(connection);
    const updates = [];
    for (const [table, columns] of textColumns) {
      const existingColumns = existingTables.get(table);
      if (!existingColumns) continue;
      for (const column of columns) {
        if (existingColumns.has(column)) updates.push([table, column]);
      }
    }

    for (const [table, column] of updates) {
      if (!uniqueTextColumns.has(`${table}.${column}`)) continue;
      const collisions = await findUniqueCollisions(connection, table, column);
      if (collisions.length) {
        throw new Error(
          `Conflito após uppercase em ${table}.${column}: ` +
          collisions.map(({ normalizedValue, amount }) => `"${normalizedValue}" (${amount})`).join(", ")
        );
      }
    }

    await connection.beginTransaction();
    let changedRows = 0;
    for (const [table, column] of updates) {
      const [result] = await connection.query(
        `UPDATE ${quoteIdentifier(table)}
         SET ${quoteIdentifier(column)} = UPPER(${quoteIdentifier(column)})
         WHERE ${quoteIdentifier(column)} IS NOT NULL
           AND BINARY ${quoteIdentifier(column)} <> BINARY UPPER(${quoteIdentifier(column)})`
      );
      changedRows += result.affectedRows;
    }
    await connection.commit();
    console.log(`Migração concluída: ${changedRows} valores normalizados em ${updates.length} colunas.`);
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // A conexão pode já ter sido encerrada pelo servidor.
    }
    throw error;
  } finally {
    await connection.end();
  }
};

main().catch((error) => {
  console.error(`Falha na migração de maiúsculas: ${error.message}`);
  process.exitCode = 1;
});
