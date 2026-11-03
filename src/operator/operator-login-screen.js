import {
  apiFetch,
  clearOperatorSessionToken,
  getApiUrl,
  saveConfiguredApiUrl,
  saveOperatorSessionToken,
  validateConfiguredApiUrl
} from "../shared/api.js";
import { renderLucideIcons } from "../ui/icons.js";

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

export function createOperatorLoginScreen({
  onAuthenticated,
  initialError = ""
} = {}) {
  const root = document.createElement("main");
  root.className = "auth-screen";
  root.innerHTML = `
    <section class="auth-shell">
      <div class="auth-intro">
        <h1>Entre para continuar</h1>
        <p>Acesse a operação da loja com seu usuário e senha individuais.</p>
        <div class="auth-points" aria-label="Ambientes disponíveis">
          <span><strong>Acesso individual</strong><small>Credenciais próprias para cada operador</small></span>
          <span><strong>Operação protegida</strong><small>Permissões aplicadas pelo servidor</small></span>
        </div>
      </div>

      <div class="auth-panel">
        <div class="auth-heading">
          <h2 data-title>Entrar no PDV</h2>
          <p data-subtitle>Informe suas credenciais para autenticar seu acesso.</p>
        </div>

        <form data-login-form>
          <label class="form-field">
            <span>Usuário</span>
            <input name="usernameOperator" autocomplete="username" autofocus required />
          </label>
          <label class="form-field">
            <span>Senha</span>
            <input name="passwordOperator" type="password" autocomplete="current-password" required />
          </label>
          <p class="auth-feedback error-state" data-error>${escapeHtml(initialError)}</p>
          <div class="auth-actions">
            <button class="primary-button auth-submit" type="submit" data-submit>Entrar</button>
            <button class="auth-api-button" data-open-api-config type="button" aria-label="Configurar conexão com a API" title="Configurar conexão com a API"><i data-lucide="database"></i></button>
          </div>
        </form>

      </div>
    </section>
    <div class="classic-modal-backdrop auth-api-backdrop" data-api-config-backdrop hidden>
      <section class="classic-modal auth-api-modal" role="dialog" aria-modal="true" aria-labelledby="auth-api-config-title">
        <div class="classic-panel-header modal-panel-header">
          <span id="auth-api-config-title">Configuração da API</span>
          <button class="modal-close-button" data-close-api-config type="button" aria-label="Fechar" title="Fechar">×</button>
        </div>
        <form data-api-config-form>
          <div class="classic-form-body">
            <p class="modal-help-text">Informe o endereço do servidor que atende este terminal.</p>
            <label class="form-field">
              <span>Endereço da API</span>
              <input name="apiUrl" type="url" inputmode="url" autocomplete="off" placeholder="http://192.168.0.10:3000" value="${escapeHtml(getApiUrl())}" required />
            </label>
            <p class="error-message" data-api-config-error></p>
            <p class="success-message" data-api-config-success role="status"></p>
          </div>
          <div class="classic-form-actions">
            <button class="classic-button" type="button" data-api-config-test>Testar</button>
            <button class="classic-button primary" type="submit" data-api-config-submit disabled>Salvar</button>
            <button class="classic-button" data-close-api-config type="button">Cancelar</button>
          </div>
        </form>
      </section>
    </div>
  `;

  const form = root.querySelector("[data-login-form]");
  const error = root.querySelector("[data-error]");
  const submit = root.querySelector("[data-submit]");
  const apiBackdrop = root.querySelector("[data-api-config-backdrop]");
  const apiForm = root.querySelector("[data-api-config-form]");
  const apiError = root.querySelector("[data-api-config-error]");
  const apiSuccess = root.querySelector("[data-api-config-success]");
  const apiTest = root.querySelector("[data-api-config-test]");
  const apiSubmit = root.querySelector("[data-api-config-submit]");
  let testedApiUrl = "";
  let apiRequestPending = false;

  const closeApiConfig = () => {
    if (!apiRequestPending) apiBackdrop.hidden = true;
  };

  root.querySelector("[data-open-api-config]").addEventListener("click", () => {
    apiError.textContent = "";
    apiSuccess.textContent = "";
    testedApiUrl = "";
    apiSubmit.disabled = true;
    apiRequestPending = false;
    apiBackdrop.hidden = false;
    apiForm.elements.apiUrl.focus();
  });
  root.querySelectorAll("[data-close-api-config]").forEach((button) => {
    button.addEventListener("click", closeApiConfig);
  });
  apiBackdrop.addEventListener("click", (event) => {
    if (event.target === apiBackdrop) closeApiConfig();
  });
  apiForm.elements.apiUrl.addEventListener("input", () => {
    testedApiUrl = "";
    apiError.textContent = "";
    apiSuccess.textContent = "";
    apiSubmit.disabled = true;
  });

  const testApiConnection = async () => {
    apiError.textContent = "";
    apiSuccess.textContent = "";
    apiRequestPending = true;
    apiTest.disabled = true;
    apiSubmit.disabled = true;
    testedApiUrl = "";
    try {
      const configuredUrl = validateConfiguredApiUrl(apiForm.elements.apiUrl.value);
      const response = await apiFetch(`${configuredUrl}/api/health`);
      if (!response.ok) {
        throw new Error(`A API respondeu com status ${response.status}. Verifique o endereço informado.`);
      }
      testedApiUrl = configuredUrl;
      apiSuccess.textContent = "Conexão testada com sucesso.";
    } catch (caughtError) {
      apiError.textContent = caughtError instanceof TypeError && /fetch/i.test(caughtError.message)
        ? "Não foi possível conectar à API. Verifique o endereço e se o servidor está ligado."
        : caughtError.message;
    } finally {
      apiRequestPending = false;
      apiTest.disabled = false;
      apiSubmit.disabled = !testedApiUrl;
    }
  };

  apiTest.addEventListener("click", () => void testApiConnection());
  apiForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    apiError.textContent = "";
    apiSuccess.textContent = "";
    apiRequestPending = true;
    apiSubmit.disabled = true;
    apiTest.disabled = true;
    try {
      const configuredUrl = validateConfiguredApiUrl(apiForm.elements.apiUrl.value);
      if (configuredUrl !== testedApiUrl) {
        throw new Error("Teste a conexão desta URL antes de salvar.");
      }
      await saveConfiguredApiUrl(configuredUrl);
      apiForm.elements.apiUrl.value = configuredUrl;
      apiBackdrop.hidden = true;
    } catch (caughtError) {
      apiError.textContent = caughtError.message;
    } finally {
      apiRequestPending = false;
      apiTest.disabled = false;
      apiSubmit.disabled = !testedApiUrl;
    }
  });
  renderLucideIcons(root);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    submit.disabled = true;
    try {
      await clearOperatorSessionToken();
      const formData = new FormData(form);
      const loginResponse = await apiFetch(`${getApiUrl()}/api/operator/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usernameOperator: formData.get("usernameOperator"),
          passwordOperator: formData.get("passwordOperator")
        })
      });
      const loginPayload = await loginResponse.json();
      if (!loginResponse.ok) throw new Error(loginPayload.error || "Não foi possível entrar.");
      await saveOperatorSessionToken(loginPayload.token);
      window.__PDV_OPERATOR__ = loginPayload.operator || null;
      await onAuthenticated?.();
    } catch (caughtError) {
      await clearOperatorSessionToken().catch(() => {});
      error.textContent = caughtError.message;
    } finally {
      submit.disabled = false;
    }
  });

  return root;
}

export function createEnvironmentSelectionScreen({
  onFrontOfCash,
  onCash,
  onBackoffice,
  onChangeUser
} = {}) {
  const root = document.createElement("main");
  root.className = "environment-dashboard";
  let cashSession = null;
  const operator = window.__PDV_OPERATOR__ || {};
  const operatorName = operator.displayNameOperator || operator.usernameOperator || "Operador";

  const render = () => {
    root.innerHTML = `
      <header class="environment-dashboard-header">
        <div class="environment-brand">
          <span class="environment-brand-mark" aria-hidden="true"><i data-lucide="store"></i></span>
          <strong>PDV</strong>
        </div>
        <div class="environment-status">
          <span class="environment-status-item"><i data-lucide="user-round"></i><strong>${escapeHtml(operatorName)}</strong></span>
          <span class="environment-status-divider" aria-hidden="true"></span>
          <span class="environment-status-item"><i data-lucide="wallet-cards"></i><strong>Caixa ${cashSession ? "aberto" : "fechado"}</strong></span>
        </div>
      </header>
      <section class="environment-dashboard-content">
        <div class="environment-dashboard-heading">
          <p>Olá, ${escapeHtml(operatorName)}</p>
          <h1>Escolha onde deseja trabalhar</h1>
        </div>
        <div class="environment-module-grid" aria-label="Ambientes disponíveis">
          <button class="environment-module environment-module-sales" data-front type="button">
            <span class="environment-module-icon" aria-hidden="true"><i data-lucide="shopping-cart"></i></span>
            <strong>Vendas</strong>
            <small>Registrar vendas e pagamentos</small>
          </button>
          <button class="environment-module environment-module-cash" data-cash type="button">
            <span class="environment-module-icon" aria-hidden="true"><i data-lucide="wallet-cards"></i></span>
            <strong>Caixa</strong>
            <small>Abertura e movimentações financeiras</small>
          </button>
          <button class="environment-module environment-module-backoffice" data-backoffice type="button">
            <span class="environment-module-icon" aria-hidden="true"><i data-lucide="landmark"></i></span>
            <strong>Retaguarda</strong>
            <small>Cadastros e configurações</small>
          </button>
        </div>
        <button class="environment-change-user" data-change-user type="button">Trocar usuário</button>
      </section>
    `;
    renderLucideIcons(root);
    root.querySelector("[data-front]").addEventListener("click", () => onFrontOfCash?.());
    root.querySelector("[data-cash]").addEventListener("click", () => onCash?.());
    root.querySelector("[data-backoffice]").addEventListener("click", () => onBackoffice?.());
    root.querySelector("[data-change-user]").addEventListener("click", () => onChangeUser?.());
  };

  render();
  void apiFetch(`${getApiUrl()}/api/cash/current`)
    .then(async (response) => {
      if (!response.ok) throw new Error("Não foi possível consultar o estado do caixa.");
      const payload = await response.json();
      cashSession = payload.cashSession;
      render();
    })
    .catch((error) => {
      console.error("Não foi possível carregar o estado do caixa na seleção de ambiente:", error);
    });

  return root;
}
