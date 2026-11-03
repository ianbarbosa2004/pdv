import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { bindProductNavigation, renderProductNavigation } from "./product-navigation.js";
import { apiFetch, getApiUrl } from "../shared/api.js";

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function createNcmCestScreen({
  onBack,
  onClasses,
  onGroups,
  onProducts,
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
  let ncms = [];
  let cests = [];
  let loading = true;
  let error = "";
  let searchTerm = "";
  let activeView = "ncms";
  let currentPage = { ncms: 1, cests: 1 };
  let pageSize = 25;
  let catalogMeta = {
    ncms: { total: 0, pageCount: 1 },
    cests: { total: 0, pageCount: 1 }
  };
  let catalogTotals = { ncms: 0, cests: 0 };
  let catalogRequestId = 0;

  const getCatalogState = () => {
    const records = activeView === "ncms" ? ncms : cests;
    const { total, pageCount } = catalogMeta[activeView];
    const page = currentPage[activeView];
    const start = total ? (page - 1) * pageSize + 1 : 0;
    const end = total ? start + records.length - 1 : 0;
    const table = loading
      ? '<p class="classic-empty">Carregando catálogos...</p>'
      : !records.length
        ? '<p class="classic-empty">Nenhum registro encontrado.</p>'
        : activeView === "ncms"
          ? `<table class="classic-table catalog-reference-table"><thead><tr><th>NCM</th><th>Descrição</th></tr></thead><tbody>${records.map((ncm) => `<tr><td>${escapeHtml(ncm.codeNcm)}</td><td>${escapeHtml(ncm.descriptionNcm)}</td></tr>`).join("")}</tbody></table>`
          : `<table class="classic-table catalog-reference-table"><thead><tr><th>CEST</th><th>Descrição</th><th>Segmento</th></tr></thead><tbody>${records.map((cest) => `<tr><td>${escapeHtml(cest.codeCest)}</td><td>${escapeHtml(cest.descriptionCest)}</td><td>${escapeHtml(cest.segmentCest || "-")}</td></tr>`).join("")}</tbody></table>`;
    return { table, start, end, allVisibleLength: total, page, pageCount };
  };

  const updateCatalogResults = async () => {
    const requestId = ++catalogRequestId;
    loading = true;
    const view = activeView;
    try {
      await loadCatalogPage(view);
      if (requestId !== catalogRequestId) return;
      error = "";
    } catch (loadError) {
      if (requestId !== catalogRequestId) return;
      error = loadError instanceof Error ? loadError.message : "Falha ao carregar o catálogo.";
    } finally {
      if (requestId === catalogRequestId) loading = false;
    }
    const state = getCatalogState();
    const wrapper = root.querySelector(".classic-grid-wrapper");
    if (wrapper) wrapper.innerHTML = state.table;
    const pagination = root.querySelector(".catalog-pagination");
    if (pagination) {
      if (state.allVisibleLength <= 25) {
        pagination.remove();
      } else {
        pagination.innerHTML = `
        <span>${state.start}-${state.end} de ${state.allVisibleLength} registro(s)</span>
        <div>
          <button class="classic-button" type="button" data-page="first" ${state.page <= 1 ? "disabled" : ""}>Primeira</button>
          <button class="classic-button" type="button" data-page="previous" ${state.page <= 1 ? "disabled" : ""}>Anterior</button>
          <span>Página ${state.page} de ${state.pageCount}</span>
          <button class="classic-button" type="button" data-page="next" ${state.page >= state.pageCount ? "disabled" : ""}>Próxima</button>
          <button class="classic-button" type="button" data-page="last" ${state.page >= state.pageCount ? "disabled" : ""}>Última</button>
        </div>
        <label class="catalog-page-size">
          <span>Itens por página</span>
          <select data-page-size aria-label="Itens por página">
            ${[25, 50, 100].map((size) => `<option value="${size}" ${pageSize === size ? "selected" : ""}>${size}</option>`).join("")}
          </select>
        </label>`;
      }
    }
    bindPagination();
  };

  const bindPagination = () => {
    root.querySelector("[data-page='first']")?.addEventListener("click", () => {
      currentPage[activeView] = 1;
      void updateCatalogResults();
    });
    root.querySelector("[data-page='previous']")?.addEventListener("click", () => {
      currentPage[activeView] -= 1;
      void updateCatalogResults();
    });
    root.querySelector("[data-page='next']")?.addEventListener("click", () => {
      currentPage[activeView] += 1;
      void updateCatalogResults();
    });
    root.querySelector("[data-page='last']")?.addEventListener("click", () => {
      currentPage[activeView] = getCatalogState().pageCount;
      void updateCatalogResults();
    });
    root.querySelector("[data-page-size]")?.addEventListener("change", (event) => {
      pageSize = Number(event.currentTarget.value) || 25;
      currentPage[activeView] = 1;
      void updateCatalogResults();
    });
  };

  const render = () => {
    const state = getCatalogState();
    root.className = "catalog-screen";
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - Cadastro NCM / CEST</strong><span>Operador: Operador</span></header>
      ${renderMainMenu()}
      ${renderProductNavigation("ncm-cest")}
      <section class="classic-content">
        <section class="classic-grid-panel ncm-cest-catalog-panel ncm-cest-catalog-full">
          <div class="classic-panel-header classic-list-header"><span>Catálogos fiscais</span><input class="classic-list-search" name="ncmCestSearch" data-search dir="ltr" type="search" placeholder="Pesquisar código ou descrição..." aria-label="Pesquisar catálogos fiscais" value="${escapeHtml(searchTerm)}" /></div>
          <div class="catalog-summary">
            <button type="button" class="catalog-summary-item ${activeView === "ncms" ? "is-active" : ""}" data-view="ncms"><strong>${catalogTotals.ncms}</strong><span>NCMs cadastrados</span></button>
            <button type="button" class="catalog-summary-item ${activeView === "cests" ? "is-active" : ""}" data-view="cests"><strong>${catalogTotals.cests}</strong><span>CESTs cadastrados</span></button>
          </div>
          <div class="catalog-view-tabs" role="tablist">
            <button type="button" class="${activeView === "ncms" ? "is-active" : ""}" data-view="ncms" role="tab" aria-selected="${activeView === "ncms"}">NCM</button>
            <button type="button" class="${activeView === "cests" ? "is-active" : ""}" data-view="cests" role="tab" aria-selected="${activeView === "cests"}">CEST</button>
          </div>
          <div class="classic-grid-wrapper">${state.table}</div>
          ${!loading && state.allVisibleLength > 25 ? `
            <div class="catalog-pagination">
              <span>${state.start}-${state.end} de ${state.allVisibleLength} registro(s)</span>
              <div>
                <button class="classic-button" type="button" data-page="first" ${state.page <= 1 ? "disabled" : ""}>Primeira</button>
                <button class="classic-button" type="button" data-page="previous" ${state.page <= 1 ? "disabled" : ""}>Anterior</button>
                <span>Página ${state.page} de ${state.pageCount}</span>
                <button class="classic-button" type="button" data-page="next" ${state.page >= state.pageCount ? "disabled" : ""}>Próxima</button>
                <button class="classic-button" type="button" data-page="last" ${state.page >= state.pageCount ? "disabled" : ""}>Última</button>
              </div>
              <label class="catalog-page-size">
                <span>Itens por página</span>
                <select data-page-size aria-label="Itens por página">
                  ${[25, 50, 100].map((size) => `<option value="${size}" ${pageSize === size ? "selected" : ""}>${size}</option>`).join("")}
                </select>
              </label>
            </div>
          ` : ""}
          ${error ? `<p class="payment-error catalog-load-error">${escapeHtml(error)}</p>` : ""}
        </section>
      </section>`;
    renderLucideIcons(root);
    bindMainMenu(root, {
      products: onProducts,
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
      "product-types": onProductTypes,
      units: onUnits,
      "ncm-cest": onNcmCest
    });
    root.querySelector("[data-search]")?.addEventListener("input", (event) => {
      const input = event.currentTarget;
      searchTerm = input.value;
      currentPage[activeView] = 1;
      void updateCatalogResults();
    });
    root.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
      activeView = button.dataset.view;
      searchTerm = "";
      currentPage[activeView] = 1;
      void updateCatalogResults();
    }));
    bindPagination();
  };

  const load = async () => {
    loading = true;
    render();
    try {
      await Promise.all([loadCatalogPage("ncms"), loadCatalogPage("cests")]);
      error = "";
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Falha ao carregar os catálogos NCM / CEST.";
    } finally {
      loading = false;
      render();
    }
  };

  const loadCatalogPage = async (view) => {
    const endpoint = view === "ncms" ? "ncms" : "cests";
    const params = new URLSearchParams({
      page: String(currentPage[view]),
      pageSize: String(pageSize)
    });
    if (searchTerm.trim()) params.set("search", searchTerm.trim());
    const response = await apiFetch(`${getApiUrl()}/api/ncm-cest/${endpoint}?${params}`);
    const payload = await response.json();
    if (!response.ok || !Array.isArray(payload[endpoint])) {
      throw new Error(payload.error || `Não foi possível carregar os ${view === "ncms" ? "NCMs" : "CESTs"}.`);
    }
    if (view === "ncms") ncms = payload.ncms;
    else cests = payload.cests;
    currentPage[view] = Number(payload.page) || 1;
    catalogMeta[view] = {
      total: Number(payload.total) || 0,
      pageCount: Number(payload.pageCount) || 1
    };
    if (!searchTerm.trim()) catalogTotals[view] = catalogMeta[view].total;
  };

  render();
  void load();
  return root;
}
