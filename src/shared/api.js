import { invoke } from "@tauri-apps/api/core";

const isTauriWindow = () =>

  window.location.hostname === "tauri.localhost" ||

  window.location.protocol === "tauri:";

const normalizeApiUrl = (value) => String(value ?? "").trim().replace(/\/+$/, "");

let offlineConfig = {};

export const loadConfiguredApiUrl = async () => {
  if (isTauriWindow()) {
    try {
      const config = await invoke("load_offline_config");
      offlineConfig = config && typeof config === "object" ? config : {};
    } catch (error) {
      console.error("Não foi possível carregar as configurações offline:", error);
    }
  }
  return normalizeApiUrl(offlineConfig.apiUrl);
};

export const getConfiguredApiUrl = () =>
  normalizeApiUrl(window.__PDV_API_URL__) ||
  normalizeApiUrl(offlineConfig.apiUrl) ||
  normalizeApiUrl(import.meta.env.VITE_PDV_API_URL);

export const saveConfiguredApiUrl = async (value) => {
  const normalized = normalizeApiUrl(value);
  if (!/^https?:\/\/[^/\s]+(?::\d{1,5})?(?:\/[^/\s]*)?$/i.test(normalized)) {
    throw new Error("Informe um endereço válido, como http://192.168.0.10:3000.");
  }
  offlineConfig = { ...offlineConfig, apiUrl: normalized };
  if (isTauriWindow()) {
    await invoke("save_offline_config", { config: offlineConfig });
  }
  window.__PDV_API_URL__ = normalized;
  return normalized;
};

export const clearConfiguredApiUrl = async () => {
  if (isTauriWindow()) {
    await invoke("clear_offline_config");
  }
  offlineConfig = {};
  delete window.__PDV_API_URL__;
};

export const getApiUrl = () => {

  const configured = getConfiguredApiUrl();

  if (configured) return configured.replace(/\/+$/, "");



  const host = isTauriWindow()

    ? "127.0.0.1"

    : window.location.hostname || "127.0.0.1";

  return `http://${host}:3000`;

}; 
