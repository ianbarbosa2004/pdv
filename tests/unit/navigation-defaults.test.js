import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_NAVIGATION,
  ensureApiStatusNavigation,
  isNavigationKey,
  mergeNavigationDefaults,
  normalizeNavigationKey
} from "../../src/shared/navigation-defaults.js";
import { selectContextualNavigationItems } from "../../src/ui/contextual-navigation.js";
import { resolveNavigationHandler } from "../../src/ui/navigation-routing.js";
import { renderMainMenu } from "../../src/ui/main-menu.js";
import { getNavigationBuilderDividerIdsBeforeChildren } from "../../src/shared/navigation-builder-order.js";

test("normaliza chaves de navegação independentemente da caixa", () => {
  assert.equal(normalizeNavigationKey("Cadastros"), "cadastros");
  assert.equal(normalizeNavigationKey("NFCE-Query"), "nfce-query");
  assert.equal(isNavigationKey("Cadastros", "cadastros"), true);
});

test("mantém o contrato sem criar navegação artificial", () => {
  assert.equal(isNavigationKey("registrations", "cadastros"), false);
});

test("preserva menus persistidos personalizados inativos no construtor", () => {
  const navigation = mergeNavigationDefaults({
    menus: [
      {
        idNavigationMenu: 91,
        keyNavigationMenu: "custom-menu",
        labelNavigationMenu: "Menu personalizado",
        orderNavigationMenu: 4,
        isActiveNavigationMenu: 0
      }
    ],
    items: []
  });

  assert.deepEqual(
    navigation.menus.find((menu) => menu.keyNavigationMenu === "custom-menu"),
    {
      idNavigationMenu: 91,
      keyNavigationMenu: "custom-menu",
      labelNavigationMenu: "Menu personalizado",
      orderNavigationMenu: 4,
      isActiveNavigationMenu: 0
    }
  );
});

test("preserva o estado inativo dos menus padrão no construtor", () => {
  const navigation = mergeNavigationDefaults({
    menus: [
      {
        idNavigationMenu: 1,
        keyNavigationMenu: "cadastros",
        labelNavigationMenu: "Cadastros",
        orderNavigationMenu: 2,
        isActiveNavigationMenu: 0
      }
    ],
    items: []
  });

  assert.equal(
    navigation.menus.find((menu) => menu.keyNavigationMenu === "cadastros")?.isActiveNavigationMenu,
    0
  );
});

test("preserva a ordem persistida e os divisores personalizados", () => {
  const navigation = mergeNavigationDefaults({
    menus: [{
      idNavigationMenu: 1,
      keyNavigationMenu: "cadastros",
      labelNavigationMenu: "Cadastros",
      orderNavigationMenu: 1,
      isActiveNavigationMenu: 1
    }],
    items: [
      {
        idNavigationItem: 700,
        idNavigationMenu: 1,
        idParentNavigationItem: null,
        typeNavigationItem: "item",
        keyNavigationItem: "fiscal-operations",
        labelNavigationItem: "Operações Fiscais",
        routeNavigationItem: "fiscal-operations",
        orderNavigationItem: 6,
        isActiveNavigationItem: 1
      },
      {
        idNavigationItem: 701,
        idNavigationMenu: 1,
        idParentNavigationItem: null,
        typeNavigationItem: "divider",
        keyNavigationItem: "custom-divider",
        labelNavigationItem: "Divisor personalizado",
        routeNavigationItem: null,
        orderNavigationItem: 2,
        isActiveNavigationItem: 1
      }
    ]
  });

  assert.equal(
    navigation.items.find((item) => item.keyNavigationItem === "fiscal-operations")
      ?.orderNavigationItem,
    6
  );
  assert.deepEqual(
    navigation.items.find((item) => item.keyNavigationItem === "custom-divider"),
    {
      idNavigationItem: 701,
      idNavigationMenu: 1,
      idParentNavigationItem: null,
      typeNavigationItem: "divider",
      keyNavigationItem: "custom-divider",
      labelNavigationItem: "Divisor personalizado",
      routeNavigationItem: null,
      orderNavigationItem: 2,
      isActiveNavigationItem: 1
    }
  );
});

