import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { renderNavigationIntro } from "../ui/navigation-intro.js";
import { clearRenderedFeedback, createFeedbackTimer, renderSuccessFeedback } from "../ui/feedback.js";
import { apiFetch, getApiUrl } from "../shared/api.js";
import { getScreenContextLabel } from "../ui/screen-context.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const csvHeaders = [
  "skuProduct", "pdvCodeProduct", "nameProduct", "descriptionGroup",
  "descriptionFiscalOperation", "descriptionProductType", "descriptionPhysicalState", "codeUnit",
  "ncmProduct", "cestProduct", "priceProduct", "costPriceProduct", "stockQuantityProduct",
  "controlsStockProduct", "isFractionalProduct", "printsPlace",
  "showsInPdvProduct", "isActiveProduct"
];

const csvHeaderLabels = [
  "SKU", "Código PDV", "Nome", "Grupo",
  "Operação fiscal de venda", "Tipo de produto", "Estado Físico", "Unidade",
  "NCM", "CEST", "Preço de venda", "Preço de custo", "Estoque",
  "Controla estoque", "Produto fracionado", "Local de impressão", "Exibe no PDV",
  "Status"
];

export const csvExample = [
  csvHeaderLabels.join(";"),
  "PROD-001;789000000001;Café torrado;Mercearia;;;;;0201.30.00;0603.10.00;19,90;12,50;10;sim;não;NÃO IMPRIMIR;sim;ATIVO"
].join("\r\n");

export const canImportCatalogRows = ({ rows, validationPassed, loading }) =>
  !loading && validationPassed && rows.length > 0;

export const csvValueReference = [
  ["SKU", "Obrigatório e único; texto livre, até 64 caracteres. Não há prefixo obrigatório."],
  ["Código PDV", "Opcional; texto livre, até 64 caracteres. Deve ser único quando informado."],
  ["Nome", "Obrigatório; texto livre, até 180 caracteres."],
  ["Grupo", "Obrigatório; use exatamente a descrição do grupo na referência de Grupos."],
  ["Operação fiscal de venda", "Opcional; aceite a descrição da operação fiscal de saída ativa ou o CFOP correspondente, conforme a referência."],
  ["Tipo de produto", "Opcional; aceite a descrição do tipo de produto ativo ou o Código SPED correspondente, conforme a referência."],
  ["Estado Físico", "Obrigatório para matéria-prima; aceite o ID, nome, código ou descrição do estado físico ativo conforme a referência."],
  ["Unidade", "Opcional; aceite o código ou a descrição de uma unidade tributável ativa, conforme a referência."],
  ["NCM", "Opcional; 8 dígitos. Pontuação pode ser usada, pois será removida na validação."],
  ["CEST", "Opcional; 7 dígitos. Pontuação pode ser usada, pois será removida na validação."],
  ["Preço de venda", "Obrigatório para produtos de venda; número não negativo com até 2 casas decimais. Aceita vírgula ou ponto."],
  ["Preço de custo", "Opcional; número não negativo com até 2 casas decimais. Aceita vírgula ou ponto. Padrão: 0."],
  ["Estoque", "Opcional; inteiro ou número com até 3 casas decimais quando o produto for fracionado. Aceita vírgula ou ponto. Padrão: 0."],
  ["Controla estoque", "Opcional; verdadeiro: sim, s, true, 1, yes ou y. Falso: não, nao, n, false, 0 ou no. Padrão: sim."],
  ["Produto fracionado", "Opcional; verdadeiro: sim, s, true, 1, yes ou y. Falso: não, nao, n, false, 0 ou no. Padrão: não."],
  ["Local de impressão", "Opcional; use exatamente NÃO IMPRIMIR, BAR, COPA ou COZINHA. Padrão: NÃO IMPRIMIR."],
  ["Status", "Opcional; use ATIVO ou INATIVO (também aceita 1/0, sim/não). Padrão: ATIVO."],
  ["Exibe no PDV", "Opcional; verdadeiro: sim, s, true, 1, yes ou y. Falso: não, nao, n, false, 0 ou no. Padrão: sim."]
];

