import test from "node:test";
import assert from "node:assert/strict";
import { createSale, SaleValidationError } from "../src/server/sale-service.js";

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

test("rejeita quantidade fracionada na primeira versão do checkout", async () => {
  await assert.rejects(
    () =>
      createSale(null, {
        items: [{ idProduct: 1, quantitySaleItem: 0.5 }],
        payments: [{ idPaymentMethod: 1, amountSalePayment: "5.50" }]
      }),
    (error) => {
      assert.ok(error instanceof SaleValidationError);
      assert.equal(error.message, "A quantidade deve ser um número inteiro positivo.");
      return true;
    }
  );
});
