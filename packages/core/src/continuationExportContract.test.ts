import { expect, it } from "vitest";
import { storyStateSchema } from "@bearridge/shared";
import type { FrameContext } from "./domain.js";
import { resolveContinuationExportContract } from "./continuationExportContract.js";

function fixture(): FrameContext {
  const state = storyStateSchema.parse({ sceneId: "s", time: { description: "day" }, characters: { web: { present: true, pose: "seated", locationPosition: "sofa", emotion: "calm" } } });
  return { frame: { continuityEditContract: { changes: [], forbidden: ["Do not change camera, face or style."], allowedChanges: [] } },
    characters: [{ id: "web", name: "Webster" }], storyState: structuredClone(state),
    continuityBaseline: { status: "AVAILABLE", storyState: state, frameId: "first", generationId: "selected", visualBase: { generationId: "selected", filePath: "base.png" } }
  } as unknown as FrameContext;
}

it("merges explicit instructions with changed fields without changing intent or snapshot", () => {
  const c = fixture(); c.frame.continuityEditContract.changes = ["Keep the existing framing."];
  c.frame.continuityEditContract.allowedChanges = ["lighting"];
  c.storyState.characters.web!.pose = "standing";
  const before = JSON.stringify(c), contract = resolveContinuationExportContract(c);
  expect(contract.changes).toEqual(["Keep the existing framing.", 'Update "Webster" [Character ID: "web"]: pose: "seated" -> "standing".']);
  expect(contract.forbidden).toEqual(["Do not change camera, face or style."]);
  expect(contract.allowedChanges).toEqual(["character.pose", "lighting"]);
  expect(contract.changes.join("\n")).not.toContain("calm"); expect(JSON.stringify(c)).toBe(before);
});

it("does not use an unconfirmed or mutable previous state as a baseline", () => {
  const c = fixture(); c.previousStoryState = structuredClone(c.storyState); c.storyState.characters.web!.pose = "standing";
  c.continuityBaseline = { status: "UNAVAILABLE", reason: "NOT_LOCKED", diagnostic: { kind: "MISSING", severity: "blocking", code: "NOT_LOCKED", message: "not locked" } };
  expect(resolveContinuationExportContract(c).changes).toEqual([]);
});

it("leaves an unchanged Target empty and does not duplicate an exact explicit change", () => {
  const c = fixture(); expect(resolveContinuationExportContract(c).changes).toEqual([]);
  c.storyState.characters.web!.pose = "standing";
  const line = resolveContinuationExportContract(c).changes[0]!;
  c.frame.continuityEditContract.changes = [line]; expect(resolveContinuationExportContract(c).changes).toEqual([line]);
});
