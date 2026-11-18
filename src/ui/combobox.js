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
  const removeKeyboardNavigation = installComboboxKeyboardNavigation(root, {
    containerSelector,
    isOpen
  });

  return () => {
    root.removeEventListener("pointerdown", handlePointerDown);
    root.removeEventListener("keydown", handleKeyDown);
    removeKeyboardNavigation();
  };
};

export const navigateComboboxOptions = (container, key) => {
  if (!container) return null;
  const options = [...container.querySelectorAll(
    ".recipe-component-option, .fiscal-product-option, [role='option']"
  )];
  if (!options.length) return null;

  const activeIndex = options.findIndex((option) =>
    (typeof option.classList?.contains === "function"
      && option.classList.contains("is-active"))
    || option.active
  );

  if (key === "Enter") {
    const activeOption = activeIndex >= 0 ? options[activeIndex] : null;
    activeOption?.click?.();
    return activeOption;
  }

  if (key !== "ArrowDown" && key !== "ArrowUp") return null;

  const nextIndex = key === "ArrowDown"
    ? (activeIndex + 1 + options.length) % options.length
    : (activeIndex >= 0 ? activeIndex - 1 : options.length - 1);

  options.forEach((option, index) => {
    option.classList?.remove("is-active");
    option.active = false;
    option.setAttribute?.("aria-selected", index === nextIndex ? "true" : "false");
  });
  options[nextIndex].classList?.add("is-active");
  options[nextIndex].active = true;
  options[nextIndex].setAttribute?.("role", "option");
  options[nextIndex].scrollIntoView?.({ block: "nearest" });
  return options[nextIndex];
};

export const installComboboxKeyboardNavigation = (
  root,
  {
    containerSelector = ".classic-combobox",
    isOpen = () => true
  } = {}
) => {
  const handleKeyDown = (event) => {
    if (!["ArrowDown", "ArrowUp", "Enter"].includes(event.key) || !isOpen()) return;
    const container = event.target?.closest?.(containerSelector);
    if (!container) return;

    const activeOption = navigateComboboxOptions(container, event.key);
    if (event.key === "Enter" && !activeOption) return;
    if (event.key !== "Enter" && !activeOption) return;

    event.preventDefault();
    event.stopPropagation();
  };

  root.addEventListener("keydown", handleKeyDown);
  return () => root.removeEventListener("keydown", handleKeyDown);
};

export const rerenderComboboxSelection = (render, getNextInput) => {
  render();
  getNextInput()?.focus();
};

const tabbableSelector = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "summary"
].join(",");

export const captureTabOrderFocus = (element, root) => {
  if (!element) return null;
  const combobox = element.closest?.(".classic-combobox");
  if (combobox) {
    const comboboxes = [...(root?.querySelectorAll(".classic-combobox") || [])];
    return {
      kind: "combobox",
      comboboxIndex: comboboxes.indexOf(combobox)
    };
  }

  const dataAttributes = {};
  for (const attribute of element.attributes?.length ? [...element.attributes] : []) {
    if (attribute.name.startsWith("data-")) dataAttributes[attribute.name] = attribute.value;
  }
  const tabbables = [...(root?.querySelectorAll(tabbableSelector) || [])];
  return {
    kind: "element",
    name: element.name || "",
    id: element.id || "",
    tagName: element.tagName || "",
    dataAttributes,
    tabbableIndex: tabbables.indexOf(element),
    selectionStart: element.selectionStart,
    selectionEnd: element.selectionEnd,
    selectionDirection: element.selectionDirection
  };
};

export const restoreTabOrderFocus = (root, descriptor) => {
  if (!descriptor) return false;
  let replacement = null;

  if (descriptor.kind === "combobox") {
    const combobox = [...root.querySelectorAll(".classic-combobox")][descriptor.comboboxIndex];
    replacement = combobox?.querySelector(".classic-select-trigger");
  } else {
    if (descriptor.id) {
      replacement = [...root.querySelectorAll("[id]")].find(
        (element) => element.id === descriptor.id
      );
    }
    if (!replacement && descriptor.name) {
      replacement = [...root.querySelectorAll(tabbableSelector)].find(
        (element) => element.name === descriptor.name
      );
    }
    if (!replacement) {
      for (const [attribute, value] of Object.entries(descriptor.dataAttributes || {})) {
        replacement = [...root.querySelectorAll(`[${attribute}]`)].find(
          (element) => element.getAttribute(attribute) === value
        );
        if (replacement) break;
      }
    }
    if (!replacement && descriptor.tabbableIndex >= 0) {
      replacement = [...root.querySelectorAll(tabbableSelector)][descriptor.tabbableIndex];
    }
  }

  if (!replacement || typeof replacement.focus !== "function") return false;
  replacement.focus();
  if (typeof replacement.setSelectionRange === "function"
    && Number.isInteger(descriptor.selectionStart)
    && Number.isInteger(descriptor.selectionEnd)) {
    replacement.setSelectionRange(
      descriptor.selectionStart,
      descriptor.selectionEnd,
      descriptor.selectionDirection || "none"
    );
  }
  return true;
};

export const resetTabOrderFocus = (state) => {
  state.lastFocused = null;
};

export const installTabOrderPreservation = (root) => {
  if (typeof MutationObserver === "undefined") return null;
  const state = { lastFocused: null };

  root.addEventListener("focusin", (event) => {
    state.lastFocused = event.target;
  });

  const observer = new MutationObserver(() => {
    const activeElement = document.activeElement;
    if (activeElement && activeElement !== document.body && root.contains(activeElement)) return;
    if (!state.lastFocused) return;
    const descriptor = captureTabOrderFocus(state.lastFocused, root);
    queueMicrotask(() => restoreTabOrderFocus(root, descriptor));
  });
  observer.observe(root, { childList: true, subtree: true });

  return {
    state,
    reset: () => resetTabOrderFocus(state),
    disconnect: () => observer.disconnect()
  };
};
