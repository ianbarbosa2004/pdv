import test from "node:test";
import assert from "node:assert/strict";
import { getTheme, normalizeThemeId, THEMES } from "../../src/shared/theme.js";
import { DEFAULT_NAVIGATION } from "../../src/shared/navigation-defaults.js";

test("expõe temas visuais estáveis e normaliza valores inválidos", () => {
  assert.deepEqual(THEMES.map((theme) => theme.id), [
    "default",
    "dos",
    "high-contrast"
  ]);
  assert.equal(normalizeThemeId("dos"), "dos");
  assert.equal(normalizeThemeId("theme-inexistente"), "default");
  assert.equal(getTheme("high-contrast").label, "Alto contraste");
});

test("inclui Aparência no menu de Configurações", () => {
  const themeItem = DEFAULT_NAVIGATION.items.find((item) => item.keyNavigationItem === "theme");
  assert.deepEqual(themeItem, {
    menuKey: "settings",
    keyNavigationItem: "theme",
    labelNavigationItem: "Aparência",
    routeNavigationItem: "theme",
    orderNavigationItem: 3,
    parentKey: null,
    typeNavigationItem: "bar",
    descriptionNavigationItem: "Escolha a aparência visual deste terminal do PDV.",
    isActiveNavigationItem: 1,
    showsInBackofficeHomeNavigationItem: 0
  });
});
