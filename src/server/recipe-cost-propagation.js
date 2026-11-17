import { calculateComponentCost, calculateCostPerYieldUnit } from "../shared/recipe.js";
import { roundCostUpToCents } from "../shared/decimal.js";

export class RecipeCostPropagationError extends Error {
  constructor(message) {
    super(message);
    this.name = "RecipeCostPropagationError";
  }
}

const getConversionFactor = ({ component, product, conversions }) => {
  if (!product) {
    throw new RecipeCostPropagationError(
      `Produto componente ${component.idComponentProductRecipe} não encontrado.`
    );
  }
  const productUnitId = String(product.idUnitProduct || "");
  const culinaryUnitId = String(component.idCulinaryUnitRecipeComponent || "");
  const packageQuantity = Number(product.packageQuantityProduct || 1);
  if (!Number.isFinite(packageQuantity) || packageQuantity <= 0) {
    throw new RecipeCostPropagationError(
      `Conteúdo por unidade inválido no produto ${product.idProduct}.`
    );
  }
  const selected = conversions.get(String(component.idCulinaryUnitConversionRecipeComponent || ""));
  if (selected) {
    if (String(selected.idToUnitConversion) !== productUnitId) {
      throw new RecipeCostPropagationError(
        `A conversão do componente ${component.idRecipeComponent} não corresponde à unidade do produto.`
      );
    }
    return Number(selected.factorUnitConversion) / packageQuantity;
  }
  if (!culinaryUnitId || culinaryUnitId === productUnitId) return 1;
  const matches = [...conversions.values()].filter((conversion) =>
    String(conversion.idFromUnitConversion) === culinaryUnitId
    && String(conversion.idToUnitConversion) === productUnitId
    && (!product.idPhysicalStateProduct
      || String(conversion.idPhysicalStateUnitConversion) === String(product.idPhysicalStateProduct))
  );
  if (matches.length !== 1) {
    throw new RecipeCostPropagationError(
      `Não foi possível resolver a conversão do componente ${component.idRecipeComponent}.`
    );
  }
  return Number(matches[0].factorUnitConversion) / packageQuantity;
};

const addToReverseMap = (map, key, value) => {
  const values = map.get(String(key)) || [];
  values.push(value);
  map.set(String(key), values);
};

