import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { GenerationCompare } from "./components/GenerationCompare.js";
import { InspectionImage } from "./components/InspectionImage.js";
import type { Frame, Generation, Project } from "./model.js";

const result = (id: string): Generation => ({ id, provider: "mock", model: "fixture", generationType: "INITIAL", createdAt: "2026-01-01T00:00:00Z", status: "SUCCESS", outputFilePath: id + ".png" });
const project = { id: "p" } as Project;
const text = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : text(child)).join(" ");
const button = (root: ReactTestInstance, label: string) => root.findAllByType("button").find(item => text(item).includes(label))!;
function mount(results = [result("a"), result("b")], dirty = false, locked = false) {
  const frame = { id: "f", generations: results, selectedGenerationId: "a", status: locked ? "LOCKED" : "REVIEW" } as Frame;
  const props = { project, frame, dirty, pending: false, onSelect: vi.fn(), onReview: vi.fn(), onView: vi.fn() };
  let renderer!: ReactTestRenderer; act(() => { renderer = create(React.createElement(GenerationCompare, props)); });
  return { renderer, props };
}
describe("Compare local viewing", () => {
  it("renders two equal panels and changes candidates without selection or lifecycle actions", () => {
    const m = mount(); const before = JSON.stringify(m.props.frame);
    expect(m.renderer.root.findAllByType(InspectionImage).map(item => item.props.generation.id)).toEqual(["a", "b"]);
    act(() => m.renderer.root.findByProps({ "aria-label": "Результат A" }).props.onChange({ target: { value: "b" } }));
    expect(m.renderer.root.findAllByType(InspectionImage)[0]!.props.generation.id).toBe("b");
    expect(m.props.onSelect).not.toHaveBeenCalled(); expect(JSON.stringify(m.props.frame)).toBe(before);
    act(() => button(m.renderer.root, "Перейти к проверке").props.onClick()); expect(m.props.onReview).toHaveBeenCalledOnce();
    act(() => m.renderer.unmount());
  });
  it.each([0, 1])("explains insufficient results (%s) without creating or selecting anything", count => {
    const m = mount([result("a")].slice(0, count));
    expect(text(m.renderer.root)).toContain(count ? "Доступен один результат" : "Результатов пока нет");
    expect(m.renderer.root.findAllByType(InspectionImage)).toHaveLength(count);
    expect(m.props.onSelect).not.toHaveBeenCalled(); act(() => m.renderer.unmount());
  });
  it("supports synced zoom, independent zoom, 100% and reset without cropping by default", () => {
    const m = mount(); const images = () => m.renderer.root.findAllByType(InspectionImage);
    expect(images().map(item => item.props.zoom)).toEqual(["fit", "fit"]);
    act(() => m.renderer.root.findByProps({ "aria-label": "Увеличить A" }).props.onClick());
    expect(images().map(item => item.props.zoom)).toEqual([125, 125]);
    act(() => m.renderer.root.findByType("input").props.onChange({ target: { checked: false } }));
    act(() => m.renderer.root.findByProps({ "aria-label": "Уменьшить B" }).props.onClick());
    expect(images().map(item => item.props.zoom)).toEqual([125, 100]);
    act(() => button(m.renderer.root, "100%").props.onClick()); expect(images().map(item => item.props.zoom)).toEqual([100, 100]);
    act(() => button(m.renderer.root, "Сбросить масштаб").props.onClick()); expect(images().map(item => item.props.zoom)).toEqual(["fit", "fit"]);
    act(() => m.renderer.unmount());
  });
  it("isolates a missing image to its exact panel", () => {
    const m = mount(); act(() => m.renderer.root.findAllByType("img")[0]!.props.onError());
    expect(m.renderer.root.findAllByType("img")).toHaveLength(1);
    expect(m.renderer.root.findByType("img").props.src).toContain("b.png");
    expect(text(m.renderer.root)).toContain("Другое изображение не подставлено");
    expect(m.props.onSelect).not.toHaveBeenCalled(); act(() => m.renderer.unmount());
  });
  it("offers a separate explicit selection and disables it for dirty or LOCKED frames", () => {
    const m = mount(); const panels = m.renderer.root.findAllByProps({ className: "comparePanel" });
    expect(button(panels[0]!, "Выбрать этот результат").props.disabled).toBe(true);
    act(() => button(panels[1]!, "Выбрать этот результат").props.onClick()); expect(m.props.onSelect).toHaveBeenCalledWith("b");
    act(() => m.renderer.unmount());
    for (const [dirty, locked] of [[true, false], [false, true]]) { const blocked = mount(undefined, dirty, locked); expect(blocked.renderer.root.findAllByType("button").filter(item => text(item) === "Выбрать этот результат").every(item => item.props.disabled)).toBe(true); act(() => blocked.renderer.unmount()); }
  });
});
