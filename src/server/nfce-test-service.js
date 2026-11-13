import { createHash, createPrivateKey, randomBytes } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { SignedXml } from "xml-crypto";

const NFE_NS = "http://www.portalfiscal.inf.br/nfe";
const SOAP_NS = "http://www.w3.org/2003/05/soap-envelope";
const DS_NS = "http://www.w3.org/2000/09/xmldsig#";
const XML_C14N_NS = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const AUTHORIZATION_WSDL_NS = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4";
const HOMOLOGATION_URL = "https://hnfce.fazenda.mg.gov.br/nfce/services/NFeAutorizacao4";
const QUERY_WSDL_NS = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4";
const HOMOLOGATION_PRODUCT_DESCRIPTION =
  "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

export const DEFAULT_FISCAL_QUERY_URLS = Object.freeze({
  nfeHomologation: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeConsultaProtocolo4",
  nfeProduction: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeConsultaProtocolo4",
  nfceHomologation: "https://hnfce.fazenda.mg.gov.br/nfce/services/NFeConsultaProtocolo4",
  nfceProduction: "https://nfce.fazenda.mg.gov.br/nfce/services/NFeConsultaProtocolo4"
});

export const DEFAULT_FISCAL_DISTRIBUTION_URLS = Object.freeze({
  homologation: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
  production: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx"
});

export const resolveFiscalQueryUrl = (model, environment, queryUrls = {}) => {
  const key = model === 65
    ? environment === "production" ? "nfceProduction" : "nfceHomologation"
    : environment === "production" ? "nfeProduction" : "nfeHomologation";
  return String(queryUrls[key] || DEFAULT_FISCAL_QUERY_URLS[key]);
};

export const resolveFiscalQueryEnvironments = (environment, preferredEnvironment = "production") => {
  if (environment !== "automatic") return [environment];
  const preferred = ["production", "homologation"].includes(preferredEnvironment)
    ? preferredEnvironment
    : "production";
  return [preferred, preferred === "production" ? "homologation" : "production"];
};

const isFiscalDocumentNotFound = (result) => {
  const reason = String(result?.xMotivo || "").toLocaleLowerCase("pt-BR");
  return String(result?.cStat || "") === "217"
    || reason.includes("não consta")
    || reason.includes("nao consta")
    || reason.includes("não encontrada")
    || reason.includes("nao encontrada");
};

const decodeDistributionDocument = (value) => {
  const buffer = Buffer.from(String(value || "").replace(/\s+/g, ""), "base64");
  if (!buffer.length) return "";
  try {
    return gunzipSync(buffer).toString("utf8");
  } catch {
    return buffer.toString("utf8");
  }
};

const readCompleteFiscalDocument = (xml, accessKey) => {
  return parseFiscalDocumentXml(xml, accessKey);
};

export class FiscalQueryError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.name = "FiscalQueryError";
    this.status = status;
  }
}

const escapeXml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const decodeXml = (value) =>
  String(value ?? "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");

const readXmlTag = (content, tagName) => {
  const match = String(content).match(
    new RegExp(`<(?:(?:[\\w.-]+):)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:(?:[\\w.-]+):)?${tagName}>`, "i")
  );
  return match ? decodeXml(match[1].trim()) : null;
};

const readXmlAttribute = (content, tagName, attributeName) => {
  const match = String(content).match(
    new RegExp(`<(?:(?:[\\w.-]+):)?${tagName}\\b[^>]*\\b${attributeName}=["']([^"']+)["']`, "i")
  );
  return match ? decodeXml(match[1].trim()) : null;
};

const readXmlBlock = (content, tagName) =>
  String(content).match(
    new RegExp(`<(?:(?:[\\w.-]+):)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:(?:[\\w.-]+):)?${tagName}>`, "i")
  )?.[1] || "";

const readXmlBlocks = (content, tagName) => {
  const expression = new RegExp(
    `<(?:(?:[\\w.-]+):)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:(?:[\\w.-]+):)?${tagName}>`,
    "gi"
  );
  return [...String(content).matchAll(expression)].map((match) => match[1] || "");
};

const onlyDigits = (value) => String(value ?? "").replace(/\D/g, "");

const decodeHtmlEntities = (value) => String(value ?? "")
  .replace(/<br\s*\/?>/gi, " ")
  .replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#0*39;/gi, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/\s+/g, " ")
  .trim();

