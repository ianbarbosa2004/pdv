import { createServer } from "node:http";
import { createPool } from "./database.js";
import { getConfig } from "./config.js";
import { createSale, SaleValidationError } from "./sale-service.js";
import {
  DEFAULT_CEST_SOURCE_URL,
  DEFAULT_NCM_SOURCE_URL,
  ensureUpdateSchema,
  updateCatalog
} from "./ncm-cest-update.js";

const config = getConfig();
const pool = createPool(config);
let ncmCestUpdateRunning = false;

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
    if (size > 1024 * 1024) throw new SaleValidationError("Corpo da requisição muito grande.", 413);
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
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await renumberFiscalCatalogIds(connection);
    for (const catalog of autoCodeCatalogs) {
      const [items] = await connection.query(
        `SELECT idFiscalCatalogItem, codeFiscalCatalogItem
         FROM fiscal_catalog_items
         WHERE catalogFiscalCatalogItem = ?
         ORDER BY idFiscalCatalogItem`,
        [catalog]
      );
      if (!items.length) continue;
      const mappings = items.map((item, index) => ({
        oldCode: String(item.codeFiscalCatalogItem),
        newCode: String(index + 1),
        id: item.idFiscalCatalogItem
      }));
      for (const mapping of mappings) {
        await connection.query(
          `UPDATE fiscal_catalog_items
           SET codeFiscalCatalogItem = ?
           WHERE idFiscalCatalogItem = ?`,
          [`r${mapping.id}`, mapping.id]
        );
      }
      for (const mapping of mappings) {
        for (const column of autoCodeReferences[catalog] || []) {
          await connection.query(
            `UPDATE fiscal_operations
             SET ${column} = ?
             WHERE ${column} = ?`,
            [`__ref__${mapping.id}`, mapping.oldCode]
          );
        }
      }
      for (const mapping of mappings) {
        for (const column of autoCodeReferences[catalog] || []) {
          await connection.query(
            `UPDATE fiscal_operations
             SET ${column} = ?
             WHERE ${column} = ?`,
            [mapping.newCode, `__ref__${mapping.id}`]
          );
        }
        await connection.query(
          `UPDATE fiscal_catalog_items
           SET codeFiscalCatalogItem = ?
           WHERE idFiscalCatalogItem = ?`,
          [mapping.newCode, mapping.id]
        );
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  for (const [catalog, definition] of Object.entries(fiscalCatalogDefinitions)) {
    for (const [index, [code, description, value]] of definition.values.entries()) {
      const normalizedDescription = ["tax-situations", "origins", "ipi-situations", "contribution-situations", "exemption-reasons"].includes(catalog)
        ? stripCatalogCodeFromDescription(description)
        : description;
      if (autoCodeCatalogs.has(catalog)) {
        const [existing] = await pool.query(
          `SELECT idFiscalCatalogItem
           FROM fiscal_catalog_items
           WHERE catalogFiscalCatalogItem = ? AND descriptionFiscalCatalogItem = ?
           LIMIT 1`,
          [catalog, normalizedDescription]
        );
        if (existing[0]) {
          await pool.query(
            `UPDATE fiscal_catalog_items
             SET valueFiscalCatalogItem = ?
             WHERE idFiscalCatalogItem = ?`,
            [value ?? null, existing[0].idFiscalCatalogItem]
          );
          continue;
        }
      } else {
        await pool.query(
          `INSERT INTO fiscal_catalog_items
            (catalogFiscalCatalogItem, codeFiscalCatalogItem, descriptionFiscalCatalogItem, valueFiscalCatalogItem)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             descriptionFiscalCatalogItem = VALUES(descriptionFiscalCatalogItem),
             valueFiscalCatalogItem = VALUES(valueFiscalCatalogItem)`,
          [catalog, code, normalizedDescription, value ?? null]
        );
        continue;
      }
      const seedCode = autoCodeCatalogs.has(catalog)
        ? `seed-${catalog.slice(0, 12)}-${index}`
        : code;
      const [result] = await pool.query(
        `INSERT INTO fiscal_catalog_items
          (catalogFiscalCatalogItem, codeFiscalCatalogItem, descriptionFiscalCatalogItem, valueFiscalCatalogItem)
         VALUES (?, ?, ?, ?)`,
        [catalog, seedCode, normalizedDescription, value ?? null]
      );
      if (autoCodeCatalogs.has(catalog)) {
        const [nextCodeRows] = await pool.query(
          `SELECT COALESCE(MAX(CAST(codeFiscalCatalogItem AS UNSIGNED)), 0) AS maxCode
           FROM fiscal_catalog_items
           WHERE catalogFiscalCatalogItem = ? AND idFiscalCatalogItem <> ?`,
          [catalog, result.insertId]
        );
        await pool.query(
          `UPDATE fiscal_catalog_items
           SET codeFiscalCatalogItem = ?
           WHERE idFiscalCatalogItem = ?`,
          [String(Number(nextCodeRows[0].maxCode) + 1), result.insertId]
        );
      }
    }
  }
  await pool.query(
    `DELETE FROM fiscal_catalog_items
     WHERE catalogFiscalCatalogItem = 'operation-types'
       AND codeFiscalCatalogItem IN ('entrada', 'saida')`
  );
  const cleanupConnection = await pool.getConnection();
  try {
    await cleanupConnection.beginTransaction();
    await renumberFiscalCatalogIds(cleanupConnection);
    await cleanupConnection.commit();
  } catch (error) {
    await cleanupConnection.rollback();
    throw error;
  } finally {
    cleanupConnection.release();
  }
};

const ensurePrinterSettingsSchema = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS printer_settings (
    idPrinterSetting TINYINT UNSIGNED NOT NULL,
    receiptPrinterName VARCHAR(255) NULL,
    reportsPrinterName VARCHAR(255) NULL,
    updatedAtPrinterSetting TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idPrinterSetting)
  ) ENGINE=InnoDB`);
  await pool.query(
    `INSERT INTO printer_settings (idPrinterSetting)
     VALUES (1)
     ON DUPLICATE KEY UPDATE idPrinterSetting = idPrinterSetting`
  );
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

const ensureNavigationSchema = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS navigation_menus (
    idNavigationMenu TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
    keyNavigationMenu VARCHAR(80) NOT NULL,
    labelNavigationMenu VARCHAR(120) NOT NULL,
    orderNavigationMenu SMALLINT UNSIGNED NOT NULL,
    isActiveNavigationMenu TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (idNavigationMenu),
    UNIQUE KEY uqNavigationMenusKey (keyNavigationMenu)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS navigation_items (
    idNavigationItem BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    idNavigationMenu TINYINT UNSIGNED NOT NULL,
    idParentNavigationItem BIGINT UNSIGNED NULL,
    typeNavigationItem ENUM('item', 'submenu', 'bar') NOT NULL,
    keyNavigationItem VARCHAR(80) NOT NULL,
    labelNavigationItem VARCHAR(120) NOT NULL,
    routeNavigationItem VARCHAR(120) NULL,
    orderNavigationItem SMALLINT UNSIGNED NOT NULL,
    isActiveNavigationItem TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (idNavigationItem),
    UNIQUE KEY uqNavigationItemsMenuParentKey (idNavigationMenu, idParentNavigationItem, keyNavigationItem),
    KEY idxNavigationItemsMenuParentOrder (idNavigationMenu, idParentNavigationItem, orderNavigationItem),
    CONSTRAINT fkNavigationItemsMenu FOREIGN KEY (idNavigationMenu) REFERENCES navigation_menus (idNavigationMenu) ON DELETE CASCADE,
    CONSTRAINT fkNavigationItemsParent FOREIGN KEY (idParentNavigationItem) REFERENCES navigation_items (idNavigationItem) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await pool.query(
    `INSERT INTO navigation_menus (keyNavigationMenu, labelNavigationMenu, orderNavigationMenu)
     VALUES ('registrations', 'Cadastros', 2)
     ON DUPLICATE KEY UPDATE labelNavigationMenu = VALUES(labelNavigationMenu), orderNavigationMenu = VALUES(orderNavigationMenu)`
  );
  const [menus] = await pool.query(
    `SELECT idNavigationMenu FROM navigation_menus WHERE keyNavigationMenu = 'registrations'`
  );
  const menuId = menus[0]?.idNavigationMenu;
  if (!menuId) throw new Error("Menu Cadastros não foi criado.");
  const ensureNavigationItem = async ({ parentId = null, type, key, label, route, order }) => {
    const [existing] = await pool.query(
      `SELECT idNavigationItem
       FROM navigation_items
       WHERE idNavigationMenu = ?
         AND keyNavigationItem = ?
         AND ((idParentNavigationItem IS NULL AND ? IS NULL) OR idParentNavigationItem = ?)
       LIMIT 1`,
      [menuId, key, parentId, parentId]
    );
    if (existing[0]) {
      await pool.query(
        `UPDATE navigation_items
         SET typeNavigationItem = ?, labelNavigationItem = ?, routeNavigationItem = ?, orderNavigationItem = ?
         WHERE idNavigationItem = ?`,
        [type, label, route, order, existing[0].idNavigationItem]
      );
      return existing[0].idNavigationItem;
    }
    const [result] = await pool.query(
      `INSERT INTO navigation_items
        (idNavigationMenu, idParentNavigationItem, typeNavigationItem, keyNavigationItem, labelNavigationItem, routeNavigationItem, orderNavigationItem)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [menuId, parentId, type, key, label, route, order]
    );
    return result.insertId;
  };

  await ensureNavigationItem({ type: "item", key: "products", label: "Produtos", route: null, order: 1 });
  await ensureNavigationItem({ type: "item", key: "fiscal-operations", label: "Operações Fiscais", route: null, order: 2 });
  const productsId = await ensureNavigationItem({ type: "item", key: "products", label: "Produtos", route: null, order: 1 });
  await ensureNavigationItem({ parentId: productsId, type: "bar", key: "products", label: "Produtos", route: "products", order: 1 });
  await ensureNavigationItem({ parentId: productsId, type: "bar", key: "classes", label: "Classes", route: "classes", order: 2 });
  await ensureNavigationItem({ parentId: productsId, type: "bar", key: "groups", label: "Grupos", route: "groups", order: 3 });
  await ensureNavigationItem({ parentId: productsId, type: "bar", key: "ncm-cest", label: "NCM / CEST", route: "ncm-cest", order: 4 });
  const fiscalOperationsId = await ensureNavigationItem({
    type: "item",
    key: "fiscal-operations",
    label: "Operações Fiscais",
    route: null,
    order: 2
  });
  const fiscalBarItems = [
    ["fiscal-operations", "Operações Fiscais", "fiscal-operations"],
    ["cfops", "CFOP", "cfops"],
    ["tax-situations", "CST / CSOSN", "tax-situations"],
    ["icms-rates", "Alíquotas ICMS", "icms-rates"],
    ["tax-regimes", "Regimes", "tax-regimes"],
    ["operation-types", "Tipos", "operation-types"],
    ["contexts", "Contextos", "contexts"],
    ["origins", "Origens", "origins"],
    ["ipi-situations", "IPI", "ipi-situations"],
    ["contribution-situations", "PIS / COFINS", "contribution-situations"],
    ["base-modes", "Bases", "base-modes"],
    ["exemption-reasons", "Desoneração", "exemption-reasons"]
  ];
  for (const [key, label, route] of fiscalBarItems) {
    await ensureNavigationItem({
      parentId: fiscalOperationsId,
      type: "bar",
      key,
      label,
      route,
      order: fiscalBarItems.findIndex(([itemKey]) => itemKey === key) + 1
    });
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
      json(response, 200, { ok: true, database: "connected" });
    } catch (error) {
      console.error("Falha ao verificar o MariaDB:", error);
      json(response, 503, { ok: false, database: "unavailable" });
    }
    return;
  }

  if (request.method === "GET" && request.url === "/api/navigation") {
    try {
      await ensureNavigationSchema();
      const [menus] = await pool.query(
        `SELECT idNavigationMenu, keyNavigationMenu, labelNavigationMenu, orderNavigationMenu
         FROM navigation_menus
         WHERE isActiveNavigationMenu = 1
         ORDER BY orderNavigationMenu, idNavigationMenu`
      );
      const [items] = await pool.query(
        `SELECT idNavigationItem, idNavigationMenu, idParentNavigationItem,
                typeNavigationItem, keyNavigationItem, labelNavigationItem,
                routeNavigationItem, orderNavigationItem
         FROM navigation_items
         WHERE isActiveNavigationItem = 1
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

  if (request.method === "GET" && request.url === "/api/printer-settings") {
    try {
      await ensurePrinterSettingsSchema();
      const [rows] = await pool.query(
        `SELECT receiptPrinterName, reportsPrinterName
         FROM printer_settings
         WHERE idPrinterSetting = 1`
      );
      json(response, 200, {
        receiptPrinterName: rows[0]?.receiptPrinterName || "",
        reportsPrinterName: rows[0]?.reportsPrinterName || ""
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
          ncm: process.env.PDV_NCM_SOURCE_URL || DEFAULT_NCM_SOURCE_URL,
          cest: process.env.PDV_CEST_SOURCE_URL || DEFAULT_CEST_SOURCE_URL
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
        ncmSourceUrl: process.env.PDV_NCM_SOURCE_URL || DEFAULT_NCM_SOURCE_URL,
        cestSourceUrl: process.env.PDV_CEST_SOURCE_URL || DEFAULT_CEST_SOURCE_URL
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
      await ensurePrinterSettingsSchema();
      await pool.query(
        `UPDATE printer_settings
         SET receiptPrinterName = ?, reportsPrinterName = ?
         WHERE idPrinterSetting = 1`,
        [receiptPrinterName, reportsPrinterName]
      );
      json(response, 200, { receiptPrinterName: receiptPrinterName || "", reportsPrinterName: reportsPrinterName || "" });
    } catch (error) {
      handleError(response, error, {
        log: "Falha ao salvar configurações de impressora:",
        message: "Não foi possível salvar as configurações de impressora.",
        duplicate: ""
      });
    }
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/api/products")) {
    try {
      await ensureProductFiscalSchema();
      const includeInactive = request.url.includes("includeInactive=1");
      const [products] = await pool.query(
        `SELECT products.idProduct, products.idGroup, products.skuProduct,
                products.barcodeProduct, products.nameProduct, products.ncmProduct,
                products.cestProduct, products.priceProduct,
                products.stockQuantityProduct, products.isActiveProduct,
                groups.descriptionGroup, classes.descriptionClass
         FROM products
         INNER JOIN \`groups\` groups ON groups.idGroup = products.idGroup
         INNER JOIN classes ON classes.idClass = groups.idClass
         WHERE (? OR products.isActiveProduct = 1)
         ORDER BY products.nameProduct`,
        [includeInactive]
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

  if (request.method === "GET" && request.url.startsWith("/api/classes")) {
    try {
      const includeInactive = request.url.includes("includeInactive=1");
      const [classes] = await pool.query(
        "SELECT idClass, descriptionClass, isActiveClass FROM classes WHERE (? OR isActiveClass = 1) ORDER BY descriptionClass",
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
      if (!idClass || !descriptionClass || descriptionClass.length > 120) {
        throw new SaleValidationError("Classe ou descrição inválida.");
      }
      const [result] = await pool.query("UPDATE classes SET descriptionClass = ? WHERE idClass = ?", [descriptionClass, idClass]);
      if (!result.affectedRows) throw new SaleValidationError("Classe não encontrada.", 404);
      json(response, 200, { class: { idClass, descriptionClass } });
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
      if (!descriptionClass || descriptionClass.length > 120) throw new SaleValidationError("Descrição da classe inválida.");
      const [result] = await pool.query("INSERT INTO classes (descriptionClass) VALUES (?)", [descriptionClass]);
      json(response, 201, { class: { idClass: result.insertId, descriptionClass } });
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
                classes.descriptionClass, groups.isActiveGroup,
                classes.isActiveClass
         FROM \`groups\`
         INNER JOIN classes ON classes.idClass = groups.idClass
         WHERE (? OR groups.isActiveGroup = 1) AND (? OR classes.isActiveClass = 1)
         ORDER BY classes.descriptionClass, groups.descriptionGroup`,
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
      if (!descriptionGroup || descriptionGroup.length > 120 || !idClass) throw new SaleValidationError("Descrição do grupo e classe são obrigatórios.");
      const [classes] = await pool.query("SELECT idClass FROM classes WHERE idClass = ?", [idClass]);
      if (!classes.length) throw new SaleValidationError("Classe não encontrada.", 409);
      const [result] = await pool.query("INSERT INTO `groups` (descriptionGroup, idClass) VALUES (?, ?)", [descriptionGroup, idClass]);
      json(response, 201, { group: { idGroup: result.insertId, descriptionGroup, idClass } });
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
      if (!idGroup || !idClass || !descriptionGroup || descriptionGroup.length > 120) throw new SaleValidationError("Grupo, classe ou descrição inválida.");
      const [classes] = await pool.query("SELECT idClass FROM classes WHERE idClass = ?", [idClass]);
      if (!classes.length) throw new SaleValidationError("Classe não encontrada.", 409);
      const [result] = await pool.query("UPDATE `groups` SET descriptionGroup = ?, idClass = ? WHERE idGroup = ?", [descriptionGroup, idClass, idGroup]);
      if (!result.affectedRows) throw new SaleValidationError("Grupo não encontrado.", 404);
      json(response, 200, { group: { idGroup, descriptionGroup, idClass } });
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
      const skuProduct = typeof payload.skuProduct === "string" ? payload.skuProduct.trim() : "";
      const barcodeProduct = payload.barcodeProduct === null || payload.barcodeProduct === undefined ? null : String(payload.barcodeProduct).trim() || null;
      const ncmProduct = typeof payload.ncmProduct === "string" ? payload.ncmProduct.replace(/\D/g, "") : "";
      const cestProduct = typeof payload.cestProduct === "string" ? payload.cestProduct.replace(/\D/g, "") : "";
      const idGroup = parsePositiveId(payload.idGroup);
      if (!nameProduct || nameProduct.length > 180 || !skuProduct || skuProduct.length > 64 || !idGroup || (ncmProduct && !/^\d{8}$/.test(ncmProduct)) || (cestProduct && !/^\d{7}$/.test(cestProduct))) throw new SaleValidationError("Nome, SKU, grupo, NCM ou CEST inválidos.");
      await ensureProductFiscalSchema();
      const priceProduct = parseMoney(payload.priceProduct, "Preço");
      const stockQuantityProduct = parseNonNegativeQuantity(payload.stockQuantityProduct);
      const [groups] = await pool.query("SELECT idGroup FROM `groups` WHERE idGroup = ?", [idGroup]);
      if (!groups.length) throw new SaleValidationError("Grupo não encontrado.", 409);
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
        `INSERT INTO products (idGroup, skuProduct, barcodeProduct, nameProduct, ncmProduct, cestProduct, priceProduct, stockQuantityProduct)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [idGroup, skuProduct, barcodeProduct, nameProduct, ncmProduct || null, cestProduct || null, priceProduct, stockQuantityProduct]
      );
      json(response, 201, { product: { idProduct: result.insertId, idGroup, skuProduct, barcodeProduct, nameProduct, ncmProduct: ncmProduct || null, cestProduct: cestProduct || null, priceProduct, stockQuantityProduct } });
    } catch (error) {
      handleError(response, error, { log: "Falha ao criar produto:", message: "Não foi possível criar o produto.", duplicate: "SKU ou código de barras já cadastrado." });
    }
    return;
  }

  if (request.method === "PUT" && request.url === "/api/products") {
    try {
      const payload = await readJsonBody(request);
      const idProduct = parsePositiveId(payload.idProduct);
      const nameProduct = typeof payload.nameProduct === "string" ? payload.nameProduct.trim() : "";
      const skuProduct = typeof payload.skuProduct === "string" ? payload.skuProduct.trim() : "";
      const barcodeProduct = payload.barcodeProduct === null || payload.barcodeProduct === undefined ? null : String(payload.barcodeProduct).trim() || null;
      const ncmProduct = typeof payload.ncmProduct === "string" ? payload.ncmProduct.replace(/\D/g, "") : "";
      const cestProduct = typeof payload.cestProduct === "string" ? payload.cestProduct.replace(/\D/g, "") : "";
      const idGroup = parsePositiveId(payload.idGroup);
      if (!idProduct || !nameProduct || nameProduct.length > 180 || !skuProduct || skuProduct.length > 64 || !idGroup || (ncmProduct && !/^\d{8}$/.test(ncmProduct)) || (cestProduct && !/^\d{7}$/.test(cestProduct))) throw new SaleValidationError("Produto, nome, SKU, grupo, NCM ou CEST inválidos.");
      await ensureProductFiscalSchema();
      const priceProduct = parseMoney(payload.priceProduct, "Preço");
      const stockQuantityProduct = parseNonNegativeQuantity(payload.stockQuantityProduct);
      const [groups] = await pool.query("SELECT idGroup FROM `groups` WHERE idGroup = ?", [idGroup]);
      if (!groups.length) throw new SaleValidationError("Grupo não encontrado.", 409);
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
        `UPDATE products SET idGroup = ?, skuProduct = ?, barcodeProduct = ?, nameProduct = ?, ncmProduct = ?, cestProduct = ?, priceProduct = ?, stockQuantityProduct = ?
         WHERE idProduct = ?`,
        [idGroup, skuProduct, barcodeProduct, nameProduct, ncmProduct || null, cestProduct || null, priceProduct, stockQuantityProduct, idProduct]
      );
      if (!result.affectedRows) throw new SaleValidationError("Produto não encontrado.", 404);
      json(response, 200, { product: { idProduct, idGroup, skuProduct, barcodeProduct, nameProduct, ncmProduct: ncmProduct || null, cestProduct: cestProduct || null, priceProduct, stockQuantityProduct } });
    } catch (error) {
      handleError(response, error, { log: "Falha ao editar produto:", message: "Não foi possível editar o produto.", duplicate: "SKU ou código de barras já cadastrado." });
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

  if (request.method === "GET" && request.url === "/api/payment-methods") {
    try {
      const [paymentMethods] = await pool.query("SELECT idPaymentMethod, namePaymentMethod FROM payment_methods WHERE isActivePaymentMethod = 1 ORDER BY idPaymentMethod");
      json(response, 200, { paymentMethods });
    } catch (error) {
      handleError(response, error, { log: "Falha ao listar formas de pagamento:", message: "Não foi possível consultar as formas de pagamento.", duplicate: "" });
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
  void ensurePrinterSettingsSchema().catch((error) => {
    console.error("Falha ao preparar as configurações de impressora:", error);
  });
  void ensureNavigationSchema().catch((error) => {
    console.error("Falha ao preparar a estrutura de navegação:", error);
  });
});
