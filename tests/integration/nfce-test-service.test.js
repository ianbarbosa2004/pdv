import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSaleNfeXml,
  fiscalPaymentTypeCode,
  formatNfeDateTime
} from "../../src/server/nfce-test-service.js";

test("formata dhEmi com horário local de Minas Gerais e deslocamento explícito", () => {
  const result = formatNfeDateTime(new Date("2026-10-27T05:11:41.000Z"));
  assert.equal(result, "2026-10-27T02:11:41-03:00");
});

test("gera pagamentos da venda no XML NFC-e", () => {
  const xml = buildSaleNfeXml({
    company: {
      documentCompany: "12345678000199",
      municipalityCodeCompany: "3106200",
      corporateNameCompany: "Empresa de teste",
      tradeNameCompany: "Empresa de teste",
      addressCompany: "Rua A",
      addressNumberCompany: "1",
      neighborhoodCompany: "Centro",
      nfceSeriesCompany: 4
    },
    items: [{
      idProduct: 1,
      skuProduct: "TESTE",
      productNameSaleItem: "Produto",
      ncmProduct: "12345678",
      quantitySaleItem: 1,
      unitPriceSaleItem: "10.00",
      lineTotalSaleItem: "10.00"
    }],
    sale: {
      subtotalSale: "10.00",
      discountSale: "0.00",
      totalSale: "10.00"
    },
    payments: [{ amountSalePayment: 1000, namePaymentMethod: "DINHEIRO" }],
    operation: {
      cfopFiscalOperation: "5102",
      taxSituationFiscalOperation: "102",
      originFiscalOperation: "0",
      operationNatureFiscalOperation: "Venda"
    },
    number: 1,
    accessKey: "31261112345678000199650040000000011000000010"
  });

  assert.match(xml, /<pag><detPag><tPag>01<\/tPag><vPag>10\.00<\/vPag><\/detPag><\/pag>/u);
});

test("mapeia Pix para o código fiscal 17", () => {
  assert.equal(fiscalPaymentTypeCode("PIX"), "17");
  assert.equal(fiscalPaymentTypeCode("Pix"), "17");
});

test("gera Pix como tPag 17 no XML NFC-e", () => {
  const xml = buildSaleNfeXml({
    company: {
      documentCompany: "12345678000199",
      municipalityCodeCompany: "3106200",
      corporateNameCompany: "Empresa de teste",
      tradeNameCompany: "Empresa de teste",
      addressCompany: "Rua A",
      addressNumberCompany: "1",
      neighborhoodCompany: "Centro",
      nfceSeriesCompany: 4
    },
    items: [{
      idProduct: 1,
      skuProduct: "TESTE",
      productNameSaleItem: "Produto",
      ncmProduct: "12345678",
      quantitySaleItem: 1,
      unitPriceSaleItem: "10.00",
      lineTotalSaleItem: "10.00"
    }],
    sale: {
      subtotalSale: "10.00",
      discountSale: "0.00",
      totalSale: "10.00"
    },
    payments: [{ amountSalePayment: 1000, namePaymentMethod: "PIX" }],
    operation: {
      cfopFiscalOperation: "5102",
      taxSituationFiscalOperation: "102",
      originFiscalOperation: "0",
      operationNatureFiscalOperation: "Venda"
    },
    number: 1,
    accessKey: "31261112345678000199650040000000011000000010"
  });

  assert.match(xml, /<pag><detPag><tPag>17<\/tPag><vPag>10\.00<\/vPag><\/detPag><\/pag>/u);
});

test("usa a descrição obrigatória de homologação no primeiro item da venda", () => {
  const xml = buildSaleNfeXml({
    company: {
      documentCompany: "12345678000199",
      municipalityCodeCompany: "3106200",
      corporateNameCompany: "Empresa de teste",
      tradeNameCompany: "Empresa de teste",
      addressCompany: "Rua A",
      addressNumberCompany: "1",
      neighborhoodCompany: "Centro",
      nfceSeriesCompany: 4
    },
    items: [{
      idProduct: 1,
      skuProduct: "TESTE",
      productNameSaleItem: "Produto cadastrado",
      ncmProduct: "12345678",
      quantitySaleItem: 1,
      unitPriceSaleItem: "10.00",
      lineTotalSaleItem: "10.00"
    }],
    sale: {
      subtotalSale: "10.00",
      discountSale: "0.00",
      totalSale: "10.00"
    },
    payments: [{ amountSalePayment: 1000 }],
    operation: {
      cfopFiscalOperation: "5102",
      taxSituationFiscalOperation: "102",
      originFiscalOperation: "0",
      operationNatureFiscalOperation: "Venda"
    },
    number: 1,
    accessKey: "31261112345678000199650040000000011000000010"
  });

  assert.match(
    xml,
    /<xProd>NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL<\/xProd>/u
  );
});
