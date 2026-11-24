import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("a fila fiscal não registra eventos Tauri no navegador", async () => {
  const source = await readFile(
    new URL("../../src/stock/fiscal-document-queue-screen.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /const isTauriWindow = \(\) => Boolean\(window\.__TAURI_INTERNALS__\);/);
  assert.match(source, /if \(isTauriWindow\(\)\) \{/);
  assert.match(source, /registerTauriListener\("fiscal-dom-read"/);
  assert.match(source, /registerTauriListener\("fiscal-consultation-closed"/);
  assert.match(source, /renderFiscalEntryHeader\(currentEntry\.fiscalEntry\)/);
  assert.match(source, /Data da Emissão/);
  assert.match(source, /Nome Fantasia/);
  assert.match(source, /Endereço/);
  assert.match(source, /Bairro/);
  assert.match(source, /Município/);
  assert.doesNotMatch(source, /Natureza da Operação/);
  assert.doesNotMatch(source, /CPF\/CNPJ do Destinatário/);
  assert.doesNotMatch(source, /Status da Autorização/);
  assert.match(source, /fiscal-entry-title-status/);
  assert.match(source, /Entrada de NF-e \/ NFC-e/u);
  assert.match(await readFile(new URL("../../src/styles.css", import.meta.url), "utf8"), /\.fiscal-entry-title-status\s*\{[\s\S]*color: #fff;/);
  assert.match(source, /if \(!isTauriWindow\(\)\) \{\s+fiscalBrowserError = "A consulta fiscal interativa exige o aplicativo Tauri\."/s);
});

test("a tela de pré-entrada permanece separada do novo desenho de entrada", async () => {
  const source = await readFile(
    new URL("../../src/stock/fiscal-document-queue-screen.js", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(source, /data-start-entry-mode="manual"/u);
  assert.doesNotMatch(source, /Rascunho visual ainda não persistido/u);
});

test("a listagem da fila consulta documentos e fornecedores ausentes em paralelo", async () => {
  const source = await readFile(
    new URL("../../src/stock/fiscal-document-queue-screen.js", import.meta.url),
    "utf8"
  );
  const serverSource = await readFile(
    new URL("../../src/server/server.js", import.meta.url),
    "utf8"
  );
  assert.match(serverSource, /const \[\[fiscalEntries\], \[missingSupplierRows\]\] = await Promise\.all\(\[/);
  assert.match(source, /apiFetch\([\s\S]*\/api\/stock\/fiscal-entries\?includeCompleted=1/u);
  assert.match(serverSource, /includeCompletedEntries/u);
  assert.match(serverSource, /const nextStatus = readyForConfirmation \? "open" : "draft";/u);
  assert.match(serverSource, /conversionFactor,\s+0,\s+documentItem\.descriptionFiscalDocumentItem/u);
});

test("a exclusão da fila limpa o feedback após a confirmação", async () => {
  const source = await readFile(
    new URL("../../src/stock/fiscal-document-queue-screen.js", import.meta.url),
    "utf8"
  );
  const removalStart = source.indexOf("const removeEntry = async");
  const removalEnd = source.indexOf("\n  render();", removalStart);
  const removalBlock = removalStart >= 0 && removalEnd >= 0
    ? source.slice(removalStart, removalEnd)
    : "";

  assert.ok(removalBlock, "o fluxo de exclusão deve existir");
  assert.match(removalBlock, /scheduleMessageClear\(/u);
  assert.match(removalBlock, /message = ""/u);
});

test("o salvamento da pré-entrada agenda a limpeza do feedback", async () => {
  const source = await readFile(
    new URL("../../src/stock/fiscal-document-queue-screen.js", import.meta.url),
    "utf8"
  );
  const saveStart = source.indexOf("const saveEntry = async");
  const saveEnd = source.indexOf("\n  const removeEntry", saveStart);
  const saveBlock = saveStart >= 0 && saveEnd >= 0
    ? source.slice(saveStart, saveEnd)
    : "";

  assert.ok(saveBlock, "o fluxo de salvamento deve existir");
  assert.match(saveBlock, /scheduleMessageClear\(/u);
  assert.match(saveBlock, /message = ""/u);
});

test("o cadastro de fornecedor agenda a limpeza do feedback", async () => {
  const source = await readFile(
    new URL("../../src/stock/fiscal-document-queue-screen.js", import.meta.url),
    "utf8"
  );
  const supplierStart = source.indexOf("const submitMissingSupplier = async");
  const supplierEnd = source.indexOf("\n  const bind", supplierStart);
  const supplierBlock = supplierStart >= 0 && supplierEnd >= 0
    ? source.slice(supplierStart, supplierEnd)
    : "";

  assert.ok(supplierBlock, "o fluxo de cadastro de fornecedor deve existir");
  assert.match(supplierBlock, /scheduleMessageClear\(/u);
  assert.match(supplierBlock, /message = ""/u);
});

test("a confirmação fiscal define o feedback depois de recarregar os dados", async () => {
  const source = await readFile(
    new URL("../../src/stock/fiscal-document-queue-screen.js", import.meta.url),
    "utf8"
  );
  const confirmationStart = source.indexOf("const confirmEntry = async");
  const confirmationEnd = source.indexOf("\n  const removeEntry", confirmationStart);
  const confirmationBlock = source.slice(confirmationStart, confirmationEnd);

  assert.ok(confirmationBlock, "o fluxo de confirmação fiscal deve existir");
  assert.ok(
    confirmationBlock.indexOf("await loadFiscalEntries();") <
      confirmationBlock.indexOf("message = result.updatedRecipeCount"),
    "o sucesso deve ser definido após as novas leituras"
  );
  assert.match(confirmationBlock, /Entrada \$\{entryId\} confirmada/u);
  assert.match(confirmationBlock, /scheduleMessageClear\(/u);
});

test("a soma da pré-entrada usa números no formato brasileiro na tela", async () => {
  const source = await readFile(
    new URL("../../src/stock/fiscal-document-queue-screen.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /const parseFiscalNumber = \(value\) =>/u);
  assert.match(source, /reduce\(\(total, item\) => total \+ parseFiscalNumber\(item\.totalFiscalDocumentItem\), 0\)/u);
  assert.match(source, /const formatBrazilianNumber = \(value\) =>/u);
  assert.match(source, /value="\$\{escapeHtml\(formatBrazilianNumber\(selectedEntryTotal\(\)\)\)\}"/u);
  assert.match(source, /amount: selectedEntryTotal\(\)\.toFixed\(2\)/u);
});

test("a importação inicial persiste o unitário e o total calculado pelo parser", async () => {
  const serverSource = await readFile(
    new URL("../../src/server/server.js", import.meta.url),
    "utf8"
  );
  const importStart = serverSource.indexOf(
    'request.method === "POST" && request.url === "/api/stock/fiscal-document-queue/import"'
  );
  const importEnd = serverSource.indexOf("const fiscalDocumentDeleteMatch", importStart);
  const importBlock = importStart >= 0 && importEnd >= 0
    ? serverSource.slice(importStart, importEnd)
    : "";

  assert.ok(importBlock, "a rota de importação fiscal deve existir");
  assert.match(importBlock, /parseFiscalDocumentHtml\(source, requestedAccessKey\)/u);
  assert.match(importBlock, /decimal\(item\.unitPrice, 6\)/u);
  assert.match(importBlock, /decimal\(item\.total, 2\)/u);
});

test("reabre a forma de pagamento persistida em pré-entradas em aberto", async () => {
  const source = await readFile(
    new URL("../../src/stock/fiscal-document-queue-screen.js", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /selectedPaymentMethod = entryPayments\[0\]\?\.paymentDescriptionFiscalEntryPayment \|\| ""/u
  );
  assert.doesNotMatch(
    source,
    /selectedPaymentMethod = entryPayments\[0\]\?\.description \|\| ""/u
  );
});

test("usa combobox pesquisável para o produto comercial do vínculo", async () => {
  const source = await readFile(
    new URL("../../src/stock/fiscal-document-queue-screen.js", import.meta.url),
    "utf8"
  );
  const styles = await readFile(
    new URL("../../src/styles.css", import.meta.url),
    "utf8"
  );

  assert.match(source, /installComboboxDismissal/u);
  assert.match(source, /data-product-search/u);
  assert.match(source, /formatProductOptionLabel\(product\)/u);
  assert.match(source, /product\.pdvCodeProduct \|\| ""/u);
  assert.match(source, /rerenderPreservingInputSelection\([\s\S]*data-product-search/u);
  assert.match(source, /data-product-option/u);
  assert.match(source, /editingItem\.idProduct = Number\(button\.dataset\.productOption\)/u);
  assert.match(styles, /\.fiscal-product-options\s*\{/u);
  assert.match(styles, /\.fiscal-product-option\.is-selected/u);
});

test("marca como selecionadas as linhas que recebem vínculo reutilizado", async () => {
  const source = await readFile(
    new URL("../../src/stock/fiscal-document-queue-screen.js", import.meta.url),
    "utf8"
  );
  const linkStart = source.indexOf("const applyLinkToMatchingItems");
  const linkEnd = source.indexOf("\n  const applyStoredFiscalReferences", linkStart);
  const linkBlock = source.slice(linkStart, linkEnd);

  assert.ok(linkBlock, "a reutilização de vínculo deve existir");
  assert.match(linkBlock, /item\.idProduct = Number\(product\.idProduct\)/u);
  assert.match(linkBlock, /item\.idStockUnit = product\.idUnitProduct \|\| null/u);
  assert.match(linkBlock, /item\.selected = 1/u);
});

test("reconsulta valores sem substituir vínculos da pré-entrada", async () => {
  const source = await readFile(
    new URL("../../src/stock/fiscal-document-queue-screen.js", import.meta.url),
    "utf8"
  );
  const serverSource = await readFile(
    new URL("../../src/server/server.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /data-reconcile-entry/u);
  assert.match(source, /\/reconcile-values/u);
  assert.match(source, /preserva os vínculos já criados/u);
  const reconcileStart = serverSource.indexOf("const fiscalEntryReconcileMatch");
  const reconcileEnd = serverSource.indexOf("const fiscalEntryUpdateMatch", reconcileStart);
  const reconcileBlock = serverSource.slice(reconcileStart, reconcileEnd);
  assert.match(reconcileBlock, /reconcile-values/u);
  assert.match(reconcileBlock, /originalXmlFiscalDocument/u);
  assert.match(reconcileBlock, /parseFiscalDocumentHtml\(source/u);
  assert.match(reconcileBlock, /parseFiscalDocumentXml\(source/u);
  assert.match(reconcileBlock, /UPDATE fiscal_document_items[\s\S]*unitPriceFiscalDocumentItem[\s\S]*totalFiscalDocumentItem/u);
  assert.match(reconcileBlock, /UPDATE fiscal_documents[\s\S]*issuerAddressFiscalDocument[\s\S]*issuerZipCodeFiscalDocument/u);
  assert.match(reconcileBlock, /existingUnitPrice > 0 && unitPrice <= 0/u);
  assert.match(reconcileBlock, /existingTotal > 0 && total <= 0/u);
  assert.doesNotMatch(reconcileBlock, /UPDATE fiscal_entry_items/u);
  assert.match(source, /await loadFiscalEntries\(\);\s+message = formatUpdatedFiscalItems\(result\.updatedItemCount\)/u);
  assert.doesNotMatch(source, /const saved = await saveEntry\(/u);
});

test("copia a chave sem exibi-la na coluna Documento", async () => {
  const source = await readFile(
    new URL("../../src/stock/fiscal-document-queue-screen.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /data-copy-access-key="\$\{escapeHtml\(entry\.accessKeyFiscalDocument\)\}"/u);
  assert.match(source, /data-lucide="notebook-tabs"/u);
  assert.match(source, /"Documento fiscal"/u);
  assert.match(source, /fiscal-access-key-button/u);
  assert.match(source, /Chave de acesso copiada para a área de transferência/u);
});

test("destaca a pré-entrada atualmente editada sem alterar a ordenação", async () => {
  const source = await readFile(
    new URL("../../src/stock/fiscal-document-queue-screen.js", import.meta.url),
    "utf8"
  );
  const styles = await readFile(
    new URL("../../src/styles.css", import.meta.url),
    "utf8"
  );

  assert.match(source, /const isCurrentFiscalEntry = \(entry\)/u);
  assert.match(source, /let activeEntryId = initialEntryId \? Number\(initialEntryId\) : null;/u);
  assert.match(source, /activeEntryId = Number\(idFiscalEntry\);/u);
  assert.match(source, /currentEntry = await loadEntry\(idFiscalEntry\);[\s\S]*?fiscalEntryStatusFilter = currentEntry\.fiscalEntry\.statusFiscalEntry;/u);
  const sortStart = source.indexOf("const sortedFiscalEntries = () =>");
  const sortEnd = source.indexOf("const visibleFiscalEntries", sortStart);
  const sortBlock = source.slice(sortStart, sortEnd);
  assert.doesNotMatch(sortBlock, /currentComparison/u);
  assert.match(source, /class="\$\{isCurrentFiscalEntry\(entry\) \? "fiscal-entry-current" : ""\}"/u);
  assert.match(styles, /\.classic-table tbody tr\.fiscal-entry-current > td[\s\S]*?background: #e3eef9 !important;/u);
});

test("exibe até 25 entradas antes de iniciar a paginação", async () => {
  const source = await readFile(
    new URL("../../src/stock/fiscal-document-queue-screen.js", import.meta.url),
    "utf8"
  );
  const paginationSource = await readFile(
    new URL("../../src/ui/table-pagination.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /classic-grid-wrapper" data-default-page-size="25"/u);
  assert.match(paginationSource, /Number\(wrapper\.dataset\.defaultPageSize\) \|\| DEFAULT_PAGE_SIZE/u);
});

test("usa exclusão com estorno para entradas confirmadas", async () => {
  const source = await readFile(
    new URL("../../src/stock/fiscal-document-queue-screen.js", import.meta.url),
    "utf8"
  );
  const removeStart = source.indexOf("const removeEntry = async");
  const removeEnd = source.indexOf("\n  render();", removeStart);
  const removeBlock = source.slice(removeStart, removeEnd);

  assert.match(removeBlock, /statusFiscalEntry === "confirmed"/u);
  assert.match(removeBlock, /confirmAction\(/u);
  assert.match(removeBlock, /\/reverse/u);
  assert.match(removeBlock, /method: isConfirmed \? "POST" : "DELETE"/u);
  assert.match(source, /data-delete-current-entry/u);
  assert.match(source, /currentEntry\.fiscalEntry\.statusFiscalEntry === "confirmed"/u);
});

test("mostra feedback ao salvar o vínculo de um item da entrada fiscal", async () => {
  const source = await readFile(
    new URL("../../src/stock/fiscal-document-queue-screen.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /message = "Vínculo do item salvo\."/u);
  assert.match(source, /scheduleMessageClear\(/u);
  assert.doesNotMatch(source, /unidade\(s\) de estoque/u);
});

test("adapta o texto e a listagem de produtos ao estado da entrada", async () => {
  const source = await readFile(
    new URL("../../src/stock/fiscal-document-queue-screen.js", import.meta.url),
    "utf8"
  );
  const styles = await readFile(
    new URL("../../src/styles.css", import.meta.url),
    "utf8"
  );

  assert.match(source, /statusFiscalEntry === "confirmed"[\s\S]*?Esta entrada está confirmada/u);
  assert.match(source, /fiscal-entry-items-table/u);
  assert.match(source, /toLocaleUpperCase\("pt-BR"\)/u);
  assert.match(styles, /\.fiscal-entry-items-table th[\s\S]*?text-align: center/u);
  assert.match(styles, /\.fiscal-entry-items-table td:nth-child\(1\)[\s\S]*?text-align: center/u);
  assert.match(styles, /\.fiscal-entry-items-table td:nth-child\(4\)[\s\S]*?text-align: right/u);
  assert.match(styles, /\.fiscal-entry-items-table td:nth-child\(6\)[\s\S]*?text-align: right/u);
  assert.match(styles, /\.fiscal-entry-items-table td:nth-child\(7\)[\s\S]*?text-align: center/u);
});
