import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { createBackup, listBackups, readBackup, restoreBackup } from "../../src/server/backup-service.js";

test("creates and lists a compacted backup without exposing database credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "pdv-backup-"));
  const configuredDirectory = join(root, "backups");
  const pool = {
    async query(sql) {
      if (sql.includes("information_schema.TABLES")) return [[{ tableName: "example" }]];
      return [[{ id: 1, description: "DADO" }]];
    }
  };
  try {
    const backup = await createBackup({
      pool,
      applicationRoot: root,
      configuredDirectory,
      runtimeEnvironment: "development"
    });

    test("rejects backups with an incompatible database schema before deleting data", async () => {
      const payload = {
        backupVersion: 1,
        databaseName: "pdv",
        tables: {
          example: [{ id: 1, unexpected: true }]
        }
      };
      const pool = {
        async query(sql) {
          if (sql.includes("information_schema.TABLES")) return [[{ tableName: "example" }]];
          if (sql.includes("information_schema.COLUMNS")) {
            return [[{ tableName: "example", columnName: "id" }]];
          }
          throw new Error("A restauração não deveria alcançar comandos destrutivos.");
        }
      };

      await assert.rejects(
        restoreBackup({
          pool,
          compressed: gzipSync(JSON.stringify(payload)),
          expectedDatabaseName: "pdv"
        }),
        /Colunas incompatíveis/
      );
    });
    assert.match(backup.fileName, /^pdv-backup-\d{8}-\d{6}\.json\.gz$/);
    assert.equal(backup.tableCount, 1);
    assert.equal(backup.rowCount, 1);
    const files = await listBackups({
      applicationRoot: root,
      configuredDirectory,
      runtimeEnvironment: "development"
    });
    assert.equal(files.length, 1);
    assert.match(files[0].createdAt, /^\d{4}-\d{2}-\d{2}T/);
    const content = JSON.parse(gunzipSync(await readBackup({
      applicationRoot: root,
      configuredDirectory,
      runtimeEnvironment: "development",
      fileName: backup.fileName
    })).toString("utf8"));
    assert.deepEqual(content.tables.example, [{ id: 1, description: "DADO" }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
