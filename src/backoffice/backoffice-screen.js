import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";

export function createBackofficeScreen({ onBack, onClasses, onGroups, onProducts, onFiscalOperations, onThermalPrint, onNcmCestUpdate, onSettings }) {
  const root = document.createElement("main");

  root.className = "catalog-screen";
  root.innerHTML = `
    <header class="classic-titlebar">
      <strong>PDV - Retaguarda</strong>
      <span>Operador: Operador</span>
    </header>
    ${renderMainMenu()}
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
        <button class="backoffice-shortcut" data-thermal-print type="button">
          <strong>Impressão térmica</strong>
          <span>Teste caracteres, tamanhos e alinhamento em papel de 80 mm.</span>
        </button>
        <button class="backoffice-shortcut" data-settings type="button">
          <strong>Impressoras</strong>
          <span>Selecione as impressoras padrão de cupons e relatórios.</span>
        </button>
      </div>
    </section>
  `;

  bindMainMenu(root, {
    products: onProducts,
    "fiscal-operations": onFiscalOperations,
    "thermal-print": onThermalPrint,
    "ncm-cest-update": onNcmCestUpdate,
    settings: onSettings
  });
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
  root.querySelectorAll("[data-thermal-print]").forEach((button) =>
    button.addEventListener("click", onThermalPrint)
  );
  root.querySelectorAll("[data-settings]").forEach((button) =>
    button.addEventListener("click", onSettings)
  );

  return root;
}