const parseHtmlTables = (html) => [...String(html).matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)]
  .map((tableMatch) => [...tableMatch[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((rowMatch) => [...rowMatch[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)]
      .map((cellMatch) => decodeHtmlEntities(cellMatch[1])))
    .filter((row) => row.length));

const extractHtmlDivBlocksByClass = (html, className) => {
  const blocks = [];
  const divs = [];
  const classTokens = className.split(/\s+/).filter(Boolean);
  const tagPattern = /<\/?div\b[^>]*>/gi;
  for (const match of String(html).matchAll(tagPattern)) {
    const tag = match[0];
    if (/^<\//.test(tag)) {
      const div = divs.pop();
      if (div?.isTarget) {
        blocks.push(String(html).slice(div.start, match.index + tag.length));
      }
      continue;
    }
    const classAttribute = tag.match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1] || "";
    const tokens = classAttribute.split(/\s+/).filter(Boolean);
    divs.push({
      start: match.index,
      isTarget: classTokens.every((token) => tokens.includes(token))
    });
  }
  return blocks;
};

const readHtmlPanelLineNumber = (block) => {
  const match = String(block).match(
    /<div\b[^>]*class=["'][^"']*\bcol-md-1\b[^"']*["'][^>]*>\s*(\d+)\s*<\/div>/i
  );
  return match ? Number(match[1]) : 0;
};

const parseHtmlItemDetails = (block) => {
  const details = {};
  for (const table of parseHtmlTables(block)) {
    const headerIndex = table.findIndex((row) => row.some((cell) =>
      ["Código do produto", "Código CEST", "CFOP", "Código EAN Comercial", "Origem da Mercadoria"]
        .some((header) => normalizeHtmlHeader(cell) === normalizeHtmlHeader(header))
    ));
    if (headerIndex < 0) continue;
    const headers = table[headerIndex].map(normalizeHtmlHeader);
    const row = table.slice(headerIndex + 1).find((candidate) => candidate.length);
    if (!row) continue;
    const assign = (key, aliases) => {
      const value = htmlCell(row, headers, aliases);
      if (value && !details[key]) details[key] = value;
    };
    assign("supplierCode", ["Código do Produto"]);
    assign("ncm", ["Código NCM", "NCM"]);
    assign("cest", ["Código CEST", "CEST"]);
    assign("cfop", ["CFOP"]);
    assign("barcode", ["Código EAN Comercial", "Código EAN", "EAN", "GTIN"]);
    assign("fiscalUnit", ["Unidade Comercial", "Unidade"]);
    assign("quantity", ["Quantidade Comercial", "Quantidade"]);
    assign("taxableUnit", ["Unidade Tributável"]);
    assign("taxableQuantity", ["Quantidade Tributável"]);
    assign("unitPrice", ["Valor unitário de comercialização", "Valor Unitário Comercial"]);
    assign("taxableUnitPrice", ["Valor unitário de tributação", "Valor Unitário Tributável"]);
    assign("total", ["Valor Total", "Valor(R$)", "Valor"]);
    assign("freight", ["Valor do Frete", "Frete"]);
    assign("insurance", ["Valor do Seguro", "Seguro"]);
    assign("otherExpenses", ["Outras Despesas Acessórias", "Outras Despesas", "Outros"]);
    assign("discount", ["Valor do Desconto", "Desconto"]);
    assign("taxOrigin", ["Origem da Mercadoria", "Origem"]);
    assign("taxSituation", ["Tributação do ICMS", "CST", "CSOSN", "Situação Tributária"]);
  }
  return details;
};

const findHtmlTable = (tables, header) => tables.find((table) =>
  table.some((row) => row.some((cell) =>
    cell.toLocaleLowerCase("pt-BR").includes(header.toLocaleLowerCase("pt-BR"))
  ))
);

const normalizeHtmlHeader = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim()
  .toLocaleLowerCase("pt-BR");

const findHtmlHeaderRow = (table, requiredHeaders) => table.find((row) => {
  const headers = row.map(normalizeHtmlHeader);
  return requiredHeaders.every((required) =>
    headers.some((header) => header.includes(normalizeHtmlHeader(required)))
  );
}) || [];

const htmlColumn = (headers, aliases) => {
  const normalizedAliases = aliases.map(normalizeHtmlHeader);
  const exactIndex = headers.findIndex((header) => normalizedAliases.includes(header));
  if (exactIndex >= 0) return exactIndex;
  return headers.findIndex((header) =>
    normalizedAliases.some((alias) => header.includes(alias))
  );
};

const htmlCell = (row, headers, aliases) => {
  const index = htmlColumn(headers, aliases);
  return index >= 0 ? row[index] || "" : "";
};

const findHtmlTableRow = (tables, requiredHeaders, predicate = () => true) => {
  for (const table of tables) {
    const headerRow = findHtmlHeaderRow(table, requiredHeaders);
    if (!headerRow.length) continue;
    const headerIndex = table.indexOf(headerRow);
    const headers = headerRow.map(normalizeHtmlHeader);
    const row = table.slice(headerIndex + 1).find((candidate) => predicate(candidate, headers));
    if (row) return { headers, row };
  }
  return null;
};

const parseHtmlNumber = (value, currency = false) => {
  const text = String(value ?? "").replace(/[^\d,.-]/g, "").trim();
  if (!text) return "0";
  const normalized = currency || text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? String(parsed) : "0";
};

const parseHtmlOptionalNumber = (value, currency = false) => {
  const text = String(value ?? "").trim();
  return text ? parseHtmlNumber(text, currency) : null;
};

const parseHtmlFiscalCode = (value) => {
  const text = String(value ?? "").trim();
  return text.match(/^([A-Za-z0-9]+)(?:\s+-|$)/)?.[1] || text;
};

const parseHtmlDateTime = (value) => {
  const match = String(value ?? "").match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}T${match[4] || "00"}:${match[5] || "00"}:${match[6] || "00"}-03:00`;
};

export const parseFiscalDocumentHtml = (html, expectedAccessKey = "") => {
  const source = String(html ?? "").trim();
  if (!source) throw new FiscalQueryError("O arquivo HTML está vazio.");
  const tables = parseHtmlTables(source);
  const visibleText = decodeHtmlEntities(source);
  const keySection = visibleText.match(/chave[\s\S]{0,1500}/i)?.[0] || visibleText;
  const accessKeyMatch = keySection.match(/\d(?:[\s./-]*\d){43}/)
    || visibleText.match(/\d(?:[\s./-]*\d){43}/);
  const accessKey = onlyDigits(accessKeyMatch?.[0] || "");
  const normalizedExpectedKey = onlyDigits(expectedAccessKey);
  if (!/^\d{44}$/.test(accessKey)) {
    throw new FiscalQueryError("O HTML não contém uma chave de acesso válida.");
  }
  if (normalizedExpectedKey && accessKey !== normalizedExpectedKey) {
    throw new FiscalQueryError("A chave do HTML não corresponde à chave informada.");
  }
  if (Number(accessKey.slice(20, 22)) !== 65) {
    throw new FiscalQueryError("O HTML só pode ser usado para NFC-e modelo 65.");
  }

  const identificationTable = findHtmlTable(tables, "Data Emissão");
  const identification = identificationTable?.find((row) => row.length >= 4 && /^\d+$/.test(row[0])) || [];
  const valuesTable = findHtmlTable(tables, "Valor total do serviço");
  const values = valuesTable?.find((row) => row.length >= 3 && row.some((cell) => /R\$\s*[\d.,]+/.test(cell))) || [];
  const issuerTable = findHtmlTable(tables, "Nome / Razão Social");
  const issuer = issuerTable?.find((row) => row.length >= 4 && /^\d{8,14}$/.test(onlyDigits(row[0]))) || [];
  const detailedIssuer = findHtmlTableRow(
    tables,
    ["Nome / Razão Social", "Nome Fantasia", "CNPJ", "Inscrição Estadual"],
    (row) => /^\d{8,14}$/.test(onlyDigits(htmlCell(row, [
      "nome / razao social", "nome fantasia", "cnpj", "inscricao estadual"
    ], ["CNPJ"])))
  );
  const detailedAddress = findHtmlTableRow(
    tables,
    ["Endereço", "Bairro / Distrito", "Município"],
    (row) => row.length >= 3
  );
  const detailedContact = findHtmlTableRow(
    tables,
    ["Telefone", "CEP"],
    (row) => row.length >= 2
  );
  const recipientTable = findHtmlTable(tables, "CPF");
  const recipient = recipientTable?.find((row) =>
    row.length >= 3 && (row[0].includes("*") || /^\d{11}$/.test(onlyDigits(row[0])))
  ) || [];
  const operationDetailsTable = findHtmlTable(tables, "Destino da operação");
  const operationDetails = operationDetailsTable?.find((row) => row.length >= 3 && row[0] !== "Destino da operação") || [];
  const emissionTable = findHtmlTable(tables, "Processo");
  const emission = emissionTable?.find((row) => row.length >= 4 && row[0] !== "Processo") || [];
  const operationTable = findHtmlTable(tables, "Natureza da Operação");
  const operation = operationTable?.find((row) => row.length >= 2 && row[0].toLocaleLowerCase("pt-BR") !== "natureza da operação") || [];
  const productRowsByLine = new Map();
  for (const table of tables) {
    const productHeaderRow = table.find((row) => {
      const headers = row.map(normalizeHtmlHeader);
      return headers.some((header) => header.includes(normalizeHtmlHeader("Descrição")))
        && headers.some((header) => ["numero", "n", "item"].includes(header));
    }) || [];
    const productHeaders = productHeaderRow.map(normalizeHtmlHeader);
    if (!productHeaderRow.length || htmlColumn(productHeaders, ["Número", "Nº", "Item"]) < 0) continue;
    const productHeaderIndex = table.indexOf(productHeaderRow);
    for (const row of table.slice(productHeaderIndex + 1)) {
      const lineNumber = htmlCell(row, productHeaders, ["Número", "Nº", "Item"]);
      if (!/^\d+$/.test(lineNumber) || !htmlCell(row, productHeaders, ["Descrição"])) continue;
      const candidate = {
        row,
        headers: productHeaders,
        score: ["Código do Produto", "Código EAN", "NCM", "CEST", "CFOP", "Unidade Comercial"]
          .filter((header) => htmlColumn(productHeaders, [header]) >= 0).length
      };
      const existing = productRowsByLine.get(Number(lineNumber));
      if (!existing || candidate.score > existing.score) {
        productRowsByLine.set(Number(lineNumber), candidate);
      }
    }
  }
  const productRows = [...productRowsByLine.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, product]) => product);
  const detailRowsByLine = new Map(
    extractHtmlDivBlocksByClass(source, "panel panel-default")
      .map((block) => [readHtmlPanelLineNumber(block), parseHtmlItemDetails(block)])
      .filter(([lineNumber]) => lineNumber > 0)
  );
  const authorizationTable = findHtmlTable(tables, "Eventos da NFC-e");
  const authorization = authorizationTable?.find((row) => row.some((cell) => cell.includes("Autorização de Uso"))) || [];
  const statusText = decodeHtmlEntities(source).toLocaleLowerCase("pt-BR");
  const issuerAddressText = htmlCell(
    detailedAddress?.row || [],
    detailedAddress?.headers || [],
    ["Endereço"]
  );
  const issuerAddressMatch = issuerAddressText.match(/^(.*?)(?:,\s*(\d+[\w/-]*))?$/);
  const issuerCityText = htmlCell(
    detailedAddress?.row || [],
    detailedAddress?.headers || [],
    ["Município"]
  );
  const issuerCityMatch = issuerCityText.match(/^(.*?)(?:,\s*([A-Z]{2}))?$/i);
  const issuedAt = parseHtmlDateTime(identification[3]);
  const total = parseHtmlNumber(values[0], true);
  const items = productRows.map(({ row, headers }) => {
    const lineNumber = Number(htmlCell(row, headers, ["Número", "Nº", "Item"]));
    const details = detailRowsByLine.get(lineNumber) || {};
    const value = (key, aliases) => details[key] || htmlCell(row, headers, aliases);
    return {
    lineNumber,
    supplierCode: value("supplierCode", ["Código do Produto", "Código"]),
    barcode: onlyDigits(value("barcode", ["Código EAN Comercial", "Código EAN", "EAN", "GTIN"])),
    description: htmlCell(row, headers, ["Descrição"]),
    ncm: onlyDigits(value("ncm", ["NCM"])),
    cest: onlyDigits(value("cest", ["CEST"])),
    cfop: value("cfop", ["CFOP"]),
    fiscalUnit: value("fiscalUnit", ["Unidade Comercial", "Unidade"]),
    quantity: parseHtmlNumber(value("quantity", ["Quantidade Comercial", "Quantidade"])),
    unitPrice: parseHtmlNumber(value("unitPrice", ["Valor Unitário Comercial", "Valor Unitário"]), true),
    total: parseHtmlNumber(value("total", ["Valor Total", "Valor(R$)", "Valor"]), true),
    taxableUnit: value("taxableUnit", ["Unidade Tributável"]),
    taxableQuantity: parseHtmlOptionalNumber(value("taxableQuantity", ["Quantidade Tributável"])),
    taxableUnitPrice: parseHtmlOptionalNumber(value("taxableUnitPrice", ["Valor Unitário Tributável"]), true),
    freight: parseHtmlNumber(value("freight", ["Frete"]), true),
    insurance: parseHtmlNumber(value("insurance", ["Seguro"]), true),
    otherExpenses: parseHtmlNumber(value("otherExpenses", ["Outras Despesas", "Outros"]), true),
    discount: parseHtmlNumber(value("discount", ["Desconto"]), true),
    taxOrigin: parseHtmlFiscalCode(value("taxOrigin", ["Origem"])),
    taxSituation: parseHtmlFiscalCode(value("taxSituation", ["CST", "CSOSN", "Situação Tributária"])),
    isTotalized: true
    };
  });
  if (!identification.length || !issuedAt || !issuer.length || !values.length || !items.length) {
    throw new FiscalQueryError("O HTML não contém os dados mínimos de identificação, emitente, total e itens.");
  }
  if (!statusText.includes("situação atual: autorizada") || !authorization.length) {
    throw new FiscalQueryError("O HTML não contém uma NFC-e autorizada.");
  }
  return {
    accessKey,
    model: 65,
    issuerDocument: onlyDigits(issuer[0]),
    issuer: {
      legalName: detailedIssuer
        ? htmlCell(detailedIssuer.row, detailedIssuer.headers, ["Nome / Razão Social"])
        : issuer[1] || "",
      tradeName: detailedIssuer
        ? htmlCell(detailedIssuer.row, detailedIssuer.headers, ["Nome Fantasia"])
        : "",
      stateRegistration: detailedIssuer
        ? htmlCell(detailedIssuer.row, detailedIssuer.headers, ["Inscrição Estadual"])
        : issuer[2] || "",
      address: {
        street: issuerAddressMatch?.[1]?.trim() || "",
        number: issuerAddressMatch?.[2] || "",
        complement: "",
        neighborhood: htmlCell(
          detailedAddress?.row || [],
          detailedAddress?.headers || [],
          ["Bairro / Distrito"]
        ),
        city: issuerCityMatch?.[1]?.trim() || "",
        state: issuerCityMatch?.[2]?.toLocaleUpperCase("pt-BR") || issuer[3] || "",
        postalCode: onlyDigits(htmlCell(
          detailedContact?.row || [],
          detailedContact?.headers || [],
          ["CEP"]
        ))
      }
    },
    taxTotals: {
      icmsBase: parseHtmlNumber(values[1], true),
      icmsAmount: parseHtmlNumber(values[2], true)
    },
    recipient: {
      document: recipient[0] || "",
      legalName: recipient[1] || "",
      state: recipient[2] || ""
    },
    operationDetails: {
      destination: operationDetails[0] || "",
      finalConsumer: operationDetails[1] || "",
      buyerPresence: operationDetails[2] || "",
      type: operation[1] || ""
    },
    emission: {
      process: emission[0] || "",
      processVersion: emission[1] || "",
      type: emission[2] || "",
      purpose: emission[3] || ""
    },
    series: identification[1] || "",
    number: identification[2] || "",
    operationNature: operation[0] || "",
    issuedAt,
    total,
    status: "100",
    protocol: authorization[1] || "",
    authorizedAt: parseHtmlDateTime(authorization[2]),
    includedAt: parseHtmlDateTime(authorization[3]),
    digestValue: operation[2] || "",
    items,
    payments: [],
    installments: []
  };
};

export const parseFiscalDocumentXml = (xml, expectedAccessKey = "") => {
  const documentInfo = readXmlBlock(xml, "infNFe");
  if (!documentInfo) throw new FiscalQueryError("O arquivo não contém um XML de NF-e ou NFC-e.");
  const accessKey = readXmlAttribute(xml, "infNFe", "Id")?.replace(/^NFe/i, "")
    || String(expectedAccessKey || "");
  const normalizedExpectedKey = onlyDigits(expectedAccessKey);
  if (!/^\d{44}$/.test(accessKey)) {
    throw new FiscalQueryError("O XML não contém uma chave de acesso válida.");
  }
  if (normalizedExpectedKey && accessKey !== normalizedExpectedKey) {
    throw new FiscalQueryError("A chave do XML não corresponde à chave informada.");
  }
  const issuer = readXmlBlock(documentInfo, "emit");
  const totals = readXmlBlock(documentInfo, "ICMSTot");
  const ide = readXmlBlock(documentInfo, "ide");
  const issuerAddress = readXmlBlock(issuer, "enderEmit");
  const protocol = readXmlBlock(xml, "infProt");
  const issuedAt = readXmlTag(ide, "dhEmi")
    || (readXmlTag(ide, "dEmi")
      ? `${readXmlTag(ide, "dEmi")}T${readXmlTag(ide, "hEmi") || "00:00:00"}-03:00`
      : null);
  const items = readXmlBlocks(documentInfo, "det").map((det, index) => {
    const product = readXmlBlock(det, "prod");
    const tax = readXmlBlock(det, "imposto");
    const icms = readXmlBlock(tax, "ICMS");
    const icmsGroup = icms.match(/<(?:(?:[\w.-]+):)?(ICMS\d{2,3})(?:\s[^>]*)?>([\s\S]*?)<\/(?:(?:[\w.-]+):)?\1>/i);
    const icmsDetails = icmsGroup?.[2] || "";
    return {
      lineNumber: Number(readXmlAttribute(det, "det", "nItem") || index + 1),
      supplierCode: readXmlTag(product, "cProd") || "",
      barcode: readXmlTag(product, "cEAN") || "",
      description: readXmlTag(product, "xProd") || "",
      ncm: readXmlTag(product, "NCM") || "",
      cest: readXmlTag(product, "CEST") || "",
      cfop: readXmlTag(product, "CFOP") || "",
      fiscalUnit: readXmlTag(product, "uCom") || "",
      quantity: readXmlTag(product, "qCom") || "0",
      unitPrice: readXmlTag(product, "vUnCom") || "0",
      total: readXmlTag(product, "vProd") || "0",
      taxableUnit: readXmlTag(product, "uTrib") || "",
      taxableQuantity: readXmlTag(product, "qTrib") || "",
      taxableUnitPrice: readXmlTag(product, "vUnTrib") || "",
      freight: readXmlTag(product, "vFrete") || "0",
      insurance: readXmlTag(product, "vSeg") || "0",
      otherExpenses: readXmlTag(product, "vOutro") || "0",
      discount: readXmlTag(product, "vDesc") || "0",
      taxOrigin: readXmlTag(icmsDetails, "orig") || "",
      taxSituation: readXmlTag(icmsDetails, "CST") || readXmlTag(icmsDetails, "CSOSN") || "",
      isTotalized: readXmlTag(det, "indTot") === "1"
    };
  });
  const payments = readXmlBlocks(documentInfo, "detPag").map((payment) => ({
    type: readXmlTag(payment, "tPag") || "",
    amount: readXmlTag(payment, "vPag") || "0",
    description: readXmlTag(payment, "xPag") || "",
    cardBrand: readXmlTag(payment, "tBand") || ""
  }));
  const installments = readXmlBlocks(documentInfo, "dup").map((installment, index) => ({
    number: readXmlTag(installment, "nDup") || String(index + 1),
    dueDate: readXmlTag(installment, "dVenc") || null,
    amount: readXmlTag(installment, "vDup") || "0"
  }));
  return {
    accessKey,
    model: Number(readXmlTag(ide, "mod") || accessKey.slice(20, 22)),
    issuerDocument: onlyDigits(readXmlTag(issuer, "CNPJ") || ""),
    issuer: {
      legalName: readXmlTag(issuer, "xNome") || "",
      tradeName: readXmlTag(issuer, "xFant") || "",
      stateRegistration: readXmlTag(issuer, "IE") || "",
      address: {
        street: readXmlTag(issuerAddress, "xLgr") || "",
        number: readXmlTag(issuerAddress, "nro") || "",
        complement: readXmlTag(issuerAddress, "xCpl") || "",
        neighborhood: readXmlTag(issuerAddress, "xBairro") || "",
        city: readXmlTag(issuerAddress, "xMun") || "",
        state: readXmlTag(issuerAddress, "UF") || "",
        postalCode: onlyDigits(readXmlTag(issuerAddress, "CEP") || "")
      }
    },
    series: readXmlTag(ide, "serie") || "",
    number: readXmlTag(ide, "nNF") || "",
    operationNature: readXmlTag(ide, "natOp") || "",
    issuedAt,
    total: readXmlTag(totals, "vNF") || null,
    status: readXmlTag(protocol, "cStat") || null,
    protocol: readXmlTag(protocol, "nProt") || "",
    items,
    payments,
    installments
  };
};

const fixed = (value, length) => String(value).padStart(length, "0");

const normalizeSeries = (value) => String(Number.parseInt(String(value), 10) || 0);

const normalizePaymentName = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleUpperCase("pt-BR");

export const fiscalPaymentTypeCode = (name) => {
  const normalizedName = normalizePaymentName(name);
  if (normalizedName === "PIX" || normalizedName === "QR CODE") return "17";
  if (normalizedName.includes("CARTAO") && normalizedName.includes("CREDITO")) return "03";
  if (normalizedName.includes("CARTAO") && normalizedName.includes("DEBITO")) return "04";
  if (normalizedName === "CHEQUE") return "02";
  if (normalizedName === "VALE") return "05";
  if (normalizedName === "BOLETO") return "15";
  if (normalizedName === "DINHEIRO") return "01";
  return "99";
};

const createHomologationTestNumber = () => {
  const number = Number(String(Date.now()).slice(-9));
  return number > 0 ? number : 1;
};

export const formatNfeDateTime = (date = new Date(), offsetMinutes = -180) => {
  const shifted = new Date(date.getTime() + offsetMinutes * 60 * 1000);
  const parts = [
    shifted.getUTCFullYear(),
    fixed(shifted.getUTCMonth() + 1, 2),
    fixed(shifted.getUTCDate(), 2)
  ];
  const time = [
    fixed(shifted.getUTCHours(), 2),
    fixed(shifted.getUTCMinutes(), 2),
    fixed(shifted.getUTCSeconds(), 2)
  ].join(":");
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absoluteOffset = Math.abs(offsetMinutes);
  return `${parts.join("-")}T${time}${sign}${fixed(Math.floor(absoluteOffset / 60), 2)}:${fixed(absoluteOffset % 60, 2)}`;
};

const modulo11 = (value) => {
  let weight = 2;
  let total = 0;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    total += Number(value[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = total % 11;
  return remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
};

export const parseFiscalAccessKey = (accessKey) => {
  const normalizedKey = onlyDigits(accessKey);
  if (!/^\d{44}$/.test(normalizedKey)) {
    throw new FiscalQueryError("A chave de acesso deve conter 44 dígitos.");
  }
  if (normalizedKey.slice(0, 2) !== "31") {
    throw new FiscalQueryError("A consulta inicial atende somente documentos emitidos em Minas Gerais (MG).");
  }
  const model = normalizedKey.slice(20, 22);
  if (!["55", "65"].includes(model)) {
    throw new FiscalQueryError("A chave informada não corresponde a NF-e ou NFC-e.");
  }
  if (modulo11(normalizedKey.slice(0, -1)) !== Number(normalizedKey.slice(-1))) {
    throw new FiscalQueryError("A chave de acesso possui dígito verificador inválido.");
  }
  return { accessKey: normalizedKey, model: Number(model) };
};

const buildAccessKey = ({ document, series, number }) => {
  const cnpj = onlyDigits(document);
  if (cnpj.length !== 14) throw new Error("O CNPJ da empresa deve conter 14 dígitos.");
  const now = new Date();
  const aamm = `${String(now.getFullYear()).slice(-2)}${fixed(now.getMonth() + 1, 2)}`;
  const base = [
    "31",
    aamm,
    cnpj,
    "65",
    fixed(series, 3),
    fixed(number, 9),
    "1",
    fixed(Number.parseInt(String(number).slice(-8), 10) || 1, 8)
  ].join("");
  return `${base}${modulo11(base)}`;
};

const getOpenSslPath = () => {
  const configured = String(process.env.PDV_OPENSSL_PATH || "").trim();
  const candidates = [
    configured,
    "C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe",
    "C:\\Program Files\\OpenSSL\\bin\\openssl.exe",
    "C:\\Program Files\\Git\\ucrt64\\bin\\openssl.exe",
    "C:\\Program Files\\Git\\usr\\bin\\openssl.exe",
    "openssl"
  ].filter(Boolean);
  return candidates.find((candidate) => candidate === "openssl" || existsSync(candidate)) || "openssl";
};

const extractCertificatePart = (certificateData, password, argumentsList, expectedMarker, label) => {
  const opensslPath = getOpenSslPath();
  const result = spawnSync(
    opensslPath,
    ["pkcs12", "-in", "-", "-passin", "env:PDV_PKCS12_PASSWORD", ...argumentsList],
    {
      input: Buffer.from(String(certificateData), "base64"),
      encoding: "utf8",
      env: { ...process.env, PDV_PKCS12_PASSWORD: String(password) },
      windowsHide: true,
      windowsVerbatimArguments: false
    }
  );
  if (result.error?.code === "ENOENT") {
    throw new Error("OpenSSL não está instalado ou não está acessível pelo serviço PDV-API.");
  }
  if (result.error?.code === "EACCES" || result.error?.code === "EPERM") {
    throw new Error("O serviço PDV-API não tem permissão para executar o OpenSSL.");
  }
  if (result.status !== 0 || !String(result.stdout).includes(expectedMarker)) {
    const stderr = String(result.stderr || "").toLowerCase();
    if (stderr.includes("mac verify error") || stderr.includes("invalid password")) {
      throw new Error("A senha do certificado A1 está incorreta.");
    }
    if (stderr.includes("unable to load") || stderr.includes("not a pkcs12")) {
      throw new Error(`O arquivo do certificado A1 é inválido ou não pôde ser lido (${label}).`);
    }
    throw new Error(`Não foi possível extrair ${label} do certificado A1.`);
  }
  return String(result.stdout);
};

const getPrivateKey = (certificateData, password) => {
  const privateKeyPem = extractCertificatePart(
    certificateData,
    password,
    ["-nocerts", "-nodes"],
    "PRIVATE KEY",
    "a chave privada"
  );
  return createPrivateKey(privateKeyPem);
};

const getCertificatePem = (certificateData, password) => {
  return extractCertificatePart(
    certificateData,
    password,
    ["-clcerts", "-nokeys"],
    "BEGIN CERTIFICATE",
    "o certificado público"
  );
};

const signNfe = (xml, privateKey, publicCert) => {
  const signature = new SignedXml({ privateKey, publicCert });
  signature.addReference({
    xpath: "//*[local-name(.)='infNFe']",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      XML_C14N_NS
    ],
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1"
  });
  signature.canonicalizationAlgorithm = XML_C14N_NS;
  signature.signatureAlgorithm = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
  signature.computeSignature(`<NFe xmlns="${NFE_NS}">${xml}</NFe>`, {
    location: { reference: "//*[local-name(.)='infNFe']", action: "after" }
  });
  return signature.getSignedXml();
};

const buildNfeXml = ({ company, product, operation, number, accessKey }) => {
  const document = onlyDigits(company.documentCompany);
  const municipalityCode = onlyDigits(company.municipalityCodeCompany);
  if (!/^\d{7}$/.test(municipalityCode)) {
    throw new Error("Informe o código IBGE de sete dígitos do município da empresa.");
  }
  const price = Number(product.priceProduct);
  const quantity = "1.000";
  const total = price.toFixed(2);
  const ncm = onlyDigits(product.ncmProduct);
  const cfop = onlyDigits(operation?.cfopFiscalOperation || "5102") || "5102";
  const cst = String(operation?.taxSituationFiscalOperation || "102").replace(/\D/g, "") || "102";
  const origin = String(operation?.originFiscalOperation || "0").replace(/\D/g, "").slice(0, 1) || "0";
  const tp = cst.length === 3 ? `<CSOSN>${cst}</CSOSN>` : `<CST>${fixed(cst, 2)}</CST>`;
  const infNfe = `
<infNFe xmlns="${NFE_NS}" Id="NFe${accessKey}" versao="4.00">
  <ide>
    <cUF>31</cUF>
    <cNF>${accessKey.slice(-9, -1)}</cNF>
    <natOp>${escapeXml(operation?.operationNatureFiscalOperation || "Venda de mercadoria")}</natOp>
    <mod>65</mod>
    <serie>${normalizeSeries(company.nfceSeriesCompany)}</serie>
    <nNF>${number}</nNF>
    <dhEmi>${formatNfeDateTime()}</dhEmi>
    <tpNF>1</tpNF>
    <idDest>1</idDest>
    <cMunFG>${municipalityCode}</cMunFG>
    <tpImp>4</tpImp>
    <tpEmis>1</tpEmis>
    <cDV>${accessKey.slice(-1)}</cDV>
    <tpAmb>2</tpAmb>
    <finNFe>1</finNFe>
    <indFinal>1</indFinal>
    <indPres>1</indPres>
    <procEmi>0</procEmi>
    <verProc>PDV-HML-TESTE</verProc>
  </ide>
  <emit>
    <CNPJ>${document}</CNPJ>
    <xNome>${escapeXml(company.corporateNameCompany || company.tradeNameCompany)}</xNome>
    <xFant>${escapeXml(company.tradeNameCompany || company.corporateNameCompany)}</xFant>
    <enderEmit>
      <xLgr>${escapeXml(company.addressCompany)}</xLgr>
      <nro>${escapeXml(company.addressNumberCompany || "S/N")}</nro>
      <xBairro>${escapeXml(company.neighborhoodCompany || "Centro")}</xBairro>
      <cMun>${municipalityCode}</cMun>
      <xMun>${escapeXml(company.cityCompany)}</xMun>
      <UF>MG</UF>
      <CEP>${onlyDigits(company.zipCodeCompany)}</CEP>
      <cPais>1058</cPais>
      <xPais>Brasil</xPais>
    </enderEmit>
    ${company.stateRegistrationCompany ? `<IE>${onlyDigits(company.stateRegistrationCompany)}</IE>` : ""}
    <CRT>1</CRT>
  </emit>
  <det nItem="1">
    <prod>
      <cProd>${escapeXml(product.skuProduct)}</cProd>
      <cEAN>SEM GTIN</cEAN>
      <xProd>${escapeXml(product.nameProduct)}</xProd>
      <NCM>${ncm}</NCM>
      <CFOP>${cfop}</CFOP>
      <uCom>UN</uCom>
      <qCom>${quantity}</qCom>
      <vUnCom>${total}</vUnCom>
      <vProd>${total}</vProd>
      <cEANTrib>SEM GTIN</cEANTrib>
      <uTrib>UN</uTrib>
      <qTrib>${quantity}</qTrib>
      <vUnTrib>${total}</vUnTrib>
      <indTot>1</indTot>
    </prod>
    <imposto>
      <vTotTrib>0.00</vTotTrib>
      <ICMS><ICMSSN102><orig>${origin}</orig>${tp}</ICMSSN102></ICMS>
      <PIS><PISNT><CST>07</CST></PISNT></PIS>
      <COFINS><COFINSNT><CST>07</CST></COFINSNT></COFINS>
    </imposto>
  </det>
  <total>
    <ICMSTot>
      <vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson>
      <vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST>
      <vFCPSTRet>0.00</vFCPSTRet><vProd>${total}</vProd><vFrete>0.00</vFrete>
      <vSeg>0.00</vSeg><vDesc>0.00</vDesc><vII>0.00</vII><vIPI>0.00</vIPI>
      <vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS>
      <vOutro>0.00</vOutro><vNF>${total}</vNF>
    </ICMSTot>
  </total>
  <transp><modFrete>9</modFrete></transp>
  <pag><detPag><tPag>01</tPag><vPag>${total}</vPag></detPag></pag>
  <infAdic><infCpl>NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL. TESTE DO PDV.</infCpl></infAdic>
</infNFe>`.replace(/^\s+/gm, "").trim();
  return { xml: infNfe, total };
};

export const buildSaleNfeXml = ({ company, items, sale, payments, operation, number, accessKey }) => {
  const document = onlyDigits(company.documentCompany);
  const municipalityCode = onlyDigits(company.municipalityCodeCompany);
  if (!/^\d{7}$/.test(municipalityCode)) {
    throw new Error("Informe o código IBGE de sete dígitos do município da empresa.");
  }
  const cfop = onlyDigits(operation?.cfopFiscalOperation || "5102") || "5102";
  const cst = String(operation?.taxSituationFiscalOperation || "102").replace(/\D/g, "") || "102";
  const origin = String(operation?.originFiscalOperation || "0").replace(/\D/g, "").slice(0, 1) || "0";
  const tp = cst.length === 3 ? `<CSOSN>${cst}</CSOSN>` : `<CST>${fixed(cst, 2)}</CST>`;
  const itemXml = items.map((item, index) => {
    const quantity = Number(item.quantitySaleItem).toFixed(3);
    const unitPrice = Number(item.unitPriceSaleItem).toFixed(2);
    const total = Number(item.lineTotalSaleItem).toFixed(2);
    const ncm = onlyDigits(item.ncmProduct);
    if (!/^\d{8}$/.test(ncm)) {
      throw new Error(`O produto "${item.productNameSaleItem}" precisa de NCM com oito dígitos.`);
    }
    return `
<det nItem="${index + 1}">
  <prod>
    <cProd>${escapeXml(item.skuProduct || item.idProduct)}</cProd>
    <cEAN>SEM GTIN</cEAN>
    <xProd>${escapeXml(index === 0 ? HOMOLOGATION_PRODUCT_DESCRIPTION : item.productNameSaleItem)}</xProd>
    <NCM>${ncm}</NCM>
    <CFOP>${cfop}</CFOP>
    <uCom>UN</uCom>
    <qCom>${quantity}</qCom>
    <vUnCom>${unitPrice}</vUnCom>
    <vProd>${total}</vProd>
    <cEANTrib>SEM GTIN</cEANTrib>
    <uTrib>UN</uTrib>
    <qTrib>${quantity}</qTrib>
    <vUnTrib>${unitPrice}</vUnTrib>
    <indTot>1</indTot>
  </prod>
  <imposto>
    <vTotTrib>0.00</vTotTrib>
    <ICMS><ICMSSN102><orig>${origin}</orig>${tp}</ICMSSN102></ICMS>
    <PIS><PISNT><CST>07</CST></PISNT></PIS>
    <COFINS><COFINSNT><CST>07</CST></COFINSNT></COFINS>
  </imposto>
</det>`;
  }).join("");
  const paymentXml = payments.map((payment) =>
    `<detPag><tPag>${fiscalPaymentTypeCode(payment.namePaymentMethod)}</tPag><vPag>${(Number(payment.amountSalePayment) / 100).toFixed(2)}</vPag></detPag>`
  ).join("");
  const total = Number(sale.totalSale).toFixed(2);
  const subtotal = Number(sale.subtotalSale).toFixed(2);
  const discount = Number(sale.discountSale).toFixed(2);
  return `
<infNFe xmlns="${NFE_NS}" Id="NFe${accessKey}" versao="4.00">
  <ide>
    <cUF>31</cUF><cNF>${accessKey.slice(-9, -1)}</cNF>
    <natOp>${escapeXml(operation?.operationNatureFiscalOperation || "Venda de mercadoria")}</natOp>
    <mod>65</mod><serie>${normalizeSeries(company.nfceSeriesCompany)}</serie><nNF>${number}</nNF>
    <dhEmi>${formatNfeDateTime()}</dhEmi><tpNF>1</tpNF><idDest>1</idDest><cMunFG>${municipalityCode}</cMunFG>
    <tpImp>4</tpImp><tpEmis>1</tpEmis><cDV>${accessKey.slice(-1)}</cDV><tpAmb>2</tpAmb>
    <finNFe>1</finNFe><indFinal>1</indFinal><indPres>1</indPres><procEmi>0</procEmi><verProc>PDV-HML</verProc>
  </ide>
  <emit>
    <CNPJ>${document}</CNPJ><xNome>${escapeXml(company.corporateNameCompany || company.tradeNameCompany)}</xNome>
    <xFant>${escapeXml(company.tradeNameCompany || company.corporateNameCompany)}</xFant>
    <enderEmit><xLgr>${escapeXml(company.addressCompany)}</xLgr><nro>${escapeXml(company.addressNumberCompany || "S/N")}</nro>
      <xBairro>${escapeXml(company.neighborhoodCompany || "Centro")}</xBairro><cMun>${municipalityCode}</cMun>
      <xMun>${escapeXml(company.cityCompany)}</xMun><UF>MG</UF><CEP>${onlyDigits(company.zipCodeCompany)}</CEP>
      <cPais>1058</cPais><xPais>Brasil</xPais></enderEmit>
    ${company.stateRegistrationCompany ? `<IE>${onlyDigits(company.stateRegistrationCompany)}</IE>` : ""}<CRT>1</CRT>
  </emit>${itemXml}
  <total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson>
    <vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet>
    <vProd>${subtotal}</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>${discount}</vDesc><vII>0.00</vII>
    <vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS>
    <vOutro>0.00</vOutro><vNF>${total}</vNF></ICMSTot></total>
  <transp><modFrete>9</modFrete></transp><pag>${paymentXml}</pag>
  <infAdic><infCpl>NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL.</infCpl></infAdic>
</infNFe>`.replace(/^\s+/gm, "").trim();
};

const requestAuthorization = ({ xml, qrCode, qrCodeUrl, pfx, password }) =>
  new Promise((resolve, reject) => {
    const body = `<soap12:Envelope xmlns:soap12="${SOAP_NS}">
  <soap12:Header>
    <nfeCabecMsg xmlns="${AUTHORIZATION_WSDL_NS}" versao="4.00"><cUF>31</cUF><versaoDados>4.00</versaoDados></nfeCabecMsg>
  </soap12:Header>
  <soap12:Body><nfeDadosMsg xmlns="${AUTHORIZATION_WSDL_NS}"><enviNFe xmlns="${NFE_NS}" versao="4.00"><idLote>${Date.now()}</idLote><indSinc>1</indSinc>${xml}</enviNFe></nfeDadosMsg></soap12:Body>
</soap12:Envelope>`;
    const url = new URL(HOMOLOGATION_URL);
    const request = httpsRequest({
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      pfx,
      passphrase: password,
      rejectUnauthorized: true,
      headers: {
        "Content-Type": "application/soap+xml; charset=utf-8",
        SOAPAction: `"${AUTHORIZATION_WSDL_NS}/nfeAutorizacaoLote"`,
        "Content-Length": Buffer.byteLength(body)
      },
      timeout: 30000
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const content = Buffer.concat(chunks).toString("utf8");
        const protocolInfo = readXmlBlock(content, "infProt");
        const cStat = readXmlTag(protocolInfo, "cStat") || readXmlTag(content, "cStat");
        const xMotivo = readXmlTag(protocolInfo, "xMotivo") || readXmlTag(content, "xMotivo")
          || readXmlTag(content, "faultstring")
          || readXmlTag(content, "Text")
          || readXmlTag(content, "Reason")
          || `A SEF/MG respondeu HTTP ${response.statusCode || 0} sem mensagem fiscal.`;
        resolve({
          httpStatus: response.statusCode || 0,
          cStat: cStat && /^\d+$/.test(cStat) ? cStat : null,
          xMotivo,
          protocol: readXmlTag(protocolInfo, "nProt") || readXmlTag(content, "nProt"),
          accessKey: readXmlTag(protocolInfo, "chNFe") || readXmlTag(content, "chNFe")
        });
      });
    });
    request.on("timeout", () => request.destroy(new Error("Tempo esgotado ao acessar a SEF/MG.")));
    request.on("error", reject);
    request.end(body);
  });

const requestNfeQuery = ({ accessKey, pfx, password, queryUrl, environment }) =>
        new Promise((resolve, reject) => {
          const url = new URL(queryUrl);
          const body = `<soap12:Envelope xmlns:soap12="${SOAP_NS}">
        <soap12:Header>
          <nfeCabecMsg xmlns="${QUERY_WSDL_NS}" versao="4.00"><cUF>31</cUF><versaoDados>4.00</versaoDados></nfeCabecMsg>
        </soap12:Header>
        <soap12:Body><nfeDadosMsg xmlns="${QUERY_WSDL_NS}"><consSitNFe xmlns="${NFE_NS}" versao="4.00"><tpAmb>${environment === "production" ? "1" : "2"}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${accessKey}</chNFe></consSitNFe></nfeDadosMsg></soap12:Body>
</soap12:Envelope>`;
          const request = httpsRequest({
            hostname: url.hostname,
            path: `${url.pathname}${url.search}`,
            method: "POST",
            pfx,
            passphrase: password,
            rejectUnauthorized: true,
            headers: {
              "Content-Type": "application/soap+xml; charset=utf-8",
              SOAPAction: `"${QUERY_WSDL_NS}/nfeConsultaNF"`,
              "Content-Length": Buffer.byteLength(body)
            },
            timeout: 30000
          }, (response) => {
            const chunks = [];
            response.on("data", (chunk) => chunks.push(chunk));
            response.on("end", () => {
              const content = Buffer.concat(chunks).toString("utf8");
              const protocolInfo = readXmlBlock(content, "infProt");
              const documentInfo = readXmlBlock(content, "infNFe");
              const issuer = readXmlBlock(documentInfo || content, "emit");
              const totals = readXmlBlock(documentInfo || content, "ICMSTot");
              const ide = readXmlBlock(documentInfo || content, "ide");
              const cStat = readXmlTag(protocolInfo, "cStat") || readXmlTag(content, "cStat");
              const xMotivo = readXmlTag(protocolInfo, "xMotivo") || readXmlTag(content, "xMotivo")
                || readXmlTag(content, "faultstring")
                || readXmlTag(content, "Text")
                || readXmlTag(content, "Reason")
                || `A SEF/MG respondeu HTTP ${response.statusCode || 0} sem mensagem fiscal.`;
              const issuedAt = readXmlTag(ide, "dhEmi")
                || (readXmlTag(ide, "dEmi")
                  ? `${readXmlTag(ide, "dEmi")}T${readXmlTag(ide, "hEmi") || "00:00:00"}-03:00`
                  : null);
              resolve({
                httpStatus: response.statusCode || 0,
                cStat: cStat && /^\d+$/.test(cStat) ? cStat : null,
                xMotivo,
                accessKey: readXmlTag(protocolInfo, "chNFe") || readXmlTag(content, "chNFe") || accessKey,
                issuerDocument: onlyDigits(readXmlTag(issuer, "CNPJ") || ""),
                issuedAt,
                total: readXmlTag(totals, "vNF") || null
              });
            });
          });
          request.on("timeout", () => request.destroy(new Error("Tempo esgotado ao consultar a SEF/MG.")));
          request.on("error", reject);
          request.end(body);
        });

const requestNfeDistribution = ({ accessKey, cnpj, pfx, password, distributionUrl, environment }) =>
  new Promise((resolve, reject) => {
    const url = new URL(distributionUrl);
    const body = `<soap12:Envelope xmlns:soap12="${SOAP_NS}">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt xmlns="${NFE_NS}" versao="1.01">
          <tpAmb>${environment === "production" ? "1" : "2"}</tpAmb>
          <cUFAutor>31</cUFAutor>
          <CNPJ>${cnpj}</CNPJ>
          <consChNFe><chNFe>${accessKey}</chNFe></consChNFe>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;
    const request = httpsRequest({
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      pfx,
      passphrase: password,
      rejectUnauthorized: true,
      headers: {
        "Content-Type": "application/soap+xml; charset=utf-8",
        SOAPAction: '"http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse"',
        "Content-Length": Buffer.byteLength(body)
      },
      timeout: 30000
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const content = Buffer.concat(chunks).toString("utf8");
        const cStat = readXmlTag(content, "cStat");
        const xMotivo = readXmlTag(content, "xMotivo")
          || readXmlTag(content, "faultstring")
          || readXmlTag(content, "Text")
          || `A SEFAZ respondeu HTTP ${response.statusCode || 0} sem mensagem fiscal.`;
        const documentZip = readXmlTag(content, "docZip");
        resolve({
          httpStatus: response.statusCode || 0,
          cStat: cStat && /^\d+$/.test(cStat) ? cStat : null,
          xMotivo,
          documentXml: decodeDistributionDocument(documentZip)
        });
      });
    });
    request.on("timeout", () => request.destroy(new Error("Tempo esgotado ao obter o XML da SEFAZ.")));
    request.on("error", reject);
    request.end(body);
  });

