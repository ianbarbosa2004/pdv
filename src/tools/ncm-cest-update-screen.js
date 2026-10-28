import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { renderLucideIcons } from "../ui/icons.js";

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
  if (!value) return "Nunca executada";
  return new Date(value).toLocaleString("pt-BR");
};

export function createNcmCestUpdateScreen({ onBack, onTools, onProducts, onThermalPrint, onSettings, onCompany, onNfce, onFinancial, onPaymentMethods }) {
  const root = document.createElement("main");
  let statusLoading = true;
  let updating = false;
  let status = null;
  let message = "";
  let error = "";

  const loadStatus = async () => {
    statusLoading = true;
    error = "";
    render();
    try {
      const response = await fetch(`${getApiUrl()}/api/ncm-cest/update-status`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível consultar a atualização.");
      status = payload;
    } catch (requestError) {
      error = requestError.message || "Não foi possível consultar o status.";
    } finally {
      statusLoading = false;
      render();
    }
  };

  const update = async () => {
    updating = true;
    message = "";
    error = "";
    render();
    try {
      const response = await fetch(`${getApiUrl()}/api/ncm-cest/update`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar os catálogos.");
      message = `Atualização concluída: ${payload.ncmCount} NCMs, ${payload.cestCount} CESTs e ${payload.relationCount} relações.`;
      await loadStatus();
    } catch (requestError) {
      error = requestError.message || "Não foi possível atualizar os catálogos.";
    } finally {
      updating = false;
      render();
    }
  };

  const render = () => {
    root.className = "catalog-screen ncm-cest-update-screen";
    const update = status?.update;
    const updateMessage = update?.message === "fetch failed"
      ? "A fonte oficial não pôde ser acessada pelo servidor. Nenhum dado foi alterado."
      : update?.message;
    root.innerHTML = `
      <header class="classic-titlebar">
        <strong>PDV - Atualizar NCM / CEST</strong>
        <span>Operador: Operador</span>
      </header>
      ${renderMainMenu()}
      <div class="classic-toolbar">
        <button class="classic-tool-button" data-back type="button">← Retaguarda</button>
        <button class="classic-tool-button is-active" data-ncm-cest-update type="button">Atualizar NCM / CEST</button>
      </div>
      <section class="classic-content">
        <div class="classic-form-panel">
          <div class="classic-panel-header">Atualização dos catálogos oficiais</div>
          <div class="classic-form-body">
            <p>Baixe a NCM vigente da Receita Federal e a tabela CEST publicada pelo CONFAZ. A operação substitui apenas o catálogo ativo e mantém o histórico da execução.</p>
            <p><strong>Minas Gerais:</strong> NCM e CEST são catálogos nacionais. Regras de ICMS específicas de MG não são alteradas por esta atualização.</p>
            <dl class="catalog-update-sources">
              <dt>Fonte NCM</dt>
              <dd>${escapeHtml(status?.sources?.ncm || "Carregando...")}</dd>
              <dt>Fonte CEST</dt>
              <dd>${escapeHtml(status?.sources?.cest || "Carregando...")}</dd>
            </dl>
            ${statusLoading ? "<p>Consultando o último status...</p>" : ""}
            ${update ? `
              <p><strong>Última execução:</strong> ${escapeHtml(formatDate(update.completedAt || update.startedAt))}</p>
              <p><strong>Status:</strong> ${escapeHtml(update.status)} — ${escapeHtml(updateMessage || "")}</p>
              <p><strong>Registros:</strong> ${update.ncmCount} NCMs, ${update.cestCount} CESTs e ${update.relationCount} relações.</p>
            ` : ""}
            ${message ? `<p class="success-message">${escapeHtml(message)}</p>` : ""}
            ${error ? `<p class="error-message">${escapeHtml(error)}</p>` : ""}
          </div>
          <div class="classic-form-actions">
            <button class="classic-button primary" data-update type="button" ${statusLoading || updating ? "disabled" : ""} aria-busy="${updating}">
              <i data-lucide="${updating ? "loader-circle" : "refresh-cw"}" ${updating ? 'class="is-spinning"' : ""}></i>
              ${updating ? "Atualizando catálogos..." : "Atualizar agora"}
            </button>
            <button class="classic-button" data-refresh type="button" ${statusLoading || updating ? "disabled" : ""}>
              <i data-lucide="refresh-cw"></i> ${statusLoading ? "Consultando..." : "Consultar status"}
            </button>
          </div>
        </div>
      </section>
    `;
    renderLucideIcons(root);
    bindMainMenu(root, {
      products: onProducts,
      "thermal-print": onThermalPrint,
      "ncm-cest-update": onTools,
      settings: onSettings,
      company: onCompany,
      nfce: onNfce,
      financial: onFinancial,
      "payment-methods": onPaymentMethods
    });
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    root.querySelector("[data-update]")?.addEventListener("click", update);
    root.querySelector("[data-refresh]")?.addEventListener("click", loadStatus);
  };

  render();
  void loadStatus();
  return root;
}
