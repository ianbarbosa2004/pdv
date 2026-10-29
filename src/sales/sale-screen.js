import { calculateSaleTotals } from "../shared/sale.js";
import {
  bindNumberMasks,
  formatMaskedNumber,
  normalizeMaskedNumber
} from "../ui/number-mask.js";
import { getApiUrl, saveConfiguredApiUrl } from "../shared/api.js";

const formatCurrency = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);

const loadProducts = async () => {
  const response = await fetch(`${getApiUrl()}/api/products`);
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

export function createSaleScreen({ onBackoffice, initialApiError = false, onApiConfigured } = {}) {
  const root = document.createElement("main");
  let products = [];
  let paymentMethods = [];
  const cart = [];
  let activeGroup = "Todos";
  let searchTerm = "";
  let loading = true;
  let loadError = "";
  let paymentLoading = true;
  let paymentError = "";
  let paymentOpen = false;
  let idPaymentMethod = "";
  let paymentAmount = "";
  let submittingPayment = false;
  let apiConfigOpen = initialApiError;
  let apiConfigSaving = false;
  let apiConfigError = "";
  let apiConfigUrl = getApiUrl();

  const render = () => {
    const groups = ["Todos", ...new Set(products.map(({ group }) => group))];
    const visibleProducts = products.filter((product) => {
      const matchesGroup =
        activeGroup === "Todos" || product.group === activeGroup;
      const matchesSearch = product.name
        .toLocaleLowerCase("pt-BR")
        .includes(searchTerm.toLocaleLowerCase("pt-BR"));
      return matchesGroup && matchesSearch;
    });
    const { itemCount, total } = calculateSaleTotals(cart);

    root.className = "sale-screen";
    root.innerHTML = `
      <header class="topbar">
        <div>
          <p class="eyebrow">Operação</p>
          <h1>Frente de caixa</h1>
        </div>
        <div class="cash-status">
          <span class="status-dot"></span>
          <span>Caixa aberto</span>
          <strong>Operador</strong>
          <button class="secondary-button" data-backoffice type="button">Retaguarda</button>
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
                data-search
                type="search"
                placeholder="Buscar produto"
                value="${escapeHtml(searchTerm)}"
                aria-label="Buscar produto"
              />
            </label>
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
            ${
              loading
                ? '<p class="empty-state">Carregando produtos...</p>'
                : loadError
                  ? `<div class="empty-state error-state"><strong>Não foi possível carregar o catálogo.</strong><span>${escapeHtml(loadError)}</span><button class="secondary-button" data-retry type="button">Tentar novamente</button></div>`
                  : visibleProducts.length
                ? visibleProducts
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
                    .join("")
                : '<p class="empty-state">Nenhum produto encontrado.</p>'
            }
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

          <div class="sale-summary">
            <div><span>Itens</span><strong>${itemCount}</strong></div>
            <div><span>Subtotal</span><strong>${formatCurrency(total)}</strong></div>
            <div class="sale-total"><span>Total</span><strong>${formatCurrency(total)}</strong></div>
          </div>
          <button class="primary-button" data-payment type="button" ${
            cart.length ? "" : "disabled"
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

  const bindEvents = () => {
    root.querySelectorAll("[data-product]").forEach((button) => {
      button.addEventListener("click", () => addProduct(button.dataset.product));
    });
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
    });
    root.querySelector("[data-payment-amount]")?.addEventListener("input", (event) => {
      paymentAmount = event.target.value;
    });
    root.querySelector("[data-payment-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitPayment();
    });
    root.querySelector("[data-retry]")?.addEventListener("click", () => {
      void fetchCatalog();
    });
    root.querySelector("[data-backoffice]")?.addEventListener("click", () => onBackoffice?.());
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
      render();
      const input = root.querySelector("[data-search]");
      input?.focus();
      input?.setSelectionRange(searchTerm.length, searchTerm.length);
    });
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
      const response = await fetch(`${getApiUrl()}/api/payment-methods`);
      if (!response.ok) {
        throw new Error(`Falha ao carregar formas de pagamento (${response.status}).`);
      }
      const payload = await response.json();
      if (!Array.isArray(payload.paymentMethods)) {
        throw new Error("A API retornou formas de pagamento inválidas.");
      }
      paymentMethods = payload.paymentMethods;
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
      const response = await fetch(`${getApiUrl()}/api/sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientIdSale: crypto.randomUUID(),
          items: cart.map(({ id, quantity }) => ({
            idProduct: Number(id),
            quantitySaleItem: quantity
          })),
          payments: [{ idPaymentMethod: Number(idPaymentMethod), amountSalePayment: amount.toFixed(2) }],
          discountSale: "0.00"
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível registrar a venda.");
      }
      cart.splice(0, cart.length);
      paymentOpen = false;
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
  return root;
}
