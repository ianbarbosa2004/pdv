export const formatMaskedNumber = (value) => {
  const numeric = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(numeric)) return "";
  return numeric.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

export const normalizeMaskedNumber = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const digits = text.replace(/\D/g, "");
  if (!digits) return "";
  const cents = Number(digits) / 100;
  return cents.toFixed(2);
};

export const normalizeDecimalInput = (value) => {
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
    ? unsigned.slice(separatorIndex + 1).replace(/\D/g, "").slice(0, 2)
    : "";
  const normalizedInteger = integerPart.replace(/^0+(?=\d)/, "") || "0";
  const groupedInteger = normalizedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${sign}${groupedInteger}${hasSeparator ? `,${fractionPart}` : ""}`;
};

const formatDecimalInput = (value) => {
  const normalized = normalizeDecimalInput(value);
  if (!normalized) return "";
  const [integerPart, fractionPart = ""] = normalized.split(",");
  const numeric = Number(`${integerPart.replace(/\./g, "")}.${fractionPart || "0"}`);
  if (!Number.isFinite(numeric)) return normalized;
  return numeric.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

export const bindNumberMasks = (root) => {
  root.querySelectorAll("[data-number-mask]").forEach((input) => {
    input.addEventListener("input", () => {
      if (input.dataset.numberMask === "decimal") {
        input.value = formatDecimalInput(input.value);
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
