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
  conversionFactor = 1,
  packageQuantity
}) => {
  const quantity = finiteNonNegative(sourceQuantity, "Quantidade fiscal")
    * finiteNonNegative(conversionFactor, "Fator de conversão");
  if (quantity <= 0) throw new Error("A quantidade convertida deve ser positiva.");
  const total = finiteNonNegative(sourceTotal, "Total fiscal");
  const stockUnitCost = total / quantity;
  const normalizedPackageQuantity = packageQuantity == null
    ? null
    : finiteNonNegative(packageQuantity, "Conteúdo por unidade");
  const unitCost = normalizedPackageQuantity && normalizedPackageQuantity > 0
    ? Math.round((stockUnitCost * normalizedPackageQuantity + Number.EPSILON) * 100) / 100
    : stockUnitCost;
  if (normalizedPackageQuantity && normalizedPackageQuantity > 0) {
    return {
      quantity,
      unitCost,
      total,
      stockUnitCost,
      packageQuantity: normalizedPackageQuantity
    };
  }
  return {
    quantity,
    unitCost,
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

export const calculateCostUpdateSequence = ({
  policy,
  previousStock,
  previousCost,
  entries
}) => {
  let currentStock = Number(previousStock);
  let currentCost = Number(previousCost);
  const steps = [];

  for (const entry of entries ?? []) {
    const update = calculateCostUpdate({
      policy: entry.policy ?? policy,
      previousStock: currentStock,
      previousCost: currentCost,
      receivedQuantity: entry.receivedQuantity,
      receivedUnitCost: entry.receivedUnitCost
    });
    currentStock = update.nextStock;
    currentCost = update.nextCost;
    steps.push(update);
  }

  return {
    policy: normalizeCostPolicy(policy),
    previousStock: Number(previousStock),
    nextStock: currentStock,
    previousCost: Number(previousCost),
    nextCost: currentCost,
    steps
  };
};

export const calculateCostForPolicyChange = ({
  policy,
  previousCost,
  previousStock = 0,
  entries
}) => {
  const normalizedPolicy = normalizeCostPolicy(policy);
  const fallbackCost = Number(previousCost);
  const validFallback = Number.isFinite(fallbackCost) && fallbackCost >= 0
    ? fallbackCost
    : 0;
  const fallbackStock = Number(previousStock);
  const validFallbackStock = Number.isFinite(fallbackStock) && fallbackStock > 0
    ? fallbackStock
    : 0;
  const validEntries = (entries ?? [])
    .map((entry) => ({
      quantity: Number(entry.quantity),
      unitCost: Number(entry.unitCost)
    }))
    .filter((entry) => Number.isFinite(entry.quantity)
      && entry.quantity > 0
      && Number.isFinite(entry.unitCost)
      && entry.unitCost >= 0);

  if (normalizedPolicy === COST_POLICIES.LAST) {
    return validEntries.length
      ? validEntries[validEntries.length - 1].unitCost
      : validFallback;
  }

  if (!validEntries.length) return validFallback;
  const receivedQuantity = validEntries.reduce((sum, entry) => sum + entry.quantity, 0);
  const totalQuantity = validFallbackStock + receivedQuantity;
  if (!totalQuantity) return validFallback;
  const weightedCost = (validFallbackStock * validFallback) + validEntries.reduce(
    (sum, entry) => sum + (entry.quantity * entry.unitCost),
    0
  );
  return weightedCost / totalQuantity;
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
