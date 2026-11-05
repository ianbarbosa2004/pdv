export const normalizeNavigationKey = (value) => String(value ?? "").trim().toLowerCase();

export const isNavigationKey = (value, expectedKey) =>
  normalizeNavigationKey(value) === normalizeNavigationKey(expectedKey);

const menu = (key, label, order) => ({
  keyNavigationMenu: key,
  labelNavigationMenu: label,
  orderNavigationMenu: order,
  isActiveNavigationMenu: 1
});

const item = (menuKey, key, label, route, order, parentKey = null, type = "item", description = null) => ({
  menuKey,
  keyNavigationItem: key,
  labelNavigationItem: label,
  routeNavigationItem: route,
  orderNavigationItem: order,
  parentKey,
  typeNavigationItem: type,
  descriptionNavigationItem: description,
  isActiveNavigationItem: 1,
  showsInBackofficeHomeNavigationItem: 0
});

export const DEFAULT_NAVIGATION = Object.freeze({
  menus: [
    menu("sales", "Frente de Caixa", 0),
    menu("cadastros", "Cadastros", 1),
    menu("settings", "Configurações", 2),
    menu("tools", "Ferramentas", 3),
    menu("exit", "Sair", 65535)
  ],
  items: [
    item("cadastros", "products", "Produtos", null, 1),
    item("cadastros", "finished-goods", "Mercadoria para Revenda", "finished-goods", 1, "products", "bar"),
    item("cadastros", "finished-products", "Produtos Acabados", "finished-products", 2, "products", "bar"),
    item("cadastros", "raw-materials", "Matérias-primas", "raw-materials", 3, "products", "bar"),
    item("cadastros", "packaging", "Embalagem", "packaging", 4, "products", "bar"),
    item("cadastros", "consumables", "Material de Uso e Consumo", "consumables", 5, "products", "bar"),
    item("cadastros", "product-types", "Tipo de Produto", "product-types", 6, "products", "bar"),
    item("cadastros", "units", "Unidade tributável", "units", 7, "products", "bar"),
    item("cadastros", "classes", "Classes", "classes", 8, "products", "bar"),
    item("cadastros", "groups", "Grupos", "groups", 9, "products", "bar"),
    item("cadastros", "ncm-cest", "NCM / CEST", "ncm-cest", 10, "products", "bar"),
    item("cadastros", "technical-sheet", "Ficha Técnica", "culinary-units", 11),
    item("cadastros", "recipes", "Receitas e Composições", "recipes", 1, "technical-sheet", "bar", "Cadastre Receitas de Produção e Composições de Produto com seus componentes, perdas e custos."),
    item("cadastros", "culinary-units", "Unidades Culinárias", "culinary-units", 2, "technical-sheet", "bar"),
    item("cadastros", "physical-states", "Estados Físicos", "physical-states", 3, "technical-sheet", "bar"),
    item("cadastros", "culinary-conversions", "Conversões", "culinary-conversions", 4, "technical-sheet", "bar"),
    item("cadastros", "fiscal-operations", "Operações Fiscais", "fiscal-operations", 6),
    item(
      "cadastros",
      "fiscal-operations-context",
      "Operações Fiscais",
      "fiscal-operations",
      1,
      "fiscal-operations",
      "bar"
    ),
    item("cadastros", "cfops", "CFOP", "cfops", 2, "fiscal-operations", "bar"),
    item("cadastros", "tax-situations", "CST / CSOSN", "tax-situations", 3, "fiscal-operations", "bar"),
    item("cadastros", "icms-rates", "Alíquotas ICMS", "icms-rates", 4, "fiscal-operations", "bar"),
    item("cadastros", "tax-regimes", "Regimes", "tax-regimes", 5, "fiscal-operations", "bar"),
    item("cadastros", "operation-types", "Tipos", "operation-types", 6, "fiscal-operations", "bar"),
    item("cadastros", "contexts", "Contextos", "contexts", 7, "fiscal-operations", "bar"),
    item("cadastros", "origins", "Origens", "origins", 8, "fiscal-operations", "bar"),
    item("cadastros", "ipi-situations", "IPI", "ipi-situations", 9, "fiscal-operations", "bar"),
    item("cadastros", "contribution-situations", "PIS / COFINS", "contribution-situations", 10, "fiscal-operations", "bar"),
    item("cadastros", "base-modes", "Bases", "base-modes", 11, "fiscal-operations", "bar"),
    item("cadastros", "exemption-reasons", "Desoneração", "exemption-reasons", 12, "fiscal-operations", "bar"),
    item("cadastros", "financial", "Financeiros", "financial", 3),
    item("cadastros", "payment-methods", "Formas de pagamento", "payment-methods", 1, "financial", "bar"),
    item("cadastros", "suppliers", "Fornecedores", "suppliers", 4, null, "bar", "Cadastre e consulte fornecedores, contatos e dados fiscais usados nas compras e no estoque."),
    item("cadastros", "customers", "Clientes", "customers", 5, null, "bar", "Cadastre e consulte clientes para identificar vendas, contatos e condições comerciais."),
    item("cadastros", "consumers", "Consumidores", "consumers", 6, null, "bar", "Cadastre e consulte consumidores para identificar atendimentos e vínculos com clientes."),
    item("settings", "settings", "Impressoras", "settings", 1, null, "bar", "Defina as impressoras padrão usadas pelo PDV em cupons, comprovantes e relatórios."),
    item("settings", "general-settings", "Configurações Gerais", "general-settings", 2, null, "bar", "Defina regras gerais de funcionamento compartilhadas por todos os terminais do PDV."),
    item("settings", "company", "Dados da Empresa", "company", 3, null, "bar", "Informe os dados cadastrais e a identidade visual usados pelo PDV e pelos documentos fiscais."),
    item("settings", "nfce", "NFC-e", "nfce", 4, null, "bar", "Defina os parâmetros fiscais e o certificado usados para emissão de NFC-e."),
    item("settings", "navigation-builder", "Construtor de navegação", "navigation-builder", 5, null, "bar", "Edite menus, itens, submenus, divisores, rotas e ordens da navegação persistida do PDV."),
    item("tools", "ncm-cest-update", "Atualizar NCM / CEST", "ncm-cest-update", 1, null, "bar", "Atualize os catálogos fiscais oficiais usados nas consultas e validações do PDV."),
    item("tools", "api-status", "Status da API", "api-status", 2, null, "bar", "Consulte a disponibilidade do servidor do PDV e da conexão com o MariaDB."),
    item("tools", "thermal-print", "Impressão térmica", "thermal-print", 3, null, "bar", "Configure a montagem e a impressão local dos comprovantes do PDV."),
    item("tools", "nfce-query", "Consulta de NFC-e", "nfce-query", 4, null, "bar", "Confira os dados exibidos pelo portal oficial antes de usar a nota em uma futura entrada de compras."),
    item("tools", "import-catalogs", "Importar cadastros", "import-catalogs", 5, null, "bar", "Use o modelo CSV para validar e importar produtos em lote."),
    item("tools", "backup", "Backup e restauração", "backup", 6, null, "bar", "Crie, baixe e restaure cópias compactadas do banco de dados."),
    item("tools", "views", "Views", null, 7, null, "item", "Consulte e trate listas operacionais de produtos com filtros específicos."),
    item("tools", "groups-products", "Grupos x Produtos", "groups-products", 1, "views", "bar", "Organize, pesquise e mantenha os produtos por classe e grupo."),
    item("tools", "no-cost", "Sem Custo", "no-cost", 2, "views", "bar", "Localize produtos ativos sem preço de custo informado."),
    item("tools", "no-physical-state", "Sem Estado Físico", "no-physical-state", 3, "views", "bar", "Localize matérias-primas sem estado físico definido para conversões culinárias."),
    item("tools", "recipe-revisions", "Revisões de Fichas", "recipe-revisions", 4, "views", "bar", "Consulte estruturas de Receita e Composição marcadas para revisão.")
  ]
});

