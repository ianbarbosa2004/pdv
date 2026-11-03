import test from "node:test";
import assert from "node:assert/strict";
import {
  cancelSale,
  calculateVoucherAmountCents,
  createSale,
  listRecentSales,
  SaleValidationError
} from "../../src/server/sale-service.js";

const createSaleConnection = ({ controlsStockProduct = 1, stockQuantityProduct = "5.000" } = {}) => {
  const statements = [];
  let committed = false;
  return {
    statements,
    get committed() {
      return committed;
    },
    async beginTransaction() {
      statements.push("BEGIN");
    },
    async commit() {
      committed = true;
      statements.push("COMMIT");
    },
    async rollback() {
      statements.push("ROLLBACK");
    },
    async query(sql) {
      statements.push(sql);
      if (sql.includes("FROM sales WHERE clientIdSale")) return [[]];
      if (sql.includes("FROM products")) {
        return [[{
          idProduct: 1,
          nameProduct: "Produto de teste",
          priceProduct: "10.00",
          stockQuantityProduct,
          controlsStockProduct,
          isFractionalProduct: 0,
          skuProduct: "TESTE-001",
          ncmProduct: "12345678"
        }]];
      }
      if (sql.includes("FROM general_settings")) return [[{ booleanValueGeneralSetting: 0 }]];
      if (sql.includes("FROM payment_methods")) {
        return [[{
          idPaymentMethod: 1,
          namePaymentMethod: "PIX",
          cashFlowAccountPaymentMethod: "Caixa"
        }]];
      }
      if (sql.includes("INSERT INTO sales")) return [{ insertId: 21 }];
      if (sql.includes("SELECT ROW_COUNT()")) return [[{ affectedRows: 1 }]];
      if (sql.includes("UPDATE cash_sessions")) return [{ affectedRows: 1 }];
      if (sql.includes("FROM company_settings")) {
        return [[{
          nfceModelCompany: 65,
          nfceEnvironmentCompany: "homologation",
          nfceSeriesCompany: 1,
          nfceNextNumberCompany: 42,
          nfceContingencyCompany: 0
        }]];
      }
      if (sql.includes("INSERT INTO sale_fiscal_documents")) return [{ insertId: 31 }];
      if (sql.includes("UPDATE sale_fiscal_documents")) return [{ affectedRows: 1 }];
      if (sql.includes("UPDATE company_settings")) return [{ affectedRows: 1 }];
      return [{ affectedRows: 1 }];
    }
  };
};

const salePayload = (emitNfce = false) => ({
  clientIdSale: emitNfce
    ? "00000000-0000-4000-8000-000000000001"
    : "00000000-0000-4000-8000-000000000002",
  items: [{ idProduct: 1, quantitySaleItem: 1 }],
  payments: [{ idPaymentMethod: 1, amountSalePayment: "10.00" }],
  emitNfce
});

const saleContext = (fiscalAuthorizer) => ({
  operatorSession: { idOperator: 3 },
  cashSession: { idCashSession: 7 },
  fiscalConfig: { environment: "homologation" },
  fiscalAuthorizer
});

test("confirma venda sem NFC-e sem reservar documento fiscal", async () => {
  const connection = createSaleConnection();
  const result = await createSale(connection, salePayload(), saleContext());

  assert.equal(result.sale.statusSale, "completed");
  assert.equal(result.sale.fiscalStatus, "not_requested");
  assert.equal(result.sale.fiscalDocument, null);
  assert.equal(connection.statements.some((sql) => sql.includes("sale_fiscal_documents")), false);
});

test("não baixa estoque quando o produto não controla estoque", async () => {
  const connection = createSaleConnection({
    controlsStockProduct: 0,
    stockQuantityProduct: "0.000"
  });
  const result = await createSale(connection, salePayload(), saleContext());

  assert.equal(result.sale.statusSale, "completed");
  assert.equal(
    connection.statements.some((sql) => sql.includes("stockQuantityProduct = stockQuantityProduct - ?")),
    false
  );
  assert.equal(connection.statements.includes("COMMIT"), true);
});

