import React from "react";
import { act, create } from "react-test-renderer";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { sameLockConfirmation, useFrameReviewActions } from "./components/useFrameReviewActions.js";
import { FrameReviewWorkspace } from "./components/FrameReviewWorkspace.js";
import { LockConfirmationDialog } from "./components/LockConfirmationDialog.js";
import { useUiStore } from "./state.js";
const document = { sceneId: "s", time: { description: "Historical morning" }, environment: {}, characters: {}, props: {}, storyFacts: [] };
const gen = (id) => ({ id, status: "SUCCESS", provider: "mock", model: "fixture", generationType: "INITIAL", createdAt: "2026-01-01T00:00:00Z", outputFilePath: id + ".png", storyStateSnapshot: JSON.stringify(document), frameSnapshot: "{}", rawMetadata: "{}" });
const frame = { id: "f", frameCode: "F1", status: "REVIEW", selectedGenerationId: "a", generations: [gen("a"), gen("b")] };
const project = { id: "p", characters: [], scenes: [{ id: "s", frames: [frame] }] };
const ready = (id = "a", revision = 1) => ({ status: "READY", frameId: "f", selectedGenerationId: id, targetRevision: revision, targetFingerprint: "target", snapshotFingerprint: "target" });
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const flush = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
afterEach(() => { useUiStore.setState({ selectedProjectId: null, frameDraftDirty: false }); vi.unstubAllGlobals(); });
async function mount(options = {}) {
    const initialFrame = { ...frame, status: options.locked ? "LOCKED" : frame.status, selectedGenerationId: options.none ? null : "a" };
    let serverFrame = structuredClone(initialFrame);
    let revision = 1;
    let forceBlocked = Boolean(options.blocked);
    const writes = [];
    const reads = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
        if (init?.method === "PUT") {
            writes.push({ url, body: JSON.parse(String(init.body)) });
            if (options.selectionFailure)
                return response({ error: "Selection rejected", code: "FRAME_SELECTION_BLOCKED" }, 409);
            serverFrame = { ...serverFrame, selectedGenerationId: JSON.parse(String(init.body)).generationId, status: "REVIEW" };
            return response(serverFrame);
        }
        if (init?.method === "POST") {
            writes.push({ url, body: JSON.parse(String(init.body)) });
            if (options.unsupported)
                return new Response("Cannot POST /lock-confirmed", { status: 404 });
            if (options.lockFailure)
                return response({ error: "Server rejected Lock", code: "FRAME_LOCK_READINESS_STALE", reasons: ["LOCK_READINESS_STALE"], diagnostics: [{ reason: "LOCK_READINESS_STALE", message: "Facts changed" }] }, 409);
            if (options.lostResponse) {
                if (options.serverCommitted)
                    serverFrame = { ...serverFrame, status: "LOCKED" };
                throw new TypeError("Network response lost");
            }
            serverFrame = { ...serverFrame, status: "LOCKED" };
            return response(serverFrame);
        }
        reads.push(url);
        if (url.endsWith("/full"))
            return response({ ...project, scenes: [{ id: "s", frames: [serverFrame] }] });
        if (url.endsWith("lock-readiness"))
            return response(forceBlocked || !serverFrame.selectedGenerationId ? { status: "BLOCKED", frameId: "f", selectedGenerationId: serverFrame.selectedGenerationId ?? undefined, targetRevision: revision, reasons: [serverFrame.selectedGenerationId ? "TARGET_SNAPSHOT_MISMATCH" : "SELECTION_MISSING"], diagnostics: [{ reason: "TARGET_SNAPSHOT_MISMATCH", message: "Different target" }] } : ready(serverFrame.selectedGenerationId, revision));
        return response({});
    }));
    useUiStore.setState({ selectedProjectId: "p", selectedFrameId: "f", section: "frames", frameDraftDirty: false });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    client.setQueryData(["project", "p"], { ...project, scenes: [{ id: "s", frames: [initialFrame] }] });
    let actions;
    let dirty = Boolean(options.dirty);
    function Harness() {
        const data = useQuery({ queryKey: ["project", "p"], queryFn: async () => project, enabled: false }).data;
        actions = useFrameReviewActions(data, data.scenes[0].frames[0], dirty);
        return React.createElement(React.Fragment, {}, React.createElement(FrameReviewWorkspace, { project: data, frame: data.scenes[0].frames[0], dirty, actions, onCompare: vi.fn(), onTarget: vi.fn() }), React.createElement(LockConfirmationDialog, { confirmation: actions.confirmation, pending: actions.busy, onConfirm: actions.confirmLock, onCancel: actions.cancelLock }));
    }
    let renderer;
    await act(async () => { renderer = create(React.createElement(QueryClientProvider, { client }, React.createElement(Harness))); });
    await flush();
    return { renderer, client, writes, reads, actions: () => actions, server: () => serverFrame, revision: (value) => { revision = value; }, block: () => { forceBlocked = true; }, makeDirty: () => { dirty = true; renderer.update(React.createElement(QueryClientProvider, { client }, React.createElement(Harness))); }, close: async () => { await act(async () => renderer.unmount()); client.clear(); } };
}
it("does not automatically select or lock, and keeps checklist local without adding lock conditions", async () => {
    const m = await mount();
    expect(m.writes).toEqual([]);
    expect(m.actions().canLock).toBe(true);
    const checkbox = m.renderer.root.findAllByType("input")[0];
    await act(async () => checkbox.props.onChange({ target: { checked: true } }));
    expect(m.writes).toEqual([]);
    expect(m.actions().canLock).toBe(true);
    await m.close();
});
it("selects explicitly, confirms server state and never mutates snapshot/provenance", async () => {
    const m = await mount();
    const before = JSON.stringify(frame.generations);
    await act(async () => { m.actions().select("b"); m.actions().select("b"); });
    await flush();
    expect(m.writes).toEqual([{ url: "/api/frames/f/selected-generation", body: { generationId: "b" } }]);
    expect(m.client.getQueryData(["project", "p"]).scenes[0].frames[0].selectedGenerationId).toBe("b");
    expect(JSON.stringify(frame.generations)).toBe(before);
    await m.close();
});
it("retains server selection after a rejected choice and exposes the error code", async () => {
    const m = await mount({ selectionFailure: true });
    await act(async () => m.actions().select("b"));
    await flush();
    expect(m.server().selectedGenerationId).toBe("a");
    expect(m.actions().error).toMatchObject({ code: "FRAME_SELECTION_BLOCKED" });
    expect(m.client.getQueryData(["project", "p"]).scenes[0].frames[0].selectedGenerationId).toBe("a");
    await m.close();
});
it("requires confirmation, supports cancel and locks only after explicit confirmation", async () => {
    const m = await mount();
    await act(async () => m.actions().requestLock());
    expect(m.actions().confirmation?.ready.selectedGenerationId).toBe("a");
    expect(m.writes).toEqual([]);
    await act(async () => m.actions().cancelLock());
    expect(m.actions().confirmation).toBeNull();
    await act(async () => m.actions().requestLock());
    await act(async () => { m.actions().confirmLock(); m.actions().confirmLock(); });
    await flush();
    expect(m.writes).toEqual([{ url: "/api/frames/f/lock-confirmed", body: { expectedGenerationId: "a", expectedTargetRevision: 1 } }]);
    expect(m.client.getQueryData(["project", "p"]).scenes[0].frames[0].status).toBe("LOCKED");
    await m.close();
});
it("refuses changed Target revision at confirmation without calling Lock", async () => {
    const m = await mount();
    await act(async () => m.actions().requestLock());
    m.revision(2);
    await act(async () => m.actions().confirmLock());
    await flush();
    expect(m.writes).toEqual([]);
    expect(m.actions().error).toMatchObject({ code: "FRAME_LOCK_READINESS_STALE" });
    expect(m.server().status).toBe("REVIEW");
    await m.close();
});
it("shows server lock failure without optimistic LOCKED", async () => {
    const m = await mount({ lockFailure: true });
    await act(async () => m.actions().requestLock());
    await act(async () => m.actions().confirmLock());
    await flush();
    expect(m.actions().error).toMatchObject({ code: "FRAME_LOCK_READINESS_STALE" });
    expect(m.server().status).toBe("REVIEW");
    expect(m.client.getQueryData(["project", "p"]).scenes[0].frames[0].status).toBe("REVIEW");
    await m.close();
});
it("does not fall back to legacy Lock on an old server, including a non-JSON 404", async () => {
    const m = await mount({ unsupported: true });
    await act(async () => m.actions().requestLock());
    await act(async () => m.actions().confirmLock());
    await flush();
    expect(m.actions().error).toMatchObject({ code: "LOCK_API_INCOMPATIBLE" });
    expect(m.actions().confirmation).toBeNull();
    expect(m.writes).toHaveLength(1);
    expect(m.writes[0].url).toBe("/api/frames/f/lock-confirmed");
    expect(m.server().status).toBe("REVIEW");
    await m.close();
});
it.each([false, true])("reconciles a lost response with actual server status (committed=%s), never retrying Lock", async (committed) => {
    const m = await mount({ lostResponse: true, serverCommitted: committed });
    await act(async () => m.actions().requestLock());
    await act(async () => m.actions().confirmLock());
    await flush();
    expect(m.actions().error).toMatchObject({ code: "LOCK_OUTCOME_UNKNOWN" });
    expect(m.reads).toContain("/api/projects/p/full");
    expect(m.writes).toHaveLength(1);
    expect(m.client.getQueryData(["project", "p"]).scenes[0].frames[0].status).toBe(committed ? "LOCKED" : "REVIEW");
    await m.close();
});
it.each([{ none: true }, { blocked: true }, { dirty: true }, { locked: true }])("blocks Lock for %o", async (options) => {
    const m = await mount(options);
    expect(m.actions().canLock).toBe(false);
    await act(async () => { m.actions().requestLock(); m.actions().confirmLock(); });
    expect(m.writes).toEqual([]);
    if (options.dirty || options.locked) {
        await act(async () => m.actions().select("b"));
        expect(m.writes).toEqual([]);
    }
    await m.close();
});
it("prevents stale actions after project switch or unmount", async () => {
    const m = await mount();
    await act(async () => m.actions().requestLock());
    useUiStore.setState({ selectedProjectId: "other" });
    await act(async () => m.actions().confirmLock());
    expect(m.writes).toEqual([]);
    const old = m.actions();
    await m.close();
    old.select("b");
    old.confirmLock();
    expect(m.writes).toEqual([]);
});
it("compares all confirmation identity fields rather than using Production readiness", () => {
    const value = ready();
    if (value.status !== "READY")
        throw Error("fixture");
    expect(sameLockConfirmation(value, ready())).toBe(true);
    expect(sameLockConfirmation(value, ready("b"))).toBe(false);
    expect(sameLockConfirmation(value, ready("a", 2))).toBe(false);
    expect(sameLockConfirmation(value, { ...value, snapshotFingerprint: "other" })).toBe(false);
});
