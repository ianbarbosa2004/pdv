import { SaleValidationError } from "./sale-service.js";

const toCents = (value, fieldName) => {
  if ((typeof value !== "number" && typeof value !== "string")
    || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(String(value))) {
    throw new SaleValidationError(`${fieldName} inválido.`);
  }
  const [whole, fraction = ""] = String(value).split(".");
  return Number.parseInt(whole, 10) * 100
    + Number.parseInt(fraction.padEnd(2, "0"), 10);
};

const money = (cents) => (cents / 100).toFixed(2);

export const normalizeCashAmount = (value, fieldName = "Valor") => {
  const cents = toCents(value, fieldName);
  if (cents < 0) throw new SaleValidationError(`${fieldName} não pode ser negativo.`);
  return cents;
};

export const requireOperatorSession = (request) => {
  if (!request.operatorSession) {
    throw new SaleValidationError("Sessão de operador obrigatória.", 401);
  }
  return request.operatorSession;
};

export async function getOpenCashSession(connection, idCashRegister = 1, forUpdate = false) {
  const [[session]] = await connection.query(
    `SELECT cs.idCashSession, cs.idCashRegister, cr.nameCashRegister,
            cs.idOperatorOpened, cs.openingAmountCashSession,
            cs.expectedClosingAmountCashSession, cs.openedAtCashSession,
            o.displayNameOperator, o.roleOperator
     FROM cash_sessions cs
     JOIN cash_registers cr ON cr.idCashRegister = cs.idCashRegister
     JOIN operators o ON o.idOperator = cs.idOperatorOpened
     WHERE cs.idCashRegister = ? AND cs.statusCashSession = 'open'
     ORDER BY cs.idCashSession DESC
     LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
    [idCashRegister]
  );
  return session || null;
}

export async function openCashSession(connection, session, payload) {
  const openingAmount = normalizeCashAmount(payload?.openingAmountCashSession, "Saldo inicial");
  await connection.beginTransaction();
  try {
    const existing = await getOpenCashSession(connection, 1, true);
    if (existing) throw new SaleValidationError("Já existe um caixa aberto.", 409);
    const [result] = await connection.query(
      `INSERT INTO cash_sessions
        (idCashRegister, idOperatorOpened, openingAmountCashSession,
         expectedClosingAmountCashSession)
       VALUES (1, ?, ?, ?)`,
      [session.idOperator, money(openingAmount), money(openingAmount)]
    );
    await connection.query(
      `INSERT INTO cash_movements
        (idCashSession, idOperator, typeCashMovement, amountCashMovement, descriptionCashMovement)
       VALUES (?, ?, 'opening', ?, ?)`,
      [result.insertId, session.idOperator, money(openingAmount), "ABERTURA DE CAIXA"]
    );
    await connection.commit();
    return { idCashSession: result.insertId, openingAmountCashSession: money(openingAmount) };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

export async function closeCashSession(connection, session, payload) {
  const closingAmount = normalizeCashAmount(payload?.closingAmountCashSession, "Valor contado");
  const justification = String(payload?.closingJustificationCashSession ?? "").trim();
  await connection.beginTransaction();
  try {
    const [[current]] = await connection.query(
      `SELECT idCashSession, expectedClosingAmountCashSession
       FROM cash_sessions
       WHERE idCashRegister = 1 AND statusCashSession = 'open'
       FOR UPDATE`
    );
    if (!current) throw new SaleValidationError("Não existe caixa aberto.", 409);
    const expected = Math.round(Number(current.expectedClosingAmountCashSession) * 100);
    const difference = closingAmount - expected;
    if (difference !== 0 && justification.length < 5) {
      throw new SaleValidationError("Informe a justificativa da diferença de caixa.");
    }
    await connection.query(
      `UPDATE cash_sessions
       SET closingAmountCashSession = ?, differenceCashSession = ?,
           closingJustificationCashSession = NULLIF(?, ''),
           statusCashSession = 'closed', closedAtCashSession = CURRENT_TIMESTAMP,
           idOperatorClosed = ?
       WHERE idCashSession = ?`,
      [money(closingAmount), money(difference), justification, session.idOperator, current.idCashSession]
    );
    await connection.commit();
    return {
      idCashSession: current.idCashSession,
      expectedClosingAmountCashSession: money(expected),
      closingAmountCashSession: money(closingAmount),
      differenceCashSession: money(difference)
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}
