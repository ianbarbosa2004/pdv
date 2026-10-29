import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { invoke } from "@tauri-apps/api/core";
import { createFeedbackTimer, renderSuccessFeedback } from "../ui/feedback.js";
import { getApiUrl } from "../shared/api.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const cp850 = {
  "á": 0xa0, "é": 0x82, "í": 0xa1, "ó": 0xa2, "ú": 0xa3, "â": 0x83,
  "ê": 0x88, "ô": 0x93, "ã": 0xc6, "õ": 0xe4, "ç": 0x87, "Á": 0xb5,
  "É": 0x90, "Í": 0xd6, "Ó": 0xe0, "Ú": 0xe9, "Â": 0xb6, "Ê": 0xd2,
  "Ô": 0xe2, "Ã": 0xc7, "Õ": 0xe5, "Ç": 0x80, "ª": 0xa6, "º": 0xa7
};

const fields = [
  ["companyName", "Nome da empresa", "PDV COMERCIAL"],
  ["companyDocument", "CNPJ / CPF", "24.768.938/0001-14"],
  ["companyAddress", "Endereço", "Rua Ouro Preto, 720"],
  ["companyCity", "Cidade / UF", "Patos de Minas - MG"],
  ["saleNumber", "Número da venda", "Venda 000123"],
  ["saleDate", "Data e hora", "27/10/2026 02:36"],
  ["operator", "Operador", "Operador"],
  ["items", "Itens da venda", "1x Produto teste    R$ 15,00"],
  ["subtotal", "Subtotal", "R$ 15,00"],
  ["discount", "Desconto", "R$ 0,00"],
  ["total", "Total", "R$ 15,00"],
  ["payment", "Forma de pagamento", "Dinheiro"],
  ["change", "Troco", "R$ 0,00"],
  ["nfceKey", "Chave NFC-e", "3126 1024 7689 3800 0114"],
  ["nfceQrCode", "QR Code NFC-e", "[ QR CODE ]"],
  ["footerMessage", "Mensagem final", "Obrigado pela preferência!"]
];

const alignments = [["left", "Esquerda"], ["center", "Centro"], ["right", "Direita"]];
const sizes = [["small", "Pequeno"], ["normal", "Normal"], ["large", "Grande"]];
const fontFamilies = ["Courier New", "Arial", "Consolas", "Segoe UI", "Tahoma", "Verdana"];
const fontSizes = [9, 10, 11, 12, 14, 16, 18, 20, 24, 28];
const defaultLayout = [
  { type: "field", field: "companyName", align: "center", size: "large", fontFamily: "Courier New", fontSize: 16, bold: true },
  { type: "field", field: "companyDocument", align: "center", size: "small", fontFamily: "Courier New", fontSize: 10, bold: false },
  { type: "divider", style: "dash" },
  { type: "field", field: "saleDate", align: "left", size: "small", fontFamily: "Courier New", fontSize: 10, bold: false },
  { type: "field", field: "items", align: "left", size: "normal", fontFamily: "Courier New", fontSize: 11, bold: false },
  { type: "divider", style: "dash" },
  { type: "field", field: "subtotal", align: "right", size: "normal", fontFamily: "Courier New", fontSize: 11, bold: false },
  { type: "field", field: "total", align: "right", size: "large", fontFamily: "Courier New", fontSize: 16, bold: true },
  { type: "field", field: "payment", align: "left", size: "small", fontFamily: "Courier New", fontSize: 10, bold: false },
  { type: "field", field: "change", align: "left", size: "small", fontFamily: "Courier New", fontSize: 10, bold: false },
  { type: "divider", style: "solid" },
  { type: "field", field: "footerMessage", align: "center", size: "normal", fontFamily: "Courier New", fontSize: 11, bold: true }
];

