import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { renderScreenContextBar } from "../ui/screen-context.js";
import { renderNavigationIntro } from "../ui/navigation-intro.js";
import { rerenderPreservingInputSelection } from "../ui/input-selection.js";
import { installComboboxDismissal, rerenderComboboxSelection } from "../ui/combobox.js";
import { bindNumberMasks, formatMaskedNumber } from "../ui/number-mask.js";
import {
  clearRenderedFeedback,
  createFeedbackTimer,
  formatUpdatedRecipeStructures,
  renderSuccessFeedback
} from "../ui/feedback.js";
import { apiFetch, getApiUrl } from "../shared/api.js";
import { confirmAction } from "../ui/confirmation-modal.js";
import { formatProductOptionLabel } from "../shared/product.js";
import AirDatepicker from "air-datepicker";
import "air-datepicker/air-datepicker.css";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const money = (value) => Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const currency = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatQuantity = (value) => Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const formatMoney = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateOnly = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value ?? "") : date.toLocaleDateString("pt-BR");
};
const datePickerLocale = {
  days: ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"],
  daysShort: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"],
  daysMin: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"],
  months: ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"],
  monthsShort: ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"],
  today: "Hoje",
  clear: "Limpar",
  dateFormat: "dd/MM/yyyy",
  timeFormat: "HH:mm",
  firstDay: 0
};
const isoDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parseLocalDate = (value) => {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/u);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
};
const displayDate = (value) => {
  const date = parseLocalDate(value);
  return date ? date.toLocaleDateString("pt-BR") : "";
};
const statusLabel = { draft: "Digitação", open: "Aberta", confirmed: "Confirmada", cancelled: "Cancelada" };
const statusClass = (status) => ({ draft: "draft", open: "open", confirmed: "confirmed", cancelled: "cancelled" }[status] || "unknown");

