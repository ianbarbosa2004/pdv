const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export const getContextualNavigationItems = (parentKey, fallbackItems) => {
  const navigation = window.__PDV_NAVIGATION__;
  const items = Array.isArray(navigation?.items) ? navigation.items : [];
  const parent = items.find((item) =>
    item.keyNavigationItem === parentKey
    && item.typeNavigationItem !== "bar"
  );
  if (!parent) return fallbackItems;

  const configuredItems = items
    .filter((item) =>
      item.typeNavigationItem === "bar"
      && item.isActiveNavigationItem !== 0
      && String(item.idParentNavigationItem) === String(parent.idNavigationItem)
    )
    .sort((left, right) =>
      Number(left.orderNavigationItem || 0) - Number(right.orderNavigationItem || 0)
    )
    .map((item) => [item.keyNavigationItem, item.labelNavigationItem]);

  return configuredItems.length ? configuredItems : fallbackItems;
};

export const renderContextualNavigationItems = (items, active, dataAttribute) =>
  items
    .map(([key, label]) =>
      `<button class="classic-tool-button ${active === key ? "is-active" : ""}" data-${dataAttribute}="${escapeHtml(key)}" type="button">${escapeHtml(label)}</button>`
    )
    .join("");
