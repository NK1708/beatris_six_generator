import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AvailableFrameTargetStoryStateResponse, FrameTargetRecoveryCandidate, FrameTargetRecoveryCandidatesResponse, StoryStateDocument } from "@bearridge/shared";
import { FrameTargetStoryStatePanel } from "./components/FrameTargetStoryStatePanel.js";
import { frameLockReadinessQueryKey } from "./components/FrameLockReadiness.js";
import { frameTargetRecoveryCandidatesQueryKey, recoveryErrorMessage } from "./components/FrameTargetRecoveryPanel.js";
import type { Character, FrameStatus } from "./model.js";

const document: StoryStateDocument = {
  sceneId: "scene-1",
  time: { description: "Late evening" },
  environment: { lights: "dim", nested: "long value ".repeat(20) },
  characters: { birdman: { present: true, pose: "standing" } },
  props: { key: { holderCharacterId: "birdman", state: "held" } },
  storyFacts: ["The meeting has started"]
};
const character = { id: "birdman", name: "Birdman", outfits: [] } as unknown as Character;

function candidate(patch: Partial<FrameTargetRecoveryCandidate> = {}): FrameTargetRecoveryCandidate {
  return {
    generationId: "generation-1", frameId: "frame-1", provider: "chatgpt-manual", model: "gpt-image",
    generationType: "PRODUCTION", createdAt: "2026-10-20T10:00:00.000Z", generationStatus: "SUCCESS",
    isSelected: true, isRecommended: true, isEligible: true, snapshotAvailable: true, snapshotValid: true,
    snapshotFingerprint: "fingerprint", imageAvailability: "AVAILABLE", blockingReasons: [], previewDocument: document,
    diagnostics: [], ...patch
  };
}
function candidates(frameId = "frame-1", frameStatus: FrameStatus = "REVIEW", values = [candidate()]): FrameTargetRecoveryCandidatesResponse {
  return { frameId, frameStatus, targetStatus: "MISSING", candidates: values };
}
function available(frameId = "frame-1", sourceGenerationId = "generation-1"): AvailableFrameTargetStoryStateResponse {
  return { status: "AVAILABLE", id: `target-${frameId}`, frameId, document: { ...document, sceneId: "scene-1" }, revision: 1,
    originType: "LEGACY_GENERATION_INPUT", sourceFrameId: frameId, sourceGenerationId, explicitlyEditedAt: null,
    createdAt: "2026-10-26T10:00:00.000Z", updatedAt: "2026-10-26T10:00:00.000Z" };
}
function json(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
function textOf(root: ReactTestInstance): string { return root.findAll(() => true).map(node => node.children.filter((child): child is string => typeof child === "string").join("")).join(" "); }
function findButton(root: ReactTestInstance, label: string): ReactTestInstance { return root.findAllByType("button").find(item => textOf(item).includes(label))!; }
async function flush(): Promise<void> { await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); }

async function mount(fetchImpl: typeof fetch, status: FrameStatus = "REVIEW", frameId = "frame-1") {
  globalThis.fetch = fetchImpl;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(React.createElement(QueryClientProvider, { client }, React.createElement(FrameTargetStoryStatePanel, { frameId, frameStatus: status, characters: [character] }))); });
  await flush();
  await flush();
  return { renderer, client };
}

function recoveryFetch(options: { candidateResponse?: FrameTargetRecoveryCandidatesResponse; postResponse?: Response | Error } = {}): typeof fetch {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("recovery-candidates")) return json(options.candidateResponse ?? candidates());
    if (url.endsWith("/recover") && init?.method === "POST") {
      if (options.postResponse instanceof Error) throw options.postResponse;
      return options.postResponse ?? json(available(), 201);
    }
    return json({ status: "MISSING", frameId: "frame-1", legacy: true });
  }) as typeof fetch;
}

afterEach(() => { vi.restoreAllMocks(); });

