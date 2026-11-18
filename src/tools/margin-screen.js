import { apiFetch, getApiUrl } from "../shared/api.js";
import { calculateCmvPrice, calculateMarginMetrics } from "../shared/margin.js";
import { confirmAction } from "../ui/confirmation-modal.js";
import { renderLucideIcons } from "../ui/icons.js";
import { rerenderPreservingInputSelection } from "../ui/input-selection.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { getContextualNavigationItems, renderContextualNavigationItems } from "../ui/contextual-navigation.js";
import { resolveNavigationHandler } from "../ui/navigation-routing.js";
import { clearRenderedFeedback, createFeedbackTimer, renderSuccessFeedback } from "../ui/feedback.js";
import { buildViewsGroupTree } from "./views-model.js";

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatPercent = (value) =>
  value === null || value === undefined || !Number.isFinite(Number(value))
    ? "—"
    : `${Number(value).toFixed(2).replace(".", ",")}%`;

const formatMoney = (value) =>
  value === null || value === undefined || !Number.isFinite(Number(value))
    ? "—"
    : `R$ ${Number(value).toFixed(2).replace(".", ",")}`;

const formatSnapshotDate = (value) => {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/u);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
};

const formatMarginState = (value) => ({
  red: "Vermelho",
  yellow: "Amarelo",
  green: "Verde"
}[String(value ?? "")] || "Não informado");

const viewsNavigation = [
  ["groups-products", "Grupos x Produtos"],
  ["margin", "Margem"],
  ["no-cost", "Sem Custo"],
  ["no-physical-state", "Sem Estado Físico"],
  ["cost-divergences", "Divergência entre Custos"],
  ["recipe-revisions", "Revisões de Fichas"]
];

