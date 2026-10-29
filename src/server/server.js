import { createServer } from "node:http";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import forge from "node-forge";
import { createPool } from "./database.js";
import { getConfig } from "./config.js";
import { createSale, SaleValidationError } from "./sale-service.js";
import { buildNfceDiagnostic, runNfceHomologationTest } from "./nfce-test-service.js";
import { ensureCoreNavigationSeed, isNavigationKey, normalizeNavigationKey } from "../shared/navigation-defaults.js";
import {
  DEFAULT_CEST_SOURCE_URL,
  DEFAULT_NCM_SOURCE_URL,
  ensureUpdateSchema,
  updateCatalog
} from "./ncm-cest-update.js";

const config = getConfig();
const pool = createPool(config);
let ncmCestUpdateRunning = false;
const apiStartedAt = new Date();

const getCertificateEncryptionKey = () => {
  const configured = config.certificateEncryptionKey;
  if (!configured) throw new Error("PDV_CERTIFICATE_ENCRYPTION_KEY não configurada.");
  const key = Buffer.from(configured, "base64");
  if (key.length !== 32) throw new Error("PDV_CERTIFICATE_ENCRYPTION_KEY deve ser uma chave base64 de 32 bytes.");
  return key;
};

const encryptSecret = (value) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getCertificateEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
};

const decryptSecret = (value) => {
  const encrypted = Buffer.from(String(value), "base64");
  if (encrypted.length <= 28) throw new Error("Dado criptografado inválido.");
  const iv = encrypted.subarray(0, 12);
  const authTag = encrypted.subarray(12, 28);
  const decipher = createDecipheriv("aes-256-gcm", getCertificateEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]).toString("utf8");
};

const formatCertificateDate = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error("A validade do certificado não foi encontrada.");
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeDateValue = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return formatCertificateDate(value);
};

const readCertificateMetadata = (certificateData, password) => {
  try {
    const certificate = readCertificateWithOpenSsl(certificateData, password)
      || readCertificateWithForge(certificateData, password);
    if (!certificate) throw new Error("Nenhum certificado foi encontrado no arquivo.");
    return {
      expires: formatCertificateDate(certificate.validity.notAfter),
      serial: certificate.serialNumber || ""
    };
  } catch {
    throw new SaleValidationError("Não foi possível ler a validade do certificado. Confira o arquivo A1 e a senha.");
  }
};

const readCertificateWithOpenSsl = (certificateData, password) => {
  const result = spawnSync(
    "openssl",
    ["pkcs12", "-in", "-", "-passin", "env:PDV_PKCS12_PASSWORD", "-clcerts", "-nokeys"],
    {
      input: Buffer.from(String(certificateData), "base64"),
      encoding: "utf8",
      env: { ...process.env, PDV_PKCS12_PASSWORD: String(password) },
      windowsHide: true
    }
  );
  if (result.error || result.status !== 0) return null;
  const pem = String(result.stdout).match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);
  return pem ? forge.pki.certificateFromPem(pem[0]) : null;
};

const readCertificateWithForge = (certificateData, password) => {
  const asn1 = forge.asn1.fromDer(forge.util.decode64(String(certificateData)));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, String(password));
  const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certificateBag = (bags[forge.pki.oids.certBag] || []).find((bag) => bag.cert);
  return certificateBag?.cert ? forge.pki.certificateFromAsn1(certificateBag.cert) : null;
};

const json = (response, status, payload) => {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
};

const readJsonBody = async (request) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
  if (size > 5 * 1024 * 1024) throw new SaleValidationError("Corpo da requisição muito grande.", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new SaleValidationError("JSON inválido.");
  }
};

const parsePositiveId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const parseNavigationText = (value, fieldName, maximum, required = true) => {
  if (value === undefined || value === null) {
    if (!required) return null;
    throw new SaleValidationError(`${fieldName} é obrigatório.`);
  }
  const text = String(value).trim();
  if (required && !text) throw new SaleValidationError(`${fieldName} é obrigatório.`);
  if (text.length > maximum) throw new SaleValidationError(`${fieldName} excede o limite permitido.`);
  return text || null;
};

const parseNavigationKey = (value, fieldName) => {
  const key = parseNavigationText(value, fieldName, 80);
  if (!/^[a-z0-9-]+$/.test(key)) throw new SaleValidationError(`${fieldName} deve usar apenas letras minúsculas, números e hífen.`);
  return key;
};

const parseNavigationOrder = (value, fieldName) => {
  const order = Number(value);
  if (!Number.isSafeInteger(order) || order < 1 || order > 65535) {
    throw new SaleValidationError(`${fieldName} inválida.`);
  }
  return order;
};

const parseNavigationBoolean = (value, fieldName, fallback = 1) => {
  if (value === undefined) return fallback;
  return parseBooleanFlag(value, fieldName, fallback === 1);
};

const protectedNavigationMenuKeys = new Set(["tools", "settings"]);

const assertNavigationActivationAllowed = (menuKey, active) => {
  if (!active && protectedNavigationMenuKeys.has(menuKey)) {
    throw new SaleValidationError("Os menus Ferramentas e Configurações e seus itens não podem ser desativados.");
  }
};

const parseNavigationType = (value) => {
  if (!["item", "submenu", "bar"].includes(value)) {
    throw new SaleValidationError("Tipo de item de navegação inválido.");
  }
  return value;
};

const parseMoney = (value, fieldName) => {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(String(value))) {
    throw new SaleValidationError(`${fieldName} inválido.`);
  }
  return String(value);
};

const parseNonNegativeQuantity = (value) => {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(String(value))) {
    throw new SaleValidationError("Estoque inicial inválido.");
  }
  return String(value);
};

const parseBooleanFlag = (value, fieldName, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback ? 1 : 0;
  if (![true, false, 0, 1, "0", "1", "true", "false"].includes(value)) {
    throw new SaleValidationError(`${fieldName} inválido.`);
  }
  return value === true || value === 1 || value === "1" || value === "true" ? 1 : 0;
};

const parseProductQuantity = (value, allowNegativeStock, isFractionalProduct) => {
  const rawValue = String(value).trim().replace(",", ".");
  const normalizedValue = /^-?\d+\.0+$/.test(rawValue)
    ? rawValue.slice(0, rawValue.indexOf("."))
    : rawValue;
  if (/^-?0(?:\.0+)?$/.test(rawValue)) return "0";
  const pattern = isFractionalProduct
    ? allowNegativeStock
      ? /^-?(?:0|[1-9]\d*)(?:\.\d{1,3})?$/
      : /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/
    : allowNegativeStock
      ? /^-[1-9]\d*$|^[1-9]\d*$/
      : /^[1-9]\d*$/;
  if (!pattern.test(normalizedValue)) {
    throw new SaleValidationError(
      isFractionalProduct
        ? "Estoque inicial deve ser um número válido com até três casas decimais."
        : "Estoque inicial deve ser um número inteiro."
    );
  }
  return normalizedValue;
};

const fiscalCatalogDefinitions = {
  "tax-regimes": { label: "Regimes tributários", values: [["Simples Nacional", "Simples Nacional"], ["Regime normal", "Regime normal"], ["MEI", "MEI"]] },
  "operation-types": { label: "Tipos de operação", values: [["entry", "Entrada"], ["exit", "Saída"]] },
  contexts: { label: "Contextos fiscais", values: [["within_state", "Dentro do estado"], ["within_state_cfop", "Dentro do estado CFOP"], ["outside_state", "Fora do estado"], ["outside_state_cfop", "Fora do estado CFOP"], ["foreign", "Fora do país"], ["cfe", "CF-e"], ["coupons", "Cupons emitidos"], ["ibs_cbs", "IBS e CBS"]] },
  origins: { label: "Origens da mercadoria", values: [["0", "0 - Nacional"], ["1", "1 - Estrangeira, importação direta"], ["2", "2 - Estrangeira, mercado interno"], ["3", "3 - Nacional, conteúdo de importação superior a 40%"], ["4", "4 - Nacional, processos produtivos básicos"], ["5", "5 - Nacional, conteúdo de importação até 40%"], ["6", "6 - Estrangeira, importação direta, sem similar nacional"], ["7", "7 - Estrangeira, mercado interno, sem similar nacional"], ["8", "8 - Nacional, conteúdo de importação superior a 70%"]] },
  "tax-situations": { label: "CST / CSOSN", values: [["00", "00 - Tributada integralmente"], ["10", "10 - Tributada com ICMS-ST"], ["20", "20 - Com redução de base de cálculo"], ["30", "30 - Isenta ou não tributada com ICMS-ST"], ["40", "40 - Isenta"], ["41", "41 - Não tributada"], ["50", "50 - Suspensão"], ["51", "51 - Diferimento"], ["60", "60 - ICMS cobrado anteriormente por ST"], ["70", "70 - Redução de base e ICMS-ST"], ["90", "90 - Outras"], ["101", "101 - Simples Nacional com crédito"], ["102", "102 - Simples Nacional sem crédito"], ["103", "103 - Isenção do Simples Nacional"], ["201", "201 - Simples Nacional com crédito e ICMS-ST"], ["202", "202 - Simples Nacional sem crédito e ICMS-ST"], ["203", "203 - Isenção do Simples Nacional e ICMS-ST"], ["300", "300 - Imune"], ["400", "400 - Não tributada pelo Simples Nacional"], ["500", "500 - ICMS cobrado anteriormente por ST"], ["900", "900 - Outros"]] },
  "ipi-situations": { label: "Situações tributárias do IPI", values: [["00", "00 - Entrada com recuperação de crédito"], ["01", "01 - Entrada tributada com alíquota zero"], ["02", "02 - Entrada isenta"], ["03", "03 - Entrada não tributada"], ["04", "04 - Entrada imune"], ["05", "05 - Entrada com suspensão"], ["49", "49 - Outras entradas"], ["50", "50 - Saída tributada"], ["51", "51 - Saída tributada com alíquota zero"], ["52", "52 - Saída isenta"], ["53", "53 - Saída não tributada"], ["54", "54 - Saída imune"], ["55", "55 - Saída com suspensão"], ["99", "99 - Outras saídas"]] },
  "contribution-situations": { label: "Situações tributárias PIS/COFINS", values: [["01", "01 - Operação tributável com alíquota básica"], ["02", "02 - Operação tributável com alíquota diferenciada"], ["03", "03 - Operação tributável por unidade de medida"], ["04", "04 - Operação tributável monofásica"], ["05", "05 - Operação tributável por ST"], ["06", "06 - Operação tributável a alíquota zero"], ["07", "07 - Operação isenta"], ["08", "08 - Sem incidência"], ["09", "09 - Com suspensão"], ["49", "49 - Outras saídas"], ["50", "50 - Com direito a crédito"], ["51", "51 - Alíquota básica"], ["52", "52 - Alíquota diferenciada"], ["53", "53 - Alíquota por unidade de medida"], ["54", "54 - Monofásica"], ["55", "55 - Por substituição tributária"], ["98", "98 - Outras entradas"], ["99", "99 - Outras operações"]] },
  "base-modes": { label: "Modalidades de base de cálculo", values: [["value", "Pauta (valor)"], ["margin", "Margem de valor agregado"], ["price", "Preço tabelado ou máximo sugerido"]] },
  "exemption-reasons": { label: "Motivos de desoneração do ICMS", values: [["1", "1 - Táxi"], ["3", "3 - Produtor agropecuário"], ["4", "4 - Fomentar / Proterra"], ["5", "5 - Aquisição de ativo permanente"], ["6", "6 - Transporte ferroviário"], ["7", "7 - Comunicação"], ["8", "8 - Remessa para exposição ou feira"], ["9", "9 - Remessa para industrialização"], ["10", "10 - Operação com medicamento"], ["11", "11 - Aquisição de bem para produção"], ["12", "12 - Programa de alimentação do trabalhador"], ["16", "16 - Bens destinados à pesquisa"], ["90", "90 - Outros"]] },
  cfops: {
    label: "CFOP",
    values: [
      ["5.101", "Venda de produção do estabelecimento"],
      ["5.102", "Venda de mercadoria adquirida ou recebida de terceiros"],
      ["5.405", "Venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária, na condição de contribuinte substituído"],
      ["6.102", "Venda de mercadoria adquirida ou recebida de terceiros"],
      ["6.403", "Venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária, na condição de contribuinte substituído"]
    ]
  },
  "icms-rates": { label: "Alíquotas de ICMS", values: [["7", "Alíquota interna de 7%", 7], ["12", "Alíquota interna de 12%", 12], ["17", "Alíquota interna de 17%", 17], ["18", "Alíquota interna de 18%", 18], ["25", "Alíquota interna de 25%", 25]] }
};

const fiscalCatalogNames = new Set(Object.keys(fiscalCatalogDefinitions));
const autoCodeCatalogs = new Set(["icms-rates", "tax-regimes", "base-modes", "contexts"]);
const autoCodeReferences = {
  "tax-regimes": ["taxRegimeFiscalOperation"],
  "base-modes": ["icmsBaseModeFiscalOperation", "icmsStBaseModeFiscalOperation"],
  contexts: ["contextFiscalOperation"]
};
const slugCodeCatalogs = new Set(["operation-types"]);

const slugifyCatalogDescription = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);

const normalizeCfopCode = (value) => {
  const digits = String(value).replace(/\D/g, "");
  return digits.length === 4 ? `${digits[0]}.${digits.slice(1)}` : "";
};

const stripCatalogCodeFromDescription = (value) =>
  String(value).replace(/^[^-\s]+\s*-\s*/, "").trim();

const renumberFiscalCatalogIds = async (connection) => {
  const [items] = await connection.query(
    `SELECT idFiscalCatalogItem
     FROM fiscal_catalog_items
     ORDER BY idFiscalCatalogItem`
  );
  if (!items.length) return;

  const temporaryOffset = 1000000000000;
  for (const item of items) {
    await connection.query(
      `UPDATE fiscal_catalog_items
       SET idFiscalCatalogItem = ?
       WHERE idFiscalCatalogItem = ?`,
      [temporaryOffset + Number(item.idFiscalCatalogItem), item.idFiscalCatalogItem]
    );
  }
  for (const [index, item] of items.entries()) {
    await connection.query(
      `UPDATE fiscal_catalog_items
       SET idFiscalCatalogItem = ?
       WHERE idFiscalCatalogItem = ?`,
      [index + 1, temporaryOffset + Number(item.idFiscalCatalogItem)]
    );
  }
  await connection.query(
    `ALTER TABLE fiscal_catalog_items AUTO_INCREMENT = ?`,
    [items.length + 1]
  );
};

const ensureFiscalCatalogSchema = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS fiscal_catalog_items (
    idFiscalCatalogItem BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    catalogFiscalCatalogItem VARCHAR(50) NOT NULL,
    codeFiscalCatalogItem VARCHAR(30) NOT NULL,
    descriptionFiscalCatalogItem VARCHAR(255) NOT NULL,
    valueFiscalCatalogItem DECIMAL(10,4) NULL,
    isActiveFiscalCatalogItem TINYINT(1) NOT NULL DEFAULT 1,
    createdAtFiscalCatalogItem TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAtFiscalCatalogItem TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idFiscalCatalogItem),
    UNIQUE KEY uqFiscalCatalogItemsCatalogCode (catalogFiscalCatalogItem, codeFiscalCatalogItem),
    KEY idxFiscalCatalogItemsCatalogActive (catalogFiscalCatalogItem, isActiveFiscalCatalogItem, descriptionFiscalCatalogItem)
  ) ENGINE=InnoDB`);
  await pool.query(
    `INSERT INTO fiscal_catalog_items
      (catalogFiscalCatalogItem, codeFiscalCatalogItem, descriptionFiscalCatalogItem, valueFiscalCatalogItem)
     VALUES ('cfops', '5.101', 'Venda de produção do estabelecimento', NULL)
     ON DUPLICATE KEY UPDATE
       descriptionFiscalCatalogItem = VALUES(descriptionFiscalCatalogItem),
       isActiveFiscalCatalogItem = 1`
  );
};

const ensurePrinterSettingsSchema = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS printer_settings (
    idPrinterSetting TINYINT UNSIGNED NOT NULL,
    receiptPrinterName VARCHAR(255) NULL,
    reportsPrinterName VARCHAR(255) NULL,
    receiptLayoutPrinterSetting JSON NULL,
    updatedAtPrinterSetting TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idPrinterSetting)
  ) ENGINE=InnoDB`);
  const [columns] = await pool.query(
   `SELECT COLUMN_NAME FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'printer_settings'`
  );
  if (!columns.some(({ COLUMN_NAME }) => COLUMN_NAME === "receiptLayoutPrinterSetting")) {
   await pool.query("ALTER TABLE printer_settings ADD COLUMN receiptLayoutPrinterSetting JSON NULL");
  }
};