describe("Legacy Frame target recovery UI", () => {
  it("shows recovery only for MISSING targets that have historical Generations", async () => {
    const withHistory = await mount(recoveryFetch());
    expect(textOf(withHistory.renderer.root)).toContain("Восстановить из Generation");
    withHistory.renderer.unmount();

    const withoutHistory = await mount(recoveryFetch({ candidateResponse: candidates("frame-1", "DRAFT", []) }), "DRAFT");
    expect(textOf(withoutHistory.renderer.root)).not.toContain("Восстановить из Generation");
    withoutHistory.renderer.unmount();

    const fetchMock = vi.fn(async () => json(available())) as typeof fetch;
    const availableTarget = await mount(fetchMock, "DRAFT");
    expect(textOf(availableTarget.renderer.root)).not.toContain("Восстановить из Generation");
    expect((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls.some(call => String(call[0]).includes("recovery-candidates"))).toBe(false);
    availableTarget.renderer.unmount();

    const invalidFetch = vi.fn(async () => json({ status: "INVALID", frameId: "frame-1", code: "TARGET_INVALID", message: "bad", diagnostics: [] })) as typeof fetch;
    const invalid = await mount(invalidFetch);
    expect(textOf(invalid.renderer.root)).not.toContain("Восстановить из Generation");
  });

  it("renders eligible, recommended, failed and locked-only candidate policy from backend", async () => {
    const values = [
      candidate(),
      candidate({ generationId: "failed", generationStatus: "FAILED", isSelected: false, isRecommended: false, isEligible: false, snapshotAvailable: false, snapshotValid: false, previewDocument: null, blockingReasons: ["GENERATION_NOT_SUCCESS", "SNAPSHOT_MISSING"] }),
      candidate({ generationId: "running", generationStatus: "RUNNING", isSelected: false, isRecommended: false, isEligible: false, blockingReasons: ["GENERATION_NOT_SUCCESS"] }),
      candidate({ generationId: "other", isSelected: false, isRecommended: false, isEligible: false, blockingReasons: ["LOCKED_SOURCE_NOT_SELECTED"] })
    ];
    const { renderer } = await mount(recoveryFetch({ candidateResponse: candidates("frame-1", "LOCKED", values) }), "LOCKED");
    await act(async () => findButton(renderer.root, "Восстановить из Generation").props.onClick());
    const content = textOf(renderer.root);
    expect(content).toContain("Кадр закреплён");
    expect(content).toContain("Рекомендуется");
    expect(content).toContain("FAILED");
    expect(content).toContain("RUNNING");
    expect(content).toContain("только выбранную Generation");
    const radios = renderer.root.findAllByProps({ type: "radio" });
    expect(radios.filter(input => input.props.disabled)).toHaveLength(3);
    expect(radios.every(input => input.props.checked === false)).toBe(true);
  });

  it("requires explicit selection and confirmation, previews all structured sections, and posts only the source ID", async () => {
    const fetchMock = recoveryFetch();
    const { renderer } = await mount(fetchMock);
    await act(async () => findButton(renderer.root, "Восстановить из Generation").props.onClick());
    expect(findButton(renderer.root, "Продолжить").props.disabled).toBe(true);
    expect((fetchMock as ReturnType<typeof vi.fn>).mock.calls.some(call => call[1]?.method === "POST")).toBe(false);
    const radio = renderer.root.findAllByProps({ type: "radio" })[0]!;
    await act(async () => radio.props.onChange());
    const preview = textOf(renderer.root);
    expect(preview).toContain("Late evening");
    expect(preview).toContain("Окружение");
    expect(preview).toContain("Birdman");
    expect(preview).toContain("Предметы");
    expect(preview).toContain("Сюжетные факты");
    expect(preview).toContain("может отличаться от фактического содержимого кадра");
    expect((fetchMock as ReturnType<typeof vi.fn>).mock.calls.some(call => call[1]?.method === "POST")).toBe(false);
    await act(async () => findButton(renderer.root, "Продолжить").props.onClick());
    expect(textOf(renderer.root)).toContain("Статус кадра и выбранная Generation останутся прежними");
    await act(async () => findButton(renderer.root, "Восстановить состояние").props.onClick());
    await flush();
    const post = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.find(call => call[1]?.method === "POST")!;
    expect(JSON.parse(String(post[1]?.body))).toEqual({ sourceGenerationId: "generation-1" });
    expect(String(post[0])).toContain("/target-story-state/recover");
    expect((fetchMock as ReturnType<typeof vi.fn>).mock.calls.some(call => /select|lock|scene-story-state/u.test(String(call[0])))).toBe(false);
    expect(textOf(renderer.root)).toContain("LEGACY_GENERATION_INPUT");
    expect(textOf(renderer.root)).toContain("generation-1");
    expect(textOf(renderer.root)).toContain("Целевое состояние восстановлено");
  });

  it("warns about an unavailable image without blocking an eligible recovery", async () => {
    const missingImage = candidate({ imageAvailability: "MISSING" });
    const { renderer } = await mount(recoveryFetch({ candidateResponse: candidates("frame-1", "REVIEW", [missingImage]) }));
    await act(async () => findButton(renderer.root, "Восстановить из Generation").props.onClick());
    await act(async () => renderer.root.findAllByProps({ type: "radio" })[0]!.props.onChange());
    expect(textOf(renderer.root)).toContain("Файл изображения недоступен");
    expect(findButton(renderer.root, "Продолжить").props.disabled).toBe(false);
  });

  it("blocks GENERATING recovery using backend eligibility and preserves explicit cancellation", async () => {
    const blocked = candidate({ isEligible: false, isRecommended: false, blockingReasons: ["FRAME_GENERATING"] });
    const fetchMock = recoveryFetch({ candidateResponse: candidates("frame-1", "GENERATING", [blocked]) });
    const { renderer } = await mount(fetchMock, "GENERATING");
    await act(async () => findButton(renderer.root, "Восстановить из Generation").props.onClick());
    expect(textOf(renderer.root)).toContain("пока выполняется генерация");
    await act(async () => findButton(renderer.root, "Отмена").props.onClick());
    expect((fetchMock as ReturnType<typeof vi.fn>).mock.calls.some(call => call[1]?.method === "POST")).toBe(false);
  });

  it("keeps selection and preview after a network error and permits an explicit retry", async () => {
    let posts = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("recovery-candidates")) return json(candidates());
      if (url.endsWith("/recover") && init?.method === "POST") { posts += 1; if (posts === 1) throw new Error("C:\\private"); return json(available(), 201); }
      return json({ status: "MISSING", frameId: "frame-1", legacy: true });
    }) as typeof fetch;
    const { renderer } = await mount(fetchMock);
    await act(async () => findButton(renderer.root, "Восстановить из Generation").props.onClick());
    await act(async () => renderer.root.findAllByProps({ type: "radio" })[0]!.props.onChange());
    await act(async () => findButton(renderer.root, "Продолжить").props.onClick());
    await act(async () => findButton(renderer.root, "Восстановить состояние").props.onClick()); await flush();
    expect(textOf(renderer.root)).toContain("Выбор и preview сохранены");
    expect(textOf(renderer.root)).toContain("Late evening");
    expect(textOf(renderer.root)).not.toContain("private");
    await act(async () => findButton(renderer.root, "Восстановить состояние").props.onClick()); await flush();
    expect(posts).toBe(2);
    expect(textOf(renderer.root)).toContain("LEGACY_GENERATION_INPUT");
  });

  it("prevents duplicate POST while recovery is pending", async () => {
    let resolvePost!: (value: Response) => void;
    const pending = new Promise<Response>(resolve => { resolvePost = resolve; });
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("recovery-candidates")) return json(candidates());
      if (init?.method === "POST") return pending;
      return json({ status: "MISSING", frameId: "frame-1", legacy: true });
    }) as typeof fetch;
    const { renderer } = await mount(fetchMock);
    await act(async () => findButton(renderer.root, "Восстановить из Generation").props.onClick());
    await act(async () => renderer.root.findAllByProps({ type: "radio" })[0]!.props.onChange());
    await act(async () => findButton(renderer.root, "Продолжить").props.onClick());
    const confirm = findButton(renderer.root, "Восстановить состояние");
    await act(async () => { confirm.props.onClick(); confirm.props.onClick(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
    expect(findButton(renderer.root, "Отмена").props.disabled).toBe(true);
    resolvePost(json(available(), 201)); await flush();
  });

  it("isolates late GET and POST responses by Frame ID and refreshes only the recovered Frame readiness", async () => {
    let resolveA!: (value: Response) => void;
    const pendingA = new Promise<Response>(resolve => { resolveA = resolve; });
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("frame-A") && init?.method === "POST") return pendingA;
      if (url.includes("recovery-candidates")) return json(candidates(url.includes("frame-B") ? "frame-B" : "frame-A", "REVIEW", [candidate({ frameId: url.includes("frame-B") ? "frame-B" : "frame-A" })]));
      return json({ status: "MISSING", frameId: url.includes("frame-B") ? "frame-B" : "frame-A", legacy: true });
    }) as typeof fetch;
    const { renderer, client } = await mount(fetchMock, "REVIEW", "frame-A");
    client.setQueryData(frameLockReadinessQueryKey("frame-A"), { status: "BLOCKED", frameId: "frame-A", reasons: ["TARGET_NOT_INITIALIZED"], diagnostics: [{ reason: "TARGET_NOT_INITIALIZED", message: "missing" }] });
    await act(async () => findButton(renderer.root, "Восстановить из Generation").props.onClick());
    await act(async () => renderer.root.findAllByProps({ type: "radio" })[0]!.props.onChange());
    await act(async () => findButton(renderer.root, "Продолжить").props.onClick());
    act(() => findButton(renderer.root, "Восстановить состояние").props.onClick());
    await act(async () => renderer.update(React.createElement(QueryClientProvider, { client }, React.createElement(FrameTargetStoryStatePanel, { frameId: "frame-B", frameStatus: "REVIEW", characters: [character] })))); await flush();
    resolveA(json(available("frame-A"), 201)); await flush();
    expect(textOf(renderer.root)).toContain("Целевое состояние кадра отсутствует");
    expect(textOf(renderer.root)).not.toContain("Целевое состояние восстановлено");
    expect(client.getQueryData(["frame-target-story-state", "frame-A"])).toMatchObject({ status: "AVAILABLE", frameId: "frame-A" });
    expect(client.getQueryData(["frame-target-story-state", "frame-B"])).toMatchObject({ status: "MISSING", frameId: "frame-B" });
    expect(frameTargetRecoveryCandidatesQueryKey("frame-A")).not.toEqual(frameTargetRecoveryCandidatesQueryKey("frame-B"));
    expect(client.getQueryState(frameLockReadinessQueryKey("frame-A"))?.isInvalidated).toBe(true);
  });

  it("maps typed recovery failures without exposing server diagnostics", () => {
    expect(recoveryErrorMessage("TARGET_ALREADY_INITIALIZED")).toContain("уже создано");
    expect(recoveryErrorMessage("RECOVERY_CONFLICT")).toContain("Обновите список");
    expect(recoveryErrorMessage("SNAPSHOT_INVALID")).toContain("повреждено");
    expect(recoveryErrorMessage("LOCKED_SOURCE_NOT_SELECTED")).toContain("закреплённого кадра");
  });
});
