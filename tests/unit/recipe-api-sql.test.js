import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeDecimalInput, normalizeMaskedNumber } from "../../src/ui/number-mask.js";
import { propagateRecipeCosts } from "../../src/server/recipe-cost-propagation.js";

test("a consulta de componentes de receitas usa IDs canônicos sem mapas legados", async () => {
  const source = await readFile("src/server/server.js", "utf8");
  const componentQuery = source.match(
    /SELECT components\.idRecipe[\s\S]*?WHERE components\.idRecipe IN \(\?\)/u
  )?.[0];

  assert.ok(componentQuery, "consulta de componentes não encontrada");
  assert.match(componentQuery, /components\.idCulinaryUnitRecipeComponent/u);
  assert.match(componentQuery, /components\.idCulinaryUnitConversionRecipeComponent/u);
  assert.doesNotMatch(componentQuery, /unit_migration_map|unit_conversion_migration_map/u);
});

test("excluir Receita ou Composição remove fisicamente o cadastro e bloqueia dependências", async () => {
  const source = await readFile("src/server/server.js", "utf8");
  const deleteRoute = source.match(
    /if \(request\.method === "DELETE" && \/\^\\\/api\\\/recipes\\\/\\d\+\$\/\.test[\s\S]*?return;\s*\}/u
  )?.[0];

  assert.ok(deleteRoute, "rota de exclusão de receitas não encontrada");
  assert.match(deleteRoute, /product_recipe_links WHERE idRecipe = \?/u);
  assert.match(deleteRoute, /idComponentRecipe = \?/u);
  assert.match(deleteRoute, /DELETE FROM recipe_definitions WHERE idRecipe = \?/u);
  assert.doesNotMatch(deleteRoute, /statusRecipe = 'archived'/u);
  const screenSource = await readFile("src/catalog/recipe-screen.js", "utf8");
  assert.match(screenSource, /title: "Excluir Receita ou Composição"/u);
  assert.match(screenSource, /detail: "O registro será removido permanentemente e não poderá ser recuperado\."/u);
  assert.match(screenSource, /confirmLabel: "Excluir"/u);
  assert.doesNotMatch(screenSource, /\["archived", "Arquivadas"\]/u);
});

test("a Formação de Produtos recebe o tipo da Receita para rotular composições", async () => {
  const source = await readFile("src/server/server.js", "utf8");
  assert.match(
    source,
    /SELECT recipes\.idRecipe, recipes\.nameRecipe, recipes\.kindRecipe, recipes\.idResultProductRecipe,\s+recipes\.idUnitYieldRecipe/u
  );
  assert.match(source, /nested\.kindRecipe AS componentRecipeKind/u);
  assert.match(source, /products\.costPriceProduct, products\.controlsStockProduct,[\s\S]*nested\.kindRecipe AS componentRecipeKind/u);
});

test("quantidades e rendimento de receita aceitam três casas decimais", async () => {
  const source = await readFile("src/catalog/recipe-screen.js", "utf8");
  assert.match(source, /data-component-quantity data-number-mask="fractional-3"/u);
  assert.match(source, /data-component-loss data-number-mask(?:\s|>)/u);
  assert.match(source, /data-recipe-yield data-number-mask="fractional-3"/u);
  assert.match(source, /formatBrazilianDecimal\(component\.quantity, 3\)/u);
  assert.match(source, /Quantidade informada/u);
  assert.match(source, /Quantidade útil/u);
  assert.match(source, /calculateUsableQuantity\(quantity, lossPercent\)/u);
  assert.doesNotMatch(source, /data-component-quantity data-number-mask="decimal"/u);
  assert.doesNotMatch(source, /data-component-loss data-number-mask="decimal"/u);
  assert.doesNotMatch(source, /data-recipe-yield data-number-mask="decimal"/u);
  assert.equal(normalizeDecimalInput("5"), "5");
  assert.equal(normalizeDecimalInput("5,25"), "5,25");
  assert.equal(normalizeDecimalInput("5.25"), "5,25");
  assert.equal(normalizeDecimalInput("1500"), "1.500");
  assert.equal(normalizeDecimalInput("1500,5"), "1.500,5");
  assert.equal(normalizeDecimalInput("1.234,567"), "1.234,56");
  assert.equal(normalizeDecimalInput("1.234,567", 3), "1.234,567");
  assert.equal(normalizeMaskedNumber("3"), "0.03");
  assert.equal(normalizeMaskedNumber("300"), "3.00");
  assert.match(
    await readFile("src/ui/number-mask.js", "utf8"),
    /input\.value = formatDecimalInput\(input\.value\)/u
  );
});

