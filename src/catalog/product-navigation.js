const productNavigation = [
  ["products", "Produtos"],
  ["classes", "Classes"],
  ["groups", "Grupos"],
  ["ncm-cest", "NCM / CEST"]
];

export const renderProductNavigation = (active) => `
  <div class="classic-toolbar">
    <button class="classic-tool-button" data-product-nav="back" type="button">← Frente de caixa</button>
    ${productNavigation
      .map(([key, label]) => `<button class="classic-tool-button ${active === key ? "is-active" : ""}" data-product-nav="${key}" type="button">${label}</button>`)
      .join("")}
  </div>
`;

export const bindProductNavigation = (root, handlers) => {
  root.querySelectorAll("[data-product-nav]").forEach((button) => {
    button.addEventListener("click", () => handlers[button.dataset.productNav]?.());
  });
};
