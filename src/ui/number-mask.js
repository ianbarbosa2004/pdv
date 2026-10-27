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

export const bindNumberMasks = (root) => {
  root.querySelectorAll("[data-number-mask]").forEach((input) => {
    input.addEventListener("input", () => {
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