export async function queryNfeByAccessKey({
        accessKey,
        environment,
        certificateData,
        certificatePassword,
        certificateCnpj = "",
        queryMode = "automatic",
        manualModel = "",
        queryUrls = {},
        preferredEnvironment = "production",
        distributionUrls = {},
        requestQuery = requestNfeQuery,
        requestDistribution = requestNfeDistribution
}) {
        const normalizedKey = onlyDigits(accessKey);
        if (!/^\d{44}$/.test(normalizedKey)) throw new FiscalQueryError("A chave de acesso deve conter 44 dígitos.");
        if (!["automatic", "homologation", "production"].includes(environment)) {
          throw new FiscalQueryError("Ambiente fiscal inválido.");
        }
        if (normalizedKey.slice(0, 2) !== "31") {
          throw new FiscalQueryError("A consulta inicial atende somente documentos emitidos em Minas Gerais (MG).");
        }
        const model = normalizedKey.slice(20, 22);
        if (!["55", "65"].includes(model)) throw new FiscalQueryError("A chave informada não corresponde a NF-e ou NFC-e.");
        if (!["automatic", "manual"].includes(queryMode)) {
          throw new FiscalQueryError("Modo de consulta fiscal inválido.");
        }
        if (queryMode === "manual" && !["55", "65"].includes(String(manualModel))) {
          throw new FiscalQueryError("Selecione manualmente o modelo 55 ou 65.");
        }
        if (queryMode === "manual" && model !== String(manualModel)) {
          throw new FiscalQueryError(`A chave informada é do modelo ${model}, mas a consulta manual selecionou o modelo ${manualModel}.`);
        }
        if (modulo11(normalizedKey.slice(0, -1)) !== Number(normalizedKey.slice(-1))) {
          throw new FiscalQueryError("A chave de acesso possui dígito verificador inválido.");
        }
        const pfx = Buffer.from(String(certificateData), "base64");
        if (!pfx.length || !certificatePassword) {
          throw new FiscalQueryError("Configure o certificado A1 e a senha antes de consultar a SEFAZ.", 409);
        }
        let result = null;
        for (const queryEnvironment of resolveFiscalQueryEnvironments(environment, preferredEnvironment)) {
          try {
            result = await requestQuery({
              accessKey: normalizedKey,
              pfx,
              password: certificatePassword,
              queryUrl: resolveFiscalQueryUrl(Number(model), queryEnvironment, queryUrls),
              environment: queryEnvironment
            });
          } catch (error) {
            const code = String(error?.code || "").trim();
            throw new FiscalQueryError(
              `Não foi possível acessar a SEFAZ${code ? ` (${code})` : ""}. Verifique o certificado, o ambiente fiscal e a conexão da API.`,
              503
            );
          }
          if (["100", "150"].includes(result.cStat)) break;
          if (environment !== "automatic" || !isFiscalDocumentNotFound(result)) break;
        }
        if (!["100", "150"].includes(result.cStat)) {
          throw new FiscalQueryError(`A SEFAZ não confirmou a nota: ${result.xMotivo}`);
        }
        if (!result.issuerDocument || !result.issuedAt || !result.total) {
          const distributionCnpj = onlyDigits(certificateCnpj);
          if (!/^\d{14}$/.test(distributionCnpj)) {
            throw new FiscalQueryError("O CNPJ da empresa associado ao certificado A1 não está configurado.", 409);
          }
          if (model === "65"
            && distributionCnpj.slice(0, 8) !== normalizedKey.slice(6, 14)) {
            throw new FiscalQueryError(
              "A SEFAZ confirmou a NFC-e, mas o certificado A1 não pertence ao CNPJ-base do emitente. O XML completo dessa NFC-e deve ser consultado pelo portal manual ou com o certificado do emitente.",
              422
            );
          }
          const distributionEnvironment = environment === "automatic"
            ? preferredEnvironment
            : environment;
          let distributionResult;
          try {
            distributionResult = await requestDistribution({
              accessKey: normalizedKey,
              cnpj: distributionCnpj,
              pfx,
              password: certificatePassword,
              distributionUrl: String(
                distributionUrls[distributionEnvironment]
                || DEFAULT_FISCAL_DISTRIBUTION_URLS[distributionEnvironment]
              ),
              environment: distributionEnvironment
            });
          } catch (error) {
            const code = String(error?.code || "").trim();
            throw new FiscalQueryError(
              `Não foi possível obter o XML da SEFAZ${code ? ` (${code})` : ""}. Verifique o certificado e a conexão da API.`,
              503
            );
          }
          if (!["138", "139"].includes(distributionResult.cStat) || !distributionResult.documentXml) {
            throw new FiscalQueryError(`A SEFAZ confirmou a chave, mas não disponibilizou o XML completo: ${distributionResult.xMotivo}`, 502);
          }
          result = {
            ...result,
            ...readCompleteFiscalDocument(distributionResult.documentXml, normalizedKey)
          };
        }
        const issuedAtDate = new Date(result.issuedAt);
        const total = Number(result.total);
        if (Number.isNaN(issuedAtDate.getTime()) || !Number.isFinite(total) || total < 0 || !/^\d{14}$/.test(result.issuerDocument)) {
          throw new FiscalQueryError("A SEFAZ retornou dados incompletos para a nota.", 502);
        }
        return {
          accessKey: normalizedKey,
          model: Number(model),
          issuerDocument: result.issuerDocument,
          issuedAt: issuedAtDate,
          total
        };
}

