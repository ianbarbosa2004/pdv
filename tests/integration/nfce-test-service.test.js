import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSaleNfeXml,
  fiscalPaymentTypeCode,
  FiscalQueryError,
  formatNfeDateTime,
  parseFiscalDocumentHtml,
  parseFiscalAccessKey,
  parseFiscalDocumentXml,
  queryNfeByAccessKey,
  resolveFiscalQueryEnvironments,
  resolveFiscalQueryUrl
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

test("valida a chave fiscal antes de acessar a SEFAZ", async () => {
  await assert.rejects(
    queryNfeByAccessKey({
      accessKey: "123",
      environment: "homologation",
      certificateData: "",
      certificatePassword: ""
    }),
    /44 dígitos/
  );
  await assert.rejects(
    queryNfeByAccessKey({
      accessKey: "31261004641376030124650080000482771496517110",
      environment: "homologation",
      certificateData: "",
      certificatePassword: ""
    }),
    /certificado A1/
  );
  await assert.rejects(
    queryNfeByAccessKey({
      accessKey: "31261004641376030124650080000482771496517110",
      environment: "homologation",
      certificateData: "",
      certificatePassword: ""
    }),
    (error) => error instanceof FiscalQueryError && error.status === 409
  );
  await assert.rejects(
    queryNfeByAccessKey({
      accessKey: "31261004641376030124650080000482771496517110",
      environment: "homologation",
      queryMode: "manual",
      manualModel: "55",
      certificateData: "",
      certificatePassword: ""
    }),
    /chave informada é do modelo 65, mas a consulta manual selecionou o modelo 55/
  );
});

test("interpreta e valida os campos estruturais da chave fiscal", () => {
  assert.deepEqual(
    parseFiscalAccessKey("31261004641376030124650080000482771496517110"),
    { accessKey: "31261004641376030124650080000482771496517110", model: 65 }
  );
});

test("seleciona o serviço de NFC-e para chaves de modelo 65", () => {
  assert.equal(
    resolveFiscalQueryUrl(65, "homologation"),
    "https://hnfce.fazenda.mg.gov.br/nfce/services/NFeConsultaProtocolo4"
  );
  assert.equal(
    resolveFiscalQueryUrl(55, "production"),
    "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeConsultaProtocolo4"
  );
});

test("extrai e valida dados do XML autorizado", () => {
  const result = parseFiscalDocumentXml(`
    <nfeProc>
      <NFe>
        <infNFe Id="NFe31261004641376030124650080000482771496517110">
          <ide><mod>65</mod><serie>8</serie><nNF>48277</nNF><natOp>Venda</natOp><dhEmi>2026-10-25T11:30:41-03:00</dhEmi></ide>
          <emit><CNPJ>04641376030124</CNPJ><xNome>Fornecedor Teste</xNome><enderEmit><xLgr>Rua A</xLgr><nro>10</nro><xMun>Belo Horizonte</xMun><UF>MG</UF></enderEmit></emit>
          <det nItem="1"><prod><cProd>0033857</cProd><xProd>STELLA ARTOIS PURE GOLD 600ML</xProd><NCM>22030000</NCM><CFOP>5405</CFOP><uCom>DZ</uCom><qCom>2.0000</qCom><vUnCom>276.85</vUnCom><vProd>553.70</vProd><uTrib>UN</uTrib><qTrib>24.0000</qTrib><vUnTrib>23.0708</vUnTrib></prod><imposto><ICMS><ICMS60><orig>0</orig><CST>60</CST></ICMS60></ICMS></imposto><indTot>1</indTot></det>
          <total><ICMSTot><vNF>209.57</vNF></ICMSTot></total>
          <cobr><dup><nDup>001</nDup><dVenc>2026-11-05</dVenc><vDup>553.70</vDup></dup></cobr>
          <pag><detPag><tPag>17</tPag><vPag>553.70</vPag></detPag></pag>
        </infNFe>
      </NFe>
      <protNFe><infProt><cStat>100</cStat><nProt>123456789</nProt></infProt></protNFe>
    </nfeProc>
  `, "31261004641376030124650080000482771496517110");
  assert.equal(result.model, 65);
  assert.equal(result.issuerDocument, "04641376030124");
  assert.equal(result.total, "209.57");
  assert.equal(result.status, "100");
  assert.equal(result.issuer.legalName, "Fornecedor Teste");
  assert.equal(result.items[0].supplierCode, "0033857");
  assert.equal(result.items[0].fiscalUnit, "DZ");
  assert.equal(result.items[0].taxableQuantity, "24.0000");
  assert.equal(result.items[0].taxSituation, "60");
});

