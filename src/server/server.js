import { createServer } from "node:http";
import { createPool } from "./database.js";
import { getConfig } from "./config.js";
import { createSale, SaleValidationError } from "./sale-service.js";

const config = getConfig();
const pool = createPool(config);

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
  cfops: { label: "CFOP", values: [["5.102", "Venda de mercadoria adquirida ou recebida de terceiros"]] },
  "icms-rates": { label: "Alíquotas de ICMS", values: [["7", "Alíquota interna de 7%", 7], ["12", "Alíquota interna de 12%", 12], ["17", "Alíquota interna de 17%", 17], ["18", "Alíquota interna de 18%", 18], ["25", "Alíquota interna de 25%", 25]] }
};

const fiscalCatalogNames = new Set(Object.keys(fiscalCatalogDefinitions));

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
  for (const [catalog, definition] of Object.entries(fiscalCatalogDefinitions)) {
    for (const [code, description, value] of definition.values) {
      await pool.query(
        `INSERT IGNORE INTO fiscal_catalog_items
          (catalogFiscalCatalogItem, codeFiscalCatalogItem, descriptionFiscalCatalogItem, valueFiscalCatalogItem)
         VALUES (?, ?, ?, ?)`,
        [catalog, code, description, value ?? null]
      );
    }
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

  if (request.method === "GET" && request.url.startsWith("/api/products")) {
    try {
      const includeInactive = request.url.includes("includeInactive=1");
      const [products] = await pool.query(
        `SELECT products.idProduct, products.idGroup, products.skuProduct,
                products.barcodeProduct, products.nameProduct, products.priceProduct,
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
      const idGroup = parsePositiveId(payload.idGroup);
      if (!nameProduct || nameProduct.length > 180 || !skuProduct || skuProduct.length > 64 || !idGroup) throw new SaleValidationError("Nome, SKU e grupo são obrigatórios.");
      const priceProduct = parseMoney(payload.priceProduct, "Preço");
      const stockQuantityProduct = parseNonNegativeQuantity(payload.stockQuantityProduct);
      const [groups] = await pool.query("SELECT idGroup FROM `groups` WHERE idGroup = ?", [idGroup]);
      if (!groups.length) throw new SaleValidationError("Grupo não encontrado.", 409);
      const [result] = await pool.query(
        `INSERT INTO products (idGroup, skuProduct, barcodeProduct, nameProduct, priceProduct, stockQuantityProduct)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [idGroup, skuProduct, barcodeProduct, nameProduct, priceProduct, stockQuantityProduct]
      );
      json(response, 201, { product: { idProduct: result.insertId, idGroup, skuProduct, barcodeProduct, nameProduct, priceProduct, stockQuantityProduct } });
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
      const idGroup = parsePositiveId(payload.idGroup);
      if (!idProduct || !nameProduct || nameProduct.length > 180 || !skuProduct || skuProduct.length > 64 || !idGroup) throw new SaleValidationError("Produto, nome, SKU e grupo são obrigatórios.");
      const priceProduct = parseMoney(payload.priceProduct, "Preço");
      const stockQuantityProduct = parseNonNegativeQuantity(payload.stockQuantityProduct);
      const [groups] = await pool.query("SELECT idGroup FROM `groups` WHERE idGroup = ?", [idGroup]);
      if (!groups.length) throw new SaleValidationError("Grupo não encontrado.", 409);
      const [result] = await pool.query(
        `UPDATE products SET idGroup = ?, skuProduct = ?, barcodeProduct = ?, nameProduct = ?, priceProduct = ?, stockQuantityProduct = ?
         WHERE idProduct = ?`,
        [idGroup, skuProduct, barcodeProduct, nameProduct, priceProduct, stockQuantityProduct, idProduct]
      );
      if (!result.affectedRows) throw new SaleValidationError("Produto não encontrado.", 404);
      json(response, 200, { product: { idProduct, idGroup, skuProduct, barcodeProduct, nameProduct, priceProduct, stockQuantityProduct } });
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
      const codeFiscalCatalogItem = typeof payload.codeFiscalCatalogItem === "string" ? payload.codeFiscalCatalogItem.trim() : "";
      const descriptionFiscalCatalogItem = typeof payload.descriptionFiscalCatalogItem === "string" ? payload.descriptionFiscalCatalogItem.trim() : "";
      const valueFiscalCatalogItem = payload.valueFiscalCatalogItem === "" || payload.valueFiscalCatalogItem == null
        ? null
        : Number(payload.valueFiscalCatalogItem);
      if (
        !fiscalCatalogNames.has(catalog) ||
        (request.method === "PUT" && !idFiscalCatalogItem) ||
        !codeFiscalCatalogItem ||
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
                fcpStEnabledFiscalOperation, fiscalBenefitCodeFiscalOperation,
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
        payload.taxSituationFiscalOperation || null, payload.originFiscalOperation || null, payload.cfopFiscalOperation || null,
        payload.operationNatureFiscalOperation || null, payload.ipiSituationFiscalOperation || null,
        payload.icmsBaseModeFiscalOperation || null, payload.icmsStBaseModeFiscalOperation || null,
        payload.icmsExemptionReasonFiscalOperation || null, payload.cofinsSituationFiscalOperation || null,
        payload.pisSituationFiscalOperation || null, payload.fcpEnabledFiscalOperation ? 1 : 0,
        payload.fcpStEnabledFiscalOperation ? 1 : 0, payload.fiscalBenefitCodeFiscalOperation || null,
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
             fcpEnabledFiscalOperation, fcpStEnabledFiscalOperation,
             fiscalBenefitCodeFiscalOperation, legalBasisFiscalOperation)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
             fcpEnabledFiscalOperation = ?, fcpStEnabledFiscalOperation = ?,
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
});
