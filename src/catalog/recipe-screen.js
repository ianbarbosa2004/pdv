import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { apiFetch, getApiUrl } from "../shared/api.js";
import { getContextualNavigationItems, renderContextualNavigationItems } from "../ui/contextual-navigation.js";
import { resolveNavigationHandler } from "../ui/navigation-routing.js";
import { formatBrazilianDecimal, parseBrazilianDecimal } from "../shared/decimal.js";
import { bindNumberMasks, formatMaskedNumber } from "../ui/number-mask.js";
import { confirmAction } from "../ui/confirmation-modal.js";
import { clearRenderedFeedback, createFeedbackTimer, renderSuccessFeedback } from "../ui/feedback.js";
import { calculateComponentCost } from "../shared/recipe.js";
import {
  filterRecipeComponentOptions,
  formatCulinaryUnitName,
  getAvailableRecipeConversions,
  getCompatibleCulinaryUnits,
  getProductTargetCulinaryUnitId,
  resolveRecipeComponentConversionFactor
} from "../shared/recipe-component.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const recipeNavigation = [
  ["recipes", "Receitas e Composições"],
  ["units", "Unidades"],
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

export function createRecipeScreen({ onBack, onRecipes, ...menuHandlers }) {
  const root = document.createElement("main");
  let recipes = [];
  let products = [];
  let units = [];
  let culinaryUnits = [];
  let conversions = [];
  let physicalStates = [];
  let searchTerm = "";
  let statusFilter = "all";
  let loading = true;
  let submitting = false;
  let editingRecipe = null;
  let viewingRecipe = null;
  let editingComponentIndex = null;
  let referencesLoaded = false;
  let error = "";
  let loadError = "";
  let message = "";
  const scheduleMessageClear = createFeedbackTimer();
  let form = {
    kindRecipe: "production",
    nameRecipe: "",
    statusRecipe: "draft",
    yieldQuantityRecipe: "1",
    yieldUnitId: "",
    notesRecipe: "",
    components: []
  };
  let componentDraft = {
    searchTerm: "",
    target: "",
    culinaryUnitId: "",
    conversionId: "",
    quantity: "1",
    lossPercent: "0",
    isOpen: false
  };

  const load = async () => {
    loading = true;
    render();
    try {
      const requests = [
        apiFetch(`${getApiUrl()}/api/recipes?includeArchived=1`)
      ];
      if (!referencesLoaded) {
        requests.push(
          apiFetch(`${getApiUrl()}/api/products?includeInactive=1`),
          apiFetch(`${getApiUrl()}/api/units?includeInactive=1`),
          apiFetch(`${getApiUrl()}/api/unit-conversions`),
          apiFetch(`${getApiUrl()}/api/physical-states`)
        );
      }
      const responses = await Promise.all(requests);
      const [recipeResponse, productResponse, unitResponse, conversionResponse, physicalStateResponse] = responses;
      const recipePayload = await recipeResponse.json();
      const productPayload = productResponse ? await productResponse.json() : null;
      const unitPayload = unitResponse ? await unitResponse.json() : null;
      const conversionPayload = conversionResponse ? await conversionResponse.json() : null;
      const physicalStatePayload = physicalStateResponse ? await physicalStateResponse.json() : null;
      if (!recipeResponse.ok) throw new Error(recipePayload.error || "Não foi possível carregar as receitas.");
      recipes = Array.isArray(recipePayload.recipes) ? recipePayload.recipes : [];
      if (!referencesLoaded) {
        if (!productResponse.ok) throw new Error(productPayload.error || "Não foi possível carregar os produtos.");
        if (!unitResponse.ok) throw new Error(unitPayload.error || "Não foi possível carregar as unidades.");
        if (!conversionResponse.ok) throw new Error(conversionPayload.error || "Não foi possível carregar as conversões.");
        if (!physicalStateResponse.ok) throw new Error(physicalStatePayload.error || "Não foi possível carregar os estados físicos.");
        products = Array.isArray(productPayload.products) ? productPayload.products : [];
        units = Array.isArray(unitPayload.units) ? unitPayload.units : [];
        culinaryUnits = units
          .filter((unit) => Number(unit.isCulinaryUnit) === 1)
          .map((unit) => ({
            ...unit,
            idCulinaryUnit: unit.idUnit,
            codeCulinaryUnit: unit.codeUnit,
            nameCulinaryUnit: unit.descriptionUnit,
            baseUnitCulinaryUnit: unit.baseUnitUnit,
            categoryCulinaryUnit: unit.categoryUnit,
            descriptionCulinaryUnit: unit.descriptionUnit,
            isActiveCulinaryUnit: unit.isActiveUnit
          }));
        conversions = Array.isArray(conversionPayload.conversions) ? conversionPayload.conversions : [];
        physicalStates = Array.isArray(physicalStatePayload.physicalStates) ? physicalStatePayload.physicalStates : [];
        referencesLoaded = true;
      }
      error = "";
      loadError = "";
    } catch (loadFailure) {
      const message = loadFailure instanceof Error ? loadFailure.message : "Falha ao carregar as receitas.";
      error = "";
      loadError = message;
    } finally {
      loading = false;
      render();
    }
  };

  const resetFormState = ({ keepMessage = false } = {}) => {
    form = {
      kindRecipe: "production",
      nameRecipe: "",
      statusRecipe: "draft",
      yieldQuantityRecipe: "1",
      yieldUnitId: "",
      notesRecipe: "",
      components: []
    };
    componentDraft = {
      searchTerm: "",
      target: "",
      culinaryUnitId: "",
      conversionId: "",
      quantity: "1",
      lossPercent: "0",
      isOpen: false
    };
    error = "";
    loadError = "";
    editingRecipe = null;
    viewingRecipe = null;
    editingComponentIndex = null;
    if (!keepMessage) message = "";
  };

  const resetForm = ({ keepMessage = false } = {}) => {
    resetFormState({ keepMessage });
    render();
  };

  const submit = async () => {
    if (submitting) return;
    const yieldQuantity = parseBrazilianDecimal(form.yieldQuantityRecipe);
    const hasMissingCulinaryUnit = form.components.some((component) =>
      component.targetType === "product" && !component.culinaryUnitId
    );
    const hasMissingConversion = form.components.some((component) =>
      component.targetType === "product" && !component.conversionId
    );
    if (!form.nameRecipe.trim() || !form.components.length || yieldQuantity <= 0
      || !form.yieldUnitId || hasMissingCulinaryUnit || hasMissingConversion) {
      error = hasMissingCulinaryUnit
        ? "Informe a unidade culinária de todos os componentes de produto."
        : hasMissingConversion
          ? "Informe a conversão de todos os componentes de produto."
        : "Informe nome, rendimento maior que zero, unidade final e ao menos um componente.";
      render();
      return;
    }
    submitting = true;
    error = "";
    loadError = "";
    message = "";
    render();
    let renderAfterSubmit = true;
    const editedRecipeId = editingRecipe?.idRecipe;
    try {
      const response = await apiFetch(`${getApiUrl()}/api/recipes${editingRecipe ? `/${editingRecipe.idRecipe}` : ""}`, {
        method: editingRecipe ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          yieldQuantityRecipe: yieldQuantity,
          yieldUnitId: form.yieldUnitId,
          components: form.components.map((component) => ({
            ...(component.targetType === "recipe"
              ? { recipeId: component.recipeId }
              : { productId: component.productId }),
            culinaryUnitId: component.culinaryUnitId || null,
            conversionId: component.conversionId || null,
            quantity: component.quantity,
            lossPercent: component.lossPercent
          }))
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar a Receita ou Composição.");
      message = editingRecipe ? "Receita atualizada com sucesso." : "Cadastro salvo com sucesso.";
      resetFormState({ keepMessage: true });
      submitting = false;
      await load();
      if (editedRecipeId) {
        viewingRecipe = recipes.find((recipe) => recipe.idRecipe === editedRecipeId) || null;
        if (viewingRecipe) populateForm(viewingRecipe);
        render();
      }
      scheduleMessageClear(() => {
        message = "";
        clearRenderedFeedback(root);
      });
      renderAfterSubmit = false;
    } catch (submitError) {
      error = submitError instanceof Error ? submitError.message : "Falha ao salvar o cadastro.";
    } finally {
      submitting = false;
      if (renderAfterSubmit) render();
    }
  };

  const populateForm = (recipe) => {
    form = {
      kindRecipe: recipe.kindRecipe,
      nameRecipe: recipe.nameRecipe || "",
      statusRecipe: recipe.statusRecipe === "archived" ? "draft" : (recipe.statusRecipe || "draft"),
      yieldQuantityRecipe: String(recipe.yieldQuantityRecipe ?? 1).replace(".", ","),
      yieldUnitId: recipe.idUnitYieldRecipe || "",
      notesRecipe: recipe.notesRecipe || "",
      components: (recipe.components || []).map((component) => ({
        targetType: component.componentTypeRecipe,
        ...(component.componentTypeRecipe === "recipe"
          ? { recipeId: component.idComponentRecipe }
          : { productId: component.idComponentProductRecipe }),
        culinaryUnitId: component.idCulinaryUnitRecipeComponent || "",
        conversionId: component.idCulinaryUnitConversionRecipeComponent || "",
        culinaryUnitLabel: component.culinaryUnitName || "",
        conversionLabel: component.conversionLabel || "",
        quantity: Number(component.quantityRecipeComponent || 0),
        lossPercent: Number(component.lossPercentRecipeComponent || 0)
      }))
    };
  };

  const startViewing = (recipe) => {
    viewingRecipe = recipe;
    editingRecipe = null;
    populateForm(recipe);
    error = "";
    message = "";
    render();
  };

  const startEditing = (recipe) => {
    editingRecipe = recipe;
    viewingRecipe = null;
    populateForm(recipe);
    error = "";
    message = "";
    render();
  };

  const removeRecipe = async (id) => {
    const response = await apiFetch(`${getApiUrl()}/api/recipes/${id}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Não foi possível excluir a Receita ou Composição.");
    message = "Receita excluída com sucesso.";
    await load();
  };

  const renderComponentUnits = () => {
    const [targetType, targetId] = componentDraft.target.split(":");
    const product = targetType === "product"
      ? products.find((item) => String(item.idProduct) === String(targetId))
      : null;
    const hasTarget = Boolean(componentDraft.target);
    const hasProduct = Boolean(product);
    const compatibleUnits = product
      ? getCompatibleCulinaryUnits({
        unit: { codeUnit: product.codeUnit, descriptionUnit: product.descriptionUnit }
      }, culinaryUnits)
      : [];
    const availableConversions = product
      ? getAvailableRecipeConversions({
        culinaryUnitId: componentDraft.culinaryUnitId,
        physicalStateId: product.idPhysicalStateProduct,
        targetCulinaryUnitId: getProductTargetCulinaryUnitId(product, culinaryUnits, units),
        selectedConversionId: componentDraft.conversionId,
        conversions
      })
      : [];
    return `
      <label class="form-field"><span>Unidade culinária</span><select data-component-culinary-unit required ${hasProduct ? "" : "disabled"}>
          <option value="">Selecione</option>
          ${compatibleUnits.map((unit) => `<option value="${unit.idCulinaryUnit}" ${String(componentDraft.culinaryUnitId) === String(unit.idCulinaryUnit) ? "selected" : ""}>${escapeHtml(formatCulinaryUnitName(unit))}</option>`).join("")}
        </select></label>
      <label class="form-field"><span>Quantidade</span><input data-component-quantity data-number-mask inputmode="decimal" ${hasTarget ? "" : "readonly disabled"} value="${escapeHtml(formatMaskedNumber(componentDraft.quantity))}" /></label>
      <label class="form-field"><span>Conversão</span><select data-component-conversion required ${hasProduct && componentDraft.culinaryUnitId ? "" : "disabled"}>
            <option value="">Selecione</option>
            ${availableConversions.map((conversion) => `<option value="${conversion.idCulinaryUnitConversion}" ${String(componentDraft.conversionId) === String(conversion.idCulinaryUnitConversion) ? "selected" : ""}>${escapeHtml(`${conversion.fromNameCulinaryUnit} → ${conversion.toNameCulinaryUnit} (${conversion.namePhysicalState || "Estado não informado"}; fator ${formatBrazilianDecimal(conversion.factorCulinaryUnitConversion, 4)})`)}</option>`).join("")}
          </select></label>
      <label class="form-field"><span>Perda (%)</span><input data-component-loss data-number-mask inputmode="decimal" ${hasTarget ? "" : "readonly disabled"} value="${escapeHtml(formatMaskedNumber(componentDraft.lossPercent))}" /></label>
    `;
  };

  const componentOptions = () => filterRecipeComponentOptions([
    ...products.map((product) => ({
      value: `product:${product.idProduct}`,
      label: product.nameProduct,
      searchText: `${product.nameProduct} ${product.codeUnit || ""} ${product.descriptionUnit || ""}`
    })),
    ...recipes.map((recipe) => ({
      value: `recipe:${recipe.idRecipe}`,
      label: recipe.nameRecipe,
      searchText: recipe.nameRecipe
    }))
  ], componentDraft.searchTerm).slice(0, 20);

  const selectedComponentLabel = () => {
    const option = [
      ...products.map((product) => ({ value: `product:${product.idProduct}`, label: product.nameProduct })),
      ...recipes.map((recipe) => ({ value: `recipe:${recipe.idRecipe}`, label: recipe.nameRecipe }))
    ].find((item) => item.value === componentDraft.target);
    return option?.label || "Selecione um componente";
  };

  const componentName = (component) => component.targetType === "recipe"
    ? recipes.find((recipe) => String(recipe.idRecipe) === String(component.recipeId))?.nameRecipe || "Receita não encontrada"
    : products.find((product) => String(product.idProduct) === String(component.productId))?.nameProduct || "Produto não encontrado";

  const componentCost = (component) => {
    if (component.targetType !== "product") return 0;
    const product = products.find((item) => String(item.idProduct) === String(component.productId));
    const unitCost = Number(product?.costPriceProduct);
    if (!Number.isFinite(unitCost)) return 0;
    const quantity = parseBrazilianDecimal(component.quantity);
    const lossPercent = parseBrazilianDecimal(component.lossPercent);
    const conversionFactor = resolveRecipeComponentConversionFactor({
      component,
      product,
      conversions
    });
    if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) return 0;
    return calculateComponentCost({
      quantity,
      lossPercent,
      unitCost,
      conversionFactor
    }) || 0;
  };

  const totalComponentCost = () => form.components.reduce((total, component) => total + componentCost(component), 0);

  const renderComponentList = ({ readOnly = false } = {}) => {
    if (!form.components.length) return '<p class="classic-empty">Nenhum componente informado.</p>';
    return `
      <div class="recipe-components-table-wrapper">
        <table class="classic-table recipe-components-table">
          <thead><tr><th>#</th><th>Componente</th><th>Unidade culinária</th><th>Quantidade</th><th>Perda</th><th>Custo</th>${readOnly ? "" : '<th class="actions-column">Ações</th>'}</tr></thead>
          <tbody>
            ${form.components.map((component, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(componentName(component))}</td>
                        <td>${escapeHtml(component.culinaryUnitLabel || "—")}</td>
                <td>${escapeHtml(formatBrazilianDecimal(component.quantity, 2))}</td>
                <td>${escapeHtml(formatBrazilianDecimal(component.lossPercent, 2))}%</td>
                <td>${escapeHtml(formatBrazilianDecimal(componentCost(component), 2))}</td>
                ${readOnly ? "" : `<td class="actions-column recipe-order-actions">
                  <button class="icon-button edit" type="button" data-edit-component="${index}" aria-label="Editar componente" title="Editar componente"><i data-lucide="pencil"></i></button>
                  <button class="icon-button" type="button" data-move-component="${index}" data-direction="up" aria-label="Mover componente para cima" title="Mover para cima" ${index === 0 ? "disabled" : ""}><i data-lucide="arrow-up"></i></button>
                  <button class="icon-button" type="button" data-move-component="${index}" data-direction="down" aria-label="Mover componente para baixo" title="Mover para baixo" ${index === form.components.length - 1 ? "disabled" : ""}><i data-lucide="arrow-down"></i></button>
                  <button class="icon-button delete" type="button" data-remove-component="${index}" aria-label="Remover componente" title="Remover componente"><i data-lucide="trash-2"></i></button>
                </td>`}
              </tr>
            `).join("")}
          </tbody>
          <tfoot><tr><th colspan="${readOnly ? 5 : 6}">Custo total estimado</th><th>${escapeHtml(formatBrazilianDecimal(totalComponentCost(), 2))}</th></tr></tfoot>
        </table>
      </div>
    `;
  };

  const renderComponentEditor = () => `
    <div class="page-feedback recipe-component-modal" data-component-editor-modal role="dialog" aria-modal="true" aria-labelledby="recipe-component-editor-title">
      <div class="feedback-modal-panel recipe-component-modal-panel">
        <div class="classic-panel-header" id="recipe-component-editor-title">
          <span>Editar componente</span>
          <button class="modal-close-button" data-close-component-edit type="button" aria-label="Fechar edição do componente" title="Fechar"><i data-lucide="x"></i></button>
        </div>
        <div class="classic-form-body">
          <div class="recipe-component-picker">
            <span class="form-field"><span>Componente</span>
              <button type="button" class="classic-select-trigger" data-component-toggle aria-haspopup="listbox" aria-expanded="${componentDraft.isOpen ? "true" : "false"}">${escapeHtml(selectedComponentLabel())}</button>
              ${componentDraft.isOpen ? `<div class="recipe-component-options" role="listbox" aria-label="Componentes">
                <input data-component-search type="search" autocomplete="off" value="${escapeHtml(componentDraft.searchTerm)}" placeholder="Pesquisar componente..." aria-label="Pesquisar componente" />
                ${componentOptions().map((option) =>
                  `<button class="recipe-component-option ${componentDraft.target === option.value ? "is-selected" : ""}" type="button" data-component-option="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>`
                ).join("") || '<span class="classic-empty">Nenhum componente encontrado.</span>'}
              </div>` : ""}
            </span>
          </div>
          ${componentDraft.target ? `<div class="recipe-component-input-grid">${renderComponentUnits()}</div>` : ""}
          ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}
        </div>
        <div class="classic-form-actions">
          <button class="classic-button primary" data-save-component-edit type="button">Salvar componente</button>
          <button class="classic-button" data-cancel-component-edit type="button">Cancelar</button>
        </div>
      </div>
    </div>
  `;

  const renderComponentEntry = () => {
    return `
      <div class="recipe-component-entry">
        <div class="form-field recipe-component-picker"><span>Componente</span>
          <input type="hidden" data-component-target value="${escapeHtml(componentDraft.target)}" />
          <button type="button" class="classic-select-trigger" data-component-toggle aria-haspopup="listbox" aria-expanded="${componentDraft.isOpen ? "true" : "false"}">${escapeHtml(selectedComponentLabel())}</button>
          ${componentDraft.isOpen ? `<div class="recipe-component-options" role="listbox" aria-label="Componentes">
            <input data-component-search type="search" autocomplete="off" value="${escapeHtml(componentDraft.searchTerm)}" placeholder="Pesquisar componente..." aria-label="Pesquisar componente" />
            ${componentOptions().map((option) =>
              `<button class="recipe-component-option ${componentDraft.target === option.value ? "is-selected" : ""}" type="button" data-component-option="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>`
            ).join("") || '<span class="classic-empty">Nenhum componente encontrado.</span>'}
          </div>` : ""}
        </div>
        <div class="recipe-component-input-grid">${renderComponentUnits()}</div>
        <button class="classic-button" data-add-component type="button" ${componentDraft.target ? "" : "disabled"}>Adicionar componente</button>
      </div>
    `;
  };

  const renderForm = () => {
    const readOnly = Boolean(viewingRecipe && !editingRecipe);
    const formTitle = readOnly
      ? "Visualizar Receita ou Composição"
      : editingRecipe
        ? "Editar Receita ou Composição"
        : "Nova Receita ou Composição";
    return `
    <form class="classic-form-panel recipe-editor-panel" data-recipe-form>
      <div class="classic-panel-header ${readOnly ? "classic-list-header" : ""}">
        ${readOnly
          ? '<span>Visualização</span><button class="classic-button" data-new-recipe type="button">Novo cadastro</button>'
          : formTitle}
      </div>
      <div class="classic-form-body">
        <div class="classic-form-grid recipe-header-grid">
          <label class="form-field"><span>Nome da Receita ou Composição</span><input name="nameRecipe" data-recipe-name maxlength="180" required ${readOnly ? "readonly" : ""} value="${escapeHtml(form.nameRecipe)}" placeholder="Ex.: Feijão Rico" /></label>
          <label class="form-field"><span>Tipo</span><select name="kindRecipe" data-recipe-kind ${readOnly ? "disabled" : ""}>
            <option value="production" ${form.kindRecipe === "production" ? "selected" : ""}>Receita de Produção</option>
            <option value="composition" ${form.kindRecipe === "composition" ? "selected" : ""}>Composição de Produto</option>
          </select></label>
          <label class="form-field"><span>Status</span><select data-recipe-status ${readOnly ? "disabled" : ""}>
            ${readOnly && form.statusRecipe === "archived" ? '<option value="archived" selected>Arquivada</option>' : ""}
            <option value="draft" ${form.statusRecipe === "draft" ? "selected" : ""}>Rascunho</option>
            <option value="active" ${form.statusRecipe === "active" ? "selected" : ""}>Ativa</option>
            <option value="review_required" ${form.statusRecipe === "review_required" ? "selected" : ""}>Revisão</option>
          </select></label>
        </div>
        <div class="classic-form-grid">
          <label class="form-field"><span>Rendimento</span><input data-recipe-yield data-number-mask inputmode="decimal" required ${readOnly ? "readonly" : ""} value="${escapeHtml(formatMaskedNumber(form.yieldQuantityRecipe))}" placeholder="Ex.: 1,00" /></label>
          <label class="form-field"><span>Unidade final</span><select data-recipe-yield-unit required ${readOnly ? "disabled" : ""}>
            <option value="">Selecione</option>
            ${units.filter((unit) => unit.isActiveUnit !== 0)
              .sort((a, b) => String(a.codeUnit || "").localeCompare(String(b.codeUnit || "")))
              .map((unit) => `<option value="${unit.idUnit}" ${String(form.yieldUnitId) === String(unit.idUnit) ? "selected" : ""}>${escapeHtml(unit.descriptionUnit || "")}</option>`).join("")}
          </select></label>
        </div>
        <label class="form-field"><span>Observações</span><textarea name="notesRecipe" maxlength="500" data-recipe-notes rows="4" ${readOnly ? "readonly" : ""}>${escapeHtml(form.notesRecipe)}</textarea></label>
        ${readOnly ? "" : `<div class="recipe-components-divider" aria-hidden="true"></div>${renderComponentEntry()}`}
        <div class="classic-panel-header nested-panel-header">Componentes</div>
        <div class="recipe-component-list">
          ${renderComponentList({ readOnly })}
        </div>
        ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}
      </div>
      <div class="classic-form-actions">${
        readOnly
          ? '<button class="classic-button primary" data-edit-selected-recipe type="button">Editar</button>'
          : `<button class="classic-button primary" type="submit" ${submitting || loading ? "disabled" : ""}>Salvar</button><button class="classic-button" data-clear-recipe type="button">${editingRecipe ? "Cancelar edição" : "Limpar"}</button>`
      }</div>
    </form>
  `;
  };

  const render = () => {
    const visibleRecipes = recipes.filter((recipe) =>
      (statusFilter === "all" || recipe.statusRecipe === statusFilter)
      && `${recipe.nameRecipe} ${recipe.kindRecipe} ${recipe.statusRecipe}`.toLocaleLowerCase("pt-BR")
        .includes(searchTerm.trim().toLocaleLowerCase("pt-BR"))
    );
    const statusFilters = [
      ["all", "Todas"],
      ["draft", "Rascunho"],
      ["active", "Ativas"],
      ["review_required", "Revisão"],
      ["archived", "Arquivadas"]
    ];
    root.className = "catalog-screen recipe-screen";
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - Receitas e Composições</strong><span>Operador: Operador</span></header>
      ${renderMainMenu()}
      ${renderNavigation("recipes")}
      <section class="classic-content recipe-content">
        ${renderSuccessFeedback(message, escapeHtml)}
        ${renderForm()}
        <section class="classic-grid-panel recipe-list-panel">
          <div class="classic-panel-header classic-list-header"><span>Receitas e Composições</span><input class="classic-list-search" data-recipe-search type="search" placeholder="Pesquisar..." aria-label="Pesquisar receitas" value="${escapeHtml(searchTerm)}" /></div>
          <div class="recipe-status-filters" role="group" aria-label="Filtrar receitas por status">
            ${statusFilters.map(([value, label]) => `<button class="recipe-status-filter ${statusFilter === value ? "is-active" : ""}" type="button" data-recipe-status-filter="${value}" aria-pressed="${statusFilter === value ? "true" : "false"}">${label} <span>${value === "all" ? recipes.length : recipes.filter((recipe) => recipe.statusRecipe === value).length}</span></button>`).join("")}
          </div>
          <div class="classic-grid-wrapper">${loading ? '<p class="classic-empty">Carregando receitas...</p>' : loadError ? `<p class="error-message">${escapeHtml(loadError)}</p>` : visibleRecipes.length ? `<table class="classic-table"><thead><tr><th>Nome</th><th>Tipo</th><th>Status</th><th class="actions-column">Ações</th></tr></thead><tbody>${visibleRecipes.map((recipe) => `<tr class="${recipe.statusRecipe === "archived" ? "is-inactive" : ""}" data-view-recipe="${recipe.idRecipe}" tabindex="0"><td>${escapeHtml(recipe.nameRecipe)}</td><td>${recipe.kindRecipe === "production" ? "Receita de Produção" : "Composição de Produto"}</td><td class="${recipe.statusRecipe === "draft" || recipe.statusRecipe === "review_required" ? "recipe-status-emphasis" : ""}">${recipe.statusRecipe === "active" ? "Ativa" : recipe.statusRecipe === "review_required" ? "Revisão" : recipe.statusRecipe === "archived" ? "Arquivada" : "Rascunho"}</td><td class="actions-column"><button class="icon-button edit" type="button" data-edit-recipe="${recipe.idRecipe}" aria-label="Editar receita" title="Editar receita"><i data-lucide="pencil"></i></button><button class="icon-button delete" type="button" data-delete-recipe="${recipe.idRecipe}" aria-label="Arquivar receita" title="Arquivar receita"><i data-lucide="trash-2"></i></button></td></tr>`).join("")}</tbody></table>` : '<p class="classic-empty">Nenhuma Receita ou Composição cadastrada.</p>'}</div>
        </section>
      </section>
      ${editingComponentIndex !== null ? renderComponentEditor() : ""}
    `;
    renderLucideIcons(root);
    bindNumberMasks(root);
    bindMainMenu(root, menuHandlers);
    bindNavigation(root, { back: onBack, recipes: onRecipes });
    root.querySelector("[data-recipe-search]")?.addEventListener("input", (event) => {
      searchTerm = event.currentTarget.value;
      render();
      root.querySelector("[data-recipe-search]")?.focus();
    });
    root.querySelectorAll("[data-recipe-status-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        statusFilter = button.dataset.recipeStatusFilter || "all";
        render();
      });
    });
    root.querySelector("[data-recipe-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void submit();
    });
    root.querySelectorAll("[data-new-recipe]").forEach((button) => button.addEventListener("click", resetForm));
    root.querySelector("[data-edit-selected-recipe]")?.addEventListener("click", () => {
      if (viewingRecipe) startEditing(viewingRecipe);
    });
    const componentEditorRoot = root.querySelector("[data-component-editor-modal]") || root;
    root.querySelector("[data-recipe-kind]")?.addEventListener("change", (event) => { form.kindRecipe = event.currentTarget.value; });
    root.querySelector("[data-recipe-name]")?.addEventListener("input", (event) => { form.nameRecipe = event.currentTarget.value; });
    root.querySelector("[data-recipe-status]")?.addEventListener("change", (event) => { form.statusRecipe = event.currentTarget.value; });
    root.querySelector("[data-recipe-yield]")?.addEventListener("input", (event) => { form.yieldQuantityRecipe = event.currentTarget.value; });
    root.querySelector("[data-recipe-yield-unit]")?.addEventListener("change", (event) => { form.yieldUnitId = event.currentTarget.value; });
    root.querySelector("[data-recipe-notes]")?.addEventListener("input", (event) => { form.notesRecipe = event.currentTarget.value; });
    componentEditorRoot.querySelector("[data-component-toggle]")?.addEventListener("click", () => {
      componentDraft.isOpen = !componentDraft.isOpen;
      render();
      if (componentDraft.isOpen) componentEditorRoot.querySelector("[data-component-search]")?.focus();
    });
    componentEditorRoot.querySelector("[data-component-search]")?.addEventListener("input", (event) => {
      componentDraft.searchTerm = event.currentTarget.value;
      render();
      const searchInput = componentEditorRoot.querySelector("[data-component-search]");
      searchInput?.focus();
      const cursorPosition = componentDraft.searchTerm.length;
      searchInput?.setSelectionRange(cursorPosition, cursorPosition);
    });
    root.querySelectorAll("[data-component-option]").forEach((button) => button.addEventListener("click", () => {
      componentDraft.target = button.dataset.componentOption || "";
      componentDraft.culinaryUnitId = "";
      componentDraft.conversionId = "";
      componentDraft.isOpen = false;
      render();
    }));
    componentEditorRoot.querySelector("[data-component-culinary-unit]")?.addEventListener("change", (event) => {
      componentDraft.culinaryUnitId = event.currentTarget.value;
      componentDraft.conversionId = "";
      render();
    });
    componentEditorRoot.querySelector("[data-component-conversion]")?.addEventListener("change", (event) => {
      componentDraft.conversionId = event.currentTarget.value;
    });
    componentEditorRoot.querySelector("[data-component-quantity]")?.addEventListener("input", (event) => {
      componentDraft.quantity = event.currentTarget.value;
    });
    componentEditorRoot.querySelector("[data-component-quantity]")?.addEventListener("blur", (event) => {
      const value = parseBrazilianDecimal(event.currentTarget.value);
      if (!Number.isFinite(value)) return;
      event.currentTarget.value = formatMaskedNumber(value);
      componentDraft.quantity = event.currentTarget.value;
    });
    componentEditorRoot.querySelector("[data-component-loss]")?.addEventListener("input", (event) => {
      componentDraft.lossPercent = event.currentTarget.value;
    });
    componentEditorRoot.querySelector("[data-component-loss]")?.addEventListener("blur", (event) => {
      const value = parseBrazilianDecimal(event.currentTarget.value);
      if (!Number.isFinite(value)) return;
      event.currentTarget.value = formatMaskedNumber(value);
      componentDraft.lossPercent = event.currentTarget.value;
    });
    root.querySelector("[data-add-component]")?.addEventListener("click", () => {
      const target = root.querySelector("[data-component-target]")?.value || "";
      const quantity = componentDraft.quantity;
      const lossPercent = componentDraft.lossPercent;
      const normalizedQuantity = parseBrazilianDecimal(quantity);
      const normalizedLoss = parseBrazilianDecimal(lossPercent);
      const [targetType, targetId] = target.split(":");
      if (
        !targetId
        || !["product", "recipe"].includes(targetType)
        || normalizedQuantity <= 0
        || normalizedLoss < 0
        || normalizedLoss >= 100
        || (targetType === "product" && !componentDraft.culinaryUnitId)
        || (targetType === "product" && !componentDraft.conversionId)
      ) {
        error = "Informe componente, unidade culinária, conversão, quantidade maior que zero e perda entre 0 e 99,99%.";
        render();
        return;
      }
      form.components.push({
        targetType,
        ...(targetType === "recipe" ? { recipeId: targetId } : { productId: targetId }),
        culinaryUnitId: targetType === "product" ? componentDraft.culinaryUnitId : "",
        conversionId: targetType === "product" ? componentDraft.conversionId : "",
        culinaryUnitLabel: targetType === "product"
          ? (() => {
            const unit = culinaryUnits.find((item) => String(item.idCulinaryUnit) === String(componentDraft.culinaryUnitId));
            return unit ? formatCulinaryUnitName(unit) : "";
          })()
          : "",
        conversionLabel: targetType === "product"
          ? (() => {
            const conversion = conversions.find((item) => String(item.idCulinaryUnitConversion) === String(componentDraft.conversionId));
            return conversion ? `${conversion.fromNameCulinaryUnit} → ${conversion.toNameCulinaryUnit}` : "";
          })()
          : "",
        quantity: normalizedQuantity,
        lossPercent: normalizedLoss
      });
      componentDraft = {
        searchTerm: "",
        target: "",
        culinaryUnitId: "",
        conversionId: "",
        quantity: "1",
        lossPercent: "0",
        isOpen: false
      };
      error = "";
      render();
    });
    componentEditorRoot.querySelector("[data-save-component-edit]")?.addEventListener("click", () => {
      const target = componentEditorRoot.querySelector("[data-component-target]")?.value || componentDraft.target;
      const quantity = componentEditorRoot.querySelector("[data-component-quantity]")?.value
        ?? componentDraft.quantity;
      const lossPercent = componentEditorRoot.querySelector("[data-component-loss]")?.value
        ?? componentDraft.lossPercent;
      const culinaryUnitId = componentEditorRoot.querySelector("[data-component-culinary-unit]")?.value
        || componentDraft.culinaryUnitId;
      const conversionSelect = componentEditorRoot.querySelector("[data-component-conversion]");
      const conversionId = conversionSelect ? conversionSelect.value : componentDraft.conversionId;
      const normalizedQuantity = parseBrazilianDecimal(quantity);
      const normalizedLoss = parseBrazilianDecimal(lossPercent);
      const [targetType, targetId] = target.split(":");
      if (
        editingComponentIndex === null
        || !targetId
        || !["product", "recipe"].includes(targetType)
        || normalizedQuantity <= 0
        || normalizedLoss < 0
        || normalizedLoss >= 100
        || (targetType === "product" && !culinaryUnitId)
        || (targetType === "product" && !conversionId)
      ) {
        error = "Informe componente, unidade culinária, conversão, quantidade maior que zero e perda entre 0 e 99,99%.";
        render();
        return;
      }
      form.components[editingComponentIndex] = {
        targetType,
        ...(targetType === "recipe" ? { recipeId: targetId } : { productId: targetId }),
        culinaryUnitId: targetType === "product" ? culinaryUnitId : "",
        conversionId: targetType === "product" ? conversionId : "",
        culinaryUnitLabel: targetType === "product"
          ? (() => {
            const unit = culinaryUnits.find((item) => String(item.idCulinaryUnit) === String(culinaryUnitId));
            return unit ? formatCulinaryUnitName(unit) : "";
          })()
          : "",
        conversionLabel: targetType === "product"
          ? (() => {
            const conversion = conversions.find((item) => String(item.idCulinaryUnitConversion) === String(conversionId));
            return conversion ? `${conversion.fromNameCulinaryUnit} → ${conversion.toNameCulinaryUnit}` : "";
          })()
          : "",
        quantity: normalizedQuantity,
        lossPercent: normalizedLoss
      };
      editingComponentIndex = null;
      componentDraft = {
        searchTerm: "",
        target: "",
        culinaryUnitId: "",
        conversionId: "",
        quantity: "1",
        lossPercent: "0",
        isOpen: false
      };
      error = "";
      render();
    });
    root.querySelector("[data-cancel-component-edit]")?.addEventListener("click", () => {
      editingComponentIndex = null;
      componentDraft = {
        searchTerm: "",
        target: "",
        culinaryUnitId: "",
        conversionId: "",
        quantity: "1",
        lossPercent: "0",
        isOpen: false
      };
      error = "";
      render();
    });
    root.querySelector("[data-close-component-edit]")?.addEventListener("click", () => {
      editingComponentIndex = null;
      componentDraft = {
        searchTerm: "",
        target: "",
        culinaryUnitId: "",
        conversionId: "",
        quantity: "1",
        lossPercent: "0",
        isOpen: false
      };
      error = "";
      render();
    });
    root.querySelectorAll("[data-remove-component]").forEach((button) => button.addEventListener("click", () => {
      form.components.splice(Number(button.dataset.removeComponent), 1);
      render();
    }));
    root.querySelectorAll("[data-edit-component]").forEach((button) => button.addEventListener("click", () => {
      const index = Number(button.dataset.editComponent);
      const component = form.components[index];
      if (!component) return;
      editingComponentIndex = index;
      componentDraft = {
        searchTerm: "",
        target: `${component.targetType}:${component.targetType === "recipe" ? component.recipeId : component.productId}`,
        culinaryUnitId: component.culinaryUnitId || "",
        conversionId: component.conversionId || "",
        quantity: String(component.quantity ?? 1).replace(".", ","),
        lossPercent: String(component.lossPercent ?? 0).replace(".", ","),
        isOpen: false
      };
      error = "";
      render();
    }));
    root.querySelectorAll("[data-edit-recipe]").forEach((button) => button.addEventListener("click", () => {
      const recipe = recipes.find((item) => String(item.idRecipe) === button.dataset.editRecipe);
      if (recipe) startEditing(recipe);
    }));
    root.querySelectorAll("[data-view-recipe]").forEach((row) => {
      row.addEventListener("click", (event) => {
        if (event.target.closest("button")) return;
        const recipe = recipes.find((item) => String(item.idRecipe) === row.dataset.viewRecipe);
        if (recipe) startViewing(recipe);
      });
      row.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        const recipe = recipes.find((item) => String(item.idRecipe) === row.dataset.viewRecipe);
        if (recipe) startViewing(recipe);
      });
    });
    root.querySelectorAll("[data-delete-recipe]").forEach((button) => button.addEventListener("click", () => {
      const recipe = recipes.find((item) => String(item.idRecipe) === button.dataset.deleteRecipe);
      if (!recipe) return;
      void confirmAction({
        title: "Arquivar Receita ou Composição",
        message: `Arquivar "${recipe.nameRecipe}"?`,
        detail: "O registro deixará de aparecer nas listagens ativas, mas será preservado para histórico.",
        confirmLabel: "Arquivar",
        cancelLabel: "Cancelar"
      }).then((confirmed) => {
        if (!confirmed) return;
        return removeRecipe(button.dataset.deleteRecipe);
      }).catch((removeError) => {
        error = removeError instanceof Error ? removeError.message : "Falha ao excluir a receita.";
        render();
      });
    }));
    root.querySelectorAll("[data-move-component]").forEach((button) => button.addEventListener("click", () => {
      const index = Number(button.dataset.moveComponent);
      const offset = button.dataset.direction === "up" ? -1 : 1;
      const nextIndex = index + offset;
      if (nextIndex < 0 || nextIndex >= form.components.length) return;
      [form.components[index], form.components[nextIndex]] = [form.components[nextIndex], form.components[index]];
      render();
    }));
    root.querySelector("[data-clear-recipe]")?.addEventListener("click", resetForm);
  };

  render();
  void load();
  return root;
}
