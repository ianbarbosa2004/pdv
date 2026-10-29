import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { renderLucideIcons } from "../ui/icons.js";
import { createFeedbackTimer, renderSuccessFeedback } from "../ui/feedback.js";
import { getApiUrl } from "../shared/api.js";

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function createNfceScreen({
  onBack,
  onProducts,
  onFiscalOperations,
  onThermalPrint,
  onNcmCestUpdate,
  onSettings,
  onCompany,
  onNfce,
  onFinancial,
  onPaymentMethods
}) {
  const root = document.createElement("main");
  let company = {};
  let loading = true;
  let saving = false;
  let error = "";
  let message = "";
  let testRunning = false;
  let testResult = null;
  let diagnosticRunning = false;
  let diagnosticResult = null;
  let selectedCertificate = null;
  let certificatePassword = "";
  const scheduleMessageClear = createFeedbackTimer();

  const normalizeDateInput = (value) => String(value ?? "").slice(0, 10);

  const render = () => {
    root.className = "catalog-screen";
    root.innerHTML = `
      <header class="classic-titlebar">
        <strong>PDV - Configuração NFC-e</strong>
        <span>Operador: Operador</span>
      </header>
      ${renderMainMenu()}
      <div class="classic-toolbar">
        <button class="classic-tool-button" data-back type="button">← Frente de caixa</button>
        <strong>Configurações do sistema</strong>
      </div>
      <section class="classic-content company-content">
        ${renderSuccessFeedback(message, escapeHtml)}
        <form class="classic-form-panel company-form" data-form>
          <div class="classic-panel-header">Fiscal - NFC-e</div>
          <div class="classic-form-body">
            <div class="company-info-note">Este PDV está configurado para emissão exclusiva de NFC-e.</div>
            <div class="classic-form-grid nfce-primary-grid">
              <label class="form-field">
                <span>UF de emissão</span>
                <select name="nfceStateCompany" required>
                  <option value="MG" ${company.nfceStateCompany === "MG" || !company.nfceStateCompany ? "selected" : ""}>MG - Minas Gerais</option>
                </select>
              </label>
              ${renderField("nfceModelCompany", "Modelo", "number", 65, true, { min: 65, value: company.nfceModelCompany || 65, readonly: true })}
              <label class="form-field">
                <span>Ambiente de emissão</span>
                <select name="nfceEnvironmentCompany" required>
                  <option value="homologation" ${company.nfceEnvironmentCompany !== "production" ? "selected" : ""}>Homologação - testes</option>
                  <option value="production" ${company.nfceEnvironmentCompany === "production" ? "selected" : ""}>Produção - validade fiscal</option>
                </select>
              </label>
              ${renderField("nfceSeriesCompany", "Série NFC-e", "number", 999, true)}
              ${renderField("nfceInitialNumberCompany", "Próximo número NFC-e", "number", 999999999, true)}
            </div>
            <div class="classic-form-grid">
              ${renderSecretField("nfceCscCompany", "CSC - produção", company.nfceCscCompany)}
              ${renderSecretField("nfceTokenCompany", "ID Token - produção", company.nfceTokenCompany)}
            </div>
            <div class="classic-form-grid">
              ${renderSecretField("nfceHomologationCscCompany", "CSC - homologação", company.nfceHomologationCscCompany)}
              ${renderSecretField("nfceHomologationTokenCompany", "ID Token - homologação", company.nfceHomologationTokenCompany)}
            </div>
            <div class="classic-form-grid company-grid-three nfce-certificate-grid">
              <label class="form-field">
                <span>Tipo de certificado</span>
                <select name="nfceCertificateTypeCompany" required>
                  <option value="A1" ${company.nfceCertificateTypeCompany !== "A3" ? "selected" : ""}>A1 - arquivo digital</option>
                  <option value="A3" ${company.nfceCertificateTypeCompany === "A3" ? "selected" : ""}>A3 - dispositivo</option>
                </select>
              </label>
              <label class="form-field">
                <span>Certificado A1 (.pfx/.p12)</span>
                <input name="nfceCertificateFileCompany" type="file" accept=".pfx,.p12,application/x-pkcs12" />
                <small>${escapeHtml(company.nfceCertificateNameCompany || "Nenhum arquivo selecionado")}</small>
              </label>
              ${renderSecretField("nfceCertificatePasswordCompany", "Senha do certificado", certificatePassword, true, false)}
            </div>
            <div class="classic-form-grid company-grid-three nfce-certificate-meta-grid">
              ${renderField("nfceCertificateExpiresCompany", "Validade do certificado", "date", 10, false, { readonly: true, disabled: true })}
              ${renderField("nfceCertificateSerialCompany", "Número de série do certificado digital", "text", 255, false, { readonly: true, disabled: true })}
              <label class="form-field">
                <span>Contingência</span>
                <select name="nfceContingencyCompany" required>
                  <option value="none" ${company.nfceContingencyCompany !== "offline" ? "selected" : ""}>Normal - online</option>
                  <option value="offline" ${company.nfceContingencyCompany === "offline" ? "selected" : ""}>Offline - somente em indisponibilidade</option>
                </select>
              </label>
            </div>
            <div class="company-info-note">O arquivo e a senha são criptografados antes de serem armazenados no servidor. Ao enviar um certificado A1, a validade e o número de série são extraídos automaticamente.</div>
            ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}
            ${testResult ? `
              <div class="nfce-test-result ${testResult.status === "authorized" ? "is-success" : "is-error"}">
                <strong>${testResult.status === "authorized" ? "NFC-e de teste autorizada" : "NFC-e de teste rejeitada"}</strong>
                <span>${escapeHtml(testResult.message || "")}</span>
                ${testResult.protocol ? `<span>Protocolo: ${escapeHtml(testResult.protocol)}</span>` : ""}
                ${testResult.accessKey ? `<span>Chave: ${escapeHtml(testResult.accessKey)}</span>` : ""}
              </div>
            ` : ""}
            ${diagnosticResult ? `
              <details class="nfce-diagnostic-result">
                <summary>Diagnóstico XML gerado localmente</summary>
                <p class="company-info-note">O XML foi gerado e assinado, mas não foi enviado à SEF/MG.</p>
                <div class="nfce-test-result">
                  <span>Chave: ${escapeHtml(diagnosticResult.accessKey || "")}</span>
                  <span>Emissão: ${escapeHtml(diagnosticResult.timestamp || "")}</span>
                  <textarea readonly rows="18" aria-label="XML NFC-e para diagnóstico">${escapeHtml(diagnosticResult.xml || "")}</textarea>
                </div>
              </details>
            ` : ""}
          </div>
          <div class="classic-form-actions">
            <button class="classic-button" data-diagnostic-nfce type="button" ${loading || saving || testRunning || diagnosticRunning || company.nfceEnvironmentCompany === "production" ? "disabled" : ""}>${diagnosticRunning ? "Gerando XML..." : "Gerar XML para diagnóstico"}</button>
            <button class="classic-button" data-test-nfce type="button" ${loading || saving || testRunning || company.nfceEnvironmentCompany === "production" ? "disabled" : ""}>${testRunning ? "Testando..." : "Testar emissão em homologação"}</button>
            <button class="classic-button primary" type="submit" ${loading || saving ? "disabled" : ""}>${saving ? "Salvando..." : "Salvar NFC-e"}</button>
          </div>
        </form>
      </section>
    `;
    renderLucideIcons(root);
    bindMainMenu(root, {
      products: onProducts,
      "fiscal-operations": onFiscalOperations,
      "thermal-print": onThermalPrint,
      "ncm-cest-update": onNcmCestUpdate,
      settings: onSettings,
      company: onCompany,
      nfce: onNfce,
      financial: onFinancial,
      "payment-methods": onPaymentMethods
    });
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    root.querySelector("[data-test-nfce]")?.addEventListener("click", () => {
      void testEmission();
    });
    root.querySelector("[data-diagnostic-nfce]")?.addEventListener("click", () => {
      void generateDiagnostic();
    });
    root.querySelectorAll("[data-toggle-secret]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = root.querySelector(`[name="${button.dataset.toggleSecret}"]`);
        if (!input) return;
        const visible = input.type === "text";
        input.type = visible ? "password" : "text";
        button.innerHTML = `<i data-lucide="${visible ? "eye" : "eye-off"}"></i>`;
        button.setAttribute("aria-label", visible ? "Mostrar campo" : "Ocultar campo");
        renderLucideIcons(button);
      });
    });
    root.querySelector("[name='nfceCertificatePasswordCompany']")?.addEventListener("input", (event) => {
      certificatePassword = event.currentTarget.value;
    });
    root.querySelector("[name='nfceCertificateFileCompany']")?.addEventListener("change", (event) => {
      selectedCertificate = event.currentTarget.files?.[0] || null;
    });
    root.querySelector("[data-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void save(Object.fromEntries(new FormData(event.currentTarget)));
    });
  };

  const renderSecretField = (name, label, value, isCertificatePassword = false, showToggle = true) => `
    <label class="form-field secret-field">
      <span>${label}</span>
      <div class="secret-input-control">
        <input name="${name}" type="password" maxlength="255" autocomplete="new-password" value="${escapeHtml(value ?? "")}" />
        ${showToggle ? `<button class="icon-button" type="button" data-toggle-secret="${name}" title="Visualizar campo" aria-label="Mostrar campo"><i data-lucide="eye"></i></button>` : ""}
      </div>
      ${isCertificatePassword ? "<small>Obrigatória para usar o arquivo A1 protegido.</small>" : ""}
    </label>
  `;

  const renderField = (name, label, type = "text", max = 255, required = false, options = {}) => {
    const numeric = type === "number";
    const value = type === "date"
      ? normalizeDateInput(options.value ?? company[name])
      : options.value ?? company[name] ?? "";
    const attributes = [
      numeric ? `min="${options.min ?? 1}" max="${max}" step="1"` : "",
      required ? "required" : "",
      options.readonly ? "readonly" : "",
      options.disabled ? "disabled" : "",
      type === "date" ? "autocomplete=\"off\"" : ""
    ].filter(Boolean).join(" ");
    return `
      <label class="form-field">
        <span>${label}</span>
        <input name="${name}" type="${type}" maxlength="${numeric ? "" : max}" ${attributes} value="${escapeHtml(value)}" />
      </label>
    `;
  };

  const load = async () => {
    loading = true;
    render();
    try {
      const response = await fetch(`${getApiUrl()}/api/company/nfce`);
      const payload = await response.json();
      if (!response.ok || !payload.nfce) throw new Error(payload.error || "Não foi possível carregar a configuração NFC-e.");
      company = payload.nfce;
      error = "";
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Falha ao carregar a configuração NFC-e.";
    } finally {
      loading = false;
      render();
    }
  };

  const save = async (form) => {
    saving = true;
    error = "";
    message = "";
    render();
    try {
      const payload = { ...form };
      delete payload.nfceCertificatePasswordCompany;
      delete payload.nfceCertificateFileCompany;
      payload.nfceCertificateExpiresCompany = company.nfceCertificateExpiresCompany || "";
      payload.nfceCertificateSerialCompany = company.nfceCertificateSerialCompany || "";
      if (selectedCertificate) {
        payload.nfceCertificateFileDataCompany = await readCertificate(selectedCertificate);
        payload.nfceCertificateNameCompany = selectedCertificate.name;
        payload.nfceCertificatePasswordCompany = certificatePassword;
      } else if (certificatePassword) {
        payload.nfceCertificatePasswordCompany = certificatePassword;
      }
      const response = await fetch(`${getApiUrl()}/api/company/nfce`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.nfce) throw new Error(result.error || "Não foi possível salvar a configuração NFC-e.");
      company = result.nfce;
      selectedCertificate = null;
      certificatePassword = "";
      message = "Configuração NFC-e salva com sucesso.";
      scheduleMessageClear(() => {
        message = "";
        render();
      });
    } catch (saveError) {
      error = saveError instanceof Error ? saveError.message : "Falha ao salvar a configuração NFC-e.";
    } finally {
      saving = false;
      render();
    }
  };

  const testEmission = async () => {
    testRunning = true;
    error = "";
    message = "";
    testResult = null;
    render();
    try {
      const response = await fetch(`${getApiUrl()}/api/company/nfce/test`, { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.test) throw new Error(result.error || "Não foi possível testar a emissão NFC-e.");
      testResult = result.test;
      message = testResult.status === "authorized"
        ? "Teste de homologação concluído com autorização."
        : "A SEF/MG respondeu com rejeição ao teste.";
      scheduleMessageClear(() => {
        message = "";
        render();
      });
    } catch (testError) {
      error = testError instanceof Error ? testError.message : "Falha ao testar a emissão NFC-e.";
    } finally {
      testRunning = false;
      render();
    }
  };

  const generateDiagnostic = async () => {
    diagnosticRunning = true;
    error = "";
    message = "";
    diagnosticResult = null;
    render();
    try {
      const response = await fetch(`${getApiUrl()}/api/company/nfce/diagnostic`, { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.diagnostic) {
        throw new Error(result.error || "Não foi possível gerar o XML de diagnóstico.");
      }
      diagnosticResult = result.diagnostic;
      message = "XML de diagnóstico gerado localmente. Nenhum documento foi enviado.";
      scheduleMessageClear(() => {
        message = "";
        render();
      });
    } catch (diagnosticError) {
      error = diagnosticError instanceof Error
        ? diagnosticError.message
        : "Falha ao gerar o XML de diagnóstico.";
    } finally {
      diagnosticRunning = false;
      render();
    }
  };

  const readCertificate = (file) =>
    new Promise((resolve, reject) => {
      if (!file || !["application/x-pkcs12", "application/octet-stream", ""].includes(file.type) && !/\.(pfx|p12)$/i.test(file.name)) {
        reject(new Error("Selecione um certificado A1 no formato .pfx ou .p12."));
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        reject(new Error("O certificado deve ter no máximo 2 MB."));
        return;
      }
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result).split(",")[1] || ""));
      reader.addEventListener("error", () => reject(new Error("Não foi possível ler o certificado.")));
      reader.readAsDataURL(file);
    });

  render();
  void load();
  return root;
}
