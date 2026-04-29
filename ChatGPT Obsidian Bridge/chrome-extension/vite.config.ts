import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "copy-extension-manifest",
      generateBundle() {
        const manifestPath = resolve(__dirname, "manifest.json");
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
        manifest.action = {
          ...(manifest.action as Record<string, unknown>),
          default_popup: "src/popup/popup.html"
        };

        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: JSON.stringify(manifest, null, 2)
        });
      }
    }
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/popup.html"),
        "service-worker": resolve(__dirname, "src/background/service-worker.ts"),
        "chatgpt-detector": resolve(__dirname, "src/content/chatgpt-detector.ts")
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});
