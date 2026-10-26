import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { invoke } from "@tauri-apps/api/core";

const sampleText =
  "Acentos: á é í ó ú â ê ô ã õ ç Á É Í Ó Ú Â Ê Ô Ã Õ Ç";

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const alignments = [
  ["left", "Esquerda"],
  ["center", "Centro"],
  ["right", "Direita"]
];

const fontSizes = [
  ["10", "10 px"],
  ["12", "12 px"],
  ["14", "14 px"],
  ["16", "16 px"],
  ["18", "18 px"],
  ["22", "22 px"],
  ["26", "26 px"]
];

const fontFamilies = [
  ["Courier New", "Courier New"],
  ["Consolas", "Consolas"],
  ["Arial", "Arial"],
  ["Tahoma", "Tahoma"],
  ["Segoe UI", "Segoe UI"]
];

const cp850 = {
  "á": 0xa0, "é": 0x82, "í": 0xa1, "ó": 0xa2, "ú": 0xa3,
  "â": 0x83, "ê": 0x88, "ô": 0x93, "ã": 0xc6, "õ": 0xe4,
  "ç": 0x87, "Á": 0xb5, "É": 0x90, "Í": 0xd6, "Ó": 0xe0,
  "Ú": 0xe9, "Â": 0xb6, "Ê": 0xd2, "Ô": 0xe2, "Ã": 0xc7,
  "Õ": 0xe5, "Ç": 0x80, "ª": 0xa6, "º": 0xa7
};

const getApiUrl = () =>
  window.__PDV_API_URL__ || `http://${window.location.hostname}:3000`;

