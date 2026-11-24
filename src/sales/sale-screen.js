import { calculateSaleTotals } from "../shared/sale.js";
import {
  bindNumberMasks,
  formatMaskedNumber,
  normalizeMaskedNumber
} from "../ui/number-mask.js";
import { apiFetch, getApiUrl, saveConfiguredApiUrl  } from "../shared/api.js";
import { confirmAction } from "../ui/confirmation-modal.js";
import {
  getDiningTableModalPresentation,
  getDiningTablePeopleLabel,
  normalizeDiningTablePayload,
  sortDiningTables
} from "../shared/dining-table.js";
import { renderPreservingFormDraft } from "../ui/form-draft.js";
import { createFeedbackTimer } from "../ui/feedback.js";
import { invoke } from "@tauri-apps/api/core";
import { renderLucideIcons } from "../ui/icons.js";

const formatCurrency = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);

const loadProducts = async () => {
  const response = await apiFetch(`${getApiUrl()}/api/products`);
  if (!response.ok) {
    throw new Error(`Falha ao carregar produtos (${response.status}).`);
  }
  const payload = await response.json();
  if (!Array.isArray(payload.products)) {
    throw new Error("A API retornou um catálogo inválido.");
  }
  return payload.products.map((product) => ({
    ...product,
    id: String(product.idProduct),
    name: product.nameProduct,
    price: Number(product.priceProduct),
    group: product.descriptionGroup || "Sem grupo"
  }));
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const requestCancellationReason = () => new Promise((resolve) => {
  const backdrop = document.createElement("div");
  backdrop.className = "sale-modal-backdrop";
  backdrop.innerHTML = `
    <section class="sale-modal cancellation-sale-modal" role="dialog" aria-modal="true" aria-labelledby="cancellation-reason-title">
      <div class="sale-modal-header">
        <h2 id="cancellation-reason-title">Motivo do cancelamento</h2>
        <button class="sale-modal-close" data-cancel-reason type="button" aria-label="Cancelar" title="Cancelar"><i data-lucide="x"></i></button>
      </div>
      <form data-cancellation-reason-form>
        <div class="sale-modal-body">
          <label class="form-field">
            <span>Motivo</span>
            <textarea name="reason" minlength="5" maxlength="500" required></textarea>
          </label>
        </div>
        <div class="sale-modal-actions">
          <button class="sale-action sale-action-danger" type="submit">Confirmar cancelamento</button>
          <button class="sale-action sale-action-secondary" data-cancel-reason type="button">Voltar</button>
        </div>
      </form>
    </section>
  `;
  document.body.append(backdrop);
  const finish = (reason = "") => {
    backdrop.remove();
    resolve(reason);
  };
  backdrop.querySelectorAll("[data-cancel-reason]").forEach((button) => {
    button.addEventListener("click", () => finish());
  });
  backdrop.querySelector("[data-cancellation-reason-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    finish(new FormData(event.currentTarget).get("reason")?.toString().trim() || "");
  });
  backdrop.querySelector("textarea")?.focus();
});

