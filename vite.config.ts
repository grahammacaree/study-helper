import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "web",
  plugins: [react()],
  resolve: {
    alias: {
      katex: fileURLToPath(new URL("./node_modules/katex", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5180,
    proxy: {
      "/api": "http://127.0.0.1:8790",
    },
  },
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
  },
});
