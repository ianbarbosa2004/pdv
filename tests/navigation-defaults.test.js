import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_NAVIGATION,
  ensureApiStatusNavigation,
  isNavigationKey,
  mergeNavigationDefaults,
  normalizeNavigationKey
} from "../src/shared/navigation-defaults.js";
import { selectContextualNavigationItems } from "../src/ui/contextual-navigation.js";
import { resolveNavigationHandler } from "../src/ui/navigation-routing.js";

test("normaliza chaves de navegação independentemente da caixa", () => {
  assert.equal(normalizeNavigationKey("Cadastros"), "cadastros");
  assert.equal(normalizeNavigationKey("NFCE-Query"), "nfce-query");
  assert.equal(isNavigationKey("Cadastros", "cadastros"), true);
});

test("mantém o contrato sem criar navegação artificial", () => {
  assert.equal(isNavigationKey("registrations", "cadastros"), false);
});

test("seleciona filhos ativos com rota independentemente do tipo", () => {
  const items = selectContextualNavigationItems({
    items: [
      {
        idNavigationItem: 10,
        keyNavigationItem: "products",
        labelNavigationItem: "Produtos",
        typeNavigationItem: "item",
        routeNavigationItem: "products",
        isActiveNavigationItem: 1
      },
      {
        idNavigationItem: 11,
        idParentNavigationItem: 10,
        keyNavigationItem: "classes",
        labelNavigationItem: "Classes",
        typeNavigationItem: "submenu",
        routeNavigationItem: "classes",
        isActiveNavigationItem: 1,
        orderNavigationItem: 2
      }
    ]
  }, "PRODUCTS", [["products", "Produtos"]]);

  assert.deepEqual(items, [
    ["products", "Produtos"],
    ["classes", "Classes"]
  ]);
});

test("mantém o primeiro item padrão quando a navegação persistida está incompleta", () => {
  const items = selectContextualNavigationItems({
    items: [
      {
        idNavigationItem: 10,
        keyNavigationItem: "products",
        labelNavigationItem: "Produtos",
        typeNavigationItem: "item",
        routeNavigationItem: null,
        isActiveNavigationItem: 1
      },
      {
        idNavigationItem: 12,
        idParentNavigationItem: 10,
        keyNavigationItem: "raw-materials",
        labelNavigationItem: "Matérias-Primas",
        typeNavigationItem: "bar",
        routeNavigationItem: "raw-materials",
        isActiveNavigationItem: 1,
        orderNavigationItem: 2
      }
    ]
  }, "products", [
    ["finished-goods", "Mercadoria para Revenda"],
    ["raw-materials", "Matérias-primas"]
  ]);

  assert.deepEqual(items, [
    ["finished-goods", "Mercadoria para Revenda"],
    ["raw-materials", "Matérias-Primas"]
  ]);
});

test("resolve item sem rota pelo primeiro filho ativo", () => {
  const finishedGoodsHandler = () => "finished-goods";
  global.window = {
    __PDV_NAVIGATION__: {
      items: [
        {
          idNavigationItem: 1,
          keyNavigationItem: "products",
          routeNavigationItem: null,
          isActiveNavigationItem: 1
        },
        {
          idNavigationItem: 2,
          idParentNavigationItem: 1,
          keyNavigationItem: "finished-goods",
          routeNavigationItem: "finished-goods",
          orderNavigationItem: 1,
          isActiveNavigationItem: 1
        }
      ]
    },
    __PDV_NAVIGATION_HANDLERS__: {
      "finished-goods": finishedGoodsHandler
    }
  };

  assert.equal(resolveNavigationHandler({}, "products"), finishedGoodsHandler);
});

test("prioriza handler da chave quando a rota persistida é diferente", () => {
  const keyHandler = () => "fiscal-operations";
  const routeHandler = () => "legacy-fiscal-route";
  global.window = {
    __PDV_NAVIGATION__: {
      items: [{
        idNavigationItem: 2,
        keyNavigationItem: "fiscal-operations",
        routeNavigationItem: "legacy-fiscal-route",
        isActiveNavigationItem: 1
      }]
    },
    __PDV_NAVIGATION_HANDLERS__: {
      "fiscal-operations": keyHandler,
      "legacy-fiscal-route": routeHandler
    }
  };

  assert.equal(resolveNavigationHandler({}, "fiscal-operations"), keyHandler);
});

test("mantém o handler global de saída quando a tela não o declara localmente", () => {
  const exitHandler = () => "exit";
  global.window = {
    __PDV_NAVIGATION__: { items: [] },
    __PDV_NAVIGATION_HANDLERS__: { exit: exitHandler }
  };

  assert.equal(resolveNavigationHandler({}, "exit"), exitHandler);
});

