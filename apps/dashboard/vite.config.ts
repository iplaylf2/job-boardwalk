import solid from "vite-plugin-solid";
import { defineConfig } from "vite";

const stateServiceProxy = {
  "/api": "http://127.0.0.1:4310",
};

export default defineConfig({
  build: {
    outDir: "dist",
  },
  plugins: [solid()],
  preview: {
    proxy: stateServiceProxy,
  },
  server: {
    host: "127.0.0.1",
    port: 4311,
    proxy: stateServiceProxy,
  },
});
