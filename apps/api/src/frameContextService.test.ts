import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { updateFrameContext } from "./services/frameContextService.js";

describe("additional character reference validation", () => {
  it("rejects a reference belonging to another character", async () => {
    const prisma = fakePrisma([{ id: "ref-1", characterId: "character-2", type: "PROFILE_LEFT", status: "LOCKED" }]);
    await expect(updateFrameContext(prisma, input(["ref-1"]))).rejects.toThrow("different Character");
  });

  it("rejects a non-LOCKED reference", async () => {
    const prisma = fakePrisma([{ id: "ref-1", characterId: "character-1", type: "FULL_BODY_FRONT", status: "APPROVED" }]);
    await expect(updateFrameContext(prisma, input(["ref-1"]))).rejects.toThrow("Only LOCKED");
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

function fakePrisma(references: Array<Record<string, string>>, update = vi.fn()) {
  const transactionClient = {
    frameCharacter: { deleteMany: vi.fn() },
    frame: { update }
  };
  return {
    characterReference: { findMany: vi.fn().mockResolvedValue(references) },
    $transaction: vi.fn(async (callback: (client: typeof transactionClient) => unknown) => callback(transactionClient))
  } as unknown as PrismaClient;
}
