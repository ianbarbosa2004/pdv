use base64::{Engine, engine::general_purpose::STANDARD};
use serde::Deserialize;
use serde_json::{Map, Value};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use windows::Win32::Foundation::{HLOCAL, LocalFree};
use windows::Win32::Security::Cryptography::{
    CRYPT_INTEGER_BLOB, CryptProtectData, CryptUnprotectData,
};
use windows::core::PCWSTR;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrintRequest {
    printer_name: String,
    text: String,
    lines: Option<Vec<PrintLine>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrintLine {
    text: String,
    align: String,
    #[serde(default = "default_font_family")]
    font_family: String,
    #[serde(default = "default_font_size")]
    font_size: i32,
    bold: bool,
}

fn default_font_family() -> String {
    "Courier New".to_string()
}

fn default_font_size() -> i32 {
    11
}

#[tauri::command]
fn print_receipt(request: PrintRequest) -> Result<String, String> {
    let printer_name = request.printer_name.trim();
    if printer_name.is_empty() {
        return Err("Informe o nome da impressora instalada no Windows.".to_string());
    }
    send_to_windows_driver(printer_name, &request.text, request.lines.as_deref())?;
    Ok(format!(
        "Cupom renderizado pelo driver e enviado para {printer_name}."
    ))
}

#[tauri::command]
fn list_installed_printers() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        return list_windows_printers();
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("A listagem de impressoras está disponível apenas no Windows.".to_string())
    }
}

#[tauri::command]
fn update_window_icon(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let encoded = data
        .split_once(",")
        .map(|(_, value)| value)
        .unwrap_or(data.as_str())
        .trim();
    if encoded.is_empty() {
        return Err("O ícone do aplicativo não foi informado.".to_string());
    }
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| "O ícone do aplicativo não possui Base64 válido.".to_string())?;
    if bytes.is_empty() || bytes.len() > 512 * 1024 {
        return Err("O ícone do aplicativo deve ter entre 1 byte e 512 KB.".to_string());
    }
    let decoded = image::load_from_memory(&bytes)
        .map_err(|error| format!("Não foi possível interpretar o ícone do aplicativo: {error}"))?
        .to_rgba8();
    let (width, height) = decoded.dimensions();
    let image = tauri::image::Image::new_owned(decoded.into_raw(), width, height);
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "A janela principal do aplicativo não foi encontrada.".to_string())?;
    window
        .set_icon(image)
        .map_err(|error| format!("Não foi possível atualizar o ícone da janela: {error}"))
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let url = url.trim();
    let host = url
        .strip_prefix("https://")
        .and_then(|value| value.split('/').next())
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("");
    if host.is_empty() || (!host.ends_with(".fazenda.mg.gov.br") && host != "fazenda.mg.gov.br") {
        return Err("A URL externa não pertence ao domínio oficial permitido.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", url])
            .spawn()
            .map_err(|error| format!("Não foi possível abrir o navegador externo: {error}"))?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("A abertura do navegador externo está disponível apenas no Windows.".to_string())
    }
}

const FISCAL_WEBVIEW_LABEL: &str = "fiscal-consultation";
const FISCAL_CONSULTATION_URL: &str =
    "https://portalsped.fazenda.mg.gov.br/portalnfce/sistema/consultaarg.xhtml";
