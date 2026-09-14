#[cfg(target_os = "android")]
use tauri::Manager;
#[cfg(target_os = "android")]
async fn call(app: &tauri::AppHandle, command: &'static str, args: serde_json::Value) -> Result<serde_json::Value, String> {
    let handle = app.state::<tauri_plugin_pocket::Pocket<tauri::Wry>>().0.clone();
    tauri::async_runtime::spawn_blocking(move || handle.run_mobile_plugin::<serde_json::Value>(command, args)).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())
}
pub async fn guard(app: &tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "android")]
    { call(app, "assertUnlocked", serde_json::json!({})).await?; }
    #[cfg(not(target_os = "android"))]
    let _ = app;
    Ok(())
}
#[tauri::command]
pub async fn lock_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    return call(&app, "lockStatus", serde_json::json!({})).await;
    #[cfg(not(target_os = "android"))]
    { let _ = app; Ok(serde_json::json!({"supported":false,"available":false,"enabled":false,"unlocked":true})) }
}
#[tauri::command]
pub async fn unlock(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    return call(&app, "unlock", serde_json::json!({})).await;
    #[cfg(not(target_os = "android"))]
    lock_status(app).await
}
#[tauri::command]
pub async fn lock_session(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    return call(&app, "lockSession", serde_json::json!({})).await;
    #[cfg(not(target_os = "android"))]
    lock_status(app).await
}
#[tauri::command]
pub async fn set_biometric_lock(app: tauri::AppHandle, enabled: bool) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    return call(&app, "setBiometricLock", serde_json::json!({"enabled":enabled})).await;
    #[cfg(not(target_os = "android"))]
    { let _ = (app, enabled); Err("Disponible sur Android uniquement".into()) }
}