test("extrai o conjunto mínimo de dados da consulta HTML da NFC-e", () => {
  const result = parseFiscalDocumentHtml(`
    <h2>Chave de acesso</h2>
    <h5>31-26/10-04.641.376/0301-24-65-008-000.048.277-149.651.7110</h5>
    <table><tr><th>Modelo</th><th>Série</th><th>Número</th><th>Data Emissão</th></tr>
      <tr><td>65</td><td>8</td><td>48277</td><td>25/10/2026 11:30:41</td></tr></table>
    <table><tr><th>Valor total do serviço</th><th>Base de Cálculo ICMS</th><th>Valor ICMS</th></tr>
      <tr><td>R$ 209,57</td><td>R$ 2,68</td><td>R$ 0,19</td></tr></table>
    <table><tr><th>CNPJ</th><th>Nome / Razão Social</th><th>Inscrição Estadual</th><th>UF</th></tr>
      <tr><td>04641376030124</td><td>SUPERMERCADOS BH</td><td>0032546129864</td><td>MG</td></tr></table>
    <table><tr><th>CPF</th><th>Nome / Razão Social</th><th>UF</th></tr>
      <tr><td>12345678901</td><td>Consumidor Teste</td><td>MG</td></tr></table>
    <table><tr><th>Destino da operação</th><th>Consumidor final</th><th>Presença do Comprador</th></tr>
      <tr><td>1 - Operação Interna</td><td>1 - Sim</td><td>1 - Operação presencial</td></tr></table>
    <table><tr><th>Processo</th><th>Versão do Processo</th><th>Tipo de Emissão</th><th>Finalidade</th></tr>
      <tr><td>0 - com aplicativo do Contribuinte</td><td>6.0</td><td>1 - Normal</td><td>1 - Normal</td></tr></table>
    <table><tr><th>Natureza da Operação</th><th>Tipo da Operação</th><th>Digest Value da NFC-e</th></tr>
      <tr><td>venda</td><td>1 - Saída</td><td>digest-test</td></tr></table>
    <table><tr><th>Número</th><th>Descrição</th><th>Unidade Comercial</th></tr>
      <tr><td>1</td><td>Produto resumido</td><td>UN</td></tr></table>
    <table><tr><th>Número</th><th>Código do Produto</th><th>Código EAN</th><th>Descrição</th><th>NCM</th><th>CEST</th><th>CFOP</th><th>Unidade Comercial</th><th>Quantidade Comercial</th><th>Valor Unitário Comercial</th><th>Valor Total</th><th>Unidade Tributável</th><th>Quantidade Tributável</th><th>Valor Unitário Tributável</th><th>Frete</th><th>Seguro</th><th>Desconto</th><th>Outras Despesas</th><th>Origem</th><th>CST</th></tr>
      <tr><td>1</td><td>0033857</td><td>7890000000000</td><td>Produto HTML</td><td>22030000</td><td>1234567</td><td>5405</td><td>UN</td><td>12.000</td><td>R$ 2,50</td><td>R$ 30,00</td><td>UN</td><td>12.000</td><td>R$ 2,50</td><td>R$ 1,00</td><td>R$ 0,50</td><td>R$ 0,25</td><td>R$ 0,75</td><td>0</td><td>60</td></tr></table>
    <div>Situação atual: AUTORIZADA</div>
    <table><tr><th>Eventos da NFC-e</th><th>Protocolo</th><th>Data Autorização</th><th>Data Inclusão BD</th></tr>
      <tr><td>Autorização de Uso (Cód.: 110100)</td><td>131262702755932</td><td>25/10/2026 11:30:41</td><td>25/10/2026 11:31:00</td></tr></table>
  `);
  assert.equal(result.accessKey, "31261004641376030124650080000482771496517110");
  assert.equal(result.model, 65);
  assert.equal(result.issuerDocument, "04641376030124");
  assert.equal(result.issuedAt, "2026-10-25T11:30:41-03:00");
  assert.equal(result.total, "209.57");
  assert.deepEqual(result.taxTotals, { icmsBase: "2.68", icmsAmount: "0.19" });
  assert.deepEqual(result.recipient, { document: "12345678901", legalName: "Consumidor Teste", state: "MG" });
  assert.deepEqual(result.operationDetails, {
    destination: "1 - Operação Interna",
    finalConsumer: "1 - Sim",
    buyerPresence: "1 - Operação presencial",
    type: "1 - Saída"
  });
  assert.deepEqual(result.emission, {
    process: "0 - com aplicativo do Contribuinte",
    processVersion: "6.0",
    type: "1 - Normal",
    purpose: "1 - Normal"
  });
  assert.equal(result.digestValue, "digest-test");
  assert.equal(result.status, "100");
  assert.equal(result.authorizedAt, "2026-10-25T11:30:41-03:00");
  assert.equal(result.includedAt, "2026-10-25T11:31:00-03:00");
  assert.equal(result.protocol, "131262702755932");
  assert.deepEqual(result.payments, []);
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0], {
    lineNumber: 1,
    supplierCode: "0033857",
    barcode: "7890000000000",
    description: "Produto HTML",
    ncm: "22030000",
    cest: "1234567",
    cfop: "5405",
    fiscalUnit: "UN",
    quantity: "12",
    unitPrice: "2.5",
    total: "30",
    taxableUnit: "UN",
    taxableQuantity: "12",
    taxableUnitPrice: "2.5",
    freight: "1",
    insurance: "0.5",
    otherExpenses: "0.75",
    discount: "0.25",
    taxOrigin: "0",
    taxSituation: "60",
    isTotalized: true
  });
});