const clone = (value) => JSON.parse(JSON.stringify(value));

export const normalizePersistedNavigation = (navigation) => ({
  menus: Array.isArray(navigation?.menus) ? navigation.menus.map((menu) => ({ ...menu })) : [],
  items: Array.isArray(navigation?.items) ? navigation.items.map((item) => ({ ...item })) : []
});

const matches = (entry, definition) =>
  normalizeNavigationKey(entry.keyNavigationItem) === normalizeNavigationKey(definition.keyNavigationItem)
  || normalizeNavigationKey(entry.labelNavigationItem) === normalizeNavigationKey(definition.labelNavigationItem)
  || (!entry.keyNavigationItem && !entry.labelNavigationItem && definition.routeNavigationItem
    && normalizeNavigationKey(entry.routeNavigationItem) === normalizeNavigationKey(definition.routeNavigationItem));

export const mergeNavigationDefaults = (navigation) => {
  const persistedMenus = Array.isArray(navigation?.menus) ? navigation.menus : [];
  const persistedItems = Array.isArray(navigation?.items) ? navigation.items : [];
  const menus = [];
  const items = [];
  const menuIds = new Map();
  const itemIds = new Map();
  const consumedPersistedMenus = new Set();
  const consumedPersistedItems = new Set();

  for (const definition of DEFAULT_NAVIGATION.menus) {
    const persistedIndex = persistedMenus.findIndex((entry, index) =>
      !consumedPersistedMenus.has(index)
      && (
      normalizeNavigationKey(entry.keyNavigationMenu) === definition.keyNavigationMenu
      || normalizeNavigationKey(entry.labelNavigationMenu) === normalizeNavigationKey(definition.labelNavigationMenu)
      )
    );
    const persisted = persistedIndex >= 0 ? persistedMenus[persistedIndex] : null;
    if (persistedIndex >= 0) consumedPersistedMenus.add(persistedIndex);
    const merged = {
      ...clone(definition),
      ...(persisted || {}),
      keyNavigationMenu: definition.keyNavigationMenu,
      idNavigationMenu: persisted?.idNavigationMenu || `default-menu-${definition.keyNavigationMenu}`
    };
    if (definition.keyNavigationMenu === "sales" || definition.keyNavigationMenu === "exit") {
      merged.labelNavigationMenu = definition.keyNavigationMenu === "sales"
        ? "Frente de Caixa"
        : "Sair";
      merged.orderNavigationMenu = definition.keyNavigationMenu === "sales" ? 0 : 65535;
      merged.isActiveNavigationMenu = 1;
    }
    menus.push(merged);
    menuIds.set(definition.keyNavigationMenu, merged.idNavigationMenu);
  }

  for (const [index, entry] of persistedMenus.entries()) {
    if (consumedPersistedMenus.has(index)) continue;
    menus.push({ ...entry });
  }

  for (const definition of DEFAULT_NAVIGATION.items) {
    const menuId = menuIds.get(definition.menuKey);
    const findPersistedIndex = (matcher) => persistedItems.findIndex((entry, index) =>
      !consumedPersistedItems.has(index) && matcher(entry)
    );
    const canonical = (entry) =>
      normalizeNavigationKey(entry.keyNavigationItem) === normalizeNavigationKey(definition.keyNavigationItem);
    const sameMenu = (entry) => String(entry.idNavigationMenu) === String(menuId);
    const persistedIndex = findPersistedIndex((entry) => sameMenu(entry) && canonical(entry));
    const movedPersistedIndex = persistedIndex >= 0
      ? persistedIndex
      : findPersistedIndex(canonical);
    const legacyPersistedIndex = movedPersistedIndex >= 0
      ? movedPersistedIndex
      : findPersistedIndex((entry) => sameMenu(entry) && matches(entry, definition));
    const fallbackPersistedIndex = legacyPersistedIndex >= 0
      ? legacyPersistedIndex
      : findPersistedIndex((entry) => matches(entry, definition));
    const persisted = fallbackPersistedIndex >= 0 ? persistedItems[fallbackPersistedIndex] : null;
    if (fallbackPersistedIndex >= 0) consumedPersistedItems.add(fallbackPersistedIndex);
    const defaultParentId = definition.parentKey
      ? itemIds.get(`${definition.menuKey}:${definition.parentKey}`)
      : null;
    const hasCanonicalIdentity = persisted
      && normalizeNavigationKey(persisted.keyNavigationItem) === normalizeNavigationKey(definition.keyNavigationItem);
    const hasPersistedParent = hasCanonicalIdentity
      && Object.hasOwn(persisted, "idParentNavigationItem");
    const hasPersistedMenu = hasCanonicalIdentity
      && Object.hasOwn(persisted, "idNavigationMenu");
    const merged = {
      ...clone(definition),
      ...(persisted || {}),
      idNavigationMenu: hasPersistedMenu ? persisted.idNavigationMenu : menuId,
      idParentNavigationItem: hasPersistedParent
        ? persisted.idParentNavigationItem
        : defaultParentId,
      keyNavigationItem: definition.keyNavigationItem,
      routeNavigationItem: persisted?.routeNavigationItem || definition.routeNavigationItem,
      idNavigationItem: persisted?.idNavigationItem || `default-item-${definition.menuKey}-${definition.keyNavigationItem}-${definition.orderNavigationItem}`
    };
    items.push(merged);
    itemIds.set(`${definition.menuKey}:${definition.keyNavigationItem}`, merged.idNavigationItem);
  }

  const defaultDefinitions = DEFAULT_NAVIGATION.items;
  for (const [index, entry] of persistedItems.entries()) {
    if (consumedPersistedItems.has(index)) continue;
    if (defaultDefinitions.some((definition) =>
      normalizeNavigationKey(entry.keyNavigationItem) === normalizeNavigationKey(definition.keyNavigationItem)
    )) continue;
    if (defaultDefinitions.some((definition) => {
      const menuMatches = !entry.idNavigationMenu
        || String(entry.idNavigationMenu) === String(menuIds.get(definition.menuKey));
      const parentId = definition.parentKey ? itemIds.get(`${definition.menuKey}:${definition.parentKey}`) : null;
      const parentMatches = String(entry.idParentNavigationItem ?? "") === String(parentId ?? "");
      return menuMatches
        && parentMatches
        && normalizeNavigationKey(entry.keyNavigationItem) === normalizeNavigationKey(definition.keyNavigationItem);
    })) continue;
    items.push({ ...entry });
  }

  return { menus, items };
};

export const buildFallbackNavigation = mergeNavigationDefaults;
export const ensureApiStatusNavigation = buildFallbackNavigation;