const FISCAL_DOM_EVENT: &str = "fiscal-dom-read";
const FISCAL_DOM_ERROR_EVENT: &str = "fiscal-dom-error";
const FISCAL_CONTROLS_SCRIPT: &str = r#"
(() => {
  const toolbarId = "pdv-fiscal-toolbar";
  const mount = () => {
    if (!document.body || document.getElementById(toolbarId)) return;
    const toolbar = document.createElement("div");
    toolbar.id = toolbarId;
    toolbar.style.cssText = [
      "position:fixed",
      "top:8px",
      "right:16px",
      "z-index:2147483647",
      "display:flex",
      "align-items:center",
      "gap:8px",
      "padding:8px 10px",
      "background:#274c77",
      "border:1px solid #16324f",
      "border-radius:4px",
      "box-shadow:0 2px 8px rgba(0,0,0,.25)",
      "font:14px Arial,sans-serif"
    ].join(";");
    const status = document.createElement("span");
    status.textContent = "Consulta fiscal";
    status.style.cssText = "color:#fff;margin-right:4px";
    window.__PDV_FISCAL_STATUS__ = (message, success) => {
      status.textContent = String(message || "Consulta fiscal");
      status.style.color = success ? '#d9f99d' : '#ffd6d6';
      readButton.disabled = false;
      readButton.textContent = "Ler consulta completa";
    };
    const buttonStyle = "border:1px solid #d5e2ef;border-radius:3px;padding:7px 10px;background:#fff;color:#16324f;cursor:pointer;font:600 13px Arial,sans-serif";
    const readButton = document.createElement("button");
    readButton.type = "button";
    readButton.textContent = "Ler consulta completa";
    readButton.style.cssText = buttonStyle;
    readButton.addEventListener("click", async () => {
      readButton.disabled = true;
      readButton.textContent = "Lendo consulta...";
      status.textContent = "Aguarde";
      window.location.href = "pdv://read-fiscal-dom";
    });
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Fechar consulta";
    closeButton.style.cssText = buttonStyle;
    closeButton.addEventListener("click", () => {
      window.location.href = "pdv://close-fiscal-consultation";
    });
    toolbar.append(status, readButton, closeButton);
    document.body.appendChild(toolbar);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();
"#;

fn is_allowed_fiscal_url(url: &str) -> bool {
    let url = url.trim();
    let host = url
        .strip_prefix("https://")
        .and_then(|value| value.split('/').next())
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("");
    host == "portalsped.fazenda.mg.gov.br"
}

#[tauri::command]
async fn open_fiscal_consultation(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(FISCAL_WEBVIEW_LABEL) {
        window
            .show()
            .map_err(|error| format!("Não foi possível exibir a consulta fiscal: {error}"))?;
        window
            .set_focus()
            .map_err(|error| format!("Não foi possível focar a consulta fiscal: {error}"))?;
        return Ok(());
    }

    let url = FISCAL_CONSULTATION_URL
        .parse()
        .map_err(|error| format!("A URL oficial da consulta fiscal é inválida: {error}"))?;
    let navigation_app = app.clone();
    WebviewWindowBuilder::new(&app, FISCAL_WEBVIEW_LABEL, WebviewUrl::External(url))
        .title("Consulta fiscal SEF/MG")
        .inner_size(1200.0, 820.0)
        .min_inner_size(900.0, 640.0)
        .center()
        .resizable(true)
        .initialization_script(FISCAL_CONTROLS_SCRIPT)
        .on_navigation(move |url| {
            let app = navigation_app.clone();
            match url.as_str() {
                "pdv://read-fiscal-dom" => {
                    tauri::async_runtime::spawn(async move {
                        if let Err(error) = read_fiscal_dom(app.clone()).await {
                            if let Some(main_window) = app.get_webview_window("main") {
                                let _ = main_window.emit(FISCAL_DOM_ERROR_EVENT, error);
                            }
                        }
                    });
                    false
                }
                "pdv://close-fiscal-consultation" => {
                    let _ = close_fiscal_consultation(app);
                    false
                }
                _ => is_allowed_fiscal_url(url.as_str()),
            }
        })
        .build()
        .map_err(|error| format!("Não foi possível abrir a consulta fiscal: {error}"))?;
    Ok(())
}

#[tauri::command]
async fn read_fiscal_dom(app: tauri::AppHandle) -> Result<Value, String> {
    let window = app
        .get_webview_window(FISCAL_WEBVIEW_LABEL)
        .ok_or_else(|| "Abra a consulta fiscal antes de ler a tela.".to_string())?;
    let current_url = window.url().map_err(|error| {
        format!("Não foi possível identificar a URL da consulta fiscal: {error}")
    })?;
    if !is_allowed_fiscal_url(current_url.as_str()) {
        return Err("A página atual não pertence ao portal fiscal oficial permitido.".to_string());
    }

    let (sender, receiver) = std::sync::mpsc::channel();
    window
        .eval_with_callback(
            "JSON.stringify({ url: window.location.href, html: document.documentElement.outerHTML })",
            move |value| {
                let _ = sender.send(value);
            },
        )
        .map_err(|error| format!("Não foi possível ler o DOM da consulta fiscal: {error}"))?;

    let callback_value = tauri::async_runtime::spawn_blocking(move || {
        receiver
            .recv_timeout(std::time::Duration::from_secs(10))
            .map_err(|_| "A consulta fiscal não respondeu à leitura do DOM.".to_string())
    })
    .await
    .map_err(|error| format!("Falha ao aguardar a leitura da consulta fiscal: {error}"))??;

    let serialized = serde_json::from_str::<String>(&callback_value).unwrap_or(callback_value);
    let payload: Value = serde_json::from_str(&serialized)
        .map_err(|error| format!("A consulta fiscal retornou um DOM inválido: {error}"))?;
    let page_url = payload
        .get("url")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let html = payload
        .get("html")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !is_allowed_fiscal_url(page_url) || html.trim().is_empty() {
        return Err("A página fiscal não retornou um DOM válido para importação.".to_string());
    }
    if html.len() > 15 * 1024 * 1024 {
        return Err(
            "O DOM da consulta fiscal excede o limite permitido para importação.".to_string(),
        );
    }

    let payload = serde_json::json!({ "url": page_url, "html": html });
    if let Some(main_window) = app.get_webview_window("main") {
        main_window
            .emit(FISCAL_DOM_EVENT, &payload)
            .map_err(|error| format!("Não foi possível enviar a consulta fiscal para o PDV: {error}"))?;
    }
    Ok(payload)
}

#[tauri::command]
fn close_fiscal_consultation(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(FISCAL_WEBVIEW_LABEL) {
        window
            .close()
            .map_err(|error| format!("Não foi possível fechar a consulta fiscal: {error}"))?;
    }
    Ok(())
}

#[tauri::command]
fn set_fiscal_consultation_status(
    app: tauri::AppHandle,
    message: String,
    success: bool,
) -> Result<(), String> {
    let window = app
        .get_webview_window(FISCAL_WEBVIEW_LABEL)
        .ok_or_else(|| "A consulta fiscal não está aberta.".to_string())?;
    let message = serde_json::to_string(&message)
        .map_err(|error| format!("Não foi possível preparar o status da consulta: {error}"))?;
    window
        .eval(&format!(
            "window.__PDV_FISCAL_STATUS__?.({}, {});",
            message, success
        ))
        .map_err(|error| format!("Não foi possível atualizar o status da consulta fiscal: {error}"))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn get_selected_printer(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = printer_preference_path(&app)?;
    match std::fs::read_to_string(path) {
        Ok(value) => {
            let value = value.trim().to_string();
            Ok((!value.is_empty()).then_some(value))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!(
            "Não foi possível ler a impressora selecionada: {error}"
        )),
    }
}

#[tauri::command]
fn save_selected_printer(app: tauri::AppHandle, printer_name: String) -> Result<(), String> {
    let printer_name = printer_name.trim();
    if printer_name.is_empty() {
        return Err("Selecione uma impressora antes de salvar.".to_string());
    }
    let path = printer_preference_path(&app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            format!("Não foi possível criar o diretório de preferências: {error}")
        })?;
    }
    std::fs::write(path, printer_name.as_bytes())
        .map_err(|error| format!("Não foi possível salvar a impressora selecionada: {error}"))
}

fn printer_preference_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Não foi possível localizar os dados da aplicação: {error}"))?
        .join("thermal-printer.txt"))
}

