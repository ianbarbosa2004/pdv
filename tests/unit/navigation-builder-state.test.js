import test from "node:test";
import assert from "node:assert/strict";
import { moveNavigationSubtree } from "../../src/shared/navigation-builder-state.js";

test("move um item principal e seus filhos para outro menu", () => {
  const items = [
    { idNavigationItem: 1, idNavigationMenu: 10, idParentNavigationItem: null, typeNavigationItem: "item", orderNavigationItem: 1 },
    { idNavigationItem: 2, idNavigationMenu: 10, idParentNavigationItem: 1, typeNavigationItem: "bar", orderNavigationItem: 1 },
    { idNavigationItem: 3, idNavigationMenu: 10, idParentNavigationItem: null, typeNavigationItem: "item", orderNavigationItem: 2 },
    { idNavigationItem: 4, idNavigationMenu: 20, idParentNavigationItem: null, typeNavigationItem: "item", orderNavigationItem: 1 }
  ];

  const result = moveNavigationSubtree(items, 1, 20);

  assert.ok(result);
  assert.equal(items.find((item) => item.idNavigationItem === 1).idNavigationMenu, 20);
  assert.equal(items.find((item) => item.idNavigationItem === 1).idParentNavigationItem, null);
  assert.equal(items.find((item) => item.idNavigationItem === 2).idNavigationMenu, 20);
  assert.equal(items.find((item) => item.idNavigationItem === 2).idParentNavigationItem, 1);
  assert.equal(items.find((item) => item.idNavigationItem === 3).orderNavigationItem, 1);
  assert.equal(items.find((item) => item.idNavigationItem === 1).orderNavigationItem, 2);
});
