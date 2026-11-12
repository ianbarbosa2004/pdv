import assert from "node:assert/strict";
import test from "node:test";

const createMockRoot = () => ({
  className: "",
  innerHTML: "",
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {}
});

test("carrega as listas auxiliares do preenchimento do CSV", async () => {
  globalThis.window = {
    __PDV_API_URL__: "http://127.0.0.1:3000",
    __PDV_NAVIGATION__: { menus: [], items: [] },
    setTimeout,
    clearTimeout,
    location: { hostname: "127.0.0.1", protocol: "http:" }
  };
  globalThis.Node = class {};
  globalThis.document = {
    createElement: createMockRoot,
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  globalThis.fetch = async (url) => {
    const payload = url.endsWith("/groups")
      ? { groups: [{ descriptionGroup: "MERCEARIA", descriptionClass: "ALIMENTOS" }] }
      : url.endsWith("/fiscal-operations")
        ? { fiscalOperations: [{ descriptionFiscalOperation: "VENDA", cfopFiscalOperation: "5102", typeFiscalOperation: "SAÍDA" }] }
        : url.endsWith("/product-types")
          ? { productTypes: [{ descriptionProductType: "MERCADORIA", codeSpedProductType: "00" }] }
          : url.endsWith("/physical-states")
            ? { physicalStates: [{ idPhysicalState: 7, namePhysicalState: "Sólido Inteiro / Peça", codePhysicalState: "solid_whole", descriptionPhysicalState: "Ovos e frutas inteiras" }] }
          : { units: [{ codeUnit: "UN", descriptionUnit: "UNIDADE" }] };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  const { createCatalogImportScreen } = await import("../../src/tools/catalog-import-screen.js");
  const root = createCatalogImportScreen({
    onBack() {},
    onTools() {},
    onProducts() {},
    onThermalPrint() {},
    onSettings() {},
    onCompany() {},
    onNfce() {},
    onFinancial() {},
    onPaymentMethods() {}
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.doesNotMatch(root.innerHTML, /apiFetch is not defined/);
  assert.match(root.innerHTML, /Grupos \(\.md\)/);
  assert.match(root.innerHTML, /Estados Físicos \(\.md\)/);
  assert.match(root.innerHTML, /Estado Físico/);
  assert.match(root.innerHTML, /ID, nome, código ou descrição/);
  assert.match(root.innerHTML, /data-select-file/);
  assert.match(root.innerHTML, />Selecionar arquivo</);
});

test("mantém o exemplo CSV alinhado ao cabeçalho com 19 colunas", async () => {
  const { csvExample, canImportCatalogRows } = await import("../../src/tools/catalog-import-screen.js");
  const [, exampleRow] = csvExample.split(/\r?\n/);
  const values = exampleRow.split(";");

  assert.equal(values.length, 19);
  assert.equal(values[8], "0201.30.00");
  assert.equal(values[9], "0603.10.00");
  assert.equal(values[17], "sim");
  assert.equal(values[18], "ATIVO");
  assert.equal(canImportCatalogRows({ rows: values, validationPassed: false, loading: false }), false);
  assert.equal(canImportCatalogRows({ rows: values, validationPassed: true, loading: false }), true);
  assert.equal(canImportCatalogRows({ rows: values, validationPassed: true, loading: true }), false);
});

test("normaliza o local de impressão sem acento para o valor oficial", async () => {
  const { normalizePrintPlace } = await import("../../src/shared/print-place.js");

  assert.equal(normalizePrintPlace("nao imprimir"), "Não Imprimir");
  assert.equal(normalizePrintPlace(" cozinha "), "Cozinha");
  assert.equal(normalizePrintPlace("impressora"), null);
});
