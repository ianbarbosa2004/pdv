import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { renderScreenContextBar } from "../ui/screen-context.js";
import { renderNavigationIntro } from "../ui/navigation-intro.js";
import { apiFetch, getApiUrl } from "../shared/api.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const formatDocument = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 14);
  return digits.replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
};

const formatDateTime = (value) => {
  if (value === null || value === undefined || String(value).trim() === "") return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value ?? "") : date.toLocaleString("pt-BR");
};

const formatFiscalHeaderValue = (value) => {
  const text = String(value ?? "").trim();
  return text || "Não informado";
};

const renderFiscalEntryHeader = (entry) => {
  const fields = [
    ["Modelo", Number(entry.modelFiscalDocument) === 65 ? "NFC-e" : Number(entry.modelFiscalDocument) === 55 ? "NF-e" : entry.modelFiscalDocument],
    ["Série", entry.seriesFiscalDocument],
    ["Número", entry.numberFiscalDocument],
    ["CNPJ", formatDocument(entry.issuerDocumentFiscalDocument)],
    ["Razão Social", entry.issuerLegalNameFiscalDocument],
    ["Nome Fantasia", entry.issuerTradeNameFiscalDocument],
    ["Inscrição Estadual", entry.issuerStateRegistrationFiscalDocument],
    ["Data da Emissão", formatDateTime(entry.issuedAtFiscalDocument)],
    ["Endereço", entry.issuerAddressFiscalDocument && entry.issuerAddressNumberFiscalDocument
      ? `${entry.issuerAddressFiscalDocument}, ${entry.issuerAddressNumberFiscalDocument}`
      : entry.issuerAddressFiscalDocument],
    ["Bairro", entry.issuerNeighborhoodFiscalDocument],
    ["CEP", entry.issuerZipCodeFiscalDocument],
    ["Município", entry.issuerCityFiscalDocument && entry.issuerStateFiscalDocument
      ? `${entry.issuerCityFiscalDocument}, ${entry.issuerStateFiscalDocument}`
      : entry.issuerCityFiscalDocument]
  ];
  return `<div class="fiscal-entry-header-grid">${fields.map(([label, value]) => `
    <div class="fiscal-entry-header-field">
      <span class="fiscal-entry-header-label">${escapeHtml(label)}</span>
      <strong>${escapeHtml(formatFiscalHeaderValue(value))}</strong>
    </div>`).join("")}
    <div class="fiscal-entry-header-field fiscal-entry-header-access-key">
      <span class="fiscal-entry-header-label">Chave de Acesso</span>
      <strong><button class="fiscal-access-key-button" type="button" data-test-copy-access-key title="Copiar chave de acesso">${escapeHtml(formatFiscalHeaderValue(entry.accessKeyFiscalDocument))}</button></strong>
    </div>
  </div>`;
};

