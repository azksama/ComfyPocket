#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod settings_store;
mod updates;
use reqwest::blocking::Client;
use serde_json::{json, Value};
use settings_store::{read_json, write_json, Settings};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};

struct Studio {
    dir: PathBuf,
    runtime: PathBuf,
    settings: Mutex<Settings>,
    busy: AtomicBool,
    phase: Mutex<String>,
}
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn command(exe: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut c = Command::new(exe);
    #[cfg(windows)]
    c.creation_flags(0x08000000);
    c.stdin(Stdio::null());
    c
}
fn powershell() -> Command {
    let mut c = command("powershell.exe");
    c.args([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
    ]);
    c
}
fn validate(s: &Settings) -> Result<(), String> {
    if !s.reserve_vram.is_finite() || !(0.0..=32.0).contains(&s.reserve_vram) {
        return Err("La réserve VRAM doit être comprise entre 0 et 32 Go.".into());
    }
    if !["auto", "none", "latent2rgb", "taesd"].contains(&s.preview.as_str())
        || !["auto", "pytorch"].contains(&s.attention.as_str())
    {
        return Err("Option d’inférence invalide.".into());
    }
    if s.port < 1024 || s.port == 8188 {
        return Err("Choisissez un port entre 1024 et 65535, différent de 8188.".into());
    }
    for path in [&s.comfy_directory, &s.models_directory] {
        if !Path::new(path).is_absolute() || !Path::new(path).is_dir() {
            return Err(format!("Dossier introuvable : {path}"));
        }
        if path.contains(['\r', '\n', '"']) {
            return Err("Chemin invalide.".into());
        }
    }
    for (kind, paths) in &s.model_paths {
        if ![
            "checkpoints",
            "loras",
            "vae",
            "controlnet",
            "upscale_models",
            "embeddings",
            "text_encoders",
            "diffusion_models",
        ]
        .contains(&kind.as_str())
            || paths.len() > 20
        {
            return Err("Catégorie ou nombre de dossiers invalide.".into());
        }
        for path in paths {
            if !Path::new(path).is_absolute()
                || !Path::new(path).is_dir()
                || path.contains(['\r', '\n', '"'])
            {
                return Err(format!("Dossier de modèles invalide : {path}"));
            }
        }
    }
    for file in ["main.py", "venv/Scripts/python.exe"] {
        if !Path::new(&s.comfy_directory).join(file).is_file() {
            return Err(format!("{file} absent de l’installation ComfyUI."));
        }
    }
    Ok(())
}
fn client() -> Client {
    Client::builder()
        .timeout(Duration::from_secs(3))
        .no_proxy()
        .build()
        .unwrap()
}
fn listener(port: u16) -> bool {
    std::net::TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}").parse().unwrap(),
        Duration::from_millis(250),
    )
    .is_ok()
}
fn bridge_client(dir: &Path) -> Result<(Client, Value, String), String> {
    let cfg = read_json(dir.join("config.json"))?;
    let cert = fs::read(dir.join("cert.pem")).map_err(error)?;
    let c = Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(4))
        .add_root_certificate(reqwest::Certificate::from_pem(&cert).map_err(error)?)
        .build()
        .map_err(error)?;
    let host = cfg["host"].as_str().unwrap_or("127.0.0.1");
    let url = format!(
        "https://{}:{}",
        if host == "0.0.0.0" { "127.0.0.1" } else { host },
        cfg["port"].as_u64().unwrap_or(8189)
    );
    Ok((c, cfg, url))
}
fn request_bridge(c: &Client, cfg: &Value, url: &str, route: &str) -> Result<Value, String> {
    c.get(format!("{url}{route}"))
        .bearer_auth(cfg["token"].as_str().ok_or("Clé d’appairage absente")?)
        .send()
        .map_err(|_| {
            "Le compagnon ne répond pas ou son certificat diffère de l’appairage.".to_string()
        })?
        .error_for_status()
        .map_err(|e| {
            format!(
                "Compagnon : HTTP {}",
                e.status().map(|s| s.as_u16()).unwrap_or(0)
            )
        })?
        .json()
        .map_err(error)
}
fn status(st: &Studio) -> Value {
    let mut bridge = false;
    let mut upstream = false;
    let mut message = String::new();
    let mut urls = Vec::new();
    let mut stats = Value::Null;
    if let Ok((c, cfg, url)) = bridge_client(&st.dir) {
        match request_bridge(&c, &cfg, &url, "/bridge/info") {
            Ok(info) => {
                bridge = info["version"].as_u64().unwrap_or(0) >= 3;
            }
            Err(e) => message = e,
        }
        if bridge {
            if let Ok(v) = request_bridge(&c, &cfg, &url, "/api/system_stats") {
                stats = v;
                upstream = stats["system"].is_object() && stats["devices"].is_array();
            }
        }
    }
    let direct = client()
        .get("http://127.0.0.1:8188/system_stats")
        .send()
        .ok()
        .and_then(|r| r.error_for_status().ok())
        .and_then(|r| r.json::<Value>().ok());
    let engine = direct
        .as_ref()
        .is_some_and(|v| v["devices"].is_array() && v["system"].is_object());
    if stats.is_null() {
        stats = direct.unwrap_or(Value::Null);
    }
    for (file, kind) in [
        ("pairing.json", "locale"),
        ("pairing-public.json", "publique"),
    ] {
        if kind == "publique" && !st.settings.lock().unwrap().share_public {
            continue;
        }
        if let Ok(v) = read_json(st.dir.join(file)) {
            if let Some(url) = v["url"].as_str() {
                urls.push(json!({"kind":kind,"url":url}));
            }
        }
    }
    let queue = if engine {
        client()
            .get("http://127.0.0.1:8188/queue")
            .send()
            .ok()
            .and_then(|r| r.json::<Value>().ok())
            .map(|v| {
                v["queue_running"].as_array().map_or(0, Vec::len)
                    + v["queue_pending"].as_array().map_or(0, Vec::len)
            })
    } else {
        None
    };
    json!({"engine":engine,"bridge":bridge,"ready":engine&&bridge&&upstream,"busy":st.busy.load(Ordering::Relaxed),"phase":*st.phase.lock().unwrap(),"message":message,"stats":stats,"queue":queue,"urls":urls,"paired":st.dir.join("cert.pem").is_file()})
}
#[tauri::command]
async fn get_status(app: tauri::AppHandle) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || status(&app.state::<Studio>()))
        .await
        .map_err(error)
}
#[tauri::command]
fn get_settings(st: tauri::State<Studio>) -> Settings {
    st.settings.lock().unwrap().clone()
}
fn autostart(enabled: bool) -> Result<(), String> {
    use winreg::{enums::*, RegKey};
    let (key, _) = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
        .map_err(error)?;
    if enabled {
        key.set_value(
            "MochiStudio",
            &format!(
                "\"{}\" --background",
                std::env::current_exe().map_err(error)?.display()
            ),
        )
        .map_err(error)
    } else {
        match key.delete_value("MochiStudio") {
            Ok(_) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(error(e)),
        }
    }
}
#[tauri::command]
fn save_settings(mut settings: Settings, st: tauri::State<Studio>) -> Result<Settings, String> {
    if st.busy.load(Ordering::SeqCst) || updates::in_progress() {
        return Err("Attendez la fin de l’opération en cours.".into());
    }
    validate(&settings)?;
    let mut saved = st.settings.lock().unwrap();
    let old = saved.clone();
    settings.onboarding_done = old.onboarding_done;
    settings.onboarding_step = old.onboarding_step;
    settings.onboarding_seen = old.onboarding_seen;
    let pair = public_pairing_value(&st, &settings)?;
    let paths: std::collections::BTreeMap<_, _> = settings
        .model_paths
        .iter()
        .map(|(k, v)| (k, v.join("\n")))
        .collect();
    let mut writes = vec![
        (
            st.dir.join("studio-model-paths.yaml"),
            json!({"mochi_studio": paths}),
        ),
        (
            st.dir.join("studio.json"),
            serde_json::to_value(&settings).map_err(error)?,
        ),
    ];
    if let Some(pair) = pair {
        writes.push((st.dir.join("pairing-public.json"), pair));
    }
    let previous: Vec<_> = writes.iter().map(|(path, _)| fs::read(path).ok()).collect();
    autostart(settings.start_with_windows)?;
    for (index, (path, value)) in writes.iter().enumerate() {
        if let Err(e) = write_json(path, value) {
            for ((written, _), backup) in writes[..index].iter().zip(&previous) {
                if let Some(bytes) = backup {
                    let _ = fs::write(written, bytes);
                } else {
                    let _ = fs::remove_file(written);
                }
            }
            let _ = autostart(old.start_with_windows);
            return Err(e);
        }
    }
    *saved = settings.clone();
    Ok(settings)
}
fn public_pairing_value(st: &Studio, s: &Settings) -> Result<Option<Value>, String> {
    if !s.share_public {
        return Ok(None);
    }
    if !s.listen_lan {
        return Err("Activez la connexion du téléphone pour partager sur Internet.".into());
    }
    let host = s.public_host.trim();
    let url = reqwest::Url::parse(&format!("https://{host}:{}", s.port)).map_err(error)?;
    if host.is_empty()
        || url.host_str() != Some(host)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("Indiquez uniquement une adresse IP publique ou un nom de domaine.".into());
    }
    let output = command(st.runtime.join("node.exe")).args(["--input-type=module", "-e",
        "import{X509Certificate}from'node:crypto';import{readFileSync}from'node:fs';import{isIP}from'node:net';const c=new X509Certificate(readFileSync(process.argv[1]));const h=process.argv[2];if(!(isIP(h)?c.checkIP(h):c.checkHost(h)))process.exit(2);"
    ]).arg(st.dir.join("cert.pem")).arg(host).output().map_err(error)?;
    if !output.status.success() {
        return Err("Cette adresse n’est pas couverte par votre certificat. L’identité actuelle a été conservée.".into());
    }
    let mut pair = read_json(st.dir.join("pairing.json"))?;
    pair["url"] = json!(url.as_str().trim_end_matches('/'));
    Ok(Some(pair))
}
fn public_pairing(st: &Studio, s: &Settings) -> Result<(), String> {
    if let Some(pair) = public_pairing_value(st, s)? {
        write_json(&st.dir.join("pairing-public.json"), &pair)?;
    }
    Ok(())
}
fn sync_config(st: &Studio, s: &Settings) -> Result<(), String> {
    let paths: std::collections::BTreeMap<_, _> = s
        .model_paths
        .iter()
        .map(|(k, v)| (k, v.join("\n")))
        .collect();
    write_json(
        &st.dir.join("studio-model-paths.yaml"),
        &json!({"mochi_studio": paths}),
    )?;
    let p = st.dir.join("config.json");
    if !p.exists() {
        let output = command(st.runtime.join("node.exe"))
            .arg(st.runtime.join("bridge/cli.mjs"))
            .arg("init")
            .arg("--config-dir")
            .arg(&st.dir)
            .args([
                "--host",
                if s.listen_lan { "0.0.0.0" } else { "127.0.0.1" },
                "--port",
                &s.port.to_string(),
            ])
            .arg("--output")
            .arg(Path::new(&s.comfy_directory).join("output"))
            .arg("--models")
            .arg(&s.models_directory)
            .output()
            .map_err(error)?;
        if !output.status.success() {
            return Err("L’appairage n’a pas pu être initialisé. Une identité partielle existante est conservée : vérifiez le dossier de configuration.".into());
        }
    }
    public_pairing(st, s)?;
    let mut cfg = read_json(&p)?;
    let old = cfg.clone();
    cfg["host"] = json!(if s.listen_lan { "0.0.0.0" } else { "127.0.0.1" });
    cfg["port"] = json!(s.port);
    cfg["modelsRoot"] = json!(s.models_directory);
    cfg["modelPaths"] = json!(s.model_paths);
    if let Some(roots) = cfg["roots"].as_array_mut() {
        if let Some(root) = roots.first_mut() {
            root["path"] = json!(Path::new(&s.comfy_directory).join("output"));
        }
    }
    if cfg == old {
        return Ok(());
    }
    if listener(old["port"].as_u64().unwrap_or(8189) as u16)
        || status(st)["bridge"].as_bool() == Some(true)
    {
        return Err(
            "Arrêtez le moteur avant d’appliquer les nouveaux paramètres réseau ou dossiers."
                .into(),
        );
    }
    // Backups contain credentials and remain only inside the existing private state directory.
    fs::copy(&p, st.dir.join("config.before-studio.json")).map_err(error)?;
    let mut pairs = Vec::new();
    for file in ["pairing.json", "pairing-public.json"] {
        let path = st.dir.join(file);
        if path.exists() && old["port"] != cfg["port"] {
            let mut v = read_json(&path)?;
            let mut url =
                reqwest::Url::parse(v["url"].as_str().ok_or("Adresse d’appairage invalide")?)
                    .map_err(error)?;
            url.set_port(Some(s.port)).map_err(|_| "Port invalide")?;
            v["url"] = json!(url.as_str().trim_end_matches('/'));
            pairs.push((path, v));
        }
    }
    for (path, v) in pairs {
        fs::copy(&path, path.with_extension("before-studio.json")).map_err(error)?;
        write_json(&path, &v)?;
    }
    write_json(&p, &cfg)?;
    Ok(())
}
fn control(app: &tauri::AppHandle, action: &str) -> Result<(), String> {
    let st = app.state::<Studio>();
    if st.busy.swap(true, Ordering::SeqCst) {
        return Err("Une opération est déjà en cours.".into());
    }
    *st.phase.lock().unwrap() = if action == "start" {
        "Démarrage et vérification des services…"
    } else {
        "Arrêt du moteur…"
    }
    .into();
    let result: Result<(), String> = (|| {
        let s = st.settings.lock().unwrap().clone();
        if action == "start" {
            validate(&s)?;
            sync_config(&st, &s)?;
        }
        let active_port = read_json(st.dir.join("config.json"))
            .ok()
            .and_then(|v| v["port"].as_u64())
            .unwrap_or(s.port as u64) as u16;
        if action == "stop" && listener(active_port) {
            let (client, cfg, url) = bridge_client(&st.dir)?;
            let response = client
                .get(format!("{url}/bridge/imports"))
                .bearer_auth(cfg["token"].as_str().unwrap_or_default())
                .send()
                .map_err(error)?;
            if response.status() != reqwest::StatusCode::NOT_FOUND {
                let state: Value = response
                    .error_for_status()
                    .map_err(error)?
                    .json()
                    .map_err(error)?;
                let jobs = state["jobs"]
                    .as_array()
                    .ok_or("État des téléchargements inconnu.")?;
                if jobs.iter().any(|j| {
                    matches!(
                        j["status"].as_str(),
                        Some("queued" | "downloading" | "verifying")
                    )
                }) {
                    return Err("Des modèles sont en téléchargement. Attendez leur installation ou annulez-les dans Mochi avant d’arrêter le moteur.".into());
                }
            }
        }
        let log = fs::File::create(st.dir.join("studio.log")).map_err(error)?;
        let legacy = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../scripts/../bridge/cli.mjs")
            .canonicalize()
            .ok();
        let mut cmd = powershell();
        cmd.arg("-File")
            .arg(st.runtime.join("scripts/Studio-Control.ps1"))
            .args(["-Action", action, "-SettingsFile"])
            .arg(st.dir.join("studio.json"))
            .arg("-ConfigDirectory")
            .arg(&st.dir);
        if let Some(path) = legacy {
            cmd.arg("-LegacyScriptPath")
                .arg(path.to_string_lossy().trim_start_matches("\\\\?\\"));
        }
        let output = cmd
            .stdout(Stdio::from(log.try_clone().map_err(error)?))
            .stderr(Stdio::from(log))
            .status()
            .map_err(error)?;
        if !output.success() {
            return Err(
                "L’opération n’a pas abouti. Consultez les journaux pour connaître la cause."
                    .into(),
            );
        }
        if action == "start" && status(&st)["ready"] != true {
            return Err(
                "Les services ont démarré, mais la connexion complète n’est pas validée.".into(),
            );
        }
        Ok(())
    })();
    *st.phase.lock().unwrap() = match &result {
        Ok(_) => String::new(),
        Err(e) => e.clone(),
    };
    st.busy.store(false, Ordering::SeqCst);
    result
}
#[tauri::command]
async fn engine_control(action: String, app: tauri::AppHandle) -> Result<(), String> {
    if updates::in_progress() {
        return Err("Une mise à jour est en cours.".into());
    }
    if !["start", "stop", "restart"].contains(&action.as_str()) {
        return Err("Action inconnue".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        if action == "restart" {
            control(&app, "stop")?;
            control(&app, "start")
        } else {
            control(&app, &action)
        }
    })
    .await
    .map_err(error)?
}
fn redact(mut text: String, dir: &Path) -> String {
    if let Ok(cfg) = read_json(dir.join("config.json")) {
        if let Some(token) = cfg["token"].as_str() {
            if !token.is_empty() {
                text = text.replace(token, "[clé masquée]");
            }
        }
    }
    text
}
#[tauri::command]
fn get_logs(source: String, st: tauri::State<Studio>) -> Result<String, String> {
    let files = match source.as_str() {
        "studio" => vec!["studio.log"],
        "comfy" => vec!["comfy.stdout.log", "comfy.stderr.log"],
        "bridge" => vec!["bridge.stdout.log", "bridge.stderr.log"],
        _ => return Err("Journal inconnu".into()),
    };
    let mut text = String::new();
    for file in files {
        if let Ok(mut f) = fs::File::open(st.dir.join(file)) {
            let len = f.metadata().map_err(error)?.len();
            f.seek(SeekFrom::Start(len.saturating_sub(48_000)))
                .map_err(error)?;
            let mut b = Vec::new();
            f.read_to_end(&mut b).map_err(error)?;
            text.push_str(&format!("{file}\n{}\n", String::from_utf8_lossy(&b)));
        }
    }
    Ok(redact(text, &st.dir))
}
#[tauri::command]
async fn choose_directory() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(||{
        let o=powershell().args(["-Sta","-Command","Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description='Choisir un dossier'; if($d.ShowDialog() -eq 'OK'){[Console]::OutputEncoding=[Text.Encoding]::UTF8; Write-Output $d.SelectedPath}"]).output().map_err(error)?;
        if !o.status.success(){return Err("Impossible d’ouvrir le sélecteur de dossier.".into())}let p=String::from_utf8_lossy(&o.stdout).trim().trim_start_matches('\u{feff}').to_string();Ok(if p.is_empty(){None}else{Some(p)})
    }).await.map_err(error)?
}
#[tauri::command]
fn open_folder(st: tauri::State<Studio>) -> Result<(), String> {
    command("explorer.exe")
        .arg(&st.dir)
        .spawn()
        .map_err(error)?;
    Ok(())
}
#[tauri::command]
async fn configure_firewall(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let st = app.state::<Studio>();
        let port = st.settings.lock().unwrap().port;
        let result = powershell()
            .arg("-File")
            .arg(st.runtime.join("scripts/Studio-Firewall.ps1"))
            .arg("-NodePath")
            .arg(st.runtime.join("node.exe"))
            .arg("-Port")
            .arg(port.to_string())
            .output()
            .map_err(error)?;
        if result.status.success() {
            Ok(())
        } else {
            Err("Autorisation Windows annulée ou impossible. Le pare-feu reste à vérifier.".into())
        }
    })
    .await
    .map_err(error)?
}
#[tauri::command]
async fn export_pairing(kind: String, app: tauri::AppHandle) -> Result<bool, String> {
    if !["locale", "publique"].contains(&kind.as_str()) {
        return Err("Connexion inconnue".into());
    }
    tauri::async_runtime::spawn_blocking(move||{
        let st=app.state::<Studio>();let src=st.dir.join(if kind=="locale"{"pairing.json"}else{"pairing-public.json"});
        if !src.is_file(){return Err("Cet appairage n’existe pas encore.".into())}
        let o=powershell().args(["-Sta","-Command","Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.SaveFileDialog; $d.Filter='Appairage JSON (*.json)|*.json'; $d.FileName='Mochi-appairage.json'; if($d.ShowDialog() -eq 'OK'){[Console]::OutputEncoding=[Text.Encoding]::UTF8; Write-Output $d.FileName}"]).output().map_err(error)?;
        if !o.status.success(){return Err("Le sélecteur de fichier n’a pas pu s’ouvrir.".into())}
        let dest=String::from_utf8_lossy(&o.stdout).trim().trim_start_matches('\u{feff}').to_string();if dest.is_empty(){return Ok(false)};
        if Path::new(&dest).parent()==Some(st.dir.as_path()){return Err("Choisissez un dossier différent de la configuration privée.".into())}
        fs::copy(src,dest).map_err(error)?;Ok(true)
    }).await.map_err(error)?
}
#[tauri::command]
fn window_action(window: tauri::WebviewWindow, action: String) -> Result<(), String> {
    match action.as_str() {
        "minimize" => window.minimize(),
        "maximize" => {
            if window.is_maximized().map_err(error)? {
                window.unmaximize()
            } else {
                window.maximize()
            }
        }
        "close" => window.close(),
        "drag" => window.start_dragging(),
        _ => return Err("Action inconnue".into()),
    }
    .map_err(error)
}
#[tauri::command]
async fn detect_public_host(app: tauri::AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let client = Client::builder()
            .timeout(Duration::from_secs(8))
            .no_proxy()
            .build()
            .map_err(error)?;
        let mut address = None;
        for endpoint in ["https://api.ipify.org", "https://checkip.amazonaws.com"] {
            if let Ok(response) = client.get(endpoint).send() {
                if let Ok(response) = response.error_for_status() {
                    if let Ok(text) = response.text() {
                        if let Ok(ip) = text.trim().parse::<std::net::Ipv4Addr>() {
                            address = Some(ip.to_string());
                            break;
                        }
                    }
                }
            }
        }
        let host =
            address.ok_or("Détection impossible. Saisissez votre IP publique ou votre domaine.")?;
        let st = app.state::<Studio>();
        let mut candidate = st.settings.lock().unwrap().clone();
        candidate.public_host = host.clone();
        candidate.share_public = true;
        candidate.listen_lan = true;
        public_pairing_value(&st, &candidate)?;
        Ok(host)
    })
    .await
    .map_err(error)?
}
#[tauri::command]
fn onboarding_progress(step: u8, done: bool, st: tauri::State<Studio>) -> Result<Settings, String> {
    let mut s = st.settings.lock().unwrap();
    let mut next = s.clone();
    next.onboarding_step = step.min(4);
    next.onboarding_done = done || s.onboarding_done;
    next.onboarding_seen = true;
    write_json(&st.dir.join("studio.json"), &next)?;
    *s = next.clone();
    Ok(next)
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            if args.iter().any(|a| a == "--start-engine") {
                let handle = app.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    let _ = control(&handle, "start");
                });
            }
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .setup(|app| {
            let dir = PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA absent")?)
                .join("ComfyPocketPC");
            fs::create_dir_all(&dir)?;
            let saved = if dir.join("studio.json").exists() {
                Some(read_json(dir.join("studio.json"))?)
            } else {
                None
            };
            let mut s: Settings = match &saved {
                Some(v) => serde_json::from_value(v.clone())?,
                None => Settings::default(),
            };
            if saved.as_ref().and_then(|v| v.get("sharePublic")).is_none() {
                if let Ok(pair) = read_json(dir.join("pairing-public.json")) {
                    if let Some(url) = pair["url"]
                        .as_str()
                        .and_then(|u| reqwest::Url::parse(u).ok())
                    {
                        s.public_host = url.host_str().unwrap_or_default().into();
                        s.share_public = !s.public_host.is_empty();
                    }
                }
            }
            if saved.is_some() && saved.as_ref().and_then(|v| v.get("sharePublic")).is_none() {
                write_json(&dir.join("studio.json"), &s)?;
            }
            if !dir.join("studio.json").exists() {
                if let Ok(cfg) = read_json(dir.join("config.json")) {
                    s.port = cfg["port"].as_u64().unwrap_or(8189) as u16;
                    s.listen_lan = cfg["host"] != "127.0.0.1";
                    if let Some(m) = cfg["modelsRoot"].as_str() {
                        s.models_directory = m.into();
                    }
                }
                write_json(&dir.join("studio.json"), &s)?;
            }
            let runtime = if cfg!(debug_assertions) {
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("runtime")
            } else {
                app.path().resource_dir()?.join("runtime")
            };
            // PowerShell 5 cannot run -File scripts through Win32 extended-length prefixes.
            let runtime = PathBuf::from(
                runtime
                    .to_string_lossy()
                    .trim_start_matches("\\\\?\\")
                    .to_string(),
            );
            let auto = s.auto_start
                || std::env::args().any(|a| a == "--start-engine")
                || (s.listen_lan && listener(8188) && !listener(s.port));
            app.manage(Studio {
                dir,
                runtime,
                settings: Mutex::new(s),
                busy: AtomicBool::new(false),
                phase: Mutex::new(String::new()),
            });
            let show = MenuItem::with_id(app, "show", "Ouvrir Mochi Studio", true, None::<&str>)?;
            let quit = MenuItem::with_id(
                app,
                "quit",
                "Quitter le lanceur (moteur conservé)",
                true,
                None::<&str>,
            )?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Mochi Studio")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            if std::env::args().any(|a| a == "--background") {
                if let Some(w) = app.get_webview_window("main") {
                    w.hide()?;
                }
            }
            if auto {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn_blocking(move || {
                    let _ = control(&handle, "start");
                });
            }
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(30));
                let st = handle.state::<Studio>();
                if st.busy.load(Ordering::SeqCst) || updates::in_progress() {
                    continue;
                }
                let settings = st.settings.lock().unwrap().clone();
                if settings.listen_lan && listener(8188) && !listener(settings.port) {
                    let _ = control(&handle, "start");
                    std::thread::sleep(Duration::from_secs(30));
                }
            });
            Ok(())
        })
        .on_window_event(|w, e| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = e {
                if w.state::<Studio>().settings.lock().unwrap().close_to_tray {
                    api.prevent_close();
                    let _ = w.hide();
                } else {
                    w.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            window_action,
            onboarding_progress,
            detect_public_host,
            updates::check_update,
            updates::install_update,
            get_status,
            get_settings,
            save_settings,
            engine_control,
            get_logs,
            choose_directory,
            open_folder,
            configure_firewall,
            export_pairing
        ])
        .run(tauri::generate_context!())
        .expect("Impossible de lancer Mochi Studio");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invalid_options_are_rejected() {
        let mut s = Settings::default();
        s.reserve_vram = f64::NAN;
        assert!(validate(&s).is_err());
        s.reserve_vram = 0.9;
        s.port = 8188;
        assert!(validate(&s).is_err());
        s.port = 8189;
        s.preview = "injection".into();
        assert!(validate(&s).is_err());
    }
    #[test]
    fn settings_survive_atomic_replacement_and_bom() {
        let dir = std::env::temp_dir().join(format!("mochi-persistence-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("studio.json");
        let mut s = Settings::default();
        write_json(&file, &s).unwrap();
        s.onboarding_done = true;
        s.share_public = true;
        s.public_host = "example.org".into();
        s.model_paths
            .insert("loras".into(), vec!["C:\\Models\\LoRAs".into()]);
        write_json(&file, &s).unwrap();
        let mut bytes = vec![0xef, 0xbb, 0xbf];
        bytes.extend(fs::read(&file).unwrap());
        fs::write(&file, bytes).unwrap();
        let restored: Settings = serde_json::from_value(read_json(&file).unwrap()).unwrap();
        assert!(restored.onboarding_done && restored.share_public);
        assert_eq!(restored.public_host, "example.org");
        assert_eq!(restored.model_paths, s.model_paths);
        fs::remove_file(file).unwrap();
        fs::remove_dir(dir).unwrap();
    }
    #[test]
    fn default_preserves_quality() {
        let s = Settings::default();
        assert_eq!(s.attention, "pytorch");
        assert_eq!(s.preview, "auto");
        assert_eq!(s.reserve_vram, 0.9);
        assert!(!s.auto_start);
        assert!(!s.start_with_windows);
    }
}
