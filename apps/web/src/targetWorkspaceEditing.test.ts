import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { storyStateSchema, type AvailableFrameTargetStoryStateResponse } from "@bearridge/shared";
import { FrameTargetStoryStatePanel } from "./components/FrameTargetStoryStatePanel.js";
import type { Character } from "./model.js";
import { StoryStateHolder } from "./components/StoryStateHolder.js";

const document = storyStateSchema.parse({ sceneId: "s", time: { description: "Morning" }, environment: { lamp: false, floor: 2, fog: null }, characters: { mira: { present: true } }, props: { cup: { state: "full" } }, storyFacts: ["one", "two"] });
const available = { status: "AVAILABLE", id: "t", frameId: "f", revision: 3, originType: "SCENE_INITIAL", sourceFrameId: null, sourceGenerationId: null, explicitlyEditedAt: null, document } as AvailableFrameTargetStoryStateResponse;
const character = { id: "mira", name: "Mira", outfits: [] } as unknown as Character;
const text = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : text(child)).join(" ");
const button = (root: ReactTestInstance, label: string) => root.findAllByType("button").find(item => text(item).includes(label))!;
const flush = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());

it("saves a holder name selection as an ID with expectedRevision and retains it on failure", async () => {
  for (const conflict of [false, true]) {
    const m = await mount(false, conflict);
    await act(async () => button(m.renderer.root, "Редактировать").props.onClick());
    await act(async () => m.renderer.root.findByType(StoryStateHolder).props.onChange("mira"));
    expect(m.dirty).toHaveBeenLastCalledWith(true);
    await act(async () => button(m.renderer.root, "Сохранить").props.onClick()); await flush();
    expect(m.requests).toHaveLength(1);
    expect(m.requests[0]!.body).toEqual({ expectedRevision: 3, document: { ...document, props: { cup: { state: "full", holderCharacterId: "mira" } } } });
    expect(m.requests[0]!.url).toContain("/target-story-state");
    if (conflict) {
      expect(m.renderer.root.findByType(StoryStateHolder).props.value).toBe("mira");
      expect(m.dirty).toHaveBeenLastCalledWith(true);
    }
    m.renderer.unmount();
  }
});

async function mount(locked = false, conflict = false) {
  const requests: { url: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") { requests.push({ url, body: JSON.parse(String(init.body)) as unknown }); return conflict ? response({ code: "REVISION_CONFLICT", error: "conflict" }, 409) : response({ ...available, revision: 4, document: (requests.at(-1)!.body as { document: unknown }).document }); }
    return response(available);
  }));
  const dirty = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const element = (hidden = false) => React.createElement(QueryClientProvider, { client }, React.createElement("section", { hidden }, React.createElement(FrameTargetStoryStatePanel, { workspace: true, source: { status: "AVAILABLE", label: "Scene", note: "current", document }, castIds: ["mira"], frameId: "f", frameStatus: locked ? "LOCKED" : "DRAFT", characters: [character], onDirtyChange: dirty })));
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(element()); }); await flush();
  return { renderer, element, dirty, requests };
}

it("preserves a single full-size draft through mode visibility, sending only Target with expectedRevision", async () => {
  const m = await mount();
  await act(async () => button(m.renderer.root, "Редактировать").props.onClick());
  await act(async () => m.renderer.root.findAllByType("textarea")[0]!.props.onChange({ target: { value: "Dusk" } }));
  await act(async () => m.renderer.root.findByProps({ type: "checkbox" }).props.onChange({ target: { checked: false } }));
  await act(async () => m.renderer.update(m.element(true)));
  await act(async () => m.renderer.update(m.element(false)));
  expect(m.renderer.root.findAllByType("textarea")[0]!.props.value).toBe("Dusk");
  expect(m.dirty).toHaveBeenLastCalledWith(true);
  await act(async () => button(m.renderer.root, "Сохранить").props.onClick()); await flush();
  expect(m.requests).toHaveLength(1);
  expect(m.requests[0]!.body).toEqual({ expectedRevision: 3, document: { ...document, time: { description: "Dusk" }, characters: { mira: { present: false } } } });
  expect(m.requests[0]!.url).toContain("/target-story-state");
  expect(text(m.renderer.root)).toContain("В составе кадра");
  m.renderer.unmount();
});

it("retains invalid environment rows, stable input identity and scalar types, blocking stale saves", async () => {
  const m = await mount(); await act(async () => button(m.renderer.root, "Редактировать").props.onClick());
  const names = () => m.renderer.root.findAllByProps({ "aria-label": "Имя параметра окружения" });
  const input = names()[0]!;
  for (const value of ["l", "li", "light"]) await act(async () => names()[0]!.props.onChange({ target: { value } }));
  expect(names()[0]).toBe(input);
  await act(async () => names()[0]!.props.onChange({ target: { value: "floor" } }));
  expect(button(m.renderer.root, "Сохранить").props.disabled).toBe(true);
  await act(async () => button(m.renderer.root, "Сохранить").props.onClick());
  expect(m.requests).toHaveLength(0);
  await act(async () => names()[0]!.props.onChange({ target: { value: "light" } }));
  const numeric = () => m.renderer.root.findByProps({ type: "number" });
  await act(async () => numeric().props.onChange({ target: { value: "" } }));
  expect(button(m.renderer.root, "Сохранить").props.disabled).toBe(true);
  await act(async () => numeric().props.onChange({ target: { value: "3.5" } }));
  await act(async () => button(m.renderer.root, "Сохранить").props.onClick()); await flush();
  expect((m.requests[0]!.body as { document: typeof document }).document.environment).toEqual({ light: false, floor: 3.5, fog: null });
  m.renderer.unmount();
});

it("keeps draft after revision conflict and exposes explicit reload", async () => {
  const m = await mount(false, true); await act(async () => button(m.renderer.root, "Редактировать").props.onClick());
  await act(async () => m.renderer.root.findAllByType("textarea")[0]!.props.onChange({ target: { value: "Local edit" } }));
  await act(async () => button(m.renderer.root, "Сохранить").props.onClick()); await flush();
  expect(m.renderer.root.findAllByType("textarea")[0]!.props.value).toBe("Local edit");
  expect(button(m.renderer.root, "Загрузить актуальную версию")).toBeDefined();
  expect(m.dirty).toHaveBeenLastCalledWith(true);
  m.renderer.unmount();
});

it("shows LOCKED state with disabled fields and no edit action", async () => {
  const m = await mount(true);
  expect(text(m.renderer.root)).toContain("LOCKED");
  expect(m.renderer.root.findAllByType("button").some(item => text(item).includes("Редактировать"))).toBe(false);
  expect(m.renderer.root.findByProps({ className: "targetFullFields" }).props.disabled).toBe(true);
  expect(m.requests).toHaveLength(0);
  m.renderer.unmount();
});
