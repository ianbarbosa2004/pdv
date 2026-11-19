export const createFeedbackTimer = () => {
  let token = 0;
  let timer = null;

  return (callback, delay = 2500) => {
    token += 1;
    const currentToken = token;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (currentToken === token) callback();
    }, delay);
  };
};

export const renderSuccessFeedback = (message, escapeHtml) =>
  message
    ? `
      <div class="page-feedback" data-success-feedback role="status" aria-live="polite">
        <div class="feedback-modal-panel">
          <div class="feedback-modal-icon" aria-hidden="true">✓</div>
          <div class="feedback-modal-content">
            <strong class="feedback-modal-title">Concluído</strong>
            <span class="feedback-modal-message">${escapeHtml(message)}</span>
          </div>
        </div>
      </div>
    `
    : "";

export const clearRenderedFeedback = (root) => {
  root.querySelectorAll("[data-success-feedback]").forEach((feedback) => feedback.remove());
};

export const formatUpdatedRecipeStructures = (count) => {
  const amount = Number(count) || 0;
  if (amount < 1) return "";
  return amount === 1
    ? "1 Receita ou Composição recalculada."
    : `${amount} Receitas ou Composições recalculadas.`;
};

export const formatUpdatedFiscalItems = (count) => {
  const amount = Number(count) || 0;
  if (amount === 1) return "1 item fiscal atualizado.";
  return `${amount} itens fiscais atualizados.`;
};
