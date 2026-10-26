import { renderLucideIcons } from "../ui/icons.js";

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const getApiUrl = () =>
  window.__PDV_API_URL__ || `http://${window.location.hostname}:3000`;

export function createClassScreen({ onBack, onClasses, onGroups, onProducts }) {
  const root = document.createElement("main");
  let classes = [];
  let loading = true;
  let error = "";
  let message = "";
  let submitting = false;
  let editingClass = null;
  let sortState = { key: "descriptionClass", direction: "asc" };
  let searchTerm = "";

  const getVisibleClasses = () =>
    [...classes]
      .filter((item) =>
        String(item.descriptionClass ?? "").toLocaleLowerCase("pt-BR").includes(
          searchTerm.trim().toLocaleLowerCase("pt-BR")
        )
      )
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
        <strong>PDV - Cadastro de classes</strong>
        <span>Operador: Operador</span>
      </header>
      <nav class="classic-menubar" aria-label="Menu principal">
        <button type="button">Arquivo</button>
        <details class="classic-menu-dropdown">
          <summary>Cadastros</summary>
          <div class="classic-menu-panel">
            <button type="button" data-menu-classes>Classes</button>
            <button type="button" data-menu-groups>Grupos</button>
            <button type="button" data-menu-products>Produtos</button>
          </div>
        </details>
        <button type="button">Estoque</button>
        <button type="button">Vendas</button>
        <button type="button">Relatórios</button>
        <button type="button">Configurações</button>
      </nav>
      <div class="classic-toolbar">
        <button class="classic-tool-button" data-back type="button">← Frente de caixa</button>
        <button class="classic-tool-button is-active" type="button">Classes</button>
        <button class="classic-tool-button" data-groups type="button">Grupos</button>
        <button class="classic-tool-button" data-products type="button">Produtos</button>
      </div>
      <section class="classic-content">
        <form class="classic-form-panel" data-class-form>
          <div class="classic-panel-header">Nova classe</div>
          <div class="classic-form-body">
            <label class="form-field">
              <span>Descrição da classe</span>
              <input name="descriptionClass" maxlength="120" required />
            </label>
            ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}
            ${message ? `<p class="success-message">${escapeHtml(message)}</p>` : ""}
          </div>
          <div class="classic-form-actions">
            <button class="classic-button primary" type="submit" ${submitting || loading ? "disabled" : ""}>
              ${submitting ? "Salvando..." : "Salvar classe"}
            </button>
            <button class="classic-button" data-clear type="button" ${submitting ? "disabled" : ""}>Limpar</button>
          </div>
        </form>
        <section class="classic-grid-panel">
          <div class="classic-panel-header classic-list-header">
            <span>Classes</span>
            <input class="classic-list-search" data-search type="search" placeholder="Pesquisar..." aria-label="Pesquisar classes" value="${escapeHtml(searchTerm)}" />
          </div>
          <div class="classic-grid-wrapper">
            ${loading
              ? '<p class="classic-empty">Carregando classes...</p>'
              : getVisibleClasses().length
                ? `<table class="classic-table">
                    <thead><tr>
                      <th aria-sort="${sortState.key === "descriptionClass" ? (sortState.direction === "asc" ? "ascending" : "descending") : "none"}">
                        <button class="table-sort-button" type="button" data-sort="descriptionClass">Descrição <span aria-hidden="true">${sortIndicator("descriptionClass")}</span></button>
                      </th>
                      <th>Status</th><th class="actions-column">Ações</th>
                    </tr></thead>
                    <tbody>${getVisibleClasses().map((item) => `
                      <tr class="${item.isActiveClass ? "" : "is-inactive"}">
                        <td>${escapeHtml(item.descriptionClass)}</td>
                        <td>
                          <button class="status-toggle ${item.isActiveClass ? "is-active" : "is-inactive"}" type="button" role="switch" aria-checked="${item.isActiveClass ? "true" : "false"}" data-status-id="${item.idClass}" aria-label="Alternar status da classe ${escapeHtml(item.descriptionClass)}">
                            <span class="status-toggle-track"><span class="status-toggle-thumb"></span></span>
                            <span class="status-toggle-label">${item.isActiveClass ? "Ativo" : "Inativo"}</span>
                          </button>
                        </td>
                        <td class="actions-column">
                          <button class="icon-button edit" type="button" title="Editar classe" aria-label="Editar classe" data-edit="${item.idClass}"><i data-lucide="pencil"></i></button>
                          <button class="icon-button delete" type="button" title="Excluir classe definitivamente" aria-label="Excluir classe definitivamente" data-delete="${item.idClass}"><i data-lucide="trash-2"></i></button>
                        </td>
                      </tr>`).join("")}</tbody>
                  </table>`
                : `<p class="classic-empty">${classes.length ? "Nenhuma classe encontrada." : "Nenhuma classe cadastrada."}</p>`}
          </div>
        </section>
      </section>
      ${editingClass ? `
        <div class="classic-modal-backdrop" data-modal-backdrop>
          <section class="classic-modal" role="dialog" aria-modal="true" aria-labelledby="edit-class-title">
            <div class="classic-panel-header" id="edit-class-title">Editar classe</div>
            <form data-edit-class-form>
              <div class="classic-form-body">
                <label class="form-field">
                  <span>Descrição da classe</span>
                  <input name="descriptionClass" maxlength="120" required value="${escapeHtml(editingClass.descriptionClass)}" />
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
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    root.querySelector("[data-groups]")?.addEventListener("click", onGroups);
    root.querySelector("[data-products]")?.addEventListener("click", onProducts);
    root.querySelector("[data-menu-classes]")?.addEventListener("click", onClasses);
    root.querySelector("[data-menu-groups]")?.addEventListener("click", onGroups);
    root.querySelector("[data-menu-products]")?.addEventListener("click", onProducts);
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
        const item = classes.find(({ idClass }) => String(idClass) === button.dataset.edit);
        if (!item) return;
        editingClass = item;
        render();
        root.querySelector("[data-edit-class-form] input")?.focus();
      });
    });
    root.querySelectorAll("[data-delete]").forEach((button) => {
      button.addEventListener("click", () => void deleteClass(Number(button.dataset.delete)));
    });
    root.querySelectorAll("[data-status-id]").forEach((toggle) => {
      toggle.addEventListener("click", () =>
        void updateClassStatus(Number(toggle.dataset.statusId), toggle.getAttribute("aria-checked") !== "true")
      );
    });
    root.querySelector("[data-clear]")?.addEventListener("click", () => {
      root.querySelector("[data-class-form]")?.reset();
      editingClass = null;
      error = "";
      message = "";
      render();
    });
    root.querySelector("[data-class-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitClass(Object.fromEntries(new FormData(event.currentTarget)), null);
    });
    root.querySelector("[data-edit-class-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitClass(Object.fromEntries(new FormData(event.currentTarget)), editingClass?.idClass);
    });
    root.querySelector("[data-cancel-edit]")?.addEventListener("click", () => {
      editingClass = null;
      error = "";
      render();
    });
    root.querySelector("[data-modal-backdrop]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) {
        editingClass = null;
        error = "";
        render();
      }
    });
  };

  const load = async () => {
    loading = true;
    render();
    try {
      const response = await fetch(`${getApiUrl()}/api/classes?includeInactive=1`);
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.classes)) {
        throw new Error(payload.error || "Não foi possível carregar as classes.");
      }
      classes = payload.classes;
      error = "";
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Falha ao carregar as classes.";
    } finally {
      loading = false;
      render();
    }
  };

  const submitClass = async (body, idClass) => {
    submitting = true;
    error = "";
    message = "";
    render();
    try {
      const response = await fetch(`${getApiUrl()}/api/classes`, {
        method: idClass ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(idClass ? { ...body, idClass } : body)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar a classe.");
      message = idClass ? "Classe alterada com sucesso." : "Classe cadastrada com sucesso.";
      editingClass = null;
      await load();
    } catch (submitError) {
      error = submitError instanceof Error ? submitError.message : "Falha ao salvar a classe.";
    } finally {
      submitting = false;
      render();
    }
  };

  const deleteClass = async (idClass) => {
    if (!window.confirm("Excluir esta classe e seus grupos definitivamente? Esta ação não poderá ser desfeita e será bloqueada se houver produtos cadastrados.")) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/classes`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idClass })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível excluir a classe.");
      message = "Classe excluída com sucesso.";
      await load();
    } catch (deleteError) {
      error = deleteError instanceof Error ? deleteError.message : "Falha ao excluir a classe.";
      render();
    }
  };

  const updateClassStatus = async (idClass, isActiveClass) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/classes/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idClass, isActiveClass })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível alterar o status da classe.");
      message = isActiveClass ? "Classe ativada com sucesso." : "Classe inativada com sucesso.";
      await load();
    } catch (statusError) {
      error = statusError instanceof Error ? statusError.message : "Falha ao alterar o status da classe.";
      render();
    }
  };

  render();
  void load();
  return root;
}
