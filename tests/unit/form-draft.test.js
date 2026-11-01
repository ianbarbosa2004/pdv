import test from "node:test";
import assert from "node:assert/strict";
import { renderPreservingFormDraft } from "../../src/ui/form-draft.js";
import { clearRenderedFeedback } from "../../src/ui/feedback.js";

const field = (name, type, value, checked = false) => ({
  name,
  type,
  value,
  checked
});

const form = (...fields) => ({
  elements: fields
});

test("preserves text, select and checkbox values across a render", () => {
  const currentForm = form(
    field("name", "text", "CONSUMIDOR"),
    field("group", "select-one", "VIP"),
    field("visible", "checkbox", "", true)
  );
  const root = {
    forms: [currentForm],
    querySelectorAll(selector) {
      assert.equal(selector, "form");
      return this.forms;
    }
  };

  renderPreservingFormDraft(root, () => {
    root.forms = [form(
      field("name", "text", ""),
      field("group", "select-one", ""),
      field("visible", "checkbox", "", false)
    )];
  });

  assert.equal(root.forms[0].elements[0].value, "CONSUMIDOR");
  assert.equal(root.forms[0].elements[1].value, "VIP");
  assert.equal(root.forms[0].elements[2].checked, true);
});

test("clears feedback without rebuilding the form", () => {
  let removed = false;
  const root = {
    querySelector(selector) {
      assert.equal(selector, "[data-success-feedback]");
      return { remove: () => { removed = true; } };
    }
  };

  clearRenderedFeedback(root);

  assert.equal(removed, true);
});
