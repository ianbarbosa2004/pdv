import { renderLucideIcons } from "../ui/icons.js";
import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { bindFormRowPreview } from "../ui/form-row-preview.js";
import { bindFiscalNavigation, renderFiscalNavigation } from "./fiscal-navigation.js";
import { createFeedbackTimer, renderSuccessFeedback } from "../ui/feedback.js";
import { getApiUrl } from "../shared/api.js";

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

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

const toOptions = (items, showCode = false) =>
  items.map((item) => [
    item.codeFiscalCatalogItem,
    showCode
      ? `${item.codeFiscalCatalogItem} - ${item.descriptionFiscalCatalogItem}`
      : item.descriptionFiscalCatalogItem
  ]);

const toCodeOnlyOptions = (items) =>
  items.map((item) => [item.codeFiscalCatalogItem, item.codeFiscalCatalogItem]);

export function createFiscalOperationScreen({
  onBack,
  onClasses,
  onGroups,
  onProducts,
  onFiscalOperations,
  onCatalog,
  onThermalPrint,
  onNcmCestUpdate,
  onSettings,
  onCompany,
  onNfce,
  onFinancial,
  onPaymentMethods
}) {
  const root = document.createElement("main");
  let operations = [];
  let catalogs = Object.fromEntries(Object.values(catalogKeys).map((key) => [key, []]));
  let loading = true;
  let submitting = false;
  let error = "";
  let message = "";
  let editing = null;
  const scheduleMessageClear = createFeedbackTimer();
  let searchTerm = "";

  const getCfopDescription = (code) =>
    catalogs.cfops.find((item) => String(item.codeFiscalCatalogItem) === String(code))?.descriptionFiscalCatalogItem || "";

  const render = () => {
    const visible = operations.filter((operation) =>
      [operation.descriptionFiscalOperation, operation.cfopFiscalOperation]
        .some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(searchTerm.toLocaleLowerCase("pt-BR")))
    );
    root.className = "catalog-screen";
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - Operações fiscais</strong><span>Operador: Operador</span></header>
      ${renderMainMenu()}
      ${renderFiscalNavigation("fiscal-operations")}
      <section class="classic-content fiscal-content">
        ${renderSuccessFeedback(message, escapeHtml)}
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
              <label class="form-field"><span>Situação tributária</span><select name="taxSituationFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.taxSituations], true), editing?.taxSituationFiscalOperation ?? "", "Selecione")}</select></label>
              <label class="form-field"><span>Origem</span><select name="originFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.origins], true), editing?.originFiscalOperation ?? "0")}</select></label>
            </div>
            <div class="classic-form-grid">
              <label class="form-field"><span>CFOP</span><select name="cfopFiscalOperation">${renderOptions(toCodeOnlyOptions(catalogs.cfops || []), editing?.cfopFiscalOperation ?? "", "Selecione")}</select></label>
              <label class="form-field"><span>Natureza da operação</span><input name="operationNatureFiscalOperation" maxlength="180" disabled readonly value="${escapeHtml(getCfopDescription(editing?.cfopFiscalOperation) || editing?.operationNatureFiscalOperation || "")}" /></label>
            </div>
            <div class="classic-form-grid">
              <label class="form-field"><span>IPI - situação tributária</span><select name="ipiSituationFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.ipiSituations], true), editing?.ipiSituationFiscalOperation ?? "", "Selecione")}</select></label>
              <label class="form-field"><span>Motivo de desoneração do ICMS</span><select name="icmsExemptionReasonFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.exemptionReasons], true), editing?.icmsExemptionReasonFiscalOperation ?? "", "Selecione")}</select></label>
            </div>
            <div class="classic-form-grid">
              <label class="form-field"><span>COFINS - situação tributária</span><select name="cofinsSituationFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.contributionSituations], true), editing?.cofinsSituationFiscalOperation ?? "", "Selecione")}</select></label>
              <label class="form-field"><span>PIS - situação tributária</span><select name="pisSituationFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.contributionSituations], true), editing?.pisSituationFiscalOperation ?? "", "Selecione")}</select></label>
            </div>
            <div class="classic-form-grid">
              <label class="form-field"><span>Modalidade BC ICMS</span><select name="icmsBaseModeFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.baseModes]), editing?.icmsBaseModeFiscalOperation ?? "value")}</select></label>
              <label class="form-field"><span>Modalidade BC ICMS-ST</span><select name="icmsStBaseModeFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.baseModes]), editing?.icmsStBaseModeFiscalOperation ?? "value")}</select></label>
            </div>
            <fieldset class="fcp-fieldset">
              <legend>Gerar Fundo de Combate à Pobreza</legend>
              <div class="fcp-options">
                <label><input type="checkbox" name="fcpEnabledFiscalOperation" ${editing?.fcpEnabledFiscalOperation ? "checked" : ""} /> FCP</label>
                <label><input type="checkbox" name="fcpUseReductionBaseFiscalOperation" ${editing?.fcpUseReductionBaseFiscalOperation ? "checked" : ""} /> Utilizar Redução BC</label>
                <label><input type="checkbox" name="fcpStEnabledFiscalOperation" ${editing?.fcpStEnabledFiscalOperation ? "checked" : ""} /> FCP ST</label>
                <label><input type="checkbox" name="fcpStUseReductionBaseFiscalOperation" ${editing?.fcpStUseReductionBaseFiscalOperation ? "checked" : ""} /> Utilizar Redução BC ST</label>
              </div>
            </fieldset>
            ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}
          </div>
          <div class="classic-form-actions"><button class="classic-button primary" type="submit" ${submitting ? "disabled" : ""}>${submitting ? "Salvando..." : editing ? "Salvar alterações" : "Salvar"}</button><button class="classic-button" data-clear type="button">Limpar</button></div>
        </form>
        <section class="classic-grid-panel">
          <div class="classic-panel-header classic-list-header"><span>Operações fiscais</span><input class="classic-list-search" data-search type="search" placeholder="Pesquisar código ou descrição..." value="${escapeHtml(searchTerm)}" /></div>
          <div class="classic-grid-wrapper">${loading ? '<p class="classic-empty">Carregando operações fiscais...</p>' : visible.length           ? `<table class="classic-table"><thead><tr><th>CFOP</th><th>Tipo</th><th>Descrição</th><th>Ações</th></tr></thead><tbody>${visible.map((operation) => `<tr class="${operation.isActiveFiscalOperation ? "" : "is-inactive"}" data-view-record="${escapeHtml(JSON.stringify(operation))}"><td>${escapeHtml(operation.cfopFiscalOperation || "-")}</td><td>${escapeHtml(toOptions(catalogs[catalogKeys.operationTypes]).find(([value]) => value === operation.typeFiscalOperation)?.[1] || operation.typeFiscalOperation)}</td><td>${escapeHtml(operation.descriptionFiscalOperation)}</td><td class="actions-column"><button class="icon-button edit" type="button" title="Editar operação fiscal" aria-label="Editar operação fiscal" data-edit="${operation.idFiscalOperation}"><i data-lucide="pencil"></i></button><button class="icon-button delete" type="button" title="Excluir operação fiscal definitivamente" aria-label="Excluir operação fiscal definitivamente" data-delete="${operation.idFiscalOperation}"><i data-lucide="trash-2"></i></button></td></tr>`).join("")}</tbody></table>` : '<p class="classic-empty">Nenhuma operação fiscal cadastrada.</p>'}</div>
        </section>
      </section>
      ${editing ? `
        <div class="classic-modal-backdrop" data-modal-backdrop>
          <section class="classic-modal" role="dialog" aria-modal="true" aria-labelledby="edit-fiscal-operation-title">
            <div class="classic-panel-header modal-panel-header"><span id="edit-fiscal-operation-title">Editar operação fiscal</span><button class="modal-close-button" data-cancel-edit type="button" aria-label="Fechar" title="Fechar"><i data-lucide="x"></i></button></div>
            <form data-edit-form>
              <div class="classic-form-body">
                <div class="classic-form-grid">
                  <label class="form-field"><span>Tipo</span><select name="typeFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.operationTypes]), editing.typeFiscalOperation ?? "exit")}</select></label>
                </div>
                <label class="form-field"><span>Descrição</span><input name="descriptionFiscalOperation" required maxlength="180" value="${escapeHtml(editing.descriptionFiscalOperation ?? "")}" /></label>
                <div class="classic-form-grid">
                  <label class="form-field"><span>Regime tributário</span><select name="taxRegimeFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.taxRegimes]), editing.taxRegimeFiscalOperation ?? "Simples Nacional")}</select></label>
                  <label class="form-field"><span>Contexto fiscal</span><select name="contextFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.contexts]), editing.contextFiscalOperation ?? "within_state")}</select></label>
                </div>
                <div class="classic-form-grid">
                  <label class="form-field"><span>Situação tributária</span><select name="taxSituationFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.taxSituations], true), editing.taxSituationFiscalOperation ?? "", "Selecione")}</select></label>
                  <label class="form-field"><span>Origem</span><select name="originFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.origins], true), editing.originFiscalOperation ?? "0")}</select></label>
                </div>
                <div class="classic-form-grid">
                  <label class="form-field"><span>CFOP</span><select name="cfopFiscalOperation">${renderOptions(toCodeOnlyOptions(catalogs.cfops || []), editing.cfopFiscalOperation ?? "", "Selecione")}</select></label>
                  <label class="form-field"><span>Natureza da operação</span><input name="operationNatureFiscalOperation" maxlength="180" disabled readonly value="${escapeHtml(getCfopDescription(editing.cfopFiscalOperation) || editing.operationNatureFiscalOperation || "")}" /></label>
                </div>
                <div class="classic-form-grid">
                  <label class="form-field"><span>IPI - situação tributária</span><select name="ipiSituationFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.ipiSituations], true), editing.ipiSituationFiscalOperation ?? "", "Selecione")}</select></label>
                  <label class="form-field"><span>Motivo de desoneração do ICMS</span><select name="icmsExemptionReasonFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.exemptionReasons], true), editing.icmsExemptionReasonFiscalOperation ?? "", "Selecione")}</select></label>
                </div>
                <div class="classic-form-grid">
                  <label class="form-field"><span>COFINS - situação tributária</span><select name="cofinsSituationFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.contributionSituations], true), editing.cofinsSituationFiscalOperation ?? "", "Selecione")}</select></label>
                  <label class="form-field"><span>PIS - situação tributária</span><select name="pisSituationFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.contributionSituations], true), editing.pisSituationFiscalOperation ?? "", "Selecione")}</select></label>
                </div>
                <div class="classic-form-grid">
                  <label class="form-field"><span>Modalidade BC ICMS</span><select name="icmsBaseModeFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.baseModes]), editing.icmsBaseModeFiscalOperation ?? "value")}</select></label>
                  <label class="form-field"><span>Modalidade BC ICMS-ST</span><select name="icmsStBaseModeFiscalOperation">${renderOptions(toOptions(catalogs[catalogKeys.baseModes]), editing.icmsStBaseModeFiscalOperation ?? "value")}</select></label>
                </div>
                <fieldset class="fcp-fieldset">
                  <legend>Gerar Fundo de Combate à Pobreza</legend>
                  <div class="fcp-options">
                    <label><input type="checkbox" name="fcpEnabledFiscalOperation" ${editing.fcpEnabledFiscalOperation ? "checked" : ""} /> FCP</label>
                    <label><input type="checkbox" name="fcpUseReductionBaseFiscalOperation" ${editing.fcpUseReductionBaseFiscalOperation ? "checked" : ""} /> Utilizar Redução BC</label>
                    <label><input type="checkbox" name="fcpStEnabledFiscalOperation" ${editing.fcpStEnabledFiscalOperation ? "checked" : ""} /> FCP ST</label>
                    <label><input type="checkbox" name="fcpStUseReductionBaseFiscalOperation" ${editing.fcpStUseReductionBaseFiscalOperation ? "checked" : ""} /> Utilizar Redução BC ST</label>
                  </div>
                </fieldset>
                ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}
              </div>
              <div class="classic-form-actions"><button class="classic-button primary" type="submit" ${submitting ? "disabled" : ""}>${submitting ? "Salvando..." : "Salvar alterações"}</button><button class="classic-button" type="button" data-cancel-edit ${submitting ? "disabled" : ""}>Cancelar</button></div>
            </form>
          </section>
        </div>
      ` : ""}
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
    bind();
    bindFormRowPreview(root, { formSelector: "[data-form]" });
  };

  const bind = () => {
    bindFiscalNavigation(root, {
      back: onBack,
      "fiscal-operations": onFiscalOperations,
      cfops: () => onCatalog("cfops"),
      "tax-situations": () => onCatalog("tax-situations"),
      "icms-rates": () => onCatalog("icms-rates"),
      "tax-regimes": () => onCatalog("tax-regimes"),
      "operation-types": () => onCatalog("operation-types"),
      contexts: () => onCatalog("contexts"),
      origins: () => onCatalog("origins"),
      "ipi-situations": () => onCatalog("ipi-situations"),
      "contribution-situations": () => onCatalog("contribution-situations"),
      "base-modes": () => onCatalog("base-modes"),
      "exemption-reasons": () => onCatalog("exemption-reasons")
    });
    root.querySelector("[data-search]")?.addEventListener("input", (event) => { searchTerm = event.target.value; render(); root.querySelector("[data-search]")?.focus(); });
    root.querySelector('select[name="cfopFiscalOperation"]')?.addEventListener("change", (event) => {
      const natureInput = root.querySelector('input[name="operationNatureFiscalOperation"]');
      if (natureInput) natureInput.value = getCfopDescription(event.currentTarget.value);
    });
    root.querySelector("[data-clear]")?.addEventListener("click", () => { editing = null; error = ""; message = ""; render(); });
    root.querySelector("[data-form]")?.addEventListener("submit", (event) => { event.preventDefault(); void submit(Object.fromEntries(new FormData(event.currentTarget))); });
    root.querySelector("[data-edit-form]")?.addEventListener("submit", (event) => { event.preventDefault(); void submit(Object.fromEntries(new FormData(event.currentTarget)), true); });
    root.querySelectorAll("[data-cancel-edit]").forEach((button) => {
      button.addEventListener("click", () => { editing = null; render(); });
    });
    root.querySelector("[data-modal-backdrop]")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) { editing = null; render(); } });
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
    const payload = {
      ...form,
      ...(editing ? { idFiscalOperation: editing.idFiscalOperation } : {}),
      fcpEnabledFiscalOperation: Boolean(form.fcpEnabledFiscalOperation),
      fcpUseReductionBaseFiscalOperation: Boolean(form.fcpUseReductionBaseFiscalOperation),
      fcpStEnabledFiscalOperation: Boolean(form.fcpStEnabledFiscalOperation),
      fcpStUseReductionBaseFiscalOperation: Boolean(form.fcpStUseReductionBaseFiscalOperation)
    };
    try {
      const response = await fetch(`${getApiUrl()}/api/fiscal-operations`, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar a operação fiscal.");
      editing = null;
      message = "Operação fiscal salva com sucesso.";
      await load();
      scheduleMessageClear(() => {
        message = "";
        render();
      });
    } catch (submitError) { error = submitError instanceof Error ? submitError.message : "Falha ao salvar operação fiscal."; }
    finally { submitting = false; render(); }
  };

  const remove = async (idFiscalOperation) => {
    if (!window.confirm("Excluir esta operação fiscal definitivamente?")) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/fiscal-operations`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idFiscalOperation }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível excluir a operação fiscal.");
      message = "Operação fiscal excluída com sucesso.";
      operations = operations.filter((item) => String(item.idFiscalOperation) !== String(idFiscalOperation));
      render();
      await load();
      scheduleMessageClear(() => {
        message = "";
        render();
      });
    } catch (removeError) { error = removeError instanceof Error ? removeError.message : "Falha ao excluir operação fiscal."; render(); }
  };

  render();
  void load();
  return root;
}
