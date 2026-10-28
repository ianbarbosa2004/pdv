import { invoke } from "@tauri-apps/api/core";

const defaultIcon = "";

const isTauri = () => Boolean(window.__TAURI_INTERNALS__);

const applyNativeIcon = async (icon) => {
  if (!icon || !isTauri()) return;
  try {
    await invoke("update_window_icon", { data: icon });
  } catch (error) {
    console.error("Não foi possível atualizar o ícone nativo do aplicativo:", error);
  }
};

export const setProjectIcon = (data, mime = "") => {
  const icon = data
    ? (String(data).startsWith("data:") ? String(data) : (mime ? `data:${mime};base64,${data}` : String(data)))
    : defaultIcon;
  document.documentElement.style.setProperty("--pdv-project-icon", icon ? `url("${icon}")` : "none");

  let link = document.querySelector("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.append(link);
  }
  link.href = icon || "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'><rect width='1' height='1' fill='%23315b8a'/></svg>";
  void applyNativeIcon(icon);
};

export const loadProjectIcon = async (apiUrl) => {
  try {
    const response = await fetch(`${apiUrl}/api/company`);
    const payload = await response.json();
    if (response.ok && payload.company) {
      setProjectIcon(payload.company.projectIconDataCompany, payload.company.projectIconMimeCompany);
    }
  } catch {
    setProjectIcon();
  }
};
