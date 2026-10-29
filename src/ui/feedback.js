export const createFeedbackTimer = () => {
  let token = 0;
  let timer = null;

  return (callback, delay = 4000) => {
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
    ? `<div class="success-message page-feedback" role="status" aria-live="polite">${escapeHtml(message)}</div>`
    : "";
