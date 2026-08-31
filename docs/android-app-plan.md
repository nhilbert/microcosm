# M5.1 — the Android app: increment plan

*Plan opened 2026-08-31. The milestone `docs/android-port-plan.md` §10 said "deserves its own
increment plan"; this is it. The core is done and proven — this is the part a player touches.*

## 1. What the measurements already decided

M5.0 put the Rust core on a Fairphone 5 and measured **0.400 ms/tick — 2,501 ticks/s, 250×
real time**, against a UI that caps at 16×. The simulation is not the bottleneck and has not
been for some time. **The renderer is the whole performance question**, and this plan has to
be built around that rather than around the sim.

The second measurement is negative and just as load-bearing: **there is no Android SDK and no
KVM in the development container**, and the egress policy refuses `dl.google.com`, so one cannot
be fetched either — that was tried, not assumed. Rust compiles and every headless gate runs;
Kotlin compiles only in CI; nothing here can display a frame. So a plan that says "port `src/ui-render.js` to
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
| **A.1** ✅ | Kotlin shell: SurfaceView render thread, JNI to the frame builder, painter for the display list; a device build that reports ms/frame by zoom and population | the renderer's real budget on hardware — the number M5.0 left open |
| **A.2** ✅ | Camera and gestures: pan, pinch, tap-select, long-press; the status strip and the specimen card | the world is navigable |
| **A.3** | Intervene: sun drag and press, mineral pour, feed/kill, the seeding picker, walls — each an event, undoable, impact-carded | the levers, with their provenance intact |
| **A.4** ✅ | Data mode: the five pages against the ported `indicators` | the Observatory on the phone |
| **A.5** ✅ | Experiments: start screen, prediction step, HUD, verdicts (the level API is already ported) | the ladder is playable |
| **A.6** ✅ | Save/load wired to `AtomicFile` (the snapshot format is already ported and proved) | the feature that motivated the port |

`impact()` landed with A.3 — see §5h.

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
table appears they should become shared data. (`LOD_Z` was a third: it came out of
`makeWorldLayers` to module scope, and the gate now prints it, so a divergence is caught by name
rather than by consequence.) And the JS `frameOf` is a second implementation by
design: it is the oracle the gate compares against, and it should be retired in favour of the WASM
frame builder once the browser build is ready to consume it.

## 5b. A.1 — shipped, 2026-08-31 (unmeasured until it runs on the phone)

`android-app/` is the app: a `SurfaceView` with its own render thread, painting the core's display
list. Three Android projects now live in the repository under three applicationIds, so none can
break another: `android/` (the WebView wrapper that ships today), `android-native/` (the M5.0
diagnostics probe), `android-app/` (this).

The JNI layer, `rust/microcosm-android/src/app.rs`, is an **adapter over `microcosm_core::wasm`** —
the same C ABI the browser shim drives. The phone and the browser therefore enter the core through
identical entry points, which is what lets `harness/fingerprint-frame.js` stand behind what Kotlin
paints. The display list and the pixel fields cross as **direct ByteBuffers** over the core's own
memory: no copy per frame, no allocation. (This is why the pointer-returning ABI functions now
return `usize` rather than `u32` — identical on wasm32, correct on 64-bit ARM.)

The Kotlin is painting only, and small by design: `Sprites.kt` builds one 64x64 bitmap per bucket
from the core's spec; `Layers.kt` turns the four pixel fields into bitmaps and paints the three
world-tile layers from the glow and wall lists; `Renderer.kt` blits the display list with
`PorterDuff.Mode.SCREEN`, exactly where the browser uses `globalCompositeOperation: "screen"`;
`WorldView.kt` carries the browser's tick loop — accumulate, spend at the chosen speed, cap the
catch-up so a slow frame becomes slow motion rather than a death spiral, interpolate the leftover.

