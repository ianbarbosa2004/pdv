import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { apiFetch, getApiUrl } from "../shared/api.js";
import { confirmAction } from "../ui/confirmation-modal.js";
import { rerenderPreservingInputSelection } from "../ui/input-selection.js";
import { getContextualNavigationItems, renderContextualNavigationItems } from "../ui/contextual-navigation.js";
import { resolveNavigationHandler } from "../ui/navigation-routing.js";
import { clearRenderedFeedback, createFeedbackTimer, formatUpdatedRecipeStructures, renderSuccessFeedback } from "../ui/feedback.js";
import { calculateComponentCost } from "../shared/recipe.js";
import { formatBrazilianDecimal, parseBrazilianDecimal, roundCostUpToCents } from "../shared/decimal.js";
import { bindNumberMasks, formatMaskedNumber } from "../ui/number-mask.js";
import { installComboboxDismissal, rerenderComboboxSelection } from "../ui/combobox.js";
import { formatRecipeComponentLabel, formatRecipeComponentUnit } from "../shared/recipe-component.js";
import { formatProductOptionLabel } from "../shared/product.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

export const isEligibleFormationProduct = (product) => {
  const type = String(product.descriptionProductType || "").trim().toLocaleLowerCase("pt-BR");
  return ["mercadoria para revenda", "produto acabado", "produtos acabados"].includes(type);
};

export const filterFormationProducts = (products, { filter = "all", searchTerm = "" } = {}) => {
  const query = String(searchTerm).trim().toLocaleLowerCase("pt-BR");
  return products.filter(isEligibleFormationProduct).filter((product) => {
    const matchesFilter = filter === "all" || (filter === "with" ? product.formation : !product.formation);
    return matchesFilter && `${product.pdvCodeProduct || ""} ${product.nameProduct || ""}`.toLocaleLowerCase("pt-BR").includes(query);
  });
};

export const parseFormationNumber = (value) => {
  const text = String(value ?? "").trim().replace(/\s/g, "");
  if (!text) return NaN;
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  return Number(normalized);
};

export const formatFormationQuantity = (value) => {
  const numeric = parseFormationNumber(value);
  return Number.isFinite(numeric) ? numeric.toFixed(3) : "";
};

export const calculateFormationComponentCost = ({ quantity, unitCost }) =>
  calculateComponentCost({
    quantity: parseFormationNumber(quantity),
    unitCost: parseFormationNumber(unitCost),
    conversionFactor: 1
  }) || 0;

const formationNavigation = [
  ["technical-sheet", "Formação de Produtos"],
  ["recipes", "Receitas e Composições"],
  ["physical-states", "Estados Físicos"],
  ["culinary-conversions", "Conversões"]
];

