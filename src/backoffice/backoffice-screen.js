export function createBackofficeScreen({ onBack, onClasses, onGroups, onProducts, onFiscalOperations }) {
  const root = document.createElement("main");

  root.className = "catalog-screen";
  root.innerHTML = `
    <header class="classic-titlebar">
      <strong>PDV - Retaguarda</strong>
      <span>Operador: Operador</span>
    </header>
    <nav class="classic-menubar" aria-label="Menu principal">
      <button type="button">Arquivo</button>
      <details class="classic-menu-dropdown">
        <summary>Cadastros</summary>
        <div class="classic-menu-panel">
          <button type="button" data-classes>Classes</button>
          <button type="button" data-groups>Grupos</button>
          <button type="button" data-products>Produtos</button><button type="button" data-fiscal-operations>Operações fiscais</button>
        </div>
      </details>
      <button type="button">Estoque</button>
      <button type="button">Vendas</button>
      <button type="button">Relatórios</button>
      <button type="button">Configurações</button>
    </nav>
    <div class="classic-toolbar">
      <button class="classic-tool-button" data-back type="button">← Frente de caixa</button>
      <strong>Início da retaguarda</strong>
    </div>
    <section class="backoffice-home">
      <div class="backoffice-home-heading">
        <p class="eyebrow">Administração</p>
        <h1>Retaguarda</h1>
        <p>Selecione uma área para gerenciar os cadastros do PDV.</p>
      </div>
      <div class="backoffice-shortcuts">
        <button class="backoffice-shortcut" data-classes type="button">
          <strong>Classes</strong>
          <span>Organize as classes de produtos.</span>
        </button>
        <button class="backoffice-shortcut" data-groups type="button">
          <strong>Grupos</strong>
          <span>Gerencie os grupos vinculados às classes.</span>
        </button>
        <button class="backoffice-shortcut" data-products type="button">
          <strong>Produtos</strong>
          <span>Cadastre e mantenha o catálogo.</span>
        </button>
        <button class="backoffice-shortcut" data-fiscal-operations type="button">
          <strong>Operações fiscais</strong>
          <span>Cadastre CFOP, CST, PIS, COFINS, ICMS e regras fiscais.</span>
        </button>
      </div>
    </section>
  `;

  root.querySelector("[data-back]")?.addEventListener("click", onBack);
  root.querySelectorAll("[data-classes]").forEach((button) =>
    button.addEventListener("click", onClasses)
  );
  root.querySelectorAll("[data-groups]").forEach((button) =>
    button.addEventListener("click", onGroups)
  );
  root.querySelectorAll("[data-products]").forEach((button) =>
    button.addEventListener("click", onProducts)
  );
  root.querySelectorAll("[data-fiscal-operations]").forEach((button) =>
    button.addEventListener("click", onFiscalOperations)
  );

  return root;
}
