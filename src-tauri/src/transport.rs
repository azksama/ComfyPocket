use reqwest::{Client, Response, StatusCode, Url};
use serde::{Deserialize, Serialize};
use std::time::Duration;

pub(crate) const IMAGE_LIMIT: usize = 64 * 1024 * 1024;
pub(crate) const JSON_LIMIT: usize = 32 * 1024 * 1024;

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Pairing {
    pub url: String,
    pub token: String,
    pub certificate: String,
}

#[derive(Clone)]
pub(crate) struct Connection {
    pub pairing: Pairing,
    pub client: Client,
}

pub(crate) fn connection(mut pairing: Pairing) -> Result<Connection, String> {
    let url = Url::parse(pairing.url.trim()).map_err(|_| "Adresse invalide")?;
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
    pairing.url = url.origin().ascii_serialization();
    pairing.token = pairing.token.trim().into();
    if !(32..=256).contains(&pairing.token.len())
        || !pairing.token.bytes().all(|c| c.is_ascii_graphic())
    {
        return Err("Clé d’accès invalide".into());
    }
    if pairing.certificate.len() > 64 * 1024 {
        return Err("Certificat trop volumineux".into());
    }
    let cert = reqwest::Certificate::from_pem(pairing.certificate.as_bytes())
        .map_err(|_| "Certificat invalide")?;
    let client = Client::builder()
        .no_proxy()
        .tls_built_in_root_certs(false)
        .add_root_certificate(cert)
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(45))
        .connect_timeout(Duration::from_secs(8))
        .build()
        .map_err(|_| "Initialisation de la connexion impossible")?;
    Ok(Connection { pairing, client })
}

fn request_url(base: &str, path: &str) -> Result<Url, String> {
    if (!path.starts_with("/api/") && !path.starts_with("/bridge/"))
        || path.contains('\\')
        || path.contains('#')
    {
        return Err("Route interdite".into());
    }
    let url = Url::parse(&format!("{}{}", base.trim_end_matches('/'), path))
        .map_err(|_| "Route invalide")?;
    // URL parsing resolves encoded dot segments too. Check the final route rather
    // than rejecting legitimate dots in an image filename or query parameter.
    if !url.path().starts_with("/api/") && !url.path().starts_with("/bridge/") {
        return Err("Route interdite".into());
    }
    Ok(url)
}

fn network_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "Le PC n’a pas répondu à temps. Vérifiez qu’il est allumé et réessayez.".into()
    } else if error.is_connect() {
        "Impossible de joindre le PC. Vérifiez l’adresse, le port, le réseau/VPN et le certificat d’appairage.".into()
    } else {
        "Connexion interrompue pendant le transfert. Réessayez.".into()
    }
}

fn status_error(code: StatusCode, path: &str) -> Option<&'static str> {
    match code.as_u16() {
        401 => Some("Appairage refusé. Vérifiez la clé d’accès de cette connexion."),
        502 | 503 if path.starts_with("/api/") => Some(
            "Le compagnon répond, mais ComfyUI n’est pas prêt. Vérifiez son démarrage sur le PC.",
        ),
        429 => Some("Le PC reçoit trop de demandes. Patientez quelques secondes puis réessayez."),
        _ => None,
    }
}

pub(crate) async fn request(
    connection: &Connection,
    path: &str,
    body: Option<serde_json::Value>,
) -> Result<Response, String> {
    let url = request_url(&connection.pairing.url, path)?;
    let builder = if let Some(value) = body {
        connection.client.post(url).json(&value)
    } else {
        connection.client.get(url)
    };
    let response = builder
        .bearer_auth(&connection.pairing.token)
        .send()
        .await
        .map_err(network_error)?;
    if response.status().is_success() {
        return Ok(response);
    }
    let code = response.status();
    if let Some(message) = status_error(code, path) {
        return Err(message.into());
    }
    let body = read_limited(response, 4096).await.unwrap_or_default();
    let message: String = String::from_utf8_lossy(&body).chars().take(1800).collect();
    Err(if message.is_empty() {
        format!("Le serveur a répondu {code}.")
    } else {
        format!("Serveur {code} : {message}")
    })
}

