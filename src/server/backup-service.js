import { access, mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";

const BACKUP_VERSION = 1;
const backupNamePattern = /^pdv-backup-\d{8}-\d{6}\.json\.gz$/;

const quoteIdentifier = (value) => `\`${String(value).replaceAll("`", "``")}\``;

const backupCreatedAt = (fileName) => {
  const match = /^pdv-backup-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.json\.gz$/.exec(fileName);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  )).toISOString();
};

const localDataRoot = () => process.env.LOCALAPPDATA
  || process.env.XDG_STATE_HOME
  || join(homedir(), ".local", "state");

const candidateDirectories = ({ applicationRoot, configuredDirectory, runtimeEnvironment }) => {
  if (configuredDirectory) return [resolve(configuredDirectory)];
  if (runtimeEnvironment === "production") {
    return [
      join(applicationRoot, "backups"),
      join(localDataRoot(), "PDV Zanzibar", "backups")
    ];
  }
  return [
    join(localDataRoot(), "PDV Zanzibar", "backups"),
    join(tmpdir(), "PDV Zanzibar", "backups")
  ];
};

const getWritableDirectory = async (candidates) => {
  let lastError;
  for (const directory of candidates) {
    try {
      await mkdir(directory, { recursive: true });
      await access(dirname(directory));
      const probe = join(directory, `.write-test-${process.pid}-${Date.now()}`);
      await writeFile(probe, "", { flag: "wx" });
      await unlink(probe);
      return directory;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Não foi possível gravar backups em nenhum destino configurado: ${lastError?.message || "permissão negada."}`);
};

export const resolveBackupDirectory = async (options) =>
  getWritableDirectory(candidateDirectories(options));

const listTableNames = async (pool) => {
  const [rows] = await pool.query(
    `SELECT TABLE_NAME AS tableName
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME`
  );
  return rows.map(({ tableName }) => tableName);
};

export const createBackup = async ({
  pool,
  applicationRoot,
  configuredDirectory,
  runtimeEnvironment,
  databaseName = "pdv"
}) => {
  const tables = {};
  for (const tableName of await listTableNames(pool)) {
    const [rows] = await pool.query(`SELECT * FROM ${quoteIdentifier(tableName)}`);
    tables[tableName] = rows;
  }
  const payload = {
    backupVersion: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    databaseName,
    tables
  };
  const compressed = gzipSync(JSON.stringify(payload), { level: 9 });
  const directory = await resolveBackupDirectory({
    applicationRoot,
    configuredDirectory,
    runtimeEnvironment
  });
  const timestampMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(payload.createdAt);
  const timestamp = timestampMatch
    ? `${timestampMatch[1]}${timestampMatch[2]}${timestampMatch[3]}-${timestampMatch[4]}${timestampMatch[5]}${timestampMatch[6]}`
    : String(Date.now());
  const fileName = `pdv-backup-${timestamp}.json.gz`;
  const filePath = join(directory, fileName);
  await writeFile(filePath, compressed, { flag: "wx" });
  return {
    fileName,
    filePath,
    directory,
    createdAt: payload.createdAt,
    size: compressed.length,
    tableCount: Object.keys(tables).length,
    rowCount: Object.values(tables).reduce((total, rows) => total + rows.length, 0)
  };
};

export const listBackups = async ({ applicationRoot, configuredDirectory, runtimeEnvironment }) => {
  const directory = await resolveBackupDirectory({
    applicationRoot,
    configuredDirectory,
    runtimeEnvironment
  });
  const files = (await readdir(directory))
    .filter((fileName) => backupNamePattern.test(fileName))
    .sort()
    .reverse();
  return Promise.all(files.map(async (fileName) => {
    const filePath = join(directory, fileName);
    const content = await readFile(filePath);
    return {
      fileName,
      createdAt: backupCreatedAt(fileName),
      size: content.length
    };
  }));
};

export const readBackup = async ({ applicationRoot, configuredDirectory, runtimeEnvironment, fileName }) => {
  if (!backupNamePattern.test(fileName)) throw new Error("Nome de backup inválido.");
  const directory = await resolveBackupDirectory({
    applicationRoot,
    configuredDirectory,
    runtimeEnvironment
  });
  return readFile(join(directory, fileName));
};

export const restoreBackup = async ({ pool, compressed, expectedDatabaseName = "pdv" }) => {
  let payload;
  try {
    payload = JSON.parse(gunzipSync(compressed).toString("utf8"));
  } catch {
    throw new Error("O arquivo não é um backup PDV compactado válido.");
  }
  if (payload?.backupVersion !== BACKUP_VERSION
    || payload.databaseName !== expectedDatabaseName
    || !payload.tables
    || typeof payload.tables !== "object"
    || Array.isArray(payload.tables)) {
    throw new Error("A versão do backup não é compatível com esta instalação.");
  }
  const tableNames = await listTableNames(pool);
  const backupTables = Object.keys(payload.tables);
  if (backupTables.length !== tableNames.length || tableNames.some((tableName) => !backupTables.includes(tableName))
    || backupTables.some((tableName) => !tableNames.includes(tableName))) {
    throw new Error("O backup contém tabelas incompatíveis com este banco.");
  }
  const [columnRows] = await pool.query(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
     ORDER BY TABLE_NAME, ORDINAL_POSITION`
  );
  const columnsByTable = new Map();
  for (const row of columnRows) {
    if (!columnsByTable.has(row.tableName)) columnsByTable.set(row.tableName, []);
    columnsByTable.get(row.tableName).push(row.columnName);
  }
  for (const tableName of backupTables) {
    const rows = payload.tables[tableName];
    if (!Array.isArray(rows)) throw new Error(`Dados inválidos para a tabela ${tableName}.`);
    const expectedColumns = columnsByTable.get(tableName) || [];
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)
        || Object.keys(row).length !== expectedColumns.length
        || expectedColumns.some((column) => !Object.prototype.hasOwnProperty.call(row, column))
        || Object.keys(row).some((column) => !expectedColumns.includes(column))) {
        throw new Error(`Colunas incompatíveis na tabela ${tableName}.`);
      }
    }
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const tableName of tableNames) {
      await connection.query(`DELETE FROM ${quoteIdentifier(tableName)}`);
    }
    for (const tableName of tableNames) {
      const rows = payload.tables[tableName];
      if (!rows.length) continue;
      const columns = Object.keys(rows[0]);
      const placeholders = `(${columns.map(() => "?").join(",")})`;
      const values = rows.flatMap((row) => columns.map((column) => row[column]));
      await connection.query(
        `INSERT INTO ${quoteIdentifier(tableName)}
         (${columns.map(quoteIdentifier).join(",")})
         VALUES ${Array.from({ length: rows.length }, () => placeholders).join(",")}`,
        values
      );
    }
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    await connection.commit();
    return {
      createdAt: payload.createdAt,
      tableCount: backupTables.length,
      rowCount: backupTables.reduce((total, tableName) => total + payload.tables[tableName].length, 0)
    };
  } catch (error) {
    await connection.rollback();
    try { await connection.query("SET FOREIGN_KEY_CHECKS = 1"); } catch {}
    throw error;
  } finally {
    connection.release();
  }
};