export function createFiscalEntryDesignScreen({ onBack, ...handlers }) {
  const root = document.createElement("main");
  let suppliers = [], products = [], entries = [], paymentMethods = [], current = null, error = "", message = "", loading = true;
  let listSearch = "", listStatusFilter = "draft", listSort = { key: "issuedAtFiscalDocument", direction: "asc" };
  const scheduleMessageClear = createFeedbackTimer();
  let datepicker = null;
  let calculatorOpen = false;
  let calculatorDisplay = "0";
  let calculatorStored = null;
  let calculatorOperator = null;
  let calculatorWaiting = false;
  const supplierPicker = { searchTerm: "", isOpen: false };
  const productPicker = { searchTerm: "", isOpen: false };
  const itemDraft = { product: "", quantity: "0,000", unitPrice: "0,00" };
  const resetItemDraft = () => {
    itemDraft.product = "";
    itemDraft.quantity = "0,000";
    itemDraft.unitPrice = "0,00";
  };
  const blank = () => ({ origin: "nota_fiscal", entryDate: localDate(), number: "", idSupplier: "", items: [], payments: [] });
  let draft = blank();
  const total = () => draft.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
  const supplierName = (id) => {
    const supplier = suppliers.find((item) => String(item.idSupplier) === String(id));
    return supplier ? (supplier.tradeNameSupplier || supplier.companyNameSupplier) : "Não informado";
  };
  const selectedSupplier = () => suppliers.find((item) => String(item.idSupplier) === String(draft.idSupplier));
  const supplierOptions = () => suppliers.filter((supplier) =>
    `${supplier.tradeNameSupplier || ""} ${supplier.companyNameSupplier || ""} ${supplier.documentSupplier || ""}`
      .toLocaleLowerCase("pt-BR").includes(supplierPicker.searchTerm.trim().toLocaleLowerCase("pt-BR"))
  );
  const productOptions = () => products.filter((product) =>
    `${product.nameProduct || ""} ${product.pdvCodeProduct || ""} ${product.skuProduct || ""}`
      .toLocaleLowerCase("pt-BR").includes(productPicker.searchTerm.trim().toLocaleLowerCase("pt-BR"))
  );
  const productLabel = formatProductOptionLabel;
  const parseInputNumber = (value) => {
    const text = String(value ?? "").trim().replace(/\./g, "").replace(",", ".");
    const number = Number(text);
    return Number.isFinite(number) ? number : 0;
  };
  const formatCalculatorDisplay = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return "0";
    return number.toLocaleString("pt-BR", { maximumFractionDigits: 10 });
  };
  const applyCalculatorOperation = (left, right, operator) => {
    if (operator === "+") return left + right;
    if (operator === "-") return left - right;
    if (operator === "*") return left * right;
    if (operator === "/") return right === 0 ? null : left / right;
    return right;
  };
  const calculatorOperatorLabel = (operator) => ({
    "+": "+",
    "-": "-",
    "*": "×",
    "/": "÷"
  })[operator] || "";
  const getCalculatorOperand = (display) => {
    const parts = String(display).split(/[+\-×÷*/]/u);
    return parseInputNumber(parts.at(-1));
  };
  const resetCalculator = () => {
    calculatorDisplay = "0";
    calculatorStored = null;
    calculatorOperator = null;
    calculatorWaiting = false;
  };
  const dateInputValue = (value) => String(value ?? "").match(/^\d{4}-\d{2}-\d{2}/u)?.[0] || "";
  const setMessage = (value) => {
    message = value;
    scheduleMessageClear(() => {
      message = "";
      clearRenderedFeedback(root);
    });
  };
  installComboboxDismissal(root, {
    isOpen: () => supplierPicker.isOpen || productPicker.isOpen,
    close: () => {
      supplierPicker.isOpen = false;
      productPicker.isOpen = false;
      render();
    }
  });
  const entrySupplier = (entry) => entry.tradeNameSupplier || entry.companyNameSupplier || "Não informado";
  const entryOrigin = (entry) => entry.manualSourceFiscalDocument === "pedido" ? "Pedido" : "Nota fiscal";
  const entryDate = (entry) => String(entry.manualEntryDateFiscalDocument || entry.entryDateFiscalDocument || "").slice(0, 10);
  const sortedEntries = () => [...entries].sort((left, right) => {
    const key = listSort.key;
    const leftValue = key === "modelFiscalDocument" ? entryOrigin(left)
      : key === "numberFiscalDocument" ? (left.manualNumberFiscalDocument || left.numberFiscalDocument || left.accessKeyFiscalDocument)
        : key === "issuerLegalNameFiscalDocument" ? entrySupplier(left)
          : key === "issuedAtFiscalDocument" ? entryDate(left)
            : key === "totalPaymentsFiscalEntry" ? Number(left.totalPaymentsFiscalEntry || 0)
              : statusLabel[left.statusFiscalEntry] || left.statusFiscalEntry;
    const rightValue = key === "modelFiscalDocument" ? entryOrigin(right)
      : key === "numberFiscalDocument" ? (right.manualNumberFiscalDocument || right.numberFiscalDocument || right.accessKeyFiscalDocument)
        : key === "issuerLegalNameFiscalDocument" ? entrySupplier(right)
          : key === "issuedAtFiscalDocument" ? entryDate(right)
            : key === "totalPaymentsFiscalEntry" ? Number(right.totalPaymentsFiscalEntry || 0)
              : statusLabel[right.statusFiscalEntry] || right.statusFiscalEntry;
    const comparison = typeof leftValue === "number" && typeof rightValue === "number"
      ? leftValue - rightValue
      : String(leftValue || "").localeCompare(String(rightValue || ""), "pt-BR", { sensitivity: "base" });
    return listSort.direction === "asc" ? comparison : -comparison;
  });
  const visibleEntries = () => {
    const search = listSearch.trim().toLocaleLowerCase("pt-BR");
    return sortedEntries().filter((entry) => {
      if (listStatusFilter !== "all" && entry.statusFiscalEntry !== listStatusFilter) return false;
      if (!search) return true;
      return [entryOrigin(entry), entry.numberFiscalDocument, entrySupplier(entry), statusLabel[entry.statusFiscalEntry]]
        .some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(search));
    });
  };
  const sortIndicator = () => "↕";
  const sortableHeader = (key, label, className = "") => `
    <th class="${className}" aria-sort="${listSort.key === key ? (listSort.direction === "asc" ? "ascending" : "descending") : "none"}">
      <button class="table-sort-button" type="button" data-manual-entry-sort="${key}">${label} <span aria-hidden="true">${sortIndicator(key)}</span></button>
    </th>`;
  const renderManualEntryListHeader = () => {
    const filters = [["all", "Todas"], ["draft", "Digitação"], ["open", "Aberta"], ["confirmed", "Confirmada"], ["cancelled", "Cancelada"]];
    return `<div class="classic-panel-header fiscal-entry-list-header">
      <div class="fiscal-entry-list-header-top"><span>Entradas iniciadas</span><input class="classic-list-search" data-manual-entry-search type="search" placeholder="Pesquisar..." aria-label="Pesquisar documentos na fila" value="${escapeHtml(listSearch)}" /></div>
      <div class="fiscal-entry-status-filters" role="group" aria-label="Filtrar documentos por status">${filters.map(([value, label]) => {
        const count = value === "all" ? entries.length : entries.filter((entry) => entry.statusFiscalEntry === value).length;
        return `<button class="fiscal-entry-status-filter${listStatusFilter === value ? " is-active" : ""}" type="button" data-manual-entry-status-filter="${value}" aria-pressed="${listStatusFilter === value}">${label} ${count}</button>`;
      }).join("")}</div>
    </div>`;
  };
  const render = () => {
    datepicker?.destroy();
    datepicker = null;
    const locked = ["open", "confirmed", "cancelled"].includes(current?.statusFiscalEntry);
    const currentStatus = current?.statusFiscalEntry || "draft";
    root.className = "catalog-screen fiscal-entry-test-screen";
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - Entrada Manual</strong><span>Operador: Operador</span></header>
      ${renderMainMenu()}${renderScreenContextBar("Entrada Manual")}
      <section class="classic-content fiscal-entry-test-content">
        ${renderSuccessFeedback(message, escapeHtml)}
        ${renderNavigationIntro("fiscal-entry-design", "Entrada Manual", "Registre entradas por Nota fiscal ou Pedido.")}
        <div class="fiscal-entry-test-layout">
          <form class="classic-form-panel recipe-editor-panel" data-manual-form>
            <div class="classic-panel-header manual-entry-panel-header"><span>${current ? `Entrada ${current.idFiscalEntry}` : "Nova Entrada Manual"}</span><button class="classic-button" type="button" data-new-entry>Nova Entrada</button></div>
            <div class="classic-form-body">
              <div class="recipe-component-input-grid manual-entry-meta-grid">
                <label class="form-field"><span>Origem</span><select name="origin" ${locked ? "disabled" : ""}><option value="nota_fiscal" ${draft.origin === "nota_fiscal" ? "selected" : ""}>Nota fiscal</option><option value="pedido" ${draft.origin === "pedido" ? "selected" : ""}>Pedido</option></select></label>
                <label class="form-field"><span>Número</span><input name="number" value="${escapeHtml(draft.number)}" ${locked ? "disabled" : ""}></label>
                <label class="form-field"><span>Data *</span><input data-manual-date-picker type="text" value="${escapeHtml(displayDate(draft.entryDate))}" placeholder="dd/mm/aaaa" autocomplete="off" ${locked ? "disabled" : ""}><input name="entryDate" type="hidden" value="${escapeHtml(draft.entryDate)}"></label>
              </div>
              <div class="manual-entry-supplier-picker">
                <span class="form-field-label">Fornecedor</span>
                <div class="form-field recipe-component-picker classic-combobox${supplierPicker.isOpen ? " is-open" : ""}">
                  <input type="hidden" name="idSupplier" value="${escapeHtml(draft.idSupplier)}">
                  <button class="classic-select-trigger" type="button" data-supplier-toggle ${locked ? "disabled" : ""} aria-expanded="${supplierPicker.isOpen}">${escapeHtml(selectedSupplier()?.tradeNameSupplier || selectedSupplier()?.companyNameSupplier || "Selecione um fornecedor")}</button>
                  ${supplierPicker.isOpen ? `<div class="recipe-component-options"><input data-component-search data-supplier-search type="search" autocomplete="off" placeholder="Pesquisar fornecedor..." value="${escapeHtml(supplierPicker.searchTerm)}">${supplierOptions().map((supplier) => `<button type="button" class="recipe-component-option" data-supplier-option="${supplier.idSupplier}">${escapeHtml(supplier.tradeNameSupplier || supplier.companyNameSupplier)}</button>`).join("") || '<span class="classic-empty">Nenhum fornecedor encontrado.</span>'}</div>` : ""}
                </div>
              </div>
              <div class="fiscal-entry-header-grid manual-entry-supplier-summary" aria-label="Dados atuais do fornecedor">${(() => { const supplier = selectedSupplier(); return [["Razão social", supplier?.companyNameSupplier], ["Nome fantasia", supplier?.tradeNameSupplier], ["CNPJ/CPF", supplier?.documentSupplier], ["Endereço", [supplier?.addressSupplier, supplier?.addressNumberSupplier, supplier?.citySupplier, supplier?.stateSupplier].filter(Boolean).join(", ")]]; })().map(([label, value]) => `<div class="fiscal-entry-header-field"><span class="fiscal-entry-header-label">${label}</span><strong>${escapeHtml(value || "Não informado")}</strong></div>`).join("")}</div>
              <div class="classic-panel-header nested-panel-header">Itens</div>
              <div class="recipe-component-input-grid manual-entry-item-primary-grid">
                <div class="form-field manual-entry-product-field"><span>Produto</span><div class="recipe-component-picker classic-combobox${productPicker.isOpen ? " is-open" : ""}">
                  <input type="hidden" name="product" value="${escapeHtml(itemDraft.product)}">
                  <button class="classic-select-trigger" type="button" data-product-toggle ${locked ? "disabled" : ""} aria-expanded="${productPicker.isOpen}">${escapeHtml(productLabel(products.find((product) => String(product.idProduct) === String(itemDraft.product))))}</button>
                  ${productPicker.isOpen ? `<div class="recipe-component-options combobox-options-fixed-search"><input data-component-search data-product-search type="search" autocomplete="off" placeholder="Pesquisar produto..." value="${escapeHtml(productPicker.searchTerm)}"><div class="combobox-option-list">${productOptions().map((product) => `<button type="button" class="recipe-component-option" data-product-option="${product.idProduct}">${escapeHtml(productLabel(product))}</button>`).join("") || '<span class="classic-empty">Nenhum produto encontrado.</span>'}</div></div>` : ""}
                </div></div>
                <label class="form-field manual-entry-unit-field"><span>Unidade</span><input data-unit-display value="${escapeHtml([products.find((product) => String(product.idProduct) === String(itemDraft.product))?.codeUnit, products.find((product) => String(product.idProduct) === String(itemDraft.product))?.descriptionUnit].filter(Boolean).join(" - ") || "Selecione um produto")}" readonly></label>
              </div>
              <div class="recipe-component-input-grid manual-entry-item-values-grid">
                <label class="form-field"><span>Quantidade</span><input name="quantity" data-number-mask="fractional-3" inputmode="decimal" min="0.001" value="${escapeHtml(itemDraft.quantity || "0,000")}" ${locked ? "disabled" : ""}></label>
                <label class="form-field"><span>Preço unitário</span><div class="manual-entry-unit-price-field"><input name="unitPrice" data-number-mask inputmode="decimal" min="0.01" value="${escapeHtml(itemDraft.unitPrice || "0,00")}" ${locked ? "disabled" : ""}>${locked ? "" : '<button class="icon-button manual-entry-calculator-button" type="button" data-open-calculator aria-label="Abrir calculadora" title="Abrir calculadora"><i data-lucide="calculator"></i></button>'}</div></label>
              </div>
              ${calculatorOpen ? `
                <div class="classic-modal-backdrop manual-entry-calculator-backdrop" data-calculator-backdrop>
                  <section class="classic-modal manual-entry-calculator-modal" role="dialog" aria-modal="true" aria-labelledby="manual-entry-calculator-title">
                    <div class="classic-panel-header modal-panel-header"><span id="manual-entry-calculator-title">Calculadora</span><button class="modal-close-button" type="button" data-close-calculator aria-label="Fechar" title="Fechar"><i data-lucide="x"></i></button></div>
                    <div class="manual-entry-calculator-body">
                      <input class="manual-entry-calculator-display" data-calculator-display type="text" inputmode="decimal" aria-label="Valor da calculadora" value="${escapeHtml(formatCalculatorDisplay(calculatorDisplay))}">
                      <div class="manual-entry-calculator-grid">
                        ${["7", "8", "9", "/"].map((key) => `<button type="button" class="classic-button${["/", "*", "-", "+"].includes(key) ? " calculator-operation" : ""}" data-calculator-key="${key}">${key === "/" ? "÷" : key}</button>`).join("")}
                        ${["4", "5", "6", "*"].map((key) => `<button type="button" class="classic-button${["/", "*", "-", "+"].includes(key) ? " calculator-operation" : ""}" data-calculator-key="${key}">${key === "*" ? "×" : key}</button>`).join("")}
                        ${["1", "2", "3", "-"].map((key) => `<button type="button" class="classic-button${["/", "*", "-", "+"].includes(key) ? " calculator-operation" : ""}" data-calculator-key="${key}">${key}</button>`).join("")}
                        ${["0", ",", "=", "+"].map((key) => `<button type="button" class="classic-button${["/", "*", "-", "+"].includes(key) ? " calculator-operation" : ""}" data-calculator-key="${key}">${key === "=" ? "=" : key}</button>`).join("")}
                      </div>
                      <button type="button" class="classic-button" data-calculator-clear>Limpar</button>
                      <button type="button" class="classic-button primary" data-transfer-calculator>Transferir valor</button>
                    </div>
                  </section>
                </div>
              ` : ""}
              ${locked ? "" : '<button class="classic-button" type="button" data-add-item>Adicionar item</button>'}
              <table class="classic-table fiscal-entry-items-table"><thead><tr><th>#</th><th>Produto</th><th>Quantidade</th><th>Unidade</th><th>Preço</th><th>Total</th><th>Ações</th></tr></thead><tbody>${draft.items.map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.name)}</td><td>${formatMaskedNumber(item.quantity, 3)}</td><td>${escapeHtml(item.unit)}</td><td>${money(item.unitPrice)}</td><td>${money(item.quantity * item.unitPrice)}</td><td><button type="button" class="icon-button delete" data-remove-item="${index}" aria-label="Remover item" title="Remover item"><i data-lucide="trash-2"></i></button></td></tr>`).join("") || '<tr><td colspan="7" class="classic-empty">Nenhum item.</td></tr>'}</tbody><tfoot><tr><th colspan="5">Total da entrada</th><th>${money(total())}</th><th></th></tr></tfoot></table>
              <div class="classic-panel-header nested-panel-header">Pagamentos</div>
              <div class="classic-form-panel nested-form-panel"><div class="classic-form-body"><div class="recipe-component-input-grid manual-entry-payment-grid"><label class="form-field"><span>Forma de pagamento</span><select name="paymentDescription" ${locked ? "disabled" : ""}><option value="">Selecione</option>${paymentMethods.map((method) => `<option value="${escapeHtml(method.namePaymentMethod || method.descriptionPaymentMethod || method.codePaymentMethod || "")}">${escapeHtml(method.namePaymentMethod || method.descriptionPaymentMethod || method.codePaymentMethod || "Forma de pagamento")}</option>`).join("")}</select></label><label class="form-field"><span>Valor</span><input name="paymentAmount" data-number-mask inputmode="decimal" value="0,00" ${locked ? "disabled" : ""}></label></div>${locked ? "" : '<button class="classic-button" type="button" data-add-payment>Adicionar pagamento</button>'}</div></div>
              <ul class="manual-entry-payments-list">${draft.payments.map((payment, index) => `<li><span>${escapeHtml(payment.description)} - R$ ${money(payment.amount)}</span><button class="manual-entry-remove-payment icon-button delete" type="button" data-remove-payment="${index}" aria-label="Remover pagamento" title="Remover pagamento"><i data-lucide="trash-2"></i></button></li>`).join("") || "<li>Nenhum pagamento.</li>"}</ul>
              ${error ? `<p class="payment-error" role="alert">${escapeHtml(error)}</p>` : ""}
            </div>
            <div class="classic-form-actions">${locked ? "" : '<button class="classic-button primary" type="button" data-save-draft>Salvar rascunho</button><button class="classic-button primary" type="button" data-save-entry>Gravar entrada</button>'}${current?.statusFiscalEntry === "open" ? '<button class="classic-button primary" type="button" data-review-impact>Revisar impacto</button><button class="classic-button" type="button" data-reopen>Voltar para Digitação</button>' : ""}${current?.statusFiscalEntry === "confirmed" ? '<button class="classic-button" type="button" data-cancel-entry>Cancelar entrada</button>' : ""}${["draft", "open"].includes(current?.statusFiscalEntry) ? '<button class="classic-button" type="button" data-delete-entry>Excluir</button>' : ""}${locked ? "" : '<button class="classic-button" type="button" data-clear>Limpar</button>'}</div>
          </form>
          <section class="classic-grid-panel fiscal-entry-list-panel">${renderManualEntryListHeader()}<div class="classic-grid-wrapper" data-default-page-size="25">${loading ? '<p class="classic-empty">Carregando entradas...</p>' : visibleEntries().length ? `
            <table class="classic-table">
              <thead><tr>${sortableHeader("numberFiscalDocument", "Doc")}${sortableHeader("issuerLegalNameFiscalDocument", "Fornecedor", "supplier-column product-name-column")}${sortableHeader("issuedAtFiscalDocument", "Emissão")}${sortableHeader("totalPaymentsFiscalEntry", "Valor", "value-column")}${sortableHeader("statusFiscalEntry", "Status")}<th class="actions-column">Ações</th></tr></thead>
              <tbody>${visibleEntries().map((entry) => `<tr>
                <td>${escapeHtml(entry.manualNumberFiscalDocument || entry.numberFiscalDocument || "")}</td>
                <td class="supplier-column product-name-column">${escapeHtml(entrySupplier(entry))}</td>
                <td>${escapeHtml(dateOnly(entry.manualEntryDateFiscalDocument || entry.entryDateFiscalDocument))}</td>
                <td class="value-column">${escapeHtml(currency(entry.totalPaymentsFiscalEntry))}</td>
                <td><span class="fiscal-entry-status fiscal-entry-status-${statusClass(entry.statusFiscalEntry)}">${escapeHtml(statusLabel[entry.statusFiscalEntry] || entry.statusFiscalEntry)}</span></td>
                <td class="actions-column"><button class="icon-button" type="button" data-open-entry="${entry.idFiscalEntry}" aria-label="Abrir entrada" title="Abrir entrada"><i data-lucide="arrow-right-circle"></i></button><button class="icon-button delete" type="button" data-delete-entry="${entry.idFiscalEntry}" aria-label="Excluir entrada" title="Excluir entrada"><i data-lucide="trash-2"></i></button></td>
              </tr>`).join("")}</tbody>
            </table>` : '<p class="classic-empty">Nenhuma entrada iniciada.</p>'}</div></section>
        </div>
      </section>`;
    renderLucideIcons(root); bindMainMenu(root, handlers); bindNumberMasks(root);
    const dateInput = root.querySelector("[data-manual-date-picker]");
    if (dateInput && !locked) {
      datepicker = new AirDatepicker(dateInput, {
        locale: datePickerLocale,
        dateFormat: "dd/MM/yyyy",
        classes: "manual-entry-datepicker",
        selectedDates: parseLocalDate(draft.entryDate) || new Date(),
        autoClose: true,
        onSelect: ({ date }) => {
          const hiddenDate = root.querySelector("[name=entryDate]");
          if (hiddenDate && date) {
            hiddenDate.value = isoDate(date);
            draft.entryDate = hiddenDate.value;
          }
        }
      });
    }
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    root.querySelector("[name=origin]")?.addEventListener("change", (event) => {
      draft.origin = event.currentTarget.value;
    });
    root.querySelector("[name=number]")?.addEventListener("input", (event) => {
      draft.number = event.currentTarget.value;
    });
    root.querySelectorAll("[data-manual-entry-sort]").forEach((button) => button.addEventListener("click", () => {
      const key = button.dataset.manualEntrySort;
      listSort = listSort.key === key
        ? { key, direction: listSort.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" };
      render();
    }));
    root.querySelectorAll("[data-manual-entry-status-filter]").forEach((button) => button.addEventListener("click", () => {
      listStatusFilter = button.dataset.manualEntryStatusFilter;
      render();
    }));
    root.querySelector("[data-manual-entry-search]")?.addEventListener("input", (event) => {
      listSearch = event.currentTarget.value;
      rerenderPreservingInputSelection(event.currentTarget, render, () => root.querySelector("[data-manual-entry-search]"));
    });
    root.querySelector("[data-new-entry]")?.addEventListener("click", () => { current = null; draft = blank(); resetItemDraft(); error = ""; setMessage("Nova entrada preparada."); render(); });
    root.querySelector("[data-supplier-toggle]")?.addEventListener("click", () => {
      supplierPicker.isOpen = !supplierPicker.isOpen;
      productPicker.isOpen = false;
      render();
      if (supplierPicker.isOpen) root.querySelector("[data-supplier-search]")?.focus();
    });
    root.querySelector("[data-supplier-search]")?.addEventListener("input", (event) => {
      supplierPicker.searchTerm = event.currentTarget.value;
      rerenderPreservingInputSelection(event.currentTarget, render, () => root.querySelector("[data-supplier-search]"));
    });
    root.querySelectorAll("[data-supplier-option]").forEach((button) => button.addEventListener("click", () => {
      draft.idSupplier = button.dataset.supplierOption;
      supplierPicker.searchTerm = "";
      supplierPicker.isOpen = false;
      rerenderComboboxSelection(render, () => root.querySelector("[data-product-toggle]"));
    }));
    root.querySelector("[data-product-toggle]")?.addEventListener("click", () => {
      productPicker.isOpen = !productPicker.isOpen;
      supplierPicker.isOpen = false;
      render();
      if (productPicker.isOpen) root.querySelector("[data-product-search]")?.focus();
    });
    root.querySelector("[data-product-search]")?.addEventListener("input", (event) => {
      productPicker.searchTerm = event.currentTarget.value;
      rerenderPreservingInputSelection(event.currentTarget, render, () => root.querySelector("[data-product-search]"));
    });
    root.querySelectorAll("[data-product-option]").forEach((button) => button.addEventListener("click", () => {
      itemDraft.product = button.dataset.productOption;
      productPicker.searchTerm = "";
      productPicker.isOpen = false;
      rerenderComboboxSelection(render, () => root.querySelector("[data-product-toggle]"));
    }));
    root.querySelector("[name=quantity]")?.addEventListener("input", (event) => { itemDraft.quantity = event.currentTarget.value; });
    root.querySelector("[name=unitPrice]")?.addEventListener("input", (event) => { itemDraft.unitPrice = event.currentTarget.value; });
    root.querySelector("[data-open-calculator]")?.addEventListener("click", () => {
      const unitPriceInput = root.querySelector("[name=unitPrice]");
      itemDraft.unitPrice = unitPriceInput?.value || itemDraft.unitPrice;
      const currentValue = parseInputNumber(itemDraft.unitPrice);
      resetCalculator();
      calculatorDisplay = currentValue ? formatCalculatorDisplay(currentValue) : "0";
      calculatorOpen = true;
      render();
      const calculatorDisplayInput = root.querySelector("[data-calculator-display]");
      calculatorDisplayInput?.focus();
      calculatorDisplayInput?.select();
    });
    root.querySelector("[data-close-calculator]")?.addEventListener("click", () => {
      calculatorOpen = false;
      render();
    });
    root.querySelector("[data-calculator-backdrop]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) {
        calculatorOpen = false;
        render();
      }
    });
    root.querySelectorAll("[data-calculator-key]").forEach((button) => button.addEventListener("click", () => {
      const key = button.dataset.calculatorKey;
      if (/^\d$/u.test(key)) {
        if (calculatorWaiting) {
          const left = formatCalculatorDisplay(calculatorStored);
          calculatorDisplay = `${left} ${calculatorOperatorLabel(calculatorOperator)} ${key}`;
        } else {
          calculatorDisplay = calculatorDisplay === "0" ? key : `${calculatorDisplay}${key}`;
        }
        calculatorWaiting = false;
        render();
        return;
      }
      if (key === ",") {
        if (calculatorWaiting) calculatorDisplay = "0";
        if (!calculatorDisplay.includes(",")) calculatorDisplay += ",";
        calculatorWaiting = false;
        render();
        return;
      }
      if (["+", "-", "*", "/"].includes(key)) {
        const current = getCalculatorOperand(calculatorDisplay);
        if (calculatorStored !== null && calculatorOperator && !calculatorWaiting) {
          const result = applyCalculatorOperation(calculatorStored, current, calculatorOperator);
          calculatorStored = result;
          calculatorDisplay = result === null ? "Erro" : formatCalculatorDisplay(result);
        } else {
          calculatorStored = current;
        }
        calculatorOperator = key;
        calculatorWaiting = true;
        calculatorDisplay = `${formatCalculatorDisplay(calculatorStored)} ${calculatorOperatorLabel(key)}`;
        render();
        return;
      }
      if (key === "=" && calculatorStored !== null && calculatorOperator) {
        const result = applyCalculatorOperation(calculatorStored, getCalculatorOperand(calculatorDisplay), calculatorOperator);
        calculatorDisplay = result === null ? "Erro" : formatCalculatorDisplay(result);
        calculatorStored = null;
        calculatorOperator = null;
        calculatorWaiting = true;
        render();
      }
    }));
    root.querySelector("[data-calculator-clear]")?.addEventListener("click", () => {
      resetCalculator();
      render();
    });
    root.querySelector("[data-calculator-display]")?.addEventListener("input", (event) => {
      calculatorDisplay = event.currentTarget.value || "0";
      calculatorWaiting = false;
    });
    root.querySelector("[data-calculator-display]")?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        calculatorOpen = false;
        render();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (calculatorStored !== null && calculatorOperator) {
          const result = applyCalculatorOperation(calculatorStored, getCalculatorOperand(calculatorDisplay), calculatorOperator);
          calculatorDisplay = result === null ? "Erro" : formatCalculatorDisplay(result);
          calculatorStored = null;
          calculatorOperator = null;
          calculatorWaiting = true;
          event.currentTarget.value = calculatorDisplay;
        }
        return;
      }
      if (["+", "-", "*", "/"].includes(event.key)) {
        event.preventDefault();
        const current = getCalculatorOperand(calculatorDisplay);
        if (calculatorStored !== null && calculatorOperator && !calculatorWaiting) {
          const result = applyCalculatorOperation(calculatorStored, current, calculatorOperator);
          calculatorStored = result;
          calculatorDisplay = result === null ? "Erro" : formatCalculatorDisplay(result);
        } else {
          calculatorStored = current;
        }
        calculatorOperator = event.key;
        calculatorWaiting = true;
        calculatorDisplay = `${formatCalculatorDisplay(calculatorStored)} ${calculatorOperatorLabel(event.key)}`;
        event.currentTarget.value = calculatorDisplay;
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        calculatorDisplay = calculatorDisplay.length > 1 ? calculatorDisplay.slice(0, -1) : "0";
        calculatorWaiting = false;
        event.currentTarget.value = calculatorDisplay;
      }
    });
    root.querySelector("[data-transfer-calculator]")?.addEventListener("click", () => {
      if (calculatorDisplay === "Erro") return;
      const value = parseInputNumber(calculatorDisplay);
      itemDraft.unitPrice = value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      calculatorOpen = false;
      setMessage("Valor transferido para o preço unitário.");
      render();
    });
    root.querySelector("[data-add-item]")?.addEventListener("click", () => {
      const form = root.querySelector("[data-manual-form]"); const product = products.find((item) => String(item.idProduct) === String(itemDraft.product));
      const quantity = parseInputNumber(form.quantity.value); const unitPrice = parseInputNumber(form.unitPrice.value);
      if (!product || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) { error = "Informe produto, quantidade e preço válidos."; render(); return; }
      draft.items.push({ idProduct: product.idProduct, name: product.nameProduct, unit: product.codeUnit, quantity, unitPrice }); resetItemDraft(); error = ""; setMessage("Item adicionado à entrada."); render();
    });
    root.querySelector("[data-add-payment]")?.addEventListener("click", () => {
      const form = root.querySelector("[data-manual-form]"); const amount = parseInputNumber(form.paymentAmount.value);
      if (!form.paymentDescription.value.trim() || !Number.isFinite(amount) || amount <= 0) { error = "Informe descrição e valor do pagamento."; render(); return; }
      draft.payments.push({ description: form.paymentDescription.value.trim(), amount }); error = ""; setMessage("Pagamento adicionado à entrada."); render();
    });
    root.querySelectorAll("[data-remove-item]").forEach((button) => button.addEventListener("click", () => { draft.items.splice(Number(button.dataset.removeItem), 1); setMessage("Item removido da entrada."); render(); }));
    root.querySelectorAll("[data-remove-payment]").forEach((button) => button.addEventListener("click", () => { draft.payments.splice(Number(button.dataset.removePayment), 1); setMessage("Pagamento removido da entrada."); render(); }));
    root.querySelector("[data-clear]")?.addEventListener("click", () => { current = null; draft = blank(); resetItemDraft(); error = ""; setMessage("Formulário limpo."); render(); });
    root.querySelector("[data-save-draft]")?.addEventListener("click", () => void save("draft"));
    root.querySelector("[data-save-entry]")?.addEventListener("click", () => void save("open"));
    root.querySelector("[data-reopen]")?.addEventListener("click", () => void save("draft"));
    root.querySelector("[data-review-impact]")?.addEventListener("click", () => void reviewImpact());
    root.querySelector("[data-cancel-entry]")?.addEventListener("click", () => void transition("reverse"));
    root.querySelectorAll("[data-delete-entry]").forEach((button) => button.addEventListener("click", () => {
      void transition("delete", button.dataset.deleteEntry || current?.idFiscalEntry);
    }));
    root.querySelectorAll("[data-open-entry]").forEach((button) => button.addEventListener("click", () => void openEntry(button.dataset.openEntry)));
  };
  const load = async () => {
    try {
      const [supplierResponse, productResponse, formationResponse, entryResponse, paymentMethodResponse] = await Promise.all([
        apiFetch(`${getApiUrl()}/api/suppliers`), apiFetch(`${getApiUrl()}/api/products?includeInactive=1`), apiFetch(`${getApiUrl()}/api/product-formations`), apiFetch(`${getApiUrl()}/api/stock/manual-entries`), apiFetch(`${getApiUrl()}/api/payment-methods`)
      ]);
      const supplierData = await supplierResponse.json(), productData = await productResponse.json(), formationData = await formationResponse.json(), entryData = await entryResponse.json(), paymentMethodData = await paymentMethodResponse.json();
      const formationProductIds = new Set((formationData.products || []).filter((product) => product.formation).map((product) => String(product.idProduct)));
      suppliers = supplierData.suppliers || [];
      products = (productData.products || []).filter((product) => {
        const type = String(product.descriptionProductType || "").trim().toLocaleLowerCase("pt-BR");
        return product.isActiveProduct
          && product.idUnitProduct
          && product.codeUnit
          && !["produto acabado", "produtos acabados"].includes(type)
          && !formationProductIds.has(String(product.idProduct));
      });
      entries = entryData.manualEntries || []; paymentMethods = paymentMethodData.paymentMethods || [];
    } catch (loadError) { error = loadError.message || "Falha ao carregar dados."; } finally { loading = false; render(); }
  };
  const openEntry = async (id) => {
    const response = await apiFetch(`${getApiUrl()}/api/stock/manual-entries/${id}`); const data = await response.json();
    if (!response.ok) { error = data.error || "Falha ao abrir entrada."; render(); return; }
    current = data.manualEntry;
    resetItemDraft();
    draft = {
      origin: current.manualSourceFiscalDocument === "pedido" ? "pedido" : "nota_fiscal",
      entryDate: dateInputValue(current.manualEntryDateFiscalDocument || current.entryDateFiscalDocument || current.issuedAtFiscalDocument),
      number: current.manualNumberFiscalDocument || current.numberFiscalDocument || "",
      idSupplier: current.idSupplierFiscalDocument || "",
      items: (data.items || []).map((item) => ({ idProduct: item.idProduct, name: item.nameProduct, unit: item.codeUnit, quantity: Number(item.quantityFiscalDocumentItem), unitPrice: Number(item.unitPriceFiscalDocumentItem) })),
      payments: (data.payments || []).map((payment) => ({ description: payment.description, amount: Number(payment.amount) }))
    };
    error = "";
    setMessage(`Entrada ${id} aberta.`);
    render();
  };
  const save = async (status) => {
    const form = root.querySelector("[data-manual-form]");
    const field = (name) => form.elements.namedItem(name);
    draft = {
      ...draft,
      origin: field("origin").value,
      entryDate: field("entryDate").value,
      number: field("number").value,
      idSupplier: field("idSupplier").value
    };
    const response = await apiFetch(`${getApiUrl()}/api/stock/manual-entries${current ? `/${current.idFiscalEntry}` : ""}`, { method: current ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, status }) });
    const data = await response.json(); if (!response.ok) { error = data.error || "Não foi possível salvar."; render(); return; }
    setMessage(status === "open" ? "Entrada salva e aberta para revisão." : "Rascunho salvo.");
    error = "";
    if (!current) current = { idFiscalEntry: data.idFiscalEntry, statusFiscalEntry: data.statusFiscalEntry }; else current.statusFiscalEntry = data.statusFiscalEntry; await load();
  };
  const reviewImpact = async () => {
    if (!current || current.statusFiscalEntry !== "open") return;
    try {
      error = "";
      render();
      const entryId = current.idFiscalEntry;
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
      current.statusFiscalEntry = result.statusFiscalEntry;
      error = "";
      setMessage(result.updatedRecipeCount
        ? `Entrada ${entryId} confirmada. ${formatUpdatedRecipeStructures(result.updatedRecipeCount)}`
        : `Entrada ${entryId} confirmada.`);
      render();
      await load();
    } catch (reviewError) {
      error = reviewError instanceof Error ? reviewError.message : "Falha ao revisar o impacto da entrada.";
      render();
    }
  };
  const transition = async (action, entryId = current?.idFiscalEntry) => {
    const labels = {
      confirm: {
        title: "Confirmar entrada manual",
        message: "Confirmar esta entrada manual?",
        detail: "A confirmação movimentará estoque e atualizará os custos."
      },
      reverse: {
        title: "Cancelar entrada manual",
        message: "Cancelar esta entrada manual confirmada?",
        detail: "Os efeitos de estoque e custo serão revertidos e o cancelamento ficará registrado."
      },
      delete: {
        title: "Excluir entrada manual",
        message: "Excluir esta entrada manual?",
        detail: "Somente entradas em Digitação ou Aberta podem ser excluídas."
      }
    };
    if (!(await confirmAction(labels[action]))) return;
    const url = `${getApiUrl()}/api/stock/fiscal-entries/${entryId}${action === "confirm" ? "/confirm" : action === "reverse" ? "/reverse" : ""}`;
    const response = await apiFetch(url, { method: action === "delete" ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: action === "reverse" ? JSON.stringify({ reason: "Cancelamento da entrada manual" }) : undefined });
    const data = await response.json(); if (!response.ok) { error = data.error || "Não foi possível concluir a operação."; render(); return; }
    if (action === "delete") { current = null; draft = blank(); } else current.statusFiscalEntry = data.statusFiscalEntry;
    setMessage(action === "confirm" ? "Entrada confirmada." : action === "reverse" ? "Entrada cancelada." : "Entrada excluída."); error = ""; await load();
  };
  render(); void load(); return root;
}
