import { createServer } from "node:http";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import forge from "node-forge";
import { createPool } from "./database.js";
import { loadRuntimeConfig } from "./config.js";
import { cancelSale, createSale, listRecentSales, SaleValidationError } from "./sale-service.js";
import { parseImportBoolean, parseImportStatus } from "../shared/import-values.js";
import {
  authorizeSaleNfce,
  buildNfceDiagnostic,
  runNfceHomologationTest
} from "./nfce-test-service.js";
import {
  isNavigationKey,
  normalizeNavigationKey
} from "../shared/navigation-defaults.js";
import {
  DEFAULT_CEST_SOURCE_URL,
  DEFAULT_NCM_SOURCE_URL,
  validateOfficialSourceUrl,
  updateCatalog
} from "./ncm-cest-update.js";
import { normalizeCatalogPage, parseCatalogPagination } from "./catalog-pagination.js";
import {
  createBackup,
  listBackups,
  readBackup,
  resolveBackupDirectory,
  restoreBackup
} from "./backup-service.js";
import { createSchemaManager } from "./schema-manager.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createOperatorSessionToken,
  hashOperatorPassword,
  hashOperatorSessionToken,
  normalizeOperatorPassword,
  normalizeOperatorUsername,
  sessionExpiration,
  verifyOperatorPassword,
  isOperatorRole
} from "./operator-service.js";
import {
  closeCashSession,
  getOpenCashSession,
  normalizeCashAmount,
  openCashSession,
  requireOperatorSession
} from "./cash-service.js";
import {
  DEFAULT_PRINT_PLACE,
  normalizePrintPlace
} from "../shared/print-place.js";
import { findRecipeCycles, validateRecipeDefinition } from "../shared/recipe.js";

const culinaryBaseForUnit = (unit = {}) => {
  const value = `${unit.codeUnit || ""} ${unit.descriptionUnit || ""}`.toLocaleLowerCase("pt-BR");
  if (/(^|[\s/])(kg|g|grama|gramas|quilo|quilos|peso)([\s/]|\b)/.test(value)) return "g";
  if (/(^|[\s/])(l|lt|ml|litro|litros|mililitro|mililitros|volume)([\s/]|\b)/.test(value)) return "ml";
  if (/(^|[\s/])(un|und|unidade|unidades|peca|pecas)([\s/]|\b)/.test(value)) return "un";
  return null;
};

const packageJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const applicationVersion = String(packageJson.version);
const config = await loadRuntimeConfig();
if (!config.apiToken) {
  throw new Error("PDV_API_TOKEN não configurado. A API não pode iniciar sem autenticação.");
}
if (!config.database.password) {
  throw new Error("Senha do MariaDB não configurada no Credential Manager ou no ambiente de desenvolvimento.");
}
const pool = createPool(config);
const {
  ensureFiscalCatalogSchema,
  ensurePrinterSettingsSchema,
  ensureGeneralSettingsSchema,
  loadGeneralSourceSettings,
  ensureCustomerConsumerSchema,
  migrateCustomerConsumerSchema,
  ensureRecipeSchema,
  getGeneralSettingBoolean,
  ensureCompanySchema,
  ensureSaleFiscalSchema,
  ensureFiscalOperationSchema,
  ensureNcmCestSchema,
  ensureProductFiscalSchema,
  ensureProductCatalogSchema,
  ensureCulinarySchema,
  ensureNavigationSchema,
  ensurePaymentMethodSchema,
  ensureSupplierSchema,
  ensureOperatorCashSchema
} = createSchemaManager({ pool, config });
const applicationRoot = join(import.meta.dirname, "../..");
const backupOptions = () => ({
  applicationRoot,
  configuredDirectory: config.backupDirectory,
  runtimeEnvironment: config.runtimeEnvironment,
  databaseName: config.database.name
});
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
    getOpenSslPath(),
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
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
};

const isAllowedOrigin = (origin) => !origin || config.apiAllowedOrigins.includes(origin);
const setCorsHeaders = (response, origin) => {
  if (origin && isAllowedOrigin(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
};

const authenticateRequest = async (request, response) => {
  const origin = request.headers.origin;
  if (!isAllowedOrigin(origin)) {
    json(response, 403, { error: "Origem não autorizada." });
    return false;
  }
  const authorization = String(request.headers.authorization || "");
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (token !== config.apiToken) {
    json(response, 401, { error: "Autenticação obrigatória." });
    return false;
  }
  const operatorToken = request.url === "/api/operator/login"
    ? ""
    : String(request.headers["x-operator-session"] || "").trim();
  if (operatorToken) {
    const [sessions] = await pool.query(
      `SELECT os.idOperatorSession, o.idOperator, o.usernameOperator,
              o.displayNameOperator, o.roleOperator
       FROM operator_sessions os
       JOIN operators o ON o.idOperator = os.idOperator
       WHERE os.tokenHashOperatorSession = ?
         AND os.expiresAtOperatorSession > CURRENT_TIMESTAMP
         AND o.isActiveOperator = 1
       LIMIT 1`,
      [hashOperatorSessionToken(operatorToken)]
    );
    if (!sessions.length) {
      json(response, 401, { error: "Sessão do operador inválida ou expirada." });
      return false;
    }
    request.operatorSession = sessions[0];
    request.operatorSessionToken = operatorToken;
  }
  return true;
};

const readJsonBody = async (request, maximumSize = 5 * 1024 * 1024) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumSize) throw new SaleValidationError("Corpo da requisição muito grande.", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new SaleValidationError("JSON inválido.");
  }
};

const binary = (response, status, contentType, contentDisposition, content) => {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Content-Disposition": contentDisposition,
    "Content-Length": content.length,
    "Cache-Control": "no-store"
  });
  response.end(content);
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

const protectedNavigationMenuKeys = new Set(["sales", "tools", "settings", "exit"]);

const assertNavigationActivationAllowed = (menuKey, active) => {
  if (!active && protectedNavigationMenuKeys.has(menuKey)) {
    throw new SaleValidationError("Os menus fixos e seus itens não podem ser desativados.");
  }
};

const assertFixedSalesMenuUpdate = (payload) => {
  if (payload.keyNavigationMenu !== undefined
    && normalizeNavigationKey(payload.keyNavigationMenu) !== "sales") {
    throw new SaleValidationError("O menu Frente de Caixa é fixo.");
  }
  if (payload.labelNavigationMenu !== undefined
    && String(payload.labelNavigationMenu).trim() !== "Frente de Caixa") {
    throw new SaleValidationError("O menu Frente de Caixa é fixo.");
  }
  if (payload.orderNavigationMenu !== undefined && Number(payload.orderNavigationMenu) !== 0) {
    throw new SaleValidationError("O menu Frente de Caixa é fixo.");
  }
  if (payload.isActiveNavigationMenu !== undefined
    && parseNavigationBoolean(payload.isActiveNavigationMenu, "Status do menu") !== 1) {
    throw new SaleValidationError("O menu Frente de Caixa é fixo.");
  }
};

