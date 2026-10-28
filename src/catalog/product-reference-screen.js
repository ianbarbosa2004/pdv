import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { bindFormRowPreview } from "../ui/form-row-preview.js";
import { bindProductNavigation, renderProductNavigation } from "./product-navigation.js";

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const getApiUrl = () =>
  window.__PDV_API_URL__ || `http://${window.location.hostname}:3000`;

const definitions = {
  productTypes: {
    title: "Tipos de produto",
    singular: "tipo de produto",
    plural: "tipos de produto",
    endpoint: "/api/product-types",
    collection: "productTypes",
    id: "idProductType",
    description: "descriptionProductType",
    fields: [["descriptionProductType", "Descrição do tipo de produto"]]
  },
  units: {
    title: "Unidades tributáveis",
    singular: "unidade tributável",
    plural: "unidades tributáveis",
    endpoint: "/api/units",
    collection: "units",
    id: "idUnit",
    description: "descriptionUnit",
    fields: [
      ["codeUnit", "Código"],
      ["descriptionUnit", "Descrição da unidade"]
    ]
  }
};

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
  let searchTerm = "";

  const load = async () => {
    loading = true;
    render();
    try {
      const response = await fetch(`${getApiUrl()}${definition.endpoint}?includeInactive=1`);
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
      render();
    }
  };

  const submit = async (formData, id) => {
    submitting = true;
    error = "";
    message = "";
    render();
    try {
      const body = Object.fromEntries(formData);
      if (id) body[definition.id] = id;
      const response = await fetch(`${getApiUrl()}${definition.endpoint}`, {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Não foi possível salvar ${definition.singular}.`);
      message = id ? `${definition.singular[0].toUpperCase()}${definition.singular.slice(1)} alterada com sucesso.` : `${definition.singular[0].toUpperCase()}${definition.singular.slice(1)} cadastrada com sucesso.`;
      editingItem = null;
      await load();
    } catch (submitError) {
      error = submitError instanceof Error ? submitError.message : `Falha ao salvar ${definition.singular}.`;
    } finally {
      submitting = false;
      render();
    }
  };

  const updateStatus = async (id, isActive) => {
    try {
      const response = await fetch(`${getApiUrl()}${definition.endpoint}/status`, {
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

  const remove = async (id) => {
    if (!window.confirm(`Excluir esta ${definition.singular} definitivamente?`)) return;
    try {
      const response = await fetch(`${getApiUrl()}${definition.endpoint}`, {
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
        <form class="classic-form-panel" data-reference-form>
          <div class="classic-panel-header">Novo ${definition.singular}</div>
          <div class="classic-form-body">
            ${definition.fields.map(([field, label]) => `<label class="form-field"><span>${label}</span><input name="${field}" maxlength="${field === "codeUnit" ? 6 : 120}" required /></label>`).join("")}
            ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}
            ${message ? `<p class="success-message">${escapeHtml(message)}</p>` : ""}
          </div>
          <div class="classic-form-actions">
            <button class="classic-button primary" type="submit" ${submitting || loading ? "disabled" : ""}>${submitting ? "Salvando..." : "Salvar"}</button>
            <button class="classic-button" data-clear type="button" ${submitting ? "disabled" : ""}>Limpar</button>
          </div>
        </form>
        <section class="classic-grid-panel">
          <div class="classic-panel-header classic-list-header"><span>${definition.title}</span><input class="classic-list-search" data-search type="search" placeholder="Pesquisar..." aria-label="Pesquisar ${definition.plural}" value="${escapeHtml(searchTerm)}" /></div>
          <div class="classic-grid-wrapper">
            ${loading ? `<p class="classic-empty">Carregando ${definition.plural}...</p>` : visibleItems.length ? `
              <table class="classic-table">
                <thead><tr>${definition.fields.map(([, label]) => `<th>${label}</th>`).join("")}<th>Status</th><th class="actions-column">Ações</th></tr></thead>
                <tbody>${visibleItems.map((item) => `
                  <tr class="${item.isActiveProductType === 0 || item.isActiveUnit === 0 ? "is-inactive" : ""}" data-view-record="${escapeHtml(JSON.stringify(item))}">
                    ${definition.fields.map(([field]) => `<td>${escapeHtml(item[field])}</td>`).join("")}
                    <td><button class="status-toggle ${(item.isActiveProductType ?? item.isActiveUnit) ? "is-active" : "is-inactive"}" type="button" aria-checked="${(item.isActiveProductType ?? item.isActiveUnit) ? "true" : "false"}" data-status-id="${item[definition.id]}"><span class="status-toggle-track"><span class="status-toggle-thumb"></span></span><span class="status-toggle-label">${(item.isActiveProductType ?? item.isActiveUnit) ? "Ativo" : "Inativo"}</span></button></td>
                    <td class="actions-column"><button class="icon-button edit" type="button" data-edit="${item[definition.id]}" aria-label="Editar"><i data-lucide="pencil"></i></button><button class="icon-button delete" type="button" data-delete="${item[definition.id]}" aria-label="Excluir"><i data-lucide="trash-2"></i></button></td>
                  </tr>`).join("")}</tbody>
              </table>` : `<p class="classic-empty">${items.length ? `Nenhuma ${definition.singular} encontrada.` : `Nenhuma ${definition.singular} cadastrada.`}</p>`}
          </div>
        </section>
      </section>
      ${editingItem ? `<div class="classic-modal-backdrop" data-modal-backdrop><section class="classic-modal" role="dialog" aria-modal="true" aria-labelledby="edit-reference-title"><div class="classic-panel-header modal-panel-header"><span id="edit-reference-title">Editar ${definition.singular}</span><button class="modal-close-button" data-cancel type="button" aria-label="Fechar" title="Fechar"><i data-lucide="x"></i></button></div><form data-edit-form><div class="classic-form-body">${definition.fields.map(([field, label]) => `<label class="form-field"><span>${label}</span><input name="${field}" maxlength="${field === "codeUnit" ? 6 : 120}" required value="${escapeHtml(editingItem[field])}" /></label>`).join("")}${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}</div><div class="classic-form-actions"><button class="classic-button primary" type="submit" ${submitting ? "disabled" : ""}>Salvar alterações</button><button class="classic-button" data-cancel type="button">Cancelar</button></div></form></section></div>` : ""}
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
      void submit(new FormData(event.currentTarget), editingItem?.[definition.id]);
    });
    root.querySelector("[data-clear]")?.addEventListener("click", () => {
      error = "";
      message = "";
      root.querySelector("[data-reference-form]")?.reset();
      render();
    });
    root.querySelector("[data-cancel]")?.addEventListener("click", () => {
      editingItem = null;
      error = "";
      render();
    });
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
