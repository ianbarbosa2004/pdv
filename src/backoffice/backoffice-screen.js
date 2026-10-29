import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { resolveNavigationHandler } from "../ui/navigation-routing.js";

const shortcutDescriptions = {
  classes: "Organize as classes de produtos.",
  groups: "Gerencie os grupos vinculados às classes.",
  products: "Cadastre e mantenha o catálogo.",
  "raw-materials": "Cadastre matérias-primas utilizadas no processo.",
  packaging: "Cadastre embalagens utilizadas pelos produtos.",
  consumables: "Cadastre materiais de uso e consumo.",
  "product-types": "Consulte e mantenha os tipos de produto.",
  units: "Consulte e mantenha as unidades de medida.",
  "ncm-cest": "Consulte a classificação fiscal de produtos.",
  "fiscal-operations": "Cadastre CFOP, CST, PIS, COFINS, ICMS e regras fiscais.",
  financial: "Gerencie formas de pagamento e tabelas financeiras.",
  "thermal-print": "Teste caracteres, tamanhos e alinhamento em papel de 80 mm.",
  "nfce-query": "Teste a consulta oficial e prepare itens para futuras entradas de compras.",
  settings: "Selecione as impressoras padrão de cupons e relatórios."
};

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const shortcutOrder = [
  "classes",
  "groups",
  "products",
  "raw-materials",
  "packaging",
  "consumables",
  "product-types",
  "units",
  "ncm-cest",
  "fiscal-operations",
  "financial",
  "thermal-print",
  "settings"
];

const getBackofficeShortcuts = (handlers) => {
  const navigation = window.__PDV_NAVIGATION__;
  const items = Array.isArray(navigation?.items)
    ? navigation.items
      .filter((item) => item.isActiveNavigationItem !== 0
        && item.isActiveNavigationItem !== false
        && item.showsInBackofficeHomeNavigationItem !== 0
        && item.showsInBackofficeHomeNavigationItem !== false
        && item.showsInBackofficeHomeNavigationItem !== "0"
        && resolveNavigationHandler(handlers, item.keyNavigationItem))
      .sort((left, right) => {
        const leftIndex = shortcutOrder.indexOf(left.keyNavigationItem);
        const rightIndex = shortcutOrder.indexOf(right.keyNavigationItem);
        if (leftIndex >= 0 || rightIndex >= 0) {
          return (leftIndex < 0 ? shortcutOrder.length : leftIndex)
            - (rightIndex < 0 ? shortcutOrder.length : rightIndex);
        }
        return Number(left.orderNavigationItem || 0) - Number(right.orderNavigationItem || 0);
      })
    : [];
  if (Array.isArray(navigation?.items)) return items;
  return shortcutOrder.map((keyNavigationItem) => ({
    keyNavigationItem,
    labelNavigationItem: {
      classes: "Classes",
      groups: "Grupos",
      products: "Produtos",
      "fiscal-operations": "Operações fiscais",
      financial: "Financeiros",
      "thermal-print": "Impressão térmica",
      settings: "Impressoras"
    }[keyNavigationItem]
  })).filter((item) => handlers[item.keyNavigationItem]);
};

export function createBackofficeScreen({
  onBack,
  onClasses,
  onGroups,
  onProducts,
  onRawMaterials,
  onPackaging,
  onConsumables,
  onProductTypes,
  onUnits,
  onNcmCest,
  onFiscalOperations,
  onFinancial,
  onThermalPrint,
  onNcmCestUpdate,
  onApiStatus,
  onSettings,
  onGeneralSettings,
  onCompany,
  onNfce,
  onNfceQuery,
  onNavigationBuilder,
  onPaymentMethods
}) {
  const root = document.createElement("main");
  const shortcutHandlers = {
    classes: onClasses,
    groups: onGroups,
    products: onProducts,
    "raw-materials": onRawMaterials,
    packaging: onPackaging,
    consumables: onConsumables,
    "product-types": onProductTypes,
    units: onUnits,
    "ncm-cest": onNcmCest,
    "fiscal-operations": onFiscalOperations,
    financial: onFinancial,
    "thermal-print": onThermalPrint,
    "ncm-cest-update": onNcmCestUpdate,
    "api-status": onApiStatus,
    settings: onSettings,
    "general-settings": onGeneralSettings,
    company: onCompany,
    nfce: onNfce,
    "nfce-query": onNfceQuery,
    "navigation-builder": onNavigationBuilder,
    "payment-methods": onPaymentMethods
  };
  const shortcuts = getBackofficeShortcuts(shortcutHandlers);

  root.className = "catalog-screen";
  root.innerHTML = `
    <header class="classic-titlebar">
      <strong>PDV - Retaguarda</strong>
      <span>Operador: Operador</span>
    </header>
    ${renderMainMenu()}
    <div class="classic-toolbar">
      <button class="classic-tool-button" data-back type="button">← Frente de caixa</button>
      <strong>Início da retaguarda</strong>
    </div>
    <section class="backoffice-home">
      <div class="backoffice-home-heading">
        <p class="eyebrow">Administração</p>
        <h1>Retaguarda</h1>
        <p>Selecione uma área para gerenciar os cadastros do PDV.</p>
      </div>
      <div class="backoffice-shortcuts">
        ${shortcuts.map((shortcut) => `
          <button class="backoffice-shortcut" data-shortcut-key="${shortcut.keyNavigationItem}" type="button">
            <strong>${escapeHtml(shortcut.labelNavigationItem)}</strong>
            <span>${escapeHtml(shortcut.descriptionNavigationItem || shortcutDescriptions[shortcut.keyNavigationItem] || "Acesse este recurso da retaguarda.")}</span>
          </button>
        `).join("")}
        ${shortcuts.some(({ keyNavigationItem }) => keyNavigationItem === "nfce-query") ? "" : `
          <button class="backoffice-shortcut" data-shortcut-key="nfce-query" type="button">
            <strong>Consulta de NFC-e</strong>
            <span>${escapeHtml(shortcutDescriptions["nfce-query"])}</span>
          </button>
        `}
      </div>
    </section>
  `;

  bindMainMenu(root, {
    products: onProducts,
    "fiscal-operations": onFiscalOperations,
    financial: onFinancial,
    "thermal-print": onThermalPrint,
    "ncm-cest-update": onNcmCestUpdate,
    settings: onSettings,
    company: onCompany,
    nfce: onNfce,
    "payment-methods": onPaymentMethods
  });
  root.querySelector("[data-back]")?.addEventListener("click", onBack);
  root.querySelectorAll("[data-shortcut-key]").forEach((button) => {
    const handler = resolveNavigationHandler(shortcutHandlers, button.dataset.shortcutKey);
    if (handler) button.addEventListener("click", handler);
  });

  return root;
}
