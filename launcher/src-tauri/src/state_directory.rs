use std::{fs, io, path::{Path, PathBuf}, sync::atomic::{AtomicU64, Ordering}};

pub(crate) fn resolve() -> Result<PathBuf, String> {
    let profile = std::env::var_os("USERPROFILE").ok_or("USERPROFILE absent")?;
    let local = std::env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA absent")?;
    migrate(&PathBuf::from(local).join("ComfyPocketPC"), &PathBuf::from(profile).join(".mochi").join("pc"))
        .map_err(|e| format!("Impossible de charger les données persistantes de Mochi : {e}"))
}

fn copy_tree(source: &Path, target: &Path) -> io::Result<()> {
    fs::create_dir(target)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        if kind.is_symlink() {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "Lien symbolique dans les anciennes données ; migration interrompue."));
        }
        let destination = target.join(entry.file_name());
        if kind.is_dir() {
            copy_tree(&entry.path(), &destination)?;
        } else if kind.is_file() {
            fs::copy(entry.path(), &destination)?;
            fs::OpenOptions::new().write(true).open(&destination)?.sync_all()?;
        }
    }
    Ok(())
}

/// Publish a complete copy once. Keep the old directory and never replace an
/// existing canonical identity, even if the launch context sees older data.
pub(crate) fn migrate(legacy: &Path, canonical: &Path) -> io::Result<PathBuf> {
    static SERIAL: AtomicU64 = AtomicU64::new(0);
    if canonical.exists() {
        if !canonical.is_dir() { return Err(io::Error::new(io::ErrorKind::NotADirectory, "Dossier Mochi invalide")); }
        return Ok(canonical.into());
    }
    let parent = canonical.parent().ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "Dossier Mochi invalide"))?;
    fs::create_dir_all(parent)?;
    let pending = parent.join(format!("pc-migration-{}-{}", std::process::id(), SERIAL.fetch_add(1, Ordering::Relaxed)));
    let result = (|| {
        if legacy.exists() { copy_tree(legacy, &pending)?; }
        else { fs::create_dir(&pending)?; }
        fs::rename(&pending, canonical)
    })();
    if result.is_err() { let _ = fs::remove_dir_all(&pending); }
    result?;
    Ok(canonical.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn migration_preserves_identity_and_never_imports_old_settings_again() {
        let root = std::env::temp_dir().join(format!("mochi-migration-{}", std::process::id()));
        let legacy = root.join("old");
        let canonical = root.join("shared/pc");
        fs::create_dir_all(legacy.join("assistant")).unwrap();
        fs::write(legacy.join("cert.pem"), "existing identity").unwrap();
        fs::write(legacy.join("studio.json"), r#"{"sharePublic":true}"#).unwrap();
        fs::write(legacy.join("assistant/settings.json"), "assistant settings").unwrap();
        assert_eq!(migrate(&legacy, &canonical).unwrap(), canonical);
        fs::write(legacy.join("studio.json"), r#"{"sharePublic":false}"#).unwrap();
        migrate(&legacy, &canonical).unwrap();
        assert_eq!(fs::read_to_string(canonical.join("studio.json")).unwrap(), r#"{"sharePublic":true}"#);
        assert_eq!(fs::read(canonical.join("cert.pem")).unwrap(), fs::read(legacy.join("cert.pem")).unwrap());
        assert_eq!(fs::read_to_string(canonical.join("assistant/settings.json")).unwrap(), "assistant settings");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn failed_migration_does_not_publish_partial_identity() {
        let root = std::env::temp_dir().join(format!("mochi-failed-migration-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let legacy = root.join("not-a-directory");
        fs::write(&legacy, "invalid").unwrap();
        let canonical = root.join("shared/pc");
        assert!(migrate(&legacy, &canonical).is_err());
        assert!(!canonical.exists());
        assert_eq!(fs::read_to_string(legacy).unwrap(), "invalid");
        assert_eq!(fs::read_dir(root.join("shared")).unwrap().count(), 0);
        fs::remove_dir_all(root).unwrap();
    }
}
