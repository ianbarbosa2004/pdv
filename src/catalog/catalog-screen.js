import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { bindProductNavigation, renderProductNavigation } from "./product-navigation.js";
import {
  bindNumberMasks,
  formatMaskedNumber,
  normalizeMaskedNumber
} from "../ui/number-mask.js";

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const getApiUrl = () =>
  window.__PDV_API_URL__ || `http://${window.location.hostname}:3000`;

export function createCatalogScreen({ onBack, onClasses, onGroups, onProducts, onNcmCest, onFiscalOperations, onThermalPrint, onNcmCestUpdate, onSettings, onCompany, onNfce, onFinancial, onPaymentMethods }) {
  const root = document.createElement("main");
  let groups = [];
  let products = [];
  let loading = true;
  let error = "";
  let message = "";
  let submitting = false;
  let editingProduct = null;
  let ncms = [];
  let cestOptions = [];
  let newNcmProduct = "";
  let newCestProduct = "";
  let newProductDraft = {
    nameProduct: "",
    skuProduct: "",
    barcodeProduct: "",
    idGroup: "",
    priceProduct: "",
    stockQuantityProduct: ""
  };
  let ncmLookupOpen = false;
  let ncmLookupTerm = "";
  let ncmLookupField = "description";
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

  const getSelectedNcm = (selectedValue) =>
    ncms.find((ncm) => String(ncm.codeNcm) === String(selectedValue ?? ""));

  const renderNcmField = (selectedValue) => {
    const selectedNcm = getSelectedNcm(selectedValue);
    return `
      <label class="form-field"><span>NCM</span>
        <div class="catalog-lookup-field">
          <input name="ncmProduct" value="${escapeHtml(selectedNcm?.codeNcm || "")}" placeholder="Não informado" readonly />
          <button class="catalog-lookup-button" type="button" data-open-ncm title="Consultar NCM" aria-label="Consultar NCM"><i data-lucide="search"></i></button>
          <span class="catalog-lookup-description">${escapeHtml(selectedNcm?.descriptionNcm || "Nenhum NCM selecionado")}</span>
        </div>
      </label>
    `;
  };

  const renderCestOptions = (selectedValue) =>
    `<option value="">${cestOptions.length ? "Não informado" : "Nenhum CEST relacionado"}</option>${cestOptions.map((cest) => `<option value="${cest.codeCest}" ${String(selectedValue ?? "") === String(cest.codeCest) ? "selected" : ""}>${escapeHtml(cest.codeCest)} - ${escapeHtml(cest.descriptionCest)}</option>`).join("")}`;

  const captureNewProductDraft = () => {
    const form = root.querySelector("[data-product-form]");
    if (!form) return;
    const formData = new FormData(form);
    newProductDraft = {
      nameProduct: String(formData.get("nameProduct") ?? ""),
      skuProduct: String(formData.get("skuProduct") ?? ""),
      barcodeProduct: String(formData.get("barcodeProduct") ?? ""),
      idGroup: String(formData.get("idGroup") ?? ""),
      priceProduct: String(formData.get("priceProduct") ?? ""),
      stockQuantityProduct: String(formData.get("stockQuantityProduct") ?? "")
    };
  };

  const render = () => {
    const lookupQuery = ncmLookupTerm.trim().toLocaleLowerCase("pt-BR");
    const lookupRows = ncms
      .filter((ncm) => {
        const value = ncmLookupField === "code" ? ncm.codeNcm : ncm.descriptionNcm;
        return !lookupQuery || String(value ?? "").toLocaleLowerCase("pt-BR").includes(lookupQuery);
      })
      .slice(0, 150);
    root.className = "catalog-screen";
    root.innerHTML = `
      <header class="classic-titlebar">
        <strong>PDV - Cadastro de Produtos</strong>
        <span>Operador: Operador</span>
      </header>
      ${renderMainMenu()}
      ${renderProductNavigation("products")}
      <section class="classic-content">
        <form class="classic-form-panel" data-product-form>
          <div class="classic-panel-header">Novo produto</div>
          <div class="classic-form-body">
          <label class="form-field"><span>Nome</span><input name="nameProduct" required maxlength="180" value="${escapeHtml(newProductDraft.nameProduct)}" /></label>
          <div class="classic-form-grid">
            <label class="form-field"><span>SKU</span><input name="skuProduct" required maxlength="64" value="${escapeHtml(newProductDraft.skuProduct)}" /></label>
            <label class="form-field"><span>Código de barras</span><input name="barcodeProduct" maxlength="64" value="${escapeHtml(newProductDraft.barcodeProduct)}" /></label>
          </div>
          <label class="form-field"><span>Grupo</span>
            <select name="idGroup" required>
              <option value="">Selecione</option>
              ${groups.map((group) => `<option value="${group.idGroup}" ${String(newProductDraft.idGroup) === String(group.idGroup) ? "selected" : ""}>${escapeHtml(group.descriptionGroup)}</option>`).join("")}
            </select>
          </label>
          <div class="classic-form-grid">
            ${renderNcmField(newNcmProduct)}
            <label class="form-field"><span>CEST</span><select name="cestProduct" ${cestOptions.length ? "" : "disabled"}>${renderCestOptions(newCestProduct)}</select></label>
          </div>
          <div class="classic-form-grid">
            <label class="form-field"><span>Preço</span><input name="priceProduct" data-number-mask inputmode="decimal" required value="${escapeHtml(newProductDraft.priceProduct)}" /></label>
            <label class="form-field"><span>Estoque inicial</span><input name="stockQuantityProduct" type="number" min="0" step="1" required value="${escapeHtml(newProductDraft.stockQuantityProduct)}" /></label>
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
            <input class="classic-list-search" data-search dir="ltr" type="search" placeholder="Pesquisar..." aria-label="Pesquisar produtos" value="${escapeHtml(searchTerm)}" />
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
                            <button class="icon-button edit" type="button" title="Editar produto" aria-label="Editar produto" data-edit="${product.idProduct}"><i data-lucide="pencil"></i></button>
                            <button class="icon-button delete" type="button" title="Excluir produto definitivamente" aria-label="Excluir produto definitivamente" data-delete="${product.idProduct}"><i data-lucide="trash-2"></i></button>
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
                  ${renderNcmField(editingProduct.ncmProduct)}
                  <label class="form-field"><span>CEST</span><select name="cestProduct" ${cestOptions.length ? "" : "disabled"}>${renderCestOptions(editingProduct.cestProduct)}</select></label>
                </div>
                <div class="classic-form-grid">
                  <label class="form-field"><span>Preço</span><input name="priceProduct" data-number-mask inputmode="decimal" required value="${escapeHtml(formatMaskedNumber(editingProduct.priceProduct))}" /></label>
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
      ${ncmLookupOpen ? `
        <div class="classic-modal-backdrop" data-ncm-modal-backdrop>
          <section class="classic-modal ncm-lookup-modal" role="dialog" aria-modal="true" aria-labelledby="ncm-lookup-title">
            <div class="classic-panel-header" id="ncm-lookup-title">Consultar NCM</div>
            <div class="ncm-lookup-toolbar">
              <label class="form-field">
                <span>Consulta</span>
                <div class="ncm-lookup-controls">
                  <select data-ncm-lookup-field aria-label="Campo da consulta">
                    <option value="description" ${ncmLookupField === "description" ? "selected" : ""}>Descrição</option>
                    <option value="code" ${ncmLookupField === "code" ? "selected" : ""}>NCM</option>
                  </select>
                  <input data-ncm-lookup-search dir="ltr" type="search" value="${escapeHtml(ncmLookupTerm)}" placeholder="Digite para pesquisar..." aria-label="Pesquisar NCM" />
                </div>
              </label>
            </div>
            <div class="ncm-lookup-table-wrapper">
              ${lookupRows.length ? `
                <table class="classic-table ncm-lookup-table">
                  <thead><tr><th>NCM</th><th>Descrição</th><th class="actions-column">Selecionar</th></tr></thead>
                  <tbody>${lookupRows.map((ncm) => `
                    <tr data-ncm-row="${escapeHtml(ncm.codeNcm)}">
                      <td>${escapeHtml(ncm.codeNcm)}</td>
                      <td title="${escapeHtml(ncm.descriptionNcm)}">${escapeHtml(ncm.descriptionNcm)}</td>
                      <td class="actions-column"><button class="classic-button ncm-select-button" type="button" data-select-ncm="${escapeHtml(ncm.codeNcm)}">OK</button></td>
                    </tr>
                  `).join("")}</tbody>
                </table>
              ` : '<p class="classic-empty">Nenhum NCM encontrado.</p>'}
            </div>
            <div class="classic-form-actions">
              <span class="ncm-lookup-count">${lookupRows.length}${lookupRows.length === 150 ? "+" : ""} resultado(s)</span>
              <button class="classic-button" data-close-ncm type="button">Cancelar</button>
            </div>
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
      financial: onFinancial,
      "payment-methods": onPaymentMethods
    });
    bindProductNavigation(root, { back: onBack, classes: onClasses, groups: onGroups, products: onProducts, "ncm-cest": onNcmCest });
    root.querySelector("[data-search]")?.addEventListener("input", (event) => {
      searchTerm = event.currentTarget.value;
      render();
      const searchInput = root.querySelector("[data-search]");
      searchInput?.focus();
      searchInput?.setSelectionRange(searchTerm.length, searchTerm.length);
    });
    root.querySelectorAll("[data-open-ncm]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!editingProduct) captureNewProductDraft();
        ncmLookupOpen = true;
        ncmLookupTerm = "";
        ncmLookupField = "description";
        render();
        root.querySelector("[data-ncm-lookup-search]")?.focus();
      });
    });
    root.querySelector("[data-ncm-lookup-field]")?.addEventListener("change", (event) => {
      ncmLookupField = event.currentTarget.value;
      render();
      root.querySelector("[data-ncm-lookup-search]")?.focus();
    });
    root.querySelector("[data-ncm-lookup-search]")?.addEventListener("input", (event) => {
      const input = event.currentTarget;
      const selectionStart = input.selectionStart;
      const selectionEnd = input.selectionEnd;
      ncmLookupTerm = input.value;
      render();
      const nextInput = root.querySelector("[data-ncm-lookup-search]");
      nextInput?.focus();
      if (selectionStart !== null && selectionEnd !== null) {
        nextInput?.setSelectionRange(selectionStart, selectionEnd);
      }
    });
    root.querySelectorAll("[data-select-ncm]").forEach((button) => {
      button.addEventListener("click", () => {
        const selectedCode = button.dataset.selectNcm;
        ncmLookupOpen = false;
        if (editingProduct) {
          editingProduct = { ...editingProduct, ncmProduct: selectedCode, cestProduct: "" };
        } else {
          newNcmProduct = selectedCode;
          newCestProduct = "";
        }
        render();
        void loadCestOptions(selectedCode);
      });
    });
    root.querySelector("[data-close-ncm]")?.addEventListener("click", () => {
      ncmLookupOpen = false;
      render();
    });
    root.querySelector("[data-ncm-modal-backdrop]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) {
        ncmLookupOpen = false;
        render();
      }
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
        cestOptions = [];
        render();
        void loadCestOptions(editingProduct?.ncmProduct);
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
      newNcmProduct = "";
      newCestProduct = "";
      newProductDraft = {
        nameProduct: "",
        skuProduct: "",
        barcodeProduct: "",
        idGroup: "",
        priceProduct: "",
        stockQuantityProduct: ""
      };
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
      const ncmResponse = await fetch(`${getApiUrl()}/api/ncm-cest/ncms`);
      const ncmPayload = await ncmResponse.json();
      if (!ncmResponse.ok || !Array.isArray(ncmPayload.ncms)) {
        throw new Error(ncmPayload.error || "Não foi possível carregar os NCMs.");
      }
      ncms = ncmPayload.ncms;
      error = "";
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Falha ao carregar o catálogo.";
    } finally {
      loading = false;
      render();
    }
  };

  const loadCestOptions = async (ncmCode) => {
    cestOptions = [];
    if (!ncmCode) {
      if (editingProduct) editingProduct = { ...editingProduct, cestProduct: "" };
      else newCestProduct = "";
    }
    if (ncmCode) {
      try {
        const response = await fetch(`${getApiUrl()}/api/ncm-cest/options?ncm=${encodeURIComponent(ncmCode)}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Não foi possível carregar os CESTs.");
        cestOptions = payload.cests;
      } catch (loadError) {
        error = loadError instanceof Error ? loadError.message : "Falha ao carregar os CESTs.";
      }
    }
    render();
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
          ncmProduct: formData.get("ncmProduct") || null,
          cestProduct: formData.get("cestProduct") || null,
          priceProduct: normalizeMaskedNumber(formData.get("priceProduct")),
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