Two details worth recording because they are easy to get silently wrong. Android bitmaps are
premultiplied and the core writes straight RGBA (matching the browser's ImageData), so the fields
are repacked through `setPixels`, which does the conversion — 4,096 pixels a field. And Canvas 2D's
radial gradients have an inner radius that Android's do not, so a stop at fraction `t` of the JS
gradient is remapped to `(2 + 30t)/32`.

**The benchmark is the increment's point.** It pauses, runs the world to t=3,000, then paints 60
frames at each of five zoom levels and reports milliseconds per frame split into the core's frame
builder and the Canvas paint. M5.0 measured the core at 0.400 ms/tick against a UI that capped at
16x; this says what the renderer's real budget is, and which half of the frame spends it.

**Status: written blind, compiled by CI.** `android-app.yml` builds and publishes a rolling
`app-latest` release; the first run was green — Kotlin compiled clean, lint passed, APK built and
published. That is the *only* compiler this code has seen. Whether it *looks* right, and what the numbers
are, only the phone can say.

The first build also caught something worth keeping: `microcosm-core` is `["lib", "cdylib"]`
(the cdylib is what the WASM target needs), and `cargo-ndk` copies every cdylib it finds, so both
APKs were shipping a second, entirely unused copy of the core beside the JNI library that already
links it statically. The build scripts now drop it: the packaged APK fell from 1,333,553 to
989,193 bytes, measured like for like on the two CI artifacts.

## 5c. A.1 on the phone — measured 2026-08-31 (Fairphone 5, 1224x2700)

It renders. The torus tiling repeats correctly, the mat carpet, the plankton glows, the Cilio
triangles, the corpse husks, the cysts, the sun's mark and its glow are all there and look like the
browser's.

```
sim   3000 ticks / 1148 ms = 0.383 ms/tick = 261x real time

 zoom   drawn    core   paint   total   fps
 0.35    1837    0.15   16.52   16.67    60
 0.60    1837    0.13   16.53   16.66    60
 0.90    1837    0.10   16.56   16.66    60
 1.40    1836    0.09   16.56   16.65    60
 2.20    1834    0.09   16.58   16.67    60
```

**What this establishes.** The simulation reads 0.383 ms/tick, 261x real time — corroborating
M5.0's 0.400 ms/tick from the diagnostics probe, now from inside the app on the same phone. The
frame builder costs **0.09–0.16 ms**, under 1% of a 60 Hz frame; it rises as the zoom falls,
because fewer organisms are culled, which is the internal consistency one wants from a new
instrument. And the app holds **a locked 60 fps at ~1,834 organisms at every zoom**, which is the
answer to "can it render the pond": yes, without dropping a frame.

**What it does not establish, and the instrument was at fault.** Every `total` came back at
16.6–16.7 ms — the display's refresh interval, to two decimal places, at every zoom. That is not a
measurement of anything: `unlockCanvasAndPost` blocks until the next vblank, so a frame costing
2 ms and a frame costing 16 ms both read 16.67. The "paint" column was measuring *waiting*. The
paint cost is therefore only bounded above (≤ 16.7 ms) and the headroom is unknown.

Two smaller faults in the same run. The sim timing was written as "run until t=3,000 and time it",
so a second press of the button timed an empty loop and reported 180,072,029x real time. And the
five zoom rows drew 1837, 1837, 1837, 1836, 1834 organisms — this world is clustered around the
sun, so zooming changed sprite size and fill but barely changed the instance count; the sweep did
not vary the load it was meant to vary.

**Fixed in the next build.** The timing splits three ways — `core` (the frame builder), `record`
(CPU time issuing draw commands), `present` (lock + post: GPU flush and the vblank wait, a floor
set by the display rather than a cost) — so work and waiting are separated and headroom is
`16.7 / work`. The sim window is now a fixed 1,000 ticks timed wherever the world has got to. And
targetSdk 35 draws edge to edge on Android 15, which is why the HUD sat under the clock and the
buttons under the gesture pill; the insets are applied now.

### A.1's answer, with the instrument fixed (Fairphone 5, 1224x2700, 2,049 organisms)

```
sim: 1000 ticks in 496 ms = 0.496 ms/tick (201x real time)

 zoom  drawn    core  record present   work
 0.35   2049    0.13    1.70   14.78   1.84
 0.60   2049    0.10    1.37   15.19   1.47
 0.90   2049    0.09    1.62   14.96   1.70
 1.40   2047    0.09    1.18   15.39   1.26
 2.20   2043    0.09    1.17   15.40   1.26
```

**The renderer costs 1.26–1.84 ms a frame — 8–11% of a 60 Hz frame, about 9x headroom.** The frame
builder is 0.09–0.13 ms of that; the rest is Kotlin issuing draw commands. `present` is the vblank
wait and sums with `work` to 16.6 ms, as it must.

The sim now reads 0.496 ms/tick (201x) rather than the earlier 0.383 (261x), and the lower number
is the honest one: the fixed window times ticks 3,000–4,000 at 2,049 organisms, where the old
"run until t=3,000" timed a world that starts nearly empty.

`record` is not monotonic in zoom, and the two bumps are explicable rather than noise. z=0.35 is
the most expensive (1.70) because the torus tiling covers the viewport with roughly 45 world tiles,
each blitting up to six layers — the layers, not the organisms, dominate at low zoom. z=0.90 (1.62)
is the first row at or above `LOD_Z`, where corpses stop being the aggregate pall and become
individual husks, two circles each. **Deferred optimisation, recorded not taken:** compose the six
layers into one tile bitmap per tick and blit that once per tile, turning ~270 blits into ~45.
Nothing needs it at 9x headroom.

**Still open: the mat carpet renders as hard squares** where the browser smooths it, and setting
`isFilterBitmap` on the Paint did not change it. Rather than guess a third time at why the hardware
canvas will not filter a 16x upscale, the fields are now prescaled 4x on a software canvas, where
filtering is not in doubt (~262k pixels per tick, measured as a `fields` row in the benchmark).
That is a fix if the hardware path was the problem and a disproof if it was not: if the blocks are
unchanged in the next screenshot, they were never the carpet.

## 5d. A.2 — shipped, 2026-08-31

Pan by dragging, pinch to zoom (0.25x–6x), tap to select. The tap is queued rather than handled
where it lands: the core is single-threaded and lives on the render thread, so a selection that
reached into it from the UI thread would be a race waiting for a busy frame. Everything the shell
displays — the census, the specimen card — is built on the render thread and published as a string.

**Selection became grammar, and the gate covers it.** Which organism a thumb lands on is a decision
— the radius (`max(24/z, 14)` loose, `max(10/z, 7)` tight) and the nearest-first tie-breaking —
and the two platforms must not disagree about it. So `pick` moved into `frame.rs`, the browser's
inline hit test in `ui.jsx` was replaced by a call to the same `pickCandidates` in `ui-render.js`,
and `harness/fingerprint-frame.js` now compares candidate counts and the winning slot across three
zooms, both radii and four world points. Identical. Ties keep slot order on both sides, because
`Array.prototype.sort` and `sort_by` are both stable.

**Names are read, never retyped.** The species names and the locus words (label, high word, low
word) come out of the trait rows through the ABI, so the card says "a tougher line" in the same
words the Observatory narrates with. Same for the status strip's colours (the core's bucket table)
and for which species are in play (`speciesFlag`) — a shell that kept its own list of live species
would be a table to forget to update.

