import test from "node:test";
import assert from "node:assert/strict";
import {
  formatSupplierDocument,
  formatSupplierTitle,
  renderSupplierFormFields
} from "../../src/catalog/supplier-form.js";
import { readFile } from "node:fs/promises";

test("formata CPF e CNPJ para o formulário de fornecedor", () => {
  assert.equal(formatSupplierDocument("08171630000130", "juridica"), "08.171.630/0001-30");
  assert.equal(formatSupplierDocument("12345678901", "fisica"), "123.456.789-01");
});

test("normaliza textos extraídos para capitalização de títulos", () => {
  assert.equal(formatSupplierTitle("RUA MAJOR GOTE"), "Rua Major Gote");
  assert.equal(formatSupplierTitle("PATOS DE MINAS"), "Patos de Minas");
});

test("o preenchimento por CNPJ usa capitalização de títulos nos campos textuais", async () => {
  const source = await readFile(
    new URL("../../src/catalog/supplier-screen.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /formatSupplierTitle\(value\)/);
  assert.match(source, /companyNameSupplier.*tradeNameSupplier.*contactNameSupplier/s);
  assert.match(source, /setSupplierField\(form, "companyNameSupplier", company\.razao_social\)/);
  assert.match(source, /lookupCnpj\(cnpj\)/u);
  assert.match(source, /Serviço de consulta de CNPJ temporariamente indisponível\./u);
});

test("a fila normaliza falhas temporárias da consulta de CNPJ", async () => {
  const source = await readFile(
    new URL("../../src/stock/fiscal-document-queue-screen.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /lookupCnpj\(cnpj\)/u);
  assert.ok(source.includes("https://viacep.com.br/ws/${cep}/json/"));
  assert.match(source, /Serviço de consulta de CNPJ temporariamente indisponível\./u);
  assert.match(source, /formatSupplierTitle\(value\)/u);
});

test("consultas de CNPJ e CEP aplicam capitalização de títulos", async () => {
  const [supplierSource, queueSource, companySource] = await Promise.all([
    readFile(new URL("../../src/catalog/supplier-screen.js", import.meta.url), "utf8"),
    readFile(new URL("../../src/stock/fiscal-document-queue-screen.js", import.meta.url), "utf8"),
    readFile(new URL("../../src/catalog/company-screen.js", import.meta.url), "utf8")
  ]);
  assert.match(supplierSource, /normalizeSupplierText\(name, value\)/u);
  assert.match(supplierSource, /normalizeSupplierText\(name, value\)/u);
  assert.match(queueSource, /formatSupplierTitle\(value\)/u);
  assert.match(queueSource, /formatSupplierTitle\(value\)/u);
  assert.match(companySource, /formatSupplierTitle\(address\.logradouro\)/u);
});

test("renderiza os mesmos campos do modal de fornecedor para o cadastro pela fila", () => {
  const html = renderSupplierFormFields({
    typeSupplier: "juridica",
    documentSupplier: "0817163000130",
    companyNameSupplier: "Alipio Gas Ltda",
    tradeNameSupplier: "Alipio Gas"
  }, { lookupCnpj: true, lookupCep: true });
  assert.match(html, /name="documentSupplier"/);
  assert.match(html, /name="companyNameSupplier"/);
  assert.match(html, /name="tradeNameSupplier"/);
  assert.match(html, /data-lookup-cnpj/);
  assert.match(html, /data-lookup-cep/);
});

test("a fila expõe fornecedores ausentes comparados por documento e tipo", async () => {
  const source = await readFile(new URL("../../src/server/server.js", import.meta.url), "utf8");
  assert.match(source, /missingSuppliers/);
  assert.match(
    source,
    /s\.documentSupplier COLLATE utf8mb4_unicode_ci\s*=\s*d\.issuerDocumentFiscalDocument COLLATE utf8mb4_unicode_ci/
  );
  assert.match(source, /s\.typeSupplier = IF\(CHAR_LENGTH/);
  assert.match(
    source,
    /if \(String\(supplier\.originalXmlFiscalDocument \|\| ""\)\.trim\(\)\)/
  );
  assert.match(
    source,
    /parseFiscalDocumentHtml\(source\)/
  );
  assert.match(
    source,
    /parseFiscalDocumentXml\(source\)/
  );
});

test("a coluna de fornecedores ausentes prioriza a razão social", async () => {
  const source = await readFile(
    new URL("../../src/stock/fiscal-document-queue-screen.js", import.meta.url),
    "utf8"
  );
  assert.match(
    source,
    /supplier\.companyNameSupplier \|\| supplier\.tradeNameSupplier \|\| "Não informado"/
  );
});

test("o cadastro de fornecedores usa a coleção correta após editar", async () => {
  const source = await readFile(
    new URL("../../src/catalog/supplier-screen.js", import.meta.url),
    "utf8"
  );
  assert.match(
    source,
    /root\.__PDV_FORM_PREVIEW_PENDING__ = suppliers\.find\(\(supplier\) => String\(supplier\.idSupplier\) === String\(idSupplier\)\)/
  );
});