const ensureGeneralSettingsSchema = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS general_settings (
    idGeneralSetting BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    keyGeneralSetting VARCHAR(80) NOT NULL,
    labelGeneralSetting VARCHAR(160) NOT NULL,
    typeGeneralSetting ENUM('boolean') NOT NULL DEFAULT 'boolean',
    booleanValueGeneralSetting TINYINT(1) NOT NULL DEFAULT 0,
    updatedAtGeneralSetting TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idGeneralSetting),
    UNIQUE KEY uqGeneralSettingsKey (keyGeneralSetting)
  ) ENGINE=InnoDB`);
};

const getGeneralSettingBoolean = async (key) => {
  await ensureGeneralSettingsSchema();
  const [rows] = await pool.query(
    `SELECT booleanValueGeneralSetting
     FROM general_settings
     WHERE keyGeneralSetting = ?
     LIMIT 1`,
    [key]
  );
  return Boolean(rows[0]?.booleanValueGeneralSetting);
};

const ensureCompanySchema = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS company_settings (
    idCompanySetting TINYINT UNSIGNED NOT NULL,
    companyTypeCompany ENUM('juridica', 'fisica') NOT NULL DEFAULT 'juridica',
    documentCompany VARCHAR(20) NOT NULL DEFAULT '',
    corporateNameCompany VARCHAR(180) NOT NULL DEFAULT '',
    tradeNameCompany VARCHAR(120) NOT NULL DEFAULT '',
    stateRegistrationCompany VARCHAR(30) NOT NULL DEFAULT '',
    municipalRegistrationCompany VARCHAR(30) NOT NULL DEFAULT '',
    cnaeCompany VARCHAR(20) NOT NULL DEFAULT '',
    zipCodeCompany VARCHAR(9) NOT NULL DEFAULT '',
    addressCompany VARCHAR(180) NOT NULL DEFAULT '',
    addressNumberCompany VARCHAR(20) NOT NULL DEFAULT '',
    addressComplementCompany VARCHAR(80) NOT NULL DEFAULT '',
    neighborhoodCompany VARCHAR(100) NOT NULL DEFAULT '',
    countryCompany VARCHAR(80) NOT NULL DEFAULT 'Brasil',
    stateCompany CHAR(2) NOT NULL DEFAULT '',
    cityCompany VARCHAR(100) NOT NULL DEFAULT '',
    municipalityCodeCompany CHAR(7) NOT NULL DEFAULT '3148004',
    phoneCompany VARCHAR(25) NOT NULL DEFAULT '',
    mobileCompany VARCHAR(25) NOT NULL DEFAULT '',
    websiteCompany VARCHAR(180) NOT NULL DEFAULT '',
    emailCompany VARCHAR(180) NOT NULL DEFAULT '',
    nfceStateCompany CHAR(2) NOT NULL DEFAULT 'MG',
    nfceModelCompany SMALLINT UNSIGNED NOT NULL DEFAULT 65,
    nfceEnvironmentCompany ENUM('homologation', 'production') NOT NULL DEFAULT 'homologation',
    nfceSeriesCompany SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    nfceInitialNumberCompany INT UNSIGNED NOT NULL DEFAULT 1,
    nfceContingencyCompany ENUM('none', 'offline') NOT NULL DEFAULT 'none',
    nfceCscCompany VARCHAR(255) NOT NULL DEFAULT '',
    nfceTokenCompany VARCHAR(255) NOT NULL DEFAULT '',
    nfceHomologationCscCompany VARCHAR(255) NOT NULL DEFAULT '',
    nfceHomologationTokenCompany VARCHAR(255) NOT NULL DEFAULT '',
    nfceCertificateTypeCompany ENUM('A1', 'A3') NOT NULL DEFAULT 'A1',
    nfceCertificatePathCompany VARCHAR(255) NOT NULL DEFAULT '',
    nfceCertificateExpiresCompany DATE NULL,
    nfceCertificateSerialCompany VARCHAR(255) NOT NULL DEFAULT '',
    logoMimeCompany VARCHAR(50) NOT NULL DEFAULT '',
    logoDataCompany MEDIUMTEXT NULL,
    projectIconMimeCompany VARCHAR(50) NOT NULL DEFAULT '',
    projectIconDataCompany MEDIUMTEXT NULL,
    createdAtCompanySetting TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAtCompanySetting TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idCompanySetting)
  ) ENGINE=InnoDB`);
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'company_settings'
       AND COLUMN_NAME IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
    [config.database.name, "nfceStateCompany", "nfceModelCompany", "nfceEnvironmentCompany",
      "nfceContingencyCompany", "nfceCertificateTypeCompany", "nfceCertificatePathCompany",
      "nfceCertificateExpiresCompany", "nfceCertificateSerialCompany", "nfceCertificateNameCompany",
      "nfceCertificateDataCompany", "nfceCertificatePasswordCompany", "logoMimeCompany", "logoDataCompany",
      "projectIconMimeCompany", "projectIconDataCompany", "municipalityCodeCompany"]
  );
  const existing = new Set(columns.map(({ COLUMN_NAME }) => COLUMN_NAME));
  const missingColumns = [
    ["nfceStateCompany", "ALTER TABLE company_settings ADD COLUMN nfceStateCompany CHAR(2) NOT NULL DEFAULT 'MG'"],
    ["nfceModelCompany", "ALTER TABLE company_settings ADD COLUMN nfceModelCompany SMALLINT UNSIGNED NOT NULL DEFAULT 65"],
    ["nfceEnvironmentCompany", "ALTER TABLE company_settings ADD COLUMN nfceEnvironmentCompany ENUM('homologation', 'production') NOT NULL DEFAULT 'homologation'"],
    ["nfceContingencyCompany", "ALTER TABLE company_settings ADD COLUMN nfceContingencyCompany ENUM('none', 'offline') NOT NULL DEFAULT 'none'"],
    ["nfceCertificateTypeCompany", "ALTER TABLE company_settings ADD COLUMN nfceCertificateTypeCompany ENUM('A1', 'A3') NOT NULL DEFAULT 'A1'"],
    ["nfceCertificatePathCompany", "ALTER TABLE company_settings ADD COLUMN nfceCertificatePathCompany VARCHAR(255) NOT NULL DEFAULT ''"],
    ["nfceCertificateExpiresCompany", "ALTER TABLE company_settings ADD COLUMN nfceCertificateExpiresCompany DATE NULL"],
    ["nfceCertificateNameCompany", "ALTER TABLE company_settings ADD COLUMN nfceCertificateNameCompany VARCHAR(255) NOT NULL DEFAULT ''"],
    ["nfceCertificateDataCompany", "ALTER TABLE company_settings ADD COLUMN nfceCertificateDataCompany MEDIUMTEXT NULL"],
    ["nfceCertificatePasswordCompany", "ALTER TABLE company_settings ADD COLUMN nfceCertificatePasswordCompany MEDIUMTEXT NULL"],
    ["municipalityCodeCompany", "ALTER TABLE company_settings ADD COLUMN municipalityCodeCompany CHAR(7) NOT NULL DEFAULT '3148004'"]
  ];
  for (const [name, statement] of missingColumns) {
    if (!existing.has(name)) await pool.query(statement);
  }
  if (!existing.has("logoMimeCompany")) {
    await pool.query(
      "ALTER TABLE company_settings ADD COLUMN logoMimeCompany VARCHAR(50) NOT NULL DEFAULT '' AFTER nfceCertificateSerialCompany"
    );
  }
  if (!existing.has("logoDataCompany")) {
    await pool.query(
      "ALTER TABLE company_settings ADD COLUMN logoDataCompany MEDIUMTEXT NULL AFTER logoMimeCompany"
    );
  }
  if (!existing.has("projectIconMimeCompany")) {
    await pool.query(
      "ALTER TABLE company_settings ADD COLUMN projectIconMimeCompany VARCHAR(50) NOT NULL DEFAULT '' AFTER logoDataCompany"
    );
  }
  if (!existing.has("projectIconDataCompany")) {
    await pool.query(
      "ALTER TABLE company_settings ADD COLUMN projectIconDataCompany MEDIUMTEXT NULL AFTER projectIconMimeCompany"
    );
  }
};

const ensureFiscalOperationSchema = async () => {
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'fiscal_operations'
       AND COLUMN_NAME IN (?, ?)`,
    [
      config.database.name,
      "fcpUseReductionBaseFiscalOperation",
      "fcpStUseReductionBaseFiscalOperation"
    ]
  );
  const existing = new Set(columns.map(({ COLUMN_NAME }) => COLUMN_NAME));
  if (!existing.has("fcpUseReductionBaseFiscalOperation")) {
    await pool.query(
      `ALTER TABLE fiscal_operations
       ADD COLUMN fcpUseReductionBaseFiscalOperation TINYINT(1) NOT NULL DEFAULT 0
       AFTER fcpEnabledFiscalOperation`
    );
  }
  if (!existing.has("fcpStUseReductionBaseFiscalOperation")) {
    await pool.query(
      `ALTER TABLE fiscal_operations
       ADD COLUMN fcpStUseReductionBaseFiscalOperation TINYINT(1) NOT NULL DEFAULT 0
       AFTER fcpStEnabledFiscalOperation`
    );
  }
};

const ensureNcmCestSchema = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS ncm_catalog (
    idNcm BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    codeNcm CHAR(8) NOT NULL,
    descriptionNcm VARCHAR(255) NOT NULL,
    isActiveNcm TINYINT(1) NOT NULL DEFAULT 1,
    createdAtNcm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAtNcm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idNcm),
    UNIQUE KEY uqNcmCode (codeNcm)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS cest_catalog (
    idCest BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    codeCest CHAR(7) NOT NULL,
    descriptionCest VARCHAR(255) NOT NULL,
    segmentCest VARCHAR(160) NULL,
    isActiveCest TINYINT(1) NOT NULL DEFAULT 1,
    createdAtCest TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAtCest TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idCest),
    UNIQUE KEY uqCestCode (codeCest)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ncm_cest_relations (
    idNcmCestRelation BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    idNcm BIGINT UNSIGNED NOT NULL,
    idCest BIGINT UNSIGNED NOT NULL,
    createdAtNcmCestRelation TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idNcmCestRelation),
    UNIQUE KEY uqNcmCestRelation (idNcm, idCest),
    KEY idxNcmCestRelationsCest (idCest),
    CONSTRAINT fkNcmCestRelationsNcm FOREIGN KEY (idNcm) REFERENCES ncm_catalog (idNcm) ON DELETE RESTRICT,
    CONSTRAINT fkNcmCestRelationsCest FOREIGN KEY (idCest) REFERENCES cest_catalog (idCest) ON DELETE RESTRICT
  ) ENGINE=InnoDB`);
  await pool.query(
    "ALTER TABLE ncm_catalog MODIFY COLUMN descriptionNcm TEXT NOT NULL"
  );
  await pool.query(
    "ALTER TABLE cest_catalog MODIFY COLUMN descriptionCest TEXT NOT NULL"
  );
  await ensureUpdateSchema(pool);
};

const ensureProductFiscalSchema = async () => {
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'products'
       AND COLUMN_NAME IN (?, ?)`,
    [config.database.name, "ncmProduct", "cestProduct"]
  );
  const existing = new Set(columns.map(({ COLUMN_NAME }) => COLUMN_NAME));
  if (!existing.has("ncmProduct")) {
    await pool.query("ALTER TABLE products ADD COLUMN ncmProduct CHAR(8) NULL AFTER nameProduct");
  }
  if (!existing.has("cestProduct")) {
    await pool.query("ALTER TABLE products ADD COLUMN cestProduct CHAR(7) NULL AFTER ncmProduct");
  }
};

const ensureProductCatalogSchema = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS product_types (
    idProductType BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    codeSpedProductType VARCHAR(30) NULL,
    descriptionProductType VARCHAR(120) NOT NULL,
    isActiveProductType TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (idProductType),
    UNIQUE KEY uqProductTypesDescription (descriptionProductType)
  ) ENGINE=InnoDB`);
  const [productTypeColumns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'product_types'`
  );
  if (!productTypeColumns.some(({ COLUMN_NAME }) => COLUMN_NAME === "codeSpedProductType")) {
    await pool.query(
      "ALTER TABLE product_types ADD COLUMN codeSpedProductType VARCHAR(30) NULL AFTER idProductType"
    );
  }
  await pool.query(
    `INSERT INTO product_types (descriptionProductType, isActiveProductType)
     VALUES ('Produto Acabado', 1)
     ON DUPLICATE KEY UPDATE isActiveProductType = 1`
  );
  await pool.query(`CREATE TABLE IF NOT EXISTS units (
    idUnit BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    codeUnit CHAR(6) NOT NULL,
    descriptionUnit VARCHAR(80) NOT NULL,
    isActiveUnit TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (idUnit),
    UNIQUE KEY uqUnitsCode (codeUnit)
  ) ENGINE=InnoDB`);
  await ensureProductFiscalSchema();
  await ensureFiscalOperationSchema();
  const [migrationTypes] = await pool.query(
    `SELECT
       (SELECT idProductType
        FROM product_types
        WHERE descriptionProductType = 'Mercadoria para Revenda'
        LIMIT 1) AS sourceProductType,
       (SELECT idProductType
        FROM product_types
        WHERE descriptionProductType = 'Produto Acabado'
        LIMIT 1) AS targetProductType,
       (SELECT idFiscalOperation
        FROM fiscal_operations
        WHERE descriptionFiscalOperation = 'Venda de produção'
          AND typeFiscalOperation = 'exit'
          AND isActiveFiscalOperation = 1
        ORDER BY idFiscalOperation
        LIMIT 1) AS targetFiscalOperation`
  );
  const migration = migrationTypes[0];
  if (migration?.sourceProductType && migration?.targetProductType && migration?.targetFiscalOperation) {
    await pool.query(
      `UPDATE products
       SET idProductTypeProduct = ?,
           idFiscalOperationSaleProduct = ?
       WHERE idProductTypeProduct = ?`,
      [
        migration.targetProductType,
        migration.targetFiscalOperation,
        migration.sourceProductType
      ]
    );
  }
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'`
  );
  const existing = new Set(columns.map(({ COLUMN_NAME }) => COLUMN_NAME));
  if (!existing.has("pdvCodeProduct")) {
    if (existing.has("barcodeProduct")) {
      await pool.query("ALTER TABLE products CHANGE COLUMN barcodeProduct pdvCodeProduct VARCHAR(64) NULL");
    } else {
      await pool.query("ALTER TABLE products ADD COLUMN pdvCodeProduct VARCHAR(64) NULL AFTER skuProduct");
    }
  }
  const additions = [
    ["idFiscalOperationSaleProduct", "ALTER TABLE products ADD COLUMN idFiscalOperationSaleProduct BIGINT UNSIGNED NULL AFTER nameProduct"],
    ["idProductTypeProduct", "ALTER TABLE products ADD COLUMN idProductTypeProduct BIGINT UNSIGNED NULL AFTER idFiscalOperationSaleProduct"],
    ["idUnitProduct", "ALTER TABLE products ADD COLUMN idUnitProduct BIGINT UNSIGNED NULL AFTER idProductTypeProduct"],
    ["controlsStockProduct", "ALTER TABLE products ADD COLUMN controlsStockProduct TINYINT(1) NOT NULL DEFAULT 1 AFTER stockQuantityProduct"],
    ["isFractionalProduct", "ALTER TABLE products ADD COLUMN isFractionalProduct TINYINT(1) NOT NULL DEFAULT 0 AFTER controlsStockProduct"],
    ["printsKitchenProduct", "ALTER TABLE products ADD COLUMN printsKitchenProduct TINYINT(1) NOT NULL DEFAULT 0 AFTER isFractionalProduct"],
    ["showsInPdvProduct", "ALTER TABLE products ADD COLUMN showsInPdvProduct TINYINT(1) NOT NULL DEFAULT 1 AFTER printsKitchenProduct"]
  ];
  for (const [name, statement] of additions) {
    if (!existing.has(name)) await pool.query(statement);
  }
  const [classColumns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'classes'`
  );
  if (!classColumns.some(({ COLUMN_NAME }) => COLUMN_NAME === "idFiscalOperationClass")) {
    await pool.query("ALTER TABLE classes ADD COLUMN idFiscalOperationClass BIGINT UNSIGNED NULL AFTER descriptionClass");
  }
  const [groupColumns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'groups'`
  );
  if (!groupColumns.some(({ COLUMN_NAME }) => COLUMN_NAME === "showsInPdvGroup")) {
    await pool.query("ALTER TABLE `groups` ADD COLUMN showsInPdvGroup TINYINT(1) NOT NULL DEFAULT 0 AFTER idClass");
  }
};

