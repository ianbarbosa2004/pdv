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
import { createSettingsScreen } from "./settings/settings-screen.js";
import { createNcmCestScreen } from "./catalog/ncm-cest-screen.js";
import { createPaymentMethodScreen } from "./catalog/payment-method-screen.js";
import { createCompanyScreen } from "./catalog/company-screen.js";
import { createNfceScreen } from "./settings/nfce-screen.js";

const app = document.querySelector("#app");

if (!app) throw new Error("Elemento raiz da aplicação não encontrado.");

const mount = (screen) => app.replaceChildren(screen);
const common = () => ({
  onClasses: showClasses,
  onGroups: showGroups,
  onProducts: showCatalog,
  onNcmCest: showNcmCest,
  onFiscalOperations: showFiscalOperations,
  onThermalPrint: showThermalPrint,
  onNcmCestUpdate: showNcmCestUpdate,
  onSettings: showSettings,
  onCompany: showCompany,
  onNfce: showNfce,
  onFinancial: showPaymentMethods,
  onPaymentMethods: showPaymentMethods
});

const showSales = () => mount(createSaleScreen({ onBackoffice: showBackoffice }));
const showBackoffice = () =>
  mount(createBackofficeScreen({ onBack: showSales, ...common() }));
const showSettings = () =>
  mount(createSettingsScreen({ onBack: showBackoffice, ...common() }));
const showThermalPrint = () =>
  mount(createThermalPrintScreen({ onBack: showBackoffice, onTools: showThermalPrint, ...common() }));
const showNcmCestUpdate = () =>
  mount(createNcmCestUpdateScreen({
    onBack: showBackoffice,
    onTools: showNcmCestUpdate,
    onThermalPrint: showThermalPrint,
    onSettings: showSettings,
    onCompany: showCompany,
    onNfce: showNfce,
    onFinancial: showPaymentMethods
  }));
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
  mount(createCatalogScreen({ onBack: showSales, ...common() }));
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

showSales();
