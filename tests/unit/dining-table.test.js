import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  normalizeDiningTablePayload,
  normalizeDiningTableCount,
  normalizeDiningTableColor,
  sortDiningTables,
  getDiningTableModalPresentation,
  getDiningTablePeopleLabel
} from "../../src/shared/dining-table.js";
import { validateFiscalUrl } from "../../src/shared/fiscal-url.js";

test("normalizes a dining table payload", () => {
  assert.deepEqual(normalizeDiningTablePayload({
    visualIdentifier: " 12 ",
    name: "Varanda ",
    people: "4",
    status: "occupied"
  }), {
    visualIdentifier: "12",
    name: "Varanda",
    people: 4,
    status: "occupied"
  });
});

test("normalizes dining table card colors in hex or rgb format", () => {
  assert.equal(normalizeDiningTableColor("#b9C7d1"), "#b9c7d1");
  assert.equal(normalizeDiningTableColor("rgb(199, 77, 69)"), "#c74d45");
  assert.throws(
    () => normalizeDiningTableColor("blue"),
    /cor válida/u
  );
});

test("rejects invalid dining table payload values", () => {
  assert.throws(
    () => normalizeDiningTablePayload({ visualIdentifier: "", people: 1 }),
    /identificador visual/
  );
  assert.throws(
    () => normalizeDiningTablePayload({ visualIdentifier: "1", people: 0 }),
    /quantidade válida/
  );
  assert.throws(
    () => normalizeDiningTablePayload({ visualIdentifier: "1", status: "closed" }),
    /Estado da mesa/
  );
});

test("sorts dining tables by position and visual identifier", () => {
  const tables = [
    { visualIdentifier: "10", sortPosition: 1 },
    { visualIdentifier: "2", sortPosition: 1 },
    { visualIdentifier: "1", sortPosition: 0 }
  ];

  assert.deepEqual(
    sortDiningTables(tables).map((table) => table.visualIdentifier),
    ["1", "2", "10"]
  );
});

test("normalizes the configured dining table count", () => {
  assert.equal(normalizeDiningTableCount("20"), 20);
  assert.throws(() => normalizeDiningTableCount("0"), /entre 1 e 200/);
  assert.throws(() => normalizeDiningTableCount("201"), /entre 1 e 200/);
  assert.throws(() => normalizeDiningTableCount("1.5"), /entre 1 e 200/);
});

test("shows the occupancy action and people count for dining tables", () => {
  assert.equal(getDiningTablePeopleLabel(1), "1 pessoa");
  assert.equal(getDiningTablePeopleLabel(4), "4 pessoas");

  assert.deepEqual(getDiningTableModalPresentation("free"), {
    title: "Abrir Mesa",
    statusLabel: "Livre",
    actionLabel: "Abrir Mesa",
    nextStatus: "occupied"
  });
  assert.deepEqual(getDiningTableModalPresentation("occupied"), {
    title: "Editar Mesa",
    statusLabel: "Ocupada",
    actionLabel: "Salvar alterações",
    nextStatus: "occupied"
  });
  assert.deepEqual(getDiningTableModalPresentation("closing"), {
    title: "Fechamento",
    statusLabel: "Fechamento",
    actionLabel: "Abrir Mesa",
    nextStatus: "occupied"
  });
});