fn offline_config_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Não foi possível localizar os dados da aplicação: {error}"))?
        .join("offline-config.json"))
}

fn offline_token_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Não foi possível localizar os dados da aplicação: {error}"))?
        .join("api-token.bin"))
}

fn protect_api_token(token: &str) -> Result<Vec<u8>, String> {
    let bytes = token.as_bytes();
    let input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptProtectData(&input, PCWSTR::null(), None, None, None, 0, &mut output)
            .map_err(|error| format!("Não foi possível proteger o token da API: {error}"))?;
        let protected = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(output.pbData as *mut _)));
        Ok(protected)
    }
}

fn unprotect_api_token(protected: &[u8]) -> Result<String, String> {
    let input = CRYPT_INTEGER_BLOB {
        cbData: protected.len() as u32,
        pbData: protected.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptUnprotectData(&input, None, None, None, None, 0, &mut output)
            .map_err(|error| format!("Não foi possível descriptografar o token da API: {error}"))?;
        let token = String::from_utf8(
            std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec(),
        )
        .map_err(|_| "O token protegido da API não contém texto UTF-8 válido.".to_string());
        let _ = LocalFree(Some(HLOCAL(output.pbData as *mut _)));
        token
    }
}

fn save_api_token(app: &tauri::AppHandle, token: &str) -> Result<(), String> {
    let path = offline_token_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            format!("Não foi possível criar o diretório de configuração: {error}")
        })?;
    }
    let protected = protect_api_token(token)?;
    std::fs::write(path, protected)
        .map_err(|error| format!("Não foi possível salvar o token protegido da API: {error}"))
}

