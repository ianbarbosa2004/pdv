import {
  getContextualNavigationItems,
  renderContextualNavigationItems
} from "../ui/contextual-navigation.js";
import { resolveNavigationHandler } from "../ui/navigation-routing.js";

const financialNavigation = [
  ["payment-methods", "Formas de pagamento"]
];

export const renderFinancialNavigation = (active) => {
  const items = getContextualNavigationItems("financial", financialNavigation);
  return `
    <div class="classic-toolbar">
      <button class="classic-tool-button" data-financial-nav="back" type="button">← Frente de caixa</button>
      ${renderContextualNavigationItems(items, active, "financial-nav")}
    </div>
  `;
};

export const bindFinancialNavigation = (root, handlers) => {
  root.querySelectorAll("[data-financial-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      const route = button.dataset.financialNav;
      const handler = resolveNavigationHandler(handlers, route)
        || resolveNavigationHandler(window.__PDV_NAVIGATION_HANDLERS__, route);
      handler?.();
    });
  });
};
