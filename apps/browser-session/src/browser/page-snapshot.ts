import type { Locator, Page } from "patchright";
import { sleep, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

const firstElementNumber = 1;
export const maximumElementNameCharacters = 300;
export const maximumElementHrefCharacters = 2048;
const maximumSnapshotElements = 300;
const snapshotTextStartIndex = 0;
const documentSettleDelayMilliseconds = 100;
const documentSettleTimeoutMilliseconds = 5000;
const interactiveElementSelector =
  "a[href], button, input:not([type='password' i]), textarea, select, [role='button'], [role='link'], [role='textbox'], [contenteditable='true']";

interface CapturedElement {
  disabled: boolean;
  href?: string;
  locator: Locator;
  name: string;
  ref: string;
  role: string;
  signature: string;
}

interface ElementMetadata {
  disabled: boolean;
  href?: string;
  name: string;
  role: string;
  signature: string;
  sourceIndex: number;
}

interface SnapshotMetadata {
  elements: ElementMetadata[];
  text: string;
  title: string;
  truncated: boolean;
  url: string;
  viewport: { height: number; scrollY: number; width: number };
}

interface PageSnapshot extends Omit<SnapshotMetadata, "elements"> {
  elements: CapturedElement[];
}

// The callback stays self-contained because Patchright serializes it into the page realm.
// eslint-disable-next-line complexity, max-lines-per-function, max-statements
export function captureSnapshotMetadata(input: {
  maximumElements: number;
  maximumHrefCharacters: number;
  maximumNameCharacters: number;
  selector: string;
  startIndex: number;
  textLimit: number;
}): SnapshotMetadata {
  const emptyDimension = 0;
  const { document } = globalThis;
  const candidates = [...document.querySelectorAll<HTMLElement>(input.selector)];
  const elements: ElementMetadata[] = [];
  let elementsTruncated = false;
  let hrefTruncated = false;
  for (const [sourceIndex, element] of candidates.entries()) {
    if (element.matches("input[type='password' i]")) {
      continue;
    }
    const style = globalThis.getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      bounds.width === emptyDimension ||
      bounds.height === emptyDimension
    ) {
      continue;
    }
    let role = element.tagName.toLowerCase();
    if (element.matches("a[href]")) {
      role = "link";
    } else if (element.matches("button")) {
      role = "button";
    } else if (element.matches("select")) {
      role = "combobox";
    } else if (element.matches("input[type='checkbox']")) {
      role = "checkbox";
    } else if (element.matches("input[type='radio']")) {
      role = "radio";
    } else if (element.matches("input, textarea, [contenteditable='true']")) {
      role = "textbox";
    }
    const rawName =
      element.getAttribute("aria-label") ??
      element.getAttribute("title") ??
      element.getAttribute("placeholder") ??
      element.getAttribute("alt") ??
      element.textContent ??
      "";
    const rawHref = element.matches("a[href]") ? (element as HTMLAnchorElement).href : "";
    if (rawHref.length > input.maximumHrefCharacters) {
      hrefTruncated = true;
      continue;
    }
    if (elements.length === input.maximumElements) {
      elementsTruncated = true;
      break;
    }
    const metadata: ElementMetadata = {
      disabled: element.matches(
        "button:disabled, input:disabled, textarea:disabled, select:disabled",
      ),
      name: rawName
        .replaceAll(/\s+/gu, " ")
        .trim()
        .slice(input.startIndex, input.maximumNameCharacters),
      role: element.getAttribute("role") ?? role,
      signature: [
        element.tagName,
        element.getAttribute("type") ?? "",
        rawHref,
        element.getAttribute("role") ?? "",
        element.getAttribute("aria-label") ?? "",
        element.getAttribute("title") ?? "",
        element.getAttribute("placeholder") ?? "",
        element.getAttribute("alt") ?? "",
        (element.textContent ?? "")
          .replaceAll(/\s+/gu, " ")
          .trim()
          .slice(input.startIndex, input.maximumNameCharacters),
      ].join("\u001F"),
      sourceIndex,
    };
    if (element.matches("a[href]")) {
      metadata.href = rawHref;
    }
    elements.push(metadata);
  }
  // InnerText intentionally reflects rendered text; textContent includes hidden page content.
  // eslint-disable-next-line unicorn/prefer-dom-node-text-content
  const rawText = document.body?.innerText ?? "";
  return {
    elements,
    text: rawText.slice(input.startIndex, input.textLimit),
    title: document.title,
    truncated: elementsTruncated || hrefTruncated || rawText.length > input.textLimit,
    url: globalThis.location.href,
    viewport: {
      height: globalThis.innerHeight,
      scrollY: globalThis.scrollY,
      width: globalThis.innerWidth,
    },
  };
}

function* capturePageSnapshotOnce(page: Page, textLimit: number): RiteCoroutine<PageSnapshot> {
  const metadata = yield* until(() =>
    page.evaluate(captureSnapshotMetadata, {
      maximumElements: maximumSnapshotElements,
      maximumHrefCharacters: maximumElementHrefCharacters,
      maximumNameCharacters: maximumElementNameCharacters,
      selector: interactiveElementSelector,
      startIndex: snapshotTextStartIndex,
      textLimit,
    }),
  );
  const candidates = page.locator(interactiveElementSelector);
  return {
    ...metadata,
    elements: metadata.elements.map((element, index) => {
      const captured = Object.assign(element, {
        locator: candidates.nth(element.sourceIndex),
        ref: `e${index + firstElementNumber}`,
      }) as ElementMetadata & CapturedElement;
      Reflect.deleteProperty(captured, "sourceIndex");
      return captured;
    }),
  };
}

export function* capturePageSnapshot(page: Page, textLimit: number): RiteCoroutine<PageSnapshot> {
  try {
    return yield* capturePageSnapshotOnce(page, textLimit);
  } catch {
    try {
      yield* until(() =>
        page.waitForLoadState("domcontentloaded", {
          timeout: documentSettleTimeoutMilliseconds,
        }),
      );
    } catch {
      // The retry below is still useful when the document never emits this lifecycle event.
    }
    yield* sleep(documentSettleDelayMilliseconds);
    return yield* capturePageSnapshotOnce(page, textLimit);
  }
}
