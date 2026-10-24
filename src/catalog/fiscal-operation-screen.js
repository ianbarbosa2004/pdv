import { renderLucideIcons } from "../ui/icons.js";

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const getApiUrl = () =>
  window.__PDV_API_URL__ || `http://${window.location.hostname}:3000`;

const catalogKeys = {
  cfops: "cfops",
  taxRegimes: "tax-regimes",
  operationTypes: "operation-types",
  contexts: "contexts",
  taxSituations: "tax-situations",
  origins: "origins",
  ipiSituations: "ipi-situations",
  contributionSituations: "contribution-situations",
  baseModes: "base-modes",
  exemptionReasons: "exemption-reasons"
};

const renderOptions = (options, selectedValue, placeholder = "") =>
  `${placeholder ? `<option value="">${placeholder}</option>` : ""}${options
    .map(([value, label]) => `<option value="${value}" ${String(selectedValue ?? "") === value ? "selected" : ""}>${label}</option>`)
    .join("")}`;

const toOptions = (items) =>
  items.map((item) => [item.codeFiscalCatalogItem, item.descriptionFiscalCatalogItem]);

export function createFiscalOperationScreen({ onBack, onClasses, onGroups, onProducts, onFiscalOperations, onCatalog }) {
  const root = document.createElement("main");
  let operations = [];
  let catalogs = Object.fromEntries(Object.values(catalogKeys).map((key) => [key, []]));
  let loading = true;
  let submitting = false;
  let error = "";
  let message = "";
  let editing = null;
  let searchTerm = "";

  const render = () => {
    const visible = operations.filter((operation) =>
      [operation.descriptionFiscalOperation, operation.cfopFiscalOperation]
        .some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(searchTerm.toLocaleLowerCase("pt-BR")))
    );
    root.className = "catalog-screen";
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - Operações fiscais</strong><span>Operador: Operador</span></header>
      <nav class="classic-menubar" aria-label="Menu principal">
        <button type="button">Arquivo</button>
        <details class="classic-menu-dropdown"><summary>Cadastros</summary><div class="classic-menu-panel">
          <button type="button" data-classes>Classes</button><button type="button" data-groups>Grupos</button>
          <button type="button" data-products>Produtos</button><button type="button" data-fiscal-operations>Operações fiscais</button>
          <button type="button" data-catalog="cfops">CFOP</button><button type="button" data-catalog="tax-situations">CST / CSOSN</button><button type="button" data-catalog="icms-rates">Alíquotas ICMS</button>
        </div></details>
        <button type="button">Estoque</button><button type="button">Vendas</button><button type="button">Relatórios</button><button type="button">Configurações</button>
      </nav>
      <div class="classic-toolbar">
        <button class="classic-tool-button" data-back type="button">← Frente de caixa</button>
        <button class="classic-tool-button" data-classes type="button">Classes</button><button class="classic-tool-button" data-groups type="button">Grupos</button>
        <button class="classic-tool-button" data-products type="button">Produtos</button><button class="classic-tool-button is-active" type="button">Operações fiscais</button>
        <button class="classic-tool-button" data-catalog="cfops" type="button">CFOP</button><button class="classic-tool-button" data-catalog="tax-situations" type="button">CST / CSOSN</button><button class="classic-tool-button" data-catalog="icms-rates" type="button">Alíquotas ICMS</button>
      </div>
      <section class="classic-content fiscal-content">
        <form class="classic-form-panel fiscal-operation-form" data-form>
          <div class="classic-panel-header">${editing ? "Alterar operação fiscal" : "Nova operação fiscal"}</div>
          <div class="classic-form-body">
            <div class="classic-form-grid">
              <label class="form-field"><span>Tipo</span><select name="typeFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.operationTypes]), editing?.typeFiscalOperation ?? "exit")}</select></label>
            </div>
            <label class="form-field"><span>Descrição</span><input name="descriptionFiscalOperation" required maxlength="180" value="${escapeHtml(editing?.descriptionFiscalOperation ?? "")}" /></label>
            <div class="classic-form-grid">
              <label class="form-field"><span>Regime tributário</span><select name="taxRegimeFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.taxRegimes]), editing?.taxRegimeFiscalOperation ?? "Simples Nacional")}</select></label>
              <label class="form-field"><span>Contexto fiscal</span><select name="contextFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.contexts]), editing?.contextFiscalOperation ?? "within_state")}</select></label>
            </div>
            <div class="classic-form-grid">
              <label class="form-field"><span>Situação tributária</span><select name="taxSituationFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.taxSituations]), editing?.taxSituationFiscalOperation ?? "", "Selecione")}</select></label>
              <label class="form-field"><span>Origem</span><select name="originFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.origins]), editing?.originFiscalOperation ?? "0")}</select></label>
            </div>
            <div class="classic-form-grid">
              <label class="form-field"><span>CFOP</span><select name="cfopFiscalOperation">${renderOptions(toOptions(catalogs.cfops || []), editing?.cfopFiscalOperation ?? "", "Selecione")}</select></label>
              <label class="form-field"><span>Natureza da operação</span><input name="operationNatureFiscalOperation" maxlength="180" value="${escapeHtml(editing?.operationNatureFiscalOperation ?? "")}" /></label>
            </div>
            <div class="classic-form-grid">
              <label class="form-field"><span>IPI - situação tributária</span><select name="ipiSituationFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.ipiSituations]), editing?.ipiSituationFiscalOperation ?? "", "Selecione")}</select></label>
              <label class="form-field"><span>Motivo de desoneração do ICMS</span><select name="icmsExemptionReasonFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.exemptionReasons]), editing?.icmsExemptionReasonFiscalOperation ?? "", "Selecione")}</select></label>
            </div>
            <div class="classic-form-grid">
              <label class="form-field"><span>COFINS - situação tributária</span><select name="cofinsSituationFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.contributionSituations]), editing?.cofinsSituationFiscalOperation ?? "", "Selecione")}</select></label>
              <label class="form-field"><span>PIS - situação tributária</span><select name="pisSituationFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.contributionSituations]), editing?.pisSituationFiscalOperation ?? "", "Selecione")}</select></label>
            </div>
            <div class="classic-form-grid">
              <label class="form-field"><span>Modalidade BC ICMS</span><select name="icmsBaseModeFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.baseModes]), editing?.icmsBaseModeFiscalOperation ?? "value")}</select></label>
              <label class="form-field"><span>Modalidade BC ICMS-ST</span><select name="icmsStBaseModeFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.baseModes]), editing?.icmsStBaseModeFiscalOperation ?? "value")}</select></label>
            </div>
            <div class="classic-form-grid">
              <label class="form-field"><span>Código de benefício fiscal</span><input name="fiscalBenefitCodeFiscalOperation" maxlength="40" value="${escapeHtml(editing?.fiscalBenefitCodeFiscalOperation ?? "")}" /></label>
              <label class="form-field fiscal-check"><input type="checkbox" name="fcpEnabledFiscalOperation" ${editing?.fcpEnabledFiscalOperation ? "checked" : ""} /> Gerar FCP</label>
              <label class="form-field fiscal-check"><input type="checkbox" name="fcpStEnabledFiscalOperation" ${editing?.fcpStEnabledFiscalOperation ? "checked" : ""} /> Gerar FCP-ST</label>
            </div>
            <label class="form-field"><span>Base legal</span><textarea name="legalBasisFiscalOperation" rows="3" maxlength="2000">${escapeHtml(editing?.legalBasisFiscalOperation ?? "")}</textarea></label>
            ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}${message ? `<p class="success-message">${escapeHtml(message)}</p>` : ""}
          </div>
          <div class="classic-form-actions"><button class="classic-button primary" type="submit" ${submitting ? "disabled" : ""}>${submitting ? "Salvando..." : editing ? "Salvar alterações" : "Salvar"}</button><button class="classic-button" data-clear type="button">Limpar</button></div>
        </form>
        <section class="classic-grid-panel">
          <div class="classic-panel-header classic-list-header"><span>Operações fiscais</span><input class="classic-list-search" data-search type="search" placeholder="Pesquisar código ou descrição..." value="${escapeHtml(searchTerm)}" /></div>
          <div class="classic-grid-wrapper">${loading ? '<p class="classic-empty">Carregando operações fiscais...</p>' : visible.length ? `<table class="classic-table"><thead><tr><th>Descrição</th><th>Tipo</th><th>CFOP</th><th>Contexto</th><th>Ações</th></tr></thead><tbody>${visible.map((operation) => `<tr class="${operation.isActiveFiscalOperation ? "" : "is-inactive"}"><td>${escapeHtml(operation.descriptionFiscalOperation)}</td><td>${escapeHtml(toOptions(catalogs[catalogKeys.operationTypes]).find(([value]) => value === operation.typeFiscalOperation)?.[1] || operation.typeFiscalOperation)}</td><td>${escapeHtml(operation.cfopFiscalOperation || "-")}</td><td>${escapeHtml(toOptions(catalogs[catalogKeys.contexts]).find(([value]) => value === operation.contextFiscalOperation)?.[1] || operation.contextFiscalOperation)}</td><td class="actions-column"><button class="icon-button edit" type="button" title="Editar operação fiscal" aria-label="Editar operação fiscal" data-edit="${operation.idFiscalOperation}"><i data-lucide="pencil"></i></button><button class="icon-button delete" type="button" title="Excluir operação fiscal definitivamente" aria-label="Excluir operação fiscal definitivamente" data-delete="${operation.idFiscalOperation}"><i data-lucide="trash-2"></i></button></td></tr>`).join("")}</tbody></table>` : '<p class="classic-empty">Nenhuma operação fiscal cadastrada.</p>'}</div>
        </section>
      </section>`;
    renderLucideIcons(root);
    bind();
  };

  const bind = () => {
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    root.querySelector("[data-classes]")?.addEventListener("click", onClasses);
    root.querySelector("[data-groups]")?.addEventListener("click", onGroups);
    root.querySelector("[data-products]")?.addEventListener("click", onProducts);
    root.querySelectorAll("[data-fiscal-operations]").forEach((button) => button.addEventListener("click", onFiscalOperations));
    root.querySelectorAll("[data-catalog]").forEach((button) => button.addEventListener("click", () => onCatalog(button.dataset.catalog)));
    root.querySelector("[data-search]")?.addEventListener("input", (event) => { searchTerm = event.target.value; render(); root.querySelector("[data-search]")?.focus(); });
    root.querySelector("[data-clear]")?.addEventListener("click", () => { editing = null; error = ""; message = ""; render(); });
    root.querySelector("[data-form]")?.addEventListener("submit", (event) => { event.preventDefault(); void submit(Object.fromEntries(new FormData(event.currentTarget))); });
    root.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => { editing = operations.find((item) => String(item.idFiscalOperation) === button.dataset.edit) || null; error = ""; render(); }));
    root.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => void remove(Number(button.dataset.delete))));
  };

  const load = async () => {
    loading = true; render();
    try {
      const [operationResponse, ...catalogResponses] = await Promise.all([
        fetch(`${getApiUrl()}/api/fiscal-operations?includeInactive=1`),
        ...Object.values(catalogKeys).map((catalog) => fetch(`${getApiUrl()}/api/fiscal-catalogs?catalog=${encodeURIComponent(catalog)}`))
      ]);
      const operationPayload = await operationResponse.json();
      if (!operationResponse.ok) throw new Error(operationPayload.error || "Não foi possível carregar as operações fiscais.");
      const catalogPayloads = await Promise.all(catalogResponses.map((response) => response.json()));
      const failedCatalog = catalogPayloads.find((payload) => payload.error);
      if (failedCatalog) throw new Error(failedCatalog.error);
      operations = operationPayload.fiscalOperations;
      catalogs = Object.fromEntries(catalogPayloads.map((payload) => [payload.catalog, payload.items]));
      error = "";
    } catch (loadError) { error = loadError instanceof Error ? loadError.message : "Falha ao carregar operações fiscais."; }
    finally { loading = false; render(); }
  };

  const submit = async (form) => {
    submitting = true; error = ""; message = ""; render();
    const payload = { ...form, ...(editing ? { idFiscalOperation: editing.idFiscalOperation } : {}), fcpEnabledFiscalOperation: Boolean(form.fcpEnabledFiscalOperation), fcpStEnabledFiscalOperation: Boolean(form.fcpStEnabledFiscalOperation) };
    try {
      const response = await fetch(`${getApiUrl()}/api/fiscal-operations`, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar a operação fiscal.");
      editing = null; message = "Operação fiscal salva com sucesso."; await load();
    } catch (submitError) { error = submitError instanceof Error ? submitError.message : "Falha ao salvar operação fiscal."; }
    finally { submitting = false; render(); }
  };

  const remove = async (idFiscalOperation) => {
    if (!window.confirm("Excluir esta operação fiscal definitivamente?")) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/fiscal-operations`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idFiscalOperation }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível excluir a operação fiscal.");
      message = "Operação fiscal excluída com sucesso."; await load();
    } catch (removeError) { error = removeError instanceof Error ? removeError.message : "Falha ao excluir operação fiscal."; render(); }
  };

  render();
  void load();
  return root;
}