test("mantém campos tributáveis ausentes como indisponíveis no HTML resumido", () => {
  const result = parseFiscalDocumentHtml(`
    <h2>Chave de acesso</h2>
    <h5>31-26/10-04.641.376/0301-24-65-008-000.048.277-149.651.7110</h5>
    <table><tr><th>Modelo</th><th>Série</th><th>Número</th><th>Data Emissão</th></tr>
      <tr><td>65</td><td>8</td><td>48277</td><td>25/10/2026 11:30:41</td></tr></table>
    <table><tr><th>Valor total do serviço</th><th>Base de Cálculo ICMS</th><th>Valor ICMS</th></tr>
      <tr><td>R$ 1,99</td><td>R$ 0,00</td><td>R$ 0,00</td></tr></table>
    <table><tr><th>CNPJ</th><th>Nome / Razão Social</th><th>Inscrição Estadual</th><th>UF</th></tr>
      <tr><td>04641376030124</td><td>Fornecedor Teste</td><td>123</td><td>MG</td></tr></table>
    <table><tr><th>Número</th><th>Descrição</th><th>Unidade Comercial</th><th>Quantidade</th><th>Valor Unitário</th><th>Valor(R$)</th></tr>
      <tr><td>1</td><td>Produto resumido</td><td>UN</td><td>1.000</td><td>R$ 1,99</td><td>R$ 1,99</td></tr></table>
    <div>Situação atual: AUTORIZADA</div>
    <table><tr><th>Eventos da NFC-e</th><th>Protocolo</th><th>Data Autorização</th><th>Data Inclusão BD</th></tr>
      <tr><td>Autorização de Uso (Cód.: 110100)</td><td>123456789</td><td>25/10/2026 11:30:41</td><td>25/10/2026 11:31:00</td></tr></table>
  `);
  assert.equal(result.items[0].taxableUnit, "");
  assert.equal(result.items[0].taxableQuantity, null);
  assert.equal(result.items[0].taxableUnitPrice, null);
});

test("extrai a chave quando o DOM usa entidades HTML no rótulo", () => {
  const result = parseFiscalDocumentHtml(`
    <div>Chave&nbsp;de&nbsp;acesso</div>
    <div>31-26/10-04.641.376/0301-24-65-008-000.048.277-149.651.7110</div>
    <table><tr><th>Modelo</th><th>Série</th><th>Número</th><th>Data Emissão</th></tr>
      <tr><td>65</td><td>8</td><td>48277</td><td>25/10/2026 11:30:41</td></tr></table>
    <table><tr><th>Valor total do serviço</th><th>Base de Cálculo ICMS</th><th>Valor ICMS</th></tr>
      <tr><td>R$ 1,00</td><td>R$ 0,00</td><td>R$ 0,00</td></tr></table>
    <table><tr><th>CNPJ</th><th>Nome / Razão Social</th><th>IE</th><th>UF</th></tr>
      <tr><td>04641376030124</td><td>Fornecedor</td><td>1</td><td>MG</td></tr></table>
    <table><tr><th>Número</th><th>Descrição</th><th>Unidade Comercial</th></tr>
      <tr><td>1</td><td>Produto</td><td>UN</td></tr></table>
    <div>Situação atual: AUTORIZADA</div>
    <table><tr><th>Eventos da NFC-e</th><th>Protocolo</th><th>Data Autorização</th><th>Data Inclusão BD</th></tr>
      <tr><td>Autorização de Uso</td><td>1</td><td>25/10/2026 11:30:41</td><td>25/10/2026 11:31:00</td></tr></table>
  `);
  assert.equal(result.accessKey, "31261004641376030124650080000482771496517110");
});

