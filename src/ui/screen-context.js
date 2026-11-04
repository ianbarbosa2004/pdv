const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

export const renderScreenContextBar = (title) => `
  <div class="classic-toolbar screen-context-bar" aria-label="Navegação contextual">
    <button class="classic-tool-button is-active" type="button" aria-current="page">${escapeHtml(title)}</button>
  </div>
`;