fn load_api_token(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let path = offline_token_path(app)?;
    match std::fs::read(path) {
        Ok(protected) => unprotect_api_token(&protected).map(Some),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!(
            "Não foi possível ler o token protegido da API: {error}"
        )),
    }
}

fn clear_api_token(app: &tauri::AppHandle) -> Result<(), String> {
    let path = offline_token_path(app)?;
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Não foi possível remover o token da API: {error}")),
    }
}

#[tauri::command]
fn load_offline_config(app: tauri::AppHandle) -> Result<Value, String> {
    let path = offline_config_path(&app)?;
    let mut config = match std::fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str(&contents)
            .map_err(|error| format!("Não foi possível ler as configurações offline: {error}"))?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let legacy_path = app
                .path()
                .app_data_dir()
                .map_err(|path_error| {
                    format!("Não foi possível localizar os dados da aplicação: {path_error}")
                })?
                .join("api-config.json");
            match std::fs::read_to_string(&legacy_path) {
                Ok(contents) => {
                    let config: Value = serde_json::from_str(&contents).map_err(|parse_error| {
                        format!("Não foi possível migrar a configuração da API: {parse_error}")
                    })?;
                    save_offline_config(app.clone(), config.clone())?;
                    let _ = std::fs::remove_file(legacy_path);
                    config
                }
                Err(legacy_error) if legacy_error.kind() == std::io::ErrorKind::NotFound => {
                    Value::Object(Map::new())
                }
                Err(legacy_error) => {
                    return Err(format!(
                        "Não foi possível ler as configurações offline: {legacy_error}"
                    ));
                }
            }
        }
        Err(error) => {
            return Err(format!(
                "Não foi possível ler as configurações offline: {error}"
            ));
        }
    };
    let legacy_token = config.as_object_mut().and_then(|object| {
        object
            .remove("apiToken")
            .and_then(|value| value.as_str().map(|value| value.to_owned()))
    });
    if let Some(token) = legacy_token {
        save_api_token(&app, &token)?;
        save_offline_config(app.clone(), config.clone())?;
    }
    if let Some(object) = config.as_object_mut() {
        if let Some(token) = load_api_token(&app)? {
            object.insert("apiToken".to_string(), Value::String(token));
        }
    }
    Ok(config)
}