test("associa tabelas detalhadas do painel ao item resumido correspondente", () => {
  const result = parseFiscalDocumentHtml(`
    <h2>Chave de acesso</h2>
    <h5>31-26/10-04.641.376/0301-24-65-008-000.048.277-149.651.7110</h5>
    <table><tr><th>Modelo</th><th>Série</th><th>Número</th><th>Data Emissão</th></tr>
      <tr><td>65</td><td>8</td><td>48277</td><td>25/10/2026 11:30:41</td></tr></table>
    <table><tr><th>Valor total do serviço</th><th>Base de Cálculo ICMS</th><th>Valor ICMS</th></tr>
      <tr><td>R$ 1,99</td><td>R$ 1,99</td><td>R$ 0,03</td></tr></table>
    <table><tr><th>CNPJ</th><th>Nome / Razão Social</th><th>IE</th><th>UF</th></tr>
      <tr><td>04641376030124</td><td>Fornecedor</td><td>1</td><td>MG</td></tr></table>
    <table><tr><th>Número</th><th>Descrição</th><th>Unidade Comercial</th></tr>
      <tr><td>1</td><td>Produto resumido</td><td>PT</td></tr></table>
    <div class="panel panel-default">
      <div class="panel-heading"><div class="col-md-1">1</div><div>Produto resumido</div></div>
      <div class="panel-body">
        <table><tr><th>Código do produto</th><th>Código NCM</th></tr><tr><td>96843</td><td>48183000</td></tr></table>
        <table><tr><th>Código CEST</th></tr><tr><td>2004600</td></tr></table>
        <table><tr><th>CFOP</th></tr><tr><td>5405</td></tr></table>
        <table><tr><th>Código EAN Comercial</th><th>Unidade Comercial</th><th>Quantidade Comercial</th></tr>
          <tr><td>789610499990</td><td>PT</td><td>1.000</td></tr></table>
        <table><tr><th>Origem da Mercadoria</th><th>Tributação do ICMS</th></tr>
          <tr><td>0 - Nacional</td><td>60 - ICMS cobrado anteriormente por substituição tributária</td></tr></table>
      </div>
    </div>
    <div>Situação atual: AUTORIZADA</div>
    <table><tr><th>Eventos da NFC-e</th><th>Protocolo</th><th>Data Autorização</th><th>Data Inclusão BD</th></tr>
      <tr><td>Autorização de Uso</td><td>1</td><td>25/10/2026 11:30:41</td><td>25/10/2026 11:31:00</td></tr></table>
  `);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].supplierCode, "96843");
  assert.equal(result.items[0].ncm, "48183000");
  assert.equal(result.items[0].cest, "2004600");
  assert.equal(result.items[0].cfop, "5405");
  assert.equal(result.items[0].barcode, "789610499990");
  assert.equal(result.items[0].fiscalUnit, "PT");
  assert.equal(result.items[0].quantity, "1");
  assert.equal(result.items[0].taxOrigin, "0");
  assert.equal(result.items[0].taxSituation, "60");
});

test("rejeita XML autorizado de outra chave", () => {
  assert.throws(
    () => parseFiscalDocumentXml(
      "<nfeProc><NFe><infNFe Id=\"NFe31261004641376030124650080000482771496517110\"><ide></ide></infNFe></NFe></nfeProc>",
      "31261004641376030124650080000482771496517111"
    ),
    /não corresponde/u
  );
});

