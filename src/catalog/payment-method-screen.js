import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { bindFormRowPreview } from "../ui/form-row-preview.js";
import {
  bindFinancialNavigation,
  renderFinancialNavigation
} from "./financial-navigation.js";
import {
  bindNumberMasks,
  formatMaskedNumber,
  normalizeMaskedNumber
} from "../ui/number-mask.js";
import { createFeedbackTimer, renderSuccessFeedback } from "../ui/feedback.js";
import { getApiUrl } from "../shared/api.js";

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatAdjustment = (value, type) =>
  type === "percent"
    ? `${formatMaskedNumber(value)}%`
    : `R$ ${formatMaskedNumber(value)}`;

const defaultForm = {
  namePaymentMethod: "",
  cashFlowAccountPaymentMethod: "Caixa",
  termDaysPaymentMethod: "0",
  discountValuePaymentMethod: "0",
  discountTypePaymentMethod: "percent",
  surchargeValuePaymentMethod: "0",
  surchargeTypePaymentMethod: "percent",
  isActivePaymentMethod: "1"
};

const formValue = (item, key) => item?.[key] ?? defaultForm[key];

export function createPaymentMethodScreen({
  onBack,
  onProducts,
  onFiscalOperations,
  onThermalPrint,
  onNcmCestUpdate,
  onSettings,
  onCompany,
  onNfce,
  onFinancial,
  onPaymentMethods
}) {
  const root = document.createElement("main");
  let paymentMethods = [];
  let loading = true;
  let submitting = false;
  let editing = null;
  let error = "";
  let message = "";
  let searchTerm = "";
  const scheduleMessageClear = createFeedbackTimer();

  const renderStatusToggle = (isActive, attributes = "") => `
    <button class="status-toggle ${isActive ? "is-active" : "is-inactive"}" type="button"
      role="switch" aria-checked="${isActive ? "true" : "false"}" ${attributes}>
      <span class="status-toggle-track"><span class="status-toggle-thumb"></span></span>
      <span class="status-toggle-label">${isActive ? "Ativa" : "Inativa"}</span>
    </button>
  `;

  const renderFormFields = (item = null) => `
    <label class="form-field">
      <span>Nome da forma de pagamento</span>
      <input name="namePaymentMethod" maxlength="80" required value="${escapeHtml(formValue(item, "namePaymentMethod"))}" />
    </label>
    <div class="classic-form-grid payment-method-row">
      <label class="form-field">
        <span>Conta do Fluxo de Caixa</span>
        <select name="cashFlowAccountPaymentMethod" required>
          <option value="Banco" ${formValue(item, "cashFlowAccountPaymentMethod") === "Banco" ? "selected" : ""}>Banco</option>
          <option value="Caixa" ${formValue(item, "cashFlowAccountPaymentMethod") === "Caixa" ? "selected" : ""}>Caixa</option>
        </select>
      </label>
      <label class="form-field">
        <span>Dias / Prazo</span>
        <input name="termDaysPaymentMethod" type="number" min="0" max="65535" step="1" required value="${escapeHtml(formValue(item, "termDaysPaymentMethod"))}" />
      </label>
    </div>
    <div class="classic-form-grid payment-method-row">
      <div class="form-field-group">
        <label class="form-field">
          <span>Taxa de Desconto</span>
          <input name="discountValuePaymentMethod" data-number-mask inputmode="decimal" required value="${escapeHtml(formatMaskedNumber(formValue(item, "discountValuePaymentMethod")))}" />
        </label>
        <label class="form-field">
          <span>Unidade</span>
          <select name="discountTypePaymentMethod" required>
            <option value="percent" ${formValue(item, "discountTypePaymentMethod") === "percent" ? "selected" : ""}>%</option>
            <option value="fixed" ${formValue(item, "discountTypePaymentMethod") === "fixed" ? "selected" : ""}>R$</option>
          </select>
        </label>
      </div>
      <div class="form-field-group">
        <label class="form-field">
          <span>Acréscimo</span>
          <input name="surchargeValuePaymentMethod" data-number-mask inputmode="decimal" required value="${escapeHtml(formatMaskedNumber(formValue(item, "surchargeValuePaymentMethod")))}" />
        </label>
        <label class="form-field">
          <span>Unidade</span>
          <select name="surchargeTypePaymentMethod" required>
            <option value="percent" ${formValue(item, "surchargeTypePaymentMethod") === "percent" ? "selected" : ""}>%</option>
            <option value="fixed" ${formValue(item, "surchargeTypePaymentMethod") === "fixed" ? "selected" : ""}>R$</option>
          </select>
        </label>
      </div>
    </div>
  `;

  const render = () => {
    const query = searchTerm.trim().toLocaleLowerCase("pt-BR");
    const visible = paymentMethods.filter((item) =>
      [
        item.namePaymentMethod,
        item.cashFlowAccountPaymentMethod,
        item.termDaysPaymentMethod
      ].join(" ").toLocaleLowerCase("pt-BR").includes(query)
    );

    root.className = "catalog-screen";
    root.innerHTML = `
      <header class="classic-titlebar">
        <strong>PDV - Formas de pagamento</strong>
        <span>Operador: Operador</span>
      </header>
      ${renderMainMenu()}
      ${renderFinancialNavigation("payment-methods")}
      <section class="classic-content payment-method-content">
        ${renderSuccessFeedback(message, escapeHtml)}
        <form class="classic-form-panel" data-form>
          <div class="classic-panel-header">Nova forma de pagamento</div>
          <div class="classic-form-body">
            ${renderFormFields()}
            <div class="form-field form-status-field">
              <span>Status</span>
              <input name="isActivePaymentMethod" type="hidden" value="1" />
              ${renderStatusToggle(true, "data-form-status-toggle")}
            </div>
            ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}
          </div>
          <div class="classic-form-actions">
            <button class="classic-button primary" type="submit" ${submitting ? "disabled" : ""}>${submitting ? "Salvando..." : "Salvar"}</button>
            <button class="classic-button" data-clear type="button" ${submitting ? "disabled" : ""}>Limpar</button>
          </div>
        </form>
        <section class="classic-grid-panel">
          <div class="classic-panel-header classic-list-header">
            <span>Formas de pagamento</span>
            <input class="classic-list-search" data-search dir="ltr" type="search" placeholder="Pesquisar..." aria-label="Pesquisar formas de pagamento" value="${escapeHtml(searchTerm)}" />
          </div>
          <div class="classic-grid-wrapper">
            ${loading
              ? '<p class="classic-empty">Carregando formas de pagamento...</p>'
              : visible.length
                ? `<table class="classic-table">
                    <thead><tr><th>Forma de pagamento</th><th>Conta do Fluxo de Caixa</th><th>Dias / Prazo</th><th>Taxa de Desconto</th><th>Acréscimo</th><th>Status</th><th class="actions-column">Ações</th></tr></thead>
                    <tbody>${visible.map((item) => `
                      <tr class="${item.isActivePaymentMethod ? "" : "is-inactive"}" data-view-record="${escapeHtml(JSON.stringify(item))}">
                        <td>${escapeHtml(item.namePaymentMethod)}</td>
                        <td>${escapeHtml(item.cashFlowAccountPaymentMethod)}</td>
                        <td>${escapeHtml(item.termDaysPaymentMethod)}</td>
                        <td>${formatAdjustment(item.discountValuePaymentMethod, item.discountTypePaymentMethod)}</td>
                        <td>${formatAdjustment(item.surchargeValuePaymentMethod, item.surchargeTypePaymentMethod)}</td>
                        <td>${renderStatusToggle(Boolean(item.isActivePaymentMethod), `data-status-id="${item.idPaymentMethod}" aria-label="Alternar status da forma de pagamento ${escapeHtml(item.namePaymentMethod)}"`)}</td>
                        <td class="actions-column">
                          <button class="icon-button edit" type="button" title="Editar forma de pagamento" aria-label="Editar forma de pagamento" data-edit="${item.idPaymentMethod}"><i data-lucide="pencil"></i></button>
                          <button class="icon-button delete" type="button" title="Excluir forma de pagamento definitivamente" aria-label="Excluir forma de pagamento definitivamente" data-delete="${item.idPaymentMethod}"><i data-lucide="trash-2"></i></button>
                        </td>
                      </tr>`).join("")}</tbody>
                  </table>`
                : `<p class="classic-empty">${paymentMethods.length ? "Nenhuma forma de pagamento encontrada." : "Nenhuma forma de pagamento cadastrada."}</p>`}
          </div>
        </section>
      </section>
      ${editing ? `
        <div class="classic-modal-backdrop" data-modal-backdrop>
          <section class="classic-modal payment-method-modal" role="dialog" aria-modal="true" aria-labelledby="edit-payment-method-title">
            <div class="classic-panel-header modal-panel-header"><span id="edit-payment-method-title">Editar forma de pagamento</span><button class="modal-close-button" data-cancel-edit type="button" aria-label="Fechar" title="Fechar"><i data-lucide="x"></i></button></div>
            <form data-edit-form>
              <div class="classic-form-body">
                ${renderFormFields(editing)}
                <div class="form-field form-status-field">
                  <span>Status</span>
                  <input name="isActivePaymentMethod" type="hidden" value="${Number(editing.isActivePaymentMethod) ? "1" : "0"}" />
                  ${renderStatusToggle(Boolean(Number(editing.isActivePaymentMethod)), "data-form-status-toggle")}
                </div>
                ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}
              </div>
              <div class="classic-form-actions">
                <button class="classic-button primary" type="submit" ${submitting ? "disabled" : ""}>${submitting ? "Salvando..." : "Salvar alterações"}</button>
                <button class="classic-button" data-cancel-edit type="button" ${submitting ? "disabled" : ""}>Cancelar</button>
              </div>
            </form>
          </section>
        </div>
      ` : ""}
    `;

    renderLucideIcons(root);
    bindNumberMasks(root);
    bindMainMenu(root, {
      products: onProducts,
      "fiscal-operations": onFiscalOperations,
      "thermal-print": onThermalPrint,
      "ncm-cest-update": onNcmCestUpdate,
      settings: onSettings,
      company: onCompany,
      nfce: onNfce,
      financial: onFinancial
    });
    bindFinancialNavigation(root, {
      back: onBack,
      company: onFinancial,
      "payment-methods": onPaymentMethods
    });
    bindFormRowPreview(root, { formSelector: "[data-form]" });
    bind();
  };

  const bind = () => {
    root.querySelector("[data-search]")?.addEventListener("input", (event) => {
      searchTerm = event.currentTarget.value;
      render();
      const input = root.querySelector("[data-search]");
      input?.focus();
      input?.setSelectionRange(searchTerm.length, searchTerm.length);
    });
    root.querySelector("[data-clear]")?.addEventListener("click", () => {
      error = "";
      message = "";
      render();
    });
    root.querySelectorAll("[data-form-status-toggle]").forEach((toggle) => {
      toggle.addEventListener("click", () => {
        const nextActive = toggle.getAttribute("aria-checked") !== "true";
        toggle.setAttribute("aria-checked", String(nextActive));
        toggle.classList.toggle("is-active", nextActive);
        toggle.classList.toggle("is-inactive", !nextActive);
        toggle.querySelector(".status-toggle-label").textContent = nextActive ? "Ativa" : "Inativa";
        const statusInput = toggle.closest(".form-status-field")?.querySelector("[name='isActivePaymentMethod']");
        if (statusInput) statusInput.value = nextActive ? "1" : "0";
      });
    });
    root.querySelector("[data-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void submit(Object.fromEntries(new FormData(event.currentTarget)), null);
    });
    root.querySelector("[data-edit-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void submit(Object.fromEntries(new FormData(event.currentTarget)), editing?.idPaymentMethod);
    });
    root.querySelectorAll("[data-cancel-edit]").forEach((button) => {
      button.addEventListener("click", () => {
        editing = null;
        error = "";
        render();
      });
    });
    root.querySelector("[data-modal-backdrop]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) {
        editing = null;
        error = "";
        render();
      }
    });
    root.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => {
      editing = paymentMethods.find((item) => String(item.idPaymentMethod) === button.dataset.edit) || null;
      error = "";
      render();
    }));
    root.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => void remove(Number(button.dataset.delete))));
    root.querySelectorAll("[data-status-id]").forEach((toggle) => {
      toggle.addEventListener("click", () =>
        void updateStatus(Number(toggle.dataset.statusId), toggle.getAttribute("aria-checked") !== "true")
      );
    });
  };

  const load = async () => {
    loading = true;
    render();
    try {
      const response = await fetch(`${getApiUrl()}/api/payment-methods?includeInactive=1`);
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.paymentMethods)) {
        throw new Error(payload.error || "Não foi possível carregar as formas de pagamento.");
      }
      paymentMethods = payload.paymentMethods;
      error = "";
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Falha ao carregar as formas de pagamento.";
    } finally {
      loading = false;
      render();
    }
  };

  const submit = async (form, idPaymentMethod) => {
    submitting = true;
    error = "";
    message = "";
    render();
    try {
      const payload = {
        ...form,
        idPaymentMethod,
        discountValuePaymentMethod: normalizeMaskedNumber(form.discountValuePaymentMethod),
        surchargeValuePaymentMethod: normalizeMaskedNumber(form.surchargeValuePaymentMethod),
        isActivePaymentMethod: form.isActivePaymentMethod ? 1 : 0
      };
      const response = await fetch(`${getApiUrl()}/api/payment-methods`, {
        method: idPaymentMethod ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar a forma de pagamento.");
      editing = null;
      message = idPaymentMethod ? "Forma de pagamento alterada com sucesso." : "Forma de pagamento cadastrada com sucesso.";
      await load();
      scheduleMessageClear(() => {
        message = "";
        render();
      });
    } catch (submitError) {
      error = submitError instanceof Error ? submitError.message : "Falha ao salvar a forma de pagamento.";
      render();
    } finally {
      submitting = false;
      render();
    }
  };

  const remove = async (idPaymentMethod) => {
    if (!window.confirm("Excluir esta forma de pagamento definitivamente?")) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/payment-methods`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idPaymentMethod })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível excluir a forma de pagamento.");
      message = "Forma de pagamento excluída com sucesso.";
      paymentMethods = paymentMethods.filter((item) => String(item.idPaymentMethod) !== String(idPaymentMethod));
      render();
      await load();
      scheduleMessageClear(() => {
        message = "";
        render();
      });
    } catch (removeError) {
      error = removeError instanceof Error ? removeError.message : "Falha ao excluir a forma de pagamento.";
      render();
    }
  };

  const updateStatus = async (idPaymentMethod, isActivePaymentMethod) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/payment-methods/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idPaymentMethod, isActivePaymentMethod })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível alterar o status da forma de pagamento.");
      message = isActivePaymentMethod ? "Forma de pagamento ativada com sucesso." : "Forma de pagamento inativada com sucesso.";
      await load();
      scheduleMessageClear(() => {
        message = "";
        render();
      });
    } catch (statusError) {
      error = statusError instanceof Error ? statusError.message : "Falha ao alterar o status da forma de pagamento.";
      render();
    }
  };

  render();
  void load();
  return root;
}
