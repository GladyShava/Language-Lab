import vinext from "vinext";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

// Keep the existing Cloudflare/Sites configuration untouched. Vercel uses
// Nitro's adapter to turn the Vinext application into its deployment output.
process.env.NITRO_PRESET ??= "vercel";

export default defineConfig({
  css: { postcss: "./postcss.config.mjs" },
  plugins: [vinext(), nitro()],
});
