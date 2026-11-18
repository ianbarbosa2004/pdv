import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  calculateCmvPrice,
  calculateMarginMetrics,
  calculateTargetPrice,
  classifyMargin,
  matchesMarginFilters,
  resolveEffectiveBalancer
} from "../../src/shared/margin.js";

test("calcula as quatro métricas independentemente", () => {
  const metrics = calculateMarginMetrics({ cost: 60, price: 100 });
  assert.equal(metrics.grossMargin, 40);
  assert.equal(metrics.markup, 66.66666666666666);
  assert.equal(metrics.profit, 40);
  assert.equal(metrics.cmv, 60);
});

test("trata custo ou preço zero sem quebrar as demais métricas", () => {
  assert.deepEqual(calculateMarginMetrics({ cost: 0, price: 100 }), {
    grossMargin: 100,
    markup: null,
    profit: 100,
    cmv: 0
  });
  assert.equal(calculateMarginMetrics({ cost: 60, price: 0 }).grossMargin, null);
  assert.equal(calculateCmvPrice({ cost: 60, cmv: 0 }), null);
});

test("resolve o balizador efetivo somente por Grupo", () => {
  const inherited = resolveEffectiveBalancer({
    groupMinimum: 30,
    groupTarget: 40
  });
  assert.deepEqual(inherited, {
    minimum: { value: 30, origin: "group" },
    target: { value: 40, origin: "group" }
  });

  const withDefaults = resolveEffectiveBalancer({
    groupMinimum: 0,
    groupTarget: 0
  });
  assert.deepEqual(withDefaults.minimum, { value: 0, origin: "group" });
  assert.deepEqual(withDefaults.target, { value: 0, origin: "group" });
});

test("classifica vermelho, amarelo e verde pelos limites internos", () => {
  assert.equal(classifyMargin({ grossMargin: 29.999, minimum: 30, target: 40 }), "red");
  assert.equal(classifyMargin({ grossMargin: 35, minimum: 30, target: 40 }), "yellow");
  assert.equal(classifyMargin({ grossMargin: 40, minimum: 30, target: 40 }), "green");
});

test("calcula preço sugerido por margem alvo e por novo CMV", () => {
  assert.equal(calculateTargetPrice({ cost: 60, targetMargin: 40 }), 100);
  assert.equal(calculateCmvPrice({ cost: 60, cmv: 60 }), 100);
  assert.equal(calculateCmvPrice({ cost: 60, cmv: 30 }), 200);
});

test("combina pesquisa e Grupo com E e cores com OU", () => {
  const product = {
    idGroup: 2,
    nameProduct: "Cerveja",
    pdvCodeProduct: "42",
    marginState: "yellow"
  };
  assert.equal(matchesMarginFilters({
    searchTerm: "cerve",
    groupId: "2",
    selectedStates: ["red", "yellow"],
    product
  }), true);
  assert.equal(matchesMarginFilters({
    searchTerm: "água",
    groupId: "2",
    selectedStates: ["yellow"],
    product
  }), false);
  assert.equal(matchesMarginFilters({
    searchTerm: "",
    groupId: "3",
    selectedStates: ["yellow"],
    product
  }), false);
});

test("inclui Margem na navegação padrão e na barra contextual", async () => {
  const [navigationSource, marginSource] = await Promise.all([
    readFile("src/shared/navigation-defaults.js", "utf8"),
    readFile("src/tools/margin-screen.js", "utf8")
  ]);

  assert.match(navigationSource, /item\("tools", "margin", "Margem", "margin",/u);
  assert.match(marginSource, /renderContextualNavigationItems/u);
  assert.match(marginSource, /\["margin", "Margem"\]/u);
  assert.match(marginSource, /resolveNavigationHandler/u);
});

test("Margem usa painéis inline e histórico sem painéis de modal", async () => {
  const marginSource = await readFile("src/tools/margin-screen.js", "utf8");

  assert.match(marginSource, /data-margin-inline-view/u);
  assert.match(marginSource, /data-margin-inline-history/u);
  assert.match(marginSource, /title="Simular"/u);
  assert.match(marginSource, /data-lucide="dollar-sign"/u);
  assert.match(marginSource, /title="Histórico"/u);
  assert.match(marginSource, /data-lucide="chart-column"/u);
  assert.doesNotMatch(marginSource, /data-margin-view-backdrop|data-margin-history-backdrop/u);
  assert.match(marginSource, /formatSnapshotDate/u);
  assert.match(marginSource, /formatMarginState/u);
});

test("Margem oferece feedback, filtros, ordenação e foco no CMV", async () => {
  const marginSource = await readFile("src/tools/margin-screen.js", "utf8");

  assert.match(marginSource, /renderSuccessFeedback/u);
  assert.match(marginSource, /Preço atualizado pelo CMV/u);
  assert.match(marginSource, /requestAnimationFrame/u);
  assert.match(marginSource, /root\.querySelector\("\[data-margin-cmv\]"\)[\s\S]*\.focus/u);
  assert.match(marginSource, /buildViewsGroupTree/u);
  assert.match(marginSource, /Classe - Grupo/u);
  assert.match(marginSource, /margin-list-filter-bar/u);
  assert.match(marginSource, /data-margin-filter-group-select/u);
  assert.match(marginSource, /Todos os grupos/u);
  assert.match(marginSource, /Filtrar produtos por grupo/u);
  assert.match(marginSource, /data-margin-state="red"/u);
  assert.match(marginSource, /data-margin-state="yellow"/u);
  assert.match(marginSource, /data-margin-state="green"/u);
  assert.match(marginSource, /data-margin-sort/u);
  assert.match(marginSource, /renderMarginStateBadge/u);
});

test("Margem identifica Simular e limita o histórico a cinco snapshots únicos", async () => {
  const marginSource = await readFile("src/tools/margin-screen.js", "utf8");

  assert.match(marginSource, /title="Simular"/u);
  assert.match(marginSource, /aria-label="Simular margem/u);
  assert.match(marginSource, /data-lucide="dollar-sign"/u);
  assert.match(marginSource, /\.slice\(0, 5\)/u);
  assert.doesNotMatch(marginSource, /title="View"/u);
});

test("Margem usa tamanho padrão da árvore e ordem Status-Grupo-Busca", async () => {
  const [marginSource, stylesSource] = await Promise.all([
    readFile("src/tools/margin-screen.js", "utf8"),
    readFile("src/styles.css", "utf8")
  ]);
  const statusIndex = marginSource.indexOf('class="margin-status-filter"');
  const groupIndex = marginSource.indexOf('class="margin-group-select"');
  const searchIndex = marginSource.indexOf('class="classic-list-search"');

  assert.ok(statusIndex >= 0 && statusIndex < groupIndex && groupIndex < searchIndex);
  assert.doesNotMatch(stylesSource, /\.margin-content\s+\.(?:views-tree-item)[^{]*\{[^}]*font-size/u);
  assert.match(stylesSource, /\.views-tree-item\s*\{[^}]*font-size:\s*0\.78rem/u);
  assert.match(stylesSource, /\.margin-list-filter-bar\s*\{[^}]*gap:\s*16px/u);
});