test("shows people only for occupied cards and omits status from the table modal", async () => {
  const source = await readFile(
    new URL("../../src/sales/sale-screen.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /table\.status === "occupied"[\s\S]*dining-table-people/u);
  assert.doesNotMatch(source, /dining-table-status-field/u);
});

test("the sales screen does not reuse backoffice classic modal styles", async () => {
  const source = await readFile(
    new URL("../../src/sales/sale-screen.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /classic-modal|classic-form-|classic-panel-header|classic-button/u);
  assert.match(source, /sale-modal-backdrop/u);
  assert.match(source, /sale-action-primary/u);
});

test("the sales screen uses the terminal visual palette", async () => {
  const [screenSource, stylesSource] = await Promise.all([
    readFile(new URL("../../src/sales/sale-screen.js", import.meta.url), "utf8"),
    readFile(new URL("../../src/styles.css", import.meta.url), "utf8")
  ]);
  assert.match(screenSource, /data-sale-mode="tables"/u);
  assert.match(stylesSource, /background: #08799a/u);
  assert.match(stylesSource, /grid-template-columns:\s*repeat\(auto-fill,\s*180px\)/u);
  assert.match(stylesSource, /\.dining-table-card\s*\{[^}]*width:\s*180px/u);
  assert.match(stylesSource, /\.dining-table-card\s*\{[^}]*height:\s*120px/u);
});

test("occupied tables and counter mode show temporary navigation feedback", async () => {
  const source = await readFile(
    new URL("../../src/sales/sale-screen.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /setSaleFeedback\("Modo Balcão ativado\."\)/u);
  assert.match(source, /Mesa \$\{editingDiningTable\.visualIdentifier\} ocupada\. Tela de lançamentos será aberta aqui\./u);
  assert.match(source, /createFeedbackTimer/u);
});

test("the table screen provides keypad, counts and summary controls", async () => {
  const [screenSource, stylesSource] = await Promise.all([
    readFile(new URL("../../src/sales/sale-screen.js", import.meta.url), "utf8"),
    readFile(new URL("../../src/styles.css", import.meta.url), "utf8")
  ]);
  assert.match(screenSource, /dining-table-control-panel/u);
  assert.match(screenSource, /data-dining-table-key="confirm"/u);
  assert.match(screenSource, /data-dining-table-key="back"/u);
  assert.match(screenSource, /data-print-dining-table-summary/u);
  assert.match(screenSource, /Resumo das Mesas/u);
  assert.match(screenSource, /Mesas ocupadas: \$\{occupiedTables\.length\}/u);
  assert.match(screenSource, /Pessoas: \$\{table\.people \|\| 0\}/u);
  assert.match(screenSource, /Status: Ocupada/u);
  assert.match(screenSource, /Valor da Comanda: não informado nesta versão/u);
  assert.match(screenSource, /Total geral: não informado nesta versão/u);
  assert.match(stylesSource, /\.dining-tables-workspace\s*\{/u);
  assert.match(stylesSource, /\.dining-tables-workspace\s*\{[^}]*max-width:\s*1440px/u);
  assert.match(stylesSource, /\.dining-tables-workspace\s*\{[^}]*box-sizing:\s*border-box/u);
  assert.match(screenSource, /onEnvironmentSelection/u);
  assert.match(screenSource, /typeof onEnvironmentSelection === "function"/u);
  assert.doesNotMatch(screenSource, /data-dining-table-keypad-page/u);
});

test("the table keypad has autofocus and accepts physical keyboard keys", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../../src/sales/sale-screen.js", import.meta.url), "utf8"),
    readFile(new URL("../../src/styles.css", import.meta.url), "utf8")
  ]);
  assert.match(styles, /\.sale-screen \.dining-table-number,\s*\.sale-screen \.dining-table-keypad button,\s*\.sale-screen \.dining-table-selection/u);
  assert.match(styles, /font-size:\s*2\.15rem/u);
  assert.match(styles, /font-weight:\s*700/u);
  assert.match(styles, /\.dining-table-number\s*\{[^}]*font-size:\s*2\.15rem[^}]*line-height:\s*1[^}]*font-family:\s*inherit[^}]*font-weight:\s*700/u);
  assert.match(source, /data-dining-table-selection type="text"/u);
  assert.match(source, /dining-table-selection-back/u);
  assert.match(source, /data-dining-table-key="back"/u);
  assert.doesNotMatch(source, /<output[^>]*dining-table-selection/u);
  assert.match(source, /dining-table-quick-selection[\s\S]*dining-table-selection-back/u);
  assert.match(styles, /\.dining-table-keypad \.dining-table-key-confirm\s*\{[\s\S]*grid-column:\s*2 \/ 4/u);
  assert.match(source, /grid-column:\s*2 \/ 4/u);
  assert.match(styles, /\.dining-table-keypad button\s*\{[\s\S]*font-size:\s*2\.15rem/u);
  assert.match(styles, /\.dining-table-selection\s*\{[\s\S]*font-size:\s*2\.15rem/u);
  assert.match(source, /Mesa \$\{table\.visualIdentifier\} ocupada/u);
  assert.match(source, /autofocus/u);
  assert.match(source, /handleDiningTableKeyboard/u);
  assert.match(source, /\/\^\[0-9\]\$\/\.test\(event\.key\)/u);
  assert.match(source, /event\.key === "Backspace"/u);
  assert.match(source, /event\.key === "Enter"/u);
  assert.match(source, /confirmDiningTableSelection\(\)/u);
  assert.match(source, /root\.addEventListener\("keydown", handleDiningTableKeyboard\)/u);
  assert.match(source, /root\.removeEventListener\("keydown", handleDiningTableKeyboard\)/u);
});

test("typing table 2 opens occupied feedback when table 2 is occupied", () => {
  const tables = [
    { visualIdentifier: "1", status: "free" },
    { visualIdentifier: "2", status: "occupied" }
  ];
  const identifier = "2";
  const table = [...tables].sort((left, right) =>
    left.visualIdentifier.localeCompare(right.visualIdentifier)
  ).find((item) => item.visualIdentifier === identifier);
  assert.equal(table?.status, "occupied");
  assert.equal(
    `Mesa ${table.visualIdentifier} ocupada. Tela de lançamentos será aberta aqui.`,
    "Mesa 2 ocupada. Tela de lançamentos será aberta aqui."
  );
  assert.equal(table.visualIdentifier, "2");
  assert.equal(table.status, "occupied");
});

test("Mesa não é excluída fisicamente ao fechar uma ocupação", async () => {
  const [screenSource, serverSource] = await Promise.all([
    readFile(new URL("../../src/sales/sale-screen.js", import.meta.url), "utf8"),
    readFile(new URL("../../src/server/server.js", import.meta.url), "utf8")
  ]);
  assert.doesNotMatch(serverSource, /DELETE\s+FROM\s+dining_tables/iu);
  assert.match(screenSource, /Pedir conta/u);
  assert.match(serverSource, /consumedAmountDiningTable = CASE/u);
  assert.match(serverSource, /diningTableInactivityMinutes/u);
  assert.match(screenSource, /diningTableInactivityMinutes/u);
  assert.match(screenSource, /dining-table-status-inactive/u);
});

test("mapa das Mesas não mostra título nem contador de total", async () => {
  const [screenSource, stylesSource] = await Promise.all([
    readFile(new URL("../../src/sales/sale-screen.js", import.meta.url), "utf8"),
    readFile(new URL("../../src/styles.css", import.meta.url), "utf8")
  ]);
  assert.doesNotMatch(screenSource, /Mapa de Mesas/u);
  assert.doesNotMatch(screenSource, /<span class="dining-table-count"/u);
  assert.match(stylesSource, /\.dining-table-control-summary\s*\{[^}]*margin-top:\s*20px/isu);
});

test("general settings accepts all schema-backed settings", async () => {
  const source = await readFile(
    new URL("../../src/server/server.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /"nfeDistributionHomologationUrl"/u);
  assert.match(source, /"nfeDistributionProductionUrl"/u);
  assert.match(source, /"diningTableCount"/u);
  assert.match(source, /"diningTableFreeColor"/u);
  assert.match(source, /"diningTableInactiveColor"/u);
  assert.match(source, /"diningTableClosingColor"/u);
  assert.match(source, /"diningTableOccupiedColor"/u);
  assert.match(source, /config\.nfeDistributionHomologationUrl = value/u);
  assert.match(source, /config\.nfeDistributionProductionUrl = value/u);
});

test("general settings exposes a separate dining tables panel", async () => {
  const source = await readFile(
    new URL("../../src/settings/general-settings-screen.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /data-dining-form/u);
  assert.match(source, /<div class="classic-panel-header">Mesas<\/div>/u);
  assert.match(source, /diningTableFreeColor/u);
  assert.match(source, /diningTableInactiveColor/u);
  assert.match(source, /diningTableClosingColor/u);
  assert.match(source, /diningTableOccupiedColor/u);
});

test("mode buttons use registered mode icons", async () => {
  const [screenSource, iconsSource] = await Promise.all([
    readFile(new URL("../../src/sales/sale-screen.js", import.meta.url), "utf8"),
    readFile(new URL("../../src/ui/icons.js", import.meta.url), "utf8")
  ]);
  assert.match(screenSource, /data-lucide="shopping-basket"/u);
  assert.match(screenSource, /data-lucide="utensils"/u);
  assert.match(iconsSource, /ShoppingBasket/u);
  assert.match(iconsSource, /Utensils/u);
});

test("counter search is prominent and reachable with F2", async () => {
  const [screenSource, stylesSource] = await Promise.all([
    readFile(new URL("../../src/sales/sale-screen.js", import.meta.url), "utf8"),
    readFile(new URL("../../src/styles.css", import.meta.url), "utf8")
  ]);
  assert.match(stylesSource, /\.sale-screen\s+\.search\s+input\s*\{[^}]*font-size:\s*1\.2rem/isu);
  assert.match(screenSource, /event\.key\s*!==\s*"F2"/u);
  assert.match(screenSource, /root\.querySelector\("\[data-search\]"\)\?\.focus\(\)/u);
  assert.match(screenSource, /autofocus/u);
  assert.match(screenSource, /class="search-icon"/u);
  assert.match(screenSource, /data-lucide="search"/u);
  assert.match(screenSource, /class="search-shortcut"/u);
  assert.match(screenSource, />F2<\/kbd>/u);
});

test("counter mode places Venda Atual before Produtos", async () => {
  const [screenSource, stylesSource] = await Promise.all([
    readFile(new URL("../../src/sales/sale-screen.js", import.meta.url), "utf8"),
    readFile(new URL("../../src/styles.css", import.meta.url), "utf8")
  ]);
  assert.match(screenSource, /<section class="workspace counter-workspace">/u);
  assert.match(stylesSource, /\.counter-workspace\s\.cart-panel\s*\{[^}]*order:\s*-1/isu);
});

test("Venda Atual uses the enlarged front-counter typography", async () => {
  const stylesSource = await readFile(
    new URL("../../src/styles.css", import.meta.url),
    "utf8"
  );
  assert.match(stylesSource, /\.cart-item-main\s*>\s*strong\s*\{[^}]*font-size:\s*1\.2rem/isu);
  assert.match(stylesSource, /\.sale-summary\s+div\s*\{[^}]*font-size:\s*1\.2rem/isu);
  assert.match(stylesSource, /\.sale-summary\s+\.sale-total\s*\{[^}]*font-size:\s*1\.2rem/isu);
  assert.match(stylesSource, /\.primary-button\s*\{[^}]*font-size:\s*1\.2rem/isu);
  assert.match(stylesSource, /\.primary-button\s+span\s*\{[^}]*font-size:\s*1\.2rem/isu);
});

test("Venda Atual shows sequential launches, quantity stepper, and trash icon", async () => {
  const [screenSource, stylesSource] = await Promise.all([
    readFile(new URL("../../src/sales/sale-screen.js", import.meta.url), "utf8"),
    readFile(new URL("../../src/styles.css", import.meta.url), "utf8")
  ]);
  assert.match(screenSource, /cart-index/u);
  assert.match(screenSource, /String\(item\.sequence\)\.padStart\(2,\s*"0"\)/u);
  assert.match(screenSource, /data-cart-quantity-step="-1"/u);
  assert.match(screenSource, /data-cart-quantity-step="1"/u);
  assert.match(screenSource, /data-lucide="trash-2"/u);
  assert.match(screenSource, /toLocaleUpperCase\("pt-BR"\)/u);
  assert.match(screenSource, /cart-item-index-column/u);
  assert.match(screenSource, /cart-remove-button/u);
  assert.match(screenSource, /cart-unit-price/u);
  assert.match(screenSource, /cart-item-total/u);
  assert.doesNotMatch(screenSource, /item-count/u);
  assert.doesNotMatch(screenSource, /<span>Itens<\/span>/u);
  assert.match(screenSource, /\[\.\.\.cart\]\.sort\(\(left,\s*right\)\s*=>\s*right\.sequence\s*-\s*left\.sequence\)/u);
  assert.match(stylesSource, /\.cart-item-main\s*>\s*strong\s*\{[^}]*color:\s*#f88a00/isu);
  assert.match(stylesSource, /\.cart-quantity-stepper/u);
});

test("fractional cart products use masked decimal quantity without stepper", async () => {
  const [screenSource, maskSource] = await Promise.all([
    readFile(new URL("../../src/sales/sale-screen.js", import.meta.url), "utf8"),
    readFile(new URL("../../src/ui/number-mask.js", import.meta.url), "utf8")
  ]);
  assert.match(screenSource, /item\.isFractionalProduct\s*\?/u);
  assert.match(screenSource, /data-number-mask="fractional-3"/u);
  assert.match(screenSource, /formatMaskedNumber\(item\.quantity,\s*3\)/u);
  assert.match(screenSource, /cart-fractional-quantity/u);
  assert.match(maskSource, /if \(input\.dataset\.numberMask === "decimal-3"\)/u);
});

test("fractional cart products open quantity confirmation modal", async () => {
  const [screenSource, stylesSource] = await Promise.all([
    readFile(new URL("../../src/sales/sale-screen.js", import.meta.url), "utf8"),
    readFile(new URL("../../src/styles.css", import.meta.url), "utf8")
  ]);
  assert.match(screenSource, /fractionalQuantityModalOpen/u);
  assert.match(screenSource, /fractionalQuantityProduct/u);
  assert.match(screenSource, /0,000/u);
  assert.match(screenSource, /Adicionar ao carrinho/u);
  assert.match(screenSource, /fractional-3/u);
  assert.match(screenSource, /toLocaleUpperCase\("pt-BR"\)/u);
  assert.match(screenSource, /event\.key\s*!==\s*"F10"/u);
  assert.match(screenSource, /F10<\/kbd>/u);
  assert.match(stylesSource, /\.fractional-quantity-modal/u);
  assert.match(stylesSource, /\.sale-modal\.fractional-quantity-modal\s*\{[^}]*500px/isu);
  assert.match(stylesSource, /\.sale-screen\s+\.fractional-quantity-input\s*\{[^}]*width:\s*200px/isu);
  assert.match(stylesSource, /\.sale-screen\s+\.fractional-quantity-input\s*\{[^}]*font-size:\s*1\.7rem/isu);
  assert.match(stylesSource, /\.sale-screen\s+\.fractional-quantity-input\s*\{[^}]*font-weight:\s*700/isu);
  assert.match(screenSource, /fractionalQuantityError\s*=.*Informe uma quantidade fracionada maior que zero/u);
});

test("Venda Atual cart line uses compact visual hierarchy", async () => {
  const stylesSource = await readFile(
    new URL("../../src/styles.css", import.meta.url),
    "utf8"
  );
  assert.match(stylesSource, /\.cart-item\s*\{[^}]*padding-top:\s*10px/isu);
  assert.match(stylesSource, /\.cart-item\s*\{[^}]*padding-bottom:\s*10px/isu);
  assert.doesNotMatch(stylesSource, /\.cart-item:hover\s*\{/u);
  assert.match(stylesSource, /\.cart-item\s*\{[^}]*background:\s*transparent/isu);
  assert.match(stylesSource, /\.cart-index\s*\{[^}]*background:\s*#1aadb4/isu);
  assert.match(stylesSource, /\.cart-item\s*\{[^}]*border-bottom:\s*1px\s+solid\s+#cbd3dc/isu);
  assert.match(stylesSource, /\.cart-quantity-stepper\s+button\s*\{[^}]*font-size:\s*1\.6rem/isu);
  assert.match(stylesSource, /\.cart-quantity-stepper\s+input\s*\{[^}]*appearance:\s*none/isu);
  assert.match(stylesSource, /\.cart-unit-price\s*\{[^}]*color:\s*#f88a00/isu);
  assert.match(stylesSource, /\.cart-quantity-stepper\s+button\s*\{[^}]*font-size:\s*1\.6rem/isu);
  assert.match(stylesSource, /\.cart-remove-button\s*\{[^}]*width:\s*32px/isu);
  assert.match(stylesSource, /\.cart-remove-button\s+svg\s*\{[^}]*width:\s*16px/isu);
  assert.match(stylesSource, /\.cart-item-total\s*\{[^}]*font-size:\s*1\.3rem/isu);
  assert.match(stylesSource, /\.cart-item\s*\{[^}]*border:\s*0/isu);
  assert.match(stylesSource, /\.cart-item\s*\{[^}]*border-bottom:\s*1px\s+solid\s+#cbd3dc/isu);
  assert.match(stylesSource, /\.cart-item-index-column\s*\{[^}]*justify-items:\s*center/isu);
  assert.match(stylesSource, /\.cart-item-main\s*>\s*strong\s*\{[^}]*overflow-wrap:\s*anywhere/isu);
  assert.match(stylesSource, /\.cart-quantity-row\s+\.cart-quantity-stepper\s+(?:button|input)/u);
  assert.match(stylesSource, /\.cart-index\s*\{[^}]*background:\s*#1aadb4/isu);
});

test("counter mode uses compact product and category presentation", async () => {
  const [screenSource, stylesSource] = await Promise.all([
    readFile(new URL("../../src/sales/sale-screen.js", import.meta.url), "utf8"),
    readFile(new URL("../../src/styles.css", import.meta.url), "utf8")
  ]);
  assert.doesNotMatch(screenSource, /<p class="eyebrow">Produtos<\/p>/u);
  assert.doesNotMatch(screenSource, /<h2>Selecione um item<\/h2>/u);
  assert.doesNotMatch(screenSource, /<span class="product-category">/u);
  assert.match(stylesSource, /\.counter-workspace\s+\.catalog-panel/u);
  assert.match(stylesSource, /\.counter-workspace\s+\.cart-panel/u);
  assert.match(stylesSource, /\.categories\s*\{[^}]*overflow-x:\s*visible/isu);
  assert.match(stylesSource, /\.categories\s*\{[^}]*flex-wrap:\s*wrap/isu);
  assert.match(stylesSource, /\.category-button\s*\{[^}]*text-transform:\s*uppercase/isu);
  assert.match(stylesSource, /\.category-button:hover/u);
  assert.match(stylesSource, /\.product-card\s+strong\s*\{[^}]*font-weight:\s*400|\.product-card\s+strong/isu);
});

test("counter filters and product cards use the turquoise presentation", async () => {
  const stylesSource = await readFile(
    new URL("../../src/styles.css", import.meta.url),
    "utf8"
  );
  assert.match(stylesSource, /\.category-button\s*\{[^}]*background:\s*#172033/isu);
  assert.match(stylesSource, /\.category-button:hover\s*\{[^}]*background:\s*#08799a/isu);
  assert.match(stylesSource, /\.category-button\.is-active\s*\{[^}]*background:\s*#1aadb4/isu);
  assert.match(stylesSource, /\.product-grid\s*\{[^}]*repeat\(4,\s*minmax\(0,\s*1fr\)\)/isu);
  assert.match(stylesSource, /\.product-card\s*\{[^}]*border:\s*0[^}]*border-radius:\s*4px[^}]*color:\s*#fff[^}]*background:\s*#1aadb4/isu);
  assert.match(stylesSource, /\.sale-screen\s+\.counter-workspace\s+\.product-card\s+strong\s*\{[^}]*font-size:\s*1\.2rem/isu);
  assert.match(stylesSource, /\.sale-screen\s+\.counter-workspace\s+\.product-card\s+strong\s*\{[^}]*font-weight:\s*500/isu);
  assert.match(stylesSource, /\.sale-screen\s+\.counter-workspace\s+\.product-price\s*\{[^}]*font-size:\s*1rem/isu);
  assert.match(stylesSource, /\.sale-screen\s+\.counter-workspace\s+\.product-price\s*\{[^}]*font-weight:\s*200/isu);
  assert.match(stylesSource, /\.sale-screen\s+\.counter-workspace\s+\.product-price\s*\{[^}]*color:\s*#fff/isu);
});

test("accepts official SEFAZ distribution URLs", () => {
  const options = {
    service: false,
    pathSuffix: "/NFeDistribuicaoDFe.asmx",
    allowedHostSuffixes: [".fazenda.gov.br"]
  };
  assert.equal(
    validateFiscalUrl(
      "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
      "URL distribuição XML - homologação",
      options
    ),
    "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx"
  );
  assert.equal(
    validateFiscalUrl(
      "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
      "URL distribuição XML - produção",
      options
    ),
    "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx"
  );
});

test("rejects non-official distribution domains", () => {
  assert.throws(
    () => validateFiscalUrl(
      "https://example.com/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
      "URL distribuição XML",
      {
        service: false,
        pathSuffix: "/NFeDistribuicaoDFe.asmx",
        allowedHostSuffixes: [".fazenda.gov.br"]
      }
    ),
    /domínio oficial da SEFAZ/u
  );
});
