import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { renderNavigationIntro } from "../ui/navigation-intro.js";
import { getTheme, THEMES } from "../shared/theme.js";
import { getCurrentTheme, setTheme } from "../ui/theme-manager.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

export function createThemeScreen({ onBack, onSettings, onTheme } = {}) {
  const root = document.createElement("main");
  let selectedTheme = getCurrentTheme();
  let saving = false;
  let error = "";

  const render = () => {
    root.className = "catalog-screen theme-screen";
    root.innerHTML = `
      <header class="classic-titlebar">
        <strong>PDV - Aparência</strong>
        <span>Operador: Operador</span>
      </header>
      ${renderMainMenu()}
      <section class="settings-content theme-content">
        ${renderNavigationIntro("theme", "Aparência", "Escolha a aparência visual deste terminal do PDV.")}
        <form class="classic-form-panel theme-form" data-theme-form>
          <div class="classic-panel-header">Tema da interface</div>
          <div class="classic-form-body">
            <fieldset class="theme-options">
              <legend>Selecione um tema</legend>
              ${THEMES.map((theme) => `
                <label class="theme-option${theme.id === selectedTheme ? " is-selected" : ""}">
                  <input type="radio" name="theme" value="${theme.id}" ${theme.id === selectedTheme ? "checked" : ""}>
                  <span class="theme-option-preview theme-preview-${theme.id}" aria-hidden="true">
                    <span></span><span></span><span></span>
                  </span>
                  <span class="theme-option-copy">
                    <strong>${escapeHtml(theme.label)}</strong>
                    <small>${escapeHtml(theme.description)}</small>
                  </span>
                </label>
              `).join("")}
            </fieldset>
            ${error ? `<p class="error-message">${escapeHtml(error)}</p>` : ""}
          </div>
          <div class="classic-form-actions">
            <button class="classic-button primary" type="submit" ${saving ? "disabled" : ""}>${saving ? "Salvando..." : "Aplicar tema"}</button>
            <button class="classic-button" type="button" data-cancel ${saving ? "disabled" : ""}>Cancelar</button>
          </div>
        </form>
      </section>
    `;

    bindMainMenu(root, {
      settings: onSettings,
      theme: onTheme,
      "general-settings": onSettings,
      back: onBack
    });
    bind();
  };

  const bind = () => {
    root.querySelectorAll("input[name='theme']").forEach((input) => {
      input.addEventListener("change", () => {
        selectedTheme = input.value;
        root.querySelectorAll(".theme-option").forEach((option) => {
          option.classList.toggle("is-selected", option.querySelector("input")?.checked === true);
        });
      });
    });
    root.querySelector("[data-cancel]")?.addEventListener("click", onBack);
    root.querySelector("[data-theme-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      saving = true;
      error = "";
      render();
      try {
        await setTheme(selectedTheme);
        onTheme?.(selectedTheme);
      } catch (caughtError) {
        error = caughtError instanceof Error ? caughtError.message : String(caughtError);
      } finally {
        saving = false;
        render();
      }
    });
  };

  render();
  return root;
}

export const getThemeDescription = (themeId) => getTheme(themeId).description;