test("recria a rota essencial de Status da API quando a navegação persistida a perde", () => {
  const navigation = ensureApiStatusNavigation({
    menus: [{ idNavigationMenu: 1, keyNavigationMenu: "tools", labelNavigationMenu: "Ferramentas" }],
    items: [{ idNavigationItem: 5, idNavigationMenu: 1, keyNavigationItem: "backup", routeNavigationItem: "backup" }]
  });

  assert.equal(navigation.items.some((item) =>
    item.keyNavigationItem === "api-status"
    && item.routeNavigationItem === "api-status"
    && item.isActiveNavigationItem === 1
    && item.idNavigationMenu === 1
  ), true);
});

test("corrige uma entrada existente de Status da API com rota ou menu incorretos", () => {
  const navigation = ensureApiStatusNavigation({
    menus: [
      { idNavigationMenu: 1, keyNavigationMenu: "tools", labelNavigationMenu: "Ferramentas" },
      { idNavigationMenu: 2, keyNavigationMenu: "cadastros", labelNavigationMenu: "Cadastros" }
    ],
    items: [{
      idNavigationItem: 5,
      idNavigationMenu: 2,
      keyNavigationItem: "status",
      labelNavigationItem: "Status da API",
      routeNavigationItem: null,
      isActiveNavigationItem: 0
    }]
  });

  const statusItem = navigation.items.find((item) => item.keyNavigationItem === "api-status");
  assert.equal(statusItem.idNavigationMenu, 1);
  assert.equal(statusItem.routeNavigationItem, "api-status");
  assert.equal(statusItem.isActiveNavigationItem, 0);
});

test("mantém a estrutura essencial completa quando a API retorna navegação parcial", () => {
  const navigation = mergeNavigationDefaults({
    menus: [{ idNavigationMenu: 7, keyNavigationMenu: "tools", labelNavigationMenu: "Ferramentas" }],
    items: [{ idNavigationItem: 8, idNavigationMenu: 7, keyNavigationItem: "backup", routeNavigationItem: "backup" }]
  });

  assert.equal(navigation.menus.length, DEFAULT_NAVIGATION.menus.length);
  for (const definition of DEFAULT_NAVIGATION.items) {
    const item = navigation.items.find((entry) =>
      entry.menuKey === definition.menuKey || entry.keyNavigationItem === definition.keyNavigationItem
    );
    assert.ok(item, `item ausente: ${definition.keyNavigationItem}`);
  }
  const products = navigation.items.find((item) => item.keyNavigationItem === "products");
  const finishedGoods = navigation.items.find((item) => item.keyNavigationItem === "finished-goods");
  assert.equal(finishedGoods.idParentNavigationItem, products.idNavigationItem);
});

test("mantém Sair como último menu ativo e não permite que ele desapareça", () => {
  const navigation = mergeNavigationDefaults({
    menus: [
      { idNavigationMenu: 7, keyNavigationMenu: "tools", labelNavigationMenu: "Ferramentas", orderNavigationMenu: 99 },
      { idNavigationMenu: 8, keyNavigationMenu: "exit", labelNavigationMenu: "Outro nome", orderNavigationMenu: 1, isActiveNavigationMenu: 0 }
    ],
    items: []
  });
  const ordered = [...navigation.menus].sort((left, right) =>
    Number(left.orderNavigationMenu) - Number(right.orderNavigationMenu)
  );
  const exit = navigation.menus.find((menu) => menu.keyNavigationMenu === "exit");
  assert.equal(exit.labelNavigationMenu, "Sair");
  assert.equal(exit.isActiveNavigationMenu, 1);
  assert.equal(exit.orderNavigationMenu, 65535);
  assert.equal(ordered.at(-1), exit);
});

test("remove itens persistidos duplicados dos itens padrão", () => {
  const navigation = mergeNavigationDefaults({
    menus: [{ idNavigationMenu: 7, keyNavigationMenu: "settings", labelNavigationMenu: "Configurações" }],
    items: [
      { idNavigationItem: 8, idNavigationMenu: 7, keyNavigationItem: "navigation-builder", routeNavigationItem: "navigation-builder" },
      { idNavigationItem: 9, idNavigationMenu: 7, keyNavigationItem: "navigation-builder", routeNavigationItem: "navigation-builder" }
    ]
  });

  const builderItems = navigation.items.filter((item) => item.keyNavigationItem === "navigation-builder");
  assert.equal(builderItems.length, 1);
  assert.equal(builderItems[0].idNavigationItem, 8);
});

test("preserva item personalizado que reutiliza rota padrão", () => {
  const navigation = mergeNavigationDefaults({
    menus: [{ idNavigationMenu: 7, keyNavigationMenu: "tools", labelNavigationMenu: "Ferramentas" }],
    items: [{
      idNavigationItem: 20,
      idNavigationMenu: 7,
      keyNavigationItem: "custom-api-check",
      labelNavigationItem: "Verificação personalizada",
      routeNavigationItem: "api-status"
    }]
  });

  const customItem = navigation.items.find((item) => item.keyNavigationItem === "custom-api-check");
  assert.equal(customItem?.routeNavigationItem, "api-status");
});
