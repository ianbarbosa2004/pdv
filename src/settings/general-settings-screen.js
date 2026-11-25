import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { renderScreenContextBar } from "../ui/screen-context.js";
import { renderNavigationIntro } from "../ui/navigation-intro.js";
import { apiFetch, clearConfiguredApiUrl,
  getApiUrl,
  getConfiguredApiUrl,
  saveConfiguredApiUrl
 } from "../shared/api.js";
import { clearRenderedFeedback, createFeedbackTimer, renderSuccessFeedback } from "../ui/feedback.js";
import { renderPreservingFormDraft } from "../ui/form-draft.js";

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
  let savingApiUrl = false;
  let message = "";
  let error = "";
  let apiUrlMessage = "";
  let apiUrlError = "";
  let apiUrl = getConfiguredApiUrl() || getApiUrl();
  const scheduleMessageClear = createFeedbackTimer();
  const diningSettingKeys = new Set([
    "diningTableCount",
    "diningTableInactivityMinutes",
    "diningTableFreeColor",
    "diningTableOccupiedColor",
    "diningTableInactiveColor",
    "diningTableClosingColor"
  ]);
  const getDiningSettingValue = (key, fallback) =>
    String(settings.find((setting) => setting.keyGeneralSetting === key)?.valueGeneralSetting || fallback);

  const request = async (path, options) => {
    const response = await apiFetch(`${getApiUrl()}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Não foi possível concluir a operação.");
    return payload;
  };

  const render = () => {
    const generalSettings = settings.filter((setting) => !diningSettingKeys.has(setting.keyGeneralSetting));
    root.className = "catalog-screen settings-screen general-settings-screen";
    root.innerHTML = `
      <header class="classic-titlebar">
        <strong>PDV - Configurações Gerais</strong>
        <span>Operador: Operador</span>
      </header>
      ${renderMainMenu()}
      ${renderScreenContextBar("Configurações Gerais")}
      <section class="settings-content general-settings-content">
        ${renderSuccessFeedback(message || apiUrlMessage, escapeHtml)}
        ${renderNavigationIntro("general-settings", "Configurações Gerais", "Defina regras gerais de funcionamento compartilhadas por todos os terminais do PDV.")}
        <form class="classic-form-panel settings-form" data-form>
          <div class="classic-panel-header">Preferências operacionais</div>
          <div class="classic-form-body">
            ${loading
              ? '<p class="classic-empty">Carregando configurações...</p>'
              : `<table class="classic-table general-settings-table">
                  <thead><tr><th>Configuração</th><th>Valor</th></tr></thead>
                  <tbody>
                    ${generalSettings.map((setting) => `
                      <tr>
                        <td><strong>${escapeHtml(setting.labelGeneralSetting)}</strong></td>
                        <td>
                          ${setting.typeGeneralSetting === "boolean"
                            ? `<label class="settings-toggle">
                                <input type="checkbox" name="${escapeHtml(setting.keyGeneralSetting)}" ${setting.booleanValueGeneralSetting ? "checked" : ""} />
                                <span>${setting.booleanValueGeneralSetting ? "Sim" : "Não"}</span>
                              </label>`
                            : `<input
                                class="classic-input"
                                type="${setting.typeGeneralSetting === "number"
                                  ? "number"
                                  : (setting.keyGeneralSetting.endsWith("Url")
                                    ? "url"
                                    : "text")}"
                                name="${escapeHtml(setting.keyGeneralSetting)}"
                                value="${escapeHtml(setting.valueGeneralSetting)}"
                                ${setting.typeGeneralSetting === "number"
                                  ? (setting.keyGeneralSetting === "diningTableCount"
                                    ? 'min="1" max="200" step="1"'
                                    : (setting.keyGeneralSetting === "diningTableInactivityMinutes"
                                      ? 'min="1" max="1440" step="1"'
                                      : 'step="any"'))
                                  : ""}
                              />`}
                        </td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>`}
            ${error ? `<p class="error-message">${escapeHtml(error)}</p>` : ""}
          </div>
          <div class="classic-form-actions">
            <button class="classic-button primary" type="submit" ${loading || saving ? "disabled" : ""}>${saving ? "Salvando..." : "Salvar configurações"}</button>
          </div>
        </form>
        <form class="classic-form-panel settings-form dining-settings-form" data-dining-form>
          <div class="classic-panel-header">Mesas</div>
          <div class="classic-form-body dining-settings-body">
            ${loading
              ? '<p class="classic-empty">Carregando configurações...</p>'
              : `<div class="dining-settings-grid">
                  <label class="form-field">
                    <span>Número de Mesas visíveis</span>
                    <input
                      class="classic-input"
                      name="diningTableCount"
                      type="number"
                      min="1"
                      max="200"
                      step="1"
                      value="${escapeHtml(getDiningSettingValue("diningTableCount", "20"))}"
                    />
                  </label>
                  <label class="form-field">
                    <span>Tempo de Inatividade (min)</span>
                    <input
                      class="classic-input"
                      name="diningTableInactivityMinutes"
                      type="number"
                      min="1"
                      max="1440"
                      step="1"
                      value="${escapeHtml(getDiningSettingValue("diningTableInactivityMinutes", "20"))}"
                    />
                  </label>
                  ${[
                    ["diningTableFreeColor", "Livre", "#b9c7d1"],
                    ["diningTableOccupiedColor", "Ocupada", "#20a7cf"],
                    ["diningTableInactiveColor", "Inativa", "#c84d45"],
                    ["diningTableClosingColor", "Em fechamento", "#727b86"]
                  ].map(([key, label, fallback]) => {
                    const value = getDiningSettingValue(key, fallback);
                    const hexValue = /^#[0-9a-f]{6}$/iu.test(value) ? value : fallback;
                    return `
                      <div class="dining-color-setting">
                        <span>${label}</span>
                        <div class="dining-color-controls">
                          <input
                            class="dining-color-picker"
                            type="color"
                            data-dining-color-picker="${key}"
                            value="${escapeHtml(hexValue)}"
                            aria-label="Selecionar cor de Mesa ${escapeHtml(label)}"
                          />
                          <input
                            class="classic-input"
                            name="${key}"
                            type="text"
                            value="${escapeHtml(value)}"
                            placeholder="#RRGGBB ou rgb(R, G, B)"
                            aria-label="Cor hexadecimal ou RGB de Mesa ${escapeHtml(label)}"
                          />
                        </div>
                      </div>`;
                  }).join("")}
                </div>`}
            ${error ? `<p class="error-message">${escapeHtml(error)}</p>` : ""}
          </div>
          <div class="classic-form-actions">
            <button class="classic-button primary" type="submit" ${loading || saving ? "disabled" : ""}>${saving ? "Salvando..." : "Salvar Mesas"}</button>
          </div>
        </form>
        <form class="classic-form-panel settings-form api-settings-form" data-api-form>
          <div class="classic-panel-header">Conexão com o servidor</div>
          <div class="classic-form-body">
            <label class="form-field">
              <span>Endereço da API</span>
              <input
                name="apiUrl"
                type="url"
                inputmode="url"
                autocomplete="off"
                placeholder="http://192.168.0.10:3000"
                value="${escapeHtml(apiUrl)}"
                ${savingApiUrl ? "disabled" : ""}
              />
              <small>Configuração local deste terminal. Use o IP ou nome do computador que executa a API e a porta publicada.</small>
            </label>
            ${apiUrlError ? `<p class="error-message">${escapeHtml(apiUrlError)}</p>` : ""}
          </div>
          <div class="classic-form-actions">
            <button class="classic-button primary" type="submit" ${savingApiUrl ? "disabled" : ""}>${savingApiUrl ? "Salvando..." : "Salvar endereço"}</button>
            <button class="classic-button" data-reset-api type="button" ${savingApiUrl ? "disabled" : ""}>Restaurar padrão</button>
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
      renderPreservingFormDraft(root, render);
    }
  };

  const bind = () => {
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    root.querySelector("[data-api-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      savingApiUrl = true;
      apiUrlMessage = "";
      apiUrlError = "";
      render();
      try {
        apiUrl = await saveConfiguredApiUrl(form.elements.apiUrl.value);
        apiUrlMessage = "Endereço da API salvo neste terminal.";
        scheduleMessageClear(() => {
          apiUrlMessage = "";
          clearRenderedFeedback(root);
        });
      } catch (saveError) {
        apiUrlError = saveError instanceof Error ? saveError.message : String(saveError);
      } finally {
        savingApiUrl = false;
        render();
      }
    });
    root.querySelector("[data-reset-api]")?.addEventListener("click", async () => {
      savingApiUrl = true;
      apiUrlMessage = "";
      apiUrlError = "";
      render();
      try {
        await clearConfiguredApiUrl();
        apiUrl = getApiUrl();
        apiUrlMessage = "Endereço padrão restaurado neste terminal.";
        scheduleMessageClear(() => {
          apiUrlMessage = "";
          clearRenderedFeedback(root);
        });
      } catch (resetError) {
        apiUrlError = resetError instanceof Error ? resetError.message : String(resetError);
      } finally {
        savingApiUrl = false;
        render();
      }
    });
    root.querySelector("[data-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      saving = true;
      message = "";
      error = "";
      render();
      try {
        for (const setting of settings.filter((item) => !diningSettingKeys.has(item.keyGeneralSetting))) {
          const input = form.elements[setting.keyGeneralSetting];
          await request("/api/general-settings", {
            method: "PUT",
            body: JSON.stringify({
              keyGeneralSetting: setting.keyGeneralSetting,
              ...(setting.typeGeneralSetting === "boolean"
                ? { booleanValueGeneralSetting: Boolean(input?.checked) }
                : { valueGeneralSetting: input?.value ?? "" })
            })
          });
        }
        message = "Configurações salvas no banco de dados.";
        scheduleMessageClear(() => {
          message = "";
          clearRenderedFeedback(root);
        });
        await load();
      } catch (saveError) {
        error = saveError instanceof Error ? saveError.message : String(saveError);
      } finally {
        saving = false;
        render();
      }
    });
    root.querySelector("[data-dining-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      saving = true;
      message = "";
      error = "";
      render();
      try {
        for (const setting of settings.filter((item) => diningSettingKeys.has(item.keyGeneralSetting))) {
          const input = form.elements[setting.keyGeneralSetting];
          await request("/api/general-settings", {
            method: "PUT",
            body: JSON.stringify({
              keyGeneralSetting: setting.keyGeneralSetting,
              ...(setting.typeGeneralSetting === "number"
                ? { valueGeneralSetting: input?.value ?? "" }
                : { valueGeneralSetting: input?.value ?? "" })
            })
          });
        }
        message = "Configurações das Mesas salvas no banco de dados.";
        scheduleMessageClear(() => {
          message = "";
          clearRenderedFeedback(root);
        });
        await load();
      } catch (saveError) {
        error = saveError instanceof Error ? saveError.message : String(saveError);
      } finally {
        saving = false;
        render();
      }
    });
    root.querySelectorAll("[data-dining-color-picker]").forEach((picker) => {
      const key = picker.dataset.diningColorPicker;
      const textInput = root.querySelector(`[name="${key}"]`);
      picker.addEventListener("change", () => {
        if (textInput) textInput.value = picker.value;
      });
      textInput?.addEventListener("input", () => {
        if (/^#[0-9a-f]{6}$/iu.test(textInput.value.trim())) {
          picker.value = textInput.value.trim();
        }
      });
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
