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
import { createNfceQueryScreen } from "./tools/nfce-query-screen.js";
import { createApiStatusScreen } from "./tools/api-status-screen.js";
import { createSettingsScreen } from "./settings/settings-screen.js";
import { createNcmCestScreen } from "./catalog/ncm-cest-screen.js";
import { createPaymentMethodScreen } from "./catalog/payment-method-screen.js";
import { createCompanyScreen } from "./catalog/company-screen.js";
import { createNfceScreen } from "./settings/nfce-screen.js";
import { createProductReferenceScreen } from "./catalog/product-reference-screen.js";
import { createNavigationBuilderScreen } from "./settings/navigation-builder-screen.js";
import { createGeneralSettingsScreen } from "./settings/general-settings-screen.js";
import { createCatalogImportScreen } from "./tools/catalog-import-screen.js";
import { createSupplierScreen } from "./catalog/supplier-screen.js";
import { createCustomerConsumerScreen } from "./catalog/customer-consumer-screen.js";
import { createBackupScreen } from "./tools/backup-screen.js";
import { createViewsScreen } from "./tools/views-screen.js";
import { createNoCostScreen } from "./tools/no-cost-screen.js";
import { createNoPhysicalStateScreen } from "./tools/no-physical-state-screen.js";
import { createCulinaryReferenceScreen } from "./catalog/culinary-reference-screen.js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { loadProjectIcon } from "./ui/project-icon.js";
import { installTablePagination } from "./ui/table-pagination.js";
import {
  apiFetch,
  getApiUrl,
  loadConfiguredApiUrl
} from "./shared/api.js";
import {
  buildFallbackNavigation,
  normalizePersistedNavigation
} from "./shared/navigation-defaults.js";
import {
  createEnvironmentSelectionScreen,
  createOperatorLoginScreen
} from "./operator/operator-login-screen.js";
import { createCashScreen } from "./operator/cash-screen.js";
import { clearOperatorSessionToken } from "./shared/api.js";

const app = document.querySelector("#app");

if (!app) throw new Error("Elemento raiz da aplicação não encontrado.");

const normalizeScreenChrome = () => {
  const operatorName = window.__PDV_OPERATOR__?.displayNameOperator || "Operador";
  app.querySelectorAll(".classic-titlebar span").forEach((label) => {
    if (label.textContent.trim() === "Operador: Operador") {
      label.textContent = `Operador: ${operatorName}`;
    }
  });
  app.querySelectorAll(".classic-toolbar > [data-back]").forEach((button) => {
    button.remove();
  });
};

const screenChromeObserver = new MutationObserver(normalizeScreenChrome);
screenChromeObserver.observe(app, { childList: true, subtree: true });

const getAppWindow = () => {
  if (!window.__TAURI_INTERNALS__) return null;
  try {
    return getCurrentWindow();
  } catch (error) {
    console.error("Não foi possível acessar a janela nativa do aplicativo:", error);
    return null;
  }
};

function requestExit() {
  const appWindow = getAppWindow();
  if (!appWindow) return;
  void appWindow.close().catch((error) => {
    console.error("Não foi possível fechar o aplicativo:", error);
  });
}

const mount = (screen) => {
  app.replaceChildren(screen);
  installTablePagination(screen);
  normalizeScreenChrome();
  screen.querySelector("[autofocus]")?.focus();
};
const common = () => ({
  sales: showSales,
  "front-of-cash": showSales,
  onClasses: showClasses,
  onGroups: showGroups,
  onProducts: showCatalog,
  "finished-goods": showCatalog,
  "finished-products": showFinishedProducts,
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
  "fiscal-operations": showFiscalOperations,
  onThermalPrint: showThermalPrint,
  onNcmCestUpdate: showNcmCestUpdate,
  onApiStatus: showApiStatus,
  "api-status": showApiStatus,
  onBackup: showBackup,
  backup: showBackup,
  onViews: showViews,
  views: showViews,
  "groups-products": showGroupsProducts,
  "no-cost": showNoCost,
  "no-physical-state": showNoPhysicalState,
  "culinary-units": showCulinaryUnits,
  "physical-states": showPhysicalStates,
  "culinary-conversions": showCulinaryConversions,
  onSettings: showSettings,
  onGeneralSettings: showGeneralSettings,
  "general-settings": showGeneralSettings,
  onCompany: showCompany,
  onNfce: showNfce,
  onNfceQuery: showNfceQuery,
  "nfce-query": showNfceQuery,
  onNavigationBuilder: showNavigationBuilder,
  "navigation-builder": showNavigationBuilder,
  onFinancial: showPaymentMethods,
  onPaymentMethods: showPaymentMethods,
  onCatalogImport: showCatalogImport,
  "import-catalogs": showCatalogImport,
  onSuppliers: showSuppliers,
  suppliers: showSuppliers,
  onCustomers: showCustomers,
  customers: showCustomers,
  onConsumers: showConsumers,
  consumers: showConsumers,
  exit: requestExit,
  sair: requestExit
});

