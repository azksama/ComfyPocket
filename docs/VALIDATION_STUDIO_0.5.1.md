# Mochi Studio 0.5.1

Public sharing now saves immediately when a host is present; disabling it also saves immediately. A first activation without a host remains a draft until an address is entered and saved. The stored choice and host survive application restarts.

Certificate hostname checking uses Rust's WebPKI directly instead of spawning Node. Invalid PEM, unreadable files and uncovered names produce distinct errors. Existing certificates, keys and pairing credentials are preserved. No hostname or TLS verification is bypassed.

Validation on Windows:

- Nine Rust tests passed, including IP/DNS SAN matching, unknown IP rejection, malformed PEM errors and persistent settings.
- Playwright Studio settings regression passed: enable/save, reload, disable with automatic save, reload, enable with automatic save, reload.
- TypeScript/Vite production build and Windows NSIS build succeeded.
- Installed version 0.5.1; actual WebView/native commands saved the public-sharing choice and preserved it after a full Studio process restart.
- Existing certificate SHA-256 unchanged; authenticated HTTPS health check including ComfyUI passed after starting the engine.
- A final combined public/local address check and diagnostic-mode cleanup was blocked by automatic approval review. External mobile-network and physical Android connection were not verified in this patch. The user was notified to quit/reopen Studio to remove its temporary loopback diagnostic port.

The observed former error collapsed all Node subprocess failures into a certificate-name mismatch. Its exact intermittent trigger is not established. Removing this subprocess eliminates that failure path without replacing the user's identity.
