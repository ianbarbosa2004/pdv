import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { apiFetch, getApiUrl } from "../shared/api.js";
import { getContextualNavigationItems, renderContextualNavigationItems } from "../ui/contextual-navigation.js";
import { resolveNavigationHandler } from "../ui/navigation-routing.js";
import { parseBrazilianDecimal } from "../shared/decimal.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const recipeNavigation = [
  ["recipes", "Receitas e Composições"],
  ["culinary-units", "Unidades Culinárias"],
  ["physical-states", "Estados Físicos"],
  ["culinary-conversions", "Conversões"]
];

const renderNavigation = (active) => `
  <div class="classic-toolbar screen-context-bar" aria-label="Navegação contextual">
    ${renderContextualNavigationItems(getContextualNavigationItems("technical-sheet", recipeNavigation), active, "recipe-nav")}
  </div>
`;

const bindNavigation = (root, handlers) => {
  root.querySelectorAll("[data-recipe-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      const route = button.dataset.recipeNav;
      const handler = resolveNavigationHandler(handlers, route)
        || resolveNavigationHandler(window.__PDV_NAVIGATION_HANDLERS__, route);
      handler?.();
    });
  });
};

const productLabel = (product) =>
  `${product.nameProduct}${product.skuProduct ? ` (${product.skuProduct})` : ""}`;

