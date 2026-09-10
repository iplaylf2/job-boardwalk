// eslint-disable-next-line import/no-nodejs-modules -- Vite runs on Node and supplies runtime deployment metadata.
import process from "node:process";
import type { ViteDevServer } from "vite";
import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

const workspaceServiceProxy = {
  "/api": "http://127.0.0.1:54310",
};

function serveBrowserSessionOrigin(server: Pick<ViteDevServer, "middlewares">): void {
  server.middlewares.use("/browser-session/origin", (_request, response) => {
    response.setHeader("Content-Type", "text/plain");
    response.setHeader("Cache-Control", "no-store");
    response.end(process.env["JOB_BOARDWALK_BROWSER_SESSION_ORIGIN"] ?? "http://127.0.0.1:54312");
  });
}

export default defineConfig({
  build: {
    outDir: "dist",
  },
  css: {
    modules: {
      localsConvention: "camelCaseOnly",
    },
  },
  plugins: [
    solid(),
    {
      configurePreviewServer: serveBrowserSessionOrigin,
      configureServer: serveBrowserSessionOrigin,
      name: "browser-session-origin",
    },
  ],
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
