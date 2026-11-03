import { randomUUID } from "node:crypto";

export class SaleValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "SaleValidationError";
    this.status = status;
  }
}

export async function cancelSale(connection, idSale, payload = {}, context = {}) {
  const operatorSession = context.operatorSession;
  if (!operatorSession) {
    throw new SaleValidationError("Sessão de operador obrigatória.", 401);
  }

  if (!["supervisor", "admin"].includes(operatorSession.roleOperator)) {
    throw new SaleValidationError("Somente supervisor ou administrador pode cancelar vendas.", 403);
  }
  const reason = String(payload?.reason ?? "").trim();
  if (reason.length < 5) {
    throw new SaleValidationError("Informe um motivo de cancelamento com pelo menos 5 caracteres.");
  }
  const numericSaleId = Number(idSale);
  if (!Number.isSafeInteger(numericSaleId) || numericSaleId <= 0) {
    throw new SaleValidationError("Venda inválida.");
  }
  if (!connection) {
    throw new SaleValidationError("Conexão com o banco obrigatória.", 500);
  }
  await connection.beginTransaction();
  try {
    const [[sale]] = await connection.query(
      `SELECT idSale, idCashSessionSale, statusSale, totalSale,
              cancellationReasonSale
       FROM sales
       WHERE idSale = ?
       FOR UPDATE`,
      [numericSaleId]
    );
    if (!sale) throw new SaleValidationError("Venda não encontrada.", 404);
    if (sale.statusSale === "cancelled") {
      await connection.commit();
      return {
        idSale: numericSaleId,
        statusSale: "cancelled",
        reason: sale.cancellationReasonSale || reason,
        idempotent: true
      };
    }
    if (sale.statusSale !== "completed") {
      throw new SaleValidationError("A venda não pode ser cancelada no estado atual.", 409);
    }

    const [items] = await connection.query(
      `SELECT si.idProduct, si.quantitySaleItem, p.controlsStockProduct
       FROM sale_items si
       JOIN products p ON p.idProduct = si.idProduct
       WHERE si.idSale = ?`,
      [numericSaleId]
    );
    const [payments] = await connection.query(
      `SELECT sp.amountSalePayment, pm.cashFlowAccountPaymentMethod
       FROM sale_payments sp
       JOIN payment_methods pm ON pm.idPaymentMethod = sp.idPaymentMethod
       WHERE sp.idSale = ?`,
      [numericSaleId]
    );
    const [[voucher]] = await connection.query(
      `SELECT idCustomerVoucher, statusCustomerVoucher
       FROM customer_vouchers
       WHERE idSale = ?
       LIMIT 1
       FOR UPDATE`,
      [numericSaleId]
    );

    for (const item of items) {
      if (!Number(item.controlsStockProduct)) continue;
      const [stockUpdate] = await connection.query(
        `UPDATE products
         SET stockQuantityProduct = stockQuantityProduct + ?
         WHERE idProduct = ?`,
        [item.quantitySaleItem, item.idProduct]
      );
      if (stockUpdate.affectedRows !== 1) {
        throw new SaleValidationError("Não foi possível reverter o estoque da venda.", 409);
      }
    }

    const cashAmount = payments
      .filter(({ cashFlowAccountPaymentMethod }) => cashFlowAccountPaymentMethod === "Caixa")
      .reduce((sum, { amountSalePayment }) => sum + Number(amountSalePayment), 0);
    if (cashAmount > 0) {
      await connection.query(
        `INSERT INTO cash_movements
          (idCashSession, idOperator, typeCashMovement, amountCashMovement, descriptionCashMovement, idSale)
         VALUES (?, ?, 'sale_cancellation', ?, ?, ?)`,
        [
          sale.idCashSessionSale,
          operatorSession.idOperator,
          cashAmount.toFixed(2),
          `CANCELAMENTO VENDA #${numericSaleId}`,
          numericSaleId
        ]
      );
      const [cashUpdate] = await connection.query(
        `UPDATE cash_sessions
         SET expectedClosingAmountCashSession =
           expectedClosingAmountCashSession - ?
         WHERE idCashSession = ? AND statusCashSession = 'open'`,
        [cashAmount.toFixed(2), sale.idCashSessionSale]
      );
      if (cashUpdate.affectedRows !== 1) {
        throw new SaleValidationError("O caixa da venda não está aberto para reversão.", 409);
      }
    }
    if (voucher?.statusCustomerVoucher === "open") {
      await connection.query(
        `UPDATE customer_vouchers
         SET statusCustomerVoucher = 'cancelled'
         WHERE idCustomerVoucher = ? AND statusCustomerVoucher = 'open'`,
        [voucher.idCustomerVoucher]
      );
    }
    await connection.query(
      `UPDATE sales
       SET statusSale = 'cancelled',
           cancelledAtSale = CURRENT_TIMESTAMP,
           idOperatorCancelledSale = ?,
           cancellationReasonSale = ?
       WHERE idSale = ? AND statusSale = 'completed'`,
      [operatorSession.idOperator, reason, numericSaleId]
    );
    await connection.commit();
    return {
      idSale: numericSaleId,
      statusSale: "cancelled",
      reason,
      idempotent: false
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

export async function listRecentSales(connection, limit = 20) {
  const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const [sales] = await connection.query(
    `SELECT s.idSale, s.statusSale, s.totalSale, s.createdAtSale,
            s.cancelledAtSale, s.cancellationReasonSale,
            o.displayNameOperator, co.displayNameOperator AS cancelledByOperator,
            COALESCE(sfd.statusSaleFiscalDocument, 'not_requested') AS fiscalStatus,
            sfd.environmentSaleFiscalDocument AS fiscalEnvironment,
            sfd.seriesSaleFiscalDocument AS fiscalSeries,
            sfd.numberSaleFiscalDocument AS fiscalNumber,
            sfd.accessKeySaleFiscalDocument AS fiscalAccessKey,
            sfd.protocolSaleFiscalDocument AS fiscalProtocol,
            sfd.cStatSaleFiscalDocument AS fiscalCStat,
            sfd.messageSaleFiscalDocument AS fiscalMessage,
            sfd.xmlSaleFiscalDocument AS fiscalXml
     FROM sales s
     JOIN operators o ON o.idOperator = s.idOperatorSale
     LEFT JOIN operators co ON co.idOperator = s.idOperatorCancelledSale
     LEFT JOIN sale_fiscal_documents sfd ON sfd.idSale = s.idSale
     ORDER BY s.idSale DESC
     LIMIT ${normalizedLimit}`
  );
  return sales;
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
    if (!Number.isFinite(quantitySaleItem) || quantitySaleItem <= 0
      || Math.round(quantitySaleItem * 1000) !== quantitySaleItem * 1000) {
      throw new SaleValidationError("A quantidade deve ser um número positivo com até três casas decimais.");
    }
    itemMap.set(idProduct, Math.round(((itemMap.get(idProduct) || 0) + quantitySaleItem) * 1000) / 1000);
  }

  const payments = payload.payments.map((payment) => {
    const idPaymentMethod = Number(payment?.idPaymentMethod);
    if (!Number.isSafeInteger(idPaymentMethod) || idPaymentMethod <= 0) throw new SaleValidationError("Forma de pagamento inválida.");
    return { idPaymentMethod, amountSalePayment: toCents(payment?.amountSalePayment, "Valor do pagamento") };
  });
  if (payments.some(({ amountSalePayment }) => amountSalePayment <= 0)) throw new SaleValidationError("O valor do pagamento deve ser positivo.");
  const discountSale = toCents(payload.discountSale ?? 0, "Desconto");
  if (discountSale < 0) throw new SaleValidationError("O desconto não pode ser negativo.");
  const idCustomerSale = payload.idCustomerSale == null ? null : Number(payload.idCustomerSale);
  if (idCustomerSale !== null && (!Number.isSafeInteger(idCustomerSale) || idCustomerSale <= 0)) {
    throw new SaleValidationError("Cliente do Vale inválido.");
  }

  return {
    clientIdSale,
    items: [...itemMap].map(([idProduct, quantitySaleItem]) => ({ idProduct, quantitySaleItem })),
    payments,
    discountSale,
    idCustomerSale,
    emitNfce: payload.emitNfce === true
  };
};

const serializeMoney = (cents) => (cents / 100).toFixed(2);

const moneyToCents = (value) => Math.round(Number(value) * 100);

export const calculateVoucherAmountCents = (payments, paymentMethods) => {
  const paymentMethodsById = new Map(
    paymentMethods.map((method) => [Number(method.idPaymentMethod), method.namePaymentMethod])
  );
  return payments.reduce((sum, payment) => (
    paymentMethodsById.get(payment.idPaymentMethod)?.toLocaleUpperCase("pt-BR") === "VALE"
      ? sum + payment.amountSalePayment
      : sum
  ), 0);
};

const sortByKeys = (items, keys) => [...items].sort((left, right) => {
  for (const key of keys) {
    const difference = left[key] - right[key];
    if (difference !== 0) return difference;
  }
  return 0;
});

async function loadSaleSnapshot(connection, idSale) {
  const [[sale]] = await connection.query(
    "SELECT idSale, clientIdSale, statusSale, subtotalSale, discountSale, totalSale FROM sales WHERE idSale = ? LIMIT 1",
    [idSale]
  );
  const [items] = await connection.query(
    "SELECT idProduct, quantitySaleItem FROM sale_items WHERE idSale = ?",
    [idSale]
  );
  const [payments] = await connection.query(
    `SELECT sp.idPaymentMethod, sp.amountSalePayment, pm.namePaymentMethod
     FROM sale_payments sp
     JOIN payment_methods pm ON pm.idPaymentMethod = sp.idPaymentMethod
     WHERE sp.idSale = ?`,
    [idSale]
  );
  const [[voucher]] = await connection.query(
    "SELECT idCustomer FROM customer_vouchers WHERE idSale = ? LIMIT 1",
    [idSale]
  );
  const [fiscalRows] = await connection.query(
    `SELECT idSaleFiscalDocument, statusSaleFiscalDocument, modelSaleFiscalDocument,
            environmentSaleFiscalDocument, seriesSaleFiscalDocument,
            numberSaleFiscalDocument, accessKeySaleFiscalDocument,
            protocolSaleFiscalDocument, cStatSaleFiscalDocument,
            messageSaleFiscalDocument
     FROM sale_fiscal_documents
     WHERE idSale = ?
     LIMIT 1`,
    [idSale]
  );
  return { sale, items, payments, voucher, fiscalDocument: fiscalRows?.[0] || null };
}

function saleMatchesInput(snapshot, input) {
  if (!snapshot.sale || moneyToCents(snapshot.sale.discountSale) !== input.discountSale) return false;
  const expectedItems = sortByKey(
    input.items.map(({ idProduct, quantitySaleItem }) => ({ idProduct, quantitySaleItem })),
    ["idProduct"]
  );
  const storedItems = sortByKey(
    snapshot.items.map(({ idProduct, quantitySaleItem }) => ({
      idProduct: Number(idProduct),
      quantitySaleItem: Number(quantitySaleItem)
    })),
    ["idProduct"]
  );
  if (expectedItems.length !== storedItems.length
    || expectedItems.some((item, index) =>
      item.idProduct !== storedItems[index].idProduct
      || item.quantitySaleItem !== storedItems[index].quantitySaleItem)) {
    return false;
  }
  const expectedPayments = sortByKey(
    input.payments.map(({ idPaymentMethod, amountSalePayment }) => ({
      idPaymentMethod,
      amountSalePayment
    })),
    ["idPaymentMethod", "amountSalePayment"]
  );
  const storedPayments = sortByKey(
    snapshot.payments.map(({ idPaymentMethod, amountSalePayment, namePaymentMethod }) => ({
      idPaymentMethod: Number(idPaymentMethod),
      amountSalePayment: moneyToCents(amountSalePayment),
      namePaymentMethod
    })),
    ["idPaymentMethod", "amountSalePayment"]
  );
  const paymentsMatch = expectedPayments.length === storedPayments.length
    && expectedPayments.every((payment, index) =>
      payment.idPaymentMethod === storedPayments[index].idPaymentMethod
      && payment.amountSalePayment === storedPayments[index].amountSalePayment);
  if (!paymentsMatch) return false;
  const usesVoucher = snapshot.payments.some(
    ({ namePaymentMethod }) => namePaymentMethod?.toLocaleUpperCase("pt-BR") === "VALE"
  );
  return !usesVoucher || Number(snapshot.voucher?.idCustomer) === input.idCustomerSale;
}

async function getIdempotentSale(connection, input) {
  const [existingSales] = await connection.query(
    "SELECT idSale, clientIdSale, statusSale, subtotalSale, discountSale, totalSale FROM sales WHERE clientIdSale = ? LIMIT 1",
    [input.clientIdSale]
  );
  if (!existingSales.length) return null;
  const snapshot = await loadSaleSnapshot(connection, existingSales[0].idSale);
  if (!saleMatchesInput(snapshot, input)) {
    throw new SaleValidationError("clientIdSale já foi utilizado para outra venda.", 409);
  }
  return {
    ...snapshot.sale,
    fiscalStatus: snapshot.fiscalDocument?.statusSaleFiscalDocument || "not_requested",
    fiscalDocument: snapshot.fiscalDocument || null
  };
}

export async function createSale(connection, payload, context = {}) {
  const input = normalizePayload(payload);
  const operatorSession = context.operatorSession;
  const cashSession = context.cashSession;
  if (!operatorSession || !cashSession) {
    throw new SaleValidationError("Operador autenticado e caixa aberto são obrigatórios.", 401);
  }
  await connection.beginTransaction();
  try {
    const existingSale = await getIdempotentSale(connection, input);
    if (existingSale) {
      await connection.rollback();
      return { idempotent: true, sale: existingSale };
    }

    const productIds = input.items.map(({ idProduct }) => idProduct);
    const placeholders = productIds.map(() => "?").join(", ");
    const [products] = await connection.query(
      `SELECT idProduct, nameProduct, priceProduct, stockQuantityProduct,
              controlsStockProduct, isFractionalProduct, skuProduct, ncmProduct
       FROM products
       WHERE idProduct IN (${placeholders}) AND isActiveProduct = 1
       FOR UPDATE`,
      productIds
    );
    const productsById = new Map(products.map((product) => [Number(product.idProduct), product]));
    if (products.length !== input.items.length) throw new SaleValidationError("Um ou mais produtos não estão disponíveis.", 409);
    const [generalSettings] = await connection.query(
      `SELECT booleanValueGeneralSetting
       FROM general_settings
       WHERE keyGeneralSetting = 'allowNegativeStock'
       LIMIT 1`
    );
    const allowNegativeStock = Boolean(generalSettings[0]?.booleanValueGeneralSetting);

    let subtotalSaleCents = 0;
    const saleItems = input.items.map(({ idProduct, quantitySaleItem }) => {
      const product = productsById.get(idProduct);
      const priceProductCents = toCents(product.priceProduct, "Preço do produto");
      const stockQuantityProduct = Number(product.stockQuantityProduct);
      const controlsStockProduct = Number(product.controlsStockProduct) === 1;
      if (!Number(product.isFractionalProduct) && !Number.isInteger(quantitySaleItem)) {
        throw new SaleValidationError(`A quantidade de "${product.nameProduct}" deve ser inteira.`);
      }
      if (controlsStockProduct && !allowNegativeStock
        && (!Number.isFinite(stockQuantityProduct) || stockQuantityProduct < quantitySaleItem)) {
        throw new SaleValidationError(`Estoque insuficiente para "${product.nameProduct}".`, 409);
      }
      const lineTotalSaleItemCents = priceProductCents * quantitySaleItem;
      subtotalSaleCents += lineTotalSaleItemCents;
      return {
        idProduct,
        productNameSaleItem: product.nameProduct,
        skuProduct: product.skuProduct,
        ncmProduct: product.ncmProduct,
        unitPriceSaleItem: serializeMoney(priceProductCents),
        quantitySaleItem,
        controlsStockProduct,
        lineTotalSaleItem: serializeMoney(lineTotalSaleItemCents)
      };
    });

    if (input.discountSale > subtotalSaleCents) throw new SaleValidationError("O desconto não pode superar o subtotal.");
    const totalSaleCents = subtotalSaleCents - input.discountSale;
    const paymentTotal = input.payments.reduce((sum, payment) => sum + payment.amountSalePayment, 0);
    if (paymentTotal !== totalSaleCents) throw new SaleValidationError("A soma dos pagamentos deve ser igual ao total da venda.");

    const [paymentMethods] = await connection.query(
      `SELECT idPaymentMethod, namePaymentMethod, cashFlowAccountPaymentMethod
       FROM payment_methods
       WHERE isActivePaymentMethod = 1 AND idPaymentMethod IN (${input.payments.map(() => "?").join(", ")})`,
      input.payments.map(({ idPaymentMethod }) => idPaymentMethod)
    );
    if (paymentMethods.length !== new Set(input.payments.map(({ idPaymentMethod }) => idPaymentMethod)).size) {
      throw new SaleValidationError("Uma ou mais formas de pagamento não estão disponíveis.", 409);
    }
    const voucherAmountCents = calculateVoucherAmountCents(input.payments, paymentMethods);
    const usesVoucher = voucherAmountCents > 0;
    if (usesVoucher && !input.idCustomerSale) throw new SaleValidationError("Selecione o cliente para registrar a venda em Vale.");
    if (usesVoucher) {
      const [customers] = await connection.query(
        "SELECT idCustomer, creditLimitCustomer FROM customers WHERE idCustomer = ? AND isActiveCustomer = 1 FOR UPDATE",
        [input.idCustomerSale]
      );
      if (!customers.length) throw new SaleValidationError("Cliente do Vale não encontrado ou inativo.", 409);
      const [openVouchers] = await connection.query(
        `SELECT COALESCE(SUM(amountCustomerVoucher), 0) AS totalOpen
         FROM customer_vouchers WHERE idCustomer = ? AND statusCustomerVoucher = 'open'`,
        [input.idCustomerSale]
      );
      const available = Number(customers[0].creditLimitCustomer || 0) - Number(openVouchers[0]?.totalOpen || 0);
      if (available + 0.0001 < voucherAmountCents / 100) throw new SaleValidationError("O limite disponível de Vale é insuficiente.", 409);
    }

    const [saleResult] = await connection.query(
      `INSERT INTO sales
        (clientIdSale, idOperatorSale, idCashSessionSale, subtotalSale, discountSale, totalSale)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.clientIdSale,
        operatorSession.idOperator,
        cashSession.idCashSession,
        serializeMoney(subtotalSaleCents),
        serializeMoney(input.discountSale),
        serializeMoney(totalSaleCents)
      ]
    );
    const idSale = saleResult.insertId;

    for (const item of saleItems) {
      await connection.query(
        `INSERT INTO sale_items
          (idSale, idProduct, productNameSaleItem, unitPriceSaleItem, quantitySaleItem, lineTotalSaleItem)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [idSale, item.idProduct, item.productNameSaleItem, item.unitPriceSaleItem, item.quantitySaleItem, item.lineTotalSaleItem]
      );
      if (!item.controlsStockProduct) continue;
      const stockUpdateQuery = allowNegativeStock
        ? "UPDATE products SET stockQuantityProduct = stockQuantityProduct - ? WHERE idProduct = ?"
        : "UPDATE products SET stockQuantityProduct = stockQuantityProduct - ? WHERE idProduct = ? AND stockQuantityProduct >= ?";
      const stockUpdateParams = allowNegativeStock
        ? [item.quantitySaleItem, item.idProduct]
        : [item.quantitySaleItem, item.idProduct, item.quantitySaleItem];
      await connection.query(stockUpdateQuery, stockUpdateParams);
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
    const cashAmountCents = input.payments.reduce((sum, payment) => {
      const method = paymentMethods.find(
        ({ idPaymentMethod }) => Number(idPaymentMethod) === payment.idPaymentMethod
      );
      return method?.cashFlowAccountPaymentMethod === "Caixa"
        ? sum + payment.amountSalePayment
        : sum;
    }, 0);
    if (cashAmountCents > 0) {
      await connection.query(
        `INSERT INTO cash_movements
          (idCashSession, idOperator, typeCashMovement, amountCashMovement, descriptionCashMovement, idSale)
         VALUES (?, ?, 'sale', ?, ?, ?)`,
        [
          cashSession.idCashSession,
          operatorSession.idOperator,
          serializeMoney(cashAmountCents),
          `VENDA #${idSale}`,
          idSale
        ]
      );
      const [cashUpdate] = await connection.query(
        `UPDATE cash_sessions
         SET expectedClosingAmountCashSession =
           expectedClosingAmountCashSession + ?
         WHERE idCashSession = ? AND statusCashSession = 'open'`,
        [serializeMoney(cashAmountCents), cashSession.idCashSession]
      );
      if (cashUpdate.affectedRows !== 1) {
        throw new SaleValidationError("O caixa não está mais aberto.", 409);
      }
    }

    if (usesVoucher) {
      await connection.query(
        `INSERT INTO customer_vouchers
          (idCustomer, idSale, amountCustomerVoucher, dueDateCustomerVoucher)
         VALUES (?, ?, ?, CURDATE())`,
        [input.idCustomerSale, idSale, serializeMoney(voucherAmountCents)]
      );
    }

    let fiscalDocument = null;
    if (input.emitNfce) {
      const fiscalConfig = context.fiscalConfig;
      if (!fiscalConfig) {
        throw new SaleValidationError("A configuração da NFC-e não está disponível.", 409);
      }
      const [[company]] = await connection.query(
        `SELECT nfceModelCompany, nfceEnvironmentCompany, nfceSeriesCompany,
                nfceNextNumberCompany, nfceContingencyCompany
         FROM company_settings
         ORDER BY idCompanySetting ASC
         LIMIT 1
         FOR UPDATE`
      );
      if (!company) throw new SaleValidationError("Cadastro da empresa não encontrado.", 409);
      if (company.nfceEnvironmentCompany !== "homologation") {
        throw new SaleValidationError("A emissão integrada está disponível somente em homologação nesta etapa.", 409);
      }
      const number = Number(company.nfceNextNumberCompany || company.nfceInitialNumberCompany || 1);
      const [fiscalResult] = await connection.query(
        `INSERT INTO sale_fiscal_documents
          (idSale, modelSaleFiscalDocument, environmentSaleFiscalDocument,
           seriesSaleFiscalDocument, numberSaleFiscalDocument, statusSaleFiscalDocument)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [idSale, company.nfceModelCompany, company.nfceEnvironmentCompany, company.nfceSeriesCompany, number]
      );
      await connection.query(
        `UPDATE company_settings
         SET nfceNextNumberCompany = ?
         ORDER BY idCompanySetting ASC
         LIMIT 1`,
        [number + 1]
      );
      fiscalDocument = {
        idSaleFiscalDocument: fiscalResult.insertId,
        idSale,
        model: Number(company.nfceModelCompany),
        environment: company.nfceEnvironmentCompany,
        series: Number(company.nfceSeriesCompany),
        number,
        status: "pending"
      };
    }

    await connection.commit();
    if (fiscalDocument && typeof context.fiscalAuthorizer === "function") {
      try {
        const fiscalResult = await context.fiscalAuthorizer({
          fiscalDocument,
          sale: {
            idSale,
            subtotalSale: serializeMoney(subtotalSaleCents),
            discountSale: serializeMoney(input.discountSale),
            totalSale: serializeMoney(totalSaleCents)
          },
          items: saleItems,
          payments: input.payments.map((payment) => ({
            ...payment,
            namePaymentMethod: paymentMethods.find(
              ({ idPaymentMethod }) => Number(idPaymentMethod) === payment.idPaymentMethod
            )?.namePaymentMethod
          }))
        });
        const fiscalStatus = fiscalResult?.status === "authorized"
          ? "authorized"
          : fiscalResult?.status === "rejected" ? "rejected" : "unknown";
        await connection.query(
          `UPDATE sale_fiscal_documents
           SET statusSaleFiscalDocument = ?, accessKeySaleFiscalDocument = ?,
               protocolSaleFiscalDocument = ?, cStatSaleFiscalDocument = ?,
               messageSaleFiscalDocument = ?, xmlSaleFiscalDocument = ?,
               attemptsSaleFiscalDocument = attemptsSaleFiscalDocument + 1,
               lastAttemptAtSaleFiscalDocument = CURRENT_TIMESTAMP
           WHERE idSaleFiscalDocument = ?`,
          [
            fiscalStatus,
            fiscalResult?.accessKey || null,
            fiscalResult?.protocol || null,
            fiscalResult?.cStat || null,
            fiscalResult?.message || null,
            fiscalResult?.xml || null,
            fiscalDocument.idSaleFiscalDocument
          ]
        );
        fiscalDocument = { ...fiscalDocument, ...fiscalResult, status: fiscalStatus };
      } catch (error) {
        await connection.query(
          `UPDATE sale_fiscal_documents
           SET statusSaleFiscalDocument = 'unknown',
               messageSaleFiscalDocument = ?,
               attemptsSaleFiscalDocument = attemptsSaleFiscalDocument + 1,
               lastAttemptAtSaleFiscalDocument = CURRENT_TIMESTAMP
           WHERE idSaleFiscalDocument = ?`,
          [
            error instanceof Error ? error.message.slice(0, 500) : "Resultado fiscal desconhecido.",
            fiscalDocument.idSaleFiscalDocument
          ]
        );
        fiscalDocument = {
          ...fiscalDocument,
          status: "unknown",
          message: error instanceof Error ? error.message : "Resultado fiscal desconhecido."
        };
      }
    }
    return {
      idempotent: false,
      sale: {
        idSale,
        clientIdSale: input.clientIdSale,
        statusSale: "completed",
        subtotalSale: serializeMoney(subtotalSaleCents),
        discountSale: serializeMoney(input.discountSale),
        totalSale: serializeMoney(totalSaleCents),
        fiscalStatus: input.emitNfce ? fiscalDocument?.status || "pending" : "not_requested",
        fiscalDocument
      }
    };
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") {
      const existingSale = await getIdempotentSale(connection, input);
      if (existingSale) return { idempotent: true, sale: existingSale };
    }
    throw error;
  }
}
