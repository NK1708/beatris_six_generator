import { afterEach, describe, expect, it, vi } from "vitest";
import { canPrepareProduction, generationFix, generationMetadata, generationRequest, GenerationRequestError } from "./generationWorkspace.js";
import type { Generation, PreviewResponse, Project } from "./model.js";

afterEach(() => vi.unstubAllGlobals());
describe("existing generation contracts in UI", () => {
  it("requires server Target preparation as well as absence of blocking warnings", () => {
    expect(canPrepareProduction({ warnings: [] } as unknown as PreviewResponse)).toBe(false);
    expect(canPrepareProduction({ productionTarget: { revision: 1 }, warnings: [{ severity: "blocking" }] } as unknown as PreviewResponse)).toBe(false);
    expect(canPrepareProduction({ productionTarget: { revision: 1 }, warnings: [{ severity: "warning" }] } as unknown as PreviewResponse)).toBe(true);
  });
  it("preserves structured server readiness errors and their technical codes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: "PRODUCTION_GENERATION_BLOCKED", error: "Blocked", reasons: ["TARGET_INVALID"], diagnostics: [{ reason: "TARGET_INVALID", message: "Invalid target snapshot" }] }), { status: 409 })));
    const error = await generationRequest("/api/frames/f/preview").catch((value: unknown) => value);
    expect(error).toBeInstanceOf(GenerationRequestError);
    expect(error).toMatchObject({ code: "PRODUCTION_GENERATION_BLOCKED", status: 409, problems: [{ code: "TARGET_INVALID", message: "Invalid target snapshot" }] });
  });
  it("never guesses historical Draft mode from model, INITIAL type or absent metadata", () => {
    const record = { status: "SUCCESS", generationType: "INITIAL", model: "same-model" } as Generation;
    expect(generationMetadata(record).mode).toBe("Режим не сохранён");
    expect(generationMetadata({ ...record, rawMetadata: "broken" }).mode).toBe("Режим не сохранён");
    expect(generationMetadata({ ...record, rawMetadata: JSON.stringify({ productionTarget: { revision: 7 } }) })).toMatchObject({ mode: "Production", targetRevision: 7 });
    expect(generationMetadata({ ...record, rawMetadata: JSON.stringify({ manualImport: true }) }).mode).toBe("Ручной импорт");
  });
  it("extracts only persisted failure messages", () => {
    expect(generationMetadata({ status: "FAILED", rawMetadata: JSON.stringify({ message: "Fixture failed" }) } as Generation).error).toBe("Fixture failed");
    expect(generationMetadata({ status: "FAILED" } as Generation).error).toBeNull();
  });
  it("routes asset issues using existing identities, and does not fabricate unknown destinations", () => {
    const project = { characters: [{ id: "c", name: "Mira", outfits: [{ id: "o" }] }], locations: [{ id: "l", name: "Station", angles: [{ id: "angle" }] }], styleProfiles: [{ id: "s", name: "Ink" }] } as unknown as Project;
    expect(generationFix(project, { code: "MISSING_CHARACTER_MASTER", entityId: "c", message: "" })).toMatchObject({ kind: "character", id: "c" });
    expect(generationFix(project, { code: "MISSING_OUTFIT_MASTER", entityId: "o", message: "" })).toMatchObject({ kind: "outfit", id: "c" });
    expect(generationFix(project, { code: "MISSING_LOCATION_ANGLE_REFERENCE", entityId: "angle", message: "" })).toMatchObject({ kind: "location", id: "l" });
    expect(generationFix(project, { code: "MISSING_STYLE_REFERENCE", entityId: "s", message: "" })).toMatchObject({ kind: "style", id: "s" });
    expect(generationFix(project, { code: "TARGET_INVALID", message: "" }).kind).toBe("target");
    expect(generationFix(project, { code: "UNKNOWN", message: "" }).kind).toBe("explain");
  });
});
