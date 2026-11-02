const normalizeText = (value) => String(value ?? "").trim().toLocaleLowerCase("pt-BR");

export const buildViewsGroupTree = (groups, products) => {
  const productCounts = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    const key = String(product.idGroup ?? "");
    productCounts.set(key, (productCounts.get(key) || 0) + 1);
  }

  return (Array.isArray(groups) ? groups : [])
    .map((group) => ({
      ...group,
      productCount: productCounts.get(String(group.idGroup)) || 0,
      label: `${group.descriptionClass || "Sem classe"} - ${group.descriptionGroup || "Sem grupo"}`
    }))
    .sort((left, right) => {
      const classComparison = normalizeText(left.descriptionClass).localeCompare(
        normalizeText(right.descriptionClass),
        "pt-BR",
        { sensitivity: "base" }
      );
      return classComparison || normalizeText(left.descriptionGroup).localeCompare(
        normalizeText(right.descriptionGroup),
        "pt-BR",
        { sensitivity: "base" }
      );
    });
};

export const filterViewsProducts = (products, selectedGroupId, searchTerm = "") => {
  const query = normalizeText(searchTerm);
  return (Array.isArray(products) ? products : []).filter((product) => {
    const matchesGroup =
      selectedGroupId === null
      || selectedGroupId === undefined
      || String(product.idGroup) === String(selectedGroupId);
    const matchesSearch = !query || [
      product.skuProduct,
      product.nameProduct,
      product.descriptionGroup,
      product.pdvCodeProduct
    ].some((value) => normalizeText(value).includes(query));
    return matchesGroup && matchesSearch;
  });
};

export const isNoCostProduct = (product) =>
  Number(product?.costPriceProduct || 0) === 0;
