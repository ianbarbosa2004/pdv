import { bindMainMenu, renderMainMenu } from "../ui/main-menu.js";
import { renderLucideIcons } from "../ui/icons.js";
import { createFeedbackTimer, renderSuccessFeedback } from "../ui/feedback.js";
import { getApiUrl } from "../shared/api.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const toSlug = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 80);

const itemTypes = [
  ["item", "Item de menu"],
  ["submenu", "Submenu"],
  ["bar", "Barra contextual"]
];

const protectedNavigationMenuKeys = new Set(["tools", "settings"]);

export function createNavigationBuilderScreen({
  onBack,
  onSettings,
  onNavigationBuilder,
  onProducts,
  onFiscalOperations,
  onThermalPrint,
  onNcmCestUpdate,
  onCompany,
  onNfce,
  onFinancial,
  onPaymentMethods,
  onSuppliers
}) {
  const root = document.createElement("main");
  let navigation = { menus: [], items: [] };
  let loading = true;
  let saving = false;
  let error = "";
  let message = "";
  let selectedMenuId = "";
  let selectedParentId = "";
  let editingItemId = "";
  let draggedEntry = null;
  let pointerDrag = null;
  let pointerController = null;
  let suppressClickUntil = 0;
  const scheduleMessageClear = createFeedbackTimer();
  const pendingOrderChanges = new Map();
  const pendingItemChanges = new Map();

  const orderKey = (kind, id) => `${kind}:${id}`;
  const getOrder = (entry, kind) => pendingOrderChanges.get(orderKey(
    kind,
    kind === "menu" ? entry.idNavigationMenu : entry.idNavigationItem
  )) ?? Number(kind === "menu" ? entry.orderNavigationMenu : entry.orderNavigationItem);
  const setPendingItemOrder = (id, order) => {
    const key = orderKey("item", id);
    pendingItemChanges.set(key, {
      ...(pendingItemChanges.get(key) || {}),
      orderNavigationItem: order
    });
  };
  const renderPreservingScroll = () => {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    render();
    requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));
  };

  const request = async (path, options) => {
    const response = await fetch(`${getApiUrl()}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Não foi possível concluir a operação.");
    return payload;
  };

  const refresh = async () => {
    loading = true;
    render();
    try {
      navigation = await request("/api/navigation?includeInactive=1");
      syncPublishedNavigation();
      error = "";
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : String(loadError);
    } finally {
      loading = false;
      render();
    }
  };

  const syncPublishedNavigation = () => {
    window.__PDV_NAVIGATION__ = {
      menus: navigation.menus.filter((menu) => Number(menu.isActiveNavigationMenu) === 1),
      items: navigation.items.filter((item) => Number(item.isActiveNavigationItem) === 1)
    };
  };

  const save = async (path, method, data) => {
    saving = true;
    error = "";
    message = "";
    renderPreservingScroll();
    try {
    await request(path, { method, body: JSON.stringify(data) });
    await refresh();
    message = "Alterações salvas com sucesso.";
    scheduleMessageClear(() => {
      message = "";
      render();
    });
    } catch (saveError) {
      error = saveError instanceof Error ? saveError.message : String(saveError);
    } finally {
      saving = false;
      render();
    }
  };

  const updateToggleButton = (button, active, activeLabel, inactiveLabel, activeAction, inactiveAction, subject) => {
    button.classList.toggle("is-active", active);
    button.classList.toggle("is-inactive", !active);
    button.dataset.active = active ? "1" : "0";
    button.dataset.homeActive = active ? "1" : "0";
    button.dataset.menuActive = active ? "1" : "0";
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.setAttribute("aria-label", `${active ? activeAction : inactiveAction} ${subject}`);
    const label = button.querySelector(".status-toggle-label");
    if (label) label.textContent = active ? activeLabel : inactiveLabel;
  };

  const toggleNavigationValue = async ({
    button,
    entry,
    field,
    path,
    data,
    activeLabel,
    inactiveLabel,
    activeAction,
    inactiveAction,
    subject
  }) => {
    const previousValue = Number(entry[field]) === 1;
    const nextValue = !previousValue;
    entry[field] = nextValue ? 1 : 0;
    updateToggleButton(button, nextValue, activeLabel, inactiveLabel, activeAction, inactiveAction, subject);
    syncPublishedNavigation();
    button.disabled = true;
    try {
      await request(path, {
        method: "PUT",
        body: JSON.stringify({ ...data, [field]: nextValue ? 1 : 0 })
      });
    } catch (toggleError) {
      entry[field] = previousValue ? 1 : 0;
      updateToggleButton(button, previousValue, activeLabel, inactiveLabel, activeAction, inactiveAction, subject);
      error = toggleError instanceof Error ? toggleError.message : String(toggleError);
      render();
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  };

  const reorder = (kind, draggedId, targetId, targetMenuId = "", targetParentId = "") => {
    if (draggedId === targetId) return;
    const entries = kind === "menu"
      ? [...navigation.menus].sort((a, b) => getOrder(a, "menu") - getOrder(b, "menu"))
      : [...navigation.items]
        .filter((item) => item.idNavigationMenu === Number(targetMenuId)
          && String(item.idParentNavigationItem || "") === String(targetParentId || ""))
        .sort((a, b) => getOrder(a, "item") - getOrder(b, "item"));
    const draggedIndex = entries.findIndex((entry) => String(kind === "menu" ? entry.idNavigationMenu : entry.idNavigationItem) === String(draggedId));
    const targetIndex = entries.findIndex((entry) => String(kind === "menu" ? entry.idNavigationMenu : entry.idNavigationItem) === String(targetId));
    if (draggedIndex < 0 || targetIndex < 0) return;
    const [dragged] = entries.splice(draggedIndex, 1);
    entries.splice(targetIndex, 0, dragged);
    entries.forEach((entry, index) => {
      const order = index + 1;
      const id = kind === "menu" ? entry.idNavigationMenu : entry.idNavigationItem;
      pendingOrderChanges.set(orderKey(kind, id), order);
      if (kind === "menu") entry.orderNavigationMenu = order;
      else {
        entry.orderNavigationItem = order;
        setPendingItemOrder(id, order);
      }
    });
    message = "Ordem alterada. Clique em Salvar ordem para confirmar.";
    error = "";
    renderPreservingScroll();
  };

  const moveItemToMenu = (draggedId, targetMenuId) => {
    const item = navigation.items.find((entry) => String(entry.idNavigationItem) === String(draggedId));
    const targetMenu = navigation.menus.find((menu) => String(menu.idNavigationMenu) === String(targetMenuId));
    if (!item || !targetMenu || item.idParentNavigationItem || item.typeNavigationItem === "bar"
      || String(item.idNavigationMenu) === String(targetMenu.idNavigationMenu)) return;

    const sourceItems = navigation.items
      .filter((entry) => String(entry.idNavigationMenu) === String(item.idNavigationMenu)
        && !entry.idParentNavigationItem)
      .sort((left, right) => getOrder(left, "item") - getOrder(right, "item"))
      .filter((entry) => entry !== item);
    item.idNavigationMenu = targetMenu.idNavigationMenu;
    item.idParentNavigationItem = null;
    const targetItems = navigation.items
      .filter((entry) => String(entry.idNavigationMenu) === String(targetMenu.idNavigationMenu)
        && !entry.idParentNavigationItem
        && entry !== item)
      .sort((left, right) => getOrder(left, "item") - getOrder(right, "item"));
    targetItems.push(item);

    [...sourceItems, ...targetItems].forEach((entry) => {
      const entries = sourceItems.includes(entry) ? sourceItems : targetItems;
      const order = entries.indexOf(entry) + 1;
      pendingOrderChanges.set(orderKey("item", entry.idNavigationItem), order);
      entry.orderNavigationItem = order;
      setPendingItemOrder(entry.idNavigationItem, order);
    });
    pendingItemChanges.set(orderKey("item", item.idNavigationItem), {
      ...pendingItemChanges.get(orderKey("item", item.idNavigationItem)),
      idNavigationMenu: targetMenu.idNavigationMenu,
      idParentNavigationItem: null,
      orderNavigationItem: targetItems.length
    });
    message = "Item movido. Clique em Salvar ordem para confirmar.";
    error = "";
    renderPreservingScroll();
  };

  const saveOrder = async () => {
    if (!pendingOrderChanges.size && !pendingItemChanges.size) return;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    saving = true;
    error = "";
    message = "";
    renderPreservingScroll();
    try {
      const requests = [];
      for (const [key, order] of pendingOrderChanges.entries()) {
        const [kind, id] = key.split(":");
        if (kind === "menu") {
          requests.push(request("/api/navigation/menus", {
            method: "PUT",
            body: JSON.stringify({ idNavigationMenu: Number(id), orderNavigationMenu: order })
          }));
        }
      }
      const itemIds = new Set([
        ...[...pendingOrderChanges.keys()]
          .filter((key) => key.startsWith("item:"))
          .map((key) => key.slice("item:".length)),
        ...[...pendingItemChanges.keys()].map((key) => key.slice("item:".length))
      ]);
      for (const id of itemIds) {
        const item = navigation.items.find((entry) => String(entry.idNavigationItem) === String(id));
        if (!item) continue;
        requests.push(request("/api/navigation/items", {
          method: "PUT",
          body: JSON.stringify({
            idNavigationItem: Number(id),
            ...pendingItemChanges.get(orderKey("item", id)),
            orderNavigationItem: getOrder(item, "item")
          })
        }));
      }
      await Promise.all(requests);
      pendingOrderChanges.clear();
      pendingItemChanges.clear();
      await refresh();
      message = "Ordem salva com sucesso.";
      scheduleMessageClear(() => {
        message = "";
        render();
      });
    } catch (orderError) {
      error = orderError instanceof Error ? orderError.message : String(orderError);
    } finally {
      saving = false;
      renderPreservingScroll();
      requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));
    }
  };

  const render = () => {
    const menus = [...navigation.menus].sort((a, b) => getOrder(a, "menu") - getOrder(b, "menu"));
    const items = [...navigation.items].sort((a, b) => getOrder(a, "item") - getOrder(b, "item"));
    const activeMenus = menus.filter((menu) => menu.isActiveNavigationMenu);
    const parentOptions = items.filter((item) => item.isActiveNavigationItem && item.typeNavigationItem !== "bar");
    const renderNavigationItem = (item, childrenByParent, menuKey) => {
      const children = childrenByParent.get(String(item.idNavigationItem)) || [];
      const isItemActive = Number(item.isActiveNavigationItem) === 1;
      const showsInBackofficeHome = Number(item.showsInBackofficeHomeNavigationItem) === 1;
      const isProtected = protectedNavigationMenuKeys.has(menuKey);
      const row = editingItemId === String(item.idNavigationItem) ? `
        <form class="navigation-builder-edit-form" data-edit-form="${item.idNavigationItem}">
          <span class="navigation-builder-drag-handle" aria-hidden="true">⠿</span>
          <label class="form-field"><span>Nome exibido</span><input name="labelNavigationItem" value="${escapeHtml(item.labelNavigationItem)}" maxlength="120" required /></label>
          <label class="form-field"><span>Tipo</span><select name="typeNavigationItem">${itemTypes.map(([value, label]) => `<option value="${value}" ${value === item.typeNavigationItem ? "selected" : ""}>${label}</option>`).join("")}</select></label>
          <label class="form-field"><span>Rota</span><input name="routeNavigationItem" value="${escapeHtml(item.routeNavigationItem || "")}" maxlength="120" /></label>
          <label class="form-field"><span>Descrição do atalho</span><textarea name="descriptionNavigationItem" maxlength="240" rows="2">${escapeHtml(item.descriptionNavigationItem || "")}</textarea></label>
          <label class="form-field"><span>Ordem</span><input name="orderNavigationItem" type="number" min="1" value="${getOrder(item, "item")}" required /></label>
          <div class="navigation-builder-shortcut-field">
            <label class="navigation-builder-shortcut-switch">
              <input name="showsInBackofficeHomeNavigationItem" type="checkbox" ${showsInBackofficeHome ? "checked" : ""} />
              <span class="status-toggle-track"><span class="status-toggle-thumb"></span></span>
              <span class="status-toggle-label">Mostrar como atalho</span>
            </label>
            <small>Exibe este item como painel na tela inicial da Retaguarda.</small>
          </div>
          <div class="navigation-builder-actions">
            <button class="classic-button primary" type="submit">Salvar</button>
            <button class="classic-button" data-cancel-edit type="button">Cancelar</button>
          </div>
        </form>
      ` : `
        <div class="navigation-builder-row navigation-builder-draggable ${item.idParentNavigationItem ? "navigation-builder-context-item" : "navigation-builder-menu-item"}" draggable="true" data-drag-kind="item" data-drag-item="${item.idNavigationItem}" data-menu-id="${item.idNavigationMenu}" data-parent-id="${item.idParentNavigationItem || ""}">
          <span class="navigation-builder-drag-handle" title="Arraste para reordenar" aria-label="Arraste para reordenar">⠿</span>
          <div class="navigation-builder-title">
            <span class="navigation-builder-branch">${item.idParentNavigationItem ? "↳" : "•"}</span>
            <span class="navigation-builder-label">${escapeHtml(item.labelNavigationItem)}</span>
            <span class="navigation-builder-type ${escapeHtml(item.typeNavigationItem)}">${escapeHtml(itemTypes.find(([value]) => value === item.typeNavigationItem)?.[1] || item.typeNavigationItem)}</span>
            <span class="navigation-builder-meta">${escapeHtml(item.routeNavigationItem || "sem rota")} · ordem ${getOrder(item, "item")}</span>
          </div>
          <div class="navigation-builder-actions">
            <button class="icon-button edit" data-edit-item="${item.idNavigationItem}" type="button" title="Editar item" aria-label="Editar item ${escapeHtml(item.labelNavigationItem)}"><i data-lucide="pencil"></i></button>
            <button class="status-toggle ${showsInBackofficeHome ? "is-active" : "is-inactive"}" data-toggle-home="${item.idNavigationItem}" data-home-active="${showsInBackofficeHome ? "1" : "0"}" type="button" aria-pressed="${showsInBackofficeHome ? "true" : "false"}" aria-label="${showsInBackofficeHome ? "Ocultar" : "Mostrar"} atalho de ${escapeHtml(item.labelNavigationItem)}">
              <span class="status-toggle-track"><span class="status-toggle-thumb"></span></span>
              <span class="status-toggle-label">${showsInBackofficeHome ? "Atalho" : "Sem atalho"}</span>
            </button>
            <button class="status-toggle ${isItemActive ? "is-active" : "is-inactive"}" data-toggle-item="${item.idNavigationItem}" data-active="${isItemActive ? "1" : "0"}" type="button" ${isProtected && isItemActive ? "disabled title=\"Itens de Ferramentas e Configurações não podem ser desativados.\"" : `aria-pressed="${isItemActive ? "true" : "false"}" aria-label="${isItemActive ? "Desativar" : "Ativar"} item ${escapeHtml(item.labelNavigationItem)}"`}>
              <span class="status-toggle-track"><span class="status-toggle-thumb"></span></span>
              <span class="status-toggle-label">${isItemActive ? "Ativo" : "Inativo"}</span>
            </button>
          </div>
        </div>
      `;
      return `${row}${children.length ? `<div class="navigation-builder-children">${children.map((child) => renderNavigationItem(child, childrenByParent, menuKey)).join("")}</div>` : ""}`;
    };
    root.className = "catalog-screen";
    root.innerHTML = `
      <header class="classic-titlebar"><strong>PDV - Construtor de Menu</strong><span>Operador: Operador</span></header>
      ${renderMainMenu()}
      <div class="classic-toolbar">
        <button class="classic-tool-button" data-back type="button">← Frente de caixa</button>
        <strong>Construtor de menu principal</strong>
      </div>
      <section class="classic-content navigation-builder">
        <div class="backoffice-home-heading navigation-builder-heading">
          <p class="eyebrow">Configurações</p>
          <h1>Menu principal</h1>
          <p>Altere nomes, itens, submenus e a ordem da navegação. A barra contextual continua representando o terceiro nível do sistema.</p>
        </div>
        ${error ? `<p class="payment-error">${escapeHtml(error)}</p>` : ""}
        ${renderSuccessFeedback(message, escapeHtml)}
        <div class="navigation-builder-grid">
          <form class="classic-form-panel" data-menu-form>
            <div class="classic-panel-header">Novo menu principal</div>
            <div class="classic-form-body">
              <label class="form-field"><span>Chave técnica (slug)</span><input name="keyNavigationMenu" data-slug-target="menu" maxlength="80" pattern="[a-z0-9-]+" readonly required /></label>
              <label class="form-field"><span>Nome exibido</span><input name="labelNavigationMenu" data-slug-source="menu" maxlength="120" required /></label>
              <label class="form-field"><span>Ordem</span><input name="orderNavigationMenu" type="number" min="1" value="${menus.length + 1}" required /></label>
            </div>
            <div class="classic-form-actions"><button class="classic-button primary" type="submit" ${loading || saving ? "disabled" : ""}>Adicionar menu</button></div>
          </form>
          <form class="classic-form-panel" data-item-form>
            <div class="classic-panel-header">Novo item ou submenu</div>
            <div class="classic-form-body">
              <label class="form-field"><span>Menu principal</span><select name="idNavigationMenu" required>${activeMenus.map((menu) => `<option value="${menu.idNavigationMenu}" ${String(selectedMenuId) === String(menu.idNavigationMenu) ? "selected" : ""}>${escapeHtml(menu.labelNavigationMenu)}</option>`).join("")}</select></label>
              <label class="form-field"><span>Item pai (opcional)</span><select name="idParentNavigationItem"><option value="">Menu principal</option>${parentOptions.map((item) => `<option value="${item.idNavigationItem}" ${String(selectedParentId) === String(item.idNavigationItem) ? "selected" : ""}>${escapeHtml(item.labelNavigationItem)}</option>`).join("")}</select></label>
              <label class="form-field"><span>Tipo</span><select name="typeNavigationItem">${itemTypes.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
              <label class="form-field"><span>Chave técnica (slug)</span><input name="keyNavigationItem" data-slug-target="item" maxlength="80" pattern="[a-z0-9-]+" readonly required /></label>
              <label class="form-field"><span>Nome exibido</span><input name="labelNavigationItem" data-slug-source="item" maxlength="120" required /></label>
              <label class="form-field"><span>Rota</span><input name="routeNavigationItem" maxlength="120" placeholder="ex.: products" /></label>
              <label class="form-field"><span>Descrição do atalho</span><textarea name="descriptionNavigationItem" maxlength="240" rows="2" placeholder="Texto exibido abaixo do atalho"></textarea></label>
              <label class="form-field"><span>Ordem</span><input name="orderNavigationItem" type="number" min="1" value="1" required /></label>
              <div class="navigation-builder-shortcut-field">
                <label class="navigation-builder-shortcut-switch">
                  <input name="showsInBackofficeHomeNavigationItem" type="checkbox" />
                  <span class="status-toggle-track"><span class="status-toggle-thumb"></span></span>
                  <span class="status-toggle-label">Mostrar como atalho</span>
                </label>
                <small>Exibe este item como painel na tela inicial da Retaguarda.</small>
              </div>
            </div>
            <div class="classic-form-actions"><button class="classic-button primary" type="submit" ${loading || saving ? "disabled" : ""}>Adicionar item</button></div>
          </form>
        </div>
        <section class="classic-grid-panel">
          <div class="classic-panel-header navigation-builder-panel-header">
            <span>Estrutura atual</span>
            <button class="classic-button primary" data-save-order type="button" ${(!pendingOrderChanges.size && !pendingItemChanges.size) || saving ? "disabled" : ""}>Salvar ordem</button>
          </div>
          <div class="classic-grid-wrapper">${loading ? `<p class="classic-empty">Carregando menus...</p>` : menus.map((menu) => `
            <div class="navigation-builder-menu" data-drop-menu="${menu.idNavigationMenu}">
              <div class="navigation-builder-row navigation-builder-draggable" draggable="true" data-drag-kind="menu" data-drag-item="${menu.idNavigationMenu}">
                <span class="navigation-builder-drag-handle" title="Arraste para reordenar" aria-label="Arraste para reordenar">⠿</span>
                <div class="navigation-builder-title">
                  <strong>${escapeHtml(menu.labelNavigationMenu)}</strong>
                  <span class="navigation-builder-meta">Chave: ${escapeHtml(menu.keyNavigationMenu)} · Ordem: ${getOrder(menu, "menu")}</span>
                </div>
                <div class="navigation-builder-actions">
                  <button class="icon-button edit" data-edit-menu="${menu.idNavigationMenu}" type="button" title="Editar menu" aria-label="Editar menu ${escapeHtml(menu.labelNavigationMenu)}"><i data-lucide="pencil"></i></button>
                  <button class="status-toggle ${Number(menu.isActiveNavigationMenu) === 1 ? "is-active" : "is-inactive"}" data-toggle-menu="${menu.idNavigationMenu}" data-menu-active="${Number(menu.isActiveNavigationMenu) === 1 ? "1" : "0"}" type="button" ${protectedNavigationMenuKeys.has(menu.keyNavigationMenu) && Number(menu.isActiveNavigationMenu) === 1 ? "disabled title=\"Ferramentas e Configurações não podem ser desativados.\"" : `aria-pressed="${Number(menu.isActiveNavigationMenu) === 1 ? "true" : "false"}" aria-label="${Number(menu.isActiveNavigationMenu) === 1 ? "Desativar" : "Ativar"} menu ${escapeHtml(menu.labelNavigationMenu)}"`}>
                    <span class="status-toggle-track"><span class="status-toggle-thumb"></span></span>
                    <span class="status-toggle-label">${Number(menu.isActiveNavigationMenu) === 1 ? "Ativo" : "Inativo"}</span>
                  </button>
                </div>
              </div>
              ${(() => {
                const menuItems = items.filter((item) => item.idNavigationMenu === menu.idNavigationMenu);
                const childrenByParent = new Map();
                for (const item of menuItems) {
                  const key = String(item.idParentNavigationItem || "");
                  if (!childrenByParent.has(key)) childrenByParent.set(key, []);
                  childrenByParent.get(key).push(item);
                }
                return (childrenByParent.get("") || [])
                  .map((item) => renderNavigationItem(item, childrenByParent, menu.keyNavigationMenu))
                  .join("");
              })()}
            </div>
          `).join("")}</div>
        </section>
      </section>
    `;
    bindMainMenu(root, {
      settings: onSettings,
      "navigation-builder": onNavigationBuilder,
      products: onProducts,
      "fiscal-operations": onFiscalOperations,
      "thermal-print": onThermalPrint,
      "ncm-cest-update": onNcmCestUpdate,
      company: onCompany,
      nfce: onNfce,
      financial: onFinancial,
      "payment-methods": onPaymentMethods,
      suppliers: onSuppliers
    });
    renderLucideIcons(root);
    bind();
  };

  const bind = () => {
    root.addEventListener("click", (event) => {
      if (Date.now() >= suppressClickUntil) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClickUntil = 0;
    }, true);
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    root.querySelector("[data-save-order]")?.addEventListener("click", () => void saveOrder());
    root.querySelectorAll("[data-slug-source]").forEach((source) => {
      source.addEventListener("input", () => {
        const target = root.querySelector(`[data-slug-target="${source.dataset.slugSource}"]`);
        if (target) target.value = toSlug(source.value);
      });
    });
    root.querySelector("[data-menu-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void save("/api/navigation/menus", "POST", Object.fromEntries(new FormData(event.currentTarget)));
    });
    root.querySelector("[data-item-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = Object.fromEntries(new FormData(form));
      data.idParentNavigationItem ||= null;
      data.showsInBackofficeHomeNavigationItem = form.elements.showsInBackofficeHomeNavigationItem.checked ? 1 : 0;
      void save("/api/navigation/items", "POST", data);
    });
    root.querySelectorAll("[data-toggle-home]").forEach((button) => button.addEventListener("click", () => {
      const entry = navigation.items.find((item) => String(item.idNavigationItem) === button.dataset.toggleHome);
      if (!entry) return;
      void toggleNavigationValue({
        button,
        entry,
        field: "showsInBackofficeHomeNavigationItem",
        path: "/api/navigation/items",
        data: { idNavigationItem: Number(button.dataset.toggleHome) },
        activeLabel: "Atalho",
        inactiveLabel: "Sem atalho",
        activeAction: "Ocultar atalho de",
        inactiveAction: "Mostrar atalho de",
        subject: entry.labelNavigationItem
      });
    }));
    root.querySelectorAll("[data-toggle-menu]").forEach((button) => button.addEventListener("click", () => {
      const entry = navigation.menus.find((menu) => String(menu.idNavigationMenu) === button.dataset.toggleMenu);
      if (!entry) return;
      void toggleNavigationValue({
        button,
        entry,
        field: "isActiveNavigationMenu",
        path: "/api/navigation/menus",
        data: { idNavigationMenu: Number(button.dataset.toggleMenu) },
        activeLabel: "Ativo",
        inactiveLabel: "Inativo",
        activeAction: "Desativar menu",
        inactiveAction: "Ativar menu",
        subject: entry.labelNavigationMenu
      });
    }));
    root.querySelectorAll("[data-toggle-item]").forEach((button) => button.addEventListener("click", () => {
      const entry = navigation.items.find((item) => String(item.idNavigationItem) === button.dataset.toggleItem);
      if (!entry) return;
      void toggleNavigationValue({
        button,
        entry,
        field: "isActiveNavigationItem",
        path: "/api/navigation/items",
        data: { idNavigationItem: Number(button.dataset.toggleItem) },
        activeLabel: "Ativo",
        inactiveLabel: "Inativo",
        activeAction: "Desativar item",
        inactiveAction: "Ativar item",
        subject: entry.labelNavigationItem
      });
    }));
    root.querySelectorAll("[data-edit-form]").forEach((form) => form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      data.showsInBackofficeHomeNavigationItem =
        form.elements.showsInBackofficeHomeNavigationItem.checked ? 1 : 0;
      void save("/api/navigation/items", "PUT", {
        idNavigationItem: Number(form.dataset.editForm),
        labelNavigationItem: data.labelNavigationItem,
        typeNavigationItem: data.typeNavigationItem,
        routeNavigationItem: data.routeNavigationItem,
        descriptionNavigationItem: data.descriptionNavigationItem,
        orderNavigationItem: data.orderNavigationItem,
        showsInBackofficeHomeNavigationItem: data.showsInBackofficeHomeNavigationItem
      });
      editingItemId = "";
    }));
    root.querySelectorAll("[data-cancel-edit]").forEach((button) => button.addEventListener("click", () => {
      editingItemId = "";
      render();
    }));
    root.querySelectorAll("[data-edit-menu]").forEach((button) => button.addEventListener("click", () => {
      const menu = navigation.menus.find((item) => item.idNavigationMenu === Number(button.dataset.editMenu));
      if (!menu) return;
      const label = window.prompt("Nome do menu:", menu.labelNavigationMenu);
      if (label === null) return;
      const order = window.prompt("Ordem do menu:", menu.orderNavigationMenu);
      if (order === null) return;
      void save("/api/navigation/menus", "PUT", { idNavigationMenu: menu.idNavigationMenu, labelNavigationMenu: label, orderNavigationMenu: order });
    }));
    root.querySelectorAll("[data-edit-item]").forEach((button) => button.addEventListener("click", () => {
      editingItemId = button.dataset.editItem;
      render();
    }));
    root.querySelectorAll("[data-drag-item]").forEach((row) => {
      row.addEventListener("dragstart", (event) => {
        draggedEntry = {
          kind: row.dataset.dragKind,
          id: row.dataset.dragItem,
          menuId: row.dataset.menuId || ""
        };
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", JSON.stringify(draggedEntry));
        }
        row.setAttribute("aria-grabbed", "true");
        row.classList.add("is-dragging");
      });
      row.addEventListener("dragend", () => {
        suppressClickUntil = Date.now() + 500;
        draggedEntry = null;
        row.removeAttribute("aria-grabbed");
        row.classList.remove("is-dragging");
        root.querySelectorAll(".is-drag-over").forEach((entry) => entry.classList.remove("is-drag-over"));
      });
      row.addEventListener("dragenter", (event) => {
        event.preventDefault();
        if (draggedEntry?.kind === row.dataset.dragKind && draggedEntry.id !== row.dataset.dragItem) {
          row.classList.add("is-drag-over");
        }
      });
      row.addEventListener("dragover", (event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        if (draggedEntry?.kind === row.dataset.dragKind && draggedEntry.id !== row.dataset.dragItem) {
          row.classList.add("is-drag-over");
        }
      });
      row.addEventListener("dragleave", (event) => {
        if (!row.contains(event.relatedTarget)) row.classList.remove("is-drag-over");
      });
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        suppressClickUntil = Date.now() + 500;
        row.classList.remove("is-drag-over");
        let source = draggedEntry;
        if (!source) {
          try {
            source = JSON.parse(event.dataTransfer?.getData("text/plain") || "{}");
          } catch {
            source = null;
          }
        }
        if (source?.kind === "item"
          && row.dataset.dragKind === "item"
          && source.id !== row.dataset.dragItem
          && source.menuId !== row.dataset.menuId) {
          moveItemToMenu(source.id, row.dataset.menuId);
        } else if (source?.kind === row.dataset.dragKind) {
          reorder(source.kind, source.id, row.dataset.dragItem, row.dataset.menuId, row.dataset.parentId);
        }
      });
    });
    root.querySelectorAll("[data-drop-menu]").forEach((menu) => {
      menu.addEventListener("dragover", (event) => {
        const source = draggedEntry;
        if (source?.kind !== "item" || source.menuId === menu.dataset.dropMenu) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        menu.classList.add("is-drag-over");
      });
      menu.addEventListener("dragleave", (event) => {
        if (!menu.contains(event.relatedTarget)) menu.classList.remove("is-drag-over");
      });
      menu.addEventListener("drop", (event) => {
        event.preventDefault();
        const source = draggedEntry;
        menu.classList.remove("is-drag-over");
        if (source?.kind === "item" && source.menuId !== menu.dataset.dropMenu) {
          moveItemToMenu(source.id, menu.dataset.dropMenu);
        }
      });
    });
    root.querySelectorAll(".navigation-builder-drag-handle").forEach((handle) => {
      handle.addEventListener("pointerdown", (event) => {
        const row = handle.closest("[data-drag-item]");
        if (!row || event.button !== 0) return;
        event.preventDefault();
        draggedEntry = {
          kind: row.dataset.dragKind,
          id: row.dataset.dragItem,
          menuId: row.dataset.menuId || ""
        };
        pointerDrag = { row, target: null, targetMenu: null };
        row.classList.add("is-dragging");
        handle.setPointerCapture?.(event.pointerId);
      });
    });
    pointerController?.abort();
    pointerController = new AbortController();
    const pointerSignal = { signal: pointerController.signal };
    const finishPointerDrag = () => {
      if (!pointerDrag || !draggedEntry) return;
      suppressClickUntil = Date.now() + 500;
      const { row, target, targetMenu } = pointerDrag;
      row.classList.remove("is-dragging");
      pointerDrag = null;
      if (targetMenu && draggedEntry.kind === "item") {
        moveItemToMenu(draggedEntry.id, targetMenu.dataset.dropMenu);
      } else if (target && target !== row && target.dataset.dragKind === draggedEntry.kind) {
        reorder(
          draggedEntry.kind,
          draggedEntry.id,
          target.dataset.dragItem,
          target.dataset.menuId,
          target.dataset.parentId
        );
      }
      draggedEntry = null;
      root.querySelectorAll(".is-drag-over").forEach((entry) => entry.classList.remove("is-drag-over"));
    };
    const movePointerDrag = (event) => {
      if (!pointerDrag || !draggedEntry) return;
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const target = element?.closest?.("[data-drag-item]");
      const targetMenu = element?.closest?.("[data-drop-menu]");
      if (draggedEntry.kind === "item" && targetMenu
        && targetMenu.dataset.dropMenu !== draggedEntry.menuId
        && (!target || target.dataset.menuId !== draggedEntry.menuId)) {
        pointerDrag.target = null;
        pointerDrag.targetMenu = targetMenu;
        targetMenu.classList.add("is-drag-over");
        return;
      }
      if (!target || target.dataset.dragKind !== draggedEntry.kind || target === pointerDrag.row) return;
      if (pointerDrag.target && pointerDrag.target !== target) {
        pointerDrag.target.classList.remove("is-drag-over");
      }
      if (pointerDrag.targetMenu) {
        pointerDrag.targetMenu.classList.remove("is-drag-over");
        pointerDrag.targetMenu = null;
      }
      pointerDrag.target = target;
      target.classList.add("is-drag-over");
    };
    document.addEventListener("pointermove", movePointerDrag, pointerSignal);
    document.addEventListener("pointerup", finishPointerDrag, pointerSignal);
    document.addEventListener("pointercancel", finishPointerDrag, pointerSignal);
  };

  render();
  void refresh();
  return root;
}
