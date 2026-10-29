const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const normalizeNavigationValue = (value) =>
  String(value ?? "").trim().toLocaleLowerCase("pt-BR");

const isActive = (item) =>
  Number(item?.isActiveNavigationItem) !== 0
  && item?.routeNavigationItem;

export const selectContextualNavigationItems = (navigation, parentKey, fallbackItems) => {
  const items = Array.isArray(navigation?.items) ? navigation.items : [];
  const normalizedParentKey = normalizeNavigationValue(parentKey);
  const parent = items.find((item) =>
    [item.keyNavigationItem, item.routeNavigationItem, item.labelNavigationItem]
      .some((value) => normalizeNavigationValue(value) === normalizedParentKey)
  );
  if (!parent) return fallbackItems;

  const configuredItems = items
    .filter((item) =>
      isActive(item)
      && String(item.idParentNavigationItem) === String(parent.idNavigationItem)
    )
    .sort((left, right) =>
      Number(left.orderNavigationItem || 0) - Number(right.orderNavigationItem || 0)
    )
    .map((item) => [item.keyNavigationItem, item.labelNavigationItem]);

  if (!configuredItems.length) return fallbackItems;

  const configuredKeys = new Set(
    configuredItems.map(([key]) => normalizeNavigationValue(key))
  );
  const parentItem = isActive(parent)
    ? [[parent.keyNavigationItem, parent.labelNavigationItem]]
    : fallbackItems.filter(([key]) =>
        normalizeNavigationValue(key) === normalizedParentKey
      );
  for (const [key] of parentItem) {
    configuredKeys.add(normalizeNavigationValue(key));
  }
  const primaryFallbackItem = fallbackItems[0];
  const itemsWithPrimaryFallback = primaryFallbackItem
    && !configuredKeys.has(normalizeNavigationValue(primaryFallbackItem[0]))
    ? [primaryFallbackItem, ...configuredItems]
    : configuredItems;

  return [...parentItem, ...itemsWithPrimaryFallback];
};

export const getContextualNavigationItems = (parentKey, fallbackItems) =>
  selectContextualNavigationItems(window.__PDV_NAVIGATION__, parentKey, fallbackItems);

export const renderContextualNavigationItems = (items, active, dataAttribute) =>
  items
    .map(([key, label]) =>
      `<button class="classic-tool-button ${active === key ? "is-active" : ""}" data-${dataAttribute}="${escapeHtml(key)}" type="button">${escapeHtml(label)}</button>`
    )
    .join("");
