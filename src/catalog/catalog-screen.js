const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const getApiUrl = () =>
  window.__PDV_API_URL__ || `http://${window.location.hostname}:3000`;

const editIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m11.7 1.3 3 3-8.8 8.8-3.5.5.5-3.5 8.8-8.8Z"/><path d="m9.8 3.2 3 3"/></svg>';
const deleteIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6 4.5V2.8h4v1.7M4.5 4.5l.6 9h5.8l.6-9M6.8 7v4.2M9.2 7v4.2"/></svg>';

export function createCatalogScreen({ onBack, onClasses, onGroups, onProducts }) {
  const root = document.createElement("main");
  let groups = [];
  let products = [];
  let loading = true;
  let error = "";
  let message = "";
  let submitting = false;
  let editingProduct = null;
  let sortState = { key: "nameProduct", direction: "asc" };
  let searchTerm = "";

  const getVisibleProducts = () =>
    [...products]
      .filter((product) => {
        const query = searchTerm.trim().toLocaleLowerCase("pt-BR");
        return [product.skuProduct, product.nameProduct, product.descriptionGroup, product.barcodeProduct]
          .some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(query));
      })
      .sort((left, right) => {
      const numericKeys = new Set(["priceProduct", "stockQuantityProduct"]);
      const comparison = numericKeys.has(sortState.key)
        ? Number(left[sortState.key] || 0) - Number(right[sortState.key] || 0)
        : String(left[sortState.key] ?? "").localeCompare(
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
        <strong>PDV - Cadastro de produtos</strong>
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
        <button class="classic-tool-button" data-classes type="button">Classes</button>
        <button class="classic-tool-button" data-groups type="button">Grupos</button>
        <span class="toolbar-separator"></span>
        <strong>Cadastro de produtos</strong>
      </div>
      <section class="classic-content">
        <form class="classic-form-panel" data-product-form>
          <div class="classic-panel-header">Novo produto</div>
          <div class="classic-form-body">
          <label class="form-field"><span>Nome</span><input name="nameProduct" required maxlength="180" /></label>
          <div class="classic-form-grid">
            <label class="form-field"><span>SKU</span><input name="skuProduct" required maxlength="64" /></label>
            <label class="form-field"><span>Código de barras</span><input name="barcodeProduct" maxlength="64" /></label>
          </div>
          <label class="form-field"><span>Grupo</span>
            <select name="idGroup" required>
              <option value="">Selecione</option>
              ${groups.map((group) => `<option value="${group.idGroup}">${escapeHtml(group.descriptionGroup)}</option>`).join("")}
            </select>
          </label>
          <div class="classic-form-grid">
            <label class="form-field"><span>Preço</span><input name="priceProduct" type="number" min="0" step="0.01" required /></label>
            <label class="form-field"><span>Estoque inicial</span><input name="stockQuantityProduct" type="number" min="0" step="1" required /></label>
          </div>
          ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}
          ${message ? `<p class="success-message">${escapeHtml(message)}</p>` : ""}
          </div>
          <div class="classic-form-actions">
            <button class="classic-button primary" type="submit" ${submitting || loading ? "disabled" : ""}>
              ${submitting ? "Salvando..." : "Salvar"}
            </button>
            <button class="classic-button" data-clear-form type="button" ${submitting ? "disabled" : ""}>Limpar</button>
          </div>
        </form>
        <section class="classic-grid-panel">
          <div class="classic-panel-header classic-list-header">
            <span>Produtos</span>
            <input class="classic-list-search" data-search type="search" placeholder="Pesquisar..." aria-label="Pesquisar produtos" value="${escapeHtml(searchTerm)}" />
          </div>
          <div class="classic-grid-wrapper">
            ${
              loading
                ? '<p class="classic-empty">Carregando catálogo...</p>'
                : getVisibleProducts().length
                  ? `<table class="classic-table">
                      <thead><tr>
                        ${[
                          ["skuProduct", "SKU"],
                          ["nameProduct", "Produto"],
                          ["descriptionGroup", "Grupo"],
                          ["priceProduct", "Preço"],
                          ["stockQuantityProduct", "Estoque"]
                        ].map(([key, label]) => `
                          <th aria-sort="${sortState.key === key ? (sortState.direction === "asc" ? "ascending" : "descending") : "none"}">
                            <button class="table-sort-button" type="button" data-sort="${key}">${label} <span aria-hidden="true">${sortIndicator(key)}</span></button>
                          </th>
                        `).join("")}
                        <th>Status</th><th class="actions-column">Ações</th>
                      </tr></thead>
                      <tbody>${getVisibleProducts().map((product) => `
                        <tr class="${product.isActiveProduct ? "" : "is-inactive"}">
                          <td>${escapeHtml(product.skuProduct)}</td>
                          <td>${escapeHtml(product.nameProduct)}</td>
                          <td>${escapeHtml(product.descriptionGroup || "Sem grupo")}</td>
                          <td>R$ ${Number(product.priceProduct).toFixed(2).replace(".", ",")}</td>
                          <td>${escapeHtml(product.stockQuantityProduct)}</td>
                          <td>
                            <button class="status-toggle ${product.isActiveProduct ? "is-active" : "is-inactive"}" type="button" role="switch" aria-checked="${product.isActiveProduct ? "true" : "false"}" data-status-id="${product.idProduct}" aria-label="Alternar status do produto ${escapeHtml(product.nameProduct)}">
                              <span class="status-toggle-track"><span class="status-toggle-thumb"></span></span>
                              <span class="status-toggle-label">${product.isActiveProduct ? "Ativo" : "Inativo"}</span>
                            </button>
                          </td>
                          <td class="actions-column">
                            <button class="icon-button edit" type="button" title="Editar produto" aria-label="Editar produto" data-edit="${product.idProduct}">${editIcon}</button>
                            <button class="icon-button delete" type="button" title="Excluir produto definitivamente" aria-label="Excluir produto definitivamente" data-delete="${product.idProduct}">${deleteIcon}</button>
                          </td>
                        </tr>
                      `).join("")}</tbody>
                    </table>`
                  : `<p class="classic-empty">${products.length ? "Nenhum produto encontrado." : "Nenhum produto cadastrado."}</p>`
            }
          </div>
        </section>
      </section>
      ${editingProduct ? `
        <div class="classic-modal-backdrop" data-modal-backdrop>
          <section class="classic-modal product-edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-product-title">
            <div class="classic-panel-header" id="edit-product-title">Editar produto</div>
            <form data-edit-product-form>
              <div class="classic-form-body">
                <label class="form-field"><span>Nome</span><input name="nameProduct" required maxlength="180" value="${escapeHtml(editingProduct.nameProduct)}" /></label>
                <div class="classic-form-grid">
                  <label class="form-field"><span>SKU</span><input name="skuProduct" required maxlength="64" value="${escapeHtml(editingProduct.skuProduct)}" /></label>
                  <label class="form-field"><span>Código de barras</span><input name="barcodeProduct" maxlength="64" value="${escapeHtml(editingProduct.barcodeProduct || "")}" /></label>
                </div>
                <label class="form-field"><span>Grupo</span>
                  <select name="idGroup" required>
                    ${groups.map((group) => `<option value="${group.idGroup}" ${editingProduct.idGroup === group.idGroup ? "selected" : ""}>${escapeHtml(group.descriptionGroup)}</option>`).join("")}
                  </select>
                </label>
                <div class="classic-form-grid">
                  <label class="form-field"><span>Preço</span><input name="priceProduct" type="number" min="0" step="0.01" required value="${escapeHtml(editingProduct.priceProduct)}" /></label>
                  <label class="form-field"><span>Estoque</span><input name="stockQuantityProduct" type="number" min="0" step="1" required value="${escapeHtml(editingProduct.stockQuantityProduct)}" /></label>
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
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    root.querySelector("[data-classes]")?.addEventListener("click", onClasses);
    root.querySelector("[data-groups]")?.addEventListener("click", onGroups);
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
        editingProduct = products.find(({ idProduct }) => String(idProduct) === button.dataset.edit) || null;
        render();
        root.querySelector("[data-edit-product-form] [name='nameProduct']")?.focus();
      });
    });
    root.querySelectorAll("[data-delete]").forEach((button) => {
      button.addEventListener("click", () => void deleteProduct(Number(button.dataset.delete)));
    });
    root.querySelectorAll("[data-status-id]").forEach((toggle) => {
      toggle.addEventListener("click", () =>
        void updateProductStatus(Number(toggle.dataset.statusId), toggle.getAttribute("aria-checked") !== "true")
      );
    });
    root.querySelector("[data-clear-form]")?.addEventListener("click", () => {
      root.querySelector("[data-product-form]")?.reset();
      editingProduct = null;
      error = "";
      message = "";
      render();
    });
    root.querySelector("[data-product-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void createProduct(new FormData(event.currentTarget));
    });
    root.querySelector("[data-edit-product-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void createProduct(new FormData(event.currentTarget), editingProduct?.idProduct);
    });
    root.querySelector("[data-cancel-edit]")?.addEventListener("click", () => {
      editingProduct = null;
      error = "";
      render();
    });
    root.querySelector("[data-modal-backdrop]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) {
        editingProduct = null;
        error = "";
        render();
      }
    });
  };

  const deleteProduct = async (id) => {
    if (!window.confirm("Excluir este produto definitivamente? Esta ação não poderá ser desfeita.")) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/products`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idProduct: id })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível excluir o produto.");
      message = "Produto excluído com sucesso.";
      products = products.filter((product) => product.idProduct !== id);
      render();
    } catch (deleteError) {
      error = deleteError instanceof Error ? deleteError.message : "Falha ao excluir o produto.";
      render();
    }
  };

  const load = async () => {
    loading = true;
    render();
    try {
      const [groupResponse, productResponse] = await Promise.all([
        fetch(`${getApiUrl()}/api/groups?includeInactive=1`),
        fetch(`${getApiUrl()}/api/products?includeInactive=1`)
      ]);
      const groupPayload = await groupResponse.json();
      const productPayload = await productResponse.json();
      if (!groupResponse.ok || !Array.isArray(groupPayload.groups)) {
        throw new Error(groupPayload.error || "Não foi possível carregar os grupos.");
      }
      if (!productResponse.ok || !Array.isArray(productPayload.products)) {
        throw new Error(productPayload.error || "Não foi possível carregar os produtos.");
      }
      groups = groupPayload.groups;
      products = productPayload.products;
      error = "";
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Falha ao carregar o catálogo.";
    } finally {
      loading = false;
      render();
    }
  };

  const createProduct = async (formData, productId = null) => {
    submitting = true;
    error = "";
    message = "";
    render();
    try {
      const response = await fetch(`${getApiUrl()}/api/products`, {
        method: productId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(productId ? { idProduct: productId } : {}),
          nameProduct: formData.get("nameProduct"),
          skuProduct: formData.get("skuProduct"),
          barcodeProduct: formData.get("barcodeProduct") || null,
          idGroup: Number(formData.get("idGroup")),
          priceProduct: formData.get("priceProduct"),
          stockQuantityProduct: formData.get("stockQuantityProduct")
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível cadastrar o produto.");
      }
      message = productId ? "Produto alterado com sucesso." : "Produto cadastrado com sucesso.";
      editingProduct = null;
      await load();
    } catch (createError) {
      error = createError instanceof Error ? createError.message : "Falha ao cadastrar produto.";
    } finally {
      submitting = false;
      render();
    }
  };

  const updateProductStatus = async (idProduct, isActiveProduct) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/products/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idProduct, isActiveProduct })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível alterar o status do produto.");
      message = isActiveProduct ? "Produto ativado com sucesso." : "Produto inativado com sucesso.";
      await load();
    } catch (statusError) {
      error = statusError instanceof Error ? statusError.message : "Falha ao alterar o status do produto.";
      render();
    }
  };

  render();
  void load();
  return root;
}
