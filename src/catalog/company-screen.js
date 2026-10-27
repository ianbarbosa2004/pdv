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

const emptyCompany = {
  companyTypeCompany: "juridica",
  documentCompany: "",
  corporateNameCompany: "",
  tradeNameCompany: "",
  stateRegistrationCompany: "",
  municipalRegistrationCompany: "",
  cnaeCompany: "",
  zipCodeCompany: "",
  addressCompany: "",
  addressNumberCompany: "",
  addressComplementCompany: "",
  neighborhoodCompany: "",
  countryCompany: "Brasil",
  stateCompany: "",
  cityCompany: "",
  municipalityCodeCompany: "3148004",
  phoneCompany: "",
  mobileCompany: "",
  websiteCompany: "",
  emailCompany: "",
  nfceStateCompany: "MG",
  nfceModelCompany: "65",
  nfceEnvironmentCompany: "homologation",
  nfceSeriesCompany: "1",
  nfceInitialNumberCompany: "1",
  nfceContingencyCompany: "none",
  nfceCscCompany: "",
  nfceTokenCompany: "",
  nfceHomologationCscCompany: "",
  nfceHomologationTokenCompany: "",
  nfceCertificateTypeCompany: "A1",
  nfceCertificatePathCompany: "",
  nfceCertificateExpiresCompany: "",
  nfceCertificateSerialCompany: "",
  logoMimeCompany: "",
  logoDataCompany: ""
};

const formValue = (company, key) => company?.[key] ?? emptyCompany[key];

const digitsOnly = (value, limit) => String(value ?? "").replace(/\D/g, "").slice(0, limit);

