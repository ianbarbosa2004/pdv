import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { apiFetch, getApiUrl  } from "../shared/api.js";
import { normalizePrintPlace } from "../shared/print-place.js";
import { confirmAction } from "../ui/confirmation-modal.js";
import { getContextualNavigationItems, renderContextualNavigationItems } from "../ui/contextual-navigation.js";
import { resolveNavigationHandler } from "../ui/navigation-routing.js";
import { getNavigationPresentation } from "../ui/navigation-intro.js";
import { buildViewsGroupTree } from "./views-model.js";
import { bindProductList, filterProductList, renderProductList, sortProductList } from "./product-list-view.js";
import { bindNumberMasks, formatMaskedNumber } from "../ui/number-mask.js";
import {
  formatProductStockForInput,
  normalizeProductPackageQuantity
} from "../shared/product.js";

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatMoney = (value) =>
  `R$ ${Number(value || 0).toFixed(2).replace(".", ",")}`;

const parseMoney = (value) =>
  Number(String(value ?? "0").replace(/\./g, "").replace(",", ".")) || 0;

const renderPhysicalStateOptions = (physicalStates, selectedId) =>
  `<option value="">Sem estado físico</option>${physicalStates.map((state) =>
    `<option value="${state.idPhysicalState}" ${String(state.idPhysicalState) === String(selectedId) ? "selected" : ""}>${escapeHtml(state.namePhysicalState)}</option>`
  ).join("")}`;

const viewsNavigation = [
  ["groups-products", "Grupos x Produtos"],
  ["no-cost", "Sem Custo"],
  ["no-physical-state", "Sem Estado Físico"],
  ["recipe-revisions", "Revisões de Fichas"]
];

const renderViewsNavigation = (active) => `
  <div class="classic-toolbar screen-context-bar views-context-bar" aria-label="Navegação contextual">
    ${renderContextualNavigationItems(getContextualNavigationItems("views", viewsNavigation), active, "views-nav")}
  </div>
`;

const bindViewsNavigation = (root, handlers) => {
  root.querySelectorAll("[data-views-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      const route = button.dataset.viewsNav;
      const handler = resolveNavigationHandler(handlers, route)
        || resolveNavigationHandler(window.__PDV_NAVIGATION_HANDLERS__, route);
      handler?.();
    });
  });
};

