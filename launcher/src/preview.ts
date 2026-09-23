// Design-only fixture, excluded from production behavior by Vite's DEV flag.
export const previewSettings = {
  comfyDirectory: "E:\\Stability\\Data\\Packages\\ComfyUI",
  modelsDirectory: "E:\\Stability\\Data\\Models",
  reserveVram: 0.9,
  preview: "auto",
  attention: "pytorch",
  disableDynamicVram: true,
  listenLan: true,
  sharePublic: true,
  publicHost: "82.67.151.59",
  port: 8189,
  autoStart: false,
  modelPaths: {},
  closeToTray: true,
  reducedMotion: false,
  checkUpdates: false,
  onboardingStep: 0,
  onboardingDone: true,
  startWithWindows: false,
};
export const previewStatus = {
  engine: true,
  bridge: true,
  ready: true,
  busy: false,
  phase: "",
  message: "",
  paired: true,
  queue: 0,
  urls: [
    { kind: "locale", url: "https://192.168.1.8:8189" },
    { kind: "publique", url: "https://82.67.151.59:8189" },
  ],
  stats: {
    devices: [
      {
        name: "NVIDIA GeForce RTX 4070 SUPER",
        vram_free: 11596411699,
        vram_total: 12884901888,
      },
    ],
  },
};
