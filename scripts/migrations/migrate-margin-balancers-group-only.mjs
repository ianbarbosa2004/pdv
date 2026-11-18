import mysql from "mysql2/promise";
import { loadMigrationConfig } from "../../src/server/config.js";

const main = async () => {
  const migrationEnv = {
    ...process.env,
    PDV_DB_USER: "root"
  };
  const config = await loadMigrationConfig(migrationEnv);
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
    await connection.query("DROP TRIGGER IF EXISTS trgMarginGeneralBalancerUpdate");
    await connection.query("DROP TRIGGER IF EXISTS trgMarginProductBalancerUpdate");
    await connection.query("DROP TRIGGER IF EXISTS trgMarginProductBalancerUpdateExisting");
    await connection.query("DROP TRIGGER IF EXISTS trgMarginGroupBalancerUpdateExisting");

    await connection.query(`CREATE TABLE IF NOT EXISTS margin_group_overrides (
      idGroup BIGINT UNSIGNED NOT NULL,
      minimumMarginPercentage DECIMAL(5,2) NOT NULL DEFAULT 0,
      targetMarginPercentage DECIMAL(5,2) NOT NULL DEFAULT 0,
      updatedAtMarginGroup TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (idGroup),
      CONSTRAINT chkMarginGroupMinimum CHECK (minimumMarginPercentage >= 0 AND minimumMarginPercentage < 100),
      CONSTRAINT chkMarginGroupTarget CHECK (targetMarginPercentage >= 0 AND targetMarginPercentage < 100),
      CONSTRAINT fkMarginGroupOverrideGroup FOREIGN KEY (idGroup)
        REFERENCES \`groups\` (idGroup) ON DELETE CASCADE
    ) ENGINE=InnoDB`);

    await connection.query(
      `ALTER TABLE margin_group_overrides
       MODIFY COLUMN minimumMarginPercentage DECIMAL(5,2) NOT NULL DEFAULT 0,
       MODIFY COLUMN targetMarginPercentage DECIMAL(5,2) NOT NULL DEFAULT 0`
    );

    await connection.query(
      `INSERT INTO margin_group_overrides (
         idGroup,
         minimumMarginPercentage,
         targetMarginPercentage
       )
       SELECT idGroup, 0, 0
       FROM \`groups\`
       ON DUPLICATE KEY UPDATE
         idGroup = margin_group_overrides.idGroup`
    );

    const [metricTables] = await connection.query(
      `SELECT TABLE_NAME
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'margin_product_metrics'`
    );
    if (metricTables.length) {
      await connection.query(
        `UPDATE margin_product_metrics
         SET minimumMarginOrigin = 'group',
             targetMarginOrigin = 'group',
             minimumMarginSnapshot = COALESCE(minimumMarginSnapshot, 0),
             targetMarginSnapshot = COALESCE(targetMarginSnapshot, 0)`
      );
      await connection.query(
        `UPDATE margin_product_metrics
         SET snapshotSource = 'group_balancer_update'
         WHERE snapshotSource IN ('general_balancer_update', 'product_balancer_update')`
      );
      await connection.query(
        `ALTER TABLE margin_product_metrics
         MODIFY COLUMN minimumMarginOrigin ENUM('group') NULL,
         MODIFY COLUMN targetMarginOrigin ENUM('group') NULL,
         MODIFY COLUMN snapshotSource ENUM(
           'initial_load',
           'cost_update',
           'price_update',
           'cost_and_price_update',
           'group_balancer_update'
         ) NOT NULL`
      );
    }

    await connection.query("DROP TABLE IF EXISTS margin_product_overrides");
    await connection.query("DROP TABLE IF EXISTS margin_general_settings");

    console.log("Migração concluída: somente margin_group_overrides mantém os balizadores, com mínimo e alvo 0 para cada grupo.");
  } finally {
    await connection.end();
  }
};

main().catch((error) => {
  console.error(`Falha ao migrar balizadores de margem para somente Grupo: ${error.message}`);
  process.exitCode = 1;
});
