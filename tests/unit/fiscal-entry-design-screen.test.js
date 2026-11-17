import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("a tela de entrada manual oferece origem, fornecedor, itens e pagamentos", async () => {
  const source = await readFile(
    new URL("../../src/stock/fiscal-entry-design-screen.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /Entrada Manual/u);
  assert.match(source, /fiscal-entry-test-layout/u);
  assert.match(source, /Nota fiscal/u);
  assert.match(source, /Pedido/u);
  assert.match(source, /name="entryDate"/u);
  assert.match(source, /name="idSupplier"/u);
  assert.match(source, /data-new-entry/u);
  assert.match(source, /data-supplier-toggle/u);
  assert.match(source, /data-product-toggle/u);
  assert.match(source, /data-supplier-search/u);
  assert.match(source, /data-product-search/u);
  assert.match(source, /# \$\{product\.pdvCodeProduct \|\| product\.idProduct\}/u);
  assert.match(source, /toLocaleLowerCase\("pt-BR"\)/u);
  assert.match(source, /api\/product-formations/u);
  assert.match(source, /produto acabado/u);
  assert.match(source, /data-number-mask="fractional-3"/u);
  assert.match(source, /value="\$\{escapeHtml\(itemDraft.quantity \|\| "0,000"\)\}"/u);
  assert.match(source, /name="paymentAmount" data-number-mask inputmode="decimal" value="0,00"/u);
  assert.match(source, /name="paymentDescription"/u);
  assert.match(source, /api\/payment-methods/u);
  assert.match(source, /data-add-item/u);
  assert.match(source, /data-add-payment/u);
  assert.match(source, /manual-entry-remove-payment/u);
  assert.match(source, /R\$ \$\{money\(payment.amount\)\}/u);
  assert.match(source, /renderSuccessFeedback/u);
  assert.match(source, /data-lucide="trash-2"/u);
  assert.doesNotMatch(source, /sortableHeader\("modelFiscalDocument", "Tipo"/u);
  assert.doesNotMatch(source, /data-copy-access-key="\$\{escapeHtml\(entry\.accessKeyFiscalDocument\)\}"/u);
  assert.match(source, /totalPaymentsFiscalEntry/u);
  assert.match(source, /dateInputValue/u);
  assert.match(source, /Entradas iniciadas/u);
  assert.match(source, /data-manual-entry-search/u);
  assert.match(source, /data-manual-entry-status-filter/u);
  assert.match(source, /data-manual-entry-sort/u);
  assert.match(source, /table-sort-button/u);
  assert.match(source, /fiscal-entry-status-/u);
  assert.match(source, /data-save-draft/u);
  assert.match(source, /Salvar rascunho/u);
  assert.match(source, /data-open-entry/u);
  assert.match(source, /Gravar entrada/u);
  assert.match(source, /manualEntryDateFiscalDocument \|\| entry\.entryDateFiscalDocument/u);
  assert.match(source, /data-review-impact/u);
  assert.match(source, /data-reopen/u);
  assert.match(source, /min="0\.01"/u);
  assert.match(source, /\/api\/stock\/manual-entries/u);
});