test("salvar componente lê a quantidade atual do campo editado", async () => {
  const source = await readFile("src/catalog/recipe-screen.js", "utf8");
  assert.match(
    source,
    /const quantity = componentEditorRoot\.querySelector\("\[data-component-quantity\]"\)\?\.value[\s\S]*?parseBrazilianDecimal\(quantity\)/u
  );
  assert.match(
    source,
    /const lossPercent = componentEditorRoot\.querySelector\("\[data-component-loss\]"\)\?\.value[\s\S]*?parseBrazilianDecimal\(lossPercent\)/u
  );
});

test("conversão de componente de produto é obrigatória no formulário e na API", async () => {
  const screenSource = await readFile("src/catalog/recipe-screen.js", "utf8");
  const serverSource = await readFile("src/server/server.js", "utf8");
  assert.match(screenSource, /data-component-conversion required/u);
  assert.doesNotMatch(screenSource, /<option value="">Não informar<\/option>/u);
  assert.match(screenSource, /targetType === "product" && !componentDraft\.conversionId/u);
  assert.match(serverSource, /A conversão é obrigatória para componentes de produto/u);
});

test("editor de componente mantém os campos visíveis e bloqueados sem seleção", async () => {
  const source = await readFile("src/catalog/recipe-screen.js", "utf8");
  const styles = await readFile("src/styles.css", "utf8");
  assert.match(source, /<div class="recipe-component-input-grid">\$\{renderComponentUnits\(\)\}<\/div>/u);
  assert.match(source, /data-component-culinary-unit required \$\{hasCulinaryTarget \? "" : "disabled"\}/u);
  assert.match(source, /data-component-quantity data-number-mask="fractional-3" inputmode="decimal" \$\{hasTarget \? "" : "readonly disabled"\}/u);
  assert.match(source, /data-component-conversion required \$\{hasProduct && componentDraft\.culinaryUnitId \? "" : "disabled"\}/u);
  assert.match(source, /data-component-loss data-number-mask inputmode="decimal" \$\{hasTarget \? "" : "readonly disabled"\}/u);
  assert.match(source, /data-add-component type="button" \$\{componentDraft\.target \? "" : "disabled"\}/u);
  assert.match(styles, /\.recipe-component-input-grid[\s\S]*?height: 96px/u);
});