export function createThermalPrintScreen({
  onBack, onTools, onClasses, onGroups, onProducts, onFiscalOperations,
  onNcmCestUpdate, onSettings, onCompany, onNfce, onFinancial, onPaymentMethods
}) {
  const root = document.createElement("main");
  let layout = structuredClone(defaultLayout);
  let selectedIndex = 0;
  let message = "";
  let error = "";
  let saving = false;
  let transport = "network";
  let host = "192.168.1.100";
  let port = "9100";
  let receiptPrinterName = "";
  let sending = false;
  const scheduleMessageClear = createFeedbackTimer();

  const fieldLabel = (key) => fields.find(([value]) => value === key)?.[1] || key;
  const fieldValue = (key) => fields.find(([value]) => value === key)?.[2] || "";
  const normalizeLine = (line) => ({
    type: line?.type === "divider" ? "divider" : line?.type === "text" ? "text" : "field",
    field: fields.some(([value]) => value === line?.field) ? line.field : "companyName",
    text: String(line?.text || "Texto livre").slice(0, 120),
    style: line?.style === "solid" ? "solid" : "dash",
    align: ["left", "center", "right"].includes(line?.align) ? line.align : "left",
    size: ["small", "normal", "large"].includes(line?.size) ? line.size : "normal",
    fontFamily: fontFamilies.includes(line?.fontFamily) ? line.fontFamily : "Courier New",
    fontSize: Number.isInteger(Number(line?.fontSize)) ? Math.max(6, Math.min(48, Number(line.fontSize))) : 11,
    bold: Boolean(line?.bold)
  });
  const normalizeLayout = (value) =>
    Array.isArray(value) && value.length ? value.slice(0, 80).map(normalizeLine) : structuredClone(defaultLayout);

  const renderLine = (line, index) => {
    const item = normalizeLine(line);
    if (item.type === "divider") {
      return `<div class="receipt-layout-row receipt-layout-divider-row ${selectedIndex === index ? "is-selected" : ""}" data-line="${index}">
        <button type="button" class="receipt-layout-select" data-select-line="${index}">
          <span class="receipt-line-grip">⋮⋮</span><strong>Divisor</strong><small>${item.style === "solid" ? "Linha contínua" : "Linha tracejada"}</small>
        </button>
        <div class="receipt-layout-actions"><button type="button" data-move-up="${index}" title="Mover para cima">↑</button><button type="button" data-move-down="${index}" title="Mover para baixo">↓</button><button type="button" data-remove-line="${index}" title="Remover">×</button></div>
      </div>`;
    }
    const title = item.type === "text" ? item.text : fieldLabel(item.field);
    return `<div class="receipt-layout-row ${selectedIndex === index ? "is-selected" : ""}" data-line="${index}">
      <button type="button" class="receipt-layout-select" data-select-line="${index}">
        <span class="receipt-line-grip">⋮⋮</span><strong>${escapeHtml(title)}</strong><small>${item.type === "text" ? "Texto livre" : "Campo disponível"}</small>
      </button>
      <span class="receipt-layout-format">${item.bold ? "Negrito" : "Regular"} · ${item.fontFamily} · ${item.fontSize}px · ${item.align}</span>
      <div class="receipt-layout-actions"><button type="button" data-move-up="${index}" title="Mover para cima">↑</button><button type="button" data-move-down="${index}" title="Mover para baixo">↓</button><button type="button" data-remove-line="${index}" title="Remover">×</button></div>
    </div>`;
  };

  const previewLine = (line) => {
    const item = normalizeLine(line);
    if (item.type === "divider") return `<div class="receipt-preview-divider ${item.style}">${item.style === "solid" ? "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" : "--------------------------------"}</div>`;
    const text = item.type === "text" ? item.text : fieldValue(item.field);
    return `<div class="receipt-preview-line thermal-align-${item.align} ${item.bold ? "thermal-bold" : ""}" style="font-family: '${escapeHtml(item.fontFamily)}'; font-size: ${item.fontSize}px">${escapeHtml(text)}</div>`;
  };

  const buildPlainText = () => layout.map((line) => {
    const item = normalizeLine(line);
    if (item.type === "divider") return item.style === "solid" ? "================================================" : "------------------------------------------------";
    return item.type === "text" ? item.text : fieldValue(item.field);
  }).join("\r\n");
  const buildPrintLines = () => layout.map((line) => {
    const item = normalizeLine(line);
    if (item.type === "divider") {
      return { text: item.style === "solid" ? "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" : "--------------------------------", align: "center", size: "small", bold: item.style === "solid" };
    }
    return {
      text: item.type === "text" ? item.text : fieldValue(item.field),
      align: item.align,
      size: item.size,
      bold: item.bold
      ,fontFamily: item.fontFamily
      ,fontSize: item.fontSize
    };
  });

  const toBytes = (value) => Uint8Array.from([...value].map((character) => {
    if (cp850[character]) return cp850[character];
    const code = character.codePointAt(0);
    return code <= 255 ? code : 0x3f;
  }));
  const toBase64 = (value) => {
    let binary = "";
    toBytes(value).forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  };
  const buildEscPos = () => `\x1b\x40\x1b\x74\x02${buildPlainText()}\r\n\r\n\r\n`;

  const render = () => {
    const selected = normalizeLine(layout[selectedIndex] || layout[0]);
    root.className = "catalog-screen thermal-print-screen";
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - Montagem de cupom</strong><span>Operador: Operador</span></header>
      ${renderMainMenu()}
      <div class="classic-toolbar"><button class="classic-tool-button" data-back type="button">← Frente de caixa</button><button class="classic-tool-button is-active" data-thermal-print type="button">Montagem de cupom</button></div>
      <section class="thermal-print-content">
        ${renderSuccessFeedback(message, escapeHtml)}
        <div class="thermal-print-heading"><h1>Monte o cupom da sua loja</h1><p>Escolha os campos, organize a sequência e defina a formatação de cada linha para a impressora térmica de 80 mm.</p></div>
        <div class="receipt-builder-layout">
          <section class="classic-form-panel receipt-library-panel">
            <div class="classic-panel-header">Campos disponíveis</div>
            <div class="receipt-library">${fields.map(([value, label]) => `<button type="button" data-add-field="${value}"><span>＋</span>${label}</button>`).join("")}</div>
            <div class="receipt-builder-addons"><button class="classic-button" type="button" data-add-text>＋ Texto livre</button><button class="classic-button" type="button" data-add-divider>＋ Divisor</button></div>
          </section>
          <section class="classic-form-panel receipt-layout-panel">
            <div class="classic-panel-header"><span>Estrutura do cupom</span><small>${layout.length} linhas</small></div>
            <div class="receipt-layout-list">${layout.map(renderLine).join("")}</div>
            ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}
            <div class="classic-form-actions"><button class="classic-button" type="button" data-reset-layout>Restaurar padrão</button><button class="classic-button primary" type="button" data-save-layout ${saving ? "disabled" : ""}>${saving ? "Salvando..." : "Salvar montagem"}</button></div>
          </section>
          <section class="classic-form-panel receipt-format-panel">
            <div class="classic-panel-header">Formatação da linha</div>
            <div class="classic-form-body">${selected.type === "divider" ? `
              <label class="form-field"><span>Tipo do divisor</span><select data-format="style"><option value="dash" ${selected.style === "dash" ? "selected" : ""}>Tracejado</option><option value="solid" ${selected.style === "solid" ? "selected" : ""}>Contínuo</option></select></label>
            ` : `${selected.type === "text" ? `<label class="form-field"><span>Texto</span><input data-format="text" maxlength="120" value="${escapeHtml(selected.text)}" /></label>` : `<label class="form-field"><span>Campo</span><select data-format="field">${fields.map(([value, label]) => `<option value="${value}" ${selected.field === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>`}
              <label class="form-field"><span>Alinhamento</span><select data-format="align">${alignments.map(([value, label]) => `<option value="${value}" ${selected.align === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
              <label class="form-field"><span>Fonte</span><select data-format="fontFamily">${fontFamilies.map((value) => `<option value="${value}" ${selected.fontFamily === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
              <label class="form-field"><span>Tamanho da fonte</span><select data-format="fontSize">${fontSizes.map((value) => `<option value="${value}" ${selected.fontSize === value ? "selected" : ""}>${value} px</option>`).join("")}</select></label>
              <label class="form-field"><span>Escala visual</span><select data-format="size">${sizes.map(([value, label]) => `<option value="${value}" ${selected.size === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
              <label class="thermal-check"><input type="checkbox" data-format="bold" ${selected.bold ? "checked" : ""}/><span>Usar negrito</span></label>`}</div>
          </section>
          <section class="thermal-preview-panel receipt-builder-preview">
            <div class="classic-panel-header"><span>Pré-visualização</span><span class="thermal-preview-meta">80 mm · 48 colunas</span></div>
            <div class="thermal-paper"><div class="thermal-ticket">${layout.map(previewLine).join("")}</div></div>
          </section>
        </div>
        <section class="classic-form-panel receipt-print-panel"><div class="classic-panel-header">Imprimir cupom montado</div><div class="classic-form-body receipt-transport-grid">
          <label class="form-field"><span>Transporte</span><select data-transport><option value="network" ${transport === "network" ? "selected" : ""}>Rede TCP RAW</option><option value="usb" ${transport === "usb" ? "selected" : ""}>USB / impressora Windows</option></select></label>
          ${transport === "network" ? `<label class="form-field"><span>IP ou nome</span><input data-host value="${escapeHtml(host)}"/></label><label class="form-field"><span>Porta</span><input data-port type="number" value="${escapeHtml(port)}"/></label>` : `<label class="form-field"><span>Impressora configurada para Cupom</span><input value="${escapeHtml(receiptPrinterName || "Nenhuma impressora configurada")}" readonly disabled/><small>Definida em Retaguarda → Configurações → Impressoras.</small></label>`}
        </div><div class="classic-form-actions"><button class="classic-button primary" type="button" data-direct-print ${sending ? "disabled" : ""}>${sending ? "Enviando..." : "Imprimir cupom"}</button><button class="classic-button" type="button" data-browser-print>Pré-visualizar / imprimir</button><button class="classic-button" type="button" data-download>Baixar ESC/POS</button></div></section>
      </section>`;
    renderLucideIcons(root);
    bindMainMenu(root, { products: onProducts, "fiscal-operations": onFiscalOperations, "thermal-print": onTools, "ncm-cest-update": onNcmCestUpdate, settings: onSettings, company: onCompany, nfce: onNfce, financial: onFinancial, "payment-methods": onPaymentMethods });
    bind();
  };

  const updateSelected = (key, value) => {
    if (!layout[selectedIndex]) return;
    layout[selectedIndex] = { ...normalizeLine(layout[selectedIndex]), [key]: value };
  };
  const bind = () => {
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    root.querySelectorAll("[data-select-line]").forEach((button) => button.addEventListener("click", () => { selectedIndex = Number(button.dataset.selectLine); render(); }));
    root.querySelectorAll("[data-remove-line]").forEach((button) => button.addEventListener("click", () => { layout.splice(Number(button.dataset.removeLine), 1); selectedIndex = Math.max(0, Math.min(selectedIndex, layout.length - 1)); render(); }));
    root.querySelectorAll("[data-move-up]").forEach((button) => button.addEventListener("click", () => moveLine(Number(button.dataset.moveUp), -1)));
    root.querySelectorAll("[data-move-down]").forEach((button) => button.addEventListener("click", () => moveLine(Number(button.dataset.moveDown), 1)));
    root.querySelectorAll("[data-add-field]").forEach((button) => button.addEventListener("click", () => addLine({ type: "field", field: button.dataset.addField, align: "left", size: "normal", bold: false })));
    root.querySelector("[data-add-text]")?.addEventListener("click", () => addLine({ type: "text", text: "Texto livre", align: "left", size: "normal", bold: false }));
    root.querySelector("[data-add-divider]")?.addEventListener("click", () => addLine({ type: "divider", style: "dash" }));
    root.querySelector("[data-reset-layout]")?.addEventListener("click", () => { layout = structuredClone(defaultLayout); selectedIndex = 0; render(); });
    root.querySelector("[data-save-layout]")?.addEventListener("click", () => void saveLayout());
    root.querySelectorAll("[data-format]").forEach((input) => input.addEventListener("change", () => { updateSelected(input.dataset.format, input.type === "checkbox" ? input.checked : input.value); render(); }));
    root.querySelector("[data-transport]")?.addEventListener("change", (event) => { transport = event.currentTarget.value; render(); });
    root.querySelector("[data-host]")?.addEventListener("change", (event) => { host = event.currentTarget.value; });
    root.querySelector("[data-port]")?.addEventListener("change", (event) => { port = event.currentTarget.value; });
    root.querySelector("[data-direct-print]")?.addEventListener("click", () => void sendDirect());
    root.querySelector("[data-browser-print]")?.addEventListener("click", () => window.print());
    root.querySelector("[data-download]")?.addEventListener("click", () => { const url = URL.createObjectURL(new Blob([toBytes(buildEscPos())], { type: "application/octet-stream" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "cupom-80mm.bin"; anchor.click(); URL.revokeObjectURL(url); message = "Arquivo ESC/POS gerado."; render(); scheduleMessageClear(() => { message = ""; render(); }); });
  };
  const addLine = (line) => { layout.push(normalizeLine(line)); selectedIndex = layout.length - 1; render(); };
  const moveLine = (index, direction) => { const target = index + direction; if (target < 0 || target >= layout.length) return; [layout[index], layout[target]] = [layout[target], layout[index]]; selectedIndex = target; render(); };
  const saveLayout = async () => {
    saving = true; error = ""; message = ""; render();
    try {
      const current = await fetch(`${getApiUrl()}/api/printer-settings`).then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error); return payload; });
      const response = await fetch(`${getApiUrl()}/api/printer-settings`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receiptPrinterName: current.receiptPrinterName || "", reportsPrinterName: current.reportsPrinterName || "", receiptLayout: layout }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Não foi possível salvar a montagem.");
      message = "Montagem do cupom salva.";
      scheduleMessageClear(() => {
        message = "";
        render();
      });
    } catch (saveError) { error = saveError instanceof Error ? saveError.message : String(saveError); } finally { saving = false; render(); }
  };
  const sendDirect = async () => {
    if (!window.__TAURI_INTERNALS__) { message = "A impressão direta exige o aplicativo Tauri."; render(); scheduleMessageClear(() => { message = ""; render(); }); return; }
    sending = true; message = ""; render();
    try {
      if (transport === "usb" && !receiptPrinterName) throw new Error("Configure a impressora padrão de Cupom antes de imprimir.");
      message = await invoke("send_raw_print", { request: { transport, printerName: transport === "usb" ? receiptPrinterName : null, host: transport === "network" ? host : null, port: transport === "network" ? Number(port) : null, dataBase64: toBase64(buildEscPos()), text: transport === "usb" ? buildPlainText() : null, lines: transport === "usb" ? buildPrintLines() : null } });
      scheduleMessageClear(() => {
        message = "";
        render();
      });
    } catch (sendError) { error = sendError instanceof Error ? sendError.message : String(sendError); } finally { sending = false; render(); }
  };
  const load = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/printer-settings`); const payload = await response.json();
      if (!response.ok) throw new Error(payload.error); layout = normalizeLayout(payload.receiptLayout); receiptPrinterName = payload.receiptPrinterName || "";
      render();
    } catch (loadError) { error = loadError instanceof Error ? loadError.message : String(loadError); render(); }
  };
  render(); void load(); return root;
}
