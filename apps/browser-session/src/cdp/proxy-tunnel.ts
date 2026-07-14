import net from "node:net";
import type { Server, Socket } from "node:net";

const connectTimeoutMilliseconds = 5000;
const bytesPerKibibyte = 1024;
const maximumProxyResponseHeaderKibibytes = 16;
const maximumProxyResponseHeaderBytes = maximumProxyResponseHeaderKibibytes * bytesPerKibibyte;
const successfulConnectStatus = 200;
const defaultHttpPort = 80;
const defaultHttpsPort = 443;
const ephemeralPort = 0;
const headerTerminator = "\r\n\r\n";
const missingIndex = -1;
const statusCodeIndex = 1;
const unlimitedSocketTimeout = 0;
const zeroBytes = 0;

function defaultPort(url: URL): number {
  if (url.port) {
    return Number(url.port);
  }
  return url.protocol === "https:" ? defaultHttpsPort : defaultHttpPort;
}

function proxyAuthorizationHeader(proxy: URL): string | null {
  if (!proxy.username && !proxy.password) {
    return null;
  }
  const credentials = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

function validateEndpoint(endpoint: URL): void {
  if (endpoint.protocol !== "http:") {
    throw new Error("JOB_BOARDWALK_CDP_URL 必须是 HTTP URL。");
  }
  if (endpoint.username || endpoint.password) {
    throw new Error("JOB_BOARDWALK_CDP_URL 不得包含凭据。");
  }
}

function validateProxy(proxy: URL): void {
  if (proxy.protocol !== "http:") {
    throw new Error("JOB_BOARDWALK_CDP_PROXY_URL 目前只支持 HTTP CONNECT 代理。");
  }
}

export class CdpProxyTunnel {
  readonly #activeSockets = new Set<Socket>();
  readonly #proxy: URL;
  readonly #server: Server;
  readonly #target: URL;
  #endpoint: URL | null = null;

  public constructor(target: URL, proxy: URL) {
    validateEndpoint(target);
    validateProxy(proxy);
    this.#target = target;
    this.#proxy = proxy;
    this.#server = net.createServer((client) => this.#accept(client));
  }

  public get endpoint(): URL {
    if (!this.#endpoint) {
      throw new Error("CDP CONNECT 隧道尚未启动。");
    }
    return new URL(this.#endpoint);
  }

  public async start(): Promise<void> {
    if (this.#endpoint) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      function handleError(error: Error): void {
        reject(error);
      }
      this.#server.once("error", handleError);
      this.#server.listen(ephemeralPort, "127.0.0.1", () => {
        this.#server.off("error", handleError);
        resolve();
      });
    });
    const address = this.#server.address();
    if (!address || typeof address === "string") {
      throw new Error("无法确定 CDP CONNECT 隧道的本地端口。");
    }
    this.#endpoint = new URL(`http://127.0.0.1:${address.port}`);
  }

  public async close(): Promise<void> {
    this.#endpoint = null;
    for (const socket of this.#activeSockets) {
      socket.destroy();
    }
    await new Promise<void>((resolve, reject) => {
      this.#server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  // A CONNECT handshake and the transition to byte piping form one state machine.
  // eslint-disable-next-line max-lines-per-function
  #accept(client: Socket): void {
    client.pause();
    this.#track(client);
    const upstream = net.connect({
      host: this.#proxy.hostname,
      port: defaultPort(this.#proxy),
    });
    this.#track(upstream);
    const targetAuthority = `${this.#target.hostname}:${defaultPort(this.#target)}`;
    let response = Buffer.alloc(zeroBytes);
    let tunnelEstablished = false;

    function fail(error: Error): void {
      client.destroy(error);
      upstream.destroy();
    }
    client.once("error", () => upstream.destroy());
    client.once("close", () => upstream.destroy());
    upstream.once("error", fail);
    upstream.setTimeout(connectTimeoutMilliseconds, () => {
      fail(new Error("连接 CDP HTTP 代理超时。"));
    });
    upstream.once("connect", () => {
      const authorization = proxyAuthorizationHeader(this.#proxy);
      const headers = [
        `CONNECT ${targetAuthority} HTTP/1.1`,
        `Host: ${targetAuthority}`,
        "Proxy-Connection: Keep-Alive",
        ...(authorization ? [`Proxy-Authorization: ${authorization}`] : []),
        "",
        "",
      ];
      upstream.write(headers.join("\r\n"));
    });
    // eslint-disable-next-line max-statements
    upstream.on("data", function readProxyResponse(chunk: Buffer) {
      if (tunnelEstablished) {
        return;
      }
      response = Buffer.concat([response, chunk]);
      if (response.length > maximumProxyResponseHeaderBytes) {
        fail(new Error("CDP HTTP 代理返回了过大的 CONNECT 响应头。"));
        return;
      }
      const headerEnd = response.indexOf(headerTerminator);
      if (headerEnd === missingIndex) {
        return;
      }
      const statusLine = response.subarray(zeroBytes, response.indexOf("\r\n")).toString("ascii");
      const status = Number(statusLine.split(" ")[statusCodeIndex]);
      if (status !== successfulConnectStatus) {
        fail(new Error(`CDP HTTP 代理拒绝 CONNECT，状态码 ${String(status)}。`));
        return;
      }
      tunnelEstablished = true;
      upstream.removeListener("data", readProxyResponse);
      upstream.setTimeout(unlimitedSocketTimeout);
      const remaining = response.subarray(headerEnd + Buffer.byteLength(headerTerminator));
      if (remaining.length > zeroBytes) {
        client.write(remaining);
      }
      client.pipe(upstream);
      upstream.pipe(client);
      client.resume();
    });
  }

  #track(socket: Socket): void {
    this.#activeSockets.add(socket);
    socket.once("close", () => this.#activeSockets.delete(socket));
  }
}

export function resolveDirectCdpEndpoint(endpoint: URL): URL {
  validateEndpoint(endpoint);
  return new URL(endpoint);
}
