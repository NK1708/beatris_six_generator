# Architecture

## Domain Layer

`packages/shared` owns public TypeScript contracts and Zod schemas. `packages/core` owns business rules that must stay independent from React, Express, Prisma and Gemini:

- `ReferenceResolver`
- `PromptBuilder`
- generation file naming
- Story State parsing
- lock and canonical mutation rules

## Persistence

Production persistence is per-project. `ProjectDatabaseManager` opens a Prisma client dynamically for the active project's `project.sqlite`.

```text
projects/<slug>/
  project.sqlite
  project.json
  characters/
  locations/
  style/
  frames/
  generations/
```

The optional global `app.sqlite` is only a registry of known project folders. It does not own production entities.

SQLite stores metadata, JSON Story State, generation provenance, status fields and relative file paths. Binary images stay in the project directory.

## Image Providers

The app depends on:

```ts
interface ImageProvider {
  generate(request: GenerationRequest): Promise<GenerationResult>;
  edit(request: EditRequest): Promise<GenerationResult>;
}
```

`GeminiImageProvider` is the first real provider. `MockImageProvider` exists for local tests and demos without an API key. Future Flux/OpenAI providers should implement the same interface.

Gemini SDK calls are isolated inside `GeminiImageProvider`. The current adapter uses `models.generateContent`, sends local references as `inlineData`, and passes image generation settings through `imageConfig`.

## Reference Resolver

For each frame, the resolver selects the minimal current `LOCKED` reference set:

1. Character master
2. Outfit master
3. Location angle view, when the frame selects a specific angle
4. Location canonical reference, when no specific angle is selected
5. Style canonical reference
6. Previous locked frame

`DRAFT`, `APPROVED`, `DEPRECATED` and `REJECTED` assets are not used as production references by default. Missing canonical slots return structured warnings such as `MISSING_CANONICAL_CHARACTER_MASTER` instead of generic 500 errors.

Frame character links take priority over the broader Story State present-character list. Story State remains authoritative for dynamic continuity details such as selected outfit, emotion, hair state, pose, held props and environment facts.

Warnings can be `blocking` or `warning`. Production generation rejects blocking context gaps. Draft generation remains available for rough iteration.

## Reference Lifecycle

Upload always creates a new `DRAFT` version. It never creates canonical state directly.

```text
DRAFT -> APPROVED -> LOCKED -> DEPRECATED
```

`REJECTED` marks unusable versions. Locking a new version happens in one transaction: the old `LOCKED` version in that logical slot becomes `DEPRECATED`, and the selected version becomes `LOCKED`.

Location angles have their own versioned reference library. A location angle `VIEW` reference is not stored as a generic location `ANGLE` slot; it belongs to `LocationAngleReference`, so different camera positions can be versioned, locked and deprecated independently.

## Prompt Builder

The prompt is derived from local state:

- Project
- Frame
- Story State
- Characters and outfits
- Location
- Style profile
- Resolved references
- Geometry

Frames store intent fields such as action, camera, composition and expression. They do not store a giant hand-authored production prompt.

When target Panel geometry differs from provider request geometry, `PromptBuilder` adds a composition safe-area instruction.

## Generation Pipeline

```text
LOCAL PROJECT STATE
  -> REFERENCE RESOLVER
  -> PROMPT BUILDER
  -> IMAGE PROVIDER
  -> GENERATION
  -> HUMAN REVIEW
  -> LOCKED ASSET
  -> LOCAL PROJECT STATE
```

Each generation attempt is appended to history. A generation is not successful until the image is physically written to disk. Locking a frame stores `selectedGenerationId` and changes the frame status to `LOCKED`.

`GenerationGeometryResolver` maps arbitrary target Frame/Panel geometry to supported provider request geometry. Generation provenance stores both target geometry and provider request geometry.

## Benchmark Prep

The initial Gemini consistency benchmark is represented as a deterministic 20-frame plan in `packages/core`. The plan varies pose, camera, continuity pressure and target panel aspect ratio. API/UI seeding requires explicit Character, Outfit, Location, optional LocationAngle and Style selections. It creates the benchmark scene and frames, but does not batch-generate images automatically.

## MVP Boundaries

Phase 1 covers project creation, characters, one outfit path, locations, style profiles, scenes, Story State, frame editor, prompt preview, reference resolution, generation, review and lock. Phase 2 should add richer asset browsing, repair UI, props, multiple characters and cost dashboard.
