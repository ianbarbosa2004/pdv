const numericKeys = new Set(["priceProduct", "stockQuantityProduct"]);

export const sortProductList = (products, sortState) => [...products].sort((left, right) => {
  const comparison = numericKeys.has(sortState.key)
    ? Number(left[sortState.key] || 0) - Number(right[sortState.key] || 0)
    : String(left[sortState.key] ?? "").localeCompare(
        String(right[sortState.key] ?? ""),
        "pt-BR",
        { sensitivity: "base" }
      );
  return sortState.direction === "asc" ? comparison : -comparison;
});

export const filterProductList = (products, searchTerm = "", predicate = () => true) => {
  const query = String(searchTerm ?? "").trim().toLocaleLowerCase("pt-BR");
  return products.filter((product) =>
    predicate(product)
    && (!query || [
      product.skuProduct,
      product.nameProduct,
      product.descriptionGroup,
      product.pdvCodeProduct
    ].some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(query)))
  );
};

export const renderProductList = ({
  products,
  loading,
  error,
  sortState,
  escapeHtml,
  formatMoney,
  emptyLabel = "Nenhum produto cadastrado."
}) => {
  if (loading) return '<p class="classic-empty">Carregando produtos...</p>';
  if (error) return `<p class="error-message">${escapeHtml(error)}</p>`;
  if (!products.length) return `<p class="classic-empty">${emptyLabel}</p>`;

  const columns = [
    ["pdvCodeProduct", "# PDV"],
    ["nameProduct", "Produto"],
    ["descriptionGroup", "Grupo"],
    ["priceProduct", "Preço de venda"],
    ["stockQuantityProduct", "Estoque"]
  ];
  const indicator = (key) =>
    sortState.key === key ? (sortState.direction === "asc" ? "↑" : "↓") : "↕";

  return `<table class="classic-table">
    <thead><tr>
      ${columns.map(([key, label]) => `
        <th aria-sort="${sortState.key === key ? (sortState.direction === "asc" ? "ascending" : "descending") : "none"}">
          <button class="table-sort-button" type="button" data-product-sort="${key}">${label} <span aria-hidden="true">${indicator(key)}</span></button>
        </th>
      `).join("")}
      <th>Exibir no PDV</th><th>Status</th><th class="actions-column">Ações</th>
    </tr></thead>
    <tbody>${products.map((product) => `
      <tr class="${product.isActiveProduct ? "" : "is-inactive"}">
        <td>${escapeHtml(product.pdvCodeProduct || "—")}</td>
        <td>${escapeHtml(product.nameProduct)}</td>
        <td>${escapeHtml(product.descriptionGroup || "Sem grupo")}</td>
        <td>${formatMoney(product.priceProduct)}</td>
        <td>${escapeHtml(product.stockQuantityProduct)}</td>
        <td>
          <button class="status-toggle ${Number(product.showsInPdvProduct) ? "is-active" : "is-inactive"}" type="button" role="switch" aria-checked="${Number(product.showsInPdvProduct) ? "true" : "false"}" data-product-pdv-status="${product.idProduct}" aria-label="Alternar exibição de ${escapeHtml(product.nameProduct)} no PDV">
            <span class="status-toggle-track"><span class="status-toggle-thumb"></span></span>
            <span class="status-toggle-label">${Number(product.showsInPdvProduct) ? "Sim" : "Não"}</span>
          </button>
        </td>
        <td>
          <button class="status-toggle ${product.isActiveProduct ? "is-active" : "is-inactive"}" type="button" role="switch" aria-checked="${product.isActiveProduct ? "true" : "false"}" data-product-status="${product.idProduct}" aria-label="Alternar status do produto ${escapeHtml(product.nameProduct)}">
            <span class="status-toggle-track"><span class="status-toggle-thumb"></span></span>
            <span class="status-toggle-label">${product.isActiveProduct ? "Ativo" : "Inativo"}</span>
          </button>
        </td>
        <td class="actions-column">
          <button class="icon-button edit" type="button" title="Editar produto" aria-label="Editar produto" data-product-edit="${product.idProduct}"><i data-lucide="pencil"></i></button>
          <button class="icon-button delete" type="button" title="Excluir produto definitivamente" aria-label="Excluir produto definitivamente" data-product-delete="${product.idProduct}"><i data-lucide="trash-2"></i></button>
        </td>
      </tr>
    `).join("")}</tbody>
  </table>`;
};

export const bindProductList = (root, handlers) => {
  root.querySelectorAll("[data-product-sort]").forEach((button) => {
    button.addEventListener("click", () => handlers.onSort?.(button.dataset.productSort));
  });
  root.querySelectorAll("[data-product-edit]").forEach((button) => {
    button.addEventListener("click", () => handlers.onEdit?.(Number(button.dataset.productEdit)));
  });
  root.querySelectorAll("[data-product-delete]").forEach((button) => {
    button.addEventListener("click", () => handlers.onDelete?.(Number(button.dataset.productDelete)));
  });
  root.querySelectorAll("[data-product-status]").forEach((button) => {
    button.addEventListener("click", () =>
      handlers.onStatus?.(Number(button.dataset.productStatus), button.getAttribute("aria-checked") !== "true")
    );
  });
  root.querySelectorAll("[data-product-pdv-status]").forEach((button) => {
    button.addEventListener("click", () =>
      handlers.onPdvStatus?.(Number(button.dataset.productPdvStatus), button.getAttribute("aria-checked") !== "true")
    );
  });
};