export function createProductFormationScreen({ onBack, onRecipes, ...menuHandlers }) {
  const root = document.createElement("main");
  let products = [];
  let componentProducts = [];
  let recipes = [];
  let selectedProduct = null;
  let form = { components: [], notesRecipe: "" };
  let componentDraft = { target: "", details: "", quantity: "1", searchTerm: "", open: false };
  let searchTerm = "";
  let filter = "all";
  let loading = true;
  let saving = false;
  let error = "";
  let message = "";
  let duplicateSource = null;
  let duplicateTargetId = "";
  let duplicateTargetSearchTerm = "";
  let duplicateTargetOpen = false;
  let duplicating = false;
  const scheduleMessageClear = createFeedbackTimer();

  const productById = (id) => products.find((product) => String(product.idProduct) === String(id));
  const componentProductById = (id) => componentProducts.find((product) => String(product.idProduct) === String(id));
  const recipeById = (id) => recipes.find((recipe) => String(recipe.idRecipe) === String(id));
  const componentLabel = (component) => {
    if (component.targetType === "recipe") {
      const recipe = recipeById(component.recipeId);
      return formatRecipeComponentLabel({
        kindRecipe: component.componentRecipeKind || recipe?.kindRecipe,
        nameRecipe: component.componentRecipeName || recipe?.nameRecipe
      });
    }
    return component.componentProductName || componentProductById(component.productId)?.nameProduct || "Produto";
  };
  const componentUnit = (component) => component.targetType === "recipe"
    ? formatRecipeComponentUnit({
      codeUnit: component.componentRecipeUnitCode,
      descriptionUnit: component.componentRecipeUnitDescription
    }) || "—"
    : formatRecipeComponentUnit({
      codeUnit: component.componentCodeUnit,
      descriptionUnit: component.componentDescriptionUnit
    }) || "—";
  const componentCost = (component) => {
    if (component.targetType === "recipe") {
      const snapshotCost = Number(component.costFormationComponent);
      if (form.readOnly && Number.isFinite(snapshotCost)) return snapshotCost;
      const recipe = recipeById(component.recipeId);
      const unitCost = Number(
        recipe?.idResultProductRecipe != null
          ? recipe.unitCostFormation
          : recipe?.unitCostRecipe
      );
      return Number.isFinite(unitCost)
        ? calculateFormationComponentCost({ quantity: component.quantity, unitCost })
        : 0;
    }
    const product = componentProductById(component.productId);
    return calculateFormationComponentCost({
      quantity: component.quantity,
      unitCost: product?.costPriceProduct
    });
  };
  const totalComponentCost = () => (
    roundCostUpToCents(form.components.reduce((total, component) => total + componentCost(component), 0)) || 0
  );
  const load = async ({ renderState = true } = {}) => {
    loading = true;
    if (renderState) render();
    try {
      const response = await apiFetch(`${getApiUrl()}/api/product-formations`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar as Fichas Técnicas.");
      products = Array.isArray(payload.products) ? payload.products : [];
      componentProducts = Array.isArray(payload.componentProducts) ? payload.componentProducts : [];
      recipes = Array.isArray(payload.recipes) ? payload.recipes : [];
      if (recipes.some((recipe) => !recipe.kindRecipe)) {
        const recipeResponse = await apiFetch(`${getApiUrl()}/api/recipes?includeArchived=1`);
        const recipePayload = await recipeResponse.json();
        if (!recipeResponse.ok) {
          throw new Error(recipePayload.error || "Não foi possível carregar os tipos das Receitas.");
        }
        const recipeTypes = new Map(
          (Array.isArray(recipePayload.recipes) ? recipePayload.recipes : [])
            .map((recipe) => [String(recipe.idRecipe), recipe])
        );
        recipes = recipes.map((recipe) => ({
          ...recipe,
          kindRecipe: recipe.kindRecipe || recipeTypes.get(String(recipe.idRecipe))?.kindRecipe
        }));
      }
      if (selectedProduct) {
        selectedProduct = products.find((product) => String(product.idProduct) === String(selectedProduct.idProduct)) || null;
      }
      error = "";
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Falha ao carregar as Fichas Técnicas.";
    } finally {
      loading = false;
      if (renderState) render();
    }
  };

  const resetDraft = () => {
    componentDraft = { target: "", details: "", quantity: "1", searchTerm: "", open: false };
  };

  const openProduct = (product, editable = false) => {
    selectedProduct = product;
    form = {
      components: (product.formation?.components || []).map((component) => ({ ...component })),
      notesRecipe: product.formation?.notesRecipe || "",
      totalCostFormation: Number(product.formation?.totalCostFormation || 0)
      ,unitCostFormation: Number(product.formation?.unitCostFormation || 0)
    };
    resetDraft();
    if (!editable) form.readOnly = true;
    else delete form.readOnly;
    render();
  };

  const openProductFresh = async (product, editable = false) => {
    if (!product) return;
    await load();
    openProduct(productById(product.idProduct) || product, editable);
  };

  const duplicateFormation = async () => {
    const source = duplicateSource;
    const target = productById(duplicateTargetId);
    if (!source || !target || duplicating) return;
    if (target.formation && !await confirmAction({
      title: "Substituir Ficha Técnica",
      detail: `A ficha de "${target.nameProduct}" será substituída pela cópia. Essa ação não pode ser desfeita.`,
      confirmLabel: "Substituir ficha"
    })) return;
    duplicating = true;
    error = "";
    render();
    try {
      const response = await apiFetch(`${getApiUrl()}/api/product-formations/${target.idProduct}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          components: (source.formation?.components || []).map((component) => ({
            productId: component.productId,
            recipeId: component.recipeId,
            details: component.details || "",
            quantity: component.quantity,
            costFormationComponent: component.costFormationComponent
          })),
          notesRecipe: source.formation?.notesRecipe || "",
          totalCostFormation: source.formation?.totalCostFormation || 0,
          unitCostFormation: source.formation?.unitCostFormation || 0
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível duplicar a Ficha Técnica.");
      message = `Ficha Técnica duplicada para "${target.nameProduct}".`;
      duplicateSource = null;
      duplicateTargetId = "";
      duplicateTargetSearchTerm = "";
      duplicateTargetOpen = false;
      searchTerm = "";
      await load({ renderState: false });
      openProduct(productById(target.idProduct), false);
      scheduleMessageClear(() => {
        message = "";
        clearRenderedFeedback(root);
      });
    } catch (duplicateError) {
      error = duplicateError instanceof Error ? duplicateError.message : "Falha ao duplicar a Ficha Técnica.";
      render();
    } finally {
      duplicating = false;
    }
  };

  const componentOptions = () => {
    const query = componentDraft.searchTerm.trim().toLocaleLowerCase("pt-BR");
    const productOptions = componentProducts
      .filter((product) => String(product.idProduct) !== String(selectedProduct?.idProduct))
      .filter((product) => `${product.nameProduct} ${product.pdvCodeProduct || ""} ${product.skuProduct || ""}`.toLocaleLowerCase("pt-BR").includes(query))
      .slice(0, 100)
      .map((product) => ({ value: `product:${product.idProduct}`, label: formatProductOptionLabel(product) }));
    const recipeOptions = recipes
      .filter((recipe) => String(recipe.idRecipe) !== String(selectedProduct?.formation?.idRecipe))
      .filter((recipe) => recipe.nameRecipe.toLocaleLowerCase("pt-BR").includes(query))
      .slice(0, 100)
      .map((recipe) => ({ value: `recipe:${recipe.idRecipe}`, label: formatRecipeComponentLabel(recipe) }));
    return [...productOptions, ...recipeOptions].slice(0, 100);
  };

  const addComponent = () => {
    const [targetType, targetId] = String(componentDraft.target).split(":");
    const product = targetType === "product" ? componentProductById(targetId) : null;
    const recipe = targetType === "recipe" ? recipeById(targetId) : null;
    if (!targetId || !componentDraft.quantity || Number(componentDraft.quantity.replace(",", ".")) <= 0) {
      error = "Informe um componente e uma quantidade maior que zero.";
      render();
      return;
    }
    const component = {
      targetType,
      productId: targetType === "product" ? Number(targetId) : null,
      recipeId: targetType === "recipe" ? Number(targetId) : null,
      componentProductName: product?.nameProduct || "",
      componentCodeUnit: product?.codeUnit || "",
      componentDescriptionUnit: product?.descriptionUnit || "",
      componentRecipeName: recipe?.nameRecipe || "",
      componentRecipeUnitCode: recipe?.yieldUnitCode || "",
      componentRecipeUnitDescription: recipe?.yieldUnitDescription || "",
      details: componentDraft.details,
      quantity: componentDraft.quantity
    };
    form.components.push(component);
    resetDraft();
    error = "";
    render();
  };

  const saveComponentEdit = () => {
    const index = Number(componentDraft.editingIndex);
    const [targetType, targetId] = String(componentDraft.target).split(":");
    const product = targetType === "product" ? componentProductById(targetId) : null;
    const recipe = targetType === "recipe" ? recipeById(targetId) : null;
    const quantity = Number(String(componentDraft.quantity || "").replace(",", "."));
    if (!Number.isInteger(index) || !targetId || (!product && !recipe) || !Number.isFinite(quantity) || quantity <= 0) {
      error = "Informe um componente e uma quantidade maior que zero.";
      render();
      return;
    }
    form.components[index] = {
      ...form.components[index],
      targetType,
      productId: product ? Number(targetId) : null,
      recipeId: recipe ? Number(targetId) : null,
      componentProductName: product?.nameProduct || "",
      componentCodeUnit: product?.codeUnit || "",
      componentDescriptionUnit: product?.descriptionUnit || "",
      componentRecipeName: recipe?.nameRecipe || "",
      componentRecipeUnitCode: recipe?.yieldUnitCode || "",
      componentRecipeUnitDescription: recipe?.yieldUnitDescription || "",
      details: componentDraft.details,
      quantity: componentDraft.quantity
    };
    componentDraft = { target: "", details: "", quantity: "1", searchTerm: "", open: false };
    error = "";
    render();
  };

  const save = async () => {
    if (!selectedProduct || saving) return;
    if (!form.components.length) {
      error = "Informe ao menos um componente.";
      render();
      return;
    }
    saving = true;
    error = "";
    render();
    try {
      const response = await apiFetch(`${getApiUrl()}/api/product-formations/${selectedProduct.idProduct}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          components: form.components.map((component) => ({
            productId: component.productId,
            recipeId: component.recipeId,
            details: component.details || "",
            quantity: component.quantity,
            costFormationComponent: componentCost(component)
          })),
          notesRecipe: form.notesRecipe,
          totalCostFormation: totalComponentCost()
          ,unitCostFormation: totalComponentCost()
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar a Ficha Técnica.");
      message = payload.updatedRecipeCount
        ? `Ficha Técnica salva com sucesso. ${formatUpdatedRecipeStructures(payload.updatedRecipeCount)}`
        : "Ficha Técnica salva com sucesso.";
      searchTerm = "";
      form.readOnly = true;
      await load({ renderState: false });
      scheduleMessageClear(() => {
        message = "";
        clearRenderedFeedback(root);
      });
    } catch (saveError) {
      error = saveError instanceof Error ? saveError.message : "Falha ao salvar a Ficha Técnica.";
    } finally {
      saving = false;
      render();
    }
  };

  const remove = async (product) => {
    const confirmed = await confirmAction({
      title: "Excluir Ficha Técnica",
      detail: `A ficha de "${product.nameProduct}" será excluída. O produto será mantido.`,
      confirmLabel: "Excluir ficha"
    });
    if (!confirmed) return;
    try {
      const response = await apiFetch(`${getApiUrl()}/api/product-formations/${product.idProduct}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível excluir a Ficha Técnica.");
      if (selectedProduct?.idProduct === product.idProduct) selectedProduct = null;
      message = "Ficha Técnica excluída com sucesso.";
      await load({ renderState: false });
      scheduleMessageClear(() => {
        message = "";
        clearRenderedFeedback(root);
      });
      render();
    } catch (removeError) {
      error = removeError instanceof Error ? removeError.message : "Falha ao excluir a Ficha Técnica.";
      render();
    }
  };

  const renderComponentEntry = (readOnly = false, initial = false) => {
    const pickerOpen = componentDraft.open && !Number.isInteger(componentDraft.editingIndex);
    const targetProduct = componentDraft.target.startsWith("product:")
      ? componentProductById(componentDraft.target.slice(8))
      : null;
    const targetRecipe = componentDraft.target.startsWith("recipe:")
      ? recipeById(componentDraft.target.slice(7))
      : null;
    return `
      <div class="recipe-component-entry formation-component-entry">
        <div class="recipe-component-picker-row">
          <div class="form-field recipe-component-picker classic-combobox formation-component-picker">
            <span>Componente</span>
            <input type="hidden" data-component-target value="${escapeHtml(componentDraft.target)}" />
            <button type="button" class="classic-select-trigger" data-component-toggle aria-haspopup="listbox" aria-expanded="${pickerOpen ? "true" : "false"}" ${readOnly ? "disabled" : ""}>${escapeHtml(targetProduct ? formatProductOptionLabel(targetProduct) : targetRecipe ? formatRecipeComponentLabel(targetRecipe) : "Selecione um componente")}</button>
            ${!readOnly && pickerOpen ? `<div class="recipe-component-options formation-component-options">
              <input data-component-search type="search" autocomplete="off" value="${escapeHtml(componentDraft.searchTerm)}" placeholder="Pesquisar componente..." aria-label="Pesquisar componente" />
            <div class="formation-component-option-list">${componentOptions().map((option) => `<button type="button" class="recipe-component-option" data-component-option="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>`).join("") || '<span class="classic-empty">Nenhum componente encontrado.</span>'}</div>
            </div>` : ""}
          </div>
          <label class="form-field"><span>Detalhes</span><input data-component-details maxlength="255" value="${escapeHtml(componentDraft.details)}" placeholder="Ex.: usar frio, 3 colheres" ${readOnly ? "readonly disabled" : ""} /></label>
        </div>
        <div class="recipe-component-input-grid">
          <label class="form-field"><span>Unidade Final do Componente</span><input readonly disabled value="${escapeHtml(targetProduct ? formatRecipeComponentUnit(targetProduct) : targetRecipe?.yieldUnitDescription || "")}" /></label>
          <label class="form-field"><span>Quantidade</span><input data-component-quantity data-number-mask="fractional-3" inputmode="decimal" value="${escapeHtml(initial ? "" : formatMaskedNumber(componentDraft.quantity, 3))}" ${readOnly || !(targetProduct || targetRecipe) ? "readonly disabled" : ""} /></label>
        </div>
        ${readOnly ? "" : `<button class="classic-button" type="button" data-add-component ${targetProduct || targetRecipe ? "" : "disabled"}>Adicionar componente</button>`}
      </div>
    `;
  };

  const renderComponents = (readOnly = false) => form.components.length
    ? `<div class="recipe-components-table-wrapper"><table class="classic-table recipe-components-table formation-components-table"><thead><tr><th class="component-index-column">#</th><th class="component-name-column">Componente</th><th class="component-quantity-column">Quantidade</th><th class="component-unit-column">Unidade final</th><th class="component-cost-column">Custo</th>${readOnly ? "" : '<th class="actions-column component-actions-column">Ações</th>'}</tr></thead><tbody>${form.components.map((component, index) => `<tr><td class="component-index-column">${index + 1}</td><td class="component-name-column"><div>${escapeHtml(componentLabel(component))}</div>${component.details ? `<em class="recipe-component-details">${escapeHtml(component.details)}</em>` : ""}</td>        <td class="component-quantity-column">${escapeHtml(formatBrazilianDecimal(component.quantity, 3))}</td><td class="component-unit-column">${escapeHtml(componentUnit(component))}</td><td class="component-cost-column">${escapeHtml(Number(componentCost(component)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}</td>${readOnly ? "" : `<td class="actions-column component-actions-column recipe-order-actions"><button class="icon-button edit" type="button" data-edit-component="${index}" aria-label="Editar componente" title="Editar componente"><i data-lucide="pencil"></i></button><button class="icon-button" type="button" data-move-component="${index}" data-direction="up" aria-label="Mover componente para cima" title="Mover para cima" ${index === 0 ? "disabled" : ""}><i data-lucide="arrow-up"></i></button><button class="icon-button" type="button" data-move-component="${index}" data-direction="down" aria-label="Mover componente para baixo" title="Mover para baixo" ${index === form.components.length - 1 ? "disabled" : ""}><i data-lucide="arrow-down"></i></button><button class="icon-button delete" type="button" data-remove-component="${index}" aria-label="Remover componente" title="Remover componente"><i data-lucide="trash-2"></i></button></td>`}</tr>`).join("")}</tbody><tfoot><tr><th colspan="${readOnly ? 4 : 5}">Custo total estimado</th><th>${escapeHtml(totalComponentCost().toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}</th></tr></tfoot></table></div>`
    : '<p class="classic-empty">Nenhum componente informado.</p>';

  const renderForm = () => {
    const initial = !selectedProduct;
    const readOnly = initial || Boolean(form.readOnly);
    return `<form class="classic-form-panel formation-editor-panel" data-formation-form>
      <div class="classic-panel-header">${initial ? "Ficha Técnica" : readOnly ? "Visualização" : "Editar Ficha Técnica"}</div>
      <div class="classic-form-body">
        ${error ? `<p class="error-message formation-form-error" role="alert">${escapeHtml(error)}</p>` : ""}
        <label class="form-field"><span>Produto Comercial</span><input readonly disabled placeholder="Selecione um produto na listagem" value="${escapeHtml(selectedProduct ? formatProductOptionLabel(selectedProduct) : "")}" /></label>
        <label class="form-field"><span>Observações</span><textarea maxlength="500" data-formation-notes rows="4" ${readOnly ? "readonly" : ""}>${escapeHtml(form.notesRecipe || "")}</textarea></label>
        <div class="classic-panel-header nested-panel-header">Componente</div>
        ${renderComponentEntry(readOnly, initial)}
        <section class="formation-component-panel">
          <div class="classic-panel-header nested-panel-header">Componentes</div>
          <div class="recipe-component-list formation-component-list">${renderComponents(readOnly)}</div>
        </section>
      </div>
      <div class="classic-form-actions">${initial ? "" : readOnly ? '<button class="classic-button primary" type="button" data-edit-formation>Editar</button>' : `<button class="classic-button primary" type="submit" ${saving ? "disabled" : ""}>Salvar</button><button class="classic-button" type="button" data-cancel-formation>Cancelar</button>`}</div>
    </form>`;
  };

  const renderComponentEditor = () => {
    if (!Number.isInteger(componentDraft.editingIndex)) return "";
    const pickerOpen = componentDraft.open;
    const targetProduct = componentDraft.target.startsWith("product:")
      ? componentProductById(componentDraft.target.slice(8))
      : null;
    const targetRecipe = componentDraft.target.startsWith("recipe:")
      ? recipeById(componentDraft.target.slice(7))
      : null;
    return `<div class="page-feedback recipe-component-modal formation-component-modal" data-component-editor-modal role="dialog" aria-modal="true" aria-labelledby="formation-component-editor-title">
      <div class="feedback-modal-panel recipe-component-modal-panel">
        <div class="classic-panel-header" id="formation-component-editor-title"><span>Editar componente</span><button class="modal-close-button" data-close-component-edit type="button" aria-label="Fechar edição do componente" title="Fechar"><i data-lucide="x"></i></button></div>
        <div class="classic-form-body">
          <div class="recipe-component-picker-row">
            <div class="form-field recipe-component-picker classic-combobox"><span>Componente</span>
              <input type="hidden" data-component-target value="${escapeHtml(componentDraft.target)}" />
              <button type="button" class="classic-select-trigger" data-component-toggle aria-haspopup="listbox" aria-expanded="${pickerOpen ? "true" : "false"}">${escapeHtml(targetProduct ? formatProductOptionLabel(targetProduct) : targetRecipe ? formatRecipeComponentLabel(targetRecipe) : "Selecione um componente")}</button>
              ${pickerOpen ? `<div class="recipe-component-options formation-component-options"><input data-component-search type="search" value="${escapeHtml(componentDraft.searchTerm)}" placeholder="Pesquisar componente..." /><div class="formation-component-option-list">${componentOptions().map((option) => `<button type="button" class="recipe-component-option" data-component-option="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>`).join("")}</div></div>` : ""}
            </div>
            <label class="form-field"><span>Detalhes</span><input data-component-details maxlength="255" value="${escapeHtml(componentDraft.details)}" placeholder="Ex.: usar frio, 3 colheres" /></label>
          </div>
          <div class="recipe-component-input-grid">
            <label class="form-field"><span>Unidade Final do Componente</span><input readonly disabled value="${escapeHtml(targetProduct ? formatRecipeComponentUnit(targetProduct) : targetRecipe?.yieldUnitDescription || "")}" /></label>
            <label class="form-field"><span>Quantidade</span><input data-component-quantity data-number-mask="fractional-3" inputmode="decimal" value="${escapeHtml(formatMaskedNumber(componentDraft.quantity, 3))}" /></label>
          </div>
        </div>
        <div class="classic-form-actions"><button class="classic-button primary" data-save-component-edit type="button">Salvar componente</button><button class="classic-button" data-cancel-component-edit type="button">Cancelar</button></div>
      </div>
    </div>`;
  };

  const render = () => {
    const visibleProducts = filterFormationProducts(products, { filter, searchTerm });
    root.className = "catalog-screen product-formation-screen";
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - Formação de Produtos</strong><span>Operador: Operador</span></header>
      ${renderMainMenu()}
      <div class="classic-toolbar screen-context-bar" aria-label="Navegação contextual">
        ${renderContextualNavigationItems(getContextualNavigationItems("technical-sheet", formationNavigation), "technical-sheet", "formation-nav")}
      </div>
      <section class="classic-content formation-content">
        ${renderSuccessFeedback(message, escapeHtml)}
        ${renderForm()}
        <section class="classic-grid-panel formation-list-panel recipe-list-panel">
          <div class="classic-panel-header classic-list-header"><span>Produtos a venda</span><input class="classic-list-search" data-formation-search type="search" placeholder="Pesquisar..." aria-label="Pesquisar produtos a venda" value="${escapeHtml(searchTerm)}" /></div>
          <div class="recipe-status-filters formation-filters" role="group" aria-label="Filtrar produtos por ficha">${[["all", "Todos"], ["with", "Com Ficha"], ["without", "Sem Ficha"]].map(([value, label]) => `<button class="recipe-status-filter ${filter === value ? "is-active" : ""}" type="button" data-formation-filter="${value}" aria-pressed="${filter === value ? "true" : "false"}">${label} <span>${value === "all" ? products.filter(isEligibleFormationProduct).length : products.filter((product) => isEligibleFormationProduct(product) && (value === "with" ? product.formation : !product.formation)).length}</span></button>`).join("")}</div>
          <div class="classic-grid-wrapper">${loading ? '<p class="classic-empty">Carregando produtos...</p>' : `<table class="classic-table formation-products-table"><colgroup><col class="formation-product-pdv-column" /><col class="formation-product-name-column" /><col class="formation-product-actions-column" /></colgroup><thead><tr><th class="formation-product-pdv-column">#PDV</th><th class="formation-product-name-column">Nome</th><th class="actions-column formation-product-actions-column">Ações</th></tr></thead><tbody>${visibleProducts.map((product) => `<tr data-formation-product="${product.idProduct}" class="${product.formation ? "formation-has-sheet" : ""}"><td class="formation-product-pdv-column">${escapeHtml(product.pdvCodeProduct || product.idProduct)}</td><td class="formation-product-name-column">${escapeHtml(product.nameProduct)}</td><td class="actions-column formation-product-actions-column"><button class="icon-button edit" type="button" data-edit-formation-product="${product.idProduct}" title="Editar ficha" aria-label="Editar ficha"><i data-lucide="pencil"></i></button>          <button class="icon-button" type="button" data-duplicate-formation="${product.idProduct}" title="Duplicar ficha" aria-label="Duplicar ficha" ${product.formation ? "" : "disabled"}><i data-lucide="copy"></i></button><button class="icon-button delete" type="button" data-delete-formation-product="${product.idProduct}" title="Excluir ficha" aria-label="Excluir ficha" ${product.formation ? "" : "disabled"}><i data-lucide="trash-2"></i></button></td></tr>`).join("") || '<tr><td colspan="3">Nenhum produto encontrado.</td></tr>'}</tbody></table>`}</div>
        </section>
      </section>
      ${renderComponentEditor()}
      ${duplicateSource ? `<div class="classic-modal-backdrop formation-duplicate-backdrop" data-formation-duplicate-backdrop><section class="classic-modal formation-duplicate-modal" role="dialog" aria-modal="true" aria-labelledby="formation-duplicate-title"><div class="classic-panel-header modal-panel-header"><span id="formation-duplicate-title">Duplicar Ficha Técnica</span><button class="modal-close-button" type="button" data-close-duplicate-formation aria-label="Fechar" title="Fechar"><i data-lucide="x"></i></button></div><div class="classic-form-body"><p>Escolha o Produto Comercial que receberá a cópia de <strong>${escapeHtml(duplicateSource.nameProduct)}</strong>.</p><div class="form-field classic-combobox recipe-component-picker formation-duplicate-picker"><span>Produto destino</span><button type="button" class="classic-select-trigger" data-duplicate-target-toggle aria-haspopup="listbox" aria-expanded="${duplicateTargetOpen ? "true" : "false"}">${escapeHtml(duplicateTargetId ? formatProductOptionLabel(productById(duplicateTargetId)) : "Selecione um produto")}</button>${duplicateTargetOpen ? `<div class="recipe-component-options formation-component-options"><input data-duplicate-target-search type="search" autocomplete="off" value="${escapeHtml(duplicateTargetSearchTerm)}" placeholder="Pesquisar produto..." aria-label="Pesquisar produto destino" /><div class="formation-component-option-list">${products.filter((product) => product.idProduct !== duplicateSource.idProduct && `${product.nameProduct || ""} ${product.pdvCodeProduct || ""} ${product.skuProduct || ""}`.toLocaleLowerCase("pt-BR").includes(duplicateTargetSearchTerm.trim().toLocaleLowerCase("pt-BR"))).map((product) => `<button type="button" class="recipe-component-option" data-duplicate-target-option="${product.idProduct}">${escapeHtml(formatProductOptionLabel(product))}</button>`).join("") || '<span class="classic-empty">Nenhum produto encontrado.</span>'}</div></div>` : ""}</div>${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}</div><div class="classic-form-actions"><button class="classic-button primary" type="button" data-confirm-duplicate-formation ${duplicateTargetId && !duplicating ? "" : "disabled"}>${duplicating ? "Duplicando..." : "Duplicar ficha"}</button><button class="classic-button" type="button" data-close-duplicate-formation>Cancelar</button></div></section></div>` : ""}
    `;
    renderLucideIcons(root);
    bindMainMenu(root, menuHandlers);
    root.querySelectorAll("[data-formation-nav]").forEach((button) => button.addEventListener("click", () => {
      const handler = resolveNavigationHandler(menuHandlers, button.dataset.formationNav)
        || resolveNavigationHandler(window.__PDV_NAVIGATION_HANDLERS__, button.dataset.formationNav);
      handler?.();
    }));
    root.querySelector("[data-formation-search]")?.addEventListener("input", (event) => {
      searchTerm = event.currentTarget.value;
      rerenderPreservingInputSelection(event.currentTarget, render, () => root.querySelector("[data-formation-search]"));
    });
    root.querySelectorAll("[data-formation-filter]").forEach((button) => button.addEventListener("click", () => {
      filter = button.dataset.formationFilter;
      render();
    }));
    root.querySelectorAll("[data-formation-product]").forEach((row) => row.addEventListener("click", () => {
      void openProductFresh(productById(row.dataset.formationProduct));
    }));
    root.querySelectorAll("[data-edit-formation-product]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      void openProductFresh(productById(button.dataset.editFormationProduct), true);
    }));
    root.querySelectorAll("[data-duplicate-formation]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      const product = productById(button.dataset.duplicateFormation);
      if (!product?.formation) return;
      duplicateSource = product;
      duplicateTargetId = "";
      duplicateTargetSearchTerm = "";
      duplicateTargetOpen = false;
      error = "";
      render();
    }));
    root.querySelectorAll("[data-duplicate-target-toggle]").forEach((toggle) => toggle.addEventListener("click", () => {
      duplicateTargetOpen = !duplicateTargetOpen;
      render();
      root.querySelector("[data-duplicate-target-search]")?.focus();
    }));
    root.querySelector("[data-duplicate-target-search]")?.addEventListener("input", (event) => {
      duplicateTargetSearchTerm = event.currentTarget.value;
      rerenderPreservingInputSelection(event.currentTarget, render, () => root.querySelector("[data-duplicate-target-search]"));
    });
    root.querySelectorAll("[data-duplicate-target-option]").forEach((button) => button.addEventListener("click", () => {
      duplicateTargetId = button.dataset.duplicateTargetOption;
      duplicateTargetSearchTerm = "";
      duplicateTargetOpen = false;
      rerenderComboboxSelection(
        render,
        () => root.querySelector("[data-duplicate-target-toggle]")
      );
    }));
    root.querySelectorAll("[data-confirm-duplicate-formation]").forEach((button) => button.addEventListener("click", () => {
      void duplicateFormation();
    }));
    root.querySelectorAll("[data-close-duplicate-formation]").forEach((button) => button.addEventListener("click", () => {
      duplicateSource = null;
      duplicateTargetId = "";
      duplicateTargetSearchTerm = "";
      duplicateTargetOpen = false;
      error = "";
      render();
    }));
    root.querySelector("[data-formation-duplicate-backdrop]")?.addEventListener("click", (event) => {
      if (event.target !== event.currentTarget) return;
      duplicateSource = null;
      duplicateTargetId = "";
      duplicateTargetSearchTerm = "";
      duplicateTargetOpen = false;
      error = "";
      render();
    });
    root.querySelectorAll("[data-delete-formation-product]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      const product = productById(button.dataset.deleteFormationProduct);
      if (product?.formation) void remove(product);
    }));
    root.querySelector("[data-formation-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void save();
    });
    root.querySelector("[data-edit-formation]")?.addEventListener("click", () => {
      delete form.readOnly;
      render();
    });
    root.querySelector("[data-cancel-formation]")?.addEventListener("click", () => openProduct(selectedProduct));
    root.querySelectorAll("[data-component-toggle]").forEach((toggle) => toggle.addEventListener("click", () => {
      componentDraft.open = !componentDraft.open;
      render();
      root.querySelector("[data-component-search]")?.focus();
    }));
    root.querySelector("[data-component-search]")?.addEventListener("input", (event) => {
      componentDraft.searchTerm = event.currentTarget.value;
      rerenderPreservingInputSelection(event.currentTarget, render, () => root.querySelector("[data-component-search]"));
    });
    root.querySelectorAll("[data-component-option]").forEach((button) => button.addEventListener("click", () => {
      componentDraft.target = button.dataset.componentOption;
      componentDraft.open = false;
      rerenderComboboxSelection(
        render,
        () => root.querySelector("[data-component-toggle]")
      );
    }));
    root.querySelector("[data-component-details]")?.addEventListener("input", (event) => { componentDraft.details = event.currentTarget.value; });
    root.querySelector("[data-formation-notes]")?.addEventListener("input", (event) => {
      form.notesRecipe = event.currentTarget.value;
    });
    root.querySelector("[data-component-editor-modal] [data-component-details]")?.addEventListener("input", (event) => {
      componentDraft.details = event.currentTarget.value;
    });
    root.querySelectorAll("[data-component-quantity]").forEach((input) => {
      input.addEventListener("input", (event) => { componentDraft.quantity = event.currentTarget.value; });
      input.addEventListener("blur", (event) => {
        const value = parseBrazilianDecimal(event.currentTarget.value);
        if (!Number.isFinite(value)) return;
        event.currentTarget.value = formatMaskedNumber(value, 3);
        componentDraft.quantity = event.currentTarget.value;
      });
    });
    root.querySelector("[data-add-component]")?.addEventListener("click", addComponent);
    root.querySelector("[data-save-component-edit]")?.addEventListener("click", saveComponentEdit);
    root.querySelector("[data-close-component-edit]")?.addEventListener("click", () => {
      componentDraft = { target: "", details: "", quantity: "1", searchTerm: "", open: false };
      error = "";
      render();
    });
    root.querySelector("[data-cancel-component-edit]")?.addEventListener("click", () => {
      componentDraft = { target: "", details: "", quantity: "1", searchTerm: "", open: false };
      error = "";
      render();
    });
    root.querySelectorAll("[data-remove-component]").forEach((button) => button.addEventListener("click", () => {
      form.components.splice(Number(button.dataset.removeComponent), 1);
      render();
    }));
    root.querySelectorAll("[data-move-component]").forEach((button) => button.addEventListener("click", () => {
      const index = Number(button.dataset.moveComponent);
      const target = button.dataset.direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= form.components.length) return;
      [form.components[index], form.components[target]] = [form.components[target], form.components[index]];
      render();
    }));
    root.querySelectorAll("[data-edit-component]").forEach((button) => button.addEventListener("click", () => {
      const index = Number(button.dataset.editComponent);
      const component = form.components[index];
      if (!component) return;
      componentDraft = {
        target: `${component.targetType}:${component.targetType === "product" ? component.productId : component.recipeId}`,
        details: component.details || "",
        quantity: String(component.quantity || "1"),
        searchTerm: "",
        open: false,
        editingIndex: index
      };
      render();
    }));
    bindNumberMasks(root);
  };

  installComboboxDismissal(root, {
    isOpen: () => componentDraft.open || duplicateTargetOpen,
    close: () => {
      componentDraft.open = false;
      duplicateTargetOpen = false;
      render();
    }
  });
  render();
  void load();
  return root;
}
