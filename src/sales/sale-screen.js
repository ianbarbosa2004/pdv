import { calculateSaleTotals } from "../shared/sale.js";
import {
  bindNumberMasks,
  formatMaskedNumber,
  normalizeMaskedNumber
} from "../ui/number-mask.js";
import { apiFetch, getApiUrl, saveConfiguredApiUrl  } from "../shared/api.js";
import { confirmAction } from "../ui/confirmation-modal.js";

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
  backdrop.className = "classic-modal-backdrop";
  backdrop.innerHTML = `
    <section class="classic-modal" role="dialog" aria-modal="true" aria-labelledby="cancellation-reason-title">
      <div class="classic-panel-header modal-panel-header">
        <span id="cancellation-reason-title">Motivo do cancelamento</span>
        <button class="modal-close-button" data-cancel-reason type="button" aria-label="Cancelar" title="Cancelar">×</button>
      </div>
      <form data-cancellation-reason-form>
        <div class="classic-form-body">
          <label class="form-field">
            <span>Motivo</span>
            <textarea name="reason" minlength="5" maxlength="500" required></textarea>
          </label>
        </div>
        <div class="classic-form-actions">
          <button class="classic-button primary danger" type="submit">Confirmar cancelamento</button>
          <button class="classic-button" data-cancel-reason type="button">Voltar</button>
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
    <div class="classic-modal-backdrop" data-recent-sales-backdrop>
      <section class="classic-modal recent-sales-modal" role="dialog" aria-modal="true" aria-labelledby="recent-sales-title">
        <div class="classic-panel-header modal-panel-header">
          <span id="recent-sales-title">Vendas recentes</span>
          <button class="modal-close-button" data-close-recent-sales type="button" aria-label="Fechar" title="Fechar">×</button>
        </div>
        <div class="classic-form-body">
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
                  <button class="modal-close-button" data-close-payment type="button" aria-label="Fechar" title="Fechar"><i data-lucide="x"></i></button>
                </div>
                <form data-payment-form>
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
                  <button class="primary-button" type="submit" ${
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
      ${
        apiConfigOpen
          ? `
            <div class="classic-modal-backdrop" data-api-config-backdrop>
              <section class="classic-modal api-connection-modal" role="dialog" aria-modal="true" aria-labelledby="api-config-title">
                <div class="classic-panel-header modal-panel-header">
                  <div>
                    <span class="eyebrow">Conexão do terminal</span>
                    <span id="api-config-title">API indisponível</span>
                  </div>
                  <button class="modal-close-button" data-close-api-config type="button" aria-label="Fechar" title="Continuar sem conexão">×</button>
                </div>
                <form data-api-config-form>
                  <div class="classic-form-body">
                    <p class="modal-help-text">Não foi possível conectar ao servidor do PDV. Informe o IP ou nome do computador que executa a API e a porta publicada.</p>
                    <label class="form-field">
                      <span>Endereço da API</span>
                      <input name="apiUrl" type="url" inputmode="url" autocomplete="off" placeholder="http://192.168.0.10:3000" value="${escapeHtml(apiConfigUrl)}" ${apiConfigSaving ? "disabled" : ""} required />
                    </label>
                    ${apiConfigError ? `<p class="error-message">${escapeHtml(apiConfigError)}</p>` : ""}
                  </div>
                  <div class="classic-form-actions">
                    <button class="classic-button primary" type="submit" ${apiConfigSaving ? "disabled" : ""}>${apiConfigSaving ? "Testando..." : "Salvar e testar"}</button>
                    <button class="classic-button" data-close-api-config type="button" ${apiConfigSaving ? "disabled" : ""}>Continuar sem conexão</button>
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
        await Promise.all([fetchCatalog(), fetchPaymentMethods()]);
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
  return root;
}
