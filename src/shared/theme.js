export const THEMES = Object.freeze([
  {
    id: "default",
    label: "Padrão",
    description: "A aparência operacional atual do PDV."
  },
  {
    id: "dos",
    label: "DOS clássico",
    description: "Azul profundo, alto contraste e tipografia monoespaçada."
  },
  {
    id: "high-contrast",
    label: "Alto contraste",
    description: "Contraste reforçado para leitura e foco."
  }
]);

const themeIds = new Set(THEMES.map(({ id }) => id));

export const normalizeThemeId = (value) =>
  themeIds.has(String(value ?? "").trim()) ? String(value).trim() : "default";

export const getTheme = (themeId) =>
  THEMES.find(({ id }) => id === normalizeThemeId(themeId)) || THEMES[0];