#[tauri::command]
fn save_offline_config(app: tauri::AppHandle, config: Value) -> Result<(), String> {
    let Some(incoming) = config.as_object() else {
        return Err("As configurações offline devem estar em formato de objeto JSON.".to_string());
    };
    if let Some(token) = incoming.get("apiToken").and_then(Value::as_str) {
        if !token.is_empty() {
            save_api_token(&app, token)?;
        }
    }
    let path = offline_config_path(&app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            format!("Não foi possível criar o diretório de configuração: {error}")
        })?;
    }
    let mut merged = match std::fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str::<Value>(&contents).map_err(|error| {
            format!("Não foi possível ler as configurações offline existentes: {error}")
        })?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Value::Object(Map::new()),
        Err(error) => {
            return Err(format!(
                "Não foi possível ler as configurações offline existentes: {error}"
            ));
        }
    };
    let Some(existing) = merged.as_object_mut() else {
        return Err(
            "As configurações offline existentes devem estar em formato de objeto JSON."
                .to_string(),
        );
    };
    for (key, value) in incoming {
        if key != "apiToken" {
            existing.insert(key.clone(), value.clone());
        }
    }
    let contents = serde_json::to_string_pretty(&merged).map_err(|error| {
        format!("Não foi possível serializar as configurações offline: {error}")
    })?;
    let temporary_path = path.with_extension("json.tmp");
    std::fs::write(&temporary_path, contents)
        .map_err(|error| format!("Não foi possível preparar as configurações offline: {error}"))?;
    if let Err(error) = std::fs::remove_file(&path) {
        if error.kind() != std::io::ErrorKind::NotFound {
            let _ = std::fs::remove_file(&temporary_path);
            return Err(format!(
                "Não foi possível substituir as configurações offline: {error}"
            ));
        }
    }
    std::fs::rename(&temporary_path, &path)
        .map_err(|error| format!("Não foi possível salvar as configurações offline: {error}"))
}

#[tauri::command]
fn clear_offline_config(app: tauri::AppHandle) -> Result<(), String> {
    clear_api_token(&app)?;
    let path = offline_config_path(&app)?;
    let contents = match std::fs::read_to_string(&path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => {
            return Err(format!(
                "Não foi possível ler as configurações offline: {error}"
            ));
        }
    };
    if !contents.is_empty() {
        let mut config = serde_json::from_str::<Value>(&contents)
            .map_err(|error| format!("Não foi possível ler as configurações offline: {error}"))?;
        if let Some(object) = config.as_object_mut() {
            object.remove("apiUrl");
            let updated = serde_json::to_string_pretty(&config).map_err(|error| {
                format!("Não foi possível serializar as configurações offline: {error}")
            })?;
            let temporary_path = path.with_extension("json.tmp");
            std::fs::write(&temporary_path, updated).map_err(|error| {
                format!("Não foi possível preparar as configurações offline: {error}")
            })?;
            if let Err(error) = std::fs::remove_file(&path) {
                if error.kind() != std::io::ErrorKind::NotFound {
                    let _ = std::fs::remove_file(&temporary_path);
                    return Err(format!(
                        "Não foi possível substituir as configurações offline: {error}"
                    ));
                }
            }
            std::fs::rename(&temporary_path, &path).map_err(|error| {
                format!("Não foi possível salvar as configurações offline: {error}")
            })?;
        } else {
            return Err(
                "As configurações offline existentes devem estar em formato de objeto JSON."
                    .to_string(),
            );
        }
    }
    let legacy_path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Não foi possível localizar os dados da aplicação: {error}"))?
        .join("api-config.json");
    if let Err(error) = std::fs::remove_file(legacy_path) {
        if error.kind() != std::io::ErrorKind::NotFound {
            return Err(format!(
                "Não foi possível remover a configuração antiga da API: {error}"
            ));
        }
    }
    Ok(())
}

