# M5.1 — the Android app: increment plan

*Plan opened 2026-08-31. The milestone `docs/android-port-plan.md` §10 said "deserves its own
increment plan"; this is it. The core is done and proven — this is the part a player touches.*

## 1. What the measurements already decided

M5.0 put the Rust core on a Fairphone 5 and measured **0.400 ms/tick — 2,501 ticks/s, 250×
real time**, against a UI that caps at 16×. The simulation is not the bottleneck and has not
been for some time. **The renderer is the whole performance question**, and this plan has to
be built around that rather than around the sim.

The second measurement is negative and just as load-bearing: **there is no Android SDK and no
KVM in the development container**. Rust compiles and every headless gate runs; Kotlin compiles
only in CI; nothing here can display a frame. So a plan that says "port `src/ui-render.js` to
Compose and check it looks right" is a plan whose verification step does not exist. Whatever is
written in Kotlin is written blind, and only the owner's phone can say whether it is right.

That is not a reason to stop. It is a reason to move as much as possible out of the blind part.

## 2. Two owner decisions (2026-08-31)

1. **A shared frame builder in Rust.** The crate turns world state plus a camera into a
   *display list*; each platform paints it. Chosen over hand-porting the renderer to Kotlin.
2. **Android leads, web follows when cheap.** The native app becomes the living UI. The web
   artifact keeps working and stays the browser option, but new UI work lands on Android first
   and is back-ported only when it is cheap.

Decision 2 is what makes decision 1 more than an aesthetic preference. With two renderers and
both first-class, every future grammar change — a new locus channel, a new affordance — is
written twice; that is the dual maintenance the whole migration exists to end, reappearing one
layer up. With the grammar in the core, only *painting* is written twice, and painting is the
part that genuinely differs between Canvas 2D and Skia.

## 3. Where the line falls: grammar vs painting

Not everything in `src/ui-render.js` belongs in the core. The split is not "expensive vs cheap";
it is **decisions vs strokes**.

**Grammar — moves into the crate.** Every one of these is a measured or owner-decided rule, and
each is a rule the two platforms must not disagree about:

- which sprite bucket an organism draws in — tint by its temperature locus, outline by its
  defense locus, roundness by its feeding/metabolic locus (owner decision, 2026-08-30);
- interpolated toroidal position, screen projection, the cull margin, the LOD threshold, the
  cyst and bacteria-dot special cases;
- the four per-cell pixel fields: mat carpet (including its per-cell mean genotype turn — the
  documented grammar exception), dissolved mineral, corpse pall, wall shade;
- corpse husk radius and alpha; the sun and heat glow geometry; wall polylines, their alpha
  from light transmission and their dash from passability;
- the live census the status strip and the cards read.

**Painting — stays per platform.** Radial gradients, `globalCompositeOperation: "screen"` vs
`BlendMode.SCREEN`, the sprite bitmaps themselves, the loupe, the amber pour rings (UI-clock
animation, not world state), text, and every panel.

The sprite *bitmaps* are worth calling out. They are built once per bucket from parameters the
core supplies (rgb after tint, shape, outline weight, roundness); each platform renders its own
64×64. Two platforms will not produce byte-identical gradient pixels and it does not matter —
what must agree is *which bucket an organism lands in*, which is grammar.

## 4. How this gets verified without a screen

The display list is data, so it can be compared. `src/ui-render.js` is refactored so the
grammar decisions are produced by `frameOf(view)` and the drawing consumes the result; then a
harness runs the same worlds, cameras and zooms through both implementations and compares raw
bits. That gives a real gate on the part that carries the measured decisions.

What stays unverified here: the painting. It is thin, per-platform by design, and the owner's
phone is its test. Saying so plainly is better than implying a green CI means the app looks
right.

## 5. Increments

