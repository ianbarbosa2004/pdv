import test from "node:test";
import assert from "node:assert/strict";
import { formatNfeDateTime } from "../src/server/nfce-test-service.js";

test("formata dhEmi com horário local de Minas Gerais e deslocamento explícito", () => {
  const result = formatNfeDateTime(new Date("2026-10-27T05:11:41.000Z"));
  assert.equal(result, "2026-10-27T02:11:41-03:00");
});