test("lista metadados e XML da NFC-e em vendas recentes", async () => {
  let statement = "";
  const connection = {
    async query(sql) {
      statement = sql;
      return [[{
        idSale: 21,
        fiscalStatus: "authorized",
        fiscalNumber: 42,
        fiscalSeries: 1,
        fiscalAccessKey: "CHAVE-TESTE",
        fiscalProtocol: "PROTOCOLO-TESTE",
        fiscalCStat: "100",
        fiscalMessage: "Autorizado",
        fiscalXml: "<NFe>teste</NFe>"
      }]];
    }
  };

  const [sale] = await listRecentSales(connection, 20);

  assert.match(statement, /xmlSaleFiscalDocument AS fiscalXml/);
  assert.equal(sale.fiscalStatus, "authorized");
  assert.equal(sale.fiscalXml, "<NFe>teste</NFe>");
});

test("autoriza NFC-e somente depois do commit e persiste o resultado", async () => {
  const connection = createSaleConnection();
  let authorizerCalledAfterCommit = false;
  let fiscalPayments;
  const result = await createSale(
    connection,
    salePayload(true),
    saleContext(async ({ fiscalDocument, payments }) => {
      authorizerCalledAfterCommit = connection.committed;
      fiscalPayments = payments;
      return {
        status: "authorized",
        accessKey: "CHAVE-TESTE",
        protocol: "PROTOCOLO-TESTE",
        cStat: "100",
        message: "Autorizado",
        xml: "<NFe>teste</NFe>",
        number: fiscalDocument.number
      };
    })
  );

  assert.equal(authorizerCalledAfterCommit, true);
  assert.deepEqual(fiscalPayments, [{
    idPaymentMethod: 1,
    amountSalePayment: 1000,
    namePaymentMethod: "PIX"
  }]);
  assert.equal(result.sale.fiscalStatus, "authorized");
  assert.equal(result.sale.fiscalDocument.accessKey, "CHAVE-TESTE");
  assert.equal(result.sale.fiscalDocument.protocol, "PROTOCOLO-TESTE");
  assert.ok(connection.statements.indexOf("COMMIT") < connection.statements.findIndex((sql) => sql.includes("UPDATE sale_fiscal_documents")));
});

test("classifica falha do autorizador como resultado fiscal desconhecido", async () => {
  const connection = createSaleConnection();
  const result = await createSale(
    connection,
    { ...salePayload(true), clientIdSale: "00000000-0000-4000-8000-000000000003" },
    saleContext(async () => {
      throw new Error("SEF/MG indisponível");
    })
  );

  assert.equal(result.sale.statusSale, "completed");
  assert.equal(result.sale.fiscalStatus, "unknown");
  assert.equal(result.sale.fiscalDocument.message, "SEF/MG indisponível");
  assert.equal(connection.statements.at(-1).includes("UPDATE sale_fiscal_documents"), true);
});

test("preserva rejeição da SEF/MG como estado fiscal da venda", async () => {
  const connection = createSaleConnection();
  const result = await createSale(
    connection,
    {
      ...salePayload(true),
      clientIdSale: "00000000-0000-4000-8000-000000000004"
    },
    saleContext(async () => ({
      status: "rejected",
      cStat: "999",
      message: "Rejeição de teste"
    }))
  );

  assert.equal(result.sale.statusSale, "completed");
  assert.equal(result.sale.fiscalStatus, "rejected");
  assert.equal(result.sale.fiscalDocument.cStat, "999");
  assert.equal(result.sale.fiscalDocument.message, "Rejeição de teste");
});

test("calcula somente o valor pago em Vale em pagamentos mistos", () => {
  assert.equal(
    calculateVoucherAmountCents(
      [
        { idPaymentMethod: 1, amountSalePayment: 3000 },
        { idPaymentMethod: 2, amountSalePayment: 7000 }
      ],
      [
        { idPaymentMethod: 1, namePaymentMethod: "VALE" },
        { idPaymentMethod: 2, namePaymentMethod: "PIX" }
      ]
    ),
    3000
  );
});

test("rejeita venda sem itens antes de acessar o banco", async () => {
  await assert.rejects(
    () => createSale(null, { items: [], payments: [] }),
    (error) => {
      assert.ok(error instanceof SaleValidationError);
      assert.equal(error.status, 400);
      assert.equal(error.message, "A venda deve conter ao menos um item.");
      return true;
    }
  );
});

test("rejeita quantidade com mais de três casas decimais", async () => {
  await assert.rejects(
    () =>
      createSale(null, {
        items: [{ idProduct: 1, quantitySaleItem: 0.1234 }],
        payments: [{ idPaymentMethod: 1, amountSalePayment: "5.50" }]
      }),
    (error) => {
      assert.ok(error instanceof SaleValidationError);
      assert.equal(error.message, "A quantidade deve ser um número positivo com até três casas decimais.");
      return true;
    }
  );
});

