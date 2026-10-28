import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";

const getApiUrl = () =>
  window.__PDV_API_URL__ || `http://${window.location.hostname}:3000`;

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatDate = (value) => {
  if (!value) return "Não informado";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Não informado" : date.toLocaleString("pt-BR");
};

const formatUptime = (seconds) => {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total < 0) return "Não informado";
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  return [
    days ? `${days}d` : "",
    hours ? `${hours}h` : "",
    minutes ? `${minutes}min` : "",
    `${remainingSeconds}s`
  ].filter(Boolean).join(" ");
};

export function createApiStatusScreen({
  onBack,
  onClasses,
  onGroups,
  onProducts,
  onFiscalOperations,
  onThermalPrint,
  onNcmCestUpdate,
  onApiStatus,
  onSettings,
  onGeneralSettings,
  onCompany,
  onNfce,
  onNavigationBuilder,
  onFinancial,
  onPaymentMethods
}) {
  const root = document.createElement("main");
  let status = null;
  let loading = true;
  let restarting = false;
  let message = "";
  let error = "";
  let restartLog = [];

  const addRestartLog = (message, tone = "info") => {
    restartLog = [
      ...restartLog,
      {
        message,
        tone,
        time: new Date().toLocaleTimeString("pt-BR")
      }
    ];
    render();
  };

  const request = async (path, options) => {
    const response = await fetch(`${getApiUrl()}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Não foi possível concluir a operação.");
    return payload;
  };

  const render = () => {
    root.className = "catalog-screen settings-screen";
    const isConnected = status?.ok === true;
    root.innerHTML = `
      <header class="classic-titlebar">
        <strong>PDV - Status da API</strong>
        <span>Operador: Operador</span>
      </header>
      ${renderMainMenu()}
      <div class="classic-toolbar">
        <button class="classic-tool-button" data-back type="button">← Retaguarda</button>
        <strong>Ferramentas do sistema</strong>
      </div>
      <section class="settings-content">
        <div class="backoffice-home-heading">
          <p class="eyebrow">Ferramentas</p>
          <h1>Status da API</h1>
          <p>Consulte a disponibilidade do servidor do PDV e da conexão com o MariaDB.</p>
        </div>
        <section class="classic-form-panel api-status-panel" aria-live="polite">
          <div class="classic-panel-header">Disponibilidade do serviço</div>
          <div class="classic-form-body">
            ${loading
              ? '<p class="classic-empty">Consultando o status da API...</p>'
              : `<div class="api-status-summary ${isConnected ? "is-connected" : "is-unavailable"}">
                  <span class="api-status-indicator" aria-hidden="true"></span>
                  <div>
                    <strong>${isConnected ? "API online" : "API indisponível"}</strong>
                    <small>${isConnected ? "O servidor respondeu e o banco de dados está conectado." : "Não foi possível confirmar a disponibilidade do servidor."}</small>
                  </div>
                </div>
                <dl class="api-status-details">
                  <div><dt>Servidor da API</dt><dd>${isConnected ? "Online" : "Indisponível"}</dd></div>
                  <div><dt>MariaDB</dt><dd>${escapeHtml(status?.database === "connected" ? "Conectado" : "Indisponível")}</dd></div>
                  <div><dt>Iniciada em</dt><dd>${escapeHtml(formatDate(status?.startedAt))}</dd></div>
                  <div><dt>Tempo de atividade</dt><dd>${escapeHtml(formatUptime(status?.uptimeSeconds))}</dd></div>
                  <div><dt>Endereço consultado</dt><dd>${escapeHtml(getApiUrl())}</dd></div>
                </dl>`}
            ${error ? `<p class="error-message">${escapeHtml(error)}</p>` : ""}
            ${message ? `<p class="success-message">${escapeHtml(message)}</p>` : ""}
            <section class="api-restart-log" aria-live="polite" aria-label="Log do reinício da API">
              <div class="api-restart-log-heading">
                <strong>Log do reinício</strong>
                ${restartLog.length ? `<span>${restartLog.length} ${restartLog.length === 1 ? "evento" : "eventos"}</span>` : ""}
              </div>
              ${restartLog.length
                ? `<ol>${restartLog.map((entry) => `
                    <li class="api-restart-log-entry is-${escapeHtml(entry.tone)}">
                      <span class="api-restart-log-dot" aria-hidden="true"></span>
                      <span class="api-restart-log-time">${escapeHtml(entry.time)}</span>
                      <span>${escapeHtml(entry.message)}</span>
                    </li>
                  `).join("")}</ol>`
                : '<p class="api-restart-log-empty">Nenhum reinício foi solicitado nesta sessão.</p>'}
            </section>
          </div>
          <div class="classic-form-actions">
            <button class="classic-button primary" data-refresh type="button" ${loading || restarting ? "disabled" : ""}>${loading ? "Consultando..." : "Atualizar status"}</button>
            <button class="classic-button danger" data-restart type="button" ${loading || restarting || !isConnected ? "disabled" : ""}>${restarting ? "Reiniciando..." : "Reiniciar API"}</button>
          </div>
        </section>
      </section>
    `;
    bindMainMenu(root, {
      products: onProducts,
      "fiscal-operations": onFiscalOperations,
      "thermal-print": onThermalPrint,
      "ncm-cest-update": onNcmCestUpdate,
      "api-status": onApiStatus,
      settings: onSettings,
      "general-settings": onGeneralSettings,
      company: onCompany,
      nfce: onNfce,
      "navigation-builder": onNavigationBuilder,
      financial: onFinancial,
      "payment-methods": onPaymentMethods
    });
    bind();
  };

  const load = async () => {
    loading = true;
    error = "";
    render();
    try {
      status = await request("/api/health");
    } catch (loadError) {
      status = null;
      error = loadError instanceof Error ? loadError.message : String(loadError);
    } finally {
      loading = false;
      render();
    }
  };

  const restart = async () => {
    if (!window.confirm("Deseja reiniciar a API agora? O serviço ficará indisponível por alguns segundos.")) return;
    restarting = true;
    message = "";
    error = "";
    restartLog = [];
    render();
    try {
      addRestartLog("Enviando solicitação de reinício para a API.");
      await request("/api/restart", { method: "POST" });
      addRestartLog("Solicitação aceita. A instância atual está sendo encerrada.", "warning");
      message = "Reinício solicitado. Aguardando a API voltar...";
      addRestartLog("Aguardando a nova instância responder.");
      const startedAt = Date.now();
      let attempts = 0;
      while (Date.now() - startedAt < 15000) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        attempts += 1;
        try {
          status = await request("/api/health");
          addRestartLog(`API online novamente após ${attempts} tentativa${attempts === 1 ? "" : "s"}.`, "success");
          message = "API reiniciada e online novamente.";
          return;
        } catch {
          addRestartLog(`Tentativa ${attempts}: API ainda indisponível.`, "warning");
        }
      }
      addRestartLog("Tempo limite atingido sem reconectar à API.", "error");
      throw new Error("A API não voltou a responder dentro do tempo esperado.");
    } catch (restartError) {
      status = null;
      error = restartError instanceof Error ? restartError.message : String(restartError);
      if (!restartLog.some((entry) => entry.tone === "error")) {
        addRestartLog(error, "error");
      }
    } finally {
      restarting = false;
      loading = false;
      render();
    }
  };

  const bind = () => {
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    root.querySelector("[data-refresh]")?.addEventListener("click", () => void load());
    root.querySelector("[data-restart]")?.addEventListener("click", () => void restart());
  };

  render();
  void load();
  return root;
}