test("separa o item do menu da barra contextual de Operações Fiscais", () => {
  const menuItem = DEFAULT_NAVIGATION.items.find(
    (item) => item.keyNavigationItem === "fiscal-operations"
  );
  const contextualItem = DEFAULT_NAVIGATION.items.find(
    (item) => item.keyNavigationItem === "fiscal-operations-context"
  );

  assert.deepEqual(
    {
      typeNavigationItem: menuItem?.typeNavigationItem,
      orderNavigationItem: menuItem?.orderNavigationItem,
      parentKey: menuItem?.parentKey
    },
    { typeNavigationItem: "item", orderNavigationItem: 6, parentKey: null }
  );
  assert.deepEqual(
    {
      typeNavigationItem: contextualItem?.typeNavigationItem,
      orderNavigationItem: contextualItem?.orderNavigationItem,
      parentKey: contextualItem?.parentKey,
      routeNavigationItem: contextualItem?.routeNavigationItem
    },
    {
      typeNavigationItem: "bar",
      orderNavigationItem: 1,
      parentKey: "fiscal-operations",
      routeNavigationItem: "fiscal-operations"
    }
  );
});

test("mescla Operações Fiscais como item principal e barra contextual distintos", () => {
  const navigation = mergeNavigationDefaults({ menus: [], items: [] });
  const fiscalItems = navigation.items.filter((item) =>
    item.routeNavigationItem === "fiscal-operations"
  );

  assert.deepEqual(
    fiscalItems.map((item) => ({
      typeNavigationItem: item.typeNavigationItem,
      orderNavigationItem: item.orderNavigationItem,
      idParentNavigationItem: item.idParentNavigationItem
    })),
    [
      {
        typeNavigationItem: "item",
        orderNavigationItem: 6,
        idParentNavigationItem: null
      },
      {
        typeNavigationItem: "bar",
        orderNavigationItem: 1,
        idParentNavigationItem: "default-item-cadastros-fiscal-operations-6"
      }
    ]
  );
});

test("usa a barra contextual persistida sem duplicar o item pai", () => {
  const navigation = mergeNavigationDefaults({ menus: [], items: [] });
  const items = selectContextualNavigationItems(
    navigation,
    "fiscal-operations",
    [["fiscal-operations", "Operações Fiscais"], ["cfops", "CFOP"]]
  );

  assert.deepEqual(items.slice(0, 2), [
    ["fiscal-operations", "Operações Fiscais"],
    ["cfops", "CFOP"]
  ]);
  assert.equal(items.filter(([, label]) => label === "Operações Fiscais").length, 1);
});

