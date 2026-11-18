import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseMarginPercentage,
  requireMarginAuthorization,
  updateMarginProductPrice
} from "../../src/server/margin-service.js";
import { SaleValidationError } from "../../src/server/sale-service.js";

const createPriceConnection = ({
  product = { idProduct: 7, costPriceProduct: "60.00", priceProduct: "100.00" }
} = {}) => {
  const statements = [];
  let released = false;
  let committed = false;
  let rolledBack = false;
  const connection = {
    statements,
    get released() { return released; },
    get committed() { return committed; },
    get rolledBack() { return rolledBack; },
    async beginTransaction() {
      statements.push("BEGIN");
    },
    async query(sql, params = []) {
      statements.push(sql);
      if (sql.includes("FOR UPDATE")) return [[product]];
      return [{ affectedRows: 1 }];
    },
    async commit() {
      committed = true;
      statements.push("COMMIT");
    },
    async rollback() {
      rolledBack = true;
      statements.push("ROLLBACK");
    },
    release() {
      released = true;
    }
  };
  return connection;
};

test("exige supervisor ou admin para atualizar preço pelo CMV", () => {
  assert.throws(
    () => requireMarginAuthorization({ roleOperator: "cashier" }, "atualizar o preço"),
    (error) => error instanceof SaleValidationError && error.status === 403
  );
  assert.doesNotThrow(
    () => requireMarginAuthorization({ roleOperator: "supervisor" }, "atualizar o preço")
  );
  assert.doesNotThrow(
    () => requireMarginAuthorization({ roleOperator: "admin" }, "atualizar o preço")
  );
});

test("valida CMV como percentual entre 0% e menos de 100%", () => {
  assert.equal(parseMarginPercentage("60.5", "Novo CMV"), 60.5);
  assert.throws(
    () => parseMarginPercentage("100", "Novo CMV"),
    /menos de 100%/
  );
});

test("atualiza preço e audita o CMV em uma única transação", async () => {
  const connection = createPriceConnection();
  const pool = {
    async getConnection() {
      return connection;
    }
  };

  const result = await updateMarginProductPrice({
    pool,
    payload: {
      idProduct: 7,
      expectedPrice: 100,
      newCmvPercentage: 60
    },
    operatorSession: { idOperator: 3, roleOperator: "supervisor" }
  });

  assert.deepEqual(result, { idProduct: 7, priceProduct: 100, cmv: 60 });
  assert.equal(connection.committed, true);
  assert.equal(connection.rolledBack, false);
  assert.equal(connection.released, true);
  assert.equal(connection.statements.includes("BEGIN"), true);
  assert.equal(connection.statements.includes("COMMIT"), true);
  assert.equal(connection.statements.some((sql) => sql.includes("FOR UPDATE")), true);
  assert.equal(connection.statements.some((sql) => sql.includes("UPDATE products SET priceProduct")), true);
  assert.equal(connection.statements.some((sql) => sql.includes("INSERT INTO margin_price_audits")), true);
});

test("rejeita preço concorrente, faz rollback e não altera nem audita o produto", async () => {
  const connection = createPriceConnection();
  const pool = {
    async getConnection() {
      return connection;
    }
  };

  await assert.rejects(
    updateMarginProductPrice({
      pool,
      payload: {
        idProduct: 7,
        expectedPrice: 90,
        newCmvPercentage: 60
      },
      operatorSession: { idOperator: 3, roleOperator: "admin" }
    }),
    (error) => error instanceof SaleValidationError && error.status === 409
  );

  assert.equal(connection.rolledBack, true);
  assert.equal(connection.committed, false);
  assert.equal(connection.released, true);
  assert.equal(connection.statements.some((sql) => sql.includes("UPDATE products SET priceProduct")), false);
  assert.equal(connection.statements.some((sql) => sql.includes("INSERT INTO margin_price_audits")), false);
});

