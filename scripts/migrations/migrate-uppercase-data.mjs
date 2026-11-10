import mysql from "mysql2/promise";
import { loadMigrationConfig } from "../../src/server/config.js";

const textColumns = new Map([
  ["classes", ["descriptionClass"]],
  ["groups", ["descriptionGroup"]],
  ["products", ["nameProduct", "skuProduct", "printsPlace"]],
  ["product_types", ["descriptionProductType"]],
  ["units", ["codeUnit", "descriptionUnit"]],
  ["physical_states", ["namePhysicalState", "descriptionPhysicalState"]],
  ["recipe_definitions", ["nameRecipe", "notesRecipe"]],
  ["company_settings", [
    "corporateNameCompany", "tradeNameCompany", "addressCompany",
    "addressComplementCompany", "neighborhoodCompany", "countryCompany", "cityCompany"
  ]],
  ["ncm_catalog", ["descriptionNcm"]],
  ["cest_catalog", ["descriptionCest", "segmentCest"]],
  ["payment_methods", ["namePaymentMethod"]],
  ["suppliers", ["companyNameSupplier", "tradeNameSupplier", "contactNameSupplier", "addressSupplier", "addressComplementSupplier", "neighborhoodSupplier", "citySupplier", "countrySupplier", "notesSupplier"]],
  ["customers", ["nameCustomer", "addressCustomer", "notesCustomer"]],
  ["consumers", ["nameConsumer", "nicknameConsumer", "notesConsumer"]],
  ["fiscal_operations", ["descriptionFiscalOperation", "operationNatureFiscalOperation", "icmsExemptionReasonFiscalOperation", "legalBasisFiscalOperation"]],
  ["fiscal_catalog_items", ["descriptionFiscalCatalogItem"]],
  ["sale_items", ["productNameSaleItem"]]
]);

const uniqueColumns = new Set([
  "classes.descriptionClass",
  "groups.descriptionGroup",
  "products.skuProduct",
  "units.codeUnit",
  "product_types.descriptionProductType",
  "payment_methods.namePaymentMethod"
]);

const compositeUniqueColumns = [
  {
    table: "recipe_definitions",
    columns: ["nameRecipe", "kindRecipe"]
  }
];

const minorWords = new Set(["a", "as", "à", "às", "ao", "aos", "da", "das", "de", "do", "dos", "e", "em", "no", "na", "nos", "nas", "por", "para"]);

const normalizeTitleCase = (value) => String(value ?? "")
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

const getPrimaryKey = async (connection, table) => {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = 'PRIMARY'
     ORDER BY ORDINAL_POSITION
     LIMIT 1`,
    [table]
  );
  return rows[0]?.COLUMN_NAME || null;
};

const normalizeForColumn = (table, column, value) =>
  (table === "products" && column === "skuProduct") || (table === "units" && column === "codeUnit")
    ? String(value ?? "").trim().toUpperCase()
    : normalizeTitleCase(value);

const findUniqueCollisions = async (connection, table, column) => {
  const [rows] = await connection.query(
    `SELECT ${quoteIdentifier(column)}
     FROM ${quoteIdentifier(table)}
     WHERE ${quoteIdentifier(column)} IS NOT NULL`
  );
  const amounts = new Map();
  for (const row of rows) {
    const normalizedValue = normalizeForColumn(table, column, row[column]);
    if (!normalizedValue) continue;
    amounts.set(normalizedValue, (amounts.get(normalizedValue) || 0) + 1);
  }
  return [...amounts.entries()]
    .filter(([, amount]) => amount > 1)
    .slice(0, 20)
    .map(([normalizedValue, amount]) => ({ normalizedValue, amount }));
};

const findCompositeUniqueCollisions = async (connection, table, columns) => {
  const [rows] = await connection.query(
    `SELECT ${columns.map(quoteIdentifier).join(", ")}
     FROM ${quoteIdentifier(table)}`
  );
  const amounts = new Map();
  for (const row of rows) {
    const key = columns.map((column) =>
      column === "kindRecipe"
        ? String(row[column] ?? "")
        : normalizeForColumn(table, column, row[column])
    ).join("\u0000");
    amounts.set(key, (amounts.get(key) || 0) + 1);
  }
  return [...amounts.entries()]
    .filter(([, amount]) => amount > 1)
    .slice(0, 20)
    .map(([normalizedValue, amount]) => ({ normalizedValue, amount }));
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
    const existingTables = await getExistingColumns(connection);
    const updates = [];
    for (const [table, columns] of textColumns) {
      const existingColumns = existingTables.get(table);
      if (!existingColumns) continue;
      const primaryKey = await getPrimaryKey(connection, table);
      if (primaryKey) updates.push({ table, primaryKey, columns: columns.filter((column) => existingColumns.has(column)) });
    }

    for (const { table, columns } of updates) {
      for (const column of columns) {
        if (!uniqueColumns.has(`${table}.${column}`)) continue;
        const collisions = await findUniqueCollisions(connection, table, column);
        if (collisions.length) {
          const normalization = (
            (table === "products" && column === "skuProduct")
            || (table === "units" && column === "codeUnit")
          )
            ? "maiúsculas"
            : "capitalização de título";
          throw new Error(
            `Conflito após normalização para ${normalization} em ${table}.${column}: ` +
            collisions.map(({ normalizedValue, amount }) => `"${normalizedValue}" (${amount})`).join(", ")
          );
        }
      }
    }
    for (const { table, columns } of compositeUniqueColumns) {
      const existingColumns = existingTables.get(table);
      if (!existingColumns || columns.some((column) => !existingColumns.has(column))) continue;
      const collisions = await findCompositeUniqueCollisions(connection, table, columns);
      if (collisions.length) {
        throw new Error(
          `Conflito após normalização para capitalização de título em ${table} (${columns.join(", ")}): ` +
          collisions.map(({ normalizedValue, amount }) => `"${normalizedValue.replaceAll("\u0000", " / ")}" (${amount})`).join(", ")
        );
      }
    }

    await connection.beginTransaction();
    let changedRows = 0;
    for (const { table, primaryKey, columns } of updates) {
      if (!columns.length) continue;
      const [rows] = await connection.query(
        `SELECT ${quoteIdentifier(primaryKey)}, ${columns.map(quoteIdentifier).join(", ")}
         FROM ${quoteIdentifier(table)}`
      );
      for (const row of rows) {
        const values = columns.map((column) =>
          row[column] === null || row[column] === undefined
            ? row[column]
            : normalizeForColumn(table, column, row[column])
        );
        if (values.some((value, index) => value !== row[columns[index]])) {
          await connection.query(
            `UPDATE ${quoteIdentifier(table)}
             SET ${columns.map((column) => `${quoteIdentifier(column)} = ?`).join(", ")}
             WHERE ${quoteIdentifier(primaryKey)} = ?`,
            [...values, row[primaryKey]]
          );
          changedRows += 1;
        }
      }
    }
    await connection.commit();
    console.log(`Migração concluída: ${changedRows} registros normalizados em ${updates.length} tabelas.`);
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
  console.error(`Falha na migração de capitalização: ${error.message}`);
  process.exitCode = 1;
});
