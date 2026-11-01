export const normalizeNavigationKey = (value) => String(value ?? "").trim().toLowerCase();

export const isNavigationKey = (value, expectedKey) =>
  normalizeNavigationKey(value) === normalizeNavigationKey(expectedKey);

const menu = (key, label, order) => ({
  keyNavigationMenu: key,
  labelNavigationMenu: label,
  orderNavigationMenu: order,
  isActiveNavigationMenu: 1
});

const item = (menuKey, key, label, route, order, parentKey = null, type = "item") => ({
  menuKey,
  keyNavigationItem: key,
  labelNavigationItem: label,
  routeNavigationItem: route,
  orderNavigationItem: order,
  parentKey,
  typeNavigationItem: type,
  descriptionNavigationItem: null,
  isActiveNavigationItem: 1,
  showsInBackofficeHomeNavigationItem: 0
});

export const DEFAULT_NAVIGATION = Object.freeze({
  menus: [
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
    item("cadastros", "fiscal-operations", "Operações Fiscais", "fiscal-operations", 2),
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
    item("cadastros", "suppliers", "Fornecedores", "suppliers", 4),
    item("cadastros", "customers", "Clientes", "customers", 5),
    item("cadastros", "consumers", "Consumidores", "consumers", 6),
    item("settings", "settings", "Impressoras", "settings", 1),
    item("settings", "general-settings", "Configurações Gerais", "general-settings", 2),
    item("settings", "company", "Dados da Empresa", "company", 3),
    item("settings", "nfce", "NFC-e", "nfce", 4),
    item("settings", "navigation-builder", "Construtor de navegação", "navigation-builder", 5),
    item("tools", "ncm-cest-update", "Atualizar NCM / CEST", "ncm-cest-update", 1),
    item("tools", "api-status", "Status da API", "api-status", 2),
    item("tools", "thermal-print", "Impressão térmica", "thermal-print", 3),
    item("tools", "nfce-query", "Consulta de NFC-e", "nfce-query", 4),
    item("tools", "import-catalogs", "Importar cadastros", "import-catalogs", 5),
    item("tools", "backup", "Backup e restauração", "backup", 6)
  ]
});

const clone = (value) => JSON.parse(JSON.stringify(value));

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
  const consumedPersistedItems = new Set();

  for (const definition of DEFAULT_NAVIGATION.menus) {
    const persisted = persistedMenus.find((entry) =>
      normalizeNavigationKey(entry.keyNavigationMenu) === definition.keyNavigationMenu
      || normalizeNavigationKey(entry.labelNavigationMenu) === normalizeNavigationKey(definition.labelNavigationMenu)
    );
    const merged = {
      ...clone(definition),
      ...(persisted || {}),
      keyNavigationMenu: definition.keyNavigationMenu,
      idNavigationMenu: persisted?.idNavigationMenu || `default-menu-${definition.keyNavigationMenu}`
    };
    if (definition.keyNavigationMenu === "exit") {
      merged.labelNavigationMenu = "Sair";
      merged.orderNavigationMenu = 65535;
      merged.isActiveNavigationMenu = 1;
    }
    menus.push(merged);
    menuIds.set(definition.keyNavigationMenu, merged.idNavigationMenu);
  }

  for (const definition of DEFAULT_NAVIGATION.items) {
    const menuId = menuIds.get(definition.menuKey);
    const persistedIndex = persistedItems.findIndex((entry, index) =>
      !consumedPersistedItems.has(index)
      && String(entry.idNavigationMenu) === String(menuId)
      && matches(entry, definition)
    );
    const fallbackPersistedIndex = persistedIndex >= 0
      ? persistedIndex
      : persistedItems.findIndex((entry, index) =>
        !consumedPersistedItems.has(index) && matches(entry, definition)
      );
    const persisted = fallbackPersistedIndex >= 0 ? persistedItems[fallbackPersistedIndex] : null;
    if (fallbackPersistedIndex >= 0) consumedPersistedItems.add(fallbackPersistedIndex);
    const parentId = definition.parentKey ? itemIds.get(`${definition.menuKey}:${definition.parentKey}`) : null;
    const merged = {
      ...clone(definition),
      ...(persisted || {}),
      idNavigationMenu: menuId,
      idParentNavigationItem: parentId,
      keyNavigationItem: definition.keyNavigationItem,
      routeNavigationItem: definition.routeNavigationItem,
      typeNavigationItem: definition.typeNavigationItem,
      idNavigationItem: persisted?.idNavigationItem || `default-item-${definition.menuKey}-${definition.keyNavigationItem}-${definition.orderNavigationItem}`
    };
    items.push(merged);
    itemIds.set(`${definition.menuKey}:${definition.keyNavigationItem}`, merged.idNavigationItem);
  }

  const defaultDefinitions = DEFAULT_NAVIGATION.items;
  for (const [index, entry] of persistedItems.entries()) {
    if (consumedPersistedItems.has(index)) continue;
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

export const ensureApiStatusNavigation = mergeNavigationDefaults;
