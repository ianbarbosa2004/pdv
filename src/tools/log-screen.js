import { apiFetch, getApiUrl } from "../shared/api.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { renderScreenContextBar } from "../ui/screen-context.js";
import { renderNavigationIntro } from "../ui/navigation-intro.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const formatDateTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Não informado"
    : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
};

const levelLabel = {
  debug: "Debug",
  info: "Informação",
  warn: "Aviso",
  error: "Erro"
};

const formatDuration = (value) => {
  const duration = Number(value);
  return Number.isFinite(duration) && duration >= 0 ? `${duration} ms` : "-";
};

export function createLogScreen({
  onBack, onTools, onProducts, onFiscalOperations, onThermalPrint,
  onNcmCestUpdate, onApiStatus, onBackup, onSettings, onCompany,
  onNfce, onFinancial, onPaymentMethods
}) {
  const root = document.createElement("main");
  let logs = [];
  let loading = true;
  let error = "";
  let source = "all";
  let level = "all";
  let retentionDays = 14;
  let selectedLog = null;

  const load = async () => {
    loading = true;
    error = "";
    render();
    try {
      const parameters = new URLSearchParams({ limit: "500" });
      if (source !== "all") parameters.set("source", source);
      if (level !== "all") parameters.set("level", level);
      const response = await apiFetch(`${getApiUrl()}/api/logs?${parameters}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar os logs.");
      logs = (payload.logs || []).filter((entry) => {
        if (String(entry.operationTechnicalLog || "").toLowerCase() !== "http") return true;
        const statusCode = Number(entry.statusCodeTechnicalLog);
        if (Number.isFinite(statusCode)) return statusCode >= 400;
        return Number(entry.successTechnicalLog) !== 1;
      });
      retentionDays = payload.retentionDays || 14;
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Não foi possível carregar os logs.";
    } finally {
      loading = false;
      render();
    }
  };

  const exportLog = async () => {
    const parameters = new URLSearchParams({ limit: "1000" });
    if (source !== "all") parameters.set("source", source);
    if (level !== "all") parameters.set("level", level);
    const response = await apiFetch(`${getApiUrl()}/api/logs/export?${parameters}`);
    if (!response.ok) {
      error = "Não foi possível exportar os logs.";
      render();
      return;
    }
    const objectUrl = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = "pdv-log.txt";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  };

  const render = () => {
    root.className = "catalog-screen settings-screen log-screen";
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - Log técnico</strong><span>Operador: Operador</span></header>
      ${renderMainMenu()}
      ${renderScreenContextBar("Log técnico")}
      <section class="settings-content log-content">
        ${renderNavigationIntro("log", "Log técnico", `Histórico técnico protegido por até ${retentionDays} dias, sem payloads ou dados de pagamento.`)}
        <section class="classic-form-panel log-panel" aria-live="polite">
          <div class="classic-panel-header log-panel-header">
            <span>Eventos recentes</span>
            ${loading ? "" : `<span class="log-event-count">${logs.length} ${logs.length === 1 ? "evento" : "eventos"}</span>`}
          </div>
          <div class="classic-form-body">
            <div class="classic-form-actions log-filter-actions">
              <label class="log-filter-field">Origem
                <select data-log-source>
                  ${[
                    ["all", "Todas"], ["api", "API"], ["frontend", "Frontend"],
                    ["vite", "Vite"], ["cargo", "Cargo"], ["database", "MariaDB"],
                    ["backup", "Backup"], ["tauri", "Tauri"],
                    ["service", "Serviço"], ["printer", "Impressora"], ["system", "Sistema"]
                  ].map(([value, label]) => `<option value="${value}" ${source === value ? "selected" : ""}>${label}</option>`).join("")}
                </select>
              </label>
              <label class="log-filter-field">Nível
                <select data-log-level>
                  ${[
                    ["all", "Todos"], ["debug", "Debug"], ["info", "Informação"],
                    ["warn", "Aviso"], ["error", "Erro"]
                  ].map(([value, label]) => `<option value="${value}" ${level === value ? "selected" : ""}>${label}</option>`).join("")}
                </select>
              </label>
              <button class="classic-button" data-log-refresh type="button" ${loading ? "disabled" : ""}>${loading ? "Atualizando..." : "Atualizar"}</button>
              <button class="classic-button" data-log-export type="button" ${loading ? "disabled" : ""}>Exportar TXT</button>
            </div>
            ${error ? `<p class="error-message">${escapeHtml(error)}</p>` : ""}
            ${loading ? `<p class="classic-empty">Carregando eventos...</p>` : logs.length ? `
              <div class="classic-grid-wrapper log-table-wrapper">
                <table class="classic-table log-table">
                  <thead><tr><th>Data/hora</th><th>Origem</th><th>Nível</th><th>Operação</th><th>Mensagem</th><th>Duração</th><th>Status</th></tr></thead>
                  <tbody>${logs.map((entry) => {
                    const levelValue = String(entry.levelTechnicalLog || "info").toLowerCase();
                    const logLocation = entry.logFileName
                      ? `${entry.logFileName}${entry.logLineNumber ? `:${entry.logLineNumber}` : ""}`
                      : "";
                    const statusCode = entry.statusCodeTechnicalLog;
                    const statusLabel = statusCode
                      ? String(statusCode)
                      : Number(entry.successTechnicalLog) === 1 ? "OK" : "Falha";
                    const statusClass = statusCode
                      ? (Number(statusCode) >= 400 ? "is-error" : "is-success")
                      : Number(entry.successTechnicalLog) === 1 ? "is-success" : "is-error";
                    return `
                      <tr class="log-event-row" data-log-row="${escapeHtml(entry.idTechnicalLog)}" tabindex="0" role="button" aria-label="Abrir detalhes do evento técnico">
                        <td class="log-date-column">${escapeHtml(formatDateTime(entry.occurredAtTechnicalLog))}</td>
                        <td><span class="log-source-badge">${escapeHtml(entry.sourceTechnicalLog)}</span></td>
                        <td><span class="log-level-badge is-${escapeHtml(levelValue)}">${escapeHtml(levelLabel[levelValue] || levelValue)}</span></td>
                        <td>${escapeHtml(entry.operationTechnicalLog || "-")}${logLocation ? `<br><small title="${escapeHtml(logLocation)}">${escapeHtml(logLocation)}</small>` : ""}</td>
                        <td class="log-message-column">${escapeHtml(entry.messageTechnicalLog)}</td>
                        <td class="log-duration-column">${escapeHtml(formatDuration(entry.durationMsTechnicalLog))}</td>
                        <td><span class="log-status-badge ${statusClass}">${escapeHtml(statusLabel)}</span></td>
                      </tr>`;
                  }).join("")}</tbody>
                </table>
              </div>` : `<p class="classic-empty">Nenhum evento técnico encontrado.</p>`}
          </div>
        </section>
      </section>
      ${selectedLog ? `
        <div class="classic-modal-backdrop log-detail-backdrop" data-log-detail-backdrop>
          <section class="classic-modal log-detail-modal" role="dialog" aria-modal="true" aria-labelledby="log-detail-title">
            <div class="classic-panel-header modal-panel-header">
              <span id="log-detail-title">Detalhes do evento técnico</span>
              <button class="modal-close-button" data-log-detail-close type="button" aria-label="Fechar detalhes" title="Fechar">×</button>
            </div>
            <div class="log-detail-body">
              <dl class="log-detail-grid">
                <div><dt>Data/hora</dt><dd>${escapeHtml(formatDateTime(selectedLog.occurredAtTechnicalLog))}</dd></div>
                <div><dt>Origem</dt><dd>${escapeHtml(selectedLog.sourceTechnicalLog)}</dd></div>
                <div><dt>Nível</dt><dd>${escapeHtml(levelLabel[String(selectedLog.levelTechnicalLog || "info").toLowerCase()] || selectedLog.levelTechnicalLog)}</dd></div>
                <div><dt>Operação</dt><dd>${escapeHtml(selectedLog.operationTechnicalLog || "-")}</dd></div>
                <div><dt>Duração</dt><dd>${escapeHtml(formatDuration(selectedLog.durationMsTechnicalLog))}</dd></div>
                <div><dt>Status</dt><dd>${escapeHtml(selectedLog.statusCodeTechnicalLog || (Number(selectedLog.successTechnicalLog) === 1 ? "OK" : "Falha"))}</dd></div>
              </dl>
              <section class="log-detail-message" aria-label="Mensagem do evento">
                <strong>Mensagem</strong>
                <pre>${escapeHtml(selectedLog.messageTechnicalLog || "Sem mensagem.")}</pre>
              </section>
              ${selectedLog.logFileName ? `
                <dl class="log-detail-grid">
                  <div><dt>Arquivo</dt><dd>${escapeHtml(selectedLog.logFileName)}</dd></div>
                  <div><dt>Linha</dt><dd>${escapeHtml(selectedLog.logLineNumber || "-")}</dd></div>
                </dl>` : ""}
            </div>
            <div class="classic-form-actions">
              <button class="classic-button" data-log-detail-close type="button">Fechar</button>
            </div>
          </section>
        </div>` : ""}`;
    bindMainMenu(root, {
      onBack, onTools, onProducts, onFiscalOperations, onThermalPrint,
      onNcmCestUpdate, onApiStatus, onBackup, onSettings, onCompany,
      onNfce, onFinancial, onPaymentMethods
    });
    root.querySelector("[data-log-source]")?.addEventListener("change", (event) => {
      source = event.currentTarget.value;
      void load();
    });
    root.querySelector("[data-log-level]")?.addEventListener("change", (event) => {
      level = event.currentTarget.value;
      void load();
    });
    root.querySelector("[data-log-refresh]")?.addEventListener("click", () => void load());
    root.querySelector("[data-log-export]")?.addEventListener("click", () => void exportLog());
    root.querySelectorAll("[data-log-row]").forEach((row) => {
      const openDetails = () => {
        const id = String(row.dataset.logRow);
        selectedLog = logs.find((entry) => String(entry.idTechnicalLog) === id) || null;
        if (selectedLog) render();
      };
      row.addEventListener("click", openDetails);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetails();
        }
      });
    });
    root.querySelectorAll("[data-log-detail-close]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedLog = null;
        render();
      });
    });
    root.querySelector("[data-log-detail-backdrop]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) {
        selectedLog = null;
        render();
      }
    });
  };

  render();
  void load();
  return root;
}
