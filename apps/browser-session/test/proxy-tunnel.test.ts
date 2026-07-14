import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";

import { expect, test } from "vitest";

import { CdpProxyTunnel } from "#/cdp/proxy-tunnel.js";

const successfulStatus = 200;
const ephemeralPort = 0;

function listen(server: http.Server | net.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(ephemeralPort, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function close(server: http.Server | net.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("forwards CDP HTTP traffic through an HTTP CONNECT proxy", async () => {
  const target = http.createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ Browser: "Edge test" }));
  });
  const targetPort = await listen(target);
  const proxy = net.createServer((client) => {
    client.once("data", () => {
      const upstream = net.connect(targetPort, "127.0.0.1", () => {
        client.write("HTTP/1.1 200 Connection established\r\n\r\n");
        client.pipe(upstream);
        upstream.pipe(client);
      });
      upstream.once("error", () => client.destroy());
    });
  });
  const proxyPort = await listen(proxy);
  const tunnel = new CdpProxyTunnel(
    new URL(`http://127.0.0.1:${targetPort}`),
    new URL(`http://127.0.0.1:${proxyPort}`),
  );

  try {
    await tunnel.start();
    const response = await fetch(new URL("/json/version", tunnel.endpoint));
    expect(response.status).toBe(successfulStatus);
    expect(await response.json()).toEqual({ Browser: "Edge test" });
  } finally {
    await tunnel.close();
    await close(proxy);
    await close(target);
  }
});
