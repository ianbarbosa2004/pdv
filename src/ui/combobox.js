export const installComboboxDismissal = (
  root,
  {
    containerSelector = ".classic-combobox",
    isOpen,
    close
  }
) => {
  const handlePointerDown = (event) => {
    if (!isOpen() || event.target?.closest(containerSelector)) return;
    close();
  };
  const handleKeyDown = (event) => {
    if (event.key !== "Escape" || !isOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };

  root.addEventListener("pointerdown", handlePointerDown);
  root.addEventListener("keydown", handleKeyDown);

  return () => {
    root.removeEventListener("pointerdown", handlePointerDown);
    root.removeEventListener("keydown", handleKeyDown);
  };
};
