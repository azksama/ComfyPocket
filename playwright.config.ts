import { defineConfig } from "@playwright/test";
const appPort = Number(process.env.MOCHI_TEST_PORT || 14420);
const studioPort = Number(process.env.MOCHI_STUDIO_TEST_PORT || 14430);
export default defineConfig({
  testDir: "tests",
  timeout: 45000,
  use: {
    baseURL: `http://127.0.0.1:${appPort}`,
    viewport: { width: 390, height: 844 },
  },
  webServer: [
    {
      command: `npm run dev -- --port ${appPort}`,
      url: `http://127.0.0.1:${appPort}`,
      reuseExistingServer: false,
    },
    {
      command: `npm --prefix launcher run dev -- --port ${studioPort} --strictPort`,
      url: `http://127.0.0.1:${studioPort}`,
      reuseExistingServer: false,
    },
  ],
  reporter: "list",
});