export const propagateRecipeCosts = async (
  connection,
  changedProductIds = [],
  changedRecipeIds = []
) => {
  const [recipeRows] = await connection.query(
    `SELECT idRecipe, kindRecipe, idResultProductRecipe, yieldQuantityRecipe
     FROM recipe_definitions
     WHERE statusRecipe <> 'archived'
     ORDER BY idRecipe`
  );
  if (!recipeRows.length) return { updatedRecipeCount: 0 };

  const recipeIds = recipeRows.map((recipe) => recipe.idRecipe);
  const [componentRows] = await connection.query(
    `SELECT idRecipeComponent, idRecipe, componentTypeRecipe,
            idComponentProductRecipe, idComponentRecipe,
            idCulinaryUnitRecipeComponent, idCulinaryUnitConversionRecipeComponent,
            quantityRecipeComponent, lossPercentRecipeComponent
     FROM recipe_components
     WHERE idRecipe IN (?)`,
    [recipeIds]
  );
  const componentProductIds = componentRows
    .filter((component) => component.componentTypeRecipe === "product")
    .map((component) => Number(component.idComponentProductRecipe))
    .filter(Boolean);
  const resultProductIds = recipeRows
    .filter((recipe) => recipe.kindRecipe === "production")
    .map((recipe) => Number(recipe.idResultProductRecipe))
    .filter(Boolean);
  const productIds = [...new Set([...componentProductIds, ...resultProductIds])];
  const [productRows] = productIds.length
    ? await connection.query(
      `SELECT idProduct, costPriceProduct, packageQuantityProduct,
              idUnitProduct, idPhysicalStateProduct
       FROM products
       WHERE idProduct IN (?)`,
      [productIds]
    )
    : [[]];
  const conversionIds = [...new Set(componentRows
    .map((component) => Number(component.idCulinaryUnitConversionRecipeComponent))
    .filter(Boolean))];
  const [conversionRows] = conversionIds.length
    ? await connection.query(
      `SELECT idUnitConversion, idFromUnitConversion, idToUnitConversion,
              idPhysicalStateUnitConversion, factorUnitConversion
       FROM unit_conversions
       WHERE idUnitConversion IN (?)`,
      [conversionIds]
    )
    : [[]];

  const recipesById = new Map(recipeRows.map((recipe) => [String(recipe.idRecipe), recipe]));
  const componentsByRecipe = new Map();
  componentRows.forEach((component) => {
    const list = componentsByRecipe.get(String(component.idRecipe)) || [];
    list.push(component);
    componentsByRecipe.set(String(component.idRecipe), list);
  });
  const productsById = new Map(productRows.map((product) => [String(product.idProduct), product]));
  const conversionsById = new Map(conversionRows.map((conversion) => [String(conversion.idUnitConversion), conversion]));
  const recipesByProduct = new Map();
  const parentsByRecipe = new Map();
  componentRows.forEach((component) => {
    if (component.componentTypeRecipe === "product") {
      addToReverseMap(recipesByProduct, component.idComponentProductRecipe, component.idRecipe);
    } else {
      addToReverseMap(parentsByRecipe, component.idComponentRecipe, component.idRecipe);
    }
  });

  const impacted = new Set();
  const pending = [
    ...new Set(changedProductIds.map(Number).filter(Boolean))
  ].map((productId) => ({ type: "product", id: productId }));
  pending.push(
    ...[...new Set(changedRecipeIds.map(Number).filter(Boolean))]
      .map((recipeId) => ({ type: "recipe", id: recipeId }))
  );
  while (pending.length) {
    const dependency = pending.shift();
    if (dependency.type === "recipe") {
      if (!recipesById.has(String(dependency.id)) || impacted.has(String(dependency.id))) continue;
      const recipe = recipesById.get(String(dependency.id));
      impacted.add(String(dependency.id));
      const resultProductId = recipe.idResultProductRecipe;
      if (recipe.kindRecipe === "production" && resultProductId) {
        pending.push({ type: "product", id: resultProductId });
      }
      pending.push(
        ...(parentsByRecipe.get(String(dependency.id)) || [])
          .map((recipeId) => ({ type: "recipe", id: recipeId }))
      );
      continue;
    }
    for (const recipeId of recipesByProduct.get(String(dependency.id)) || []) {
      pending.push({ type: "recipe", id: recipeId });
    }
  }

  const calculated = new Map();
  const visiting = new Set();
  const calculateRecipe = (recipeId) => {
    const key = String(recipeId);
    if (calculated.has(key)) return calculated.get(key);
    if (visiting.has(key)) {
      throw new RecipeCostPropagationError("Ciclo detectado entre Receitas e Composições.");
    }
    const recipe = recipesById.get(key);
    if (!recipe) throw new RecipeCostPropagationError(`Receita componente ${recipeId} não encontrada.`);
    visiting.add(key);
    let total = 0;
    for (const component of componentsByRecipe.get(key) || []) {
      const unitCost = component.componentTypeRecipe === "recipe"
        ? calculateRecipe(component.idComponentRecipe).unitCost
        : Number(productsById.get(String(component.idComponentProductRecipe))?.costPriceProduct);
      if (!Number.isFinite(unitCost) || unitCost < 0) {
        throw new RecipeCostPropagationError(
          `Custo inválido no componente ${component.idRecipeComponent}.`
        );
      }
      const conversionFactor = component.componentTypeRecipe === "recipe"
        ? 1
        : getConversionFactor({
          component,
          product: productsById.get(String(component.idComponentProductRecipe)),
          conversions: conversionsById
        });
      const componentCost = calculateComponentCost({
        quantity: component.quantityRecipeComponent,
        lossPercent: component.lossPercentRecipeComponent,
        unitCost,
        conversionFactor
      });
      if (componentCost === null) {
        throw new RecipeCostPropagationError(
          `Quantidade inválida no componente ${component.idRecipeComponent}.`
        );
      }
      total += componentCost;
    }
    const roundedTotal = roundCostUpToCents(total);
    const unitCost = calculateCostPerYieldUnit(roundedTotal, recipe.yieldQuantityRecipe);
    if (unitCost === null) {
      throw new RecipeCostPropagationError(`Rendimento inválido na Receita ${recipe.idRecipe}.`);
    }
    visiting.delete(key);
    const result = { total: roundedTotal, unitCost };
    calculated.set(key, result);
    return result;
  };

  for (const recipeId of impacted) {
    const recipe = recipesById.get(String(recipeId));
    const result = calculateRecipe(recipeId);
    const isFormation = recipe.idResultProductRecipe != null;
    const componentCostColumn = isFormation
      ? "costFormationComponent"
      : "costRecipeComponent";
    const totalCostColumn = isFormation
      ? "totalCostFormation"
      : "totalCostRecipe";
    const unitCostColumn = isFormation
      ? "unitCostFormation"
      : "unitCostRecipe";
    for (const component of componentsByRecipe.get(String(recipeId)) || []) {
      const unitCost = component.componentTypeRecipe === "recipe"
        ? calculateRecipe(component.idComponentRecipe).unitCost
        : Number(productsById.get(String(component.idComponentProductRecipe))?.costPriceProduct);
      const conversionFactor = component.componentTypeRecipe === "recipe"
        ? 1
        : getConversionFactor({
          component,
          product: productsById.get(String(component.idComponentProductRecipe)),
          conversions: conversionsById
        });
      const componentCost = calculateComponentCost({
        quantity: component.quantityRecipeComponent,
        lossPercent: component.lossPercentRecipeComponent,
        unitCost,
        conversionFactor
      });
      await connection.query(
        `UPDATE recipe_components
         SET ${componentCostColumn} = ?
         WHERE idRecipeComponent = ?`,
        [componentCost, component.idRecipeComponent]
      );
    }
    await connection.query(
      `UPDATE recipe_definitions
       SET ${totalCostColumn} = ?,
           ${unitCostColumn} = ?
       WHERE idRecipe = ?`,
      [result.total, result.unitCost, recipeId]
    );
    if (isFormation) {
      const resultProduct = productsById.get(String(recipe.idResultProductRecipe));
      if (resultProduct) resultProduct.costPriceProduct = result.unitCost;
      await connection.query(
        "UPDATE products SET costPriceProduct = ? WHERE idProduct = ?",
        [result.unitCost, recipe.idResultProductRecipe]
      );
    }
  }
  return { updatedRecipeCount: impacted.size };
};