const showCash = () => mount(createCashScreen({
  onBack: showSales,
  onOpened: showSales,
  onClosed: () => showLogin()
}));
const showSales = (options = {}) => mount(createSaleScreen({
  onBackoffice: showBackoffice,
  onCash: showCash,
  onLogout: async () => {
    await apiFetch(`${getApiUrl()}/api/operator/logout`, { method: "POST" }).catch(() => {});
    await clearOperatorSessionToken();
    showLogin();
  },
  ...options
}));
const showBackoffice = () =>
  mount(createBackofficeScreen({ onBack: showSales, ...common() }));
const showEnvironmentSelection = () => mount(createEnvironmentSelectionScreen({
  onFrontOfCash: showSales,
  onCash: showCash,
  onBackoffice: showBackoffice,
  onChangeUser: async () => {
    await apiFetch(`${getApiUrl()}/api/operator/logout`, { method: "POST" }).catch(() => {});
    await clearOperatorSessionToken();
    showLogin();
  }
}));
let startupReady = Promise.resolve();
const showLogin = () => mount(createOperatorLoginScreen({
  onAuthenticated: async () => {
    await startupReady;
    showEnvironmentSelection();
  }
}));
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
const showBackup = () =>
  mount(createBackupScreen({ onBack: showBackoffice, onTools: showBackup, ...common() }));
const showGroupsProducts = () =>
  mount(createViewsScreen({
    active: "groups-products",
    onBack: showBackoffice,
    onGroupsProducts: showGroupsProducts,
    onNoCost: showNoCost,
    onNoPhysicalState: showNoPhysicalState,
    ...common()
  }));
const showNoCost = () =>
  mount(createNoCostScreen({
    onBack: showBackoffice,
    onGroupsProducts: showGroupsProducts,
    onNoCost: showNoCost,
    ...common()
  }));
const showNoPhysicalState = () =>
  mount(createNoPhysicalStateScreen({
    onBack: showBackoffice,
    onGroupsProducts: showGroupsProducts,
    onNoCost: showNoCost,
    onNoPhysicalState: showNoPhysicalState,
    ...common()
  }));
const showCulinaryUnits = () =>
  mount(createCulinaryReferenceScreen({ kind: "culinaryUnits", onBack: showSales, ...common() }));
const showPhysicalStates = () =>
  mount(createCulinaryReferenceScreen({ kind: "physicalStates", onBack: showSales, ...common() }));
const showCulinaryConversions = () =>
  mount(createCulinaryReferenceScreen({ kind: "conversions", onBack: showSales, ...common() }));
const showViews = showGroupsProducts;
const showCatalogImport = () =>
  mount(createCatalogImportScreen({ onBack: showBackoffice, onTools: showCatalogImport, ...common() }));
const showSuppliers = () =>
  mount(createSupplierScreen({ onBack: showBackoffice, ...common() }));
const showCustomers = () =>
  mount(createCustomerConsumerScreen({ kind: "customer", onBack: showBackoffice, ...common() }));
const showConsumers = () =>
  mount(createCustomerConsumerScreen({ kind: "consumer", onBack: showBackoffice, ...common() }));
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
const showCatalog = (initialProductId = null) =>
  mount(createCatalogScreen({
    title: "Mercadoria para Revenda",
    listTitle: "Mercadorias para Revenda",
    productTypeDescription: "Mercadoria para Revenda",
    navigationActive: "finished-goods",
    singularLabel: "mercadoria para revenda",
    createFormTitle: "Nova mercadoria para revenda",
    skuPrefix: "REV-",
    initialProductId,
    onBack: showSales,
    ...common()
  }));
