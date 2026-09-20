#[tauri::command]
pub async fn translate_text(app: tauri::AppHandle, text: String, source: String, target: String, cellular: bool) -> Result<serde_json::Value, String> {
    crate::biometrics::guard(&app).await?;
    if text.trim().is_empty() || text.chars().count() > 5000 { return Err("Texte invalide (1 à 5 000 caractères)".into()); }
    #[cfg(target_os = "android")]
    {
        let result = crate::biometrics::call(&app, "translateText", serde_json::json!({"text":text,"source":source,"target":target,"cellular":cellular})).await?;
        crate::biometrics::guard(&app).await?;
        Ok(result)
    }
    #[cfg(not(target_os = "android"))]
    { let _ = (app, text, source, target, cellular); Err("La traduction ML Kit est disponible sur Android.".into()) }
}

#[tauri::command]
pub async fn set_app_language(app: tauri::AppHandle, language: String) -> Result<(), String> {
    if language != "fr" && language != "en" { return Err("Invalid language".into()); }
    #[cfg(target_os = "android")]
    crate::biometrics::call(&app, "setAppLanguage", serde_json::json!({"language":language})).await?;
    #[cfg(not(target_os = "android"))]
    let _ = app;
    Ok(())
}
