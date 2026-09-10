import { afterEach, expect, test, vi } from "vitest";
import { createDashboardRuntime } from "#/dashboard-runtime.js";
import { checkBrowserSession } from "#/browser-session/health-check.js";

const badGatewayStatus = 502;
const serviceOrigin = "http://127.0.0.1:55312";

afterEach(() => vi.unstubAllGlobals());

async function readCheckResult() {
  const runtime = createDashboardRuntime();
  try {
    return await runtime.run(checkBrowserSession());
  } finally {
    await runtime.close();
  }
}

test.each([
  { available: true, tabCount: 0 },
  {
    available: false,
    lifecycle: { phase: "starting", phaseStartedAt: "2026-01-01T00:00:00.000Z" },
  },
])("distinguishes browser readiness from service connectivity: %j", async (browser) => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(serviceOrigin))
    .mockResolvedValueOnce(Response.json({ browser, status: "ok" }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await readCheckResult()).toMatchObject({ browser, outcome: "observed" });
  expect(fetchMock).toHaveBeenLastCalledWith(
    `${serviceOrigin}/health`,
    expect.objectContaining({
      cache: "no-store",
      credentials: "omit",
      signal: expect.any(AbortSignal),
    }),
  );
});

test("does not contact a browser when the product form has no origin configured", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(""));
  vi.stubGlobal("fetch", fetchMock);
  expect(await readCheckResult()).toMatchObject({ outcome: "unconfigured" });
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/browser-session/origin"]);
});

test.each([
  "https://external.invalid",
  "http://user:secret@localhost:55312",
  "file:///tmp/browser",
  "http://localhost:55312/mcp",
])("rejects an invalid configured origin: %s", async (url) => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(url));
  vi.stubGlobal("fetch", fetchMock);
  expect(await readCheckResult()).toMatchObject({ outcome: "configuration-error" });
  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(["/browser-session/origin"]);
});

test.each(["configuration-body", "health-request"])(
  "contains a failed %s read and permits a later check",
  async (stage) => {
    const error = new TypeError("synthetic network failure");
    const configuration = new Response(serviceOrigin);
    const fetchMock = vi.fn().mockResolvedValueOnce(configuration);
    if (stage === "configuration-body") {
      vi.spyOn(configuration, "text").mockRejectedValueOnce(error);
    } else {
      fetchMock.mockRejectedValueOnce(error);
    }
    const browser = { available: true, tabCount: 0 };
    fetchMock
      .mockResolvedValueOnce(new Response(serviceOrigin))
      .mockResolvedValueOnce(Response.json({ browser, status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);
    const runtime = createDashboardRuntime();
    try {
      expect(await runtime.run(checkBrowserSession())).toMatchObject({ outcome: "failed" });
      expect(await runtime.run(checkBrowserSession())).toMatchObject({
        browser,
        outcome: "observed",
      });
    } finally {
      await runtime.close();
    }
  },
);

test.each([
  () => new Response(null, { status: badGatewayStatus }),
  () => Response.json({ status: "ok" }),
])("requires a valid browser health response", async (response) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce(new Response(serviceOrigin)).mockResolvedValueOnce(response()),
  );
  expect(await readCheckResult()).toMatchObject({ outcome: "failed" });
});

test("bounds a stalled health read and aborts its request", async () => {
  let healthSignal: AbortSignal | null = null;
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response(serviceOrigin))
      .mockImplementationOnce((_url, init: RequestInit) => {
        healthSignal = init.signal as AbortSignal;
        return new Promise<Response>((_resolve, reject) => {
          healthSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      }),
  );
  expect(await readCheckResult()).toMatchObject({ outcome: "failed" });
  expect((healthSignal as AbortSignal | null)?.aborted).toBe(true);
});
