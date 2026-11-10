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

const renderEditor = (product, groups, physicalStates, submitting, error) => `
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
            <label class="form-field"><span>SKU</span><input name="skuProduct" required maxlength="64" value="${escapeHtml(product.skuProduct)}" /></label>
            <label class="form-field"><span>Código PDV</span><input name="pdvCodeProduct" maxlength="64" value="${escapeHtml(product.pdvCodeProduct)}" /></label>
          </div>
          <div class="classic-form-grid">
            <label class="form-field"><span>Grupo</span><select name="idGroup" required>${groups.map((group) =>
              `<option value="${group.idGroup}" ${String(group.idGroup) === String(product.idGroup) ? "selected" : ""}>${escapeHtml(group.descriptionGroup)}</option>`
            ).join("")}</select></label>
            <label class="form-field"><span>Preço de venda</span><input name="priceProduct" inputmode="decimal" required value="${escapeHtml(Number(product.priceProduct || 0).toFixed(2).replace(".", ","))}" /></label>
          </div>
          ${physicalStates ? `<label class="form-field"><span>Estado físico</span><select name="idPhysicalStateProduct" required>${renderPhysicalStateOptions(physicalStates, product.idPhysicalStateProduct)}</select></label>` : ""}
          <div class="classic-form-grid">
            <label class="form-field"><span>Preço de custo</span><input name="costPriceProduct" inputmode="decimal" required value="${escapeHtml(Number(product.costPriceProduct || 0).toFixed(2).replace(".", ","))}" /></label>
            <label class="form-field"><span>Estoque</span><input name="stockQuantityProduct" inputmode="decimal" required value="${escapeHtml(product.stockQuantityProduct)}" /></label>
          </div>
          <div class="classic-form-grid">
            <label class="form-field checkbox-field"><span>Controla estoque</span><input name="controlsStockProduct" type="checkbox" ${Number(product.controlsStockProduct) ? "checked" : ""} /></label>
            <label class="form-field checkbox-field"><span>Produto Buffet</span><input name="isBuffetProduct" type="checkbox" ${Number(product.isBuffetProduct) ? "checked" : ""} /></label>
            <label class="form-field checkbox-field"><span>Produto fracionado</span><input name="isFractionalProduct" type="checkbox" ${Number(product.isFractionalProduct) ? "checked" : ""} /></label>
            <label class="form-field"><span>Local de impressão</span><select name="printsPlace">
              ${["Não Imprimir", "Bar", "Copa", "Cozinha"].map((place) =>
                `<option value="${place}" ${normalizePrintPlace(product.printsPlace) === place ? "selected" : ""}>${place}</option>`
              ).join("")}
            </select></label>
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
  let sortState = { key: "nameProduct", direction: "asc" };

  const load = async () => {
    loading = true;
    error = "";
    render();
    try {
      const requests = [
        apiFetch(`${getApiUrl()}/api/products?includeInactive=1`),
        apiFetch(`${getApiUrl()}/api/groups?includeInactive=1`)
      ];
      if (active === "no-physical-state") {
        requests.push(apiFetch(`${getApiUrl()}/api/physical-states?includeInactive=1`));
      }
      const [productResponse, groupResponse, physicalStateResponse] = await Promise.all(requests);
      const productPayload = await productResponse.json();
      const groupPayload = await groupResponse.json();
      if (!productResponse.ok || !Array.isArray(productPayload.products)) {
        throw new Error(productPayload.error || "Não foi possível carregar os produtos.");
      }
      if (!groupResponse.ok || !Array.isArray(groupPayload.groups)) {
        throw new Error(groupPayload.error || "Não foi possível carregar os grupos.");
      }
      products = productPayload.products;
      groups = groupPayload.groups;
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
          idFiscalOperationSaleProduct: editingProduct.idFiscalOperationSaleProduct || null,
          idProductTypeProduct: editingProduct.idProductTypeProduct || null,
          idPhysicalStateProduct: formData.get("idPhysicalStateProduct") || editingProduct.idPhysicalStateProduct || null,
          idUnitProduct: editingProduct.idUnitProduct || null,
          ncmProduct: editingProduct.ncmProduct || null,
          cestProduct: editingProduct.cestProduct || null,
          priceProduct: parseMoney(formData.get("priceProduct")),
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
      ${editingProduct ? renderEditor(editingProduct, groups, physicalStates, submitting, editorError) : ""}
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
        render();
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
    root.querySelectorAll("[data-cancel-product-edit], [data-product-editor-backdrop]").forEach((element) => {
      element.addEventListener("click", (event) => {
        if (element.matches("[data-product-editor-backdrop]") && event.target !== event.currentTarget) return;
        editingProduct = null;
        editorError = "";
        render();
      });
    });
  }

  render();
  void load();
  return root;
}

export const createViewsScreen = (options) => createProductViewsScreen(options);
