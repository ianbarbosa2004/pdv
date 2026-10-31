import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { bindFormRowPreview } from "../ui/form-row-preview.js";
import { createFeedbackTimer, renderSuccessFeedback } from "../ui/feedback.js";
import { getApiUrl } from "../shared/api.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const fields = [
  ["typeSupplier", "Tipo", "select"],
  ["documentSupplier", "CPF/CNPJ", "text"],
  ["companyNameSupplier", "Razão social / Nome", "text"],
  ["tradeNameSupplier", "Nome fantasia", "text"],
  ["contactNameSupplier", "Contato", "text"],
  ["phoneSupplier", "Telefone", "tel"],
  ["emailSupplier", "E-mail", "email"],
  ["zipCodeSupplier", "CEP", "text"],
  ["addressSupplier", "Endereço", "text"],
  ["addressNumberSupplier", "Número", "text"],
  ["addressComplementSupplier", "Complemento", "text"],
  ["neighborhoodSupplier", "Bairro", "text"],
  ["citySupplier", "Cidade", "text"],
  ["stateSupplier", "UF", "select"],
  ["notesSupplier", "Observações", "textarea"]
];

const brazilianStates = [
  ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"],
  ["BA", "Bahia"], ["CE", "Ceará"], ["DF", "Distrito Federal"], ["ES", "Espírito Santo"],
  ["GO", "Goiás"], ["MA", "Maranhão"], ["MT", "Mato Grosso"], ["MS", "Mato Grosso do Sul"],
  ["MG", "Minas Gerais"], ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"],
  ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"],
  ["SP", "São Paulo"], ["SE", "Sergipe"], ["TO", "Tocantins"]
];

const emptySupplier = {
  typeSupplier: "juridica",
  documentSupplier: "",
  companyNameSupplier: "",
  tradeNameSupplier: "",
  contactNameSupplier: "",
  phoneSupplier: "",
  emailSupplier: "",
  zipCodeSupplier: "",
  addressSupplier: "",
  addressNumberSupplier: "",
  addressComplementSupplier: "",
  neighborhoodSupplier: "",
  citySupplier: "",
  stateSupplier: "",
  notesSupplier: ""
};

const displayName = (supplier) =>
  supplier.tradeNameSupplier || supplier.companyNameSupplier || supplier.contactNameSupplier || supplier.documentSupplier;

const formatDocument = (value, type) => {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, type === "fisica" ? 11 : 14);
  if (type === "fisica") {
    return digits.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }
  return digits.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
};

const formatCep = (value) => String(value ?? "").replace(/\D/g, "").slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");

const formatPhone = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  const areaCode = digits.slice(0, 2);
  const number = digits.slice(2);
  const prefixLength = digits.length > 10 ? 5 : 4;
  const prefix = number.slice(0, prefixLength);
  const suffix = number.slice(prefixLength, prefixLength + 4);
  let formatted = areaCode.length === 2 ? `(${areaCode})` : `(${areaCode}`;
  if (number) formatted += ` ${prefix}`;
  if (suffix) formatted += `-${suffix}`;
  return formatted;
};

const formatEmail = (value) => String(value ?? "").replace(/\s/g, "").toLocaleLowerCase("pt-BR").slice(0, 180);

const capitalizeText = (value) => String(value ?? "")
  .trim()
  .replace(/\s+/g, " ")
  .toLocaleLowerCase("pt-BR")
  .replace(/(^|[\s/-])([a-zà-ÿ])/giu, (_, separator, character) =>
    `${separator}${character.toLocaleUpperCase("pt-BR")}`);

const capitalizedSupplierFields = new Set([
  "companyNameSupplier",
  "tradeNameSupplier",
  "contactNameSupplier",
  "addressSupplier",
  "addressComplementSupplier",
  "neighborhoodSupplier",
  "citySupplier",
  "notesSupplier"
]);

const normalizeSupplierText = (field, value) =>
  capitalizedSupplierFields.has(field) ? capitalizeText(value) : String(value ?? "").trim();

