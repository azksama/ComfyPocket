use rustls_pki_types::{pem::PemObject, CertificateDer, ServerName};

pub(crate) fn verify_host(pem: &[u8], host: &str) -> Result<(), String> {
    let der = CertificateDer::from_pem_slice(pem)
        .map_err(|e| format!("Le certificat existant est illisible : {e}"))?;
    let certificate = webpki::EndEntityCert::try_from(&der)
        .map_err(|e| format!("Le certificat existant est invalide : {e}"))?;
    let name = ServerName::try_from(host)
        .map_err(|_| "Adresse IP ou nom de domaine invalide.".to_owned())?;
    certificate.verify_is_valid_for_subject_name(&name).map_err(|_| {
        "Cette adresse n’est pas couverte par votre certificat. L’identité actuelle a été conservée.".to_owned()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    const CERT: &[u8] = include_bytes!("../tests/fixtures/host-certificate.txt");

    #[test]
    fn accepts_ip_and_dns_subject_alternative_names() {
        for host in ["203.0.113.42", "127.0.0.1", "localhost"] {
            verify_host(CERT, host).unwrap();
        }
    }

    #[test]
    fn rejects_an_address_outside_the_certificate() {
        assert!(verify_host(CERT, "203.0.113.43").unwrap_err().contains("pas couverte"));
    }

    #[test]
    fn malformed_certificate_is_not_reported_as_an_address_mismatch() {
        assert!(verify_host(b"invalid", "203.0.113.42").unwrap_err().contains("illisible"));
    }
}
