import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { createFeedbackTimer, renderSuccessFeedback } from "../ui/feedback.js";
import { getApiUrl } from "../shared/api.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const csvHeaders = [
  "skuProduct", "pdvCodeProduct", "nameProduct", "descriptionGroup",
  "descriptionFiscalOperation", "descriptionProductType", "codeUnit",
  "ncmProduct", "cestProduct", "priceProduct", "stockQuantityProduct",
  "controlsStockProduct", "isFractionalProduct", "printsKitchenProduct",
  "showsInPdvProduct"
];

const csvExample = [
  csvHeaders.join(";"),
  "PROD-001;789000000001;Café torrado;Mercearia;;;;78912345;;19,90;10;sim;não;não;sim"
].join("\r\n");

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
  if (headers.join("|") !== csvHeaders.join("|")) {
    throw new Error(`Cabeçalho inválido. Baixe o modelo CSV para usar as colunas corretas.`);
  }
  return rows.filter((item) => item.some((cell) => cell.trim())).map((item, index) => {
    const record = Object.fromEntries(csvHeaders.map((header, column) => [header, String(item[column] ?? "").trim()]));
    if (!record.skuProduct || !record.nameProduct || !record.descriptionGroup || !record.priceProduct) {
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
  let error = "";
  let message = "";
  let loading = false;
  const scheduleMessageClear = createFeedbackTimer();

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
        <button class="classic-tool-button is-active" data-import-catalogs type="button">Importar cadastros</button>
      </div>
      <section class="classic-content">
        ${renderSuccessFeedback(message, escapeHtml)}
        <div class="backoffice-home-heading">
          <h1>Importar cadastros</h1>
          <p>Use o modelo CSV para testar e importar produtos em lote sem cadastrar cada item manualmente.</p>
        </div>
        <section class="classic-form-panel">
          <div class="classic-panel-header">Importar Produtos</div>
          <div class="classic-form-body">
            <input data-file-input type="file" accept=".csv,text/csv" hidden />
            <p class="form-help">Campos principais: SKU, # PDV, nome, grupo e preço. Os demais campos podem ficar vazios.</p>
            <p data-file-name>${selectedFile ? escapeHtml(`${selectedFile.name} — ${rows.length} linha(s) válida(s)`) : "Nenhum arquivo selecionado."}</p>
            ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}
          </div>
          <div class="classic-form-actions">
            <button class="classic-button" data-download-model type="button">Baixar modelo CSV</button>
            <button class="classic-button" data-test-file type="button" ${loading ? "disabled" : ""}>Testar arquivo</button>
            <button class="classic-button primary" data-import-file type="button" ${loading || !rows.length ? "disabled" : ""}>${loading ? "Importando..." : "Importar arquivo"}</button>
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

  const selectFile = () => root.querySelector("[data-file-input]")?.click();

  const readSelectedFile = async () => {
    if (!selectedFile) throw new Error("Selecione um arquivo CSV antes de testar.");
    rows = parseCsv(await selectedFile.text());
  };

  const bind = () => {
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    root.querySelector("[data-file-input]")?.addEventListener("change", async (event) => {
      selectedFile = event.currentTarget.files?.[0] || null;
      rows = [];
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
        scheduleMessageClear(() => { message = ""; render(); });
        render();
      } catch (downloadError) {
        error = downloadError instanceof Error
          ? downloadError.message
          : "Não foi possível baixar o modelo CSV.";
        message = "";
        render();
      }
    });
    root.querySelector("[data-test-file]")?.addEventListener("click", async () => {
      if (!selectedFile) {
        selectFile();
        return;
      }
      try {
        await readSelectedFile();
        error = "";
        message = `Arquivo válido: ${rows.length} produto(s) pronto(s) para importação.`;
        scheduleMessageClear(() => { message = ""; render(); });
      } catch (testError) {
        error = testError instanceof Error ? testError.message : String(testError);
        message = "";
      }
      render();
    });
    root.querySelector("[data-import-file]")?.addEventListener("click", async () => {
      loading = true;
      error = "";
      message = "";
      render();
      try {
        const response = await fetch(`${getApiUrl()}/api/products/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Não foi possível importar os produtos.");
        message = `${payload.importedCount} produto(s) importado(s) com sucesso.`;
        rows = [];
        scheduleMessageClear(() => { message = ""; render(); });
      } catch (importError) {
        error = importError instanceof Error ? importError.message : String(importError);
      } finally {
        loading = false;
        render();
      }
    });
  };

  render();
  return root;
}