const renderEditor = (product, groups, physicalStates, fiscalOperations, units, productTypes, cestOptions, submitting, error, ncms = []) => {
  const selectedNcm = ncms.find((ncm) => String(ncm.codeNcm) === String(product.ncmProduct || ""));
  return `
  <div class="classic-modal-backdrop" data-product-editor-backdrop>
    <section class="classic-modal product-edit-modal" role="dialog" aria-modal="true" aria-labelledby="views-product-editor-title">
      <div class="classic-panel-header modal-panel-header">
        <span id="views-product-editor-title">Editar produto</span>
        <button class="modal-close-button" data-cancel-product-edit type="button" aria-label="Fechar" title="Fechar"><i data-lucide="x"></i></button>
      </div>
      <form data-views-product-form>
        <div class="classic-form-body">
          <label class="form-field"><span>Nome</span><input name="nameProduct" required maxlength="180" value="${escapeHtml(product.nameProduct)}" /></label>
          <div class="classic-form-grid">
            <label class="form-field"><span>SKU</span><input name="skuProduct" data-uppercase-mask required maxlength="64" value="${escapeHtml(String(product.skuProduct || "").toUpperCase())}" /></label>
            <label class="form-field"><span>Tipo de produto</span>
              <input type="hidden" name="idProductTypeProduct" value="${escapeHtml(product.idProductTypeProduct)}" />
              <select data-product-type-display disabled>${productTypes.map((type) =>
                `<option value="${type.idProductType}" ${String(type.idProductType) === String(product.idProductTypeProduct) ? "selected" : ""}>${escapeHtml(type.descriptionProductType)}</option>`
              ).join("")}</select>
            </label>
          </div>
          <div class="classic-form-grid">
            <label class="form-field"><span>Grupo</span><select name="idGroup" required>${groups.map((group) =>
              `<option value="${group.idGroup}" ${String(group.idGroup) === String(product.idGroup) ? "selected" : ""}>${escapeHtml(group.descriptionGroup)}</option>`
            ).join("")}</select></label>
            <label class="form-field"><span>Operação fiscal de venda</span><select name="idFiscalOperationSaleProduct">
              <option value="">Não informado</option>${fiscalOperations.map((operation) =>
                `<option value="${operation.idFiscalOperation}" ${String(operation.idFiscalOperation) === String(product.idFiscalOperationSaleProduct) ? "selected" : ""}>${escapeHtml(operation.descriptionFiscalOperation)}</option>`
              ).join("")}
            </select></label>
          </div>
          <div class="classic-form-grid">
            <label class="form-field"><span class="field-label-with-help">Conteúdo por unidade <button class="field-help-trigger" type="button" aria-label="Ajuda sobre conteúdo por unidade" aria-describedby="views-package-quantity-help">?<span class="field-help-tooltip" id="views-package-quantity-help" role="tooltip">Quantidade da unidade tributável contida em uma embalagem deste produto. Ex.: uma garrafa com 750 ml informa 750.</span></button></span><input name="packageQuantityProduct" data-number-mask="decimal" inputmode="decimal" min="0.001" required value="${escapeHtml(formatMaskedNumber(normalizeProductPackageQuantity(product.packageQuantityProduct)))}" /></label>
            <label class="form-field"><span>Unidade tributável</span><select name="idUnitProduct" required>${units.filter((unit) => Number(unit.isTaxableUnit) === 1).map((unit) =>
              `<option value="${unit.idUnit}" ${String(unit.idUnit) === String(product.idUnitProduct) ? "selected" : ""}>${escapeHtml(unit.codeUnit)} - ${escapeHtml(unit.descriptionUnit)}</option>`
            ).join("")}</select></label>
          </div>
          ${physicalStates ? `<label class="form-field"><span>Estado físico</span><select name="idPhysicalStateProduct" required>${renderPhysicalStateOptions(physicalStates, product.idPhysicalStateProduct)}</select></label>` : ""}
          <div class="classic-form-grid">
            <label class="form-field"><span>NCM</span>
              <div class="catalog-lookup-field">
                <input name="ncmProduct" value="${escapeHtml(product.ncmProduct || "")}" placeholder="Não informado" readonly />
                <button class="catalog-lookup-button" type="button" data-open-ncm title="Consultar NCM" aria-label="Consultar NCM"><i data-lucide="search"></i></button>
                <span class="catalog-lookup-description">${escapeHtml(selectedNcm?.descriptionNcm || "Nenhum NCM selecionado")}</span>
              </div>
            </label>
            <label class="form-field"><span>CEST</span><select name="cestProduct" ${cestOptions.length ? "" : "disabled"}>
              <option value="">${cestOptions.length ? "Não informado" : "Nenhum CEST relacionado"}</option>${cestOptions.map((cest) =>
                `<option value="${cest.codeCest}" ${String(cest.codeCest) === String(product.cestProduct) ? "selected" : ""}>${escapeHtml(cest.codeCest)} - ${escapeHtml(cest.descriptionCest)}</option>`
              ).join("")}
            </select></label>
          </div>
          ${["MATÉRIA-PRIMA", "EMBALAGEM", "MATERIAL DE USO E CONSUMO"].includes(String(product.descriptionProductType || "").toLocaleUpperCase("pt-BR"))
            ? ""
            : `<div class="classic-form-grid product-sale-price-row">
            <label class="form-field"><span>Preço de venda</span><input name="priceProduct" data-number-mask inputmode="decimal" required value="${escapeHtml(formatMaskedNumber(product.priceProduct || "0"))}" /></label>
          </div>`}
          <div class="classic-form-grid product-cost-stock-row">
            <label class="form-field"><span>Preço de custo</span><input name="costPriceProduct" data-number-mask inputmode="decimal" required value="${escapeHtml(formatMaskedNumber(product.costPriceProduct ?? product.priceProduct))}" /></label>
            <label class="form-field"><span>Estoque</span><input name="stockQuantityProduct" type="${Number(product.isFractionalProduct) ? "text" : "number"}" inputmode="decimal" min="0" step="${Number(product.isFractionalProduct) ? "0.001" : "1"}" ${Number(product.controlsStockProduct) ? "" : "readonly disabled"} required value="${escapeHtml(formatProductStockForInput(product.stockQuantityProduct, product.isFractionalProduct))}" /></label>
          </div>
          <div class="classic-form-grid">
            ${["MERCADORIA PARA REVENDA", "PRODUTO ACABADO", "PRODUTOS ACABADOS"].includes(String(product.descriptionProductType || "").toLocaleUpperCase("pt-BR"))
              ? `<label class="form-field"><span>Local de impressão</span><select name="printsPlace">
              ${["Não Imprimir", "Bar", "Copa", "Cozinha"].map((place) =>
                `<option value="${place}" ${normalizePrintPlace(product.printsPlace) === place ? "selected" : ""}>${place}</option>`
              ).join("")}
            </select></label>`
              : ""}
          </div>
          <div class="classic-form-grid">
            <label class="form-field checkbox-field"><span>Controla estoque</span><input name="controlsStockProduct" type="checkbox" ${Number(product.controlsStockProduct) ? "checked" : ""} /></label>
            <label class="form-field checkbox-field"><span>Produto Buffet</span><input name="isBuffetProduct" type="checkbox" ${Number(product.isBuffetProduct) ? "checked" : ""} /></label>
            <label class="form-field checkbox-field"><span>Produto fracionado</span><input name="isFractionalProduct" type="checkbox" ${Number(product.isFractionalProduct) ? "checked" : ""} /></label>
            <label class="form-field checkbox-field"><span>Exibir no PDV</span><input name="showsInPdvProduct" type="checkbox" ${Number(product.showsInPdvProduct) ? "checked" : ""} /></label>
          </div>
          ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}
        </div>
        <div class="classic-form-actions">
          <button class="classic-button primary" type="submit" ${submitting ? "disabled" : ""}>${submitting ? "Salvando..." : "Salvar alterações"}</button>
          <button class="classic-button" data-cancel-product-edit type="button" ${submitting ? "disabled" : ""}>Cancelar</button>
        </div>
      </form>
    </section>
  </div>
`;
};

