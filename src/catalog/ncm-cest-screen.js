import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { bindProductNavigation, renderProductNavigation } from "./product-navigation.js";

const getApiUrl = () =>
  window.__PDV_API_URL__ || `http://${window.location.hostname}:3000`;

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
  onNcmCest,
  onFiscalOperations,
  onThermalPrint,
  onNcmCestUpdate,
  onSettings
}) {
  const root = document.createElement("main");
  let ncms = [];
  let cests = [];
  let relations = [];
  let loading = true;
  let submitting = false;
  let error = "";
  let message = "";
  let editing = null;
  let searchTerm = "";
  let activeView = "relations";

  const render = () => {
    const query = searchTerm.trim().toLocaleLowerCase("pt-BR");
    const visibleRelations = relations.filter((relation) =>
      [
        relation.ncmCode,
        relation.ncmDescription,
        relation.cestCode,
        relation.cestDescription,
        relation.segment
      ].some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(query))
    );
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
    const allVisible = activeView === "ncms" ? visibleNcms : activeView === "cests" ? visibleCests : visibleRelations;
    const visible = allVisible.slice(0, 250);
    const resultLabel = allVisible.length > visible.length ? `${visible.length}+ de ${allVisible.length}` : `${allVisible.length}`;
    const renderCatalogTable = () => {
      if (loading) return '<p class="classic-empty">Carregando catálogos...</p>';
      if (!visible.length) return '<p class="classic-empty">Nenhum registro encontrado.</p>';
      if (activeView === "ncms") {
        return `<table class="classic-table catalog-reference-table"><thead><tr><th>NCM</th><th>Descrição</th></tr></thead><tbody>${visible.map((ncm) => `<tr><td>${escapeHtml(ncm.codeNcm)}</td><td>${escapeHtml(ncm.descriptionNcm)}</td></tr>`).join("")}</tbody></table>`;
      }
      if (activeView === "cests") {
        return `<table class="classic-table catalog-reference-table"><thead><tr><th>CEST</th><th>Descrição</th><th>Segmento</th></tr></thead><tbody>${visible.map((cest) => `<tr><td>${escapeHtml(cest.codeCest)}</td><td>${escapeHtml(cest.descriptionCest)}</td><td>${escapeHtml(cest.segmentCest || "-")}</td></tr>`).join("")}</tbody></table>`;
      }
      return `<table class="classic-table"><thead><tr><th>NCM</th><th>Descrição NCM</th><th>CEST</th><th>Descrição CEST</th><th>Segmento</th><th class="actions-column">Ações</th></tr></thead><tbody>${visible.map((relation) => `<tr><td>${escapeHtml(relation.ncmCode)}</td><td>${escapeHtml(relation.ncmDescription)}</td><td>${escapeHtml(relation.cestCode)}</td><td>${escapeHtml(relation.cestDescription)}</td><td>${escapeHtml(relation.segment || "-")}</td><td class="actions-column"><button class="icon-button edit" type="button" title="Editar relação" aria-label="Editar relação" data-edit="${relation.idNcmCestRelation}"><i data-lucide="pencil"></i></button><button class="icon-button delete" type="button" title="Excluir relação" aria-label="Excluir relação" data-delete="${relation.idNcmCestRelation}"><i data-lucide="trash-2"></i></button></td></tr>`).join("")}</tbody></table>`;
    };
    root.className = "catalog-screen";
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - Cadastro NCM / CEST</strong><span>Operador: Operador</span></header>
      ${renderMainMenu()}
      ${renderProductNavigation("ncm-cest")}
      <section class="classic-content">
        <form class="classic-form-panel" data-form>
          <div class="classic-panel-header">${editing ? "Alterar relação NCM / CEST" : "Nova relação NCM / CEST"}</div>
          <div class="classic-form-body">
            <label class="form-field"><span>NCM</span><input name="ncmCode" inputmode="numeric" pattern="\\d{8}" maxlength="8" required value="${escapeHtml(editing?.ncmCode)}" /></label>
            <label class="form-field"><span>Descrição do NCM</span><textarea name="ncmDescription" rows="3" maxlength="255" required>${escapeHtml(editing?.ncmDescription)}</textarea></label>
            <label class="form-field"><span>CEST</span><input name="cestCode" inputmode="numeric" pattern="\\d{7}" maxlength="7" required value="${escapeHtml(editing?.cestCode)}" /></label>
            <label class="form-field"><span>Descrição do CEST</span><textarea name="cestDescription" rows="3" maxlength="255" required>${escapeHtml(editing?.cestDescription)}</textarea></label>
            <label class="form-field"><span>Segmento</span><input name="segment" maxlength="160" value="${escapeHtml(editing?.segment)}" /></label>
            ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}
            ${message ? `<p class="success-message">${escapeHtml(message)}</p>` : ""}
          </div>
          <div class="classic-form-actions"><button class="classic-button primary" type="submit" ${submitting ? "disabled" : ""}>${submitting ? "Salvando..." : editing ? "Salvar alterações" : "Salvar"}</button><button class="classic-button" data-clear type="button" ${submitting ? "disabled" : ""}>Limpar</button></div>
        </form>
        <section class="classic-grid-panel ncm-cest-catalog-panel">
          <div class="classic-panel-header classic-list-header"><span>Catálogos fiscais</span><input class="classic-list-search" data-search type="search" placeholder="Pesquisar código ou descrição..." value="${escapeHtml(searchTerm)}" /></div>
          <div class="catalog-summary">
            <button type="button" class="catalog-summary-item ${activeView === "ncms" ? "is-active" : ""}" data-view="ncms"><strong>${ncms.length}</strong><span>NCMs cadastrados</span></button>
            <button type="button" class="catalog-summary-item ${activeView === "cests" ? "is-active" : ""}" data-view="cests"><strong>${cests.length}</strong><span>CESTs cadastrados</span></button>
            <button type="button" class="catalog-summary-item ${activeView === "relations" ? "is-active" : ""}" data-view="relations"><strong>${relations.length}</strong><span>Relações cadastradas</span></button>
          </div>
          <div class="catalog-view-tabs" role="tablist">
            <button type="button" class="${activeView === "ncms" ? "is-active" : ""}" data-view="ncms" role="tab" aria-selected="${activeView === "ncms"}">NCM</button>
            <button type="button" class="${activeView === "cests" ? "is-active" : ""}" data-view="cests" role="tab" aria-selected="${activeView === "cests"}">CEST</button>
            <button type="button" class="${activeView === "relations" ? "is-active" : ""}" data-view="relations" role="tab" aria-selected="${activeView === "relations"}">Relações NCM / CEST</button>
          </div>
          <div class="classic-grid-wrapper">${renderCatalogTable()}</div>
          ${!loading ? `<div class="catalog-result-count">${resultLabel} registro(s) exibido(s)</div>` : ""}
        </section>
      </section>`;
    renderLucideIcons(root);
    bindMainMenu(root, {
      products: onProducts,
      "fiscal-operations": onFiscalOperations,
      "thermal-print": onThermalPrint,
      "ncm-cest-update": onNcmCestUpdate,
      settings: onSettings
    });
    bindProductNavigation(root, {
      back: onBack,
      classes: onClasses,
      groups: onGroups,
      products: onProducts,
      "ncm-cest": onNcmCest
    });
    root.querySelector("[data-search]")?.addEventListener("input", (event) => {
      searchTerm = event.currentTarget.value;
      render();
      root.querySelector("[data-search]")?.focus();
    });
    root.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
      activeView = button.dataset.view;
      searchTerm = "";
      render();
    }));
    root.querySelector("[data-clear]")?.addEventListener("click", () => {
      editing = null;
      error = "";
      message = "";
      render();
    });
    root.querySelector("[data-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void submit(Object.fromEntries(new FormData(event.currentTarget)));
    });
    root.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => {
      editing = relations.find((item) => String(item.idNcmCestRelation) === button.dataset.edit) || null;
      error = "";
      message = "";
      render();
    }));
    root.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => void remove(Number(button.dataset.delete))));
  };

  const load = async () => {
    loading = true;
    render();
    try {
      const [ncmResponse, cestResponse, relationResponse] = await Promise.all([
        fetch(`${getApiUrl()}/api/ncm-cest/ncms`),
        fetch(`${getApiUrl()}/api/ncm-cest/cests`),
        fetch(`${getApiUrl()}/api/ncm-cest`)
      ]);
      const [ncmPayload, cestPayload, relationPayload] = await Promise.all([
        ncmResponse.json(),
        cestResponse.json(),
        relationResponse.json()
      ]);
      if (!ncmResponse.ok) throw new Error(ncmPayload.error || "Não foi possível carregar os NCMs.");
      if (!cestResponse.ok) throw new Error(cestPayload.error || "Não foi possível carregar os CESTs.");
      if (!relationResponse.ok) throw new Error(relationPayload.error || "Não foi possível carregar as relações NCM / CEST.");
      ncms = ncmPayload.ncms;
      cests = cestPayload.cests;
      relations = relationPayload.relations;
      error = "";
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Falha ao carregar as relações NCM / CEST.";
    } finally {
      loading = false;
      render();
    }
  };

  const submit = async (form) => {
    submitting = true;
    error = "";
    message = "";
    render();
    try {
      const response = await fetch(`${getApiUrl()}/api/ncm-cest`, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ...(editing ? { idNcmCestRelation: editing.idNcmCestRelation } : {}) })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar a relação NCM / CEST.");
      editing = null;
      message = "Relação NCM / CEST salva com sucesso.";
      await load();
    } catch (submitError) {
      error = submitError instanceof Error ? submitError.message : "Falha ao salvar a relação NCM / CEST.";
    } finally {
      submitting = false;
      render();
    }
  };

  const remove = async (idNcmCestRelation) => {
    if (!window.confirm("Excluir esta relação NCM / CEST?")) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/ncm-cest`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idNcmCestRelation })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível excluir a relação NCM / CEST.");
      message = "Relação NCM / CEST excluída com sucesso.";
      await load();
    } catch (removeError) {
      error = removeError instanceof Error ? removeError.message : "Falha ao excluir a relação NCM / CEST.";
      render();
    }
  };

  render();
  void load();
  return root;
}
