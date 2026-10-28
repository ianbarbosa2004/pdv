import {
  getContextualNavigationItems,
  renderContextualNavigationItems
} from "../ui/contextual-navigation.js";

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
    button.addEventListener("click", () => handlers[button.dataset.financialNav]?.());
  });
};
