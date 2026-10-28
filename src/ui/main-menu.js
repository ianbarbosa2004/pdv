import { resolveNavigationHandler } from "./navigation-routing.js";

const getNavigation = () => window.__PDV_NAVIGATION__ || { menus: [], items: [] };

export const renderMainMenu = () => {
  const navigation = getNavigation();
  const itemsByMenu = new Map();
  for (const item of navigation.items || []) {
    if (!itemsByMenu.has(item.idNavigationMenu)) itemsByMenu.set(item.idNavigationMenu, []);
    itemsByMenu.get(item.idNavigationMenu).push(item);
  }
  const menus = [...(navigation.menus || [])].sort((a, b) =>
    Number(a.orderNavigationMenu || 0) - Number(b.orderNavigationMenu || 0)
  );
  return `
    <nav class="classic-menubar" aria-label="Menu principal">
      ${menus.filter((menu) =>
        menu.isActiveNavigationMenu !== 0 && menu.isActiveNavigationMenu !== false
      ).map((menu) => {
        const items = (itemsByMenu.get(menu.idNavigationMenu) || [])
          .filter((item) => item.isActiveNavigationItem !== 0 && item.isActiveNavigationItem !== false)
          .filter((item) => item.idParentNavigationItem === null || item.idParentNavigationItem === undefined)
          .sort((a, b) => Number(a.orderNavigationItem || 0) - Number(b.orderNavigationItem || 0));
        if (!items.length) return `<button type="button" data-main-menu="${menu.keyNavigationMenu}">${menu.labelNavigationMenu}</button>`;
        const renderItems = (parentId = null) => (itemsByMenu.get(menu.idNavigationMenu) || [])
          .filter((item) => item.isActiveNavigationItem !== 0 && item.isActiveNavigationItem !== false)
          .filter((item) => String(item.idParentNavigationItem || "") === String(parentId || ""))
          .sort((a, b) => Number(a.orderNavigationItem || 0) - Number(b.orderNavigationItem || 0))
          .map((item) => {
            const children = renderItems(item.idNavigationItem);
            if (item.typeNavigationItem === "submenu" && children) {
              return `<details class="classic-menu-dropdown classic-menu-subdropdown"><summary>${item.labelNavigationItem}</summary><div class="classic-menu-panel">${children}</div></details>`;
            }
            return `<button type="button" data-main-menu="${item.keyNavigationItem}">${item.labelNavigationItem}</button>`;
          }).join("");
        return `
          <details class="classic-menu-dropdown">
            <summary>${menu.labelNavigationMenu}</summary>
            <div class="classic-menu-panel">
              ${renderItems()}
            </div>
          </details>
        `;
      }).join("")}
    </nav>
  `;
};

export const bindMainMenu = (root, handlers) => {
  root.querySelectorAll("[data-main-menu]").forEach((button) => {
    button.addEventListener("click", () => {
      const handler = resolveNavigationHandler(handlers, button.dataset.mainMenu);
      handler?.();
    });
  });

  root.querySelectorAll(".classic-menu-dropdown").forEach((menu) => {
    menu.addEventListener("mouseenter", () => {
      menu.open = true;
      root.querySelectorAll(".classic-menu-dropdown[open]").forEach((openMenu) => {
        if (openMenu !== menu) openMenu.removeAttribute("open");
      });
    });
    menu.addEventListener("toggle", () => {
      if (!menu.open) return;
      root.querySelectorAll(".classic-menu-dropdown[open]").forEach((openMenu) => {
        if (openMenu !== menu) openMenu.removeAttribute("open");
      });
    });
  });

  const menubar = root.querySelector(".classic-menubar");
  if (root.__mainMenuOutsideClickHandler) {
    document.removeEventListener("click", root.__mainMenuOutsideClickHandler);
  }
  root.__mainMenuOutsideClickHandler = (event) => {
    if (event.target instanceof Node && !menubar?.contains(event.target)) {
      root.querySelectorAll(".classic-menu-dropdown[open]").forEach((menu) => {
        menu.removeAttribute("open");
      });
    }
  };
  document.addEventListener("click", root.__mainMenuOutsideClickHandler);
};
