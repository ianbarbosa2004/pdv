const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

export const confirmAction = ({
  title = "Confirmar ação",
  message,
  detail = "",
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar"
}) => new Promise((resolve) => {
  const backdrop = document.createElement("div");
  backdrop.className = "classic-modal-backdrop confirmation-modal-backdrop";
  backdrop.innerHTML = `
    <section class="classic-modal confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="confirmation-modal-title" aria-describedby="confirmation-modal-message">
      <div class="classic-panel-header modal-panel-header">
        <span id="confirmation-modal-title">${escapeHtml(title)}</span>
        <button class="modal-close-button" data-confirmation-cancel type="button" aria-label="${escapeHtml(cancelLabel)}" title="${escapeHtml(cancelLabel)}">×</button>
      </div>
      <div class="confirmation-modal-body">
        <div class="confirmation-modal-icon" aria-hidden="true">!</div>
        <p id="confirmation-modal-message" class="modal-help-text">${escapeHtml(message)}</p>
        ${detail ? `<p class="confirmation-modal-detail">${escapeHtml(detail)}</p>` : ""}
      </div>
      <div class="classic-form-actions confirmation-modal-actions">
        <button class="classic-button primary danger" data-confirmation-confirm type="button">${escapeHtml(confirmLabel)}</button>
        <button class="classic-button" data-confirmation-cancel type="button">${escapeHtml(cancelLabel)}</button>
      </div>
    </section>
  `;
  document.body.append(backdrop);

  const finish = (confirmed) => {
    backdrop.remove();
    resolve(confirmed);
  };

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop
      || event.target.closest("[data-confirmation-cancel]")) {
      finish(false);
    } else if (event.target.closest("[data-confirmation-confirm]")) {
      finish(true);
    }
  });
  backdrop.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
  });
  backdrop.querySelector("[data-confirmation-confirm]")?.focus();
});
