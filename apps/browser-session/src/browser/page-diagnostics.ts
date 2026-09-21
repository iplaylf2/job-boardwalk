import type { Page } from "patchright";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

const inspectionTimeoutMilliseconds = 5000;

function capturePageEnvironment(html: HTMLElement) {
  const document = html.ownerDocument;
  const view = document.defaultView!;
  const { navigator } = view;
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl");
  const rendererInfo = gl?.getExtension("WEBGL_debug_renderer_info");
  return {
    devicePixelRatio: view.devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency,
    language: navigator.language,
    languages: [...navigator.languages],
    platform: navigator.platform,
    screen: {
      colorDepth: view.screen.colorDepth,
      height: view.screen.height,
      width: view.screen.width,
    },
    scriptUrls: [...document.scripts]
      .filter((script) => script.src)
      .map((script) => {
        const url = new URL(script.src);
        return `${url.origin}${url.pathname}`;
      }),
    timezone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
    userAgent: navigator.userAgent,
    viewport: { height: view.innerHeight, width: view.innerWidth },
    webdriver: navigator.webdriver,
    webgl: gl
      ? {
          renderer: rendererInfo
            ? String(gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL))
            : null,
          vendor: rendererInfo ? String(gl.getParameter(rendererInfo.UNMASKED_VENDOR_WEBGL)) : null,
          version: String(gl.getParameter(gl.VERSION)),
        }
      : null,
  };
}

export interface PageDiagnostics {
  readonly environment: ReturnType<typeof capturePageEnvironment>;
  readonly screenshot?: {
    readonly data: string;
    readonly mimeType: "image/png";
  };
}

export function* capturePageDiagnostics(
  page: Page,
  includeScreenshot: boolean,
): RiteCoroutine<PageDiagnostics> {
  const environment = yield* until(() =>
    page
      .locator("html")
      .evaluate(capturePageEnvironment, null, { timeout: inspectionTimeoutMilliseconds }),
  );
  const screenshotBuffer = includeScreenshot
    ? yield* until(() =>
        page.screenshot({
          fullPage: false,
          mask: [page.locator("input, textarea, [contenteditable]")],
          timeout: inspectionTimeoutMilliseconds,
          type: "png",
        }),
      )
    : null;
  return {
    environment,
    ...(screenshotBuffer
      ? { screenshot: { data: screenshotBuffer.toString("base64"), mimeType: "image/png" } }
      : {}),
  };
}
