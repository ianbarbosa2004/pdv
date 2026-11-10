export const PRINT_PLACES = ["Não Imprimir", "Bar", "Copa", "Cozinha"];
export const DEFAULT_PRINT_PLACE = "Não Imprimir";

export const normalizePrintPlace = (value, fallback = DEFAULT_PRINT_PLACE) => {
  const text = value === undefined || value === null || value === ""
    ? fallback
    : String(value).trim();
  const normalized = text.toLocaleUpperCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return PRINT_PLACES.find((place) =>
    place.toLocaleUpperCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "") === normalized
  ) || null;
};
