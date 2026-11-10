import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { bindFormRowPreview } from "../ui/form-row-preview.js";
import { renderPreservingFormDraft } from "../ui/form-draft.js";
import { bindProductNavigation, renderProductNavigation } from "./product-navigation.js";
import { clearRenderedFeedback, createFeedbackTimer, renderSuccessFeedback } from "../ui/feedback.js";
import { apiFetch, getApiUrl } from "../shared/api.js";
import { confirmAction } from "../ui/confirmation-modal.js";

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const definitions = {
  productTypes: {
    title: "Tipos de produto",
    singular: "tipo de produto",
    plural: "tipos de produto",
    endpoint: "/api/product-types",
    collection: "productTypes",
    id: "idProductType",
    description: "descriptionProductType",
    fields: [
      ["codeSpedProductType", "Código SPED", false],
      ["descriptionProductType", "Descrição do tipo de produto", true]
    ]
  },
  units: {
    title: "Unidades",
    singular: "unidade",
    plural: "unidades",
    endpoint: "/api/units",
    collection: "units",
    id: "idUnit",
    description: "descriptionUnit",
    fields: [
      ["codeUnit", "Código da unidade", true],
      ["descriptionUnit", "Descrição da unidade", true],
      ["baseUnitUnit", "Unidade base", true],
      ["categoryUnit", "Categoria", true],
      ["isActiveUnit", "Ativa", false, "boolean"],
      ["isTaxableUnit", "Tributável", false, "boolean"],
      ["isCulinaryUnit", "Culinária", false, "boolean"]
    ],
    booleanFields: [
      ["isActiveUnit", "Ativa"],
      ["isTaxableUnit", "Tributável"],
      ["isCulinaryUnit", "Culinária"]
    ]
  }
};

const unitBaseOptions = [
  ["g", "Massa (g)"],
  ["ml", "Volume (ml)"],
  ["un", "Contagem (un)"],
  ["common", "Comum"]
];

const unitCategoryOptions = [
  ["weight", "Peso"],
  ["volume", "Volume"],
  ["unit", "Unidade"],
  ["general", "Geral"]
];

