import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { bindProductNavigation, renderProductNavigation } from "./product-navigation.js";
import { getApiUrl } from "../shared/api.js";

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

  const getCatalogState = () => {
    const query = searchTerm.trim().toLocaleLowerCase("pt-BR");
    const visibleNcms = ncms.filter((ncm) =>
      [ncm.codeNcm, ncm.descriptionNcm].some((value) =>
        String(value ?? "").toLocaleLowerCase("pt-BR").includes(query)
      )
    );
    const visibleCests = cests.filter((cest) =>
      [cest.codeCest, cest.descriptionCest, cest.segmentCest].some((value) =>
        String(value ?? "").toLocaleLowerCase("pt-BR").includes(query)
      )
    );
    const allVisible = activeView === "ncms" ? visibleNcms : visibleCests;
    const pageCount = Math.max(1, Math.ceil(allVisible.length / pageSize));
    const page = Math.min(currentPage[activeView], pageCount);
    currentPage[activeView] = page;
    const visible = allVisible.slice((page - 1) * pageSize, page * pageSize);
    const start = allVisible.length ? (page - 1) * pageSize + 1 : 0;
    const end = Math.min(page * pageSize, allVisible.length);
    const table = loading
      ? '<p class="classic-empty">Carregando catálogos...</p>'
      : !visible.length
        ? '<p class="classic-empty">Nenhum registro encontrado.</p>'
        : activeView === "ncms"
          ? `<table class="classic-table catalog-reference-table"><thead><tr><th>NCM</th><th>Descrição</th></tr></thead><tbody>${visible.map((ncm) => `<tr><td>${escapeHtml(ncm.codeNcm)}</td><td>${escapeHtml(ncm.descriptionNcm)}</td></tr>`).join("")}</tbody></table>`
          : `<table class="classic-table catalog-reference-table"><thead><tr><th>CEST</th><th>Descrição</th><th>Segmento</th></tr></thead><tbody>${visible.map((cest) => `<tr><td>${escapeHtml(cest.codeCest)}</td><td>${escapeHtml(cest.descriptionCest)}</td><td>${escapeHtml(cest.segmentCest || "-")}</td></tr>`).join("")}</tbody></table>`;
    return { table, start, end, allVisibleLength: allVisible.length, page, pageCount };
  };

  const updateCatalogResults = () => {
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
      updateCatalogResults();
    });
    root.querySelector("[data-page='previous']")?.addEventListener("click", () => {
      currentPage[activeView] -= 1;
      updateCatalogResults();
    });
    root.querySelector("[data-page='next']")?.addEventListener("click", () => {
      currentPage[activeView] += 1;
      updateCatalogResults();
    });
    root.querySelector("[data-page='last']")?.addEventListener("click", () => {
      currentPage[activeView] = getCatalogState().pageCount;
      updateCatalogResults();
    });
    root.querySelector("[data-page-size]")?.addEventListener("change", (event) => {
      pageSize = Number(event.currentTarget.value) || 25;
      currentPage[activeView] = 1;
      updateCatalogResults();
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
          <div class="classic-panel-header classic-list-header"><span>Catálogos fiscais</span><input class="classic-list-search" data-search dir="ltr" type="search" placeholder="Pesquisar código ou descrição..." value="${escapeHtml(searchTerm)}" /></div>
          <div class="catalog-summary">
            <button type="button" class="catalog-summary-item ${activeView === "ncms" ? "is-active" : ""}" data-view="ncms"><strong>${ncms.length}</strong><span>NCMs cadastrados</span></button>
            <button type="button" class="catalog-summary-item ${activeView === "cests" ? "is-active" : ""}" data-view="cests"><strong>${cests.length}</strong><span>CESTs cadastrados</span></button>
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
      updateCatalogResults();
    });
    root.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
      activeView = button.dataset.view;
      searchTerm = "";
      currentPage[activeView] = 1;
      render();
    }));
    bindPagination();
  };

  const load = async () => {
    loading = true;
    render();
    try {
      const [ncmResponse, cestResponse] = await Promise.all([
        fetch(`${getApiUrl()}/api/ncm-cest/ncms`),
        fetch(`${getApiUrl()}/api/ncm-cest/cests`)
      ]);
      const [ncmPayload, cestPayload] = await Promise.all([
        ncmResponse.json(),
        cestResponse.json()
      ]);
      if (!ncmResponse.ok) throw new Error(ncmPayload.error || "Não foi possível carregar os NCMs.");
      if (!cestResponse.ok) throw new Error(cestPayload.error || "Não foi possível carregar os CESTs.");
      ncms = ncmPayload.ncms;
      cests = cestPayload.cests;
      error = "";
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Falha ao carregar os catálogos NCM / CEST.";
    } finally {
      loading = false;
      render();
    }
  };

  render();
  void load();
  return root;
}
