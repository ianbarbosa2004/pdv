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

export function createGeneralSettingsScreen({
  onBack,
  onClasses,
  onGroups,
  onProducts,
  onFiscalOperations,
  onThermalPrint,
  onNcmCestUpdate,
  onSettings,
  onCompany,
  onNfce,
  onNavigationBuilder,
  onGeneralSettings,
  onFinancial,
  onPaymentMethods
}) {
  const root = document.createElement("main");
  let settings = [];
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
        <strong>PDV - Configurações Gerais</strong>
        <span>Operador: Operador</span>
      </header>
      ${renderMainMenu()}
      <div class="classic-toolbar">
        <button class="classic-tool-button" data-back type="button">← Configurações</button>
        <strong>Configurações Gerais</strong>
      </div>
      <section class="settings-content">
        <div class="backoffice-home-heading">
          <p class="eyebrow">Sistema</p>
          <h1>Configurações Gerais</h1>
          <p>Defina regras gerais de funcionamento compartilhadas por todos os terminais do PDV.</p>
        </div>
        <form class="classic-form-panel settings-form" data-form>
          <div class="classic-panel-header">Preferências operacionais</div>
          <div class="classic-form-body">
            ${loading
              ? '<p class="classic-empty">Carregando configurações...</p>'
              : `<table class="classic-table general-settings-table">
                  <thead><tr><th>Configuração</th><th>Valor</th></tr></thead>
                  <tbody>
                    ${settings.map((setting) => `
                      <tr>
                        <td><strong>${escapeHtml(setting.labelGeneralSetting)}</strong></td>
                        <td>
                          <label class="settings-toggle">
                            <input type="checkbox" name="${escapeHtml(setting.keyGeneralSetting)}" ${setting.booleanValueGeneralSetting ? "checked" : ""} />
                            <span>${setting.booleanValueGeneralSetting ? "Sim" : "Não"}</span>
                          </label>
                        </td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>`}
            ${error ? `<p class="error-message">${escapeHtml(error)}</p>` : ""}
            ${message ? `<p class="success-message">${escapeHtml(message)}</p>` : ""}
          </div>
          <div class="classic-form-actions">
            <button class="classic-button primary" type="submit" ${loading || saving ? "disabled" : ""}>${saving ? "Salvando..." : "Salvar configurações"}</button>
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
      const payload = await request("/api/general-settings");
      settings = payload.settings || [];
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : String(loadError);
    } finally {
      loading = false;
      render();
    }
  };

  const bind = () => {
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    root.querySelector("[data-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      saving = true;
      message = "";
      error = "";
      render();
      try {
        for (const setting of settings) {
          const input = form.elements[setting.keyGeneralSetting];
          await request("/api/general-settings", {
            method: "PUT",
            body: JSON.stringify({
              keyGeneralSetting: setting.keyGeneralSetting,
              booleanValueGeneralSetting: Boolean(input?.checked)
            })
          });
        }
        message = "Configurações salvas no banco de dados.";
        await load();
      } catch (saveError) {
        error = saveError instanceof Error ? saveError.message : String(saveError);
      } finally {
        saving = false;
        render();
      }
    });
    root.querySelectorAll(".settings-toggle input").forEach((input) => {
      input.addEventListener("change", () => {
        const label = input.closest(".settings-toggle");
        const text = label?.querySelector("span");
        if (text) text.textContent = input.checked ? "Sim" : "Não";
      });
    });
  };

  render();
  void load();
  return root;
}
