const parentKey = (item) => String(item.idParentNavigationItem || "");

export const getNavigationBuilderDividerIdsBeforeChildren = (items) => {
  const childrenByParent = new Map();
  for (const item of items) {
    const key = parentKey(item);
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(item);
  }

  const dividerIds = new Set();
  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => Number(a.orderNavigationItem) - Number(b.orderNavigationItem));
    for (let index = 0; index < siblings.length - 1; index += 1) {
      const item = siblings[index];
      const next = siblings[index + 1];
      const hasChildren = childrenByParent.has(String(item.idNavigationItem));
      if (hasChildren && next.typeNavigationItem === "divider") {
        dividerIds.add(String(next.idNavigationItem));
      }
    }
  }
  return dividerIds;
};
