const truthyImportValues = new Set(["1", "true", "sim", "s", "yes", "y"]);
const falsyImportValues = new Set(["0", "false", "não", "nao", "n", "no"]);

export const parseImportBoolean = (value, fallback, fieldName = "Campo booleano") => {
  if (value === undefined || value === null || value === "") return fallback;
  const normalizedValue = String(value).trim().toLocaleLowerCase("pt-BR");
  if (truthyImportValues.has(normalizedValue)) return 1;
  if (falsyImportValues.has(normalizedValue)) return 0;
  throw new Error(`${fieldName} deve ser sim, s, true, 1, yes, y, não, nao, n, false, 0 ou no.`);
};
