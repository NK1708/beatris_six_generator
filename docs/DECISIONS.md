# Bearridge AI Generator — Architecture & Product Decisions

This document records decisions that should not be casually reversed.

---

## ADR-001 — Gemini Is a Renderer, Not Project Memory

Status: ACCEPTED

Decision:

Gemini must not be used as the persistent memory of a VN project.

Every generation request must be reconstructable from local state.

Reason:

Long conversational context is not reliable enough to guarantee visual
continuity across 50–100+ generated Frames.

---

## ADR-002 — Local Project State Is Authoritative

Status: ACCEPTED

Decision:

Project truth is stored locally through:

- project.sqlite;
- project.json;
- Story State;
- canonical references;
- generation provenance;
- local files.

Provider state is non-authoritative.

---

## ADR-003 — Projects Are Self-Contained

Status: ACCEPTED

Decision:

Each VN project has its own project.sqlite and asset directories.

The entire project should be portable by copying its folder.

app.sqlite may contain only registry-level information.

Reason:

Backup, migration and long-term archival must not depend on hidden global
production state.

---

## ADR-004 — References Are Versioned

Status: ACCEPTED

Decision:

Canonical reference slots support multiple immutable historical versions.

Example:

Anna / MASTER
V1 DEPRECATED
V2 LOCKED
V3 DRAFT

Reason:

Changing the visual canon must not destroy the ability to reproduce old
generations.

---

## ADR-005 — Upload Does Not Mean Canonical

Status: ACCEPTED

Decision:

Every newly uploaded or generated reference begins as DRAFT.

Canonical lifecycle:

DRAFT
→ APPROVED
→ LOCKED
→ DEPRECATED

REJECTED is also supported.

Only LOCKED references are selected automatically for production.

---

## ADR-006 — One Active Canonical Version Per Slot

Status: ACCEPTED

Decision:

A logical reference slot can have at most one active LOCKED version.

When a new version becomes LOCKED, the previous LOCKED version becomes
DEPRECATED transactionally.

Historical provenance remains unchanged.

---

## ADR-007 — Historical Provenance Is Immutable

Status: ACCEPTED

Decision:

A Generation stores the exact reference versions, prompt, model and state used
at generation time.

Later changes to canonical project data must never rewrite historical
Generation provenance.

---

## ADR-008 — Reference Resolver Uses Minimal Relevant Context

Status: ACCEPTED

Decision:

Do not send every project asset to Gemini.

ReferenceResolver chooses a minimal relevant set for each Frame.

Current implementation may initially be simple.

Future resolver logic may use camera/orientation/pose/location information.

---

## ADR-009 — Previous Frame Is Secondary

Status: ACCEPTED

Decision:

Previous LOCKED Frame may be sent as a continuity reference.

It has lower authority than canonical character, outfit, location, prop and
style references.

Reason:

Generation mistakes must not recursively become canon.

---

## ADR-010 — Frame, Panel and Screen Are Different Entities

Status: ACCEPTED

Decision:

Frame = individual story image.

Panel = region in which a Frame appears.

Screen = composed VN screen/page containing Panels.

Gemini generates Frames, not complete Screens.

---

## ADR-011 — Panel Geometry Can Be Arbitrary

Status: ACCEPTED

Decision:

Frames/Panels are not globally restricted to 16:9.

Different Frames may target different dimensions and aspect ratios.

Project-level aspect ratio is only a fallback.

---

## ADR-012 — Target Geometry Is Not Provider Geometry

Status: ACCEPTED

Decision:

The final target Panel dimensions are separate from the supported Gemini
generation dimensions.

GenerationGeometryResolver maps:

target geometry
→ supported provider geometry

Future post-processing may crop/resize the result.

---

## ADR-013 — Preserve Safe Composition for Future Cropping

Status: ACCEPTED

Decision:

When provider geometry differs from target geometry, PromptBuilder should tell
the model to keep critical subjects inside a safe composition region.

Geometry provenance records whether cropping is expected.

---

## ADR-014 — Human Review Is Required Before Continuity Use

Status: ACCEPTED

Decision:

Generated images do not become continuity references automatically.

Only LOCKED Frames can automatically be used as previous-frame references.

---

## ADR-015 — Image Provider Must Remain Replaceable

Status: ACCEPTED

Decision:

Domain logic depends on ImageProvider, not directly on Gemini SDK.

Gemini is the current production provider.

Other providers may be introduced later without redesigning project state,
resolver or prompt logic.

---

## ADR-016 — Prompt Is Reconstructed, Not Manually Maintained

Status: ACCEPTED

Decision:

Users provide concise Frame intent.

PromptBuilder reconstructs the complete production prompt from authoritative
project state.

Reason:

Large manually maintained prompts would duplicate state and eventually drift
from the actual project canon.

---

## ADR-017 — Story State Is Explicit

Status: ACCEPTED

Decision:

Important continuity facts must be stored structurally.

Do not rely on visual inference or provider memory for facts such as:

- outfit;
- held props;
- environment state;
- lighting state;
- character presence.

---

## ADR-018 — No Automatic Canon Promotion

Status: ACCEPTED

Decision:

Neither uploaded references nor generated Frames become canonical solely
because generation/upload succeeded.

Canonical status requires an explicit human action.

---

## ADR-019 — Do Not Overbuild Before Benchmark

Status: ACCEPTED

Decision:

Before implementing advanced production features, perform a real Gemini
consistency benchmark of approximately 20 sequential Frames.

Reason:

The benchmark should determine which engineering problems are real rather than
speculatively implementing every possible solution.

---

## ADR-020 — Benchmark Must Include Geometry Variation

Status: ACCEPTED

Decision:

The initial consistency benchmark must not use only one aspect ratio.

It should contain multiple Frame shapes such as:

- wide landscape;
- normal landscape;
- near-square;
- portrait;
- cinematic wide.

Reason:

The actual VN uses differently shaped Panels.

---

## Deferred Decisions

The following are intentionally NOT decided yet:

- whether semantic ReferenceResolver requires AI;
- whether embeddings are useful;
- whether character LoRA will be needed;
- whether Gemini alone is sufficient;
- whether a fallback image provider is necessary;
- exact repair implementation;
- exact crop/editor implementation;
- final Screen layout editor;
- VN engine export format;
- automatic per-Frame Story State transitions.

These decisions should be informed by real production/benchmark results rather
than assumptions.