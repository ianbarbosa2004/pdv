import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { renderScreenContextBar } from "../ui/screen-context.js";
import { renderNavigationIntro } from "../ui/navigation-intro.js";
import { renderPreservingFormDraft } from "../ui/form-draft.js";
import { rerenderPreservingInputSelection } from "../ui/input-selection.js";
import { installComboboxDismissal, rerenderComboboxSelection } from "../ui/combobox.js";
import { clearRenderedFeedback, createFeedbackTimer, renderSuccessFeedback } from "../ui/feedback.js";
import { apiFetch, getApiUrl } from "../shared/api.js";
import { fetchWithTimeout } from "../shared/request-timeout.js";
import { confirmAction } from "../ui/confirmation-modal.js";
import { formatProductOptionLabel } from "../shared/product.js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  bindSupplierFormFormatting,
  formatSupplierCep,
  formatSupplierEmail,
  formatSupplierPhone,
  formatSupplierTitle,
  renderSupplierFormFields
} from "../catalog/supplier-form.js";

const isTauriWindow = () => Boolean(window.__TAURI_INTERNALS__);

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const formatDocument = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 14);
  return digits.replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
};

const formatMoney = (value) =>
  Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const parseFiscalNumber = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatBrazilianNumber = (value) =>
  parseFiscalNumber(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const formatQuantity = (value) =>
  Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });

const copyTextToClipboard = async (value) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(String(value));
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = String(value);
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("A área de transferência não está disponível.");
};

const normalizeUnit = (value) => String(value || "").trim().toLocaleUpperCase("pt-BR");

const normalizeFiscalItemMatchValue = (value) =>
  String(value || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");

const suggestedConversionFactor = (sourceUnit, destinationUnit) => {
  const source = normalizeUnit(sourceUnit);
  const destination = normalizeUnit(destinationUnit);
  if (source === destination || !source || !destination) return "1";
  if (["DZ", "DÚZIA", "DUZIA"].includes(source) && ["UN", "UND", "UNIDADE"].includes(destination)) return "12";
  return "1";
};

const formatDateOnly = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value ?? "")
    : date.toLocaleDateString("pt-BR");
};

const formatDateTime = (value) => {
  if (value === null || value === undefined || String(value).trim() === "") return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value ?? "")
    : date.toLocaleString("pt-BR");
};

const formatFiscalHeaderValue = (value) => {
  const text = String(value ?? "").trim();
  return text || "Não informado";
};

const renderFiscalEntryHeader = (entry) => {
  const fields = [
    ["Modelo", Number(entry.modelFiscalDocument) === 65
      ? "NFC-e"
      : Number(entry.modelFiscalDocument) === 55
        ? "NF-e"
        : entry.modelFiscalDocument],
    ["Série", entry.seriesFiscalDocument],
    ["Número", entry.numberFiscalDocument],
    ["CNPJ", formatDocument(entry.issuerDocumentFiscalDocument)],
    ["Razão Social", entry.issuerLegalNameFiscalDocument],
    ["Nome Fantasia", entry.issuerTradeNameFiscalDocument],
    ["Inscrição Estadual", entry.issuerStateRegistrationFiscalDocument],
    ["Data da Emissão", formatDateTime(entry.issuedAtFiscalDocument)],
    ["Endereço", entry.issuerAddressFiscalDocument && entry.issuerAddressNumberFiscalDocument
      ? `${entry.issuerAddressFiscalDocument}, ${entry.issuerAddressNumberFiscalDocument}`
      : entry.issuerAddressFiscalDocument],
    ["Bairro", entry.issuerNeighborhoodFiscalDocument],
    ["CEP", entry.issuerZipCodeFiscalDocument],
    ["Município", entry.issuerCityFiscalDocument && entry.issuerStateFiscalDocument
      ? `${entry.issuerCityFiscalDocument}, ${entry.issuerStateFiscalDocument}`
      : entry.issuerCityFiscalDocument]
  ];
  return `<div class="fiscal-entry-header-grid">${fields.map(([label, value]) => `
    <div class="fiscal-entry-header-field">
      <span class="fiscal-entry-header-label">${escapeHtml(label)}</span>
      <strong>${escapeHtml(formatFiscalHeaderValue(value))}</strong>
    </div>`).join("")}
    <div class="fiscal-entry-header-field fiscal-entry-header-access-key">
      <span class="fiscal-entry-header-label">Chave de Acesso</span>
      <strong><button class="fiscal-access-key-button" type="button" data-copy-access-key="${escapeHtml(entry.accessKeyFiscalDocument)}" title="Copiar chave de acesso">${escapeHtml(formatFiscalHeaderValue(entry.accessKeyFiscalDocument))}</button></strong>
    </div>
  </div>`;
};

const fiscalEntryStatusLabel = (status) => ({
  draft: "Digitação",
  open: "Aberta",
  confirmed: "Confirmada",
  cancelled: "Cancelada"
}[status] || status || "Não informado");

const fiscalEntryStatusClass = (status) => ({
  draft: "draft",
  open: "open",
  confirmed: "confirmed",
  cancelled: "cancelled"
}[status] || "unknown");