test("receita persiste detalhes do componente e exibe custo por unidade final", async () => {
  const screenSource = await readFile("src/catalog/recipe-screen.js", "utf8");
  const serverSource = await readFile("src/server/server.js", "utf8");
  const schemaSource = await readFile("src/server/schema-manager.js", "utf8");
  assert.match(screenSource, /data-component-details maxlength="255"/u);
  assert.match(screenSource, /component\.details \? `<em class="recipe-component-details">/u);
  assert.match(screenSource, /component-index-column[\s\S]*?component-name-column[\s\S]*?component-quantity-column[\s\S]*?component-unit-column/u);
  assert.match(screenSource, /Custo por \$\{escapeHtml\(yieldUnitLabel\(\)\)\}/u);
  assert.match(serverSource, /components\.detailsRecipeComponent/u);
  assert.match(serverSource, /details: component\.detailsRecipeComponent/u);
  assert.match(schemaSource, /detailsRecipeComponent VARCHAR\(255\) NULL/u);
  assert.match(schemaSource, /ADD COLUMN detailsRecipeComponent VARCHAR\(255\) NULL/u);
});

test("combobox de componentes é único, fecha fora e pesquisa pelo código", async () => {
  const source = await readFile("src/catalog/recipe-screen.js", "utf8");
  const combobox = await readFile("src/ui/combobox.js", "utf8");
  assert.match(source, /editingComponentIndex === null && componentDraft\.isOpen/u);
  assert.match(source, /editingComponentIndex !== null && componentDraft\.isOpen/u);
  assert.match(source, /classic-combobox/u);
  assert.match(source, /installComboboxDismissal/u);
  assert.match(combobox, /event\.key !== "Escape"/u);
  assert.match(combobox, /event\.target\?\.closest\(containerSelector\)/u);
  assert.match(source, /formatProductOptionLabel\(product\)/u);
  assert.match(source, /product\.pdvCodeProduct \|\| ""/u);
  assert.match(source, /searchText: `\$\{product\.nameProduct\} \$\{product\.pdvCodeProduct/u);
  assert.match(source, /products\.find\(\(product\) => String\(product\.idProduct\) === String\(component\.productId\)\)\?\.nameProduct/u);
});

test("listagem de componentes limita colunas fixas e deixa componente ocupar o restante", async () => {
  const source = await readFile("src/catalog/recipe-screen.js", "utf8");
  const styles = await readFile("src/styles.css", "utf8");
  assert.match(source, /component-index-column/u);
  assert.match(source, /component-actions-column/u);
  assert.match(styles, /\.component-index-column[\s\S]*?max-width: 50px/u);
  assert.match(styles, /\.component-quantity-column[\s\S]*?max-width: 100px/u);
  assert.match(styles, /\.component-unit-column[\s\S]*?max-width: 150px/u);
  assert.match(styles, /\.component-loss-column,[\s\S]*?\.component-cost-column[\s\S]*?max-width: 80px/u);
  assert.match(styles, /\.component-actions-column[\s\S]*?max-width: 100px/u);
  assert.match(styles, /\.component-name-column[\s\S]*?min-width: 0/u);
});

test("alinha colunas operacionais das listagens de receitas e componentes", async () => {
  const source = await readFile("src/catalog/recipe-screen.js", "utf8");
  const styles = await readFile("src/styles.css", "utf8");
  assert.match(source, /recipe-kind-column/u);
  assert.match(source, /recipe-status-column/u);
  assert.match(source, /recipe-actions-column/u);
  assert.match(styles, /th\.component-quantity-column[\s\S]*?text-align: center/u);
  assert.match(styles, /td\.component-quantity-column[\s\S]*?text-align: right/u);
  assert.match(styles, /\.component-unit-column[\s\S]*?text-align: center/u);
  assert.match(styles, /\.component-loss-column,[\s\S]*?text-align: center/u);
  assert.match(styles, /\.component-actions-column[\s\S]*?text-align: center/u);
  assert.match(styles, /\.recipe-kind-column,[\s\S]*?\.recipe-actions-column[\s\S]*?text-align: center/u);
});

test("preserva a posição do cursor na pesquisa de receitas", async () => {
  const source = await readFile("src/catalog/recipe-screen.js", "utf8");
  assert.match(source, /import \{ rerenderPreservingInputSelection \} from "\.\.\/ui\/input-selection\.js";/u);
  assert.match(source, /rerenderPreservingInputSelection\(input, render, \(\) => root\.querySelector\("\[data-recipe-search\]"\)\)/u);
});

test("posiciona o bloco de componentes após divisor e antes da listagem", async () => {
  const source = await readFile("src/catalog/recipe-screen.js", "utf8");
  const styles = await readFile("src/styles.css", "utf8");
  const observationsIndex = source.indexOf('data-recipe-notes');
  const dividerIndex = source.indexOf('recipe-components-divider');
  const entryIndex = source.indexOf('${renderComponentEntry()}');
  const listIndex = source.indexOf('<div class="recipe-component-list">');
  assert.ok(observationsIndex < dividerIndex);
  assert.ok(dividerIndex < entryIndex);
  assert.ok(entryIndex < listIndex);
  assert.match(styles, /\.recipe-component-entry[\s\S]*?height: 248px/u);
  assert.match(styles, /\.recipe-component-entry > \[data-add-component\][\s\S]*?margin-top: 20px[\s\S]*?margin-bottom: 30px/u);
  assert.match(styles, /\.recipe-components-divider[\s\S]*?width: calc\(100% \+ 32px\)[\s\S]*?margin: 18px 0 0 -16px[\s\S]*?background: #dce3eb/u);
});

test("Unidade Final exibe somente a descrição e Unidades Culinárias usam o catálogo canônico", async () => {
  const source = await readFile("src/catalog/recipe-screen.js", "utf8");
  assert.match(source, /culinaryUnits = units\s+\.filter\(\(unit\) => Number\(unit\.isCulinaryUnit\) === 1\)/u);
  assert.match(source, /escapeHtml\(unit\.descriptionUnit \|\| ""\)/u);
  assert.doesNotMatch(source, /culinaryUnitResponse|culinaryUnitPayload/u);
  assert.doesNotMatch(source, /apiFetch\(`\$\{getApiUrl\(\)\}\/api\/units\?includeInactive=1`\),\s+apiFetch\(`\$\{getApiUrl\(\)\}\/api\/units\?includeInactive=1`\)/u);
});

test("edição de componente preserva a conversão escolhida e exibe quantidade com três casas", async () => {
  const source = await readFile("src/catalog/recipe-screen.js", "utf8");
  assert.match(source, /const componentEditorRoot = root\.querySelector\("\[data-component-editor-modal\]"\) \|\| root/u);
  assert.match(
    source,
    /const conversionSelect = componentEditorRoot\.querySelector\("\[data-component-conversion\]"\)[\s\S]*?conversionSelect \? conversionSelect\.value : componentDraft\.conversionId/u
  );
  assert.match(source, /formatBrazilianDecimal\(component\.quantity, 3\)/u);
  assert.match(source, /formatMaskedNumber\(componentDraft\.quantity, 3\)/u);
  assert.match(source, /data-component-quantity[\s\S]*?addEventListener\("blur"/u);
});

test("listagem de receitas prioriza Nome e limita Tipo, Status e Ações", async () => {
  const source = await readFile("src/catalog/recipe-screen.js", "utf8");
  const styles = await readFile("src/styles.css", "utf8");
  assert.match(source, /sortState = \{ key: "nameRecipe", direction: "asc" \}/u);
  assert.match(source, /\["nameRecipe", "Nome", ""\]/u);
  assert.match(source, /\["kindRecipe", "Tipo", "recipe-kind-column"\]/u);
  assert.match(source, /\["statusRecipe", "Status", "recipe-status-column"\]/u);
  assert.match(source, /root\.querySelectorAll\("\[data-recipe-sort\]"\)/u);
  assert.match(styles, /\.recipe-list-panel \.classic-table th:nth-child\(2\)[\s\S]*?max-width: 90px/u);
  assert.match(styles, /\.recipe-list-panel \.classic-table th:nth-child\(3\)[\s\S]*?max-width: 90px/u);
  assert.match(styles, /\.catalog-screen \.recipe-list-panel \.classic-table \.actions-column[\s\S]*?width: 70px[\s\S]*?min-width: 70px[\s\S]*?max-width: 70px/u);
  assert.match(styles, /\.recipe-list-panel \.classic-table th[\s\S]*?text-align: center/u);
  assert.match(styles, /\.recipe-list-panel \.classic-table th\.recipe-actions-column\s*\{[\s\S]*?text-align: center/u);
});

test("modal de componente alinha o X no cabeçalho e a aplicação instala ESC global", async () => {
  const styles = await readFile("src/styles.css", "utf8");
  const mainSource = await readFile("src/main.js", "utf8");
  const modalSource = await readFile("src/ui/modal.js", "utf8");
  assert.match(styles, /\.recipe-component-modal \.classic-panel-header[\s\S]*?justify-content: space-between/u);
  assert.match(mainSource, /installGlobalModalEscape\(\)/u);
  assert.match(modalSource, /event\.key !== "Escape"/u);
});

test("salvar Receita e Ficha Técnica propaga custos para dependências em cascata", async () => {
  const serverSource = await readFile("src/server/server.js", "utf8");
  const propagationSource = await readFile("src/server/recipe-cost-propagation.js", "utf8");
  const recipeScreenSource = await readFile("src/catalog/recipe-screen.js", "utf8");
  const formationScreenSource = await readFile("src/catalog/product-formation-screen.js", "utf8");
  assert.match(propagationSource, /changedRecipeIds = \[\]/u);
  assert.match(propagationSource, /parentsByRecipe\.get\(String\(dependency\.id\)\)/u);
  assert.match(serverSource, /propagateRecipeCosts\(connection, \[\], \[result\.insertId\]\)/u);
  assert.match(serverSource, /propagateRecipeCosts\(connection, \[\], \[recipeId\]\)/u);
  assert.match(serverSource, /error instanceof RecipeCostPropagationError/u);
  assert.match(propagationSource, /class RecipeCostPropagationError extends Error/u);
  assert.match(recipeScreenSource, /formatUpdatedRecipeStructures\(payload\.updatedRecipeCount\)/u);
  assert.match(formationScreenSource, /formatUpdatedRecipeStructures\(payload\.updatedRecipeCount\)/u);
});

test("sincroniza o custo do produto resultante e propaga para fichas dependentes", async () => {
  const updates = [];
  const connection = {
    async query(sql, params) {
      if (sql.includes("FROM recipe_definitions")) {
        return [[
          { idRecipe: 1, kindRecipe: "production", idResultProductRecipe: 100, yieldQuantityRecipe: 1 },
          { idRecipe: 2, kindRecipe: "production", idResultProductRecipe: 200, yieldQuantityRecipe: 1 }
        ]];
      }
      if (sql.includes("FROM recipe_components")) {
        return [[
          {
            idRecipeComponent: 11,
            idRecipe: 1,
            componentTypeRecipe: "product",
            idComponentProductRecipe: 10,
            idCulinaryUnitRecipeComponent: 1,
            idCulinaryUnitConversionRecipeComponent: null,
            quantityRecipeComponent: 2,
            lossPercentRecipeComponent: 0
          },
          {
            idRecipeComponent: 21,
            idRecipe: 2,
            componentTypeRecipe: "product",
            idComponentProductRecipe: 100,
            idCulinaryUnitRecipeComponent: 1,
            idCulinaryUnitConversionRecipeComponent: null,
            quantityRecipeComponent: 1,
            lossPercentRecipeComponent: 0
          }
        ]];
      }
      if (sql.includes("FROM products")) {
        return [[
          { idProduct: 10, costPriceProduct: 5, packageQuantityProduct: 1, idUnitProduct: 1, idPhysicalStateProduct: null },
          { idProduct: 100, costPriceProduct: 1, packageQuantityProduct: 1, idUnitProduct: 1, idPhysicalStateProduct: null },
          { idProduct: 200, costPriceProduct: 1, packageQuantityProduct: 1, idUnitProduct: 1, idPhysicalStateProduct: null }
        ]];
      }
      if (sql.includes("FROM unit_conversions")) return [[]];
      updates.push({ sql, params });
      return [{ affectedRows: 1 }];
    }
  };

  const result = await propagateRecipeCosts(connection, [10]);

  assert.equal(result.updatedRecipeCount, 2);
  assert.deepEqual(
    updates
      .filter(({ sql }) => sql.includes("UPDATE products SET costPriceProduct"))
      .map(({ params }) => params),
    [[10, 100], [10, 200]]
  );
});

test("salvar Receita de Produção independente atualiza o custo de Receita", async () => {
  const updates = [];
  const connection = {
    async query(sql, params) {
      if (sql.includes("FROM recipe_definitions")) {
        return [[
          { idRecipe: 1, kindRecipe: "production", idResultProductRecipe: null, yieldQuantityRecipe: 1 }
        ]];
      }
      if (sql.includes("FROM recipe_components")) {
        return [[
          {
            idRecipeComponent: 11,
            idRecipe: 1,
            componentTypeRecipe: "product",
            idComponentProductRecipe: 10,
            idCulinaryUnitRecipeComponent: 1,
            idCulinaryUnitConversionRecipeComponent: null,
            quantityRecipeComponent: 1,
            lossPercentRecipeComponent: 0
          }
        ]];
      }
      if (sql.includes("FROM products")) {
        return [[
          { idProduct: 10, costPriceProduct: 5, packageQuantityProduct: 1, idUnitProduct: 1, idPhysicalStateProduct: null }
        ]];
      }
      if (sql.includes("FROM unit_conversions")) return [[]];
      updates.push({ sql, params });
      return [{ affectedRows: 1 }];
    }
  };

  await propagateRecipeCosts(connection, [], [1]);

  assert.ok(updates.some(({ sql, params }) =>
    sql.includes("UPDATE recipe_definitions")
    && sql.includes("totalCostRecipe")
    && sql.includes("unitCostRecipe")
    && params[0] === 5
  ));
  assert.equal(
    updates.some(({ sql }) => sql.includes("UPDATE products SET costPriceProduct")),
    false
  );
});

test("recalcula a Ficha Técnica com Receita atual e componente atualizado", async () => {
  const updates = [];
  const connection = {
    async query(sql, params) {
      if (sql.includes("FROM recipe_definitions")) {
        return [[
          { idRecipe: 1, kindRecipe: "production", idResultProductRecipe: null, yieldQuantityRecipe: 1 },
          { idRecipe: 2, kindRecipe: "production", idResultProductRecipe: 900, yieldQuantityRecipe: 1 }
        ]];
      }
      if (sql.includes("FROM recipe_components")) {
        return [[
          {
            idRecipeComponent: 11,
            idRecipe: 1,
            componentTypeRecipe: "product",
            idComponentProductRecipe: 427,
            idCulinaryUnitRecipeComponent: 1,
            idCulinaryUnitConversionRecipeComponent: null,
            quantityRecipeComponent: 1,
            lossPercentRecipeComponent: 0
          },
          {
            idRecipeComponent: 21,
            idRecipe: 2,
            componentTypeRecipe: "recipe",
            idComponentRecipe: 1,
            idCulinaryUnitRecipeComponent: null,
            idCulinaryUnitConversionRecipeComponent: null,
            quantityRecipeComponent: 1,
            lossPercentRecipeComponent: 0
          },
          {
            idRecipeComponent: 22,
            idRecipe: 2,
            componentTypeRecipe: "product",
            idComponentProductRecipe: 428,
            idCulinaryUnitRecipeComponent: 1,
            idCulinaryUnitConversionRecipeComponent: null,
            quantityRecipeComponent: 1,
            lossPercentRecipeComponent: 0
          }
        ]];
      }
      if (sql.includes("FROM products")) {
        return [[
          { idProduct: 427, costPriceProduct: 5.72, packageQuantityProduct: 1, idUnitProduct: 1, idPhysicalStateProduct: null },
          { idProduct: 428, costPriceProduct: 5.17, packageQuantityProduct: 1, idUnitProduct: 1, idPhysicalStateProduct: null },
          { idProduct: 900, costPriceProduct: 10.84, packageQuantityProduct: 1, idUnitProduct: 1, idPhysicalStateProduct: null }
        ]];
      }
      if (sql.includes("FROM unit_conversions")) return [[]];
      updates.push({ sql, params });
      return [{ affectedRows: 1 }];
    }
  };

  await propagateRecipeCosts(connection, [427]);

  assert.ok(updates.some(({ sql, params }) =>
    sql.includes("UPDATE recipe_definitions")
    && sql.includes("totalCostRecipe")
    && sql.includes("unitCostRecipe")
    && params[0] === 5.72
  ));
  assert.deepEqual(
    updates
      .filter(({ sql }) => sql.includes("UPDATE products SET costPriceProduct"))
      .map(({ params }) => params),
    [[10.89, 900]]
  );
});

test("propaga custos para Receitas e Composições não arquivadas", async () => {
  const propagationSource = await readFile("src/server/recipe-cost-propagation.js", "utf8");
  assert.match(propagationSource, /WHERE statusRecipe <> 'archived'/u);
  assert.doesNotMatch(propagationSource, /WHERE statusRecipe = 'active'/u);
});

test("calcula custos atuais dos componentes ao visualizar Receita e Ficha Técnica", async () => {
  const recipeSource = await readFile("src/catalog/recipe-screen.js", "utf8");
  const formationSource = await readFile("src/catalog/product-formation-screen.js", "utf8");
  assert.doesNotMatch(
    recipeSource,
    /if \(viewingRecipe && !editingRecipe && Number\.isFinite\(Number\(component\.costRecipeComponent\)\)\)/u
  );
  assert.doesNotMatch(
    formationSource,
    /if \(form\.readOnly && Number\.isFinite\(Number\(component\.costFormationComponent\)\)\)/u
  );
  assert.doesNotMatch(
    recipeSource,
    /viewingRecipe && !editingRecipe && Number\.isFinite\(Number\(form\.totalCostRecipe\)\)/u
  );
  assert.doesNotMatch(
    formationSource,
    /form\.readOnly && Number\.isFinite\(Number\(form\.totalCostFormation\)\)/u
  );
});

test("recarrega custos dos produtos antes de abrir uma Ficha Técnica", async () => {
  const formationSource = await readFile("src/catalog/product-formation-screen.js", "utf8");
  assert.match(formationSource, /const openProductFresh = async/u);
  assert.match(formationSource, /await load\(\);[\s\S]*?openProduct\(productById/u);
  assert.match(formationSource, /void openProductFresh\(productById\(button\.dataset\.editFormationProduct\)/u);
});

test("usa o custo de Receita para estruturas independentes e de Formação para Fichas vinculadas", async () => {
  const formationSource = await readFile("src/catalog/product-formation-screen.js", "utf8");
  const serverSource = await readFile("src/server/server.js", "utf8");
  assert.match(
    formationSource,
    /recipe\?\.idResultProductRecipe != null[\s\S]*?recipe\.unitCostFormation[\s\S]*?recipe\?\.unitCostRecipe/u
  );
  assert.doesNotMatch(formationSource, /recipe\?\.kindRecipe === "production"[\s\S]*?recipe\.unitCostFormation/u);
  assert.match(serverSource, /recipes\.idResultProductRecipe, recipes\.idUnitYieldRecipe/u);
  assert.match(formationSource, /form\.readOnly && Number\.isFinite\(snapshotCost\)/u);
});

test("exibe detalhe seguro para TypeError ao salvar Receita", async () => {
  const serverSource = await readFile("src/server/server.js", "utf8");
  const recipeScreenSource = await readFile("src/catalog/recipe-screen.js", "utf8");
  assert.match(serverSource, /diagnosticDetail: fallback\.diagnosticDetail/u);
  assert.match(serverSource, /error\?\.name === "TypeError" \? String\(error\.message/u);
  assert.match(serverSource, /\.slice\(0, 240\)/u);
  assert.match(recipeScreenSource, /payload\.diagnosticDetail \? `: \$\{payload\.diagnosticDetail\}`/u);
});

test("converte IDs de receitas para array antes de mapear na propagação", async () => {
  const source = await readFile("src/server/recipe-cost-propagation.js", "utf8");
  assert.match(source, /\[\.\.\.new Set\(changedRecipeIds\.map\(Number\)\.filter\(Boolean\)\)\]\s*\.map/u);
  assert.doesNotMatch(source, /\\.\\.\\.new Set\(changedRecipeIds\.map\(Number\)\.filter\(Boolean\)\)\s*\\.map/u);
});

test("prepara o identificador do caixa sem estourar o limite de TINYINT", async () => {
  const schemaSource = await readFile("src/server/schema-manager.js", "utf8");
  const databaseSchema = await readFile("database/schema.sql", "utf8");
  assert.match(schemaSource, /idCashRegister SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT/u);
  assert.match(schemaSource, /idCashRegister SMALLINT UNSIGNED NOT NULL[\s\S]*?fkCashSessionsRegister/u);
  assert.match(schemaSource, /cashRegisterUsesTinyInt[\s\S]*?ALTER TABLE cash_registers MODIFY COLUMN idCashRegister SMALLINT UNSIGNED/u);
  assert.match(schemaSource, /cashSessionUsesTinyInt[\s\S]*?ALTER TABLE cash_sessions MODIFY COLUMN idCashRegister SMALLINT UNSIGNED/u);
  assert.match(databaseSchema, /idCashRegister SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT/u);
  assert.match(databaseSchema, /idCashRegister SMALLINT UNSIGNED NOT NULL[\s\S]*?fkCashSessionsRegister/u);
});