test("usa os endpoints nacionais corretos para distribuir XML", async () => {
  const result = await queryNfeByAccessKey({
    accessKey: "31261004641376030124650080000482771496517110",
    environment: "production",
    certificateData: "Y2VydGlmaWNhdGU=",
    certificatePassword: "senha",
    certificateCnpj: "04641376030124",
    requestQuery: async () => ({
      cStat: "100",
      xMotivo: "Autorizado",
      issuerDocument: "",
      issuedAt: null,
      total: null
    }),
    requestDistribution: async ({ distributionUrl }) => {
      assert.equal(
        distributionUrl,
        "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx"
      );
      return {
        cStat: "138",
        xMotivo: "Documento localizado",
        documentXml: `
          <nfeProc><NFe><infNFe>
            <ide><dhEmi>2026-10-25T11:30:41-03:00</dhEmi></ide>
            <emit><CNPJ>04641376030124</CNPJ></emit>
            <total><ICMSTot><vNF>209.57</vNF></ICMSTot></total>
          </infNFe></NFe></nfeProc>
        `
      };
    }
  });
  assert.equal(result.total, 209.57);
});

test("consulta automática tenta o outro ambiente quando a SEFAZ não encontra a chave", async () => {
  const environments = [];
  const result = await queryNfeByAccessKey({
    accessKey: "31261004641376030124650080000482771496517110",
    environment: "automatic",
    preferredEnvironment: "homologation",
    certificateData: "Y2VydGlmaWNhdGU=",
    certificatePassword: "senha",
    requestQuery: async ({ environment }) => {
      environments.push(environment);
      return environment === "homologation"
        ? { cStat: "217", xMotivo: "NF-e não consta na base de dados da SEFAZ" }
        : {
            cStat: "100",
            xMotivo: "Autorizado",
            issuerDocument: "04641376030124",
            issuedAt: "2026-10-25T11:30:41-03:00",
            total: "209.57"
          };
    }
  });
  assert.deepEqual(environments, ["homologation", "production"]);
  assert.equal(result.model, 65);
  assert.equal(result.total, 209.57);
});

test("obtém os dados completos pelo XML de distribuição quando o protocolo não os contém", async () => {
  const result = await queryNfeByAccessKey({
    accessKey: "31261004641376030124650080000482771496517110",
    environment: "production",
    certificateData: "Y2VydGlmaWNhdGU=",
    certificatePassword: "senha",
    certificateCnpj: "04641376030124",
    requestQuery: async () => ({
      cStat: "100",
      xMotivo: "Autorizado o uso da NF-e",
      issuerDocument: "",
      issuedAt: null,
      total: null
    }),
    requestDistribution: async ({ cnpj, distributionUrl }) => {
      assert.equal(cnpj, "04641376030124");
      assert.match(distributionUrl, /NFeDistribuicaoDFe\.asmx$/u);
      return {
        cStat: "138",
        xMotivo: "Documento localizado",
        documentXml: `
          <nfeProc>
            <NFe>
              <infNFe Id="NFe31261004641376030124650080000482771496517110">
                <ide><dhEmi>2026-10-25T11:30:41-03:00</dhEmi></ide>
                <emit><CNPJ>04641376030124</CNPJ></emit>
                <total><ICMSTot><vNF>209.57</vNF></ICMSTot></total>
              </infNFe>
            </NFe>
          </nfeProc>
        `
      };
    }
  });
  assert.equal(result.issuerDocument, "04641376030124");
  assert.equal(result.total, 209.57);
  assert.equal(result.issuedAt.toISOString(), "2026-10-25T14:30:41.000Z");
});

test("não tenta distribuir XML de NFC-e de outro CNPJ-base", async () => {
  let distributionCalled = false;
  await assert.rejects(
    queryNfeByAccessKey({
      accessKey: "31261004641376030124650080000482771496517110",
      environment: "production",
      certificateData: "Y2VydGlmaWNhdGU=",
      certificatePassword: "senha",
      certificateCnpj: "12345678000199",
      requestQuery: async () => ({
        cStat: "100",
        xMotivo: "Autorizado o uso da NFC-e",
        issuerDocument: "",
        issuedAt: null,
        total: null
      }),
      requestDistribution: async () => {
        distributionCalled = true;
        return { cStat: "138", xMotivo: "Documento localizado", documentXml: "" };
      }
    }),
    (error) => error instanceof FiscalQueryError
      && error.status === 422
      && /CNPJ-base do emitente/u.test(error.message)
  );
  assert.equal(distributionCalled, false);
});

test("ambientes automáticos preservam o ambiente configurado como primeira tentativa", () => {
  assert.deepEqual(resolveFiscalQueryEnvironments("automatic", "production"), ["production", "homologation"]);
  assert.deepEqual(resolveFiscalQueryEnvironments("automatic", "homologation"), ["homologation", "production"]);
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
