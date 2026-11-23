/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Emits sw.js with the exact list of built files to precache, versioned by content hash (works fully offline).
function serviceWorker(): Plugin {
  return {
    name: "emit-sw", apply: "build",
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith(".map"));
      const list = ["./", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png", ...files];
      const version = createHash("sha256").update(files.map((f) => { const b = bundle[f]!; return f + (b.type === "chunk" ? b.code : String(b.source)); }).join("")).digest("hex").slice(0, 12);
      const tpl = readFileSync(new URL("./src/sw.js", import.meta.url), "utf8");
      this.emitFile({ type: "asset", fileName: "sw.js", source: tpl.replace("__VERSION__", version).replace("__PRECACHE__", JSON.stringify(list)) });
    },
  };
}
export default defineConfig({
  base: "./",
  plugins: [react(), serviceWorker()],
  build: { target: "es2022", sourcemap: false },
  test: { environment: "node", include: ["tests/**/*.test.ts"], setupFiles: ["fake-indexeddb/auto"] },
});
