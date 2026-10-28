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
  let error = "";

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
            <section class="api-service-note" aria-label="Recuperação automática da API">
              <strong>Recuperação automática ativa</strong>
              <p>O serviço Windows PDV-API inicia com o MariaDB e tenta recuperar a API automaticamente após uma falha.</p>
              <small>Para manutenção manual, use os scripts administrativos documentados em Instalação e publicação.</small>
            </section>
          </div>
          <div class="classic-form-actions">
            <button class="classic-button primary" data-refresh type="button" ${loading ? "disabled" : ""}>${loading ? "Consultando..." : "Atualizar status"}</button>
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

  const bind = () => {
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    root.querySelector("[data-refresh]")?.addEventListener("click", () => void load());
  };

  render();
  void load();
  return root;
}
