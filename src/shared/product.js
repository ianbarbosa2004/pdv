const COPY_SUFFIX_PATTERN = /\s-\sCÓPIA(?:\s+\d+)?$/iu;

const truncateWithSuffix = (baseName, suffix, maxLength) =>
  `${String(baseName).slice(0, Math.max(0, maxLength - suffix.length))}${suffix}`;

export const getDuplicatedProductName = (
  productName,
  existingNames = [],
  maxLength = 180
) => {
  const originalName = String(productName ?? "").trim();
  const baseName = originalName.replace(COPY_SUFFIX_PATTERN, "").trim() || "Produto";
  const normalizedNames = new Set(
    existingNames.map((name) => String(name ?? "").trim().toLocaleLowerCase("pt-BR"))
  );
  const firstName = truncateWithSuffix(baseName, " - cópia", maxLength);
  if (!normalizedNames.has(firstName.toLocaleLowerCase("pt-BR"))) return firstName;
  for (let copyNumber = 2; copyNumber <= existingNames.length + 2; copyNumber += 1) {
    const candidate = truncateWithSuffix(baseName, ` - cópia ${copyNumber}`, maxLength);
    if (!normalizedNames.has(candidate.toLocaleLowerCase("pt-BR"))) return candidate;
  }
  return firstName;
};

export const buildDuplicatedProductDraft = (product, {
  existingNames = [],
  maxNameLength = 180
} = {}) => ({
  nameProduct: getDuplicatedProductName(product?.nameProduct, existingNames, maxNameLength),
  skuProduct: "",
  pdvCodeProduct: "",
  idGroup: String(product?.idGroup ?? ""),
  idFiscalOperationSaleProduct: String(product?.idFiscalOperationSaleProduct ?? ""),
  idProductTypeProduct: String(product?.idProductTypeProduct ?? ""),
  idPhysicalStateProduct: String(product?.idPhysicalStateProduct ?? ""),
  idUnitProduct: String(product?.idUnitProduct ?? ""),
  packageQuantityProduct: String(product?.packageQuantityProduct ?? "1"),
  priceProduct: String(product?.priceProduct ?? "0,00"),
  costPriceProduct: String(product?.costPriceProduct ?? "0,00"),
  stockQuantityProduct: "0",
  controlsStockProduct: Number(product?.controlsStockProduct) !== 0,
  isBuffetProduct: Number(product?.isBuffetProduct) !== 0,
  isFractionalProduct: Number(product?.isFractionalProduct) !== 0,
  printsPlace: product?.printsPlace || "Não Imprimir",
  showsInPdvProduct: false
});