| # | what | proves |
|---|---|---|
| **A.0** ✅ | The frame builder: `frame.rs` in the crate, `frameOf` in the JS render layer, and the cross-implementation gate | the visual grammar is one definition, and the two agree bit for bit |
| **A.1** | Kotlin shell: SurfaceView render thread, JNI to the frame builder, painter for the display list; a device build that reports ms/frame by zoom and population | the renderer's real budget on hardware — the number M5.0 left open |
| **A.2** | Camera and gestures: pan, pinch, tap-select, long-press; the status strip and the specimen card | the world is navigable |
| **A.3** | Intervene: sun drag and press, mineral pour, feed/kill, the seeding picker, walls — each an event, undoable, impact-carded | the levers, with their provenance intact |
| **A.4** | Data mode: the five pages against the ported `indicators` | the Observatory on the phone |
| **A.5** | Experiments: start screen, prediction step, HUD, verdicts (the level API is already ported) | the ladder is playable |
| **A.6** | Save/load wired to `AtomicFile` (the snapshot format is already ported and proved) | the feature that motivated the port |

`impact()` lands in A.3: it reads the UI's event log, which is why it was deferred out of M3.

## 5a. A.0 — shipped, 2026-08-31

`rust/microcosm-core/src/frame.rs` carries the grammar; `src/ui-render.js` was split along the
line §3 describes, with `frameOf` producing the display list and `paintOrganisms`/`paintCorpses`
consuming it; the sprite bucket table came out of `makeSpriteSet` as `makeGrammar` + `bucketSpec`,
so it can be computed without a canvas.

The display list is eight doubles per organism — kind, sx, sy, r, species, bucket, heading, flags —
and four per corpse. `kind` is what a painter switches on: dormant cyst, bacteria dot-LOD, sprite,
heading-aligned sprite, ghost ray. Four `GRID x GRID` RGBA fields (mat carpet, dissolved mineral,
corpse pall, wall shade) and the world-tile vector lists (sun glows, heat glows, source marks, wall
strokes) come across the same way.

**`harness/fingerprint-frame.js`** runs both implementations over an *evolving* world — with
mutation off every genotype sits at `g0` and every organism lands in the same bucket, which would
let a mistranslated bin table pass unnoticed — at founding, t=600, t=3,000, and again with a second
sun, a cold source and two walls added, across four cameras (including both sides of the LOD
threshold and both wrap seams) and three visibility masks. It prints the bucket table in full, the
field hashes, every glow and wall stroke, and per view the census, the display-list hashes and the
first record of each kind. **Identical, first run**, and it stays identical inside `port:check`.

**`harness/render-smoke.js`** is the weaker check the painting half gets: every painter driven
against a recording canvas stub, required to run and to touch the canvas. It cannot say the frame
looks right — nothing here can — but it catches the dangling reference a blind refactor leaves,
which is the failure mode that actually happens. It runs in `npm test` and in CI.

Two gaps stated rather than papered over. `SHAPES` and `SPRITE_SCALE` are still written in both
languages; they are seven numbers each and the display list carries their consequences (`kind` and
`r`), so the frame gate catches a disagreement — but they are duplication, and if a third such
table appears they should become shared data. And the JS `frameOf` is a second implementation by
design: it is the oracle the gate compares against, and it should be retired in favour of the WASM
frame builder once the browser build is ready to consume it.

## 6. Open, and honestly so

- **The web artifact's `frameOf` is a second implementation until it isn't.** A.0 leaves the JS
  grammar in place as the oracle for the gate. The moment it stops being needed as an oracle,
  the web renderer should consume the WASM frame builder like the phone does, and the
  duplication ends. That is a follow-up, not part of A.0, and it should not be forgotten.
- **Nothing here is a conformance claim.** The frame builder is a pure observer over the world:
  zero PRNG draws, no mutation of dynamic state, exactly like the Observatory. The tick's
  fingerprints must not move, and the conformance ritual applies to every increment.
- **`W.px/py` are UI-managed.** The browser copies positions before stepping, to interpolate
  between ticks. The Android shell needs the same, so the ABI gains `mc_mark_prev()` rather
  than the core doing it silently — which would change what the oracle does.