export function createSaleScreen({
  onBackoffice,
  onCash,
  onLogout,
  onEnvironmentSelection,
  initialApiError = false,
  onApiConfigured
} = {}) {
  const root = document.createElement("main");
  let products = [];
  let paymentMethods = [];
  let customers = [];
  const cart = [];
  let activeGroup = "Todos";
  let searchTerm = "";
  let loading = true;
  let loadError = "";
  let paymentLoading = true;
  let paymentError = "";
  let cashSession = null;
  let cashLoading = true;
  let paymentOpen = false;
  let idPaymentMethod = "";
  let idCustomerSale = "";
  let paymentAmount = "";
  let emitNfce = false;
  let submittingPayment = false;
  let saleFeedback = "";
  let apiConfigOpen = initialApiError;
  let apiConfigSaving = false;
  let apiConfigError = "";
  let apiConfigUrl = getApiUrl();
  let recentSalesOpen = false;
  let recentSales = [];
  let recentSalesLoading = false;
  let recentSalesError = "";
  let saleMode = "counter";
  let diningTables = [];
  let diningTablesLoading = false;
  let diningTablesError = "";
  let diningTableModalOpen = false;
  let editingDiningTable = null;
  let diningTableSaving = false;
  let diningTableSaveError = "";
  let diningTableSelection = "";
  let diningTableFeedback = "";
  const scheduleSaleFeedbackClear = createFeedbackTimer();
  const setSaleFeedback = (message) => {
    saleFeedback = message;
    scheduleSaleFeedbackClear(() => {
      saleFeedback = "";
      render();
    });
  };
  const handleDiningTableKeyboard = (event) => {
    if (saleMode !== "tables" || diningTableModalOpen || recentSalesOpen || paymentOpen || apiConfigOpen) return;
    if (event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      if (diningTableSelection.length < 3) diningTableSelection += event.key;
      const field = root.querySelector("[data-dining-table-selection]");
      if (field) {
        field.value = diningTableSelection;
        field.focus();
      } else {
        render();
      }
      return;
    }
    if (event.key === "Backspace") {
      event.preventDefault();
      diningTableSelection = diningTableSelection.slice(0, -1);
      const field = root.querySelector("[data-dining-table-selection]");
      if (field) {
        field.value = diningTableSelection;
        field.focus();
      } else {
        render();
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void confirmDiningTableSelection();
    }
  };
  const operator = window.__PDV_OPERATOR__ || {};
  const canCancelSales = ["supervisor", "admin"].includes(operator.roleOperator);

  const getVisibleProducts = () => products.filter((product) => {
    const matchesGroup =
      activeGroup === "Todos" || product.group === activeGroup;
    const matchesSearch = product.name
      .toLocaleLowerCase("pt-BR")
      .includes(searchTerm.toLocaleLowerCase("pt-BR"));
    return matchesGroup && matchesSearch;
  });

  const productGridMarkup = () => {
    const visibleProducts = getVisibleProducts();
    if (loading) {
      return '<p class="empty-state">Carregando produtos...</p>';
    }
    if (loadError) {
      return `<div class="empty-state error-state"><strong>Não foi possível carregar o catálogo.</strong><span>${escapeHtml(loadError)}</span><button class="secondary-button" data-retry type="button">Tentar novamente</button></div>`;
    }
    if (!visibleProducts.length) {
      return '<p class="empty-state">Nenhum produto encontrado.</p>';
    }
    return visibleProducts
      .map(
        (product) => `
          <button class="product-card" data-product="${product.idProduct}" type="button">
            <span class="product-icon">${escapeHtml(product.name.charAt(0))}</span>
            <span class="product-category">${escapeHtml(product.group)}</span>
            <strong>${escapeHtml(product.name)}</strong>
            <span class="product-price">${formatCurrency(product.price)}</span>
          </button>
        `
      )
      .join("");
  };

  const diningTableStatusLabel = (status) => ({
    free: "Livre",
    occupied: "Ocupada",
    closing: "Fechamento"
  }[status] || "Livre");

  const diningTablesMarkup = () => {
    if (diningTablesLoading) {
      return '<p class="empty-state">Carregando mesas...</p>';
    }
    if (diningTablesError) {
      return `<div class="empty-state error-state"><strong>Não foi possível carregar as mesas.</strong><span>${escapeHtml(diningTablesError)}</span><button class="secondary-button" data-retry-dining-tables type="button">Tentar novamente</button></div>`;
    }
    if (!diningTables.length) {
      return '<p class="empty-state dining-tables-empty">Nenhuma Mesa configurada.</p>';
    }
    return `
      <div class="dining-table-grid">
        ${sortDiningTables(diningTables).map((table) => `
          <button class="dining-table-card dining-table-status-${escapeHtml(table.status)}" data-edit-dining-table="${table.id}" type="button">
            <strong class="dining-table-number">${escapeHtml(table.visualIdentifier)}</strong>
            ${table.name ? `<span class="dining-table-name">${escapeHtml(table.name)}</span>` : ""}
            <span class="dining-table-status">${escapeHtml(diningTableStatusLabel(table.status))}</span>
            ${table.status === "occupied" ? `<span class="dining-table-people">${escapeHtml(getDiningTablePeopleLabel(table.people))}</span>` : ""}
          </button>
        `).join("")}
      </div>
    `;
  };

  const diningTableCounts = () => {
    const available = diningTables.filter((table) => table.status === "free").length;
    const occupied = diningTables.filter((table) => table.status === "occupied").length;
    return { available, occupied };
  };

  const confirmDiningTableSelection = async () => {
    const identifier = diningTableSelection.trim();
    const table = sortDiningTables(diningTables).find((item) =>
      String(item.visualIdentifier) === identifier
    );
    if (!table) {
      setSaleFeedback("Mesa não encontrada.");
      diningTableSelection = "";
      render();
      return;
    }
    editingDiningTable = table;
    if (table.status === "occupied") {
      diningTableSelection = "";
      diningTableFeedback = `Mesa ${table.visualIdentifier} ocupada. Tela de lançamentos será aberta aqui.`;
      render();
      return;
    }
    diningTableSaveError = "";
    diningTableModalOpen = true;
    render();
    root.querySelector('[data-dining-table-form] input[name="name"]')?.focus();
  };

  const diningTableControlMarkup = () => {
    const counts = diningTableCounts();
    return `
      <aside class="dining-table-control-panel" aria-label="Controles das Mesas">
        <div class="dining-table-quick-selection" aria-label="Número digitado da Mesa">
          <input class="dining-table-selection" data-dining-table-selection type="text" inputmode="numeric" autocomplete="off" maxlength="3" aria-label="Número da Mesa" value="${escapeHtml(diningTableSelection)}" autofocus />
          <button class="dining-table-selection-back" type="button" data-dining-table-key="back" aria-label="Apagar último dígito">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6H9l-7 6 7 6h11V6Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m16 9-4 6m4 0-4-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="dining-table-keypad" aria-label="Seleção rápida da Mesa">
          ${["7", "8", "9", "4", "5", "6", "1", "2", "3", "0"].map((key) => {
            return `<button type="button" data-dining-table-key="${key}" aria-label="Digite ${key}">${key}</button>`;
          }).join("")}
          <button class="dining-table-key-confirm" type="button" data-dining-table-key="confirm" aria-label="Abrir Mesa digitada" style="grid-column: 2 / 4;">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <div class="dining-table-control-summary">
          <div class="dining-table-count-card dining-table-count-free">
            <strong>${counts.available}</strong>
            <span>Disponíveis</span>
          </div>
          <div class="dining-table-count-card dining-table-count-occupied">
            <strong>${counts.occupied}</strong>
            <span>Ocupadas</span>
          </div>
          <button class="dining-table-summary-button" data-print-dining-table-summary type="button">
            <i data-lucide="printer"></i>
            <span>Resumo das Mesas</span>
          </button>
        </div>
      </aside>
    `;
  };

  const diningTableModalMarkup = () => {
    const table = editingDiningTable;
    const presentation = getDiningTableModalPresentation(table?.status);
    return `
      <div class="sale-modal-backdrop" data-dining-table-backdrop>
        <section class="sale-modal dining-table-modal" role="dialog" aria-modal="true" aria-labelledby="dining-table-title">
          <div class="sale-modal-header">
            <h2 id="dining-table-title">${escapeHtml(presentation.title)}</h2>
            <button class="sale-modal-close" data-close-dining-table type="button" aria-label="Fechar" title="Fechar"><i data-lucide="x"></i></button>
          </div>
          <form data-dining-table-form>
            <div class="sale-modal-body dining-table-form-grid">
              <div class="dining-table-edit-identifier">
                <span>Mesa</span>
                <strong>${escapeHtml(table?.visualIdentifier || "")}</strong>
              </div>
              <label class="form-field">
                <span>Nome de Referência</span>
                <input name="name" maxlength="120" value="${escapeHtml(table?.name || "")}" ${diningTableSaving ? "disabled" : ""} ${table?.status === "free" ? "autofocus" : ""} />
              </label>
              <div class="form-field dining-table-people-field">
                <span>Quantidade de pessoas</span>
                <div class="dining-table-people-stepper">
                  <button type="button" data-dining-table-people-step="-1" aria-label="Diminuir quantidade de pessoas" ${diningTableSaving ? "disabled" : ""}>−</button>
                  <input name="people" type="number" min="1" step="1" required value="${escapeHtml(String(table?.people || 1))}" ${diningTableSaving ? "disabled" : ""} />
                  <button type="button" data-dining-table-people-step="1" aria-label="Aumentar quantidade de pessoas" ${diningTableSaving ? "disabled" : ""}>+</button>
                </div>
              </div>
              ${diningTableSaveError ? `<p class="error-message">${escapeHtml(diningTableSaveError)}</p>` : ""}
            </div>
            <div class="sale-modal-actions">
              ${table?.status === "occupied"
                ? '<button class="sale-action sale-action-secondary" data-request-dining-table-closing type="button" ' + (diningTableSaving ? "disabled" : "") + '>Pedir conta</button>'
                : ""}
              <button class="sale-action sale-action-primary" type="submit" ${diningTableSaving ? "disabled" : ""}>${diningTableSaving ? "Salvando..." : escapeHtml(presentation.actionLabel)}</button>
              <button class="sale-action sale-action-secondary" data-close-dining-table type="button" ${diningTableSaving ? "disabled" : ""}>Cancelar</button>
            </div>
          </form>
        </section>
      </div>
    `;
  };

  const fiscalStatusLabel = (status) => ({
    not_requested: "Não solicitada",
    pending: "Pendente",
    authorized: "Autorizada",
    rejected: "Rejeitada",
    unknown: "Resultado desconhecido"
  }[status] || status || "Não informado");

  const formatSaleDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value || "")
      : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short"
      }).format(date);
  };

  const recentSalesMarkup = () => `
    <div class="sale-modal-backdrop" data-recent-sales-backdrop>
      <section class="sale-modal recent-sales-modal" role="dialog" aria-modal="true" aria-labelledby="recent-sales-title">
        <div class="sale-modal-header">
          <h2 id="recent-sales-title">Vendas recentes</h2>
          <button class="sale-modal-close" data-close-recent-sales type="button" aria-label="Fechar" title="Fechar"><i data-lucide="x"></i></button>
        </div>
        <div class="sale-modal-body">
          ${recentSalesLoading ? '<p class="modal-help-text">Carregando vendas...</p>' : ""}
          ${recentSalesError ? `<p class="error-message">${escapeHtml(recentSalesError)}</p>` : ""}
          ${!recentSalesLoading && !recentSalesError && !recentSales.length ? '<p class="modal-help-text">Nenhuma venda encontrada.</p>' : ""}
          ${recentSales.length ? `
            <div class="recent-sales-table-wrap">
              <table class="recent-sales-table">
              <thead>
                <tr>
                  <th>Cód. venda</th>
                  <th>Tipo</th>
                  <th>ECF/SAT</th>
                  <th>Cliente</th>
                  <th>Mesa/comanda</th>
                  <th>Data de emissão</th>
                  <th>Valor total</th>
                  <th>Status</th>
                  <th>Status cupom fiscal</th>
                  <th>MFE</th>
                  <th>Operação</th>
                </tr>
              </thead>
              <tbody>
              ${recentSales.map((sale) => `
                <tr>
                  <td data-label="Cód. venda">${escapeHtml(String(sale.idSale || ""))}</td>
                  <td data-label="Tipo">${sale.fiscalStatus !== "not_requested" ? "NFC-e" : "Venda"}</td>
                  <td data-label="ECF/SAT">-</td>
                  <td data-label="Cliente">Consumidor</td>
                  <td data-label="Mesa/comanda">-</td>
                  <td data-label="Data de emissão">${escapeHtml(formatSaleDate(sale.createdAtSale))}</td>
                  <td data-label="Valor total">${formatCurrency(Number(sale.totalSale || 0))}</td>
                  <td data-label="Status" class="${sale.statusSale === "cancelled" ? "status-error" : "status-success"}">${sale.statusSale === "cancelled" ? "Cancelada" : "Concluída"}</td>
                  <td data-label="Status cupom fiscal">
                    <span class="fiscal-status fiscal-status-${escapeHtml(String(sale.fiscalStatus || "not_requested"))}">${escapeHtml(fiscalStatusLabel(sale.fiscalStatus))}</span>
                    ${sale.fiscalNumber ? `<small>Nº ${escapeHtml(String(sale.fiscalNumber))} · série ${escapeHtml(String(sale.fiscalSeries || ""))}</small>` : ""}
                    ${sale.fiscalCStat || sale.fiscalMessage ? `<small>${sale.fiscalCStat ? `cStat ${escapeHtml(String(sale.fiscalCStat))}` : ""}${sale.fiscalCStat && sale.fiscalMessage ? " · " : ""}${escapeHtml(String(sale.fiscalMessage || ""))}</small>` : ""}
                  </td>
                  <td data-label="MFE">-</td>
                  <td data-label="Operação" class="recent-sale-actions">
                    ${sale.fiscalAccessKey ? `<small>Chave: ${escapeHtml(String(sale.fiscalAccessKey))}</small>` : ""}
                    ${sale.fiscalProtocol ? `<small>Protocolo: ${escapeHtml(String(sale.fiscalProtocol))}</small>` : ""}
                    ${sale.fiscalXml ? `<details><summary>Ver XML</summary><textarea readonly rows="10" aria-label="XML da NFC-e da venda ${escapeHtml(String(sale.idSale))}">${escapeHtml(String(sale.fiscalXml))}</textarea></details>` : ""}
                    ${canCancelSales && sale.statusSale !== "cancelled" ? `<button class="secondary-button danger-button" data-cancel-sale="${sale.idSale}" type="button">Cancelar</button>` : ""}
                  </td>
                </tr>
              `).join("")}
              </tbody>
              </table>
            </div>
          ` : ""}
        </div>
      </section>
    </div>
  `;

  const updateProductGrid = () => {
    const grid = root.querySelector(".product-grid");
    if (!grid) return;
    grid.innerHTML = productGridMarkup();
    bindProductEvents();
  };

  const render = () => {
    const groups = ["Todos", ...new Set(products.map(({ group }) => group))];
    const { itemCount, total } = calculateSaleTotals(cart);

    root.className = "sale-screen";
    root.innerHTML = `
      <header class="topbar">
        <div>
          <p class="eyebrow">Operação</p>
          <h1>Frente de caixa</h1>
        </div>
        <div class="cash-status">
          <span class="status-dot ${cashSession ? "" : "status-dot-warning"}"></span>
          <span>${cashLoading ? "Verificando caixa..." : cashSession ? "Caixa aberto" : "Caixa fechado"}</span>
          <strong>Operador autenticado</strong>
          <button class="secondary-button" data-cash type="button">Caixa</button>
          <button class="secondary-button" data-backoffice type="button">Retaguarda</button>
          <button class="secondary-button" data-recent-sales type="button">Vendas recentes</button>
          <button class="text-button" data-logout type="button">Logout</button>
        </div>
      </header>

      <nav class="sale-mode-tabs" aria-label="Modo da frente de caixa">
        <button class="sale-mode-button ${saleMode === "counter" ? "is-active" : ""}" data-sale-mode="counter" type="button"><i data-lucide="shopping-basket"></i><span>Balcão</span></button>
        <button class="sale-mode-button ${saleMode === "tables" ? "is-active" : ""}" data-sale-mode="tables" type="button"><i data-lucide="utensils"></i><span>Mesas</span></button>
      </nav>
      ${saleMode === "tables" ? `
      <section class="workspace dining-tables-workspace">
        <div class="catalog-panel dining-tables-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Organização</p>
              <h2>Mapa de Mesas</h2>
            </div>
            <span class="dining-table-count">${diningTables.length} ${diningTables.length === 1 ? "Mesa" : "Mesas"}</span>
          </div>
          ${diningTableFeedback ? `<div class="dining-table-feedback success-message" role="status">${escapeHtml(diningTableFeedback)}</div>` : ""}
          ${diningTablesMarkup()}
        </div>
        ${diningTableControlMarkup()}
      </section>
      ` : `
      <section class="workspace">
        <div class="catalog-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Produtos</p>
              <h2>Selecione um item</h2>
            </div>
            <label class="search">
              <span aria-hidden="true">⌕</span>
              <input
                name="productSearch"
                data-search
                type="search"
                placeholder="Buscar produto"
                value="${escapeHtml(searchTerm)}"
                aria-label="Buscar produto"
              />
            </label>
            ${paymentMethods.find((method) => String(method.idPaymentMethod) === String(idPaymentMethod))?.namePaymentMethod?.toLocaleUpperCase("pt-BR") === "VALE" ? `
              <label class="form-field">
                <span>Cliente do Vale</span>
                <select data-customer-sale required>
                  <option value="">Selecione o cliente</option>
                  ${customers.map((customer) => `<option value="${customer.idCustomer}" ${String(customer.idCustomer) === String(idCustomerSale) ? "selected" : ""}>${escapeHtml(customer.nameCustomer)}</option>`).join("")}
                </select>
              </label>` : ""}
          </div>

          <nav class="categories" aria-label="Grupos">
            ${groups
              .map(
                (group) => `
                  <button
                    class="category-button ${group === activeGroup ? "is-active" : ""}"
                    data-category="${escapeHtml(group)}"
                    type="button"
                  >${escapeHtml(group)}</button>
                `
              )
              .join("")}
          </nav>

          <div class="product-grid">
            ${productGridMarkup()}
          </div>
        </div>

        <aside class="cart-panel">
          <div class="panel-heading cart-heading">
            <div>
              <p class="eyebrow">Venda atual</p>
              <h2>Carrinho <span class="item-count">${itemCount}</span></h2>
            </div>
            <button class="text-button" data-clear type="button" ${
              cart.length ? "" : "disabled"
            }>Limpar</button>
          </div>
          ${saleFeedback ? `<div class="sale-feedback-banner success-message" role="status">${escapeHtml(saleFeedback)}</div>` : ""}

          <div class="cart-items">
            ${
              cart.length
                ? cart
                    .map(
                      (item) => `
                        <article class="cart-item">
                          <div>
                            <strong>${escapeHtml(item.name)}</strong>
                            <span><input data-quantity="${item.id}" type="number" min="${item.isFractionalProduct ? "0.001" : "1"}" step="${item.isFractionalProduct ? "0.001" : "1"}" value="${item.quantity}" aria-label="Quantidade de ${escapeHtml(item.name)}" /> × ${formatCurrency(item.price)}</span>
                          </div>
                          <div class="cart-item-actions">
                            <strong>${formatCurrency(item.price * item.quantity)}</strong>
                            <button data-remove="${item.id}" type="button" aria-label="Remover ${escapeHtml(item.name)}">×</button>
                          </div>
                        </article>
                      `
                    )
                    .join("")
                : '<div class="cart-empty"><span class="empty-cart-icon">＋</span><strong>Seu carrinho está vazio</strong><span>Adicione produtos para iniciar a venda.</span></div>'
            }
          </div>
          ${!cashLoading && !cashSession ? `
            <div class="cash-notice">
              <strong>O caixa está fechado</strong>
              <span>Você pode consultar os produtos, mas precisa abrir o caixa para concluir uma venda.</span>
              <button class="secondary-button" data-cash type="button">Abrir caixa</button>
            </div>
          ` : ""}

          <div class="sale-summary">
            <div><span>Itens</span><strong>${itemCount}</strong></div>
            <div><span>Subtotal</span><strong>${formatCurrency(total)}</strong></div>
            <div class="sale-total"><span>Total</span><strong>${formatCurrency(total)}</strong></div>
          </div>
          <button class="primary-button" data-payment type="button" ${
            cart.length && cashSession ? "" : "disabled"
          }>Ir para pagamento <span>→</span></button>
        </aside>
      </section>
      `}
      ${
        paymentOpen
          ? `
            <div class="modal-backdrop" data-payment-backdrop>
              <section class="payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-title">
                <div class="panel-heading">
                  <div>
                    <p class="eyebrow">Finalizar venda</p>
                    <h2 id="payment-title">Pagamento</h2>
                  </div>
                  <button class="sale-modal-close" data-close-payment type="button" aria-label="Fechar" title="Fechar"><i data-lucide="x"></i></button>
                </div>
                <form class="sale-modal-body" data-payment-form>
                  <label class="form-field">
                    <span>Forma de pagamento</span>
                    <select data-payment-method ${
                      paymentLoading || paymentMethods.length === 0 ? "disabled" : ""
                    }>
                      ${
                        paymentLoading
                          ? '<option>Carregando...</option>'
                          : paymentMethods.length
                            ? paymentMethods
                                .map(
                                  (method) => `
                                    <option value="${method.idPaymentMethod}" ${
                                      String(method.idPaymentMethod) === String(idPaymentMethod)
                                        ? "selected"
                                        : ""
                                    }>${escapeHtml(method.namePaymentMethod)}</option>
                                  `
                                )
                                .join("")
                            : '<option>Nenhuma forma disponível</option>'
                      }
                    </select>
                  </label>
                  <label class="form-field">
                    <span>Valor recebido</span>
                    <input data-payment-amount data-number-mask inputmode="decimal" value="${escapeHtml(
                      formatMaskedNumber(paymentAmount)
                    )}" ${submittingPayment ? "disabled" : ""} required />
                  </label>
                  <div class="payment-total">
                    <span>Total da venda</span>
                    <strong>${formatCurrency(total)}</strong>
                  </div>
                  <label class="form-field checkbox-field">
                    <span><input data-emit-nfce type="checkbox" ${emitNfce ? "checked" : ""} ${submittingPayment ? "disabled" : ""} /> Emitir NFC-e em homologação</span>
                    <small>A venda será confirmada mesmo se a SEF/MG estiver indisponível; nesse caso ficará pendente para tratamento posterior.</small>
                  </label>
                  ${
                    paymentError
                      ? `<p class="payment-error">${escapeHtml(paymentError)}</p>`
                      : ""
                  }
                  <button class="sale-action sale-action-primary" type="submit" ${
                    paymentLoading || !paymentMethods.length || submittingPayment
                      ? "disabled"
                      : ""
                  }>${submittingPayment ? "Registrando..." : "Confirmar venda"} <span>✓</span></button>
                </form>
              </section>
            </div>
          `
          : ""
      }
      ${diningTableModalOpen ? diningTableModalMarkup() : ""}
      ${
        apiConfigOpen
          ? `
            <div class="sale-modal-backdrop" data-api-config-backdrop>
              <section class="sale-modal api-connection-modal" role="dialog" aria-modal="true" aria-labelledby="api-config-title">
                <div class="sale-modal-header">
                  <h2 id="api-config-title">API indisponível</h2>
                  <button class="sale-modal-close" data-close-api-config type="button" aria-label="Fechar" title="Continuar sem conexão"><i data-lucide="x"></i></button>
                </div>
                <form data-api-config-form>
                  <div class="sale-modal-body">
                    <p class="modal-help-text">Não foi possível conectar ao servidor do PDV. Informe o IP ou nome do computador que executa a API e a porta publicada.</p>
                    <label class="form-field">
                      <span>Endereço da API</span>
                      <input name="apiUrl" type="url" inputmode="url" autocomplete="off" placeholder="http://192.168.0.10:3000" value="${escapeHtml(apiConfigUrl)}" ${apiConfigSaving ? "disabled" : ""} required />
                    </label>
                    ${apiConfigError ? `<p class="error-message">${escapeHtml(apiConfigError)}</p>` : ""}
                  </div>
                  <div class="sale-modal-actions">
                    <button class="sale-action sale-action-primary" type="submit" ${apiConfigSaving ? "disabled" : ""}>${apiConfigSaving ? "Testando..." : "Salvar e testar"}</button>
                    <button class="sale-action sale-action-secondary" data-close-api-config type="button" ${apiConfigSaving ? "disabled" : ""}>Continuar sem conexão</button>
                  </div>
                </form>
              </section>
            </div>
          `
          : ""
      }
      ${recentSalesOpen ? recentSalesMarkup() : ""}
    `;

    bindEvents();
    bindNumberMasks(root);
    renderLucideIcons(root);
  };

  const addProduct = (idProduct) => {
    const product = products.find(({ id }) => id === idProduct);
    if (!product) {
      return;
    }
    const existing = cart.find(({ id }) => id === product.idProduct);
    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push({ ...product, quantity: 1 });
    }
    render();
  };

  const removeProduct = (idProduct) => {
    const index = cart.findIndex(({ id }) => id === idProduct);
    if (index === -1) {
      return;
    }
    if (cart[index].quantity > 1) {
      cart[index].quantity -= 1;
    } else {
      cart.splice(index, 1);
    }
    render();
  };

  const bindProductEvents = () => {
    root.querySelectorAll("[data-product]").forEach((button) => {
      button.addEventListener("click", () => addProduct(button.dataset.product));
    });
  };

  const bindEvents = () => {
    bindProductEvents();
    root.querySelectorAll("[data-remove]").forEach((button) => {
      button.addEventListener("click", () => removeProduct(button.dataset.remove));
    });
    root.querySelectorAll("[data-quantity]").forEach((input) => {
      input.addEventListener("change", () => {
        const item = cart.find(({ id }) => id === input.dataset.quantity);
        const quantity = Number(input.value);
        if (!item || !Number.isFinite(quantity) || quantity <= 0
          || Math.round(quantity * 1000) !== quantity * 1000
          || (!item.isFractionalProduct && !Number.isInteger(quantity))) {
          render();
          return;
        }
        item.quantity = quantity;
        render();
      });
    });
    root.querySelectorAll("[data-category]").forEach((button) => {
      button.addEventListener("click", () => {
        activeGroup = button.dataset.category;
        render();
      });
    });
    root.querySelector("[data-clear]")?.addEventListener("click", () => {
      cart.splice(0, cart.length);
      render();
    });
    root.querySelector("[data-payment]")?.addEventListener("click", () => {
      const { total } = calculateSaleTotals(cart);
      paymentOpen = true;
      paymentError = "";
      paymentAmount = total.toFixed(2);
      idPaymentMethod = paymentMethods[0] ? String(paymentMethods[0].idPaymentMethod) : "";
      render();
    });
    root.querySelector("[data-close-payment]")?.addEventListener("click", () => {
      paymentOpen = false;
      render();
    });
    root.querySelector("[data-payment-backdrop]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) {
        paymentOpen = false;
        render();
      }
    });
    root.querySelector("[data-payment-method]")?.addEventListener("change", (event) => {
      idPaymentMethod = event.target.value;
      idCustomerSale = "";
      render();
    });
    root.querySelector("[data-customer-sale]")?.addEventListener("change", (event) => {
      idCustomerSale = event.target.value;
    });
    root.querySelector("[data-payment-amount]")?.addEventListener("input", (event) => {
      paymentAmount = event.target.value;
    });
    root.querySelector("[data-emit-nfce]")?.addEventListener("change", (event) => {
      emitNfce = event.target.checked;
    });
    root.querySelector("[data-payment-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitPayment();
    });
    root.querySelector("[data-retry]")?.addEventListener("click", () => {
      void fetchCatalog();
    });
    root.querySelector("[data-backoffice]")?.addEventListener("click", () => onBackoffice?.());
    root.querySelector("[data-cash]")?.addEventListener("click", () => onCash?.());
    root.querySelector("[data-recent-sales]")?.addEventListener("click", () => {
      recentSalesOpen = true;
      void fetchRecentSales();
    });
    root.querySelector("[data-close-recent-sales]")?.addEventListener("click", () => {
      recentSalesOpen = false;
      render();
    });
    root.querySelector("[data-recent-sales-backdrop]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) {
        recentSalesOpen = false;
        render();
      }
    });
    root.querySelectorAll("[data-cancel-sale]").forEach((button) => {
      button.addEventListener("click", () => void cancelRecentSale(Number(button.dataset.cancelSale)));
    });
    root.querySelector("[data-logout]")?.addEventListener("click", () => onLogout?.());
    root.querySelectorAll("[data-close-api-config]").forEach((button) => {
      button.addEventListener("click", () => {
        apiConfigOpen = false;
        render();
      });
    });
    root.querySelector("[data-api-config-backdrop]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget && !apiConfigSaving) {
        apiConfigOpen = false;
        render();
      }
    });
    root.querySelector("[data-api-config-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      apiConfigSaving = true;
      apiConfigError = "";
      apiConfigUrl = event.currentTarget.elements.apiUrl.value;
      render();
      try {
        apiConfigUrl = await saveConfiguredApiUrl(apiConfigUrl);
        const connected = await onApiConfigured?.();
        if (connected === false) {
          throw new Error("Não foi possível conectar a esse endereço. Verifique o IP, a porta e o firewall do servidor.");
        }
        apiConfigOpen = false;
        await Promise.all([fetchCatalog(), fetchPaymentMethods(), fetchDiningTables()]);
      } catch (error) {
        apiConfigError = error instanceof Error ? error.message : String(error);
      } finally {
        apiConfigSaving = false;
        render();
      }
    });
    root.querySelector("[data-search]")?.addEventListener("input", (event) => {
      searchTerm = event.target.value;
      updateProductGrid();
    });
    root.querySelectorAll("[data-sale-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        saleMode = button.dataset.saleMode;
        diningTableFeedback = "";
        if (saleMode === "counter") {
          setSaleFeedback("Modo Balcão ativado.");
        }
        if (saleMode === "tables") diningTableSelection = "";
        render();
        if (saleMode === "tables" && !diningTablesLoading) {
          void fetchDiningTables();
        }
        if (saleMode === "tables") {
          root.querySelector("[data-dining-table-selection]")?.focus();
        }
      });
    });
    root.querySelectorAll("[data-edit-dining-table]").forEach((button) => {
      button.addEventListener("click", () => {
        editingDiningTable = diningTables.find((table) => String(table.id) === String(button.dataset.editDiningTable)) || null;
        diningTableSaveError = "";
        if (editingDiningTable?.status === "occupied") {
          diningTableFeedback = `Mesa ${editingDiningTable.visualIdentifier} ocupada. Tela de lançamentos será aberta aqui.`;
          render();
          return;
        }
        diningTableModalOpen = true;
        render();
        if (editingDiningTable?.status === "free") {
          root.querySelector('[data-dining-table-form] input[name="name"]')?.focus();
        }
      });
    });
    root.querySelectorAll("[data-dining-table-people-step]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = root.querySelector('[data-dining-table-form] input[name="people"]');
        if (!input) return;
        const step = Number(button.dataset.diningTablePeopleStep);
        const current = Number.parseInt(input.value, 10);
        input.value = String(Math.max(1, (Number.isInteger(current) ? current : 1) + step));
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
    root.querySelector("[data-dining-table-back]")?.addEventListener("click", () => {
      diningTableSelection = "";
      diningTableFeedback = "";
      if (typeof onEnvironmentSelection === "function") {
        onEnvironmentSelection();
        return;
      }
      saleMode = "counter";
      setSaleFeedback("Modo Balcão ativado.");
      render();
    });
    root.querySelectorAll("[data-dining-table-key]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.diningTableKey;
        if (key === "back") {
          diningTableSelection = diningTableSelection.slice(0, -1);
        } else if (key === "confirm") {
          confirmDiningTableSelection();
          return;
        } else {
          if (diningTableSelection.length < 3) diningTableSelection += key;
        }
        render();
      });
    });
    root.querySelector("[data-request-dining-table-closing]")?.addEventListener("click", (event) => {
      const form = event.currentTarget.closest("[data-dining-table-form]");
      if (form) void saveDiningTable(form, "closing");
    });
    root.querySelectorAll("[data-close-dining-table]").forEach((button) => {
      button.addEventListener("click", () => {
        if (diningTableSaving) return;
        diningTableModalOpen = false;
        editingDiningTable = null;
        diningTableSaveError = "";
        render();
      });
    });
    root.querySelector("[data-dining-table-backdrop]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget && !diningTableSaving) {
        diningTableModalOpen = false;
        editingDiningTable = null;
        diningTableSaveError = "";
        render();
      }
    });
    root.querySelector("[data-dining-table-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void saveDiningTable(event.currentTarget);
    });
    root.querySelector("[data-retry-dining-tables]")?.addEventListener("click", () => {
      void fetchDiningTables();
    });
    root.querySelector("[data-print-dining-table-summary]")?.addEventListener("click", () => {
      void printDiningTableSummary();
    });
    root.querySelector("[data-dining-table-selection]")?.addEventListener("input", (event) => {
      diningTableSelection = event.currentTarget.value.replace(/\D/g, "").slice(0, 3);
      event.currentTarget.value = diningTableSelection;
    });
    root.querySelector("[data-dining-table-selection]")?.addEventListener("keydown", (event) => {
      if (event.key === "Backspace") {
        event.preventDefault();
        diningTableSelection = diningTableSelection.slice(0, -1);
        event.currentTarget.value = diningTableSelection;
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (diningTableSelection.length === 0) return;
        void confirmDiningTableSelection();
      } else if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        if (diningTableSelection.length < 3) diningTableSelection += event.key;
        event.currentTarget.value = diningTableSelection;
      }
    });
    if (saleMode === "tables" && !diningTableModalOpen) {
      root.querySelector("[data-dining-table-selection]")?.focus();
    }
  };

  const fetchDiningTables = async () => {
    diningTablesLoading = true;
    diningTablesError = "";
    render();
    try {
      const response = await apiFetch(`${getApiUrl()}/api/dining-tables`);
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.diningTables)) {
        throw new Error(payload.error || "Não foi possível carregar as Mesas.");
      }
      diningTables = sortDiningTables(payload.diningTables);
    } catch (error) {
      diningTablesError = error instanceof Error ? error.message : "Falha ao carregar as Mesas.";
    } finally {
      diningTablesLoading = false;
      render();
    }
  };

  const printDiningTableSummary = async () => {
    if (!window.__TAURI_INTERNALS__) {
      setSaleFeedback("O resumo impresso exige o aplicativo Tauri.");
      render();
      return;
    }
    try {
      const settingsResponse = await apiFetch(`${getApiUrl()}/api/printer-settings`);
      const settings = await settingsResponse.json();
      if (!settingsResponse.ok) {
        throw new Error(settings.error || "Não foi possível consultar a impressora.");
      }
      if (!settings.receiptPrinterName) {
        throw new Error("Configure a impressora padrão de Cupom antes de imprimir.");
      }
      const occupiedTables = sortDiningTables(diningTables)
        .filter((table) => table.status === "occupied");
      const totalPeople = occupiedTables.reduce((sum, table) => sum + Number(table.people || 0), 0);
      const text = [
        "RESUMO DAS MESAS",
        "================================================",
        ...occupiedTables.map((table) =>
          [
            `Mesa ${table.visualIdentifier}${table.name ? ` - ${table.name}` : ""}`,
            `Pessoas: ${table.people || 0}`,
            "Status: Ocupada",
            "Valor da Comanda: não informado nesta versão"
          ].join("\n"),
        ),
        "================================================",
        `Mesas ocupadas: ${occupiedTables.length}`,
        `Pessoas: ${totalPeople}`,
        "Total geral: não informado nesta versão",
        "================================================"
      ].join("\n");
      const result = await invoke("print_receipt", {
        request: {
          printerName: settings.receiptPrinterName,
          text,
          lines: null
        }
      });
      setSaleFeedback(result || "Resumo das Mesas enviado para impressão.");
      render();
    } catch (printError) {
      setSaleFeedback(printError instanceof Error ? printError.message : "Não foi possível imprimir o resumo das Mesas.");
      render();
    }
  };

  const saveDiningTable = async (form, statusOverride = "") => {
    diningTableSaving = true;
    diningTableSaveError = "";
    renderPreservingFormDraft(root, render);
    try {
      const data = new FormData(form);
      const presentation = getDiningTableModalPresentation(editingDiningTable?.status);
      const table = normalizeDiningTablePayload({
        visualIdentifier: editingDiningTable?.visualIdentifier || "",
        name: data.get("name"),
        people: data.get("people"),
        status: statusOverride || presentation.nextStatus
      });
      const id = editingDiningTable?.id;
      const response = await apiFetch(`${getApiUrl()}/api/dining-tables${id ? `/${id}` : ""}`, {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(table)
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível salvar a Mesa.");
      }
      diningTableModalOpen = false;
      editingDiningTable = null;
      await fetchDiningTables();
    } catch (error) {
      diningTableSaveError = error instanceof Error ? error.message : "Falha ao salvar a Mesa.";
      renderPreservingFormDraft(root, render);
    } finally {
      diningTableSaving = false;
      render();
    }
  };

  const fetchRecentSales = async () => {
    recentSalesLoading = true;
    recentSalesError = "";
    render();
    try {
      const response = await apiFetch(`${getApiUrl()}/api/sales?limit=20`);
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.sales)) {
        throw new Error(payload.error || "Não foi possível consultar as vendas.");
      }
      recentSales = payload.sales;
    } catch (error) {
      recentSalesError = error instanceof Error ? error.message : "Falha ao consultar as vendas.";
    } finally {
      recentSalesLoading = false;
      render();
    }
  };

  const cancelRecentSale = async (idSale) => {
    const confirmed = await confirmAction({
      title: "Cancelar venda",
      message: `Cancelar a venda #${idSale}?`,
      detail: "O estoque e o caixa serão revertidos e o cancelamento ficará registrado.",
      confirmLabel: "Cancelar venda"
    });
    if (!confirmed) return;
    const reason = await requestCancellationReason();
    if (!reason?.trim()) return;
    try {
      const response = await apiFetch(`${getApiUrl()}/api/sales/${idSale}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível cancelar a venda.");
      await fetchRecentSales();
    } catch (error) {
      recentSalesError = error instanceof Error ? error.message : "Falha ao cancelar a venda.";
      render();
    }
  };

  render();
  const fetchCatalog = async () => {
    loading = true;
    loadError = "";
    render();
    try {
      products = await loadProducts();
    } catch (error) {
      loadError =
        error instanceof Error ? error.message : "Erro desconhecido ao carregar o catálogo.";
    } finally {
      loading = false;
      render();
    }
  };

  const fetchPaymentMethods = async () => {
    paymentLoading = true;
    paymentError = "";
    try {
      const response = await apiFetch(`${getApiUrl()}/api/payment-methods`);
      if (!response.ok) {
        throw new Error(`Falha ao carregar formas de pagamento (${response.status}).`);
      }
      const payload = await response.json();
      if (!Array.isArray(payload.paymentMethods)) {
        throw new Error("A API retornou formas de pagamento inválidas.");
      }
      paymentMethods = payload.paymentMethods;
      const customerResponse = await apiFetch(`${getApiUrl()}/api/customers`);
      const customerPayload = await customerResponse.json();
      customers = customerResponse.ok && Array.isArray(customerPayload.customers) ? customerPayload.customers : [];
    } catch (error) {
      paymentError =
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao carregar formas de pagamento.";
    } finally {
      paymentLoading = false;
      if (paymentOpen) {
        render();
      }
    }
  };

  const fetchCash = async () => {
    cashLoading = true;
    render();
    try {
      const response = await apiFetch(`${getApiUrl()}/api/cash/current`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível consultar o caixa.");
      cashSession = payload.cashSession || null;
    } catch (error) {
      cashSession = null;
      console.error("Não foi possível consultar o caixa:", error);
    } finally {
      cashLoading = false;
      render();
    }
  };

  const submitPayment = async () => {
    const amount = Number(normalizeMaskedNumber(paymentAmount));
    const { total } = calculateSaleTotals(cart);
    if (!idPaymentMethod || !Number.isFinite(amount) || amount <= 0) {
      paymentError = "Informe uma forma e um valor de pagamento válido.";
      render();
      return;
    }
    if (Math.round(amount * 100) !== Math.round(total * 100)) {
      paymentError = "O valor recebido deve ser igual ao total da venda.";
      render();
      return;
    }

    submittingPayment = true;
    paymentError = "";
    render();
    try {
      const response = await apiFetch(`${getApiUrl()}/api/sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientIdSale: crypto.randomUUID(),
          items: cart.map(({ id, quantity }) => ({
            idProduct: Number(id),
            quantitySaleItem: quantity
          })),
          payments: [{ idPaymentMethod: Number(idPaymentMethod), amountSalePayment: amount.toFixed(2) }],
          idCustomerSale: idCustomerSale ? Number(idCustomerSale) : null,
          discountSale: "0.00",
          emitNfce
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível registrar a venda.");
      }
      const fiscalStatus = payload.sale?.fiscalStatus;
      saleFeedback = fiscalStatus && fiscalStatus !== "not_requested"
        ? `Venda registrada. NFC-e: ${fiscalStatus}.`
        : "Venda registrada com sucesso.";
      cart.splice(0, cart.length);
      paymentOpen = false;
      emitNfce = false;
      submittingPayment = false;
      render();
      await fetchCatalog();
    } catch (error) {
      paymentError =
        error instanceof Error ? error.message : "Erro desconhecido ao registrar a venda.";
    } finally {
      submittingPayment = false;
      render();
    }
  };

  void fetchCatalog();
  void fetchPaymentMethods();
  void fetchCash();
  root.addEventListener("keydown", handleDiningTableKeyboard);
  root.tabIndex = -1;
  root.cleanup = () => {
    root.removeEventListener("keydown", handleDiningTableKeyboard);
  };
  return root;
}
