const normalizeText = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-BR")
  .trim();

const culinaryBaseForProductUnit = (unit = {}) => {
  const value = normalizeText(`${unit.codeUnit} ${unit.descriptionUnit}`);
  if (/(^|[\s/])(kg|g|grama|gramas|quilo|quilos|peso)([\s/]|\b)/.test(value)) return "g";
  if (/(^|[\s/])(l|lt|ml|litro|litros|mililitro|mililitros|volume)([\s/]|\b)/.test(value)) return "ml";
  if (/(^|[\s/])(un|und|unidade|unidades|peca|pecas)([\s/]|\b)/.test(value)) return "un";
  return null;
};

export const filterRecipeComponentOptions = (items, searchTerm) => {
  const normalizedSearch = normalizeText(searchTerm);
  if (!normalizedSearch) return items;
  return items.filter((item) => normalizeText(item.searchText).includes(normalizedSearch));
};

export const getCompatibleCulinaryUnits = (product, culinaryUnits) => {
  const baseUnit = culinaryBaseForProductUnit(product?.unit || product || {});
  if (!baseUnit) return culinaryUnits;
  return culinaryUnits.filter((unit) => unit.baseUnitCulinaryUnit === "common" || unit.baseUnitCulinaryUnit === baseUnit);
};

export const getAvailableRecipeConversions = ({
  culinaryUnitId,
  physicalStateId,
  targetCulinaryUnitId = "",
  selectedConversionId = "",
  conversions
}) => conversions.filter((conversion) => {
  const matchesSourceAndState = String(conversion.idFromCulinaryUnitConversion) === String(culinaryUnitId)
    && (!physicalStateId
      || String(conversion.idPhysicalStateCulinaryUnitConversion) === String(physicalStateId));
  if (!matchesSourceAndState) return false;
  return !targetCulinaryUnitId
    || String(conversion.idToCulinaryUnitConversion) === String(targetCulinaryUnitId)
    || String(conversion.idCulinaryUnitConversion) === String(selectedConversionId);
});

export const resolveRecipeComponentConversionFactor = ({
  component,
  product,
  conversions = []
}) => {
  const productUnitId = product?.idUnitProduct;
  const culinaryUnitId = component?.culinaryUnitId;
  const selectedConversion = conversions.find((conversion) =>
    String(conversion.idCulinaryUnitConversion) === String(component?.conversionId)
  );
  if (selectedConversion) {
    const factor = Number(selectedConversion.factorCulinaryUnitConversion);
    const targetMatchesProductUnit =
      String(selectedConversion.idToCulinaryUnitConversion) === String(productUnitId);
    return targetMatchesProductUnit ? factor : null;
  }
  if (String(productUnitId) === String(culinaryUnitId)) return 1;
  const matchingConversions = conversions.filter((conversion) =>
    String(conversion.idFromCulinaryUnitConversion) === String(culinaryUnitId)
    && String(conversion.idToCulinaryUnitConversion) === String(productUnitId)
    && (!product?.idPhysicalStateProduct
      || String(conversion.idPhysicalStateCulinaryUnitConversion) === String(product.idPhysicalStateProduct))
  );
  return matchingConversions.length === 1
    ? Number(matchingConversions[0].factorCulinaryUnitConversion)
    : null;
};

export const getProductTargetCulinaryUnitId = (product, culinaryUnits, units = []) => {
  const productUnit = units.find((unit) => String(unit.idUnit) === String(product?.idUnitProduct));
  const productCode = normalizeText(productUnit?.codeUnit || product?.codeUnit);
  const productDescription = normalizeText(productUnit?.descriptionUnit || product?.descriptionUnit);
  if (!productCode && !productDescription) return "";
  return culinaryUnits.find((unit) =>
    normalizeText(unit.codeCulinaryUnit) === productCode
    || normalizeText(unit.nameCulinaryUnit) === productDescription
  )?.idCulinaryUnit || "";
};

export const formatRecipeComponentUnit = (unit) => {
  if (!unit) return "Unidade não informada";
  return [unit.codeUnit, unit.descriptionUnit].filter(Boolean).join(" - ");
};

export const formatCulinaryUnit = (unit) => {
  if (!unit) return "Unidade culinária não informada";
  const name = unit.nameCulinaryUnit || unit.codeCulinaryUnit || "Unidade";
  const baseLabels = { g: "g", ml: "ml", un: "un", common: "Comum" };
  const base = baseLabels[unit.baseUnitCulinaryUnit];
  return base ? `${name} (${base})` : name;
};

export const formatCulinaryUnitName = (unit) => {
  if (!unit) return "Unidade culinária não informada";
  return unit.nameCulinaryUnit || unit.codeCulinaryUnit || "Unidade";
};