export function createSupplierScreen({
  onBack,
  onProducts,
  onFiscalOperations,
  onThermalPrint,
  onNcmCestUpdate,
  onSettings,
  onCompany,
  onNfce,
  onFinancial,
  onPaymentMethods,
  onSuppliers
}) {
  const root = document.createElement("main");
  let suppliers = [];
  let loading = true;
  let submitting = false;
  let error = "";
  let message = "";
  let editingSupplier = null;
  let searchTerm = "";
  let lookingUpCnpj = false;
  let lookingUpCep = false;
  const scheduleMessageClear = createFeedbackTimer();

  const load = async () => {
    loading = true;
    render();
    try {
      const response = await fetch(`${getApiUrl()}/api/suppliers?includeInactive=1`);
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.suppliers)) throw new Error(payload.error || "Não foi possível carregar os fornecedores.");
      suppliers = payload.suppliers;
      error = "";
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Falha ao carregar os fornecedores.";
    } finally {
      loading = false;
      render();
    }
  };

  const getVisibleSuppliers = () => {
    const query = searchTerm.trim().toLocaleLowerCase("pt-BR");
    return suppliers.filter((supplier) =>
      [displayName(supplier), supplier.documentSupplier, supplier.citySupplier, supplier.stateSupplier]
        .some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(query))
    );
  };

  const renderFormFields = (supplier, prefix = "") => fields.map(([field, label, type]) => {
    const value = supplier[field] ?? "";
    if (field === "typeSupplier") {
      return `<label class="form-field"><span>${label}</span><select name="${prefix}${field}" required><option value="juridica" ${value === "juridica" ? "selected" : ""}>Pessoa Jurídica</option><option value="fisica" ${value === "fisica" ? "selected" : ""}>Pessoa Física</option></select></label>`;
    }
    if (field === "stateSupplier") {
      return `<label class="form-field"><span>${label}</span><select name="${prefix}${field}"><option value="">Selecione</option>${brazilianStates.map(([uf, state]) => `<option value="${uf}" ${value === uf ? "selected" : ""}>${uf} - ${state}</option>`).join("")}</select></label>`;
    }
    if (type === "textarea") return `<label class="form-field supplier-notes-field"><span>${label}</span><textarea name="${prefix}${field}" maxlength="400" rows="3">${escapeHtml(value)}</textarea></label>`;
    const formatted = field === "documentSupplier"
      ? formatDocument(value, supplier.typeSupplier)
      : field === "phoneSupplier"
        ? formatPhone(value)
        : field === "zipCodeSupplier"
          ? formatCep(value)
          : field === "emailSupplier"
            ? formatEmail(value)
            : value;
    const required = ["documentSupplier", "companyNameSupplier"].includes(field);
    const maxlength = field === "documentSupplier" ? 18 : field === "emailSupplier" ? 180 : field === "phoneSupplier" ? 15 : field === "zipCodeSupplier" ? 9 : 180;
    const inputMode = ["documentSupplier", "phoneSupplier", "zipCodeSupplier"].includes(field) ? ' inputmode="numeric"' : "";
    const autocomplete = {
      companyNameSupplier: "organization",
      phoneSupplier: "tel",
      emailSupplier: "email",
      zipCodeSupplier: "postal-code",
      addressSupplier: "street-address",
      citySupplier: "address-level2"
    }[field];
    const lookup = !prefix && field === "documentSupplier" && supplier.typeSupplier === "juridica"
      ? `<button class="catalog-lookup-button" data-lookup-cnpj type="button" ${lookingUpCnpj ? "disabled" : ""} title="Buscar CNPJ" aria-label="Buscar CNPJ">${lookingUpCnpj ? "..." : "⌕"}</button>`
      : !prefix && field === "zipCodeSupplier"
        ? `<button class="catalog-lookup-button" data-lookup-cep type="button" ${lookingUpCep ? "disabled" : ""} title="Buscar CEP" aria-label="Buscar CEP">${lookingUpCep ? "..." : "⌕"}</button>`
        : "";
    return `<label class="form-field"><span>${label}</span>${lookup ? `<div class="supplier-lookup-control"><input name="${prefix}${field}" type="${type}" maxlength="${maxlength}"${inputMode}${autocomplete ? ` autocomplete="${autocomplete}"` : ""}${required ? " required" : ""} value="${escapeHtml(formatted)}" />${lookup}</div>` : `<input name="${prefix}${field}" type="${type}" maxlength="${maxlength}"${inputMode}${autocomplete ? ` autocomplete="${autocomplete}"` : ""}${required ? " required" : ""} value="${escapeHtml(formatted)}" />`}</label>`;
  }).join("");

  const render = () => {
    const visible = getVisibleSuppliers();
    root.className = "catalog-screen";
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - Cadastro de fornecedores</strong><span>Operador: Operador</span></header>
      ${renderMainMenu()}
      <section class="classic-content">
        ${renderSuccessFeedback(message, escapeHtml)}
        <form class="classic-form-panel supplier-form" data-supplier-form>
          <div class="classic-panel-header">Novo fornecedor</div>
          <div class="classic-form-body">
            <div class="classic-form-grid">${renderFormFields(emptySupplier)}</div>
            ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}
          </div>
          <div class="classic-form-actions"><button class="classic-button primary" type="submit" ${submitting || loading ? "disabled" : ""}>${submitting ? "Salvando..." : "Salvar fornecedor"}</button><button class="classic-button" data-clear type="button" ${submitting ? "disabled" : ""}>Limpar</button></div>
        </form>
        <section class="classic-grid-panel">
          <div class="classic-panel-header classic-list-header"><span>Fornecedores</span><input class="classic-list-search" data-search type="search" placeholder="Pesquisar..." aria-label="Pesquisar fornecedores" value="${escapeHtml(searchTerm)}" /></div>
          <div class="classic-grid-wrapper">${loading ? `<p class="classic-empty">Carregando fornecedores...</p>` : visible.length ? `
            <table class="classic-table"><thead><tr><th>Nome</th><th>Tipo</th><th>CPF/CNPJ</th><th>Cidade/UF</th><th>Status</th><th class="actions-column">Ações</th></tr></thead>
            <tbody>${visible.map((supplier) => `<tr class="${supplier.isActiveSupplier ? "" : "is-inactive"}" data-view-record="${escapeHtml(JSON.stringify(supplier))}">
              <td>${escapeHtml(displayName(supplier))}</td><td>${supplier.typeSupplier === "fisica" ? "Pessoa Física" : "Pessoa Jurídica"}</td><td>${escapeHtml(formatDocument(supplier.documentSupplier, supplier.typeSupplier))}</td><td>${escapeHtml([supplier.citySupplier, supplier.stateSupplier].filter(Boolean).join(" / "))}</td>
              <td><button class="status-toggle ${supplier.isActiveSupplier ? "is-active" : "is-inactive"}" type="button" role="switch" aria-checked="${supplier.isActiveSupplier ? "true" : "false"}" data-status-id="${supplier.idSupplier}" aria-label="Alternar status de ${escapeHtml(displayName(supplier))}"><span class="status-toggle-track"><span class="status-toggle-thumb"></span></span><span class="status-toggle-label">${supplier.isActiveSupplier ? "Ativo" : "Inativo"}</span></button></td>
              <td class="actions-column"><button class="icon-button edit" type="button" data-edit="${supplier.idSupplier}" aria-label="Editar fornecedor" title="Editar fornecedor"><i data-lucide="pencil"></i></button><button class="icon-button delete" type="button" data-delete="${supplier.idSupplier}" aria-label="Excluir fornecedor" title="Excluir fornecedor"><i data-lucide="trash-2"></i></button></td>
            </tr>`).join("")}</tbody></table>` : `<p class="classic-empty">${suppliers.length ? "Nenhum fornecedor encontrado." : "Nenhum fornecedor cadastrado."}</p>`}</div>
        </section>
      </section>
      ${editingSupplier ? `<div class="classic-modal-backdrop" data-modal-backdrop><section class="classic-modal" role="dialog" aria-modal="true" aria-labelledby="edit-supplier-title"><div class="classic-panel-header modal-panel-header"><span id="edit-supplier-title">Editar fornecedor</span><button class="modal-close-button" data-cancel type="button" aria-label="Fechar" title="Fechar"><i data-lucide="x"></i></button></div><form data-edit-form><div class="classic-form-body"><div class="classic-form-grid">${renderFormFields(editingSupplier)}</div>${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}</div><div class="classic-form-actions"><button class="classic-button primary" type="submit" ${submitting ? "disabled" : ""}>Salvar alterações</button><button class="classic-button" data-cancel type="button">Cancelar</button></div></form></section></div>` : ""}
    `;
    renderLucideIcons(root);
    bindMainMenu(root, { products: onProducts, suppliers: onSuppliers, "fiscal-operations": onFiscalOperations, "thermal-print": onThermalPrint, "ncm-cest-update": onNcmCestUpdate, settings: onSettings, company: onCompany, nfce: onNfce, financial: onFinancial, "payment-methods": onPaymentMethods });
    bindFormRowPreview(root, {
      formSelector: "[data-supplier-form]",
      formatValue: (value, fieldName, record) => {
        if (fieldName === "documentSupplier") return formatDocument(value, record.typeSupplier);
        if (fieldName === "phoneSupplier") return formatPhone(value);
        if (fieldName === "zipCodeSupplier") return formatCep(value);
        if (fieldName === "emailSupplier") return formatEmail(value);
        return value;
      }
    });
    root.querySelectorAll("[data-supplier-form], [data-edit-form]").forEach((form) => {
      const typeInput = form.querySelector("[name='typeSupplier']");
      const documentInput = form.querySelector("[name='documentSupplier']");
      const phoneInput = form.querySelector("[name='phoneSupplier']");
      const emailInput = form.querySelector("[name='emailSupplier']");
      const cepInput = form.querySelector("[name='zipCodeSupplier']");
      documentInput?.addEventListener("input", () => {
        documentInput.value = formatDocument(documentInput.value, typeInput?.value || "juridica");
      });
      typeInput?.addEventListener("change", () => {
        if (documentInput) {
          documentInput.value = formatDocument(documentInput.value, typeInput.value);
          documentInput.maxLength = typeInput.value === "fisica" ? 14 : 18;
        }
      });
      phoneInput?.addEventListener("input", () => { phoneInput.value = formatPhone(phoneInput.value); });
      emailInput?.addEventListener("input", () => { emailInput.value = formatEmail(emailInput.value); });
      cepInput?.addEventListener("input", () => { cepInput.value = formatCep(cepInput.value); });
    });
    root.querySelectorAll("[data-lookup-cnpj]").forEach((button) => {
      button.addEventListener("click", () => void lookupCnpj(button.closest("form")));
    });
    root.querySelectorAll("[data-lookup-cep]").forEach((button) => {
      button.addEventListener("click", () => void lookupCep(button.closest("form")));
    });
    root.querySelector("[data-search]")?.addEventListener("input", (event) => { searchTerm = event.currentTarget.value; render(); root.querySelector("[data-search]")?.focus(); });
    root.querySelector("[data-supplier-form]")?.addEventListener("submit", (event) => { event.preventDefault(); void submit(Object.fromEntries(new FormData(event.currentTarget)), null); });
    root.querySelector("[data-edit-form]")?.addEventListener("submit", (event) => { event.preventDefault(); const id = editingSupplier?.idSupplier; void submit(Object.fromEntries(new FormData(event.currentTarget)), id); });
    root.querySelector("[data-clear]")?.addEventListener("click", () => { error = ""; message = ""; render(); });
    root.querySelectorAll("[data-cancel]").forEach((button) => button.addEventListener("click", () => { editingSupplier = null; error = ""; render(); }));
    root.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => { editingSupplier = suppliers.find((item) => String(item.idSupplier) === button.dataset.edit) || null; error = ""; render(); }));
    root.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => void remove(Number(button.dataset.delete))));
    root.querySelectorAll("[data-status-id]").forEach((button) => button.addEventListener("click", () => void updateStatus(Number(button.dataset.statusId), button.getAttribute("aria-checked") !== "true")));
  };

  const setSupplierField = (form, name, value) => {
    const field = form?.querySelector(`[name="${name}"]`);
    if (!field || value == null) return;
    field.value = name === "phoneSupplier"
      ? formatPhone(value)
      : name === "zipCodeSupplier"
        ? formatCep(value)
        : name === "emailSupplier"
          ? formatEmail(value)
          : normalizeSupplierText(name, value);
    field.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const setLookupMessage = (form, messageText) => {
    let feedback = form?.querySelector("[data-supplier-lookup-message]");
    if (!feedback) {
      feedback = document.createElement("div");
      feedback.className = "success-message page-feedback";
      feedback.dataset.supplierLookupMessage = "true";
      feedback.setAttribute("role", "status");
      feedback.setAttribute("aria-live", "polite");
      form?.querySelector(".classic-form-body")?.prepend(feedback);
    }
    feedback.textContent = messageText;
  };

  const setLookupError = (form, messageText) => {
    let feedback = form?.querySelector("[data-supplier-lookup-error]");
    if (!feedback) {
      feedback = document.createElement("p");
      feedback.className = "payment-error";
      feedback.dataset.supplierLookupError = "true";
      form?.querySelector(".classic-form-body")?.append(feedback);
    }
    feedback.textContent = messageText;
  };

  const clearLookupFeedback = (form) => {
    form?.querySelector("[data-supplier-lookup-error]")?.remove();
    form?.querySelector("[data-supplier-lookup-message]")?.remove();
  };

  const lookupCnpj = async (form) => {
    const input = form?.querySelector("[name='documentSupplier']");
    const cnpj = String(input?.value ?? "").replace(/\D/g, "");
    if (cnpj.length !== 14) {
      setLookupError(form, "Informe um CNPJ com 14 dígitos para consultar.");
      return;
    }
    lookingUpCnpj = true;
    const button = form.querySelector("[data-lookup-cnpj]");
    if (button) button.disabled = true;
    clearLookupFeedback(form);
    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      const company = await response.json();
      if (!response.ok || company.message) throw new Error(company.message || "CNPJ não encontrado.");
      setSupplierField(form, "companyNameSupplier", company.razao_social);
      setSupplierField(form, "tradeNameSupplier", company.nome_fantasia);
      setSupplierField(form, "phoneSupplier", company.ddd_telefone_1);
      setSupplierField(form, "emailSupplier", company.email);
      setSupplierField(form, "zipCodeSupplier", company.cep);
      setSupplierField(form, "addressSupplier", company.logradouro);
      setSupplierField(form, "addressNumberSupplier", company.numero);
      setSupplierField(form, "addressComplementSupplier", company.complemento);
      setSupplierField(form, "neighborhoodSupplier", company.bairro);
      setSupplierField(form, "citySupplier", company.municipio);
      setSupplierField(form, "stateSupplier", company.uf);
      setLookupMessage(form, "Dados do CNPJ preenchidos. Revise as informações antes de salvar.");
    } catch (lookupError) {
      setLookupError(form, lookupError instanceof Error ? lookupError.message : "Não foi possível consultar o CNPJ.");
    } finally {
      lookingUpCnpj = false;
      if (button) {
        button.disabled = false;
        button.textContent = "⌕";
      }
    }
  };

  const lookupCep = async (form) => {
    const input = form?.querySelector("[name='zipCodeSupplier']");
    const cep = String(input?.value ?? "").replace(/\D/g, "");
    if (cep.length !== 8) {
      setLookupError(form, "Informe um CEP com 8 dígitos para consultar.");
      return;
    }
    lookingUpCep = true;
    const button = form.querySelector("[data-lookup-cep]");
    if (button) button.disabled = true;
    clearLookupFeedback(form);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const address = await response.json();
      if (!response.ok || address.erro) throw new Error("CEP não encontrado.");
      setSupplierField(form, "addressSupplier", address.logradouro);
      setSupplierField(form, "neighborhoodSupplier", address.bairro);
      setSupplierField(form, "citySupplier", address.localidade);
      setSupplierField(form, "stateSupplier", address.uf);
      setLookupMessage(form, "Endereço do CEP preenchido. Revise as informações antes de salvar.");
    } catch (lookupError) {
      setLookupError(form, lookupError instanceof Error ? lookupError.message : "Não foi possível consultar o CEP.");
    } finally {
      lookingUpCep = false;
      if (button) {
        button.disabled = false;
        button.textContent = "⌕";
      }
    }
  };

  const submit = async (body, idSupplier) => {
    submitting = true;
    error = "";
    message = "";
    render();
    try {
      const response = await fetch(`${getApiUrl()}/api/suppliers`, {
        method: idSupplier ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          documentSupplier: String(body.documentSupplier ?? "").replace(/\D/g, ""),
          phoneSupplier: String(body.phoneSupplier ?? "").replace(/\D/g, ""),
          emailSupplier: formatEmail(body.emailSupplier),
          zipCodeSupplier: String(body.zipCodeSupplier ?? "").replace(/\D/g, ""),
          stateSupplier: String(body.stateSupplier ?? "").toUpperCase(),
          countrySupplier: "Brasil",
          ...(idSupplier ? { idSupplier } : {})
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar o fornecedor.");
      message = idSupplier ? "Fornecedor alterado com sucesso." : "Fornecedor cadastrado com sucesso.";
      await load();
      editingSupplier = null;
      scheduleMessageClear(() => { message = ""; render(); });
    } catch (submitError) {
      error = submitError instanceof Error ? submitError.message : "Falha ao salvar o fornecedor.";
    } finally {
      submitting = false;
      render();
    }
  };

  const updateStatus = async (idSupplier, isActiveSupplier) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/suppliers/status`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idSupplier, isActiveSupplier }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível alterar o status.");
      await load();
    } catch (statusError) {
      error = statusError instanceof Error ? statusError.message : "Falha ao alterar o status.";
      render();
    }
  };

  const remove = async (idSupplier) => {
    if (!window.confirm("Excluir este fornecedor definitivamente?")) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/suppliers`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idSupplier }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível excluir o fornecedor.");
      message = "Fornecedor excluído com sucesso.";
      await load();
      scheduleMessageClear(() => { message = ""; render(); });
    } catch (removeError) {
      error = removeError instanceof Error ? removeError.message : "Falha ao excluir o fornecedor.";
      render();
    }
  };

  render();
  void load();
  return root;
}
