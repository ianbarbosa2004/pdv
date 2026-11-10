const RECIPE_KINDS = new Set(["production", "composition"]);

const asPositiveNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const asLossPercent = (value) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number >= 0 && number < 100 ? number : null;
};

const productKey = (productId) => String(productId);

export const calculateGrossQuantity = (quantity, lossPercent = 0) => {
  const netQuantity = asPositiveNumber(quantity);
  const loss = asLossPercent(lossPercent);
  if (netQuantity === null || loss === null) return null;
  return netQuantity / (1 - (loss / 100));
};

export const calculateComponentCost = ({
  quantity,
  lossPercent = 0,
  unitCost = 0,
  conversionFactor = 1
}) => {
  const grossQuantity = calculateGrossQuantity(quantity, lossPercent);
  const cost = Number(unitCost);
  const factor = Number(conversionFactor);
  if (
    grossQuantity === null
    || !Number.isFinite(cost)
    || cost < 0
    || !Number.isFinite(factor)
    || factor <= 0
  ) return null;
  return grossQuantity * factor * cost;
};

export const validateRecipeDefinition = (definition = {}) => {
  const errors = [];
  if (!RECIPE_KINDS.has(definition.kind)) {
    errors.push("Informe se o cadastro é uma Receita de Produção ou uma Composição de Produto.");
  }
  if (!String(definition.name || "").trim() && (
    !Number.isInteger(Number(definition.resultProductId)) || Number(definition.resultProductId) <= 0
  )) {
    errors.push("Informe o nome da Receita ou Composição.");
  }

  const components = Array.isArray(definition.components) ? definition.components : [];
  if (!components.length) errors.push("Informe ao menos um componente.");

  components.forEach((component, index) => {
    const position = index + 1;
    const hasProduct = Number.isInteger(Number(component.productId)) && Number(component.productId) > 0;
    const hasRecipe = Number.isInteger(Number(component.recipeId)) && Number(component.recipeId) > 0;
    if (hasProduct === hasRecipe) {
      errors.push(`Componente ${position}: informe um produto ou uma Receita, mas não ambos.`);
    }
    if (asPositiveNumber(component.quantity) === null) {
      errors.push(`Componente ${position}: informe uma quantidade maior que zero.`);
    }
    if (asLossPercent(component.lossPercent) === null) {
      errors.push(`Componente ${position}: a perda deve estar entre 0 e 99,99%.`);
    }
    if (hasProduct && (!Number.isInteger(Number(component.culinaryUnitId))
      || Number(component.culinaryUnitId) <= 0)) {
      errors.push(`Componente ${position}: informe a unidade culinária.`);
    }
    if (hasProduct && (!Number.isInteger(Number(component.conversionId))
      || Number(component.conversionId) <= 0)) {
      errors.push(`Componente ${position}: informe a conversão.`);
    }
  });

  return errors;
};

export const findRecipeCycles = (definitions = []) => {
  const graph = new Map(
    definitions
      .filter((definition) => (
        Number(definition.recipeId || definition.resultProductId) > 0
      ))
      .map((definition) => [
        productKey(definition.recipeId || definition.resultProductId),
        (definition.components || []).map((component) => productKey(
          definition.recipeId ? component.recipeId : component.productId
        )).filter((key) => key !== "0")
      ])
  );
  const cycles = [];
  const visiting = new Set();
  const visited = new Set();

  const visit = (node, path) => {
    if (visiting.has(node)) {
      const start = path.indexOf(node);
      cycles.push(path.slice(start));
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    for (const component of graph.get(node) || []) visit(component, [...path, component]);
    visiting.delete(node);
    visited.add(node);
  };

  for (const node of graph.keys()) visit(node, [node]);
  return cycles;
};

export const expandRecipeComponents = ({
  productId,
  quantity = 1,
  definitions = [],
  products = new Map()
}) => {
  const definitionsByResult = new Map(
    definitions.map((definition) => [productKey(definition.resultProductId), definition])
  );
  const totals = new Map();
  const visiting = new Set();

  const addComponent = (componentProductId, componentQuantity, lossPercent) => {
    const grossQuantity = calculateGrossQuantity(componentQuantity, lossPercent);
    if (grossQuantity === null) throw new Error("Quantidade ou perda de componente inválida.");
    const key = productKey(componentProductId);
    const definition = definitionsByResult.get(key);
    if (!definition) {
      totals.set(key, (totals.get(key) || 0) + grossQuantity);
      return;
    }
    if (visiting.has(key)) throw new Error("Ciclo de composição detectado.");
    visiting.add(key);
    for (const child of definition.components || []) {
      addComponent(child.productId, grossQuantity * Number(child.quantity), child.lossPercent);
    }
    visiting.delete(key);
  };

  const root = definitionsByResult.get(productKey(productId));
  if (!root) return [{ productId: Number(productId), quantity: Number(quantity), product: products.get(productKey(productId)) }];
  visiting.add(productKey(productId));
  for (const component of root.components || []) {
    addComponent(component.productId, Number(quantity) * Number(component.quantity), component.lossPercent);
  }
  visiting.delete(productKey(productId));

  return [...totals.entries()].map(([key, componentQuantity]) => ({
    productId: Number(key),
    quantity: componentQuantity,
    product: products.get(key)
  }));
};

export const buildStockConsumptionPlan = ({
  rootProduct,
  quantity = 1,
  definitions = [],
  products = new Map()
}) => {
  if (!rootProduct || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
    throw new Error("Produto resultante ou quantidade inválida.");
  }
  if (Number(rootProduct.controlsStockProduct)) {
    return [{ productId: Number(rootProduct.idProduct), quantity: Number(quantity), product: rootProduct }];
  }
  return expandRecipeComponents({
    productId: rootProduct.idProduct,
    quantity,
    definitions,
    products
  }).filter(({ product }) => Number(product?.controlsStockProduct));
};
