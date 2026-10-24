import { randomUUID } from "node:crypto";

export class SaleValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "SaleValidationError";
    this.status = status;
  }
}

const isUuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const toCents = (value, fieldName) => {
  if ((typeof value !== "number" && typeof value !== "string") ||
      !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(String(value))) {
    throw new SaleValidationError(`${fieldName} inválido.`);
  }
  const [whole, fraction = ""] = String(value).split(".");
  return Number.parseInt(whole, 10) * 100 + Number.parseInt(fraction.padEnd(2, "0"), 10);
};

const normalizePayload = (payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new SaleValidationError("O corpo da venda deve ser um objeto.");
  }
  const clientIdSale = payload.clientIdSale || randomUUID();
  if (!isUuid(clientIdSale)) throw new SaleValidationError("clientIdSale deve ser um UUID válido.");
  if (!Array.isArray(payload.items) || payload.items.length === 0) throw new SaleValidationError("A venda deve conter ao menos um item.");
  if (!Array.isArray(payload.payments) || payload.payments.length === 0) throw new SaleValidationError("A venda deve conter ao menos um pagamento.");

  const itemMap = new Map();
  for (const item of payload.items) {
    const idProduct = Number(item?.idProduct);
    const quantitySaleItem = Number(item?.quantitySaleItem);
    if (!Number.isSafeInteger(idProduct) || idProduct <= 0) throw new SaleValidationError("Produto inválido.");
    if (!Number.isSafeInteger(quantitySaleItem) || quantitySaleItem <= 0) {
      throw new SaleValidationError("A quantidade deve ser um número inteiro positivo.");
    }
    itemMap.set(idProduct, (itemMap.get(idProduct) || 0) + quantitySaleItem);
  }

  const payments = payload.payments.map((payment) => {
    const idPaymentMethod = Number(payment?.idPaymentMethod);
    if (!Number.isSafeInteger(idPaymentMethod) || idPaymentMethod <= 0) throw new SaleValidationError("Forma de pagamento inválida.");
    return { idPaymentMethod, amountSalePayment: toCents(payment?.amountSalePayment, "Valor do pagamento") };
  });
  if (payments.some(({ amountSalePayment }) => amountSalePayment <= 0)) throw new SaleValidationError("O valor do pagamento deve ser positivo.");
  const discountSale = toCents(payload.discountSale ?? 0, "Desconto");
  if (discountSale < 0) throw new SaleValidationError("O desconto não pode ser negativo.");

  return {
    clientIdSale,
    items: [...itemMap].map(([idProduct, quantitySaleItem]) => ({ idProduct, quantitySaleItem })),
    payments,
    discountSale
  };
};

const serializeMoney = (cents) => (cents / 100).toFixed(2);

