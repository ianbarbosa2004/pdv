export const COST_POLICIES = Object.freeze({
  LAST: "last",
  AVERAGE: "average"
});

export const normalizeCostPolicy = (value, fallback = COST_POLICIES.LAST) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return Object.values(COST_POLICIES).includes(normalized) ? normalized : fallback;
};

const finiteNonNegative = (value, label) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} inválido.`);
  }
  return parsed;
};

export const calculateFiscalItemImpact = ({
  sourceQuantity,
  sourceTotal,
  conversionFactor = 1
}) => {
  const quantity = finiteNonNegative(sourceQuantity, "Quantidade fiscal")
    * finiteNonNegative(conversionFactor, "Fator de conversão");
  if (quantity <= 0) throw new Error("A quantidade convertida deve ser positiva.");
  const total = finiteNonNegative(sourceTotal, "Total fiscal");
  return {
    quantity,
    unitCost: total / quantity,
    total
  };
};

export const calculateCostUpdate = ({
  policy,
  previousStock,
  previousCost,
  receivedQuantity,
  receivedUnitCost
}) => {
  const normalizedPolicy = normalizeCostPolicy(policy);
  const stock = Number(previousStock);
  const cost = Number(previousCost);
  const quantity = finiteNonNegative(receivedQuantity, "Quantidade recebida");
  const unitCost = finiteNonNegative(receivedUnitCost, "Custo unitário recebido");
  if (!Number.isFinite(stock) || !Number.isFinite(cost)) {
    throw new Error("Saldo ou custo atual inválido.");
  }
  if (quantity <= 0) throw new Error("A quantidade recebida deve ser positiva.");

  const nextStock = stock + quantity;
  const nextCost = normalizedPolicy === COST_POLICIES.AVERAGE && stock > 0
    ? ((stock * cost) + (quantity * unitCost)) / nextStock
    : unitCost;

  return {
    policy: normalizedPolicy,
    previousStock: stock,
    nextStock,
    previousCost: cost,
    nextCost,
    quantity,
    unitCost
  };
};

export const calculateInventoryAdjustment = ({ previousStock, countedQuantity }) => {
  const previous = Number(previousStock);
  const counted = finiteNonNegative(countedQuantity, "Quantidade contada");
  if (!Number.isFinite(previous)) throw new Error("Saldo atual inválido.");
  return {
    previousStock: previous,
    countedQuantity: counted,
    quantityDelta: counted - previous
  };
};
