const getNavigation = () => window.__PDV_NAVIGATION__ || { items: [] };

export const resolveNavigationHandler = (handlers, key) => {
  const availableHandlers = handlers || {};
  const globalHandlers = window.__PDV_NAVIGATION_HANDLERS__ || {};
  const directHandler = availableHandlers[key] || globalHandlers[key];
  if (typeof directHandler === "function") return directHandler;

  const item = (getNavigation().items || []).find((entry) => entry.keyNavigationItem === key);
  if (!item?.routeNavigationItem) return null;
  const routeHandler = availableHandlers[item.routeNavigationItem]
    || globalHandlers[item.routeNavigationItem];
  return typeof routeHandler === "function" ? routeHandler : null;
};