export function createRecipeScreen({ onBack, onRecipes, ...menuHandlers }) {
  const root = document.createElement("main");
  let recipes = [];
  let products = [];
  let searchTerm = "";
  let loading = true;
  let submitting = false;
  let error = "";
  let message = "";
  let form = { kindRecipe: "production", nameRecipe: "", notesRecipe: "", components: [] };

  const load = async () => {
    loading = true;
    render();
    try {
      const [recipeResponse, productResponse] = await Promise.all([
        apiFetch(`${getApiUrl()}/api/recipes?includeArchived=1`),
        apiFetch(`${getApiUrl()}/api/products?includeInactive=1`)
      ]);
      const recipePayload = await recipeResponse.json();
      const productPayload = await productResponse.json();
      if (!recipeResponse.ok) throw new Error(recipePayload.error || "Não foi possível carregar as receitas.");
      if (!productResponse.ok) throw new Error(productPayload.error || "Não foi possível carregar os produtos.");
      recipes = Array.isArray(recipePayload.recipes) ? recipePayload.recipes : [];
      products = Array.isArray(productPayload.products) ? productPayload.products : [];
      error = "";
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Falha ao carregar as receitas.";
    } finally {
      loading = false;
      render();
    }
  };

  const resetForm = ({ keepMessage = false } = {}) => {
    form = { kindRecipe: "production", nameRecipe: "", notesRecipe: "", components: [] };
    error = "";
    if (!keepMessage) message = "";
    render();
  };

  const submit = async () => {
    if (!form.nameRecipe.trim() || !form.components.length) {
      error = "Informe o nome e ao menos um componente.";
      render();
      return;
    }
    submitting = true;
    error = "";
    render();
    try {
      const response = await apiFetch(`${getApiUrl()}/api/recipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          components: form.components.map((component) => ({
            ...(component.targetType === "recipe"
              ? { recipeId: component.recipeId }
              : { productId: component.productId }),
            quantity: component.quantity,
            lossPercent: component.lossPercent
          }))
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar a Receita ou Composição.");
      message = "Cadastro salvo como rascunho.";
      resetForm({ keepMessage: true });
      await load();
    } catch (submitError) {
      error = submitError instanceof Error ? submitError.message : "Falha ao salvar o cadastro.";
      render();
    } finally {
      submitting = false;
    }
  };

  const renderForm = () => `
    <form class="classic-form-panel" data-recipe-form>
      <div class="classic-panel-header">Nova Receita ou Composição</div>
      <div class="classic-form-body">
        <div class="classic-form-grid">
          <label class="form-field"><span>Tipo</span><select name="kindRecipe" data-recipe-kind>
            <option value="production" ${form.kindRecipe === "production" ? "selected" : ""}>Receita de Produção</option>
            <option value="composition" ${form.kindRecipe === "composition" ? "selected" : ""}>Composição de Produto</option>
          </select></label>
          <label class="form-field"><span>Nome da Receita ou Composição</span><input name="nameRecipe" data-recipe-name maxlength="180" required value="${escapeHtml(form.nameRecipe)}" placeholder="Ex.: Feijão Rico" /></label>
        </div>
        <label class="form-field"><span>Observações</span><input name="notesRecipe" maxlength="500" data-recipe-notes value="${escapeHtml(form.notesRecipe)}" /></label>
        <div class="classic-panel-header nested-panel-header">Componentes</div>
        <div class="recipe-component-list">
          ${form.components.length ? form.components.map((component, index) => `
            <div class="recipe-component-row">
              <span>${escapeHtml(component.targetType === "recipe"
                ? (recipes.find((recipe) => String(recipe.idRecipe) === String(component.recipeId))?.nameRecipe || "Receita não encontrada")
                : productLabel(products.find((product) => String(product.idProduct) === String(component.productId)) || { nameProduct: "Produto não encontrado" }))}</span>
              <span>${escapeHtml(component.quantity)} un.</span>
              <span>Perda: ${escapeHtml(component.lossPercent)}%</span>
              <button class="icon-button delete" type="button" data-remove-component="${index}" aria-label="Remover componente"><i data-lucide="trash-2"></i></button>
            </div>
          `).join("") : '<p class="classic-empty">Nenhum componente informado.</p>'}
        </div>
        <div class="classic-form-grid">
          <label class="form-field"><span>Componente</span><select data-component-target>
            <option value="">Selecione</option>
            <optgroup label="Produtos">${products.map((product) => `<option value="product:${product.idProduct}">${escapeHtml(productLabel(product))}</option>`).join("")}</optgroup>
            <optgroup label="Receitas e Composições">${recipes.map((recipe) => `<option value="recipe:${recipe.idRecipe}">${escapeHtml(recipe.nameRecipe)}</option>`).join("")}</optgroup>
          </select></label>
          <label class="form-field"><span>Quantidade</span><input data-component-quantity inputmode="decimal" value="1" /></label>
          <label class="form-field"><span>Perda (%)</span><input data-component-loss inputmode="decimal" value="0" /></label>
          <button class="classic-button" data-add-component type="button">Adicionar componente</button>
        </div>
        ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}
      </div>
      <div class="classic-form-actions"><button class="classic-button primary" type="submit" ${submitting || loading ? "disabled" : ""}>${submitting ? "Salvando..." : "Salvar rascunho"}</button><button class="classic-button" data-clear-recipe type="button">Limpar</button></div>
    </form>
  `;

  const render = () => {
    const visibleRecipes = recipes.filter((recipe) =>
      `${recipe.nameRecipe} ${recipe.kindRecipe} ${recipe.statusRecipe}`.toLocaleLowerCase("pt-BR")
        .includes(searchTerm.trim().toLocaleLowerCase("pt-BR"))
    );
    root.className = "catalog-screen";
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - Receitas e Composições</strong><span>Operador: Operador</span></header>
      ${renderMainMenu()}
      ${renderNavigation("recipes")}
      <section class="classic-content">
        ${message ? `<p class="success-message">${escapeHtml(message)}</p>` : ""}
        ${renderForm()}
        <section class="classic-grid-panel">
          <div class="classic-panel-header classic-list-header"><span>Receitas e Composições</span><input class="classic-list-search" data-recipe-search type="search" placeholder="Pesquisar..." aria-label="Pesquisar receitas" value="${escapeHtml(searchTerm)}" /></div>
          <div class="classic-grid-wrapper">${loading ? '<p class="classic-empty">Carregando receitas...</p>' : error && !recipes.length ? `<p class="error-message">${escapeHtml(error)}</p>` : visibleRecipes.length ? `<table class="classic-table"><thead><tr><th>Receita ou Composição</th><th>Tipo</th><th>Status</th><th>Componentes</th></tr></thead><tbody>${visibleRecipes.map((recipe) => `<tr class="${recipe.statusRecipe === "archived" ? "is-inactive" : ""}"><td>${escapeHtml(recipe.nameRecipe)}</td><td>${recipe.kindRecipe === "production" ? "Receita de Produção" : "Composição de Produto"}</td><td>${escapeHtml(recipe.statusRecipe)}</td><td>${recipe.components.length}</td></tr>`).join("")}</tbody></table>` : '<p class="classic-empty">Nenhuma Receita ou Composição cadastrada.</p>'}</div>
        </section>
      </section>
    `;
    renderLucideIcons(root);
    bindMainMenu(root, menuHandlers);
    bindNavigation(root, { back: onBack, recipes: onRecipes });
    root.querySelector("[data-recipe-search]")?.addEventListener("input", (event) => {
      searchTerm = event.currentTarget.value;
      render();
      root.querySelector("[data-recipe-search]")?.focus();
    });
    root.querySelector("[data-recipe-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void submit();
    });
    root.querySelector("[data-recipe-kind]")?.addEventListener("change", (event) => { form.kindRecipe = event.currentTarget.value; });
    root.querySelector("[data-recipe-name]")?.addEventListener("input", (event) => { form.nameRecipe = event.currentTarget.value; });
    root.querySelector("[data-recipe-notes]")?.addEventListener("input", (event) => { form.notesRecipe = event.currentTarget.value; });
    root.querySelector("[data-add-component]")?.addEventListener("click", () => {
      const target = root.querySelector("[data-component-target]")?.value || "";
      const quantity = root.querySelector("[data-component-quantity]")?.value;
      const lossPercent = root.querySelector("[data-component-loss]")?.value;
      const normalizedQuantity = parseBrazilianDecimal(quantity);
      const normalizedLoss = parseBrazilianDecimal(lossPercent);
      const [targetType, targetId] = target.split(":");
      if (!targetId || !["product", "recipe"].includes(targetType) || normalizedQuantity <= 0 || normalizedLoss < 0 || normalizedLoss >= 100) {
        error = "Informe componente, quantidade maior que zero e perda entre 0 e 99,99%.";
        render();
        return;
      }
      form.components.push({
        targetType,
        ...(targetType === "recipe" ? { recipeId: targetId } : { productId: targetId }),
        quantity: normalizedQuantity,
        lossPercent: normalizedLoss
      });
      error = "";
      render();
    });
    root.querySelectorAll("[data-remove-component]").forEach((button) => button.addEventListener("click", () => {
      form.components.splice(Number(button.dataset.removeComponent), 1);
      render();
    }));
    root.querySelector("[data-clear-recipe]")?.addEventListener("click", resetForm);
  };

  render();
  void load();
  return root;
}