export function createThermalPrintScreen({
  onBack,
  onTools,
  onClasses,
  onGroups,
  onProducts,
  onFiscalOperations,
  onNcmCestUpdate,
  onSettings
}) {
  const root = document.createElement("main");
  let alignment = "left";
  let fontSize = "14";
  let fontFamily = "Courier New";
  let bold = false;
  let sample = sampleText;
  let message = "";
  let transport = "network";
  let printerName = "";
  let host = "192.168.1.100";
  let port = "9100";
  let installedPrinters = [];
  let printersLoading = false;
  let sending = false;

  const render = () => {
    root.className = "catalog-screen thermal-print-screen";
    root.innerHTML = `
      <header class="classic-titlebar">
        <strong>PDV - Teste de impressão térmica</strong>
        <span>Operador: Operador</span>
      </header>
      ${renderMainMenu()}
      <div class="classic-toolbar">
        <button class="classic-tool-button" data-back type="button">← Retaguarda</button>
        <button class="classic-tool-button is-active" data-thermal-print type="button">Impressão térmica</button>
      </div>
      <section class="thermal-print-content">
        <div class="thermal-print-heading">
          <p class="eyebrow">Ferramentas</p>
          <h1>Teste de impressão térmica</h1>
          <p>Valide caracteres, tamanhos, alinhamento e largura antes de conectar uma impressora de 80 mm.</p>
        </div>
        <div class="thermal-print-layout">
          <form class="classic-form-panel thermal-print-controls" data-form>
            <div class="classic-panel-header">Parâmetros do teste</div>
            <div class="classic-form-body">
              <label class="form-field">
                <span>Alinhamento</span>
                <select name="alignment">${alignments.map(([value, label]) => `<option value="${value}" ${alignment === value ? "selected" : ""}>${label}</option>`).join("")}</select>
              </label>
              <label class="form-field">
                <span>Transporte direto</span>
                <select name="transport">
                  <option value="network" ${transport === "network" ? "selected" : ""}>Rede TCP RAW</option>
                  <option value="usb" ${transport === "usb" ? "selected" : ""}>USB / impressora Windows</option>
                </select>
              </label>
              ${transport === "network" ? `
                <label class="form-field"><span>IP ou nome da impressora</span><input name="host" placeholder="192.168.1.100" value="${escapeHtml(host)}" /></label>
                <label class="form-field"><span>Porta RAW</span><input name="port" type="number" min="1" max="65535" value="${escapeHtml(port)}" /></label>
              ` : `
                <label class="form-field">
                  <span>Impressora instalada no Windows</span>
                  <select name="printerName" ${printersLoading ? "disabled" : ""}>
                    <option value="">${printersLoading ? "Carregando impressoras..." : "Selecione uma impressora"}</option>
                    ${installedPrinters.map((name) => `<option value="${escapeHtml(name)}" ${printerName === name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}
                  </select>
                </label>
                <button class="classic-button" data-refresh-printers type="button" ${printersLoading ? "disabled" : ""}>Atualizar impressoras</button>
              `}
              <label class="form-field">
                <span>Família da fonte</span>
                <select name="fontFamily">${fontFamilies.map(([value, label]) => `<option value="${escapeHtml(value)}" ${fontFamily === value ? "selected" : ""}>${label}</option>`).join("")}</select>
              </label>
              <label class="form-field">
                <span>Tamanho da fonte</span>
                <select name="fontSize">${fontSizes.map(([value, label]) => `<option value="${value}" ${fontSize === value ? "selected" : ""}>${label}</option>`).join("")}</select>
              </label>
              <label class="thermal-check">
                <input type="checkbox" name="bold" ${bold ? "checked" : ""} />
                <span>Aplicar negrito</span>
              </label>
              <label class="form-field">
                <span>Texto para testar caracteres</span>
                <textarea name="sample" rows="5" maxlength="500">${escapeHtml(sample)}</textarea>
              </label>
              ${message ? `<p class="success-message">${escapeHtml(message)}</p>` : ""}
            </div>
            <div class="classic-form-actions">
              <button class="classic-button primary" data-direct-print type="button" ${sending ? "disabled" : ""}><i data-lucide="printer"></i> ${sending ? "Enviando..." : "Enviar direto"}</button>
              <button class="classic-button" data-print type="button">Pré-visualizar</button>
              <button class="classic-button" data-download type="button"><i data-lucide="download"></i> Baixar ESC/POS</button>
            </div>
          </form>
          <section class="thermal-preview-panel">
            <div class="classic-panel-header">
              <span>Pré-visualização — papel 80 mm</span>
              <span class="thermal-preview-meta">48 colunas</span>
            </div>
            <div class="thermal-paper" data-paper>
              <div class="thermal-ticket thermal-align-${alignment} ${bold ? "thermal-bold" : ""}" style="font-family: '${escapeHtml(fontFamily)}'; font-size: ${escapeHtml(fontSize)}px;">
                <div class="thermal-ticket-brand">PDV COMERCIAL</div>
                <div>TESTE DE IMPRESSÃO</div>
                <div>--------------------------------</div>
                <div>${escapeHtml(sample).replaceAll("\n", "<br />")}</div>
                <div>--------------------------------</div>
                <div class="thermal-row"><span>Produto teste</span><span>R$ 10,00</span></div>
                <div class="thermal-row"><span>Caracteres</span><span>áçõ 80mm</span></div>
                <div class="thermal-row"><span>${escapeHtml(fontFamily)} ${fontSize}px</span><span>${alignment}</span></div>
                <div>--------------------------------</div>
                <div class="thermal-ticket-total">TOTAL R$ 10,00</div>
                <br />
                <div>Obrigado pela preferência!</div>
              </div>
            </div>
          </section>
        </div>
        <p class="thermal-print-note"><strong>Comunicação direta:</strong> rede envia ESC/POS pela porta RAW configurada, normalmente 9100. USB usa o driver da impressora instalada no Windows. O navegador comum mantém apenas o preview/download.</p>
      </section>
    `;
    renderLucideIcons(root);
    bindMainMenu(root, {
      products: onProducts,
      "fiscal-operations": onFiscalOperations,
      "thermal-print": onTools,
      "ncm-cest-update": onNcmCestUpdate,
      settings: onSettings
    });
    bind();
  };

  const buildEscPos = () => {
    const sampleLines = sample
      .split(/\r?\n/)
      .flatMap((line) => line.match(/.{1,48}/g) || [""]);
    const lineBreak = "\r\n";
    return [
      "\x1b\x40",
      "\x1b\x74\x02",
      "\x1b\x32",
      "\x1b\x21\x00",
      "\x1b\x45\x00",
      "PDV COMERCIAL", lineBreak,
      "TESTE DE IMPRESSAO", lineBreak,
      sampleLines.join(lineBreak), lineBreak,
      "--------------------------------", lineBreak,
      "Produto teste       R$ 10,00", lineBreak,
      "Caracteres          áçõ 80mm", lineBreak,
      "--------------------------------", lineBreak,
      "TOTAL               R$ 10,00", lineBreak,
      "Obrigado pela preferência!", lineBreak,
      lineBreak.repeat(5)
    ].join("");
  };

  const toBytes = (value) => Uint8Array.from([...value].map((character) => {
      if (cp850[character]) return cp850[character];
      const code = character.codePointAt(0);
      return code <= 255 ? code : 0x3f;
    }));

  const toBase64 = (value) => {
    const bytes = toBytes(value);
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  };

  const buildDriverText = () => [
    "PDV COMERCIAL",
    "TESTE DE IMPRESSÃO",
    "",
    sample,
    "",
    "--------------------------------",
    "Produto teste       R$ 10,00",
    "Caracteres          áçõ 80mm",
    `Fonte ${fontFamily} ${fontSize}px`,
    `Alinhamento ${alignment}`,
    "--------------------------------",
    "TOTAL               R$ 10,00",
    "Obrigado pela preferência!",
    "",
    "",
    "",
    "",
    ""
  ].join("\n");

  const sendDirect = async () => {
    if (!window.__TAURI_INTERNALS__) {
      message = "A comunicação direta exige executar o aplicativo Tauri. No navegador, use o preview ou o download ESC/POS.";
      render();
      return;
    }
    sending = true;
    message = "";
    render();
    try {
      message = await invoke("send_raw_print", {
        request: {
          transport,
          printerName: transport === "usb" ? printerName : null,
          host: transport === "network" ? host : null,
          port: transport === "network" ? Number(port) : null,
          dataBase64: toBase64(buildEscPos()),
          text: transport === "usb" ? buildDriverText() : null,
          fontFamily: transport === "usb" ? fontFamily : null,
          fontSize: transport === "usb" ? Number(fontSize) : null,
          bold: transport === "usb" ? bold : null
        }
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    } finally {
      sending = false;
      render();
    }
  };

  const loadInstalledPrinters = async () => {
    if (!window.__TAURI_INTERNALS__) return;
    printersLoading = true;
    render();
    try {
      const [settings, printers] = await Promise.all([
        fetch(`${getApiUrl()}/api/printer-settings`).then(async (response) => {
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "Não foi possível consultar a impressora padrão.");
          return payload;
        }),
        invoke("list_installed_printers")
      ]);
      installedPrinters = printers;
      printerName = settings.receiptPrinterName || printerName;
      if (printerName && !installedPrinters.includes(printerName)) {
        installedPrinters = [printerName, ...installedPrinters];
      }
      message = installedPrinters.length
        ? `${installedPrinters.length} impressora(s) encontrada(s) no Windows.`
        : "Nenhuma impressora instalada foi encontrada no Windows.";
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    } finally {
      printersLoading = false;
      render();
    }
  };

  const persistSelectedPrinter = async (value) => {
    if (!window.__TAURI_INTERNALS__ || !value) return;
    try {
      const currentResponse = await fetch(`${getApiUrl()}/api/printer-settings`);
      const currentSettings = await currentResponse.json();
      if (!currentResponse.ok) throw new Error(currentSettings.error || "Não foi possível consultar as configurações.");
      const response = await fetch(`${getApiUrl()}/api/printer-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptPrinterName: value,
          reportsPrinterName: currentSettings.reportsPrinterName || ""
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar a impressora padrão.");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
      render();
    }
  };

  const bind = () => {
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    root.querySelectorAll("[data-classes]").forEach((button) => button.addEventListener("click", onClasses));
    root.querySelectorAll("[data-groups]").forEach((button) => button.addEventListener("click", onGroups));
    root.querySelectorAll("[data-products]").forEach((button) => button.addEventListener("click", onProducts));
    root.querySelectorAll("[data-fiscal-operations]").forEach((button) => button.addEventListener("click", onFiscalOperations));
    root.querySelectorAll("[data-settings]").forEach((button) => button.addEventListener("click", onSettings));
    root.querySelectorAll("[data-thermal-print]").forEach((button) => button.addEventListener("click", onTools));
    root.querySelector("[data-form]")?.addEventListener("change", async (event) => {
      const form = event.currentTarget;
      alignment = form.elements.alignment.value;
      fontSize = form.elements.fontSize.value;
      fontFamily = form.elements.fontFamily.value;
      bold = form.elements.bold.checked;
      sample = form.elements.sample.value;
      transport = form.elements.transport.value;
      host = form.elements.host?.value || host;
      port = form.elements.port?.value || port;
      printerName = form.elements.printerName?.value || printerName;
      if (form.elements.printerName?.value) {
        await persistSelectedPrinter(form.elements.printerName.value);
      }
      render();
    });
    root.querySelector("[data-print]")?.addEventListener("click", () => {
      message = "Use a impressora térmica de 80 mm no diálogo do sistema.";
      window.print();
      render();
    });
    root.querySelector("[data-direct-print]")?.addEventListener("click", () => void sendDirect());
    root.querySelector("[data-refresh-printers]")?.addEventListener("click", () => void loadInstalledPrinters());
    root.querySelector("[data-download]")?.addEventListener("click", () => {
      const blob = new Blob([toBytes(buildEscPos())], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "teste-impressao-80mm.bin";
      anchor.click();
      URL.revokeObjectURL(url);
      message = "Arquivo ESC/POS de teste gerado.";
      render();
    });
  };

  render();
  void loadInstalledPrinters();
  return root;
}
