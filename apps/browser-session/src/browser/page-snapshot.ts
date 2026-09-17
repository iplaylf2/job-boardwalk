import { OperationError } from "@job-boardwalk/contracts";
import { randomUUID } from "node:crypto";
import type { Locator, Page } from "patchright";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

import { findRecruitingPlatformAdapter } from "./recruiting-platform-adapters.js";
import type { PageInteractionDefinition } from "./platforms/types.js";

import { inspectPageDocument } from "./page-inspection.js";
import type { DocumentReadyState, PageInspection } from "./page-inspection.js";
import { isPatchrightTimeout } from "./patchright-timeout.js";

const firstElementNumber = 1;
const maximumElementNameCharacters = 300;
const maximumElementHrefCharacters = 2048;
const maximumSnapshotElements = 300;
const snapshotTextStartIndex = 0;
const snapshotEvaluationTimeoutMilliseconds = 5000;
const interactiveElementSelector =
  "a[href], button, input:not([type='password' i]), textarea, select, [role='button'], [role='link'], [role='textbox'], [contenteditable='true']";

interface CapturedElement extends Omit<ElementMetadata, "sourceIndex"> {
  locator: Locator;
  ref: string;
}

interface ElementMetadata {
  context?: string;
  disabled: boolean;
  href?: string;
  name: string;
  role: string;
  signature: string;
  sourceIndex: number;
}

interface SnapshotMetadata {
  documentReadyState: DocumentReadyState;
  elements: ElementMetadata[];
  text: string;
  title: string;
  truncated: boolean;
  url: string;
  viewport: { height: number; scrollY: number; width: number };
}

interface SnapshotCaptureInput {
  textReplacements?: Readonly<Record<string, string>>;
  interactions?: readonly PageInteractionDefinition[];
  referenceScope: string;
  maximumElements: number;
  maximumHrefCharacters: number;
  maximumNameCharacters: number;
  selector: string;
  startIndex: number;
  textLimit: number;
}

interface PageSnapshot extends Omit<SnapshotMetadata, "elements"> {
  elements: CapturedElement[];
}

function createSnapshotTimeoutError(inspection: PageInspection): Error {
  return new OperationError(
    inspection.outcome === "page-closed" ? "tab-unavailable" : "page-read-timed-out",
    "页面快照不可用。",
    { pageInspection: inspection },
  );
}

