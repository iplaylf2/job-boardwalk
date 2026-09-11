import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";
import { captureElementScrollContext, scrollOneViewport } from "#/browser/page-scroll.js";

const noScroll = 0;
const compactViewportHeight = 320;
const expandedViewportHeight = 720;
const viewportHeight = 800;
const listHeight = 400;
const listScrollHeight = 2400;
const scrollDistance = 1600;
const targetTop = 1800;
const targetBottom = 1900;

function scrollablePage() {
  const root = { parentElement: null, tagName: "HTML" };
  const list = {
    clientHeight: listHeight,
    parentElement: root,
    scrollHeight: listScrollHeight,
    scrollTop: 0,
    tagName: "DIV",
  };
  const wrapper = {
    clientHeight: listHeight,
    parentElement: list,
    scrollHeight: listHeight,
    tagName: "DIV",
  };
  const document = {
    defaultView: {
      getComputedStyle: () => ({ overflowY: "auto" }),
      innerHeight: viewportHeight,
      scrollY: 0,
    },
    location: { href: "https://www.yupao.com/zhaogong/" },
    scrollingElement: root,
  };
  const element = {
    getBoundingClientRect: () => ({
      bottom: targetBottom - list.scrollTop,
      top: targetTop - list.scrollTop,
    }),
    ownerDocument: document,
    parentElement: wrapper,
  } as unknown as HTMLElement;
  return { element, list };
}

test("observes nested list movement even when the document stays at scrollY zero", () => {
  const { element, list } = scrollablePage();
  const before = captureElementScrollContext(element);
  list.scrollTop = scrollDistance;
  const after = captureElementScrollContext(element);
  expect(before.viewport).toEqual(after.viewport);
  expect(before.scrollableAncestors).toEqual([
    {
      ancestorDepth: 1,
      clientHeight: listHeight,
      scrollHeight: listScrollHeight,
      scrollTop: 0,
      tagName: "div",
    },
  ]);
  expect(after.scrollableAncestors).toEqual([
    {
      ancestorDepth: 1,
      clientHeight: listHeight,
      scrollHeight: listScrollHeight,
      scrollTop: scrollDistance,
      tagName: "div",
    },
  ]);
  expect(after.target.top).toBe(targetTop - scrollDistance);
  expect(after.url).toBe(before.url);
});

test("does not invent progress for an unchanged list and serializes without host helpers", () => {
  const { element } = scrollablePage();
  const before = captureElementScrollContext(element);
  const after = runInNewContext(`(${captureElementScrollContext.toString()})(element)`, {
    element,
  });
  expect(after).toEqual(before);
});

function viewportPage(height: number, scrollHeight: number, top = noScroll) {
  const region = {
    clientHeight: height,
    getBoundingClientRect: () => ({ bottom: top + height, top }),
    parentElement: null as unknown,
    scrollBy: ({ top: distance }: { top: number }) => {
      region.scrollTop = Math.max(
        noScroll,
        Math.min(scrollHeight - height, region.scrollTop + distance),
      );
    },
    scrollHeight,
    scrollTop: 0,
    tagName: "DIV",
  };
  return region;
}

function readingPage(containerHeight: number, windowHeight: number, listTop = noScroll) {
  const root = viewportPage(windowHeight, listScrollHeight);
  const list = viewportPage(containerHeight, listScrollHeight, listTop);
  list.parentElement = root;
  const document = {
    defaultView: { getComputedStyle: () => ({ overflowY: "auto" }), innerHeight: windowHeight },
    location: { href: "https://www.yupao.com/zhaogong/" },
    scrollingElement: root,
  };
  const element = { ownerDocument: document, parentElement: list } as unknown as HTMLElement;
  return { element, list, root };
}

test.each([compactViewportHeight, expandedViewportHeight])(
  "scrolls one measured container viewport (%s) and reverses direction",
  (height) => {
    const { element, list, root } = readingPage(height, viewportHeight);
    const downward = scrollOneViewport(element, {
      direction: "down",
      target: "scrollable-ancestor",
    });
    expect(downward).toMatchObject({
      after: { scrollTop: height },
      before: { scrollTop: 0 },
      outcome: "moved",
      target: "container",
      viewportHeight: height,
    });
    expect(root.scrollTop).toBe(noScroll);
    const upward = scrollOneViewport(element, {
      direction: "up",
      target: "scrollable-ancestor",
    });
    expect(upward).toMatchObject({ after: { scrollTop: 0 }, outcome: "moved" });
    expect(list.scrollTop).toBe(noScroll);
  },
);

test("keeps a container boundary local instead of scrolling the document", () => {
  const { element, list, root } = readingPage(listHeight, viewportHeight);
  list.scrollTop = list.scrollHeight - list.clientHeight;
  const result = scrollOneViewport(element, { direction: "down", target: "scrollable-ancestor" });
  expect(result.outcome).toBe("unchanged");
  expect(result.target).toBe("container");
  expect(root.scrollTop).toBe(noScroll);
});

test("uses the visible part of a container and rejects a fully hidden region", () => {
  const top = 600;
  const { element } = readingPage(listHeight, viewportHeight, top);
  expect(
    scrollOneViewport(element, { direction: "down", target: "scrollable-ancestor" }).viewportHeight,
  ).toBe(viewportHeight - top);
  const hidden = readingPage(listHeight, viewportHeight, viewportHeight);
  expect(() =>
    scrollOneViewport(hidden.element, { direction: "down", target: "scrollable-ancestor" }),
  ).toThrow();
});

test("scrolls the document explicitly and runs without host-side callback dependencies", () => {
  const { element, list, root } = readingPage(listHeight, viewportHeight);
  const result = runInNewContext(`(${scrollOneViewport.toString()})(element, input)`, {
    element,
    input: { direction: "down", target: "document" },
  });
  expect(result).toMatchObject({ outcome: "moved", target: "document", viewportHeight });
  expect(root.scrollTop).toBe(viewportHeight);
  expect(list.scrollTop).toBe(noScroll);
});
