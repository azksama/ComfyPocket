#![cfg_attr(windows, windows_subsystem = "windows")]
#[path = "../src/standalone.rs"]
mod standalone;

fn main() {
    match standalone::ensure_independent() {
        Ok(true) => return,
        Ok(false) => {},
        Err(e) => panic!("{e}"),
    }
    let output = std::env::args().skip(1).find(|a| a != "--mochi-independent").expect("output file");
    std::fs::write(output, format!("{} {}", std::process::id(), standalone::in_job().unwrap())).unwrap();
    std::thread::sleep(std::time::Duration::from_secs(20));
}
