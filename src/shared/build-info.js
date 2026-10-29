const buildId = String(import.meta.env.VITE_PDV_BUILD_ID || "unidentified");

export const buildInfo = Object.freeze({
  id: buildId,
  mode: import.meta.env.MODE,
  isDevelopment: Boolean(import.meta.env.DEV),
  source: import.meta.env.VITE_PDV_BUILD_SOURCE || "local"
});