export async function createSale(connection, payload) {
  const input = normalizePayload(payload);
  await connection.beginTransaction();
  try {
    const [existingSales] = await connection.query(
      "SELECT idSale, clientIdSale, statusSale, subtotalSale, discountSale, totalSale FROM sales WHERE clientIdSale = ? LIMIT 1",
      [input.clientIdSale]
    );
    if (existingSales.length) {
      await connection.rollback();
      return { idempotent: true, sale: existingSales[0] };
    }

    const productIds = input.items.map(({ idProduct }) => idProduct);
    const placeholders = productIds.map(() => "?").join(", ");
    const [products] = await connection.query(
      `SELECT idProduct, nameProduct, priceProduct, stockQuantityProduct
       FROM products
       WHERE idProduct IN (${placeholders}) AND isActiveProduct = 1
       FOR UPDATE`,
      productIds
    );
    const productsById = new Map(products.map((product) => [Number(product.idProduct), product]));
    if (products.length !== input.items.length) throw new SaleValidationError("Um ou mais produtos não estão disponíveis.", 409);

    let subtotalSaleCents = 0;
    const saleItems = input.items.map(({ idProduct, quantitySaleItem }) => {
      const product = productsById.get(idProduct);
      const priceProductCents = toCents(product.priceProduct, "Preço do produto");
      const stockQuantityProduct = Number(product.stockQuantityProduct);
      if (!Number.isFinite(stockQuantityProduct) || stockQuantityProduct < quantitySaleItem) {
        throw new SaleValidationError(`Estoque insuficiente para "${product.nameProduct}".`, 409);
      }
      const lineTotalSaleItemCents = priceProductCents * quantitySaleItem;
      subtotalSaleCents += lineTotalSaleItemCents;
      return {
        idProduct,
        productNameSaleItem: product.nameProduct,
        unitPriceSaleItem: serializeMoney(priceProductCents),
        quantitySaleItem,
        lineTotalSaleItem: serializeMoney(lineTotalSaleItemCents)
      };
    });

    if (input.discountSale > subtotalSaleCents) throw new SaleValidationError("O desconto não pode superar o subtotal.");
    const totalSaleCents = subtotalSaleCents - input.discountSale;
    const paymentTotal = input.payments.reduce((sum, payment) => sum + payment.amountSalePayment, 0);
    if (paymentTotal !== totalSaleCents) throw new SaleValidationError("A soma dos pagamentos deve ser igual ao total da venda.");

    const [paymentMethods] = await connection.query(
      `SELECT idPaymentMethod FROM payment_methods
       WHERE isActivePaymentMethod = 1 AND idPaymentMethod IN (${input.payments.map(() => "?").join(", ")})`,
      input.payments.map(({ idPaymentMethod }) => idPaymentMethod)
    );
    if (paymentMethods.length !== new Set(input.payments.map(({ idPaymentMethod }) => idPaymentMethod)).size) {
      throw new SaleValidationError("Uma ou mais formas de pagamento não estão disponíveis.", 409);
    }

    const [saleResult] = await connection.query(
      `INSERT INTO sales (clientIdSale, subtotalSale, discountSale, totalSale)
       VALUES (?, ?, ?, ?)`,
      [input.clientIdSale, serializeMoney(subtotalSaleCents), serializeMoney(input.discountSale), serializeMoney(totalSaleCents)]
    );
    const idSale = saleResult.insertId;

    for (const item of saleItems) {
      await connection.query(
        `INSERT INTO sale_items
          (idSale, idProduct, productNameSaleItem, unitPriceSaleItem, quantitySaleItem, lineTotalSaleItem)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [idSale, item.idProduct, item.productNameSaleItem, item.unitPriceSaleItem, item.quantitySaleItem, item.lineTotalSaleItem]
      );
      await connection.query(
        "UPDATE products SET stockQuantityProduct = stockQuantityProduct - ? WHERE idProduct = ? AND stockQuantityProduct >= ?",
        [item.quantitySaleItem, item.idProduct, item.quantitySaleItem]
      );
      const [stockUpdate] = await connection.query("SELECT ROW_COUNT() AS affectedRows");
      if (Number(stockUpdate[0].affectedRows) !== 1) {
        throw new SaleValidationError(`Não foi possível baixar o estoque de "${item.productNameSaleItem}".`, 409);
      }
    }

    for (const payment of input.payments) {
      await connection.query(
        "INSERT INTO sale_payments (idSale, idPaymentMethod, amountSalePayment) VALUES (?, ?, ?)",
        [idSale, payment.idPaymentMethod, serializeMoney(payment.amountSalePayment)]
      );
    }

    await connection.commit();
    return {
      idempotent: false,
      sale: {
        idSale,
        clientIdSale: input.clientIdSale,
        statusSale: "completed",
        subtotalSale: serializeMoney(subtotalSaleCents),
        discountSale: serializeMoney(input.discountSale),
        totalSale: serializeMoney(totalSaleCents)
      }
    };
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") {
      const [existingSales] = await connection.query(
        "SELECT idSale, clientIdSale, statusSale, subtotalSale, discountSale, totalSale FROM sales WHERE clientIdSale = ? LIMIT 1",
        [input.clientIdSale]
      );
      if (existingSales.length) return { idempotent: true, sale: existingSales[0] };
    }
    throw error;
  }
}
