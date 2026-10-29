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
  ["units", "Unidade tributável"],
  ["classes", "Classes"],
  ["groups", "Grupos"],
  ["ncm-cest", "NCM / CEST"]
];

export const renderProductNavigation = (active) => {
  const items = getContextualNavigationItems("products", productNavigation);
  return `
    <div class="classic-toolbar">
      <button class="classic-tool-button" data-product-nav="back" type="button">← Frente de caixa</button>
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
