import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { clearRenderedFeedback, createFeedbackTimer, renderSuccessFeedback } from "../ui/feedback.js";
import { apiFetch, getApiUrl } from "../shared/api.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const valueOrDash = (value) => escapeHtml(String(value ?? "").trim() || "-");
const formatConversionFactor = (value) =>
  Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 6 });
const formatFiscalOperation = (product) =>
  [product.cfopFiscalOperation, product.operationNatureFiscalOperation]
    .filter(Boolean)
    .join(" - ");

const normalizeFiscalCode = (value) => String(value ?? "").replace(/\D/g, "");

const getFiscalConsistency = (product) => {
  const productNcm = normalizeFiscalCode(product.ncmProduct);
  const productCest = normalizeFiscalCode(product.cestProduct);
  const references = product.references.map((reference) => ({
    ...reference,
    ncmMismatch: productNcm !== normalizeFiscalCode(reference.ncmProductFiscalReference),
    cestMismatch: productCest !== normalizeFiscalCode(reference.cestProductFiscalReference)
  }));
  return {
    references,
    ncmMismatch: references.some((reference) => reference.ncmMismatch),
    cestMismatch: references.some((reference) => reference.cestMismatch)
  };
};

const isFiscalConsistent = (product) => {
  const consistency = getFiscalConsistency(product);
  return !consistency.ncmMismatch && !consistency.cestMismatch;
};

const fiscalCodeFieldClass = (isMismatch) => isMismatch ? " fiscal-code-mismatch" : "";

