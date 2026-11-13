import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../../src/server/server.js", import.meta.url), "utf8");

test("importação fiscal mantém os placeholders alinhados às colunas do documento", () => {
  const match = source.match(
    /INSERT INTO fiscal_documents[\s\S]*?VALUES \(([^)]*)\)/u
  );
  assert.ok(match, "SQL de inserção do documento fiscal não encontrado");
  assert.equal((match[1].match(/\?/gu) || []).length, 31);
});
