import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("consulta conversões culinárias usa a coluna canônica do estado físico", async () => {
  const source = await readFile("src/server/server.js", "utf8");
  const conversionQuery = source.match(
    /SELECT conv\.idUnitConversion AS idCulinaryUnitConversion[\s\S]*?ORDER BY source\.descriptionUnit/u
  )?.[0];

  assert.ok(conversionQuery, "consulta de conversões não encontrada");
  assert.match(conversionQuery, /conv\.idPhysicalStateUnitConversion/u);
  assert.match(
    conversionQuery,
    /state\.idPhysicalState = conv\.idPhysicalStateUnitConversion/u
  );
  assert.doesNotMatch(
    conversionQuery,
    /conv\.idPhysicalStateCulinaryUnitConversion/u
  );
});
