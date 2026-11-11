import { defineConfig } from "@playwright/test";

// Les deux vues du Builder ont chacune leur suite, leur Builder et leur port : elles peuvent tourner
// en parallèle sans se disputer le même.
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  projects: [
    { name: "parcours", testMatch: /parcours\.spec\.ts/, use: { baseURL: "http://127.0.0.1:4399" } },
    { name: "pipeline", testMatch: /pipeline\.spec\.ts/, use: { baseURL: "http://127.0.0.1:4398" } },
  ],
});
