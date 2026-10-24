export function calculateSaleTotals(items) {
  const normalizedItems = items.filter(
    (item) =>
      Number.isInteger(item.quantity) &&
      item.quantity > 0 &&
      Number.isFinite(item.price) &&
      item.price >= 0
  );

  const itemCount = normalizedItems.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = normalizedItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  return {
    itemCount,
    subtotal,
    total: subtotal
  };
}
