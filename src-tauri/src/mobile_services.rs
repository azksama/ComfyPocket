#[tauri::command]
pub async fn update_action(
    app: tauri::AppHandle,
    action: String,
) -> Result<serde_json::Value, String> {
    crate::biometrics::guard(&app).await?;
    if !["status", "check", "download", "install", "cancel"].contains(&action.as_str()) {
        return Err("Invalid action".into());
    }
    #[cfg(target_os = "android")]
    {
        crate::biometrics::call(&app, "updateAction", serde_json::json!({"action":action})).await
    }
    #[cfg(not(target_os = "android"))]
    {
        Ok(serde_json::json!({"supported":false,"phase":"idle","available":false}))
    }
}
#[tauri::command]
pub async fn voice_action(
    app: tauri::AppHandle,
    action: String,
    language: Option<String>,
    cellular: Option<bool>,
) -> Result<serde_json::Value, String> {
    crate::biometrics::guard(&app).await?;
    if !["status", "start", "stop", "cancel", "take"].contains(&action.as_str()) {
        return Err("Invalid action".into());
    }
    #[cfg(target_os = "android")]
    {
        crate::biometrics::call(&app,"voiceAction",serde_json::json!({"action":action,"language":language.unwrap_or("fr".into()),"cellular":cellular.unwrap_or(false)})).await
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (language, cellular);
        Ok(serde_json::json!({"supported":false,"phase":"idle"}))
    }
}