fn append_bounded(bytes: &mut Vec<u8>, chunk: &[u8], limit: usize) -> Result<(), String> {
    if chunk.len() > limit.saturating_sub(bytes.len()) {
        return Err("Réponse du PC trop volumineuse".into());
    }
    bytes.extend_from_slice(chunk);
    Ok(())
}

pub(crate) async fn read_limited(mut response: Response, limit: usize) -> Result<Vec<u8>, String> {
    if response
        .content_length()
        .is_some_and(|length| length > limit as u64)
    {
        return Err("Réponse du PC trop volumineuse".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(network_error)? {
        append_bounded(&mut bytes, &chunk, limit)?;
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_insecure_addresses_and_header_injection() {
        for url in [
            "http://192.168.1.1:8189",
            "https://example.com/path",
            "https://user:pass@example.com/",
            "https://pc/?key=x",
            "https://pc/#x",
        ] {
            assert!(connection(Pairing {
                url: url.into(),
                token: "x".repeat(64),
                certificate: String::new()
            })
            .is_err());
        }
        assert!(
            matches!(connection(Pairing { url: "https://pc/".into(), token: "x".repeat(40) + "\r\nsecret", certificate: String::new() }), Err(error) if error.contains("Clé"))
        );
    }

    #[test]
    fn validates_final_routes_and_accepts_image_query_dots() {
        assert!(request_url("https://pc:8189", "/bridge/file?relative=image..png").is_ok());
        for path in [
            "/api/../private",
            "/api/%2e%2e/private",
            "//example.com/api/view",
            "/api/view#fragment",
            "/api/\\private",
        ] {
            assert!(request_url("https://pc:8189", path).is_err(), "{path}");
        }
    }

    #[test]
    fn bound_is_enforced_before_appending_each_chunk() {
        let mut bytes = Vec::new();
        assert!(append_bounded(&mut bytes, b"1234", 5).is_ok());
        assert!(append_bounded(&mut bytes, b"56", 5).is_err());
        assert_eq!(bytes, b"1234");
        assert!(append_bounded(&mut bytes, b"5", 5).is_ok());
        assert!(append_bounded(&mut bytes, b"6", 5).is_err());
    }

    #[test]
    fn authentication_and_upstream_failures_are_distinguishable() {
        assert!(status_error(StatusCode::UNAUTHORIZED, "/bridge/info")
            .unwrap()
            .contains("Appairage"));
        assert!(status_error(StatusCode::BAD_GATEWAY, "/api/system_stats")
            .unwrap()
            .contains("ComfyUI"));
        assert_eq!(status_error(StatusCode::BAD_REQUEST, "/api/prompt"), None);
    }

    #[test]
    fn preserves_file_and_route_errors_instead_of_claiming_a_pairing_failure() {
        assert_eq!(status_error(StatusCode::FORBIDDEN, "/bridge/file"), None);
        assert_eq!(status_error(StatusCode::FORBIDDEN, "/api/forbidden"), None);
        assert_eq!(
            status_error(StatusCode::BAD_GATEWAY, "/bridge/gallery"),
            None
        );
        assert_eq!(
            status_error(StatusCode::SERVICE_UNAVAILABLE, "/bridge/file"),
            None
        );
        assert!(status_error(StatusCode::SERVICE_UNAVAILABLE, "/api/system_stats").is_some());
    }

    #[test]
    #[ignore = "Requires live companion and COMFY_PAIRING_FILE"]
    fn live_native_tls() {
        let path = std::env::var("COMFY_PAIRING_FILE").expect("COMFY_PAIRING_FILE");
        let pairing: Pairing = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        let client = connection(pairing).unwrap();
        let runtime = tokio::runtime::Runtime::new().unwrap();
        assert!(runtime
            .block_on(request(&client, "/api/system_stats", None))
            .is_ok());
    }
}
