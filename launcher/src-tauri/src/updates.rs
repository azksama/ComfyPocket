use super::*;
use sha2::{Digest, Sha256};
use std::io::Write;
use tauri::Emitter;
static UPDATING: AtomicBool = AtomicBool::new(false);
pub fn in_progress() -> bool {
    UPDATING.load(Ordering::SeqCst)
}
const REPO: &str = "https://api.github.com/repos/azksama/ComfyPocket";
fn github() -> Result<Client, String> {
    Client::builder()
        .user_agent("Mochi-Studio-Updater")
        .timeout(Duration::from_secs(300))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            let u = attempt.url();
            if attempt.previous().len() < 5
                && u.scheme() == "https"
                && matches!(
                    u.host_str(),
                    Some(
                        "api.github.com"
                            | "release-assets.githubusercontent.com"
                            | "objects.githubusercontent.com"
                    )
                )
            {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .map_err(error)
}
fn version(tag: &str) -> Option<semver::Version> {
    let v = semver::Version::parse(tag.strip_prefix("studio-v")?).ok()?;
    if v.pre.is_empty() {
        Some(v)
    } else {
        None
    }
}
fn candidate(releases: &[Value]) -> Option<&Value> {
    releases
        .iter()
        .filter(|r| r["draft"] == false && r["prerelease"] == false)
        .filter_map(|r| Some((version(r["tag_name"].as_str()?)?, r)))
        .filter(|(v, _)| v > &semver::Version::parse(env!("CARGO_PKG_VERSION")).unwrap())
        .max_by(|(a, _), (b, _)| a.cmp(b))
        .map(|(_, r)| r)
}
fn latest(c: &Client) -> Result<Option<Value>, String> {
    let mut releases = Vec::new();
    for page in 1..=10 {
        let response = c
            .get(format!("{REPO}/releases?per_page=100&page={page}"))
            .header("Accept", "application/vnd.github+json")
            .send()
            .map_err(|_| "GitHub est inaccessible. Réessayez plus tard.")?;
        if !response.status().is_success() {
            return Err(format!(
                "GitHub : HTTP {}. Réessayez plus tard.",
                response.status().as_u16()
            ));
        }
        let values: Vec<Value> = response.json().map_err(|_| "Réponse GitHub invalide")?;
        let end = values.len() < 100;
        releases.extend(values);
        if end {
            break;
        }
    }
    Ok(candidate(&releases).cloned())
}
fn installer(release: &Value) -> Result<&Value, String> {
    let v = version(release["tag_name"].as_str().ok_or("Version absente")?)
        .ok_or("Version invalide")?;
    let name = format!("Mochi-Studio-{v}-Windows-x64.exe");
    let asset = release["assets"]
        .as_array()
        .ok_or("Aucun installateur")?
        .iter()
        .find(|a| a["name"] == name)
        .ok_or("Installateur Windows absent de cette release.")?;
    let digest = asset["digest"]
        .as_str()
        .and_then(|s| s.strip_prefix("sha256:"))
        .ok_or("Empreinte GitHub absente. Installation refusée.")?;
    if digest.len() != 64
        || !digest.bytes().all(|b| b.is_ascii_hexdigit())
        || asset["id"].as_u64().is_none()
    {
        return Err("Métadonnées d’installation invalides.".into());
    }
    Ok(asset)
}
#[tauri::command]
pub async fn check_update() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let c=github()?;
        match latest(&c)? {
            Some(r) => { installer(&r)?; Ok(json!({"current":env!("CARGO_PKG_VERSION"),"version":r["tag_name"],"notes":r["body"].as_str().unwrap_or("").chars().take(8000).collect::<String>()})) },
            None => Ok(json!({"current":env!("CARGO_PKG_VERSION"),"version":null})),
        }
    }).await.map_err(error)?
}
#[tauri::command]
pub async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    if UPDATING.swap(true, Ordering::SeqCst) {
        return Err("Une mise à jour est déjà en cours.".into());
    }
    let result=tauri::async_runtime::spawn_blocking(move || {
        let st=app.state::<Studio>(); let c=github()?;
        let release=latest(&c)?.ok_or("Aucune nouvelle version disponible.")?;
        let asset=installer(&release)?;
        let dir=st.dir.join("updates"); fs::create_dir_all(&dir).map_err(error)?;
        let file=dir.join(asset["name"].as_str().unwrap());
        let mut response=c.get(format!("{REPO}/releases/assets/{}",asset["id"].as_u64().unwrap())).header("Accept","application/octet-stream").send().map_err(|_|"Téléchargement interrompu")?.error_for_status().map_err(|_|"Téléchargement refusé par GitHub")?;
        let size=asset["size"].as_u64().ok_or("Taille absente")?;
        if size == 0 || size > 250_000_000 { return Err("Taille d’installation invalide".into()); }
        let mut output=fs::File::create(file.with_extension("part")).map_err(error)?;
        let mut hash=Sha256::new(); let mut count=0u64; let mut buf=[0u8;65536]; let mut percent=0;
        loop { let n=response.read(&mut buf).map_err(|_|"Téléchargement interrompu. Réessayez.")?; if n==0 {break;}
            count+=n as u64; if count>size {return Err("Téléchargement trop volumineux".into());}
            output.write_all(&buf[..n]).map_err(error)?; hash.update(&buf[..n]);
            let next=count*100/size; if next!=percent {percent=next; let _=app.emit("update-progress",percent);}
        }
        output.sync_all().map_err(error)?; drop(output);
        if count!=size || format!("{:x}",hash.finalize())!=asset["digest"].as_str().unwrap()[7..].to_ascii_lowercase() { fs::remove_file(file.with_extension("part")).ok(); return Err("Empreinte SHA-256 incorrecte. Installation annulée.".into()); }
        fs::rename(file.with_extension("part"),&file).map_err(error)?;
        let resume = status(&st)["ready"] == true;
        if listener(8188) || listener(st.settings.lock().unwrap().port) { control(&app,"stop")?; }
        let exe=std::env::current_exe().map_err(error)?;
        write_json(&dir.join("install.json"),&json!({"resume":resume,"pid":std::process::id(),"installer":file,"exe":exe,"directory":exe.parent()}))?;
        let script=dir.join("install.ps1");
        fs::write(&script,include_str!("../install-update.ps1")).map_err(error)?;
        powershell().arg("-File").arg(script).spawn().map_err(error)?;
        app.exit(0); Ok(())
    }).await.map_err(error);
    UPDATING.store(false, Ordering::SeqCst);
    result?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn selection_ignores_android_prereleases_and_downgrades() {
        let current = semver::Version::parse(env!("CARGO_PKG_VERSION")).unwrap();
        let next = format!("studio-v{}.0.0", current.major + 1);
        let releases = vec![
            json!({"tag_name":"v9.0.0","draft":false,"prerelease":false}),
            json!({"tag_name":"studio-v0.1.0","draft":false,"prerelease":false}),
            json!({"tag_name":"studio-v0.4.0","draft":false,"prerelease":true}),
            json!({"tag_name":next,"draft":false,"prerelease":false}),
        ];
        assert_eq!(candidate(&releases).unwrap()["tag_name"], next);
    }
    #[test]
    fn refuses_missing_digest() {
        assert!(installer(&json!({"tag_name":"studio-v0.3.0","assets":[{"name":"Mochi-Studio-0.3.0-Windows-x64.exe","id":1}]})).is_err());
    }
}
