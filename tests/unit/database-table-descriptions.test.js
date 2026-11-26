import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TABLE_DESCRIPTIONS } from "../../src/server/table-descriptions.js";

test("schema registra descrição em todas as tabelas conhecidas", async () => {
  const [schemaSource, managerSource, docsSource] = await Promise.all([
    readFile("database/schema.sql", "utf8"),
    readFile("src/server/schema-manager.js", "utf8"),
    readFile("docs/DATABASE-SCHEMA.md", "utf8")
  ]);

  const schemaTableNames = [...schemaSource.matchAll(
    /CREATE TABLE IF NOT EXISTS (?:`([^`]+)`|(\w+))/gu
  )].map((match) => match[1] || match[2]);

  assert.ok(schemaTableNames.length > 0);
  for (const tableName of schemaTableNames) {
    assert.ok(TABLE_DESCRIPTIONS[tableName], `tabela sem descrição: ${tableName}`);
    assert.match(docsSource, new RegExp(`\\| \`${tableName}\` \\|`));
  }

  assert.match(schemaSource, /COMMENT='[^']+'/u);
  assert.match(managerSource, /ensureTableDescriptions/u);
  assert.match(managerSource, /ALTER TABLE/u);
});

test("descrições de tabela possuem texto em português", () => {
  for (const [tableName, description] of Object.entries(TABLE_DESCRIPTIONS)) {
    assert.ok(description.trim().length >= 20, `descrição curta: ${tableName}`);
  }
});
