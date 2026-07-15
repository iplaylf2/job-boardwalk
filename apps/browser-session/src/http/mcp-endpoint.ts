import type { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { until } from "@shajara/host";
import type { Scope } from "@shajara/host";

import type { BrowserControl } from "#/browser/browser-control.js";
import { createBrowserSessionMcpServer } from "#/mcp-server.js";

export function registerMcpEndpoint(
  app: Hono,
  browserControl: BrowserControl,
  serviceScope: Scope,
): void {
  app.all("/mcp", (requestContext) =>
    serviceScope.run(function* handleMcpRequest() {
      const mcpServer = createBrowserSessionMcpServer(browserControl, serviceScope);
      const httpTransport = new WebStandardStreamableHTTPServerTransport({
        enableJsonResponse: true,
      });
      yield* until(() => mcpServer.connect(httpTransport));
      try {
        return yield* until(() => httpTransport.handleRequest(requestContext.req.raw));
      } finally {
        yield* until(() => mcpServer.close());
      }
    }),
  );
}
