import { createPool } from "../src/server/database.js";
import { loadRuntimeConfig } from "../src/server/config.js";
import {
  hashOperatorPassword,
  normalizeOperatorPassword,
  normalizeOperatorUsername,
  isOperatorRole
} from "../src/server/operator-service.js";

const [, , rawUsername, rawDisplayName, rawRole = "admin", mode] = process.argv;
const password = process.env.PDV_OPERATOR_PASSWORD;
if (!rawUsername || !rawDisplayName || !password) {
  throw new Error(
    "Uso: PDV_OPERATOR_PASSWORD=<senha> node scripts/create-operator.mjs <usuario> <nome> [operator|supervisor|admin] [--hash-only]"
  );
}

const username = normalizeOperatorUsername(rawUsername);
const displayName = String(rawDisplayName).trim();
const role = String(rawRole);
if (!displayName || displayName.length > 160 || !isOperatorRole(role)) {
  throw new Error("Nome ou papel do operador inválido.");
}

const passwordHash = hashOperatorPassword(normalizeOperatorPassword(password));
if (mode === "--hash-only") {
  process.stdout.write(passwordHash);
  process.exit(0);
}

const config = await loadRuntimeConfig();
const pool = createPool(config);
try {
  await pool.query(`CREATE TABLE IF NOT EXISTS operators (
    idOperator BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    usernameOperator VARCHAR(80) NOT NULL,
    displayNameOperator VARCHAR(160) NOT NULL,
    passwordHashOperator VARCHAR(255) NOT NULL,
    roleOperator ENUM('operator', 'supervisor', 'admin') NOT NULL DEFAULT 'operator',
    isActiveOperator TINYINT(1) NOT NULL DEFAULT 1,
    createdAtOperator TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAtOperator TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idOperator),
    UNIQUE KEY uqOperatorsUsername (usernameOperator)
  ) ENGINE=InnoDB`);
  const [result] = await pool.query(
    `INSERT INTO operators
      (usernameOperator, displayNameOperator, passwordHashOperator, roleOperator)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       displayNameOperator = VALUES(displayNameOperator),
       passwordHashOperator = VALUES(passwordHashOperator),
       roleOperator = VALUES(roleOperator),
       isActiveOperator = 1`,
    [username, displayName, passwordHash, role]
  );
  console.log(`Operador preparado: ${username} (${role}), id=${result.insertId || "existente"}.`);
} finally {
  await pool.end();
}
