import test from "node:test";
import assert from "node:assert/strict";
import { renderPreservingFormDraft } from "../../src/ui/form-draft.js";
import { clearRenderedFeedback, renderSuccessFeedback } from "../../src/ui/feedback.js";

const field = (name, type, value, checked = false, options = {}) => ({
  name,
  type,
  value,
  checked,
  ...options
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

test("does not restore disabled or read-only fields over loaded values", () => {
  const currentForm = form(
    field("certificateExpires", "date", "", false, { disabled: true }),
    field("certificateSerial", "text", "", false, { readOnly: true })
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
      field("certificateExpires", "date", "2027-01-31", false, { disabled: true }),
      field("certificateSerial", "text", "ABC123", false, { readOnly: true })
    )];
  });

  assert.equal(root.forms[0].elements[0].value, "2027-01-31");
  assert.equal(root.forms[0].elements[1].value, "ABC123");
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

test("renders success feedback as a fixed modal without changing page layout", () => {
  const feedback = renderSuccessFeedback("Produto salvo.", (value) => value);

  assert.match(feedback, /data-success-feedback/);
  assert.match(feedback, /class="feedback-modal-panel"/);
  assert.match(feedback, /Concluído/);
  assert.match(feedback, /Produto salvo\./);
  assert.doesNotMatch(feedback, /success-message page-feedback/);
});