export function createProductViewsScreen({
  active = "groups-products",
  title = "Grupos x Produtos",
  description = "Organize, pesquise e mantenha os produtos por classe e grupo.",
  showGroups = true,
  productFilter = () => true,
  emptyLabel = "Nenhum produto encontrado.",
  onBack,
  onGroupsProducts,
  onNoCost,
  onRecipeRevisions,
  ...menuHandlers
}) {
  const root = document.createElement("main");
  let groups = [];
  let physicalStates = null;
  let products = [];
  let selectedGroupId = null;
  let searchTerm = "";
  let loading = true;
  let error = "";
  let editorError = "";
  let editingProduct = null;
  let submitting = false;
  let fiscalOperations = [];
  let units = [];
  let productTypes = [];
  let cestOptions = [];
  let ncms = [];
  let ncmsLoading = false;
  let ncmLoadError = "";
  let ncmLoadPromise = null;
  let ncmLookupOpen = false;
  let ncmLookupTerm = "";
  let ncmLookupField = "code";
  let sortState = { key: "nameProduct", direction: "asc" };

  const load = async () => {
    loading = true;
    error = "";
    render();
    try {
      const requests = [
        apiFetch(`${getApiUrl()}/api/products?includeInactive=1`),
        apiFetch(`${getApiUrl()}/api/groups?includeInactive=1`),
        apiFetch(`${getApiUrl()}/api/fiscal-operations`),
        apiFetch(`${getApiUrl()}/api/units`),
        apiFetch(`${getApiUrl()}/api/product-types`)
      ];
      if (active === "no-physical-state") {
        requests.push(apiFetch(`${getApiUrl()}/api/physical-states?includeInactive=1`));
      }
      const [productResponse, groupResponse, fiscalOperationResponse, unitResponse, productTypeResponse, physicalStateResponse] = await Promise.all(requests);
      const productPayload = await productResponse.json();
      const groupPayload = await groupResponse.json();
      const fiscalOperationPayload = await fiscalOperationResponse.json();
      const unitPayload = await unitResponse.json();
      const productTypePayload = await productTypeResponse.json();
      if (!productResponse.ok || !Array.isArray(productPayload.products)) {
        throw new Error(productPayload.error || "Não foi possível carregar os produtos.");
      }
      if (!groupResponse.ok || !Array.isArray(groupPayload.groups)) {
        throw new Error(groupPayload.error || "Não foi possível carregar os grupos.");
      }
      if (!fiscalOperationResponse.ok || !Array.isArray(fiscalOperationPayload.fiscalOperations)) {
        throw new Error(fiscalOperationPayload.error || "Não foi possível carregar as operações fiscais.");
      }
      if (!unitResponse.ok || !Array.isArray(unitPayload.units)) {
        throw new Error(unitPayload.error || "Não foi possível carregar as unidades.");
      }
      if (!productTypeResponse.ok || !Array.isArray(productTypePayload.productTypes)) {
        throw new Error(productTypePayload.error || "Não foi possível carregar os tipos de produto.");
      }
      products = productPayload.products;
      groups = groupPayload.groups;
      fiscalOperations = fiscalOperationPayload.fiscalOperations.filter(({ typeFiscalOperation }) => typeFiscalOperation === "exit");
      units = unitPayload.units;
      productTypes = productTypePayload.productTypes;
      if (active === "no-physical-state") {
        const physicalStatePayload = await physicalStateResponse.json();
        if (!physicalStateResponse.ok || !Array.isArray(physicalStatePayload.physicalStates)) {
          throw new Error(physicalStatePayload.error || "Não foi possível carregar os estados físicos.");
        }
        physicalStates = physicalStatePayload.physicalStates;
      }
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Falha ao carregar os produtos.";
    } finally {
      loading = false;
      render();
    }
  };

  const getVisibleProducts = () => sortProductList(
    filterProductList(products, searchTerm, (product) =>
      productFilter(product)
      && (selectedGroupId === null || String(product.idGroup) === String(selectedGroupId))
    ),
    sortState
  );

  const saveProduct = async (formData) => {
    submitting = true;
    editorError = "";
    render();
    try {
      const response = await apiFetch(`${getApiUrl()}/api/products`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idProduct: editingProduct.idProduct,
          nameProduct: formData.get("nameProduct"),
          skuProduct: String(formData.get("skuProduct") || "").toUpperCase(),
          pdvCodeProduct: formData.get("pdvCodeProduct") || null,
          idGroup: Number(formData.get("idGroup")),
          idFiscalOperationSaleProduct: formData.get("idFiscalOperationSaleProduct") || null,
          idProductTypeProduct: editingProduct.idProductTypeProduct || null,
          idPhysicalStateProduct: formData.get("idPhysicalStateProduct") || editingProduct.idPhysicalStateProduct || null,
          idUnitProduct: formData.get("idUnitProduct") || null,
          packageQuantityProduct: formData.get("packageQuantityProduct") || "1",
          ncmProduct: formData.get("ncmProduct") || null,
          cestProduct: formData.get("cestProduct") || null,
          priceProduct: parseMoney(formData.get("priceProduct") || editingProduct.priceProduct),
          costPriceProduct: parseMoney(formData.get("costPriceProduct")),
          stockQuantityProduct: formData.get("stockQuantityProduct"),
          controlsStockProduct: formData.get("controlsStockProduct") === "on",
          isBuffetProduct: formData.get("isBuffetProduct") === "on",
          isFractionalProduct: formData.get("isFractionalProduct") === "on",
          printsPlace: formData.get("printsPlace") || "Não Imprimir",
          showsInPdvProduct: formData.get("showsInPdvProduct") === "on"
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível alterar o produto.");
      editingProduct = null;
      await load();
    } catch (saveError) {
      editorError = saveError instanceof Error ? saveError.message : "Falha ao alterar o produto.";
      render();
    } finally {
      submitting = false;
    }
  };

  const deleteProduct = async (idProduct) => {
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
        body: JSON.stringify({ idProduct })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível excluir o produto.");
      await load();
    } catch (deleteError) {
      error = deleteError instanceof Error ? deleteError.message : "Falha ao excluir o produto.";
      render();
    }
  };

  const updateProductFlag = async (path, idProduct, value) => {
    try {
      const response = await apiFetch(`${getApiUrl()}${path}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idProduct, [path.includes("pdv-status") ? "showsInPdvProduct" : "isActiveProduct"]: value })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar o produto.");
      await load();
    } catch (updateError) {
      error = updateError instanceof Error ? updateError.message : "Falha ao atualizar o produto.";
      render();
    }
  };

  function render() {
    const tree = buildViewsGroupTree(groups, products);
    const visibleProducts = getVisibleProducts();
    const navigationPresentation = getNavigationPresentation(active, title, description);
    root.className = "catalog-screen views-screen";
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - ${escapeHtml(title)}</strong><span>Operador: Operador</span></header>
      ${renderMainMenu()}
      ${renderViewsNavigation(active)}
      <section class="views-content">
        <div class="views-intro">
          <div class="views-intro-block"><span class="views-intro-label">Views</span><h1>${escapeHtml(navigationPresentation.title)}</h1></div>
          <div class="views-intro-block"><span class="views-intro-label">Consulta operacional</span><p>${escapeHtml(navigationPresentation.description)}</p></div>
        </div>
        <section class="views-workspace ${showGroups ? "" : "views-workspace-full"}">
          ${showGroups ? `
            <aside class="classic-form-panel views-tree-panel">
              <div class="classic-panel-header">Classe - Grupo</div>
              <div class="views-tree" role="tree" aria-label="Classes e grupos de produtos">
                <button class="views-tree-item ${selectedGroupId === null ? "is-selected" : ""}" type="button" role="treeitem" data-group-id="" aria-selected="${selectedGroupId === null ? "true" : "false"}"><span>Todos os produtos</span><strong>(${products.length})</strong></button>
                ${tree.map((group) => `<button class="views-tree-item ${String(selectedGroupId) === String(group.idGroup) ? "is-selected" : ""}" type="button" role="treeitem" data-group-id="${escapeHtml(group.idGroup)}" aria-selected="${String(selectedGroupId) === String(group.idGroup) ? "true" : "false"}"><span>${escapeHtml(group.label)}</span><strong>(${group.productCount})</strong></button>`).join("")}
              </div>
            </aside>
          ` : ""}
          <section class="classic-grid-panel views-list-panel">
            <div class="classic-panel-header classic-list-header"><span>${escapeHtml(title)}</span><input class="classic-list-search" data-product-search dir="ltr" type="search" placeholder="Pesquisar..." aria-label="Pesquisar produtos" value="${escapeHtml(searchTerm)}" /></div>
            <div class="classic-grid-wrapper">${renderProductList({ products: visibleProducts, loading, error, sortState, escapeHtml, formatMoney, emptyLabel })}</div>
          </section>
        </section>
      </section>
      ${editingProduct ? renderEditor(editingProduct, groups, physicalStates, fiscalOperations, units, productTypes, cestOptions, submitting, editorError, ncms) : ""}
      ${ncmLookupOpen ? `
        <div class="classic-modal-backdrop" data-ncm-modal-backdrop>
          <section class="classic-modal ncm-lookup-modal" role="dialog" aria-modal="true" aria-labelledby="ncm-lookup-title">
            <div class="classic-panel-header modal-panel-header"><span id="ncm-lookup-title">Consultar NCM</span><button class="modal-close-button" data-close-ncm type="button" aria-label="Fechar" title="Fechar"><i data-lucide="x"></i></button></div>
            <div class="ncm-lookup-toolbar"><label class="form-field"><span>Consulta</span><div class="ncm-lookup-controls">
              <select data-ncm-lookup-field aria-label="Campo da consulta"><option value="description" ${ncmLookupField === "description" ? "selected" : ""}>Descrição</option><option value="code" ${ncmLookupField === "code" ? "selected" : ""}>NCM</option></select>
              <input data-ncm-lookup-search dir="ltr" type="search" value="${escapeHtml(ncmLookupTerm)}" placeholder="Digite para pesquisar..." aria-label="Pesquisar NCM" />
            </div></label></div>
            <div class="ncm-lookup-table-wrapper">${ncmsLoading
              ? '<p class="classic-empty">Carregando NCMs...</p>'
              : ncmLoadError
                ? `<div class="classic-empty error-state"><p>${escapeHtml(ncmLoadError)}</p><button class="classic-button" data-retry-ncms type="button">Tentar novamente</button></div>`
                : (() => {
                    const query = ncmLookupTerm.trim().toLocaleLowerCase("pt-BR");
                    const rows = ncms.filter((ncm) => String(ncm[ncmLookupField === "code" ? "codeNcm" : "descriptionNcm"] || "").toLocaleLowerCase("pt-BR").includes(query)).slice(0, 150);
                    return rows.length
                      ? `<table class="classic-table ncm-lookup-table"><thead><tr><th>NCM</th><th>Descrição</th><th class="actions-column">Selecionar</th></tr></thead><tbody>${rows.map((ncm) => `<tr><td>${escapeHtml(ncm.codeNcm)}</td><td>${escapeHtml(ncm.descriptionNcm)}</td><td class="actions-column"><button class="classic-button ncm-select-button" type="button" data-select-ncm="${escapeHtml(ncm.codeNcm)}">OK</button></td></tr>`).join("")}</tbody></table>`
                      : '<p class="classic-empty">Nenhum NCM encontrado.</p>';
                  })()}</div>
            <div class="classic-form-actions"><button class="classic-button" data-close-ncm type="button">Cancelar</button></div>
          </section>
        </div>
      ` : ""}
    `;
    renderLucideIcons(root);
    bindMainMenu(root, menuHandlers);
    bindViewsNavigation(root, {
      back: onBack,
      "groups-products": onGroupsProducts,
      "no-cost": onNoCost,
      "no-physical-state": menuHandlers.onNoPhysicalState,
      "recipe-revisions": onRecipeRevisions
    });
    bindProductList(root, {
      onSort: (key) => {
        sortState = sortState.key === key
          ? { key, direction: sortState.direction === "asc" ? "desc" : "asc" }
          : { key, direction: "asc" };
        render();
      },
      onEdit: (idProduct) => {
        editingProduct = products.find(({ idProduct: currentId }) => String(currentId) === String(idProduct)) || null;
        editorError = "";
        cestOptions = [];
        render();
        void loadCestOptions(editingProduct?.ncmProduct);
        root.querySelector("[name='nameProduct']")?.focus();
      },
      onDelete: deleteProduct,
      onStatus: (idProduct, value) => void updateProductFlag("/api/products/status", idProduct, value),
      onPdvStatus: (idProduct, value) => void updateProductFlag("/api/products/pdv-status", idProduct, value)
    });
    root.querySelector("[data-product-search]")?.addEventListener("input", (event) => {
      searchTerm = event.currentTarget.value;
      render();
      const input = root.querySelector("[data-product-search]");
      input?.focus();
      input?.setSelectionRange(searchTerm.length, searchTerm.length);
    });
    root.querySelectorAll("[data-group-id]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedGroupId = button.dataset.groupId || null;
        render();
      });
    });
    root.querySelector("[data-views-product-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void saveProduct(new FormData(event.currentTarget));
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
      root.querySelectorAll("[data-open-ncm]").forEach((button) => {
        button.addEventListener("click", () => {
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
        ncmLookupTerm = event.currentTarget.value;
        render();
        root.querySelector("[data-ncm-lookup-search]")?.focus();
      });
      root.querySelectorAll("[data-select-ncm]").forEach((button) => {
        button.addEventListener("click", () => {
          editingProduct = { ...editingProduct, ncmProduct: button.dataset.selectNcm, cestProduct: "" };
          ncmLookupOpen = false;
          cestOptions = [];
          render();
          void loadCestOptions(editingProduct.ncmProduct);
        });
      });
      root.querySelectorAll("[data-close-ncm], [data-ncm-modal-backdrop]").forEach((element) => {
        element.addEventListener("click", (event) => {
          if (element.matches("[data-ncm-modal-backdrop]") && event.target !== event.currentTarget) return;
          ncmLookupOpen = false;
          render();
        });
      });
    });
    bindNumberMasks(root);
    root.querySelectorAll(".field-help-trigger").forEach((trigger) => {
      trigger.addEventListener("pointerenter", () => trigger.classList.add("is-help-visible"));
      trigger.addEventListener("pointerleave", () => trigger.classList.remove("is-help-visible"));
      trigger.addEventListener("focus", () => trigger.classList.add("is-help-visible"));
      trigger.addEventListener("blur", () => trigger.classList.remove("is-help-visible"));
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
    root.querySelectorAll("[name='isFractionalProduct']").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const stockInput = checkbox.form?.elements.namedItem("stockQuantityProduct");
        if (stockInput) {
          stockInput.type = checkbox.checked ? "text" : "number";
          stockInput.step = checkbox.checked ? "0.001" : "1";
        }
      });
    });
    root.querySelectorAll("[data-cancel-product-edit], [data-product-editor-backdrop]").forEach((element) => {
      element.addEventListener("click", (event) => {
        if (element.matches("[data-product-editor-backdrop]") && event.target !== event.currentTarget) return;
        editingProduct = null;
        editorError = "";
        render();
      });
    });
  }

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

  const loadCestOptions = async (ncmCode) => {
    if (!ncmCode) return;
    try {
      const response = await apiFetch(`${getApiUrl()}/api/ncm-cest/options?ncm=${encodeURIComponent(ncmCode)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar os CESTs.");
      cestOptions = payload.cests;
      if (editingProduct) render();
    } catch (loadError) {
      editorError = loadError instanceof Error ? loadError.message : "Falha ao carregar os CESTs.";
      render();
    }
  };

  render();
  void load();
  return root;
}

export const createViewsScreen = (options) => createProductViewsScreen(options);
