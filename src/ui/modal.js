const getOpenModal = () => {
  const modals = [
    ...document.querySelectorAll(".classic-modal-backdrop:not([hidden])"),
    ...document.querySelectorAll(".sale-modal-backdrop:not([hidden])"),
    ...document.querySelectorAll(".modal-backdrop:not([hidden])"),
    ...document.querySelectorAll(".page-feedback[role='dialog']")
  ];
  return modals.at(-1) || null;
};

export const installGlobalModalEscape = () => {
  if (document.body.dataset.modalEscapeInstalled === "true") return;
  document.body.dataset.modalEscapeInstalled = "true";
  let pointerStartedOnBackdrop = false;

  document.addEventListener("pointerdown", (event) => {
    const modal = getOpenModal();
    pointerStartedOnBackdrop = Boolean(modal && event.target === modal);
  }, true);

  document.addEventListener("click", (event) => {
    const modal = getOpenModal();
    if (modal && event.target === modal && !pointerStartedOnBackdrop) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    pointerStartedOnBackdrop = false;
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const modal = getOpenModal();
    if (!modal) return;

    const closeButton = modal.querySelector(
      ".modal-close-button, .sale-modal-close, [data-confirmation-cancel], [data-cancel], [data-cancel-edit], [data-cancel-component-edit], [data-close-backup-cancel], [data-close-payment], [data-close-dining-table], [data-close-recent-sales], [data-close-api-config], [data-cancel-reason]"
    );
    if (!closeButton || closeButton.disabled) return;

    event.preventDefault();
    closeButton.click();
  });
};
