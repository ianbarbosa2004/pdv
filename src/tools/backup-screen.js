import { apiFetch, getApiUrl } from "../shared/api.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { clearRenderedFeedback, createFeedbackTimer, renderSuccessFeedback } from "../ui/feedback.js";
import { confirmAction } from "../ui/confirmation-modal.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const formatSize = (value) => {
  const size = Number(value);
  if (!Number.isFinite(size)) return "Não informado";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const backupDateFromFileName = (fileName) => {
  const match = /^pdv-backup-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.json\.gz$/.exec(fileName);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ));
};

const formatDateTime = (value, fileName) => {
  const date = value ? new Date(value) : backupDateFromFileName(fileName);
  return !date || Number.isNaN(date.getTime())
    ? "Não informado"
    : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

const toBase64 = (buffer) => {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
};

export function createBackupScreen({
  onBack, onTools, onProducts, onFiscalOperations, onThermalPrint, onNcmCestUpdate,
  onSettings, onCompany, onNfce, onFinancial, onPaymentMethods
}) {
  const root = document.createElement("main");
  let backups = [];
  let loading = true;
  let submitting = false;
  let error = "";
  let message = "";
  const scheduleMessageClear = createFeedbackTimer();
  const request = async (path, options = {}) => {
    const requestOptions = {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    };
    const response = await apiFetch(`${getApiUrl()}${path}`, requestOptions);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Não foi possível concluir a operação.");
    return payload;
  };

  const load = async () => {
    loading = true;
    render();
    try {
      const payload = await request(
        "/api/backups"
      );
      backups = payload.backups || [];
      error = "";
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : String(loadError);
    } finally {
      loading = false;
      render();
    }
  };

  const create = async () => {
    submitting = true;
    error = "";
    message = "";
    render();
    try {
      const { backup } = await request("/api/backups", {
        method: "POST",
        body: JSON.stringify({})
      });
      message = `Backup criado: ${backup.fileName} (${formatSize(backup.size)}).`;
      await load();
      scheduleMessageClear(() => { message = ""; clearRenderedFeedback(root); });
    } catch (createError) {
      error = createError instanceof Error ? createError.message : String(createError);
    } finally {
      submitting = false;
      render();
    }
  };

  const restore = async (file) => {
    if (!file) return;
    const confirmed = await confirmAction({
      title: "Restaurar backup",
      message: "Restaurar este backup substituirá os dados atuais do banco.",
      detail: "Confirme somente se o arquivo e a data da cópia estiverem corretos.",
      confirmLabel: "Restaurar backup"
    });
    if (!confirmed) return;
    submitting = true;
    error = "";
    message = "";
    render();
    try {
      const result = await request("/api/backups/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backupBase64: toBase64(await file.arrayBuffer()),
        })
      });
      message = `Backup restaurado: ${result.result.rowCount} registro(s) em ${result.result.tableCount} tabela(s).`;
      scheduleMessageClear(() => { message = ""; clearRenderedFeedback(root); });
    } catch (restoreError) {
      error = restoreError instanceof Error ? restoreError.message : String(restoreError);
    } finally {
      submitting = false;
      render();
    }
  };

  const downloadBackup = async (fileName) => {
    message = "";
    error = "";
    try {
      const response = await apiFetch(`${getApiUrl()}/api/backups/download/${encodeURIComponent(fileName)}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Não foi possível baixar o backup.");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      message = `Download iniciado: ${fileName}.`;
      error = "";
    } catch (downloadError) {
      error = downloadError instanceof Error ? downloadError.message : String(downloadError);
    }
    render();
    scheduleMessageClear(() => { message = ""; clearRenderedFeedback(root); });
  };

  const render = () => {
    root.className = "catalog-screen settings-screen";
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - Backup e restauração</strong><span>Operador: Operador</span></header>
      ${renderMainMenu()}
      <div class="classic-toolbar"><button class="classic-tool-button" data-back type="button">← Frente de caixa</button><strong>Ferramentas do sistema</strong></div>
      <section class="settings-content">
        <div class="backoffice-home-heading">
          <p class="eyebrow">Ferramentas</p>
          <h1>Backup e restauração</h1>
          <p>Crie backups compactados do banco de dados e restaure uma cópia validada quando necessário.</p>
        </div>
        <section class="classic-form-panel">
          <div class="classic-panel-header">Operações de backup</div>
          <div class="classic-form-body">
            <p class="classic-empty">Os arquivos são gravados no servidor da API, sem expor as credenciais do MariaDB ao terminal.</p>
            <p class="api-service-note"><strong>Destino controlado pelo servidor</strong><br>O terminal não escolhe nem recebe o caminho físico dos backups.</p>
            ${renderSuccessFeedback(message, escapeHtml)}
            ${error ? `<p class="error-message">${escapeHtml(error)}</p>` : ""}
            <div class="classic-form-actions backup-primary-actions">
              <button class="classic-button primary" data-create type="button" ${submitting ? "disabled" : ""}>${submitting ? "Processando..." : "Criar backup agora"}</button>
              <label class="classic-button" for="backup-file">Restaurar backup compactado</label>
              <input id="backup-file" data-restore type="file" accept=".gz,application/gzip" hidden ${submitting ? "disabled" : ""}>
              <button class="classic-button" data-refresh type="button" ${loading || submitting ? "disabled" : ""}>Atualizar lista</button>
            </div>
            <p class="classic-empty">O destino é configurado no servidor pela variável <code>PDV_BACKUP_DIR</code> ou pelo diretório padrão da API.</p>
          </div>
        </section>
        <section class="classic-grid-panel backup-list-panel">
          <div class="classic-panel-header">Backups disponíveis</div>
          ${loading ? '<p class="classic-empty">Carregando backups...</p>' : backups.length
            ? `<div class="classic-table-wrapper"><table class="classic-table"><thead><tr><th>Arquivo</th><th>Data/hora</th><th>Tamanho</th><th>Ação</th></tr></thead><tbody>${backups.map((backup) => `<tr><td>${escapeHtml(backup.fileName)}</td><td class="backup-date">${formatDateTime(backup.createdAt, backup.fileName)}</td><td>${formatSize(backup.size)}</td><td><button class="classic-button backup-download" data-download-backup="${escapeHtml(backup.fileName)}" type="button">Baixar</button></td></tr>`).join("")}</tbody></table></div>`
            : '<p class="classic-empty">Nenhum backup compactado foi criado.</p>'}
        </section>
      </section>
    `;
    bindMainMenu(root, {
      products: onProducts, "fiscal-operations": onFiscalOperations, "thermal-print": onThermalPrint,
      "ncm-cest-update": onNcmCestUpdate, "api-status": onTools, settings: onSettings,
      company: onCompany, nfce: onNfce, financial: onFinancial, "payment-methods": onPaymentMethods,
      backup: onTools
    });
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    root.querySelector("[data-create]")?.addEventListener("click", () => void create());
    root.querySelector("[data-refresh]")?.addEventListener("click", () => void load());
    root.querySelectorAll("[data-download-backup]").forEach((button) => {
      button.addEventListener("click", () => void downloadBackup(button.dataset.downloadBackup));
    });
    root.querySelector("[data-restore]")?.addEventListener("change", (event) => void restore(event.currentTarget.files?.[0]));
  };

  render();
  void load();
  return root;
}
