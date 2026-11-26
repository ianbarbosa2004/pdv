import { renderLucideIcons } from "./icons.js";

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const isTauri = () => Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);

const openPdfSaveDialog = async ({ backdrop, element, fileName }) => {
  let defaultDirectory = "Downloads";
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      defaultDirectory = await invoke("get_pdf_save_directory");
    } catch {
      defaultDirectory = "Documentos";
    }
  }

  const dialog = document.createElement("div");
  dialog.className = "pdf-save-backdrop";
  dialog.innerHTML = `
    <section class="pdf-save-dialog" role="dialog" aria-modal="true" aria-labelledby="pdf-save-title">
      <header class="classic-panel-header pdf-save-header">
        <span id="pdf-save-title">Salvar PDF</span>
        <button type="button" class="modal-close-button" data-pdf-save-close aria-label="Fechar" title="Fechar"><i data-lucide="x"></i></button>
      </header>
      <div class="pdf-save-body">
        <label class="form-field">
          <span>Nome do arquivo</span>
          <input data-pdf-save-name value="${escapeHtml(fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`)}" />
        </label>
        <label class="form-field">
          <span>Pasta de destino</span>
          <div class="pdf-save-directory-row">
            <input data-pdf-save-directory readonly value="${escapeHtml(defaultDirectory)}" />
            <button type="button" class="classic-button" data-pdf-save-browse ${isTauri() ? "" : "disabled"}>Visualizar pasta</button>
          </div>
        </label>
        <p class="pdf-save-feedback" data-pdf-save-feedback role="status" aria-live="polite"></p>
      </div>
      <div class="classic-form-actions">
        <button type="button" class="classic-button primary" data-pdf-save-confirm>Salvar PDF</button>
      </div>
    </section>
  `;
  backdrop.append(dialog);
  renderLucideIcons(dialog);

  let savedPath = "";
  let savedBlob = null;
  const directoryInput = dialog.querySelector("[data-pdf-save-directory]");
  const close = () => dialog.remove();
  dialog.querySelector("[data-pdf-save-close]")?.addEventListener("click", close);
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  });
  const openSavedPdf = async () => {
    try {
      if (isTauri()) {
        if (!savedPath) return;
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("open_pdf_file", { filePath: savedPath });
      } else if (savedBlob) {
        const objectUrl = URL.createObjectURL(savedBlob);
        window.open(objectUrl, "_blank", "noopener");
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }
    } catch (error) {
      const feedback = dialog.querySelector("[data-pdf-save-feedback]");
      feedback.textContent = error instanceof Error
        ? error.message
        : "Não foi possível abrir o PDF.";
      feedback.className = "pdf-save-feedback error";
    }
  };
  dialog.querySelector("[data-pdf-save-browse]")?.addEventListener("click", async (event) => {
    if (!isTauri()) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: String(directoryInput?.value || "").trim() || undefined
      });
      if (typeof selected === "string" && selected) {
        directoryInput.value = selected;
      }
    } catch (error) {
      const feedback = dialog.querySelector("[data-pdf-save-feedback]");
      feedback.textContent = error instanceof Error
        ? error.message
        : "Não foi possível abrir a árvore de diretórios.";
      feedback.className = "pdf-save-feedback error";
    } finally {
      button.disabled = false;
    }
  });
  dialog.querySelector("[data-pdf-save-name]")?.focus();

  dialog.querySelector("[data-pdf-save-confirm]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    if (button.dataset.saved === "true") {
      close();
      return;
    }
    const nameInput = dialog.querySelector("[data-pdf-save-name]");
    const directoryInput = dialog.querySelector("[data-pdf-save-directory]");
    const feedback = dialog.querySelector("[data-pdf-save-feedback]");
    const requestedName = String(nameInput?.value || "").trim();
    const requestedDirectory = String(directoryInput?.value || "").trim();
    if (!requestedName) {
      feedback.textContent = "Informe o nome do arquivo.";
      feedback.className = "pdf-save-feedback error";
      nameInput?.focus();
      return;
    }
    if (!requestedDirectory) {
      feedback.textContent = "Informe a pasta de destino.";
      feedback.className = "pdf-save-feedback error";
      directoryInput?.focus();
      return;
    }

    button.disabled = true;
    button.textContent = "Gerando PDF...";
    feedback.textContent = "Gerando o PDF com os dados da visualização...";
    feedback.className = "pdf-save-feedback";
    try {
      const { savePageAsPdf } = await import("./pdf-exporter.js");
      const result = await savePageAsPdf({
        element,
        fileName: requestedName
      });
      savedPath = "";
      if (isTauri()) {
        const { invoke } = await import("@tauri-apps/api/core");
        savedPath = await invoke("save_pdf_file", {
          fileName: result.fileName,
          directory: requestedDirectory,
          base64: result.base64
        });
      } else {
        const objectUrl = URL.createObjectURL(result.blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = result.fileName;
        anchor.click();
        savedBlob = result.blob;
        savedPath = `Downloads/${result.fileName}`;
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }
      feedback.textContent = `PDF salvo com sucesso: ${savedPath}`;
      feedback.className = "pdf-save-feedback success";
      const actions = dialog.querySelector(".classic-form-actions");
      actions.innerHTML = `
        <button type="button" class="classic-button" data-pdf-save-preview>Visualizar</button>
        <button type="button" class="classic-button primary" data-pdf-save-conclude>Concluir</button>
      `;
      actions.querySelector("[data-pdf-save-preview]")
        ?.addEventListener("click", () => void openSavedPdf());
      actions.querySelector("[data-pdf-save-conclude]")
        ?.addEventListener("click", close);
    } catch (error) {
      feedback.textContent = error instanceof Error
        ? error.message
        : "Não foi possível gerar ou salvar o PDF.";
      feedback.className = "pdf-save-feedback error";
      button.disabled = false;
      button.textContent = "Salvar PDF";
    }
  });
};

export function openPrintPreview({
  title = "Visualização de impressão",
  fileName = "documento",
  companyName = "PDV",
  companyDocument = "",
  companyAddress = "",
  companyLogo = "",
  documentTitle = "",
  documentFields = [],
  headerLines = [],
  bodyHtml = "",
  footerText = ""
} = {}) {
  const backdrop = document.createElement("div");
  backdrop.className = "print-preview-backdrop";
  backdrop.innerHTML = `
    <section class="print-preview-shell" role="dialog" aria-modal="true" aria-labelledby="print-preview-title">
      <header class="print-preview-toolbar">
        <strong id="print-preview-title">${escapeHtml(title)}</strong>
        <div class="print-preview-actions">
          <button type="button" class="print-preview-button" data-print-preview-print>Imprimir</button>
          <button type="button" class="print-preview-button primary" data-print-preview-pdf>Salvar PDF</button>
          <button type="button" class="print-preview-close" data-print-preview-close aria-label="Fechar visualização"><i data-lucide="x"></i></button>
        </div>
      </header>
      <div class="print-preview-scroll">
        <article class="print-preview-page">
          <header class="print-preview-document-header">
            ${companyLogo
              ? `<img class="print-preview-company-logo" src="${escapeHtml(companyLogo)}" alt="Logotipo da empresa" />`
              : ""}
            ${documentTitle || documentFields.length
              ? `<div class="print-preview-document-meta">
                  ${documentTitle ? `<strong>${escapeHtml(documentTitle)}</strong>` : ""}
                  ${documentFields.map((field) => `<span><b>${escapeHtml(field.label)}:</b> ${escapeHtml(field.value)}</span>`).join("")}
                </div>`
              : ""}
          </header>
          <main class="print-preview-document-body">${bodyHtml}</main>
          ${footerText ? `<footer class="print-preview-document-footer">${escapeHtml(footerText)}</footer>` : ""}
        </article>
      </div>
    </section>
  `;
  document.body.append(backdrop);
  renderLucideIcons(backdrop);

  const close = () => backdrop.remove();
  const handleKeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      document.removeEventListener("keydown", handleKeydown);
    }
  };
  document.addEventListener("keydown", handleKeydown);
  backdrop.querySelector("[data-print-preview-close]")?.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  backdrop.querySelector("[data-print-preview-print]")?.addEventListener("click", () => {
    window.print();
  });
  backdrop.querySelector("[data-print-preview-pdf]")?.addEventListener("click", () => {
    openPdfSaveDialog({
      backdrop,
      element: backdrop.querySelector(".print-preview-page"),
      fileName
    });
  });

  return { close, element: backdrop };
}
