import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  captureTabOrderFocus,
  navigateComboboxOptions,
  rerenderComboboxSelection,
  restoreTabOrderFocus
} from "../../src/ui/combobox.js";

test("navega options do combobox com ArrowDown, ArrowUp e Enter", () => {
  const options = [
    { active: false, classList: { add() {}, remove() {} }, setAttribute() {}, click() {} },
    { active: false, classList: { add() {}, remove() {} }, setAttribute() {}, click() {} },
    { active: false, classList: { add() {}, remove() {} }, setAttribute() {}, click() {} }
  ];
  const container = {
    querySelectorAll() {
      return options;
    },
    querySelector(selector) {
      if (selector === ".is-active") return options.find((option) => option.active);
      return null;
    }
  };

  options.forEach((option) => {
    option.classList.add = () => { option.active = true; };
    option.classList.remove = () => { option.active = false; };
  });

  assert.equal(navigateComboboxOptions(container, "ArrowDown"), options[0]);
  assert.equal(navigateComboboxOptions(container, "ArrowDown"), options[1]);
  assert.equal(navigateComboboxOptions(container, "ArrowUp"), options[0]);
  assert.equal(navigateComboboxOptions(container, "Enter"), options[0]);
});

test("restaura o foco no próximo campo após selecionar uma opção do combobox", () => {
  const nextField = {
    focused: false,
    focus() {
      this.focused = true;
    }
  };
  let rendered = false;

  rerenderComboboxSelection(
    () => { rendered = true; },
    () => nextField
  );

  assert.equal(rendered, true);
  assert.equal(nextField.focused, true);
});

test("captura combobox e restaura o foco no gatilho após recriar a tela", () => {
  const trigger = { focused: false, focus() { this.focused = true; } };
  const container = {
    querySelector(selector) {
      return selector === ".classic-select-trigger" ? trigger : null;
    }
  };
  const option = {
    closest(selector) {
      return selector === ".classic-combobox" ? container : null;
    }
  };
  const root = {
    querySelectorAll(selector) {
      return selector === ".classic-combobox" ? [container] : [];
    }
  };

  const descriptor = captureTabOrderFocus(option, root);
  assert.equal(descriptor.kind, "combobox");

  restoreTabOrderFocus(root, descriptor);
  assert.equal(trigger.focused, true);
});

test("a raiz da aplicação instala a preservação global do tab order", async () => {
  const source = await readFile(
    new URL("../../src/main.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /installTabOrderPreservation\(app\)/u);
  assert.match(source, /tabOrderPreservation\?\.reset\(\)/u);
});
