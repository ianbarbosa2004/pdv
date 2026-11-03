import mysql from "mysql2/promise";
import { getConfig } from "../../src/server/config.js";

const columnName = "nfceCertificatePathCompany";

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
    const [columns] = await connection.query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'company_settings'
         AND COLUMN_NAME = ?`,
      [columnName]
    );
    if (!columns.length) {
      console.log("Migração NFC-e já aplicada: coluna legada não existe.");
      return;
    }

    await connection.query(
      `ALTER TABLE company_settings DROP COLUMN \`${columnName}\``
    );
    console.log("Migração NFC-e concluída: coluna legada removida.");
  } finally {
    await connection.end();
  }
};

main().catch((error) => {
  console.error(`Falha ao remover coluna legada NFC-e: ${error.message}`);
  process.exitCode = 1;
});
