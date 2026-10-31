const setFieldValue = (field, value) => {
  if (field.type === "checkbox") {
    field.checked = Boolean(Number(value) || value === true);
    return;
  }
  if (field.type === "radio") {
    field.checked = String(field.value) === String(value);
    return;
  }
  field.value = value == null ? "" : String(value);
  field.dispatchEvent(new Event("change", { bubbles: true }));
};

export const bindFormRowPreview = (root, {
  rowSelector = "[data-view-record]",
  formSelector = "form",
  titleSelector = ".classic-panel-header",
  formatValue = (value) => value
} = {}) => {
  const form = root.querySelector(formSelector);
  if (!form) return;
  const title = form.querySelector(titleSelector);
  let previewing = false;
  const hasOpenModal = () => Boolean(root.querySelector("[data-modal-backdrop]"));

  const clearPreview = () => {
    previewing = false;
    form.classList.remove("form-preview-mode");
    form.querySelectorAll("input, select, textarea, button").forEach((field) => {
      field.disabled = false;
    });
    form.reset();
    form.querySelector("[data-preview-exit]")?.remove();
    if (title?.dataset.previewTitle) {
      title.textContent = title.dataset.previewTitle;
      delete title.dataset.previewTitle;
    }
    root.querySelectorAll(".is-previewing").forEach((item) => item.classList.remove("is-previewing"));
  };

  const showPreview = (row) => {
    if (hasOpenModal()) return;
    let record;
    try {
      record = JSON.parse(row.dataset.viewRecord || "{}");
    } catch {
      return;
    }
    previewing = true;
    form.classList.add("form-preview-mode");
    form.querySelectorAll("[name]").forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(record, field.name)) {
        setFieldValue(field, formatValue(record[field.name], field.name, record));
      }
      if (field.type !== "hidden") field.disabled = true;
    });
    form.querySelectorAll("button:not([data-preview-exit])").forEach((button) => {
      button.disabled = true;
    });
    if (title) {
      title.dataset.previewTitle ||= title.textContent;
      title.textContent = "";
      const label = document.createElement("span");
      label.textContent = "Visualização";
      title.append(label);
      const exit = document.createElement("button");
      exit.type = "button";
      exit.className = "classic-button";
      exit.dataset.previewExit = "true";
      exit.textContent = "Novo cadastro";
      exit.addEventListener("click", clearPreview);
      title.append(exit);
    }
  };

  root.querySelectorAll(rowSelector).forEach((row) => {
    row.addEventListener("click", (event) => {
      if (hasOpenModal()) return;
      if (event.target.closest("button, a, input, select, textarea")) return;
      if (previewing && row.classList.contains("is-previewing")) {
        clearPreview();
        return;
      }
      root.querySelectorAll(".is-previewing").forEach((item) => item.classList.remove("is-previewing"));
      showPreview(row);
      row.classList.add("is-previewing");
    });
  });
};
