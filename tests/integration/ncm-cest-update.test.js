import test from "node:test";
import assert from "node:assert/strict";
import {
  createSchemaManager
} from "../../src/server/schema-manager.js";
import {
  normalizeCatalogPage,
  parseCatalogPagination
} from "../../src/server/catalog-pagination.js";
import {
  parseCestPayload,
  parseNcmPayload,
  validateOfficialSourceUrl
} from "../../src/server/ncm-cest-update.js";

test("aceita somente URLs HTTPS das fontes oficiais NCM e CEST", () => {
  assert.equal(
    validateOfficialSourceUrl(
      "https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json",
      "NCM"
    ),
    "https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json"
  );
  assert.throws(
    () => validateOfficialSourceUrl("http://127.0.0.1:8080/internal", "NCM"),
    /fonte oficial HTTPS/
  );
  assert.throws(
    () => validateOfficialSourceUrl("https://example.com/catalog.json", "CEST"),
    /fonte oficial HTTPS/
  );
});

test("interpreta somente códigos NCM de oito dígitos da fonte oficial", () => {
  const result = parseNcmPayload({
    Nomenclaturas: [
      { Codigo: "01", Descricao: "Grupo" },
      { Codigo: "0101.21.00", Descricao: "Cavalos" },
      { Codigo: "0101.29.00", Descricao: "Outros" }
    ]
  });
  assert.deepEqual(result, [
    { codeNcm: "01012100", descriptionNcm: "Cavalos" },
    { codeNcm: "01012900", descriptionNcm: "Outros" }
  ]);
});

test("interpreta CEST, segmento e relação NCM em CSV", () => {
  const result = parseCestPayload(
    "Segmento;Item;CEST;NCM/SH;Descrição\n" +
      "Animais;1.0;01.001.00;0101.21.00;Mercadoria de teste\n"
  );
  assert.deepEqual(result.items, [
    { codeCest: "0100100", descriptionCest: "Mercadoria de Teste", segmentCest: "Animais" }
  ]);
  assert.deepEqual(result.relations, [{ codeNcm: "01012100", codeCest: "0100100" }]);
});

test("preparação NCM/CEST usa uma única definição de schema", async () => {
  const statements = [];
  const pool = {
    async query(statement) {
      statements.push(String(statement));
      return [[]];
    }
  };
  const schema = createSchemaManager({
    pool,
    config: { database: { name: "pdv" } }
  });

  test("normaliza paginação dos catálogos fiscais", () => {
    const params = new URLSearchParams("page=3&pageSize=50&search=animais");
    assert.deepEqual(parseCatalogPagination(params), {
      page: 3,
      pageSize: 50,
      search: "animais",
      hasPagination: true
    });
    assert.deepEqual(normalizeCatalogPage(9, 101, 50), {
      page: 3,
      pageCount: 3
    });
    assert.equal(parseCatalogPagination(new URLSearchParams("page=0&pageSize=999")).page, 1);
  });

  await schema.ensureNcmCestSchema();

  assert.equal(
    statements.filter((statement) => statement.includes("CREATE TABLE IF NOT EXISTS ncm_catalog")).length,
    1
  );
  assert.equal(
    statements.filter((statement) => statement.includes("CREATE TABLE IF NOT EXISTS ncm_cest_relations")).length,
    1
  );
  assert.equal(
    statements.filter((statement) => statement.includes("CREATE TABLE IF NOT EXISTS ncm_cest_updates")).length,
    1
  );
});

test("preparação do catálogo não converte mercadoria para revenda em produto acabado", async () => {
  const statements = [];
  const pool = {
    async query(statement) {
      statements.push(String(statement));
      return [[]];
    }
  };
  const schema = createSchemaManager({
    pool,
    config: { database: { name: "pdv" } }
  });

  await schema.ensureProductCatalogSchema();

  assert.equal(
    statements.some((statement) =>
      statement.includes("UPDATE products") && statement.includes("SET idProductTypeProduct")
    ),
    false
  );
});

test("migração de movimentos remove índice único antes de recriar a FK", async () => {
  const statements = [];
  const pool = {
    async query(statement) {
      const normalized = String(statement);
      statements.push(normalized);
      if (normalized.includes("TABLE_CONSTRAINTS") && normalized.includes("cash_movements")) {
        return [[{ CONSTRAINT_NAME: "fkCashMovementsSale" }]];
      }
      if (normalized.includes("STATISTICS") && normalized.includes("uqCashMovementsSale")) {
        return [[{ INDEX_NAME: "uqCashMovementsSale" }]];
      }
      return [[]];
    }
  };
  const schema = createSchemaManager({
    pool,
    config: { database: { name: "pdv" } }
  });

  await schema.ensureOperatorCashSchema();

  const dropForeignKeyIndex = statements.findIndex(
    (statement) => statement === "ALTER TABLE cash_movements DROP FOREIGN KEY fkCashMovementsSale"
  );
  const dropUniqueIndex = statements.findIndex(
    (statement) => statement === "ALTER TABLE cash_movements DROP INDEX uqCashMovementsSale"
  );
  const addSaleIndex = statements.findIndex(
    (statement) => statement === "ALTER TABLE cash_movements ADD KEY idxCashMovementsSale (idSale)"
  );
  const restoreForeignKey = statements.findIndex(
    (statement) => statement.includes("ALTER TABLE cash_movements ADD CONSTRAINT fkCashMovementsSale")
  );

  assert.ok(dropForeignKeyIndex >= 0);
  assert.ok(dropUniqueIndex > dropForeignKeyIndex);
  assert.ok(addSaleIndex > dropUniqueIndex);
  assert.ok(restoreForeignKey > addSaleIndex);
});
