import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { bindFiscalNavigation, renderFiscalNavigation } from "./fiscal-navigation.js";

const catalogLabels = {
  cfops: "CFOP",
  "tax-situations": "CST / CSOSN",
  "icms-rates": "Alíquotas de ICMS",
  "tax-regimes": "Regimes tributários",
  "operation-types": "Tipos de operação",
  contexts: "Contextos fiscais",
  origins: "Origens da mercadoria",
  "ipi-situations": "Situações tributárias do IPI",
  "contribution-situations": "Situações tributárias PIS/COFINS",
  "base-modes": "Modalidades de base",
  "exemption-reasons": "Desoneração do ICMS"
};

const catalogPresentation = {
  cfops: { code: "cfop" },
  "tax-situations": { stripCodeFromDescription: true },
  "icms-rates": { hideCode: true },
  "tax-regimes": { hideCode: true },
  "operation-types": { hideCode: true, code: "slug" },
  contexts: { hideCode: true },
  origins: { stripCodeFromDescription: true },
  "ipi-situations": { stripCodeFromDescription: true },
  "contribution-situations": { stripCodeFromDescription: true },
  "base-modes": { hideCode: true },
  "exemption-reasons": { stripCodeFromDescription: true }
};

const getApiUrl = () =>
  window.__PDV_API_URL__ || `http://${window.location.hostname}:3000`;

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function createFiscalCatalogScreen({
  catalog,
  onBack,
  onFiscalOperations,
  onCatalog,
  onClasses,
  onGroups,
  onProducts,
  onThermalPrint,
  onNcmCestUpdate,
  onSettings
}) {
  const root = document.createElement("main");
  const title = catalogLabels[catalog] || "Cadastro fiscal";
  let items = [];
  let loading = true;
  let submitting = false;
  let editing = null;
  let error = "";
  let searchTerm = "";
  const presentation = catalogPresentation[catalog] || {};
  const showCodeColumn = !presentation.hideCode;
  const formatDescription = (item) => {
    const description = String(item.descriptionFiscalCatalogItem ?? "");
    if (!presentation.stripCodeFromDescription) return description;
    return description.replace(/^[^-\s]+\s*-\s*/, "");
  };

  const render = () => {
    const visible = items.filter((item) =>
      [item.codeFiscalCatalogItem, formatDescription(item)]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(searchTerm.toLocaleLowerCase("pt-BR"))
    );
    root.className = "catalog-screen";
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - ${title}</strong><span>Operador: Operador</span></header>
      ${renderMainMenu()}
      ${renderFiscalNavigation(catalog)}
      <section class="classic-content fiscal-catalog-content">
        <form class="classic-form-panel" data-form>
          <div class="classic-panel-header">${editing ? `Alterar ${title}` : `Novo cadastro de ${title}`}</div>
          <div class="classic-form-body">
            ${presentation.hideCode || presentation.code === "slug"
              ? ""
              : `<label class="form-field"><span>Código</span><input name="codeFiscalCatalogItem" maxlength="30" required ${presentation.code === "cfop" ? 'inputmode="numeric" pattern="\\d\\.\\d{3}" placeholder="0.000"' : ""} value="${escapeHtml(editing?.codeFiscalCatalogItem)}" /></label>`}
            <label class="form-field"><span>Descrição</span><textarea class="catalog-description-input" name="descriptionFiscalCatalogItem" rows="5" maxlength="255" required>${escapeHtml(editing ? formatDescription(editing) : "")}</textarea></label>
            ${catalog === "icms-rates" ? `<label class="form-field"><span>Percentual da alíquota</span><input name="valueFiscalCatalogItem" type="number" min="0" max="100" step="0.0001" value="${escapeHtml(editing?.valueFiscalCatalogItem)}" /></label>` : ""}
            ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}
          </div>
          <div class="classic-form-actions"><button class="classic-button primary" type="submit" ${submitting ? "disabled" : ""}>${submitting ? "Salvando..." : editing ? "Salvar alterações" : "Salvar"}</button><button class="classic-button" data-clear type="button" ${submitting ? "disabled" : ""}>Limpar</button></div>
        </form>
        <section class="classic-grid-panel">
          <div class="classic-panel-header classic-list-header"><span>${title}</span><input class="classic-list-search" data-search type="search" placeholder="Pesquisar código ou descrição..." value="${escapeHtml(searchTerm)}" /></div>
          <div class="classic-grid-wrapper">${loading ? '<p class="classic-empty">Carregando cadastro...</p>' : visible.length ? `<table class="classic-table"><thead><tr>${showCodeColumn ? "<th>Código</th>" : ""}<th>Descrição</th>${catalog === "icms-rates" ? "<th>Alíquota</th>" : ""}<th class="actions-column">Ações</th></tr></thead><tbody>${visible.map((item) => `<tr>${showCodeColumn ? `<td>${escapeHtml(item.codeFiscalCatalogItem)}</td>` : ""}<td>${escapeHtml(formatDescription(item))}</td>${catalog === "icms-rates" ? `<td>${item.valueFiscalCatalogItem == null ? "-" : `${Number(item.valueFiscalCatalogItem).toLocaleString("pt-BR")}%`}</td>` : ""}<td class="actions-column"><button class="icon-button edit" type="button" title="Editar cadastro" aria-label="Editar cadastro" data-edit="${item.idFiscalCatalogItem}"><i data-lucide="pencil"></i></button><button class="icon-button delete" type="button" title="Excluir cadastro definitivamente" aria-label="Excluir cadastro definitivamente" data-delete="${item.idFiscalCatalogItem}"><i data-lucide="trash-2"></i></button></td></tr>`).join("")}</tbody></table>` : '<p class="classic-empty">Nenhum cadastro encontrado.</p>'}</div>
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
    bind();
  };

  const bind = () => {
    bindFiscalNavigation(root, {
      back: onBack,
      "fiscal-operations": onFiscalOperations,
      cfops: () => onCatalog("cfops"),
      "tax-situations": () => onCatalog("tax-situations"),
      "icms-rates": () => onCatalog("icms-rates"),
      "tax-regimes": () => onCatalog("tax-regimes"),
      "operation-types": () => onCatalog("operation-types"),
      contexts: () => onCatalog("contexts"),
      origins: () => onCatalog("origins"),
      "ipi-situations": () => onCatalog("ipi-situations"),
      "contribution-situations": () => onCatalog("contribution-situations"),
      "base-modes": () => onCatalog("base-modes"),
      "exemption-reasons": () => onCatalog("exemption-reasons")
    });
    root.querySelector("[data-search]")?.addEventListener("input", (event) => {
      searchTerm = event.currentTarget.value;
      render();
      root.querySelector("[data-search]")?.focus();
    });
    root.querySelector('input[name="codeFiscalCatalogItem"]')?.addEventListener("input", (event) => {
      if (presentation.code !== "cfop") return;
      const digits = event.currentTarget.value.replace(/\D/g, "").slice(0, 4);
      event.currentTarget.value = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    });
    root.querySelector("[data-clear]")?.addEventListener("click", () => {
      editing = null;
      error = "";
      render();
    });
    root.querySelector("[data-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void submit(Object.fromEntries(new FormData(event.currentTarget)));
    });
    root.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => {
      editing = items.find((item) => String(item.idFiscalCatalogItem) === button.dataset.edit) || null;
      error = "";
      render();
    }));
    root.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => void remove(Number(button.dataset.delete))));
  };

  const load = async () => {
    loading = true;
    render();
    try {
      const response = await fetch(`${getApiUrl()}/api/fiscal-catalogs?catalog=${encodeURIComponent(catalog)}&includeInactive=1`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar o cadastro fiscal.");
      items = payload.items;
      error = "";
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Falha ao carregar o cadastro fiscal.";
    } finally {
      loading = false;
      render();
    }
  };

  const submit = async (form) => {
    submitting = true;
    error = "";
    render();
    try {
      const payload = {
        ...form,
        catalogFiscalCatalogItem: catalog,
        ...(editing ? { idFiscalCatalogItem: editing.idFiscalCatalogItem } : {})
      };
      const response = await fetch(`${getApiUrl()}/api/fiscal-catalogs`, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar o cadastro fiscal.");
      editing = null;
      await load();
    } catch (submitError) {
      error = submitError instanceof Error ? submitError.message : "Falha ao salvar o cadastro fiscal.";
      render();
    } finally {
      submitting = false;
    }
  };

  const remove = async (idFiscalCatalogItem) => {
    if (!window.confirm("Excluir este cadastro fiscal definitivamente?")) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/fiscal-catalogs`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idFiscalCatalogItem })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível excluir o cadastro fiscal.");
      await load();
    } catch (removeError) {
      error = removeError instanceof Error ? removeError.message : "Falha ao excluir o cadastro fiscal.";
      render();
    }
  };

  render();
  void load();
  return root;
}
