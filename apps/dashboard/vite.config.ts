import solid from "vite-plugin-solid";
import { defineConfig } from "vite";

const runtimeProxy = {
  "/api": "http://127.0.0.1:54310",
};

export default defineConfig({
  build: {
    outDir: "dist",
  },
  plugins: [solid()],
  preview: {
    proxy: runtimeProxy,
  },
  server: {
    host: "127.0.0.1",
    port: 54_311,
    proxy: runtimeProxy,
  },
});
