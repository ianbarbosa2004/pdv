const getOpenModal = () => {
  const modals = [
    ...document.querySelectorAll(".classic-modal-backdrop:not([hidden])"),
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
      ".modal-close-button, [data-confirmation-cancel], [data-cancel], [data-cancel-edit], [data-cancel-component-edit], [data-close-backup-cancel]"
    );
    if (!closeButton || closeButton.disabled) return;

    event.preventDefault();
    closeButton.click();
  });
};