// The callback stays self-contained because Patchright serializes it into the page realm.
// eslint-disable-next-line max-lines-per-function -- Serialization requires local helpers; their complexity and size remain checked.
export function captureSnapshotMetadata(
  body: HTMLElement,
  input: SnapshotCaptureInput,
): SnapshotMetadata {
  const helpers = {
    canCaptureElement(element: HTMLElement): boolean {
      if (element.matches("input[type='password' i]")) {
        return false;
      }
      const style = view!.getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse" ||
        bounds.width === emptyDimension ||
        bounds.height === emptyDimension
      ) {
        return false;
      }
      return true;
    },
    captureElements(): {
      elements: ElementMetadata[];
      elementsTruncated: boolean;
      hrefTruncated: boolean;
    } {
      const candidates = [...document.querySelectorAll<HTMLElement>(input.selector)];
      const elements: ElementMetadata[] = [];
      let elementsTruncated = false;
      let hrefTruncated = false;
      for (const [sourceIndex, element] of candidates.entries()) {
        if (!helpers.canCaptureElement(element)) {
          continue;
        }
        const rawHref = element.matches("a[href]") ? (element as HTMLAnchorElement).href : "";
        if (rawHref.length > input.maximumHrefCharacters) {
          hrefTruncated = true;
          continue;
        }
        if (elements.length === input.maximumElements) {
          elementsTruncated = true;
          break;
        }
        elements.push(helpers.metadata(element, sourceIndex, rawHref));
      }
      return { elements, elementsTruncated, hrefTruncated };
    },
    decode(value: string): string {
      let decodedValue = value;
      for (const [encoded, decoded] of Object.entries(input.textReplacements ?? {})) {
        decodedValue = decodedValue.replaceAll(encoded, decoded);
      }
      return decodedValue;
    },
    ensureNodeIdentities(): WeakMap<Element, string> {
      // Keep node identity in the document realm, without adding attributes to the platform DOM.
      const identityKey = Symbol.for("job-boardwalk.snapshot-node-identities");
      const registry = document as Document & { [identityKey]?: WeakMap<Element, string> };
      const identities = registry[identityKey] ?? new WeakMap<Element, string>();
      registry[identityKey] = identities;
      return identities;
    },
    implicitRole(element: HTMLElement): string {
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
      return role;
    },
    metadata(element: HTMLElement, sourceIndex: number, rawHref: string): ElementMetadata {
      const interaction = input.interactions?.find(({ selector }) => element.matches(selector));
      const renderedText = element.innerText ?? "";
      const context = interaction
        ? (element.closest<HTMLElement>(interaction.contextSelector)?.innerText ?? "")
            .replaceAll(/\s+/gu, " ")
            .trim()
            .slice(input.startIndex, maximumContextCharacters)
        : null;
      const rawName =
        element.getAttribute("aria-label") ??
        element.getAttribute("title") ??
        element.getAttribute("placeholder") ??
        element.getAttribute("alt") ??
        renderedText;
      let identity = identities.get(element);
      if (!identity) {
        identity = `${input.referenceScope}:${sourceIndex}`;
        identities.set(element, identity);
      }
      const metadata: ElementMetadata = {
        ...(context ? { context: helpers.decode(context) } : {}),
        disabled: element.matches(
          "button:disabled, input:disabled, textarea:disabled, select:disabled",
        ),
        name: helpers
          .decode(rawName)
          .replaceAll(/\s+/gu, " ")
          .trim()
          .slice(input.startIndex, input.maximumNameCharacters),
        role: element.getAttribute("role") ?? interaction?.role ?? helpers.implicitRole(element),
        signature: helpers.signature(element, { context, identity, rawHref, renderedText }),
        sourceIndex,
      };
      if (element.matches("a[href]")) {
        metadata.href = rawHref;
      }
      return metadata;
    },
    signature(
      element: HTMLElement,
      values: { identity: string; context: string | null; rawHref: string; renderedText: string },
    ): string {
      const { identity, context, rawHref, renderedText } = values;
      return [
        identity,
        document.location.href,
        context ?? "",
        element.tagName,
        element.getAttribute("type") ?? "",
        rawHref,
        element.getAttribute("role") ?? "",
        element.getAttribute("aria-label") ?? "",
        element.getAttribute("title") ?? "",
        element.getAttribute("placeholder") ?? "",
        element.getAttribute("alt") ?? "",
        renderedText
          .replaceAll(/\s+/gu, " ")
          .trim()
          .slice(input.startIndex, input.maximumNameCharacters),
      ].join("\u001F");
    },
  };
  const emptyDimension = 0;
  const maximumContextCharacters = 1500;
  const document = body.ownerDocument;
  const view = document.defaultView;
  if (!view) {
    throw new Error("页面快照不可用：当前文档没有活动浏览上下文。");
  }
  const identities = helpers.ensureNodeIdentities();
  const { elements, elementsTruncated, hrefTruncated } = helpers.captureElements();
  // InnerText intentionally reflects rendered text; textContent includes hidden page content.
  const rawText = helpers.decode(body.innerText);
  return {
    documentReadyState: document.readyState,
    elements,
    text: rawText.slice(input.startIndex, input.textLimit),
    title: helpers.decode(document.title),
    truncated: elementsTruncated || hrefTruncated || rawText.length > input.textLimit,
    url: document.location.href,
    viewport: {
      height: view.innerHeight,
      scrollY: view.scrollY,
      width: view.innerWidth,
    },
  };
}

export function* capturePageSnapshot(page: Page, textLimit: number): RiteCoroutine<PageSnapshot> {
  try {
    const adapter = findRecruitingPlatformAdapter(page.url());
    const interactions = adapter?.isJobCardCollectionPage(page.url())
      ? (adapter.collectionPageInteractions ?? [])
      : [];
    const selector = [
      interactiveElementSelector,
      ...interactions.map((item) => item.selector),
    ].join(", ");
    const body = page.locator("body");
    const metadata = yield* until(() =>
      body.evaluate(
        captureSnapshotMetadata,
        {
          interactions,
          ...(adapter?.textReplacements ? { textReplacements: adapter.textReplacements } : {}),
          maximumElements: maximumSnapshotElements,
          maximumHrefCharacters: maximumElementHrefCharacters,
          maximumNameCharacters: maximumElementNameCharacters,
          referenceScope: randomUUID(),
          selector,
          startIndex: snapshotTextStartIndex,
          textLimit,
        },
        { timeout: snapshotEvaluationTimeoutMilliseconds },
      ),
    );
    const candidates = page.locator(selector);
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
  } catch (error) {
    if (!isPatchrightTimeout(error)) {
      throw error;
    }
    throw createSnapshotTimeoutError(yield* inspectPageDocument(page));
  }
}
