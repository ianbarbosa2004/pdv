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
});
