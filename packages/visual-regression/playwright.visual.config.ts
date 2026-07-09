import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./visual",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    viewport: { width: 1440, height: 900 }
  },
  expect: { toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.001 } }
});
