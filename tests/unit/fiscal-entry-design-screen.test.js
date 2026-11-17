import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("a tela de teste consulta a fila e abre a pré-entrada no formulário", async () => {
  const source = await readFile(
    new URL("../../src/stock/fiscal-entry-design-screen.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /PDV - Entrada de NF-e \/ NFC-e \(Teste\)/u);
  assert.match(source, /Documentos na Fila/u);
  assert.match(source, /data-test-search/u);
  assert.match(source, /Pesquisar documentos na fila/u);
  assert.match(source, /Nova Receita ou Composição/u);
  assert.match(source, /recipe-editor-panel/u);
  assert.match(source, /recipe-components-table/u);
  assert.match(source, /Produtos/u);
  assert.match(source, /Unidade Fiscal/u);
  assert.match(source, /Preço Unitário/u);
  assert.match(source, /Preço Total/u);
  assert.match(source, /renderFiscalEntryHeader/u);
  assert.match(source, /Chave de Acesso/u);
  assert.match(source, /data-test-save/u);
  assert.match(source, /\/api\/stock\/fiscal-entries\/\$\{idFiscalEntry\}/u);
  assert.match(source, /data-test-open-entry/u);
});
