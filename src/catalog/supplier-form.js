export const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

export const supplierFields = [
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

export const brazilianStates = [
  ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"],
  ["BA", "Bahia"], ["CE", "Ceará"], ["DF", "Distrito Federal"], ["ES", "Espírito Santo"],
  ["GO", "Goiás"], ["MA", "Maranhão"], ["MT", "Mato Grosso"], ["MS", "Mato Grosso do Sul"],
  ["MG", "Minas Gerais"], ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"],
  ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"],
  ["SP", "São Paulo"], ["SE", "Sergipe"], ["TO", "Tocantins"]
];

export const emptySupplier = {
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

export const formatSupplierDocument = (value, type) => {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, type === "fisica" ? 11 : 14);
  if (type === "fisica") {
    return digits.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }
  return digits.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
};

export const formatSupplierCep = (value) => String(value ?? "").replace(/\D/g, "").slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");

export const formatSupplierPhone = (value) => {
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

export const formatSupplierEmail = (value) => String(value ?? "").replace(/\s/g, "").toLocaleLowerCase("pt-BR").slice(0, 180);

const supplierTitleLowercaseWords = new Set(["a", "as", "ao", "aos", "da", "das", "de", "do", "dos", "e", "em", "na", "nas", "no", "nos", "para", "por"]);

export const formatSupplierTitle = (value) => String(value ?? "")
  .trim()
  .replace(/\s+/g, " ")
  .toLocaleLowerCase("pt-BR")
  .split(" ")
  .map((word, index) => {
    if (!word || (index > 0 && supplierTitleLowercaseWords.has(word))) return word;
    return word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1);
  })
  .join(" ");

export const renderSupplierFormFields = (supplier = emptySupplier, {
  lookupCnpj = false,
  lookupCep = false,
  lookingUpCnpj = false,
  lookingUpCep = false
} = {}) => supplierFields.map(([field, label, type]) => {
  const value = supplier[field] ?? "";
  if (field === "typeSupplier") {
    return `<label class="form-field"><span>${label}</span><select name="${field}" required><option value="juridica" ${value === "juridica" ? "selected" : ""}>Pessoa Jurídica</option><option value="fisica" ${value === "fisica" ? "selected" : ""}>Pessoa Física</option></select></label>`;
  }
  if (field === "stateSupplier") {
    return `<label class="form-field"><span>${label}</span><select name="${field}"><option value="">Selecione</option>${brazilianStates.map(([uf, state]) => `<option value="${uf}" ${value === uf ? "selected" : ""}>${uf} - ${state}</option>`).join("")}</select></label>`;
  }
  if (type === "textarea") return `<label class="form-field supplier-notes-field"><span>${label}</span><textarea name="${field}" maxlength="400" rows="3">${escapeHtml(value)}</textarea></label>`;
  const formatted = field === "documentSupplier"
    ? formatSupplierDocument(value, supplier.typeSupplier)
    : field === "phoneSupplier"
      ? formatSupplierPhone(value)
      : field === "zipCodeSupplier"
        ? formatSupplierCep(value)
        : field === "emailSupplier"
          ? formatSupplierEmail(value)
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
  const lookup = lookupCnpj && field === "documentSupplier" && supplier.typeSupplier === "juridica"
    ? `<button class="catalog-lookup-button" data-lookup-cnpj type="button" ${lookingUpCnpj ? "disabled" : ""} title="Buscar CNPJ" aria-label="Buscar CNPJ">${lookingUpCnpj ? "..." : "⌕"}</button>`
    : lookupCep && field === "zipCodeSupplier"
      ? `<button class="catalog-lookup-button" data-lookup-cep type="button" ${lookingUpCep ? "disabled" : ""} title="Buscar CEP" aria-label="Buscar CEP">${lookingUpCep ? "..." : "⌕"}</button>`
      : "";
  return `<label class="form-field"><span>${label}</span>${lookup ? `<div class="supplier-lookup-control"><input name="${field}" type="${type}" maxlength="${maxlength}"${inputMode}${autocomplete ? ` autocomplete="${autocomplete}"` : ""}${required ? " required" : ""} value="${escapeHtml(formatted)}" />${lookup}</div>` : `<input name="${field}" type="${type}" maxlength="${maxlength}"${inputMode}${autocomplete ? ` autocomplete="${autocomplete}"` : ""}${required ? " required" : ""} value="${escapeHtml(formatted)}" />`}</label>`;
}).join("");

export const bindSupplierFormFormatting = (root) => {
  root.querySelectorAll("[data-supplier-form], [data-edit-form], [data-missing-supplier-form]").forEach((form) => {
    const typeInput = form.querySelector("[name='typeSupplier']");
    const documentInput = form.querySelector("[name='documentSupplier']");
    const phoneInput = form.querySelector("[name='phoneSupplier']");
    const emailInput = form.querySelector("[name='emailSupplier']");
    const cepInput = form.querySelector("[name='zipCodeSupplier']");
    documentInput?.addEventListener("input", () => {
      documentInput.value = formatSupplierDocument(documentInput.value, typeInput?.value || "juridica");
    });
    typeInput?.addEventListener("change", () => {
      if (documentInput) {
        documentInput.value = formatSupplierDocument(documentInput.value, typeInput.value);
        documentInput.maxLength = typeInput.value === "fisica" ? 14 : 18;
      }
    });
    phoneInput?.addEventListener("input", () => { phoneInput.value = formatSupplierPhone(phoneInput.value); });
    emailInput?.addEventListener("input", () => { emailInput.value = formatSupplierEmail(emailInput.value); });
    cepInput?.addEventListener("input", () => { cepInput.value = formatSupplierCep(cepInput.value); });
  });
};