export function createProductReferenceScreen({
  kind,
  onBack,
  onClasses,
  onGroups,
  onProducts,
  onProductTypes,
  onUnits,
  onNcmCest,
  onFiscalOperations,
  onThermalPrint,
  onNcmCestUpdate,
  onSettings,
  onCompany,
  onNfce,
  onFinancial,
  onPaymentMethods
}) {
  const definition = definitions[kind];
  if (!definition) throw new Error(`Cadastro auxiliar desconhecido: ${kind}`);

  const root = document.createElement("main");
  let items = [];
  let loading = true;
  let submitting = false;
  let error = "";
  let message = "";
  let editingItem = null;
  const scheduleMessageClear = createFeedbackTimer();
  let searchTerm = "";
  const isUnits = kind === "units";

  const renderUnitFields = (item = {}) => {
    if (!isUnits) {
      return definition.fields.map(([field, label, required]) =>
        `<label class="form-field"><span>${label}</span><input name="${field}" maxlength="${field === "codeSpedProductType" ? 30 : 120}" ${required ? "required" : ""} value="${escapeHtml(item[field] ?? "")}" /></label>`
      ).join("");
    }
    const unitValues = {
      ...item,
      isActiveUnit: item.isActiveUnit ?? true,
      isTaxableUnit: item.isTaxableUnit ?? true,
      isCulinaryUnit: item.isCulinaryUnit ?? false
    };
    return `
      <label class="form-field"><span>Código da unidade</span><input name="codeUnit" maxlength="20" required value="${escapeHtml(unitValues.codeUnit ?? "")}" /></label>
      <label class="form-field"><span>Descrição da unidade</span><input name="descriptionUnit" maxlength="80" required value="${escapeHtml(unitValues.descriptionUnit ?? "")}" /></label>
      <label class="form-field"><span>Unidade base</span><select name="baseUnitUnit" required>${unitBaseOptions.map(([value, label]) => `<option value="${value}" ${unitValues.baseUnitUnit === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <label class="form-field"><span>Categoria</span><select name="categoryUnit" required>${unitCategoryOptions.map(([value, label]) => `<option value="${value}" ${unitValues.categoryUnit === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <fieldset class="unit-flags-field"><legend>Aplicações da unidade</legend><div class="unit-flags-grid">${definition.booleanFields.map(([field, label]) => `
        <label class="unit-switch-field"><input type="checkbox" name="${field}" value="1" ${unitValues[field] ? "checked" : ""} /><span class="status-toggle-track" aria-hidden="true"><span class="status-toggle-thumb"></span></span><span>${label}</span></label>
      `).join("")}</div></fieldset>
    `;
  };

  const renderUnitFlagSwitch = (item, field, label) => {
    const active = Boolean(Number(item[field]));
    return `<button class="status-toggle unit-flag-toggle ${active ? "is-active" : "is-inactive"}" type="button" aria-checked="${active}" aria-label="${label}: ${active ? "Sim" : "Não"}" data-unit-flag="${field}" data-unit-flag-id="${item.idUnit}"><span class="status-toggle-track"><span class="status-toggle-thumb"></span></span><span class="status-toggle-label">${active ? "Sim" : "Não"}</span></button>`;
  };

  const load = async ({ showLoading = true } = {}) => {
    loading = true;
    if (showLoading) render();
    try {
      const response = await apiFetch(`${getApiUrl()}${definition.endpoint}?includeInactive=1`);
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload[definition.collection])) {
        throw new Error(payload.error || `Não foi possível carregar ${definition.plural}.`);
      }
      items = payload[definition.collection];
      error = "";
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : `Falha ao carregar ${definition.plural}.`;
    } finally {
      loading = false;
      renderPreservingFormDraft(root, render);
    }
  };

  const submit = async (formData, id) => {
    submitting = true;
    error = "";
    message = "";
    render();
    try {
      const body = Object.fromEntries(formData);
      if (isUnits) {
        body.isActiveUnit = formData.has("isActiveUnit");
        body.isTaxableUnit = formData.has("isTaxableUnit");
        body.isCulinaryUnit = formData.has("isCulinaryUnit");
      }
      if (definition.fields.some(([field]) => field === "codeSpedProductType") && !body.codeSpedProductType?.trim()) {
        body.codeSpedProductType = "";
      }
      if (id !== null && id !== undefined) body[definition.id] = id;
      const response = await apiFetch(`${getApiUrl()}${definition.endpoint}`, {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Não foi possível salvar ${definition.singular}.`);
      message = id ? `${definition.singular[0].toUpperCase()}${definition.singular.slice(1)} alterada com sucesso.` : `${definition.singular[0].toUpperCase()}${definition.singular.slice(1)} cadastrada com sucesso.`;
      editingItem = null;
      submitting = false;
      await load({ showLoading: false });
      scheduleMessageClear(() => {
        message = "";
        clearRenderedFeedback(root);
      });
    } catch (submitError) {
      error = submitError instanceof Error ? submitError.message : `Falha ao salvar ${definition.singular}.`;
    } finally {
      if (submitting) {
        submitting = false;
        render();
      }
    }
  };

  const updateStatus = async (id, isActive) => {
    try {
      const response = await apiFetch(`${getApiUrl()}${definition.endpoint}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [definition.id]: id, isActive, kind })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Não foi possível alterar o status.`);
      await load();
    } catch (statusError) {
      error = statusError instanceof Error ? statusError.message : "Falha ao alterar o status.";
      render();
    }
  };

  const updateUnitFlag = async (id, field, value) => {
    try {
      const response = await apiFetch(`${getApiUrl()}${definition.endpoint}/flags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idUnit: id, field, value })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível alterar a aplicação da unidade.");
      await load();
    } catch (flagError) {
      error = flagError instanceof Error ? flagError.message : "Falha ao alterar a aplicação da unidade.";
      render();
    }
  };

  const remove = async (id) => {
    const confirmed = await confirmAction({
      title: `Excluir ${definition.singular}`,
      message: `Excluir esta ${definition.singular} definitivamente?`,
      confirmLabel: `Excluir ${definition.singular}`
    });
    if (!confirmed) return;
    try {
      const response = await apiFetch(`${getApiUrl()}${definition.endpoint}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [definition.id]: id })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Não foi possível excluir ${definition.singular}.`);
      message = `${definition.singular[0].toUpperCase()}${definition.singular.slice(1)} excluída com sucesso.`;
      items = items.filter((item) => String(item[definition.id]) !== String(id));
      render();
      await load();
      scheduleMessageClear(() => {
        message = "";
        clearRenderedFeedback(root);
      });
    } catch (removeError) {
      error = removeError instanceof Error ? removeError.message : `Falha ao excluir ${definition.singular}.`;
      render();
    }
  };

  const getVisibleItems = () => items.filter((item) =>
    definition.fields.some(([field]) =>
      String(item[field] ?? "").toLocaleLowerCase("pt-BR").includes(searchTerm.trim().toLocaleLowerCase("pt-BR"))
    )
  );

  const render = () => {
    const visibleItems = getVisibleItems();
    root.className = "catalog-screen";
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - Cadastro de ${definition.title}</strong><span>Operador: Operador</span></header>
      ${renderMainMenu()}
      ${renderProductNavigation(kind === "productTypes" ? "product-types" : "units")}
      <section class="classic-content">
        ${renderSuccessFeedback(message, escapeHtml)}
        <form class="classic-form-panel" data-reference-form>
          <div class="classic-panel-header">${isUnits ? "Nova" : "Novo"} ${definition.singular}</div>
          <div class="classic-form-body">
            ${renderUnitFields()}
            ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}
          </div>
          <div class="classic-form-actions">
            <button class="classic-button primary" type="submit" ${submitting || loading ? "disabled" : ""}>${submitting ? "Salvando..." : "Salvar"}</button>
            <button class="classic-button" data-clear type="button" ${submitting ? "disabled" : ""}>Limpar</button>
          </div>
        </form>
        <section class="classic-grid-panel">
          <div class="classic-panel-header classic-list-header"><span>${definition.title}</span><input class="classic-list-search" name="productReferenceSearch" data-search type="search" placeholder="Pesquisar..." aria-label="Pesquisar ${definition.plural}" value="${escapeHtml(searchTerm)}" /></div>
          <div class="classic-grid-wrapper">
            ${loading ? `<p class="classic-empty">Carregando ${definition.plural}...</p>` : visibleItems.length ? `
              <table class="classic-table">
                <thead><tr>${isUnits ? "<th>Código</th><th>Descrição</th><th>Base</th><th>Categoria</th><th>Ativa</th><th>Tributável</th><th>Culinária</th>" : definition.fields.map(([, label]) => `<th>${label}</th>`).join("")}<th class="actions-column">Ações</th></tr></thead>
                <tbody>${visibleItems.map((item) => `
                  <tr class="${item.isActiveProductType === 0 || item.isActiveUnit === 0 ? "is-inactive" : ""}" data-view-record="${escapeHtml(JSON.stringify(item))}">
                    ${isUnits ? `<td>${escapeHtml(item.codeUnit)}</td><td>${escapeHtml(item.descriptionUnit)}</td><td>${escapeHtml(item.baseUnitUnit)}</td><td>${escapeHtml(item.categoryUnit)}</td>${definition.booleanFields.map(([field, label]) => `<td>${renderUnitFlagSwitch(item, field, label)}</td>`).join("")}` : `${definition.fields.map(([field]) => `<td>${escapeHtml(item[field])}</td>`).join("")}<td><button class="status-toggle ${(item.isActiveProductType ?? item.isActiveUnit) ? "is-active" : "is-inactive"}" type="button" aria-checked="${(item.isActiveProductType ?? item.isActiveUnit) ? "true" : "false"}" data-status-id="${item[definition.id]}"><span class="status-toggle-track"><span class="status-toggle-thumb"></span></span><span class="status-toggle-label">${(item.isActiveProductType ?? item.isActiveUnit) ? "Ativo" : "Inativo"}</span></button></td>`}
                    <td class="actions-column"><button class="icon-button edit" type="button" data-edit="${item[definition.id]}" aria-label="Editar"><i data-lucide="pencil"></i></button><button class="icon-button delete" type="button" data-delete="${item[definition.id]}" aria-label="Excluir"><i data-lucide="trash-2"></i></button></td>
                  </tr>`).join("")}</tbody>
              </table>` : `<p class="classic-empty">${items.length ? `Nenhuma ${definition.singular} encontrada.` : `Nenhuma ${definition.singular} cadastrada.`}</p>`}
          </div>
        </section>
      </section>
      ${editingItem ? `<div class="classic-modal-backdrop" data-modal-backdrop><section class="classic-modal" role="dialog" aria-modal="true" aria-labelledby="edit-reference-title"><div class="classic-panel-header modal-panel-header"><span id="edit-reference-title">Editar ${definition.singular}</span><button class="modal-close-button" data-cancel type="button" aria-label="Fechar" title="Fechar"><i data-lucide="x"></i></button></div><form data-edit-form><div class="classic-form-body">${renderUnitFields(editingItem)}${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}</div><div class="classic-form-actions"><button class="classic-button primary" type="submit" ${submitting ? "disabled" : ""}>Salvar alterações</button><button class="classic-button" data-cancel type="button">Cancelar</button></div></form></section></div>` : ""}
    `;
    renderLucideIcons(root);
    bindMainMenu(root, { products: onProducts, "product-types": onProductTypes, units: onUnits, "fiscal-operations": onFiscalOperations, "thermal-print": onThermalPrint, "ncm-cest-update": onNcmCestUpdate, settings: onSettings, company: onCompany, nfce: onNfce, financial: onFinancial, "payment-methods": onPaymentMethods });
    bindProductNavigation(root, { back: onBack, classes: onClasses, groups: onGroups, products: onProducts, "product-types": onProductTypes, units: onUnits, "ncm-cest": onNcmCest });
    bindFormRowPreview(root, { formSelector: "[data-reference-form]" });
    root.querySelector("[data-search]")?.addEventListener("input", (event) => {
      searchTerm = event.currentTarget.value;
      render();
      root.querySelector("[data-search]")?.focus();
    });
    root.querySelector("[data-reference-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void submit(new FormData(event.currentTarget), null);
    });
    root.querySelector("[data-edit-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const editingId = editingItem?.[definition.id];
      void submit(new FormData(event.currentTarget), editingId);
    });
    root.querySelector("[data-clear]")?.addEventListener("click", () => {
      error = "";
      message = "";
      root.querySelector("[data-reference-form]")?.reset();
      render();
    });
    root.querySelectorAll("[data-cancel]").forEach((button) => {
      button.addEventListener("click", () => {
        editingItem = null;
        error = "";
        render();
      });
    });
    root.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => {
      editingItem = items.find((item) => String(item[definition.id]) === button.dataset.edit) || null;
      render();
    }));
    root.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => void remove(Number(button.dataset.delete))));
    root.querySelectorAll("[data-status-id]").forEach((button) => button.addEventListener("click", () => void updateStatus(Number(button.dataset.statusId), button.getAttribute("aria-checked") !== "true")));
    root.querySelectorAll("[data-unit-flag]").forEach((button) => button.addEventListener("click", () => void updateUnitFlag(Number(button.dataset.unitFlagId), button.dataset.unitFlag, button.getAttribute("aria-checked") !== "true")));
  };

  render();
  void load();
  return root;
}
