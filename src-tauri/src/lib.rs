mod biometrics;
mod transport;
use base64::{engine::general_purpose::STANDARD, Engine};
use biometrics::{lock_session, lock_status, set_biometric_lock, set_lock_options, unlock};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Manager, State};
use transport::{connection, read_limited, request, Connection, Pairing, IMAGE_LIMIT, JSON_LIMIT};

#[derive(Default)]
struct AppState(Mutex<Option<Connection>>, tokio::sync::Mutex<()>);
#[derive(Clone, Serialize, Deserialize)]
struct Profile {
    id: String,
    name: String,
    pairing: Pairing,
}
#[derive(Default, Serialize, Deserialize)]
struct Profiles {
    active: Option<String>,
    items: Vec<Profile>,
}
#[derive(Serialize)]
struct ProfileInfo {
    id: String,
    name: String,
    url: String,
    active: bool,
}
async fn read_profiles(app: &tauri::AppHandle) -> Result<Profiles, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    match tokio::fs::read(dir.join("profiles.json")).await {
        Ok(bytes) => {
            serde_json::from_slice(&bytes).map_err(|_| "Profils enregistrés invalides".into())
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            match tokio::fs::read(dir.join("pairing.json")).await {
                Ok(bytes) => {
                    let pairing: Pairing =
                        serde_json::from_slice(&bytes).map_err(|_| "Ancien appairage invalide")?;
                    Ok(Profiles {
                        active: Some("legacy".into()),
                        items: vec![Profile {
                            id: "legacy".into(),
                            name: "Mon PC".into(),
                            pairing,
                        }],
                    })
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Profiles::default()),
                Err(e) => Err(e.to_string()),
            }
        }
        Err(e) => Err(e.to_string()),
    }
}
async fn write_profiles(app: &tauri::AppHandle, profiles: &Profiles) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| e.to_string())?;
    let temp = dir.join("profiles.tmp");
    tokio::fs::write(
        &temp,
        serde_json::to_vec(profiles).map_err(|e| e.to_string())?,
    )
    .await
    .map_err(|e| e.to_string())?;
    tokio::fs::rename(&temp, dir.join("profiles.json"))
        .await
        .map_err(|e| e.to_string())?;
    // The canonical write has committed. Obsolete legacy-file cleanup must not
    // report a failed save and cause a retry to create a duplicate profile.
    // Both files live in the private native store excluded from Android backup.
    let _ = tokio::fs::remove_file(dir.join("pairing.json")).await;
    Ok(())
}
#[tauri::command]
async fn list_profiles(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<ProfileInfo>, String> {
    biometrics::guard(&app).await?;
    let _guard = state.1.lock().await;
    biometrics::guard(&app).await?;
    let data = read_profiles(&app).await?;
    Ok(data
        .items
        .iter()
        .map(|p| ProfileInfo {
            id: p.id.clone(),
            name: p.name.clone(),
            url: p.pairing.url.clone(),
            active: data.active.as_ref() == Some(&p.id),
        })
        .collect())
}
#[tauri::command]
async fn get_profile(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<Profile, String> {
    biometrics::guard(&app).await?;
    let _guard = state.1.lock().await;
    biometrics::guard(&app).await?;
    read_profiles(&app)
        .await?
        .items
        .into_iter()
        .find(|p| p.id == id)
        .ok_or("Profil inconnu".into())
}
#[tauri::command]
async fn save_profile(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: Option<String>,
    name: String,
    pairing: Pairing,
) -> Result<String, String> {
    biometrics::guard(&app).await?;
    let _guard = state.1.lock().await;
    biometrics::guard(&app).await?;
    if name.trim().is_empty() || name.chars().count() > 80 {
        return Err("Nom : 1 à 80 caractères".into());
    }
    let pairing = connection(pairing)?.pairing;
    let mut data = read_profiles(&app).await?;
    let id = match id {
        Some(id) => {
            if !data.items.iter().any(|p| p.id == id) {
                return Err("Profil inconnu".into());
            }
            id
        }
        None => {
            if data.items.len() >= 50 {
                return Err("50 profils maximum".into());
            }
            format!(
                "p{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(|e| e.to_string())?
                    .as_nanos()
            )
        }
    };
    let changed_active = data.active.as_ref() == Some(&id);
    data.items.retain(|p| p.id != id);
    data.items.push(Profile {
        id: id.clone(),
        name: name.trim().into(),
        pairing,
    });
    if changed_active {
        data.active = None;
    }
    write_profiles(&app, &data).await?;
    if changed_active {
        *state.0.lock().map_err(|_| "État indisponible")? = None;
    }
    Ok(id)
}
#[tauri::command]
async fn activate_profile(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<String, String> {
    biometrics::guard(&app).await?;
    let _guard = state.1.lock().await;
    biometrics::guard(&app).await?;
    let mut data = read_profiles(&app).await?;
    let p = data
        .items
        .iter()
        .find(|p| p.id == id)
        .ok_or("Profil inconnu")?;
    let c = connection(p.pairing.clone())?;
    let bytes = read_limited(request(&c, "/api/system_stats", None).await?, JSON_LIMIT).await?;
    let stats: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|_| "Réponse ComfyUI invalide")?;
    if !stats
        .get("devices")
        .is_some_and(serde_json::Value::is_array)
    {
        return Err("Le PC ne renvoie pas de statistiques ComfyUI valides".into());
    }
    biometrics::guard(&app).await?;
    let url = c.pairing.url.clone();
    data.active = Some(id);
    write_profiles(&app, &data).await?;
    *state.0.lock().map_err(|_| "État indisponible")? = Some(c);
    Ok(url)
}
#[tauri::command]
async fn delete_profile(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    biometrics::guard(&app).await?;
    let _guard = state.1.lock().await;
    biometrics::guard(&app).await?;
    let mut data = read_profiles(&app).await?;
    let active = data.active.as_ref() == Some(&id);
    data.items.retain(|p| p.id != id);
    if active {
        data.active = None;
    }
    write_profiles(&app, &data).await?;
    if active {
        *state.0.lock().map_err(|_| "État indisponible")? = None;
    }
    Ok(())
}
fn current(state: &State<AppState>) -> Result<Connection, String> {
    state
        .0
        .lock()
        .map_err(|_| "État indisponible")?
        .clone()
        .ok_or("Connectez le PC".into())
}
#[tauri::command]
async fn restore(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    biometrics::guard(&app).await?;
    let _guard = state.1.lock().await;
    biometrics::guard(&app).await?;
    let data = read_profiles(&app).await?;
    if let Some(profile) = data
        .items
        .iter()
        .find(|p| Some(&p.id) == data.active.as_ref())
    {
        let c = connection(profile.pairing.clone())?;
        let url = c.pairing.url.clone();
        *state.0.lock().map_err(|_| "État indisponible")? = Some(c);
        return Ok(Some(url));
    }
    *state.0.lock().map_err(|_| "État indisponible")? = None;
    Ok(None)
}
#[tauri::command]
async fn disconnect(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    biometrics::guard(&app).await?;
    let _guard = state.1.lock().await;
    biometrics::guard(&app).await?;
    let mut profiles = read_profiles(&app).await?;
    profiles.active = None;
    write_profiles(&app, &profiles).await?;
    *state.0.lock().map_err(|_| "État indisponible")? = None;
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
    let response = request(&current(&state)?, &path, body).await?;
    let bytes = read_limited(response, JSON_LIMIT).await?;
    biometrics::guard(&app).await?;
    serde_json::from_slice(&bytes).map_err(|_| "Réponse JSON du PC invalide".into())
}
#[tauri::command]
async fn image(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<String, String> {
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
    let bytes = read_limited(r, IMAGE_LIMIT).await?;
    biometrics::guard(&app).await?;
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_pocket::init())
        .invoke_handler(tauri::generate_handler![
            lock_status,
            unlock,
            lock_session,
            set_biometric_lock,
            set_lock_options,
            restore,
            disconnect,
            api,
            image,
            save_image,
            list_profiles,
            get_profile,
            save_profile,
            activate_profile,
            delete_profile
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
    if data.len() > IMAGE_LIMIT.div_ceil(3) * 4 {
        return Err("Image supérieure à 64 Mo".into());
    }
    let bytes = STANDARD.decode(data).map_err(|_| "Image invalide")?;
    if bytes.len() > IMAGE_LIMIT {
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
