const financialNavigation = [
  ["payment-methods", "Formas de pagamento"]
];

export const renderFinancialNavigation = (active) => `
  <div class="classic-toolbar">
    <button class="classic-tool-button" data-financial-nav="back" type="button">← Frente de caixa</button>
    ${financialNavigation
      .map(([key, label]) => `<button class="classic-tool-button ${active === key ? "is-active" : ""}" data-financial-nav="${key}" type="button">${label}</button>`)
      .join("")}
  </div>
`;

export const bindFinancialNavigation = (root, handlers) => {
  root.querySelectorAll("[data-financial-nav]").forEach((button) => {
    button.addEventListener("click", () => handlers[button.dataset.financialNav]?.());
  });
};
