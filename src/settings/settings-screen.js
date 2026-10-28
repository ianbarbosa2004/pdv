import { invoke } from "@tauri-apps/api/core";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";

const getApiUrl = () =>
  window.__PDV_API_URL__ || `http://${window.location.hostname}:3000`;

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function createSettingsScreen({
  onBack,
  onClasses,
  onGroups,
  onProducts,
  onFiscalOperations,
  onThermalPrint,
  onNcmCestUpdate,
  onSettings,
  onGeneralSettings,
  onCompany,
  onNfce,
  onNavigationBuilder,
  onFinancial,
  onPaymentMethods
}) {
  const root = document.createElement("main");
  let printers = [];
  let receiptPrinterName = "";
  let reportsPrinterName = "";
  let loading = true;
  let saving = false;
  let message = "";
  let error = "";

  const request = async (path, options) => {
    const response = await fetch(`${getApiUrl()}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Não foi possível concluir a operação.");
    return payload;
  };

  const render = () => {
    root.className = "catalog-screen settings-screen";
    root.innerHTML = `
      <header class="classic-titlebar">
        <strong>PDV - Impressoras</strong>
        <span>Operador: Operador</span>
      </header>
      ${renderMainMenu()}
      <div class="classic-toolbar">
        <button class="classic-tool-button" data-back type="button">← Retaguarda</button>
        <strong>Configurações do sistema</strong>
      </div>
      <div class="classic-toolbar-secondary">
        <button class="classic-tool-button" data-navigation-builder type="button">Construtor de menu</button>
      </div>
      <section class="settings-content">
        <div class="backoffice-home-heading">
          <p class="eyebrow">Sistema</p>
          <h1>Impressoras</h1>
          <p>Defina as impressoras padrão usadas pelo PDV. As escolhas são compartilhadas por todos os terminais que usam esta base.</p>
        </div>
        <form class="classic-form-panel settings-form" data-form>
          <div class="classic-panel-header">Impressoras padrão</div>
          <div class="classic-form-body">
            <label class="form-field">
              <span>Impressora padrão de Cupom</span>
              <select name="receiptPrinterName" ${loading ? "disabled" : ""}>
                <option value="">${loading ? "Carregando impressoras..." : "Não definida"}</option>
                ${printers.map((name) => `<option value="${escapeHtml(name)}" ${receiptPrinterName === name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}
              </select>
              <small>Usada para cupons e comprovantes de venda.</small>
            </label>
            <label class="form-field">
              <span>Impressora padrão de Relatórios</span>
              <select name="reportsPrinterName" ${loading ? "disabled" : ""}>
                <option value="">${loading ? "Carregando impressoras..." : "Não definida"}</option>
                ${printers.map((name) => `<option value="${escapeHtml(name)}" ${reportsPrinterName === name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}
              </select>
              <small>Usada para relatórios administrativos.</small>
            </label>
            ${error ? `<p class="error-message">${escapeHtml(error)}</p>` : ""}
            ${message ? `<p class="success-message">${escapeHtml(message)}</p>` : ""}
          </div>
          <div class="classic-form-actions">
            <button class="classic-button primary" data-save type="submit" ${loading || saving ? "disabled" : ""}>${saving ? "Salvando..." : "Salvar configurações"}</button>
            <button class="classic-button" data-refresh type="button" ${loading || saving ? "disabled" : ""}>Atualizar impressoras</button>
          </div>
        </form>
      </section>
    `;
    bindMainMenu(root, {
      products: onProducts,
      "fiscal-operations": onFiscalOperations,
      "thermal-print": onThermalPrint,
      "ncm-cest-update": onNcmCestUpdate,
      settings: onSettings,
      "general-settings": onGeneralSettings,
      company: onCompany,
      nfce: onNfce,
      "navigation-builder": onNavigationBuilder,
      financial: onFinancial,
      "payment-methods": onPaymentMethods
    });
    bind();
  };

  const load = async () => {
    loading = true;
    error = "";
    render();
    try {
      const settingsPromise = request("/api/printer-settings");
      const printersPromise = window.__TAURI_INTERNALS__
        ? invoke("list_installed_printers")
        : Promise.resolve([]);
      const [settings, installedPrinters] = await Promise.all([settingsPromise, printersPromise]);
      receiptPrinterName = settings.receiptPrinterName || "";
      reportsPrinterName = settings.reportsPrinterName || "";
      printers = [...new Set(installedPrinters)];
      for (const name of [receiptPrinterName, reportsPrinterName]) {
        if (name && !printers.includes(name)) printers.unshift(name);
      }
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : String(loadError);
    } finally {
      loading = false;
      render();
    }
  };

  const bind = () => {
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    root.querySelector("[data-navigation-builder]")?.addEventListener("click", onNavigationBuilder);
    root.querySelectorAll("[data-classes]").forEach((button) => button.addEventListener("click", onClasses));
    root.querySelectorAll("[data-groups]").forEach((button) => button.addEventListener("click", onGroups));
    root.querySelectorAll("[data-products]").forEach((button) => button.addEventListener("click", onProducts));
    root.querySelectorAll("[data-fiscal-operations]").forEach((button) => button.addEventListener("click", onFiscalOperations));
    root.querySelectorAll("[data-thermal-print]").forEach((button) => button.addEventListener("click", onThermalPrint));
    root.querySelectorAll("[data-settings]").forEach((button) => button.addEventListener("click", onSettings));
    root.querySelector("[data-refresh]")?.addEventListener("click", () => void load());
    root.querySelector("[data-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      saving = true;
      message = "";
      error = "";
      render();
      try {
        const settings = await request("/api/printer-settings", {
          method: "PUT",
          body: JSON.stringify({
            receiptPrinterName: form.elements.receiptPrinterName.value,
            reportsPrinterName: form.elements.reportsPrinterName.value
          })
        });
        receiptPrinterName = settings.receiptPrinterName;
        reportsPrinterName = settings.reportsPrinterName;
        message = "Configurações salvas no banco de dados.";
      } catch (saveError) {
        error = saveError instanceof Error ? saveError.message : String(saveError);
      } finally {
        saving = false;
        render();
      }
    });
  };

  render();
  void load();
  return root;
}
