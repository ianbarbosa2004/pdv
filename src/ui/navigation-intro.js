const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

export const getNavigationItem = (key) => {
  const items = window.__PDV_NAVIGATION__?.items;
  if (!Array.isArray(items)) return null;
  return items.find((item) => String(item.keyNavigationItem || "").toLowerCase() === String(key || "").toLowerCase())
    || null;
};

export const getNavigationPresentation = (key, fallbackTitle, fallbackDescription) => {
  const item = getNavigationItem(key);
  return {
    title: item?.labelNavigationItem || fallbackTitle,
    description: item?.descriptionNavigationItem || fallbackDescription
  };
};

export const renderNavigationIntro = (key, fallbackTitle, fallbackDescription, className = "") => {
  const { title, description } = getNavigationPresentation(key, fallbackTitle, fallbackDescription);
  return `
    <div class="backoffice-home-heading${className ? ` ${className}` : ""}">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
    </div>
  `;
};