export function createMarginScreen({
  onBack,
  onGroupsProducts,
  onMargin,
  onNoCost,
  onNoPhysicalState,
  onCostDivergences,
  onRecipeRevisions,
  ...menuHandlers
} = {}) {
  const root = document.createElement("main");
  let loading = true;
  let error = "";
  let products = [];
  let groups = [];
  let searchTerm = "";
  let selectedGroupId = "";
  let selectedStates = new Set();
  let viewProduct = null;
  let viewCmv = "";
  let viewError = "";
  let submitting = false;
  let historyProduct = null;
  let historySnapshots = [];
  let historyError = "";
  let sortState = { key: "name", direction: "asc" };
  let message = "";
  const scheduleMessageClear = createFeedbackTimer();

  const load = async () => {
    loading = true;
    error = "";
    render();
    try {
      const [productsResponse, groupsResponse] = await Promise.all([
        apiFetch(`${getApiUrl()}/api/margin/products`),
        apiFetch(`${getApiUrl()}/api/groups?includeInactive=1`)
      ]);
      const [productsPayload, groupsPayload] = await Promise.all([
        productsResponse.json(),
        groupsResponse.json()
      ]);
      if (!productsResponse.ok) throw new Error(productsPayload.error || "Não foi possível carregar os produtos.");
      if (!groupsResponse.ok) throw new Error(groupsPayload.error || "Não foi possível carregar os grupos.");
      products = productsPayload.products || [];
      groups = groupsPayload.groups || [];
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Falha ao carregar a margem.";
    } finally {
      loading = false;
      render();
    }
  };

  const filteredProducts = () => products.filter((product) => {
    const query = searchTerm.trim().toLocaleLowerCase("pt-BR");
    const searchMatches = !query
      || String(product.name || "").toLocaleLowerCase("pt-BR").includes(query)
      || String(product.pdvCode || "").includes(query);
    const groupMatches = !selectedGroupId || String(product.idGroup) === String(selectedGroupId);
    const stateMatches = !selectedStates.size || selectedStates.has(product.marginState);
    return searchMatches && groupMatches && stateMatches;
  }).sort((left, right) => {
    const numericKeys = new Set(["pdvCode", "cost", "price", "grossMargin", "cmv"]);
    const getSortValue = (product) => {
      if (numericKeys.has(sortState.key) && ["grossMargin", "cmv"].includes(sortState.key)) {
        return Number(product.metrics?.[sortState.key] ?? 0);
      }
      return numericKeys.has(sortState.key) ? Number(product[sortState.key] || 0) : String(product[sortState.key] ?? "");
    };
    const comparison = numericKeys.has(sortState.key)
      ? getSortValue(left) - getSortValue(right)
      : getSortValue(left).localeCompare(getSortValue(right), "pt-BR", { sensitivity: "base" });
    return sortState.direction === "asc" ? comparison : -comparison;
  });

  const sortIndicator = (key) =>
    sortState.key === key ? (sortState.direction === "asc" ? "↑" : "↓") : "↕";

  const renderMarginStateBadge = (state) => {
    const normalized = String(state ?? "");
    return normalized
      ? `<span class="margin-state margin-state-${normalized}">${escapeHtml(formatMarginState(normalized))}</span>`
      : "—";
  };

  const deduplicateSnapshots = (snapshots) => {
    const seen = new Set();
    return (Array.isArray(snapshots) ? snapshots : []).filter((snapshot) => {
      const key = [
        snapshot.costPriceSnapshot,
        snapshot.priceSnapshot,
        snapshot.grossMarginPercentage,
        snapshot.markupPercentage,
        snapshot.unitProfitSnapshot,
        snapshot.cmvPercentage
      ].map((value) => String(value ?? "")).join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 5);
  };

  const renderInlineView = (product) => {
    if (!viewProduct || String(viewProduct.idProduct) !== String(product.idProduct)) return "";
    const cmv = Number(String(viewCmv).replace(",", "."));
    const suggestedPrice = calculateCmvPrice({ cost: viewProduct.cost, cmv });
    const metrics = suggestedPrice === null
      ? null
      : calculateMarginMetrics({ cost: viewProduct.cost, price: suggestedPrice });
    return `
      <tr class="margin-inline-row" data-margin-inline-view>
        <td colspan="8">
          <section class="margin-inline-panel">
            <header class="classic-panel-header"><span>Simulação - ${escapeHtml(viewProduct.name)}</span></header>
            ${viewError ? `<p class="payment-error">${escapeHtml(viewError)}</p>` : ""}
            <div class="margin-inline-grid">
              <label class="form-field"><span>Custo</span><input value="${escapeHtml(formatMoney(viewProduct.cost))}" readonly /></label>
              <label class="form-field"><span>Preço atual</span><input value="${escapeHtml(formatMoney(viewProduct.price))}" readonly /></label>
              <label class="form-field margin-cmv-field"><span>Novo CMV (%)</span><input data-margin-cmv inputmode="decimal" value="${escapeHtml(viewCmv)}" placeholder="Ex.: 60" /></label>
              <label class="form-field"><span>Preço sugerido</span><input value="${escapeHtml(formatMoney(suggestedPrice))}" readonly /></label>
              <label class="form-field"><span>Margem bruta</span><input value="${escapeHtml(formatPercent(metrics?.grossMargin))}" readonly /></label>
            </div>
            <div class="margin-inline-actions">
              <button class="classic-button primary" type="button" data-confirm-margin-price ${submitting || suggestedPrice === null ? "disabled" : ""}>Atualizar preço pelo CMV</button>
              <button class="classic-button" type="button" data-close-margin-view ${submitting ? "disabled" : ""}>Fechar</button>
            </div>
          </section>
        </td>
      </tr>`;
  };

  const renderInlineHistory = (product) => {
    if (!historyProduct || String(historyProduct.idProduct) !== String(product.idProduct)) return "";
    const snapshots = deduplicateSnapshots(historySnapshots);
    return `
      <tr class="margin-inline-row" data-margin-inline-history>
        <td colspan="8">
          <section class="margin-inline-panel">
            <header class="classic-panel-header"><span>Histórico - ${escapeHtml(historyProduct.name)}</span></header>
            ${historyError ? `<p class="payment-error">${escapeHtml(historyError)}</p>` : ""}
            ${snapshots.length ? `
              <div class="margin-history-wrapper">
                <table class="classic-table margin-history-table">
                  <thead><tr><th>Data</th><th>Custo</th><th>Preço</th><th>Margem</th><th>Markup</th><th>Lucro</th><th>CMV</th><th>Status</th></tr></thead>
                  <tbody>${snapshots.map((snapshot) => `
                    <tr>
                      <td>${formatSnapshotDate(snapshot.createdAtMarginProductMetric)}</td>
                      <td>${formatMoney(snapshot.costPriceSnapshot)}</td>
                      <td>${formatMoney(snapshot.priceSnapshot)}</td>
                      <td>${formatPercent(snapshot.grossMarginPercentage)}</td>
                      <td>${formatPercent(snapshot.markupPercentage)}</td>
                      <td>${formatMoney(snapshot.unitProfitSnapshot)}</td>
                      <td>${formatPercent(snapshot.cmvPercentage)}</td>
                      <td>${renderMarginStateBadge(snapshot.marginStateSnapshot)}</td>
                    </tr>`).join("")}</tbody>
                </table>
              </div>` : '<p class="classic-empty">Nenhum snapshot encontrado.</p>'}
            <div class="margin-inline-actions"><button class="classic-button" type="button" data-close-margin-history>Fechar</button></div>
          </section>
        </td>
      </tr>`;
  };

  const render = () => {
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - Margem de lucro</strong><span>Operador: Operador</span></header>
      ${renderMainMenu()}
      <div class="classic-toolbar screen-context-bar views-context-bar" aria-label="Navegação contextual">
        ${renderContextualNavigationItems(getContextualNavigationItems("views", viewsNavigation), "margin", "views-nav")}
      </div>
      <section class="views-content margin-content">
        ${renderSuccessFeedback(message, escapeHtml)}
        <div class="views-intro">
          <div class="views-intro-block"><span class="views-intro-label">Views</span><h1>Margem de lucro</h1></div>
          <div class="views-intro-block"><span class="views-intro-label">Consulta operacional</span><p>Consulta, simulação e histórico dos produtos.</p></div>
        </div>
        ${loading ? '<p class="classic-empty">Carregando margem...</p>' : ""}
        ${error ? `<p class="error-message">${escapeHtml(error)}</p>` : ""}
        ${!loading && !error ? `
          <section class="views-workspace">
            <aside class="classic-form-panel views-tree-panel">
              <div class="classic-panel-header">Classe - Grupo</div>
              <div class="views-tree" role="tree" aria-label="Classes e grupos de produtos">
                <button class="views-tree-item ${selectedGroupId === "" ? "is-selected" : ""}" type="button" role="treeitem" data-margin-filter-group="" aria-selected="${selectedGroupId === "" ? "true" : "false"}"><span>Todos os produtos</span><strong>(${products.length})</strong></button>
                ${buildViewsGroupTree(groups, products).map((group) =>
                  `<button class="views-tree-item ${String(selectedGroupId) === String(group.idGroup) ? "is-selected" : ""}" type="button" role="treeitem" data-margin-filter-group="${group.idGroup}" aria-selected="${String(selectedGroupId) === String(group.idGroup) ? "true" : "false"}"><span>${escapeHtml(group.label)}</span><strong>(${group.productCount})</strong></button>`
                ).join("")}
              </div>
            </aside>
            <section class="classic-grid-panel views-list-panel">
              <div class="classic-panel-header classic-list-header margin-list-header">
                <span>Produtos</span>
                <div class="margin-list-filter-bar">
                  <div class="margin-status-filter" aria-label="Filtrar status da margem">
                    <label><input type="checkbox" data-margin-state="red" ${selectedStates.has("red") ? "checked" : ""} /> Vermelho</label>
                    <label><input type="checkbox" data-margin-state="yellow" ${selectedStates.has("yellow") ? "checked" : ""} /> Amarelo</label>
                    <label><input type="checkbox" data-margin-state="green" ${selectedStates.has("green") ? "checked" : ""} /> Verde</label>
                  </div>
                  <label class="margin-group-select">
                    <span>Grupo</span>
                    <select data-margin-filter-group-select aria-label="Filtrar produtos por grupo">
                      <option value="" ${selectedGroupId === "" ? "selected" : ""}>Todos os grupos</option>
                      ${buildViewsGroupTree(groups, products).map((group) =>
                        `<option value="${escapeHtml(group.idGroup)}" ${String(selectedGroupId) === String(group.idGroup) ? "selected" : ""}>${escapeHtml(group.label)}</option>`
                      ).join("")}
                    </select>
                  </label>
                  <input class="classic-list-search" data-margin-search dir="ltr" type="search" placeholder="Pesquisar..." aria-label="Pesquisar produtos" value="${escapeHtml(searchTerm)}" />
                </div>
              </div>
              <div class="classic-grid-wrapper">
                ${filteredProducts().length ? `
                  <table class="classic-table margin-products-table">
                    <thead><tr>
                      ${[
                        ["pdvCode", "#PDV"],
                        ["name", "Produto"],
                        ["cost", "Custo"],
                        ["price", "Preço"],
                        ["grossMargin", "Margem bruta"],
                        ["cmv", "CMV"],
                        ["status", "Status"],
                        ["actions", "Ações"]
                      ].map(([key, label]) => key === "status" || key === "actions"
                        ? `<th>${label}</th>`
                        : `<th aria-sort="${sortState.key === key ? (sortState.direction === "asc" ? "ascending" : "descending") : "none"}"><button class="table-sort-button" type="button" data-margin-sort="${key}">${label} <span aria-hidden="true">${sortIndicator(key)}</span></button></th>`
                      ).join("")}
                    </tr></thead>
                    <tbody>${filteredProducts().map((product) => `
                      <tr>
                        <td>${escapeHtml(product.pdvCode || "—")}</td>
                        <td>${escapeHtml(product.name)}</td>
                        <td>${formatMoney(product.cost)}</td>
                        <td>${formatMoney(product.price)}</td>
                        <td>${formatPercent(product.metrics?.grossMargin)}</td>
                        <td>${formatPercent(product.metrics?.cmv)}</td>
                        <td>${renderMarginStateBadge(product.marginState)}</td>
                        <td>
                          <button class="icon-button" type="button" data-open-margin-view="${product.idProduct}" aria-label="Simular margem de ${escapeHtml(product.name)}" title="Simular"><i data-lucide="dollar-sign"></i></button>
                          <button class="icon-button" type="button" data-open-margin-history="${product.idProduct}" aria-label="Abrir histórico de ${escapeHtml(product.name)}" title="Histórico"><i data-lucide="chart-column"></i></button>
                        </td>
                      </tr>
                      ${renderInlineView(product)}
                      ${renderInlineHistory(product)}
                    `).join("")}</tbody>
                  </table>` : '<p class="classic-empty">Nenhum produto encontrado.</p>'}
              </div>
            </section>
          </section>
        ` : ""}
      </section>
    `;
    renderLucideIcons(root);
    bind();
  };

  const openMarginHistory = async (idProduct) => {
    viewProduct = null;
    viewCmv = "";
    viewError = "";
    historyProduct = products.find((product) => String(product.idProduct) === String(idProduct)) || null;
    historySnapshots = [];
    historyError = "";
    if (!historyProduct) return;
    render();
    try {
      const response = await apiFetch(`${getApiUrl()}/api/margin/history?idProduct=${encodeURIComponent(idProduct)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível consultar o histórico.");
      historySnapshots = Array.isArray(payload.snapshots) ? payload.snapshots : [];
    } catch (loadHistoryError) {
      historyError = loadHistoryError instanceof Error
        ? loadHistoryError.message
        : "Falha ao consultar o histórico.";
    } finally {
      render();
    }
  };

  const confirmPriceUpdate = async () => {
    if (!viewProduct) return;
    const cmv = parseFloat(String(viewCmv).replace(",", "."));
    if (!Number.isFinite(cmv) || cmv < 0 || cmv >= 100) {
      viewError = "Informe um Novo CMV válido entre 0% e menos de 100%.";
      render();
      return;
    }
    const suggestedPrice = calculateCmvPrice({ cost: viewProduct.cost, cmv });
    if (suggestedPrice === null) {
      viewError = "Não foi possível calcular o novo preço.";
      render();
      return;
    }
    const confirmed = await confirmAction({
      title: "Atualizar preço pelo CMV",
      message: "O preço de venda será alterado apenas após esta confirmação.",
      detailItems: [
        { title: "Produto", summary: viewProduct.name },
        { title: "Preço atual", summary: formatMoney(viewProduct.price) },
        { title: "Novo CMV", summary: formatPercent(cmv) },
        { title: "Novo preço", summary: formatMoney(suggestedPrice) }
      ],
      confirmLabel: "Atualizar preço"
    });
    if (!confirmed) return;
    submitting = true;
    render();
    try {
      const response = await apiFetch(`${getApiUrl()}/api/margin/product-price`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idProduct: viewProduct.idProduct,
          expectedPrice: viewProduct.price,
          newCmvPercentage: cmv
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar o preço.");
      viewProduct = null;
      viewError = "";
      message = `Preço atualizado pelo CMV em ${formatPercent(cmv)}.`;
      await load();
    } catch (saveError) {
      viewError = saveError instanceof Error ? saveError.message : "Falha ao atualizar o preço.";
      render();
    } finally {
      submitting = false;
      render();
    }
  };

  const bind = () => {
    bindMainMenu(root, menuHandlers);
    root.querySelectorAll("[data-views-nav]").forEach((button) => {
      button.addEventListener("click", () => {
        const route = button.dataset.viewsNav;
        const handler = resolveNavigationHandler({
          back: onBack,
          "groups-products": onGroupsProducts,
          "margin": onMargin,
          "no-cost": onNoCost,
          "no-physical-state": onNoPhysicalState,
          "cost-divergences": onCostDivergences,
          "recipe-revisions": onRecipeRevisions
        }, route) || resolveNavigationHandler(window.__PDV_NAVIGATION_HANDLERS__, route);
        handler?.();
      });
    });
    root.querySelector("[data-back-margin]")?.addEventListener("click", () => onBack?.());
    root.querySelector("[data-margin-search]")?.addEventListener("input", (event) => {
      searchTerm = event.target.value;
      rerenderPreservingInputSelection(event.target, render, () => root.querySelector("[data-margin-search]"));
    });
    root.querySelectorAll("[data-margin-filter-group]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedGroupId = button.dataset.marginFilterGroup || "";
        render();
      });
    });
    root.querySelector("[data-margin-filter-group-select]")?.addEventListener("change", (event) => {
      selectedGroupId = event.target.value || "";
      render();
    });
    root.querySelectorAll("[data-margin-state]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        selectedStates = new Set([...root.querySelectorAll("[data-margin-state]:checked")]
          .map((item) => item.dataset.marginState));
        render();
      });
    });
    root.querySelectorAll("[data-open-margin-view]").forEach((button) => {
      button.addEventListener("click", () => {
        historyProduct = null;
        historySnapshots = [];
        historyError = "";
        viewProduct = products.find((item) => String(item.idProduct) === button.dataset.openMarginView) || null;
        viewCmv = viewProduct?.metrics?.cmv != null
          ? String(Math.round(Number(viewProduct.metrics.cmv) * 100) / 100)
          : "";
        viewError = "";
        render();
        requestAnimationFrame(() => {
          const cmvInput = root.querySelector("[data-margin-cmv]");
          cmvInput?.focus();
          cmvInput?.select();
        });
      });
    });
    root.querySelectorAll("[data-margin-sort]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.marginSort;
        sortState = sortState.key === key
          ? { key, direction: sortState.direction === "asc" ? "desc" : "asc" }
          : { key, direction: "asc" };
        render();
      });
    });
    root.querySelectorAll("[data-open-margin-history]").forEach((button) => {
      button.addEventListener("click", () => void openMarginHistory(button.dataset.openMarginHistory));
    });
    root.querySelectorAll("[data-close-margin-history]").forEach((button) => {
      button.addEventListener("click", () => {
        historyProduct = null;
        historySnapshots = [];
        historyError = "";
        render();
      });
    });
    root.querySelectorAll("[data-close-margin-view]").forEach((button) => {
      button.addEventListener("click", () => {
        viewProduct = null;
        viewError = "";
        render();
      });
    });
    root.querySelector("[data-margin-cmv]")?.addEventListener("input", (event) => {
      viewCmv = event.target.value;
      rerenderPreservingInputSelection(event.target, render, () => root.querySelector("[data-margin-cmv]"));
    });
    root.querySelector("[data-confirm-margin-price]")?.addEventListener("click", () => void confirmPriceUpdate());
    if (message) {
      scheduleMessageClear(() => {
        message = "";
        clearRenderedFeedback(root);
      });
    }
  };

  void load();
  return root;
}
