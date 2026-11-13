import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeDecimalInput, normalizeMaskedNumber } from "../../src/ui/number-mask.js";

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

test("quantidades de receita usam a mesma máscara de centavos dos preços", async () => {
  const source = await readFile("src/catalog/recipe-screen.js", "utf8");
  assert.match(source, /data-component-quantity data-number-mask(?:\s|>)/u);
  assert.match(source, /data-component-loss data-number-mask(?:\s|>)/u);
  assert.match(source, /data-recipe-yield data-number-mask(?:\s|>)/u);
  assert.doesNotMatch(source, /data-component-quantity data-number-mask="decimal"/u);
  assert.doesNotMatch(source, /data-component-loss data-number-mask="decimal"/u);
  assert.doesNotMatch(source, /data-recipe-yield data-number-mask="decimal"/u);
  assert.equal(normalizeDecimalInput("5"), "5");
  assert.equal(normalizeDecimalInput("5,25"), "5,25");
  assert.equal(normalizeDecimalInput("5.25"), "5,25");
  assert.equal(normalizeDecimalInput("1500"), "1.500");
  assert.equal(normalizeDecimalInput("1500,5"), "1.500,5");
  assert.equal(normalizeDecimalInput("1.234,567"), "1.234,56");
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
  assert.match(source, /data-component-culinary-unit required \$\{hasProduct \? "" : "disabled"\}/u);
  assert.match(source, /data-component-quantity data-number-mask inputmode="decimal" \$\{hasTarget \? "" : "readonly disabled"\}/u);
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
  assert.match(source, /pdvCodeProduct \|\| product\.skuProduct/u);
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
  assert.match(source, /const selectionStart = input\.selectionStart[\s\S]*?const selectionEnd = input\.selectionEnd/u);
  assert.match(source, /nextInput\?\.setSelectionRange\(selectionStart, selectionEnd, selectionDirection \|\| "none"\)/u);
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

test("edição de componente preserva a conversão escolhida e exibe quantidade com duas casas", async () => {
  const source = await readFile("src/catalog/recipe-screen.js", "utf8");
  assert.match(source, /const componentEditorRoot = root\.querySelector\("\[data-component-editor-modal\]"\) \|\| root/u);
  assert.match(
    source,
    /const conversionSelect = componentEditorRoot\.querySelector\("\[data-component-conversion\]"\)[\s\S]*?conversionSelect \? conversionSelect\.value : componentDraft\.conversionId/u
  );
  assert.match(source, /formatBrazilianDecimal\(component\.quantity, 2\)/u);
  assert.match(source, /formatMaskedNumber\(componentDraft\.quantity\)/u);
  assert.match(source, /data-component-quantity[\s\S]*?addEventListener\("blur"/u);
});

test("listagem de receitas prioriza Nome e limita Tipo, Status e Ações", async () => {
  const styles = await readFile("src/styles.css", "utf8");
  assert.match(styles, /\.recipe-list-panel \.classic-table th:nth-child\(2\)[\s\S]*?max-width: 90px/u);
  assert.match(styles, /\.recipe-list-panel \.classic-table th:nth-child\(3\)[\s\S]*?max-width: 90px/u);
  assert.match(styles, /\.catalog-screen \.recipe-list-panel \.classic-table \.actions-column[\s\S]*?width: 70px[\s\S]*?min-width: 70px[\s\S]*?max-width: 70px/u);
});

test("modal de componente alinha o X no cabeçalho e a aplicação instala ESC global", async () => {
  const styles = await readFile("src/styles.css", "utf8");
  const mainSource = await readFile("src/main.js", "utf8");
  const modalSource = await readFile("src/ui/modal.js", "utf8");
  assert.match(styles, /\.recipe-component-modal \.classic-panel-header[\s\S]*?justify-content: space-between/u);
  assert.match(mainSource, /installGlobalModalEscape\(\)/u);
  assert.match(modalSource, /event\.key !== "Escape"/u);
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
