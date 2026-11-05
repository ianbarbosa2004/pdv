import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { apiFetch, getApiUrl } from "../shared/api.js";
import { getContextualNavigationItems, renderContextualNavigationItems } from "../ui/contextual-navigation.js";
import { resolveNavigationHandler } from "../ui/navigation-routing.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const navigation = [
  ["groups-products", "Grupos x Produtos"],
  ["no-cost", "Sem Custo"],
  ["no-physical-state", "Sem Estado Físico"],
  ["recipe-revisions", "Revisões de Fichas"]
];

export function createRecipeReviewScreen({ onBack, onGroupsProducts, onNoCost, onNoPhysicalState, onRecipeRevisions, ...menuHandlers }) {
  const root = document.createElement("main");
  let reviews = [];
  let loading = true;
  let error = "";
  let searchTerm = "";

  const load = async () => {
    loading = true;
    render();
    try {
      const response = await apiFetch(`${getApiUrl()}/api/recipe-reviews`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar as revisões.");
      reviews = Array.isArray(payload.reviews) ? payload.reviews : [];
      error = "";
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Falha ao carregar as revisões.";
    } finally {
      loading = false;
      render();
    }
  };

  const render = () => {
    const visibleReviews = reviews.filter((review) =>
      `${review.nameRecipe} ${review.reasonRecipeReview}`.toLocaleLowerCase("pt-BR")
        .includes(searchTerm.trim().toLocaleLowerCase("pt-BR"))
    );
    root.className = "catalog-screen views-screen";
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - Revisões de Fichas</strong><span>Operador: Operador</span></header>
      ${renderMainMenu()}
      <div class="classic-toolbar screen-context-bar" aria-label="Navegação contextual">
        ${renderContextualNavigationItems(getContextualNavigationItems("views", navigation), "recipe-revisions", "views-nav")}
      </div>
      <section class="views-content">
        <div class="views-intro"><div class="views-intro-block"><span class="views-intro-label">Views</span><h1>Revisões de Fichas</h1></div><div class="views-intro-block"><span class="views-intro-label">Conferência operacional</span><p>Consulte estruturas marcadas para revisão antes de seu uso operacional.</p></div></div>
        <section class="views-workspace-full"><section class="classic-grid-panel views-list-panel">
          <div class="classic-panel-header classic-list-header"><span>Revisões pendentes</span><input class="classic-list-search" data-review-search type="search" placeholder="Pesquisar..." aria-label="Pesquisar revisões" value="${escapeHtml(searchTerm)}" /></div>
          <div class="classic-grid-wrapper">${loading ? '<p class="classic-empty">Carregando revisões...</p>' : error ? `<p class="error-message">${escapeHtml(error)}</p>` : visibleReviews.length ? `<table class="classic-table"><thead><tr><th>Receita ou Composição</th><th>Tipo</th><th>Motivo</th><th>Status</th><th>Data</th></tr></thead><tbody>${visibleReviews.map((review) => `<tr><td>${escapeHtml(review.nameRecipe)}</td><td>${review.kindRecipe === "production" ? "Receita de Produção" : "Composição de Produto"}</td><td>${escapeHtml(review.reasonRecipeReview)}</td><td>${escapeHtml(review.statusRecipeReview)}</td><td>${escapeHtml(String(review.createdAtRecipeReview).slice(0, 10))}</td></tr>`).join("")}</tbody></table>` : '<p class="classic-empty">Nenhuma revisão pendente.</p>'}</div>
        </section></section>
      </section>
    `;
    renderLucideIcons(root);
    bindMainMenu(root, menuHandlers);
    root.querySelectorAll("[data-views-nav]").forEach((button) => button.addEventListener("click", () => {
      const route = button.dataset.viewsNav;
      const handler = resolveNavigationHandler({
        back: onBack,
        "groups-products": onGroupsProducts,
        "no-cost": onNoCost,
        "no-physical-state": onNoPhysicalState,
        "recipe-revisions": onRecipeRevisions
      }, route) || resolveNavigationHandler(window.__PDV_NAVIGATION_HANDLERS__, route);
      handler?.();
    }));
    root.querySelector("[data-review-search]")?.addEventListener("input", (event) => {
      searchTerm = event.currentTarget.value;
      render();
      root.querySelector("[data-review-search]")?.focus();
    });
  };

  render();
  void load();
  return root;
}
