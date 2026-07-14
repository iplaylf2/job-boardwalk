import type { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { until } from "@shajara/host";
import type { Scope } from "@shajara/host";

import { createWorkspaceMcpServer } from "#/mcp-server.js";
import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

export function registerMcpEndpoint(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.all("/mcp", (context) =>
    serviceScope.run(function* handleMcpRequest() {
      const mcpServer = createWorkspaceMcpServer(repository, serviceScope);
      const httpTransport = new WebStandardStreamableHTTPServerTransport({
        enableJsonResponse: true,
      });
      yield* until(() => mcpServer.connect(httpTransport));
      try {
        return yield* until(() => httpTransport.handleRequest(context.req.raw));
      } finally {
        yield* until(() => mcpServer.close());
      }
    }),
  );
}
