import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, request as requestHttp } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import path from "node:path";
import process from "node:process";

import { completer, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { wait } from "@shajara/host/primitives";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);
const badGatewayStatus = 502;
const badRequestStatus = 400;
const internalServerErrorStatus = 500;
const methodNotAllowedStatus = 405;
const notFoundStatus = 404;
const okStatus = 200;

const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

export interface DashboardHostOptions {
  readonly dashboardDirectory: string;
  readonly hostname: string;
  readonly port: number;
  readonly workspaceServiceHostname: string;
  readonly workspaceServicePort: number;
}

function applySecurityHeaders(response: ServerResponse): void {
  for (const [name, value] of Object.entries(securityHeaders)) {
    response.setHeader(name, value);
  }
}

function rejectUnsupportedStaticMethod(
  request: IncomingMessage,
  response: ServerResponse,
): boolean {
  if (request.method === "GET" || request.method === "HEAD") {
    return false;
  }
  response.writeHead(methodNotAllowedStatus, {
    Allow: "GET, HEAD",
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end("Method not allowed");
  return true;
}

function proxyWorkspaceRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: DashboardHostOptions,
): void {
  const proxyRequest = requestHttp(
    {
      headers: request.headers,
      hostname: options.workspaceServiceHostname,
      method: request.method,
      path: request.url,
      port: options.workspaceServicePort,
    },
    (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode ?? badGatewayStatus, proxyResponse.headers);
      proxyResponse.pipe(response);
    },
  );
  proxyRequest.once("error", () => {
    if (!response.headersSent) {
      response.writeHead(badGatewayStatus, { "Content-Type": "text/plain; charset=utf-8" });
    }
    response.end("Workspace Service unavailable");
  });
  request.pipe(proxyRequest);
}

function resolveDashboardFileCandidate(
  dashboardDirectory: string,
  requestPath: string,
): { readonly filePath: string; readonly insideDashboardDirectory: boolean } {
  const decodedPath = decodeURIComponent(requestPath);
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/u, "");
  const filePath = path.resolve(dashboardDirectory, relativePath);
  const relativeFilePath = path.relative(dashboardDirectory, filePath);
  return {
    filePath,
    insideDashboardDirectory:
      relativeFilePath !== ".." &&
      !relativeFilePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativeFilePath),
  };
}

async function serveDashboardFile(
  request: IncomingMessage,
  response: ServerResponse,
  options: DashboardHostOptions,
): Promise<void> {
  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  const requestedFile = resolveDashboardRequestFile(
    options.dashboardDirectory,
    requestUrl.pathname,
  );
  if (requestedFile instanceof Error) {
    response.writeHead(badRequestStatus, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Bad request");
    return;
  }
  if (!requestedFile.insideDashboardDirectory) {
    response.writeHead(notFoundStatus, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  const filePath = await resolveDashboardResourcePath(
    options.dashboardDirectory,
    requestedFile.filePath,
  );
  await sendDashboardFile(request, response, filePath);
}

function resolveDashboardRequestFile(
  dashboardDirectory: string,
  requestPath: string,
): ReturnType<typeof resolveDashboardFileCandidate> | Error {
  try {
    return resolveDashboardFileCandidate(dashboardDirectory, requestPath);
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

async function resolveDashboardResourcePath(
  dashboardDirectory: string,
  requestedFilePath: string,
): Promise<string> {
  let filePath = requestedFilePath;
  try {
    const fileStatus = await stat(filePath);
    if (!fileStatus.isFile()) {
      filePath = path.join(dashboardDirectory, "index.html");
    }
  } catch {
    filePath = path.join(dashboardDirectory, "index.html");
  }
  return filePath;
}

async function sendDashboardFile(
  request: IncomingMessage,
  response: ServerResponse,
  filePath: string,
): Promise<void> {
  const fileStatus = await stat(filePath);
  response.writeHead(okStatus, {
    "Content-Length": fileStatus.size,
    "Content-Type": contentTypes.get(path.extname(filePath)) ?? "application/octet-stream",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

export function createDashboardHostServer(options: DashboardHostOptions): Server {
  function listener(request: IncomingMessage, response: ServerResponse): void {
    applySecurityHeaders(response);
    if (request.url === "/api" || request.url?.startsWith("/api/")) {
      proxyWorkspaceRequest(request, response, options);
      return;
    }
    if (rejectUnsupportedStaticMethod(request, response)) {
      return;
    }
    if (request.url === "/health") {
      response.writeHead(okStatus, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("ok");
      return;
    }
    serveDashboardFile(request, response, options).catch((error: unknown) => {
      if (!response.headersSent) {
        response.writeHead(internalServerErrorStatus, {
          "Content-Type": "text/plain; charset=utf-8",
        });
      }
      response.end("Dashboard resource unavailable");
      process.stderr.write(`[Dashboard Host] ${String(error)}\n`);
    });
  }
  return createServer(listener);
}

function listen(server: Server, options: DashboardHostOptions): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.hostname, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function installShutdownHandlers(requestShutdown: () => void): () => void {
  process.once("SIGINT", requestShutdown);
  process.once("SIGTERM", requestShutdown);
  return () => {
    process.removeListener("SIGINT", requestShutdown);
    process.removeListener("SIGTERM", requestShutdown);
  };
}

export function* runDashboardHost(options: DashboardHostOptions): RiteCoroutine<void> {
  const server = createDashboardHostServer(options);
  const shutdown = yield* completer<true>();
  const removeShutdownHandlers = installShutdownHandlers(() => shutdown.resolve(true));
  try {
    yield* until(() => listen(server, options));
    process.stdout.write(`Dashboard Host: http://${options.hostname}:${options.port}\n`);
    yield* wait(shutdown.future);
  } finally {
    removeShutdownHandlers();
    if (server.listening) {
      yield* until(() => close(server));
    }
  }
}
