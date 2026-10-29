export const normalizeNavigationKey = (value) => String(value ?? "").trim().toLowerCase();

export const isNavigationKey = (value, expectedKey) =>
  normalizeNavigationKey(value) === normalizeNavigationKey(expectedKey);

const fallbackMenu = (idNavigationMenu, keyNavigationMenu, labelNavigationMenu, orderNavigationMenu) => ({
  idNavigationMenu,
  keyNavigationMenu,
  labelNavigationMenu,
  orderNavigationMenu,
  isActiveNavigationMenu: 1
});

const fallbackItem = (
  idNavigationItem,
  idNavigationMenu,
  keyNavigationItem,
  labelNavigationItem,
  orderNavigationItem,
  { idParentNavigationItem = null, typeNavigationItem = "item", routeNavigationItem = keyNavigationItem } = {}
) => ({
  idNavigationItem,
  idNavigationMenu,
  idParentNavigationItem,
  typeNavigationItem,
  keyNavigationItem,
  labelNavigationItem,
  routeNavigationItem,
  descriptionNavigationItem: null,
  orderNavigationItem,
  isActiveNavigationItem: 1,
  showsInBackofficeHomeNavigationItem: 0
});

export const getFallbackNavigation = () => {
  const menus = [
    fallbackMenu(-1, "cadastros", "Cadastros", 1),
    fallbackMenu(-2, "tools", "Ferramentas", 2),
    fallbackMenu(-3, "settings", "Configurações", 3)
  ];
  const items = [
    fallbackItem(-1, -1, "products", "Produtos", 1, { routeNavigationItem: null }),
    fallbackItem(-2, -1, "finished-goods", "Mercadoria para Revenda", 1, {
      idParentNavigationItem: -1,
      typeNavigationItem: "bar"
    }),
    fallbackItem(-3, -1, "finished-products", "Produtos Acabados", 2, {
      idParentNavigationItem: -1,
      typeNavigationItem: "bar"
    }),
    ...[
      ["classes", "Classes", 3, -1],
      ["groups", "Grupos", 4, -1],
      ["product-types", "Tipos de produto", 5, -1],
      ["units", "Unidades", 6, -1],
      ["ncm-cest", "NCM / CEST", 7, -1],
    ].map(([key, label, order, menuId], index) =>
      fallbackItem(-(index + 4), menuId, key, label, order, {
        idParentNavigationItem: -1,
        typeNavigationItem: "bar"
      })
    ),
    ...[
      ["fiscal-operations", "Operações fiscais", 7, -1],
      ["payment-methods", "Formas de pagamento", 8, -1],
      ["company", "Dados da empresa", 9, -1],
      ["thermal-print", "Impressão térmica", 1, -2],
      ["api-status", "Status da API", 2, -2],
      ["nfce-query", "Consulta de NFC-e", 3, -2],
      ["import-catalogs", "Importar cadastros", 4, -2],
      ["settings", "Impressoras", 1, -3],
      ["general-settings", "Configurações gerais", 2, -3]
    ].map(([key, label, order, menuId], index) =>
      fallbackItem(-(index + 9), menuId, key, label, order)
    )
  ];
  return { menus, items };
};

const dedupeNavigationEntries = (entries, keyGetter, labelGetter, routeGetter = () => "") => {
  const seen = new Set();
  const unique = [];

  for (const entry of entries) {
    const aliases = [
      normalizeNavigationKey(keyGetter(entry)),
      normalizeNavigationKey(labelGetter(entry)),
      normalizeNavigationKey(routeGetter(entry))
    ].filter(Boolean);

    if (!aliases.length) {
      const fallback = String(entry?.idNavigationMenu ?? entry?.idNavigationItem ?? "");
      if (seen.has(fallback)) continue;
      seen.add(fallback);
      unique.push(entry);
      continue;
    }

    const overlapping = aliases.find((alias) => seen.has(alias));
    if (overlapping) continue;

    for (const alias of aliases) seen.add(alias);
    unique.push(entry);
  }

  return unique;
};

export const ensureCoreNavigationSeed = (payload = {}) => {
  const menus = dedupeNavigationEntries(
    Array.isArray(payload.menus) ? [...payload.menus] : [],
    (menu) => menu?.keyNavigationMenu,
    (menu) => menu?.labelNavigationMenu
  );
  const items = dedupeNavigationEntries(
    Array.isArray(payload.items) ? [...payload.items] : [],
    (item) => item?.keyNavigationItem,
    (item) => item?.labelNavigationItem,
    (item) => item?.routeNavigationItem
  );

  const findMatchingMenu = (menu) => {
    const candidateKey = normalizeNavigationKey(menu?.keyNavigationMenu || "");
    const candidateLabel = normalizeNavigationKey(menu?.labelNavigationMenu || "");
    return menus.find((entry) => {
      const entryKey = normalizeNavigationKey(entry?.keyNavigationMenu || "");
      const entryLabel = normalizeNavigationKey(entry?.labelNavigationMenu || "");
      return entryKey === candidateKey
        || entryLabel === candidateLabel
        || (entryKey === "cadastros" && candidateLabel === "cadastros")
        || (entryLabel === "cadastros" && candidateKey === "cadastros");
    });
  };

  let cadastrosMenu = findMatchingMenu({ keyNavigationMenu: "cadastros", labelNavigationMenu: "Cadastros" });
  if (!cadastrosMenu) {
    cadastrosMenu = {
      idNavigationMenu: Number.MAX_SAFE_INTEGER - 1,
      keyNavigationMenu: "cadastros",
      labelNavigationMenu: "Cadastros",
      orderNavigationMenu: (Math.max(...menus.map((menu) => Number(menu?.orderNavigationMenu || 0)), 0) + 1) || 1,
      isActiveNavigationMenu: 1
    };
    menus.push(cadastrosMenu);
  }

  return { menus, items };
};
