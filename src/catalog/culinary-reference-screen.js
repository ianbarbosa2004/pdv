import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { renderPreservingFormDraft } from "../ui/form-draft.js";
import { clearRenderedFeedback, createFeedbackTimer, renderSuccessFeedback } from "../ui/feedback.js";
import { apiFetch, getApiUrl } from "../shared/api.js";
import { confirmAction } from "../ui/confirmation-modal.js";
import { formatBrazilianDecimal, parseBrazilianDecimal } from "../shared/decimal.js";
import { getContextualNavigationItems, renderContextualNavigationItems } from "../ui/contextual-navigation.js";
import { resolveNavigationHandler } from "../ui/navigation-routing.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
 .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const fallbackNavigation = [
  ["recipes", "Receitas e Composições"],
  ["units", "Unidades"],
  ["physical-states", "Estados Físicos"],
  ["culinary-conversions", "Conversões"]
];

const definitions = {
  physicalStates: {
    title: "Estados Físicos",
    singular: "estado físico",
    collection: "physicalStates",
    endpoint: "/api/physical-states",
    id: "idPhysicalState",
    fields: [
      ["codePhysicalState", "Código", "text", true],
      ["namePhysicalState", "Nome", "text", true],
      ["descriptionPhysicalState", "Descrição", "text", false]
    ],
    listFields: ["namePhysicalState", "descriptionPhysicalState"],
    statusField: "isActivePhysicalState"
  },
  conversions: {
    title: "Conversões",
    singular: "conversão",
    collection: "conversions",
    endpoint: "/api/culinary-unit-conversions",
    id: "idCulinaryUnitConversion",
    fields: [
      ["idFromCulinaryUnitConversion", "Unidade de origem", "reference", true],
      ["idToCulinaryUnitConversion", "Unidade base", "reference", true],
      ["idPhysicalStateCulinaryUnitConversion", "Estado físico", "reference", true],
      ["factorCulinaryUnitConversion", "Fator", "number", true],
      ["notesCulinaryUnitConversion", "Observações", "text", false]
    ],
    listFields: [
      "idFromCulinaryUnitConversion",
      "idToCulinaryUnitConversion",
      "idPhysicalStateCulinaryUnitConversion",
      "factorCulinaryUnitConversion",
      "notesCulinaryUnitConversion"
    ]
  }
};

const categoryLabels = new Map([
  ["weight", "Peso"],
  ["volume", "Volume"],
  ["unit", "Unidade"],
  ["general", "Geral"]
]);

export const preserveCulinarySearchSelection = (input, render, getNextInput) => {
  const selectionStart = input.selectionStart;
  const selectionEnd = input.selectionEnd;
  const selectionDirection = input.selectionDirection;
  render();
  const nextInput = getNextInput();
  nextInput?.focus();
  if (nextInput && selectionStart !== null && selectionEnd !== null) {
    nextInput.setSelectionRange(selectionStart, selectionEnd, selectionDirection || "none");
  }
};

