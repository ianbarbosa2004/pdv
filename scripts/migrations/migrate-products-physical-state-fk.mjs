import mysql from "mysql2/promise";
import { getConfig } from "../../src/server/config.js";

const constraintName = "fkProductsPhysicalState";

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
    const [tables] = await connection.query(
      `SELECT TABLE_NAME
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('products', 'physical_states')`
    );
    const tableNames = new Set(tables.map(({ TABLE_NAME }) => TABLE_NAME));
    if (!tableNames.has("products") || !tableNames.has("physical_states")) {
      throw new Error("As tabelas products e physical_states devem existir antes da migração.");
    }

    await connection.query(
      `UPDATE products products
       LEFT JOIN physical_states states
         ON states.idPhysicalState = NULLIF(products.idPhysicalStateProduct, 0)
       SET products.idPhysicalStateProduct = NULL
       WHERE products.idPhysicalStateProduct = 0
          OR (products.idPhysicalStateProduct IS NOT NULL AND states.idPhysicalState IS NULL)`
    );
    await connection.query(
      "ALTER TABLE products MODIFY COLUMN idPhysicalStateProduct INT NULL DEFAULT NULL"
    );

    const [constraints] = await connection.query(
      `SELECT CONSTRAINT_NAME
       FROM information_schema.REFERENTIAL_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = DATABASE()
         AND TABLE_NAME = 'products'
         AND CONSTRAINT_NAME = ?`,
      [constraintName]
    );
    if (!constraints.length) {
      await connection.query(
        `ALTER TABLE products
         ADD CONSTRAINT ${constraintName}
         FOREIGN KEY (idPhysicalStateProduct)
         REFERENCES physical_states (idPhysicalState)
         ON DELETE RESTRICT`
      );
    }
    console.log("Migração concluída: products.idPhysicalStateProduct agora usa NULL e FK para physical_states.");
  } finally {
    await connection.end();
  }
};

main().catch((error) => {
  console.error(`Falha ao adicionar FK do estado físico dos produtos: ${error.message}`);
  process.exitCode = 1;
});
