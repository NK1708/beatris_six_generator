import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { updateFrameContext } from "./services/frameContextService.js";

describe("additional character reference validation", () => {
  it("persists explicit empty with a revision bump and rejects stale or locked mutations", async () => {
    const update = vi.fn().mockResolvedValue({ id: "frame-1" });
    const prisma = fakePrisma([], update);
    await updateFrameContext(prisma, { frameId: "frame-1", characterCastMode: "EXPLICIT", characterIds: [], expectedCharacterCastRevision: 0 });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ characterCastSource: "EXPLICIT", characterCastRevision: { increment: 1 }, characters: { create: [] } }) }));
    await expect(updateFrameContext(fakePrisma([], update, { characterCastRevision: 1 }), { frameId: "frame-1", characterIds: [], expectedCharacterCastRevision: 0 })).rejects.toMatchObject({ code: "FRAME_CAST_REVISION_CONFLICT" });
    await expect(updateFrameContext(fakePrisma([], update, { status: "LOCKED" }), { frameId: "frame-1", characterIds: [] })).rejects.toMatchObject({ code: "FRAME_CAST_MUTATION_FORBIDDEN" });
  });

  it("rejects a reference belonging to another character", async () => {
    const prisma = fakePrisma([{ id: "ref-1", characterId: "character-2", type: "PROFILE_LEFT", status: "LOCKED" }]);
    await expect(updateFrameContext(prisma, input(["ref-1"]))).rejects.toThrow("Invalid additional character reference");
  });

  it("rejects a non-LOCKED reference", async () => {
    const prisma = fakePrisma([{ id: "ref-1", characterId: "character-1", type: "FULL_BODY_FRONT", status: "APPROVED" }]);
    await expect(updateFrameContext(prisma, input(["ref-1"]))).rejects.toThrow("Invalid additional character reference");
  });

  it("rejects duplicate selections", async () => {
    const prisma = fakePrisma([]);
    await expect(updateFrameContext(prisma, input(["ref-1", "ref-1"]))).rejects.toThrow("selected more than once");
  });

  it("persists valid selections under the FrameCharacter relationship", async () => {
    const update = vi.fn().mockResolvedValue({ id: "frame-1" });
    const prisma = fakePrisma(
      [{ id: "ref-1", characterId: "character-1", type: "FULL_BODY_FRONT", status: "LOCKED" }],
      update
    );

    await updateFrameContext(prisma, input(["ref-1"]));

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        characters: {
          create: [{
            characterId: "character-1",
            order: 1,
            additionalReferences: {
              create: [{ characterReferenceId: "ref-1", order: 1 }]
            }
          }]
        }
      })
    }));
  });
});

function input(referenceIds: string[]) {
  return {
    frameId: "frame-1",
    characterIds: ["character-1"],
    locationId: null,
    locationAngleId: null,
    styleProfileId: null,
    additionalCharacterReferenceIds: { "character-1": referenceIds }
  };
}

function fakePrisma(references: Array<Record<string, string>>, update = vi.fn(), frameOverrides: Record<string, unknown> = {}) {
  const transactionClient = {
    frameCharacter: { deleteMany: vi.fn() },
    frame: {
      updateMany: vi.fn().mockResolvedValue({ count: frameOverrides.status === "LOCKED" ? 0 : 1 }),
      findUnique: vi.fn().mockResolvedValue({ id: "frame-1", sceneId: "scene-1", sequence: 1, status: "DRAFT", characterCastRevision: 0, scene: { projectId: "project-1", characters: [] }, ...frameOverrides }),
      update
    },
    character: { findMany: vi.fn().mockResolvedValue([{ id: "character-1" }]) },
    characterReference: { findMany: vi.fn().mockResolvedValue(references) }
  };
  return {
    $transaction: vi.fn(async (callback: (client: typeof transactionClient) => unknown) => callback(transactionClient))
  } as unknown as PrismaClient;
}
