import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import vercel from "@astrojs/vercel";

// Backend phase 1: SSR via the Vercel adapter. The app is still one React
// island (client:load) mounted from src/pages/index.astro; state now lives
// in Neon Postgres behind the /api routes.
export default defineConfig({
  output: "server",
  adapter: vercel(),
  integrations: [react()],
  vite: {
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  },
});
