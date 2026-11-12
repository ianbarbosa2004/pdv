import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { bindFormRowPreview } from "../ui/form-row-preview.js";
import { bindProductNavigation, renderProductNavigation } from "./product-navigation.js";
import {
  bindNumberMasks,
  formatMaskedNumber,
  normalizeMaskedNumber
} from "../ui/number-mask.js";
import { clearRenderedFeedback, createFeedbackTimer, renderSuccessFeedback } from "../ui/feedback.js";
import { apiFetch, getApiUrl } from "../shared/api.js";
import { confirmAction } from "../ui/confirmation-modal.js";
import { buildDuplicatedProductDraft } from "../shared/product.js";
import { normalizePrintPlace } from "../shared/print-place.js";

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
  isFractionalProduct
    ? String(value ?? "0") || "0"
    : formatIntegerStock(value ?? "0") || "0";

const normalizeSku = (value) => String(value ?? "").trim().toUpperCase();
const normalizePackageQuantity = (value) => {
  const normalizedValue = String(value ?? "").trim();
  return !normalizedValue || normalizedValue.toLowerCase() === "undefined" || normalizedValue.toLowerCase() === "null"
    ? "1"
    : normalizedValue;
};

export function createCatalogScreen({
  title = "Produtos",
  listTitle = title,
  productTypeDescription = "Mercadoria para Revenda",
  navigationActive = "products",
  singularLabel = "produto",
  createFormTitle = `Novo ${singularLabel}`,
  editFormTitle = `Editar ${singularLabel}`,
  skuPrefix = "PROD-",
  defaultControlsStock = true,
  defaultIsFractionalProduct = false,
  defaultShowsInPdv = true,
  defaultFiscalOperation = true,
  defaultFiscalOperationDescription = "Revenda de mercadorias",
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
  onPaymentMethods,
  initialProductId = null
}) {
  const root = document.createElement("main");
  let groups = [];
  let products = [];
  let fiscalOperations = [];
  let productTypes = [];
  let units = [];
  let physicalStates = [];
  let allowNegativeStock = false;
  let loading = true;
  let error = "";
  let message = "";
  let submitting = false;
  let editingProduct = null;
  const scheduleMessageClear = createFeedbackTimer();
  let ncms = [];
  let ncmsLoading = false;
  let ncmLoadError = "";
  let ncmLoadPromise = null;
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
    idPhysicalStateProduct: "",
    idUnitProduct: "",
    priceProduct: "0,00",
    costPriceProduct: "0,00",
    stockQuantityProduct: "0",
    packageQuantityProduct: "1",
    controlsStockProduct: defaultControlsStock,
    isBuffetProduct: false,
    isFractionalProduct: defaultIsFractionalProduct,
    printsPlace: "Não Imprimir",
    showsInPdvProduct: defaultShowsInPdv,
    isActiveProduct: true
  };
  let ncmLookupOpen = false;
  let ncmLookupTerm = "";
  let ncmLookupField = "code";
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
      const numericKeys = new Set(["priceProduct", "costPriceProduct", "stockQuantityProduct"]);
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
    const selectedCode = selectedNcm?.codeNcm || selectedValue || "";
    return `
      <label class="form-field"><span>NCM</span>
        <div class="catalog-lookup-field">
          <input name="ncmProduct" value="${escapeHtml(selectedCode)}" placeholder="Não informado" readonly />
          <button class="catalog-lookup-button" type="button" data-open-ncm title="Consultar NCM" aria-label="Consultar NCM"><i data-lucide="search"></i></button>
          <span class="catalog-lookup-description">${escapeHtml(selectedNcm?.descriptionNcm || "Nenhum NCM selecionado")}</span>
        </div>
      </label>
    `;
  };

  const renderCestOptions = (selectedValue) =>
    `<option value="">${cestOptions.length ? "Não informado" : "Nenhum CEST relacionado"}</option>${cestOptions.map((cest) => `<option value="${cest.codeCest}" ${String(selectedValue ?? "") === String(cest.codeCest) ? "selected" : ""}>${escapeHtml(cest.codeCest)} - ${escapeHtml(cest.descriptionCest)}</option>`).join("")}`;

  const captureNewProductDraft = (currentFormData = null) => {
    const form = root.querySelector("[data-product-form]");
    const formData = currentFormData || (form ? new FormData(form) : null);
    if (!formData) return;
    newProductDraft = {
      nameProduct: String(formData.get("nameProduct") ?? ""),
      skuProduct: normalizeSku(formData.get("skuProduct")),
      pdvCodeProduct: String(formData.get("pdvCodeProduct") ?? ""),
      idGroup: String(formData.get("idGroup") ?? ""),
      idFiscalOperationSaleProduct: String(formData.get("idFiscalOperationSaleProduct") ?? ""),
      idProductTypeProduct: String(formData.get("idProductTypeProduct") ?? ""),
      idPhysicalStateProduct: String(formData.get("idPhysicalStateProduct") ?? ""),
      idUnitProduct: String(formData.get("idUnitProduct") ?? ""),
      packageQuantityProduct: String(formData.get("packageQuantityProduct") ?? "1"),
      priceProduct: String(formData.get("priceProduct") ?? ""),
      costPriceProduct: String(formData.get("costPriceProduct") ?? ""),
      stockQuantityProduct: String(
        formData.get("stockQuantityProduct") ?? newProductDraft.stockQuantityProduct ?? "0"
      ) || "0",
      controlsStockProduct: formData.get("controlsStockProduct") === "on",
      isBuffetProduct: formData.get("isBuffetProduct") === "on",
      isFractionalProduct: formData.get("isFractionalProduct") === "on",
      printsPlace: formData.get("printsPlace") || "Não Imprimir",
      showsInPdvProduct: formData.get("showsInPdvProduct") === "on",
      isActiveProduct: newProductDraft.isActiveProduct !== false
    };
  };

  const renderProductTypeOptions = (selectedValue) =>
    `<option value="">Selecione</option>${productTypes.map((type) =>
      `<option value="${type.idProductType}" ${String(selectedValue ?? "") === String(type.idProductType) ? "selected" : ""}>${escapeHtml(type.descriptionProductType)}</option>`
    ).join("")}`;

  const renderPhysicalStateOptions = (selectedValue) =>
    `<option value="">Selecione</option>${physicalStates.map((state) =>
      `<option value="${state.idPhysicalState}" ${String(selectedValue ?? "") === String(state.idPhysicalState) ? "selected" : ""}>${escapeHtml(state.namePhysicalState)}</option>`
    ).join("")}`;

  const renderUnitOptions = (selectedValue) =>
    `<option value="">Selecione</option>${units.filter((unit) => Number(unit.isTaxableUnit) === 1).map((unit) =>
      `<option value="${unit.idUnit}" ${String(selectedValue ?? "") === String(unit.idUnit) ? "selected" : ""}>${escapeHtml(unit.codeUnit)} - ${escapeHtml(unit.descriptionUnit)}</option>`
    ).join("")}`;

  const renderFiscalOperationOptions = (selectedValue) =>
    `<option value="">Não informado</option>${fiscalOperations.map((operation) =>
      `<option value="${operation.idFiscalOperation}" ${String(selectedValue ?? "") === String(operation.idFiscalOperation) ? "selected" : ""}>${escapeHtml(operation.descriptionFiscalOperation)}</option>`
    ).join("")}`;

  const getDefaultProductType = () =>
    productTypes.find(({ descriptionProductType }) =>
      ["MERCADORIA PARA REVENDA", "REVENDA DE MERCADORIAS"].includes(
        descriptionProductType.toLocaleUpperCase("pt-BR")
      )
    ) || productTypes[0];

  const getScreenProductType = () =>
    productTypes.find(({ descriptionProductType }) =>
      descriptionProductType.toLocaleUpperCase("pt-BR") === productTypeDescription.toLocaleUpperCase("pt-BR")
    ) || getDefaultProductType();

  const isNonSaleCatalog = ["MATÉRIA-PRIMA", "EMBALAGEM", "MATERIAL DE USO E CONSUMO"]
    .includes(productTypeDescription.toLocaleUpperCase("pt-BR"));
  const isRawMaterialsCatalog =
    productTypeDescription.toLocaleUpperCase("pt-BR") === "MATÉRIA-PRIMA";
  const canConfigurePrintPlace = [
    "MERCADORIA PARA REVENDA",
    "PRODUTO ACABADO",
    "PRODUTOS ACABADOS"
  ].includes(productTypeDescription.toLocaleUpperCase("pt-BR"));

  const renderCostField = (product, isEdit = false) => {
    const costValue = isEdit
      ? formatMaskedNumber(product.costPriceProduct ?? product.priceProduct)
      : product.costPriceProduct;
    return `<label class="form-field"><span>Preço de custo</span><input name="costPriceProduct" data-number-mask inputmode="decimal" required value="${escapeHtml(costValue)}" /></label>`;
  };

  const renderSalePriceField = (product, isEdit = false) => {
    const saleValue = isEdit ? formatMaskedNumber(product.priceProduct) : product.priceProduct;
    return `<label class="form-field"><span>Preço de venda</span><input name="priceProduct" data-number-mask inputmode="decimal" required value="${escapeHtml(saleValue)}" /></label>`;
  };

  const getDefaultUnit = () =>
    units.find(({ codeUnit, isTaxableUnit }) => codeUnit === "UN" && Number(isTaxableUnit) === 1)
      || units.find(({ isTaxableUnit }) => Number(isTaxableUnit) === 1);

  const getDefaultFiscalOperation = () =>
    defaultFiscalOperation &&
    fiscalOperations.find(({ descriptionFiscalOperation }) =>
      String(descriptionFiscalOperation).trim().toLocaleLowerCase("pt-BR")
        === defaultFiscalOperationDescription.trim().toLocaleLowerCase("pt-BR")
    );

  const resetNewProductDraft = () => {
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
      idPhysicalStateProduct: "",
      idUnitProduct: "",
      packageQuantityProduct: "1",
      priceProduct: "0,00",
      costPriceProduct: "0,00",
      stockQuantityProduct: "0",
      controlsStockProduct: defaultControlsStock,
      isBuffetProduct: false,
      isFractionalProduct: defaultIsFractionalProduct,
      printsPlace: "Não Imprimir",
      showsInPdvProduct: defaultShowsInPdv,
      isActiveProduct: true
    };
    newNcmProduct = "";
    newCestProduct = "";
    cestOptions = [];
  };

  const duplicateProduct = (product) => {
    if (!product) return;
    editingProduct = null;
    newProductDraft = {
      ...buildDuplicatedProductDraft(product, {
        existingNames: products.map(({ nameProduct }) => nameProduct)
      }),
      priceProduct: formatMaskedNumber(product.priceProduct),
      costPriceProduct: formatMaskedNumber(product.costPriceProduct)
    };
    newNcmProduct = product.ncmProduct || "";
    newCestProduct = product.cestProduct || "";
    cestOptions = [];
    error = "";
    message = "";
    render();
    void loadCestOptions(newNcmProduct);
    root.querySelector("[data-product-form] [name='nameProduct']")?.focus();
  };

  const isStockControlled = (product) =>
    Number(product.controlsStockProduct) !== 0;

  const renderStockInput = (product, label) => {
    const stockControlled = isStockControlled(product);
    const value = formatStockForInput(product.stockQuantityProduct, product.isFractionalProduct);
    return `
      <label class="form-field"><span>${label}</span>
        <input name="stockQuantityProduct" type="${product.isFractionalProduct ? "text" : "number"}" inputmode="decimal" ${allowNegativeStock ? "" : 'min="0"'} step="${product.isFractionalProduct ? "0.001" : "1"}" ${stockControlled ? "" : "readonly disabled"} required value="${escapeHtml(value)}" />
      </label>
    `;
  };

  const renderPrintPlaceField = (product) => canConfigurePrintPlace
    ? `<label class="form-field"><span>Local de impressão</span><select name="printsPlace">
        ${["Não Imprimir", "Bar", "Copa", "Cozinha"].map((place) =>
          `<option value="${place}" ${normalizePrintPlace(product.printsPlace) === place ? "selected" : ""}>${place}</option>`
        ).join("")}
      </select></label>`
    : "";

  const renderProductFlags = (product = newProductDraft) => `
    <div class="classic-form-grid">
      <label class="form-field checkbox-field"><span>Controla estoque</span><input name="controlsStockProduct" type="checkbox" ${Number(product.controlsStockProduct) !== 0 ? "checked" : ""} /></label>
      <label class="form-field checkbox-field"><span>Produto Buffet</span><input name="isBuffetProduct" type="checkbox" ${product.isBuffetProduct ? "checked" : ""} /></label>
      <label class="form-field checkbox-field"><span>Produto fracionado</span><input name="isFractionalProduct" type="checkbox" ${product.isFractionalProduct ? "checked" : ""} /></label>
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
        ${renderSuccessFeedback(message, escapeHtml)}
        <form class="classic-form-panel" data-product-form>
          <div class="classic-panel-header">${createFormTitle}</div>
          <div class="classic-form-body">
          <label class="form-field"><span>Nome</span><input name="nameProduct" required maxlength="180" value="${escapeHtml(newProductDraft.nameProduct)}" /></label>
          <div class="classic-form-grid">
            <label class="form-field"><span>SKU</span><input name="skuProduct" data-uppercase-mask required maxlength="64" value="${escapeHtml(normalizeSku(newProductDraft.skuProduct))}" /></label>
            <label class="form-field"><span>Tipo de produto</span>
              <input type="hidden" name="idProductTypeProduct" value="${escapeHtml(newProductDraft.idProductTypeProduct)}" />
              <select data-product-type-display disabled>${renderProductTypeOptions(newProductDraft.idProductTypeProduct)}</select>
            </label>
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
            <label class="form-field"><span class="field-label-with-help">Conteúdo por unidade <button class="field-help-trigger" type="button" aria-label="Ajuda sobre conteúdo por unidade" aria-describedby="new-package-quantity-help">?<span class="field-help-tooltip" id="new-package-quantity-help" role="tooltip">Quantidade da unidade tributável contida em uma embalagem deste produto. Ex.: uma garrafa com 750 ml informa 750.</span></button></span><input name="packageQuantityProduct" data-number-mask inputmode="decimal" min="0.001" required value="${escapeHtml(normalizePackageQuantity(newProductDraft.packageQuantityProduct))}" /></label>
            <label class="form-field"><span>Unidade tributável</span><select name="idUnitProduct" required>${renderUnitOptions(newProductDraft.idUnitProduct)}</select></label>
          </div>
          ${isRawMaterialsCatalog ? `<label class="form-field"><span>Estado físico</span><select name="idPhysicalStateProduct" required>${renderPhysicalStateOptions(newProductDraft.idPhysicalStateProduct)}</select></label>` : ""}
          <div class="classic-form-grid">
            ${renderNcmField(newNcmProduct)}
            <label class="form-field"><span>CEST</span><select name="cestProduct" ${cestOptions.length ? "" : "disabled"}>${renderCestOptions(newCestProduct)}</select></label>
          </div>
          ${isNonSaleCatalog ? "" : `<div class="classic-form-grid product-sale-price-row">${renderSalePriceField(newProductDraft)}</div>`}
          <div class="classic-form-grid product-cost-stock-row">
            ${renderCostField(newProductDraft)}
            ${renderStockInput(newProductDraft, "Estoque inicial")}
          </div>
          <div class="classic-form-grid">${renderPrintPlaceField(newProductDraft)}</div>
          ${renderProductFlags()}
          ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}
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
            <span>${escapeHtml(listTitle)}</span>
            <input class="classic-list-search" name="productSearch" data-search dir="ltr" type="search" placeholder="Pesquisar..." aria-label="Pesquisar produtos" value="${escapeHtml(searchTerm)}" />
          </div>
          <div class="classic-grid-wrapper">
            ${
              loading
                ? '<p class="classic-empty">Carregando catálogo...</p>'
                : getVisibleProducts().length
                  ? `<table class="classic-table">
                      <thead><tr>
                        ${[
                          ["pdvCodeProduct", "# PDV", "product-pdv-column"],
                          ["nameProduct", "Produto", "product-name-column"],
                          ["descriptionGroup", "Grupo", "product-group-column"],
                          ...(!isNonSaleCatalog
                            ? [["priceProduct", "Preço de venda", "product-sale-price-column"]]
                            : []),
                          ["costPriceProduct", "Custo", "product-cost-column"]
                        ].map(([key, label, columnClass]) => `
                          <th class="${columnClass}" aria-sort="${sortState.key === key ? (sortState.direction === "asc" ? "ascending" : "descending") : "none"}">
                            <button class="table-sort-button" type="button" data-sort="${key}">${label} <span aria-hidden="true">${sortIndicator(key)}</span></button>
                          </th>
                        `).join("")}
                        <th class="product-visibility-column">PDV</th><th class="product-status-column">Status</th><th class="actions-column">Ações</th>
                      </tr></thead>
                      <tbody>${getVisibleProducts().map((product) => `
                        <tr class="${product.isActiveProduct ? "" : "is-inactive"}" data-view-record="${escapeHtml(JSON.stringify(product))}">
                          <td class="product-pdv-column">${escapeHtml(product.pdvCodeProduct || "—")}</td>
                          <td class="product-name-column">${escapeHtml(product.nameProduct)}</td>
                          <td class="product-group-column">${escapeHtml(product.descriptionGroup || "Sem grupo")}</td>
                          ${!isNonSaleCatalog
                            ? `<td class="product-sale-price-column">R$ ${Number(product.priceProduct).toFixed(2).replace(".", ",")}</td>`
                            : ""}
                          <td class="product-cost-column">R$ ${Number(product.costPriceProduct ?? 0).toFixed(2).replace(".", ",")}</td>
                          <td class="product-visibility-column">
                            <button class="status-toggle ${Number(product.showsInPdvProduct) ? "is-active" : "is-inactive"}" type="button" role="switch" aria-checked="${Number(product.showsInPdvProduct) ? "true" : "false"}" data-pdv-status-id="${product.idProduct}" aria-label="Alternar exibição de ${escapeHtml(product.nameProduct)} no PDV">
                              <span class="status-toggle-track"><span class="status-toggle-thumb"></span></span>
                              <span class="status-toggle-label">${Number(product.showsInPdvProduct) ? "Sim" : "Não"}</span>
                            </button>
                          </td>
                          <td class="product-status-column">
                            <button class="status-toggle ${product.isActiveProduct ? "is-active" : "is-inactive"}" type="button" role="switch" aria-checked="${product.isActiveProduct ? "true" : "false"}" data-status-id="${product.idProduct}" aria-label="Alternar status do produto ${escapeHtml(product.nameProduct)}">
                              <span class="status-toggle-track"><span class="status-toggle-thumb"></span></span>
                              <span class="status-toggle-label">${product.isActiveProduct ? "Ativo" : "Inativo"}</span>
                            </button>
                          </td>
                          <td class="actions-column">
                            <button class="icon-button edit" type="button" title="Editar ${escapeHtml(singularLabel)}" aria-label="Editar ${escapeHtml(singularLabel)}" data-edit="${product.idProduct}"><i data-lucide="pencil"></i></button>
                            <button class="icon-button" type="button" title="Duplicar ${escapeHtml(singularLabel)}" aria-label="Duplicar ${escapeHtml(singularLabel)}" data-duplicate="${product.idProduct}"><i data-lucide="copy"></i></button>
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
                  <label class="form-field"><span>SKU</span><input name="skuProduct" data-uppercase-mask required maxlength="64" value="${escapeHtml(normalizeSku(editingProduct.skuProduct))}" /></label>
                  <label class="form-field"><span>Tipo de produto</span>
                    <input type="hidden" name="idProductTypeProduct" value="${escapeHtml(editingProduct.idProductTypeProduct)}" />
                    <select data-product-type-display disabled>${renderProductTypeOptions(editingProduct.idProductTypeProduct)}</select>
                  </label>
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
                  <label class="form-field"><span class="field-label-with-help">Conteúdo por unidade <button class="field-help-trigger" type="button" aria-label="Ajuda sobre conteúdo por unidade" aria-describedby="edit-package-quantity-help">?<span class="field-help-tooltip" id="edit-package-quantity-help" role="tooltip">Quantidade da unidade tributável contida em uma embalagem deste produto. Ex.: uma garrafa com 750 ml informa 750.</span></button></span><input name="packageQuantityProduct" data-number-mask inputmode="decimal" min="0.001" required value="${escapeHtml(normalizePackageQuantity(editingProduct.packageQuantityProduct))}" /></label>
                  <label class="form-field"><span>Unidade tributável</span><select name="idUnitProduct" required>${renderUnitOptions(editingProduct.idUnitProduct)}</select></label>
                </div>
                ${isRawMaterialsCatalog ? `<label class="form-field"><span>Estado físico</span><select name="idPhysicalStateProduct" required>${renderPhysicalStateOptions(editingProduct.idPhysicalStateProduct)}</select></label>` : ""}
                <div class="classic-form-grid">
                  ${renderNcmField(editingProduct.ncmProduct)}
                  <label class="form-field"><span>CEST</span><select name="cestProduct" ${cestOptions.length ? "" : "disabled"}>${renderCestOptions(editingProduct.cestProduct)}</select></label>
                </div>
                ${isNonSaleCatalog ? "" : `<div class="classic-form-grid product-sale-price-row">${renderSalePriceField(editingProduct, true)}</div>`}
                <div class="classic-form-grid product-cost-stock-row">
                  ${renderCostField(editingProduct, true)}
                  ${renderStockInput(editingProduct, "Estoque")}
                </div>
                <div class="classic-form-grid">${renderPrintPlaceField(editingProduct)}</div>
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
              ${ncmsLoading
                ? '<p class="classic-empty">Carregando NCMs...</p>'
                : ncmLoadError
                  ? `<div class="classic-empty error-state"><p>${escapeHtml(ncmLoadError)}</p><button class="classic-button" data-retry-ncms type="button">Tentar novamente</button></div>`
                  : lookupRows.length ? `
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
    root.querySelectorAll(".field-help-trigger").forEach((trigger) => {
      trigger.addEventListener("pointerenter", () => trigger.classList.add("is-help-visible"));
      trigger.addEventListener("pointerleave", () => trigger.classList.remove("is-help-visible"));
      trigger.addEventListener("focus", () => trigger.classList.add("is-help-visible"));
      trigger.addEventListener("blur", () => trigger.classList.remove("is-help-visible"));
    });
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
        ncmLookupField = "code";
        render();
        root.querySelector("[data-ncm-lookup-search]")?.focus();
        void loadNcms();
      });
    });
    root.querySelector("[data-retry-ncms]")?.addEventListener("click", () => void loadNcms());
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
    root.querySelectorAll("[data-close-ncm]").forEach((button) => {
      button.addEventListener("click", () => {
        ncmLookupOpen = false;
        render();
      });
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
    root.querySelectorAll("[data-duplicate]").forEach((button) => {
      button.addEventListener("click", () => {
        const product = products.find(({ idProduct }) => String(idProduct) === button.dataset.duplicate);
        duplicateProduct(product);
      });
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
      editingProduct = null;
      resetNewProductDraft();
      error = "";
      message = "";
      render();
    });
    root.querySelector("[data-product-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void createProduct(new FormData(event.currentTarget));
    });
    root.querySelectorAll("[data-uppercase-mask]").forEach((input) => {
      input.addEventListener("input", (event) => {
        const field = event.currentTarget;
        const start = field.selectionStart;
        const end = field.selectionEnd;
        const uppercaseValue = field.value.toUpperCase();
        if (field.value !== uppercaseValue) field.value = uppercaseValue;
        if (start !== null && end !== null) field.setSelectionRange(start, end);
      });
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
    root.querySelectorAll("[data-cancel-edit]").forEach((button) => {
      button.addEventListener("click", () => {
        editingProduct = null;
        error = "";
        render();
      });
    });
    root.querySelector("[data-modal-backdrop]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) {
        editingProduct = null;
        error = "";
        render();
      }
    });
  };

  const loadNcms = async () => {
    if (ncms.length || ncmLoadPromise) return ncmLoadPromise;
    ncmsLoading = true;
    ncmLoadError = "";
    render();
    ncmLoadPromise = apiFetch(`${getApiUrl()}/api/ncm-cest/ncms`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !Array.isArray(payload.ncms)) {
          throw new Error(payload.error || "Não foi possível carregar os NCMs.");
        }
        ncms = payload.ncms;
      })
      .catch((loadError) => {
        ncmLoadError = loadError instanceof Error ? loadError.message : "Falha ao carregar os NCMs.";
      })
      .finally(() => {
        ncmsLoading = false;
        ncmLoadPromise = null;
        render();
      });
    return ncmLoadPromise;
  };

  const deleteProduct = async (id) => {
    const confirmed = await confirmAction({
      title: "Excluir produto",
      message: "Excluir este produto definitivamente?",
      detail: "Esta ação não poderá ser desfeita.",
      confirmLabel: "Excluir produto"
    });
    if (!confirmed) return;
    try {
      const response = await apiFetch(`${getApiUrl()}/api/products`, {
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
      scheduleMessageClear(() => {
        message = "";
        clearRenderedFeedback(root);
      });
    } catch (deleteError) {
      error = deleteError instanceof Error ? deleteError.message : "Falha ao excluir o produto.";
      render();
    }
  };

  const load = async () => {
    loading = true;
    render();
    try {
      const [groupResponse, productResponse, operationResponse, typeResponse, unitResponse, physicalStateResponse, generalSettingsResponse] = await Promise.all([
        apiFetch(`${getApiUrl()}/api/groups?includeInactive=1`),
        apiFetch(`${getApiUrl()}/api/products?includeInactive=1&productType=${encodeURIComponent(productTypeDescription)}`),
        apiFetch(`${getApiUrl()}/api/fiscal-operations`),
        apiFetch(`${getApiUrl()}/api/product-types`),
        apiFetch(`${getApiUrl()}/api/units`),
        isRawMaterialsCatalog
          ? apiFetch(`${getApiUrl()}/api/physical-states`)
          : Promise.resolve({ ok: true, json: async () => ({ physicalStates: [] }) }),
        apiFetch(`${getApiUrl()}/api/general-settings`)
      ]);
      const groupPayload = await groupResponse.json();
      const productPayload = await productResponse.json();
      const operationPayload = await operationResponse.json();
      const typePayload = await typeResponse.json();
      const unitPayload = await unitResponse.json();
      const physicalStatePayload = await physicalStateResponse.json();
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
      if (!physicalStateResponse.ok || !Array.isArray(physicalStatePayload.physicalStates)) {
        throw new Error(physicalStatePayload.error || "Não foi possível carregar os estados físicos.");
      }
      if (!generalSettingsResponse.ok || !Array.isArray(generalSettingsPayload.settings)) {
        throw new Error(generalSettingsPayload.error || "Não foi possível carregar as configurações gerais.");
      }
      groups = groupPayload.groups;
      products = productPayload.products;
      if (initialProductId && !editingProduct) {
        editingProduct = products.find(({ idProduct }) => String(idProduct) === String(initialProductId)) || null;
      }
      fiscalOperations = operationPayload.fiscalOperations.filter(({ typeFiscalOperation }) => typeFiscalOperation === "exit");
      productTypes = typePayload.productTypes;
      units = unitPayload.units;
      physicalStates = physicalStatePayload.physicalStates;
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
        const response = await apiFetch(`${getApiUrl()}/api/ncm-cest/options?ncm=${encodeURIComponent(ncmCode)}`);
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
    if (!productId) captureNewProductDraft(formData);
    submitting = true;
    error = "";
    message = "";
    render();
    try {
      const response = await apiFetch(`${getApiUrl()}/api/products`, {
        method: productId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(productId ? { idProduct: productId } : {}),
          nameProduct: formData.get("nameProduct"),
          skuProduct: normalizeSku(formData.get("skuProduct")),
          pdvCodeProduct: productId
            ? editingProduct?.pdvCodeProduct || null
            : formData.get("pdvCodeProduct") || null,
          idGroup: Number(formData.get("idGroup")),
          idFiscalOperationSaleProduct: formData.get("idFiscalOperationSaleProduct") ? Number(formData.get("idFiscalOperationSaleProduct")) : null,
          idProductTypeProduct: formData.get("idProductTypeProduct") ? Number(formData.get("idProductTypeProduct")) : null,
          idPhysicalStateProduct: isRawMaterialsCatalog && formData.get("idPhysicalStateProduct")
            ? Number(formData.get("idPhysicalStateProduct"))
            : null,
          idUnitProduct: formData.get("idUnitProduct") ? Number(formData.get("idUnitProduct")) : null,
          packageQuantityProduct: normalizeMaskedNumber(formData.get("packageQuantityProduct") || "1"),
          ncmProduct: formData.get("ncmProduct") || null,
          cestProduct: formData.get("cestProduct") || null,
          priceProduct: isNonSaleCatalog
            ? normalizeMaskedNumber(formData.get("costPriceProduct"))
            : normalizeMaskedNumber(formData.get("priceProduct")),
          costPriceProduct: normalizeMaskedNumber(formData.get("costPriceProduct")),
          stockQuantityProduct: formData.get("stockQuantityProduct")
            ?? (productId ? editingProduct?.stockQuantityProduct : newProductDraft.stockQuantityProduct)
            ?? "0",
          controlsStockProduct: formData.get("controlsStockProduct") === "on",
          isBuffetProduct: formData.get("isBuffetProduct") === "on",
          isFractionalProduct: formData.get("isFractionalProduct") === "on",
          printsPlace: formData.get("printsPlace") || "Não Imprimir",
          showsInPdvProduct: formData.get("showsInPdvProduct") === "on",
          ...(!productId
            ? { isActiveProduct: newProductDraft.isActiveProduct !== false }
            : {})
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível cadastrar o produto.");
      }
      const wasEditing = Boolean(productId);
      message = wasEditing ? "Produto alterado com sucesso." : "Produto cadastrado com sucesso.";
      if (!wasEditing) resetNewProductDraft();
      editingProduct = null;
      await load();
      if (wasEditing) root.__PDV_FORM_PREVIEW_PENDING__ = products.find((product) => String(product.idProduct) === String(productId));
      scheduleMessageClear(() => {
        message = "";
        clearRenderedFeedback(root);
      });
    } catch (createError) {
      error = createError instanceof Error ? createError.message : "Falha ao cadastrar produto.";
    } finally {
      submitting = false;
      render();
    }
  };

  const updateProductStatus = async (idProduct, isActiveProduct) => {
    try {
      const response = await apiFetch(`${getApiUrl()}/api/products/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idProduct, isActiveProduct })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível alterar o status do produto.");
      message = isActiveProduct ? "Produto ativado com sucesso." : "Produto inativado com sucesso.";
      await load();
      scheduleMessageClear(() => {
        message = "";
        clearRenderedFeedback(root);
      });
    } catch (statusError) {
      error = statusError instanceof Error ? statusError.message : "Falha ao alterar o status do produto.";
      render();
    }
  };

  const updateProductPdvVisibility = async (idProduct, showsInPdvProduct) => {
    try {
      const response = await apiFetch(`${getApiUrl()}/api/products/pdv-status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idProduct, showsInPdvProduct })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível alterar a exibição do produto no PDV.");
      message = showsInPdvProduct ? "Produto exibido no PDV." : "Produto ocultado do PDV.";
      await load();
      scheduleMessageClear(() => {
        message = "";
        clearRenderedFeedback(root);
      });
    } catch (visibilityError) {
      error = visibilityError instanceof Error ? visibilityError.message : "Falha ao alterar a exibição do produto no PDV.";
      render();
    }
  };

  render();
  void load();
  return root;
}