export function createFiscalEntryDesignScreen({ onBack, ...handlers }) {
  const root = document.createElement("main");
  let feedback = "";
  let searchTerm = "";
  let fiscalEntries = [];
  let currentEntry = null;
  let entriesLoading = true;
  let entriesError = "";
  let entryLoading = false;

  const renderRecipeForm = () => {
    return `
    <form class="classic-form-panel recipe-editor-panel fiscal-entry-test-recipe-panel">
      <div class="classic-panel-header">Nova Receita ou Composição</div>
      <div class="classic-form-body">
        ${currentEntry?.fiscalEntry ? renderFiscalEntryHeader(currentEntry.fiscalEntry) : '<div class="classic-empty">Selecione uma pré-entrada na listagem.</div>'}
        <div class="recipe-components-divider" aria-hidden="true"></div>
        <div class="recipe-component-entry">
          <div class="recipe-component-picker-row">
            <div class="form-field recipe-component-picker classic-combobox">
              <span>Produtos</span>
              <button type="button" class="classic-select-trigger">${escapeHtml(currentEntry?.items?.[0]?.descriptionFiscalDocumentItem || "Selecione um produto")}</button>
            </div>
            <label class="form-field"><span>Conversão</span><input maxlength="255" value="${escapeHtml(currentEntry?.items?.[0]?.conversionFactor || "")}" placeholder="Informe a conversão" /></label>
          </div>
          <div class="recipe-component-input-grid">
            <label class="form-field"><span>Quantidade</span><input inputmode="decimal" value="${escapeHtml(currentEntry?.items?.[0]?.quantityFiscalDocumentItem || "")}" placeholder="0,000" /></label>
            <label class="form-field"><span>Unidade Fiscal</span><select><option>${escapeHtml(currentEntry?.items?.[0]?.fiscalUnitFiscalDocumentItem || "Selecione")}</option><option>UN</option><option>KG</option><option>L</option></select></label>
            <label class="form-field"><span>Preço Unitário (aplicar conversão)</span><input inputmode="decimal" value="${escapeHtml(currentEntry?.items?.[0]?.unitPriceFiscalDocumentItem || "")}" placeholder="0,00" /></label>
            <label class="form-field"><span>Preço Total</span><input inputmode="decimal" value="${escapeHtml(currentEntry?.items?.[0]?.totalFiscalDocumentItem || "")}" placeholder="0,00" /></label>
          </div>
          <button class="classic-button" type="button">Adicionar componente</button>
        </div>
        <div class="classic-panel-header nested-panel-header">Componentes</div>
        <div class="recipe-component-list">
          <div class="recipe-components-table-wrapper">
            <table class="classic-table recipe-components-table">
              <thead><tr><th class="component-index-column">#</th><th class="component-name-column">Produtos</th><th class="component-quantity-column">Quantidade</th><th class="component-unit-column">Unidade Fiscal</th><th class="component-loss-column">Preço Unitário</th><th class="component-cost-column">Preço Total</th><th class="actions-column component-actions-column">Ações</th></tr></thead>
              <tbody>${(currentEntry?.items || []).map((item, index) => `<tr><td class="component-index-column">${index + 1}</td><td class="component-name-column">${escapeHtml(item.descriptionFiscalDocumentItem || "Produto fiscal")}</td><td class="component-quantity-column">${escapeHtml(item.quantityFiscalDocumentItem ?? "0")}</td><td class="component-unit-column">${escapeHtml(item.fiscalUnitFiscalDocumentItem || "—")}</td><td class="component-loss-column">${escapeHtml(item.unitPriceFiscalDocumentItem ?? "0,00")}</td><td class="component-cost-column">${escapeHtml(item.totalFiscalDocumentItem ?? "0,00")}</td><td class="actions-column component-actions-column">—</td></tr>`).join("") || '<tr><td colspan="7" class="classic-empty">Nenhum item retornado.</td></tr>'}</tbody>
              <tfoot><tr><th colspan="6">Custo total estimado</th><th>0,00</th></tr><tr><th colspan="6">Custo por unidade</th><th>0,00</th></tr></tfoot>
            </table>
          </div>
        </div>
        ${feedback ? `<p class="fiscal-entry-design-feedback" role="status">${escapeHtml(feedback)}</p>` : ""}
      </div>
      <div class="classic-form-actions"><button class="classic-button primary" type="button" data-test-save>Salvar</button><button class="classic-button" type="button" data-test-clear>Limpar</button></div>
    </form>`;
  };

  const renderQueue = () => `
    <section class="classic-grid-panel fiscal-entry-list-panel fiscal-entry-test-queue-panel">
      <div class="classic-panel-header fiscal-entry-list-header">
        <div class="fiscal-entry-list-header-top"><span>Documentos na Fila</span><input class="classic-list-search" data-test-search type="search" placeholder="Pesquisar..." aria-label="Pesquisar documentos na fila" value="${escapeHtml(searchTerm)}" /></div>
      </div>
      <div class="classic-grid-wrapper">
        <table class="classic-table">
          <thead><tr><th>Tipo</th><th>Doc</th><th class="supplier-column product-name-column">Fornecedor</th><th>Emissão</th><th class="value-column">Valor</th><th>Status</th><th class="actions-column">Ações</th></tr></thead>
          <tbody>${fiscalEntries.filter((entry) => {
            const search = searchTerm.trim().toLocaleLowerCase("pt-BR");
            return !search || [
              Number(entry.modelFiscalDocument) === 65 ? "NFC-e" : "NF-e",
              entry.numberFiscalDocument ? `${entry.seriesFiscalDocument || ""}/${entry.numberFiscalDocument}` : "",
              entry.issuerLegalNameFiscalDocument,
              entry.issuedAtFiscalDocument,
              entry.totalFiscalDocument
            ].join(" ").toLocaleLowerCase("pt-BR").includes(search);
          }).map((entry) => `
            <tr>
              <td>${Number(entry.modelFiscalDocument) === 65 ? "NFC-e" : "NF-e"}</td>
              <td>${escapeHtml(entry.seriesFiscalDocument ? `${entry.seriesFiscalDocument}/${entry.numberFiscalDocument}` : entry.numberFiscalDocument || "Documento fiscal")}</td>
              <td class="supplier-column product-name-column">${escapeHtml(entry.issuerLegalNameFiscalDocument || "Não informado")}</td>
              <td>${escapeHtml(entry.issuedAtFiscalDocument || "")}</td>
              <td class="value-column">${escapeHtml(entry.totalFiscalDocument ?? "0,00")}</td>
              <td><span class="fiscal-entry-status fiscal-entry-status-${escapeHtml(entry.statusFiscalEntry || "open")}">${escapeHtml(entry.statusFiscalEntry || "Em Aberto")}</span></td>
              <td class="actions-column"><button class="icon-button" type="button" data-test-open-entry="${entry.idFiscalEntry}" aria-label="Continuar revisão" title="Continuar revisão"><i data-lucide="arrow-right-circle"></i></button></td>
            </tr>`).join("")}</tbody>
        </table>
      </div>
      ${entriesError ? `<p class="payment-error">${escapeHtml(entriesError)}</p>` : entriesLoading ? '<p class="classic-empty">Carregando documentos...</p>' : ""}
    </section>`;

  const loadEntries = async () => {
    entriesLoading = true;
    entriesError = "";
    render();
    try {
      const response = await apiFetch(`${getApiUrl()}/api/stock/fiscal-entries?includeCompleted=1`);
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.fiscalEntries)) {
        throw new Error(result.error || "Não foi possível carregar os documentos na fila.");
      }
      fiscalEntries = result.fiscalEntries;
    } catch (error) {
      entriesError = error instanceof Error ? error.message : "Falha ao carregar os documentos na fila.";
    } finally {
      entriesLoading = false;
      render();
    }
  };

  const openEntry = async (idFiscalEntry) => {
    entryLoading = true;
    feedback = "";
    render();
    try {
      const response = await apiFetch(`${getApiUrl()}/api/stock/fiscal-entries/${idFiscalEntry}`);
      const result = await response.json();
      if (!response.ok || !result.fiscalEntry) {
        throw new Error(result.error || "Não foi possível carregar a pré-entrada.");
      }
      currentEntry = result;
    } catch (error) {
      feedback = error instanceof Error ? error.message : "Falha ao carregar a pré-entrada.";
    } finally {
      entryLoading = false;
      render();
    }
  };

  const render = () => {
    root.className = "catalog-screen fiscal-entry-test-screen";
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - Entrada de NF-e / NFC-e (Teste)</strong><span>Operador: Operador</span></header>
      ${renderMainMenu()}
      ${renderScreenContextBar("Entrada de NF-e / NFC-e (Teste)")}
      <section class="classic-content fiscal-entry-test-content">
        ${renderNavigationIntro("fiscal-entry-design", "Entrada de NF-e / NFC-e (Teste)", "Cópia visual do formulário de receita e da listagem de documentos em aberto.")}
        <div class="fiscal-entry-test-layout">
          ${renderRecipeForm()}
          ${renderQueue()}
        </div>
      </section>`;
    renderLucideIcons(root);
    bindMainMenu(root, handlers);
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    root.querySelector("[data-test-search]")?.addEventListener("input", (event) => {
      searchTerm = event.currentTarget.value;
      render();
      root.querySelector("[data-test-search]")?.focus();
    });
    root.querySelector("[data-test-clear]")?.addEventListener("click", () => {
      feedback = "Formulário limpo apenas visualmente.";
      render();
    });
    root.querySelector("[data-test-save]")?.addEventListener("click", () => {
      feedback = "Receita salva apenas na tela. Nenhum dado foi enviado à API.";
      render();
    });
    root.querySelector("[data-test-copy-access-key]")?.addEventListener("click", () => {
      feedback = "Chave de acesso selecionada para cópia.";
      render();
    });
    root.querySelectorAll("[data-test-open-entry]").forEach((button) => {
      button.addEventListener("click", () => {
        void openEntry(button.dataset.testOpenEntry);
      });
    });
  };

  render();
  void loadEntries();
  return root;
}
