import { storyStateSchema, type StoryStateDocument } from "@bearridge/shared";

export function parseStoryState(input: unknown): StoryStateDocument {
  return storyStateSchema.parse(input);
}

export function createEmptyStoryState(sceneId: string): StoryStateDocument {
  return {
    sceneId,
    time: { description: "" },
    environment: {},
    characters: {},
    props: {},
    storyFacts: []
  };
}
