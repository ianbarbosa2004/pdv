import { invoke } from "@tauri-apps/api/core";

const isTauriWindow = () =>

  window.location.hostname === "tauri.localhost" ||

  window.location.protocol === "tauri:";

const normalizeApiUrl = (value) => String(value ?? "").trim().replace(/\/+$/, "");
const validateApiUrl = (value) => {
  const normalized = normalizeApiUrl(value);
  if (!/^https?:\/\/[^/\s]+(?::\d{1,5})?(?:\/[^/\s]*)?$/i.test(normalized)) {
    throw new Error("Informe um endereço válido, como http://192.168.0.10:3000.");
  }
  return normalized;
};

let offlineConfig = {};
const browserOfflineConfigKey = "pdv.offline-config";

const loadBrowserOfflineConfig = () => {
  if (typeof localStorage === "undefined") return {};
  try {
    const stored = localStorage.getItem(browserOfflineConfigKey);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("Não foi possível carregar as configurações locais do navegador:", error);
    return {};
  }
};

const saveBrowserOfflineConfig = () => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(browserOfflineConfigKey, JSON.stringify(offlineConfig));
  } catch (error) {
    console.error("Não foi possível salvar as configurações locais do navegador:", error);
    throw error;
  }
};

export const loadConfiguredApiUrl = async () => {
  offlineConfig = isTauriWindow() ? {} : loadBrowserOfflineConfig();
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
  const normalized = validateApiUrl(value);
  offlineConfig = { ...offlineConfig, apiUrl: normalized };
  if (isTauriWindow()) {
    await invoke("save_offline_config", { config: offlineConfig });
  } else {
    saveBrowserOfflineConfig();
  }
  window.__PDV_API_URL__ = normalized;
  return normalized;
};

export const validateConfiguredApiUrl = validateApiUrl;

export const clearConfiguredApiUrl = async () => {
  if (isTauriWindow()) {
    await invoke("clear_offline_config");
  } else if (typeof localStorage !== "undefined") {
    localStorage.removeItem(browserOfflineConfigKey);
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

export const getApiToken = () =>
  String(window.__PDV_API_TOKEN__ || import.meta.env.VITE_PDV_API_TOKEN || offlineConfig.apiToken || "").trim();

export const getOperatorSessionToken = () =>
  String(window.__PDV_OPERATOR_SESSION__ || offlineConfig.operatorSessionToken || "").trim();

export const getConfiguredTheme = async () =>
  String(offlineConfig.theme || "default").trim();

export const saveConfiguredTheme = async (value) => {
  const normalized = String(value ?? "").trim() || "default";
  offlineConfig = { ...offlineConfig, theme: normalized };
  if (isTauriWindow()) {
    await invoke("save_offline_config", { config: offlineConfig });
  } else {
    saveBrowserOfflineConfig();
  }
  return normalized;
};

export const saveOperatorSessionToken = async (token) => {
  const normalized = String(token ?? "").trim();
  offlineConfig = { ...offlineConfig, operatorSessionToken: normalized };
  if (isTauriWindow()) {
    await invoke("save_offline_config", { config: offlineConfig });
  } else {
    saveBrowserOfflineConfig();
  }
  window.__PDV_OPERATOR_SESSION__ = normalized;
};

export const clearOperatorSessionToken = async () => {
  delete offlineConfig.operatorSessionToken;
  if (isTauriWindow()) {
    await invoke("save_offline_config", { config: offlineConfig });
  } else {
    saveBrowserOfflineConfig();
  }
  delete window.__PDV_OPERATOR_SESSION__;
  delete window.__PDV_OPERATOR__;
};

export const apiFetch = (url, options = {}) => {
  const headers = new Headers(options.headers || {});
  const token = getApiToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const operatorSession = getOperatorSessionToken();
  if (operatorSession) headers.set("X-Operator-Session", operatorSession);
  return fetch(url, { ...options, headers });
};
