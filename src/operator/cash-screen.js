import { apiFetch, getApiUrl } from "../shared/api.js";

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

export function createCashScreen({ onBack, onOpened, onClosed } = {}) {
  const root = document.createElement("main");
  root.className = "settings-screen";
  root.innerHTML = `
    <section class="content-card">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Financeiro</p>
          <h1>Controle de caixa</h1>
        </div>
        <button class="secondary-button" data-back type="button">Voltar</button>
      </div>
      <div data-content><p>Carregando caixa...</p></div>
    </section>
  `;
  const content = root.querySelector("[data-content]");

  const render = ({ cashSession, operator, error = "" } = {}) => {
    if (error) {
      content.innerHTML = `<p class="error-state">${escapeHtml(error)}</p>`;
      return;
    }
    const roleCanClose = ["supervisor", "admin"].includes(operator?.roleOperator);
    content.innerHTML = `
      <p><strong>Operador:</strong> ${escapeHtml(operator?.displayNameOperator || "")}</p>
      <p><strong>Status:</strong> ${cashSession ? "Aberto" : "Fechado"}</p>
      ${cashSession ? `
        <p><strong>Saldo esperado:</strong> R$ ${escapeHtml(cashSession.expectedClosingAmountCashSession)}</p>
        <form data-movement-form class="stack-form">
          <h2>Movimento manual</h2>
          <label class="form-field"><span>Tipo</span><select name="typeCashMovement"><option value="supply">Suprimento</option><option value="withdrawal">Sangria</option></select></label>
          <label class="form-field"><span>Valor</span><input name="amountCashMovement" inputmode="decimal" required /></label>
          <label class="form-field"><span>Descrição</span><input name="descriptionCashMovement" required minlength="3" /></label>
          <button class="secondary-button" type="submit">Registrar movimento</button>
        </form>
        ${roleCanClose ? `
          <form data-close-form class="stack-form">
            <h2>Fechar caixa</h2>
            <label class="form-field"><span>Valor contado</span><input name="closingAmountCashSession" inputmode="decimal" required /></label>
            <label class="form-field"><span>Justificativa da diferença</span><textarea name="closingJustificationCashSession"></textarea></label>
            <button class="primary-button" type="submit">Fechar caixa</button>
          </form>
        ` : "<p>Somente supervisor ou admin pode fechar o caixa.</p>"}
        <p data-feedback class="muted"></p>
      ` : `
        <form data-open-form class="stack-form">
          <h2>Abrir caixa</h2>
          <p>Informe o saldo inicial para começar a registrar vendas.</p>
          <label class="form-field"><span>Saldo inicial</span><input name="openingAmountCashSession" inputmode="decimal" required /></label>
          <button class="primary-button" type="submit">Abrir caixa e continuar</button>
          <p data-feedback class="muted" role="status"></p>
        </form>
      `}
    `;
    root.querySelector("[data-open-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void openCash(event.currentTarget);
    });
    root.querySelector("[data-movement-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitMovement(event.currentTarget);
    });
    root.querySelector("[data-close-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void closeCash(event.currentTarget);
    });
  };

  const openCash = async (form) => {
    const feedback = root.querySelector("[data-feedback]");
    try {
      const response = await apiFetch(`${getApiUrl()}/api/cash/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível abrir o caixa.");
      if (onOpened) {
        await onOpened(payload);
      } else {
        await load();
      }
    } catch (error) {
      if (feedback) feedback.textContent = error.message;
    }
  };

  const load = async () => {
    try {
      const [sessionResponse, cashResponse] = await Promise.all([
        apiFetch(`${getApiUrl()}/api/operator/session`),
        apiFetch(`${getApiUrl()}/api/cash/current`)
      ]);
      const sessionPayload = await sessionResponse.json();
      const cashPayload = await cashResponse.json();
      if (!sessionResponse.ok || !cashResponse.ok) {
        throw new Error(sessionPayload.error || cashPayload.error || "Não foi possível carregar o caixa.");
      }
      render({ operator: sessionPayload.operator, cashSession: cashPayload.cashSession });
    } catch (error) {
      render({ error: error.message });
    }
  };

  const submitMovement = async (form) => {
    const feedback = root.querySelector("[data-feedback]");
    try {
      const response = await apiFetch(`${getApiUrl()}/api/cash/movements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível registrar o movimento.");
      feedback.textContent = "Movimento registrado.";
      await load();
    } catch (error) {
      feedback.textContent = error.message;
    }
  };

  const closeCash = async (form) => {
    const feedback = root.querySelector("[data-feedback]");
    try {
      const response = await apiFetch(`${getApiUrl()}/api/cash/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível fechar o caixa.");
      await onClosed?.(payload);
    } catch (error) {
      feedback.textContent = error.message;
    }
  };

  root.querySelector("[data-back]").addEventListener("click", () => onBack?.());
  void load();
  return root;
}
