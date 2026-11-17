import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { renderLucideIcons } from "../ui/icons.js";
import { apiFetch, getApiUrl } from "../shared/api.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const formatQuantity = (value) => Number(value || 0).toLocaleString("pt-BR", {
  maximumFractionDigits: 4
});

export function createInventoryScreen({ onBack, ...menuActions }) {
  const root = document.createElement("main");
  let products = [];
  let movements = [];
  const countedByProduct = new Map();
  let search = "";
  let reason = "";
  let loading = true;
  let submitting = false;
  let error = "";
  let message = "";

  const load = async () => {
    loading = true;
    render();
    try {
      const [productsResponse, movementsResponse] = await Promise.all([
        apiFetch(`${getApiUrl()}/api/products?includeInactive=1`),
        apiFetch(`${getApiUrl()}/api/stock/inventory/movements?type=inventory`)
      ]);
      const productsResult = await productsResponse.json();
      const movementsResult = await movementsResponse.json();
      if (!productsResponse.ok) throw new Error(productsResult.error || "Não foi possível carregar os produtos.");
      if (!movementsResponse.ok) throw new Error(movementsResult.error || "Não foi possível carregar o histórico.");
      products = (productsResult.products || []).filter((product) =>
        Number(product.isActiveProduct) === 1 && Number(product.controlsStockProduct) === 1
      );
      products.forEach((product) => {
        if (!countedByProduct.has(String(product.idProduct))) {
          countedByProduct.set(String(product.idProduct), String(product.stockQuantityProduct ?? 0));
        }
      });
      movements = movementsResult.movements || [];
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Não foi possível carregar o inventário.";
    } finally {
      loading = false;
      render();
    }
  };

  const render = () => {
    const filteredProducts = products.filter((product) =>
      `${product.nameProduct} ${product.skuProduct} ${product.pdvCodeProduct}`
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR"))
    );
    root.innerHTML = `
      ${renderMainMenu(menuActions)}
      <section class="screen-shell">
        <div class="screen-header">
          <div><p class="eyebrow">Estoque</p><h1>Inventário</h1><p class="screen-subtitle">Conte quantidades físicas a qualquer momento. O inventário ajusta somente o saldo e mantém o histórico.</p></div>
          <button class="classic-button" data-back type="button">Voltar</button>
        </div>
        ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}
        ${message ? `<p class="success-feedback">${escapeHtml(message)}</p>` : ""}
        <div class="inventory-layout">
          <section class="classic-grid-panel">
            <div class="classic-panel-header">Contagem física</div>
            <div class="classic-form-body">
              <label class="form-field"><span>Motivo</span><input data-reason maxlength="500" value="${escapeHtml(reason)}" placeholder="Ex.: conferência mensal" /></label>
              <input data-search type="search" value="${escapeHtml(search)}" placeholder="Pesquisar produto..." aria-label="Pesquisar produto" />
            </div>
            <div class="classic-grid-wrapper"><table class="classic-table">
              <thead><tr><th>Produto</th><th>Saldo sistema</th><th>Quantidade contada</th><th>Diferença</th></tr></thead>
              <tbody>${loading ? '<tr><td colspan="4">Carregando...</td></tr>' : filteredProducts.map((product) => `
                <tr>
                  <td>${escapeHtml(product.nameProduct)}</td>
                  <td>${formatQuantity(product.stockQuantityProduct)}</td>
                  <td><input data-counted="${product.idProduct}" type="number" min="0" step="0.0001" value="${escapeHtml(countedByProduct.get(String(product.idProduct)))}" aria-label="Quantidade contada de ${escapeHtml(product.nameProduct)}" /></td>
                  <td data-difference="${product.idProduct}">${formatQuantity(Number(countedByProduct.get(String(product.idProduct))) - Number(product.stockQuantityProduct || 0))}</td>
                </tr>`).join("") || '<tr><td colspan="4">Nenhum produto encontrado.</td></tr>'}</tbody>
            </table></div>
            <div class="classic-form-actions"><button class="classic-button primary" data-submit type="button" ${loading || submitting ? "disabled" : ""}>${submitting ? "Registrando..." : "Confirmar inventário"}</button></div>
          </section>
          <section class="classic-grid-panel">
            <div class="classic-panel-header">Histórico de inventários</div>
            <div class="classic-grid-wrapper"><table class="classic-table">
              <thead><tr><th>Produto</th><th>Anterior</th><th>Contado</th><th>Diferença</th><th>Data</th></tr></thead>
              <tbody>${movements.map((movement) => `<tr><td>${escapeHtml(movement.nameProduct)}</td><td>${formatQuantity(movement.previousStockInventoryMovement)}</td><td>${formatQuantity(movement.nextStockInventoryMovement)}</td><td>${formatQuantity(movement.quantityDeltaInventoryMovement)}</td><td>${escapeHtml(movement.createdAtInventoryMovement)}</td></tr>`).join("") || '<tr><td colspan="5">Nenhum inventário registrado.</td></tr>'}</tbody>
            </table></div>
          </section>
        </div>
      </section>
    `;
    bindMainMenu(root, menuActions);
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    root.querySelector("[data-reason]")?.addEventListener("input", (event) => {
      reason = event.currentTarget.value;
    });
    root.querySelector("[data-search]")?.addEventListener("input", (event) => {
      search = event.currentTarget.value;
      render();
    });
    root.querySelectorAll("[data-counted]").forEach((input) => {
      input.addEventListener("input", () => {
        countedByProduct.set(input.dataset.counted, input.value);
        const product = products.find((candidate) => Number(candidate.idProduct) === Number(input.dataset.counted));
        const difference = Number(input.value || 0) - Number(product?.stockQuantityProduct || 0);
        const target = root.querySelector(`[data-difference="${input.dataset.counted}"]`);
        if (target) target.textContent = formatQuantity(difference);
      });
    });
    root.querySelector("[data-submit]")?.addEventListener("click", submit);
  };

  const submit = async () => {
    if (submitting) return;
    const items = [...root.querySelectorAll("[data-counted]")].map((input) => ({
      idProduct: Number(input.dataset.counted),
      countedQuantity: input.value
    }));
    if (!reason.trim()) {
      error = "Informe o motivo do inventário.";
      render();
      return;
    }
    submitting = true;
    error = "";
    render();
    try {
      const response = await apiFetch(`${getApiUrl()}/api/stock/inventory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, items })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível registrar o inventário.");
      message = `Inventário registrado com ${result.itemCount} produto(s).`;
      await load();
    } catch (submitError) {
      error = submitError instanceof Error ? submitError.message : "Falha ao registrar o inventário.";
    } finally {
      submitting = false;
      render();
    }
  };

  void load();
  return root;
}