export async function buildNfceDiagnostic({
  company,
  product,
  operation,
  certificateData,
  certificatePassword
}) {
  if (company.nfceEnvironmentCompany !== "homologation") {
    throw new Error("O diagnóstico só pode ser executado no ambiente de homologação.");
  }
  if (company.nfceCertificateTypeCompany !== "A1") {
    throw new Error("O diagnóstico exige certificado A1 em arquivo.");
  }
  if (!company.nfceHomologationCscCompany || !company.nfceHomologationTokenCompany) {
    throw new Error("Informe o CSC e o ID Token de homologação antes do teste.");
  }
  if (!product?.ncmProduct || !/^\d{8}$/.test(onlyDigits(product.ncmProduct))) {
    throw new Error("Cadastre um produto ativo com NCM de oito dígitos para o teste.");
  }
  const pfx = Buffer.from(String(certificateData), "base64");
  const privateKey = getPrivateKey(certificateData, certificatePassword);
  const publicCert = getCertificatePem(certificateData, certificatePassword);
  const number = createHomologationTestNumber();
  const accessKey = buildAccessKey({ document: company.documentCompany, series: company.nfceSeriesCompany, number });
  const testProduct = {
    ...product,
    nameProduct: HOMOLOGATION_PRODUCT_DESCRIPTION
  };
  const { xml, total } = buildNfeXml({
    company,
    product: testProduct,
    operation,
    number,
    accessKey
  });
  const signedXml = signNfe(xml, privateKey, publicCert);
  const token = String(company.nfceHomologationTokenCompany)
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "") || "0";
  const qrHash = createHash("sha1")
    .update(`${accessKey}|2|${token}|${company.nfceHomologationCscCompany}`, "utf8")
    .digest("hex");
  const qrCodeUrl = `https://hportalsped.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml?p=${accessKey}|2|2|${token}|${qrHash}`;
  const keyLookupUrl = "https://hportalsped.fazenda.mg.gov.br/portalnfce";
  const qrCode = qrCodeUrl;
  const supplementalXml = `<infNFeSupl><qrCode><![CDATA[${qrCode}]]></qrCode><urlChave>${escapeXml(keyLookupUrl)}</urlChave></infNFeSupl>`;
  const signedXmlWithQr = signedXml.replace("<Signature", `${supplementalXml}<Signature`);
  return {
    xml: signedXmlWithQr,
    qrCode,
    timestamp: readXmlTag(signedXmlWithQr, "dhEmi"),
    accessKey,
    number,
    total,
    product: testProduct.nameProduct
  };
}