const formatDocument = (value, type) => {
  const digits = digitsOnly(value, type === "fisica" ? 11 : 14);
  if (type === "fisica") {
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
};

const formatStateRegistration = (value) => {
  const digits = digitsOnly(value, 14);
  return digits.replace(/(\d{3})(?=\d)/g, "$1.").replace(/\.$/, "");
};

const formatCnae = (value) => {
  const digits = digitsOnly(value, 7);
  return digits.replace(/^(\d{4})(\d)/, "$1-$2").replace(/(\d{1})(\d{2})$/, "$1/$2");
};

const formatCep = (value) => {
  const digits = digitsOnly(value, 8);
  return digits.replace(/^(\d{5})(\d)/, "$1-$2");
};

const formatPhone = (value, mobile = false) => {
  const digits = digitsOnly(value, mobile ? 11 : 10);
  if (!digits) return "";
  const areaCode = digits.slice(0, 2);
  const number = digits.slice(2);
  const prefixLength = mobile ? 5 : 4;
  const prefix = number.slice(0, prefixLength);
  const suffix = number.slice(prefixLength, prefixLength + 4);
  let formatted = areaCode.length === 2 ? `(${areaCode})` : `(${areaCode}`;
  if (number) formatted += ` ${prefix}`;
  if (suffix) formatted += `-${suffix}`;
  return formatted;
};

const displayValue = (company, name) => {
  const value = formValue(company, name);
  switch (name) {
    case "documentCompany":
      return formatDocument(value, formValue(company, "companyTypeCompany"));
    case "stateRegistrationCompany":
      return formatStateRegistration(value);
    case "cnaeCompany":
      return formatCnae(value);
    case "zipCodeCompany":
      return formatCep(value);
    case "phoneCompany":
      return formatPhone(value);
    case "mobileCompany":
      return formatPhone(value, true);
    default:
      return value;
  }
};

export function createCompanyScreen({
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
  let company = { ...emptyCompany };
  let loading = true;
  let saving = false;
  let lookingUpCep = false;
  let selectedLogo = null;
  let error = "";
  let message = "";

  const renderField = (label, name, options = {}) => {
    const { type = "text", required = false, maxlength = 255, autocomplete = "off" } = options;
    return `
      <label class="form-field">
        <span>${label}</span>
        <input name="${name}" type="${type}" maxlength="${maxlength}" autocomplete="${autocomplete}" ${required ? "required" : ""} value="${escapeHtml(displayValue(company, name))}" />
      </label>
    `;
  };

  const render = () => {
    root.className = "catalog-screen";
    root.innerHTML = `
      <header class="classic-titlebar">
        <strong>PDV - Cadastro da empresa</strong>
        <span>Operador: Operador</span>
      </header>
      ${renderMainMenu()}
      <div class="classic-toolbar">
        <button class="classic-tool-button" data-back type="button">← Retaguarda</button>
        <strong>Configurações do sistema</strong>
      </div>
      <section class="classic-content company-content">
        <form class="classic-form-panel company-form" data-form>
          <div class="classic-panel-header">Dados da empresa</div>
          <div class="classic-form-body">
            <div class="classic-form-grid">
              <label class="form-field">
                <span>Tipo de pessoa</span>
                <select name="companyTypeCompany" required>
                  <option value="juridica" ${formValue(company, "companyTypeCompany") === "juridica" ? "selected" : ""}>Pessoa Jurídica</option>
                  <option value="fisica" ${formValue(company, "companyTypeCompany") === "fisica" ? "selected" : ""}>Pessoa Física</option>
                </select>
              </label>
              ${renderField(formValue(company, "companyTypeCompany") === "fisica" ? "CPF" : "CNPJ", "documentCompany", { required: true, maxlength: formValue(company, "companyTypeCompany") === "fisica" ? 14 : 18, autocomplete: "off" })}
            </div>
            <div class="classic-form-grid">
              ${renderField("Razão social / Nome", "corporateNameCompany", { required: true, maxlength: 180, autocomplete: "organization" })}
              ${renderField("Nome fantasia", "tradeNameCompany", { maxlength: 120, autocomplete: "organization" })}
            </div>
            <div class="classic-form-grid company-grid-three">
              ${renderField("Inscrição Estadual", "stateRegistrationCompany", { maxlength: 17 })}
              ${renderField("Inscrição Municipal", "municipalRegistrationCompany", { maxlength: 30 })}
              ${renderField("CNAE", "cnaeCompany", { maxlength: 9 })}
            </div>
            <div class="classic-form-grid company-address-grid">
              <div class="form-field company-cep-field">
                <span>CEP</span>
                <div class="company-cep-control">
                  <input name="zipCodeCompany" maxlength="9" autocomplete="postal-code" value="${escapeHtml(displayValue(company, "zipCodeCompany"))}" />
                  <button class="catalog-lookup-button" data-lookup-cep type="button" ${lookingUpCep ? "disabled" : ""} title="Buscar CEP" aria-label="Buscar CEP">${lookingUpCep ? "..." : "⌕"}</button>
                </div>
              </div>
              ${renderField("Endereço", "addressCompany", { maxlength: 180, autocomplete: "street-address" })}
              ${renderField("Número", "addressNumberCompany", { maxlength: 20 })}
              ${renderField("Complemento", "addressComplementCompany", { maxlength: 80 })}
            </div>
            <div class="classic-form-grid company-grid-four">
              ${renderField("Bairro", "neighborhoodCompany", { maxlength: 100, autocomplete: "address-level3" })}
              ${renderField("Cidade", "cityCompany", { maxlength: 100, autocomplete: "address-level2" })}
              ${renderField("Código IBGE", "municipalityCodeCompany", { maxlength: 7, inputmode: "numeric" })}
              <label class="form-field">
                <span>UF</span>
                <select name="stateCompany">
                  <option value="">Selecione</option>
                  ${["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]
                    .map((state) => `<option value="${state}" ${formValue(company, "stateCompany") === state ? "selected" : ""}>${state}</option>`)
                    .join("")}
                </select>
              </label>
            </div>
            <div class="classic-form-grid company-grid-three">
              ${renderField("País", "countryCompany", { required: true, maxlength: 80, autocomplete: "country-name" })}
              ${renderField("Telefone", "phoneCompany", { type: "tel", maxlength: 14, autocomplete: "tel" })}
              ${renderField("Celular", "mobileCompany", { type: "tel", maxlength: 15, autocomplete: "tel" })}
            </div>
            <div class="classic-form-grid">
              ${renderField("E-mail", "emailCompany", { type: "email", maxlength: 180, autocomplete: "email" })}
              ${renderField("Site", "websiteCompany", { maxlength: 180, autocomplete: "url" })}
            </div>
            <div class="company-logo-field">
              <div class="form-field">
                <span>Logotipo principal</span>
                <input name="logoCompany" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
                <small>Usado nos relatórios e cupons. Formatos aceitos: PNG, JPEG, WebP ou GIF, até 2 MB.</small>
              </div>
              <div class="company-logo-preview" data-logo-preview>
                ${company.logoDataCompany
                  ? `<img src="${escapeHtml(company.logoDataCompany)}" alt="Pré-visualização do logotipo principal" />`
                  : `<span>Nenhum logotipo selecionado</span>`}
              </div>
            </div>
          </div>

          ${error ? `<p class="payment-error" data-company-feedback>${escapeHtml(error)}</p>` : `<p class="payment-error" data-company-feedback hidden></p>`}
          ${message ? `<p class="success-message">${escapeHtml(message)}</p>` : ""}
          <div class="classic-form-actions">
            <button class="classic-button primary" type="submit" ${loading || saving ? "disabled" : ""}>${saving ? "Salvando..." : "Salvar empresa"}</button>
            <button class="classic-button" data-reset type="button" ${loading || saving ? "disabled" : ""}>Limpar</button>
          </div>
        </form>
      </section>
    `;

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
    root.querySelector("[data-reset]")?.addEventListener("click", () => {
      company = { ...emptyCompany };
      selectedLogo = null;
      error = "";
      message = "";
      render();
    });
    const form = root.querySelector("[data-form]");
    const documentInput = form?.querySelector("[name='documentCompany']");
    const typeInput = form?.querySelector("[name='companyTypeCompany']");
    const stateRegistrationInput = form?.querySelector("[name='stateRegistrationCompany']");
    const cnaeInput = form?.querySelector("[name='cnaeCompany']");
    const cepInput = form?.querySelector("[name='zipCodeCompany']");
    const phoneInput = form?.querySelector("[name='phoneCompany']");
    const mobileInput = form?.querySelector("[name='mobileCompany']");
    documentInput?.addEventListener("input", () => {
      documentInput.value = formatDocument(documentInput.value, typeInput.value);
    });
    typeInput?.addEventListener("change", () => {
      documentInput.value = formatDocument(documentInput.value, typeInput.value);
      documentInput.maxLength = typeInput.value === "fisica" ? 14 : 18;
      documentInput.previousElementSibling.textContent = typeInput.value === "fisica" ? "CPF" : "CNPJ";
    });
    stateRegistrationInput?.addEventListener("input", () => {
      stateRegistrationInput.value = formatStateRegistration(stateRegistrationInput.value);
    });
    cnaeInput?.addEventListener("input", () => {
      cnaeInput.value = formatCnae(cnaeInput.value);
    });
    cepInput?.addEventListener("input", () => {
      cepInput.value = formatCep(cepInput.value);
    });
    phoneInput?.addEventListener("input", () => {
      phoneInput.value = formatPhone(phoneInput.value);
    });
    mobileInput?.addEventListener("input", () => {
      mobileInput.value = formatPhone(mobileInput.value, true);
    });
    root.querySelector("[data-lookup-cep]")?.addEventListener("click", () => void lookupCep());
    root.querySelector("[name='logoCompany']")?.addEventListener("change", (event) => {
      selectedLogo = event.currentTarget.files?.[0] || null;
      const preview = root.querySelector("[data-logo-preview]");
      if (!selectedLogo || !preview) return;
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        preview.innerHTML = `<img src="${escapeHtml(reader.result)}" alt="Pré-visualização do logotipo principal" />`;
      });
      reader.readAsDataURL(selectedLogo);
    });
    root.querySelector("[data-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void save(new FormData(event.currentTarget));
    });
  };

  const lookupCep = async () => {
    const input = root.querySelector("[name='zipCodeCompany']");
    const cep = digitsOnly(input?.value, 8);
    if (cep.length !== 8) {
      const feedback = root.querySelector("[data-company-feedback]");
      if (feedback) {
        feedback.textContent = "Informe um CEP com 8 dígitos para consultar.";
        feedback.hidden = false;
      }
      return;
    }
    lookingUpCep = true;
    const button = root.querySelector("[data-lookup-cep]");
    if (button) button.disabled = true;
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const address = await response.json();
      if (!response.ok || address.erro) throw new Error("CEP não encontrado.");
      const fields = {
        addressCompany: address.logradouro,
        neighborhoodCompany: address.bairro,
        cityCompany: address.localidade,
        stateCompany: address.uf,
        countryCompany: "Brasil"
      };
      for (const [name, value] of Object.entries(fields)) {
        const field = root.querySelector(`[name="${name}"]`);
        if (field) field.value = value || "";
      }
      const feedback = root.querySelector("[data-company-feedback]");
      if (feedback) feedback.hidden = true;
    } catch (lookupError) {
      const feedback = root.querySelector("[data-company-feedback]");
      if (feedback) {
        feedback.textContent = lookupError instanceof Error ? lookupError.message : "Não foi possível consultar o CEP.";
        feedback.hidden = false;
      }
    } finally {
      lookingUpCep = false;
      const currentButton = root.querySelector("[data-lookup-cep]");
      if (currentButton) currentButton.disabled = false;
    }
  };

  const load = async () => {
    loading = true;
    render();
    try {
      const response = await fetch(`${getApiUrl()}/api/company`);
      const payload = await response.json();
      if (!response.ok || !payload.company) {
        throw new Error(payload.error || "Não foi possível carregar o cadastro da empresa.");
      }
      company = { ...emptyCompany, ...payload.company };
      error = "";
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Falha ao carregar o cadastro da empresa.";
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
      const payload = Object.fromEntries(form);
      delete payload.logoCompany;
      if (selectedLogo) {
        const logoDataCompany = await readLogo(selectedLogo);
        payload.logoDataCompany = logoDataCompany;
        payload.logoMimeCompany = selectedLogo.type;
      } else {
        payload.logoDataCompany = company.logoDataCompany || "";
        payload.logoMimeCompany = company.logoMimeCompany || "";
      }
      const response = await fetch(`${getApiUrl()}/api/company`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.company) {
        throw new Error(result.error || "Não foi possível salvar o cadastro da empresa.");
      }
      company = { ...emptyCompany, ...result.company };
      selectedLogo = null;
      message = "Cadastro da empresa salvo com sucesso.";
    } catch (saveError) {
      error = saveError instanceof Error ? saveError.message : "Falha ao salvar o cadastro da empresa.";
    } finally {
      saving = false;
      render();
    }
  };

  const readLogo = (file) =>
    new Promise((resolve, reject) => {
      if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
        reject(new Error("O logotipo deve estar em PNG, JPEG, WebP ou GIF."));
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        reject(new Error("O logotipo deve ter no máximo 2 MB."));
        return;
      }
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result)));
      reader.addEventListener("error", () => reject(new Error("Não foi possível ler o logotipo.")));
      reader.readAsDataURL(file);
    });

  render();
  void load();
  return root;
}
