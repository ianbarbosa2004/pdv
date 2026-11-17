export const formatMaskedNumber = (value, fractionDigits = 2) => {
  const numeric = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(numeric)) return "";
  return numeric.toLocaleString("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  });
};

export const normalizeMaskedNumber = (value, fractionDigits = 2) => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const digits = text.replace(/\D/g, "");
  if (!digits) return "";
  const divisor = 10 ** fractionDigits;
  return (Number(digits) / divisor).toFixed(fractionDigits);
};

export const normalizeDecimalInput = (value, fractionDigits = 2) => {
  const text = String(value ?? "").trim();
  if (!text) return "";

  const sign = text.startsWith("-") ? "-" : "";
  const unsigned = text.replace(/-/g, "");
  const separatorIndex = Math.max(unsigned.lastIndexOf(","), unsigned.lastIndexOf("."));
  const hasSeparator = separatorIndex >= 0;
  const integerPart = (hasSeparator
    ? unsigned.slice(0, separatorIndex)
    : unsigned
  ).replace(/\D/g, "");
  const fractionPart = hasSeparator
    ? unsigned.slice(separatorIndex + 1).replace(/\D/g, "").slice(0, fractionDigits)
    : "";
  const normalizedInteger = integerPart.replace(/^0+(?=\d)/, "") || "0";
  const groupedInteger = normalizedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${sign}${groupedInteger}${hasSeparator ? `,${fractionPart}` : ""}`;
};

const formatDecimalInput = (value, fractionDigits = 2) => {
  const normalized = normalizeDecimalInput(value, fractionDigits);
  if (!normalized) return "";
  const [integerPart, fractionPart = ""] = normalized.split(",");
  const numeric = Number(`${integerPart.replace(/\./g, "")}.${fractionPart || "0"}`);
  if (!Number.isFinite(numeric)) return normalized;
  return numeric.toLocaleString("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  });
};

export const bindNumberMasks = (root) => {
  root.querySelectorAll("[data-number-mask]").forEach((input) => {
    input.addEventListener("input", () => {
      if (input.dataset.numberMask === "decimal") {
        input.value = formatDecimalInput(input.value);
        return;
      }
      if (input.dataset.numberMask === "decimal-3") {
        input.value = formatDecimalInput(input.value, 3);
        return;
      }
      if (input.dataset.numberMask === "fractional-3") {
        const digits = input.value.replace(/\D/g, "");
        input.value = digits
          ? (Number(digits) / 1000).toLocaleString("pt-BR", {
              minimumFractionDigits: 3,
              maximumFractionDigits: 3
            })
          : "";
        return;
      }
      const digits = input.value.replace(/\D/g, "");
      input.value = digits
        ? (Number(digits) / 100).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })
        : "";
    });
  });
};
