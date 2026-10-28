import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { bindFormRowPreview } from "../ui/form-row-preview.js";
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

const formatIntegerStock = (value) => {
  const normalizedValue = String(value ?? "");
  return /^-?\d+\.0+$/.test(normalizedValue)
    ? normalizedValue.slice(0, normalizedValue.indexOf("."))
    : normalizedValue;
};

const formatStockForInput = (value, isFractionalProduct) =>
  isFractionalProduct ? String(value ?? "") : formatIntegerStock(value);

const getApiUrl = () =>
  window.__PDV_API_URL__ || `http://${window.location.hostname}:3000`;

export function createCatalogScreen({
  title = "Produtos",
  productTypeDescription = "Mercadoria para Revenda",
  navigationActive = "products",
  singularLabel = "produto",
  createFormTitle = `Novo ${singularLabel}`,
  editFormTitle = `Editar ${singularLabel}`,
  skuPrefix = "PROD-",
  defaultControlsStock = true,
  defaultShowsInPdv = true,
  defaultFiscalOperation = true,
  onBack,
  onClasses,
  onGroups,
  onProducts,
  onRawMaterials,
  onPackaging,
  onConsumables,
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
  const root = document.createElement("main");
  let groups = [];
  let products = [];
  let fiscalOperations = [];
  let productTypes = [];
  let units = [];
  let allowNegativeStock = false;
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
    skuProduct: skuPrefix,
    pdvCodeProduct: "",
    idGroup: "",
    idFiscalOperationSaleProduct: "",
    idProductTypeProduct: "",
    idUnitProduct: "",
    priceProduct: "0,00",
    stockQuantityProduct: "0",
    controlsStockProduct: defaultControlsStock,
    isFractionalProduct: false,
    printsKitchenProduct: false,
    showsInPdvProduct: defaultShowsInPdv
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
        return [product.skuProduct, product.nameProduct, product.descriptionGroup, product.pdvCodeProduct]
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
      pdvCodeProduct: String(formData.get("pdvCodeProduct") ?? ""),
      idGroup: String(formData.get("idGroup") ?? ""),
      idFiscalOperationSaleProduct: String(formData.get("idFiscalOperationSaleProduct") ?? ""),
      idProductTypeProduct: String(formData.get("idProductTypeProduct") ?? ""),
      idUnitProduct: String(formData.get("idUnitProduct") ?? ""),
      priceProduct: String(formData.get("priceProduct") ?? ""),
      stockQuantityProduct: String(formData.get("stockQuantityProduct") ?? ""),
      controlsStockProduct: formData.get("controlsStockProduct") === "on",
      isFractionalProduct: formData.get("isFractionalProduct") === "on",
      printsKitchenProduct: formData.get("printsKitchenProduct") === "on",
      showsInPdvProduct: formData.get("showsInPdvProduct") === "on"
    };
  };

  const renderProductTypeOptions = (selectedValue) =>
    `<option value="">Selecione</option>${productTypes.map((type) =>
      `<option value="${type.idProductType}" ${String(selectedValue ?? "") === String(type.idProductType) ? "selected" : ""}>${escapeHtml(type.descriptionProductType)}</option>`
    ).join("")}`;

  const renderUnitOptions = (selectedValue) =>
    `<option value="">Selecione</option>${units.map((unit) =>
      `<option value="${unit.idUnit}" ${String(selectedValue ?? "") === String(unit.idUnit) ? "selected" : ""}>${escapeHtml(unit.codeUnit)} - ${escapeHtml(unit.descriptionUnit)}</option>`
    ).join("")}`;

  const renderFiscalOperationOptions = (selectedValue) =>
    `<option value="">Não informado</option>${fiscalOperations.map((operation) =>
      `<option value="${operation.idFiscalOperation}" ${String(selectedValue ?? "") === String(operation.idFiscalOperation) ? "selected" : ""}>${escapeHtml(operation.descriptionFiscalOperation)}</option>`
    ).join("")}`;

  const getDefaultProductType = () =>
    productTypes.find(({ descriptionProductType }) =>
      ["Mercadoria para Revenda", "Revenda de Mercadorias"].includes(descriptionProductType)
    ) || productTypes[0];

  const getScreenProductType = () =>
    productTypes.find(({ descriptionProductType }) =>
      descriptionProductType === productTypeDescription
    ) || getDefaultProductType();

  const getDefaultUnit = () =>
    units.find(({ codeUnit }) => codeUnit === "UN") || units[0];

  const getDefaultFiscalOperation = () =>
    defaultFiscalOperation &&
    fiscalOperations.find(({ descriptionFiscalOperation }) =>
      String(descriptionFiscalOperation).trim().toLocaleLowerCase("pt-BR") === "revenda de mercadorias"
    );

  const isStockControlled = (product) =>
    Number(product.controlsStockProduct) !== 0;

  const renderStockInput = (product, label) => {
    const stockControlled = isStockControlled(product);
    const value = formatStockForInput(product.stockQuantityProduct, product.isFractionalProduct);
    return `
      <label class="form-field"><span>${label}</span>
        <input name="stockQuantityProduct" type="number" ${allowNegativeStock ? "" : 'min="0"'} step="${product.isFractionalProduct ? "0.001" : "1"}" ${stockControlled ? "" : "readonly disabled"} required value="${escapeHtml(value)}" />
      </label>
    `;
  };

  const renderProductFlags = (product = newProductDraft) => `
    <div class="classic-form-grid">
      <label class="form-field checkbox-field"><span>Controla estoque</span><input name="controlsStockProduct" type="checkbox" ${Number(product.controlsStockProduct) !== 0 ? "checked" : ""} /></label>
      <label class="form-field checkbox-field"><span>Produto fracionado</span><input name="isFractionalProduct" type="checkbox" ${product.isFractionalProduct ? "checked" : ""} /></label>
      <label class="form-field checkbox-field"><span>Imprime cozinha</span><input name="printsKitchenProduct" type="checkbox" ${product.printsKitchenProduct ? "checked" : ""} /></label>
      <label class="form-field checkbox-field"><span>Exibir no PDV</span><input name="showsInPdvProduct" type="checkbox" ${product.showsInPdvProduct !== false && product.showsInPdvProduct !== 0 ? "checked" : ""} /></label>
    </div>
  `;

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
        <strong>PDV - Cadastro de ${escapeHtml(title)}</strong>
        <span>Operador: Operador</span>
      </header>
      ${renderMainMenu()}
      ${renderProductNavigation(navigationActive)}
      <section class="classic-content">
        <form class="classic-form-panel" data-product-form>
          <div class="classic-panel-header">${createFormTitle}</div>
          <div class="classic-form-body">
          <label class="form-field"><span>Nome</span><input name="nameProduct" required maxlength="180" value="${escapeHtml(newProductDraft.nameProduct)}" /></label>
          <div class="classic-form-grid">
            <label class="form-field"><span>SKU</span><input name="skuProduct" required maxlength="64" value="${escapeHtml(newProductDraft.skuProduct)}" /></label>
            <label class="form-field"><span>Código PDV</span><input name="pdvCodeProduct" maxlength="64" value="${escapeHtml(newProductDraft.pdvCodeProduct)}" /></label>
          </div>
          <div class="classic-form-grid">
            <label class="form-field"><span>Grupo</span>
              <select name="idGroup" required>
                <option value="">Selecione</option>
                ${groups.map((group) => `<option value="${group.idGroup}" ${String(newProductDraft.idGroup) === String(group.idGroup) ? "selected" : ""}>${escapeHtml(group.descriptionGroup)}</option>`).join("")}
              </select>
            </label>
            <label class="form-field"><span>Operação fiscal de venda</span><select name="idFiscalOperationSaleProduct">${renderFiscalOperationOptions(newProductDraft.idFiscalOperationSaleProduct)}</select></label>
          </div>
          <div class="classic-form-grid">
            <label class="form-field"><span>Tipo de produto</span>
              <input type="hidden" name="idProductTypeProduct" value="${escapeHtml(newProductDraft.idProductTypeProduct)}" />
              <select data-product-type-display disabled>${renderProductTypeOptions(newProductDraft.idProductTypeProduct)}</select>
            </label>
            <label class="form-field"><span>Unidade tributável</span><select name="idUnitProduct" required>${renderUnitOptions(newProductDraft.idUnitProduct)}</select></label>
          </div>
          <div class="classic-form-grid">
            ${renderNcmField(newNcmProduct)}
            <label class="form-field"><span>CEST</span><select name="cestProduct" ${cestOptions.length ? "" : "disabled"}>${renderCestOptions(newCestProduct)}</select></label>
          </div>
          <div class="classic-form-grid">
            <label class="form-field"><span>Preço</span><input name="priceProduct" data-number-mask inputmode="decimal" required value="${escapeHtml(newProductDraft.priceProduct)}" /></label>
            ${renderStockInput(newProductDraft, "Estoque inicial")}
          </div>
          ${renderProductFlags()}
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
            <span>${escapeHtml(title)}</span>
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
                        <th>Exibir no PDV</th><th>Status</th><th class="actions-column">Ações</th>
                      </tr></thead>
                      <tbody>${getVisibleProducts().map((product) => `
                        <tr class="${product.isActiveProduct ? "" : "is-inactive"}" data-view-record="${escapeHtml(JSON.stringify(product))}">
                          <td>${escapeHtml(product.skuProduct)}</td>
                          <td>${escapeHtml(product.nameProduct)}</td>
                          <td>${escapeHtml(product.descriptionGroup || "Sem grupo")}</td>
                          <td>R$ ${Number(product.priceProduct).toFixed(2).replace(".", ",")}</td>
                          <td>${escapeHtml(product.stockQuantityProduct)}</td>
                          <td>
                            <button class="status-toggle ${Number(product.showsInPdvProduct) ? "is-active" : "is-inactive"}" type="button" role="switch" aria-checked="${Number(product.showsInPdvProduct) ? "true" : "false"}" data-pdv-status-id="${product.idProduct}" aria-label="Alternar exibição de ${escapeHtml(product.nameProduct)} no PDV">
                              <span class="status-toggle-track"><span class="status-toggle-thumb"></span></span>
                              <span class="status-toggle-label">${Number(product.showsInPdvProduct) ? "Sim" : "Não"}</span>
                            </button>
                          </td>
                          <td>
                            <button class="status-toggle ${product.isActiveProduct ? "is-active" : "is-inactive"}" type="button" role="switch" aria-checked="${product.isActiveProduct ? "true" : "false"}" data-status-id="${product.idProduct}" aria-label="Alternar status do produto ${escapeHtml(product.nameProduct)}">
                              <span class="status-toggle-track"><span class="status-toggle-thumb"></span></span>
                              <span class="status-toggle-label">${product.isActiveProduct ? "Ativo" : "Inativo"}</span>
                            </button>
                          </td>
                          <td class="actions-column">
                            <button class="icon-button edit" type="button" title="Editar ${escapeHtml(singularLabel)}" aria-label="Editar ${escapeHtml(singularLabel)}" data-edit="${product.idProduct}"><i data-lucide="pencil"></i></button>
                            <button class="icon-button delete" type="button" title="Excluir ${escapeHtml(singularLabel)} definitivamente" aria-label="Excluir ${escapeHtml(singularLabel)} definitivamente" data-delete="${product.idProduct}"><i data-lucide="trash-2"></i></button>
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
          <div class="classic-panel-header modal-panel-header"><span id="edit-product-title">${editFormTitle}</span><button class="modal-close-button" data-cancel-edit type="button" aria-label="Fechar" title="Fechar"><i data-lucide="x"></i></button></div>
            <form data-edit-product-form>
              <div class="classic-form-body">
                <label class="form-field"><span>Nome</span><input name="nameProduct" required maxlength="180" value="${escapeHtml(editingProduct.nameProduct)}" /></label>
                <div class="classic-form-grid">
                  <label class="form-field"><span>SKU</span><input name="skuProduct" required maxlength="64" value="${escapeHtml(editingProduct.skuProduct)}" /></label>
                  <label class="form-field"><span>Código PDV</span><input name="pdvCodeProduct" maxlength="64" value="${escapeHtml(editingProduct.pdvCodeProduct || "")}" /></label>
                </div>
                <div class="classic-form-grid">
                  <label class="form-field"><span>Grupo</span>
                    <select name="idGroup" required>
                      ${groups.map((group) => `<option value="${group.idGroup}" ${editingProduct.idGroup === group.idGroup ? "selected" : ""}>${escapeHtml(group.descriptionGroup)}</option>`).join("")}
                    </select>
                  </label>
                  <label class="form-field"><span>Operação fiscal de venda</span><select name="idFiscalOperationSaleProduct">${renderFiscalOperationOptions(editingProduct.idFiscalOperationSaleProduct)}</select></label>
                </div>
                <div class="classic-form-grid">
                  <label class="form-field"><span>Tipo de produto</span>
                    <input type="hidden" name="idProductTypeProduct" value="${escapeHtml(editingProduct.idProductTypeProduct)}" />
                    <select data-product-type-display disabled>${renderProductTypeOptions(editingProduct.idProductTypeProduct)}</select>
                  </label>
                  <label class="form-field"><span>Unidade tributável</span><select name="idUnitProduct" required>${renderUnitOptions(editingProduct.idUnitProduct)}</select></label>
                </div>
                <div class="classic-form-grid">
                  ${renderNcmField(editingProduct.ncmProduct)}
                  <label class="form-field"><span>CEST</span><select name="cestProduct" ${cestOptions.length ? "" : "disabled"}>${renderCestOptions(editingProduct.cestProduct)}</select></label>
                </div>
                <div class="classic-form-grid">
                  <label class="form-field"><span>Preço</span><input name="priceProduct" data-number-mask inputmode="decimal" required value="${escapeHtml(formatMaskedNumber(editingProduct.priceProduct))}" /></label>
                  ${renderStockInput(editingProduct, "Estoque")}
                </div>
                ${renderProductFlags(editingProduct)}
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
            <div class="classic-panel-header modal-panel-header"><span id="ncm-lookup-title">Consultar NCM</span><button class="modal-close-button" data-close-ncm type="button" aria-label="Fechar" title="Fechar"><i data-lucide="x"></i></button></div>
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
      "raw-materials": onRawMaterials,
      packaging: onPackaging,
      consumables: onConsumables,
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
    bindProductNavigation(root, {
      back: onBack,
      classes: onClasses,
      groups: onGroups,
      products: onProducts,
      "raw-materials": onRawMaterials,
      packaging: onPackaging,
      consumables: onConsumables,
      "product-types": onProductTypes,
      units: onUnits,
      "ncm-cest": onNcmCest
    });
    bindFormRowPreview(root, { formSelector: "[data-product-form]" });
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
    root.querySelectorAll("[data-pdv-status-id]").forEach((toggle) => {
      toggle.addEventListener("click", () =>
        void updateProductPdvVisibility(Number(toggle.dataset.pdvStatusId), toggle.getAttribute("aria-checked") !== "true")
      );
    });
    root.querySelector("[data-clear-form]")?.addEventListener("click", () => {
      root.querySelector("[data-product-form]")?.reset();
      editingProduct = null;
      newNcmProduct = "";
      newCestProduct = "";
      newProductDraft = {
        nameProduct: "",
        skuProduct: skuPrefix,
        pdvCodeProduct: "",
        idGroup: "",
        idFiscalOperationSaleProduct: getDefaultFiscalOperation()
          ? String(getDefaultFiscalOperation().idFiscalOperation)
          : "",
        idProductTypeProduct: getScreenProductType()
          ? String(getScreenProductType().idProductType)
          : "",
        idUnitProduct: "",
        priceProduct: "0,00",
        stockQuantityProduct: "0",
        controlsStockProduct: defaultControlsStock,
        isFractionalProduct: false,
        printsKitchenProduct: false,
        showsInPdvProduct: defaultShowsInPdv
      };
      error = "";
      message = "";
      render();
    });
    root.querySelector("[data-product-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void createProduct(new FormData(event.currentTarget));
    });
    root.querySelectorAll("[name='isFractionalProduct']").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const stockInput = checkbox.form?.elements.namedItem("stockQuantityProduct");
        if (stockInput) stockInput.step = checkbox.checked ? "0.001" : "1";
      });
    });
    root.querySelectorAll("[name='controlsStockProduct']").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const stockInput = checkbox.form?.elements.namedItem("stockQuantityProduct");
        if (stockInput) {
          stockInput.disabled = !checkbox.checked;
          stockInput.readOnly = !checkbox.checked;
        }
      });
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
      products = products.filter((product) => String(product.idProduct) !== String(id));
      render();
      await load();
    } catch (deleteError) {
      error = deleteError instanceof Error ? deleteError.message : "Falha ao excluir o produto.";
      render();
    }
  };

  const load = async () => {
    loading = true;
    render();
    try {
      const [groupResponse, productResponse, operationResponse, typeResponse, unitResponse, generalSettingsResponse] = await Promise.all([
        fetch(`${getApiUrl()}/api/groups?includeInactive=1`),
        fetch(`${getApiUrl()}/api/products?includeInactive=1&productType=${encodeURIComponent(productTypeDescription)}`),
        fetch(`${getApiUrl()}/api/fiscal-operations`),
        fetch(`${getApiUrl()}/api/product-types`),
        fetch(`${getApiUrl()}/api/units`),
        fetch(`${getApiUrl()}/api/general-settings`)
      ]);
      const groupPayload = await groupResponse.json();
      const productPayload = await productResponse.json();
      const operationPayload = await operationResponse.json();
      const typePayload = await typeResponse.json();
      const unitPayload = await unitResponse.json();
      const generalSettingsPayload = await generalSettingsResponse.json();
      if (!groupResponse.ok || !Array.isArray(groupPayload.groups)) {
        throw new Error(groupPayload.error || "Não foi possível carregar os grupos.");
      }
      if (!productResponse.ok || !Array.isArray(productPayload.products)) {
        throw new Error(productPayload.error || "Não foi possível carregar os produtos.");
      }
      if (!operationResponse.ok || !Array.isArray(operationPayload.fiscalOperations)) {
        throw new Error(operationPayload.error || "Não foi possível carregar as operações fiscais.");
      }
      if (!typeResponse.ok || !Array.isArray(typePayload.productTypes)) {
        throw new Error(typePayload.error || "Não foi possível carregar os tipos de produto.");
      }
      if (!unitResponse.ok || !Array.isArray(unitPayload.units)) {
        throw new Error(unitPayload.error || "Não foi possível carregar as unidades.");
      }
      if (!generalSettingsResponse.ok || !Array.isArray(generalSettingsPayload.settings)) {
        throw new Error(generalSettingsPayload.error || "Não foi possível carregar as configurações gerais.");
      }
      groups = groupPayload.groups;
      products = productPayload.products;
      fiscalOperations = operationPayload.fiscalOperations.filter(({ typeFiscalOperation }) => typeFiscalOperation === "exit");
      productTypes = typePayload.productTypes;
      units = unitPayload.units;
      allowNegativeStock = Boolean(
        generalSettingsPayload.settings.find(({ keyGeneralSetting }) => keyGeneralSetting === "allowNegativeStock")
          ?.booleanValueGeneralSetting
      );
      const screenProductType = getScreenProductType();
      if (!newProductDraft.idProductTypeProduct && screenProductType) {
        newProductDraft.idProductTypeProduct = String(screenProductType.idProductType);
      }
      if (!newProductDraft.idUnitProduct && getDefaultUnit()) {
        newProductDraft.idUnitProduct = String(getDefaultUnit().idUnit);
      }
      if (!newProductDraft.idFiscalOperationSaleProduct && getDefaultFiscalOperation()) {
        newProductDraft.idFiscalOperationSaleProduct = String(getDefaultFiscalOperation().idFiscalOperation);
      }
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
          pdvCodeProduct: formData.get("pdvCodeProduct") || null,
          idGroup: Number(formData.get("idGroup")),
          idFiscalOperationSaleProduct: formData.get("idFiscalOperationSaleProduct") ? Number(formData.get("idFiscalOperationSaleProduct")) : null,
          idProductTypeProduct: formData.get("idProductTypeProduct") ? Number(formData.get("idProductTypeProduct")) : null,
          idUnitProduct: formData.get("idUnitProduct") ? Number(formData.get("idUnitProduct")) : null,
          ncmProduct: formData.get("ncmProduct") || null,
          cestProduct: formData.get("cestProduct") || null,
          priceProduct: normalizeMaskedNumber(formData.get("priceProduct")),
          stockQuantityProduct: formData.get("stockQuantityProduct")
            ?? (productId ? editingProduct?.stockQuantityProduct : newProductDraft.stockQuantityProduct)
            ?? "0",
          controlsStockProduct: formData.get("controlsStockProduct") === "on",
          isFractionalProduct: formData.get("isFractionalProduct") === "on",
          printsKitchenProduct: formData.get("printsKitchenProduct") === "on",
          showsInPdvProduct: formData.get("showsInPdvProduct") === "on"
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

  const updateProductPdvVisibility = async (idProduct, showsInPdvProduct) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/products/pdv-status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idProduct, showsInPdvProduct })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível alterar a exibição do produto no PDV.");
      message = showsInPdvProduct ? "Produto exibido no PDV." : "Produto ocultado do PDV.";
      await load();
    } catch (visibilityError) {
      error = visibilityError instanceof Error ? visibilityError.message : "Falha ao alterar a exibição do produto no PDV.";
      render();
    }
  };

  render();
  void load();
  return root;
}