The status strip's chips toggle the same `hidden` bitmask the frame builder culls with, so hiding a
species costs nothing extra: the display list simply stops carrying it, and the census still counts
it.

Not ported: the browser's species *chips* when several species sit under one thumb. Nearest wins
here. That ambiguity affordance is UI, and it is recorded rather than quietly dropped.

## 5e. A.3 — the levers, 2026-08-31

Intervene mode: a tap on open water pours mineral, a tap near a sun grips it (and a drag then moves
it), a long-press seeds the species chosen from the picker, feed and kill act on the selection, the
wall tool arms once and the next drag draws a stroke. Amber appears only in Intervene and only on
the hand's own marks — pour rings, the sun rings, the wall preview — never on the world.

**Undo moved into the core, and that is the interesting part.** The browser inverts a lever by
sending an explicit inverse event carrying a payload its `done` callback captured — `unfeed{delta}`,
`revive{snap}`, `unspawnPack{snap}`, `unfertilize{snap}`. That is exactly why the undo events were
left out of M3: marshalling a snapshot out to Kotlin and back would be a *second representation of
world state*, and avoiding a second representation of anything is the whole point of this port. So
`events.rs` keeps a one-slot `Undo` — one slot, because the browser offers a single five-second
chip and nothing deeper — captured where the lever lands and applied by `mc_undo()`.

