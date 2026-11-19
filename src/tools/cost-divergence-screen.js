import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { apiFetch, getApiUrl } from "../shared/api.js";
import { formatUpdatedRecipeStructures, renderSuccessFeedback } from "../ui/feedback.js";
import { getContextualNavigationItems, renderContextualNavigationItems } from "../ui/contextual-navigation.js";
import { resolveNavigationHandler } from "../ui/navigation-routing.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const formatMoney = (value) =>
  `R$ ${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const viewsNavigation = [
  ["groups-products", "Grupos x Produtos"],
  ["margin", "Margem"],
  ["no-cost", "Sem Custo"],
  ["no-physical-state", "Sem Estado Físico"],
  ["cost-divergences", "Divergência entre Custos"],
  ["recipe-revisions", "Revisões de Fichas"]
];

export function createCostDivergenceScreen(menuHandlers = {}) {
  const root = document.createElement("main");
  let products = [];
  let searchTerm = "";
  let loading = true;
  let error = "";
  let message = "";
  let saving = false;
  let selectedProduct = null;

  const renderNavigation = () => `
    <div class="classic-toolbar screen-context-bar views-context-bar" aria-label="Navegação contextual">
      ${renderContextualNavigationItems(
        getContextualNavigationItems("views", viewsNavigation),
        "cost-divergences",
        "views-nav"
      )}
    </div>
  `;

  const load = async () => {
    loading = true;
    render();
    try {
      const response = await apiFetch(`${getApiUrl()}/api/views/cost-divergences`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar as divergências de custo.");
      products = Array.isArray(payload.products) ? payload.products : [];
      error = "";
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Falha ao carregar as divergências de custo.";
    } finally {
      loading = false;
      render();
    }
  };

  const visibleProducts = () => products.filter((product) =>
    `${product.pdvCodeProduct || ""} ${product.nameProduct || ""}`
      .toLocaleLowerCase("pt-BR")
      .includes(searchTerm.trim().toLocaleLowerCase("pt-BR"))
  );

  const closeModal = () => {
    selectedProduct = null;
    saving = false;
    render();
  };

  const updateCost = async () => {
    if (!selectedProduct || saving) return;
    saving = true;
    render();
    try {
      const response = await apiFetch(`${getApiUrl()}/api/products/cost-price`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idProduct: selectedProduct.idProduct,
          costPriceProduct: Number(selectedProduct.suggestedCostPriceProduct ?? 0).toFixed(2)
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar o preço de custo.");
      const expectedCost = Number(selectedProduct.suggestedCostPriceProduct ?? 0).toFixed(2);
      if (Number(payload.costPriceProduct).toFixed(2) !== expectedCost) {
        throw new Error("O preço de custo retornado pelo cadastro não corresponde ao valor atualizado.");
      }
      message = payload.updatedRecipeCount
        ? `Preço de custo atualizado. ${formatUpdatedRecipeStructures(payload.updatedRecipeCount)}`
        : "Preço de custo atualizado com sucesso.";
      selectedProduct = null;
      await load();
    } catch (updateError) {
      error = updateError instanceof Error ? updateError.message : "Falha ao atualizar o preço de custo.";
      saving = false;
      render();
    }
  };

  const renderModal = () => selectedProduct ? `
    <div class="classic-modal-backdrop" data-cost-divergence-backdrop>
      <section class="classic-modal cost-divergence-modal" role="dialog" aria-modal="true" aria-labelledby="cost-divergence-title">
        <div class="classic-panel-header modal-panel-header">
          <span id="cost-divergence-title">Atualizar custo do produto</span>
          <button class="modal-close-button" data-cost-cancel type="button" aria-label="Fechar" title="Fechar"><i data-lucide="x"></i></button>
        </div>
        <div class="classic-form-body">
          <div class="classic-form-grid">
            <label class="form-field"><span>#PDV</span><input readonly value="${escapeHtml(selectedProduct.pdvCodeProduct)}" /></label>
            <label class="form-field"><span>Nome do Produto</span><input readonly value="${escapeHtml(selectedProduct.nameProduct)}" /></label>
          </div>
          <div class="classic-form-grid">
            <label class="form-field"><span>Preço de Custo Atual</span><input readonly value="${escapeHtml(formatMoney(selectedProduct.costPriceProduct))}" /></label>
            <label class="form-field"><span>Preço de Custo Sugerido</span><input readonly value="${escapeHtml(formatMoney(selectedProduct.suggestedCostPriceProduct))}" /></label>
          </div>
        </div>
        <div class="classic-form-actions">
          <button class="classic-button primary" data-cost-update type="button" ${saving ? "disabled" : ""}>${saving ? "Atualizando..." : "Atualizar Custo"}</button>
          <button class="classic-button" data-cost-cancel type="button" ${saving ? "disabled" : ""}>Cancelar</button>
        </div>
      </section>
    </div>
  ` : "";

  const render = () => {
    const rows = visibleProducts();
    root.className = "catalog-screen views-screen cost-divergence-screen";
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - Divergência entre Custos</strong><span>Operador: Operador</span></header>
      ${renderMainMenu()}
      ${renderNavigation()}
      <section class="views-content">
        ${renderSuccessFeedback(message, escapeHtml)}
        <div class="views-intro">
          <div class="views-intro-block"><span class="views-intro-label">Views</span><h1>Divergência entre Custos</h1></div>
          <div class="views-intro-block"><span class="views-intro-label">Consulta operacional</span><p>Compare o custo atual do Produto com o custo unitário salvo na Formação.</p></div>
        </div>
        <section class="classic-grid-panel views-list-panel views-workspace-full">
          <div class="classic-panel-header classic-list-header">
            <span>Divergência entre Custos</span>
            <input class="classic-list-search" data-cost-search type="search" placeholder="Pesquisar..." aria-label="Pesquisar divergências" value="${escapeHtml(searchTerm)}" />
          </div>
          <div class="classic-grid-wrapper">${loading
            ? '<p class="classic-empty">Carregando...</p>'
            : error
              ? `<p class="error-message">${escapeHtml(error)}</p>`
              : rows.length
                ? `<table class="classic-table cost-divergence-table"><thead><tr><th>#PDV</th><th>Nome do Produto</th><th>Preço de Custo Atual</th><th>Preço de Custo Sugerido</th><th class="actions-column">Ações</th></tr></thead><tbody>${rows.map((product) => `<tr><td>${escapeHtml(product.pdvCodeProduct)}</td><td>${escapeHtml(product.nameProduct)}</td><td>${escapeHtml(formatMoney(product.costPriceProduct))}</td><td>${escapeHtml(formatMoney(product.suggestedCostPriceProduct))}</td><td class="actions-column"><button class="icon-button cost-divergence-action" data-cost-open="${product.idProduct}" type="button" aria-label="Atualizar custo de ${escapeHtml(product.nameProduct)}" title="Atualizar custo"><i data-lucide="dollar-sign"></i></button></td></tr>`).join("")}</tbody></table>`
                : '<p class="classic-empty">Nenhuma divergência de custo encontrada.</p>'}
          </div>
        </section>
      </section>
      ${renderModal()}
    `;
    renderLucideIcons(root);
    bindMainMenu(root, menuHandlers);
    root.querySelectorAll("[data-views-nav]").forEach((button) => {
      button.addEventListener("click", () => {
        const handler = resolveNavigationHandler(menuHandlers, button.dataset.viewsNav)
          || resolveNavigationHandler(window.__PDV_NAVIGATION_HANDLERS__, button.dataset.viewsNav);
        handler?.();
      });
    });
    root.querySelector("[data-cost-search]")?.addEventListener("input", (event) => {
      searchTerm = event.currentTarget.value;
      render();
      root.querySelector("[data-cost-search]")?.focus();
    });
    root.querySelectorAll("[data-cost-open]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedProduct = products.find((product) => String(product.idProduct) === String(button.dataset.costOpen)) || null;
        render();
      });
    });
    root.querySelectorAll("[data-cost-cancel]").forEach((button) => button.addEventListener("click", closeModal));
    root.querySelector("[data-cost-update]")?.addEventListener("click", () => void updateCost());
  };

  render();
  void load();
  return root;
}