export function createFiscalDocumentQueueScreen({ onBack, entryOnly = false, initialEntryId = null, ...handlers }) {
  const root = document.createElement("main");
  let xmlSubmitting = false;
  let error = "";
  let xmlError = "";
  let fiscalBrowserBusy = false;
  let fiscalBrowserError = "";
  let reconcileEntryId = null;
  let entrySaving = false;
  let entryConfirming = false;
  let entryReconciling = false;
  let entryError = "";
  let currentEntry = null;
  let fiscalEntries = [];
  let missingSuppliers = [];
  let entriesLoading = false;
  let products = [];
  let paymentMethods = [];
  let selectedPaymentMethod = "";
  let editingItem = null;
  const productPicker = {
    searchTerm: "",
    isOpen: false
  };
  let entryPayments = [];
  let message = "";
  let supplierModal = null;
  let supplierSubmitting = false;
  let supplierError = "";
  let fiscalEntrySort = { key: "issuedAtFiscalDocument", direction: "asc" };
  let fiscalEntrySearch = "";
  let fiscalEntryStatusFilter = "draft";
  let activeEntryId = initialEntryId ? Number(initialEntryId) : null;
  const scheduleMessageClear = createFeedbackTimer();

  const selectedEntryTotal = () => (currentEntry?.items || [])
    .filter((item) => item.selected)
    .reduce((total, item) => total + parseFiscalNumber(item.totalFiscalDocumentItem), 0);

  const selectedProduct = (item) => products.find((product) => Number(product.idProduct) === Number(item?.idProduct));

  const selectedProductLabel = () => {
    const product = selectedProduct(editingItem);
    return product ? formatProductOptionLabel(product) : "Selecione";
  };

  const productOptions = () => {
    const query = productPicker.searchTerm.trim().toLocaleLowerCase("pt-BR");
    return products.filter((product) =>
      `${product.nameProduct || ""} ${product.pdvCodeProduct || ""} ${product.skuProduct || ""}`
        .toLocaleLowerCase("pt-BR")
        .includes(query)
    );
  };

  const isCurrentFiscalEntry = (entry) =>
    Number(entry?.idFiscalEntry) === activeEntryId;

  installComboboxDismissal(root, {
    isOpen: () => productPicker.isOpen,
    close: () => {
      productPicker.isOpen = false;
      render();
    }
  });

  const sortedFiscalEntries = () => [...fiscalEntries].sort((left, right) => {
    const key = fiscalEntrySort.key;
    let comparison;
    if (key === "issuedAtFiscalDocument") {
      comparison = new Date(left[key]).getTime() - new Date(right[key]).getTime();
    } else if (key === "totalFiscalDocument") {
      comparison = Number(left[key] || 0) - Number(right[key] || 0);
    } else {
      const leftValue = key === "statusFiscalEntry"
        ? fiscalEntryStatusLabel(left[key])
        : key === "modelFiscalDocument"
          ? Number(left[key]) === 65 ? "NFC-e" : "NF-e"
          : key === "numberFiscalDocument"
            ? left.numberFiscalDocument
              ? left.numberFiscalDocument
              : left.accessKeyFiscalDocument
          : left[key];
      const rightValue = key === "statusFiscalEntry"
        ? fiscalEntryStatusLabel(right[key])
        : key === "modelFiscalDocument"
          ? Number(right[key]) === 65 ? "NFC-e" : "NF-e"
          : key === "numberFiscalDocument"
            ? right.numberFiscalDocument
              ? right.numberFiscalDocument
              : right.accessKeyFiscalDocument
          : right[key];
      comparison = String(leftValue || "").localeCompare(String(rightValue || ""), "pt-BR", { sensitivity: "base" });
    }
    if (comparison === 0) {
      comparison = Number(left.idFiscalEntry) - Number(right.idFiscalEntry);
    }
    return fiscalEntrySort.direction === "asc" ? comparison : -comparison;
  });

  const visibleFiscalEntries = () => {
    const search = fiscalEntrySearch.trim().toLocaleLowerCase("pt-BR");
    return sortedFiscalEntries().filter((entry) => {
      if (fiscalEntryStatusFilter !== "all" && entry.statusFiscalEntry !== fiscalEntryStatusFilter) {
        return false;
      }
      if (!search) return true;
      return [
        Number(entry.modelFiscalDocument) === 65 ? "NFC-e" : "NF-e",
        entry.numberFiscalDocument || entry.accessKeyFiscalDocument,
        entry.issuerLegalNameFiscalDocument,
        entry.issuerDocumentFiscalDocument,
        fiscalEntryStatusLabel(entry.statusFiscalEntry)
      ].some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(search));
    });
  };

  const statusFilterOptions = [
    ["all", "Todas"],
    ["draft", "Digitação"],
    ["open", "Aberta"],
    ["confirmed", "Confirmada"],
    ["cancelled", "Cancelada"]
  ];

  const renderFiscalEntryListHeader = (title) => `
    <div class="classic-panel-header fiscal-entry-list-header">
      <div class="fiscal-entry-list-header-top">
        <span>${title}</span>
        <input class="classic-list-search" data-fiscal-entry-search type="search" placeholder="Pesquisar..." aria-label="Pesquisar documentos na fila" value="${escapeHtml(fiscalEntrySearch)}" />
      </div>
      <div class="fiscal-entry-status-filters" role="group" aria-label="Filtrar documentos por status">
        ${statusFilterOptions.map(([value, label]) => {
          const count = value === "all"
            ? fiscalEntries.length
            : fiscalEntries.filter((entry) => entry.statusFiscalEntry === value).length;
          return `<button class="fiscal-entry-status-filter${fiscalEntryStatusFilter === value ? " is-active" : ""}" type="button" data-fiscal-entry-status-filter="${value}" aria-pressed="${fiscalEntryStatusFilter === value}">${label} ${count}</button>`;
        }).join("")}
      </div>
    </div>`;

  const sortIndicator = (key) =>
    fiscalEntrySort.key === key ? (fiscalEntrySort.direction === "asc" ? "↑" : "↓") : "↕";

  const sortableHeader = (key, label, className = "") => `
    <th class="${className}" aria-sort="${fiscalEntrySort.key === key ? (fiscalEntrySort.direction === "asc" ? "ascending" : "descending") : "none"}">
      <button class="table-sort-button" type="button" data-fiscal-entry-sort="${key}">${label} <span aria-hidden="true">${sortIndicator(key)}</span></button>
    </th>`;

  const applyLinkToMatchingItems = (sourceItem, product, conversionFactor) => {
    const description = normalizeFiscalItemMatchValue(sourceItem.descriptionFiscalDocumentItem);
    const fiscalUnit = normalizeFiscalItemMatchValue(sourceItem.fiscalUnitFiscalDocumentItem);
    currentEntry?.items.forEach((item) => {
      if (item === sourceItem
        || item.idProduct
        || normalizeFiscalItemMatchValue(item.descriptionFiscalDocumentItem) !== description
        || normalizeFiscalItemMatchValue(item.fiscalUnitFiscalDocumentItem) !== fiscalUnit) {
        return;
      }
      item.idProduct = Number(product.idProduct);
      item.idStockUnit = product.idUnitProduct || null;
      item.conversionFactor = conversionFactor;
      item.selected = 1;
      item.status = "linked";
    });
  };

  const applyStoredFiscalReferences = (entry) => {
    const references = Array.isArray(entry?.productFiscalReferences)
      ? entry.productFiscalReferences
      : [];
    if (!references.length) return;
    entry.items?.forEach((item) => {
      if (item.idProduct) return;
      const description = normalizeFiscalItemMatchValue(item.descriptionFiscalDocumentItem);
      const fiscalUnit = normalizeFiscalItemMatchValue(item.fiscalUnitFiscalDocumentItem);
      const matches = references.filter((reference) =>
        normalizeFiscalItemMatchValue(reference.descriptionFiscalProductReference) === description
        && normalizeFiscalItemMatchValue(reference.fiscalUnitProductFiscalReference || reference.fiscalUnitProductReference) === fiscalUnit
      );
      if (matches.length !== 1) return;
      const reference = matches[0];
      item.idProduct = Number(reference.idProduct);
      item.idStockUnit = reference.idStockUnit ? Number(reference.idStockUnit) : null;
      item.conversionFactor = reference.conversionFactor || "1";
      item.selected = 1;
      item.status = "linked";
    });
  };

  const loadFiscalEntries = async () => {
    entriesLoading = true;
    try {
      const response = await apiFetch(
        `${getApiUrl()}/api/stock/fiscal-entries?includeCompleted=1`
      );
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.fiscalEntries)) {
        throw new Error(result.error || "Não foi possível carregar as entradas.");
      }
      fiscalEntries = result.fiscalEntries;
      missingSuppliers = Array.isArray(result.missingSuppliers) ? result.missingSuppliers : [];
    } catch (entriesError) {
      error = entriesError instanceof Error ? entriesError.message : "Falha ao carregar as entradas.";
    } finally {
      entriesLoading = false;
      renderPreservingFormDraft(root, render);
    }
  };

  const render = () => {
    root.className = `catalog-screen${entryOnly ? " fiscal-entry-only-screen" : " fiscal-document-queue-screen"}`;
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - ${entryOnly ? "Entrada de NF-e / NFC-e" : "Fila de Documentos"}</strong><span>Operador: Operador</span></header>
      ${renderMainMenu()}
      ${renderScreenContextBar(entryOnly ? "Entrada de NF-e / NFC-e" : "Fila de Documentos")}
      <section class="classic-content">
        ${renderSuccessFeedback(message, escapeHtml)}
        ${renderNavigationIntro(entryOnly ? "fiscal-entry-xml" : "fiscal-document-queue", entryOnly ? "Entrada de NF-e / NFC-e" : "Fila de Documentos", entryOnly ? "Revise entradas de NF-e e NFC-e, seus itens, vínculos, conversões e pagamentos." : "Importe documentos fiscais e acompanhe as entradas em estado Aberto.")}
        ${!entryOnly ? `
          <div class="fiscal-document-queue-layout" data-queue-only>
            <div class="fiscal-document-import-column">
              <section class="classic-form-panel fiscal-entry-upload-panel fiscal-browser-panel">
                <div class="classic-panel-header">Consulta fiscal interativa</div>
                <div class="classic-form-body">
                  <p class="form-help">Abra o portal oficial da SEF/MG, informe a chave, resolva o HCaptcha manualmente e avance até a consulta completa. Depois, leia o DOM renderizado para criar a entrada.</p>
                  ${fiscalBrowserError ? `<p class="payment-error">${escapeHtml(fiscalBrowserError)}</p>` : ""}
                </div>
                <div class="classic-form-actions">
                  <button class="classic-button" type="button" data-open-fiscal-browser ${fiscalBrowserBusy ? "disabled" : ""}>Abrir consulta fiscal</button>
                </div>
              </section>
              <form class="classic-form-panel fiscal-entry-upload-panel" data-xml-form>
                <div class="classic-panel-header">Importar XML de entrada</div>
                <div class="classic-form-body">
                  <p class="form-help">O XML autorizado será validado e salvo como entrada em estado <strong>Digitação</strong>. Essa operação não movimenta nem reserva estoque.</p>
                  <label class="form-field"><span>Arquivo XML da NF-e/NFC-e</span><input name="xmlFile" type="file" accept=".xml,text/xml,application/xml" required /></label>
                  ${xmlError ? `<p class="payment-error">${escapeHtml(xmlError)}</p>` : ""}
                </div>
                <div class="classic-form-actions"><button class="classic-button primary" type="submit" ${xmlSubmitting ? "disabled" : ""}>${xmlSubmitting ? "Importando..." : "Importar como entrada"}</button></div>
              </form>
              <section class="classic-grid-panel missing-suppliers-panel">
                <div class="classic-panel-header">Fornecedores não cadastrados</div>
                <div class="classic-grid-wrapper">${entriesLoading ? `<p class="classic-empty">Carregando fornecedores...</p>` : missingSuppliers.length ? `
                  <table class="classic-table"><thead><tr><th>CNPJ</th><th>Fornecedor</th><th class="actions-column">Ação</th></tr></thead>
                  <tbody>${missingSuppliers.map((supplier) => `
                    <tr>
                      <td>${escapeHtml(formatDocument(supplier.documentSupplier))}</td>
                      <td>${escapeHtml(supplier.companyNameSupplier || supplier.tradeNameSupplier || "Não informado")}</td>
                      <td class="actions-column"><button class="classic-button primary" type="button" data-register-supplier="${escapeHtml(supplier.documentSupplier)}">Cadastrar</button></td>
                    </tr>`).join("")}</tbody>
                  </table>` : `<p class="classic-empty">Nenhum fornecedor não cadastrado.</p>`}</div>
              </section>
            </div>
            <section class="classic-grid-panel fiscal-entry-list-panel">
              ${renderFiscalEntryListHeader("Documentos na Fila")}
              <div class="classic-grid-wrapper" data-default-page-size="25">${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : entriesLoading ? `<p class="classic-empty">Carregando documentos...</p>` : visibleFiscalEntries().length ? `
                <table class="classic-table">
                  <thead><tr>${sortableHeader("modelFiscalDocument", "Tipo")}${sortableHeader("numberFiscalDocument", "Doc")}${sortableHeader("issuerLegalNameFiscalDocument", "Fornecedor", "supplier-column product-name-column")}${sortableHeader("issuedAtFiscalDocument", "Emissão")}${sortableHeader("totalFiscalDocument", "Valor", "value-column")}${sortableHeader("statusFiscalEntry", "Status")}<th class="actions-column">Ações</th></tr></thead>
                  <tbody>${visibleFiscalEntries().map((entry) => `
                    <tr class="${isCurrentFiscalEntry(entry) ? "fiscal-entry-current" : ""}">
                      <td>${Number(entry.modelFiscalDocument) === 65 ? "NFC-e" : "NF-e"}</td>
                      <td>${escapeHtml(entry.numberFiscalDocument || "Documento fiscal")}</td>
                      <td class="supplier-column product-name-column">${escapeHtml(entry.issuerLegalNameFiscalDocument || formatDocument(entry.issuerDocumentFiscalDocument))}</td>
                      <td>${escapeHtml(formatDateOnly(entry.issuedAtFiscalDocument))}</td>
                      <td class="value-column">${escapeHtml(formatMoney(entry.totalFiscalDocument))}</td>
                      <td><span class="fiscal-entry-status fiscal-entry-status-${fiscalEntryStatusClass(entry.statusFiscalEntry)}">${escapeHtml(fiscalEntryStatusLabel(entry.statusFiscalEntry))}</span></td>
                      <td class="actions-column"><button class="icon-button" type="button" data-copy-access-key="${escapeHtml(entry.accessKeyFiscalDocument)}" aria-label="Copiar chave de acesso" title="Copiar chave de acesso"><i data-lucide="notebook-tabs"></i></button><button class="icon-button" type="button" data-open-entry="${entry.idFiscalEntry}" aria-label="Continuar revisão" title="Continuar revisão"><i data-lucide="arrow-right-circle"></i></button><button class="icon-button delete" type="button" data-delete-entry="${entry.idFiscalEntry}" aria-label="Excluir documento" title="Excluir documento"><i data-lucide="trash-2"></i></button></td>
                    </tr>`).join("")}</tbody>
                </table>` : `<p class="classic-empty">Nenhum documento na fila.</p>`}</div>
            </section>
          </div>
        ` : ""}
        ${entryOnly ? `
          <section class="classic-grid-panel fiscal-entry-list-panel">
            ${renderFiscalEntryListHeader("Entradas iniciadas")}
            <div class="classic-grid-wrapper" data-default-page-size="25">${entriesLoading ? `<p class="classic-empty">Carregando entradas...</p>` : visibleFiscalEntries().length ? `
              <table class="classic-table">
                <thead><tr>${sortableHeader("modelFiscalDocument", "Tipo")}${sortableHeader("numberFiscalDocument", "Doc")}${sortableHeader("issuerLegalNameFiscalDocument", "Fornecedor", "supplier-column product-name-column")}${sortableHeader("issuedAtFiscalDocument", "Emissão")}${sortableHeader("totalFiscalDocument", "Valor", "value-column")}${sortableHeader("statusFiscalEntry", "Status")}<th class="actions-column">Ações</th></tr></thead>
                <tbody>${visibleFiscalEntries().map((entry) => `
                  <tr class="${isCurrentFiscalEntry(entry) ? "fiscal-entry-current" : ""}">
                    <td>${Number(entry.modelFiscalDocument) === 65 ? "NFC-e" : "NF-e"}</td>
                    <td>${escapeHtml(entry.numberFiscalDocument || "Documento fiscal")}</td>
                    <td class="supplier-column product-name-column">${escapeHtml(entry.issuerLegalNameFiscalDocument || formatDocument(entry.issuerDocumentFiscalDocument))}</td>
                    <td>${escapeHtml(formatDateOnly(entry.issuedAtFiscalDocument))}</td>
                    <td class="value-column">${escapeHtml(formatMoney(entry.totalFiscalDocument))}</td>
                    <td><span class="fiscal-entry-status fiscal-entry-status-${fiscalEntryStatusClass(entry.statusFiscalEntry)}">${escapeHtml(fiscalEntryStatusLabel(entry.statusFiscalEntry))}</span></td>
                    <td class="actions-column"><button class="icon-button" type="button" data-copy-access-key="${escapeHtml(entry.accessKeyFiscalDocument)}" aria-label="Copiar chave de acesso" title="Copiar chave de acesso"><i data-lucide="notebook-tabs"></i></button><button class="icon-button" type="button" data-open-entry="${entry.idFiscalEntry}" aria-label="Abrir entrada" title="Abrir entrada"><i data-lucide="arrow-right-circle"></i></button><button class="icon-button delete" type="button" data-delete-entry="${entry.idFiscalEntry}" aria-label="Excluir entrada" title="Excluir entrada"><i data-lucide="trash-2"></i></button></td>
                  </tr>`).join("")}</tbody>
              </table>` : `<p class="classic-empty">Nenhuma entrada iniciada.</p>`}</div>
          </section>
        ` : ""}
        ${currentEntry ? `
          <section class="classic-grid-panel fiscal-entry-workspace-panel">
            <div class="classic-panel-header">Entrada ${escapeHtml(currentEntry.fiscalEntry.idFiscalEntry)} - <span class="fiscal-entry-title-status">${escapeHtml(fiscalEntryStatusLabel(currentEntry.fiscalEntry.statusFiscalEntry))}</span></div>
            <div class="classic-form-body">
              ${renderFiscalEntryHeader(currentEntry.fiscalEntry)}
              <p class="form-help">${currentEntry.fiscalEntry.statusFiscalEntry === "confirmed"
                ? "Esta entrada está confirmada e seus efeitos fiscais, de estoque e de custos já foram aplicados. A exclusão exige confirmação e realiza o estorno desses efeitos."
                : "Esta revisão ainda não movimenta, reserva ou baixa estoque. Clique em um item para vincular o produto e informar a conversão. Quando todos os itens e o pagamento estiverem válidos, gravar confirmará a entrada. Reconsultar valores atualiza somente os valores fiscais dos itens e preserva os vínculos já criados."}</p>
            </div>
            <div class="classic-grid-wrapper">
              <table class="classic-table fiscal-entry-items-table">
                <thead><tr><th>Usar</th><th>Linha</th><th class="description-column">Descrição</th><th>Qtd</th><th>Unidade</th><th class="value-column">Valor</th><th>Status</th></tr></thead>
                <tbody>${currentEntry.items.map((item) => `
                  <tr data-edit-item="${item.idFiscalEntryItem}" class="${item.idProduct ? "entry-item-linked" : ""}">
                    <td><input type="checkbox" data-select-item="${item.idFiscalEntryItem}" ${item.selected ? "checked" : ""} aria-label="Incluir item ${escapeHtml(item.lineNumberFiscalDocumentItem)}" /></td>
                    <td>${escapeHtml(item.lineNumberFiscalDocumentItem)}</td>
                    <td class="description-column">${escapeHtml(item.descriptionFiscalDocumentItem)}</td>
                    <td>${escapeHtml(formatQuantity(item.quantityFiscalDocumentItem))}</td>
                    <td>${escapeHtml(String(item.fiscalUnitFiscalDocumentItem || "").toLocaleUpperCase("pt-BR"))}</td>
                    <td class="value-column">${escapeHtml(formatMoney(item.totalFiscalDocumentItem))}</td>
                    <td>${item.idProduct ? "Vinculado" : "Pendente"}</td>
                  </tr>`).join("")}</tbody>
              </table>
            </div>
            <form class="classic-form-panel" data-entry-payment-form>
              <div class="classic-panel-header">Forma de pagamento</div>
              <div class="classic-form-body">
                <div class="classic-form-grid">
                  <label class="form-field"><span>Forma</span><select name="paymentMethod" required><option value="">Selecione</option>${paymentMethods.map((method) => `<option value="${escapeHtml(method.namePaymentMethod)}" ${selectedPaymentMethod === method.namePaymentMethod ? "selected" : ""}>${escapeHtml(method.namePaymentMethod)}</option>`).join("")}</select></label>
                  <label class="form-field"><span>Valor dos produtos marcados</span><input name="amount" value="${escapeHtml(formatBrazilianNumber(selectedEntryTotal()))}" inputmode="decimal" readonly /></label>
                </div>
                ${currentEntry.fiscalEntry.statusFiscalEntry === "confirmed"
                  ? ""
                  : '<p class="form-help">O valor é recalculado pela soma das linhas marcadas. Itens desmarcados não entram no pagamento.</p>'}
                ${entryError ? `<p class="payment-error">${escapeHtml(entryError)}</p>` : ""}
              </div>
              <div class="classic-form-actions">${currentEntry.fiscalEntry.statusFiscalEntry === "confirmed"
                ? `<button class="classic-button delete" data-delete-current-entry type="button">Excluir entrada</button>`
                : `<button class="classic-button" data-reconcile-entry type="button" ${entryReconciling || entrySaving || entryConfirming ? "disabled" : ""}>${entryReconciling ? "Atualizando..." : "Atualizar consulta"}</button><button class="classic-button primary" data-save-entry type="button" ${entrySaving ? "disabled" : ""}>${entrySaving ? "Gravando..." : "Gravar entrada"}</button>${currentEntry.fiscalEntry.statusFiscalEntry === "open" ? `<button class="classic-button primary" data-confirm-entry type="button" ${entrySaving || entryReconciling || entryConfirming ? "disabled" : ""}>${entryConfirming ? "Confirmando..." : "Revisar impacto"}</button>` : ""}`}</div>
            </form>
          </section>
        ` : ""}
        ${entryOnly && !currentEntry ? `
          <section class="classic-grid-panel fiscal-entry-workspace-panel fiscal-entry-empty-panel">
            <div class="classic-panel-header">Entrada</div>
            <div class="classic-empty">Selecione uma entrada iniciada ao lado ou importe um novo XML para começar a revisão.</div>
          </section>
        ` : ""}
        ${editingItem ? `
          <div class="classic-modal-backdrop" data-entry-item-backdrop>
            <section class="classic-modal" role="dialog" aria-modal="true" aria-labelledby="entry-item-title">
              <div class="classic-panel-header modal-panel-header"><span id="entry-item-title">Vínculo do produto</span><button class="modal-close-button" data-cancel-entry-item type="button" aria-label="Fechar">×</button></div>
              <form class="classic-form-body" data-entry-item-form>
                <p class="form-help">${escapeHtml(editingItem.descriptionFiscalDocumentItem)} · ${escapeHtml(formatQuantity(editingItem.quantityFiscalDocumentItem))} ${escapeHtml(editingItem.fiscalUnitFiscalDocumentItem)}</p>
                <div class="form-field fiscal-product-picker classic-combobox">
                  <span>Produto comercial</span>
                  <input type="hidden" name="idProduct" value="${escapeHtml(editingItem.idProduct || "")}" />
                  <button type="button" class="classic-select-trigger" data-product-toggle aria-haspopup="listbox" aria-expanded="${productPicker.isOpen ? "true" : "false"}">${escapeHtml(selectedProductLabel())}</button>
                  ${productPicker.isOpen ? `<div class="fiscal-product-options combobox-options-fixed-search" role="listbox" aria-label="Produtos comerciais">
                    <input data-product-search type="search" autocomplete="off" value="${escapeHtml(productPicker.searchTerm)}" placeholder="Pesquisar por descrição ou código PDV..." aria-label="Pesquisar produto comercial" />
                    <div class="combobox-option-list">${productOptions().map((product) => `
                      <button class="fiscal-product-option ${Number(editingItem.idProduct) === Number(product.idProduct) ? "is-selected" : ""}" type="button" data-product-option="${escapeHtml(product.idProduct)}">
                        ${escapeHtml(formatProductOptionLabel(product))}
                      </button>
                    `).join("") || '<span class="classic-empty">Nenhum produto encontrado.</span>'}</div>
                  </div>` : ""}
                </div>
                <div class="classic-form-grid">
                  <label class="form-field"><span>Unidade fiscal</span><input value="${escapeHtml(editingItem.fiscalUnitFiscalDocumentItem)}" readonly /></label>
                  <label class="form-field"><span>Unidade de estoque</span><input data-stock-unit value="${escapeHtml(selectedProduct(editingItem)?.codeUnit || "-")}" readonly /></label>
                </div>
                <label class="form-field"><span>Conversão (1 ${escapeHtml(editingItem.fiscalUnitFiscalDocumentItem)} = X unidade(s) de estoque)</span><input name="conversionFactor" inputmode="decimal" value="${escapeHtml(editingItem.conversionFactor || suggestedConversionFactor(editingItem.fiscalUnitFiscalDocumentItem, selectedProduct(editingItem)?.codeUnit))}" required /></label>
                <p class="form-help" data-conversion-preview></p>
                <div class="classic-form-actions"><button class="classic-button primary" type="submit">Salvar vínculo</button><button class="classic-button" data-cancel-entry-item type="button">Cancelar</button></div>
              </form>
            </section>
          </div>
        ` : ""}
        ${supplierModal ? `
          <div class="classic-modal-backdrop" data-missing-supplier-backdrop>
            <section class="classic-modal supplier-edit-modal" role="dialog" aria-modal="true" aria-labelledby="missing-supplier-title">
              <div class="classic-panel-header modal-panel-header"><span id="missing-supplier-title">Editar fornecedor</span><button class="modal-close-button" data-cancel-missing-supplier type="button" aria-label="Fechar" title="Fechar"><i data-lucide="x"></i></button></div>
              <form data-missing-supplier-form>
                <div class="classic-form-body"><div class="classic-form-grid">${renderSupplierFormFields(supplierModal, { lookupCnpj: true, lookupCep: true })}</div>${supplierError ? `<p class="payment-error">${escapeHtml(supplierError)}</p>` : ""}</div>
                <div class="classic-form-actions"><button class="classic-button primary" type="submit" ${supplierSubmitting ? "disabled" : ""}>${supplierSubmitting ? "Salvando..." : "Cadastrar fornecedor"}</button><button class="classic-button" data-cancel-missing-supplier type="button">Cancelar</button></div>
              </form>
            </section>
          </div>
        ` : ""}
      </section>
    `;
    renderLucideIcons(root);
    bindMainMenu(root, handlers);
    bindSupplierFormFormatting(root);
    bind();
  };

  const setSupplierModalField = (form, name, value) => {
    const field = form?.querySelector(`[name="${name}"]`);
    if (!field || value == null) return;
    field.value = name === "phoneSupplier"
      ? formatSupplierPhone(value)
      : name === "zipCodeSupplier"
        ? formatSupplierCep(value)
        : name === "emailSupplier"
          ? formatSupplierEmail(value)
          : String(value);
  };

  const lookupMissingSupplierCnpj = async (form) => {
    const cnpj = String(form?.querySelector("[name='documentSupplier']")?.value || "").replace(/\D/g, "");
    if (cnpj.length !== 14) {
      supplierError = "Informe um CNPJ com 14 dígitos para consultar.";
      render();
      return;
    }
    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      const company = await response.json();
      if (!response.ok || company.message) throw new Error(company.message || "CNPJ não encontrado.");
      setSupplierModalField(form, "companyNameSupplier", company.razao_social);
      setSupplierModalField(form, "tradeNameSupplier", company.nome_fantasia);
      setSupplierModalField(form, "phoneSupplier", company.ddd_telefone_1);
      setSupplierModalField(form, "emailSupplier", company.email);
      setSupplierModalField(form, "zipCodeSupplier", company.cep);
      setSupplierModalField(form, "addressSupplier", company.logradouro);
      setSupplierModalField(form, "addressNumberSupplier", company.numero);
      setSupplierModalField(form, "addressComplementSupplier", company.complemento);
      setSupplierModalField(form, "neighborhoodSupplier", company.bairro);
      setSupplierModalField(form, "citySupplier", company.municipio);
      setSupplierModalField(form, "stateSupplier", company.uf);
      supplierError = "";
    } catch (lookupError) {
      supplierError = lookupError instanceof Error ? lookupError.message : "Não foi possível consultar o CNPJ.";
      render();
    }
  };

  const lookupMissingSupplierCep = async (form) => {
    const cep = String(form?.querySelector("[name='zipCodeSupplier']")?.value || "").replace(/\D/g, "");
    if (cep.length !== 8) {
      supplierError = "Informe um CEP com 8 dígitos para consultar.";
      render();
      return;
    }
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const address = await response.json();
      if (!response.ok || address.erro) throw new Error("CEP não encontrado.");
      setSupplierModalField(form, "addressSupplier", address.logradouro);
      setSupplierModalField(form, "neighborhoodSupplier", address.bairro);
      setSupplierModalField(form, "citySupplier", address.localidade);
      setSupplierModalField(form, "stateSupplier", address.uf);
      supplierError = "";
    } catch (lookupError) {
      supplierError = lookupError instanceof Error ? lookupError.message : "Não foi possível consultar o CEP.";
      render();
    }
  };

  const submitMissingSupplier = async (form) => {
    const body = Object.fromEntries(new FormData(form));
    supplierModal = { ...supplierModal, ...body };
    supplierSubmitting = true;
    supplierError = "";
    render();
    try {
      const response = await apiFetch(`${getApiUrl()}/api/suppliers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...supplierModal,
          documentSupplier: String(supplierModal.documentSupplier || "").replace(/\D/g, ""),
          phoneSupplier: String(supplierModal.phoneSupplier || "").replace(/\D/g, ""),
          emailSupplier: formatSupplierEmail(supplierModal.emailSupplier),
          zipCodeSupplier: String(supplierModal.zipCodeSupplier || "").replace(/\D/g, ""),
          countrySupplier: "Brasil"
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível cadastrar o fornecedor.");
      supplierModal = null;
      message = "Fornecedor cadastrado com sucesso.";
      await loadFiscalEntries();
      scheduleMessageClear(() => {
        message = "";
        clearRenderedFeedback(root);
      });
    } catch (submitError) {
      supplierError = submitError instanceof Error ? submitError.message : "Falha ao cadastrar o fornecedor.";
    } finally {
      supplierSubmitting = false;
      render();
    }
  };

  const copyAccessKey = async (accessKey) => {
    try {
      await copyTextToClipboard(accessKey);
      message = "Chave de acesso copiada para a área de transferência.";
      render();
      scheduleMessageClear(() => {
        message = "";
        clearRenderedFeedback(root);
      });
    } catch (copyError) {
      error = copyError instanceof Error
        ? copyError.message
        : "Não foi possível copiar a chave de acesso.";
      render();
    }
  };

  const bind = () => {
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    root.querySelector("[data-open-fiscal-browser]")?.addEventListener("click", () => void openFiscalBrowser());
    root.querySelector("[data-xml-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitXml(event.currentTarget);
    });
    root.querySelectorAll("[data-register-supplier]").forEach((button) => {
      button.addEventListener("click", () => {
        const supplier = missingSuppliers.find((item) => String(item.documentSupplier) === String(button.dataset.registerSupplier));
        if (!supplier) return;
        supplierModal = {
          typeSupplier: String(supplier.documentSupplier || "").replace(/\D/g, "").length === 11 ? "fisica" : "juridica",
          documentSupplier: supplier.documentSupplier || "",
          companyNameSupplier: formatSupplierTitle(supplier.companyNameSupplier),
          tradeNameSupplier: formatSupplierTitle(supplier.tradeNameSupplier),
          zipCodeSupplier: supplier.zipCodeSupplier || "",
          addressSupplier: formatSupplierTitle(supplier.addressSupplier),
          addressNumberSupplier: supplier.addressNumberSupplier || "",
          addressComplementSupplier: formatSupplierTitle(supplier.addressComplementSupplier),
          neighborhoodSupplier: formatSupplierTitle(supplier.neighborhoodSupplier),
          citySupplier: formatSupplierTitle(supplier.citySupplier),
          stateSupplier: supplier.stateSupplier || ""
        };
        supplierError = "";
        render();
      });
    });
    root.querySelector("[data-missing-supplier-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitMissingSupplier(event.currentTarget);
    });
    root.querySelectorAll("[data-cancel-missing-supplier]").forEach((button) => {
      button.addEventListener("click", () => {
        supplierModal = null;
        supplierError = "";
        render();
      });
    });
    root.querySelector("[data-missing-supplier-form] [data-lookup-cnpj]")?.addEventListener("click", (event) => {
      void lookupMissingSupplierCnpj(event.currentTarget.closest("form"));
    });
    root.querySelector("[data-missing-supplier-form] [data-lookup-cep]")?.addEventListener("click", (event) => {
      void lookupMissingSupplierCep(event.currentTarget.closest("form"));
    });
    root.querySelectorAll("[data-open-entry]").forEach((button) => {
      button.addEventListener("click", () => {
        const idFiscalEntry = Number(button.dataset.openEntry);
        if (!entryOnly && typeof handlers.onFiscalEntryXml === "function") {
          handlers.onFiscalEntryXml(idFiscalEntry);
          return;
        }
        void openEntry(idFiscalEntry);
      });
    });
    root.querySelectorAll("[data-delete-entry]").forEach((button) => {
      button.addEventListener("click", () => void removeEntry(Number(button.dataset.deleteEntry)));
    });
    root.querySelector("[data-delete-current-entry]")?.addEventListener("click", () => {
      void removeEntry(Number(currentEntry?.fiscalEntry?.idFiscalEntry));
    });
    root.querySelectorAll("[data-copy-access-key]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        void copyAccessKey(button.dataset.copyAccessKey);
      });
    });
    root.querySelectorAll("[data-fiscal-entry-sort]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.fiscalEntrySort;
        if (fiscalEntrySort.key === key) {
          fiscalEntrySort.direction = fiscalEntrySort.direction === "asc" ? "desc" : "asc";
        } else {
          fiscalEntrySort = { key, direction: "asc" };
        }
        render();
      });
    });
    root.querySelectorAll("[data-fiscal-entry-status-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        fiscalEntryStatusFilter = button.dataset.fiscalEntryStatusFilter;
        render();
      });
    });
    root.querySelectorAll("[data-fiscal-entry-search]").forEach((input) => {
      input.addEventListener("input", (event) => {
        fiscalEntrySearch = event.currentTarget.value;
        rerenderPreservingInputSelection(event.currentTarget, render, () => root.querySelector("[data-fiscal-entry-search]"));
      });
    });
    root.querySelector("[data-entry-payment-form] select[name='paymentMethod']")?.addEventListener("change", (event) => {
      selectedPaymentMethod = event.currentTarget.value;
    });
    root.querySelector("[data-reconcile-entry]")?.addEventListener("click", () => void openFiscalReconciliation());
    root.querySelector("[data-save-entry]")?.addEventListener("click", () => void saveEntry());
    root.querySelector("[data-confirm-entry]")?.addEventListener("click", () => void confirmEntry());
    root.querySelectorAll("[data-edit-item]").forEach((row) => {
      row.addEventListener("click", (event) => {
        if (event.target.closest("[data-select-item]")) return;
        editingItem = currentEntry.items.find((item) => Number(item.idFiscalEntryItem) === Number(row.dataset.editItem)) || null;
      productPicker.searchTerm = "";
      productPicker.isOpen = false;
        render();
      });
    });
    root.querySelectorAll("[data-select-item]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const item = currentEntry?.items.find((candidate) => Number(candidate.idFiscalEntryItem) === Number(checkbox.dataset.selectItem));
        if (item) {
          item.selected = checkbox.checked ? 1 : 0;
          render();
        }
      });
    });
    root.querySelector("[data-entry-item-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.currentTarget));
      const item = currentEntry?.items.find((candidate) => Number(candidate.idFiscalEntryItem) === Number(editingItem.idFiscalEntryItem));
      if (item) {
        item.idProduct = Number(payload.idProduct);
        const product = products.find((candidate) => Number(candidate.idProduct) === item.idProduct);
        item.idStockUnit = product?.idUnitProduct || null;
        item.conversionFactor = String(payload.conversionFactor || "1").replace(",", ".");
        item.selected = 1;
        item.status = "linked";
        if (product) {
          applyLinkToMatchingItems(item, product, item.conversionFactor);
        }
      }
      editingItem = null;
      productPicker.searchTerm = "";
      productPicker.isOpen = false;
      render();
    });
    root.querySelector("[data-product-toggle]")?.addEventListener("click", () => {
      productPicker.isOpen = !productPicker.isOpen;
      render();
      if (productPicker.isOpen) root.querySelector("[data-product-search]")?.focus();
    });
    root.querySelector("[data-product-search]")?.addEventListener("input", (event) => {
      productPicker.searchTerm = event.currentTarget.value;
      rerenderPreservingInputSelection(
        event.currentTarget,
        render,
        () => root.querySelector("[data-product-search]")
      );
    });
    root.querySelectorAll("[data-product-option]").forEach((button) => {
      button.addEventListener("click", () => {
        if (editingItem) editingItem.idProduct = Number(button.dataset.productOption);
        productPicker.searchTerm = "";
        productPicker.isOpen = false;
        rerenderComboboxSelection(
          render,
          () => root.querySelector("[data-product-toggle]")
        );
      });
    });
    const updateConversionPreview = () => {
      const factor = Number(String(root.querySelector("[data-entry-item-form] [name='conversionFactor']")?.value || "0").replace(",", "."));
      const stockUnit = root.querySelector("[data-stock-unit]")?.value || "-";
      const quantity = Number(editingItem?.quantityFiscalDocumentItem || 0);
      const preview = root.querySelector("[data-conversion-preview]");
      if (preview) {
        preview.textContent = Number.isFinite(factor)
          ? `${formatQuantity(quantity)} ${editingItem?.fiscalUnitFiscalDocumentItem || ""} × ${formatQuantity(factor)} = ${formatQuantity(quantity * factor)} ${stockUnit}`
          : "Informe um fator de conversão válido.";
      }
    };
    root.querySelector("[data-entry-item-form] [name='conversionFactor']")?.addEventListener("input", updateConversionPreview);
    root.querySelector("[data-entry-item-form] select[name='idProduct']")?.addEventListener("change", (event) => {
      const product = products.find((candidate) => Number(candidate.idProduct) === Number(event.currentTarget.value));
      const stockUnit = root.querySelector("[data-stock-unit]");
      if (stockUnit) stockUnit.value = product?.codeUnit || "-";
      updateConversionPreview();
    });
    updateConversionPreview();
    root.querySelectorAll("[data-cancel-entry-item]").forEach((button) => {
      button.addEventListener("click", () => {
        editingItem = null;
        productPicker.searchTerm = "";
        productPicker.isOpen = false;
        render();
      });
    });
  };

  const finishImportedEntry = async (result, form) => {
    message = `Entrada ${result.fiscalEntry?.idFiscalEntry || ""} gravada como ${fiscalEntryStatusLabel(result.fiscalEntry?.statusFiscalEntry)}.`;
    await loadFiscalEntries();
    if (entryOnly) {
      currentEntry = await loadEntry(result.fiscalEntry.idFiscalEntry);
      entryPayments = [];
      selectedPaymentMethod = "";
      await loadProducts();
      await loadPaymentMethods();
    }
    render();
    form?.reset();
    scheduleMessageClear(() => {
      message = "";
      clearRenderedFeedback(root);
    });
  };

  const openFiscalBrowser = async () => {
    fiscalBrowserError = "";
    if (!isTauriWindow()) {
      fiscalBrowserError = "A consulta fiscal interativa exige o aplicativo Tauri.";
      render();
      return;
    }
    try {
      await invoke("open_fiscal_consultation");
    } catch (openError) {
      fiscalBrowserError = openError instanceof Error
        ? openError.message
        : "Não foi possível abrir a consulta fiscal.";
      render();
    }
  };

  const openFiscalReconciliation = async () => {
    if (!currentEntry || !["draft", "open"].includes(currentEntry.fiscalEntry.statusFiscalEntry)) return;
    const entryId = Number(currentEntry.fiscalEntry.idFiscalEntry);
    const confirmed = await confirmAction({
      title: "Reler documento fiscal",
      message: `Deseja reler os dados fiscais da chave ${currentEntry.fiscalEntry.accessKeyFiscalDocument}?`,
      detail: "A releitura usa o conteúdo original já salvo e preserva vínculos, produtos selecionados, conversões e pagamentos.",
      confirmLabel: "Reler documento"
    });
    if (!confirmed) return;
    entryReconciling = true;
    fiscalBrowserBusy = true;
    fiscalBrowserError = "";
    render();
    try {
      const response = await fetchWithTimeout(
        (signal) => apiFetch(`${getApiUrl()}/api/stock/fiscal-entries/${entryId}/reconcile-values`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          signal
        }),
        30000
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível reler os dados fiscais.");
      currentEntry = await loadEntry(entryId);
      await loadFiscalEntries();
      message = `${result.updatedItemCount} valor(es) fiscal(is) relido(s).`;
      render();
      scheduleMessageClear(() => {
        message = "";
        clearRenderedFeedback(root);
      });
    } catch (readError) {
      fiscalBrowserError = readError instanceof Error
        ? readError.message
        : "Falha ao reler os dados fiscais.";
      render();
    } finally {
      entryReconciling = false;
      fiscalBrowserBusy = false;
      render();
    }
  };

  const importFiscalDom = async (html) => {
    if (fiscalBrowserBusy) return;
    fiscalBrowserBusy = true;
    fiscalBrowserError = "";
    render();
    try {
      if (!html.trim()) throw new Error("A consulta fiscal não retornou conteúdo.");
      const currentReconcileEntryId = reconcileEntryId;
      reconcileEntryId = null;
      await invoke("close_fiscal_consultation");
      if (currentReconcileEntryId) {
        const targetEntry = currentEntry?.fiscalEntry?.idFiscalEntry === currentReconcileEntryId
          ? currentEntry.fiscalEntry
          : fiscalEntries.find((entry) => Number(entry.idFiscalEntry) === currentReconcileEntryId);
        const accessKey = html.match(/\d(?:[\s./-]*\d){43}/)?.[0]?.replace(/\D/g, "") || "";
        if (!targetEntry || accessKey !== String(targetEntry.accessKeyFiscalDocument)) {
          throw new Error("A consulta lida não corresponde à chave da entrada selecionada.");
        }
        const confirmed = await confirmAction({
          title: "Entrada já existente",
          message: `A chave ${targetEntry.accessKeyFiscalDocument} já existe nesta entrada. Deseja reconciliar os valores?`,
          detail: "Os vínculos, produtos selecionados, conversões e pagamentos serão preservados.",
          confirmLabel: "Reconciliar valores"
        });
        if (!confirmed) return;
        const response = await fetchWithTimeout(
          (signal) => apiFetch(`${getApiUrl()}/api/stock/fiscal-entries/${currentReconcileEntryId}/reconcile-values`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ html }),
            signal
          }),
          30000
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Não foi possível reconciliar os valores.");
        currentEntry = await loadEntry(currentReconcileEntryId);
        await loadFiscalEntries();
        message = `${result.updatedItemCount} valor(es) fiscal(is) reconciliado(s).`;
        render();
        scheduleMessageClear(() => {
          message = "";
          clearRenderedFeedback(root);
        });
        return;
      }
      const response = await fetchWithTimeout(
        (signal) => apiFetch(`${getApiUrl()}/api/stock/fiscal-document-queue/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceFormat: "html", html }),
          signal
        }),
        30000
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível importar a consulta fiscal.");
      await finishImportedEntry(result, null);
    } catch (readError) {
      fiscalBrowserError = readError instanceof Error
        ? readError.message
        : "Falha ao ler a consulta fiscal.";
    } finally {
      reconcileEntryId = null;
      entryReconciling = false;
      fiscalBrowserBusy = false;
      render();
    }
  };

  const submitXml = async (form) => {
    const file = form.querySelector("[name='xmlFile']")?.files?.[0];
    if (!file) {
      xmlError = "Selecione um arquivo XML.";
      render();
      return;
    }
    xmlSubmitting = true;
    xmlError = "";
    renderPreservingFormDraft(root, render);
    try {
      const xml = await file.text();
      const accessKey = xml.match(/<(?:(?:[\w.-]+):)?infNFe\b[^>]*\bId=["']NFe(\d{44})["']/i)?.[1] || "";
      if (!accessKey) throw new Error("Não foi possível identificar a chave de acesso no XML.");
      const response = await fetchWithTimeout(
        (signal) => apiFetch(`${getApiUrl()}/api/stock/fiscal-document-queue/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessKeyFiscalDocumentQueue: accessKey, xml }),
          signal
        }),
        15000
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível importar o XML.");
      await finishImportedEntry(result, form);
    } catch (submitError) {
      xmlError = submitError instanceof Error ? submitError.message : "Falha ao importar o XML.";
    } finally {
      xmlSubmitting = false;
      renderPreservingFormDraft(root, render);
    }
  };

  const loadEntry = async (idFiscalEntry) => {
    const response = await fetchWithTimeout(
      (signal) => apiFetch(`${getApiUrl()}/api/stock/fiscal-entries/${idFiscalEntry}`, { signal }),
      15000
    );
    const result = await response.json();
    if (!response.ok || !result.fiscalEntry) {
      throw new Error(result.error || "Não foi possível carregar a entrada.");
    }
    applyStoredFiscalReferences(result);
    return result;
  };

  const loadProducts = async () => {
    const response = await apiFetch(`${getApiUrl()}/api/products?includeInactive=1`);
    const result = await response.json();
    if (!response.ok || !Array.isArray(result.products)) {
      throw new Error(result.error || "Não foi possível carregar os produtos para vínculo.");
    }
    products = result.products;
  };

  const loadPaymentMethods = async () => {
    const response = await apiFetch(`${getApiUrl()}/api/payment-methods`);
    const result = await response.json();
    if (!response.ok || !Array.isArray(result.paymentMethods)) {
      throw new Error(result.error || "Não foi possível carregar as formas de pagamento.");
    }
    paymentMethods = result.paymentMethods;
  };

  const openEntry = async (idFiscalEntry) => {
    activeEntryId = Number(idFiscalEntry);
    try {
      currentEntry = await loadEntry(idFiscalEntry);
      if (currentEntry.fiscalEntry?.statusFiscalEntry) {
        fiscalEntryStatusFilter = currentEntry.fiscalEntry.statusFiscalEntry;
      }
      entryPayments = currentEntry.entryPayments || [];
      selectedPaymentMethod = entryPayments[0]?.paymentDescriptionFiscalEntryPayment || "";
      await loadProducts();
      await loadPaymentMethods();
      render();
    } catch (openError) {
      error = openError instanceof Error ? openError.message : "Não foi possível abrir a entrada.";
      render();
    }
  };

  const saveEntry = async () => {
    if (!currentEntry) return;
    entrySaving = true;
    entryError = "";
    render();
    try {
      const response = await apiFetch(`${getApiUrl()}/api/stock/fiscal-entries/${currentEntry.fiscalEntry.idFiscalEntry}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: currentEntry.items.map((item) => ({
            idFiscalEntryItem: item.idFiscalEntryItem,
            selected: Boolean(item.selected),
            idProduct: item.idProduct,
            idStockUnit: item.idStockUnit,
            conversionFactor: item.conversionFactor || 1
          })),
          payments: [{
            description: selectedPaymentMethod,
            amount: selectedEntryTotal().toFixed(2)
          }]
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível gravar a entrada.");
      currentEntry = await loadEntry(currentEntry.fiscalEntry.idFiscalEntry);
      entryPayments = currentEntry.entryPayments || [];
      selectedPaymentMethod = entryPayments[0]?.paymentDescriptionFiscalEntryPayment || "";
      await loadFiscalEntries();
      message = `Entrada ${currentEntry.fiscalEntry.idFiscalEntry} gravada como ${fiscalEntryStatusLabel(result.statusFiscalEntry)}.`;
      render();
      scheduleMessageClear(() => {
        message = "";
        clearRenderedFeedback(root);
      });
    } catch (saveError) {
      entryError = saveError instanceof Error ? saveError.message : "Falha ao gravar a entrada.";
      render();
    } finally {
      entrySaving = false;
      render();
    }
  };

  const confirmEntry = async () => {
    if (!currentEntry || currentEntry.fiscalEntry.statusFiscalEntry !== "open") return;
    entryConfirming = true;
    entryError = "";
    render();
    try {
      const entryId = currentEntry.fiscalEntry.idFiscalEntry;
      const impactResponse = await apiFetch(`${getApiUrl()}/api/stock/fiscal-entries/${entryId}/impact`);
      const impactResult = await impactResponse.json();
      if (!impactResponse.ok) throw new Error(impactResult.error || "Não foi possível calcular o impacto.");
      if (impactResult.pendingCount > 0 || !impactResult.items?.length) {
        throw new Error("Todos os itens selecionados devem estar vinculados antes da confirmação.");
      }
      const confirmed = await confirmAction({
        title: "Revisar impacto da entrada",
        message: "Somente os itens selecionados e vinculados serão confirmados.",
        detailItems: impactResult.items.map((item) => ({
          title: item.nameProduct,
          summary: [
            `Quantidade: ${formatQuantity(item.quantityConverted)} un.`,
            `Custo: ${formatMoney(item.currentCost)} → ${formatMoney(item.estimatedCost)}`,
            `Estoque: ${formatQuantity(item.currentStock)} → ${formatQuantity(item.estimatedStock)}`
          ].join("  •  ")
        })),
        confirmLabel: "Confirmar entrada"
      });
      if (!confirmed) return;
      const response = await apiFetch(`${getApiUrl()}/api/stock/fiscal-entries/${entryId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [] })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível confirmar a entrada.");
      currentEntry = await loadEntry(entryId);
      await loadFiscalEntries();
      message = result.updatedRecipeCount
        ? `Entrada ${entryId} confirmada. ${result.updatedRecipeCount} Receita(s)/Ficha(s) recalculada(s).`
        : `Entrada ${entryId} confirmada.`;
      render();
      scheduleMessageClear(() => {
        message = "";
        clearRenderedFeedback(root);
      });
    } catch (confirmError) {
      entryError = confirmError instanceof Error ? confirmError.message : "Falha ao confirmar a entrada.";
      render();
    } finally {
      entryConfirming = false;
      render();
    }
  };


  const removeEntry = async (idFiscalEntry) => {
    const entry = fiscalEntries.find((item) => Number(item.idFiscalEntry) === idFiscalEntry)
      || (Number(currentEntry?.fiscalEntry?.idFiscalEntry) === idFiscalEntry ? currentEntry.fiscalEntry : null);
    const isConfirmed = entry?.statusFiscalEntry === "confirmed";
    const confirmed = await confirmAction({
      title: isConfirmed ? "Excluir entrada confirmada" : "Excluir entrada",
      message: isConfirmed
        ? "Excluir esta entrada confirmada e desfazer seus efeitos no estoque?"
        : "Excluir esta entrada da fila?",
      detail: isConfirmed
        ? "A entrada será desfeita, o estoque e os custos serão estornados, e o documento ficará cancelado."
        : "A exclusão remove a entrada e seus dados importados. Não cancela a nota na SEFAZ nem movimenta estoque.",
      confirmLabel: isConfirmed ? "Excluir entrada" : "Excluir entrada"
    });
    if (!confirmed) return;
    try {
      const response = await apiFetch(
        `${getApiUrl()}/api/stock/fiscal-entries/${idFiscalEntry}${isConfirmed ? "/reverse" : ""}`,
        {
          method: isConfirmed ? "POST" : "DELETE",
          headers: isConfirmed ? { "Content-Type": "application/json" } : undefined,
          body: isConfirmed ? JSON.stringify({}) : undefined
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível excluir a entrada.");
      if (Number(currentEntry?.fiscalEntry?.idFiscalEntry) === idFiscalEntry) {
        currentEntry = null;
        activeEntryId = null;
        editingItem = null;
      }
      await loadFiscalEntries();
      message = isConfirmed
        ? "Entrada confirmada excluída e estoque estornado."
        : "Entrada excluída da fila.";
      render();
      scheduleMessageClear(() => {
        message = "";
        clearRenderedFeedback(root);
      });
    } catch (removeError) {
      error = removeError instanceof Error ? removeError.message : "Falha ao excluir a entrada.";
      render();
    }
  };

  render();
  const unlisteners = [];
  let disposed = false;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    while (unlisteners.length) {
      const unlisten = unlisteners.pop();
      try {
        unlisten?.();
      } catch {}
    }
  };
  root.cleanup = cleanup;

  if (isTauriWindow()) {
    const registerTauriListener = async (eventName, handler) => {
      const unlisten = await listen(eventName, (event) => {
        if (disposed || !root.isConnected) {
          cleanup();
          return;
        }
        handler(event);
      });
      if (disposed) {
        unlisten();
        return;
      }
      unlisteners.push(unlisten);
    };

    void registerTauriListener("fiscal-dom-read", (event) => {
      const html = String(event.payload?.html || "");
      void importFiscalDom(html);
    });
    void registerTauriListener("fiscal-dom-error", (event) => {
      fiscalBrowserBusy = false;
      fiscalBrowserError = String(event.payload || "Falha ao ler a consulta fiscal.");
      render();
    });
    void registerTauriListener("fiscal-consultation-closed", () => {
      if (reconcileEntryId === null) return;
      reconcileEntryId = null;
      entryReconciling = false;
      fiscalBrowserBusy = false;
      fiscalBrowserError = "";
      render();
    });
  }
  void (async () => {
    await loadFiscalEntries();
    if (initialEntryId) await openEntry(Number(initialEntryId));
  })();
  return root;
}
