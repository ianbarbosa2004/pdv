export const renderMainMenu = () => `
  <nav class="classic-menubar" aria-label="Menu principal">
    <button type="button">Arquivo</button>
    <details class="classic-menu-dropdown">
      <summary>Cadastros</summary>
      <div class="classic-menu-panel">
        <button type="button" data-main-menu="products">Produtos</button>
        <button type="button" data-main-menu="fiscal-operations">Operações Fiscais</button>
        <button type="button" data-main-menu="financial">Financeiros</button>
      </div>
    </details>
    <button type="button">Estoque</button>
    <button type="button">Vendas</button>
    <button type="button">Relatórios</button>
    <details class="classic-menu-dropdown">
      <summary>Ferramentas</summary>
      <div class="classic-menu-panel">
        <button type="button" data-main-menu="thermal-print">Impressão térmica</button>
        <button type="button" data-main-menu="ncm-cest-update">Atualizar NCM / CEST</button>
      </div>
    </details>
    <details class="classic-menu-dropdown">
      <summary>Configurações</summary>
      <div class="classic-menu-panel">
        <button type="button" data-main-menu="settings">Impressoras</button>
        <button type="button" data-main-menu="company">Dados da Empresa</button>
        <button type="button" data-main-menu="nfce">NFC-e</button>
      </div>
    </details>
  </nav>
`;

export const bindMainMenu = (root, handlers) => {
  root.querySelectorAll("[data-main-menu]").forEach((button) => {
    button.addEventListener("click", () => handlers[button.dataset.mainMenu]?.());
  });

  root.querySelectorAll(".classic-menu-dropdown").forEach((menu) => {
    menu.addEventListener("pointerenter", () => {
      root.querySelectorAll(".classic-menu-dropdown[open]").forEach((openMenu) => {
        if (openMenu !== menu) openMenu.removeAttribute("open");
      });
      menu.setAttribute("open", "");
    });
    menu.addEventListener("pointerleave", () => menu.removeAttribute("open"));
  });
};
