const itemId = (item) => String(item.idNavigationItem);

const isRootItem = (item) => !item.idParentNavigationItem;

export const moveNavigationSubtree = (items, draggedId, targetMenuId, getOrder = (item) =>
  Number(item.orderNavigationItem)) => {
  const dragged = items.find((item) => itemId(item) === String(draggedId));
  if (!dragged || ["bar", "divider"].includes(dragged.typeNavigationItem)) return null;
  if (String(dragged.idNavigationMenu) === String(targetMenuId)) return null;

  const subtree = [];
  const pending = [dragged];
  while (pending.length) {
    const current = pending.shift();
    subtree.push(current);
    pending.push(...items.filter((item) =>
      String(item.idParentNavigationItem || "") === itemId(current)
    ));
  }
  const subtreeIds = new Set(subtree.map(itemId));
  const sourceRoots = items
    .filter((item) =>
      String(item.idNavigationMenu) === String(dragged.idNavigationMenu)
      && isRootItem(item)
      && !subtreeIds.has(itemId(item))
    )
    .sort((left, right) => getOrder(left) - getOrder(right));
  const targetRoots = items
    .filter((item) =>
      String(item.idNavigationMenu) === String(targetMenuId)
      && isRootItem(item)
      && !subtreeIds.has(itemId(item))
    )
    .sort((left, right) => getOrder(left) - getOrder(right));

  dragged.idNavigationMenu = Number(targetMenuId);
  dragged.idParentNavigationItem = null;
  targetRoots.push(dragged);
  [...sourceRoots, ...targetRoots].forEach((entry) => {
    const siblings = sourceRoots.includes(entry) ? sourceRoots : targetRoots;
    entry.orderNavigationItem = siblings.indexOf(entry) + 1;
  });
  subtree.slice(1).forEach((entry) => {
    entry.idNavigationMenu = Number(targetMenuId);
  });

  return { dragged, subtree, sourceRoots, targetRoots };
};