export function createProductFiscalReferenceScreen(menuActions) {
  const root = document.createElement("main");
  let products = [];
  let selectedProductId = null;
  let search = "";
  let sortState = { key: "nameProduct", direction: "asc" };
  let loading = true;
  let error = "";
  let message = "";
  let submitting = false;
  let editingProduct = null;
  const scheduleMessageClear = createFeedbackTimer();

  const selectedProduct = () => products.find(
    (product) => String(product.idProduct) === String(selectedProductId)
  ) || products[0] || null;

  const renderDetails = (product) => {
    if (!product) {
      return `<div class="empty-state">Selecione um produto vinculado para visualizar os dados fiscais.</div>`;
    }
    const consistency = getFiscalConsistency(product);
    return `
      <div class="classic-form-body">
        <label class="form-field"><span>Nome</span><input readonly value="${valueOrDash(product.nameProduct)}" /></label>
        <div class="classic-form-grid">
          <label class="form-field"><span>Tipo de Produto</span><input readonly value="${valueOrDash(product.descriptionProductType)}" /></label>
          <label class="form-field"><span>Grupo</span><input readonly value="${valueOrDash(product.descriptionGroup)}" /></label>
          <label class="form-field"><span>Operação Fiscal de Venda</span><input readonly value="${valueOrDash(formatFiscalOperation(product))}" /></label>
          <label class="form-field"><span>Unidade Tributável</span><input readonly value="${valueOrDash(product.codeUnit || product.descriptionUnit)}" /></label>
          <label class="form-field${fiscalCodeFieldClass(consistency.ncmMismatch)}"><span>NCM</span><input readonly value="${valueOrDash(product.ncmProduct)}" /></label>
          <label class="form-field${fiscalCodeFieldClass(consistency.cestMismatch)}"><span>CEST</span><input readonly value="${valueOrDash(product.cestProduct)}" /></label>
        </div>
        ${consistency.ncmMismatch || consistency.cestMismatch
          ? `<div class="product-fiscal-reference-edit-actions"><button class="classic-button fiscal-edit-product-button" type="button" data-edit-product="${product.idProduct}" title="Editar Produto" aria-label="Editar Produto"><i data-lucide="pencil"></i> Editar Produto</button></div>`
          : ""}
        <hr class="section-divider" />
        <div class="classic-section-heading"><strong>Vínculos Fiscais</strong></div>
        ${consistency.references.map((reference) => `
          <article class="product-fiscal-reference-card">
            <label class="form-field"><span>Nome</span><input readonly value="${valueOrDash(reference.descriptionFiscalProductReference)}" /></label>
            <div class="classic-form-grid product-fiscal-reference-operation-grid">
              <label class="form-field"><span>CFOP</span><input readonly value="${valueOrDash(reference.cfopProductFiscalReference)}" /></label>
              <label class="form-field"><span>Unidade Fiscal</span><input readonly value="${valueOrDash(reference.fiscalUnitProductReference)}" /></label>
              <label class="form-field"><span>Fator de Conversão</span><input readonly value="${formatConversionFactor(reference.conversionFactor)}" /></label>
            </div>
            <div class="classic-form-grid product-fiscal-reference-ncm-grid">
              <label class="form-field${fiscalCodeFieldClass(reference.ncmMismatch)}"><span>NCM</span><input readonly value="${valueOrDash(reference.ncmProductFiscalReference)}" /></label>
              <label class="form-field${fiscalCodeFieldClass(reference.cestMismatch)}"><span>CEST</span><input readonly value="${valueOrDash(reference.cestProductFiscalReference)}" /></label>
            </div>
          </article>
        `).join("")}
      </div>
    `;
  };

  const renderEditModal = () => editingProduct ? `
    <div class="classic-modal-backdrop" data-fiscal-edit-backdrop>
      <section class="classic-modal product-edit-modal" role="dialog" aria-modal="true" aria-labelledby="fiscal-edit-product-title">
        <div class="classic-panel-header modal-panel-header">
          <span id="fiscal-edit-product-title">Editar produto</span>
          <button class="modal-close-button" data-cancel-fiscal-edit type="button" aria-label="Fechar" title="Fechar">
            <i data-lucide="x"></i>
          </button>
        </div>
        <form data-fiscal-edit-form>
          <div class="classic-form-body">
            <label class="form-field"><span>Produto</span><input readonly value="${valueOrDash(editingProduct.nameProduct)}" /></label>
            <div class="classic-form-grid">
              <label class="form-field"><span>NCM</span><input name="ncmProduct" inputmode="numeric" maxlength="8" value="${escapeHtml(editingProduct.ncmProduct || "")}" /></label>
              <label class="form-field"><span>CEST</span><input name="cestProduct" inputmode="numeric" maxlength="7" value="${escapeHtml(editingProduct.cestProduct || "")}" /></label>
            </div>
            ${error ? `<div class="feedback error">${escapeHtml(error)}</div>` : ""}
            <div class="modal-actions">
              <button class="classic-button" data-cancel-fiscal-edit type="button">Cancelar</button>
              <button class="classic-button primary" type="submit" ${submitting ? "disabled" : ""}>${submitting ? "Salvando..." : "Salvar"}</button>
            </div>
          </div>
        </form>
      </section>
    </div>
  ` : "";

  const render = () => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    const visibleProducts = products
      .filter((product) =>
        `${product.nameProduct} ${product.skuProduct || ""} ${product.pdvCodeProduct || ""} ${product.descriptionGroup || ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(query)
      )
      .sort((left, right) => {
        const leftValue = sortState.key === "references"
          ? left.references.length
          : sortState.key === "fiscalConsistency"
            ? (isFiscalConsistent(left) ? 0 : 1)
            : left[sortState.key];
        const rightValue = sortState.key === "references"
          ? right.references.length
          : sortState.key === "fiscalConsistency"
            ? (isFiscalConsistent(right) ? 0 : 1)
            : right[sortState.key];
        const comparison = sortState.key === "pdvCodeProduct" || sortState.key === "fiscalConsistency"
          ? Number(leftValue || 0) - Number(rightValue || 0)
          : String(leftValue ?? "").localeCompare(String(rightValue ?? ""), "pt-BR", { sensitivity: "base" });
        return sortState.direction === "asc" ? comparison : -comparison;
      });
    const sortIndicator = (key) =>
      sortState.key === key ? (sortState.direction === "asc" ? "↑" : "↓") : "↕";
    if (visibleProducts.length && !visibleProducts.some((product) => String(product.idProduct) === String(selectedProductId))) {
      selectedProductId = visibleProducts[0].idProduct;
    }
    root.className = "catalog-screen product-fiscal-reference-screen";
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - Cadastro de Produtos Vinculados</strong><span>Operador: Operador</span></header>
      ${renderMainMenu()}
      <section class="classic-content">
        ${error ? `<div class="feedback error">${escapeHtml(error)}</div>` : ""}
        ${renderSuccessFeedback(message, escapeHtml)}
        ${loading ? `<div class="loading-state">Carregando produtos vinculados...</div>` : `
          <form class="classic-form-panel product-fiscal-reference-details">
              <div class="classic-panel-header">Visualização do produto</div>
              ${renderDetails(selectedProduct())}
          </form>
          <section class="classic-grid-panel product-fiscal-reference-list">
              <div class="classic-panel-header classic-list-header">
                <span>Produtos vinculados</span>
                <input class="classic-list-search" name="productSearch" data-search dir="ltr" type="search" placeholder="Pesquisar..." aria-label="Pesquisar produtos vinculados" value="${escapeHtml(search)}" />
              </div>
              <div class="classic-grid-wrapper"><table class="classic-table"><thead><tr>
                ${[
                  ["pdvCodeProduct", "# PDV", "text-center"],
                  ["nameProduct", "Produto"],
                  ["descriptionGroup", "Grupo", "text-center"],
                  ["references", "Vínculos", "text-center"]
                ].map(([key, label, className = ""]) => `
                  <th class="${className}" aria-sort="${sortState.key === key ? (sortState.direction === "asc" ? "ascending" : "descending") : "none"}">
                    <button class="table-sort-button" type="button" data-sort="${key}">${label} <span aria-hidden="true">${sortIndicator(key)}</span></button>
                  </th>
                `).join("")}
                <th class="text-center ok-column" aria-sort="${sortState.key === "fiscalConsistency" ? (sortState.direction === "asc" ? "ascending" : "descending") : "none"}">
                  <button class="table-sort-button" type="button" data-sort="fiscalConsistency">Ok <span aria-hidden="true">${sortIndicator("fiscalConsistency")}</span></button>
                </th>
              </tr></thead><tbody>
                ${visibleProducts.length ? visibleProducts.map((product) => {
                  const isConsistent = isFiscalConsistent(product);
                  return `
                  <tr data-product-id="${product.idProduct}" class="${String(product.idProduct) === String(selectedProductId) ? "is-selected" : ""}" tabindex="0">
                    <td class="text-center">${valueOrDash(product.pdvCodeProduct)}</td>
                    <td>${valueOrDash(product.nameProduct)}</td>
                    <td>${valueOrDash(product.descriptionGroup)}</td>
                    <td class="text-center">${product.references.length}</td>
                    <td class="text-center ok-column">
                      <i data-lucide="${isConsistent ? "check" : "triangle-alert"}" class="fiscal-consistency-icon ${isConsistent ? "is-consistent" : "is-inconsistent"}" aria-label="${isConsistent ? "NCM e CEST conferem" : "NCM ou CEST divergente"}" title="${isConsistent ? "NCM e CEST conferem" : "NCM ou CEST divergente"}"></i>
                    </td>
                  </tr>
                `;
                }).join("") : `<tr><td colspan="5">Nenhum produto vinculado encontrado.</td></tr>`}
              </tbody></table></div>
        `}
      </section>
      ${renderEditModal()}
    `;
    renderLucideIcons(root);
    bindMainMenu(root, menuActions);
    root.querySelector("[data-search]")?.addEventListener("input", (event) => {
      const input = event.currentTarget;
      const selectionStart = input.selectionStart;
      const selectionEnd = input.selectionEnd;
      const selectionDirection = input.selectionDirection;
      search = event.currentTarget.value;
      render();
      const nextInput = root.querySelector("[data-search]");
      nextInput?.focus();
      if (selectionStart !== null && selectionEnd !== null) {
        nextInput?.setSelectionRange(selectionStart, selectionEnd, selectionDirection || "none");
      }
    });
    root.querySelectorAll("[data-sort]").forEach((button) => {
      button.addEventListener("click", () => {
        sortState = sortState.key === button.dataset.sort
          ? { key: sortState.key, direction: sortState.direction === "asc" ? "desc" : "asc" }
          : { key: button.dataset.sort, direction: "asc" };
        render();
      });
    });
    root.querySelectorAll("[data-product-id]").forEach((row) => {
      const select = () => {
        selectedProductId = row.dataset.productId;
        render();
      };
      row.addEventListener("click", select);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select();
        }
      });
    });
    root.querySelectorAll("[data-edit-product]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const product = products.find((item) => String(item.idProduct) === String(button.dataset.editProduct));
        if (product) void openEditModal(product);
      });
    });
    root.querySelectorAll("[data-cancel-fiscal-edit]").forEach((button) => {
      button.addEventListener("click", () => {
        editingProduct = null;
        error = "";
        render();
      });
    });
    root.querySelector("[data-fiscal-edit-backdrop]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) {
        editingProduct = null;
        error = "";
        render();
      }
    });
    root.querySelector("[data-fiscal-edit-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void saveEditedProduct(new FormData(event.currentTarget));
    });
  };

  const openEditModal = async (product) => {
    error = "";
    message = "";
    try {
      const response = await apiFetch(`${getApiUrl()}/api/products?includeInactive=1`);
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.products)) {
        throw new Error(payload.error || "Não foi possível carregar os dados do produto.");
      }
      editingProduct = payload.products.find(
        (item) => String(item.idProduct) === String(product.idProduct)
      ) || null;
      if (!editingProduct) throw new Error("Produto não encontrado.");
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Falha ao carregar o produto.";
    }
    render();
  };

  const saveEditedProduct = async (formData) => {
    if (!editingProduct || submitting) return;
    submitting = true;
    error = "";
    message = "";
    render();
    try {
      const response = await apiFetch(`${getApiUrl()}/api/products/fiscal`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idProduct: editingProduct.idProduct,
          ncmProduct: formData.get("ncmProduct"),
          cestProduct: formData.get("cestProduct")
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível editar o produto.");
      selectedProductId = editingProduct.idProduct;
      editingProduct = null;
      message = "Produto alterado com sucesso.";
      await load();
      scheduleMessageClear(() => {
        message = "";
        clearRenderedFeedback(root);
      });
    } catch (saveError) {
      error = saveError instanceof Error ? saveError.message : "Falha ao editar o produto.";
    } finally {
      submitting = false;
      render();
    }
  };

  const load = async () => {
    try {
      const response = await apiFetch(`${getApiUrl()}/api/stock/product-fiscal-references`);
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.products)) {
        throw new Error(payload.error || "Não foi possível carregar os produtos vinculados.");
      }
      products = payload.products;
      selectedProductId = products.some(
        (product) => String(product.idProduct) === String(selectedProductId)
      )
        ? selectedProductId
        : products[0]?.idProduct ?? null;
      error = "";
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Falha ao carregar os produtos vinculados.";
    } finally {
      loading = false;
      render();
    }
  };

  render();
  void load();
  return root;
}