const parseNavigationType = (value) => {
  if (!["item", "submenu", "bar", "divider"].includes(value)) {
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

const normalizeHumanText = (value) => {
  const minorWords = new Set(["a", "as", "à", "às", "ao", "aos", "da", "das", "de", "do", "dos", "e", "em", "no", "na", "nos", "nas", "por", "para"]);
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR")
    .split(/(\s+|\/|-)/u)
    .map((part, index) => {
      if (!part || /^\s+$/u.test(part) || part === "/" || part === "-") return part;
      if (index > 0 && minorWords.has(part)) return part;
      return `${part.charAt(0).toLocaleUpperCase("pt-BR")}${part.slice(1)}`;
    })
    .join("");
};

const normalizeTextForComparison = (value) =>
  normalizeHumanText(value).toLocaleUpperCase("pt-BR");

const isNonSaleProductType = (description) =>
  ["MATÉRIA-PRIMA", "EMBALAGEM", "MATERIAL DE USO E CONSUMO"].includes(
    normalizeTextForComparison(description)
  );

const parseNonNegativeQuantity = (value) => {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(String(value))) {
    throw new SaleValidationError("Estoque inicial inválido.");
  }
  return String(value);
};

const parseBrazilianDecimal = (value) => {
  const text = String(value ?? "").trim().replace(/\s/g, "");
  if (!text) return NaN;
  return Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
};

const normalizeReferenceCode = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLowerCase()
  .replace(/\s+/g, "_")
  .replace(/[^a-z0-9_-]/g, "")
  .slice(0, 30);

const normalizeUnitCode = (value) => normalizeReferenceCode(value).toUpperCase();

const parseBooleanFlag = (value, fieldName, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback ? 1 : 0;
  if (![true, false, 0, 1, "0", "1", "true", "false"].includes(value)) {
    throw new SaleValidationError(`${fieldName} inválido.`);
  }
  return value === true || value === 1 || value === "1" || value === "true" ? 1 : 0;
};

const CONFIGURABLE_PRINT_PLACE_TYPES = new Set([
  "MERCADORIA PARA REVENDA",
  "PRODUTO ACABADO",
  "PRODUTOS ACABADOS"
]);

const parsePrintPlace = (value, fieldName = "Local de impressão", fallback = DEFAULT_PRINT_PLACE) => {
  const normalized = normalizePrintPlace(value, fallback);
  if (!normalized) {
    throw new SaleValidationError(
      `${fieldName} inválido. Use: Não Imprimir, Bar, Copa ou Cozinha.`
    );
  }
  return normalized;
};

const resolvePrintPlace = (value, productTypeDescription, legacyValue) => {
  if (!CONFIGURABLE_PRINT_PLACE_TYPES.has(normalizeTextForComparison(productTypeDescription))) {
    return DEFAULT_PRINT_PLACE;
  }
  return parsePrintPlace(
    value,
    "Local de impressão",
    legacyValue === true || legacyValue === 1 ? "Cozinha" : DEFAULT_PRINT_PLACE
  );
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
    const details = [
      error?.code ? `code=${error.code}` : "",
      error?.errno !== undefined ? `errno=${error.errno}` : "",
      error?.sqlState ? `sqlState=${error.sqlState}` : "",
      error?.sqlMessage || error?.message
        ? `message=${error.sqlMessage || error.message}` : ""
    ].filter(Boolean).join(" ");
    console.error(`${fallback.log} ${details}`.trim());
    json(response, 503, { error: fallback.message });
  }
};

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  setCorsHeaders(response, origin);
  if (request.method === "OPTIONS") {
    if (!isAllowedOrigin(origin)) {
      json(response, 403, { error: "Origem não autorizada." });
      return;
    }
    response.writeHead(204, {
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Operator-Session",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
    });
    response.end();
    return;
  }
  if (request.url.startsWith("/api/") && !(await authenticateRequest(request, response))) return;

  if (request.method === "POST" && request.url === "/api/operator/login") {
    try {
      await ensureOperatorCashSchema();
      const payload = await readJsonBody(request);
      const username = normalizeOperatorUsername(payload?.usernameOperator);
      const password = normalizeOperatorPassword(payload?.passwordOperator);
      const [operators] = await pool.query(
        `SELECT idOperator, usernameOperator, displayNameOperator,
                passwordHashOperator, roleOperator
         FROM operators
         WHERE usernameOperator = ? AND isActiveOperator = 1
         LIMIT 1`,
        [username]
      );
      if (!operators.length || !verifyOperatorPassword(password, operators[0].passwordHashOperator)) {
        throw new SaleValidationError("Usuário ou senha inválidos.", 401);
      }
      const token = createOperatorSessionToken();
      const expiresAt = sessionExpiration();
      await pool.query(
        `INSERT INTO operator_sessions
          (idOperator, tokenHashOperatorSession, expiresAtOperatorSession)
         VALUES (?, ?, ?)`,
        [operators[0].idOperator, hashOperatorSessionToken(token), expiresAt]
      );
      json(response, 200, {
        token,
        expiresAtOperatorSession: expiresAt.toISOString(),
        operator: {
          idOperator: operators[0].idOperator,
          usernameOperator: operators[0].usernameOperator,
          displayNameOperator: operators[0].displayNameOperator,
          roleOperator: operators[0].roleOperator
        }
      });
    } catch (error) {
      handleError(response, error, { log: "Falha no login do operador:", message: "Não foi possível autenticar o operador.", duplicate: "" });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/operator/logout") {
    try {
      if (request.operatorSessionToken) {
        await pool.query(
          "DELETE FROM operator_sessions WHERE tokenHashOperatorSession = ?",
          [hashOperatorSessionToken(request.operatorSessionToken)]
        );
      }
      json(response, 200, { ok: true });
    } catch (error) {
      handleError(response, error, { log: "Falha ao encerrar sessão:", message: "Não foi possível encerrar a sessão.", duplicate: "" });
    }
    return;
  }

  if (request.method === "GET" && request.url === "/api/operator/session") {
    try {
      const session = requireOperatorSession(request);
      json(response, 200, { operator: session });
    } catch (error) {
      handleError(response, error, { log: "Falha ao consultar sessão:", message: "Não foi possível consultar a sessão.", duplicate: "" });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/operators") {
    try {
      const session = requireOperatorSession(request);
      if (session.roleOperator !== "admin") {
        throw new SaleValidationError("Somente admin pode cadastrar operadores.", 403);
      }
      const payload = await readJsonBody(request);
      const username = normalizeOperatorUsername(payload?.usernameOperator);
      const password = normalizeOperatorPassword(payload?.passwordOperator);
      const displayName = String(payload?.displayNameOperator ?? "").trim();
      const role = String(payload?.roleOperator ?? "operator");
      if (!displayName || displayName.length > 160 || !isOperatorRole(role)) {
        throw new SaleValidationError("Dados do operador inválidos.");
      }
      const [result] = await pool.query(
        `INSERT INTO operators
          (usernameOperator, displayNameOperator, passwordHashOperator, roleOperator)
         VALUES (?, ?, ?, ?)`,
        [username, displayName, hashOperatorPassword(password), role]
      );
      json(response, 201, { idOperator: result.insertId });
    } catch (error) {
      handleError(response, error, { log: "Falha ao cadastrar operador:", message: "Não foi possível cadastrar o operador.", duplicate: "O usuário do operador já existe." });
    }
    return;
  }

  if (request.method === "GET" && request.url === "/api/cash/current") {
    try {
      requireOperatorSession(request);
      const session = await getOpenCashSession(pool, 1);
      json(response, 200, { cashSession: session });
    } catch (error) {
      handleError(response, error, { log: "Falha ao consultar caixa:", message: "Não foi possível consultar o caixa.", duplicate: "" });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/cash/open") {
    let connection;
    try {
      const session = requireOperatorSession(request);
      connection = await pool.getConnection();
      const result = await openCashSession(connection, session, await readJsonBody(request));
      json(response, 201, result);
    } catch (error) {
      handleError(response, error, { log: "Falha ao abrir caixa:", message: "Não foi possível abrir o caixa.", duplicate: "" });
    } finally {
      connection?.release();
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/cash/close") {
    let connection;
    try {
      const session = requireOperatorSession(request);
      if (!["supervisor", "admin"].includes(session.roleOperator)) {
        throw new SaleValidationError("Somente supervisor ou admin pode fechar o caixa.", 403);
      }
      connection = await pool.getConnection();
      const result = await closeCashSession(connection, session, await readJsonBody(request));
      json(response, 200, result);
    } catch (error) {
      handleError(response, error, { log: "Falha ao fechar caixa:", message: "Não foi possível fechar o caixa.", duplicate: "" });
    } finally {
      connection?.release();
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/cash/movements") {
    let connection;
    try {
      const session = requireOperatorSession(request);
      const payload = await readJsonBody(request);
      const type = String(payload?.typeCashMovement ?? "");
      if (!["supply", "withdrawal"].includes(type)) {
        throw new SaleValidationError("Tipo de movimento de caixa inválido.");
      }
      const amount = normalizeCashAmount(payload?.amountCashMovement, "Valor do movimento");
      if (amount <= 0) throw new SaleValidationError("O valor do movimento deve ser positivo.");
      const description = String(payload?.descriptionCashMovement ?? "").trim();
      if (description.length < 3 || description.length > 500) {
        throw new SaleValidationError("Informe uma descrição para o movimento.");
      }
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const [[cashSession]] = await connection.query(
        `SELECT idCashSession
         FROM cash_sessions
         WHERE idCashRegister = 1 AND statusCashSession = 'open'
         FOR UPDATE`
      );
      if (!cashSession) throw new SaleValidationError("Não existe caixa aberto.", 409);
      const signedAmount = type === "withdrawal" ? -amount : amount;
      await connection.query(
        `INSERT INTO cash_movements
          (idCashSession, idOperator, typeCashMovement, amountCashMovement, descriptionCashMovement)
         VALUES (?, ?, ?, ?, ?)`,
        [cashSession.idCashSession, session.idOperator, type, (signedAmount / 100).toFixed(2), description]
      );
      await connection.query(
        `UPDATE cash_sessions
         SET expectedClosingAmountCashSession =
           expectedClosingAmountCashSession + ?
         WHERE idCashSession = ?`,
        [(signedAmount / 100).toFixed(2), cashSession.idCashSession]
      );
      await connection.commit();
      json(response, 201, { ok: true, idCashSession: cashSession.idCashSession });
    } catch (error) {
      if (connection) await connection.rollback().catch(() => {});
      handleError(response, error, { log: "Falha ao registrar movimento de caixa:", message: "Não foi possível registrar o movimento.", duplicate: "" });
    } finally {
      connection?.release();
    }
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/api/customers")) {
    try {
      await ensureCustomerConsumerSchema();
      const includeInactive = new URL(request.url, "http://localhost").searchParams.get("includeInactive") === "1";
      const [customers] = await pool.query(
        `SELECT c.idCustomer, c.nameCustomer, c.documentCustomer, c.phoneCustomer,
                c.emailCustomer, c.addressCustomer, c.creditLimitCustomer,
                c.notesCustomer, c.isActiveCustomer,
                co.idConsumer, co.nameConsumer
         FROM customers c LEFT JOIN consumers co ON co.idCustomer = c.idCustomer
         WHERE (? OR c.isActiveCustomer = 1)
         ORDER BY c.nameCustomer, c.idCustomer`,
        [includeInactive]
      );
      json(response, 200, { customers });
    } catch (error) {
      handleError(response, error, { log: "Falha ao listar clientes:", message: "Não foi possível consultar os clientes.", duplicate: "" });
    }
    return;
  }

  if ((request.method === "POST" || request.method === "PUT") && request.url === "/api/customers") {
    try {
      const payload = await readJsonBody(request);
      const idCustomer = request.method === "PUT" ? parsePositiveId(payload.idCustomer) : null;
      const text = (field, max) => typeof payload[field] === "string" ? payload[field].trim().slice(0, max) : "";
      const humanText = (field, max) => normalizeHumanText(text(field, max));
      const nameCustomer = humanText("nameCustomer", 180);
      const documentDigits = text("documentCustomer", 20).replace(/\D/g, "");
      const documentCustomer = documentDigits || null;
      const phoneCustomer = text("phoneCustomer", 25);
      const emailCustomer = text("emailCustomer", 180).toLocaleLowerCase("pt-BR");
      const addressCustomer = humanText("addressCustomer", 180);
      const creditLimitCustomer = Number(payload.creditLimitCustomer || 0);
      const notesCustomer = humanText("notesCustomer", 400);
      if ((request.method === "PUT" && !idCustomer) || !nameCustomer
        || !Number.isFinite(creditLimitCustomer) || creditLimitCustomer < 0
        || (emailCustomer && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailCustomer))) {
        throw new SaleValidationError("Informe o nome e valores válidos para o cliente.");
      }
      await ensureCustomerConsumerSchema();
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        if (request.method === "POST") {
          const [result] = await connection.query(
            `INSERT INTO customers
              (nameCustomer, documentCustomer, phoneCustomer, emailCustomer, addressCustomer,
               creditLimitCustomer, notesCustomer)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [nameCustomer, documentCustomer, phoneCustomer, emailCustomer, addressCustomer, creditLimitCustomer, notesCustomer || null]
          );
          await connection.query(
            "INSERT INTO consumers (idCustomer, nameConsumer, phoneConsumer) VALUES (?, ?, ?)",
            [result.insertId, nameCustomer, phoneCustomer]
          );
          await connection.commit();
          json(response, 201, { idCustomer: result.insertId });
        } else {
          const [currentCustomers] = await connection.query(
            "SELECT nameCustomer, phoneCustomer FROM customers WHERE idCustomer = ? FOR UPDATE",
            [idCustomer]
          );
          const currentCustomer = currentCustomers[0];
          if (!currentCustomer) throw new SaleValidationError("Cliente não encontrado.", 404);
          const [linkedConsumers] = await connection.query(
            "SELECT nameConsumer, phoneConsumer FROM consumers WHERE idCustomer = ? FOR UPDATE",
            [idCustomer]
          );
          const linkedConsumer = linkedConsumers[0];
          const [result] = await connection.query(
            `UPDATE customers SET nameCustomer = ?, documentCustomer = ?, phoneCustomer = ?,
              emailCustomer = ?, addressCustomer = ?, creditLimitCustomer = ?,
              notesCustomer = ? WHERE idCustomer = ?`,
            [nameCustomer, documentCustomer, phoneCustomer, emailCustomer, addressCustomer, creditLimitCustomer, notesCustomer || null, idCustomer]
          );
          if (!result.affectedRows) throw new SaleValidationError("Cliente não encontrado.", 404);
          const consumerUpdates = [];
          const consumerValues = [];
          if (linkedConsumer && String(linkedConsumer.nameConsumer ?? "") === String(currentCustomer.nameCustomer ?? "")
            && String(currentCustomer.nameCustomer ?? "") !== nameCustomer) {
            consumerUpdates.push("nameConsumer = ?");
            consumerValues.push(nameCustomer);
          }
          if (linkedConsumer && String(linkedConsumer.phoneConsumer ?? "") === String(currentCustomer.phoneCustomer ?? "")
            && String(currentCustomer.phoneCustomer ?? "") !== phoneCustomer) {
            consumerUpdates.push("phoneConsumer = ?");
            consumerValues.push(phoneCustomer);
          }
          if (consumerUpdates.length) {
            await connection.query(
              `UPDATE consumers SET ${consumerUpdates.join(", ")} WHERE idCustomer = ?`,
              [...consumerValues, idCustomer]
            );
          }
          await connection.commit();
          json(response, 200, { idCustomer });
        }
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally { connection.release(); }
    } catch (error) {
      handleError(response, error, { log: "Falha ao salvar cliente:", message: "Não foi possível salvar o cliente.", duplicate: "Já existe um cliente com esse documento." });
    }
    return;
  }

  if (request.method === "DELETE" && request.url === "/api/customers") {
    try {
      const payload = await readJsonBody(request);
      const idCustomer = parsePositiveId(payload.idCustomer);
      if (!idCustomer) throw new SaleValidationError("Cliente inválido.");
      await ensureCustomerConsumerSchema();
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [result] = await connection.query("UPDATE customers SET isActiveCustomer = 0 WHERE idCustomer = ?", [idCustomer]);
        if (!result.affectedRows) throw new SaleValidationError("Cliente não encontrado.", 404);
        await connection.query("UPDATE consumers SET isActiveConsumer = 0 WHERE idCustomer = ?", [idCustomer]);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      json(response, 200, { ok: true, idCustomer });
    } catch (error) {
      handleError(response, error, { log: "Falha ao excluir cliente:", message: "Não foi possível excluir o cliente.", duplicate: "" });
    }
    return;
  }

  if (request.method === "PUT" && request.url === "/api/customers/status") {
    try {
      const payload = await readJsonBody(request);
      const idCustomer = parsePositiveId(payload.idCustomer);
      if (!idCustomer || ![true, false, 0, 1].includes(payload.isActiveCustomer)) {
        throw new SaleValidationError("Cliente ou status inválido.");
      }
      await ensureCustomerConsumerSchema();
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const active = payload.isActiveCustomer ? 1 : 0;
        const [result] = await connection.query(
          "UPDATE customers SET isActiveCustomer = ? WHERE idCustomer = ?",
          [active, idCustomer]
        );
        if (!result.affectedRows) throw new SaleValidationError("Cliente não encontrado.", 404);
        await connection.query(
          "UPDATE consumers SET isActiveConsumer = ? WHERE idCustomer = ?",
          [active, idCustomer]
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      json(response, 200, { idCustomer, isActiveCustomer: payload.isActiveCustomer ? 1 : 0 });
    } catch (error) {
      handleError(response, error, { log: "Falha ao alterar status do cliente:", message: "Não foi possível alterar o status do cliente.", duplicate: "" });
    }
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/api/consumers")) {
    try {
      await ensureCustomerConsumerSchema();
      const includeInactive = new URL(request.url, "http://localhost").searchParams.get("includeInactive") === "1";
      const [consumers] = await pool.query(
        `SELECT co.idConsumer, co.idCustomer, co.nameConsumer, co.nicknameConsumer,
                co.phoneConsumer, co.notesConsumer, co.isActiveConsumer,
                c.nameCustomer FROM consumers co
         LEFT JOIN customers c ON c.idCustomer = co.idCustomer
         WHERE (? OR co.isActiveConsumer = 1)
         ORDER BY co.nameConsumer, co.idConsumer`,
        [includeInactive]
      );
      json(response, 200, { consumers });
    } catch (error) {
      handleError(response, error, { log: "Falha ao listar consumidores:", message: "Não foi possível consultar os consumidores.", duplicate: "" });
    }
    return;
  }

  if ((request.method === "POST" || request.method === "PUT") && request.url === "/api/consumers") {
    try {
      const payload = await readJsonBody(request);
      const idConsumer = request.method === "PUT" ? parsePositiveId(payload.idConsumer) : null;
      const text = (field, max) => typeof payload[field] === "string" ? payload[field].trim().slice(0, max) : "";
      const humanText = (field, max) => normalizeHumanText(text(field, max));
      const nameConsumer = humanText("nameConsumer", 180);
      if ((request.method === "PUT" && !idConsumer) || !nameConsumer) throw new SaleValidationError("Informe o nome do consumidor.");
      await ensureCustomerConsumerSchema();
      const values = [nameConsumer, humanText("nicknameConsumer", 120), text("phoneConsumer", 25), humanText("notesConsumer", 400) || null];
      if (request.method === "POST") {
        const [result] = await pool.query(
          "INSERT INTO consumers (nameConsumer, nicknameConsumer, phoneConsumer, notesConsumer) VALUES (?, ?, ?, ?)",
          values
        );
        json(response, 201, { idConsumer: result.insertId });
      } else {
        const [result] = await pool.query(
          `UPDATE consumers SET nameConsumer = ?, nicknameConsumer = ?, phoneConsumer = ?, notesConsumer = ?
           WHERE idConsumer = ?`,
          [...values, idConsumer]
        );
        if (!result.affectedRows) throw new SaleValidationError("Consumidor não encontrado.", 404);
        json(response, 200, { idConsumer });
      }
    } catch (error) {
      handleError(response, error, { log: "Falha ao salvar consumidor:", message: "Não foi possível salvar o consumidor.", duplicate: "" });
    }
    return;
  }

  if (request.method === "DELETE" && request.url === "/api/consumers") {
    try {
      const payload = await readJsonBody(request);
      const idConsumer = parsePositiveId(payload.idConsumer);
      if (!idConsumer) throw new SaleValidationError("Consumidor inválido.");
      await ensureCustomerConsumerSchema();
      const [result] = await pool.query("UPDATE consumers SET isActiveConsumer = 0 WHERE idConsumer = ? AND idCustomer IS NULL", [idConsumer]);
      if (!result.affectedRows) throw new SaleValidationError("Consumidor vinculado a cliente não pode ser excluído aqui.", 409);
      json(response, 200, { ok: true, idConsumer });
    } catch (error) {
      handleError(response, error, { log: "Falha ao excluir consumidor:", message: "Não foi possível excluir o consumidor.", duplicate: "" });
    }
    return;
  }

  if (request.method === "PUT" && request.url === "/api/consumers/status") {
    try {
      const payload = await readJsonBody(request);
      const idConsumer = parsePositiveId(payload.idConsumer);
      if (!idConsumer || ![true, false, 0, 1].includes(payload.isActiveConsumer)) {
        throw new SaleValidationError("Consumidor ou status inválido.");
      }
      await ensureCustomerConsumerSchema();
      const [linkedConsumers] = await pool.query(
        "SELECT idCustomer FROM consumers WHERE idConsumer = ? LIMIT 1",
        [idConsumer]
      );
      if (linkedConsumers[0]?.idCustomer) {
        throw new SaleValidationError("Consumidor vinculado a cliente deve ser alterado pelo cadastro do cliente.", 409);
      }
      const [result] = await pool.query(
        "UPDATE consumers SET isActiveConsumer = ? WHERE idConsumer = ? AND idCustomer IS NULL",
        [payload.isActiveConsumer ? 1 : 0, idConsumer]
      );
      if (!result.affectedRows) throw new SaleValidationError("Consumidor não encontrado.", 404);
      json(response, 200, { idConsumer, isActiveConsumer: payload.isActiveConsumer ? 1 : 0 });
    } catch (error) {
      handleError(response, error, { log: "Falha ao alterar status do consumidor:", message: "Não foi possível alterar o status do consumidor.", duplicate: "" });
    }
    return;
  }

  if (request.method === "GET" && (request.url === "/api/backups" || request.url.startsWith("/api/backups?"))) {
    try {
      const options = backupOptions();
      json(response, 200, {
        backups: await listBackups(options)
      });
    } catch (error) {
      json(response, 500, { error: error instanceof Error ? error.message : "Não foi possível listar os backups." });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/backups") {
    try {
      const backup = await createBackup({
        pool,
        ...backupOptions(),
        databaseName: config.database.name
      });
      json(response, 201, {
        backup: {
          fileName: backup.fileName,
          createdAt: backup.createdAt,
          size: backup.size,
          tableCount: backup.tableCount,
          rowCount: backup.rowCount
        }
      });
    } catch (error) {
      json(response, 500, { error: error instanceof Error ? error.message : "Não foi possível criar o backup." });
    }
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/api/backups/download/")) {
    try {
      const url = new URL(request.url, "http://localhost");
      const fileName = decodeURIComponent(url.pathname.slice("/api/backups/download/".length));
      const content = await readBackup({
        ...backupOptions(),
        fileName
      });
      binary(response, 200, "application/gzip", `attachment; filename="${fileName}"`, content);
    } catch (error) {
      json(response, 404, { error: error instanceof Error ? error.message : "Backup não encontrado." });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/backups/restore") {
    try {
      const payload = await readJsonBody(request, 70 * 1024 * 1024);
      const encoded = String(payload?.backupBase64 || "");
      if (!encoded) throw new SaleValidationError("Selecione um backup compactado.");
      const options = backupOptions();
      const safetyBackup = await createBackup(options);
      const result = await restoreBackup({
        pool,
        ...options,
        expectedDatabaseName: config.database.name,
        compressed: Buffer.from(encoded, "base64")
      });
      json(response, 200, { ok: true, result, safetyBackup: { fileName: safetyBackup.fileName } });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao restaurar backup:",
        message: "Não foi possível restaurar o backup.",
        duplicate: ""
      });
    }
    return;
  }

  if (request.method === "GET" && request.url === "/api/health") {
    try {
      await pool.query("SELECT 1");
      json(response, 200, {
        ok: true,
        database: "connected",
        apiVersion: applicationVersion,
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
      json(response, 200, { menus, items });
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
    json(response, 405, { error: "A criação de menus está desativada. Edite a estrutura existente." });
    return;
  }

  if (request.method === "POST" && request.url === "/api/navigation/items") {
    try {
      const payload = await readJsonBody(request);
      if (payload.typeNavigationItem !== "divider" || !payload.idAfterNavigationItem) {
        json(response, 405, { error: "A criação de itens e submenus está desativada. Edite a estrutura existente." });
        return;
      }
      await ensureNavigationSchema();
      const afterId = parsePositiveId(payload.idAfterNavigationItem);
      const key = parseNavigationKey(payload.keyNavigationItem, "Chave do divisor");
      if (!afterId) throw new SaleValidationError("Item de referência inválido.");
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [referenceRows] = await connection.query(
          `SELECT item.idNavigationItem, item.idNavigationMenu, item.idParentNavigationItem,
                  item.orderNavigationItem, menu.isActiveNavigationMenu
           FROM navigation_items item
           INNER JOIN navigation_menus menu ON menu.idNavigationMenu = item.idNavigationMenu
           WHERE item.idNavigationItem = ?
           FOR UPDATE`,
          [afterId]
        );
        const reference = referenceRows[0];
        if (!reference || Number(reference.isActiveNavigationMenu) !== 1) {
          throw new SaleValidationError("Item de referência não encontrado.", 404);
        }
        const insertOrder = Number(reference.orderNavigationItem) + 1;
        await connection.query(
          `UPDATE navigation_items
           SET orderNavigationItem = orderNavigationItem + 1
           WHERE idNavigationMenu = ?
             AND ((idParentNavigationItem IS NULL AND ? IS NULL)
               OR idParentNavigationItem = ?)
             AND orderNavigationItem >= ?`,
          [
            reference.idNavigationMenu,
            reference.idParentNavigationItem,
            reference.idParentNavigationItem,
            insertOrder
          ]
        );
        const [result] = await connection.query(
          `INSERT INTO navigation_items
            (idNavigationMenu, idParentNavigationItem, typeNavigationItem,
             keyNavigationItem, labelNavigationItem, routeNavigationItem,
             descriptionNavigationItem, orderNavigationItem, isActiveNavigationItem,
             showsInBackofficeHomeNavigationItem)
           VALUES (?, ?, 'divider', ?, 'Divisor', NULL, NULL, ?, 1, 0)`,
          [
            reference.idNavigationMenu,
            reference.idParentNavigationItem,
            key,
            insertOrder
          ]
        );
        await connection.commit();
        json(response, 201, { idNavigationItem: result.insertId });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao criar divisor de navegação:",
        message: "Não foi possível criar o divisor.",
        duplicate: "A chave do divisor já existe."
      });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/navigation/menus/disabled") {
    try {
      await ensureNavigationSchema();
      const payload = await readJsonBody(request);
      const key = parseNavigationKey(payload.keyNavigationMenu, "Chave do menu");
      const label = parseNavigationText(payload.labelNavigationMenu, "Nome do menu", 120);
      const order = parseNavigationOrder(payload.orderNavigationMenu, "Ordem do menu");
      const active = parseNavigationBoolean(payload.isActiveNavigationMenu, "Status do menu");
      assertNavigationActivationAllowed(key, active === 1);
      if (normalizeNavigationKey(key) === "cadastros"
        || normalizeNavigationKey(key) === "registrations"
        || normalizeNavigationKey(label) === "cadastros") {
        const [catalogMenus] = await pool.query(
          `SELECT idNavigationMenu
           FROM navigation_menus
           WHERE LOWER(keyNavigationMenu) IN ('cadastros', 'registrations')
              OR LOWER(labelNavigationMenu) = 'cadastros'
           LIMIT 1`
        );
        if (catalogMenus[0]) {
          throw new SaleValidationError("O menu Cadastros já existe.", 409);
        }
      }
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
      if (normalizeNavigationKey(menuKey) === "sales") {
        assertFixedSalesMenuUpdate(payload);
        await pool.query(
          `UPDATE navigation_menus
           SET keyNavigationMenu = 'sales', labelNavigationMenu = 'Frente de Caixa',
               orderNavigationMenu = 0, isActiveNavigationMenu = 1
           WHERE idNavigationMenu = ?`,
          [id]
        );
        json(response, 200, { idNavigationMenu: id });
        return;
      }
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

  if (request.method === "DELETE" && request.url === "/api/navigation/items") {
    try {
      await ensureNavigationSchema();
      const payload = await readJsonBody(request);
      const id = parsePositiveId(payload.idNavigationItem);
      if (!id) throw new SaleValidationError("Divisor inválido.");
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.query(
          `SELECT idNavigationItem, idNavigationMenu, idParentNavigationItem, orderNavigationItem,
                  typeNavigationItem
           FROM navigation_items
           WHERE idNavigationItem = ?
           FOR UPDATE`,
          [id]
        );
        const item = rows[0];
        if (!item) throw new SaleValidationError("Divisor não encontrado.", 404);
        if (item.typeNavigationItem !== "divider") {
          throw new SaleValidationError("Somente divisores podem ser excluídos.");
        }
        await connection.query(
          `DELETE FROM navigation_items
           WHERE idNavigationItem = ?`,
          [id]
        );
        await connection.query(
          `UPDATE navigation_items
           SET orderNavigationItem = orderNavigationItem - 1
           WHERE idNavigationMenu = ?
             AND ((idParentNavigationItem IS NULL AND ? IS NULL)
               OR idParentNavigationItem = ?)
             AND orderNavigationItem > ?`,
          [
            item.idNavigationMenu,
            item.idParentNavigationItem,
            item.idParentNavigationItem,
            item.orderNavigationItem
          ]
        );
        await connection.commit();
        json(response, 200, { ok: true, id });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao excluir divisor de navegação:",
        message: "Não foi possível excluir o divisor.",
        duplicate: ""
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
                nfceInitialNumberCompany,
                (nfceCscCompany <> '') AS hasNfceCscCompany,
                (nfceTokenCompany <> '') AS hasNfceTokenCompany,
                (nfceHomologationCscCompany <> '') AS hasNfceHomologationCscCompany,
                (nfceHomologationTokenCompany <> '') AS hasNfceHomologationTokenCompany,
                nfceContingencyCompany, nfceCertificateTypeCompany,
                nfceCertificateExpiresCompany,
                nfceCertificateSerialCompany, logoMimeCompany, logoDataCompany,
                projectIconMimeCompany, projectIconDataCompany
         FROM company_settings
         ORDER BY idCompanySetting ASC
         LIMIT 1`
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
                nfceSeriesCompany, nfceNextNumberCompany AS nfceInitialNumberCompany, nfceContingencyCompany,
                (nfceCscCompany <> '') AS hasNfceCscCompany,
                (nfceTokenCompany <> '') AS hasNfceTokenCompany,
                (nfceHomologationCscCompany <> '') AS hasNfceHomologationCscCompany,
                (nfceHomologationTokenCompany <> '') AS hasNfceHomologationTokenCompany,
                nfceCertificateTypeCompany,
                nfceCertificateExpiresCompany,
                nfceCertificateSerialCompany, nfceCertificateNameCompany,
                (nfceCertificateDataCompany IS NOT NULL AND nfceCertificateDataCompany <> '') AS hasCertificateCompany,
                (nfceCertificatePasswordCompany IS NOT NULL AND nfceCertificatePasswordCompany <> '') AS hasCertificatePasswordCompany,
                nfceCertificateDataCompany, nfceCertificatePasswordCompany
         FROM company_settings
         ORDER BY idCompanySetting ASC
         LIMIT 1`
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
             ORDER BY idCompanySetting ASC
             LIMIT 1`,
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
         ORDER BY idCompanySetting ASC
         LIMIT 1`
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
      const nfceCertificateTypeCompany = enumValue(payload.nfceCertificateTypeCompany, "Tipo de certificado", ["A1"], "A1");
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
      const [[currentCompany]] = await pool.query(
        `SELECT nfceCscCompany, nfceTokenCompany,
                nfceHomologationCscCompany, nfceHomologationTokenCompany
         FROM company_settings
         ORDER BY idCompanySetting ASC
         LIMIT 1`
      );
      const storedNfceCscCompany = nfceCscCompany || currentCompany?.nfceCscCompany || "";
      const storedNfceTokenCompany = nfceTokenCompany || currentCompany?.nfceTokenCompany || "";
      const storedNfceHomologationCscCompany =
        nfceHomologationCscCompany || currentCompany?.nfceHomologationCscCompany || "";
      const storedNfceHomologationTokenCompany =
        nfceHomologationTokenCompany || currentCompany?.nfceHomologationTokenCompany || "";
      await pool.query(
        `UPDATE company_settings
         SET nfceStateCompany = ?, nfceModelCompany = ?, nfceEnvironmentCompany = ?,
             nfceSeriesCompany = ?, nfceInitialNumberCompany = ?,
             nfceNextNumberCompany = GREATEST(nfceNextNumberCompany, ?),
             nfceContingencyCompany = ?,
             nfceCscCompany = ?, nfceTokenCompany = ?, nfceHomologationCscCompany = ?,
             nfceHomologationTokenCompany = ?, nfceCertificateTypeCompany = ?,
             nfceCertificateExpiresCompany = ?,
             nfceCertificateSerialCompany = ?, nfceCertificateNameCompany = COALESCE(NULLIF(?, ''), nfceCertificateNameCompany),
             nfceCertificateDataCompany = COALESCE(?, nfceCertificateDataCompany),
             nfceCertificatePasswordCompany = COALESCE(?, nfceCertificatePasswordCompany)
         ORDER BY idCompanySetting ASC
         LIMIT 1`,
        [
          nfceStateCompany, nfceModelCompany, nfceEnvironmentCompany,
          nfceSeriesCompany, nfceInitialNumberCompany, nfceInitialNumberCompany,
          nfceContingencyCompany,
          storedNfceCscCompany, storedNfceTokenCompany, storedNfceHomologationCscCompany,
          storedNfceHomologationTokenCompany, nfceCertificateTypeCompany,
          certificateMetadata?.expires || nfceCertificateExpiresCompany || null,
          certificateMetadata?.serial || nfceCertificateSerialCompany, nfceCertificateNameCompany,
          encryptedCertificate, encryptedCertificatePassword
        ]
      );
      const [rows] = await pool.query(
        `SELECT nfceStateCompany, nfceModelCompany, nfceEnvironmentCompany,
                nfceSeriesCompany, nfceNextNumberCompany AS nfceInitialNumberCompany, nfceContingencyCompany,
                (nfceCscCompany <> '') AS hasNfceCscCompany,
                (nfceTokenCompany <> '') AS hasNfceTokenCompany,
                (nfceHomologationCscCompany <> '') AS hasNfceHomologationCscCompany,
                (nfceHomologationTokenCompany <> '') AS hasNfceHomologationTokenCompany,
                nfceCertificateTypeCompany,
                nfceCertificateExpiresCompany,
                nfceCertificateSerialCompany, nfceCertificateNameCompany,
                (nfceCertificateDataCompany IS NOT NULL AND nfceCertificateDataCompany <> '') AS hasCertificateCompany,
                (nfceCertificatePasswordCompany IS NOT NULL AND nfceCertificatePasswordCompany <> '') AS hasCertificatePasswordCompany
         FROM company_settings
         ORDER BY idCompanySetting ASC
         LIMIT 1`
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
         ORDER BY idCompanySetting ASC
         LIMIT 1`
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
         ORDER BY idCompanySetting ASC
         LIMIT 1`,
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
                nfceInitialNumberCompany,
                (nfceCscCompany <> '') AS hasNfceCscCompany,
                (nfceTokenCompany <> '') AS hasNfceTokenCompany,
                (nfceHomologationCscCompany <> '') AS hasNfceHomologationCscCompany,
                (nfceHomologationTokenCompany <> '') AS hasNfceHomologationTokenCompany,
                nfceContingencyCompany, nfceCertificateTypeCompany,
                nfceCertificateExpiresCompany,
                nfceCertificateSerialCompany, logoMimeCompany, logoDataCompany,
                projectIconMimeCompany, projectIconDataCompany
         FROM company_settings
         ORDER BY idCompanySetting ASC
         LIMIT 1`
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
                booleanValueGeneralSetting, valueGeneralSetting
         FROM general_settings
         ORDER BY idGeneralSetting`
      );
      json(response, 200, {
        settings: rows.map((row) => ({
          keyGeneralSetting: row.keyGeneralSetting,
          labelGeneralSetting: row.labelGeneralSetting,
          typeGeneralSetting: row.typeGeneralSetting,
          booleanValueGeneralSetting: Boolean(row.booleanValueGeneralSetting),
          valueGeneralSetting: row.valueGeneralSetting ?? ""
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
      const allowedKeys = new Set(["allowNegativeStock", "ncmSourceUrl", "cestSourceUrl"]);
      if (!allowedKeys.has(key)) {
        throw new SaleValidationError("Configuração geral não reconhecida.");
      }
      await ensureGeneralSettingsSchema();
      const [settingRows] = await pool.query(
        `SELECT typeGeneralSetting
         FROM general_settings
         WHERE keyGeneralSetting = ?
         LIMIT 1`,
        [key]
      );
      const type = settingRows[0]?.typeGeneralSetting;
      if (type === "boolean") {
        const booleanValue = parseBooleanFlag(payload.booleanValueGeneralSetting, "Valor da configuração");
        await pool.query(
          `UPDATE general_settings
           SET booleanValueGeneralSetting = ?
           WHERE keyGeneralSetting = ?`,
          [booleanValue, key]
        );
      } else {
        const value = String(payload.valueGeneralSetting ?? "").trim();
        if (type === "text" && !value) {
          throw new SaleValidationError("Informe um valor para a configuração.");
        }
        if (type === "number" && (!value || !Number.isFinite(Number(value)))) {
          throw new SaleValidationError("Informe um número válido.");
        }
        if (type === "json") {
          try {
            JSON.parse(value);
          } catch {
            throw new SaleValidationError("Informe um JSON válido.");
          }
        }
        if (key === "ncmSourceUrl" || key === "cestSourceUrl") {
          try {
            validateOfficialSourceUrl(value, key === "ncmSourceUrl" ? "NCM" : "CEST");
          } catch (error) {
            throw new SaleValidationError(error.message);
          }
        }
        await pool.query(
          `UPDATE general_settings
           SET valueGeneralSetting = ?
           WHERE keyGeneralSetting = ?`,
          [value, key]
        );
        if (key === "ncmSourceUrl") {
          config.ncmSourceUrl = value;
        }
        if (key === "cestSourceUrl") {
          config.cestSourceUrl = value;
        }
      }
      const [rows] = await pool.query(
        `SELECT keyGeneralSetting, labelGeneralSetting, typeGeneralSetting,
                booleanValueGeneralSetting, valueGeneralSetting
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
              booleanValueGeneralSetting: Boolean(rows[0].booleanValueGeneralSetting),
              valueGeneralSetting: rows[0].valueGeneralSetting ?? ""
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

  if (request.method === "GET" && request.url.startsWith("/api/product-recipes")) {
    try {
      await ensureRecipeSchema();
      const requestUrl = new URL(request.url, "http://localhost");
      const productId = parsePositiveId(requestUrl.searchParams.get("productId"));
      if (!productId) throw new SaleValidationError("Produto inválido.");
      const [links] = await pool.query(
        `SELECT links.idProductRecipeLink, links.idProduct, links.idRecipe,
                links.quantityProductRecipeLink, links.lossPercentProductRecipeLink,
                recipes.nameRecipe, recipes.kindRecipe, recipes.statusRecipe
         FROM product_recipe_links links
         INNER JOIN recipe_definitions recipes ON recipes.idRecipe = links.idRecipe
         WHERE links.idProduct = ?
         ORDER BY recipes.nameRecipe`,
        [productId]
      );
      json(response, 200, { links });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao listar receitas do produto:",
        message: "Não foi possível consultar as receitas do produto.",
        duplicate: ""
      });
    }
    return;
  }

  if (request.method === "PUT" && request.url === "/api/product-recipes") {
    let connection;
    try {
      await ensureRecipeSchema();
      const payload = await readJsonBody(request);
      const productId = parsePositiveId(payload.idProduct);
      const links = Array.isArray(payload.links) ? payload.links : [];
      if (!productId) throw new SaleValidationError("Produto inválido.");
      if (links.length > 100) throw new SaleValidationError("A composição do produto excede o limite permitido.");
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const [products] = await connection.query(
        "SELECT idProduct FROM products WHERE idProduct = ?",
        [productId]
      );
      if (!products.length) throw new SaleValidationError("Produto não encontrado.", 404);
      const normalizedLinks = links.map((link) => ({
        recipeId: parsePositiveId(link.idRecipe || link.recipeId),
        quantity: Number(link.quantityProductRecipeLink ?? link.quantity ?? 1),
        lossPercent: Number(link.lossPercentProductRecipeLink ?? link.lossPercent ?? 0)
      }));
      if (normalizedLinks.some((link) =>
        !link.recipeId || !Number.isFinite(link.quantity) || link.quantity <= 0
        || !Number.isFinite(link.lossPercent) || link.lossPercent < 0 || link.lossPercent >= 100
      )) {
        throw new SaleValidationError("Receita, quantidade ou perda inválida.");
      }
      const recipeIds = [...new Set(normalizedLinks.map((link) => link.recipeId))];
      if (recipeIds.length) {
        const [recipes] = await connection.query(
          `SELECT idRecipe FROM recipe_definitions
           WHERE idRecipe IN (?) AND statusRecipe = 'active'`,
          [recipeIds]
        );
        if (recipes.length !== recipeIds.length) {
          throw new SaleValidationError("Somente Receitas ou Composições ativas podem ser vinculadas ao produto.", 409);
        }
      }
      await connection.query("DELETE FROM product_recipe_links WHERE idProduct = ?", [productId]);
      for (const link of normalizedLinks) {
        await connection.query(
          `INSERT INTO product_recipe_links
            (idProduct, idRecipe, quantityProductRecipeLink, lossPercentProductRecipeLink)
           VALUES (?, ?, ?, ?)`,
          [productId, link.recipeId, link.quantity, link.lossPercent]
        );
      }
      await connection.commit();
      json(response, 200, { ok: true, idProduct, links: normalizedLinks });
    } catch (error) {
      if (connection) await connection.rollback();
      handleError(response, error, {
        log: "Falha ao salvar receitas do produto:",
        message: "Não foi possível salvar as receitas do produto.",
        duplicate: ""
      });
    } finally {
      connection?.release();
    }
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/api/products")) {
    try {
      await ensureProductCatalogSchema();
      await ensureRecipeSchema();
      const requestUrl = new URL(request.url, "http://localhost");
      const includeInactive = requestUrl.searchParams.get("includeInactive") === "1";
      const productTypeDescription = normalizeTextForComparison(requestUrl.searchParams.get("productType") || "");
      const allowNegativeStock = await getGeneralSettingBoolean("allowNegativeStock");
      const [products] = await pool.query(
        `SELECT products.idProduct, products.idGroup, products.skuProduct,
                products.pdvCodeProduct, products.nameProduct,
                products.idFiscalOperationSaleProduct, products.idProductTypeProduct,
                products.idPhysicalStateProduct, products.idUnitProduct, products.ncmProduct,
                products.cestProduct, products.priceProduct, products.costPriceProduct,
                products.stockQuantityProduct, products.controlsStockProduct,
                products.isBuffetProduct,
                products.isFractionalProduct, products.printsPlace,
                products.showsInPdvProduct,
                products.isActiveProduct,
                units.codeUnit, units.descriptionUnit,
                physical_states.namePhysicalState,
                groups.descriptionGroup, classes.descriptionClass,
                product_types.descriptionProductType
         FROM products
         INNER JOIN \`groups\` groups ON groups.idGroup = products.idGroup
         INNER JOIN classes ON classes.idClass = groups.idClass
         LEFT JOIN product_types ON product_types.idProductType = products.idProductTypeProduct
         LEFT JOIN units ON units.idUnit = products.idUnitProduct
         LEFT JOIN physical_states ON physical_states.idPhysicalState = products.idPhysicalStateProduct
         WHERE (? OR (products.isActiveProduct = 1 AND products.showsInPdvProduct = 1
           AND (? OR products.controlsStockProduct = 0 OR products.stockQuantityProduct > 0)))
           AND (? = '' OR product_types.descriptionProductType = ?)
         ORDER BY products.nameProduct`,
        [includeInactive, allowNegativeStock, productTypeDescription, productTypeDescription]
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

  if (request.method === "GET" && request.url.startsWith("/api/recipes")) {
    try {
      await ensureRecipeSchema();
      await ensureCulinarySchema();
      const requestUrl = new URL(request.url, "http://localhost");
      const includeArchived = requestUrl.searchParams.get("includeArchived") === "1";
      const kind = requestUrl.searchParams.get("kind");
      const parameters = [];
      const conditions = [];
      if (!includeArchived) conditions.push("recipes.statusRecipe <> 'archived'");
      if (kind === "production" || kind === "composition") {
        conditions.push("recipes.kindRecipe = ?");
        parameters.push(kind);
      }
      const [recipes] = await pool.query(
        `SELECT recipes.idRecipe, recipes.nameRecipe, recipes.kindRecipe, recipes.idResultProductRecipe,
                recipes.idCulinaryUnitYieldRecipe,
                recipes.idUnitYieldRecipe,
                recipes.statusRecipe, recipes.versionRecipe, recipes.yieldQuantityRecipe,
                recipes.notesRecipe, recipes.createdAtRecipe, recipes.updatedAtRecipe,
                result.nameProduct AS resultProductName,
                yield_unit.codeUnit AS yieldCulinaryUnitCode,
                yield_unit.descriptionUnit AS yieldCulinaryUnitName,
                yield_unit.baseUnitUnit AS yieldCulinaryUnitBase
                ,yield_tax_unit.codeUnit AS yieldUnitCode,
                yield_tax_unit.descriptionUnit AS yieldUnitDescription
         FROM recipe_definitions recipes
         LEFT JOIN products result ON result.idProduct = recipes.idResultProductRecipe
         LEFT JOIN units yield_unit
           ON yield_unit.idUnit = recipes.idCulinaryUnitYieldRecipe
         LEFT JOIN units yield_tax_unit
           ON yield_tax_unit.idUnit = recipes.idUnitYieldRecipe
         ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
         ORDER BY result.nameProduct, recipes.kindRecipe`,
        parameters
      );
      const recipeIds = recipes.map(({ idRecipe }) => idRecipe);
      const components = recipeIds.length
        ? (await pool.query(
          `SELECT components.idRecipe, components.componentTypeRecipe,
                  components.idComponentProductRecipe, components.idComponentRecipe,
                  components.idCulinaryUnitRecipeComponent,
                  components.idCulinaryUnitConversionRecipeComponent,
                  components.quantityRecipeComponent, components.lossPercentRecipeComponent,
                  products.nameProduct AS componentProductName,
                  products.idUnitProduct AS componentProductUnitId,
                  products.idPhysicalStateProduct AS componentProductPhysicalStateId,
                  units.codeUnit AS componentCodeUnit,
                  units.descriptionUnit AS componentDescriptionUnit,
                  nested.nameRecipe AS componentRecipeName,
                  products.costPriceProduct, products.controlsStockProduct,
                  unified_unit.descriptionUnit AS culinaryUnitName,
                  unified_conversion.factorUnitConversion AS factorCulinaryUnitConversion,
                  CONCAT(from_unit.descriptionUnit, ' → ', to_unit.descriptionUnit) AS conversionLabel
           FROM recipe_components components
           LEFT JOIN products ON products.idProduct = components.idComponentProductRecipe
           LEFT JOIN units ON units.idUnit = products.idUnitProduct
           LEFT JOIN recipe_definitions nested ON nested.idRecipe = components.idComponentRecipe
           LEFT JOIN units unified_unit
             ON unified_unit.idUnit = components.idCulinaryUnitRecipeComponent
           LEFT JOIN unit_conversions unified_conversion
             ON unified_conversion.idUnitConversion = components.idCulinaryUnitConversionRecipeComponent
           LEFT JOIN units from_unit
             ON from_unit.idUnit = unified_conversion.idFromUnitConversion
           LEFT JOIN units to_unit
             ON to_unit.idUnit = unified_conversion.idToUnitConversion
           WHERE components.idRecipe IN (?) ORDER BY components.idRecipe, components.idRecipeComponent`,
          [recipeIds]
        ))[0]
        : [];
      const componentsByRecipe = new Map();
      for (const component of components) {
        const list = componentsByRecipe.get(component.idRecipe) || [];
        list.push(component);
        componentsByRecipe.set(component.idRecipe, list);
      }
      json(response, 200, {
        recipes: recipes.map((recipe) => ({
          ...recipe,
          components: componentsByRecipe.get(recipe.idRecipe) || []
        }))
      });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao listar receitas:",
        message: "Não foi possível consultar as receitas.",
        duplicate: ""
      });
    }
    return;
  }

  if ((request.method === "POST" && request.url === "/api/recipes")
    || (request.method === "PUT" && /^\/api\/recipes\/\d+$/.test(new URL(request.url, "http://localhost").pathname))) {
    let connection;
    try {
      await ensureRecipeSchema();
      await ensureCulinarySchema();
      const payload = await readJsonBody(request);
      const definition = {
        kind: payload.kindRecipe || payload.kind,
        name: payload.nameRecipe || payload.name,
        yieldQuantity: payload.yieldQuantityRecipe ?? payload.yieldQuantity,
        yieldUnitId: payload.idUnitYieldRecipe || payload.yieldUnitId,
        components: Array.isArray(payload.components)
          ? payload.components.map((component) => ({
            productId: component.idComponentProductRecipe || component.productId,
            recipeId: component.idComponentRecipe || component.recipeId,
            culinaryUnitId: component.idCulinaryUnitRecipeComponent || component.culinaryUnitId,
            conversionId: component.idCulinaryUnitConversionRecipeComponent || component.conversionId,
            quantity: component.quantityRecipeComponent ?? component.quantity,
            lossPercent: component.lossPercentRecipeComponent ?? component.lossPercent ?? 0
          }))
          : []
      };
      const validationErrors = validateRecipeDefinition(definition);
      if (validationErrors.length) throw new SaleValidationError(validationErrors.join(" "));
      const requestedStatus = payload.statusRecipe ?? "draft";
      if (!["draft", "active", "review_required"].includes(requestedStatus)) {
        throw new SaleValidationError("Status da Receita inválido.");
      }
      const yieldQuantity = Number(definition.yieldQuantity ?? 1);
      if (!Number.isFinite(yieldQuantity) || yieldQuantity <= 0) {
        throw new SaleValidationError("Informe um rendimento maior que zero.");
      }
      const yieldUnitId = parsePositiveId(definition.yieldUnitId);
      if (!yieldUnitId) {
        throw new SaleValidationError("Informe a unidade final da Receita ou Composição.");
      }
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const [yieldUnits] = await connection.query(
        `SELECT idUnit FROM units WHERE idUnit = ? AND isActiveUnit = 1 AND isTaxableUnit = 1`,
        [yieldUnitId]
      );
      if (!yieldUnits.length) {
        throw new SaleValidationError("A unidade final não foi encontrada ou está inativa.", 409);
      }
      const productIds = [...new Set(
        definition.components
          .map(({ productId }) => Number(productId))
          .filter((id) => Number.isInteger(id) && id > 0)
      )];
      if (productIds.length) {
        const [products] = await connection.query(
          `SELECT idProduct, idUnitProduct, idPhysicalStateProduct
           FROM products WHERE idProduct IN (?) AND isActiveProduct = 1`,
          [productIds]
        );
        if (products.length !== productIds.length) {
          throw new SaleValidationError("Produto componente não encontrado.", 409);
        }
      }
      const recipeIds = [...new Set(
        definition.components
          .map(({ recipeId }) => Number(recipeId))
          .filter((id) => Number.isInteger(id) && id > 0)
      )];
      if (recipeIds.length) {
        const [componentRecipes] = await connection.query(
          `SELECT idRecipe FROM recipe_definitions
           WHERE idRecipe IN (?) AND statusRecipe <> 'archived'`,
          [recipeIds]
        );
        if (componentRecipes.length !== recipeIds.length) {
          throw new SaleValidationError("Receita componente não encontrada.", 409);
        }
      }
      const componentProducts = productIds.length
        ? (await connection.query(
          `SELECT products.idProduct, products.idUnitProduct, products.idPhysicalStateProduct,
                  units.codeUnit, units.descriptionUnit
           FROM products
           LEFT JOIN units ON units.idUnit = products.idUnitProduct
           WHERE products.idProduct IN (?)`,
          [productIds]
        ))[0]
        : [];
      const componentProductsById = new Map(componentProducts.map((product) => [String(product.idProduct), product]));
      const [culinaryUnits] = await connection.query(
        `SELECT idUnit AS idCulinaryUnit, codeUnit AS codeCulinaryUnit,
                descriptionUnit AS nameCulinaryUnit, baseUnitUnit AS baseUnitCulinaryUnit
         FROM units
         WHERE isCulinaryUnit = 1 AND isActiveUnit = 1`
      );
      const culinaryUnitIds = new Set(culinaryUnits.map(({ idCulinaryUnit }) => String(idCulinaryUnit)));
      const conversionIds = [...new Set(
        definition.components
          .map(({ conversionId }) => Number(conversionId))
          .filter((id) => Number.isInteger(id) && id > 0)
      )];
      const [conversions] = conversionIds.length
        ? await connection.query(
          `SELECT idUnitConversion AS idCulinaryUnitConversion,
                  idFromUnitConversion AS idFromCulinaryUnitConversion,
                  idToUnitConversion AS idToCulinaryUnitConversion,
                  idPhysicalStateUnitConversion AS idPhysicalStateCulinaryUnitConversion
           FROM unit_conversions
           WHERE idUnitConversion IN (?)`,
          [conversionIds]
        )
        : [[]];
      const conversionsById = new Map(conversions.map((conversion) => [
        String(conversion.idCulinaryUnitConversion),
        conversion
      ]));
      for (const component of definition.components) {
        if (!component.productId) continue;
        const product = componentProductsById.get(String(component.productId));
        if (!product) throw new SaleValidationError("Produto componente não encontrado.", 409);
        if (component.culinaryUnitId && !culinaryUnitIds.has(String(component.culinaryUnitId))) {
          throw new SaleValidationError("Unidade culinária do componente não encontrada.", 409);
        }
        if (!component.conversionId) {
          throw new SaleValidationError("A conversão é obrigatória para componentes de produto.", 409);
        }
        if (component.culinaryUnitId) {
          const culinaryUnit = culinaryUnits.find(({ idCulinaryUnit }) =>
            String(idCulinaryUnit) === String(component.culinaryUnitId)
          );
          const productBase = culinaryBaseForUnit(product);
          if (productBase
            && culinaryUnit.baseUnitCulinaryUnit !== "common"
            && culinaryUnit.baseUnitCulinaryUnit !== productBase) {
            throw new SaleValidationError("A unidade culinária não é compatível com a unidade cadastrada no componente.", 409);
          }
        }
        const conversion = conversionsById.get(String(component.conversionId));
        if (!conversion || String(conversion.idFromCulinaryUnitConversion) !== String(component.culinaryUnitId)
          || (product.idPhysicalStateProduct
            && String(conversion.idPhysicalStateCulinaryUnitConversion) !== String(product.idPhysicalStateProduct))
          || (() => {
            const targetUnit = culinaryUnits.find(({ idCulinaryUnit }) =>
              String(idCulinaryUnit) === String(conversion?.idToCulinaryUnitConversion)
            );
            return Boolean(
              targetUnit?.codeCulinaryUnit
              && product.codeUnit
              && String(targetUnit.codeCulinaryUnit).toLocaleLowerCase("pt-BR")
                !== String(product.codeUnit).toLocaleLowerCase("pt-BR")
            );
          })()) {
          throw new SaleValidationError("A conversão não corresponde à unidade ou ao estado físico do componente.", 409);
        }
      }
      const recipeName = String(definition.name || "").trim().slice(0, 180);
      if (!recipeName) throw new SaleValidationError("Informe o nome da Receita ou Composição.");
      const recipeId = request.method === "PUT"
        ? Number(new URL(request.url, "http://localhost").pathname.split("/").pop())
        : null;
      const [duplicates] = await connection.query(
        `SELECT idRecipe FROM recipe_definitions
         WHERE nameRecipe = ? AND kindRecipe = ? AND statusRecipe <> 'archived'
           AND idRecipe <> ?`,
        [recipeName, definition.kind, recipeId || 0]
      );
      if (duplicates.length) throw new SaleValidationError("Já existe uma Receita ou Composição com este nome.", 409);
      const [existingDefinitions] = await connection.query(
        `SELECT recipes.idRecipe, components.idComponentRecipe
         FROM recipe_definitions recipes
         LEFT JOIN recipe_components components ON components.idRecipe = recipes.idRecipe
         WHERE recipes.statusRecipe <> 'archived'`
      );
      const definitionsByKey = new Map();
      for (const entry of existingDefinitions) {
        const key = String(entry.idRecipe);
        const current = definitionsByKey.get(key) || {
          recipeId: entry.idRecipe,
          components: []
        };
        if (entry.idComponentRecipe) {
          current.components.push({ recipeId: entry.idComponentRecipe });
        }
        definitionsByKey.set(key, current);
      }
      const cycleDefinitions = [...definitionsByKey.values()];
      const cycles = findRecipeCycles(cycleDefinitions);
      if (cycles.length) throw new SaleValidationError("A estrutura contém um ciclo de composição.", 409);
      if (recipeId) {
        const [existing] = await connection.query("SELECT idRecipe FROM recipe_definitions WHERE idRecipe = ?", [recipeId]);
        if (!existing.length) throw new SaleValidationError("Receita não encontrada.", 404);
        await connection.query(
          `UPDATE recipe_definitions
           SET nameRecipe = ?, kindRecipe = ?, idUnitYieldRecipe = ?, statusRecipe = ?,
               yieldQuantityRecipe = ?, notesRecipe = ?, versionRecipe = versionRecipe + 1
           WHERE idRecipe = ?`,
          [recipeName, definition.kind, yieldUnitId, requestedStatus, yieldQuantity,
            payload.notesRecipe ? String(payload.notesRecipe).trim().slice(0, 500) : null, recipeId]
        );
        await connection.query("DELETE FROM recipe_components WHERE idRecipe = ?", [recipeId]);
      }
      const result = recipeId ? { insertId: recipeId } : (await connection.query(
        `INSERT INTO recipe_definitions
          (nameRecipe, kindRecipe, idUnitYieldRecipe, statusRecipe,
           yieldQuantityRecipe, notesRecipe)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          recipeName,
          definition.kind,
          yieldUnitId,
          requestedStatus,
          yieldQuantity,
          payload.notesRecipe ? String(payload.notesRecipe).trim().slice(0, 500) : null
        ]
      ))[0];
      for (const [index, component] of definition.components.entries()) {
        await connection.query(
          `INSERT INTO recipe_components
            (idRecipe, componentTypeRecipe, idComponentProductRecipe, idComponentRecipe,
             orderRecipeComponent,
             idCulinaryUnitRecipeComponent, idCulinaryUnitConversionRecipeComponent,
             quantityRecipeComponent, lossPercentRecipeComponent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            result.insertId,
            component.recipeId ? "recipe" : "product",
            component.productId || null,
            component.recipeId || null,
            index + 1,
            component.culinaryUnitId || null,
            component.conversionId || null,
            component.quantity,
            component.lossPercent
          ]
        );
      }
      await connection.commit();
      json(response, request.method === "PUT" ? 200 : 201, { ok: true, idRecipe: result.insertId, statusRecipe: requestedStatus });
    } catch (error) {
      if (connection) await connection.rollback();
      handleError(response, error, {
        log: "Falha ao criar receita:",
        message: "Não foi possível salvar a Receita ou Composição.",
        duplicate: "Já existe uma Receita ou Composição com este nome."
      });
    } finally {
      connection?.release();
    }
    return;
  }

  if (request.method === "DELETE" && /^\/api\/recipes\/\d+$/.test(new URL(request.url, "http://localhost").pathname)) {
    let connection;
    try {
      await ensureRecipeSchema();
      const recipeId = Number(new URL(request.url, "http://localhost").pathname.split("/").pop());
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const [links] = await connection.query("SELECT idProductRecipeLink FROM product_recipe_links WHERE idRecipe = ? LIMIT 1", [recipeId]);
      if (links.length) throw new SaleValidationError("A receita está vinculada a um produto e não pode ser excluída.", 409);
      const [result] = await connection.query("UPDATE recipe_definitions SET statusRecipe = 'archived' WHERE idRecipe = ?", [recipeId]);
      if (!result.affectedRows) throw new SaleValidationError("Receita não encontrada.", 404);
      await connection.commit();
      json(response, 200, { ok: true });
    } catch (error) {
      if (connection) await connection.rollback();
      handleError(response, error, {
        log: "Falha ao excluir receita:",
        message: "Não foi possível excluir a Receita ou Composição.",
        duplicate: ""
      });
    } finally {
      connection?.release();
    }
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/api/recipe-reviews")) {
    try {
      await ensureRecipeSchema();
      const [reviews] = await pool.query(
        `SELECT reviews.idRecipeReview, reviews.idRecipe, reviews.reasonRecipeReview,
                reviews.statusRecipeReview, reviews.createdAtRecipeReview,
                recipes.nameRecipe, recipes.kindRecipe, products.nameProduct AS resultProductName
         FROM recipe_reviews reviews
         INNER JOIN recipe_definitions recipes ON recipes.idRecipe = reviews.idRecipe
         LEFT JOIN products ON products.idProduct = recipes.idResultProductRecipe
         WHERE reviews.statusRecipeReview = 'pending'
         ORDER BY reviews.createdAtRecipeReview DESC, products.nameProduct`
      );
      json(response, 200, { reviews });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao listar revisões de fichas:",
        message: "Não foi possível consultar as revisões.",
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
        `SELECT idUnit, codeUnit, descriptionUnit, isActiveUnit,
                isTaxableUnit, isCulinaryUnit, baseUnitUnit, categoryUnit
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

  if (request.method === "GET" && request.url.startsWith("/api/physical-states")) {
    try {
      await ensureCulinarySchema();
      const includeInactive = new URL(request.url, "http://localhost").searchParams.get("includeInactive") === "1";
      const [physicalStates] = await pool.query(
        `SELECT idPhysicalState, codePhysicalState, namePhysicalState, descriptionPhysicalState,
                isActivePhysicalState
         FROM physical_states
         WHERE (? OR isActivePhysicalState = 1)
         ORDER BY namePhysicalState`,
        [includeInactive]
      );
      json(response, 200, { physicalStates });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao listar estados físicos:",
        message: "Não foi possível consultar os estados físicos.",
        duplicate: ""
      });
    }
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/api/culinary-units")) {
    try {
      await ensureCulinarySchema();
      const includeInactive = new URL(request.url, "http://localhost").searchParams.get("includeInactive") === "1";
      const [culinaryUnits] = await pool.query(
        `SELECT idUnit AS idCulinaryUnit, codeUnit AS codeCulinaryUnit,
                descriptionUnit AS nameCulinaryUnit,
                baseUnitUnit AS baseUnitCulinaryUnit,
                categoryUnit AS categoryCulinaryUnit,
                descriptionUnit AS descriptionCulinaryUnit,
                isActiveUnit AS isActiveCulinaryUnit
         FROM units
         WHERE isCulinaryUnit = 1
           AND (? OR isActiveUnit = 1)
         ORDER BY descriptionUnit`,
        [includeInactive]
      );
      json(response, 200, { culinaryUnits });
    } catch (error) {
      handleError(response, error, { log: "Falha ao listar unidades culinárias:", message: "Não foi possível consultar as unidades culinárias.", duplicate: "" });
    }
    return;
  }

  if (request.method === "GET"
    && (request.url.startsWith("/api/culinary-unit-conversions")
      || request.url.startsWith("/api/unit-conversions"))) {
    try {
      await ensureCulinarySchema();
      const [conversions] = await pool.query(
        `SELECT conv.idUnitConversion AS idCulinaryUnitConversion,
                conv.idUnitConversion,
                conv.idFromUnitConversion AS idFromCulinaryUnitConversion,
                conv.idFromUnitConversion,
                conv.idToUnitConversion AS idToCulinaryUnitConversion,
                conv.idToUnitConversion,
                conv.idPhysicalStateUnitConversion AS idPhysicalStateCulinaryUnitConversion,
                conv.idPhysicalStateUnitConversion,
                conv.factorUnitConversion AS factorCulinaryUnitConversion,
                conv.factorUnitConversion,
                conv.notesUnitConversion AS notesCulinaryUnitConversion,
                conv.notesUnitConversion,
                source.descriptionUnit AS fromNameCulinaryUnit,
                target.descriptionUnit AS toNameCulinaryUnit,
                state.namePhysicalState
         FROM unit_conversions conv
         INNER JOIN units source ON source.idUnit = conv.idFromUnitConversion
         INNER JOIN units target ON target.idUnit = conv.idToUnitConversion
         INNER JOIN physical_states state ON state.idPhysicalState = conv.idPhysicalStateUnitConversion
         WHERE source.isCulinaryUnit = 1 AND target.isCulinaryUnit = 1
         ORDER BY source.descriptionUnit, target.descriptionUnit, state.namePhysicalState`
      );
      json(response, 200, { conversions });
    } catch (error) {
      handleError(response, error, { log: "Falha ao listar conversões culinárias:", message: "Não foi possível consultar as conversões.", duplicate: "" });
    }
    return;
  }

  if (request.method === "POST" && (request.url === "/api/culinary-units"
    || request.url === "/api/physical-states"
    || request.url === "/api/culinary-unit-conversions"
    || request.url === "/api/unit-conversions")) {
    try {
      await ensureCulinarySchema();
      const payload = await readJsonBody(request);
      const isConversion = request.url === "/api/culinary-unit-conversions"
        || request.url === "/api/unit-conversions";
      if (request.url === "/api/culinary-units") {
        const code = normalizeUnitCode(payload.codeCulinaryUnit);
        const name = normalizeHumanText(payload.nameCulinaryUnit);
        const baseUnit = String(payload.baseUnitCulinaryUnit || "").trim();
        const category = String(payload.categoryCulinaryUnit || "").trim();
        if (!code || code.length > 20 || !name || name.length > 50 || !["g", "ml", "un", "common"].includes(baseUnit) || !["weight", "volume", "unit", "general"].includes(category)) throw new SaleValidationError("Dados da unidade culinária inválidos.");
        const [result] = await pool.query(
          `INSERT INTO units
            (codeUnit, descriptionUnit, isActiveUnit, isTaxableUnit, isCulinaryUnit, baseUnitUnit, categoryUnit)
           VALUES (?, ?, 1, 0, 1, ?, ?)`,
          [code, name, baseUnit, category]
        );
        json(response, 201, { idCulinaryUnit: result.insertId });
      } else if (request.url === "/api/physical-states") {
        const code = normalizeReferenceCode(payload.codePhysicalState);
        const name = String(payload.namePhysicalState || "").trim();
        if (!code || code.length > 30 || !name || name.length > 50) throw new SaleValidationError("Dados do estado físico inválidos.");
        const [result] = await pool.query(
          `INSERT INTO physical_states (codePhysicalState, namePhysicalState, descriptionPhysicalState)
           VALUES (?, ?, ?)`,
          [code, name, String(payload.descriptionPhysicalState || "").trim() || null]
        );
        json(response, 201, { idPhysicalState: result.insertId });
      } else if (isConversion) {
        const fromId = parsePositiveId(payload.idFromUnitConversion ?? payload.idFromCulinaryUnitConversion);
        const toId = parsePositiveId(payload.idToUnitConversion ?? payload.idToCulinaryUnitConversion);
        const stateId = parsePositiveId(payload.idPhysicalStateUnitConversion ?? payload.idPhysicalStateCulinaryUnitConversion);
        const factor = parseBrazilianDecimal(payload.factorUnitConversion ?? payload.factorCulinaryUnitConversion);
        if (!fromId || !toId || !stateId || !Number.isFinite(factor) || factor <= 0) throw new SaleValidationError("Dados da conversão inválidos.");
        const [result] = await pool.query(
          `INSERT INTO unit_conversions
           (idFromUnitConversion, idToUnitConversion, idPhysicalStateUnitConversion, factorUnitConversion, notesUnitConversion)
           VALUES (?, ?, ?, ?, ?)`,
          [fromId, toId, stateId, factor,
            String(payload.notesUnitConversion ?? payload.notesCulinaryUnitConversion ?? "").trim() || null]
        );
        json(response, 201, {
          idUnitConversion: result.insertId,
          idCulinaryUnitConversion: result.insertId
        });
      }
    } catch (error) {
      handleError(response, error, { log: "Falha ao criar cadastro da ficha técnica:", message: "Não foi possível criar o cadastro.", duplicate: "Esse cadastro já existe." });
    }
    return;
  }

  if (request.method === "PUT" && (request.url === "/api/culinary-units"
    || request.url === "/api/physical-states"
    || request.url === "/api/culinary-unit-conversions"
    || request.url === "/api/unit-conversions")) {
    try {
      await ensureCulinarySchema();
      const payload = await readJsonBody(request);
      let id;
      let result;
      const isConversion = request.url === "/api/culinary-unit-conversions"
        || request.url === "/api/unit-conversions";
      if (request.url === "/api/culinary-units") {
        id = parsePositiveId(payload.idCulinaryUnit);
        const code = normalizeUnitCode(payload.codeCulinaryUnit);
        const name = normalizeHumanText(payload.nameCulinaryUnit);
        const baseUnit = String(payload.baseUnitCulinaryUnit || "").trim();
        const category = String(payload.categoryCulinaryUnit || "").trim();
        if (!id || !code || !name || !["g", "ml", "un", "common"].includes(baseUnit) || !["weight", "volume", "unit", "general"].includes(category)) throw new SaleValidationError("Dados da unidade culinária inválidos.");
        [result] = await pool.query(
          `UPDATE units
           SET codeUnit = ?, descriptionUnit = ?, baseUnitUnit = ?, categoryUnit = ?
           WHERE idUnit = ? AND isCulinaryUnit = 1`,
          [code, name, baseUnit, category, id]
        );
      } else if (request.url === "/api/physical-states") {
        id = parsePositiveId(payload.idPhysicalState);
        const code = normalizeReferenceCode(payload.codePhysicalState);
        const name = String(payload.namePhysicalState || "").trim();
        if (!id || !code || !name) throw new SaleValidationError("Dados do estado físico inválidos.");
        [result] = await pool.query(
          `UPDATE physical_states SET codePhysicalState = ?, namePhysicalState = ?, descriptionPhysicalState = ? WHERE idPhysicalState = ?`,
          [code, name, String(payload.descriptionPhysicalState || "").trim() || null, id]
        );
      } else if (isConversion) {
        id = parsePositiveId(payload.idUnitConversion ?? payload.idCulinaryUnitConversion);
        const fromId = parsePositiveId(payload.idFromUnitConversion ?? payload.idFromCulinaryUnitConversion);
        const toId = parsePositiveId(payload.idToUnitConversion ?? payload.idToCulinaryUnitConversion);
        const stateId = parsePositiveId(payload.idPhysicalStateUnitConversion ?? payload.idPhysicalStateCulinaryUnitConversion);
        const factor = parseBrazilianDecimal(payload.factorUnitConversion ?? payload.factorCulinaryUnitConversion);
        if (!id || !fromId || !toId || !stateId || !Number.isFinite(factor) || factor <= 0) throw new SaleValidationError("Dados da conversão inválidos.");
        [result] = await pool.query(
          `UPDATE unit_conversions
           SET idFromUnitConversion = ?, idToUnitConversion = ?, idPhysicalStateUnitConversion = ?,
               factorUnitConversion = ?, notesUnitConversion = ?
           WHERE idUnitConversion = ?`,
          [fromId, toId, stateId, factor,
            String(payload.notesUnitConversion ?? payload.notesCulinaryUnitConversion ?? "").trim() || null, id]
        );
      }
      if (!result.affectedRows) throw new SaleValidationError("Cadastro não encontrado.", 404);
      json(response, 200, { ok: true, id });
    } catch (error) {
      handleError(response, error, { log: "Falha ao editar cadastro da ficha técnica:", message: "Não foi possível editar o cadastro.", duplicate: "Esse cadastro já existe." });
    }
    return;
  }

  if (request.method === "PUT" && (request.url === "/api/culinary-units/status" || request.url === "/api/physical-states/status")) {
    try {
      await ensureCulinarySchema();
      const payload = await readJsonBody(request);
      const isUnit = request.url === "/api/culinary-units/status";
      const id = parsePositiveId(payload[isUnit ? "idCulinaryUnit" : "idPhysicalState"]);
      if (!id || ![true, false, 0, 1].includes(payload.isActive)) throw new SaleValidationError("Cadastro ou status inválido.");
      const [result] = await pool.query(
        isUnit ? "UPDATE units SET isActiveUnit = ? WHERE idUnit = ? AND isCulinaryUnit = 1" : "UPDATE physical_states SET isActivePhysicalState = ? WHERE idPhysicalState = ?",
        [payload.isActive === true || payload.isActive === 1 ? 1 : 0, id]
      );
      if (!result.affectedRows) throw new SaleValidationError("Cadastro não encontrado.", 404);
      json(response, 200, { ok: true, id });
    } catch (error) {
      handleError(response, error, { log: "Falha ao alterar status da ficha técnica:", message: "Não foi possível alterar o status.", duplicate: "" });
    }
    return;
  }

  if (request.method === "DELETE" && (request.url === "/api/culinary-units"
    || request.url === "/api/physical-states"
    || request.url === "/api/culinary-unit-conversions"
    || request.url === "/api/unit-conversions")) {
    try {
      await ensureCulinarySchema();
      const payload = await readJsonBody(request);
      const idField = request.url === "/api/culinary-units"
        ? "idCulinaryUnit"
        : request.url === "/api/physical-states"
          ? "idPhysicalState"
          : request.url === "/api/unit-conversions"
            ? "idUnitConversion"
            : "idCulinaryUnitConversion";
      const id = parsePositiveId(payload[idField]);
      if (!id) throw new SaleValidationError("Cadastro inválido.");
      const [result] = request.url === "/api/culinary-units"
        ? await pool.query("DELETE FROM units WHERE idUnit = ? AND isCulinaryUnit = 1", [id])
        : request.url === "/api/physical-states"
          ? await pool.query("DELETE FROM physical_states WHERE idPhysicalState = ?", [id])
          : await pool.query("DELETE FROM unit_conversions WHERE idUnitConversion = ?", [id]);
      if (!result.affectedRows) throw new SaleValidationError("Cadastro não encontrado.", 404);
      json(response, 200, { ok: true, id });
    } catch (error) {
      handleError(response, error, { log: "Falha ao excluir cadastro da ficha técnica:", message: "Não foi possível excluir o cadastro.", duplicate: "Não é possível excluir um cadastro usado por conversões." });
    }
    return;
  }

  if (request.method === "POST" && (request.url === "/api/product-types" || request.url === "/api/units")) {
    try {
      await ensureProductCatalogSchema();
      const payload = await readJsonBody(request);
      const isUnit = request.url === "/api/units";
      const description = typeof payload[isUnit ? "descriptionUnit" : "descriptionProductType"] === "string"
        ? normalizeHumanText(payload[isUnit ? "descriptionUnit" : "descriptionProductType"])
        : "";
      const spedCode = !isUnit && typeof payload.codeSpedProductType === "string"
        ? payload.codeSpedProductType.trim()
        : null;
      const code = isUnit && typeof payload.codeUnit === "string" ? normalizeUnitCode(payload.codeUnit) : "";
      const baseUnit = isUnit ? String(payload.baseUnitUnit ?? "common").trim() : "";
      const category = isUnit ? String(payload.categoryUnit ?? "general").trim() : "";
      const isActive = isUnit ? parseBooleanFlag(payload.isActiveUnit, "Ativa", true) : null;
      const isTaxable = isUnit ? parseBooleanFlag(payload.isTaxableUnit, "Tributável", true) : null;
      const isCulinary = isUnit ? parseBooleanFlag(payload.isCulinaryUnit, "Culinária") : null;
      if (!description || description.length > (isUnit ? 80 : 120)
        || (!isUnit && spedCode && spedCode.length > 30)
        || (isUnit && (!code || code.length > 20
          || !["g", "ml", "un", "common"].includes(baseUnit)
          || !["weight", "volume", "unit", "general"].includes(category)))) {
        throw new SaleValidationError(isUnit ? "Código ou descrição da unidade inválidos." : "Descrição do tipo de produto inválida.");
      }
      const [result] = await pool.query(
        isUnit
          ? `INSERT INTO units
             (codeUnit, descriptionUnit, isActiveUnit, isTaxableUnit, isCulinaryUnit, baseUnitUnit, categoryUnit)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          : "INSERT INTO product_types (codeSpedProductType, descriptionProductType) VALUES (?, ?)",
        isUnit
          ? [code, description, isActive, isTaxable, isCulinary, baseUnit, category]
          : [spedCode || null, description]
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
        ? normalizeHumanText(payload[isUnit ? "descriptionUnit" : "descriptionProductType"])
        : "";
      const spedCode = !isUnit && typeof payload.codeSpedProductType === "string"
        ? payload.codeSpedProductType.trim()
        : null;
      const code = isUnit && typeof payload.codeUnit === "string" ? normalizeUnitCode(payload.codeUnit) : "";
      const baseUnit = isUnit ? String(payload.baseUnitUnit ?? "common").trim() : "";
      const category = isUnit ? String(payload.categoryUnit ?? "general").trim() : "";
      const isActive = isUnit ? parseBooleanFlag(payload.isActiveUnit, "Ativa", true) : null;
      const isTaxable = isUnit ? parseBooleanFlag(payload.isTaxableUnit, "Tributável", true) : null;
      const isCulinary = isUnit ? parseBooleanFlag(payload.isCulinaryUnit, "Culinária") : null;
      if (!id || !description || description.length > (isUnit ? 80 : 120)
        || (!isUnit && spedCode && spedCode.length > 30)
        || (isUnit && (!code || code.length > 20
          || !["g", "ml", "un", "common"].includes(baseUnit)
          || !["weight", "volume", "unit", "general"].includes(category)))) {
        throw new SaleValidationError("Dados do cadastro auxiliar inválidos.");
      }
      const [result] = await pool.query(
        isUnit
          ? `UPDATE units
             SET codeUnit = ?, descriptionUnit = ?, isActiveUnit = ?, isTaxableUnit = ?,
                 isCulinaryUnit = ?, baseUnitUnit = ?, categoryUnit = ?
             WHERE idUnit = ?`
          : "UPDATE product_types SET codeSpedProductType = ?, descriptionProductType = ? WHERE idProductType = ?",
        isUnit
          ? [code, description, isActive, isTaxable, isCulinary, baseUnit, category, id]
          : [spedCode || null, description, id]
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

  if (request.method === "PUT" && request.url === "/api/units/flags") {
    try {
      await ensureProductCatalogSchema();
      const payload = await readJsonBody(request);
      const id = parsePositiveId(payload.idUnit);
      const fieldMap = {
        isActiveUnit: ["Ativa", true],
        isTaxableUnit: ["Tributável", true],
        isCulinaryUnit: ["Culinária", false]
      };
      const fieldName = typeof payload.field === "string" ? payload.field : "";
      const field = fieldMap[fieldName];
      if (!id || !field) throw new SaleValidationError("Aplicação da unidade inválida.");
      const value = parseBooleanFlag(payload.value, field[0], field[1]);
      const [result] = await pool.query(
        `UPDATE units SET ${fieldName} = ? WHERE idUnit = ?`,
        [value, id]
      );
      if (!result.affectedRows) throw new SaleValidationError("Unidade não encontrada.", 404);
      json(response, 200, { ok: true, id });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao alterar aplicação da unidade:",
        message: "Não foi possível alterar a aplicação da unidade.",
        duplicate: ""
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

  if (request.method === "GET" && request.url.startsWith("/api/suppliers")) {
    try {
      await ensureSupplierSchema();
      const includeInactive = new URL(request.url, "http://localhost").searchParams.get("includeInactive") === "1";
      const [suppliers] = await pool.query(
        `SELECT idSupplier, typeSupplier, documentSupplier, companyNameSupplier,
                tradeNameSupplier, contactNameSupplier, phoneSupplier, emailSupplier,
                zipCodeSupplier, addressSupplier, addressNumberSupplier,
                addressComplementSupplier, neighborhoodSupplier, citySupplier,
                stateSupplier, countrySupplier, notesSupplier, isActiveSupplier
         FROM suppliers
         WHERE (? OR isActiveSupplier = 1)
         ORDER BY COALESCE(NULLIF(tradeNameSupplier, ''), companyNameSupplier), idSupplier`,
        [includeInactive]
      );
      json(response, 200, { suppliers });
    } catch (error) {
      handleError(response, error, { log: "Falha ao listar fornecedores:", message: "Não foi possível consultar os fornecedores.", duplicate: "" });
    }
    return;
  }

  if ((request.method === "POST" || request.method === "PUT") && request.url === "/api/suppliers") {
    try {
      const payload = await readJsonBody(request);
      const idSupplier = request.method === "PUT" ? parsePositiveId(payload.idSupplier) : null;
      const typeSupplier = ["juridica", "fisica"].includes(payload.typeSupplier) ? payload.typeSupplier : "";
      const value = (field, max) => typeof payload[field] === "string" ? payload[field].trim().slice(0, max) : "";
      const humanValue = (field, max) => normalizeHumanText(value(field, max));
      const documentSupplier = value("documentSupplier", 20).replace(/\D/g, "");
      const companyNameSupplier = humanValue("companyNameSupplier", 180);
      const tradeNameSupplier = humanValue("tradeNameSupplier", 120);
      const contactNameSupplier = humanValue("contactNameSupplier", 120);
      const phoneSupplier = value("phoneSupplier", 25);
      const emailSupplier = value("emailSupplier", 180);
      const zipCodeSupplier = value("zipCodeSupplier", 9);
      const addressSupplier = humanValue("addressSupplier", 180);
      const addressNumberSupplier = value("addressNumberSupplier", 20);
      const addressComplementSupplier = humanValue("addressComplementSupplier", 80);
      const neighborhoodSupplier = humanValue("neighborhoodSupplier", 100);
      const citySupplier = humanValue("citySupplier", 100);
      const stateSupplier = value("stateSupplier", 2);
      const countrySupplier = humanValue("countrySupplier", 80) || "Brasil";
      const notesSupplier = humanValue("notesSupplier", 400);
      const documentLength = typeSupplier === "fisica" ? 11 : 14;
      if ((request.method === "PUT" && !idSupplier) || !typeSupplier || documentSupplier.length !== documentLength
        || !companyNameSupplier || !countrySupplier || (emailSupplier && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailSupplier))
        || (stateSupplier && !/^[A-Z]{2}$/.test(stateSupplier))) {
        throw new SaleValidationError("Tipo, documento, nome ou dados de contato do fornecedor inválidos.");
      }
      await ensureSupplierSchema();
      const values = [
        typeSupplier, documentSupplier, companyNameSupplier, tradeNameSupplier, contactNameSupplier,
        phoneSupplier, emailSupplier, zipCodeSupplier, addressSupplier, addressNumberSupplier,
        addressComplementSupplier, neighborhoodSupplier, citySupplier, stateSupplier, countrySupplier,
        notesSupplier || null
      ];
      if (request.method === "POST") {
        const [result] = await pool.query(
          `INSERT INTO suppliers
            (typeSupplier, documentSupplier, companyNameSupplier, tradeNameSupplier,
             contactNameSupplier, phoneSupplier, emailSupplier, zipCodeSupplier,
             addressSupplier, addressNumberSupplier, addressComplementSupplier,
             neighborhoodSupplier, citySupplier, stateSupplier, countrySupplier, notesSupplier)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          values
        );
        json(response, 201, { idSupplier: result.insertId });
      } else {
        const [result] = await pool.query(
          `UPDATE suppliers SET typeSupplier = ?, documentSupplier = ?, companyNameSupplier = ?,
             tradeNameSupplier = ?, contactNameSupplier = ?, phoneSupplier = ?, emailSupplier = ?,
             zipCodeSupplier = ?, addressSupplier = ?, addressNumberSupplier = ?,
             addressComplementSupplier = ?, neighborhoodSupplier = ?, citySupplier = ?,
             stateSupplier = ?, countrySupplier = ?, notesSupplier = ?
           WHERE idSupplier = ?`,
          [...values, idSupplier]
        );
        if (!result.affectedRows) throw new SaleValidationError("Fornecedor não encontrado.", 404);
        json(response, 200, { idSupplier });
      }
    } catch (error) {
      handleError(response, error, { log: "Falha ao salvar fornecedor:", message: "Não foi possível salvar o fornecedor.", duplicate: "Já existe um fornecedor com esse documento e tipo." });
    }
    return;
  }

  if (request.method === "PUT" && request.url === "/api/suppliers/status") {
    try {
      const payload = await readJsonBody(request);
      const idSupplier = parsePositiveId(payload.idSupplier);
      if (!idSupplier || ![true, false, 0, 1].includes(payload.isActiveSupplier)) throw new SaleValidationError("Fornecedor ou status inválido.");
      await ensureSupplierSchema();
      const [result] = await pool.query("UPDATE suppliers SET isActiveSupplier = ? WHERE idSupplier = ?", [payload.isActiveSupplier === true || payload.isActiveSupplier === 1 ? 1 : 0, idSupplier]);
      if (!result.affectedRows) throw new SaleValidationError("Fornecedor não encontrado.", 404);
      json(response, 200, { ok: true, idSupplier });
    } catch (error) {
      handleError(response, error, { log: "Falha ao alterar status do fornecedor:", message: "Não foi possível alterar o status do fornecedor.", duplicate: "" });
    }
    return;
  }

  if (request.method === "DELETE" && request.url === "/api/suppliers") {
    try {
      const payload = await readJsonBody(request);
      const idSupplier = parsePositiveId(payload.idSupplier);
      if (!idSupplier) throw new SaleValidationError("Fornecedor inválido.");
      await ensureSupplierSchema();
      const [result] = await pool.query("DELETE FROM suppliers WHERE idSupplier = ?", [idSupplier]);
      if (!result.affectedRows) throw new SaleValidationError("Fornecedor não encontrado.", 404);
      json(response, 200, { ok: true, idSupplier });
    } catch (error) {
      handleError(response, error, { log: "Falha ao excluir fornecedor:", message: "Não foi possível excluir o fornecedor.", duplicate: "" });
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
      const descriptionClass = typeof payload.descriptionClass === "string" ? normalizeHumanText(payload.descriptionClass) : "";
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

  if (request.method === "GET" && request.url.startsWith("/api/ncm-cest/ncms")) {
    try {
      await ensureNcmCestSchema();
      const requestUrl = new URL(request.url, "http://localhost");
      const pagination = parseCatalogPagination(requestUrl.searchParams);
      const { hasPagination, search } = pagination;
      if (!hasPagination) {
        const [ncms] = await pool.query(
          `SELECT idNcm, codeNcm, descriptionNcm
           FROM ncm_catalog
           WHERE isActiveNcm = 1
           ORDER BY codeNcm`
        );
        json(response, 200, { ncms });
        return;
      }
      const { page, pageSize } = pagination;
      const like = `%${search}%`;
      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM ncm_catalog
         WHERE isActiveNcm = 1
           AND (? = '' OR codeNcm LIKE ? OR descriptionNcm LIKE ?)`,
        [search, like, like]
      );
      const { pageCount, page: normalizedPage } = normalizeCatalogPage(page, total, pageSize);
      const [ncms] = await pool.query(
        `SELECT idNcm, codeNcm, descriptionNcm
         FROM ncm_catalog
         WHERE isActiveNcm = 1
           AND (? = '' OR codeNcm LIKE ? OR descriptionNcm LIKE ?)
         ORDER BY codeNcm
         LIMIT ? OFFSET ?`,
        [search, like, like, pageSize, (normalizedPage - 1) * pageSize]
      );
      json(response, 200, {
        ncms,
        total: Number(total),
        page: normalizedPage,
        pageSize,
        pageCount
      });
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

  if (request.method === "GET" && request.url.startsWith("/api/ncm-cest/cests")) {
    try {
      await ensureNcmCestSchema();
      const requestUrl = new URL(request.url, "http://localhost");
      const pagination = parseCatalogPagination(requestUrl.searchParams);
      const { hasPagination, search } = pagination;
      if (!hasPagination) {
        const [cests] = await pool.query(
          `SELECT idCest, codeCest, descriptionCest, segmentCest
           FROM cest_catalog
           WHERE isActiveCest = 1
           ORDER BY codeCest`
        );
        json(response, 200, { cests });
        return;
      }
      const { page, pageSize } = pagination;
      const like = `%${search}%`;
      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM cest_catalog
         WHERE isActiveCest = 1
           AND (? = '' OR codeCest LIKE ? OR descriptionCest LIKE ? OR segmentCest LIKE ?)`,
        [search, like, like, like]
      );
      const { pageCount, page: normalizedPage } = normalizeCatalogPage(page, total, pageSize);
      const [cests] = await pool.query(
        `SELECT idCest, codeCest, descriptionCest, segmentCest
         FROM cest_catalog
         WHERE isActiveCest = 1
           AND (? = '' OR codeCest LIKE ? OR descriptionCest LIKE ? OR segmentCest LIKE ?)
         ORDER BY codeCest
         LIMIT ? OFFSET ?`,
        [search, like, like, like, pageSize, (normalizedPage - 1) * pageSize]
      );
      json(response, 200, {
        cests,
        total: Number(total),
        page: normalizedPage,
        pageSize,
        pageCount
      });
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
      const ncmDescription = typeof payload.ncmDescription === "string" ? normalizeHumanText(payload.ncmDescription) : "";
      const cestDescription = typeof payload.cestDescription === "string" ? normalizeHumanText(payload.cestDescription) : "";
      const segment = typeof payload.segment === "string" ? normalizeHumanText(payload.segment) : "";
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
      const descriptionClass = typeof payload.descriptionClass === "string" ? normalizeHumanText(payload.descriptionClass) : "";
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
      const descriptionGroup = typeof payload.descriptionGroup === "string" ? normalizeHumanText(payload.descriptionGroup) : "";
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
      const descriptionGroup = typeof payload.descriptionGroup === "string" ? normalizeHumanText(payload.descriptionGroup) : "";
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
      const nameProduct = typeof payload.nameProduct === "string" ? normalizeHumanText(payload.nameProduct) : "";
      const skuProduct = typeof payload.skuProduct === "string" ? payload.skuProduct.trim().toUpperCase() : "";
      const ncmProduct = typeof payload.ncmProduct === "string" ? payload.ncmProduct.replace(/\D/g, "") : "";
      const cestProduct = typeof payload.cestProduct === "string" ? payload.cestProduct.replace(/\D/g, "") : "";
      const idGroup = parsePositiveId(payload.idGroup);
      const idFiscalOperationSaleProduct = parsePositiveId(payload.idFiscalOperationSaleProduct);
      const idProductTypeProduct = parsePositiveId(payload.idProductTypeProduct);
      const idPhysicalStateProduct = parsePositiveId(payload.idPhysicalStateProduct);
      const idUnitProduct = parsePositiveId(payload.idUnitProduct);
      if (!nameProduct || nameProduct.length > 180 || !skuProduct || skuProduct.length > 64 || !idGroup || (ncmProduct && !/^\d{8}$/.test(ncmProduct)) || (cestProduct && !/^\d{7}$/.test(cestProduct))) throw new SaleValidationError("Nome, SKU, grupo, NCM ou CEST inválidos.");
      await ensureProductCatalogSchema();
      await ensureCulinarySchema();
      await ensureRecipeSchema();
      const allowNegativeStock = await getGeneralSettingBoolean("allowNegativeStock");
      const costPriceProduct = parseMoney(payload.costPriceProduct ?? "0", "Preço de custo");
      const controlsStockProduct = parseBooleanFlag(payload.controlsStockProduct, "Controla estoque", true);
      const isBuffetProduct = parseBooleanFlag(payload.isBuffetProduct, "Produto Buffet", false);
      const isFractionalProduct = parseBooleanFlag(payload.isFractionalProduct, "Produto fracionado");
      const showsInPdvProduct = parseBooleanFlag(payload.showsInPdvProduct, "Exibe no PDV", true);
      const isActiveProduct = parseBooleanFlag(payload.isActiveProduct, "Status do produto", true);
      const stockQuantityProduct = parseProductQuantity(payload.stockQuantityProduct, allowNegativeStock, Boolean(isFractionalProduct));
      const [groups] = await pool.query("SELECT idGroup FROM `groups` WHERE idGroup = ?", [idGroup]);
      if (!groups.length) throw new SaleValidationError("Grupo não encontrado.", 409);
      const [productTypeRows] = await pool.query("SELECT idProductType, descriptionProductType FROM product_types WHERE idProductType = ? AND isActiveProductType = 1", [idProductTypeProduct]);
      if (idProductTypeProduct && !productTypeRows.length) throw new SaleValidationError("Tipo de produto não encontrado.", 409);
      const printsPlace = resolvePrintPlace(
        payload.printsPlace,
        productTypeRows[0]?.descriptionProductType,
        payload.printsKitchenProduct
      );
      const nonSaleProduct = isNonSaleProductType(productTypeRows[0]?.descriptionProductType);
      const isRawMaterial = normalizeTextForComparison(productTypeRows[0]?.descriptionProductType) === "MATÉRIA-PRIMA";
      if (isRawMaterial && !idPhysicalStateProduct) {
        throw new SaleValidationError("Estado físico é obrigatório para matéria-prima.");
      }
      const normalizedPhysicalStateProduct = isRawMaterial ? idPhysicalStateProduct : null;
      if (normalizedPhysicalStateProduct) {
        const [physicalStateRows] = await pool.query(
          "SELECT idPhysicalState FROM physical_states WHERE idPhysicalState = ?",
          [normalizedPhysicalStateProduct]
        );
        if (!physicalStateRows.length) throw new SaleValidationError("Estado físico não encontrado.", 409);
      }
      const priceProduct = nonSaleProduct
        ? costPriceProduct
        : parseMoney(payload.priceProduct, "Preço");
      const [unitRows] = await pool.query(
        "SELECT idUnit FROM units WHERE idUnit = ? AND isActiveUnit = 1 AND isTaxableUnit = 1",
        [idUnitProduct]
      );
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
         (idGroup, skuProduct, nameProduct, idFiscalOperationSaleProduct,
           idProductTypeProduct, idPhysicalStateProduct, idUnitProduct, ncmProduct, cestProduct, priceProduct, costPriceProduct,
           stockQuantityProduct, controlsStockProduct, isBuffetProduct, isFractionalProduct, printsPlace,
           showsInPdvProduct, isActiveProduct)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
        [idGroup, skuProduct, nameProduct, idFiscalOperationSaleProduct,
          idProductTypeProduct, normalizedPhysicalStateProduct, idUnitProduct, ncmProduct || null, cestProduct || null,
          priceProduct, costPriceProduct, stockQuantityProduct, controlsStockProduct, isBuffetProduct, isFractionalProduct,
          printsPlace, showsInPdvProduct, isActiveProduct]
      );
      const pdvCodeProduct = String(result.insertId);
      await pool.query("UPDATE products SET pdvCodeProduct = ? WHERE idProduct = ?", [pdvCodeProduct, result.insertId]);
      json(response, 201, { product: { idProduct: result.insertId, idGroup, skuProduct, pdvCodeProduct, nameProduct, idFiscalOperationSaleProduct, idProductTypeProduct, idPhysicalStateProduct: normalizedPhysicalStateProduct, idUnitProduct, ncmProduct: ncmProduct || null, cestProduct: cestProduct || null, priceProduct, costPriceProduct, stockQuantityProduct, controlsStockProduct, isBuffetProduct, isFractionalProduct, printsPlace, showsInPdvProduct, isActiveProduct } });
    } catch (error) {
      handleError(response, error, { log: "Falha ao criar produto:", message: "Não foi possível criar o produto.", duplicate: "SKU já cadastrado." });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/products/import") {
    let connection;
    try {
      const payload = await readJsonBody(request);
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      const validateOnly = payload.validateOnly === true;
      if (!rows.length || rows.length > 1000) {
        throw new SaleValidationError("Informe entre 1 e 1000 produtos para importar.");
      }
      await ensureProductCatalogSchema();
      await ensureCulinarySchema();
      await ensureRecipeSchema();
      const allowNegativeStock = await getGeneralSettingBoolean("allowNegativeStock");
      connection = await pool.getConnection();
      await connection.beginTransaction();
      let importedCount = 0;
      const importedSkus = new Map();
      for (const [index, row] of rows.entries()) {
        const line = index + 2;
        const skuProduct = typeof row.skuProduct === "string" ? row.skuProduct.trim().toUpperCase() : "";
        const nameProduct = typeof row.nameProduct === "string" ? normalizeHumanText(row.nameProduct) : "";
        const descriptionGroup = typeof row.descriptionGroup === "string" ? normalizeHumanText(row.descriptionGroup) : "";
        const descriptionFiscalOperation = typeof row.descriptionFiscalOperation === "string" ? normalizeHumanText(row.descriptionFiscalOperation) : "";
        const descriptionProductType = typeof row.descriptionProductType === "string" ? normalizeHumanText(row.descriptionProductType) : "";
        const descriptionPhysicalState = typeof row.descriptionPhysicalState === "string" ? normalizeHumanText(row.descriptionPhysicalState) : "";
        const codeUnit = typeof row.codeUnit === "string" ? normalizeUnitCode(row.codeUnit) : "";
        const ncmProduct = typeof row.ncmProduct === "string" ? row.ncmProduct.replace(/\D/g, "") : "";
        const cestProduct = typeof row.cestProduct === "string" ? row.cestProduct.replace(/\D/g, "") : "";
        const priceValue = String(row.priceProduct ?? "").trim().replace(",", ".");
        const costPriceValue = String(row.costPriceProduct ?? "0").trim().replace(",", ".");
        const stockValue = String(row.stockQuantityProduct ?? "0").trim().replace(",", ".");
        if (!skuProduct || skuProduct.length > 64 || !nameProduct || nameProduct.length > 180 || !descriptionGroup
          || (!priceValue && !costPriceValue)) {
          throw new SaleValidationError(`Linha ${line}: SKU, nome, grupo e preço são obrigatórios ou inválidos.`);
        }
        const duplicateMessages = [];
        const previousSkuLine = importedSkus.get(skuProduct);
        if (previousSkuLine) {
          duplicateMessages.push(`SKU "${skuProduct}" também aparece na linha ${previousSkuLine} do arquivo`);
        }
        const existingConditions = ["skuProduct = ?"];
        const existingParameters = [skuProduct];
        const [existingProducts] = await connection.query(
          `SELECT skuProduct, nameProduct
           FROM products
           WHERE ${existingConditions.join(" OR ")}
           LIMIT 10`,
          existingParameters
        );
        for (const existingProduct of existingProducts) {
          if (existingProduct.skuProduct === skuProduct) {
            duplicateMessages.push(
              `SKU "${skuProduct}" já está cadastrado no produto "${existingProduct.nameProduct}"`
            );
          }
        }
        if (duplicateMessages.length) {
          throw new SaleValidationError(`Linha ${line}: ${duplicateMessages.join("; ")}.`);
        }
        importedSkus.set(skuProduct, line);
        const [groupRows] = await connection.query(
          "SELECT idGroup FROM `groups` WHERE descriptionGroup = ? LIMIT 1",
          [descriptionGroup]
        );
        if (!groupRows.length) throw new SaleValidationError(`Linha ${line}: grupo "${descriptionGroup}" não encontrado.`);
        const [fiscalRows] = descriptionFiscalOperation
          ? await connection.query(
            `SELECT idFiscalOperation FROM fiscal_operations
             WHERE typeFiscalOperation = 'exit'
               AND isActiveFiscalOperation = 1
               AND (descriptionFiscalOperation = ? OR cfopFiscalOperation = ?)
             LIMIT 1`,
            [descriptionFiscalOperation, descriptionFiscalOperation]
          )
          : [[]];
        if (descriptionFiscalOperation && !fiscalRows.length) {
          throw new SaleValidationError(`Linha ${line}: operação fiscal ou CFOP "${descriptionFiscalOperation}" não encontrado.`);
        }
        const [typeRows] = descriptionProductType
          ? await connection.query(
            `SELECT idProductType, codeSpedProductType, descriptionProductType
             FROM product_types
             WHERE isActiveProductType = 1
               AND (descriptionProductType = ? OR codeSpedProductType = ?)
             LIMIT 1`,
            [descriptionProductType, descriptionProductType]
          )
          : [[]];
        if (descriptionProductType && !typeRows.length) {
          throw new SaleValidationError(`Linha ${line}: tipo de produto ou Código SPED "${descriptionProductType}" não encontrado.`);
        }
        const isRawMaterial = normalizeTextForComparison(typeRows[0]?.descriptionProductType) === "MATÉRIA-PRIMA";
        const physicalStateId = parsePositiveId(descriptionPhysicalState);
        const [physicalStateRows] = descriptionPhysicalState
          ? await connection.query(
            `SELECT idPhysicalState, namePhysicalState, codePhysicalState, descriptionPhysicalState
             FROM physical_states
             WHERE isActivePhysicalState = 1
               AND (idPhysicalState = ? OR namePhysicalState = ? OR codePhysicalState = ? OR descriptionPhysicalState = ?)
             LIMIT 1`,
            [physicalStateId, descriptionPhysicalState, descriptionPhysicalState, descriptionPhysicalState]
          )
          : [[]];
        if (descriptionPhysicalState && !physicalStateRows.length) {
          throw new SaleValidationError(`Linha ${line}: estado físico "${descriptionPhysicalState}" não encontrado.`);
        }
        if (isRawMaterial && !physicalStateRows.length) {
          throw new SaleValidationError(`Linha ${line}: Estado Físico é obrigatório para matéria-prima.`);
        }
        const printsPlace = resolvePrintPlace(
          row.printsPlace,
          typeRows[0]?.descriptionProductType,
          parseImportBoolean(row.printsKitchenProduct, 0, "Imprime na cozinha")
        );
        const nonSaleProduct = isNonSaleProductType(typeRows[0]?.descriptionProductType);
        const [unitRows] = codeUnit
          ? await connection.query(
            `SELECT idUnit FROM units
             WHERE isActiveUnit = 1
               AND (codeUnit = ? OR descriptionUnit = ?)
             LIMIT 1`,
            [codeUnit, codeUnit]
          )
          : [[]];
        if (codeUnit && !unitRows.length) {
          throw new SaleValidationError(`Linha ${line}: código ou descrição da unidade "${codeUnit}" não encontrado.`);
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
        const costPriceProduct = parseMoney(costPriceValue || "0", `Preço de custo da linha ${line}`);
        const priceProduct = nonSaleProduct
          ? costPriceProduct
          : parseMoney(priceValue, `Preço da linha ${line}`);
        const controlsStockProduct = parseImportBoolean(row.controlsStockProduct, 1, "Controla estoque");
        const isFractionalProduct = parseImportBoolean(row.isFractionalProduct, 0, "Produto fracionado");
        const showsInPdvProduct = parseImportBoolean(row.showsInPdvProduct, 1, "Exibe no PDV");
        const isActiveProduct = parseImportStatus(row.isActiveProduct, 1);
        const stockQuantityProduct = parseProductQuantity(stockValue || "0", allowNegativeStock, Boolean(isFractionalProduct));
        const [result] = await connection.query(
          `INSERT INTO products
           (idGroup, skuProduct, nameProduct, idFiscalOperationSaleProduct,
             idProductTypeProduct, idPhysicalStateProduct, idUnitProduct, ncmProduct, cestProduct, priceProduct, costPriceProduct,
             stockQuantityProduct, controlsStockProduct, isFractionalProduct, printsPlace,
             showsInPdvProduct, isActiveProduct)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
          [
           groupRows[0].idGroup, skuProduct, nameProduct,
            fiscalRows[0]?.idFiscalOperation || null, typeRows[0]?.idProductType || null,
            isRawMaterial ? physicalStateRows[0].idPhysicalState : null,
            unitRows[0]?.idUnit || null, ncmProduct || null, cestProduct || null,
            priceProduct, costPriceProduct, stockQuantityProduct, controlsStockProduct, isFractionalProduct,
            printsPlace, showsInPdvProduct, isActiveProduct
          ]
        );
        await connection.query(
          "UPDATE products SET pdvCodeProduct = ? WHERE idProduct = ?",
          [String(result.insertId), result.insertId]
        );
        importedCount += 1;
      }
      if (validateOnly) {
        await connection.rollback();
        json(response, 200, { valid: true, validatedCount: rows.length });
      } else {
        await connection.commit();
        json(response, 201, { importedCount });
      }
    } catch (error) {
      if (connection) await connection.rollback().catch(() => {});
      handleError(response, error, {
        log: "Falha ao importar produtos:",
        message: "Não foi possível importar os produtos.",
        duplicate: "SKU duplicado no arquivo ou no cadastro."
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
      const nameProduct = typeof payload.nameProduct === "string" ? normalizeHumanText(payload.nameProduct) : "";
      const skuProduct = typeof payload.skuProduct === "string" ? payload.skuProduct.trim().toUpperCase() : "";
      const ncmProduct = typeof payload.ncmProduct === "string" ? payload.ncmProduct.replace(/\D/g, "") : "";
      const cestProduct = typeof payload.cestProduct === "string" ? payload.cestProduct.replace(/\D/g, "") : "";
      const idGroup = parsePositiveId(payload.idGroup);
      const idFiscalOperationSaleProduct = parsePositiveId(payload.idFiscalOperationSaleProduct);
      const idProductTypeProduct = parsePositiveId(payload.idProductTypeProduct);
      const idPhysicalStateProduct = parsePositiveId(payload.idPhysicalStateProduct);
      const idUnitProduct = parsePositiveId(payload.idUnitProduct);
      if (!idProduct || !nameProduct || nameProduct.length > 180 || !skuProduct || skuProduct.length > 64 || !idGroup || (ncmProduct && !/^\d{8}$/.test(ncmProduct)) || (cestProduct && !/^\d{7}$/.test(cestProduct))) throw new SaleValidationError("Produto, nome, SKU, grupo, NCM ou CEST inválidos.");
      await ensureProductCatalogSchema();
      await ensureCulinarySchema();
      const allowNegativeStock = await getGeneralSettingBoolean("allowNegativeStock");
      const costPriceProduct = parseMoney(payload.costPriceProduct ?? "0", "Preço de custo");
      const controlsStockProduct = parseBooleanFlag(payload.controlsStockProduct, "Controla estoque", true);
      const isBuffetProduct = parseBooleanFlag(payload.isBuffetProduct, "Produto Buffet", false);
      const isFractionalProduct = parseBooleanFlag(payload.isFractionalProduct, "Produto fracionado");
      const showsInPdvProduct = parseBooleanFlag(payload.showsInPdvProduct, "Exibe no PDV", true);
      const stockQuantityProduct = parseProductQuantity(payload.stockQuantityProduct, allowNegativeStock, Boolean(isFractionalProduct));
      const [groups] = await pool.query("SELECT idGroup FROM `groups` WHERE idGroup = ?", [idGroup]);
      if (!groups.length) throw new SaleValidationError("Grupo não encontrado.", 409);
      const [productTypeRows] = await pool.query("SELECT idProductType, descriptionProductType FROM product_types WHERE idProductType = ? AND isActiveProductType = 1", [idProductTypeProduct]);
      if (idProductTypeProduct && !productTypeRows.length) throw new SaleValidationError("Tipo de produto não encontrado.", 409);
      const printsPlace = resolvePrintPlace(
        payload.printsPlace,
        productTypeRows[0]?.descriptionProductType,
        payload.printsKitchenProduct
      );
      const nonSaleProduct = isNonSaleProductType(productTypeRows[0]?.descriptionProductType);
      const isRawMaterial = normalizeTextForComparison(productTypeRows[0]?.descriptionProductType) === "MATÉRIA-PRIMA";
      if (isRawMaterial && !idPhysicalStateProduct) {
        throw new SaleValidationError("Estado físico é obrigatório para matéria-prima.");
      }
      const normalizedPhysicalStateProduct = isRawMaterial ? idPhysicalStateProduct : null;
      if (normalizedPhysicalStateProduct) {
        const [physicalStateRows] = await pool.query(
          "SELECT idPhysicalState FROM physical_states WHERE idPhysicalState = ?",
          [normalizedPhysicalStateProduct]
        );
        if (!physicalStateRows.length) throw new SaleValidationError("Estado físico não encontrado.", 409);
      }
      const priceProduct = nonSaleProduct
        ? costPriceProduct
        : parseMoney(payload.priceProduct, "Preço");
      const [unitRows] = await pool.query(
        "SELECT idUnit FROM units WHERE idUnit = ? AND isActiveUnit = 1 AND isTaxableUnit = 1",
        [idUnitProduct]
      );
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
      const [existingProductRows] = await pool.query(
        "SELECT pdvCodeProduct FROM products WHERE idProduct = ?",
        [idProduct]
      );
      if (!existingProductRows.length) throw new SaleValidationError("Produto não encontrado.", 404);
      const pdvCodeProduct = existingProductRows[0].pdvCodeProduct;
      const [result] = await pool.query(
        `UPDATE products SET idGroup = ?, skuProduct = ?, nameProduct = ?,
          idFiscalOperationSaleProduct = ?, idProductTypeProduct = ?, idPhysicalStateProduct = ?, idUnitProduct = ?,
          ncmProduct = ?, cestProduct = ?, priceProduct = ?, costPriceProduct = ?, stockQuantityProduct = ?,
          controlsStockProduct = ?, isBuffetProduct = ?, isFractionalProduct = ?, printsPlace = ?,
          showsInPdvProduct = ?
         WHERE idProduct = ?`,
        [idGroup, skuProduct, nameProduct, idFiscalOperationSaleProduct,
          idProductTypeProduct, normalizedPhysicalStateProduct, idUnitProduct, ncmProduct || null, cestProduct || null,
          priceProduct, costPriceProduct, stockQuantityProduct, controlsStockProduct, isBuffetProduct, isFractionalProduct,
          printsPlace, showsInPdvProduct, idProduct]
      );
      if (!result.affectedRows) throw new SaleValidationError("Produto não encontrado.", 404);
      json(response, 200, { product: { idProduct, idGroup, skuProduct, pdvCodeProduct, nameProduct, idFiscalOperationSaleProduct, idProductTypeProduct, idPhysicalStateProduct: normalizedPhysicalStateProduct, idUnitProduct, ncmProduct: ncmProduct || null, cestProduct: cestProduct || null, priceProduct, costPriceProduct, stockQuantityProduct, controlsStockProduct, isBuffetProduct, isFractionalProduct, printsPlace, showsInPdvProduct } });
    } catch (error) {
      handleError(response, error, { log: "Falha ao editar produto:", message: "Não foi possível editar o produto.", duplicate: "SKU já cadastrado." });
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
        const namePaymentMethod = typeof payload.namePaymentMethod === "string" ? normalizeHumanText(payload.namePaymentMethod) : "";
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
      const descriptionFiscalCatalogItem = typeof payload.descriptionFiscalCatalogItem === "string" ? normalizeHumanText(payload.descriptionFiscalCatalogItem) : "";
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
      const descriptionFiscalOperation = typeof payload.descriptionFiscalOperation === "string" ? normalizeHumanText(payload.descriptionFiscalOperation) : "";
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

  if (request.method === "GET" && request.url.startsWith("/api/sales")) {
    try {
      requireOperatorSession(request);
      await ensureSaleFiscalSchema();
      const requestUrl = new URL(request.url, "http://localhost");
      const sales = await listRecentSales(pool, requestUrl.searchParams.get("limit"));
      json(response, 200, { sales });
    } catch (error) {
      handleError(response, error, { log: "Falha ao listar vendas:", message: "Não foi possível consultar as vendas.", duplicate: "" });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/sales") {
    let connection;
    try {
      const operatorSession = requireOperatorSession(request);
      const cashSession = await getOpenCashSession(pool, 1);
      if (!cashSession) throw new SaleValidationError("Abra o caixa antes de registrar vendas.", 409);
      const payload = await readJsonBody(request);
      await ensureSaleFiscalSchema();
      let fiscalConfig = null;
      if (payload?.emitNfce === true) {
        await ensureCompanySchema();
        await ensureProductFiscalSchema();
        const [[company]] = await pool.query(
          `SELECT documentCompany, corporateNameCompany, tradeNameCompany,
                  stateRegistrationCompany, zipCodeCompany, addressCompany,
                  addressNumberCompany, neighborhoodCompany, cityCompany,
                  municipalityCodeCompany, nfceEnvironmentCompany, nfceSeriesCompany,
                  nfceModelCompany, nfceCertificateTypeCompany,
                  nfceHomologationCscCompany, nfceHomologationTokenCompany,
                  nfceCertificateDataCompany, nfceCertificatePasswordCompany
           FROM company_settings
           ORDER BY idCompanySetting ASC
           LIMIT 1`
        );
        if (!company) throw new SaleValidationError("Cadastro da empresa não encontrado.", 409);
        const [[operation]] = await pool.query(
          `SELECT operationNatureFiscalOperation, taxSituationFiscalOperation,
                  originFiscalOperation, cfopFiscalOperation
           FROM fiscal_operations
           WHERE typeFiscalOperation = 'exit' AND isActiveFiscalOperation = 1
           ORDER BY idFiscalOperation
           LIMIT 1`
        );
        fiscalConfig = {
          company: {
            ...company,
            nfceCertificateDataCompany: company.nfceCertificateDataCompany
              ? decryptSecret(company.nfceCertificateDataCompany)
              : null,
            nfceCertificatePasswordCompany: company.nfceCertificatePasswordCompany
              ? decryptSecret(company.nfceCertificatePasswordCompany)
              : null
          },
          operation: operation || null
        };
      }
      connection = await pool.getConnection();
      const result = await createSale(connection, payload, {
        operatorSession,
        cashSession,
        fiscalConfig,
        fiscalAuthorizer: fiscalConfig
          ? (saleData) => authorizeSaleNfce({
            ...saleData,
            company: fiscalConfig.company,
            operation: fiscalConfig.operation,
            certificateData: fiscalConfig.company.nfceCertificateDataCompany,
            certificatePassword: fiscalConfig.company.nfceCertificatePasswordCompany
          })
          : null
      });
      json(response, result.idempotent ? 200 : 201, result);
    } catch (error) {
      handleError(response, error, { log: "Falha ao registrar venda:", message: "Não foi possível registrar a venda.", duplicate: "" });
    } finally {
      connection?.release();
    }
    return;
  }

  const cancellationMatch = request.method === "POST"
    ? request.url.match(/^\/api\/sales\/(\d+)\/cancel$/)
    : null;
  if (cancellationMatch) {
    let connection;
    try {
      const operatorSession = requireOperatorSession(request);
      const payload = await readJsonBody(request);
      connection = await pool.getConnection();
      const result = await cancelSale(
        connection,
        Number(cancellationMatch[1]),
        payload,
        { operatorSession }
      );
      json(response, 200, result);
    } catch (error) {
      handleError(response, error, { log: "Falha ao cancelar venda:", message: "Não foi possível cancelar a venda.", duplicate: "" });
    } finally {
      connection?.release();
    }
    return;
  }

  json(response, 404, { error: "Rota não encontrada." });
});
server.listen(config.apiPort, config.apiHost, () => {
  console.log(`API PDV ouvindo em http://${config.apiHost}:${config.apiPort}`);
  void Promise.all([
    ensureFiscalCatalogSchema(),
    ensureFiscalOperationSchema(),
    ensureNcmCestSchema(),
    ensureProductFiscalSchema(),
    ensureProductCatalogSchema(),
    ensureCulinarySchema(),
    ensurePrinterSettingsSchema(),
    ensureGeneralSettingsSchema().then(loadGeneralSourceSettings),
    ensureCompanySchema(),
    ensureSaleFiscalSchema(),
    ensureSupplierSchema(),
    ensureCustomerConsumerSchema().then(migrateCustomerConsumerSchema),
    ensureRecipeSchema(),
    ensureNavigationSchema(),
    ensureOperatorCashSchema()
  ]).catch((error) => {
    console.error("Falha ao preparar o banco:", error);
  });
});