test("posiciona divisor após o item e antes das categorias filhas no construtor", () => {
  const dividerIds = getNavigationBuilderDividerIdsBeforeChildren([
    {
      idNavigationItem: 10,
      idParentNavigationItem: null,
      typeNavigationItem: "item",
      orderNavigationItem: 1
    },
    {
      idNavigationItem: 11,
      idParentNavigationItem: 10,
      typeNavigationItem: "bar",
      orderNavigationItem: 1
    },
    {
      idNavigationItem: 12,
      idParentNavigationItem: null,
      typeNavigationItem: "divider",
      orderNavigationItem: 2
    },
    {
      idNavigationItem: 13,
      idParentNavigationItem: null,
      typeNavigationItem: "item",
      orderNavigationItem: 3
    }
  ]);

  assert.deepEqual([...dividerIds], ["12"]);
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

test("resolve Frente de Caixa pelo handler fixo do menu", () => {
  const salesHandler = () => "sales";
  global.window = {
    __PDV_NAVIGATION__: { items: [] },
    __PDV_NAVIGATION_HANDLERS__: { sales: salesHandler }
  };

  assert.equal(resolveNavigationHandler({}, "sales"), salesHandler);
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

test("mantém Frente de Caixa como primeiro menu fixo e ativo", () => {
  const navigation = mergeNavigationDefaults({
    menus: [
      { idNavigationMenu: 7, keyNavigationMenu: "sales", labelNavigationMenu: "Outro nome", orderNavigationMenu: 99, isActiveNavigationMenu: 0 }
    ],
    items: []
  });
  const ordered = [...navigation.menus].sort((left, right) =>
    Number(left.orderNavigationMenu) - Number(right.orderNavigationMenu)
  );
  const sales = navigation.menus.find((menu) => menu.keyNavigationMenu === "sales");
  assert.equal(sales.labelNavigationMenu, "Frente de Caixa");
  assert.equal(sales.isActiveNavigationMenu, 1);
  assert.equal(sales.orderNavigationMenu, 0);
  assert.equal(ordered[0], sales);
});

test("inclui Views no menu Ferramentas", () => {
  const views = DEFAULT_NAVIGATION.items.find((item) => item.keyNavigationItem === "views");

  assert.deepEqual(
    {
      menuKey: views?.menuKey,
      label: views?.labelNavigationItem,
      route: views?.routeNavigationItem,
      type: views?.typeNavigationItem
    },
    {
      menuKey: "tools",
      label: "Views",
      route: null,
      type: "item"
    }
  );
  assert.deepEqual(
    DEFAULT_NAVIGATION.items
      .filter((item) => item.parentKey === "views")
      .map(({ keyNavigationItem, labelNavigationItem, routeNavigationItem, orderNavigationItem }) =>
        ({ keyNavigationItem, labelNavigationItem, routeNavigationItem, orderNavigationItem })),
    [
      { keyNavigationItem: "groups-products", labelNavigationItem: "Grupos x Produtos", routeNavigationItem: "groups-products", orderNavigationItem: 1 },
      { keyNavigationItem: "no-cost", labelNavigationItem: "Sem Custo", routeNavigationItem: "no-cost", orderNavigationItem: 2 },
      { keyNavigationItem: "no-physical-state", labelNavigationItem: "Sem Estado Físico", routeNavigationItem: "no-physical-state", orderNavigationItem: 3 }
    ]
  );
});

test("inclui Ficha Técnica com os cadastros culinários", () => {
  const ficha = DEFAULT_NAVIGATION.items.find((item) => item.keyNavigationItem === "technical-sheet");
  assert.equal(ficha?.routeNavigationItem, "culinary-units");
  assert.equal(ficha?.typeNavigationItem, "item");
  assert.deepEqual(
    DEFAULT_NAVIGATION.items
      .filter((item) => item.parentKey === "technical-sheet")
      .map(({ keyNavigationItem, routeNavigationItem }) => ({ keyNavigationItem, routeNavigationItem })),
    [
      { keyNavigationItem: "culinary-units", routeNavigationItem: "culinary-units" },
      { keyNavigationItem: "physical-states", routeNavigationItem: "physical-states" },
      { keyNavigationItem: "culinary-conversions", routeNavigationItem: "culinary-conversions" }
    ]
  );
});

test("renderiza Views como item direto e clicável", () => {
  global.window = {
    __PDV_NAVIGATION__: mergeNavigationDefaults({ menus: [], items: [] })
  };

  const menu = renderMainMenu();
  assert.match(menu, /<button type="button" data-main-menu="views">Views<\/button>/);
});

test("renderiza Frente de Caixa antes dos menus agrupados", () => {
  global.window = {
    __PDV_NAVIGATION__: mergeNavigationDefaults({ menus: [], items: [] })
  };

  const menu = renderMainMenu();
  assert.match(menu, /^\s*<nav[\s\S]*?<button type="button" data-main-menu="sales">Frente de Caixa<\/button>/);
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

test("remove cópia do Construtor de navegação persistida em Ferramentas", () => {
  const navigation = mergeNavigationDefaults({
    menus: [
      { idNavigationMenu: 7, keyNavigationMenu: "settings", labelNavigationMenu: "Configurações" },
      { idNavigationMenu: 8, keyNavigationMenu: "tools", labelNavigationMenu: "Ferramentas" }
    ],
    items: [
      { idNavigationItem: 10, idNavigationMenu: 7, keyNavigationItem: "navigation-builder", routeNavigationItem: "navigation-builder" },
      { idNavigationItem: 11, idNavigationMenu: 8, keyNavigationItem: "navigation-builder", labelNavigationItem: "Construtor de menu", routeNavigationItem: "navigation-builder" }
    ]
  });

  const builderItems = navigation.items.filter((item) => item.keyNavigationItem === "navigation-builder");
  assert.equal(builderItems.length, 1);
  assert.equal(builderItems[0].idNavigationMenu, 7);
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
