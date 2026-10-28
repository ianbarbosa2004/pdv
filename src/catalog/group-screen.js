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

export function createGroupScreen({ onBack, onClasses, onGroups, onProducts, onProductTypes, onUnits, onNcmCest, onFiscalOperations, onThermalPrint, onNcmCestUpdate, onSettings, onCompany, onNfce, onFinancial, onPaymentMethods }) {
  const root = document.createElement("main");
  let classes = [];
  let groups = [];
  let loading = true;
  let error = "";
  let message = "";
  let submitting = false;
  let editingGroup = null;
  let sortState = { key: "descriptionGroup", direction: "asc" };
  let searchTerm = "";

  const getVisibleGroups = () =>
    [...groups]
      .filter((item) => {
        const query = searchTerm.trim().toLocaleLowerCase("pt-BR");
        return [item.descriptionGroup, item.descriptionClass]
          .some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(query));
      })
      .sort((left, right) => {
      const comparison = String(left[sortState.key] ?? "").localeCompare(
        String(right[sortState.key] ?? ""),
        "pt-BR",
        { sensitivity: "base" }
      );
      return sortState.direction === "asc" ? comparison : -comparison;
      });

  const sortIndicator = (key) =>
    sortState.key === key ? (sortState.direction === "asc" ? "↑" : "↓") : "↕";

  const render = () => {
    root.className = "catalog-screen";
    root.innerHTML = `
      <header class="classic-titlebar">
        <strong>PDV - Cadastro de grupos</strong>
        <span>Operador: Operador</span>
      </header>
      ${renderMainMenu()}
      ${renderProductNavigation("groups")}
      <section class="classic-content">
        <form class="classic-form-panel" data-group-form>
          <div class="classic-panel-header">Novo grupo</div>
          <div class="classic-form-body">
            <label class="form-field">
              <span>Descrição do grupo</span>
              <input name="descriptionGroup" maxlength="120" required />
            </label>
            <label class="form-field">
              <span>Classe</span>
              <select name="idClass" required>
                <option value="">Selecione</option>
                ${classes.map((item) => `<option value="${item.idClass}">${escapeHtml(item.descriptionClass)}</option>`).join("")}
              </select>
            </label>
            <label class="form-field checkbox-field">
              <span>Exibir no PDV</span>
              <input name="showsInPdvGroup" type="checkbox" />
            </label>
            ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}
            ${message ? `<p class="success-message">${escapeHtml(message)}</p>` : ""}
          </div>
          <div class="classic-form-actions">
            <button class="classic-button primary" type="submit" ${submitting || loading ? "disabled" : ""}>
              ${submitting ? "Salvando..." : "Salvar grupo"}
            </button>
            <button class="classic-button" data-clear type="button" ${submitting ? "disabled" : ""}>Limpar</button>
          </div>
        </form>
        <section class="classic-grid-panel">
          <div class="classic-panel-header classic-list-header">
            <span>Grupos</span>
            <input class="classic-list-search" data-search type="search" placeholder="Pesquisar..." aria-label="Pesquisar grupos" value="${escapeHtml(searchTerm)}" />
          </div>
          <div class="classic-grid-wrapper">
            ${loading
              ? '<p class="classic-empty">Carregando grupos...</p>'
              : getVisibleGroups().length
                ? `<table class="classic-table">
                    <thead><tr>
                      <th aria-sort="${sortState.key === "descriptionGroup" ? (sortState.direction === "asc" ? "ascending" : "descending") : "none"}">
                        <button class="table-sort-button" type="button" data-sort="descriptionGroup">Descrição <span aria-hidden="true">${sortIndicator("descriptionGroup")}</span></button>
                      </th>
                      <th aria-sort="${sortState.key === "descriptionClass" ? (sortState.direction === "asc" ? "ascending" : "descending") : "none"}">
                        <button class="table-sort-button" type="button" data-sort="descriptionClass">Classe <span aria-hidden="true">${sortIndicator("descriptionClass")}</span></button>
                      </th>
                      <th>Exibir no PDV</th>
                      <th>Status</th><th class="actions-column">Ações</th>
                    </tr></thead>
                    <tbody>${getVisibleGroups().map((item) => `
                      <tr class="${item.isActiveGroup ? "" : "is-inactive"}" data-view-record="${escapeHtml(JSON.stringify(item))}">
                        <td>${escapeHtml(item.descriptionGroup)}</td>
                        <td>${escapeHtml(item.descriptionClass)}</td>
                        <td>
                          <button class="status-toggle ${Number(item.showsInPdvGroup) ? "is-active" : "is-inactive"}" type="button" role="switch" aria-checked="${Number(item.showsInPdvGroup) ? "true" : "false"}" data-pdv-status-id="${item.idGroup}" aria-label="Alternar exibição do grupo ${escapeHtml(item.descriptionGroup)} no PDV">
                            <span class="status-toggle-track"><span class="status-toggle-thumb"></span></span>
                            <span class="status-toggle-label">${Number(item.showsInPdvGroup) ? "Sim" : "Não"}</span>
                          </button>
                        </td>
                        <td>
                          <button class="status-toggle ${item.isActiveGroup ? "is-active" : "is-inactive"}" type="button" role="switch" aria-checked="${item.isActiveGroup ? "true" : "false"}" data-status-id="${item.idGroup}" aria-label="Alternar status do grupo ${escapeHtml(item.descriptionGroup)}">
                            <span class="status-toggle-track"><span class="status-toggle-thumb"></span></span>
                            <span class="status-toggle-label">${item.isActiveGroup ? "Ativo" : "Inativo"}</span>
                          </button>
                        </td>
                        <td class="actions-column">
                          <button class="icon-button edit" type="button" title="Editar grupo" aria-label="Editar grupo" data-edit="${item.idGroup}"><i data-lucide="pencil"></i></button>
                          <button class="icon-button delete" type="button" title="Excluir grupo definitivamente" aria-label="Excluir grupo definitivamente" data-delete="${item.idGroup}"><i data-lucide="trash-2"></i></button>
                        </td>
                      </tr>`).join("")}</tbody>
                  </table>`
                : `<p class="classic-empty">${groups.length ? "Nenhum grupo encontrado." : "Nenhum grupo cadastrado."}</p>`}
          </div>
        </section>
      </section>
      ${editingGroup ? `
        <div class="classic-modal-backdrop" data-modal-backdrop>
          <section class="classic-modal" role="dialog" aria-modal="true" aria-labelledby="edit-group-title">
            <div class="classic-panel-header modal-panel-header"><span id="edit-group-title">Editar grupo</span><button class="modal-close-button" data-cancel-edit type="button" aria-label="Fechar" title="Fechar"><i data-lucide="x"></i></button></div>
            <form data-edit-group-form>
              <div class="classic-form-body">
                <label class="form-field">
                  <span>Descrição do grupo</span>
                  <input name="descriptionGroup" maxlength="120" required value="${escapeHtml(editingGroup.descriptionGroup)}" />
                </label>
                <label class="form-field">
                  <span>Classe</span>
                  <select name="idClass" required>
                    ${classes.map((item) => `<option value="${item.idClass}" ${item.idClass === editingGroup.idClass ? "selected" : ""}>${escapeHtml(item.descriptionClass)}</option>`).join("")}
                  </select>
                </label>
                <label class="form-field checkbox-field">
                  <span>Exibir no PDV</span>
                  <input name="showsInPdvGroup" type="checkbox" ${Number(editingGroup.showsInPdvGroup) ? "checked" : ""} />
                </label>
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
    bindMainMenu(root, {
      products: onProducts,
      "product-types": onProductTypes,
      units: onUnits,
      "fiscal-operations": onFiscalOperations,
      "thermal-print": onThermalPrint,
      "ncm-cest-update": onNcmCestUpdate,
      settings: onSettings,
      company: onCompany,
      nfce: onNfce,
      financial: onFinancial,
      "payment-methods": onPaymentMethods
    });
    bindProductNavigation(root, { back: onBack, classes: onClasses, groups: onGroups, products: onProducts, "product-types": onProductTypes, units: onUnits, "ncm-cest": onNcmCest });
    bindFormRowPreview(root, { formSelector: "[data-group-form]" });
    root.querySelector("[data-search]")?.addEventListener("input", (event) => {
      searchTerm = event.currentTarget.value;
      render();
      const searchInput = root.querySelector("[data-search]");
      searchInput?.focus();
      searchInput?.setSelectionRange(searchTerm.length, searchTerm.length);
    });
    root.querySelectorAll("[data-sort]").forEach((button) => {
      button.addEventListener("click", () => {
        if (sortState.key === button.dataset.sort) {
          sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
        } else {
          sortState = { key: button.dataset.sort, direction: "asc" };
        }
        render();
      });
    });
    root.querySelectorAll("[data-edit]").forEach((button) => {
      button.addEventListener("click", () => {
        const item = groups.find(({ idGroup }) => String(idGroup) === button.dataset.edit);
        if (!item) return;
        editingGroup = item;
        render();
        root.querySelector("[data-edit-group-form] input")?.focus();
      });
    });
    root.querySelectorAll("[data-delete]").forEach((button) => {
      button.addEventListener("click", () => void deleteGroup(Number(button.dataset.delete)));
    });
    root.querySelectorAll("[data-status-id]").forEach((toggle) => {
      toggle.addEventListener("click", () =>
        void updateGroupStatus(Number(toggle.dataset.statusId), toggle.getAttribute("aria-checked") !== "true")
      );
    });
    root.querySelectorAll("[data-pdv-status-id]").forEach((toggle) => {
      toggle.addEventListener("click", () =>
        void updateGroupPdvVisibility(Number(toggle.dataset.pdvStatusId), toggle.getAttribute("aria-checked") !== "true")
      );
    });
    root.querySelector("[data-clear]")?.addEventListener("click", () => {
      root.querySelector("[data-group-form]")?.reset();
      editingGroup = null;
      error = "";
      message = "";
      render();
    });
    root.querySelector("[data-group-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = Object.fromEntries(new FormData(event.currentTarget));
      void submitGroup({
        ...form,
        idClass: Number(form.idClass),
        showsInPdvGroup: form.showsInPdvGroup === "on"
      });
    });
    root.querySelector("[data-edit-group-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = Object.fromEntries(new FormData(event.currentTarget));
      void submitGroup({
        ...form,
        idClass: Number(form.idClass),
        showsInPdvGroup: form.showsInPdvGroup === "on"
      }, editingGroup?.idGroup);
    });
    root.querySelector("[data-cancel-edit]")?.addEventListener("click", () => {
      editingGroup = null;
      error = "";
      render();
    });
    root.querySelector("[data-modal-backdrop]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) {
        editingGroup = null;
        error = "";
        render();
      }
    });
  };

  const load = async () => {
    loading = true;
    render();
    try {
      const [classResponse, groupResponse] = await Promise.all([
        fetch(`${getApiUrl()}/api/classes?includeInactive=1`),
        fetch(`${getApiUrl()}/api/groups?includeInactive=1`)
      ]);
      const classPayload = await classResponse.json();
      const groupPayload = await groupResponse.json();
      if (!classResponse.ok || !Array.isArray(classPayload.classes)) {
        throw new Error(classPayload.error || "Não foi possível carregar as classes.");
      }
      if (!groupResponse.ok || !Array.isArray(groupPayload.groups)) {
        throw new Error(groupPayload.error || "Não foi possível carregar os grupos.");
      }
      classes = classPayload.classes;
      groups = groupPayload.groups;
      error = "";
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Falha ao carregar os grupos.";
    } finally {
      loading = false;
      render();
    }
  };

  const submitGroup = async (body, idGroup) => {
    submitting = true;
    error = "";
    message = "";
    render();
    try {
      const response = await fetch(`${getApiUrl()}/api/groups`, {
        method: idGroup ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(idGroup ? { ...body, idGroup } : body)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar o grupo.");
      message = idGroup ? "Grupo alterado com sucesso." : "Grupo cadastrado com sucesso.";
      editingGroup = null;
      await load();
    } catch (submitError) {
      error = submitError instanceof Error ? submitError.message : "Falha ao salvar o grupo.";
    } finally {
      submitting = false;
      render();
    }
  };

  const deleteGroup = async (idGroup) => {
    if (!window.confirm("Excluir este grupo definitivamente? Esta ação não poderá ser desfeita e será bloqueada se houver produtos cadastrados.")) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/groups`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idGroup })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível excluir o grupo.");
      message = "Grupo excluído com sucesso.";
      groups = groups.filter((item) => String(item.idGroup) !== String(idGroup));
      render();
      await load();
    } catch (deleteError) {
      error = deleteError instanceof Error ? deleteError.message : "Falha ao excluir o grupo.";
      render();
    }
  };

  const updateGroupStatus = async (idGroup, isActiveGroup) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/groups/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idGroup, isActiveGroup })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível alterar o status do grupo.");
      message = isActiveGroup ? "Grupo ativado com sucesso." : "Grupo inativado com sucesso.";
      await load();
    } catch (statusError) {
      error = statusError instanceof Error ? statusError.message : "Falha ao alterar o status do grupo.";
      render();
    }
  };

  const updateGroupPdvVisibility = async (idGroup, showsInPdvGroup) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/groups/pdv-status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idGroup, showsInPdvGroup })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível alterar a exibição do grupo no PDV.");
      message = showsInPdvGroup ? "Grupo exibido no PDV." : "Grupo ocultado do PDV.";
      await load();
    } catch (visibilityError) {
      error = visibilityError instanceof Error ? visibilityError.message : "Falha ao alterar a exibição do grupo no PDV.";
      render();
    }
  };

  render();
  void load();
  return root;
}
