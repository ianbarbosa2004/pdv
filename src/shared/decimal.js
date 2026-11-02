export const parseBrazilianDecimal = (value) => {
  const text = String(value ?? "").trim().replace(/\s/g, "");
  if (!text) return NaN;
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  return Number(normalized);
};

export const formatBrazilianDecimal = (value, fractionDigits = 3) => {
  const numeric = typeof value === "number" ? value : parseBrazilianDecimal(value);
  if (!Number.isFinite(numeric)) return "";
  return numeric.toLocaleString("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  });
};