Two mechanisms, one arithmetic, so **`harness/fingerprint-undo.js`** drives each lever on both
cores, inverts it each core's own way, runs on 300 ticks, and compares the whole world as raw bits —
positions, energies, the fields, and the PRNG's own state. Ten inverses: fertilize, lightMul,
spawnPack, feed, kill, sourceAdd, sourceSet, source-moved, wallAdd, wallSet. **Identical.** That
includes the awkward one: `revive` reclaims the corpse's mineral, tops up from the water, and
spends a heading draw in `spawn` — get any of the three wrong and the world stays plausible while
the bits diverge. A self-check also proves a second undo does nothing, so the slot is really one
deep. The gate runs inside `port:check`.

Not ported yet, recorded rather than dropped: the Evolution panel (mutation on/off, per-locus rates
and curvature, the price sliders and presets). Its events — `mutation`, `locus` — are in the ABI
already; it needs the panel, and it belongs with the Data pages' chrome rather than with the levers.

## 5f. A.4 — Data mode, 2026-08-31

Five pages: Populations on a log axis, Chemistry as a stacked area whose bright top edge only moves
when the hand adds matter, Metabolism with recycling on its own scale, Health against the measured
reference ranges, and the Events feed. The scales and the stacking order are the browser's.

**Nothing reads the core from the UI thread.** `indicators()` recomputes as it goes and the event
feed walks the ring, so both genuinely mutate a `&mut Sim`; reading them from the UI thread while a
tick ran would be a data race, not a stale number. So the render thread produces everything —
fourteen channels copied out of the recorder ring, the vitals and the feed rendered to text — four
times a second, and only while the panel is open. Fourteen channels × 900 samples is 50 KB; the
cost of copying it is not worth the cost of thinking about the race.

