import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createComponentLogWriter,
  createRealLogReader,
  createTechnicalLogService,
  mergeLogEntries,
  sanitizeTechnicalLog
} from "../../src/server/technical-log-service.js";

test("component log writer records real component messages without sensitive fields", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pdv-component-writer-"));
  try {
    const writer = createComponentLogWriter({
      directory,
      fileName: "pdv-node.log"
    });
    writer.write("error", "Falha token=abc123 payload={\"cpf\":\"123\"}");
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(join(directory, "pdv-node.log"), "utf8");
    assert.match(content, /Falha token=\[redacted\]/u);
    assert.doesNotMatch(content, /abc123|123/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("real log reader reads and identifies component log files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pdv-component-logs-"));
  try {
    await writeFile(join(directory, "PDV-API_20261119.err.log"),
      "[2026-11-19T10:00:00.000Z] ERROR ER_CANT_AGGREGATE_2COLLATIONS Illegal mix of collations\n",
      "utf8");
    await writeFile(join(directory, "pdv-vite.log"),
      "[2026-11-19T10:01:00.000Z] [vite] ready\n",
      "utf8");
    await writeFile(join(directory, "pdv-tauri.log"),
      "[2026-11-19T10:02:00.000Z] [ERROR] process did not exit successfully\n",
      "utf8");
    await writeFile(join(directory, "pdv-cargo.log"),
      "[2026-11-19T10:03:00.000Z] [warn] cargo build finished with warnings\n",
      "utf8");
    await writeFile(join(directory, "pdv-mariadb.log"),
      "[2026-11-19T10:04:00.000Z] [ERROR] access denied for operator\n",
      "utf8");
    await writeFile(join(directory, "ignored-secret.txt"), "secret content\n", "utf8");

    const reader = createRealLogReader({ logDirectories: [directory] });
    const entries = await reader.readEntries({ limit: 100 });

    assert.deepEqual(
      entries.map((entry) => entry.sourceTechnicalLog).sort(),
      ["api", "cargo", "database", "tauri", "vite"]
    );
    assert.ok(entries.some((entry) => entry.messageTechnicalLog.includes("ER_CANT_AGGREGATE_2COLLATIONS")));
    assert.ok(entries.every((entry) => entry.logFileName !== "ignored-secret.txt"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("merged logs reserve visible positions for real component entries", () => {
  const realEntries = [
    { idTechnicalLog: "vite-1", occurredAtTechnicalLog: "2026-11-19T10:04:00.000Z" },
    { idTechnicalLog: "node-1", occurredAtTechnicalLog: "2026-11-19T10:03:00.000Z" }
  ];
  const technicalEntries = [
    { idTechnicalLog: "api-1", occurredAtTechnicalLog: "2026-11-19T10:05:00.000Z" },
    { idTechnicalLog: "api-2", occurredAtTechnicalLog: "2026-11-19T10:02:00.000Z" },
    { idTechnicalLog: "api-3", occurredAtTechnicalLog: "2026-11-19T10:01:00.000Z" }
  ];

  const entries = mergeLogEntries({
    realEntries,
    technicalEntries,
    limit: 4,
    prioritizeReal: true
  });

  assert.equal(entries.length, 4);
  assert.equal(entries[0].idTechnicalLog, "vite-1");
  assert.equal(entries[1].idTechnicalLog, "node-1");
  assert.ok(entries.some((entry) => entry.idTechnicalLog === "vite-1"));
  assert.ok(entries.some((entry) => entry.idTechnicalLog === "node-1"));
});

test("merged logs omit successful HTTP calls and retain HTTP failures", () => {
  const entries = mergeLogEntries({
    technicalEntries: [
      {
        idTechnicalLog: "http-200",
        occurredAtTechnicalLog: "2026-11-19T10:05:00.000Z",
        sourceTechnicalLog: "api",
        operationTechnicalLog: "http",
        statusCodeTechnicalLog: 200,
        successTechnicalLog: 1
      },
      {
        idTechnicalLog: "http-500",
        occurredAtTechnicalLog: "2026-11-19T10:04:00.000Z",
        sourceTechnicalLog: "api",
        operationTechnicalLog: "http",
        statusCodeTechnicalLog: 500,
        successTechnicalLog: 0
      }
    ],
    limit: 20
  });

  assert.deepEqual(entries.map((entry) => entry.idTechnicalLog), ["http-500"]);
});

test("sanitizeTechnicalLog mascara dados sensiveis e normaliza limites", () => {
  const entry = sanitizeTechnicalLog({
    source: "FRONTEND",
    level: "ERROR",
    message: "Falha: token abc123 cpf 12345678901 payload={\"secret\":\"x\"}",
    operation: "payment: 12345",
    durationMs: -20,
    statusCode: 700,
    success: false
  });

  assert.equal(entry.source, "frontend");
  assert.equal(entry.level, "error");
  assert.doesNotMatch(entry.message, /abc123|12345678901|payload|secret/iu);
  assert.doesNotMatch(entry.operation, /12345/);
  assert.equal(entry.durationMs, 0);
  assert.equal(entry.statusCode, 599);
  assert.equal(entry.success, 0);
});

test("technical log service aplica retencao, persistencia parametrizada e filtros normalizados", async () => {
  const queries = [];
  const pool = {
    async query(sql, parameters = []) {
      queries.push({ sql, parameters });
      if (sql.includes("SELECT")) return [[{
        idTechnicalLog: 1,
        sourceTechnicalLog: "api",
        levelTechnicalLog: "info",
        messageTechnicalLog: "GET /api/health",
        operationTechnicalLog: "http",
        durationMsTechnicalLog: 12,
        statusCodeTechnicalLog: 200,
        successTechnicalLog: 1
      }]];
      if (sql.includes("INSERT")) return [{ insertId: 1 }];
      return [{ affectedRows: 1 }];
    }
  };
  const service = createTechnicalLogService({ pool });

  const id = await service.record({
    source: "API",
    level: "INFO",
    message: "GET /api/health",
    operation: "http",
    durationMs: 12,
    statusCode: 200
  });
  const rows = await service.list({ source: "API", level: "INFO", limit: 20 });

  assert.equal(id, 1);
  assert.equal(rows.length, 1);
  assert.equal(service.retentionDays, 14);
  assert.ok(queries.some(({ sql, parameters }) =>
    sql.includes("DATE_SUB") && parameters[0] === 14
  ));
  assert.ok(queries.some(({ sql, parameters }) =>
    sql.includes("sourceTechnicalLog = ?")
    && sql.includes("levelTechnicalLog = ?")
    && parameters.includes("api")
    && parameters.includes("info")
  ));
});