fn list_windows_printers() -> Result<Vec<String>, String> {
    use windows::Win32::Graphics::Printing::{
        EnumPrintersW, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_4W,
    };
    use windows::core::PCWSTR;

    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let mut required_bytes = 0u32;
    let mut returned = 0u32;

    unsafe {
        let _ = EnumPrintersW(
            flags,
            PCWSTR::null(),
            4,
            None,
            &mut required_bytes,
            &mut returned,
        );
        if required_bytes == 0 {
            return Ok(Vec::new());
        }

        let mut buffer = vec![0u8; required_bytes as usize];
        EnumPrintersW(
            flags,
            PCWSTR::null(),
            4,
            Some(&mut buffer),
            &mut required_bytes,
            &mut returned,
        )
        .map_err(|error| format!("Não foi possível listar as impressoras do Windows: {error}"))?;

        let entries = std::slice::from_raw_parts(
            buffer.as_ptr() as *const PRINTER_INFO_4W,
            returned as usize,
        );
        let mut printers = entries
            .iter()
            .filter_map(|entry| {
                if entry.pPrinterName.0.is_null() {
                    return None;
                }
                let mut length = 0usize;
                while *entry.pPrinterName.0.add(length) != 0 {
                    length += 1;
                }
                let name = String::from_utf16_lossy(std::slice::from_raw_parts(
                    entry.pPrinterName.0,
                    length,
                ));
                (!name.trim().is_empty()).then_some(name)
            })
            .collect::<Vec<_>>();
        printers.sort_unstable_by_key(|name| name.to_lowercase());
        printers.dedup();
        Ok(printers)
    }
}

