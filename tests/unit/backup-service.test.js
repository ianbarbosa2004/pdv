import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createBackup, listBackups, readBackup } from "../../src/server/backup-service.js";

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
