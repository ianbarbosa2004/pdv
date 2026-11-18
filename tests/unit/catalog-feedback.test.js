import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("cadastros de clientes e consumidores fazem uma única renderização final após salvar", async () => {
  const source = await readFile(
    new URL("../../src/catalog/customer-consumer-screen.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /const load = async \(\{ captureDraft = true, renderState = true \} = \{\}\)/);
  assert.match(source, /await load\(\{ captureDraft: false, renderState: false \}\)/);
  assert.match(source, /finally \{ loading = false; if \(renderState\) render\(\{ captureDraft \}\); \}/);
});

test("fornecedores fazem uma única renderização final após salvar", async () => {
  const source = await readFile(
    new URL("../../src/catalog/supplier-screen.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /const load = async \(\{ renderState = true \} = \{\}\)/);
  assert.match(source, /await load\(\{ renderState: false \}\)/);
  assert.match(source, /if \(renderState\) renderPreservingFormDraft\(root, render\)/);
});

test("modal de edição captura o formulário antes de abrir a consulta NCM", async () => {
  const source = await readFile(
    new URL("../../src/catalog/catalog-screen.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /captureEditingProductDraft/);
  assert.match(
    source,
    /if \(editingProduct\) \{[\s\S]*?captureEditingProductDraft\(new FormData\(editForm\)\)/
  );
});

test("modal de edição não permite overflow horizontal", async () => {
  const source = await readFile(
    new URL("../../src/styles.css", import.meta.url),
    "utf8"
  );
  assert.match(
    source,
    /\.classic-modal\.product-edit-modal \{[\s\S]*?overflow-x: hidden;/
  );
});

test("salvamento de produto recarrega dados sem renderização intermediária", async () => {
  const source = await readFile(
    new URL("../../src/catalog/catalog-screen.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /const load = async \(\{ renderState = true \} = \{\}\)/);
  assert.match(source, /await load\(\{ renderState: false \}\)/);
});

test("exclusão de ficha agenda a limpeza do feedback", async () => {
  const source = await readFile(
    new URL("../../src/catalog/product-formation-screen.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /message = "Ficha Técnica excluída com sucesso\."[\s\S]*?scheduleMessageClear/);
  assert.match(source, /searchTerm = ""[\s\S]*?form\.readOnly = true/);
  assert.match(source, /await load\(\{ renderState: false \}\)/);
});

test("receitas e fichas técnicas expõem ações de duplicação", async () => {
  const [recipeSource, formationSource] = await Promise.all([
    readFile(new URL("../../src/catalog/recipe-screen.js", import.meta.url), "utf8"),
    readFile(new URL("../../src/catalog/product-formation-screen.js", import.meta.url), "utf8")
  ]);
  assert.match(recipeSource, /data-duplicate-recipe/);
  assert.match(recipeSource, /form\.statusRecipe = "draft"/);
  assert.match(recipeSource, /duplicatedRecipeName/);
  assert.match(formationSource, /data-duplicate-formation/);
  assert.match(formationSource, /\/api\/product-formations\/\$\{target\.idProduct\}/);
  assert.match(formationSource, /data-duplicate-target-search/);
  assert.match(formationSource, /data-duplicate-target-option/);
  assert.match(formationSource, /classic-modal-backdrop formation-duplicate-backdrop/);
  assert.doesNotMatch(formationSource, /page-feedback formation-duplicate-modal/);
  assert.match(formationSource, /componentDraft\.open && !Number\.isInteger\(componentDraft\.editingIndex\)/);
  assert.match(formationSource, /data-duplicate-target-search/);
  assert.match(formationSource, /formation-component-option-list/);
  assert.match(recipeSource, /data-lucide="copy"/);
  assert.match(formationSource, /data-lucide="copy"/);
  assert.doesNotMatch(recipeSource, /data-lucide="copy-plus"/);
  assert.doesNotMatch(formationSource, /data-lucide="copy-plus"/);
});

test("pesquisa dos comboboxes permanece acima da lista de opções", async () => {
  const [styles, recipeSource, fiscalEntrySource, fiscalQueueSource] = await Promise.all([
    readFile(new URL("../../src/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../../src/catalog/recipe-screen.js", import.meta.url), "utf8"),
    readFile(new URL("../../src/stock/fiscal-entry-design-screen.js", import.meta.url), "utf8"),
    readFile(new URL("../../src/stock/fiscal-document-queue-screen.js", import.meta.url), "utf8")
  ]);
  assert.match(styles, /\.combobox-options-fixed-search \.combobox-option-list[\s\S]*overflow-y: auto;/);
  assert.match(recipeSource, /combobox-options-fixed-search[\s\S]*combobox-option-list/);
  assert.match(fiscalEntrySource, /combobox-options-fixed-search[\s\S]*combobox-option-list/);
  assert.match(fiscalQueueSource, /combobox-options-fixed-search[\s\S]*combobox-option-list/);
});