#[cfg(target_os = "windows")]
fn send_to_windows_driver(
    printer_name: &str,
    text: &str,
    lines: Option<&[PrintLine]>,
) -> Result<(), String> {
    use std::iter::once;
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Foundation::SIZE;
    use windows::Win32::Graphics::Gdi::{
        CLIP_DEFAULT_PRECIS, CreateDCW, CreateFontW, DEFAULT_CHARSET, DEFAULT_PITCH,
        DEFAULT_QUALITY, DeleteObject, FF_DONTCARE, GetDeviceCaps, GetTextExtentPoint32W,
        GetTextMetricsW, HORZRES, OUT_DEFAULT_PRECIS, SelectObject, TEXTMETRICW, TextOutW,
    };
    use windows::Win32::Storage::Xps::{DOCINFOW, EndDoc, EndPage, StartDocW, StartPage};
    use windows::core::PCWSTR;

    let driver: Vec<u16> = std::ffi::OsStr::new("WINSPOOL")
        .encode_wide()
        .chain(once(0))
        .collect();
    let printer: Vec<u16> = std::ffi::OsStr::new(printer_name)
        .encode_wide()
        .chain(once(0))
        .collect();
    let document_name: Vec<u16> = std::ffi::OsStr::new("PDV - teste USB")
        .encode_wide()
        .chain(once(0))
        .collect();

    unsafe {
        let device = CreateDCW(
            PCWSTR(driver.as_ptr()),
            PCWSTR(printer.as_ptr()),
            PCWSTR::null(),
            None,
        );
        if device.is_invalid() {
            return Err("Não foi possível abrir o driver da impressora.".to_string());
        }

        let document_info = DOCINFOW {
            cbSize: std::mem::size_of::<DOCINFOW>() as i32,
            lpszDocName: PCWSTR(document_name.as_ptr()),
            lpszOutput: PCWSTR::null(),
            lpszDatatype: PCWSTR::null(),
            fwType: 0,
        };
        if StartDocW(device, &document_info) <= 0 {
            let _ = windows::Win32::Graphics::Gdi::DeleteDC(device);
            return Err("O driver não iniciou o trabalho de impressão.".to_string());
        }
        if StartPage(device) <= 0 {
            let _ = EndDoc(device);
            let _ = windows::Win32::Graphics::Gdi::DeleteDC(device);
            return Err("O driver não iniciou a página de impressão.".to_string());
        }

        let printable_lines = lines.map(|items| items.to_vec()).unwrap_or_else(|| {
            text.lines()
                .map(|value| PrintLine {
                    text: value.to_string(),
                    align: "left".to_string(),
                    font_family: default_font_family(),
                    font_size: default_font_size(),
                    bold: false,
                })
                .collect()
        });
        let page_width = GetDeviceCaps(Some(device), HORZRES).max(1);
        let mut y = 0i32;
        for item in printable_lines {
            let item_size = item.font_size.clamp(6, 48);
            let height = -item_size;
            let family: Vec<u16> = std::ffi::OsStr::new(&item.font_family)
                .encode_wide()
                .chain(once(0))
                .collect();
            let font = CreateFontW(
                height,
                0,
                0,
                0,
                if item.bold { 700 } else { 400 },
                0,
                0,
                0,
                DEFAULT_CHARSET,
                OUT_DEFAULT_PRECIS,
                CLIP_DEFAULT_PRECIS,
                DEFAULT_QUALITY,
                DEFAULT_PITCH.0 as u32 | FF_DONTCARE.0 as u32,
                PCWSTR(family.as_ptr()),
            );
            if font.is_invalid() {
                let _ = EndPage(device);
                let _ = EndDoc(device);
                let _ = windows::Win32::Graphics::Gdi::DeleteDC(device);
                return Err("Não foi possível criar a fonte selecionada.".to_string());
            }
            let _ = SelectObject(device, font.into());
            let mut metrics = TEXTMETRICW::default();
            if GetTextMetricsW(device, &mut metrics).0 == 0 {
                let _ = DeleteObject(font.into());
                let _ = EndPage(device);
                let _ = EndDoc(device);
                let _ = windows::Win32::Graphics::Gdi::DeleteDC(device);
                return Err("Não foi possível obter as métricas da fonte selecionada.".to_string());
            }
            let line: Vec<u16> = std::ffi::OsStr::new(&item.text).encode_wide().collect();
            let mut extent = SIZE::default();
            if GetTextExtentPoint32W(device, &line, &mut extent).0 == 0 {
                let _ = DeleteObject(font.into());
                let _ = EndPage(device);
                let _ = EndDoc(device);
                let _ = windows::Win32::Graphics::Gdi::DeleteDC(device);
                return Err("Não foi possível medir uma linha do cupom.".to_string());
            }
            let x = match item.align.as_str() {
                "center" => ((page_width - extent.cx) / 2).max(0),
                "right" => (page_width - extent.cx).max(0),
                _ => 0,
            };
            if TextOutW(device, x, y, &line).0 == 0 {
                let _ = DeleteObject(font.into());
                let _ = EndPage(device);
                let _ = EndDoc(device);
                let _ = windows::Win32::Graphics::Gdi::DeleteDC(device);
                return Err("O driver não conseguiu renderizar uma linha.".to_string());
            }
            y += (metrics.tmHeight + metrics.tmExternalLeading + 2).max(16);
            let _ = DeleteObject(font.into());
        }

        if EndPage(device) <= 0 || EndDoc(device) <= 0 {
            let _ = windows::Win32::Graphics::Gdi::DeleteDC(device);
            return Err("O driver não concluiu o trabalho de impressão.".to_string());
        }
        let _ = windows::Win32::Graphics::Gdi::DeleteDC(device);
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
fn send_to_windows_driver(
    _printer_name: &str,
    _text: &str,
    _lines: Option<&[PrintLine]>,
) -> Result<(), String> {
    Err("A impressão USB direta está disponível apenas no Windows.".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            print_receipt,
            list_installed_printers,
            update_window_icon,
            open_external_url,
            get_selected_printer,
            save_selected_printer,
            load_offline_config,
            save_offline_config,
            clear_offline_config,
            open_fiscal_consultation,
            read_fiscal_dom,
            close_fiscal_consultation,
            set_fiscal_consultation_status
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
