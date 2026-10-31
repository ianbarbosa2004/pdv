import test from "node:test";
import assert from "node:assert/strict";
import {
  isNavigationKey,
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
