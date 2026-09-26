use crate::error;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    io::Write,
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct Settings {
    pub(crate) comfy_directory: String,
    pub(crate) models_directory: String,
    pub(crate) reserve_vram: f64,
    pub(crate) preview: String,
    pub(crate) attention: String,
    pub(crate) disable_dynamic_vram: bool,
    pub(crate) listen_lan: bool,
    pub(crate) port: u16,
    pub(crate) share_public: bool,
    pub(crate) public_host: String,
    pub(crate) auto_start: bool,
    pub(crate) start_with_windows: bool,
    pub(crate) close_to_tray: bool,
    pub(crate) reduced_motion: bool,
    pub(crate) check_updates: bool,
    pub(crate) onboarding_step: u8,
    pub(crate) onboarding_done: bool,
    pub(crate) onboarding_seen: bool,
    pub(crate) model_paths: std::collections::BTreeMap<String, Vec<String>>,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            comfy_directory: "E:\\Stability\\Data\\Packages\\ComfyUI".into(),
            models_directory: "E:\\Stability\\Data\\Models".into(),
            reserve_vram: 0.9,
            preview: "auto".into(),
            attention: "pytorch".into(),
            disable_dynamic_vram: true,
            listen_lan: true,
            port: 8189,
            share_public: false,
            public_host: String::new(),
            auto_start: false,
            start_with_windows: false,
            close_to_tray: true,
            reduced_motion: false,
            check_updates: true,
            onboarding_step: 0,
            onboarding_done: false,
            onboarding_seen: false,
            model_paths: Default::default(),
        }
    }
}
pub(crate) fn read_json(p: impl AsRef<Path>) -> Result<Value, String> {
    let bytes = fs::read(p).map_err(error)?;
    serde_json::from_slice(bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(&bytes)).map_err(error)
}
pub(crate) fn write_json(p: &Path, v: &impl Serialize) -> Result<(), String> {
    static SERIAL: AtomicU64 = AtomicU64::new(0);
    let tmp = p.with_extension(format!(
        "{}-{}.pending",
        std::process::id(),
        SERIAL.fetch_add(1, Ordering::Relaxed)
    ));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&tmp)
            .map_err(error)?;
        file.write_all(&serde_json::to_vec_pretty(v).map_err(error)?)
            .map_err(error)?;
        file.sync_all().map_err(error)?;
        fs::rename(&tmp, p).map_err(error)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn concurrent_replacements_leave_valid_settings_and_no_pending_files() {
        let dir=std::env::temp_dir().join(format!("mochi-settings-concurrent-{}",std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let file=dir.join("studio.json");
        let handles:Vec<_>=(0..8).map(|n| { let file=file.clone(); std::thread::spawn(move || {
            let mut s=Settings::default();s.onboarding_done=true;s.onboarding_seen=true;s.port=8200+n;
            write_json(&file,&s).unwrap();
        })}).collect();
        for h in handles {h.join().unwrap();}
        let settings:Settings=serde_json::from_value(read_json(&file).unwrap()).unwrap();
        assert!(settings.onboarding_done && settings.onboarding_seen);
        assert_eq!(fs::read_dir(&dir).unwrap().count(),1);
        fs::remove_file(file).unwrap();fs::remove_dir(dir).unwrap();
    }
}
