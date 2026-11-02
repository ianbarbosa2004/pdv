import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { bindFormRowPreview } from "../ui/form-row-preview.js";
import { clearRenderedFeedback, createFeedbackTimer, renderSuccessFeedback } from "../ui/feedback.js";
import { apiFetch, getApiUrl } from "../shared/api.js";
import { confirmAction } from "../ui/confirmation-modal.js";
import {
  bindNumberMasks,
  formatMaskedNumber,
  normalizeMaskedNumber
} from "../ui/number-mask.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const formatPhone = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  const area = digits.slice(0, 2);
  const number = digits.slice(2);
  const prefix = number.slice(0, digits.length > 10 ? 5 : 4);
  const suffix = number.slice(digits.length > 10 ? 5 : 4, digits.length > 10 ? 9 : 8);
  return `${area.length === 2 ? `(${area})` : `(${area}`}${number ? ` ${prefix}` : ""}${suffix ? `-${suffix}` : ""}`;
};

const formatDocument = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 14);
  if (digits.length > 11) {
    return digits
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
  }
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
};

const formatEmail = (value) =>
  String(value ?? "").replace(/\s/g, "").toLocaleLowerCase("pt-BR").slice(0, 180);

const fields = {
  customer: [
    ["nameCustomer", "Nome", "text", true],
    ["documentCustomer", "CPF/CNPJ", "text", false],
    ["phoneCustomer", "Telefone", "tel", false],
    ["emailCustomer", "E-mail", "email", false],
    ["addressCustomer", "Endereço", "text", false],
    ["creditLimitCustomer", "Limite de Vale", "number", false],
    ["notesCustomer", "Observações", "textarea", false]
  ],
  consumer: [
    ["nameConsumer", "Nome", "text", true],
    ["nicknameConsumer", "Apelido / Identificação", "text", false],
    ["phoneConsumer", "Telefone", "tel", false],
    ["notesConsumer", "Observações", "textarea", false]
  ]
};