Deferred and recorded: the Traits page (per-locus ribbons and histograms), the amber intervention
markers on the charts (they need the UI's own intervention log, which arrives with `impact()`), and
scrubbing.

## 5g. A.5 and A.6 — the ladder, and the saved world, 2026-08-31

**A.5.** The experiments are a list, every one open, none gated behind another — the browser's rule.
Choosing one shows its question, its briefing and its goal; then the prediction step, which is
committed before the run and contrasted after, never graded. The objective chip lives in the top
stack's flow rather than over the world, so it can grow to as many lines as it needs without
covering anything. The verdict card carries the debrief, the fail reason in the level's own words,
and — when a prediction was made — what the player said and the reflection for it.

The apparatus gates are real: `levelAllows` decides whether a tap grips a sun or seeds a species,
and `levelPourOk`/`levelNotePour` spend the level's mineral budget. The runtime is the core's, so
the verdicts are the same ones `harness/levels.js` proves identical on both cores, and they are
counted in recorder samples — the same at any speed.

The level *table* is parsed from the JSON the core hands over, which is the same bytes
`src/observatory/levels.json` carries. The shell reads player text and meter labels out of it; every
predicate is the core's.

**A.6.** `AtomicFile` writes to a shadow and renames, so a world half-written is a world not
written and the previous save survives a crash mid-write. The snapshot format is `snapshot.rs`'s,
proved by resumption since M3 — this only moves the bytes, and the save and the load both happen on
the render thread, because a snapshot taken mid-tick would be a torn world and the tick is there.
A bad file is refused rather than half-loaded, which the snapshot gate already covers.

One slot for now. Naming saves is chrome; the format carries its own version.

## 5h. `impact()` — ported and gated, 2026-08-31

The last piece of the Observatory, and the one it was worth being careful with. `impact()` is the
honesty machinery: an interrupted time series that fits the fifteen samples before a lever as a
trend, extrapolates it (clamped at fifteen samples — never trust a trend further than it was
observed), and credits the lever only with the *departure* from it, so a lever pulled during a
decline is not credited with the decline. The natural-variability floors were measured, not chosen:
12% for the mat and 170% for the plankton, because mats barely move on their own while blooms go
2.5x unprovoked. Every one of those numbers is a Phase 4 calibration fight, and a port that gets one
wrong does not crash — it quietly narrates a different world.

It was deferred out of M3 because it reads the UI's own intervention log, and the core cannot tell a
player's hand from a script. So the core keeps `iv_log` and the shell appends to it through
`ivPush`, which is the same shape the undo slot took: the *decision* stays with the shell, the
*arithmetic* moves into the core.

**`harness/fingerprint-impact.js`** drives a run with several hands in it — a pulse alone, a press,
a pulse under that press's backdrop, two pulses close enough that neither can claim sole credit, and
one so old it has rolled off the ring — and compares the two implementations' cards as raw bits:
status, press flag, completeness, mixed, backdrop, recovery, and every mover's channel, percentage
and strength. **Identical**, on all seven branches. It runs inside `port:check`, which now compares
six things.

The Events page shows each intervention with its card, in the browser's own wording: "Since", never
"because"; "could be a natural swing" under the noise floor; "attribution weak" under a press.

## 5i. What A.0–A.6 add up to

The app runs the world, navigates it, intervenes in it with undo and impact cards, shows the
Observatory's pages, plays the experiment ladder, and saves. Six increments, each compiled by CI
and none of them seen on a screen by their author.

**What the core carries now, and what Kotlin carries.** Everything that *decides* is in the crate
and is gate-compared against the frozen JavaScript: the tick, the observatory, the levels, the
visual grammar, selection, the undo inverses, the impact cards. `port:check` compares six things
and all six are identical. Kotlin holds strokes and chrome — bitmaps, blend modes, buttons — and
one rule it must keep: nothing in the render layer may decide anything about the *world*.

**What is not done**, listed rather than implied by silence:

- the **Evolution panel** (mutation on/off, per-locus rate and curvature, the price sliders, the
  presets). Its events are in the ABI; it needs the panel;
- the **Traits page**, the **amber intervention markers** on the charts, and **scrubbing**;
- the browser's **species chips** when several species sit under one thumb — nearest wins here;
- the **loupe**, and the **follow-cam** that eases toward a selected organism;
- **naming saves** — one slot for now, though the format is versioned;
- the **start screen** as a screen: experiments are a list behind a button, not a front door.

None of it is load-bearing for the milestone's question — can the native app run this world, with
its levers and its honesty intact? It can.

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
- **The mat carpet's blockiness is unresolved.** Setting `isFilterBitmap` did not change it, so
  the fields are now prescaled 4x on a software canvas where filtering is not in doubt. If the
  next screenshot is still blocky, those blocks were never the carpet and the search moves — and
  that would be worth knowing, because it would mean something else is being drawn at cell size.
- **Nothing in the app has been seen running by its author.** Every increment compiled in CI and
  every gate that can run headlessly is green, but CI cannot say whether a panel overlaps, a
  gesture fights the camera, or a colour reads wrong. That is the standing gap of this milestone
  and it closes only on the owner's phone.
