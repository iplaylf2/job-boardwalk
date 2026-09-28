import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

const workspaceServiceProxy = {
  "/api": "http://127.0.0.1:54310",
};

export default defineConfig({
  build: {
    outDir: "dist",
  },
  css: {
    modules: {
      localsConvention: "camelCaseOnly",
    },
  },
  plugins: [solid()],
  preview: {
    proxy: workspaceServiceProxy,
  },
  server: {
    host: "127.0.0.1",
    port: 54_311,
    proxy: workspaceServiceProxy,
  },
  test: {
    environment: "node",
  },
});
