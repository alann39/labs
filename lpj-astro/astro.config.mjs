import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// Frontend-only phase: fully static output, the whole app is one React
// island (client:load) mounted from src/pages/index.astro.
export default defineConfig({
  output: "static",
  integrations: [react()],
  vite: {
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  },
});
