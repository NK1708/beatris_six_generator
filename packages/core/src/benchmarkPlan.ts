export interface BenchmarkFrameSpec {
  sequence: number;
  action: string;
  camera: string;
  composition: string;
  expressionNotes: string;
  continuityNotes: string;
  targetWidth: number;
  targetHeight: number;
  tags: string[];
}

export const consistencyBenchmarkSceneName = "Consistency Benchmark";

export function initialConsistencyBenchmarkFrames(): BenchmarkFrameSpec[] {
  return [
    frame(1, "Character enters the recurring location and pauses near the doorway, holding a phone.", "wide establishing shot", "Show the room layout clearly with the character small but readable.", "Alert but controlled.", "Opening benchmark frame. Establish canonical room geometry.", 1600, 700, ["wide", "establishing", "location"]),
    frame(2, "Character takes two steps inward and looks toward the main light source.", "standard landscape medium shot", "Character centered, room architecture still visible.", "Curious, cautious.", "Continue from Frame 1 position without changing outfit or hair.", 1200, 675, ["landscape", "medium"]),
    frame(3, "Character raises the phone and reads an unexpected message.", "near-square close-up", "Face, phone and hands are the priority; background remains consistent.", "Subtle concern.", "Phone appears in the same hand as Frame 1.", 900, 900, ["square", "close-up", "prop"]),
    frame(4, "Character turns into a clean left-facing profile while still holding the phone.", "profile close-up", "Profile silhouette, hair shape and facial identity must remain stable.", "Focused and tense.", "Use the same phone and outfit details.", 800, 1000, ["portrait", "profile", "identity"]),
    frame(5, "Character walks past a key piece of furniture, seen from behind.", "rear three-quarter medium shot", "Back of outfit and hair are visible; room placement is important.", "Unreadable face, purposeful posture.", "Do not invent extra accessories.", 900, 1200, ["portrait", "rear-view", "outfit"]),
    frame(6, "Character sits down and lowers the phone into their lap.", "medium shot", "Hands, phone and seated pose must be clear.", "Worried, inward.", "Direct continuation of movement from Frame 5.", 1200, 800, ["landscape", "pose", "prop"]),
    frame(7, "Character leans forward, elbows near knees, processing the message.", "cinematic wide close medium", "Keep the character in the center safe area for a future crop.", "Quiet shock.", "Maintain exact outfit, hairstyle and room lighting.", 1200, 500, ["cinematic-wide", "crop-risk"]),
    frame(8, "Character stands quickly, phone still in hand.", "low angle medium shot", "Show full torso and part of legs; preserve body proportions.", "Resolved, anxious.", "Movement should feel like a continuation from sitting.", 1000, 760, ["landscape", "low-angle", "motion"]),
    frame(9, "Character reaches toward the door or exit while looking back.", "three-quarter rear shot", "Door/exit placement must remain consistent with earlier frames.", "Hesitant.", "Do not change room architecture.", 1200, 675, ["landscape", "rear-view", "location"]),
    frame(10, "Character stops and looks directly toward camera.", "tight frontal close-up", "Face identity is the whole test; background can be soft but not redesigned.", "Conflicted.", "Hair, apparent age and facial proportions must match canon.", 960, 1100, ["portrait", "close-up", "identity"]),
    frame(11, "Character turns sideways and pockets or lowers the phone.", "medium profile shot", "Hands and phone position are visible.", "Trying to stay calm.", "Phone remains the same prop.", 850, 850, ["square", "profile", "prop"]),
    frame(12, "Character crosses the room from left to right.", "full-body wide shot", "Full body, outfit silhouette and recurring furniture must be visible.", "Determined.", "Keep body proportions and outfit design stable.", 1500, 820, ["landscape", "full-body", "motion"]),
    frame(13, "Character kneels or crouches to inspect something low in the scene.", "high angle medium shot", "Camera looks down; avoid distorting the face and body.", "Searching, tense.", "Architecture and furniture should still match earlier frames.", 1000, 1250, ["portrait", "high-angle", "pose"]),
    frame(14, "Character stands in partial shadow, lit by the established scene light.", "dramatic medium close-up", "Preserve lighting logic while changing mood.", "Uneasy but composed.", "Lighting source must remain consistent with Story State.", 1200, 675, ["landscape", "lighting"]),
    frame(15, "Character holds the phone close to the chest.", "near-square emotional close-up", "Face, hands and phone are inside the central safe area.", "Protective, afraid.", "Do not change phone, hair or outfit.", 1000, 920, ["near-square", "hands", "prop"]),
    frame(16, "Character turns sharply as if hearing a sound off-screen.", "dynamic medium shot", "Motion is visible without blurring identity.", "Startled.", "Do not introduce new people.", 1300, 650, ["wide", "motion", "expression"]),
    frame(17, "Character is seen in a clean right-facing profile.", "profile portrait shot", "Opposite profile from earlier profile frame.", "Listening carefully.", "Compare with earlier profile for identity drift.", 800, 1200, ["portrait", "profile", "identity"]),
    frame(18, "Character steps into foreground while the room recedes behind.", "depth-focused medium shot", "Foreground identity and background architecture both matter.", "Ready to act.", "Same outfit state and hair state.", 1200, 675, ["landscape", "depth"]),
    frame(19, "Character pauses at the threshold, half turned back.", "ultra-wide transition shot", "Keep critical subject inside central composition area.", "Final hesitation.", "Room layout and exit placement must match earlier frames.", 1800, 600, ["ultra-wide", "crop-risk", "location"]),
    frame(20, "Character leaves the frame, with the phone still visible in hand.", "final continuity shot", "Show the exit action clearly; no final screen text.", "Determined, quiet.", "Closing benchmark frame; preserve all canonical traits.", 1200, 675, ["landscape", "sequence-end"])
  ];
}

function frame(
  sequence: number,
  action: string,
  camera: string,
  composition: string,
  expressionNotes: string,
  continuityNotes: string,
  targetWidth: number,
  targetHeight: number,
  tags: string[]
): BenchmarkFrameSpec {
  return { sequence, action, camera, composition, expressionNotes, continuityNotes, targetWidth, targetHeight, tags };
}