const markdownCell = (value) => String(value ?? "-").replaceAll("|", "\\|").replace(/\r?\n/g, " ");

const buildReferenceMarkdown = ({
  title, intro, field, fieldLabel, columns, rows
}) => [
  `# ${title}`,
  "",
  intro,
  "",
  `## Campo do CSV`,
  "",
  `- Coluna: \`${field}\``,
  `- Preenchimento: ${fieldLabel}`,
  "",
  "Use o valor da coluna **Valor para o CSV** exatamente como está listado.",
  "",
  `## Valores cadastrados (${rows.length})`,
  "",
  `| ${columns.join(" | ")} |`,
  `| ${columns.map(() => "---").join(" | ")} |`,
  ...rows.map((row) => `| ${row.map(markdownCell).join(" | ")} |`),
  ""
].join("\n");

const parseCsv = (text) => {
  const delimiter = (text.split(/\r?\n/, 1)[0].match(/;/g) || []).length
    >= (text.split(/\r?\n/, 1)[0].match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  const source = String(text).replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        value += character;
        index += 1;
      }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\n" && (value || row.length)) {
        row.push(value);
        rows.push(row);
        row = [];
        value = "";
      }
    } else {
      value += character;
    }
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  if (rows.length < 2) throw new Error("O arquivo não possui linhas de produtos.");
  const headers = rows.shift().map((header) => header.trim());
  const headerKeys = headers.join("|") === csvHeaderLabels.join("|")
    ? csvHeaders
    : headers;
  if (headerKeys.join("|") !== csvHeaders.join("|")) {
    throw new Error(`Cabeçalho inválido. Baixe o modelo CSV para usar as colunas corretas.`);
  }
  return rows.filter((item) => item.some((cell) => cell.trim())).map((item, index) => {
    const record = Object.fromEntries(csvHeaders.map((header, column) => [header, String(item[column] ?? "").trim()]));
    if (!record.skuProduct || !record.nameProduct || !record.descriptionGroup
      || (!record.priceProduct && !record.costPriceProduct)) {
      throw new Error(`Linha ${index + 2}: SKU, nome, grupo e preço são obrigatórios.`);
    }
    return record;
  });
};