export async function runNfceHomologationTest({
  company,
  product,
  operation,
  certificateData,
  certificatePassword
}) {
  const diagnostic = await buildNfceDiagnostic({
    company,
    product,
    operation,
    certificateData,
    certificatePassword
  });
  const result = await requestAuthorization({
    xml: diagnostic.xml,
    qrCode: diagnostic.qrCode,
    qrCodeUrl: diagnostic.qrCode,
    pfx: Buffer.from(String(certificateData), "base64"),
    password: certificatePassword
  });
  return {
    environment: "homologation",
    status: result.cStat === "100" ? "authorized" : result.cStat ? "rejected" : "unknown",
    cStat: result.cStat,
    message: result.xMotivo,
    protocol: result.protocol,
    accessKey: result.accessKey || diagnostic.accessKey,
    number: diagnostic.number,
    total: diagnostic.total,
    product: diagnostic.product
  };
}

export async function authorizeSaleNfce({
  company,
  items,
  sale,
  payments,
  operation,
  fiscalDocument,
  certificateData,
  certificatePassword
}) {
  if (company.nfceEnvironmentCompany !== "homologation") {
    throw new Error("A emissão integrada só está habilitada em homologação.");
  }
  if (company.nfceCertificateTypeCompany !== "A1"
    || !certificateData || !certificatePassword
    || !company.nfceHomologationCscCompany || !company.nfceHomologationTokenCompany) {
    throw new Error("Configure certificado A1, senha, CSC e token de homologação.");
  }
  const accessKey = buildAccessKey({
    document: company.documentCompany,
    series: fiscalDocument.series,
    number: fiscalDocument.number
  });
  const privateKey = getPrivateKey(certificateData, certificatePassword);
  const publicCert = getCertificatePem(certificateData, certificatePassword);
  const xml = buildSaleNfeXml({
    company,
    items,
    sale,
    payments,
    operation,
    number: fiscalDocument.number,
    accessKey
  });
  const signedXml = signNfe(xml, privateKey, publicCert);
  const token = String(company.nfceHomologationTokenCompany)
    .replace(/\D/g, "").replace(/^0+(?=\d)/, "") || "0";
  const qrHash = createHash("sha1")
    .update(`${accessKey}|2|${token}|${company.nfceHomologationCscCompany}`, "utf8")
    .digest("hex");
  const qrCode = `https://hportalsped.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml?p=${accessKey}|2|2|${token}|${qrHash}`;
  const signedXmlWithQr = signedXml.replace(
    "<Signature",
    `<infNFeSupl><qrCode><![CDATA[${qrCode}]]></qrCode><urlChave>https://hportalsped.fazenda.mg.gov.br/portalnfce</urlChave></infNFeSupl><Signature`
  );
  const result = await requestAuthorization({
    xml: signedXmlWithQr,
    qrCode,
    qrCodeUrl: qrCode,
    pfx: Buffer.from(String(certificateData), "base64"),
    password: certificatePassword
  });
  return {
    status: result.cStat === "100" ? "authorized" : result.cStat ? "rejected" : "unknown",
    cStat: result.cStat,
    message: result.xMotivo,
    protocol: result.protocol,
    accessKey: result.accessKey || accessKey,
    xml: signedXmlWithQr
  };
}
