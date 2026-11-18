export const MARGIN_STATES = Object.freeze({
  RED: "red",
  YELLOW: "yellow",
  GREEN: "green"
});

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const normalizeMarginPercentage = (value) => {
  const number = toFiniteNumber(value);
  if (number === null || number < 0 || number > 100) return null;
  return number;
};

export const calculateMarginMetrics = ({ cost, price }) => {
  const costNumber = toFiniteNumber(cost);
  const priceNumber = toFiniteNumber(price);
  if (costNumber === null || priceNumber === null || costNumber < 0 || priceNumber < 0) {
    return {
      grossMargin: null,
      markup: null,
      profit: null,
      cmv: null
    };
  }

  return {
    grossMargin: priceNumber === 0 ? null : ((priceNumber - costNumber) / priceNumber) * 100,
    markup: costNumber === 0 ? null : ((priceNumber - costNumber) / costNumber) * 100,
    profit: priceNumber - costNumber,
    cmv: priceNumber === 0 ? null : (costNumber / priceNumber) * 100
  };
};

export const calculateTargetPrice = ({ cost, targetMargin }) => {
  const costNumber = toFiniteNumber(cost);
  const margin = normalizeMarginPercentage(targetMargin);
  if (costNumber === null || costNumber < 0 || margin === null || margin >= 100) return null;
  return costNumber / (1 - (margin / 100));
};

export const calculateCmvPrice = ({ cost, cmv }) => {
  const costNumber = toFiniteNumber(cost);
  const cmvNumber = normalizeMarginPercentage(cmv);
  if (costNumber === null || costNumber < 0 || cmvNumber === null || cmvNumber === 0) return null;
  return costNumber / (cmvNumber / 100);
};

export const resolveEffectiveBalancer = ({
  groupMinimum,
  groupTarget
}) => ({
  minimum: groupMinimum != null
    ? { value: normalizeMarginPercentage(groupMinimum), origin: "group" }
    : { value: null, origin: null },
  target: groupTarget != null
    ? { value: normalizeMarginPercentage(groupTarget), origin: "group" }
    : { value: null, origin: null }
});

export const classifyMargin = ({ grossMargin, minimum, target }) => {
  const gross = toFiniteNumber(grossMargin);
  const minimumNumber = normalizeMarginPercentage(minimum);
  const targetNumber = normalizeMarginPercentage(target);
  if (gross === null || minimumNumber === null || targetNumber === null) return null;
  if (gross < minimumNumber) return MARGIN_STATES.RED;
  if (gross < targetNumber) return MARGIN_STATES.YELLOW;
  return MARGIN_STATES.GREEN;
};

export const matchesMarginFilters = ({ searchTerm = "", groupId = "", state = "", product, selectedStates = [] }) => {
  const query = String(searchTerm).trim().toLocaleLowerCase("pt-BR");
  const nameMatches = !query
    || String(product.nameProduct ?? "").toLocaleLowerCase("pt-BR").includes(query)
    || String(product.pdvCodeProduct ?? "").includes(query);
  const groupMatches = !String(groupId).trim()
    || String(product.idGroup) === String(groupId);
  const states = selectedStates.length ? selectedStates : (state ? [state] : []);
  const stateMatches = !states.length || states.includes(product.marginState);
  return nameMatches && groupMatches && stateMatches;
};