export function createCulinaryReferenceScreen({ kind, onBack, ...menuHandlers }) {
  const definition = definitions[kind];
  if (!definition) throw new Error(`Cadastro de ficha técnica desconhecido: ${kind}`);
  const root = document.createElement("main");
  let items = [];
  let units = [];
  let physicalStates = [];
  let loading = true;
  let submitting = false;
  let error = "";
  let message = "";
  let editingItem = null;
  let searchTerm = "";
  const scheduleMessageClear = createFeedbackTimer();

  const load = async () => {
    loading = true;
    render();
    try {
      const requests = [apiFetch(`${getApiUrl()}${definition.endpoint}?includeInactive=1`)];
      if (kind === "conversions") {
        requests.push(apiFetch(`${getApiUrl()}/api/culinary-units?includeInactive=1`));
        requests.push(apiFetch(`${getApiUrl()}/api/physical-states?includeInactive=1`));
      }
      const responses = await Promise.all(requests);
      const payloads = await Promise.all(responses.map((response) => response.json()));
      const payload = payloads[0];
      if (!responses[0].ok || !Array.isArray(payload[definition.collection])) {
        throw new Error(payload.error || `Não foi possível carregar ${definition.title.toLocaleLowerCase("pt-BR")}.`);
      }
      items = payload[definition.collection];
      if (kind === "conversions") {
        if (!responses[1].ok || !Array.isArray(payloads[1].culinaryUnits)) {
          throw new Error(payloads[1].error || "Não foi possível carregar as unidades culinárias.");
        }
        if (!responses[2].ok || !Array.isArray(payloads[2].physicalStates)) {
          throw new Error(payloads[2].error || "Não foi possível carregar os estados físicos.");
        }
        units = payloads[1].culinaryUnits;
        physicalStates = payloads[2].physicalStates;
      }
      error = "";
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Falha ao carregar o cadastro.";
    } finally {
      loading = false;
      renderPreservingFormDraft(root, render);
    }
  };

  const fieldLabel = (field, item = {}) => {
    if (field === "idFromCulinaryUnitConversion" || field === "idToCulinaryUnitConversion") {
      return units.find((unit) => String(unit.idCulinaryUnit) === String(item[field]))?.nameCulinaryUnit || "—";
    }
    if (field === "idPhysicalStateCulinaryUnitConversion") {
      return physicalStates.find((state) => String(state.idPhysicalState) === String(item[field]))?.namePhysicalState || "—";
    }
    if (field === "baseUnitCulinaryUnit") {
      return { g: "Grama", ml: "Mililitro", un: "Unidade", common: "Comum" }[item[field]] || "—";
    }
    if (field === "categoryCulinaryUnit") {
      return categoryLabels.get(item[field]) || "—";
    }
    if (field === "factorCulinaryUnitConversion") {
      return formatBrazilianDecimal(item[field]);
    }
    return item[field] ?? "—";
  };

  const renderField = ([field, label, type, required, options], item = {}) => {
    const value = item[field] ?? "";
    if (type === "select") {
      return `<label class="form-field"><span>${label}</span><select name="${field}" ${required ? "required" : ""}><option value="">Selecione</option>${options.map(([key, text]) => `<option value="${key}" ${String(value) === key ? "selected" : ""}>${text}</option>`).join("")}</select></label>`;
    }
    if (type === "reference") {
      const source = field === "idPhysicalStateCulinaryUnitConversion" ? physicalStates : units;
      const valueKey = field === "idPhysicalStateCulinaryUnitConversion" ? "idPhysicalState" : "idCulinaryUnit";
      const labelKey = field === "idPhysicalStateCulinaryUnitConversion" ? "namePhysicalState" : "nameCulinaryUnit";
      return `<label class="form-field"><span>${label}</span><select name="${field}" required><option value="">Selecione</option>${source.map((entry) => `<option value="${entry[valueKey]}" ${String(value) === String(entry[valueKey]) ? "selected" : ""}>${escapeHtml(entry[labelKey])}</option>`).join("")}</select></label>`;
    }
    const inputType = type === "number" ? "text" : type;
    const inputValue = type === "number" ? formatBrazilianDecimal(value) : value;
    return `<label class="form-field"><span>${label}</span><input name="${field}" type="${inputType}" inputmode="${type === "number" ? "decimal" : "text"}" maxlength="${field.includes("description") || field.includes("notes") ? 150 : 120}" ${required ? "required" : ""} value="${escapeHtml(inputValue)}" /></label>`;
  };

  const submit = async (formData, id) => {
    submitting = true;
    error = "";
    message = "";
    render();
    try {
      const body = Object.fromEntries(formData);
      if (kind === "conversions") {
        body.factorCulinaryUnitConversion = parseBrazilianDecimal(body.factorCulinaryUnitConversion);
      }
      if (id !== null) body[definition.id] = id;
      const response = await apiFetch(`${getApiUrl()}${definition.endpoint}`, {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Não foi possível salvar ${definition.singular}.`);
      const article = kind === "physicalStates" ? "O" : "A";
      message = `${article} ${definition.singular} foi ${id ? "alterada" : "cadastrada"} com sucesso.`;
      editingItem = null;
      await load();
      if (id !== null && id !== undefined) root.__PDV_FORM_PREVIEW_PENDING__ = items.find((item) => String(item[definition.id]) === String(id));
      scheduleMessageClear(() => {
        message = "";
        clearRenderedFeedback(root);
      });
    } catch (submitError) {
      error = submitError instanceof Error ? submitError.message : "Falha ao salvar o cadastro.";
    } finally {
      submitting = false;
      render();
    }
  };

  const remove = async (id) => {
    if (!(await confirmAction({
      title: `Excluir ${definition.singular}`,
      message: `Excluir esta ${definition.singular} definitivamente?`,
      confirmLabel: `Excluir ${definition.singular}`
    }))) return;
    try {
      const response = await apiFetch(`${getApiUrl()}${definition.endpoint}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [definition.id]: id })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Não foi possível excluir ${definition.singular}.`);
      await load();
    } catch (removeError) {
      error = removeError instanceof Error ? removeError.message : "Falha ao excluir o cadastro.";
      render();
    }
  };

  const updateStatus = async (id, isActive) => {
    try {
      const response = await apiFetch(`${getApiUrl()}${definition.endpoint}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [definition.id]: id, isActive })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível alterar o status.");
      await load();
    } catch (statusError) {
      error = statusError instanceof Error ? statusError.message : "Falha ao alterar o status.";
      render();
    }
  };

  const render = () => {
    const visibleItems = items.filter((item) =>
      definition.fields.some(([field]) => fieldLabel(field, item).toLocaleLowerCase("pt-BR").includes(searchTerm.trim().toLocaleLowerCase("pt-BR")))
    );
    const active = kind === "physicalStates" ? "physical-states" : "culinary-conversions";
    const navigationItems = getContextualNavigationItems("technical-sheet", fallbackNavigation);
    root.className = "catalog-screen culinary-reference-screen";
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - Ficha Técnica</strong><span>Operador: Operador</span></header>
      ${renderMainMenu()}
      <div class="classic-toolbar screen-context-bar" aria-label="Navegação contextual">
        ${renderContextualNavigationItems(navigationItems, active, "culinary-nav")}
      </div>
      <section class="classic-content">
        ${renderSuccessFeedback(message, escapeHtml)}
        <form class="classic-form-panel" data-reference-form>
          <div class="classic-panel-header">Nova ${definition.singular}</div>
          <div class="classic-form-body">${definition.fields.map((field) => renderField(field)).join("")}${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}</div>
          <div class="classic-form-actions"><button class="classic-button primary" type="submit" ${submitting || loading ? "disabled" : ""}>${submitting ? "Salvando..." : "Salvar"}</button><button class="classic-button" data-clear type="button">Limpar</button></div>
        </form>
        <section class="classic-grid-panel">
          <div class="classic-panel-header classic-list-header"><span>${definition.title}</span><input class="classic-list-search" name="culinaryReferenceSearch" data-search type="search" placeholder="Pesquisar..." aria-label="Pesquisar ${definition.title}" value="${escapeHtml(searchTerm)}" /></div>
          <div class="classic-grid-wrapper">${loading ? `<p class="classic-empty">Carregando...</p>` : visibleItems.length ? `<table class="classic-table culinary-reference-table"><thead><tr>${definition.listFields.map((field) => `<th>${definition.fields.find(([currentField]) => currentField === field)?.[1] || field}</th>`).join("")}<th class="actions-column">Ações</th></tr></thead><tbody>${visibleItems.map((item) => `<tr class="${definition.statusField && Number(item[definition.statusField]) === 0 ? "is-inactive" : ""}">${definition.listFields.map((field) => `<td>${escapeHtml(fieldLabel(field, item))}</td>`).join("")}<td class="actions-column">${definition.statusField ? `<button class="status-toggle ${Number(item[definition.statusField]) ? "is-active" : "is-inactive"}" type="button" aria-checked="${Number(item[definition.statusField]) ? "true" : "false"}" data-status-id="${item[definition.id]}" title="${Number(item[definition.statusField]) ? "Inativar" : "Ativar"}"><span class="status-toggle-track"><span class="status-toggle-thumb"></span></span><span class="status-toggle-label">${Number(item[definition.statusField]) ? "Ativo" : "Inativo"}</span></button>` : ""}<button class="icon-button edit" type="button" data-edit="${item[definition.id]}" aria-label="Editar"><i data-lucide="pencil"></i></button><button class="icon-button delete" type="button" data-delete="${item[definition.id]}" aria-label="Excluir"><i data-lucide="trash-2"></i></button></td></tr>`).join("")}</tbody></table>` : `<p class="classic-empty">Nenhum ${definition.singular} cadastrado.</p>`}</div>
        </section>
      </section>
      ${editingItem ? `<div class="classic-modal-backdrop" data-modal-backdrop><section class="classic-modal" role="dialog" aria-modal="true"><div class="classic-panel-header modal-panel-header"><span>Editar ${definition.singular}</span><button class="modal-close-button" data-cancel type="button" aria-label="Fechar"><i data-lucide="x"></i></button></div><form data-edit-form><div class="classic-form-body">${definition.fields.map((field) => renderField(field, editingItem)).join("")}${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}</div><div class="classic-form-actions"><button class="classic-button primary" type="submit">Salvar alterações</button><button class="classic-button" data-cancel type="button">Cancelar</button></div></form></section></div>` : ""}
    `;
    renderLucideIcons(root);
    bindMainMenu(root, menuHandlers);
    root.querySelectorAll("[data-culinary-nav]").forEach((button) => button.addEventListener("click", () => {
      const handler = resolveNavigationHandler(menuHandlers, button.dataset.culinaryNav)
        || resolveNavigationHandler(window.__PDV_NAVIGATION_HANDLERS__, button.dataset.culinaryNav);
      handler?.();
    }));
    root.querySelector("[data-search]")?.addEventListener("input", (event) => {
      const input = event.currentTarget;
      searchTerm = input.value;
      preserveCulinarySearchSelection(input, render, () => root.querySelector("[data-search]"));
    });
    root.querySelector("[data-reference-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void submit(new FormData(event.currentTarget), null);
    });
    root.querySelector("[data-clear]")?.addEventListener("click", () => {
      error = "";
      root.querySelector("[data-reference-form]")?.reset();
      render();
    });
    root.querySelector("[data-edit-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void submit(new FormData(event.currentTarget), editingItem[definition.id]);
    });
    root.querySelectorAll("[data-cancel]").forEach((button) => button.addEventListener("click", () => {
      editingItem = null;
      error = "";
      render();
    }));
    root.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => {
      editingItem = items.find((item) => String(item[definition.id]) === button.dataset.edit) || null;
      render();
    }));
    root.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => void remove(Number(button.dataset.delete))));
    root.querySelectorAll("[data-status-id]").forEach((button) => button.addEventListener("click", () => void updateStatus(Number(button.dataset.statusId), button.getAttribute("aria-checked") !== "true")));
  };

  render();
  void load();
  return root;
}
