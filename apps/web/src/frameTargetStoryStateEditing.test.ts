import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AvailableFrameTargetStoryStateResponse, StoryStateDocument } from "@bearridge/shared";
import { FrameTargetStoryStatePanel, TargetStoryStateEditor, createTargetStoryStateEditSession, isTargetStoryStateDirty, validateTargetStoryState } from "./components/FrameTargetStoryStatePanel.js";
import type { Character, FrameStatus } from "./model.js";

const baseDocument: StoryStateDocument = {
  sceneId: "scene-1", time: { description: "Morning" },
  environment: { weather: "clear", lightsOn: true, floor: 2 },
  characters: { birdman: { present: true, outfitId: "coat", emotion: "calm", pose: "seated", hairState: "neat", locationPosition: "sofa", heldProps: ["key"], notes: ["waiting"] } },
  props: { key: { location: "hand", holderCharacterId: "birdman", state: "held" }, cup: { location: "table", state: "full" } },
  storyFacts: ["Birdman arrived"]
};
const character = { id: "birdman", name: "Birdman", outfits: [] } as unknown as Character;

function available(frameId = "frame-1", revision = 4, document = baseDocument): AvailableFrameTargetStoryStateResponse {
  return { status: "AVAILABLE", id: `target-${frameId}`, frameId, document, revision, originType: "INHERITED_FRAME_TARGET", sourceFrameId: "frame-0", sourceGenerationId: null, explicitlyEditedAt: null, createdAt: "2026-10-20T10:00:00.000Z", updatedAt: "2026-10-20T10:00:00.000Z" };
}

function response(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
function textOf(root: ReactTestInstance): string { return root.findAll(() => true).map((node) => node.children.filter((child): child is string => typeof child === "string").join("")).join(" "); }
function button(root: ReactTestInstance, label: string): ReactTestInstance { return root.findAllByType("button").find((item) => textOf(item).includes(label))!; }
async function flush(): Promise<void> { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }

async function mount(status: FrameStatus = "DRAFT", fetchImpl?: typeof fetch): Promise<{ renderer: ReactTestRenderer; client: QueryClient }> {
  globalThis.fetch = fetchImpl ?? vi.fn(async () => response(available())) as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(React.createElement(QueryClientProvider, { client }, React.createElement(FrameTargetStoryStatePanel, { frameId: "frame-1", frameStatus: status, characters: [character] }))); });
  await flush();
  return { renderer, client };
}

afterEach(() => { vi.restoreAllMocks(); });

