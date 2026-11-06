import { describe, expect, it } from "vitest";
import { storyStateSchema } from "@bearridge/shared";
import type { FrameContext } from "./domain.js";
import { PromptBuilder } from "./promptBuilder.js";
import { buildCharacterIdentityMap, buildPortablePropContext, buildPropRecordChanges } from "./propPrompt.js";

function fixture(): FrameContext {
  const state = storyStateSchema.parse({ sceneId: "scene", time: { description: "Morning" }, characters: { bird: { present: true }, web: { present: true } }, props: { Key: { holderCharacterId: "web" } } });
  return {
    project: { name: "Project" }, scene: { name: "Scene", description: "", characterIds: ["bird", "web"], timeDescription: "" },
    frame: { id: "frame", frameCode: "F001", type: "CG", characterIds: ["bird"], effectiveCharacterIds: ["bird"], generationStrategy: "NEW_COMPOSITION", action: "", continuityEditContract: { changes: [], forbidden: [], allowedChanges: [] } },
    characters: [{ id: "bird", name: "Birdman", outfits: [] }, { id: "web", name: "Webster", outfits: [] }],
    storyState: state, sceneCurrentStoryState: structuredClone(state), frameTargetStoryState: { status: "AVAILABLE", document: state, revision: 1 },
    continuityBaseline: { status: "UNAVAILABLE", reason: "NOT_LOCKED" }, location: null, locationAngle: null,
    styleProfile: { name: "Minimal", faces: "featureless faces", description: "flat minimalist style", negativeRules: "no photorealism" }
  } as unknown as FrameContext;
}
const main = (context: FrameContext) => new PromptBuilder().build(context, []);
const props = (context: FrameContext) => main(context).split("DECLARED PROP STATE:")[1]!.split("FRAME INSTRUCTIONS:")[0]!;

describe("prop prompt coverage without inferred facts", () => {
  it("includes actual prop key, holder ID/name, location and state without mutating input", () => {
    const c = fixture(); c.storyState.props.Key = { holderCharacterId: "web", location: "on the table", state: "rusted" };
    const before = JSON.stringify(c), result = props(c);
    expect(result).toContain('Prop key: "Key"'); expect(result).toContain('Holder association: "Webster" [Character ID: "web"]');
    expect(result).toContain('Recorded location: "on the table"'); expect(result).toContain('Recorded state: "rusted"');
    expect(result).not.toContain("Recorded heldProps"); expect(JSON.stringify(c)).toBe(before);
    expect(main(c)).toContain('"Webster" [Character ID: "web"]; Frame Cast: no');
    expect(c.frame.characterIds).toEqual(["bird"]);
  });
  it.each([{}, { location: "table" }, { state: "locked" }])("does not invent absent prop facts: %j", value => {
    const c = fixture(); c.storyState.props.Key = value; const result = props(c);
    expect(result).not.toContain("Holder association:"); expect(result).not.toContain("Recorded heldProps");
    if (!("location" in value)) expect(result).not.toContain("Recorded location:");
    if (!("state" in value)) expect(result).not.toContain("Recorded state:");
  });
  it("keeps heldProps independent, including a different holder and held-only items", () => {
    const c = fixture(); c.storyState.characters.bird!.heldProps = ["Key", "arbitrary free string"];
    expect(props(c)).toContain('Holder association: "Webster" [Character ID: "web"]');
    expect(props(c)).toContain('Recorded heldProps for "Birdman" [Character ID: "bird"]: ["Key","arbitrary free string"]');
    delete c.storyState.props.Key!.holderCharacterId;
    expect(props(c)).not.toContain("Holder association:"); expect(props(c)).toContain('["Key","arbitrary free string"]');
    expect(c.storyState.characters.bird!.heldProps).toEqual(["Key", "arbitrary free string"]);
  });
  it("retains unknown/historical IDs and resolves duplicate names by exact ID only", () => {
    const c = fixture(); c.characters[0]!.name = "Same"; c.characters[1]!.name = "Same";
    c.storyState.props.Key!.holderCharacterId = "deleted-id";
    expect(props(c)).toContain('Unknown character [Character ID: "deleted-id"]');
    c.storyState.props.Key!.holderCharacterId = "web";
    expect(props(c)).toContain('"Same" [Character ID: "web"]');
    expect(main(c)).toContain('"Same" [Character ID: "bird"]');
    expect(main(c)).toContain('"Same" [Character ID: "web"]; Frame Cast: no');
  });
  it("preserves explicit empty values without equating them with empty hands", () => {
    const c = fixture(); c.storyState.props.Key = { location: "", state: "" }; c.storyState.characters.bird!.heldProps = [];
    expect(props(c)).toContain('Recorded location: ""'); expect(props(c)).toContain('Recorded state: ""');
    expect(props(c)).toContain('Recorded heldProps for "Birdman" [Character ID: "bird"]: []');
    expect(props(c)).not.toContain("empty hands");
  });
  it("binds duplicate names to their supplied reference codes by ID without selecting extra assets", () => {
    const c = fixture(); c.characters[0]!.name = "Same"; c.characters[1]!.name = "Same";
    c.characters[0]!.references = [{ id: "bird-ref", code: "BIRD_MASTER", status: "LOCKED" }] as typeof c.characters[0]["references"];
    c.characters[1]!.references = [{ id: "web-ref", code: "WEB_MASTER", status: "LOCKED" }, { id: "unselected", code: "UNSELECTED" }] as typeof c.characters[1]["references"];
    const result = buildCharacterIdentityMap(c, [{ id: "bird-ref", code: "BIRD_MASTER" }, { id: "web-ref", code: "WEB_MASTER" }]);
    expect(result).toContain('"Same" [Character ID: "bird"]; Frame Cast: yes; Supplied reference codes: ["BIRD_MASTER"]');
    expect(result).toContain('"Same" [Character ID: "web"]; Frame Cast: no; Supplied reference codes: ["WEB_MASTER"]');
    expect(result).not.toContain("UNSELECTED");
  });
  it("keeps featureless/minimalist style and canonical constraints", () => {
    const result = main(fixture()); expect(result).toContain("Faces: featureless faces"); expect(result).toContain("flat minimalist style");
    expect(result).toContain("no photorealism"); expect(result).toContain("Character references define exact identity. Do not redesign the character.");
    expect(new PromptBuilder().buildContinuationInstructions(fixture())).toContain("Canonical references are supporting constraints.");
  });
});

