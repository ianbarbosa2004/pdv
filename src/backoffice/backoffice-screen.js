import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { resolveNavigationHandler } from "../ui/navigation-routing.js";
import { apiFetch, getApiUrl } from "../shared/api.js";
import { renderLucideIcons } from "../ui/icons.js";

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
  settings: "Selecione as impressoras padrão de cupons e relatórios.",
  suppliers: "Cadastre e mantenha os fornecedores da loja."
};

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const getBackofficeShortcuts = (handlers) => {
  const navigation = window.__PDV_NAVIGATION__;
  const menus = new Map((navigation?.menus || []).map((menu) => [
    String(menu.idNavigationMenu),
    menu
  ]));
  const items = Array.isArray(navigation?.items)
    ? navigation.items
      .filter((item) => item.isActiveNavigationItem !== 0
        && item.isActiveNavigationItem !== false
        && item.showsInBackofficeHomeNavigationItem !== 0
        && item.showsInBackofficeHomeNavigationItem !== false
        && item.showsInBackofficeHomeNavigationItem !== "0"
        && resolveNavigationHandler(handlers, item.keyNavigationItem))
      .sort((left, right) => {
        const leftMenu = menus.get(String(left.idNavigationMenu));
        const rightMenu = menus.get(String(right.idNavigationMenu));
        const menuOrder = Number(leftMenu?.orderNavigationMenu || 0)
          - Number(rightMenu?.orderNavigationMenu || 0);
        if (menuOrder) return menuOrder;
        const itemOrder = Number(left.orderNavigationItem || 0)
          - Number(right.orderNavigationItem || 0);
        if (itemOrder) return itemOrder;
        return String(left.labelNavigationItem || "").localeCompare(
          String(right.labelNavigationItem || ""),
          "pt-BR"
        );
      })
    : [];
  return items;
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
  onBackup,
  onSettings,
  onGeneralSettings,
  onCompany,
  onNfce,
  onNfceQuery,
  onNavigationBuilder,
  onPaymentMethods,
  onSuppliers,
  onCustomers,
  onConsumers
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
    "payment-methods": onPaymentMethods,
    suppliers: onSuppliers,
    customers: onCustomers,
    consumers: onConsumers
  };
  const shortcuts = getBackofficeShortcuts(shortcutHandlers);
  let operator = null;
  let cashSession = null;

  const render = () => {
    root.className = "catalog-screen";
    root.innerHTML = `
    <header class="classic-titlebar">
      <strong>PDV - Retaguarda</strong>
      <span>
        Operador: ${escapeHtml(operator?.displayNameOperator || "Operador")}
        · Caixa: ${cashSession ? "Aberto" : "Fechado"}
      </span>
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
            <span class="backoffice-shortcut-icon" aria-hidden="true"><i data-lucide="${shortcut.keyNavigationItem === "settings" ? "printer" : shortcut.keyNavigationItem === "financial" ? "wallet-cards" : shortcut.keyNavigationItem === "company" ? "building-2" : shortcut.keyNavigationItem === "nfce" ? "file-check-2" : "folder-cog"}"></i></span>
            <strong>${escapeHtml(shortcut.labelNavigationItem)}</strong>
            <span>${escapeHtml(shortcut.descriptionNavigationItem || shortcutDescriptions[shortcut.keyNavigationItem] || "Acesse este recurso da retaguarda.")}</span>
          </button>
        `).join("")}
      </div>
    </section>
  `;
    renderLucideIcons(root);
  };
  render();

  bindMainMenu(root, {
    products: onProducts,
    "fiscal-operations": onFiscalOperations,
    financial: onFinancial,
    "thermal-print": onThermalPrint,
    "ncm-cest-update": onNcmCestUpdate,
    settings: onSettings,
    company: onCompany,
    nfce: onNfce,
    "nfce-query": onNfceQuery,
    "payment-methods": onPaymentMethods,
    suppliers: onSuppliers,
    customers: onCustomers,
    consumers: onConsumers,
    "api-status": onApiStatus,
    "thermal-print": onThermalPrint,
    "ncm-cest-update": onNcmCestUpdate,
    "navigation-builder": onNavigationBuilder,
    backup: onBackup
  });
  root.querySelector("[data-back]")?.addEventListener("click", onBack);
  root.querySelectorAll("[data-shortcut-key]").forEach((button) => {
    const handler = resolveNavigationHandler(shortcutHandlers, button.dataset.shortcutKey);
    if (handler) button.addEventListener("click", handler);
  });

  void Promise.all([
    apiFetch(`${getApiUrl()}/api/operator/session`),
    apiFetch(`${getApiUrl()}/api/cash/current`)
  ]).then(async ([operatorResponse, cashResponse]) => {
    const operatorPayload = await operatorResponse.json();
    const cashPayload = await cashResponse.json();
    if (!operatorResponse.ok || !cashResponse.ok) {
      throw new Error("Não foi possível consultar o estado da Retaguarda.");
    }
    operator = operatorPayload.operator;
    cashSession = cashPayload.cashSession;
    render();
    bindMainMenu(root, {
      products: onProducts,
      "fiscal-operations": onFiscalOperations,
      financial: onFinancial,
      "thermal-print": onThermalPrint,
      "ncm-cest-update": onNcmCestUpdate,
      settings: onSettings,
      company: onCompany,
      nfce: onNfce,
      "nfce-query": onNfceQuery,
      "payment-methods": onPaymentMethods,
      suppliers: onSuppliers,
      customers: onCustomers,
      consumers: onConsumers,
      "api-status": onApiStatus,
      "thermal-print": onThermalPrint,
      "ncm-cest-update": onNcmCestUpdate,
      "navigation-builder": onNavigationBuilder,
      backup: onBackup
    });
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    root.querySelectorAll("[data-shortcut-key]").forEach((button) => {
      const handler = resolveNavigationHandler(shortcutHandlers, button.dataset.shortcutKey);
      if (handler) button.addEventListener("click", handler);
    });
  }).catch((error) => {
    console.error("Não foi possível carregar o estado da Retaguarda:", error);
  });

  return root;
}