describe("Frame Target Story State editing workflow", () => {
  it("enters EDIT from AVAILABLE with an independent clean draft and all structured fields", async () => {
    const { renderer } = await mount();
    expect(button(renderer.root, "Редактировать")).toBeDefined();
    await act(async () => button(renderer.root, "Редактировать").props.onClick());
    expect(textOf(renderer.root)).toContain("Редактирование целевого состояния");
    expect(textOf(renderer.root)).toContain("Base revision: 4");
    expect(textOf(renderer.root)).toContain("Окружение");
    expect(textOf(renderer.root)).toContain("Персонажи");
    expect(textOf(renderer.root)).toContain("Предметы");
    expect(textOf(renderer.root)).toContain("Сюжетные факты");
    expect(button(renderer.root, "Сохранить").props.disabled).toBe(true);
  });

  it.each(["LOCKED", "GENERATING"] as const)("does not offer editing for %s Frames", async (status) => {
    const { renderer } = await mount(status);
    expect(renderer.root.findAllByType("button").some((item) => textOf(item).includes("Редактировать"))).toBe(false);
  });

  it("does not offer editing for MISSING or INVALID targets", async () => {
    for (const body of [{ status: "MISSING", frameId: "frame-1", legacy: true }, { status: "INVALID", frameId: "frame-1", code: "TARGET_INVALID", message: "bad", diagnostics: [] }]) {
      const { renderer } = await mount("DRAFT", vi.fn(async () => response(body)) as typeof fetch);
      expect(renderer.root.findAllByType("button").some((item) => textOf(item).includes("Редактировать"))).toBe(false);
      renderer.unmount();
    }
  });

  it("saves edited time with expectedRevision, preserves other records, and uses the server revision/provenance", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input); calls.push({ url, ...(init ? { init } : {}) });
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as { document: StoryStateDocument; expectedRevision: number };
        return response({ ...available("frame-1", 5, body.document), explicitlyEditedAt: "2026-10-23T12:00:00.000Z" });
      }
      return response(available());
    }) as typeof fetch;
    const { renderer } = await mount("DRAFT", fetchMock);
    await act(async () => button(renderer.root, "Редактировать").props.onClick());
    const time = renderer.root.findAllByType("textarea").find((item) => item.props.value === "Morning")!;
    await act(async () => time.props.onChange({ target: { value: "Evening" } }));
    expect(button(renderer.root, "Сохранить").props.disabled).toBe(false);
    await act(async () => button(renderer.root, "Сохранить").props.onClick()); await flush();
    const put = calls.find((call) => call.init?.method === "PUT")!;
    const payload = JSON.parse(String(put.init?.body)) as { document: StoryStateDocument; expectedRevision: number };
    expect(payload.expectedRevision).toBe(4);
    expect(payload.document.time.description).toBe("Evening");
    expect(payload.document.environment).toEqual(baseDocument.environment);
    expect(payload.document.characters.birdman?.notes).toEqual(["waiting"]);
    expect(payload.document.props.cup).toEqual({ location: "table", state: "full" });
    expect(textOf(renderer.root)).toContain("Revision 5");
    expect(textOf(renderer.root)).toContain("INHERITED_FRAME_TARGET");
    expect(textOf(renderer.root)).toContain("Изменено вручную");
  });

  it("cancels a dirty edit without PUT", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => response(available()));
    const { renderer } = await mount("DRAFT", fetchMock as unknown as typeof fetch);
    await act(async () => button(renderer.root, "Редактировать").props.onClick());
    const time = renderer.root.findAllByType("textarea")[0]!;
    await act(async () => time.props.onChange({ target: { value: "Changed" } }));
    await act(async () => button(renderer.root, "Отмена").props.onClick());
    expect(textOf(renderer.root)).not.toContain("Редактирование целевого состояния");
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === "PUT")).toBe(false);
  });

  it("keeps the draft on REVISION_CONFLICT and never retries automatically", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => init?.method === "PUT" ? response({ error: "stale", code: "REVISION_CONFLICT" }, 409) : response(available()));
    const { renderer } = await mount("DRAFT", fetchMock as unknown as typeof fetch);
    await act(async () => button(renderer.root, "Редактировать").props.onClick());
    await act(async () => renderer.root.findAllByType("textarea")[0]!.props.onChange({ target: { value: "Local draft" } }));
    await act(async () => button(renderer.root, "Сохранить").props.onClick()); await flush();
    expect(textOf(renderer.root)).toContain("Состояние кадра изменилось после начала редактирования");
    expect(textOf(renderer.root)).toContain("Продолжить редактирование");
    expect(textOf(renderer.root)).toContain("Загрузить актуальную версию");
    expect(renderer.root.findAllByType("textarea")[0]!.props.value).toBe("Local draft");
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === "PUT")).toHaveLength(1);
  });

  it("loads the latest target after conflict only after explicit confirmation", async () => {
    let getCount = 0;
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PUT") return response({ error: "stale", code: "REVISION_CONFLICT" }, 409);
      getCount += 1;
      return response(getCount === 1 ? available() : available("frame-1", 8, { ...baseDocument, time: { description: "Server latest" } }));
    });
    Object.defineProperty(globalThis, "window", { configurable: true, value: { confirm: vi.fn(() => true) } });
    const { renderer } = await mount("DRAFT", fetchMock as unknown as typeof fetch);
    await act(async () => button(renderer.root, "Редактировать").props.onClick());
    await act(async () => renderer.root.findAllByType("textarea")[0]!.props.onChange({ target: { value: "Local draft" } }));
    await act(async () => button(renderer.root, "Сохранить").props.onClick()); await flush();
    await act(async () => button(renderer.root, "Загрузить актуальную версию").props.onClick()); await flush();
    expect(renderer.root.findAllByType("textarea")[0]!.props.value).toBe("Server latest");
    expect(textOf(renderer.root)).toContain("Base revision: 8");
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === "PUT")).toHaveLength(1);
    Reflect.deleteProperty(globalThis, "window");
  });

  it("blocks a repeated Save while the first PUT is pending", async () => {
    let resolvePut!: (value: Response) => void;
    const pendingPut = new Promise<Response>((resolve) => { resolvePut = resolve; });
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => init?.method === "PUT" ? pendingPut : response(available()));
    const { renderer } = await mount("DRAFT", fetchMock as unknown as typeof fetch);
    await act(async () => button(renderer.root, "Редактировать").props.onClick());
    await act(async () => renderer.root.findAllByType("textarea")[0]!.props.onChange({ target: { value: "Changed" } }));
    const saveButton = button(renderer.root, "Сохранить");
    await act(async () => { saveButton.props.onClick(); saveButton.props.onClick(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === "PUT")).toHaveLength(1);
    resolvePut(response(available("frame-1", 5, { ...baseDocument, time: { description: "Changed" } })));
    await flush();
  });

  it("keeps a local draft after network error", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => { if (init?.method === "PUT") throw new Error("network path C:\\secret"); return response(available()); }) as typeof fetch;
    const { renderer } = await mount("DRAFT", fetchMock);
    await act(async () => button(renderer.root, "Редактировать").props.onClick());
    await act(async () => renderer.root.findAllByType("textarea")[0]!.props.onChange({ target: { value: "Local draft" } }));
    await act(async () => button(renderer.root, "Сохранить").props.onClick()); await flush();
    expect(renderer.root.findAllByType("textarea")[0]!.props.value).toBe("Local draft");
    expect(textOf(renderer.root)).toContain("Локальный черновик сохранён");
    expect(textOf(renderer.root)).not.toContain("secret");
  });

  it("resets a dirty draft without PUT when the selected Frame changes", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => response(String(input).includes("frame-2") ? available("frame-2", 1, { ...baseDocument, time: { description: "Frame two" } }) : available()));
    const { renderer, client } = await mount("DRAFT", fetchMock as unknown as typeof fetch);
    await act(async () => button(renderer.root, "Редактировать").props.onClick());
    await act(async () => renderer.root.findAllByType("textarea")[0]!.props.onChange({ target: { value: "Unsaved" } }));
    await act(async () => renderer.update(React.createElement(QueryClientProvider, { client }, React.createElement(FrameTargetStoryStatePanel, { frameId: "frame-2", frameStatus: "DRAFT", characters: [character] })))); await flush();
    expect(textOf(renderer.root)).toContain("Несохранённый черновик предыдущего кадра был сброшен");
    expect(textOf(renderer.root)).toContain("Frame two");
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === "PUT")).toBe(false);
  });

  it("does not replace the local draft on background cache refresh", async () => {
    const { renderer, client } = await mount();
    await act(async () => button(renderer.root, "Редактировать").props.onClick());
    await act(async () => renderer.root.findAllByType("textarea")[0]!.props.onChange({ target: { value: "Local edit" } }));
    act(() => { client.setQueryData(["frame-target-story-state", "frame-1"], available("frame-1", 9, { ...baseDocument, time: { description: "Background value" } })); });
    expect(renderer.root.findAllByType("textarea")[0]!.props.value).toBe("Local edit");
    expect(textOf(renderer.root)).toContain("Base revision: 4");
  });

  it("does not apply a completed Frame A PUT to the Frame B draft", async () => {
    let resolvePut!: (value: Response) => void;
    const pendingPut = new Promise<Response>((resolve) => { resolvePut = resolve; });
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => init?.method === "PUT" ? pendingPut : response(String(input).includes("frame-2") ? available("frame-2", 2, { ...baseDocument, time: { description: "Frame B" } }) : available()));
    const { renderer, client } = await mount("DRAFT", fetchMock as unknown as typeof fetch);
    await act(async () => button(renderer.root, "Редактировать").props.onClick());
    await act(async () => renderer.root.findAllByType("textarea")[0]!.props.onChange({ target: { value: "Frame A edit" } }));
    act(() => button(renderer.root, "Сохранить").props.onClick());
    await act(async () => renderer.update(React.createElement(QueryClientProvider, { client }, React.createElement(FrameTargetStoryStatePanel, { frameId: "frame-2", frameStatus: "DRAFT", characters: [character] })))); await flush();
    resolvePut(response(available("frame-1", 5, { ...baseDocument, time: { description: "Saved A" } })));
    await flush();
    expect(textOf(renderer.root)).toContain("Frame B");
    expect(textOf(renderer.root)).not.toContain("Saved A");
  });

  it("validates through the shared schema and deep copies all structured maps", () => {
    const target = available(); const session = createTargetStoryStateEditSession(target);
    session.draft.environment.weather = "rain";
    session.draft.characters.birdman!.pose = "standing";
    session.draft.props.key!.state = "dropped";
    session.draft.storyFacts.push("A fact");
    expect(target.document.environment.weather).toBe("clear");
    expect(target.document.characters.birdman?.pose).toBe("seated");
    expect(isTargetStoryStateDirty(session)).toBe(true);
    expect(validateTargetStoryState(session.draft)).toEqual([]);
    expect(validateTargetStoryState({ ...session.draft, storyFacts: [2] } as unknown as StoryStateDocument)[0]).toContain("storyFacts.0");
  });

  it("wires environment, character, prop and story-fact controls to structured document updates", () => {
    const session = createTargetStoryStateEditSession(available());
    const onChange = vi.fn();
    const renderer = create(React.createElement(TargetStoryStateEditor, { session, characters: [character], frameStatus: "DRAFT", saving: false, validationErrors: [], saveError: null, conflict: false, onChange, onSave: vi.fn(), onCancel: vi.fn(), onContinue: vi.fn(), onLoadLatest: vi.fn() }));
    const inputWithValue = (value: string) => renderer.root.findAllByType("input").find((item) => item.props.value === value)!;
    act(() => { inputWithValue("clear").props.onChange({ target: { value: "rain" } }); });
    expect(onChange.mock.lastCall?.[0].environment.weather).toBe("rain");
    act(() => { inputWithValue("calm").props.onChange({ target: { value: "alert" } }); });
    expect(onChange.mock.lastCall?.[0].characters.birdman.emotion).toBe("alert");
    act(() => { inputWithValue("hand").props.onChange({ target: { value: "floor" } }); });
    expect(onChange.mock.lastCall?.[0].props.key.location).toBe("floor");
    const fact = renderer.root.findAllByType("input").find((item) => item.props["aria-label"] === "Сюжетные факты 1")!;
    act(() => { fact.props.onChange({ target: { value: "Updated fact" } }); });
    expect(onChange.mock.lastCall?.[0].storyFacts).toEqual(["Updated fact"]);
  });

  it("renders status changes during editing and keeps keyboard-native controls", () => {
    const session = createTargetStoryStateEditSession(available()); session.draft.time.description = "Changed";
    const renderer = create(React.createElement(TargetStoryStateEditor, { session, characters: [character], frameStatus: "GENERATING", saving: false, validationErrors: [], saveError: null, conflict: false, onChange: vi.fn(), onSave: vi.fn(), onCancel: vi.fn(), onContinue: vi.fn(), onLoadLatest: vi.fn() }));
    expect(textOf(renderer.root)).toContain("Редактирование и сохранение временно недоступны");
    expect(renderer.root.findAllByType("fieldset").find((item) => item.props.className === "targetStateForm")?.props.disabled).toBe(true);
    expect(button(renderer.root, "Сохранить").props.disabled).toBe(true);
    expect(renderer.root.findAllByType("button").every((item) => item.props.type === "button")).toBe(true);
  });
});