describe("continuation and historical safety", () => {
  function continuation() {
    const c = fixture(); c.frame.generationStrategy = "CONTINUE_PREVIOUS_FRAME";
    c.continuityBaseline = { status: "AVAILABLE", frameId: "old", generationId: "selected", storyState: structuredClone(c.storyState), visualBase: { generationId: "selected", filePath: "base.png" } };
    c.previousStoryState = structuredClone(c.storyState); return c;
  }
  it("keeps original JSON with an ID map and compares only selected historical baseline", () => {
    const c = continuation(); const before = JSON.stringify(c.continuityBaseline);
    c.previousStoryState!.props.Key!.holderCharacterId = "WRONG-TARGET";
    c.storyState.props.Key!.holderCharacterId = "bird"; c.frame.action = "Webster hands Key to Birdman.";
    const result = new PromptBuilder().buildContinuationInstructions(c);
    expect(result).toContain(`Current Story State: ${JSON.stringify(c.storyState)}`);
    expect(result).toContain('holderCharacterId: "Webster" [Character ID: "web"] -> "Birdman" [Character ID: "bird"]');
    expect(result).toContain("Action: Webster hands Key to Birdman."); expect(result).not.toContain("WRONG-TARGET");
    expect(result).not.toContain("DECLARED PROP STATE:"); expect(JSON.stringify(c.continuityBaseline)).toBe(before);
  });
  it("marks removed records without inventing physical disappearance or a new holder", () => {
    const c = continuation(); delete c.storyState.props.Key;
    const result = buildPropRecordChanges(c);
    expect(result).toContain('Prop key "Key": record removed'); expect(result).toContain("physical disappearance is not implied");
    expect(result).not.toContain("Holder association:");
  });
  it("does not infer a physical transfer or release from association changes", () => {
    const c = continuation(); c.storyState.props.Key = { location: "table" };
    const result = buildPropRecordChanges(c);
    expect(result).toContain('holderCharacterId: "Webster" [Character ID: "web"] -> not recorded');
    expect(result).toContain('location: not recorded -> "table"');
    expect(result).not.toMatch(/hands Key|places Key|drops Key/);
  });
  it("includes independent prop context for portable exports, with no schema changes", () => {
    const c = continuation(); c.storyState.characters.bird!.heldProps = ["Key"];
    const result = buildPortablePropContext(c);
    expect(result).toContain("CHARACTER IDENTITY MAP:"); expect(result).toContain('Prop key: "Key"'); expect(result).toContain('Recorded heldProps for "Birdman"');
    expect(result).toContain("PROP RECORD CHANGES FROM SELECTED LOCKED GENERATION:");
  });
});
