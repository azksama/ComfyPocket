#[cfg(target_os = "android")]
use tauri::Manager;

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("pocket").setup(|_app,_api| {
        #[cfg(target_os = "android")]
        _app.manage(Pocket(_api.register_android_plugin("fr.azk.pocket", "PocketPlugin")?));
        Ok(())
    }).build()
}
#[cfg(target_os = "android")]
pub struct Pocket<R: tauri::Runtime>(pub tauri::plugin::PluginHandle<R>);
