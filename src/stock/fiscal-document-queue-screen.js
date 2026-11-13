import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { renderScreenContextBar } from "../ui/screen-context.js";
import { renderNavigationIntro } from "../ui/navigation-intro.js";
import { renderPreservingFormDraft } from "../ui/form-draft.js";
import { clearRenderedFeedback, createFeedbackTimer, renderSuccessFeedback } from "../ui/feedback.js";
import { apiFetch, getApiUrl } from "../shared/api.js";
import { fetchWithTimeout } from "../shared/request-timeout.js";
import { confirmAction } from "../ui/confirmation-modal.js";
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

const formatQuantity = (value) =>
  Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });

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

const fiscalEntryStatusLabel = (status) => ({
  draft: "Em Digitação",
  open: "Em Aberto",
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
  let entrySaving = false;
  let entryError = "";
  let currentEntry = null;
  let fiscalEntries = [];
  let missingSuppliers = [];
  let entriesLoading = false;
  let products = [];
  let paymentMethods = [];
  let selectedPaymentMethod = "";
  let editingItem = null;
  let entryPayments = [];
  let message = "";
  let supplierModal = null;
  let supplierSubmitting = false;
  let supplierError = "";
  let fiscalEntrySort = { key: "issuedAtFiscalDocument", direction: "asc" };
  let fiscalEntrySearch = "";
  let fiscalEntryStatusFilter = "draft";
  const scheduleMessageClear = createFeedbackTimer();

  const selectedEntryTotal = () => (currentEntry?.items || [])
    .filter((item) => item.selected)
    .reduce((total, item) => total + Number(item.totalFiscalDocumentItem || 0), 0);

  const selectedProduct = (item) => products.find((product) => Number(product.idProduct) === Number(item?.idProduct));

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
              ? `${left.seriesFiscalDocument || ""}/${left.numberFiscalDocument}`
              : left.accessKeyFiscalDocument
          : left[key];
      const rightValue = key === "statusFiscalEntry"
        ? fiscalEntryStatusLabel(right[key])
        : key === "modelFiscalDocument"
          ? Number(right[key]) === 65 ? "NFC-e" : "NF-e"
          : key === "numberFiscalDocument"
            ? right.numberFiscalDocument
              ? `${right.seriesFiscalDocument || ""}/${right.numberFiscalDocument}`
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
        entry.numberFiscalDocument ? `${entry.seriesFiscalDocument || ""}/${entry.numberFiscalDocument}` : entry.accessKeyFiscalDocument,
        entry.issuerLegalNameFiscalDocument,
        entry.issuerDocumentFiscalDocument,
        fiscalEntryStatusLabel(entry.statusFiscalEntry)
      ].some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(search));
    });
  };

  const statusFilterOptions = [
    ["all", "Todos"],
    ["draft", "Em Digitação"],
    ["open", "Em Aberto"],
    ["confirmed", "Confirmadas"],
    ["cancelled", "Canceladas"]
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
      const response = await apiFetch(`${getApiUrl()}/api/stock/fiscal-entries`);
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.fiscalEntries)) {
        throw new Error(result.error || "Não foi possível carregar as pré-entradas.");
      }
      fiscalEntries = result.fiscalEntries;
      missingSuppliers = Array.isArray(result.missingSuppliers) ? result.missingSuppliers : [];
    } catch (entriesError) {
      error = entriesError instanceof Error ? entriesError.message : "Falha ao carregar as pré-entradas.";
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
        ${renderNavigationIntro(entryOnly ? "fiscal-entry-xml" : "fiscal-document-queue", entryOnly ? "Entrada de NF-e / NFC-e" : "Fila de Documentos", entryOnly ? "Revise pré-entradas de NF-e e NFC-e, seus itens, vínculos, conversões e pagamentos." : "Importe documentos fiscais e acompanhe as pré-entradas em estado Em Aberto.")}
        ${!entryOnly ? `
          <div class="fiscal-document-queue-layout" data-queue-only>
            <div class="fiscal-document-import-column">
              <section class="classic-form-panel fiscal-entry-upload-panel fiscal-browser-panel">
                <div class="classic-panel-header">Consulta fiscal interativa</div>
                <div class="classic-form-body">
                  <p class="form-help">Abra o portal oficial da SEF/MG, informe a chave, resolva o HCaptcha manualmente e avance até a consulta completa. Depois, leia o DOM renderizado para criar a pré-entrada.</p>
                  ${fiscalBrowserError ? `<p class="payment-error">${escapeHtml(fiscalBrowserError)}</p>` : ""}
                </div>
                <div class="classic-form-actions">
                  <button class="classic-button" type="button" data-open-fiscal-browser ${fiscalBrowserBusy ? "disabled" : ""}>Abrir consulta fiscal</button>
                </div>
              </section>
              <form class="classic-form-panel fiscal-entry-upload-panel" data-xml-form>
                <div class="classic-panel-header">Importar XML de entrada</div>
                <div class="classic-form-body">
                  <p class="form-help">O XML autorizado será validado e salvo como pré-entrada em estado <strong>Em Digitação</strong>. Essa operação não movimenta nem reserva estoque.</p>
                  <label class="form-field"><span>Arquivo XML da NF-e/NFC-e</span><input name="xmlFile" type="file" accept=".xml,text/xml,application/xml" required /></label>
                  ${xmlError ? `<p class="payment-error">${escapeHtml(xmlError)}</p>` : ""}
                </div>
                <div class="classic-form-actions"><button class="classic-button primary" type="submit" ${xmlSubmitting ? "disabled" : ""}>${xmlSubmitting ? "Importando..." : "Importar como pré-entrada"}</button></div>
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
              <div class="classic-grid-wrapper">${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : entriesLoading ? `<p class="classic-empty">Carregando documentos...</p>` : visibleFiscalEntries().length ? `
                <table class="classic-table">
                  <thead><tr>${sortableHeader("modelFiscalDocument", "Tipo")}${sortableHeader("numberFiscalDocument", "Doc")}${sortableHeader("issuerLegalNameFiscalDocument", "Fornecedor", "supplier-column product-name-column")}${sortableHeader("issuedAtFiscalDocument", "Emissão")}${sortableHeader("totalFiscalDocument", "Valor", "value-column")}${sortableHeader("statusFiscalEntry", "Status")}<th class="actions-column">Ações</th></tr></thead>
                  <tbody>${visibleFiscalEntries().map((entry) => `
                    <tr>
                      <td>${Number(entry.modelFiscalDocument) === 65 ? "NFC-e" : "NF-e"}</td>
                      <td>${escapeHtml(entry.numberFiscalDocument ? `${entry.seriesFiscalDocument || ""}/${entry.numberFiscalDocument}` : entry.accessKeyFiscalDocument)}</td>
                      <td class="supplier-column product-name-column">${escapeHtml(entry.issuerLegalNameFiscalDocument || formatDocument(entry.issuerDocumentFiscalDocument))}</td>
                      <td>${escapeHtml(formatDateOnly(entry.issuedAtFiscalDocument))}</td>
                      <td class="value-column">${escapeHtml(formatMoney(entry.totalFiscalDocument))}</td>
                      <td><span class="fiscal-entry-status fiscal-entry-status-${fiscalEntryStatusClass(entry.statusFiscalEntry)}">${escapeHtml(fiscalEntryStatusLabel(entry.statusFiscalEntry))}</span></td>
                      <td class="actions-column"><button class="icon-button" type="button" data-open-entry="${entry.idFiscalEntry}" aria-label="Continuar revisão" title="Continuar revisão"><i data-lucide="arrow-right-circle"></i></button><button class="icon-button delete" type="button" data-delete-entry="${entry.idFiscalEntry}" aria-label="Excluir documento" title="Excluir documento"><i data-lucide="trash-2"></i></button></td>
                    </tr>`).join("")}</tbody>
                </table>` : `<p class="classic-empty">Nenhum documento na fila.</p>`}</div>
            </section>
          </div>
        ` : ""}
        ${entryOnly ? `
          <section class="classic-grid-panel fiscal-entry-list-panel">
            ${renderFiscalEntryListHeader("Pré-entradas iniciadas")}
            <div class="classic-grid-wrapper">${entriesLoading ? `<p class="classic-empty">Carregando pré-entradas...</p>` : visibleFiscalEntries().length ? `
              <table class="classic-table">
                <thead><tr>${sortableHeader("modelFiscalDocument", "Tipo")}${sortableHeader("numberFiscalDocument", "Doc")}${sortableHeader("issuerLegalNameFiscalDocument", "Fornecedor", "supplier-column product-name-column")}${sortableHeader("issuedAtFiscalDocument", "Emissão")}${sortableHeader("totalFiscalDocument", "Valor", "value-column")}${sortableHeader("statusFiscalEntry", "Status")}<th class="actions-column">Ações</th></tr></thead>
                <tbody>${visibleFiscalEntries().map((entry) => `
                  <tr>
                    <td>${Number(entry.modelFiscalDocument) === 65 ? "NFC-e" : "NF-e"}</td>
                    <td>${escapeHtml(entry.numberFiscalDocument ? `${entry.seriesFiscalDocument || ""}/${entry.numberFiscalDocument}` : entry.accessKeyFiscalDocument)}</td>
                    <td class="supplier-column product-name-column">${escapeHtml(entry.issuerLegalNameFiscalDocument || formatDocument(entry.issuerDocumentFiscalDocument))}</td>
                    <td>${escapeHtml(formatDateOnly(entry.issuedAtFiscalDocument))}</td>
                    <td class="value-column">${escapeHtml(formatMoney(entry.totalFiscalDocument))}</td>
                    <td><span class="fiscal-entry-status fiscal-entry-status-${fiscalEntryStatusClass(entry.statusFiscalEntry)}">${escapeHtml(fiscalEntryStatusLabel(entry.statusFiscalEntry))}</span></td>
                    <td class="actions-column"><button class="icon-button" type="button" data-open-entry="${entry.idFiscalEntry}" aria-label="Continuar revisão" title="Continuar revisão"><i data-lucide="arrow-right-circle"></i></button><button class="icon-button delete" type="button" data-delete-entry="${entry.idFiscalEntry}" aria-label="Excluir pré-entrada" title="Excluir pré-entrada"><i data-lucide="trash-2"></i></button></td>
                  </tr>`).join("")}</tbody>
              </table>` : `<p class="classic-empty">Nenhuma pré-entrada iniciada.</p>`}</div>
          </section>
        ` : ""}
        ${currentEntry ? `
          <section class="classic-grid-panel fiscal-entry-workspace-panel">
            <div class="classic-panel-header">Pré-entrada ${escapeHtml(currentEntry.fiscalEntry.idFiscalEntry)} - <span class="fiscal-entry-status fiscal-entry-status-${fiscalEntryStatusClass(currentEntry.fiscalEntry.statusFiscalEntry)}">${escapeHtml(fiscalEntryStatusLabel(currentEntry.fiscalEntry.statusFiscalEntry))}</span></div>
            <div class="classic-form-body">
              <p class="form-help">Documento ${escapeHtml(currentEntry.fiscalEntry.accessKeyFiscalDocument)} · ${escapeHtml(currentEntry.fiscalEntry.issuerLegalNameFiscalDocument || currentEntry.fiscalEntry.issuerDocumentFiscalDocument)}</p>
              <p class="form-help">Esta revisão ainda não movimenta, reserva ou baixa estoque. Clique em um item para vincular o produto e informar a conversão. Quando todos os itens e o pagamento estiverem válidos, gravar promoverá o estado para <strong>Em Aberto</strong>.</p>
            </div>
            <div class="classic-grid-wrapper">
              <table class="classic-table">
                <thead><tr><th>Usar</th><th>Linha</th><th class="description-column">Descrição</th><th>Qtd</th><th>Unidade</th><th class="value-column">Valor</th><th>Status</th></tr></thead>
                <tbody>${currentEntry.items.map((item) => `
                  <tr data-edit-item="${item.idFiscalEntryItem}" class="${item.idProduct ? "entry-item-linked" : ""}">
                    <td><input type="checkbox" data-select-item="${item.idFiscalEntryItem}" ${item.selected ? "checked" : ""} aria-label="Incluir item ${escapeHtml(item.lineNumberFiscalDocumentItem)}" /></td>
                    <td>${escapeHtml(item.lineNumberFiscalDocumentItem)}</td>
                    <td class="description-column">${escapeHtml(item.descriptionFiscalDocumentItem)}</td>
                    <td>${escapeHtml(formatQuantity(item.quantityFiscalDocumentItem))}</td>
                    <td>${escapeHtml(item.fiscalUnitFiscalDocumentItem)}</td>
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
                  <label class="form-field"><span>Valor dos produtos marcados</span><input name="amount" value="${escapeHtml(selectedEntryTotal().toFixed(2))}" inputmode="decimal" readonly /></label>
                </div>
                <p class="form-help">O valor é recalculado pela soma das linhas marcadas. Itens desmarcados não entram no pagamento.</p>
                ${entryError ? `<p class="payment-error">${escapeHtml(entryError)}</p>` : ""}
              </div>
              <div class="classic-form-actions"><button class="classic-button primary" data-save-entry type="button" ${entrySaving ? "disabled" : ""}>${entrySaving ? "Gravando..." : "Gravar pré-entrada"}</button></div>
            </form>
          </section>
        ` : ""}
        ${entryOnly && !currentEntry ? `
          <section class="classic-grid-panel fiscal-entry-workspace-panel fiscal-entry-empty-panel">
            <div class="classic-panel-header">Pré-entrada em aberto</div>
            <div class="classic-empty">Selecione uma pré-entrada iniciada ao lado ou importe um novo XML para começar a revisão.</div>
          </section>
        ` : ""}
        ${editingItem ? `
          <div class="classic-modal-backdrop" data-entry-item-backdrop>
            <section class="classic-modal" role="dialog" aria-modal="true" aria-labelledby="entry-item-title">
              <div class="classic-panel-header modal-panel-header"><span id="entry-item-title">Vínculo do produto</span><button class="modal-close-button" data-cancel-entry-item type="button" aria-label="Fechar">×</button></div>
              <form class="classic-form-body" data-entry-item-form>
                <p class="form-help">${escapeHtml(editingItem.descriptionFiscalDocumentItem)} · ${escapeHtml(formatQuantity(editingItem.quantityFiscalDocumentItem))} ${escapeHtml(editingItem.fiscalUnitFiscalDocumentItem)}</p>
                <label class="form-field"><span>Produto comercial</span><select name="idProduct" required><option value="">Selecione</option>${products.map((product) => `<option value="${product.idProduct}" ${Number(editingItem.idProduct) === Number(product.idProduct) ? "selected" : ""}>${escapeHtml(product.nameProduct)} (${escapeHtml(product.pdvCodeProduct || product.skuProduct)})</option>`).join("")}</select></label>
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
    } catch (submitError) {
      supplierError = submitError instanceof Error ? submitError.message : "Falha ao cadastrar o fornecedor.";
    } finally {
      supplierSubmitting = false;
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
        render();
        const searchInput = root.querySelector("[data-fiscal-entry-search]");
        searchInput?.focus();
        searchInput?.setSelectionRange(fiscalEntrySearch.length, fiscalEntrySearch.length);
      });
    });
    root.querySelector("[data-entry-payment-form] select[name='paymentMethod']")?.addEventListener("change", (event) => {
      selectedPaymentMethod = event.currentTarget.value;
    });
    root.querySelector("[data-save-entry]")?.addEventListener("click", () => void saveEntry());
    root.querySelectorAll("[data-edit-item]").forEach((row) => {
      row.addEventListener("click", (event) => {
        if (event.target.closest("[data-select-item]")) return;
        editingItem = currentEntry.items.find((item) => Number(item.idFiscalEntryItem) === Number(row.dataset.editItem)) || null;
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
      render();
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
        render();
      });
    });
  };

  const finishImportedEntry = async (result, form) => {
    message = `Pré-entrada ${result.fiscalEntry?.idFiscalEntry || ""} gravada como ${fiscalEntryStatusLabel(result.fiscalEntry?.statusFiscalEntry)}.`;
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

  const importFiscalDom = async (html) => {
    fiscalBrowserBusy = true;
    fiscalBrowserError = "";
    render();
    try {
      if (!html.trim()) throw new Error("A consulta fiscal não retornou conteúdo.");
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
      try {
        await invoke("set_fiscal_consultation_status", {
          message: "Importação concluída com sucesso",
          success: true
        });
      } catch (statusError) {
        fiscalBrowserError = statusError instanceof Error
          ? `Importação concluída, mas o navegador não foi atualizado: ${statusError.message}`
          : "Importação concluída, mas o navegador não foi atualizado.";
      }
    } catch (readError) {
      fiscalBrowserError = readError instanceof Error
        ? readError.message
        : "Falha ao ler a consulta fiscal.";
      try {
        await invoke("set_fiscal_consultation_status", {
          message: fiscalBrowserError,
          success: false
        });
      } catch {
        // O erro principal já é exibido na tela da fila.
      }
    } finally {
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
      throw new Error(result.error || "Não foi possível carregar a pré-entrada.");
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
    try {
      currentEntry = await loadEntry(idFiscalEntry);
      entryPayments = currentEntry.entryPayments || [];
      selectedPaymentMethod = entryPayments[0]?.description || "";
      await loadProducts();
      await loadPaymentMethods();
      render();
    } catch (openError) {
      error = openError instanceof Error ? openError.message : "Não foi possível abrir a pré-entrada.";
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
      if (!response.ok) throw new Error(result.error || "Não foi possível gravar a pré-entrada.");
      currentEntry = await loadEntry(currentEntry.fiscalEntry.idFiscalEntry);
      entryPayments = currentEntry.entryPayments || [];
      selectedPaymentMethod = entryPayments[0]?.description || "";
      await loadFiscalEntries();
      message = `Pré-entrada ${currentEntry.fiscalEntry.idFiscalEntry} gravada como ${fiscalEntryStatusLabel(result.statusFiscalEntry)}.`;
      render();
    } catch (saveError) {
      entryError = saveError instanceof Error ? saveError.message : "Falha ao gravar a pré-entrada.";
      render();
    } finally {
      entrySaving = false;
      render();
    }
  };

  const removeEntry = async (idFiscalEntry) => {
    const confirmed = await confirmAction({
      title: "Excluir pré-entrada",
      message: "Excluir este documento da fila?",
      detail: "A exclusão remove a pré-entrada e seus dados importados. Não cancela a nota na SEFAZ nem movimenta estoque.",
      confirmLabel: "Excluir documento"
    });
    if (!confirmed) return;
    try {
      const response = await apiFetch(`${getApiUrl()}/api/stock/fiscal-entries/${idFiscalEntry}`, {
        method: "DELETE"
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível excluir a pré-entrada.");
      if (Number(currentEntry?.fiscalEntry?.idFiscalEntry) === idFiscalEntry) {
        currentEntry = null;
        editingItem = null;
      }
      await loadFiscalEntries();
      message = "Documento excluído da fila.";
      render();
    } catch (removeError) {
      error = removeError instanceof Error ? removeError.message : "Falha ao excluir a pré-entrada.";
      render();
    }
  };

  render();
  if (isTauriWindow()) {
    void listen("fiscal-dom-read", (event) => {
      const html = String(event.payload?.html || "");
      void importFiscalDom(html);
    });
    void listen("fiscal-dom-error", (event) => {
      fiscalBrowserBusy = false;
      fiscalBrowserError = String(event.payload || "Falha ao ler a consulta fiscal.");
      render();
    });
  }
  void (async () => {
    await loadFiscalEntries();
    if (initialEntryId) await openEntry(Number(initialEntryId));
  })();
  return root;
}
