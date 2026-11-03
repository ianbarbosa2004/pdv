const truthyImportValues = new Set(["1", "true", "sim", "s", "yes", "y"]);
const falsyImportValues = new Set(["0", "false", "não", "nao", "n", "no"]);

export const parseImportBoolean = (value, fallback, fieldName = "Campo booleano") => {
  if (value === undefined || value === null || value === "") return fallback;
  const normalizedValue = String(value).trim().toLocaleLowerCase("pt-BR");
  if (truthyImportValues.has(normalizedValue)) return 1;
  if (falsyImportValues.has(normalizedValue)) return 0;
  throw new Error(`${fieldName} deve ser sim, s, true, 1, yes, y, não, nao, n, false, 0 ou no.`);
};

export const parseImportStatus = (value, fallback = 1, fieldName = "Status") => {
  if (value === undefined || value === null || value === "") return fallback;
  const normalizedValue = String(value).trim().toLocaleUpperCase("pt-BR");
  if (["1", "ATIVO", "ATIVA", "SIM", "S", "TRUE", "YES", "Y"].includes(normalizedValue)) return 1;
  if (["0", "INATIVO", "INATIVA", "NÃO", "NAO", "N", "FALSE", "NO"].includes(normalizedValue)) return 0;
  throw new Error(`${fieldName} deve ser ATIVO, INATIVO, 1, 0, sim ou não.`);
};
