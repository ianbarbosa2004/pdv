import { calculateCmvPrice } from "../shared/margin.js";
import { SaleValidationError } from "./sale-service.js";

export const parseMarginPercentage = (value, fieldName, { nullable = false } = {}) => {
  if ((value === null || value === undefined || value === "") && nullable) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number >= 100) {
    throw new SaleValidationError(`${fieldName} deve estar entre 0% e menos de 100%.`);
  }
  return Math.round(number * 100) / 100;
};

export const requireMarginAuthorization = (session, action) => {
  if (!session || !["supervisor", "admin"].includes(session.roleOperator)) {
    throw new SaleValidationError(`Somente supervisor ou admin pode ${action}.`, 403);
  }
};

export const updateMarginProductPrice = async ({
  pool,
  payload,
  operatorSession
}) => {
  requireMarginAuthorization(operatorSession, "atualizar o preço pelo CMV");

  const idProduct = Number(payload.idProduct);
  const expectedPrice = Number(payload.expectedPrice);
  const cmv = parseMarginPercentage(payload.newCmvPercentage, "Novo CMV");
  if (!Number.isSafeInteger(idProduct) || idProduct <= 0) {
    throw new SaleValidationError("Produto inválido.");
  }
  if (!Number.isFinite(expectedPrice) || expectedPrice < 0) {
    throw new SaleValidationError("Preço esperado inválido.");
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [products] = await connection.query(
      `SELECT idProduct, costPriceProduct, priceProduct
       FROM products
       WHERE idProduct = ?
       FOR UPDATE`,
      [idProduct]
    );
    if (!products.length) {
      throw new SaleValidationError("Produto não encontrado.", 404);
    }

    const product = products[0];
    const currentPrice = Number(product.priceProduct);
    if (Math.abs(currentPrice - expectedPrice) > 0.005) {
      throw new SaleValidationError(
        "O preço mudou após a abertura da View. Recarregue o produto e tente novamente.",
        409
      );
    }

    const newPrice = calculateCmvPrice({
      cost: product.costPriceProduct,
      cmv
    });
    if (newPrice === null) {
      throw new SaleValidationError("Não foi possível calcular o novo preço.");
    }

    const roundedPrice = Math.round(newPrice * 100) / 100;
    const previousCmv = currentPrice === 0
      ? null
      : Math.round((Number(product.costPriceProduct) / currentPrice) * 10000) / 100;

    await connection.query(
      "UPDATE products SET priceProduct = ? WHERE idProduct = ?",
      [roundedPrice, idProduct]
    );
    await connection.query(
      `INSERT INTO margin_price_audits (
         idProduct, previousPrice, newPrice,
         previousCmvPercentage, newCmvPercentage, idOperator
       )
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        idProduct,
        currentPrice,
        roundedPrice,
        previousCmv,
        cmv,
        operatorSession.idOperator
      ]
    );
    await connection.commit();
    return {
      idProduct,
      priceProduct: roundedPrice,
      cmv
    };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
};
