mod biometrics;
use biometrics::{lock_status, unlock, lock_session, set_biometric_lock};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::{sync::Mutex, time::Duration};
use tauri::{Manager, State};

#[derive(Clone, Serialize, Deserialize)]
struct Pairing {
    url: String,
    token: String,
    certificate: String,
}
#[derive(Clone)]
struct Connection {
    pairing: Pairing,
    client: reqwest::Client,
}
#[derive(Default)]
struct AppState(Mutex<Option<Connection>>, tokio::sync::Mutex<()>);
#[derive(Clone, Serialize, Deserialize)]
struct Profile { id: String, name: String, pairing: Pairing }
#[derive(Default, Serialize, Deserialize)]
struct Profiles { active: Option<String>, items: Vec<Profile> }
#[derive(Serialize)]
struct ProfileInfo { id: String, name: String, url: String, active: bool }
async fn read_profiles(app: &tauri::AppHandle) -> Result<Profiles, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    match tokio::fs::read(dir.join("profiles.json")).await {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| "Profils enregistrés invalides".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            match tokio::fs::read(dir.join("pairing.json")).await {
                Ok(bytes) => {
                    let pairing: Pairing = serde_json::from_slice(&bytes).map_err(|_| "Ancien appairage invalide")?;
                    Ok(Profiles { active: Some("legacy".into()), items: vec![Profile { id: "legacy".into(), name: "Mon PC".into(), pairing }] })
                },
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Profiles::default()),
                Err(e) => Err(e.to_string()),
            }
        },
        Err(e) => Err(e.to_string()),
    }
}
async fn write_profiles(app: &tauri::AppHandle, profiles: &Profiles) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    tokio::fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;
    let temp = dir.join("profiles.tmp");
    tokio::fs::write(&temp, serde_json::to_vec(profiles).map_err(|e| e.to_string())?).await.map_err(|e| e.to_string())?;
    tokio::fs::rename(&temp, dir.join("profiles.json")).await.map_err(|e| e.to_string())?;
    // The private native store is excluded from Android backup by the manifest.
    match tokio::fs::remove_file(dir.join("pairing.json")).await {
        Ok(()) => (), Err(e) if e.kind() == std::io::ErrorKind::NotFound => (), Err(e) => return Err(e.to_string())
    }
    Ok(())
}
#[tauri::command]
async fn list_profiles(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<Vec<ProfileInfo>, String> {
    biometrics::guard(&app).await?;
    let _guard = state.1.lock().await;
    let data = read_profiles(&app).await?;
    Ok(data.items.iter().map(|p| ProfileInfo { id: p.id.clone(), name: p.name.clone(), url: p.pairing.url.clone(), active: data.active.as_ref() == Some(&p.id) }).collect())
}
#[tauri::command]
async fn get_profile(app: tauri::AppHandle, state: State<'_, AppState>, id: String) -> Result<Profile, String> {
    biometrics::guard(&app).await?;
    let _guard = state.1.lock().await;
    read_profiles(&app).await?.items.into_iter().find(|p| p.id == id).ok_or("Profil inconnu".into())
}
#[tauri::command]
async fn save_profile(app: tauri::AppHandle, state: State<'_, AppState>, id: Option<String>, name: String, pairing: Pairing) -> Result<String, String> {
    biometrics::guard(&app).await?;
    let _guard = state.1.lock().await;
    if name.trim().is_empty() || name.chars().count() > 80 { return Err("Nom : 1 à 80 caractères".into()); }
    connection(pairing.clone())?;
    let mut data = read_profiles(&app).await?;
    let id = match id {
        Some(id) => { if !data.items.iter().any(|p| p.id == id) { return Err("Profil inconnu".into()); } id },
        None => {
            if data.items.len() >= 50 { return Err("50 profils maximum".into()); }
            format!("p{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos())
        }
    };
    let changed_active = data.active.as_ref() == Some(&id);
    data.items.retain(|p| p.id != id);
    data.items.push(Profile { id: id.clone(), name: name.trim().into(), pairing });
    if changed_active { data.active = None; }
    write_profiles(&app, &data).await?;
    if changed_active { *state.0.lock().map_err(|_| "État indisponible")? = None; }
    Ok(id)
}
#[tauri::command]
async fn activate_profile(app: tauri::AppHandle, state: State<'_, AppState>, id: String) -> Result<String, String> {
    biometrics::guard(&app).await?;
    let _guard = state.1.lock().await;
    let mut data = read_profiles(&app).await?;
    let p = data.items.iter().find(|p| p.id == id).ok_or("Profil inconnu")?;
    let c = connection(p.pairing.clone())?;
    request(&c, "/api/system_stats", None).await?;
    let url = c.pairing.url.clone();
    data.active = Some(id);
    write_profiles(&app, &data).await?;
    *state.0.lock().map_err(|_| "État indisponible")? = Some(c);
    Ok(url)
}
#[tauri::command]
async fn delete_profile(app: tauri::AppHandle, state: State<'_, AppState>, id: String) -> Result<(), String> {
    biometrics::guard(&app).await?;
    let _guard = state.1.lock().await;
    let mut data = read_profiles(&app).await?;
    let active = data.active.as_ref() == Some(&id);
    data.items.retain(|p| p.id != id);
    if active { data.active = None; }
    write_profiles(&app, &data).await?;
    if active { *state.0.lock().map_err(|_| "État indisponible")? = None; }
    Ok(())
}
fn connection(p: Pairing) -> Result<Connection, String> {
    let url = reqwest::Url::parse(&p.url).map_err(|_| "Adresse invalide")?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Une adresse HTTPS sans chemin est requise".into());
    }
    if p.token.len() < 32 || p.token.len() > 256 {
        return Err("Clé d’accès invalide".into());
    }
    let cert = reqwest::Certificate::from_pem(p.certificate.as_bytes())
        .map_err(|_| "Certificat invalide")?;
    let client = reqwest::Client::builder()
        .no_proxy()
        .tls_built_in_root_certs(false)
        .add_root_certificate(cert)
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(45))
        .connect_timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    Ok(Connection { pairing: p, client })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_insecure_addresses() {
        for url in [
            "http://192.168.1.1:8189",
            "https://example.com/path",
            "https://user:pass@example.com/",
        ] {
            assert!(connection(Pairing {
                url: url.into(),
                token: "x".repeat(64),
                certificate: String::new()
            })
            .is_err());
        }
    }
    #[test]
    #[ignore = "Requires live companion and COMFY_PAIRING_FILE"]
    fn live_native_tls() {
        let path = std::env::var("COMFY_PAIRING_FILE").expect("COMFY_PAIRING_FILE");
        let pairing: Pairing = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        let c = connection(pairing).unwrap();
        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(async {
            c.client
                .get(format!("{}/api/system_stats", c.pairing.url))
                .bearer_auth(&c.pairing.token)
                .send()
                .await
        });
        assert!(result.is_ok(), "{:?}", result.err());
    }
}
fn current(state: &State<AppState>) -> Result<Connection, String> {
    state
        .0
        .lock()
        .map_err(|_| "État indisponible")?
        .clone()
        .ok_or("Connectez le PC".into())
}
async fn request(
    c: &Connection,
    path: &str,
    body: Option<serde_json::Value>,
) -> Result<reqwest::Response, String> {
    if !path.starts_with("/api/") && !path.starts_with("/bridge/") {
        return Err("Route interdite".into());
    }
    if path.contains('\\') || path.contains("..") || path.contains('#') {
        return Err("Route invalide".into());
    }
    let url = format!("{}{}", c.pairing.url.trim_end_matches('/'), path);
    let builder = if let Some(b) = body {
        c.client.post(url).json(&b)
    } else {
        c.client.get(url)
    };
    let response = builder
        .bearer_auth(&c.pairing.token)
        .send()
        .await
        .map_err(|_| {
            "Connexion impossible. Vérifiez le PC, le VPN, l’adresse et le certificat.".to_string()
        })?;
    if !response.status().is_success() {
        let code = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!(
            "Serveur {code} : {}",
            text.chars().take(1800).collect::<String>()
        ));
    }
    Ok(response)
}
#[tauri::command]
async fn connect(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    pairing: Pairing,
    remember: bool,
) -> Result<serde_json::Value, String> {
    biometrics::guard(&app).await?;
    let c = connection(pairing)?;
    let stats = request(&c, "/api/system_stats", None)
        .await?
        .json()
        .await
        .map_err(|e| format!("Réponse ComfyUI invalide : {e}"))?;
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| e.to_string())?;
    let path = dir.join("pairing.json");
    if remember {
        tokio::fs::write(&path, serde_json::to_vec(&c.pairing).unwrap())
            .await
            .map_err(|e| e.to_string())?;
    } else if path.exists() {
        tokio::fs::remove_file(&path)
            .await
            .map_err(|e| e.to_string())?;
    }
    *state.0.lock().map_err(|_| "État indisponible")? = Some(c);
    Ok(stats)
}
#[tauri::command]
async fn restore(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    biometrics::guard(&app).await?;
    let _guard = state.1.lock().await;
    let data = read_profiles(&app).await?;
    if let Some(profile) = data.items.iter().find(|p| Some(&p.id) == data.active.as_ref()) {
        let c = connection(profile.pairing.clone())?;
        let url = c.pairing.url.clone();
        *state.0.lock().map_err(|_| "État indisponible")? = Some(c);
        return Ok(Some(url));
    }
    if app.path().app_config_dir().map_err(|e| e.to_string())?.join("profiles.json").exists() { return Ok(None); }
    let path = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("pairing.json");
    if !path.exists() {
        return Ok(None);
    }
    let p: Pairing =
        serde_json::from_slice(&tokio::fs::read(path).await.map_err(|e| e.to_string())?)
            .map_err(|_| "Appairage enregistré invalide")?;
    let c = connection(p)?;
    let url = c.pairing.url.clone();
    *state.0.lock().map_err(|_| "État indisponible")? = Some(c);
    Ok(Some(url))
}
#[tauri::command]
async fn disconnect(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    biometrics::guard(&app).await?;
    let _guard = state.1.lock().await;
    let mut profiles = read_profiles(&app).await?;
    profiles.active = None;
    write_profiles(&app, &profiles).await?;
    *state.0.lock().map_err(|_| "État indisponible")? = None;
    let path = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("pairing.json");
    if path.exists() {
        tokio::fs::remove_file(path)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
async fn api(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    biometrics::guard(&app).await?;
    request(&current(&state)?, &path, body)
        .await?
        .json()
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn image(app: tauri::AppHandle, state: State<'_, AppState>, path: String) -> Result<String, String> {
    biometrics::guard(&app).await?;
    let r = request(&current(&state)?, &path, None).await?;
    let mime = r
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .split(';')
        .next()
        .unwrap()
        .to_string();
    if !["image/png", "image/jpeg", "image/webp", "image/gif"].contains(&mime.as_str()) {
        return Err("Format image non pris en charge".into());
    }
    let bytes = r.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() > 64 * 1024 * 1024 {
        return Err("Image trop volumineuse (64 Mo maximum)".into());
    }
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_pocket::init())
        .invoke_handler(tauri::generate_handler![
            lock_status, unlock, lock_session, set_biometric_lock,
            connect, restore, disconnect, api, image, save_image,
            list_profiles, get_profile, save_profile, activate_profile, delete_profile
        ])
        .run(tauri::generate_context!())
        .expect("Erreur au démarrage de Comfy Pocket");
}

#[tauri::command]
async fn save_image(
    app: tauri::AppHandle,
    data_url: String,
    filename: String,
) -> Result<String, String> {
    biometrics::guard(&app).await?;
    let (prefix, data) = data_url.split_once(",").ok_or("Image invalide")?;
    let (mime, ext) = match prefix {
        "data:image/png;base64" => ("image/png", "png"),
        "data:image/jpeg;base64" => ("image/jpeg", "jpg"),
        "data:image/webp;base64" => ("image/webp", "webp"),
        "data:image/gif;base64" => ("image/gif", "gif"),
        _ => return Err("Format invalide".into()),
    };
    let bytes = STANDARD.decode(data).map_err(|_| "Image invalide")?;
    if bytes.len() > 64 * 1024 * 1024 {
        return Err("Image supérieure à 64 Mo".into());
    }
    let stem = std::path::Path::new(&filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image")
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .take(80)
        .collect::<String>();
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let name = format!("{stem}_{stamp}.{ext}");
    #[cfg(target_os = "android")]
    {
        let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
        tokio::fs::create_dir_all(&dir)
            .await
            .map_err(|e| e.to_string())?;
        let path = dir.join(&name);
        tokio::fs::write(&path, &bytes)
            .await
            .map_err(|e| e.to_string())?;
        let handle = app
            .state::<tauri_plugin_pocket::Pocket<tauri::Wry>>()
            .0
            .clone();
        let args = serde_json::json!({"path":path.to_string_lossy(),"filename":name,"mime":mime});
        let result = tauri::async_runtime::spawn_blocking(move || {
            handle.run_mobile_plugin::<serde_json::Value>("save", args)
        })
        .await
        .map_err(|e| e.to_string())?;
        let _ = tokio::fs::remove_file(path).await;
        result.map_err(|e| e.to_string())?;
        Ok("Image enregistrée dans Photos / ComfyPocket".into())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = mime;
        let dir = app
            .path()
            .download_dir()
            .map_err(|e| e.to_string())?
            .join("ComfyPocket");
        tokio::fs::create_dir_all(&dir)
            .await
            .map_err(|e| e.to_string())?;
        tokio::fs::write(dir.join(&name), bytes)
            .await
            .map_err(|e| e.to_string())?;
        Ok(format!(
            "Image enregistrée dans Téléchargements/ComfyPocket/{name}"
        ))
    }
}
