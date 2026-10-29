import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { createFeedbackTimer, renderSuccessFeedback } from "../ui/feedback.js";

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const demoNfce = {
  accessKey: "31261004641376030124650080000482771496517110",
  number: "48277",
  series: "8",
  issuedAt: "25/10/2026 11:30:41",
  status: "AUTORIZADA",
  issuer: "SUPERMERCADOS BH COM. DE ALIMENTOS S.A",
  issuerDocument: "04.641.376/0301-24",
  total: "209,57",
  items: [
    ["GUARD MILI 21X22CM", "1,000", "PT", "1,99"],
    ["GUARD MILI 21X22CM", "1,000", "PT", "1,99"],
    ["BISC BH C CR 360G", "1,000", "PT", "4,98"],
    ["LASAN SAD CAL 600G", "1,000", "PT", "14,98"],
    ["FLO MILHO PACHA 500G", "1,000", "PT", "2,68"],
    ["LING CAR COS BOV 300", "1,000", "PT", "16,98"],
    ["LING CAR COS BOV 300", "1,000", "PT", "16,98"],
    ["LING CAR COS BOV 300", "1,000", "PT", "16,98"],
    ["CR DENT CLOSEUP 130G", "1,000", "TB", "5,98"],
    ["QJO CAMEMB 125G", "1,000", "UN", "18,90"],
    ["SUCO SEMPRE 1 5L", "1,000", "FR", "14,98"],
    ["DOCE LTE BH 350G", "1,000", "PO", "9,98"],
    ["REFR C COLA CAFE 220", "1,000", "LT", "2,09"],
    ["BEB ENERG TNT 473ML", "1,000", "LT", "6,98"],
    ["BEB ENERG TNT 473ML", "1,000", "LT", "6,98"],
    ["CERV BRAH Z A 473ML", "1,000", "LT", "3,98"],
    ["CERV BRAH Z A 473ML", "12,000", "LT", "3,98"],
    ["AMAC R BH FLORAL 2L", "1,000", "FR", "6,40"],
    ["AG SANIT YPE 2L", "1,000", "FR", "7,98"]
  ]
};

export function createNfceQueryScreen({ onBack, onNfce, ...handlers }) {
  const root = document.createElement("main");
  let accessKey = demoNfce.accessKey;
  let selectedItems = new Set();
  let message = "";
  const scheduleMessageClear = createFeedbackTimer();

  const render = () => {
    root.className = "catalog-screen settings-screen";
    root.innerHTML = `
      <header class="classic-titlebar">
        <strong>PDV - Consulta de NFC-e</strong>
        <span>Operador: Operador</span>
      </header>
      ${renderMainMenu()}
      <div class="classic-toolbar">
        <button class="classic-tool-button" data-back type="button">← Frente de caixa</button>
        <strong>Ferramentas fiscais</strong>
      </div>
      <section class="settings-content">
        ${renderSuccessFeedback(message, escapeHtml)}
        <div class="backoffice-home-heading">
          <p class="eyebrow">Teste de integração</p>
          <h1>Consulta de NFC-e</h1>
          <p>Confira os dados exibidos pelo portal oficial antes de usar a nota em uma futura entrada de compras.</p>
        </div>
        <section class="classic-form-panel">
          <div class="classic-panel-header">Consulta oficial</div>
          <div class="classic-form-body">
            <label class="form-field">
              <span>Chave de acesso</span>
              <input data-access-key maxlength="44" inputmode="numeric" value="${escapeHtml(accessKey)}" />
            </label>
            <p class="form-help">O portal oficial exige validação manual do Cloudflare Turnstile. Esta tela não tenta contornar esse desafio.</p>
          </div>
          <div class="classic-form-actions">
            <button class="classic-button primary" data-open-portal type="button">Abrir consulta oficial</button>
            <button class="classic-button" data-load-demo type="button">Carregar demonstração</button>
          </div>
        </section>
        <section class="classic-grid-panel nfce-query-result" aria-live="polite">
          <div class="classic-panel-header">Resultado demonstrativo</div>
          <div class="classic-form-body">
            <div class="api-status-summary is-connected">
              <span class="api-status-indicator" aria-hidden="true"></span>
              <div><strong>NFC-e ${demoNfce.status}</strong><small>Dados carregados somente para teste local.</small></div>
            </div>
            <dl class="api-status-details">
              <div><dt>Chave</dt><dd>${escapeHtml(demoNfce.accessKey)}</dd></div>
              <div><dt>Modelo / Série / Número</dt><dd>65 / ${demoNfce.series} / ${demoNfce.number}</dd></div>
              <div><dt>Emissão</dt><dd>${escapeHtml(demoNfce.issuedAt)}</dd></div>
              <div><dt>Emitente</dt><dd>${escapeHtml(demoNfce.issuer)} (${escapeHtml(demoNfce.issuerDocument)})</dd></div>
              <div><dt>Valor total</dt><dd>R$ ${escapeHtml(demoNfce.total)}</dd></div>
            </dl>
          </div>
          <div class="classic-grid-wrapper">
            <table class="classic-table">
              <thead><tr><th>Usar</th><th>Nº</th><th>Descrição</th><th>Quantidade</th><th>Unidade</th><th>Valor unitário</th></tr></thead>
              <tbody>
                ${demoNfce.items.map(([name, quantity, unit, price], index) => `
                  <tr>
                    <td><input type="checkbox" data-item-index="${index}" ${selectedItems.has(index) ? "checked" : ""} aria-label="Selecionar ${escapeHtml(name)}" /></td>
                    <td>${index + 1}</td>
                    <td>${escapeHtml(name)}</td>
                    <td>${escapeHtml(quantity)}</td>
                    <td>${escapeHtml(unit)}</td>
                    <td>R$ ${escapeHtml(price)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
          <div class="classic-form-actions">
            <button class="classic-button primary" data-prepare-purchase type="button">Preparar itens para futura entrada</button>
          </div>
        </section>
      </section>
    `;
    bindMainMenu(root, handlers);
    bind();
  };

  const bind = () => {
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    root.querySelector("[data-access-key]")?.addEventListener("input", (event) => {
      accessKey = event.currentTarget.value.replace(/\D/g, "").slice(0, 44);
    });
    root.querySelector("[data-open-portal]")?.addEventListener("click", () => {
      const url = "https://portalsped.fazenda.mg.gov.br/portalnfce/sistema/consultaarg.xhtml";
      window.open(url, "_blank", "noopener,noreferrer");
      message = "Consulta oficial aberta. Informe a chave e conclua o desafio humano no portal.";
      render();
      scheduleMessageClear(() => {
        message = "";
        render();
      });
    });
    root.querySelector("[data-load-demo]")?.addEventListener("click", () => {
      accessKey = demoNfce.accessKey;
      selectedItems = new Set();
      message = "Demonstração carregada. Nenhum dado foi gravado no banco.";
      render();
      scheduleMessageClear(() => {
        message = "";
        render();
      });
    });
    root.querySelectorAll("[data-item-index]").forEach((checkbox) => {
      checkbox.addEventListener("change", (event) => {
        const index = Number(event.currentTarget.dataset.itemIndex);
        if (event.currentTarget.checked) selectedItems.add(index);
        else selectedItems.delete(index);
      });
    });
    root.querySelector("[data-prepare-purchase]")?.addEventListener("click", () => {
      message = selectedItems.size
        ? `${selectedItems.size} item(ns) selecionado(s) para a futura entrada de compras.`
        : "Selecione ao menos um item para preparar a futura entrada de compras.";
      render();
      scheduleMessageClear(() => {
        message = "";
        render();
      });
    });
  };

  render();
  return root;
}