export function createCustomerConsumerScreen({
  kind,
  onBack,
  onCustomers,
  onConsumers,
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
  const isCustomer = kind === "customer";
  const entity = isCustomer ? "customer" : "consumer";
  const title = isCustomer ? "Clientes" : "Consumidores";
  const singular = isCustomer ? "cliente" : "consumidor";
  const endpoint = isCustomer ? "customers" : "consumers";
  const formSelector = `[data-${entity}-form]`;
  const root = document.createElement("main");
  const getEntityId = (item) => isCustomer ? item.idCustomer : item.idConsumer;
  const clearFeedback = () => {
    message = "";
    clearRenderedFeedback(root);
  };
  let items = [];
  let loading = true;
  let submitting = false;
  let editing = null;
  let error = "";
  let message = "";
  let searchTerm = "";
  let newDraft = {};
  const scheduleMessageClear = createFeedbackTimer();

  const load = async ({ captureDraft = true } = {}) => {
    loading = true; render({ captureDraft });
    try {
      const response = await apiFetch(`${getApiUrl()}/api/${endpoint}?includeInactive=1`);
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload[endpoint])) throw new Error(payload.error || `Não foi possível carregar ${title.toLocaleLowerCase("pt-BR")}.`);
      items = payload[endpoint]; error = "";
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : `Falha ao carregar ${title.toLocaleLowerCase("pt-BR")}.`;
    } finally { loading = false; render({ captureDraft }); }
  };

  const renderFields = (item = {}) => fields[entity].map(([name, label, type, required]) => {
    const value = item[name] ?? "";
    if (type === "textarea") return `<label class="form-field supplier-notes-field"><span>${label}</span><textarea name="${name}" rows="3" maxlength="400">${escapeHtml(value)}</textarea></label>`;
    const formatted = name === "documentCustomer"
      ? formatDocument(value)
      : name === "phoneCustomer" || name === "phoneConsumer"
        ? formatPhone(value)
        : name === "emailCustomer"
          ? formatEmail(value)
          : name === "creditLimitCustomer"
            ? formatMaskedNumber(value)
            : value;
    const mask = name === "creditLimitCustomer"
      ? ' data-number-mask inputmode="decimal"'
      : "";
    return `<label class="form-field"><span>${label}</span><input name="${name}" type="${type}" maxlength="${name.includes("document") ? 18 : name.includes("email") ? 180 : name.includes("phone") ? 15 : 180}"${mask} value="${escapeHtml(formatted)}"${required ? " required" : ""} /></label>`;
  }).join("");

  const visibleItems = () => {
    const query = searchTerm.trim().toLocaleLowerCase("pt-BR");
    return items.filter((item) => [item.nameCustomer, item.nameConsumer, item.nicknameConsumer, item.documentCustomer, item.phoneCustomer, item.phoneConsumer]
      .some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(query)));
  };

  function render({ captureDraft = true } = {}) {
    const currentForm = root.querySelector(formSelector);
    if (captureDraft && currentForm && !currentForm.classList.contains("form-preview-mode")) {
      newDraft = { ...newDraft, ...Object.fromEntries(new FormData(currentForm)) };
    }
    const visible = visibleItems();
    root.className = "catalog-screen";
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - Cadastro de ${title.toLocaleLowerCase("pt-BR")}</strong><span>Operador: Operador</span></header>
      ${renderMainMenu()}
      <section class="classic-content">
        ${renderSuccessFeedback(message, escapeHtml)}
        <form class="classic-form-panel supplier-form" data-${entity}-form>
          <div class="classic-panel-header">Novo ${singular}</div>
          <div class="classic-form-body"><div class="classic-form-grid">${renderFields(newDraft)}</div>${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}</div>
          <div class="classic-form-actions"><button class="classic-button primary" type="submit" ${submitting || loading ? "disabled" : ""}>${submitting ? "Salvando..." : `Salvar ${singular}`}</button><button class="classic-button" data-clear type="button">Limpar</button></div>
        </form>
        <section class="classic-grid-panel">
          <div class="classic-panel-header classic-list-header"><span>${title}</span><input class="classic-list-search" data-search type="search" placeholder="Pesquisar..." aria-label="Pesquisar ${title.toLocaleLowerCase("pt-BR")}" value="${escapeHtml(searchTerm)}" /></div>
          <div class="classic-grid-wrapper">${loading ? `<p class="classic-empty">Carregando...</p>` : visible.length ? `<table class="classic-table"><thead><tr><th>Nome</th>${isCustomer ? "<th>CPF/CNPJ</th><th>Telefone</th>" : "<th>Apelido / Identificação</th><th>Telefone</th>"}<th>Status</th><th class="actions-column">Ações</th></tr></thead><tbody>${visible.map((item) => {
            const active = Boolean(isCustomer ? item.isActiveCustomer : item.isActiveConsumer);
            const linkedConsumer = !isCustomer && Boolean(item.idCustomer);
            return `<tr class="${active ? "" : "is-inactive"}" data-view-record="${escapeHtml(JSON.stringify(item))}"><td>${escapeHtml(isCustomer ? item.nameCustomer : item.nameConsumer)}</td>${isCustomer ? `<td>${escapeHtml(formatDocument(item.documentCustomer))}</td><td>${escapeHtml(formatPhone(item.phoneCustomer))}</td>` : `<td>${escapeHtml(item.nicknameConsumer || "")}</td><td>${escapeHtml(formatPhone(item.phoneConsumer))}</td>`}<td><button class="status-toggle ${active ? "is-active" : "is-inactive"}" type="button" role="switch" aria-checked="${active ? "true" : "false"}" data-status-id="${getEntityId(item)}" ${linkedConsumer ? "disabled title=\"Consumidor vinculado ao cliente; altere o status pelo cadastro do cliente.\"" : ""} aria-label="${linkedConsumer ? "Status controlado pelo cliente vinculado" : `Alternar status de ${escapeHtml(isCustomer ? item.nameCustomer : item.nameConsumer)}`}"><span class="status-toggle-track"><span class="status-toggle-thumb"></span></span><span class="status-toggle-label">${active ? "Ativo" : "Inativo"}</span></button></td><td class="actions-column"><button class="icon-button edit" type="button" data-edit="${getEntityId(item)}" aria-label="Editar ${singular}"><i data-lucide="pencil"></i></button><button class="icon-button delete" type="button" data-delete="${getEntityId(item)}" aria-label="Excluir ${singular}"><i data-lucide="trash-2"></i></button></td></tr>`;
          }).join("")}</tbody></table>` : `<p class="classic-empty">${items.length ? "Nenhum registro encontrado." : `Nenhum ${singular} cadastrado.`}</p>`}</div>
        </section>
      </section>
      ${editing ? `<div class="classic-modal-backdrop" data-modal-backdrop><section class="classic-modal" role="dialog" aria-modal="true"><div class="classic-panel-header modal-panel-header"><span>Editar ${singular}</span><button class="modal-close-button" data-cancel type="button" aria-label="Fechar"><i data-lucide="x"></i></button></div><form data-edit-form><div class="classic-form-body"><div class="classic-form-grid">${renderFields(editing)}</div>${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}</div><div class="classic-form-actions"><button class="classic-button primary" type="submit">Salvar alterações</button><button class="classic-button" data-cancel type="button">Cancelar</button></div></form></section></div>` : ""}
    `;
    renderLucideIcons(root);
    bindMainMenu(root, { products: onProducts, suppliers: onCustomers, customers: onCustomers, consumers: onConsumers, "fiscal-operations": onFiscalOperations, "thermal-print": onThermalPrint, "ncm-cest-update": onNcmCestUpdate, settings: onSettings, company: onCompany, nfce: onNfce, financial: onFinancial, "payment-methods": onPaymentMethods });
    bindFormRowPreview(root, {
      formSelector,
      formatValue: (value, fieldName) => {
        if (fieldName === "documentCustomer") return formatDocument(value);
        if (fieldName === "phoneCustomer" || fieldName === "phoneConsumer") return formatPhone(value);
        if (fieldName === "emailCustomer") return formatEmail(value);
        if (fieldName === "creditLimitCustomer") return formatMaskedNumber(value);
        return value;
      }
    });
    root.querySelectorAll(`${formSelector}, [data-edit-form]`).forEach((form) => {
      form.querySelector("[name='documentCustomer']")?.addEventListener("input", (event) => {
        event.currentTarget.value = formatDocument(event.currentTarget.value);
      });
      form.querySelectorAll("[name^='phone']").forEach((input) => input.addEventListener("input", () => { input.value = formatPhone(input.value); }));
      form.querySelector("[name='emailCustomer']")?.addEventListener("input", (event) => {
        event.currentTarget.value = formatEmail(event.currentTarget.value);
      });
    });
    bindNumberMasks(root);
    root.querySelector("[data-search]")?.addEventListener("input", (event) => { searchTerm = event.currentTarget.value; render(); root.querySelector("[data-search]")?.focus(); });
    root.querySelector(formSelector)?.addEventListener("submit", (event) => { event.preventDefault(); void submit(Object.fromEntries(new FormData(event.currentTarget)), null); });
    root.querySelector("[data-edit-form]")?.addEventListener("submit", (event) => { event.preventDefault(); void submit(Object.fromEntries(new FormData(event.currentTarget)), getEntityId(editing)); });
    root.querySelector("[data-clear]")?.addEventListener("click", () => { newDraft = {}; error = ""; message = ""; render({ captureDraft: false }); });
    root.querySelectorAll("[data-cancel]").forEach((button) => button.addEventListener("click", () => { editing = null; error = ""; render(); }));
    root.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => { editing = items.find((item) => String(getEntityId(item)) === button.dataset.edit) || null; render(); }));
    root.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => void remove(Number(button.dataset.delete))));
    root.querySelectorAll("[data-status-id]").forEach((button) => button.addEventListener("click", () =>
      void updateStatus(Number(button.dataset.statusId), button.getAttribute("aria-checked") !== "true")
    ));
  }

  const submit = async (body, id) => {
    if (isCustomer && body.creditLimitCustomer) {
      body.creditLimitCustomer = normalizeMaskedNumber(body.creditLimitCustomer);
    }
    submitting = true; error = ""; message = ""; render();
    try {
      const response = await apiFetch(`${getApiUrl()}/api/${endpoint}`, { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id ? { ...body, [isCustomer ? "idCustomer" : "idConsumer"]: id } : body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Não foi possível salvar ${singular}.`);
      message = id ? `${singular[0].toUpperCase()}${singular.slice(1)} alterado com sucesso.` : `${singular[0].toUpperCase()}${singular.slice(1)} cadastrado com sucesso.`;
      if (!id) newDraft = {};
      await load({ captureDraft: false }); editing = null; scheduleMessageClear(clearFeedback);
    } catch (submitError) { error = submitError instanceof Error ? submitError.message : "Falha ao salvar."; }
    finally { submitting = false; render(); }
  };

  const updateStatus = async (id, isActive) => {
    try {
      const statusField = isCustomer ? "isActiveCustomer" : "isActiveConsumer";
      const response = await apiFetch(`${getApiUrl()}/api/${endpoint}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [isCustomer ? "idCustomer" : "idConsumer"]: id, [statusField]: isActive })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Não foi possível alterar o status do ${singular}.`);
      items = items.map((item) => getEntityId(item) === id ? { ...item, [statusField]: isActive ? 1 : 0 } : item);
      render();
    } catch (statusError) {
      error = statusError instanceof Error ? statusError.message : `Falha ao alterar o status do ${singular}.`;
      render();
    }
  };

  const remove = async (id) => {
    const confirmed = await confirmAction({
      title: `Excluir ${singular}`,
      message: `Excluir este ${singular}?`,
      confirmLabel: `Excluir ${singular}`
    });
    if (!confirmed) return;
    try {
      const response = await apiFetch(`${getApiUrl()}/api/${endpoint}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [isCustomer ? "idCustomer" : "idConsumer"]: id }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Não foi possível excluir.");
      message = `${singular[0].toUpperCase()}${singular.slice(1)} excluído com sucesso.`; await load();
    } catch (removeError) { error = removeError instanceof Error ? removeError.message : "Falha ao excluir."; render(); }
  };

  render(); void load(); return root;
}
