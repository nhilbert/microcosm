# MICROCOSM — Organism Graphics Plan (GR)

2026-09-02 · from docs/organism-graphics-research.md (§9–§11) and the owner's probe
verdicts. The probe `dev/graphics-probe/stilproben.html` is the design record: what the
texture style, the LOD ladder and the Didinium form should look like was decided there,
by playing it.

## 0. Decisions this plan inherits (all owner, 2026-09-02)

- **Textures are the spine** ("mehr Liebe für die Texturen"); dark
  micrograph continues (assumption flagged in research §11.1 — a veto reopens it).
- **Zoom-dependent representation**: far = surface + points, near = cells, then details.
- **No low poly. No ornament animation.** Motion display stays sim-state-driven only
  (the strike stretch precedent); nothing runs on the UI clock.
- **Venator's model is Didinium nasutum.** The Ghost Ray retires from the app.

## 1. Ground rules

1. **Painting tier only.** GR.1–GR.3 touch no display-list field, no bucket channel, no
   LOD constant in frame.rs. `fingerprint-frame.js` must stay bit-identical — it is the
   proof that these increments were what they claim to be. Anything needing more (an
   organism-id field, per-tile emission) is out of this plan and returns as a declared
   grammar change.
2. **App only.** The browser render layer is the frozen renderer oracle (owner decision
   2026-09-01); it keeps the old look. The visual fork is accepted and recorded.
3. **Budget**: painting stays under ~2× the A.1 baseline `record` cost (1.26–1.84 ms at
   ~2,000 organisms) at the five standard zooms; measured with the existing dev-mode
   telemetry before and after each increment, on the owner's device.
4. **Acceptance** per increment: the Android gates green (layout, boot, German, plus the
   camera where a screen changed), `npm test` untouched-green, and the owner's device
   for the look — no instrument in CI can see beauty (research §11.5).
5. House rules apply unchanged: per-edit verification, instrument before knob (LOD
   thresholds and costs are start values to be measured, not truths), honesty over
   polish.

## 2. Increments

### GR.1 — Venator becomes Didinium (this session)

`Renderer.kt`: the kind-4 painter (`ghostRay`) is replaced by `didinium` — stretched
barrel ~2:1, rod-palisade proboscis (the seizing organ, brighter than the body), two
pectinelle girdles, band macronucleus and toxicyst dots at close zoom. Same glacier blue,
same display-list inputs (heading, strike flag), strike = proboscis-forward stretch; the
existing strike motion line stays (state display, not ornament). Detail tiers gate on the
screen radius in CSS px (girdles ≥ 12, organelles ≥ 32 — probe values, to be tuned on
device). `species-profiles.md` gets the Didinium description and portrait prompt; the
portrait image regeneration is the owner's. Steckbrief strings need no change (they
describe behaviour, not the old shape).

### GR.2 — micrograph bakes (the texture spine)

`Sprites.kt` rebuilt to the probe's body style: membrane distinct from interior, nucleus,
vacuoles; Drifta gel halo and spine-ring at the defense rail; Cilio teardrop with static
fringe, oral groove, cyan food vacuoles; Bacillus rod-cluster in a shared capsule; the
Solara marker stays a dim mat cell. Channels preserved exactly: tint = hue turn as today,
ring = spines/shell, roundness = the feeding dial — proofed at the rails **before**
shipping via a new instrument: `SpriteSheetTest` (Robolectric `@GraphicsMode(NATIVE)`,
like the camera) renders the full bucket grid of every species to
`build/reports/screens/sprites.png`, so the grid can actually be looked at and the
10-second test applied to the extremes. Bake stays 64×64 unless the device says blur;
128×128 is the fallback, memory is not a concern at ~112 bitmaps.

### GR.3 — the zoom ladder and the carpet

`Renderer.kt` + `Layers.kt`: representation follows the screen radius — dot below ~6 CSS
px (extending the bacteria dot-LOD's spirit to all species is a *painter* choice on the
same records), baked sprite in the middle, vector-drawn detail above ~32 CSS px where a
64px blit would blur. The carpet: smooth wash far; **tiled cells near** (vector,
viewport-culled, deterministic layout from the field), which absorbs the open mat
blockiness diagnostic (`Layers.kt:28`) — the 4× prescale experiment concludes here either
way and gets recorded. This is the increment with the two measured questions: vector-tier
cost at mid zoom and carpet cell cost; both against the §1.3 budget, with the recorded
~270-blit layer-composite fix as reserve if the budget is missed.

### GR.4 — alignment and closure

Portrait prompt already updated (GR.1); the owner regenerates `assets/species/venator.jpg`
when convenient (the card hides the slot meanwhile if removed). CLAUDE.md status line,
plan record sections filled with measured numbers, probe retired or kept as bench toy —
owner's call.

## 3. Non-goals (with re-entry conditions)

- **Brightfield/Hellfeld** — rejected by conduct; re-entry: owner asks after seeing the
  probe again.
- **Atmosphere** (motes, vignette, DOF) — fell with "Lebendig"; re-entry: owner asks for
  the water, not the creatures.
- **Clock animation** (cilia phase, flagella, wobble) — rejected; re-entry: a future
  probe round the owner requests.
- **Per-individual variation** — needs an id/seed field in the display list: a declared
  grammar change, both cores, recaptured frame fingerprint. Re-entry: owner wants "no
  two alike" enough to spend it.
- **Browser renderer changes** — frozen oracle; re-entry: the web-consumes-WASM exit.

## 4. Record

- **GR.1 shipped (2026-09-02)**: `didinium()` replaces `ghostRay()` in Renderer.kt —
  same kind-4 dispatch, same inputs (screen position/radius, heading, strike flag), no
  per-frame allocation (one reused RectF), detail tiers at 12/32 CSS px, toxicyst dots a
  fixed pattern (the display list carries no per-organism seed — recorded in §3).
  species-profiles.md Venator section rewritten (Didinium description + portrait prompt;
  "Ghost Ray" reference removed). Gates this session: android-app unit gates run locally
  (see commit); fingerprint-frame untouched by construction (no src/ or rust/ edit).
  Owner look-acceptance pending on device.