const showFinishedProducts = (initialProductId = null) =>
  mount(createCatalogScreen({
    title: "Produtos Acabados",
    productTypeDescription: "Produto Acabado",
    navigationActive: "finished-products",
    initialProductId,
    singularLabel: "produto acabado",
    defaultFiscalOperationDescription: "Venda de produção",
    onBack: showSales,
    ...common()
  }));
const showRawMaterials = (initialProductId = null) =>
  mount(createCatalogScreen({
    title: "Matérias-primas",
    productTypeDescription: "Matéria-Prima",
    navigationActive: "raw-materials",
    initialProductId,
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
const showPackaging = (initialProductId = null) =>
  mount(createCatalogScreen({
    title: "Embalagem",
    productTypeDescription: "Embalagem",
    navigationActive: "packaging",
    initialProductId,
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
const showConsumables = (initialProductId = null) =>
  mount(createCatalogScreen({
    title: "Material de Uso e Consumo",
    productTypeDescription: "Material de Uso e Consumo",
    navigationActive: "consumables",
    initialProductId,
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
const showNfceQuery = () =>
  mount(createNfceQueryScreen({ onBack: showBackoffice, onNfce: showNfce, ...common() }));
const showNavigationBuilder = () =>
  mount(createNavigationBuilderScreen({ onBack: showSettings, ...common() }));

const showProductEditor = (product) => {
  const productType = String(product?.productTypeDescription ?? "").trim().toLocaleUpperCase("pt-BR");
  if (productType === "PRODUTO ACABADO") return showFinishedProducts(product.idProduct);
  if (productType === "MATÉRIA-PRIMA") return showRawMaterials(product.idProduct);
  if (productType === "EMBALAGEM") return showPackaging(product.idProduct);
  if (productType === "MATERIAL DE USO E CONSUMO") return showConsumables(product.idProduct);
  return showCatalog(product?.idProduct);
};

window.__PDV_NAVIGATION_HANDLERS__ = common();

const createCloseBackupPrompt = () => {
  const backdrop = document.createElement("div");
  backdrop.className = "classic-modal-backdrop close-backup-backdrop";
  backdrop.setAttribute("data-close-backup-modal", "");
  document.body.append(backdrop);

  let state = "question";
  let result = null;
  let resolvePrompt;

  const close = (value) => {
    result = value;
    backdrop.remove();
    resolvePrompt?.(value);
  };

  const render = (details = {}) => {
    const isBusy = state === "loading";
    const isSuccess = state === "success";
    const isError = state === "error";
    const title = isBusy
      ? "Criando backup"
      : isSuccess
        ? "Backup concluído"
        : isError
          ? "Não foi possível criar o backup"
          : "Sair do sistema";
    const message = isBusy
      ? "Aguarde enquanto salvamos uma cópia dos dados no servidor da API."
      : isSuccess
        ? "O backup foi criado com sucesso. Você já pode sair do sistema."
        : isError
          ? "O sistema não conseguiu concluir o backup. Escolha como deseja continuar."
          : "Deseja criar um backup antes de sair do sistema?";
    const detail = isSuccess
      ? `<p class="close-backup-success">Arquivo criado: <strong>${details.fileName || "backup compactado"}</strong></p>`
      : isError
        ? `<p class="close-backup-error">${details.message || "Verifique a conexão com a API e tente novamente."}</p>`
        : "";

    backdrop.innerHTML = `
      <section class="classic-modal close-backup-modal" role="dialog" aria-modal="true" aria-labelledby="close-backup-title" aria-describedby="close-backup-message">
        <div class="classic-panel-header modal-panel-header">
          <span id="close-backup-title">${title}</span>
          ${!isBusy && !isSuccess ? '<button class="modal-close-button" data-close-backup-cancel type="button" aria-label="Cancelar saída" title="Cancelar">×</button>' : ""}
        </div>
        <div class="close-backup-body">
          <div class="close-backup-icon ${isSuccess ? "success" : isError ? "error" : ""}" aria-hidden="true">${isSuccess ? "✓" : isError ? "!" : "↓"}</div>
          <p id="close-backup-message" class="modal-help-text">${message}</p>
          ${detail}
        </div>
        <div class="classic-form-actions close-backup-actions">
          ${isBusy ? '<span class="close-backup-status" role="status" aria-live="polite">Processando...</span>' : ""}
          ${isSuccess
            ? '<button class="classic-button primary" data-close-backup-finish type="button">Sair do sistema</button>'
            : isError
              ? '<button class="classic-button primary" data-close-backup-retry type="button">Tentar novamente</button><button class="classic-button" data-close-backup-without type="button">Sair sem backup</button><button class="classic-button" data-close-backup-cancel type="button">Cancelar</button>'
              : !isBusy
                ? '<button class="classic-button primary" data-close-backup-create type="button">Criar backup e sair</button><button class="classic-button" data-close-backup-without type="button">Sair sem backup</button><button class="classic-button" data-close-backup-cancel type="button">Cancelar</button>'
                : ""}
        </div>
      </section>
    `;

    backdrop.querySelector("[data-close-backup-create]")?.focus();
    backdrop.querySelector("[data-close-backup-finish]")?.focus();
    backdrop.querySelector("[data-close-backup-retry]")?.focus();
  };

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop || event.target.closest("[data-close-backup-cancel]")) {
      close("cancel");
      return;
    }
    if (event.target.closest("[data-close-backup-without]")) {
      close("without");
      return;
    }
    if (event.target.closest("[data-close-backup-finish]")) {
      close("success");
      return;
    }
    if (event.target.closest("[data-close-backup-retry]")) {
      state = "question";
      render();
      return;
    }
    if (event.target.closest("[data-close-backup-create]")) {
      state = "loading";
      render();
      void apiFetch(`${getApiUrl()}/api/backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      })
        .then(async (response) => {
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || "Não foi possível criar o backup.");
          state = "success";
          render(payload.backup || {});
        })
        .catch((error) => {
          state = "error";
          render({
            message: error instanceof Error ? error.message : "Não foi possível criar o backup."
          });
        });
    }
  });

  backdrop.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state !== "loading" && state !== "success") {
      event.preventDefault();
      close("cancel");
    }
  });

  render();
  return new Promise((resolve) => {
    resolvePrompt = resolve;
  });
};

const installCloseBackupPrompt = () => {
  const appWindow = getAppWindow();
  if (!appWindow) return;
  let closing = false;
  let promptOpen = false;
  void appWindow.onCloseRequested(async (event) => {
    if (closing) return;
    if (promptOpen) {
      event.preventDefault();
      return;
    }
    if (app.querySelector(".auth-screen")) {
      closing = true;
      event.preventDefault();
      window.setTimeout(() => {
        void appWindow.destroy().catch(() => {
          void appWindow.close().catch((error) => {
            console.error("Não foi possível fechar o aplicativo pela tela de login:", error);
          });
        });
      }, 0);
      return;
    }
    event.preventDefault();
    promptOpen = true;
    try {
      const decision = await createCloseBackupPrompt();
      if (decision === "without" || decision === "success") {
        closing = true;
        window.setTimeout(() => {
          void appWindow.destroy().catch(() => {
            void appWindow.close().catch((error) => {
              console.error("Não foi possível concluir o fechamento do aplicativo:", error);
            });
          });
        }, 0);
      }
    } finally {
      promptOpen = false;
    }
  })
    .catch((error) => {
      console.error("Não foi possível registrar o fechamento seguro do aplicativo:", error);
    });
};



const loadNavigation = async () => {
  const apiUrl = getApiUrl();
  const response = await apiFetch(`${apiUrl}/api/navigation?includeInactive=1`);
  const payload = await response.json();
  if (!response.ok || !Array.isArray(payload.menus) || !Array.isArray(payload.items)) {
    throw new Error("A API retornou uma navegação inválida.");
  }
  window.__PDV_NAVIGATION__ = normalizePersistedNavigation(payload);
  window.__PDV_NAVIGATION_SOURCE__ = "api";
};

const checkApiHealth = async () => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  try {
    const response = await apiFetch(`${getApiUrl()}/api/health`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
};

const startApplication = async () => {
  installCloseBackupPrompt();
  startupReady = loadConfiguredApiUrl()
    .catch(() => {})
    .then(() => {
      const apiUrlField = app.querySelector("[data-api-config-form] input[name='apiUrl']");
      if (apiUrlField) apiUrlField.value = getApiUrl();
      return Promise.all([
        loadNavigation().catch(() => {
          window.__PDV_NAVIGATION__ = buildFallbackNavigation({ menus: [], items: [] });
          window.__PDV_NAVIGATION_SOURCE__ = "unavailable";
        }),
        loadProjectIcon(getApiUrl()).catch(() => {})
      ]);
    });
    showLogin();
    await startupReady;
};

void startApplication().catch(() => showSales({ initialApiError: true }));