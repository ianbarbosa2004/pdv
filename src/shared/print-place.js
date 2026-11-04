export const PRINT_PLACES = ["NÃO IMPRIMIR", "BAR", "COPA", "COZINHA"];
export const DEFAULT_PRINT_PLACE = "NÃO IMPRIMIR";

export const normalizePrintPlace = (value, fallback = DEFAULT_PRINT_PLACE) => {
  const text = value === undefined || value === null || value === ""
    ? fallback
    : String(value).trim();
  const normalized = text.toLocaleUpperCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return PRINT_PLACES.find((place) =>
    place.normalize("NFD").replace(/[\u0300-\u036f]/g, "") === normalized
  ) || null;
};
