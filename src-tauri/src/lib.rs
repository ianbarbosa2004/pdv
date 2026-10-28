use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use std::io::Write;
use std::net::TcpStream;
use std::thread;
use std::time::Duration;
use tauri::Manager;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrintRequest {
    transport: String,
    printer_name: Option<String>,
    host: Option<String>,
    port: Option<u16>,
    data_base64: String,
    text: Option<String>,
    lines: Option<Vec<PrintLine>>,
    font_family: Option<String>,
    font_size: Option<i32>,
    bold: Option<bool>,
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
fn send_raw_print(request: PrintRequest) -> Result<String, String> {
    match request.transport.as_str() {
        "network" => {
            let data = decode_base64(&request.data_base64)?;
            if data.is_empty() {
                return Err("O conteúdo da impressão está vazio.".to_string());
            }
            let host = request.host.as_deref().unwrap_or("").trim();
            if host.is_empty() {
                return Err("Informe o endereço IP ou nome da impressora.".to_string());
            }
            let port = request.port.unwrap_or(9100);
            let mut stream = TcpStream::connect((host, port)).map_err(|error| {
                format!("Não foi possível conectar à impressora de rede: {error}")
            })?;
            for chunk in data.chunks(128) {
                stream.write_all(chunk).map_err(|error| {
                    format!("Não foi possível enviar os dados à impressora de rede: {error}")
                })?;
                stream.flush().map_err(|error| {
                    format!("Não foi possível liberar os dados para a impressora: {error}")
                })?;
                thread::sleep(Duration::from_millis(20));
            }
            stream.flush().map_err(|error| {
                format!("Não foi possível finalizar o envio à impressora: {error}")
            })?;
            thread::sleep(Duration::from_millis(500));
            Ok(format!(
                "Teste enviado para {host}:{port} ({} bytes).",
                data.len()
            ))
        }
        "usb" => {
            let printer_name = request.printer_name.as_deref().unwrap_or("").trim();
            if printer_name.is_empty() {
                return Err("Informe o nome da impressora instalada no Windows.".to_string());
            }
            let text = request
                .text
                .as_deref()
                .ok_or_else(|| "O texto da impressão não foi informado.".to_string())?;
            send_to_windows_driver(
                printer_name,
                text,
                request.lines.as_deref(),
                request.font_family.as_deref().unwrap_or("Courier New"),
                request.font_size.unwrap_or(14),
                request.bold.unwrap_or(false),
            )?;
            Ok(format!("Cupom renderizado pelo driver e enviado para {printer_name}."))
        }
        _ => Err("Transporte de impressão inválido.".to_string()),
    }
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

fn decode_base64(value: &str) -> Result<Vec<u8>, String> {
    let mut output = Vec::with_capacity(value.len() * 3 / 4);
    let mut buffer = 0u32;
    let mut bits = 0u8;
    for character in value.bytes() {
        let digit = match character {
            b'A'..=b'Z' => character - b'A',
            b'a'..=b'z' => character - b'a' + 26,
            b'0'..=b'9' => character - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' => break,
            b'\r' | b'\n' | b' ' | b'\t' => continue,
            _ => return Err("Conteúdo de impressão em Base64 inválido.".to_string()),
        };
        buffer = (buffer << 6) | u32::from(digit);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            output.push((buffer >> bits) as u8);
            buffer &= (1 << bits) - 1;
        }
    }
    Ok(output)
}

#[cfg(target_os = "windows")]
fn send_to_windows_driver(
    printer_name: &str,
    text: &str,
    lines: Option<&[PrintLine]>,
    font_family: &str,
    font_size: i32,
    bold: bool,
) -> Result<(), String> {
    use std::iter::once;
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Graphics::Gdi::{
        CLIP_DEFAULT_PRECIS, CreateDCW, CreateFontW, DEFAULT_CHARSET, DEFAULT_PITCH,
        DEFAULT_QUALITY, DeleteObject, FF_DONTCARE, GetDeviceCaps, GetTextExtentPoint32W,
        GetTextMetricsW, HORZRES, OUT_DEFAULT_PRECIS, SelectObject,
        TextOutW, TEXTMETRICW,
    };
    use windows::Win32::Foundation::SIZE;
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
            text.lines().map(|value| PrintLine {
                text: value.to_string(),
                align: "left".to_string(),
                font_family: font_family.to_string(),
                font_size,
                bold,
            }).collect()
        });
        let page_width = GetDeviceCaps(Some(device), HORZRES).max(1);
        let mut y = 0i32;
        for item in printable_lines {
            let item_size = item.font_size.clamp(6, 48);
            let height = -item_size;
            let family: Vec<u16> = std::ffi::OsStr::new(&item.font_family)
                .encode_wide().chain(once(0)).collect();
            let font = CreateFontW(
                height, 0, 0, 0, if item.bold { 700 } else { 400 }, 0, 0, 0,
                DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
                DEFAULT_QUALITY, DEFAULT_PITCH.0 as u32 | FF_DONTCARE.0 as u32,
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
    _font_family: &str,
    _font_size: i32,
    _bold: bool,
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
            send_raw_print,
            list_installed_printers,
            update_window_icon,
            get_selected_printer,
            save_selected_printer
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
