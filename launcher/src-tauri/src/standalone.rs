use std::{io, process::Command};

#[cfg(windows)]
pub(crate) fn in_job() -> io::Result<bool> {
    use windows_sys::Win32::System::{JobObjects::IsProcessInJob, Threading::GetCurrentProcess};
    let mut assigned = 0;
    if unsafe { IsProcessInJob(GetCurrentProcess(), std::ptr::null_mut(), &mut assigned) } == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(assigned != 0)
}

fn quote_argument(value: &str) -> String {
    let mut result = String::from("\"");
    let mut slashes = 0;
    for ch in value.chars() {
        if ch == '\\' {
            slashes += 1;
        } else {
            result.extend(std::iter::repeat_n('\\', if ch == '"' { slashes * 2 + 1 } else { slashes }));
            result.push(ch);
            slashes = 0;
        }
    }
    result.extend(std::iter::repeat_n('\\', slashes * 2));
    result.push('"');
    result
}

/// A shell or automation host may terminate its whole Windows job on exit.
/// WMI launches the application outside that caller's job and package context.
#[cfg(windows)]
pub(crate) fn ensure_independent() -> Result<bool, String> {
    use std::os::windows::process::CommandExt;
    if !in_job().map_err(|e| e.to_string())? {
        return Ok(false);
    }
    if std::env::args().any(|a| a == "--mochi-independent") {
        return Err("Windows n’a pas pu détacher Mochi du programme qui l’a lancé. Ouvrez Mochi Studio depuis le menu Démarrer.".into());
    }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut line = quote_argument(&exe.to_string_lossy());
    line.push_str(" --mochi-independent");
    for argument in std::env::args_os().skip(1) {
        line.push(' ');
        line.push_str(&quote_argument(&argument.to_string_lossy()));
    }
    let script = format!(
        "$ErrorActionPreference='Stop'; $startup=New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{{ShowWindow=[uint16]0;CreateFlags=[uint32]16777216}}; $result=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{{CommandLine='{}';ProcessStartupInformation=$startup}}; if($result.ReturnValue -ne 0){{throw ('Démarrage indépendant refusé par Windows : '+$result.ReturnValue)}}",
        line.replace('\'', "''")
    );
    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(format!("Impossible d’ouvrir Mochi indépendamment : {}", String::from_utf8_lossy(&output.stderr).trim()));
    }
    Ok(true)
}

#[cfg(not(windows))]
pub(crate) fn ensure_independent() -> Result<bool, String> { Ok(false) }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn windows_arguments_preserve_spaces_quotes_and_trailing_slashes() {
        assert_eq!(quote_argument("C:\\a b\\"), "\"C:\\a b\\\\\"");
        assert_eq!(quote_argument("a\"b"), "\"a\\\"b\"");
        assert_eq!(quote_argument(""), "\"\"");
    }
}