export function createCatalogImportScreen({
  onBack, onTools, onProducts, onThermalPrint, onSettings, onCompany, onNfce, onFinancial, onPaymentMethods
}) {
  const root = document.createElement("main");
  let selectedFile = null;
  let rows = [];
  let validationPassed = false;
  let error = "";
  let message = "";
  let loading = false;
  let testing = false;
  let referenceLoading = true;
  let referenceError = "";
  let references = {
    groups: [],
    fiscalOperations: [],
    productTypes: [],
    physicalStates: [],
    units: []
  };
  const scheduleMessageClear = createFeedbackTimer();

  const loadReferences = async () => {
    referenceLoading = true;
    referenceError = "";
    render();
    try {
      const responses = await Promise.all([
        apiFetch(`${getApiUrl()}/api/groups`),
        apiFetch(`${getApiUrl()}/api/fiscal-operations`),
        apiFetch(`${getApiUrl()}/api/product-types`),
        apiFetch(`${getApiUrl()}/api/physical-states`),
        apiFetch(`${getApiUrl()}/api/units`)
      ]);
      const payloads = await Promise.all(responses.map((response) => response.json()));
      const [groupsPayload, fiscalPayload, productTypesPayload, physicalStatesPayload, unitsPayload] = payloads;
      if (responses.some((response) => !response.ok)
        || !Array.isArray(groupsPayload.groups)
        || !Array.isArray(fiscalPayload.fiscalOperations)
        || !Array.isArray(productTypesPayload.productTypes)
        || !Array.isArray(physicalStatesPayload.physicalStates)
        || !Array.isArray(unitsPayload.units)) {
        throw new Error("Não foi possível carregar as listas auxiliares para o CSV.");
      }
      references = {
        groups: groupsPayload.groups,
        fiscalOperations: fiscalPayload.fiscalOperations,
        productTypes: productTypesPayload.productTypes,
        physicalStates: physicalStatesPayload.physicalStates,
        units: unitsPayload.units
      };
    } catch (loadError) {
      referenceError = loadError instanceof Error
        ? loadError.message
        : "Não foi possível carregar as listas auxiliares para o CSV.";
    } finally {
      referenceLoading = false;
      render();
    }
  };

  const getReferenceDownloads = () => [
    {
      key: "groups",
      title: "Grupos",
      fileName: "referencia-grupos.md",
      intro: "Use a descrição cadastrada no campo `descriptionGroup` da linha do CSV.",
      field: "descriptionGroup",
      fieldLabel: "descrição exata do grupo cadastrado",
      columns: ["Valor para o CSV", "Classe"],
      rows: references.groups.map((item) => [item.descriptionGroup, item.descriptionClass])
    },
    {
      key: "fiscalOperations",
      title: "Operações Fiscais de Venda",
      fileName: "referencia-operacoes-fiscais-venda.md",
      intro: "Use somente operações fiscais de saída ativas no campo `descriptionFiscalOperation`.",
      field: "descriptionFiscalOperation",
      fieldLabel: "descrição exata da operação fiscal de venda",
      columns: ["Valor para o CSV", "CFOP", "Tipo"],
      rows: references.fiscalOperations.map((item) => [
        item.descriptionFiscalOperation,
        item.cfopFiscalOperation || "-",
        item.typeFiscalOperation
      ])
    },
    {
      key: "productTypes",
      title: "Tipos de Produto",
      fileName: "referencia-tipos-de-produto.md",
      intro: "Use a descrição cadastrada no campo `descriptionProductType`.",
      field: "descriptionProductType",
      fieldLabel: "descrição exata do tipo de produto",
      columns: ["Valor para o CSV", "Código SPED"],
      rows: references.productTypes.map((item) => [
        item.descriptionProductType,
        item.codeSpedProductType || "-"
      ])
    },
    {
      key: "units",
      title: "Unidades",
      fileName: "referencia-unidades.md",
      intro: "Use o código cadastrado no campo `codeUnit`.",
      field: "codeUnit",
      fieldLabel: "código da unidade tributável",
      columns: ["Valor para o CSV", "Descrição"],
      rows: references.units.map((item) => [item.codeUnit, item.descriptionUnit])
    },
    {
      key: "physicalStates",
      title: "Estados Físicos",
      fileName: "referencia-estados-fisicos.md",
      intro: "Use o ID, nome, código ou descrição cadastrada no campo `descriptionPhysicalState`.",
      field: "descriptionPhysicalState",
      fieldLabel: "ID, nome, código ou descrição exata do estado físico ativo",
      columns: ["ID", "Valor para o CSV", "Código", "Descrição"],
      rows: references.physicalStates.map((item) => [
        item.idPhysicalState,
        item.namePhysicalState,
        item.codePhysicalState,
        item.descriptionPhysicalState || "-"
      ])
    },
    {
      key: "printPlaces",
      title: "Locais de Impressão",
      fileName: "referencia-locais-de-impressao.md",
      intro: "Use um dos valores fixos aceitos no campo `printsPlace`.",
      field: "printsPlace",
      fieldLabel: "valor exato do local de impressão",
      columns: ["Valor para o CSV", "Descrição"],
      rows: [
        ["NÃO IMPRIMIR", "Não enviar o produto para impressão."],
        ["BAR", "Enviar o produto para impressão no bar."],
        ["COPA", "Enviar o produto para impressão na copa."],
        ["COZINHA", "Enviar o produto para impressão na cozinha."]
      ]
    },
    {
      key: "productStatuses",
      title: "Status de Produtos",
      fileName: "referencia-status-produtos.md",
      intro: "Use um dos valores aceitos no campo `isActiveProduct`.",
      field: "isActiveProduct",
      fieldLabel: "status operacional do produto",
      columns: ["Valor para o CSV", "Descrição"],
      rows: [
        ["ATIVO", "Produto disponível nas consultas e operações permitidas."],
        ["INATIVO", "Produto preservado no cadastro, mas fora das consultas ativas."]
      ]
    }
  ];

  const downloadReference = (reference) => {
    const blob = new Blob([`\uFEFF${buildReferenceMarkdown(reference)}`], {
      type: "text/markdown;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = reference.fileName;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const render = () => {
    root.className = "catalog-screen catalog-import-screen";
    root.innerHTML = `
      <header class="classic-titlebar">
        <strong>PDV - Importar cadastros</strong>
        <span>Operador: Operador</span>
      </header>
      ${renderMainMenu()}
      <div class="classic-toolbar">
        <button class="classic-tool-button" data-back type="button">← Frente de caixa</button>
        <button class="classic-tool-button is-active" data-import-catalogs type="button">${escapeHtml(getScreenContextLabel("Importar cadastros", "import-catalogs"))}</button>
      </div>
      <section class="classic-content catalog-import-content">
        ${renderSuccessFeedback(message, escapeHtml)}
        ${renderNavigationIntro("import-catalogs", "Importar cadastros", "Use o modelo CSV para validar e importar produtos em lote.")}
        <section class="classic-form-panel">
          <div class="classic-panel-header">Importar Produtos</div>
          <div class="classic-form-body">
            <input data-file-input type="file" accept=".csv,text/csv" hidden />
            <p class="form-help">Selecione um arquivo CSV para validá-lo antes da importação. Este painel verifica os dados, identifica erros e permite importar vários produtos em uma única operação.</p>
            <p data-file-name>${selectedFile ? escapeHtml(`${selectedFile.name} — ${rows.length} linha(s) válida(s)`) : "Nenhum arquivo selecionado."}</p>
            ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}
          </div>
          <div class="classic-form-actions">
            <button class="classic-button" data-download-model type="button">Baixar modelo CSV</button>
            <button class="classic-button" data-select-file type="button" ${loading || testing ? "disabled" : ""}>Selecionar arquivo</button>
            <button class="classic-button" data-test-file type="button" ${loading || testing ? "disabled" : ""}>Testar arquivo</button>
            <button class="classic-button primary" data-import-file type="button" ${!canImportCatalogRows({ rows, validationPassed, loading }) ? "disabled" : ""}>${loading ? "Importando..." : "Importar arquivo"}</button>
          </div>
        </section>
        <section class="classic-form-panel">
          <div class="classic-panel-header">Listas para preenchimento do CSV</div>
          <div class="classic-form-body">
            <p class="form-help">Este painel reúne as referências necessárias para preencher o modelo CSV corretamente. Consulte os valores cadastrados antes de importar para evitar divergências de descrição, código ou identificação nos campos relacionados ao catálogo.</p>
            <div class="csv-values-table-wrapper">
              <table class="classic-table csv-values-table">
                <thead><tr><th>Coluna</th><th>Valores aceitos</th></tr></thead>
                <tbody>${csvValueReference.map(([field, description]) => `
                  <tr><td><code>${escapeHtml(field)}</code></td><td>${escapeHtml(description)}</td></tr>
                `).join("")}</tbody>
              </table>
            </div>
            ${referenceError ? `<p class="payment-error">${escapeHtml(referenceError)}</p>` : ""}
            ${referenceLoading
              ? "<p class=\"classic-empty\">Carregando listas auxiliares...</p>"
              : `<div class="classic-form-actions reference-download-actions">
                  ${getReferenceDownloads().map((reference) => `<button class="classic-button" data-download-reference="${reference.key}" type="button">${escapeHtml(reference.title)} (.md)</button>`).join("")}
                </div>`}
          </div>
        </section>
      </section>
    `;
    bindMainMenu(root, {
      products: onProducts,
      "import-catalogs": onTools,
      "thermal-print": onThermalPrint,
      settings: onSettings,
      company: onCompany,
      nfce: onNfce,
      financial: onFinancial,
      "payment-methods": onPaymentMethods
    });
    bind();
  };

  const selectFile = ({ clearSelection = false } = {}) => {
    const input = root.querySelector("[data-file-input]");
    if (!input) return;
    if (clearSelection) {
      selectedFile = null;
      rows = [];
      validationPassed = false;
      error = "";
      message = "";
      render();
      root.querySelector("[data-file-input]")?.click();
      return;
    }
    input.value = "";
    input.click();
  };

  const readSelectedFile = async () => {
    if (!selectedFile) throw new Error("Selecione um arquivo CSV antes de testar.");
    rows = parseCsv(await selectedFile.text());
  };

  const validateRowsWithApi = async () => {
    const response = await apiFetch(`${getApiUrl()}/api/products/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows, validateOnly: true })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Não foi possível validar o arquivo.");
    return payload;
  };

  const bind = () => {
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    root.querySelector("[data-file-input]")?.addEventListener("change", async (event) => {
      selectedFile = event.currentTarget.files?.[0] || null;
      rows = [];
      validationPassed = false;
      error = "";
      message = "";
      if (selectedFile) {
        try {
          await readSelectedFile();
        } catch (fileError) {
          error = fileError instanceof Error ? fileError.message : String(fileError);
        }
      }
      render();
    });
    root.querySelector("[data-download-model]")?.addEventListener("click", () => {
      try {
        const blob = new Blob([`\uFEFF${csvExample}`], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "modelo-produtos.csv";
        anchor.style.display = "none";
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
        error = "";
        message = "Modelo CSV baixado com sucesso.";
        scheduleMessageClear(() => { message = ""; clearRenderedFeedback(root); });
        render();
      } catch (downloadError) {
        error = downloadError instanceof Error
          ? downloadError.message
          : "Não foi possível baixar o modelo CSV.";
        message = "";
        render();
      }
    });
    root.querySelector("[data-select-file]")?.addEventListener("click", () => {
      selectFile({ clearSelection: true });
    });
    root.querySelectorAll("[data-download-reference]").forEach((button) => {
      button.addEventListener("click", () => {
        const reference = getReferenceDownloads().find((item) => item.key === button.dataset.downloadReference);
        if (!reference) return;
        try {
          downloadReference(reference);
          error = "";
          message = `${reference.title} baixados com sucesso.`;
          scheduleMessageClear(() => { message = ""; clearRenderedFeedback(root); });
          render();
        } catch (downloadError) {
          error = downloadError instanceof Error
            ? downloadError.message
            : `Não foi possível baixar ${reference.title.toLocaleLowerCase("pt-BR")}.`;
          message = "";
          render();
        }
      });
    });
    root.querySelector("[data-test-file]")?.addEventListener("click", async () => {
      if (!selectedFile || !rows.length) {
        validationPassed = false;
        selectFile({ clearSelection: true });
        return;
      }
      testing = true;
      validationPassed = false;
      error = "";
      message = "";
      render();
      try {
        await validateRowsWithApi();
        validationPassed = true;
        error = "";
        message = `Arquivo válido: ${rows.length} produto(s) pronto(s) para importação.`;
        scheduleMessageClear(() => { message = ""; clearRenderedFeedback(root); });
      } catch (testError) {
        validationPassed = false;
        error = testError instanceof Error ? testError.message : String(testError);
        message = "";
        selectedFile = null;
        rows = [];
      } finally {
        testing = false;
        render();
      }
    });
    root.querySelector("[data-import-file]")?.addEventListener("click", async () => {
      loading = true;
      validationPassed = false;
      error = "";
      message = "";
      render();
      try {
        const response = await apiFetch(`${getApiUrl()}/api/products/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Não foi possível importar os produtos.");
        message = `${payload.importedCount} produto(s) importado(s) com sucesso.`;
        rows = [];
        validationPassed = false;
        scheduleMessageClear(() => { message = ""; clearRenderedFeedback(root); });
      } catch (importError) {
        error = importError instanceof Error ? importError.message : String(importError);
      } finally {
        loading = false;
        render();
      }
    });
  };

  render();
  loadReferences();
  return root;
}
