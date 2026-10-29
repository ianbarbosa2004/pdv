const getNavigation = () => window.__PDV_NAVIGATION__ || { items: [] };

export const resolveNavigationHandler = (handlers, key) => {
  const availableHandlers = handlers || {};
  const globalHandlers = window.__PDV_NAVIGATION_HANDLERS__ || {};
  const directHandler = availableHandlers[key] || globalHandlers[key];
  const item = (getNavigation().items || []).find((entry) => entry.keyNavigationItem === key);
  if (!item) return typeof directHandler === "function" ? directHandler : null;
  const resolveRoute = (route) => {
    const handler = availableHandlers[route] || globalHandlers[route];
    return typeof handler === "function" ? handler : null;
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
