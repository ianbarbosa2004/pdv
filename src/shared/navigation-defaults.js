export const normalizeNavigationKey = (value) => String(value ?? "").trim().toLowerCase();

export const isNavigationKey = (value, expectedKey) =>
  normalizeNavigationKey(value) === normalizeNavigationKey(expectedKey);