test("balizadores somente por grupo não executam atualização de preço", async () => {
  const source = await readFile("src/server/server.js", "utf8");
  const groupStart = source.indexOf('if (request.method === "PUT" && request.url === "/api/margin/group")');
  const groupRoute = groupStart >= 0
    ? source.slice(groupStart, source.indexOf('if (request.method === "PUT" && request.url === "/api/margin/product-price")'))
    : "";

  assert.ok(groupRoute);
  assert.doesNotMatch(groupRoute, /UPDATE products|priceProduct|margin_price_audits/u);
  assert.doesNotMatch(source, /\/api\/margin\/general/u);
  assert.doesNotMatch(source, /\/api\/margin\/product[")]/u);
});

test("migração da Margem cria somente balizadores por grupo", async () => {
  const source = await readFile("src/server/schema-manager.js", "utf8");
  assert.match(source, /CREATE TABLE IF NOT EXISTS margin_group_overrides/u);
  assert.match(source, /CREATE TABLE IF NOT EXISTS margin_product_metrics/u);
  assert.match(source, /CREATE TABLE IF NOT EXISTS margin_price_audits/u);
  assert.match(source, /ensureMarginSchema/u);
});

test("persistência da Margem cria carga inicial e snapshots por custo, preço e balizadores", async () => {
  const schemaSource = await readFile("src/server/schema-manager.js", "utf8");
  assert.match(schemaSource, /INSERT INTO margin_product_metrics/u);
  assert.match(schemaSource, /snapshotSource[\s\S]*?'initial_load'/u);
  assert.match(schemaSource, /trgMarginProductCostOrPrice/u);
  assert.match(schemaSource, /cost_and_price_update/u);
  assert.match(schemaSource, /trgMarginGroupBalancerUpdate/u);
  assert.match(schemaSource, /group_balancer_update/u);
});

test("View e API de histórico usam os snapshots persistidos", async () => {
  const serverSource = await readFile("src/server/server.js", "utf8");
  assert.match(serverSource, /LEFT JOIN margin_product_metrics/u);
  assert.match(serverSource, /ORDER BY metrics\.createdAtMarginProductMetric DESC/u);
  assert.match(serverSource, /marginStateSnapshot/u);
  assert.match(serverSource, /request\.url\.startsWith\("\/api\/margin\/history"\)/u);
  assert.match(serverSource, /FROM margin_product_metrics/u);
  assert.match(serverSource, /ORDER BY createdAtMarginProductMetric DESC/u);
});

test("snapshots de Margem preservam #PDV e cadastro mostra métricas persistidas", async () => {
  const [schemaSource, serverSource, catalogSource, productViewSource, marginViewSource] = await Promise.all([
    readFile("src/server/schema-manager.js", "utf8"),
    readFile("src/server/server.js", "utf8"),
    readFile("src/catalog/catalog-screen.js", "utf8"),
    readFile("src/tools/views-screen.js", "utf8"),
    readFile("src/tools/margin-screen.js", "utf8")
  ]);
  assert.match(schemaSource, /pdvCodeSnapshot VARCHAR\(64\) NULL/u);
  assert.match(schemaSource, /p\.pdvCodeProduct/u);
  assert.match(serverSource, /pdvCodeSnapshot/u);
  assert.match(catalogSource, /\/api\/margin\/products/u);
  assert.match(catalogSource, /Margem de lucro \(somente leitura\)/u);
  assert.match(catalogSource, /Margem mínima efetiva/u);
  assert.match(catalogSource, /Margem alvo efetiva/u);
  assert.doesNotMatch(productViewSource, /Margem de lucro \(somente leitura\)|Margem bruta|Margem mínima efetiva/u);
  assert.match(marginViewSource, /data-open-margin-history/u);
  assert.match(marginViewSource, /title="Simular"/u);
  assert.match(marginViewSource, /data-lucide="dollar-sign"/u);
  assert.match(marginViewSource, /api\/margin\/history\?idProduct=/u);
  assert.doesNotMatch(marginViewSource, /data-margin-general-minimum|data-margin-group-minimum|data-margin-product-minimum/u);
  assert.doesNotMatch(marginViewSource, /\/api\/margin\/(general|group|product)["']/u);
  assert.doesNotMatch(catalogSource, /Override de margem do produto|name="minimumMarginPercentage"|name="targetMarginPercentage"/u);
  assert.match(catalogSource, /data-preview-only hidden/u);
  assert.match(catalogSource, /isMarginPreviewProductType/u);
  assert.match(catalogSource, /formatMarginEffective/u);
  assert.match(catalogSource, /onPreviewRecord/u);
  assert.match(catalogSource, /product-cost-sale-row/u);
  assert.match(catalogSource, /product-cost-policy-stock-row/u);
});
