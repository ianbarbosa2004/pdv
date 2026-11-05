const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const findPersistedItem = (key, title) => {
  const items = Array.isArray(window.__PDV_NAVIGATION__?.items)
    ? window.__PDV_NAVIGATION__.items
    : [];
  const normalizedKey = String(key ?? "").trim().toLocaleLowerCase("pt-BR");
  const normalizedTitle = String(title ?? "").trim().toLocaleLowerCase("pt-BR");
  return items.find((item) =>
    [item.keyNavigationItem, item.routeNavigationItem, item.labelNavigationItem]
      .some((value) => String(value ?? "").trim().toLocaleLowerCase("pt-BR") === normalizedKey)
  ) || items.find((item) =>
    String(item.labelNavigationItem ?? "").trim().toLocaleLowerCase("pt-BR") === normalizedTitle
  );
};

export const getScreenContextLabel = (title, key = title) =>
  findPersistedItem(key, title)?.labelNavigationItem || title;

export const renderScreenContextBar = (title, key = title) => {
  const label = getScreenContextLabel(title, key);
  return `
  <div class="classic-toolbar screen-context-bar" aria-label="Navegação contextual">
    <button class="classic-tool-button is-active" type="button" aria-current="page">${escapeHtml(label)}</button>
  </div>
  `;
};
