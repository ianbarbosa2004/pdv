import "./styles.css";
import { createClassScreen } from "./catalog/class-screen.js";
import { createGroupScreen } from "./catalog/group-screen.js";
import { createCatalogScreen } from "./catalog/catalog-screen.js";
import { createSaleScreen } from "./sales/sale-screen.js";
import { createBackofficeScreen } from "./backoffice/backoffice-screen.js";
import { createFiscalOperationScreen } from "./catalog/fiscal-operation-screen.js";
import { createFiscalCatalogScreen } from "./catalog/fiscal-catalog-screen.js";
import { createThermalPrintScreen } from "./tools/thermal-print-screen.js";
import { createNcmCestUpdateScreen } from "./tools/ncm-cest-update-screen.js";
import { createApiStatusScreen } from "./tools/api-status-screen.js";
import { createSettingsScreen } from "./settings/settings-screen.js";
import { createNcmCestScreen } from "./catalog/ncm-cest-screen.js";
import { createPaymentMethodScreen } from "./catalog/payment-method-screen.js";
import { createCompanyScreen } from "./catalog/company-screen.js";
import { createNfceScreen } from "./settings/nfce-screen.js";
import { createProductReferenceScreen } from "./catalog/product-reference-screen.js";
import { createNavigationBuilderScreen } from "./settings/navigation-builder-screen.js";
import { createGeneralSettingsScreen } from "./settings/general-settings-screen.js";
import { loadProjectIcon } from "./ui/project-icon.js";
import { installTablePagination } from "./ui/table-pagination.js";

const app = document.querySelector("#app");

if (!app) throw new Error("Elemento raiz da aplicação não encontrado.");

const mount = (screen) => {
  app.replaceChildren(screen);
  installTablePagination(screen);
};
const common = () => ({
  onClasses: showClasses,
  onGroups: showGroups,
  onProducts: showCatalog,
  onRawMaterials: showRawMaterials,
  "raw-materials": showRawMaterials,
  onPackaging: showPackaging,
  packaging: showPackaging,
  onConsumables: showConsumables,
  consumables: showConsumables,
  onProductTypes: showProductTypes,
  onUnits: showUnits,
  onNcmCest: showNcmCest,
  onFiscalOperations: showFiscalOperations,
  onThermalPrint: showThermalPrint,
  onNcmCestUpdate: showNcmCestUpdate,
  onApiStatus: showApiStatus,
  "api-status": showApiStatus,
  onSettings: showSettings,
  onGeneralSettings: showGeneralSettings,
  "general-settings": showGeneralSettings,
  onCompany: showCompany,
  onNfce: showNfce,
  onNavigationBuilder: showNavigationBuilder,
  "navigation-builder": showNavigationBuilder,
  onFinancial: showPaymentMethods,
  onPaymentMethods: showPaymentMethods
});

const showSales = () => mount(createSaleScreen({ onBackoffice: showBackoffice }));
const showBackoffice = () =>
  mount(createBackofficeScreen({ onBack: showSales, ...common() }));
const showSettings = () =>
  mount(createSettingsScreen({ onBack: showBackoffice, ...common() }));
const showGeneralSettings = () =>
  mount(createGeneralSettingsScreen({ onBack: showSettings, ...common() }));
const showThermalPrint = () =>
  mount(createThermalPrintScreen({ onBack: showBackoffice, onTools: showThermalPrint, ...common() }));
const showNcmCestUpdate = () =>
  mount(createNcmCestUpdateScreen({
    onBack: showBackoffice,
    onTools: showNcmCestUpdate,
    onProducts: showCatalog,
    onThermalPrint: showThermalPrint,
    onSettings: showSettings,
    onCompany: showCompany,
    onNfce: showNfce,
    onFinancial: showPaymentMethods
  }));
const showApiStatus = () =>
  mount(createApiStatusScreen({ onBack: showBackoffice, onTools: showApiStatus, ...common() }));
