const fiscalNavigation = [
  ["fiscal-operations", "Operações Fiscais"],
  ["cfops", "CFOP"],
  ["tax-situations", "CST / CSOSN"],
  ["icms-rates", "Alíquotas ICMS"],
  ["tax-regimes", "Regimes"],
  ["operation-types", "Tipos"],
  ["contexts", "Contextos"],
  ["origins", "Origens"],
  ["ipi-situations", "IPI"],
  ["contribution-situations", "PIS / COFINS"],
  ["base-modes", "Bases"],
  ["exemption-reasons", "Desoneração"]
];

export const renderFiscalNavigation = (active) => `
  <div class="classic-toolbar">
    <button class="classic-tool-button" data-fiscal-nav="back" type="button">← Frente de caixa</button>
    ${fiscalNavigation
      .map(([key, label]) => `<button class="classic-tool-button ${active === key ? "is-active" : ""}" data-fiscal-nav="${key}" type="button">${label}</button>`)
      .join("")}
  </div>
`;

export const bindFiscalNavigation = (root, handlers) => {
  root.querySelectorAll("[data-fiscal-nav]").forEach((button) => {
    button.addEventListener("click", () => handlers[button.dataset.fiscalNav]?.());
  });
};