const prepareNavigationSchema = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS navigation_menus (
    idNavigationMenu SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    keyNavigationMenu VARCHAR(80) NOT NULL,
    labelNavigationMenu VARCHAR(120) NOT NULL,
    orderNavigationMenu SMALLINT UNSIGNED NOT NULL,
    isActiveNavigationMenu TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (idNavigationMenu),
    UNIQUE KEY uqNavigationMenusKey (keyNavigationMenu)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS navigation_items (
    idNavigationItem BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    idNavigationMenu SMALLINT UNSIGNED NOT NULL,
    idParentNavigationItem BIGINT UNSIGNED NULL,
    typeNavigationItem ENUM('item', 'submenu', 'bar') NOT NULL,
    keyNavigationItem VARCHAR(80) NOT NULL,
    labelNavigationItem VARCHAR(120) NOT NULL,
    routeNavigationItem VARCHAR(120) NULL,
    descriptionNavigationItem VARCHAR(240) NULL,
    orderNavigationItem SMALLINT UNSIGNED NOT NULL,
    isActiveNavigationItem TINYINT(1) NOT NULL DEFAULT 1,
    showsInBackofficeHomeNavigationItem TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (idNavigationItem),
    UNIQUE KEY uqNavigationItemsMenuParentKey (idNavigationMenu, idParentNavigationItem, keyNavigationItem),
    KEY idxNavigationItemsMenuParentOrder (idNavigationMenu, idParentNavigationItem, orderNavigationItem),
    CONSTRAINT fkNavigationItemsMenu FOREIGN KEY (idNavigationMenu) REFERENCES navigation_menus (idNavigationMenu) ON DELETE CASCADE,
    CONSTRAINT fkNavigationItemsParent FOREIGN KEY (idParentNavigationItem) REFERENCES navigation_items (idNavigationItem) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  const [navigationItemColumns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'navigation_items'`
  );
  if (!navigationItemColumns.some(({ COLUMN_NAME }) => COLUMN_NAME === "showsInBackofficeHomeNavigationItem")) {
    await pool.query(
      "ALTER TABLE navigation_items ADD COLUMN showsInBackofficeHomeNavigationItem TINYINT(1) NOT NULL DEFAULT 0 AFTER isActiveNavigationItem"
    );
    await pool.query(
      `UPDATE navigation_items
       SET showsInBackofficeHomeNavigationItem = 1
       WHERE (typeNavigationItem = 'bar' AND keyNavigationItem IN ('classes', 'groups'))
          OR (idParentNavigationItem IS NULL AND keyNavigationItem IN ('products', 'fiscal-operations', 'financial', 'thermal-print', 'settings'))`
    );
  }
  if (!navigationItemColumns.some(({ COLUMN_NAME }) => COLUMN_NAME === "descriptionNavigationItem")) {
    await pool.query(
      "ALTER TABLE navigation_items ADD COLUMN descriptionNavigationItem VARCHAR(240) NULL AFTER routeNavigationItem"
    );
  }
  const defaultToolMenuKey = normalizeNavigationKey("tools");
  const defaultCatalogMenuKey = normalizeNavigationKey("cadastros");

  const [toolsMenus] = await pool.query(
    `SELECT idNavigationMenu
     FROM navigation_menus
     WHERE LOWER(keyNavigationMenu) = ?
     LIMIT 1`,
    [defaultToolMenuKey]
  );
  if (toolsMenus[0]) {
    const [nfceQueryItems] = await pool.query(
      `SELECT idNavigationItem
       FROM navigation_items
       WHERE idNavigationMenu = ? AND idParentNavigationItem IS NULL
         AND keyNavigationItem = 'nfce-query'
       LIMIT 1`,
      [toolsMenus[0].idNavigationMenu]
    );
    if (!nfceQueryItems[0]) {
      const [lastOrder] = await pool.query(
        `SELECT COALESCE(MAX(orderNavigationItem), 0) AS lastOrder
         FROM navigation_items
         WHERE idNavigationMenu = ? AND idParentNavigationItem IS NULL`,
        [toolsMenus[0].idNavigationMenu]
      );
      await pool.query(
        `INSERT INTO navigation_items
          (idNavigationMenu, idParentNavigationItem, typeNavigationItem,
           keyNavigationItem, labelNavigationItem, routeNavigationItem,
           descriptionNavigationItem, orderNavigationItem, isActiveNavigationItem,
           showsInBackofficeHomeNavigationItem)
         VALUES (?, NULL, 'item', 'nfce-query', 'Consulta de NFC-e', 'nfce-query',
                 'Consulte uma NFC-e no portal oficial e prepare itens para compras.',
                 ?, 1, 0)`,
        [toolsMenus[0].idNavigationMenu, Number(lastOrder[0]?.lastOrder || 0) + 1]
      );
    }
    const [importItems] = await pool.query(
      `SELECT idNavigationItem
       FROM navigation_items
       WHERE idNavigationMenu = ? AND idParentNavigationItem IS NULL
         AND keyNavigationItem = 'import-catalogs'
       LIMIT 1`,
      [toolsMenus[0].idNavigationMenu]
    );
    if (!importItems[0]) {
      const [lastOrder] = await pool.query(
        `SELECT COALESCE(MAX(orderNavigationItem), 0) AS lastOrder
         FROM navigation_items
         WHERE idNavigationMenu = ? AND idParentNavigationItem IS NULL`,
        [toolsMenus[0].idNavigationMenu]
      );
      await pool.query(
        `INSERT INTO navigation_items
          (idNavigationMenu, idParentNavigationItem, typeNavigationItem,
           keyNavigationItem, labelNavigationItem, routeNavigationItem,
           descriptionNavigationItem, orderNavigationItem, isActiveNavigationItem,
           showsInBackofficeHomeNavigationItem)
         VALUES (?, NULL, 'item', 'import-catalogs', 'Importar cadastros', 'import-catalogs',
                 'Importe produtos em lote usando um arquivo CSV.',
                 ?, 1, 0)`,
        [toolsMenus[0].idNavigationMenu, Number(lastOrder[0]?.lastOrder || 0) + 1]
      );
    }
  }

  const [catalogMenus] = await pool.query(
    `SELECT idNavigationMenu, keyNavigationMenu
     FROM navigation_menus
     WHERE LOWER(keyNavigationMenu) IN (?, 'registrations')
        OR LOWER(labelNavigationMenu) = 'cadastros'
     ORDER BY CASE
       WHEN LOWER(keyNavigationMenu) = ? THEN 0
       WHEN LOWER(labelNavigationMenu) = 'cadastros' THEN 1
       ELSE 2
     END, idNavigationMenu
     LIMIT 1`,
    [defaultCatalogMenuKey, defaultCatalogMenuKey]
  );

  let catalogMenuId = catalogMenus[0]?.idNavigationMenu;
  if (!catalogMenuId) {
    const [lastMenuOrder] = await pool.query(
      `SELECT COALESCE(MAX(orderNavigationMenu), 0) AS lastOrder
       FROM navigation_menus`
    );
    const [insertedMenu] = await pool.query(
      `INSERT INTO navigation_menus
        (keyNavigationMenu, labelNavigationMenu, orderNavigationMenu, isActiveNavigationMenu)
       VALUES (?, 'Cadastros', ?, 1)`,
      [defaultCatalogMenuKey, Number(lastMenuOrder[0]?.lastOrder || 0) + 1]
    );
    catalogMenuId = insertedMenu.insertId;
  }

  const [productNavigationParents] = await pool.query(
    `SELECT idNavigationItem
     FROM navigation_items
     WHERE idNavigationMenu = ?
       AND idParentNavigationItem IS NULL
       AND (keyNavigationItem = 'products' OR labelNavigationItem = 'Produtos')
     ORDER BY idNavigationItem
     LIMIT 1`,
    [catalogMenuId]
  );
  if (productNavigationParents[0]) {
    const productParentId = productNavigationParents[0].idNavigationItem;
    await pool.query(
      `UPDATE navigation_items
       SET typeNavigationItem = 'item',
           keyNavigationItem = 'products',
           labelNavigationItem = 'Produtos',
           routeNavigationItem = NULL
       WHERE idNavigationItem = ?`,
      [productParentId]
    );
    const [finishedGoodsItems] = await pool.query(
      `SELECT idNavigationItem
       FROM navigation_items
       WHERE idNavigationMenu = ?
         AND idParentNavigationItem = ?
         AND (keyNavigationItem = 'finished-goods'
              OR routeNavigationItem IN ('finished-goods', 'products')
              OR labelNavigationItem = 'Mercadoria para Revenda')
       ORDER BY idNavigationItem
       LIMIT 1`,
      [catalogMenuId, productParentId]
    );
    if (finishedGoodsItems[0]) {
      await pool.query(
        `UPDATE navigation_items
         SET typeNavigationItem = 'bar',
             keyNavigationItem = 'finished-goods',
             labelNavigationItem = 'Mercadoria para Revenda',
             routeNavigationItem = 'finished-goods',
             isActiveNavigationItem = 1
         WHERE idNavigationItem = ?`,
        [finishedGoodsItems[0].idNavigationItem]
      );
    } else {
      const [lastOrder] = await pool.query(
        `SELECT COALESCE(MAX(orderNavigationItem), 0) AS lastOrder
         FROM navigation_items
         WHERE idNavigationMenu = ? AND idParentNavigationItem = ?`,
        [catalogMenuId, productParentId]
      );
      await pool.query(
        `INSERT INTO navigation_items
          (idNavigationMenu, idParentNavigationItem, typeNavigationItem,
           keyNavigationItem, labelNavigationItem, routeNavigationItem,
           descriptionNavigationItem, orderNavigationItem, isActiveNavigationItem,
           showsInBackofficeHomeNavigationItem)
         VALUES (?, ?, 'bar', 'finished-goods', 'Mercadoria para Revenda',
                 'finished-goods', NULL, ?, 1, 0)`,
        [catalogMenuId, productParentId, Number(lastOrder[0]?.lastOrder || 0) + 1]
      );
    }

    const [finishedProductItems] = await pool.query(
      `SELECT idNavigationItem, orderNavigationItem, isActiveNavigationItem
       FROM navigation_items
       WHERE idNavigationMenu = ?
         AND idParentNavigationItem = ?
         AND (keyNavigationItem = 'finished-products'
              OR routeNavigationItem = 'finished-products'
              OR labelNavigationItem = 'Produtos Acabados')
       ORDER BY idNavigationItem
       LIMIT 1`,
      [catalogMenuId, productParentId]
    );
    const finishedProduct = finishedProductItems[0];
    if (!finishedProduct || Number(finishedProduct.orderNavigationItem) !== 2
      || Number(finishedProduct.isActiveNavigationItem) === 0) {
      await pool.query(
        `UPDATE navigation_items
         SET orderNavigationItem = orderNavigationItem + 1
         WHERE idNavigationMenu = ?
           AND idParentNavigationItem = ?
           AND keyNavigationItem <> 'finished-goods'
           AND keyNavigationItem <> 'finished-products'
           AND orderNavigationItem >= 2`,
        [catalogMenuId, productParentId]
      );
    }
    if (finishedProduct) {
      await pool.query(
        `UPDATE navigation_items
         SET typeNavigationItem = 'bar',
             keyNavigationItem = 'finished-products',
             labelNavigationItem = 'Produtos Acabados',
             routeNavigationItem = 'finished-products',
             orderNavigationItem = 2,
             isActiveNavigationItem = 1
         WHERE idNavigationItem = ?`,
        [finishedProduct.idNavigationItem]
      );
    } else {
      await pool.query(
        `INSERT INTO navigation_items
          (idNavigationMenu, idParentNavigationItem, typeNavigationItem,
           keyNavigationItem, labelNavigationItem, routeNavigationItem,
           descriptionNavigationItem, orderNavigationItem, isActiveNavigationItem,
           showsInBackofficeHomeNavigationItem)
         VALUES (?, ?, 'bar', 'finished-products', 'Produtos Acabados',
                 'finished-products', NULL, 2, 1, 0)`,
        [catalogMenuId, productParentId]
      );
    }

  }

  const [menuIdColumns] = await pool.query(
    `SELECT DATA_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'navigation_menus'
       AND COLUMN_NAME = 'idNavigationMenu'`
  );
  if (menuIdColumns[0]?.DATA_TYPE === "tinyint") {
    await pool.query("ALTER TABLE navigation_items DROP FOREIGN KEY fkNavigationItemsMenu");
    await pool.query("ALTER TABLE navigation_menus MODIFY COLUMN idNavigationMenu SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT");
    await pool.query("ALTER TABLE navigation_items MODIFY COLUMN idNavigationMenu SMALLINT UNSIGNED NOT NULL");
    await pool.query(
      `ALTER TABLE navigation_items
       ADD CONSTRAINT fkNavigationItemsMenu
       FOREIGN KEY (idNavigationMenu) REFERENCES navigation_menus (idNavigationMenu) ON DELETE CASCADE`
    );
  }
  return;
};

const ensureNavigationSchema = (() => {
  let preparation;
  return () => {
    if (!preparation) {
      preparation = prepareNavigationSchema().catch((error) => {
        preparation = null;
        throw error;
      });
    }
    return preparation;
  };
})();

const ensurePaymentMethodSchema = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS payment_methods (
    idPaymentMethod BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    namePaymentMethod VARCHAR(80) NOT NULL,
    cashFlowAccountPaymentMethod ENUM('Banco', 'Caixa') NOT NULL DEFAULT 'Caixa',
    termDaysPaymentMethod SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    discountValuePaymentMethod DECIMAL(12,2) NOT NULL DEFAULT 0,
    discountTypePaymentMethod ENUM('percent', 'fixed') NOT NULL DEFAULT 'percent',
    surchargeValuePaymentMethod DECIMAL(12,2) NOT NULL DEFAULT 0,
    surchargeTypePaymentMethod ENUM('percent', 'fixed') NOT NULL DEFAULT 'percent',
    isActivePaymentMethod TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (idPaymentMethod),
    UNIQUE KEY uqPaymentMethodsNamePaymentMethod (namePaymentMethod)
  ) ENGINE=InnoDB`);
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'payment_methods'`
  );
  const existing = new Set(columns.map(({ COLUMN_NAME }) => COLUMN_NAME));
  const additions = [
    ["cashFlowAccountPaymentMethod", "ALTER TABLE payment_methods ADD COLUMN cashFlowAccountPaymentMethod ENUM('Banco', 'Caixa') NOT NULL DEFAULT 'Caixa' AFTER namePaymentMethod"],
    ["termDaysPaymentMethod", "ALTER TABLE payment_methods ADD COLUMN termDaysPaymentMethod SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER cashFlowAccountPaymentMethod"],
    ["discountValuePaymentMethod", "ALTER TABLE payment_methods ADD COLUMN discountValuePaymentMethod DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER termDaysPaymentMethod"],
    ["discountTypePaymentMethod", "ALTER TABLE payment_methods ADD COLUMN discountTypePaymentMethod ENUM('percent', 'fixed') NOT NULL DEFAULT 'percent' AFTER discountValuePaymentMethod"],
    ["surchargeValuePaymentMethod", "ALTER TABLE payment_methods ADD COLUMN surchargeValuePaymentMethod DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER discountTypePaymentMethod"],
    ["surchargeTypePaymentMethod", "ALTER TABLE payment_methods ADD COLUMN surchargeTypePaymentMethod ENUM('percent', 'fixed') NOT NULL DEFAULT 'percent' AFTER surchargeValuePaymentMethod"]
  ];
  for (const [column, statement] of additions) {
    if (!existing.has(column)) await pool.query(statement);
  }
};

const catalogValues = async (catalog) => {
  const [rows] = await pool.query(
    `SELECT codeFiscalCatalogItem FROM fiscal_catalog_items
     WHERE catalogFiscalCatalogItem = ? AND isActiveFiscalCatalogItem = 1`,
    [catalog]
  );
  return new Set(rows.map(({ codeFiscalCatalogItem }) => codeFiscalCatalogItem));
};

const handleError = (response, error, fallback) => {
  if (error instanceof SaleValidationError) {
    json(response, error.status, { error: error.message });
  } else if (error.code === "ER_DUP_ENTRY") {
    json(response, 409, { error: fallback.duplicate });
  } else {
    console.error(fallback.log, error);
    json(response, 503, { error: fallback.message });
  }
};

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
    });
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/api/health") {
    try {
      await pool.query("SELECT 1");
      json(response, 200, {
        ok: true,
        database: "connected",
        apiVersion: "0.1.0",
        startedAt: apiStartedAt.toISOString(),
        uptimeSeconds: Math.floor(process.uptime())
      });
    } catch (error) {
      console.error("Falha ao verificar o MariaDB:", error);
      json(response, 503, { ok: false, database: "unavailable" });
    }
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/api/navigation")) {
    try {
      await ensureNavigationSchema();
      const includeInactive = new URL(request.url, "http://localhost").searchParams.get("includeInactive") === "1";
      const [menus] = await pool.query(
        `SELECT idNavigationMenu, keyNavigationMenu, labelNavigationMenu, orderNavigationMenu,
                isActiveNavigationMenu
         FROM navigation_menus
         ${includeInactive ? "" : "WHERE isActiveNavigationMenu = 1"}
         ORDER BY orderNavigationMenu, idNavigationMenu`
      );
      const [items] = await pool.query(
        `SELECT idNavigationItem, idNavigationMenu, idParentNavigationItem,
                typeNavigationItem, keyNavigationItem, labelNavigationItem,
                routeNavigationItem, descriptionNavigationItem, orderNavigationItem, isActiveNavigationItem,
                showsInBackofficeHomeNavigationItem
         FROM navigation_items
         ${includeInactive ? "" : "WHERE isActiveNavigationItem = 1"}
         ORDER BY idNavigationMenu, COALESCE(idParentNavigationItem, 0), orderNavigationItem, idNavigationItem`
      );
      json(response, 200, ensureCoreNavigationSeed({ menus, items }));
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao consultar a estrutura de navegação:",
        message: "Não foi possível consultar a estrutura de navegação.",
        duplicate: ""
      });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/navigation/menus") {
    try {
      await ensureNavigationSchema();
      const payload = await readJsonBody(request);
      const key = parseNavigationKey(payload.keyNavigationMenu, "Chave do menu");
      const label = parseNavigationText(payload.labelNavigationMenu, "Nome do menu", 120);
      const order = parseNavigationOrder(payload.orderNavigationMenu, "Ordem do menu");
      const active = parseNavigationBoolean(payload.isActiveNavigationMenu, "Status do menu");
      assertNavigationActivationAllowed(key, active === 1);
      const [result] = await pool.query(
        `INSERT INTO navigation_menus
          (keyNavigationMenu, labelNavigationMenu, orderNavigationMenu, isActiveNavigationMenu)
         VALUES (?, ?, ?, ?)`,
        [key, label, order, active]
      );
      json(response, 201, { idNavigationMenu: result.insertId });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao criar menu de navegação:",
        message: "Não foi possível criar o menu.",
        duplicate: "A chave do menu já existe."
      });
    }
    return;
  }

  if (request.method === "PUT" && request.url === "/api/navigation/menus") {
    try {
      await ensureNavigationSchema();
      const payload = await readJsonBody(request);
      const id = parsePositiveId(payload.idNavigationMenu);
      if (!id) throw new SaleValidationError("Menu inválido.");
      const fields = [];
      const values = [];
      let menuKey = null;
      const [menus] = await pool.query(
        `SELECT keyNavigationMenu
         FROM navigation_menus
         WHERE idNavigationMenu = ?`,
        [id]
      );
      if (!menus[0]) throw new SaleValidationError("Menu não encontrado.", 404);
      menuKey = menus[0].keyNavigationMenu;
      if (payload.keyNavigationMenu !== undefined) {
        fields.push("keyNavigationMenu = ?");
        menuKey = parseNavigationKey(payload.keyNavigationMenu, "Chave do menu");
        values.push(menuKey);
      }
      if (payload.labelNavigationMenu !== undefined) {
        fields.push("labelNavigationMenu = ?");
        values.push(parseNavigationText(payload.labelNavigationMenu, "Nome do menu", 120));
      }
      if (payload.orderNavigationMenu !== undefined) {
        fields.push("orderNavigationMenu = ?");
        values.push(parseNavigationOrder(payload.orderNavigationMenu, "Ordem do menu"));
      }
      if (payload.isActiveNavigationMenu !== undefined) {
        const active = parseNavigationBoolean(payload.isActiveNavigationMenu, "Status do menu");
        assertNavigationActivationAllowed(menuKey, active === 1);
        fields.push("isActiveNavigationMenu = ?");
        values.push(active);
      }
      if (!fields.length) throw new SaleValidationError("Nenhuma alteração informada.");
      values.push(id);
      const [result] = await pool.query(`UPDATE navigation_menus SET ${fields.join(", ")} WHERE idNavigationMenu = ?`, values);
      if (!result.affectedRows) throw new SaleValidationError("Menu não encontrado.", 404);
      json(response, 200, { idNavigationMenu: id });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao atualizar menu de navegação:",
        message: "Não foi possível atualizar o menu.",
        duplicate: "A chave do menu já existe."
      });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/navigation/items") {
    try {
      await ensureNavigationSchema();
      const payload = await readJsonBody(request);
      const menuId = parsePositiveId(payload.idNavigationMenu);
      if (!menuId) throw new SaleValidationError("Menu do item inválido.");
      const parentId = payload.idParentNavigationItem ? parsePositiveId(payload.idParentNavigationItem) : null;
      if (payload.idParentNavigationItem && !parentId) throw new SaleValidationError("Item pai inválido.");
      const type = parseNavigationType(payload.typeNavigationItem);
      const key = parseNavigationKey(payload.keyNavigationItem, "Chave do item");
      const label = parseNavigationText(payload.labelNavigationItem, "Nome do item", 120);
      const route = parseNavigationText(payload.routeNavigationItem, "Rota", 120, false);
      const description = parseNavigationText(
        payload.descriptionNavigationItem,
        "Descrição do atalho",
        240,
        false
      );
      const order = parseNavigationOrder(payload.orderNavigationItem, "Ordem do item");
      const active = parseNavigationBoolean(payload.isActiveNavigationItem, "Status do item");
      const [menus] = await pool.query(
        `SELECT keyNavigationMenu
         FROM navigation_menus
         WHERE idNavigationMenu = ? AND isActiveNavigationMenu = 1`,
        [menuId]
      );
      if (!menus[0]) throw new SaleValidationError("Menu do item não encontrado.", 404);
      assertNavigationActivationAllowed(menus[0].keyNavigationMenu, active === 1);
      const showsInBackofficeHome = parseNavigationBoolean(
        payload.showsInBackofficeHomeNavigationItem,
        "Atalho da tela inicial",
        0
      );
      const [result] = await pool.query(
        `INSERT INTO navigation_items
          (idNavigationMenu, idParentNavigationItem, typeNavigationItem,
           keyNavigationItem, labelNavigationItem, routeNavigationItem,
           descriptionNavigationItem, orderNavigationItem, isActiveNavigationItem,
           showsInBackofficeHomeNavigationItem)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [menuId, parentId, type, key, label, route, description, order, active, showsInBackofficeHome]
      );
      json(response, 201, { idNavigationItem: result.insertId });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao criar item de navegação:",
        message: "Não foi possível criar o item.",
        duplicate: "A chave já existe neste menu ou submenu."
      });
    }
    return;
  }

  if (request.method === "PUT" && request.url === "/api/navigation/items") {
    try {
      await ensureNavigationSchema();
      const payload = await readJsonBody(request);
      const id = parsePositiveId(payload.idNavigationItem);
      if (!id) throw new SaleValidationError("Item inválido.");
      const fields = [];
      const values = [];
      let targetMenuId = null;
      let currentMenuKey = null;
      const [currentItems] = await pool.query(
        `SELECT ni.idNavigationMenu, nm.keyNavigationMenu
         FROM navigation_items ni
         INNER JOIN navigation_menus nm ON nm.idNavigationMenu = ni.idNavigationMenu
         WHERE ni.idNavigationItem = ?`,
        [id]
      );
      if (!currentItems[0]) throw new SaleValidationError("Item não encontrado.", 404);
      targetMenuId = currentItems[0].idNavigationMenu;
      currentMenuKey = currentItems[0].keyNavigationMenu;
      if (payload.idNavigationMenu !== undefined) {
        const menuId = parsePositiveId(payload.idNavigationMenu);
        if (!menuId) throw new SaleValidationError("Menu do item inválido.");
        const [menus] = await pool.query(
          `SELECT idNavigationMenu, keyNavigationMenu
           FROM navigation_menus
           WHERE idNavigationMenu = ? AND isActiveNavigationMenu = 1`,
          [menuId]
        );
        if (!menus[0]) throw new SaleValidationError("Menu do item não encontrado.", 404);
        targetMenuId = menuId;
        currentMenuKey = menus[0].keyNavigationMenu;
        fields.push("idNavigationMenu = ?");
        values.push(menuId);
      }
      if (payload.idParentNavigationItem !== undefined) {
        const parentId = payload.idParentNavigationItem ? parsePositiveId(payload.idParentNavigationItem) : null;
        if (payload.idParentNavigationItem && !parentId) throw new SaleValidationError("Item pai inválido.");
        if (parentId && parentId === id) throw new SaleValidationError("Um item não pode ser pai de si mesmo.");
        if (parentId && targetMenuId) {
          const [parents] = await pool.query(
            `SELECT idNavigationItem
             FROM navigation_items
             WHERE idNavigationItem = ? AND idNavigationMenu = ?`,
            [parentId, targetMenuId]
          );
          if (!parents[0]) throw new SaleValidationError("O item pai deve pertencer ao mesmo menu.");
        }
        fields.push("idParentNavigationItem = ?");
        values.push(parentId);
      }
      if (payload.typeNavigationItem !== undefined) {
        fields.push("typeNavigationItem = ?");
        values.push(parseNavigationType(payload.typeNavigationItem));
      }
      if (payload.keyNavigationItem !== undefined) {
        fields.push("keyNavigationItem = ?");
        values.push(parseNavigationKey(payload.keyNavigationItem, "Chave do item"));
      }
      if (payload.labelNavigationItem !== undefined) {
        fields.push("labelNavigationItem = ?");
        values.push(parseNavigationText(payload.labelNavigationItem, "Nome do item", 120));
      }
      if (payload.routeNavigationItem !== undefined) {
        fields.push("routeNavigationItem = ?");
        values.push(parseNavigationText(payload.routeNavigationItem, "Rota", 120, false));
      }
      if (payload.descriptionNavigationItem !== undefined) {
        fields.push("descriptionNavigationItem = ?");
        values.push(parseNavigationText(
          payload.descriptionNavigationItem,
          "Descrição do atalho",
          240,
          false
        ));
      }
      if (payload.orderNavigationItem !== undefined) {
        fields.push("orderNavigationItem = ?");
        values.push(parseNavigationOrder(payload.orderNavigationItem, "Ordem do item"));
      }
      if (payload.isActiveNavigationItem !== undefined) {
        const active = parseNavigationBoolean(payload.isActiveNavigationItem, "Status do item");
        assertNavigationActivationAllowed(currentMenuKey, active === 1);
        fields.push("isActiveNavigationItem = ?");
        values.push(active);
      }
      if (payload.showsInBackofficeHomeNavigationItem !== undefined) {
        fields.push("showsInBackofficeHomeNavigationItem = ?");
        values.push(parseNavigationBoolean(
          payload.showsInBackofficeHomeNavigationItem,
          "Atalho da tela inicial",
          0
        ));
      }
      if (!fields.length) throw new SaleValidationError("Nenhuma alteração informada.");
      values.push(id);
      const [result] = await pool.query(`UPDATE navigation_items SET ${fields.join(", ")} WHERE idNavigationItem = ?`, values);
      if (!result.affectedRows) throw new SaleValidationError("Item não encontrado.", 404);
      json(response, 200, { idNavigationItem: id });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao atualizar item de navegação:",
        message: "Não foi possível atualizar o item.",
        duplicate: "A chave já existe neste menu ou submenu."
      });
    }
    return;
  }

  if (request.method === "GET" && request.url === "/api/printer-settings") {
    try {
      await ensurePrinterSettingsSchema();
      const [rows] = await pool.query(
        `SELECT receiptPrinterName, reportsPrinterName, receiptLayoutPrinterSetting
         FROM printer_settings
         WHERE idPrinterSetting = 1`
      );
      json(response, 200, {
        receiptPrinterName: rows[0]?.receiptPrinterName || "",
        reportsPrinterName: rows[0]?.reportsPrinterName || "",
        receiptLayout: rows[0]?.receiptLayoutPrinterSetting
          ? (typeof rows[0].receiptLayoutPrinterSetting === "string"
            ? JSON.parse(rows[0].receiptLayoutPrinterSetting)
            : rows[0].receiptLayoutPrinterSetting)
          : null
      });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao consultar configurações de impressora:",
        message: "Não foi possível consultar as configurações de impressora.",
        duplicate: ""
      });
    }
    return;
  }

  if (request.method === "GET" && request.url === "/api/company") {
    try {
      await ensureCompanySchema();
      const [rows] = await pool.query(
        `SELECT companyTypeCompany, documentCompany, corporateNameCompany,
                tradeNameCompany, stateRegistrationCompany, municipalRegistrationCompany,
                cnaeCompany, zipCodeCompany, addressCompany, addressNumberCompany,
                addressComplementCompany, neighborhoodCompany, countryCompany,
                stateCompany, cityCompany, municipalityCodeCompany, phoneCompany, mobileCompany,
                websiteCompany, emailCompany, nfceStateCompany, nfceModelCompany,
                nfceEnvironmentCompany, nfceSeriesCompany,
                nfceInitialNumberCompany, nfceCscCompany, nfceTokenCompany,
                nfceHomologationCscCompany, nfceHomologationTokenCompany,
                nfceContingencyCompany, nfceCertificateTypeCompany,
                nfceCertificatePathCompany, nfceCertificateExpiresCompany,
                nfceCertificateSerialCompany, logoMimeCompany, logoDataCompany,
                projectIconMimeCompany, projectIconDataCompany
         FROM company_settings
         WHERE idCompanySetting = 1`
      );
      json(response, 200, { company: rows[0] || null });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao consultar cadastro da empresa:",
        message: "Não foi possível consultar o cadastro da empresa.",
        duplicate: ""
      });
    }
    return;
  }

  if (request.method === "GET" && request.url === "/api/company/nfce") {
    try {
      await ensureCompanySchema();
      const [rows] = await pool.query(
        `SELECT nfceStateCompany, nfceModelCompany, nfceEnvironmentCompany,
                nfceSeriesCompany, nfceInitialNumberCompany, nfceContingencyCompany,
                nfceCscCompany, nfceTokenCompany, nfceHomologationCscCompany,
                nfceHomologationTokenCompany, nfceCertificateTypeCompany,
                nfceCertificatePathCompany, nfceCertificateExpiresCompany,
                nfceCertificateSerialCompany, nfceCertificateNameCompany,
                (nfceCertificateDataCompany IS NOT NULL AND nfceCertificateDataCompany <> '') AS hasCertificateCompany,
                (nfceCertificatePasswordCompany IS NOT NULL AND nfceCertificatePasswordCompany <> '') AS hasCertificatePasswordCompany,
                nfceCertificateDataCompany, nfceCertificatePasswordCompany
         FROM company_settings
         WHERE idCompanySetting = 1`
      );
      const row = rows[0] || null;
      if (row && row.hasCertificateCompany && row.hasCertificatePasswordCompany
        && (!row.nfceCertificateExpiresCompany || !row.nfceCertificateSerialCompany)
        && config.certificateEncryptionKey) {
        try {
          const metadata = readCertificateMetadata(
            decryptSecret(row.nfceCertificateDataCompany),
            decryptSecret(row.nfceCertificatePasswordCompany)
          );
          await pool.query(
            `UPDATE company_settings
             SET nfceCertificateExpiresCompany = ?, nfceCertificateSerialCompany = ?
             WHERE idCompanySetting = 1`,
            [row.nfceCertificateExpiresCompany || metadata.expires, row.nfceCertificateSerialCompany || metadata.serial]
          );
          row.nfceCertificateExpiresCompany ||= metadata.expires;
          row.nfceCertificateSerialCompany ||= metadata.serial;
        } catch (metadataError) {
          console.error("Não foi possível extrair os metadados do certificado armazenado:", metadataError);
        }
      }
      if (row) {
        row.nfceCertificateExpiresCompany = normalizeDateValue(row.nfceCertificateExpiresCompany);
        delete row.nfceCertificateDataCompany;
        delete row.nfceCertificatePasswordCompany;
      }
      json(response, 200, { nfce: row });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao consultar configurações NFC-e:",
        message: "Não foi possível consultar as configurações NFC-e.",
        duplicate: ""
      });
    }
    return;
  }

  if (request.method === "POST"
    && ["/api/company/nfce/diagnostic", "/api/company/nfce/test"].includes(request.url)) {
    try {
      await ensureCompanySchema();
      await ensureProductFiscalSchema();
      const [companyRows] = await pool.query(
        `SELECT documentCompany, corporateNameCompany, tradeNameCompany,
                stateRegistrationCompany, zipCodeCompany, addressCompany,
                addressNumberCompany, neighborhoodCompany, cityCompany, municipalityCodeCompany,
                stateCompany, nfceEnvironmentCompany, nfceSeriesCompany,
                nfceInitialNumberCompany, nfceCertificateTypeCompany,
                nfceHomologationCscCompany, nfceHomologationTokenCompany,
                nfceCertificateDataCompany, nfceCertificatePasswordCompany
         FROM company_settings
         WHERE idCompanySetting = 1`
      );
      const company = companyRows[0];
      if (!company) throw new SaleValidationError("Cadastro da empresa não encontrado.", 404);
      if (!company.nfceCertificateDataCompany || !company.nfceCertificatePasswordCompany) {
        throw new SaleValidationError("Armazene o certificado A1 e a senha antes de executar o teste.");
      }
      const [productRows] = await pool.query(
        `SELECT idProduct, skuProduct, nameProduct, ncmProduct, priceProduct
         FROM products
         WHERE isActiveProduct = 1
           AND ncmProduct REGEXP '^[0-9]{8}$'
           AND priceProduct > 0
         ORDER BY idProduct
         LIMIT 1`
      );
      if (!productRows.length) {
        throw new SaleValidationError("Cadastre um produto ativo com NCM de oito dígitos e preço maior que zero.");
      }
      const [operationRows] = await pool.query(
        `SELECT operationNatureFiscalOperation, taxSituationFiscalOperation,
                originFiscalOperation, cfopFiscalOperation
         FROM fiscal_operations
         WHERE typeFiscalOperation = 'exit' AND isActiveFiscalOperation = 1
         ORDER BY idFiscalOperation
         LIMIT 1`
      );
      const certificateData = decryptSecret(company.nfceCertificateDataCompany);
      const certificatePassword = decryptSecret(company.nfceCertificatePasswordCompany);
      const isDiagnostic = request.url.endsWith("/diagnostic");
      const result = isDiagnostic
        ? await buildNfceDiagnostic({
          company,
          product: productRows[0],
          operation: operationRows[0] || null,
          certificateData,
          certificatePassword
        })
        : await runNfceHomologationTest({
          company,
          product: productRows[0],
          operation: operationRows[0] || null,
          certificateData,
          certificatePassword
        });
      json(response, 200, isDiagnostic ? { diagnostic: result } : { test: result });
    } catch (error) {
      handleError(response, error, {
        log: "Falha no teste de emissão NFC-e:",
        message: "Não foi possível testar a emissão NFC-e.",
        duplicate: ""
      });
    }
    return;
  }

  if (request.method === "PUT" && request.url === "/api/company/nfce") {
    try {
      const payload = await readJsonBody(request);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new SaleValidationError("Configuração NFC-e inválida.");
      }
      const text = (value, fieldName, maxLength) => {
        if (typeof value !== "string") {
          if (value === undefined || value === null) value = "";
          else throw new SaleValidationError(`${fieldName} inválido.`);
        }
        const result = value.trim();
        if (result.length > maxLength) throw new SaleValidationError(`${fieldName} excede o limite permitido.`);
        return result;
      };
      const positiveInteger = (value, fieldName, maximum) => {
        const number = Number(value);
        if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
          throw new SaleValidationError(`${fieldName} inválido.`);
        }
        return number;
      };
      const enumValue = (value, fieldName, allowed, fallback) => {
        const result = text(value ?? fallback, fieldName, 30);
        if (!allowed.includes(result)) throw new SaleValidationError(`${fieldName} inválido.`);
        return result;
      };
      const nfceStateCompany = text(payload.nfceStateCompany || "MG", "UF de emissão", 2);
      if (nfceStateCompany !== "MG") throw new SaleValidationError("A configuração atual atende somente NFC-e de Minas Gerais (MG).");
      const nfceModelCompany = positiveInteger(payload.nfceModelCompany || 65, "Modelo NFC-e", 65);
      if (nfceModelCompany !== 65) throw new SaleValidationError("O modelo da configuração NFC-e deve ser 65.");
      const nfceEnvironmentCompany = enumValue(payload.nfceEnvironmentCompany, "Ambiente de emissão", ["homologation", "production"], "homologation");
      const nfceSeriesCompany = positiveInteger(payload.nfceSeriesCompany, "Série NFC-e", 999);
      const nfceInitialNumberCompany = positiveInteger(payload.nfceInitialNumberCompany, "Número inicial NFC-e", 999999999);
      const nfceContingencyCompany = enumValue(payload.nfceContingencyCompany, "Contingência", ["none", "offline"], "none");
      const nfceCscCompany = text(payload.nfceCscCompany, "CSC", 255);
      const nfceTokenCompany = text(payload.nfceTokenCompany, "Token", 255);
      const nfceHomologationCscCompany = text(payload.nfceHomologationCscCompany, "CSC homologação", 255);
      const nfceHomologationTokenCompany = text(payload.nfceHomologationTokenCompany, "Token homologação", 255);
      const nfceCertificateTypeCompany = enumValue(payload.nfceCertificateTypeCompany, "Tipo de certificado", ["A1", "A3"], "A1");
      const nfceCertificatePathCompany = text(payload.nfceCertificatePathCompany, "Arquivo/local do certificado", 255);
      const nfceCertificateExpiresCompany = text(payload.nfceCertificateExpiresCompany, "Validade do certificado", 10);
      if (nfceCertificateExpiresCompany && !/^\d{4}-\d{2}-\d{2}$/.test(nfceCertificateExpiresCompany)) {
        throw new SaleValidationError("Validade do certificado inválida.");
      }
      const nfceCertificateSerialCompany = text(payload.nfceCertificateSerialCompany, "Número de série do certificado digital", 255);
      const nfceCertificateFileDataCompany = text(payload.nfceCertificateFileDataCompany, "Arquivo do certificado", 3000000);
      const nfceCertificateNameCompany = text(payload.nfceCertificateNameCompany, "Nome do certificado", 255);
      const nfceCertificatePasswordCompany = text(payload.nfceCertificatePasswordCompany, "Senha do certificado", 255);
      if (nfceCertificateFileDataCompany && !nfceCertificatePasswordCompany) {
        throw new SaleValidationError("Informe a senha do certificado ao enviar um novo arquivo.");
      }
      if (nfceCertificateFileDataCompany && !/^[A-Za-z0-9+/]+={0,2}$/.test(nfceCertificateFileDataCompany)) {
        throw new SaleValidationError("Arquivo do certificado inválido.");
      }
      if (nfceCertificateFileDataCompany.length > 2800000) {
        throw new SaleValidationError("O certificado deve ter no máximo 2 MB.");
      }
      let certificateMetadata = null;
      if (nfceCertificateFileDataCompany) {
        certificateMetadata = readCertificateMetadata(
          nfceCertificateFileDataCompany,
          nfceCertificatePasswordCompany
        );
      }
      const encryptedCertificate = nfceCertificateFileDataCompany
        ? encryptSecret(nfceCertificateFileDataCompany)
        : null;
      const encryptedCertificatePassword = nfceCertificatePasswordCompany
        ? encryptSecret(nfceCertificatePasswordCompany)
        : null;
      await ensureCompanySchema();
      await pool.query(
        `UPDATE company_settings
         SET nfceStateCompany = ?, nfceModelCompany = ?, nfceEnvironmentCompany = ?,
             nfceSeriesCompany = ?, nfceInitialNumberCompany = ?, nfceContingencyCompany = ?,
             nfceCscCompany = ?, nfceTokenCompany = ?, nfceHomologationCscCompany = ?,
             nfceHomologationTokenCompany = ?, nfceCertificateTypeCompany = ?,
             nfceCertificatePathCompany = ?, nfceCertificateExpiresCompany = ?,
             nfceCertificateSerialCompany = ?, nfceCertificateNameCompany = COALESCE(NULLIF(?, ''), nfceCertificateNameCompany),
             nfceCertificateDataCompany = COALESCE(?, nfceCertificateDataCompany),
             nfceCertificatePasswordCompany = COALESCE(?, nfceCertificatePasswordCompany)
         WHERE idCompanySetting = 1`,
        [
          nfceStateCompany, nfceModelCompany, nfceEnvironmentCompany,
          nfceSeriesCompany, nfceInitialNumberCompany, nfceContingencyCompany,
          nfceCscCompany, nfceTokenCompany, nfceHomologationCscCompany,
          nfceHomologationTokenCompany, nfceCertificateTypeCompany,
          nfceCertificatePathCompany, certificateMetadata?.expires || nfceCertificateExpiresCompany || null,
          certificateMetadata?.serial || nfceCertificateSerialCompany, nfceCertificateNameCompany,
          encryptedCertificate, encryptedCertificatePassword
        ]
      );
      const [rows] = await pool.query(
        `SELECT nfceStateCompany, nfceModelCompany, nfceEnvironmentCompany,
                nfceSeriesCompany, nfceInitialNumberCompany, nfceContingencyCompany,
                nfceCscCompany, nfceTokenCompany, nfceHomologationCscCompany,
                nfceHomologationTokenCompany, nfceCertificateTypeCompany,
                nfceCertificatePathCompany, nfceCertificateExpiresCompany,
                nfceCertificateSerialCompany, nfceCertificateNameCompany,
                (nfceCertificateDataCompany IS NOT NULL AND nfceCertificateDataCompany <> '') AS hasCertificateCompany,
                (nfceCertificatePasswordCompany IS NOT NULL AND nfceCertificatePasswordCompany <> '') AS hasCertificatePasswordCompany
         FROM company_settings
         WHERE idCompanySetting = 1`
      );
      const row = rows[0] || null;
      if (row) row.nfceCertificateExpiresCompany = normalizeDateValue(row.nfceCertificateExpiresCompany);
      json(response, 200, { nfce: row });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao salvar configurações NFC-e:",
        message: "Não foi possível salvar as configurações NFC-e.",
        duplicate: ""
      });
    }
    return;
  }

  if (request.method === "PUT" && request.url === "/api/company") {
    try {
      const payload = await readJsonBody(request);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new SaleValidationError("Cadastro da empresa inválido.");
      }
      await ensureCompanySchema();
      const [currentCompanyRows] = await pool.query(
        `SELECT municipalityCodeCompany
         FROM company_settings
         WHERE idCompanySetting = 1`
      );
      const currentCompany = currentCompanyRows[0] || {};
      const text = (value, fieldName, maxLength, required = false) => {
        if (typeof value !== "string") {
          if (value === undefined || value === null) value = "";
          else throw new SaleValidationError(`${fieldName} inválido.`);
        }
        const result = value.trim();
        if (result.length > maxLength) throw new SaleValidationError(`${fieldName} excede o limite permitido.`);
        if (required && !result) throw new SaleValidationError(`${fieldName} é obrigatório.`);
        return result;
      };
      const companyTypeCompany = text(payload.companyTypeCompany, "Tipo de pessoa", 10, true);
      if (!["juridica", "fisica"].includes(companyTypeCompany)) {
        throw new SaleValidationError("Tipo de pessoa inválido.");
      }
      const documentCompany = text(payload.documentCompany, "CNPJ / CPF", 20, true);
      const corporateNameCompany = text(payload.corporateNameCompany, "Razão social / Nome", 180, true);
      const tradeNameCompany = text(payload.tradeNameCompany, "Nome fantasia", 120);
      const stateRegistrationCompany = text(payload.stateRegistrationCompany, "Inscrição Estadual", 30);
      const municipalRegistrationCompany = text(payload.municipalRegistrationCompany, "Inscrição Municipal", 30);
      const cnaeCompany = text(payload.cnaeCompany, "CNAE", 20);
      const zipCodeCompany = text(payload.zipCodeCompany, "CEP", 9);
      const addressCompany = text(payload.addressCompany, "Endereço", 180);
      const addressNumberCompany = text(payload.addressNumberCompany, "Número", 20);
      const addressComplementCompany = text(payload.addressComplementCompany, "Complemento", 80);
      const neighborhoodCompany = text(payload.neighborhoodCompany, "Bairro", 100);
      const countryCompany = text(payload.countryCompany, "País", 80, true);
      const stateCompany = text(payload.stateCompany, "UF", 2);
      const cityCompany = text(payload.cityCompany, "Cidade", 100);
      const municipalityCodeCompany = text(
        payload.municipalityCodeCompany ?? currentCompany.municipalityCodeCompany ?? "3148004",
        "Código IBGE do município",
        7,
        true
      );
      if (!/^\d{7}$/.test(municipalityCodeCompany)) {
        throw new SaleValidationError("Código IBGE do município inválido.");
      }
      const phoneCompany = text(payload.phoneCompany, "Telefone", 25);
      const mobileCompany = text(payload.mobileCompany, "Celular", 25);
      const websiteCompany = text(payload.websiteCompany, "Site", 180);
      const emailCompany = text(payload.emailCompany, "E-mail", 180);
      if (emailCompany && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailCompany)) {
        throw new SaleValidationError("E-mail inválido.");
      }
      const logoMimeCompany = text(payload.logoMimeCompany, "Formato do logotipo", 50);
      const logoDataCompany = text(payload.logoDataCompany, "Conteúdo do logotipo", 3000000);
      const allowedLogoMimes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
      if (logoDataCompany && (!allowedLogoMimes.has(logoMimeCompany) ||
        !logoDataCompany.startsWith(`data:${logoMimeCompany};base64,`) ||
        logoDataCompany.length > 2800000)) {
        throw new SaleValidationError("Logotipo inválido ou maior que 2 MB.");
      }
      const projectIconMimeCompany = text(payload.projectIconMimeCompany, "Formato do ícone", 50);
      const projectIconDataCompany = text(payload.projectIconDataCompany, "Conteúdo do ícone", 800000);
      if (projectIconDataCompany && (!allowedLogoMimes.has(projectIconMimeCompany) ||
        !projectIconDataCompany.startsWith(`data:${projectIconMimeCompany};base64,`) ||
        projectIconDataCompany.length > 720000)) {
        throw new SaleValidationError("Ícone inválido ou maior que 512 KB.");
      }
      await pool.query(
        `UPDATE company_settings
         SET companyTypeCompany = ?, documentCompany = ?, corporateNameCompany = ?,
             tradeNameCompany = ?, stateRegistrationCompany = ?, municipalRegistrationCompany = ?,
             cnaeCompany = ?, zipCodeCompany = ?, addressCompany = ?, addressNumberCompany = ?,
             addressComplementCompany = ?, neighborhoodCompany = ?, countryCompany = ?,
             stateCompany = ?, cityCompany = ?, municipalityCodeCompany = ?, phoneCompany = ?,
             mobileCompany = ?, websiteCompany = ?, emailCompany = ?,
             logoMimeCompany = ?, logoDataCompany = ?,
             projectIconMimeCompany = ?, projectIconDataCompany = ?
         WHERE idCompanySetting = 1`,
        [
          companyTypeCompany, documentCompany, corporateNameCompany, tradeNameCompany,
          stateRegistrationCompany, municipalRegistrationCompany, cnaeCompany,
          zipCodeCompany, addressCompany, addressNumberCompany, addressComplementCompany,
          neighborhoodCompany, countryCompany, stateCompany, cityCompany, municipalityCodeCompany, phoneCompany,
          mobileCompany, websiteCompany, emailCompany,
          logoMimeCompany, logoDataCompany || null,
          projectIconMimeCompany, projectIconDataCompany || null
        ]
      );
      const [rows] = await pool.query(
        `SELECT companyTypeCompany, documentCompany, corporateNameCompany,
                tradeNameCompany, stateRegistrationCompany, municipalRegistrationCompany,
                cnaeCompany, zipCodeCompany, addressCompany, addressNumberCompany,
                addressComplementCompany, neighborhoodCompany, countryCompany,
                stateCompany, cityCompany, municipalityCodeCompany, phoneCompany, mobileCompany,
                websiteCompany, emailCompany, nfceStateCompany, nfceModelCompany,
                nfceEnvironmentCompany, nfceSeriesCompany,
                nfceInitialNumberCompany, nfceCscCompany, nfceTokenCompany,
                nfceHomologationCscCompany, nfceHomologationTokenCompany,
                nfceContingencyCompany, nfceCertificateTypeCompany,
                nfceCertificatePathCompany, nfceCertificateExpiresCompany,
                nfceCertificateSerialCompany, logoMimeCompany, logoDataCompany,
                projectIconMimeCompany, projectIconDataCompany
         FROM company_settings
         WHERE idCompanySetting = 1`
      );
      json(response, 200, { company: rows[0] });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao salvar cadastro da empresa:",
        message: "Não foi possível salvar o cadastro da empresa.",
        duplicate: ""
      });
    }
    return;
  }

  if (request.method === "GET" && request.url === "/api/ncm-cest/update-status") {
    try {
      await ensureNcmCestSchema();
      const [updates] = await pool.query(
        `SELECT idNcmCestUpdate,
                sourceNcmNcmCestUpdate AS sourceNcm,
                sourceCestNcmCestUpdate AS sourceCest,
                statusNcmCestUpdate AS status,
                ncmCountNcmCestUpdate AS ncmCount,
                cestCountNcmCestUpdate AS cestCount,
                relationCountNcmCestUpdate AS relationCount,
                messageNcmCestUpdate AS message,
                startedAtNcmCestUpdate AS startedAt,
                completedAtNcmCestUpdate AS completedAt
         FROM ncm_cest_updates
         ORDER BY idNcmCestUpdate DESC
         LIMIT 1`
      );
      json(response, 200, {
        running: ncmCestUpdateRunning,
        sources: {
          ncm: config.ncmSourceUrl || DEFAULT_NCM_SOURCE_URL,
          cest: config.cestSourceUrl || DEFAULT_CEST_SOURCE_URL
        },
        update: updates[0] || null
      });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao consultar atualização NCM / CEST:",
        message: "Não foi possível consultar o status da atualização NCM / CEST.",
        duplicate: ""
      });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/ncm-cest/update") {
    if (ncmCestUpdateRunning) {
      json(response, 409, { error: "Já existe uma atualização NCM / CEST em andamento." });
      return;
    }
    ncmCestUpdateRunning = true;
    try {
      const result = await updateCatalog(pool, {
        ncmSourceUrl: config.ncmSourceUrl || DEFAULT_NCM_SOURCE_URL,
        cestSourceUrl: config.cestSourceUrl || DEFAULT_CEST_SOURCE_URL
      });
      json(response, 200, { ok: true, ...result });
    } catch (error) {
      console.error("Falha ao atualizar catálogos oficiais NCM / CEST:", error);
      json(response, 502, {
        error: error instanceof SaleValidationError
          ? error.message
          : "A fonte oficial NCM / CEST não está disponível ou não foi reconhecida."
      });
    } finally {
      ncmCestUpdateRunning = false;
    }
    return;
  }

  if (request.method === "PUT" && request.url === "/api/printer-settings") {
    try {
      const payload = await readJsonBody(request);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new SaleValidationError("Configurações de impressora inválidas.");
      }
      const parsePrinterName = (value, fieldName) => {
        if (value === null || value === undefined || value === "") return null;
        if (typeof value !== "string" || value.trim().length > 255) {
          throw new SaleValidationError(`${fieldName} inválida.`);
        }
        return value.trim() || null;
      };
      const receiptPrinterName = parsePrinterName(payload.receiptPrinterName, "Impressora de cupom");
      const reportsPrinterName = parsePrinterName(payload.reportsPrinterName, "Impressora de relatórios");
      let receiptLayout = null;
      if (payload.receiptLayout !== undefined && payload.receiptLayout !== null) {
        if (!Array.isArray(payload.receiptLayout) || payload.receiptLayout.length > 80) {
         throw new SaleValidationError("Layout do cupom inválido.");
        }
        receiptLayout = JSON.stringify(payload.receiptLayout);
      }
      await ensurePrinterSettingsSchema();
      await pool.query(
        `UPDATE printer_settings
         SET receiptPrinterName = ?, reportsPrinterName = ?,
             receiptLayoutPrinterSetting = COALESCE(?, receiptLayoutPrinterSetting)
         WHERE idPrinterSetting = 1`,
        [receiptPrinterName, reportsPrinterName, receiptLayout]
      );
      json(response, 200, {
        receiptPrinterName: receiptPrinterName || "",
        reportsPrinterName: reportsPrinterName || "",
        receiptLayout: payload.receiptLayout ?? null
      });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao salvar configurações de impressora:",
        message: "Não foi possível salvar as configurações de impressora.",
        duplicate: ""
      });
    }
    return;
  }

  if (request.method === "GET" && request.url === "/api/general-settings") {
    try {
      await ensureGeneralSettingsSchema();
      const [rows] = await pool.query(
        `SELECT keyGeneralSetting, labelGeneralSetting, typeGeneralSetting,
                booleanValueGeneralSetting
         FROM general_settings
         ORDER BY idGeneralSetting`
      );
      json(response, 200, {
        settings: rows.map((row) => ({
          keyGeneralSetting: row.keyGeneralSetting,
          labelGeneralSetting: row.labelGeneralSetting,
          typeGeneralSetting: row.typeGeneralSetting,
          booleanValueGeneralSetting: Boolean(row.booleanValueGeneralSetting)
        }))
      });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao carregar configurações gerais:",
        message: "Não foi possível carregar as configurações gerais.",
        duplicate: ""
      });
    }
    return;
  }

  if (request.method === "PUT" && request.url === "/api/general-settings") {
    try {
      const payload = await readJsonBody(request);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new SaleValidationError("Configurações gerais inválidas.");
      }
      const key = payload.keyGeneralSetting;
      if (key !== "allowNegativeStock") {
        throw new SaleValidationError("Configuração geral não reconhecida.");
      }
      const booleanValue = parseBooleanFlag(payload.booleanValueGeneralSetting, "Valor da configuração");
      await ensureGeneralSettingsSchema();
      await pool.query(
        `UPDATE general_settings
         SET booleanValueGeneralSetting = ?
         WHERE keyGeneralSetting = ?`,
        [booleanValue, key]
      );
      const [rows] = await pool.query(
        `SELECT keyGeneralSetting, labelGeneralSetting, typeGeneralSetting,
                booleanValueGeneralSetting
         FROM general_settings
         WHERE keyGeneralSetting = ?`,
        [key]
      );
      json(response, 200, {
        setting: rows[0]
          ? {
              keyGeneralSetting: rows[0].keyGeneralSetting,
              labelGeneralSetting: rows[0].labelGeneralSetting,
              typeGeneralSetting: rows[0].typeGeneralSetting,
              booleanValueGeneralSetting: Boolean(rows[0].booleanValueGeneralSetting)
            }
          : null
      });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao salvar configurações gerais:",
        message: "Não foi possível salvar as configurações gerais.",
        duplicate: ""
      });
    }
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/api/products")) {
    try {
      await ensureProductCatalogSchema();
      const requestUrl = new URL(request.url, "http://localhost");
      const includeInactive = requestUrl.searchParams.get("includeInactive") === "1";
      const productTypeDescription = requestUrl.searchParams.get("productType")?.trim() || "";
      const [products] = await pool.query(
        `SELECT products.idProduct, products.idGroup, products.skuProduct,
                products.pdvCodeProduct, products.nameProduct,
                products.idFiscalOperationSaleProduct, products.idProductTypeProduct,
                products.idUnitProduct, products.ncmProduct,
                products.cestProduct, products.priceProduct,
                products.stockQuantityProduct, products.controlsStockProduct,
                products.isFractionalProduct, products.printsKitchenProduct,
                products.showsInPdvProduct,
                products.isActiveProduct,
                groups.descriptionGroup, classes.descriptionClass
         FROM products
         INNER JOIN \`groups\` groups ON groups.idGroup = products.idGroup
         INNER JOIN classes ON classes.idClass = groups.idClass
         LEFT JOIN product_types ON product_types.idProductType = products.idProductTypeProduct
         WHERE (? OR (products.isActiveProduct = 1 AND products.showsInPdvProduct = 1))
           AND (? = '' OR product_types.descriptionProductType = ?)
         ORDER BY products.nameProduct`,
        [includeInactive, productTypeDescription, productTypeDescription]
      );
      json(response, 200, { products });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao listar produtos:",
        message: "Não foi possível consultar os produtos.",
        duplicate: ""
      });
    }
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/api/product-types")) {
    try {
      await ensureProductCatalogSchema();
      const [productTypes] = await pool.query(
        `SELECT idProductType, codeSpedProductType, descriptionProductType, isActiveProductType
         FROM product_types
         WHERE (? OR isActiveProductType = 1)
        ORDER BY codeSpedProductType IS NULL, codeSpedProductType, descriptionProductType`
        , [request.url.includes("includeInactive=1")]
      );
      json(response, 200, { productTypes });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao listar tipos de produto:",
        message: "Não foi possível consultar os tipos de produto.",
        duplicate: ""
      });
    }
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/api/units")) {
    try {
      await ensureProductCatalogSchema();
      const [units] = await pool.query(
        `SELECT idUnit, codeUnit, descriptionUnit, isActiveUnit
         FROM units
         WHERE (? OR isActiveUnit = 1)
         ORDER BY codeUnit`
        , [request.url.includes("includeInactive=1")]
      );
      json(response, 200, { units });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao listar unidades:",
        message: "Não foi possível consultar as unidades.",
        duplicate: ""
      });
    }
    return;
  }

  if (request.method === "POST" && (request.url === "/api/product-types" || request.url === "/api/units")) {
    try {
      await ensureProductCatalogSchema();
      const payload = await readJsonBody(request);
      const isUnit = request.url === "/api/units";
      const description = typeof payload[isUnit ? "descriptionUnit" : "descriptionProductType"] === "string"
        ? payload[isUnit ? "descriptionUnit" : "descriptionProductType"].trim()
        : "";
      const spedCode = !isUnit && typeof payload.codeSpedProductType === "string"
        ? payload.codeSpedProductType.trim().toUpperCase()
        : null;
      const code = isUnit && typeof payload.codeUnit === "string" ? payload.codeUnit.trim().toUpperCase() : "";
      if (!description || description.length > 120 || (!isUnit && spedCode && spedCode.length > 30) || (isUnit && (!code || code.length > 6))) {
        throw new SaleValidationError(isUnit ? "Código ou descrição da unidade inválidos." : "Descrição do tipo de produto inválida.");
      }
      const [result] = await pool.query(
        isUnit
          ? "INSERT INTO units (codeUnit, descriptionUnit) VALUES (?, ?)"
          : "INSERT INTO product_types (codeSpedProductType, descriptionProductType) VALUES (?, ?)",
        isUnit ? [code, description] : [spedCode || null, description]
      );
      json(response, 201, { id: result.insertId });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao criar cadastro auxiliar de produto:",
        message: "Não foi possível criar o cadastro auxiliar.",
        duplicate: "Esse cadastro auxiliar já existe."
      });
    }
    return;
  }

  if (request.method === "PUT" && (request.url === "/api/product-types" || request.url === "/api/units")) {
    try {
      await ensureProductCatalogSchema();
      const payload = await readJsonBody(request);
      const isUnit = request.url === "/api/units";
      const id = parsePositiveId(payload[isUnit ? "idUnit" : "idProductType"]);
      const description = typeof payload[isUnit ? "descriptionUnit" : "descriptionProductType"] === "string"
        ? payload[isUnit ? "descriptionUnit" : "descriptionProductType"].trim()
        : "";
      const spedCode = !isUnit && typeof payload.codeSpedProductType === "string"
        ? payload.codeSpedProductType.trim().toUpperCase()
        : null;
      const code = isUnit && typeof payload.codeUnit === "string" ? payload.codeUnit.trim().toUpperCase() : "";
      if (!id || !description || description.length > 120 || (!isUnit && spedCode && spedCode.length > 30) || (isUnit && (!code || code.length > 6))) {
        throw new SaleValidationError("Dados do cadastro auxiliar inválidos.");
      }
      const [result] = await pool.query(
        isUnit
          ? "UPDATE units SET codeUnit = ?, descriptionUnit = ? WHERE idUnit = ?"
          : "UPDATE product_types SET codeSpedProductType = ?, descriptionProductType = ? WHERE idProductType = ?",
        isUnit ? [code, description, id] : [spedCode || null, description, id]
      );
      if (!result.affectedRows) throw new SaleValidationError("Cadastro auxiliar não encontrado.", 404);
      json(response, 200, { ok: true, id });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao editar cadastro auxiliar de produto:",
        message: "Não foi possível editar o cadastro auxiliar.",
        duplicate: "Esse cadastro auxiliar já existe."
      });
    }
    return;
  }

  if (request.method === "PUT" && (request.url === "/api/product-types/status" || request.url === "/api/units/status")) {
    try {
      await ensureProductCatalogSchema();
      const payload = await readJsonBody(request);
      const isUnit = request.url === "/api/units/status";
      const id = parsePositiveId(payload[isUnit ? "idUnit" : "idProductType"]);
      const isActive = [true, false, 0, 1].includes(payload.isActive);
      if (!id || !isActive) throw new SaleValidationError("Cadastro auxiliar ou status inválido.");
      const [result] = await pool.query(
        isUnit ? "UPDATE units SET isActiveUnit = ? WHERE idUnit = ?" : "UPDATE product_types SET isActiveProductType = ? WHERE idProductType = ?",
        [payload.isActive === true || payload.isActive === 1 ? 1 : 0, id]
      );
      if (!result.affectedRows) throw new SaleValidationError("Cadastro auxiliar não encontrado.", 404);
      json(response, 200, { ok: true, id });
    } catch (error) {
      handleError(response, error, { log: "Falha ao alterar status do cadastro auxiliar:", message: "Não foi possível alterar o status.", duplicate: "" });
    }
    return;
  }

  if (request.method === "DELETE" && (request.url === "/api/product-types" || request.url === "/api/units")) {
    try {
      await ensureProductCatalogSchema();
      const payload = await readJsonBody(request);
      const isUnit = request.url === "/api/units";
      const id = parsePositiveId(payload[isUnit ? "idUnit" : "idProductType"]);
      if (!id) throw new SaleValidationError("Cadastro auxiliar inválido.");
      const [products] = await pool.query(
        isUnit ? "SELECT idProduct FROM products WHERE idUnitProduct = ? LIMIT 1" : "SELECT idProduct FROM products WHERE idProductTypeProduct = ? LIMIT 1",
        [id]
      );
      if (products.length) throw new SaleValidationError("Não é possível excluir um cadastro auxiliar usado por produtos.", 409);
      const [result] = await pool.query(
        isUnit ? "DELETE FROM units WHERE idUnit = ?" : "DELETE FROM product_types WHERE idProductType = ?",
        [id]
      );
      if (!result.affectedRows) throw new SaleValidationError("Cadastro auxiliar não encontrado.", 404);
      json(response, 200, { ok: true, id });
    } catch (error) {
      handleError(response, error, { log: "Falha ao excluir cadastro auxiliar:", message: "Não foi possível excluir o cadastro auxiliar.", duplicate: "" });
    }
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/api/classes")) {
    try {
      const includeInactive = request.url.includes("includeInactive=1");
      const [classes] = await pool.query(
        `SELECT classes.idClass, classes.descriptionClass,
                classes.idFiscalOperationClass, classes.isActiveClass,
                fiscal_operations.descriptionFiscalOperation
         FROM classes
         LEFT JOIN fiscal_operations
           ON fiscal_operations.idFiscalOperation = classes.idFiscalOperationClass
         WHERE (? OR classes.isActiveClass = 1)
         ORDER BY classes.descriptionClass`,
        [includeInactive]
      );
      json(response, 200, { classes });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao listar classes:",
        message: "Não foi possível consultar as classes.",
        duplicate: ""
      });
    }
    return;
  }

  if (request.method === "PUT" && request.url === "/api/classes") {
    try {
      const payload = await readJsonBody(request);
      const idClass = parsePositiveId(payload.idClass);
      const descriptionClass = typeof payload.descriptionClass === "string" ? payload.descriptionClass.trim() : "";
      const idFiscalOperationClass = parsePositiveId(payload.idFiscalOperationClass);
      if (!idClass || !descriptionClass || descriptionClass.length > 120 || !idFiscalOperationClass) {
        throw new SaleValidationError("Classe, descrição e operação fiscal são obrigatórias.");
      }
      const [operations] = await pool.query(
        "SELECT idFiscalOperation FROM fiscal_operations WHERE idFiscalOperation = ? AND isActiveFiscalOperation = 1",
        [idFiscalOperationClass]
      );
      if (!operations.length) throw new SaleValidationError("Operação fiscal não encontrada.", 409);
      const [result] = await pool.query(
        "UPDATE classes SET descriptionClass = ?, idFiscalOperationClass = ? WHERE idClass = ?",
        [descriptionClass, idFiscalOperationClass, idClass]
      );
      if (!result.affectedRows) throw new SaleValidationError("Classe não encontrada.", 404);
      json(response, 200, { class: { idClass, descriptionClass, idFiscalOperationClass } });
    } catch (error) {
      handleError(response, error, { log: "Falha ao editar classe:", message: "Não foi possível editar a classe.", duplicate: "Essa classe já existe." });
    }
    return;
  }

  if (request.method === "PUT" && request.url === "/api/classes/status") {
    try {
      const payload = await readJsonBody(request);
      const idClass = parsePositiveId(payload.idClass);
      const validStatus = [true, false, 0, 1].includes(payload.isActiveClass);
      const isActiveClass = payload.isActiveClass === true || payload.isActiveClass === 1;
      if (!idClass || !validStatus) throw new SaleValidationError("Classe ou status inválido.");
      const [result] = await pool.query("UPDATE classes SET isActiveClass = ? WHERE idClass = ?", [isActiveClass ? 1 : 0, idClass]);
      if (!result.affectedRows) throw new SaleValidationError("Classe não encontrada.", 404);
      json(response, 200, { ok: true, idClass, isActiveClass: isActiveClass ? 1 : 0 });
    } catch (error) {
      handleError(response, error, { log: "Falha ao alterar status da classe:", message: "Não foi possível alterar o status da classe.", duplicate: "" });
    }
    return;
  }

  if (request.method === "GET" && request.url === "/api/ncm-cest/ncms") {
    try {
      await ensureNcmCestSchema();
      const [ncms] = await pool.query(
        `SELECT idNcm, codeNcm, descriptionNcm
         FROM ncm_catalog
         WHERE isActiveNcm = 1
         ORDER BY codeNcm`
      );
      json(response, 200, { ncms });
    } catch (error) {
      handleError(response, error, { log: "Falha ao listar NCMs:", message: "Não foi possível consultar os NCMs.", duplicate: "" });
    }
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/api/ncm-cest/options")) {
    try {
      await ensureNcmCestSchema();
      const ncmCode = new URL(request.url, "http://localhost").searchParams.get("ncm")?.replace(/\D/g, "") || "";
      if (!/^\d{8}$/.test(ncmCode)) throw new SaleValidationError("NCM inválido.");
      const [cests] = await pool.query(
        `SELECT cest.codeCest AS codeCest, cest.descriptionCest AS descriptionCest,
                cest.segmentCest AS segmentCest
         FROM ncm_cest_relations relation
         INNER JOIN ncm_catalog ncm ON ncm.idNcm = relation.idNcm
         INNER JOIN cest_catalog cest ON cest.idCest = relation.idCest
         WHERE ncm.codeNcm = ? AND ncm.isActiveNcm = 1 AND cest.isActiveCest = 1
         ORDER BY cest.codeCest`,
        [ncmCode]
      );
      json(response, 200, { ncm: ncmCode, cests });
    } catch (error) {
      handleError(response, error, { log: "Falha ao consultar CESTs do NCM:", message: "Não foi possível consultar os CESTs deste NCM.", duplicate: "" });
    }
    return;
  }

  if (request.method === "GET" && request.url === "/api/ncm-cest/cests") {
    try {
      await ensureNcmCestSchema();
      const [cests] = await pool.query(
        `SELECT idCest, codeCest, descriptionCest, segmentCest
         FROM cest_catalog
         WHERE isActiveCest = 1
         ORDER BY codeCest`
      );
      json(response, 200, { cests });
    } catch (error) {
      handleError(response, error, { log: "Falha ao listar CESTs:", message: "Não foi possível consultar os CESTs.", duplicate: "" });
    }
    return;
  }

  if (request.method === "GET" && request.url === "/api/ncm-cest") {
    try {
      await ensureNcmCestSchema();
      const [relations] = await pool.query(
        `SELECT relation.idNcmCestRelation,
                ncm.codeNcm AS ncmCode, ncm.descriptionNcm AS ncmDescription,
                cest.codeCest AS cestCode, cest.descriptionCest AS cestDescription,
                cest.segmentCest AS segment
         FROM ncm_cest_relations relation
         INNER JOIN ncm_catalog ncm ON ncm.idNcm = relation.idNcm
         INNER JOIN cest_catalog cest ON cest.idCest = relation.idCest
         WHERE ncm.isActiveNcm = 1 AND cest.isActiveCest = 1
         ORDER BY ncm.codeNcm, cest.codeCest`
      );
      json(response, 200, { relations });
    } catch (error) {
      handleError(response, error, { log: "Falha ao listar relações NCM / CEST:", message: "Não foi possível consultar as relações NCM / CEST.", duplicate: "" });
    }
    return;
  }

  if ((request.method === "POST" || request.method === "PUT") && request.url === "/api/ncm-cest") {
    const connection = await pool.getConnection();
    try {
      await ensureNcmCestSchema();
      const payload = await readJsonBody(request);
      const idNcmCestRelation = request.method === "PUT" ? parsePositiveId(payload.idNcmCestRelation) : null;
      const ncmCode = typeof payload.ncmCode === "string" ? payload.ncmCode.replace(/\D/g, "") : "";
      const cestCode = typeof payload.cestCode === "string" ? payload.cestCode.replace(/\D/g, "") : "";
      const ncmDescription = typeof payload.ncmDescription === "string" ? payload.ncmDescription.trim() : "";
      const cestDescription = typeof payload.cestDescription === "string" ? payload.cestDescription.trim() : "";
      const segment = typeof payload.segment === "string" ? payload.segment.trim() : "";
      if (
        (request.method === "PUT" && !idNcmCestRelation) ||
        !/^\d{8}$/.test(ncmCode) ||
        !/^\d{7}$/.test(cestCode) ||
        !ncmDescription ||
        ncmDescription.length > 255 ||
        !cestDescription ||
        cestDescription.length > 255 ||
        segment.length > 160
      ) {
        throw new SaleValidationError("NCM, CEST e descrições são obrigatórios e devem ser válidos.");
      }
      await connection.beginTransaction();
      let ncmId;
      let cestId;
      const [ncmRows] = await connection.query("SELECT idNcm FROM ncm_catalog WHERE codeNcm = ?", [ncmCode]);
      if (ncmRows[0]) {
        ncmId = ncmRows[0].idNcm;
        await connection.query("UPDATE ncm_catalog SET descriptionNcm = ? WHERE idNcm = ?", [ncmDescription, ncmId]);
      } else {
        const [result] = await connection.query("INSERT INTO ncm_catalog (codeNcm, descriptionNcm) VALUES (?, ?)", [ncmCode, ncmDescription]);
        ncmId = result.insertId;
      }
      const [cestRows] = await connection.query("SELECT idCest FROM cest_catalog WHERE codeCest = ?", [cestCode]);
      if (cestRows[0]) {
        cestId = cestRows[0].idCest;
        await connection.query("UPDATE cest_catalog SET descriptionCest = ?, segmentCest = ? WHERE idCest = ?", [cestDescription, segment || null, cestId]);
      } else {
        const [result] = await connection.query("INSERT INTO cest_catalog (codeCest, descriptionCest, segmentCest) VALUES (?, ?, ?)", [cestCode, cestDescription, segment || null]);
        cestId = result.insertId;
      }
      if (request.method === "POST") {
        const [result] = await connection.query("INSERT INTO ncm_cest_relations (idNcm, idCest) VALUES (?, ?)", [ncmId, cestId]);
        await connection.commit();
        json(response, 201, { idNcmCestRelation: result.insertId });
      } else {
        const [result] = await connection.query(
          "UPDATE ncm_cest_relations SET idNcm = ?, idCest = ? WHERE idNcmCestRelation = ?",
          [ncmId, cestId, idNcmCestRelation]
        );
        if (!result.affectedRows) throw new SaleValidationError("Relação NCM / CEST não encontrada.", 404);
        await connection.commit();
        json(response, 200, { idNcmCestRelation });
      }
    } catch (error) {
      await connection.rollback();
      handleError(response, error, { log: "Falha ao salvar relação NCM / CEST:", message: "Não foi possível salvar a relação NCM / CEST.", duplicate: "Essa relação NCM / CEST já está cadastrada." });
    } finally {
      connection.release();
    }
    return;
  }

  if (request.method === "DELETE" && request.url === "/api/ncm-cest") {
    try {
      await ensureNcmCestSchema();
      const payload = await readJsonBody(request);
      const idNcmCestRelation = parsePositiveId(payload.idNcmCestRelation);
      if (!idNcmCestRelation) throw new SaleValidationError("Relação NCM / CEST inválida.");
      const [result] = await pool.query("DELETE FROM ncm_cest_relations WHERE idNcmCestRelation = ?", [idNcmCestRelation]);
      if (!result.affectedRows) throw new SaleValidationError("Relação NCM / CEST não encontrada.", 404);
      json(response, 200, { ok: true, idNcmCestRelation });
    } catch (error) {
      handleError(response, error, { log: "Falha ao excluir relação NCM / CEST:", message: "Não foi possível excluir a relação NCM / CEST.", duplicate: "" });
    }
    return;
  }

  if (request.method === "DELETE" && request.url === "/api/classes") {
    try {
      const payload = await readJsonBody(request);
      const idClass = parsePositiveId(payload.idClass);
      if (!idClass) throw new SaleValidationError("Classe inválida.");
      const [products] = await pool.query(
        `SELECT products.idProduct FROM products
         INNER JOIN \`groups\` groups ON groups.idGroup = products.idGroup
         WHERE groups.idClass = ? LIMIT 1`,
        [idClass]
      );
      if (products.length) throw new SaleValidationError("Não é possível excluir a classe enquanto houver produtos cadastrados.", 409);
      const [classes] = await pool.query("SELECT idClass FROM classes WHERE idClass = ?", [idClass]);
      if (!classes.length) throw new SaleValidationError("Classe não encontrada.", 404);
      await pool.query("DELETE FROM `groups` WHERE idClass = ?", [idClass]);
      await pool.query("DELETE FROM classes WHERE idClass = ?", [idClass]);
      json(response, 200, { ok: true, idClass });
    } catch (error) {
      handleError(response, error, { log: "Falha ao excluir classe:", message: "Não foi possível excluir a classe.", duplicate: "" });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/classes") {
    try {
      const payload = await readJsonBody(request);
      const descriptionClass = typeof payload.descriptionClass === "string" ? payload.descriptionClass.trim() : "";
      const idFiscalOperationClass = parsePositiveId(payload.idFiscalOperationClass);
      if (!descriptionClass || descriptionClass.length > 120 || !idFiscalOperationClass) {
        throw new SaleValidationError("Descrição da classe e operação fiscal são obrigatórias.");
      }
      const [operations] = await pool.query(
        "SELECT idFiscalOperation FROM fiscal_operations WHERE idFiscalOperation = ? AND isActiveFiscalOperation = 1",
        [idFiscalOperationClass]
      );
      if (!operations.length) throw new SaleValidationError("Operação fiscal não encontrada.", 409);
      const [result] = await pool.query(
        "INSERT INTO classes (descriptionClass, idFiscalOperationClass) VALUES (?, ?)",
        [descriptionClass, idFiscalOperationClass]
      );
      json(response, 201, { class: { idClass: result.insertId, descriptionClass, idFiscalOperationClass } });
    } catch (error) {
      handleError(response, error, { log: "Falha ao criar classe:", message: "Não foi possível criar a classe.", duplicate: "Essa classe já existe." });
    }
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/api/groups")) {
    try {
      const includeInactive = request.url.includes("includeInactive=1");
      const [groups] = await pool.query(
        `SELECT groups.idGroup, groups.descriptionGroup, groups.idClass,
                groups.showsInPdvGroup,
                classes.descriptionClass, groups.isActiveGroup,
                classes.isActiveClass
         FROM \`groups\`
         INNER JOIN classes ON classes.idClass = groups.idClass
         WHERE (? OR groups.isActiveGroup = 1) AND (? OR classes.isActiveClass = 1)
         ORDER BY groups.descriptionGroup, classes.descriptionClass`,
        [includeInactive, includeInactive]
      );
      json(response, 200, { groups });
    } catch (error) {
      handleError(response, error, { log: "Falha ao listar grupos:", message: "Não foi possível consultar os grupos.", duplicate: "" });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/groups") {
    try {
      const payload = await readJsonBody(request);
      const descriptionGroup = typeof payload.descriptionGroup === "string" ? payload.descriptionGroup.trim() : "";
      const idClass = parsePositiveId(payload.idClass);
      const showsInPdvGroup = parseBooleanFlag(payload.showsInPdvGroup, "Exibe no PDV", false);
      if (!descriptionGroup || descriptionGroup.length > 120 || !idClass) throw new SaleValidationError("Descrição do grupo e classe são obrigatórios.");
      const [classes] = await pool.query("SELECT idClass FROM classes WHERE idClass = ?", [idClass]);
      if (!classes.length) throw new SaleValidationError("Classe não encontrada.", 409);
      const [result] = await pool.query("INSERT INTO `groups` (descriptionGroup, idClass, showsInPdvGroup) VALUES (?, ?, ?)", [descriptionGroup, idClass, showsInPdvGroup]);
      json(response, 201, { group: { idGroup: result.insertId, descriptionGroup, idClass, showsInPdvGroup } });
    } catch (error) {
      handleError(response, error, { log: "Falha ao criar grupo:", message: "Não foi possível criar o grupo.", duplicate: "Esse grupo já existe." });
    }
    return;
  }

  if (request.method === "PUT" && request.url === "/api/groups") {
    try {
      const payload = await readJsonBody(request);
      const idGroup = parsePositiveId(payload.idGroup);
      const idClass = parsePositiveId(payload.idClass);
      const descriptionGroup = typeof payload.descriptionGroup === "string" ? payload.descriptionGroup.trim() : "";
      const showsInPdvGroup = parseBooleanFlag(payload.showsInPdvGroup, "Exibe no PDV", false);
      if (!idGroup || !idClass || !descriptionGroup || descriptionGroup.length > 120) throw new SaleValidationError("Grupo, classe ou descrição inválida.");
      const [classes] = await pool.query("SELECT idClass FROM classes WHERE idClass = ?", [idClass]);
      if (!classes.length) throw new SaleValidationError("Classe não encontrada.", 409);
      const [result] = await pool.query("UPDATE `groups` SET descriptionGroup = ?, idClass = ?, showsInPdvGroup = ? WHERE idGroup = ?", [descriptionGroup, idClass, showsInPdvGroup, idGroup]);
      if (!result.affectedRows) throw new SaleValidationError("Grupo não encontrado.", 404);
      json(response, 200, { group: { idGroup, descriptionGroup, idClass, showsInPdvGroup } });
    } catch (error) {
      handleError(response, error, { log: "Falha ao editar grupo:", message: "Não foi possível editar o grupo.", duplicate: "Esse grupo já existe." });
    }
    return;
  }

  if (request.method === "PUT" && request.url === "/api/groups/status") {
    try {
      const payload = await readJsonBody(request);
      const idGroup = parsePositiveId(payload.idGroup);
      const validStatus = [true, false, 0, 1].includes(payload.isActiveGroup);
      const isActiveGroup = payload.isActiveGroup === true || payload.isActiveGroup === 1;
      if (!idGroup || !validStatus) throw new SaleValidationError("Grupo ou status inválido.");
      const [result] = await pool.query("UPDATE `groups` SET isActiveGroup = ? WHERE idGroup = ?", [isActiveGroup ? 1 : 0, idGroup]);
      if (!result.affectedRows) throw new SaleValidationError("Grupo não encontrado.", 404);
      json(response, 200, { ok: true, idGroup, isActiveGroup: isActiveGroup ? 1 : 0 });
    } catch (error) {
      handleError(response, error, { log: "Falha ao alterar status do grupo:", message: "Não foi possível alterar o status do grupo.", duplicate: "" });
    }
    return;
  }

  if (request.method === "PUT" && request.url === "/api/groups/pdv-status") {
    try {
      const payload = await readJsonBody(request);
      const idGroup = parsePositiveId(payload.idGroup);
      const showsInPdvGroup = parseBooleanFlag(payload.showsInPdvGroup, "Exibir no PDV", false);
      if (!idGroup) throw new SaleValidationError("Grupo inválido.");
      const [result] = await pool.query("UPDATE `groups` SET showsInPdvGroup = ? WHERE idGroup = ?", [showsInPdvGroup, idGroup]);
      if (!result.affectedRows) throw new SaleValidationError("Grupo não encontrado.", 404);
      json(response, 200, { ok: true, idGroup, showsInPdvGroup });
    } catch (error) {
      handleError(response, error, { log: "Falha ao alterar exibição do grupo no PDV:", message: "Não foi possível alterar a exibição do grupo no PDV.", duplicate: "" });
    }
    return;
  }

  if (request.method === "DELETE" && request.url === "/api/groups") {
    try {
      const payload = await readJsonBody(request);
      const idGroup = parsePositiveId(payload.idGroup);
      if (!idGroup) throw new SaleValidationError("Grupo inválido.");
      const [products] = await pool.query("SELECT idProduct FROM products WHERE idGroup = ? LIMIT 1", [idGroup]);
      if (products.length) throw new SaleValidationError("Não é possível excluir o grupo enquanto houver produtos cadastrados.", 409);
      const [groups] = await pool.query("SELECT idGroup FROM `groups` WHERE idGroup = ?", [idGroup]);
      if (!groups.length) throw new SaleValidationError("Grupo não encontrado.", 404);
      await pool.query("DELETE FROM `groups` WHERE idGroup = ?", [idGroup]);
      json(response, 200, { ok: true, idGroup });
    } catch (error) {
      handleError(response, error, { log: "Falha ao excluir grupo:", message: "Não foi possível excluir o grupo.", duplicate: "" });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/products") {
    try {
      const payload = await readJsonBody(request);
      const nameProduct = typeof payload.nameProduct === "string" ? payload.nameProduct.trim() : "";
      const skuProduct = typeof payload.skuProduct === "string" ? payload.skuProduct.trim().toUpperCase() : "";
      const pdvCodeProduct = payload.pdvCodeProduct === null || payload.pdvCodeProduct === undefined ? null : String(payload.pdvCodeProduct).trim() || null;
      const ncmProduct = typeof payload.ncmProduct === "string" ? payload.ncmProduct.replace(/\D/g, "") : "";
      const cestProduct = typeof payload.cestProduct === "string" ? payload.cestProduct.replace(/\D/g, "") : "";
      const idGroup = parsePositiveId(payload.idGroup);
      const idFiscalOperationSaleProduct = parsePositiveId(payload.idFiscalOperationSaleProduct);
      const idProductTypeProduct = parsePositiveId(payload.idProductTypeProduct);
      const idUnitProduct = parsePositiveId(payload.idUnitProduct);
      if (!nameProduct || nameProduct.length > 180 || !skuProduct || skuProduct.length > 64 || !idGroup || (ncmProduct && !/^\d{8}$/.test(ncmProduct)) || (cestProduct && !/^\d{7}$/.test(cestProduct))) throw new SaleValidationError("Nome, SKU, grupo, NCM ou CEST inválidos.");
      await ensureProductCatalogSchema();
      const allowNegativeStock = await getGeneralSettingBoolean("allowNegativeStock");
      const priceProduct = parseMoney(payload.priceProduct, "Preço");
      const controlsStockProduct = parseBooleanFlag(payload.controlsStockProduct, "Controla estoque", true);
      const isFractionalProduct = parseBooleanFlag(payload.isFractionalProduct, "Produto fracionado");
      const printsKitchenProduct = parseBooleanFlag(payload.printsKitchenProduct, "Imprime cozinha");
      const showsInPdvProduct = parseBooleanFlag(payload.showsInPdvProduct, "Exibe no PDV", true);
      const stockQuantityProduct = parseProductQuantity(payload.stockQuantityProduct, allowNegativeStock, Boolean(isFractionalProduct));
      const [groups] = await pool.query("SELECT idGroup FROM `groups` WHERE idGroup = ?", [idGroup]);
      if (!groups.length) throw new SaleValidationError("Grupo não encontrado.", 409);
      const [productTypeRows] = await pool.query("SELECT idProductType, descriptionProductType FROM product_types WHERE idProductType = ? AND isActiveProductType = 1", [idProductTypeProduct]);
      if (idProductTypeProduct && !productTypeRows.length) throw new SaleValidationError("Tipo de produto não encontrado.", 409);
      if (productTypeRows[0]?.descriptionProductType === "Matéria-Prima" && !/^MP-/i.test(skuProduct)) {
        throw new SaleValidationError("O SKU de matéria-prima deve começar com MP-.");
      }
      const [unitRows] = await pool.query("SELECT idUnit FROM units WHERE idUnit = ? AND isActiveUnit = 1", [idUnitProduct]);
      if (idUnitProduct && !unitRows.length) throw new SaleValidationError("Unidade tributável não encontrada.", 409);
      if (idFiscalOperationSaleProduct) {
        const [operationRows] = await pool.query("SELECT idFiscalOperation FROM fiscal_operations WHERE idFiscalOperation = ? AND typeFiscalOperation = 'exit' AND isActiveFiscalOperation = 1", [idFiscalOperationSaleProduct]);
        if (!operationRows.length) throw new SaleValidationError("A operação fiscal de venda não foi encontrada.", 409);
      }
      if (ncmProduct) {
        const [ncmRows] = await pool.query("SELECT idNcm FROM ncm_catalog WHERE codeNcm = ? AND isActiveNcm = 1", [ncmProduct]);
        if (!ncmRows.length) throw new SaleValidationError("NCM não encontrado no cadastro.", 409);
        if (cestProduct) {
          const [relationRows] = await pool.query(
            `SELECT relation.idNcmCestRelation
             FROM ncm_cest_relations relation
             INNER JOIN ncm_catalog ncm ON ncm.idNcm = relation.idNcm
             INNER JOIN cest_catalog cest ON cest.idCest = relation.idCest
             WHERE ncm.codeNcm = ? AND cest.codeCest = ?`,
            [ncmProduct, cestProduct]
          );
          if (!relationRows.length) throw new SaleValidationError("O CEST selecionado não está relacionado ao NCM.", 409);
        }
      } else if (cestProduct) {
        throw new SaleValidationError("Informe o NCM antes de selecionar o CEST.");
      }
      const [result] = await pool.query(
        `INSERT INTO products
          (idGroup, skuProduct, pdvCodeProduct, nameProduct, idFiscalOperationSaleProduct,
           idProductTypeProduct, idUnitProduct, ncmProduct, cestProduct, priceProduct,
           stockQuantityProduct, controlsStockProduct, isFractionalProduct, printsKitchenProduct,
           showsInPdvProduct)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [idGroup, skuProduct, pdvCodeProduct, nameProduct, idFiscalOperationSaleProduct,
          idProductTypeProduct, idUnitProduct, ncmProduct || null, cestProduct || null,
          priceProduct, stockQuantityProduct, controlsStockProduct, isFractionalProduct,
          printsKitchenProduct, showsInPdvProduct]
      );
      json(response, 201, { product: { idProduct: result.insertId, idGroup, skuProduct, pdvCodeProduct, nameProduct, idFiscalOperationSaleProduct, idProductTypeProduct, idUnitProduct, ncmProduct: ncmProduct || null, cestProduct: cestProduct || null, priceProduct, stockQuantityProduct, controlsStockProduct, isFractionalProduct, printsKitchenProduct, showsInPdvProduct } });
    } catch (error) {
      handleError(response, error, { log: "Falha ao criar produto:", message: "Não foi possível criar o produto.", duplicate: "SKU ou código PDV já cadastrado." });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/products/import") {
    let connection;
    try {
      const payload = await readJsonBody(request);
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      if (!rows.length || rows.length > 1000) {
        throw new SaleValidationError("Informe entre 1 e 1000 produtos para importar.");
      }
      await ensureProductCatalogSchema();
      const allowNegativeStock = await getGeneralSettingBoolean("allowNegativeStock");
      connection = await pool.getConnection();
      await connection.beginTransaction();
      let importedCount = 0;
      for (const [index, row] of rows.entries()) {
        const line = index + 2;
        const skuProduct = typeof row.skuProduct === "string" ? row.skuProduct.trim().toUpperCase() : "";
        const pdvCodeProduct = typeof row.pdvCodeProduct === "string" ? row.pdvCodeProduct.trim() || null : null;
        const nameProduct = typeof row.nameProduct === "string" ? row.nameProduct.trim() : "";
        const descriptionGroup = typeof row.descriptionGroup === "string" ? row.descriptionGroup.trim() : "";
        const descriptionFiscalOperation = typeof row.descriptionFiscalOperation === "string" ? row.descriptionFiscalOperation.trim() : "";
        const descriptionProductType = typeof row.descriptionProductType === "string" ? row.descriptionProductType.trim() : "";
        const codeUnit = typeof row.codeUnit === "string" ? row.codeUnit.trim().toUpperCase() : "";
        const ncmProduct = typeof row.ncmProduct === "string" ? row.ncmProduct.replace(/\D/g, "") : "";
        const cestProduct = typeof row.cestProduct === "string" ? row.cestProduct.replace(/\D/g, "") : "";
        const priceValue = String(row.priceProduct ?? "").trim().replace(",", ".");
        const stockValue = String(row.stockQuantityProduct ?? "0").trim().replace(",", ".");
        const parseImportBoolean = (value, fallback) => {
          if (value === undefined || value === null || value === "") return fallback;
          return ["1", "true", "sim", "s", "yes", "y"].includes(String(value).trim().toLowerCase()) ? 1 : 0;
        };
        if (!skuProduct || skuProduct.length > 64 || !nameProduct || nameProduct.length > 180 || !descriptionGroup || !priceValue) {
          throw new SaleValidationError(`Linha ${line}: SKU, nome, grupo e preço são obrigatórios ou inválidos.`);
        }
        const [groupRows] = await connection.query(
          "SELECT idGroup FROM `groups` WHERE descriptionGroup = ? LIMIT 1",
          [descriptionGroup]
        );
        if (!groupRows.length) throw new SaleValidationError(`Linha ${line}: grupo "${descriptionGroup}" não encontrado.`);
        const [fiscalRows] = descriptionFiscalOperation
          ? await connection.query(
            "SELECT idFiscalOperation FROM fiscal_operations WHERE descriptionFiscalOperation = ? AND typeFiscalOperation = 'exit' AND isActiveFiscalOperation = 1 LIMIT 1",
            [descriptionFiscalOperation]
          )
          : [[]];
        if (descriptionFiscalOperation && !fiscalRows.length) {
          throw new SaleValidationError(`Linha ${line}: operação fiscal "${descriptionFiscalOperation}" não encontrada.`);
        }
        const [typeRows] = descriptionProductType
          ? await connection.query(
            "SELECT idProductType, descriptionProductType FROM product_types WHERE descriptionProductType = ? AND isActiveProductType = 1 LIMIT 1",
            [descriptionProductType]
          )
          : [[]];
        if (descriptionProductType && !typeRows.length) {
          throw new SaleValidationError(`Linha ${line}: tipo de produto "${descriptionProductType}" não encontrado.`);
        }
        if (typeRows[0]?.descriptionProductType === "Matéria-Prima" && !/^MP-/i.test(skuProduct)) {
          throw new SaleValidationError(`Linha ${line}: o SKU de matéria-prima deve começar com MP-.`);
        }
        const [unitRows] = codeUnit
          ? await connection.query(
            "SELECT idUnit FROM units WHERE codeUnit = ? AND isActiveUnit = 1 LIMIT 1",
            [codeUnit]
          )
          : [[]];
        if (codeUnit && !unitRows.length) {
          throw new SaleValidationError(`Linha ${line}: unidade "${codeUnit}" não encontrada.`);
        }
        if (ncmProduct && !/^\d{8}$/.test(ncmProduct)) {
          throw new SaleValidationError(`Linha ${line}: NCM inválido.`);
        }
        if (cestProduct && !/^\d{7}$/.test(cestProduct)) {
          throw new SaleValidationError(`Linha ${line}: CEST inválido.`);
        }
        if (ncmProduct) {
          const [ncmRows] = await connection.query(
            "SELECT idNcm FROM ncm_catalog WHERE codeNcm = ? AND isActiveNcm = 1 LIMIT 1",
            [ncmProduct]
          );
          if (!ncmRows.length) throw new SaleValidationError(`Linha ${line}: NCM não encontrado no cadastro.`);
          if (cestProduct) {
            const [relationRows] = await connection.query(
              `SELECT relation.idNcmCestRelation
               FROM ncm_cest_relations relation
               INNER JOIN ncm_catalog ncm ON ncm.idNcm = relation.idNcm
               INNER JOIN cest_catalog cest ON cest.idCest = relation.idCest
               WHERE ncm.codeNcm = ? AND cest.codeCest = ?`,
              [ncmProduct, cestProduct]
            );
            if (!relationRows.length) throw new SaleValidationError(`Linha ${line}: o CEST não está relacionado ao NCM.`);
          }
        } else if (cestProduct) {
          throw new SaleValidationError(`Linha ${line}: informe o NCM antes de selecionar o CEST.`);
        }
        const priceProduct = parseMoney(priceValue, `Preço da linha ${line}`);
        const controlsStockProduct = parseImportBoolean(row.controlsStockProduct, 1);
        const isFractionalProduct = parseImportBoolean(row.isFractionalProduct, 0);
        const printsKitchenProduct = parseImportBoolean(row.printsKitchenProduct, 0);
        const showsInPdvProduct = parseImportBoolean(row.showsInPdvProduct, 1);
        const stockQuantityProduct = parseProductQuantity(stockValue || "0", allowNegativeStock, Boolean(isFractionalProduct));
        await connection.query(
          `INSERT INTO products
            (idGroup, skuProduct, pdvCodeProduct, nameProduct, idFiscalOperationSaleProduct,
             idProductTypeProduct, idUnitProduct, ncmProduct, cestProduct, priceProduct,
             stockQuantityProduct, controlsStockProduct, isFractionalProduct, printsKitchenProduct,
             showsInPdvProduct)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            groupRows[0].idGroup, skuProduct, pdvCodeProduct, nameProduct,
            fiscalRows[0]?.idFiscalOperation || null, typeRows[0]?.idProductType || null,
            unitRows[0]?.idUnit || null, ncmProduct || null, cestProduct || null,
            priceProduct, stockQuantityProduct, controlsStockProduct, isFractionalProduct,
            printsKitchenProduct, showsInPdvProduct
          ]
        );
        importedCount += 1;
      }
      await connection.commit();
      json(response, 201, { importedCount });
    } catch (error) {
      if (connection) await connection.rollback().catch(() => {});
      handleError(response, error, {
        log: "Falha ao importar produtos:",
        message: "Não foi possível importar os produtos.",
        duplicate: "SKU ou código PDV duplicado no arquivo ou no cadastro."
      });
    } finally {
      connection?.release();
    }
    return;
  }

  if (request.method === "PUT" && request.url === "/api/products") {
    try {
      const payload = await readJsonBody(request);
      const idProduct = parsePositiveId(payload.idProduct);
      const nameProduct = typeof payload.nameProduct === "string" ? payload.nameProduct.trim() : "";
      const skuProduct = typeof payload.skuProduct === "string" ? payload.skuProduct.trim().toUpperCase() : "";
      const pdvCodeProduct = payload.pdvCodeProduct === null || payload.pdvCodeProduct === undefined ? null : String(payload.pdvCodeProduct).trim() || null;
      const ncmProduct = typeof payload.ncmProduct === "string" ? payload.ncmProduct.replace(/\D/g, "") : "";
      const cestProduct = typeof payload.cestProduct === "string" ? payload.cestProduct.replace(/\D/g, "") : "";
      const idGroup = parsePositiveId(payload.idGroup);
      const idFiscalOperationSaleProduct = parsePositiveId(payload.idFiscalOperationSaleProduct);
      const idProductTypeProduct = parsePositiveId(payload.idProductTypeProduct);
      const idUnitProduct = parsePositiveId(payload.idUnitProduct);
      if (!idProduct || !nameProduct || nameProduct.length > 180 || !skuProduct || skuProduct.length > 64 || !idGroup || (ncmProduct && !/^\d{8}$/.test(ncmProduct)) || (cestProduct && !/^\d{7}$/.test(cestProduct))) throw new SaleValidationError("Produto, nome, SKU, grupo, NCM ou CEST inválidos.");
      await ensureProductCatalogSchema();
      const allowNegativeStock = await getGeneralSettingBoolean("allowNegativeStock");
      const priceProduct = parseMoney(payload.priceProduct, "Preço");
      const controlsStockProduct = parseBooleanFlag(payload.controlsStockProduct, "Controla estoque", true);
      const isFractionalProduct = parseBooleanFlag(payload.isFractionalProduct, "Produto fracionado");
      const printsKitchenProduct = parseBooleanFlag(payload.printsKitchenProduct, "Imprime cozinha");
      const showsInPdvProduct = parseBooleanFlag(payload.showsInPdvProduct, "Exibe no PDV", true);
      const stockQuantityProduct = parseProductQuantity(payload.stockQuantityProduct, allowNegativeStock, Boolean(isFractionalProduct));
      const [groups] = await pool.query("SELECT idGroup FROM `groups` WHERE idGroup = ?", [idGroup]);
      if (!groups.length) throw new SaleValidationError("Grupo não encontrado.", 409);
      const [productTypeRows] = await pool.query("SELECT idProductType, descriptionProductType FROM product_types WHERE idProductType = ? AND isActiveProductType = 1", [idProductTypeProduct]);
      if (idProductTypeProduct && !productTypeRows.length) throw new SaleValidationError("Tipo de produto não encontrado.", 409);
      if (productTypeRows[0]?.descriptionProductType === "Matéria-Prima" && !/^MP-/i.test(skuProduct)) {
        throw new SaleValidationError("O SKU de matéria-prima deve começar com MP-.");
      }
      const [unitRows] = await pool.query("SELECT idUnit FROM units WHERE idUnit = ? AND isActiveUnit = 1", [idUnitProduct]);
      if (idUnitProduct && !unitRows.length) throw new SaleValidationError("Unidade tributável não encontrada.", 409);
      if (idFiscalOperationSaleProduct) {
        const [operationRows] = await pool.query("SELECT idFiscalOperation FROM fiscal_operations WHERE idFiscalOperation = ? AND typeFiscalOperation = 'exit' AND isActiveFiscalOperation = 1", [idFiscalOperationSaleProduct]);
        if (!operationRows.length) throw new SaleValidationError("A operação fiscal de venda não foi encontrada.", 409);
      }
      if (ncmProduct) {
        const [ncmRows] = await pool.query("SELECT idNcm FROM ncm_catalog WHERE codeNcm = ? AND isActiveNcm = 1", [ncmProduct]);
        if (!ncmRows.length) throw new SaleValidationError("NCM não encontrado no cadastro.", 409);
        if (cestProduct) {
          const [relationRows] = await pool.query(
            `SELECT relation.idNcmCestRelation
             FROM ncm_cest_relations relation
             INNER JOIN ncm_catalog ncm ON ncm.idNcm = relation.idNcm
             INNER JOIN cest_catalog cest ON cest.idCest = relation.idCest
             WHERE ncm.codeNcm = ? AND cest.codeCest = ?`,
            [ncmProduct, cestProduct]
          );
          if (!relationRows.length) throw new SaleValidationError("O CEST selecionado não está relacionado ao NCM.", 409);
        }
      } else if (cestProduct) {
        throw new SaleValidationError("Informe o NCM antes de selecionar o CEST.");
      }
      const [result] = await pool.query(
        `UPDATE products SET idGroup = ?, skuProduct = ?, pdvCodeProduct = ?, nameProduct = ?,
           idFiscalOperationSaleProduct = ?, idProductTypeProduct = ?, idUnitProduct = ?,
           ncmProduct = ?, cestProduct = ?, priceProduct = ?, stockQuantityProduct = ?,
           controlsStockProduct = ?, isFractionalProduct = ?, printsKitchenProduct = ?,
           showsInPdvProduct = ?
         WHERE idProduct = ?`,
        [idGroup, skuProduct, pdvCodeProduct, nameProduct, idFiscalOperationSaleProduct,
          idProductTypeProduct, idUnitProduct, ncmProduct || null, cestProduct || null,
          priceProduct, stockQuantityProduct, controlsStockProduct, isFractionalProduct,
          printsKitchenProduct, showsInPdvProduct, idProduct]
      );
      if (!result.affectedRows) throw new SaleValidationError("Produto não encontrado.", 404);
      json(response, 200, { product: { idProduct, idGroup, skuProduct, pdvCodeProduct, nameProduct, idFiscalOperationSaleProduct, idProductTypeProduct, idUnitProduct, ncmProduct: ncmProduct || null, cestProduct: cestProduct || null, priceProduct, stockQuantityProduct, controlsStockProduct, isFractionalProduct, printsKitchenProduct, showsInPdvProduct } });
    } catch (error) {
      handleError(response, error, { log: "Falha ao editar produto:", message: "Não foi possível editar o produto.", duplicate: "SKU ou código PDV já cadastrado." });
    }
    return;
  }

  if (request.method === "PUT" && request.url === "/api/products/status") {
    try {
      const payload = await readJsonBody(request);
      const idProduct = parsePositiveId(payload.idProduct);
      const validStatus = [true, false, 0, 1].includes(payload.isActiveProduct);
      const isActiveProduct = payload.isActiveProduct === true || payload.isActiveProduct === 1;
      if (!idProduct || !validStatus) throw new SaleValidationError("Produto ou status inválido.");
      const [result] = await pool.query("UPDATE products SET isActiveProduct = ? WHERE idProduct = ?", [isActiveProduct ? 1 : 0, idProduct]);
      if (!result.affectedRows) throw new SaleValidationError("Produto não encontrado.", 404);
      json(response, 200, { ok: true, idProduct, isActiveProduct: isActiveProduct ? 1 : 0 });
    } catch (error) {
      handleError(response, error, { log: "Falha ao alterar status do produto:", message: "Não foi possível alterar o status do produto.", duplicate: "" });
    }
    return;
  }

  if (request.method === "PUT" && request.url === "/api/products/pdv-status") {
    try {
      const payload = await readJsonBody(request);
      const idProduct = parsePositiveId(payload.idProduct);
      const showsInPdvProduct = parseBooleanFlag(payload.showsInPdvProduct, "Exibir no PDV", false);
      if (!idProduct) throw new SaleValidationError("Produto inválido.");
      const [result] = await pool.query("UPDATE products SET showsInPdvProduct = ? WHERE idProduct = ?", [showsInPdvProduct, idProduct]);
      if (!result.affectedRows) throw new SaleValidationError("Produto não encontrado.", 404);
      json(response, 200, { ok: true, idProduct, showsInPdvProduct });
    } catch (error) {
      handleError(response, error, { log: "Falha ao alterar exibição do produto no PDV:", message: "Não foi possível alterar a exibição do produto no PDV.", duplicate: "" });
    }
    return;
  }

  if (request.method === "DELETE" && request.url === "/api/products") {
    try {
      const payload = await readJsonBody(request);
      const idProduct = parsePositiveId(payload.idProduct);
      if (!idProduct) throw new SaleValidationError("Produto inválido.");
      const [products] = await pool.query("SELECT idProduct FROM products WHERE idProduct = ?", [idProduct]);
      if (!products.length) throw new SaleValidationError("Produto não encontrado.", 404);
      const [saleItems] = await pool.query("SELECT idSaleItem FROM sale_items WHERE idProduct = ? LIMIT 1", [idProduct]);
      if (saleItems.length) throw new SaleValidationError("Não é possível excluir este produto porque ele já foi utilizado em uma venda. Inative-o pelo controle de status.", 409);
      await pool.query("DELETE FROM products WHERE idProduct = ?", [idProduct]);
      json(response, 200, { ok: true, idProduct });
    } catch (error) {
      handleError(response, error, { log: "Falha ao excluir produto:", message: "Não foi possível excluir o produto.", duplicate: "" });
    }
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/api/payment-methods")) {
    try {
      await ensurePaymentMethodSchema();
      const includeInactive = new URL(request.url, "http://localhost").searchParams.get("includeInactive") === "1";
      const [paymentMethods] = await pool.query(
        `SELECT idPaymentMethod, namePaymentMethod, cashFlowAccountPaymentMethod,
                termDaysPaymentMethod, discountValuePaymentMethod,
                discountTypePaymentMethod, surchargeValuePaymentMethod,
                surchargeTypePaymentMethod, isActivePaymentMethod
         FROM payment_methods
         ${includeInactive ? "" : "WHERE isActivePaymentMethod = 1"}
         ORDER BY idPaymentMethod`
      );
      json(response, 200, { paymentMethods });
    } catch (error) {
      handleError(response, error, { log: "Falha ao listar formas de pagamento:", message: "Não foi possível consultar as formas de pagamento.", duplicate: "" });
    }
    return;
  }

  if (request.method === "POST" || request.method === "PUT") {
    const isPaymentMethodWrite = request.url === "/api/payment-methods";
    if (isPaymentMethodWrite) {
      try {
        await ensurePaymentMethodSchema();
        const payload = await readJsonBody(request);
        const idPaymentMethod = request.method === "PUT" ? parsePositiveId(payload.idPaymentMethod) : null;
        const namePaymentMethod = typeof payload.namePaymentMethod === "string" ? payload.namePaymentMethod.trim() : "";
        const cashFlowAccountPaymentMethod = payload.cashFlowAccountPaymentMethod;
        const termDaysPaymentMethod = Number(payload.termDaysPaymentMethod);
        const discountValuePaymentMethod = Number(payload.discountValuePaymentMethod);
        const discountTypePaymentMethod = payload.discountTypePaymentMethod;
        const surchargeValuePaymentMethod = Number(payload.surchargeValuePaymentMethod);
        const surchargeTypePaymentMethod = payload.surchargeTypePaymentMethod;
        const isActivePaymentMethod = payload.isActivePaymentMethod === false || payload.isActivePaymentMethod === 0 ? 0 : 1;
        if (
          (request.method === "PUT" && !idPaymentMethod) ||
          !namePaymentMethod ||
          namePaymentMethod.length > 80 ||
          !["Banco", "Caixa"].includes(cashFlowAccountPaymentMethod) ||
          !Number.isSafeInteger(termDaysPaymentMethod) ||
          termDaysPaymentMethod < 0 ||
          !Number.isFinite(discountValuePaymentMethod) ||
          discountValuePaymentMethod < 0 ||
          !["percent", "fixed"].includes(discountTypePaymentMethod) ||
          !Number.isFinite(surchargeValuePaymentMethod) ||
          surchargeValuePaymentMethod < 0 ||
          !["percent", "fixed"].includes(surchargeTypePaymentMethod) ||
          (discountTypePaymentMethod === "percent" && discountValuePaymentMethod > 100) ||
          (surchargeTypePaymentMethod === "percent" && surchargeValuePaymentMethod > 100)
        ) {
          throw new SaleValidationError("Dados da forma de pagamento inválidos.");
        }
        if (request.method === "POST") {
          const [result] = await pool.query(
            `INSERT INTO payment_methods
             (namePaymentMethod, cashFlowAccountPaymentMethod, termDaysPaymentMethod,
              discountValuePaymentMethod, discountTypePaymentMethod,
              surchargeValuePaymentMethod, surchargeTypePaymentMethod, isActivePaymentMethod)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [namePaymentMethod, cashFlowAccountPaymentMethod, termDaysPaymentMethod, discountValuePaymentMethod, discountTypePaymentMethod, surchargeValuePaymentMethod, surchargeTypePaymentMethod, isActivePaymentMethod]
          );
          json(response, 201, { idPaymentMethod: result.insertId });
        } else {
          const [result] = await pool.query(
            `UPDATE payment_methods
             SET namePaymentMethod = ?, cashFlowAccountPaymentMethod = ?, termDaysPaymentMethod = ?,
                 discountValuePaymentMethod = ?, discountTypePaymentMethod = ?,
                 surchargeValuePaymentMethod = ?, surchargeTypePaymentMethod = ?, isActivePaymentMethod = ?
             WHERE idPaymentMethod = ?`,
            [namePaymentMethod, cashFlowAccountPaymentMethod, termDaysPaymentMethod, discountValuePaymentMethod, discountTypePaymentMethod, surchargeValuePaymentMethod, surchargeTypePaymentMethod, isActivePaymentMethod, idPaymentMethod]
          );
          if (!result.affectedRows) throw new SaleValidationError("Forma de pagamento não encontrada.", 404);
          json(response, 200, { idPaymentMethod });
        }
      } catch (error) {
        handleError(response, error, { log: "Falha ao salvar forma de pagamento:", message: "Não foi possível salvar a forma de pagamento.", duplicate: "Essa forma de pagamento já existe." });
      }
      return;
    }
  }

  if (request.method === "DELETE" && request.url === "/api/payment-methods") {
    try {
      await ensurePaymentMethodSchema();
      const payload = await readJsonBody(request);
      const idPaymentMethod = parsePositiveId(payload.idPaymentMethod);
      if (!idPaymentMethod) throw new SaleValidationError("Forma de pagamento inválida.");
      const [result] = await pool.query("DELETE FROM payment_methods WHERE idPaymentMethod = ?", [idPaymentMethod]);
      if (!result.affectedRows) throw new SaleValidationError("Forma de pagamento não encontrada.", 404);
      json(response, 200, { ok: true, idPaymentMethod });
    } catch (error) {
      handleError(response, error, { log: "Falha ao excluir forma de pagamento:", message: "Não foi possível excluir a forma de pagamento.", duplicate: "" });
    }
    return;
  }

  if (request.method === "PUT" && request.url === "/api/payment-methods/status") {
    try {
      await ensurePaymentMethodSchema();
      const payload = await readJsonBody(request);
      const idPaymentMethod = parsePositiveId(payload.idPaymentMethod);
      const validStatus = [true, false, 0, 1].includes(payload.isActivePaymentMethod);
      const isActivePaymentMethod = payload.isActivePaymentMethod === true || payload.isActivePaymentMethod === 1;
      if (!idPaymentMethod || !validStatus) throw new SaleValidationError("Forma de pagamento ou status inválido.");
      const [result] = await pool.query(
        "UPDATE payment_methods SET isActivePaymentMethod = ? WHERE idPaymentMethod = ?",
        [isActivePaymentMethod ? 1 : 0, idPaymentMethod]
      );
      if (!result.affectedRows) throw new SaleValidationError("Forma de pagamento não encontrada.", 404);
      json(response, 200, { ok: true, idPaymentMethod, isActivePaymentMethod: isActivePaymentMethod ? 1 : 0 });
    } catch (error) {
      handleError(response, error, { log: "Falha ao alterar status da forma de pagamento:", message: "Não foi possível alterar o status da forma de pagamento.", duplicate: "" });
    }
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/api/fiscal-catalogs")) {
    try {
      const catalog = new URL(request.url, "http://localhost").searchParams.get("catalog");
      if (!catalog || !fiscalCatalogNames.has(catalog)) throw new SaleValidationError("Catálogo fiscal inválido.");
      const includeInactive = new URL(request.url, "http://localhost").searchParams.get("includeInactive") === "1";
      const [items] = await pool.query(
        `SELECT idFiscalCatalogItem, catalogFiscalCatalogItem,
                codeFiscalCatalogItem, descriptionFiscalCatalogItem,
                valueFiscalCatalogItem, isActiveFiscalCatalogItem
         FROM fiscal_catalog_items
         WHERE catalogFiscalCatalogItem = ? AND (? OR isActiveFiscalCatalogItem = 1)
         ORDER BY codeFiscalCatalogItem, descriptionFiscalCatalogItem`,
        [catalog, includeInactive]
      );
      json(response, 200, { catalog, label: fiscalCatalogDefinitions[catalog].label, items });
    } catch (error) {
      handleError(response, error, { log: "Falha ao listar catálogo fiscal:", message: "Não foi possível consultar o catálogo fiscal.", duplicate: "" });
    }
    return;
  }

  if ((request.method === "POST" || request.method === "PUT") && request.url === "/api/fiscal-catalogs") {
    try {
      const payload = await readJsonBody(request);
      const catalog = typeof payload.catalogFiscalCatalogItem === "string" ? payload.catalogFiscalCatalogItem.trim() : "";
      const idFiscalCatalogItem = request.method === "PUT" ? parsePositiveId(payload.idFiscalCatalogItem) : null;
      const descriptionFiscalCatalogItem = typeof payload.descriptionFiscalCatalogItem === "string" ? payload.descriptionFiscalCatalogItem.trim() : "";
      let codeFiscalCatalogItem = typeof payload.codeFiscalCatalogItem === "string" ? payload.codeFiscalCatalogItem.trim() : "";
      if (catalog === "cfops") codeFiscalCatalogItem = normalizeCfopCode(codeFiscalCatalogItem);
      if (slugCodeCatalogs.has(catalog)) codeFiscalCatalogItem = slugifyCatalogDescription(descriptionFiscalCatalogItem);
      if (autoCodeCatalogs.has(catalog) && request.method === "PUT") {
        const [existing] = await pool.query(
          "SELECT codeFiscalCatalogItem FROM fiscal_catalog_items WHERE idFiscalCatalogItem = ? AND catalogFiscalCatalogItem = ?",
          [idFiscalCatalogItem, catalog]
        );
        codeFiscalCatalogItem = existing[0]?.codeFiscalCatalogItem || "";
      }
      if (autoCodeCatalogs.has(catalog) && request.method === "POST") {
        const [nextCodeRows] = await pool.query(
          `SELECT COALESCE(MAX(CAST(codeFiscalCatalogItem AS UNSIGNED)), 0) + 1 AS nextCode
           FROM fiscal_catalog_items
           WHERE catalogFiscalCatalogItem = ?`,
          [catalog]
        );
        codeFiscalCatalogItem = String(nextCodeRows[0].nextCode);
      }
      const valueFiscalCatalogItem = payload.valueFiscalCatalogItem === "" || payload.valueFiscalCatalogItem == null
        ? null
        : Number(payload.valueFiscalCatalogItem);
      if (
        !fiscalCatalogNames.has(catalog) ||
        (request.method === "PUT" && !idFiscalCatalogItem) ||
        (!codeFiscalCatalogItem && !autoCodeCatalogs.has(catalog)) ||
        (catalog === "cfops" && !/^\d\.\d{3}$/.test(codeFiscalCatalogItem)) ||
        (slugCodeCatalogs.has(catalog) && !codeFiscalCatalogItem) ||
        codeFiscalCatalogItem.length > 30 ||
        !descriptionFiscalCatalogItem ||
        descriptionFiscalCatalogItem.length > 255 ||
        (valueFiscalCatalogItem !== null && (!Number.isFinite(valueFiscalCatalogItem) || valueFiscalCatalogItem < 0))
      ) {
        throw new SaleValidationError("Catálogo, código ou descrição fiscal inválidos.");
      }
      const fields = [catalog, codeFiscalCatalogItem, descriptionFiscalCatalogItem, valueFiscalCatalogItem];
      if (request.method === "POST") {
        const [result] = await pool.query(
          `INSERT INTO fiscal_catalog_items
            (catalogFiscalCatalogItem, codeFiscalCatalogItem, descriptionFiscalCatalogItem, valueFiscalCatalogItem)
           VALUES (?, ?, ?, ?)`,
          fields
        );
        json(response, 201, { idFiscalCatalogItem: result.insertId });
      } else {
        const [result] = await pool.query(
          `UPDATE fiscal_catalog_items
           SET catalogFiscalCatalogItem = ?, codeFiscalCatalogItem = ?,
               descriptionFiscalCatalogItem = ?, valueFiscalCatalogItem = ?
           WHERE idFiscalCatalogItem = ?`,
          [...fields, idFiscalCatalogItem]
        );
        if (!result.affectedRows) throw new SaleValidationError("Item do catálogo fiscal não encontrado.", 404);
        json(response, 200, { idFiscalCatalogItem });
      }
    } catch (error) {
      handleError(response, error, { log: "Falha ao salvar item do catálogo fiscal:", message: "Não foi possível salvar o item do catálogo fiscal.", duplicate: "O código já está cadastrado neste catálogo fiscal." });
    }
    return;
  }

  if (request.method === "DELETE" && request.url === "/api/fiscal-catalogs") {
    try {
      const payload = await readJsonBody(request);
      const idFiscalCatalogItem = parsePositiveId(payload.idFiscalCatalogItem);
      if (!idFiscalCatalogItem) throw new SaleValidationError("Item do catálogo fiscal inválido.");
      const [result] = await pool.query("DELETE FROM fiscal_catalog_items WHERE idFiscalCatalogItem = ?", [idFiscalCatalogItem]);
      if (!result.affectedRows) throw new SaleValidationError("Item do catálogo fiscal não encontrado.", 404);
      json(response, 200, { ok: true, idFiscalCatalogItem });
    } catch (error) {
      handleError(response, error, { log: "Falha ao excluir item do catálogo fiscal:", message: "Não foi possível excluir o item do catálogo fiscal.", duplicate: "" });
    }
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/api/fiscal-operations")) {
    try {
      const includeInactive = request.url.includes("includeInactive=1");
      const [fiscalOperations] = await pool.query(
        `SELECT idFiscalOperation, descriptionFiscalOperation,
                taxRegimeFiscalOperation, typeFiscalOperation, contextFiscalOperation,
                taxSituationFiscalOperation, originFiscalOperation, cfopFiscalOperation,
                operationNatureFiscalOperation, ipiSituationFiscalOperation,
                icmsBaseModeFiscalOperation, icmsStBaseModeFiscalOperation,
                icmsExemptionReasonFiscalOperation, cofinsSituationFiscalOperation,
                pisSituationFiscalOperation, fcpEnabledFiscalOperation,
                fcpUseReductionBaseFiscalOperation, fcpStEnabledFiscalOperation,
                fcpStUseReductionBaseFiscalOperation, fiscalBenefitCodeFiscalOperation,
                legalBasisFiscalOperation, isActiveFiscalOperation
         FROM fiscal_operations
         WHERE (? OR isActiveFiscalOperation = 1)
         ORDER BY COALESCE(cfopFiscalOperation, ''), descriptionFiscalOperation`,
        [includeInactive]
      );
      json(response, 200, { fiscalOperations });
    } catch (error) {
      handleError(response, error, { log: "Falha ao listar operações fiscais:", message: "Não foi possível consultar as operações fiscais.", duplicate: "" });
    }
    return;
  }

  if ((request.method === "POST" || request.method === "PUT") && request.url === "/api/fiscal-operations") {
    try {
      const payload = await readJsonBody(request);
      const idFiscalOperation = request.method === "PUT" ? parsePositiveId(payload.idFiscalOperation) : null;
      const descriptionFiscalOperation = typeof payload.descriptionFiscalOperation === "string" ? payload.descriptionFiscalOperation.trim() : "";
      const taxRegimeFiscalOperation = typeof payload.taxRegimeFiscalOperation === "string" ? payload.taxRegimeFiscalOperation.trim() : "";
      const typeFiscalOperation = payload.typeFiscalOperation;
      const contextFiscalOperation = payload.contextFiscalOperation;
      const cfopFiscalOperation = typeof payload.cfopFiscalOperation === "string" ? payload.cfopFiscalOperation.trim() : "";
      if (
        (request.method === "PUT" && !idFiscalOperation) ||
        !descriptionFiscalOperation ||
        descriptionFiscalOperation.length > 180 ||
        !taxRegimeFiscalOperation ||
        !["entry", "exit"].includes(typeFiscalOperation) ||
        typeof contextFiscalOperation !== "string"
      ) {
        throw new SaleValidationError("Descrição, regime, tipo ou contexto fiscal inválido.");
      }
      const [
        taxRegimesFiscalOperation,
        typesFiscalOperation,
        contextsFiscalOperation,
        taxSituationsFiscalOperation,
        originsFiscalOperation,
        ipiSituationsFiscalOperation,
        contributionSituationsFiscalOperation,
        baseModesFiscalOperation,
        exemptionReasonsFiscalOperation
      ] = await Promise.all([
        catalogValues("tax-regimes"),
        catalogValues("operation-types"),
        catalogValues("contexts"),
        catalogValues("tax-situations"),
        catalogValues("origins"),
        catalogValues("ipi-situations"),
        catalogValues("contribution-situations"),
        catalogValues("base-modes"),
        catalogValues("exemption-reasons")
      ]);
      let operationNatureFiscalOperation = null;
      if (cfopFiscalOperation) {
        const [cfopRows] = await pool.query(
          `SELECT descriptionFiscalCatalogItem
           FROM fiscal_catalog_items
           WHERE catalogFiscalCatalogItem = 'cfops'
             AND codeFiscalCatalogItem = ?
             AND isActiveFiscalCatalogItem = 1`,
          [cfopFiscalOperation]
        );
        if (!cfopRows.length) {
          throw new SaleValidationError("CFOP inválido.");
        }
        operationNatureFiscalOperation = cfopRows[0].descriptionFiscalCatalogItem;
      }
      if (
        (request.method === "PUT" && !idFiscalOperation) ||
        !descriptionFiscalOperation ||
        descriptionFiscalOperation.length > 180 ||
        !taxRegimesFiscalOperation.has(taxRegimeFiscalOperation) ||
        !typesFiscalOperation.has(typeFiscalOperation) ||
        !contextsFiscalOperation.has(contextFiscalOperation) ||
        (payload.taxSituationFiscalOperation && !taxSituationsFiscalOperation.has(String(payload.taxSituationFiscalOperation))) ||
        (payload.originFiscalOperation && !originsFiscalOperation.has(String(payload.originFiscalOperation))) ||
        (payload.ipiSituationFiscalOperation && !ipiSituationsFiscalOperation.has(String(payload.ipiSituationFiscalOperation))) ||
        (payload.cofinsSituationFiscalOperation && !contributionSituationsFiscalOperation.has(String(payload.cofinsSituationFiscalOperation))) ||
        (payload.pisSituationFiscalOperation && !contributionSituationsFiscalOperation.has(String(payload.pisSituationFiscalOperation))) ||
        (payload.icmsBaseModeFiscalOperation && !baseModesFiscalOperation.has(String(payload.icmsBaseModeFiscalOperation))) ||
        (payload.icmsStBaseModeFiscalOperation && !baseModesFiscalOperation.has(String(payload.icmsStBaseModeFiscalOperation))) ||
        (payload.icmsExemptionReasonFiscalOperation && !exemptionReasonsFiscalOperation.has(String(payload.icmsExemptionReasonFiscalOperation)))
      ) {
        throw new SaleValidationError("Descrição, regime, tipo ou contexto fiscal inválido.");
      }
      const fields = [
        descriptionFiscalOperation, taxRegimeFiscalOperation, typeFiscalOperation, contextFiscalOperation,
        payload.taxSituationFiscalOperation || null, payload.originFiscalOperation || null, cfopFiscalOperation || null,
        operationNatureFiscalOperation, payload.ipiSituationFiscalOperation || null,
        payload.icmsBaseModeFiscalOperation || null, payload.icmsStBaseModeFiscalOperation || null,
        payload.icmsExemptionReasonFiscalOperation || null, payload.cofinsSituationFiscalOperation || null,
        payload.pisSituationFiscalOperation || null, payload.fcpEnabledFiscalOperation ? 1 : 0,
        payload.fcpUseReductionBaseFiscalOperation ? 1 : 0,
        payload.fcpStEnabledFiscalOperation ? 1 : 0,
        payload.fcpStUseReductionBaseFiscalOperation ? 1 : 0,
        payload.fiscalBenefitCodeFiscalOperation || null,
        payload.legalBasisFiscalOperation || null
      ];
      if (request.method === "POST") {
        const [result] = await pool.query(
          `INSERT INTO fiscal_operations
            (descriptionFiscalOperation, taxRegimeFiscalOperation,
             typeFiscalOperation, contextFiscalOperation, taxSituationFiscalOperation,
             originFiscalOperation, cfopFiscalOperation, operationNatureFiscalOperation,
             ipiSituationFiscalOperation, icmsBaseModeFiscalOperation,
             icmsStBaseModeFiscalOperation, icmsExemptionReasonFiscalOperation,
             cofinsSituationFiscalOperation, pisSituationFiscalOperation,
             fcpEnabledFiscalOperation, fcpUseReductionBaseFiscalOperation,
             fcpStEnabledFiscalOperation, fcpStUseReductionBaseFiscalOperation,
             fiscalBenefitCodeFiscalOperation, legalBasisFiscalOperation)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          fields
        );
        json(response, 201, { idFiscalOperation: result.insertId });
      } else {
        const [result] = await pool.query(
          `UPDATE fiscal_operations SET
             descriptionFiscalOperation = ?, taxRegimeFiscalOperation = ?,
             typeFiscalOperation = ?, contextFiscalOperation = ?, taxSituationFiscalOperation = ?,
             originFiscalOperation = ?, cfopFiscalOperation = ?, operationNatureFiscalOperation = ?,
             ipiSituationFiscalOperation = ?, icmsBaseModeFiscalOperation = ?,
             icmsStBaseModeFiscalOperation = ?, icmsExemptionReasonFiscalOperation = ?,
             cofinsSituationFiscalOperation = ?, pisSituationFiscalOperation = ?,
             fcpEnabledFiscalOperation = ?, fcpUseReductionBaseFiscalOperation = ?,
             fcpStEnabledFiscalOperation = ?, fcpStUseReductionBaseFiscalOperation = ?,
             fiscalBenefitCodeFiscalOperation = ?, legalBasisFiscalOperation = ?
           WHERE idFiscalOperation = ?`,
          [...fields, idFiscalOperation]
        );
        if (!result.affectedRows) throw new SaleValidationError("Operação fiscal não encontrada.", 404);
        json(response, 200, { idFiscalOperation });
      }
    } catch (error) {
      handleError(response, error, { log: "Falha ao salvar operação fiscal:", message: "Não foi possível salvar a operação fiscal.", duplicate: "O código da operação fiscal já existe." });
    }
    return;
  }

  if (request.method === "DELETE" && request.url === "/api/fiscal-operations") {
    try {
      const payload = await readJsonBody(request);
      const idFiscalOperation = parsePositiveId(payload.idFiscalOperation);
      if (!idFiscalOperation) throw new SaleValidationError("Operação fiscal inválida.");
      const [result] = await pool.query("DELETE FROM fiscal_operations WHERE idFiscalOperation = ?", [idFiscalOperation]);
      if (!result.affectedRows) throw new SaleValidationError("Operação fiscal não encontrada.", 404);
      json(response, 200, { ok: true, idFiscalOperation });
    } catch (error) {
      handleError(response, error, { log: "Falha ao excluir operação fiscal:", message: "Não foi possível excluir a operação fiscal.", duplicate: "" });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/sales") {
    let connection;
    try {
      const payload = await readJsonBody(request);
      connection = await pool.getConnection();
      const result = await createSale(connection, payload);
      json(response, result.idempotent ? 200 : 201, result);
    } catch (error) {
      handleError(response, error, { log: "Falha ao registrar venda:", message: "Não foi possível registrar a venda.", duplicate: "" });
    } finally {
      connection?.release();
    }
    return;
  }

  json(response, 404, { error: "Rota não encontrada." });
});
server.listen(config.apiPort, config.apiHost, () => {
  console.log(`API PDV ouvindo em http://${config.apiHost}:${config.apiPort}`);
  void ensureFiscalCatalogSchema().catch((error) => {
    console.error("Falha ao preparar os cadastros fiscais:", error);
  });
  void ensureFiscalOperationSchema().catch((error) => {
    console.error("Falha ao preparar as operações fiscais:", error);
  });
  void ensureNcmCestSchema().catch((error) => {
    console.error("Falha ao preparar o cadastro NCM / CEST:", error);
  });
  void ensureProductFiscalSchema().catch((error) => {
    console.error("Falha ao preparar os campos fiscais dos produtos:", error);
  });
  void ensureProductCatalogSchema().catch((error) => {
    console.error("Falha ao preparar os cadastros auxiliares de produtos:", error);
  });
  void ensurePrinterSettingsSchema().catch((error) => {
    console.error("Falha ao preparar as configurações de impressora:", error);
  });
  void ensureGeneralSettingsSchema().catch((error) => {
    console.error("Falha ao preparar as configurações gerais:", error);
  });
  void ensureCompanySchema().catch((error) => {
    console.error("Falha ao preparar o cadastro da empresa:", error);
  });
  void ensureNavigationSchema().catch((error) => {
    console.error("Falha ao preparar a estrutura de navegação:", error);
  });
});
