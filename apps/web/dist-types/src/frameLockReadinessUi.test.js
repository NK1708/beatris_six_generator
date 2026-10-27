import { describe, expect, it } from "vitest";
import { canLockFrame, canSelectFrameGeneration, frameLockReadinessQueryKey, frameLockReasonLabels } from "./components/FrameLockReadiness.js";
const ready = { status: "READY", frameId: "frame", selectedGenerationId: "generation", targetRevision: 1, targetFingerprint: "same", snapshotFingerprint: "same" };
const blocked = { status: "BLOCKED", frameId: "frame", reasons: ["TARGET_SNAPSHOT_MISMATCH"], diagnostics: [{ reason: "TARGET_SNAPSHOT_MISMATCH", message: "mismatch" }] };
describe("Frame Lock readiness UI policy", () => {
    it("enables Lock only for selected SUCCESS generation with READY diagnostics", () => {
        expect(canLockFrame(ready, true, "SUCCESS", "REVIEW")).toBe(true);
        expect(canLockFrame(blocked, true, "SUCCESS", "REVIEW")).toBe(false);
        expect(canLockFrame(ready, false, "SUCCESS", "REVIEW")).toBe(false);
        expect(canLockFrame(ready, true, "FAILED", "REVIEW")).toBe(false);
    });
    it("disables selection for LOCKED and GENERATING Frames", () => {
        expect(canSelectFrameGeneration("REVIEW", "SUCCESS")).toBe(true);
        expect(canSelectFrameGeneration("LOCKED", "SUCCESS")).toBe(false);
        expect(canSelectFrameGeneration("GENERATING", "SUCCESS")).toBe(false);
    });
    it("isolates readiness cache by Frame and exposes safe diagnostics", () => {
        expect(frameLockReadinessQueryKey("frame-1")).not.toEqual(frameLockReadinessQueryKey("frame-2"));
        expect(frameLockReasonLabels.TARGET_SNAPSHOT_MISMATCH).toContain("другого состояния");
        expect(frameLockReasonLabels.OUTPUT_FILE_MISSING).not.toContain("generations/");
    });
});
