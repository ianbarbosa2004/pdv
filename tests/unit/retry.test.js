import test from "node:test";
import assert from "node:assert/strict";
import { runWithRetry } from "../../src/shared/retry.js";

test("repete a leitura após falha transitória e preserva o divisor retornado", async () => {
  let calls = 0;
  const navigation = {
    menus: [{ idNavigationMenu: 1, keyNavigationMenu: "cadastros" }],
    items: [{
      idNavigationItem: 701,
      idNavigationMenu: 1,
      idParentNavigationItem: null,
      typeNavigationItem: "divider",
      keyNavigationItem: "custom-divider",
      labelNavigationItem: "Divisor personalizado",
      orderNavigationItem: 2,
      isActiveNavigationItem: 1
    }]
  };

  const result = await runWithRetry(async () => {
    calls += 1;
    if (calls < 3) throw new Error("API reiniciando");
    return navigation;
  }, { delayMs: 0 });

  assert.equal(calls, 3);
  assert.equal(result.items[0].typeNavigationItem, "divider");
  assert.equal(result.items[0].keyNavigationItem, "custom-divider");
});

test("propaga a última falha quando a API não responde", async () => {
  let calls = 0;
  await assert.rejects(
    () => runWithRetry(async () => {
      calls += 1;
      throw new Error("API indisponível");
    }, { attempts: 2, delayMs: 0 }),
    { message: "API indisponível" }
  );
  assert.equal(calls, 2);
});
