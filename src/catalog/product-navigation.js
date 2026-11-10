import {
  getContextualNavigationItems,
  renderContextualNavigationItems
} from "../ui/contextual-navigation.js";
import { resolveNavigationHandler } from "../ui/navigation-routing.js";

const productNavigation = [
  ["finished-goods", "Mercadoria para Revenda"],
  ["finished-products", "Produtos Acabados"],
  ["raw-materials", "Matérias-primas"],
  ["packaging", "Embalagem"],
  ["consumables", "Material de Uso e Consumo"],
  ["product-types", "Tipo de Produto"],
  ["units", "Unidades"],
  ["classes", "Classes"],
  ["groups", "Grupos"],
  ["ncm-cest", "NCM / CEST"]
];

export const renderProductNavigation = (active) => {
  const items = getContextualNavigationItems("products", productNavigation);
  return `
    <div class="classic-toolbar">
      ${renderContextualNavigationItems(items, active, "product-nav")}
    </div>
  `;
};

export const bindProductNavigation = (root, handlers) => {
  root.querySelectorAll("[data-product-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      const route = button.dataset.productNav;
      const handler = resolveNavigationHandler(handlers, route)
        || resolveNavigationHandler(window.__PDV_NAVIGATION_HANDLERS__, route);
      handler?.();
    });
  });
};
