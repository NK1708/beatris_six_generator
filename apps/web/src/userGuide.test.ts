import React from "react";
import fs from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { parseGuide } from "./guideMarkdown.js";
import { UserGuide } from "./screens/UserGuide.js";

afterEach(() => vi.unstubAllGlobals());

it("uses the real single source with fifteen sections and existing screenshot files", () => {
  const file = new URL("../../../docs/USER_GUIDE_RU.md", import.meta.url);
  const blocks = parseGuide(fs.readFileSync(file, "utf8"));
  const headings = blocks.filter(block => block.kind === "heading" && block.level === 2);
  expect(headings).toHaveLength(15); expect(new Set(headings.map(block => block.id)).size).toBe(15);
  const images = blocks.filter(block => block.kind === "image"); expect(images.length).toBeGreaterThan(0);
  for (const block of images) expect(fs.existsSync(new URL(block.src!, file))).toBe(true);
  const markup = renderToStaticMarkup(React.createElement(UserGuide, { onBack() {} }));
  expect(markup).toContain("Оглавление руководства"); expect(markup).toContain("Руководство пользователя");
  expect(markup).toContain("Импорт результата ChatGPT"); expect(markup).toContain("К работе");
  expect(markup).toContain("<img"); expect(markup).not.toContain("dangerouslySetInnerHTML");
});

it("navigates the table of contents, supports return and scrolls to the start", async () => {
  const focus = vi.fn(), scrollIntoView = vi.fn(), scrollTo = vi.fn(), back = vi.fn();
  const getElementById = vi.fn(() => ({ focus, scrollIntoView })); vi.stubGlobal("document", { getElementById });
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(UserGuide, { onBack: back }), { createNodeMock: node => node.type === "main" ? { querySelector: () => ({ focus }), scrollTo } : null }); });
  const anchor = renderer.root.findAllByType("a")[0]!;
  const preventDefault = vi.fn(); await act(async () => anchor.props.onClick({ preventDefault }));
  expect(preventDefault).toHaveBeenCalled(); expect(getElementById).toHaveBeenCalledWith(anchor.props.href.slice(1));
  expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  const buttons = renderer.root.findAllByType("button");
  await act(async () => buttons[0]!.props.onClick()); expect(back).toHaveBeenCalledOnce();
  await act(async () => buttons.at(-1)!.props.onClick()); expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  renderer.unmount();
});

it("parses only the documented subset and gives repeated headings distinct targets", () => {
  const blocks = parseGuide("## Один\n\n<script>alert(1)</script>\n\n## Один\n\n1. Шаг\n2. Следующий\n\n> Совет\n\n![Изображение](user-guide/images/frame.png)");
  expect(blocks.filter(block => block.kind === "heading").map(block => block.id)).toEqual(["один", "один-2"]);
  expect(blocks.find(block => block.kind === "paragraph")?.text).toBe("<script>alert(1)</script>");
  expect(blocks.find(block => block.kind === "ordered")?.items).toEqual(["Шаг", "Следующий"]);
});