const showFiscalOperations = () =>
  mount(createFiscalOperationScreen({
    onBack: showBackoffice,
    onCatalog: showFiscalCatalog,
    ...common()
  }));
const showFiscalCatalog = (catalog) =>
  mount(createFiscalCatalogScreen({
    catalog,
    onBack: showFiscalOperations,
    onCatalog: showFiscalCatalog,
    ...common()
  }));
const showCatalog = () =>
  mount(createCatalogScreen({
    title: "Produtos",
    productTypeDescription: "Mercadoria para Revenda",
    navigationActive: "products",
    singularLabel: "produto",
    onBack: showSales,
    ...common()
  }));
const showRawMaterials = () =>
  mount(createCatalogScreen({
    title: "Matérias-primas",
    productTypeDescription: "Matéria Prima",
    navigationActive: "raw-materials",
    singularLabel: "matéria-prima",
    createFormTitle: "Nova matéria-prima",
    editFormTitle: "Editar matéria-prima",
    skuPrefix: "MP-",
    defaultControlsStock: false,
    defaultShowsInPdv: false,
    defaultFiscalOperation: false,
    onBack: showSales,
    ...common()
  }));
const showPackaging = () =>
  mount(createCatalogScreen({
    title: "Embalagem",
    productTypeDescription: "Embalagem",
    navigationActive: "packaging",
    singularLabel: "embalagem",
    createFormTitle: "Nova embalagem",
    editFormTitle: "Editar embalagem",
    skuPrefix: "EMB-",
    defaultControlsStock: false,
    defaultShowsInPdv: false,
    defaultFiscalOperation: false,
    onBack: showSales,
    ...common()
  }));
const showConsumables = () =>
  mount(createCatalogScreen({
    title: "Material de Uso e Consumo",
    productTypeDescription: "Material de Uso e Consumo",
    navigationActive: "consumables",
    singularLabel: "material de uso e consumo",
    createFormTitle: "Novo material de uso e consumo",
    editFormTitle: "Editar material de uso e consumo",
    skuPrefix: "USO-",
    defaultControlsStock: false,
    defaultShowsInPdv: false,
    defaultFiscalOperation: false,
    onBack: showSales,
    ...common()
  }));
const showProductTypes = () =>
  mount(createProductReferenceScreen({ kind: "productTypes", onBack: showSales, ...common() }));
const showUnits = () =>
  mount(createProductReferenceScreen({ kind: "units", onBack: showSales, ...common() }));
const showNcmCest = () =>
  mount(createNcmCestScreen({ onBack: showSales, ...common() }));
const showClasses = () =>
  mount(createClassScreen({ onBack: showSales, ...common() }));
const showGroups = () =>
  mount(createGroupScreen({ onBack: showSales, ...common() }));
const showPaymentMethods = () =>
  mount(createPaymentMethodScreen({ onBack: showSales, ...common() }));
const showCompany = () =>
  mount(createCompanyScreen({ onBack: showBackoffice, ...common() }));
const showNfce = () =>
  mount(createNfceScreen({ onBack: showBackoffice, ...common() }));
const showNavigationBuilder = () =>
  mount(createNavigationBuilderScreen({ onBack: showSettings, ...common() }));

window.__PDV_NAVIGATION_HANDLERS__ = common();

const loadNavigation = async () => {
  try {
    const apiUrl = window.__PDV_API_URL__ || `http://${window.location.hostname}:3000`;
    const response = await fetch(`${apiUrl}/api/navigation`);
    const payload = await response.json();
    if (response.ok && Array.isArray(payload.menus) && Array.isArray(payload.items)) {
      window.__PDV_NAVIGATION__ = payload;
    }
  } catch {
    // Sem resposta da API, o terminal inicia sem menus persistidos.
  }
};

const apiUrl = window.__PDV_API_URL__ || `http://${window.location.hostname}:3000`;
void Promise.all([loadNavigation(), loadProjectIcon(apiUrl)]).finally(showSales);
