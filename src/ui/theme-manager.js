import {
  getConfiguredTheme,
  saveConfiguredTheme
} from "../shared/api.js";
import { normalizeThemeId } from "../shared/theme.js";

const rootElement = () => document.documentElement;

export const getCurrentTheme = () =>
  normalizeThemeId(rootElement().dataset.theme);

export const applyTheme = (themeId) => {
  const normalized = normalizeThemeId(themeId);
  rootElement().dataset.theme = normalized;
  return normalized;
};

export const loadTheme = async () => {
  const themeId = applyTheme(await getConfiguredTheme());
  return themeId;
};

export const setTheme = async (themeId) => {
  const normalized = applyTheme(themeId);
  await saveConfiguredTheme(normalized);
  return normalized;
};
