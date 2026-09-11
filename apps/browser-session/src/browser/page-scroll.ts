interface ScrollableAncestor {
  ancestorDepth: number;
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
  tagName: string;
}

interface ElementScrollContext {
  scrollableAncestors: ScrollableAncestor[];
  target: { bottom: number; top: number };
  url: string;
  viewport: { height: number; scrollY: number };
}

// Self-contained: the driver serializes this callback into the page realm.
export function captureElementScrollContext(element: HTMLElement): ElementScrollContext {
  const document = element.ownerDocument;
  const view = document.defaultView;
  if (!view) {
    throw new Error("滚动证据不可用：当前文档没有活动浏览上下文。");
  }
  const scrollableAncestors: ScrollableAncestor[] = [];
  let ancestor = element.parentElement;
  let ancestorDepth = 0;
  const depthIncrement = 1;
  while (ancestor) {
    const style = view.getComputedStyle(ancestor);
    if (
      ancestor !== document.scrollingElement &&
      /^(?:auto|scroll|hidden|overlay)$/u.test(style.overflowY) &&
      ancestor.scrollHeight > ancestor.clientHeight
    ) {
      scrollableAncestors.push({
        ancestorDepth,
        clientHeight: ancestor.clientHeight,
        scrollHeight: ancestor.scrollHeight,
        scrollTop: ancestor.scrollTop,
        tagName: ancestor.tagName.toLowerCase(),
      });
    }
    ancestor = ancestor.parentElement;
    ancestorDepth += depthIncrement;
  }
  const bounds = element.getBoundingClientRect();
  return {
    scrollableAncestors,
    target: { bottom: bounds.bottom, top: bounds.top },
    url: document.location.href,
    viewport: { height: view.innerHeight, scrollY: view.scrollY },
  };
}

interface ScrollInput {
  direction: "down" | "up";
  target: "document" | "scrollable-ancestor";
}

interface ScrollResult {
  after: { scrollTop: number };
  before: { scrollTop: number };
  direction: "down" | "up";
  outcome: "moved" | "unchanged";
  target: "document" | "container";
  url: string;
  viewportHeight: number;
}

// Self-contained: select the scroll owner, measure its viewport, and perform one action.
// eslint-disable-next-line max-statements, max-lines-per-function -- The serialized callback keeps target selection, geometry and the single action in one page-realm operation.
export function scrollOneViewport(element: HTMLElement, input: ScrollInput): ScrollResult {
  const document = element.ownerDocument;
  const view = document.defaultView;
  if (!view || !document.scrollingElement) {
    throw new Error("当前文档没有可用的滚动区域。");
  }
  const zero = 0;
  const downwardSign = 1;
  const upwardSign = -1;
  let target = document.scrollingElement;
  if (input.target === "scrollable-ancestor") {
    let ancestor = element.parentElement;
    while (ancestor && ancestor !== document.scrollingElement) {
      const style = view.getComputedStyle(ancestor);
      if (
        /^(?:auto|scroll|overlay)$/u.test(style.overflowY) &&
        ancestor.scrollHeight > ancestor.clientHeight
      ) {
        target = ancestor;
        break;
      }
      ancestor = ancestor.parentElement;
    }
  }
  const bounds = target.getBoundingClientRect();
  const viewportHeight =
    target === document.scrollingElement
      ? view.innerHeight
      : Math.min(
          target.clientHeight,
          Math.max(zero, Math.min(bounds.bottom, view.innerHeight) - Math.max(bounds.top, zero)),
        );
  if (viewportHeight <= zero) {
    throw new Error("目标滚动区域当前不可见；请先用 browser_reveal 显示该元素。");
  }
  const before = target.scrollTop;
  target.scrollBy({
    behavior: "instant",
    top: viewportHeight * (input.direction === "down" ? downwardSign : upwardSign),
  });
  const after = target.scrollTop;
  return {
    after: { scrollTop: after },
    before: { scrollTop: before },
    direction: input.direction,
    outcome: after === before ? "unchanged" : "moved",
    target: target === document.scrollingElement ? "document" : "container",
    url: document.location.href,
    viewportHeight,
  };
}
