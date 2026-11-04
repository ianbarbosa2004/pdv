const getNavigation = () => window.__PDV_NAVIGATION__ || { items: [] };

const toHandlerKey = (key) =>
  `on${String(key ?? "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("")}`;

const findHandler = (handlers, key) => {
  const availableHandlers = handlers || {};
  const directHandler = availableHandlers[key];
  if (typeof directHandler === "function") return directHandler;
  const conventionHandler = availableHandlers[toHandlerKey(key)];
  return typeof conventionHandler === "function" ? conventionHandler : null;
};

export const resolveNavigationHandler = (handlers, key) => {
  const availableHandlers = handlers || {};
  const globalHandlers = window.__PDV_NAVIGATION_HANDLERS__ || {};
  const directHandler = findHandler(availableHandlers, key) || findHandler(globalHandlers, key);
  const item = (getNavigation().items || []).find((entry) => entry.keyNavigationItem === key);
  if (!item) return typeof directHandler === "function" ? directHandler : null;
  const resolveRoute = (route) => {
    return findHandler(availableHandlers, route) || findHandler(globalHandlers, route);
  };
  if (typeof directHandler === "function") return directHandler;
  if (item.routeNavigationItem) return resolveRoute(item.routeNavigationItem);

  const child = (getNavigation().items || [])
    .filter((entry) =>
      String(entry.idParentNavigationItem) === String(item.idNavigationItem)
      && entry.isActiveNavigationItem !== 0
      && entry.routeNavigationItem
    )
    .sort((left, right) =>
      Number(left.orderNavigationItem || 0) - Number(right.orderNavigationItem || 0)
    )[0];
  return child ? resolveRoute(child.routeNavigationItem) : directHandler;
};
