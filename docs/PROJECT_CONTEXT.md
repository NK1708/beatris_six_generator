# Bearridge AI Generator — Project Context

## Product Vision

Bearridge AI Generator is a production environment for creating visual assets
for a visual novel using generative image models.

The application exists because generating one attractive image is relatively
easy, while generating dozens or hundreds of images that all belong to the same
visual world is difficult.

The core problem is visual continuity.

A finished project may contain 50–100+ unique AI-generated story frames and
potentially many more reusable visual assets.

Across those frames, the system must preserve:

- character identity;
- facial structure;
- apparent age;
- body proportions;
- hairstyles;
- clothing;
- accessories;
- recurring props;
- architecture;
- furniture;
- spatial relationships;
- visual style;
- lighting logic;
- scene state.

---

## Important Product Clarification

The AI does NOT generate an entire final visual-novel screen.

A final Screen may contain several differently shaped image Panels.

Example:

SCREEN 017
├── PANEL A → FRAME 041
├── PANEL B → FRAME 042
├── PANEL C → FRAME 043
└── PANEL D → FRAME 044

Each Frame is generated independently.

The final Screen may later combine those Frames with:

- panel layout;
- borders;
- text;
- other UI/presentation elements.

Text is outside the current image-generation pipeline.

---

## Why AI Memory Is Not Enough

The project previously encountered a fundamental problem:

AI image generation could produce individually good images but could not
reliably preserve project context across a long sequence.

Depending on conversational memory is not acceptable for production.

A model may gradually change:

- a face;
- hair length;
- clothing details;
- furniture;
- room geometry;
- props;
- lighting;
- drawing style.

Therefore project memory is implemented explicitly by the application.

Gemini receives the context it needs for the current Frame, but the application
decides what that context is.

---

## Fundamental Strategy

Consistency is enforced through:

1. canonical references;
2. reference versioning;
3. structured Story State;
4. deterministic reference resolution;
5. structured production prompts;
6. previous approved Frame continuity;
7. human QC;
8. immutable generation provenance.

The model is a renderer inside this system.

---

## Canonical Character Model

A character is not represented by one arbitrary picture forever.

The long-term model should support canonical reference slots such as:

Character
├── MASTER
├── FRONT
├── THREE_QUARTER_LEFT
├── THREE_QUARTER_RIGHT
├── PROFILE_LEFT
├── PROFILE_RIGHT
├── FULL_BODY_FRONT
├── FULL_BODY_SIDE
├── FULL_BODY_BACK
├── EXPRESSIONS
└── OUTFITS

Each logical slot can have multiple versions.

Example:

Anna / MASTER
├── V1 DEPRECATED
├── V2 LOCKED
└── V3 DRAFT

Only V2 is currently canonical.

---

## Outfits

Outfits belong to Characters.

Example:

Anna
└── Outfits
    ├── Home
    ├── Casual
    └── Formal

An outfit can eventually have:

- MASTER;
- FRONT;
- SIDE;
- BACK;
- DETAIL.

This allows clothing continuity to be maintained separately from identity.

---

## Locations

Locations should eventually support multiple canonical views.

Example:

Bedroom
├── MASTER
├── FLOOR PLAN
├── FROM_DOOR
├── TOWARD_WINDOW
├── BED_SIDE
└── DETAILS

The goal is not merely to make the room look stylistically similar.

Important architecture and furniture placement should remain coherent.

Location-angle reference versioning is expected to become important before
large-scale production.

---

## Style

Style is also explicit project data.

StyleProfile may describe:

- linework;
- anatomy treatment;
- facial rendering;
- shading;
- palette;
- background detail;
- lighting;
- camera language;
- negative rules.

Style may also have canonical image references.

---

## Story State

Story State tracks facts that cannot safely be inferred from images.

Example:

Scene 014

Time:
02:17

Anna:
present = true
outfit = HOME_03
hair = loose
jacket = removed
holding = phone
position = bed

Bedroom:
mainLight = off
bedsideLamp = on
curtains = closed
window = closed

These facts should influence every relevant generation request.

Long term, Story State may evolve between Frames.

For example:

Frame 10:
jacket = worn

Frame 11:
character removes jacket

Frame 12:
jacket = removed

This is a future evolution of the current scene-level state model.

---

## Previous Frame Continuity

A previous LOCKED Frame is useful because it contains immediate visual context.

It may help preserve:

- pose progression;
- camera continuity;
- object positions;
- immediate action;
- lighting continuity.

However, it is NOT canonical.

If the previous generated image accidentally contains the wrong hairstyle and
the canonical character reference contains the correct hairstyle, the
canonical reference wins.

This rule prevents visual errors from recursively propagating through a long
sequence.

---

## Frame Geometry

Frames can have very different shapes.

Examples:

- wide establishing panel;
- standard landscape panel;
- near-square close-up;
- portrait panel;
- unusually wide cinematic panel.

The desired final Panel geometry is stored separately from the geometry
supported by Gemini.

Example:

Target Panel:
1200 × 500
ratio 2.40:1

Gemini may generate:
a nearby supported landscape ratio

The application records that a crop will later be required.

Important subjects should therefore remain inside a safe composition region
when the generation ratio differs from the target ratio.

---

## Human-in-the-loop Production

The intended workflow is deliberately not fully automatic.

A human remains responsible for deciding whether a generated image is
acceptable.

Typical workflow:

Frame intent
↓
Resolve context
↓
Build prompt
↓
Generate
↓
Compare with canon
↓
QC
↓
Regenerate / repair if necessary
↓
LOCK

Only then does the image become part of continuity.

---

## Future Repair Workflow

A future important capability is targeted repair.

Example:

A generated image is correct except that the phone is wrong.

Instead of regenerating the entire composition, the desired future workflow is:

Generation G007
↓
Repair request:
"Change only the phone to match canonical reference."
↓
Generation G008

The new generation keeps G007 as its parent.

Repair is intentionally not part of the current benchmark stage.

---

## First Real Benchmark

Before expanding the product further, the system must pass a real Gemini
consistency test.

Setup:

- 1 character;
- 1 outfit;
- 1 recurring location;
- 1 style;
- approximately 20 sequential Frames.

The sequence should deliberately vary:

- pose;
- camera distance;
- camera angle;
- character orientation;
- expression;
- position inside the location;
- panel aspect ratio.

It should include:

- close-ups;
- medium shots;
- full-body shots;
- profile;
- rear view;
- movement;
- interaction with a prop;
- changes in clothing state.

We want to measure how often Gemini produces an acceptable result on the first
generation and which continuity dimensions fail most often.

---

## What Success Means

Success does NOT mean:

"Every Gemini generation is perfect."

Success means:

"The application makes visual continuity controllable, inspectable and
recoverable enough to produce a long visual novel efficiently."

If the benchmark shows systematic weaknesses, the architecture should allow us
to improve the relevant layer:

- references;
- resolver;
- prompt;
- geometry;
- QC;
- repair;
- provider.

without redesigning the entire project.