test("exige supervisor ou administrador para cancelar uma venda", async () => {
  await assert.rejects(
    () => cancelSale(null, 10, { reason: "Erro de lançamento" }, {
      operatorSession: { idOperator: 3, roleOperator: "operator" }
    }),
    (error) => {
      assert.ok(error instanceof SaleValidationError);
      assert.equal(error.status, 403);
      assert.equal(error.message, "Somente supervisor ou administrador pode cancelar vendas.");
      return true;
    }
  );
});

test("exige motivo de cancelamento com pelo menos cinco caracteres", async () => {
  await assert.rejects(
    () => cancelSale(null, 10, { reason: "não" }, {
      operatorSession: { idOperator: 3, roleOperator: "supervisor" }
    }),
    (error) => {
      assert.ok(error instanceof SaleValidationError);
      assert.equal(error.status, 400);
      assert.equal(error.message, "Informe um motivo de cancelamento com pelo menos 5 caracteres.");
      return true;
    }
  );
});

test("cancela venda concluída e reverte estoque e caixa na mesma transação", async () => {
  const statements = [];
  const connection = {
    async beginTransaction() {
      statements.push("BEGIN");
    },
    async commit() {
      statements.push("COMMIT");
    },
    async rollback() {
      statements.push("ROLLBACK");
    },
    async query(sql) {
      statements.push(sql);
      if (sql.includes("FROM sales")) {
        return [[{
          idSale: 10,
          idCashSessionSale: 7,
          statusSale: "completed",
          totalSale: "15.00"
        }]];
      }
      if (sql.includes("FROM sale_items")) {
        return [[{
          idProduct: 2,
          quantitySaleItem: "3.000",
          controlsStockProduct: 1
        }]];
      }
      if (sql.includes("FROM sale_payments")) {
        return [[{
          amountSalePayment: "15.00",
          cashFlowAccountPaymentMethod: "Caixa"
        }]];
      }
      if (sql.includes("FROM customer_vouchers")) return [[]];
      return [{ affectedRows: 1 }];
    }
  };

  const result = await cancelSale(connection, 10, { reason: "Erro de lançamento" }, {
    operatorSession: { idOperator: 3, roleOperator: "supervisor" }
  });

  assert.deepEqual(result, {
    idSale: 10,
    statusSale: "cancelled",
    reason: "Erro de lançamento",
    idempotent: false
  });
  assert.equal(statements[0], "BEGIN");
  assert.equal(statements.at(-1), "COMMIT");
  assert.ok(statements.some((sql) => sql.includes("stockQuantityProduct = stockQuantityProduct + ?")));
  assert.ok(statements.some((sql) => sql.includes("sale_cancellation")));
});

test("faz rollback quando a reversão do estoque falha", async () => {
  let rolledBack = false;
  const connection = {
    async beginTransaction() {},
    async commit() {
      throw new Error("não deveria confirmar");
    },
    async rollback() {
      rolledBack = true;
    },
    async query(sql) {
      if (sql.includes("FROM sales")) {
        return [[{
          idSale: 10,
          idCashSessionSale: 7,
          statusSale: "completed",
          totalSale: "15.00"
        }]];
      }
      if (sql.includes("FROM sale_items")) {
        return [[{ idProduct: 2, quantitySaleItem: "3.000", controlsStockProduct: 1 }]];
      }
      if (sql.includes("FROM sale_payments")) {
        return [[{ amountSalePayment: "15.00", cashFlowAccountPaymentMethod: "Caixa" }]];
      }
      if (sql.includes("FROM customer_vouchers")) return [[]];
      if (sql.includes("UPDATE products")) return [{ affectedRows: 0 }];
      return [{ affectedRows: 1 }];
    }
  };

  await assert.rejects(
    () => cancelSale(connection, 10, { reason: "Erro de lançamento" }, {
      operatorSession: { idOperator: 3, roleOperator: "supervisor" }
    }),
    (error) => {
      assert.equal(error.status, 409);
      assert.equal(error.message, "Não foi possível reverter o estoque da venda.");
      return true;
    }
  );
  assert.equal(rolledBack, true);
});

test("limita a consulta de vendas recentes a cem registros", async () => {
  let query = "";
  const sales = await listRecentSales({
    async query(sql) {
      query = sql;
      return [[{ idSale: 10, statusSale: "completed" }]];
    }
  }, 500);

  assert.deepEqual(sales, [{ idSale: 10, statusSale: "completed" }]);
  assert.match(query, /LIMIT 100$/);
});
