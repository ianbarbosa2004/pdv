import {
  getContextualNavigationItems,
  renderContextualNavigationItems
} from "../ui/contextual-navigation.js";
import { resolveNavigationHandler } from "../ui/navigation-routing.js";

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

export const renderFiscalNavigation = (active) => {
  const items = getContextualNavigationItems("fiscal-operations", fiscalNavigation);
  return `
    <div class="classic-toolbar">
      <button class="classic-tool-button" data-fiscal-nav="back" type="button">← Frente de caixa</button>
      ${renderContextualNavigationItems(items, active, "fiscal-nav")}
    </div>
  `;
};

export const bindFiscalNavigation = (root, handlers) => {
  root.querySelectorAll("[data-fiscal-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      const route = button.dataset.fiscalNav;
      const handler = resolveNavigationHandler(handlers, route)
        || resolveNavigationHandler(window.__PDV_NAVIGATION_HANDLERS__, route);
      handler?.();
    });
  });
};
