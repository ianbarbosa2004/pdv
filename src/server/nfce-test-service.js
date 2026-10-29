import { createHash, createPrivateKey, randomBytes } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { SignedXml } from "xml-crypto";

const NFE_NS = "http://www.portalfiscal.inf.br/nfe";
const SOAP_NS = "http://www.w3.org/2003/05/soap-envelope";
const DS_NS = "http://www.w3.org/2000/09/xmldsig#";
const XML_C14N_NS = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const AUTHORIZATION_WSDL_NS = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4";
const HOMOLOGATION_URL = "https://hnfce.fazenda.mg.gov.br/nfce/services/NFeAutorizacao4";
const HOMOLOGATION_PRODUCT_DESCRIPTION =
  "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

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

const readXmlBlock = (content, tagName) =>
  String(content).match(
    new RegExp(`<(?:(?:[\\w.-]+):)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:(?:[\\w.-]+):)?${tagName}>`, "i")
  )?.[1] || "";

const onlyDigits = (value) => String(value ?? "").replace(/\D/g, "");

const fixed = (value, length) => String(value).padStart(length, "0");

const normalizeSeries = (value) => String(Number.parseInt(String(value), 10) || 0);

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
  const qrCodeUrl = `https://portalsped.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml?p=${accessKey}|2|2|${token}|${qrHash}`;
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
    status: result.cStat === "100" ? "authorized" : "rejected",
    cStat: result.cStat,
    message: result.xMotivo,
    protocol: result.protocol,
    accessKey: result.accessKey || diagnostic.accessKey,
    number: diagnostic.number,
    total: diagnostic.total,
    product: diagnostic.product
  };
}
