# U.2 — the app's design phase

**Status: PLANNED (2026-09-01). Prerequisites all in hand:** the U.0 repairs shipped and verified
on the owner's device; the five-lens research (`app-ux-research.md`); the lever-outrun study
(`lever-outrun-study.md`); three screen gates in CI (layout at a zero baseline, boot, gesture).
U.3 — the owner plays it — closes the phase, and nothing here is settled until it does.

This is a *structure and behaviour* phase. The world's visual grammar is settled, shared and
gate-proved (`frame.rs`); the sim is untouched; the shell is what gets designed.

---

## 1. What the measurements already decided

Constraints this plan inherits rather than argues:

1. **No arming-friction anywhere.** The outrun study convicted no lever on irreversibility —
   undone within a minute, everything tested is indistinguishable from chaos, and nothing undone
   ever cost a core species. The redesign therefore ships ZERO confirmation taps beyond the two
   that exist (reset's confirm-tap, the wall's arm-once), and the undo chip is promoted, not
   guarded. A calmer design than the research alone would have produced.
2. **A changed sun must be impossible to miss.** The one conviction: the intensity press left
   standing five minutes. The failure mode is *unnoticed persistent state*, so the answer is a
   visible badge while the sun differs from its founding state — not a harder-to-touch sun.
3. **One always-visible line** (research L2); everything else earns its place by being asked for.
   The browser's three-detent sheet is the validated in-house mechanism and Material's own
   recommendation.
4. **Interactive controls live in the thumb zone** (research L3): the species chips — interactive,
   at the very top of a 2,700 px screen — are the reach inversion to fix. The passive specimen
   card may stay low.
5. **The front door is the start screen** (owner, 2026-09-01): Sandbox | Experiments, every level
   open, none gated.
6. Amber stays the hand's colour, exclusively; telemetry stays dev-mode; 48 dp targets everywhere
   (the chips' ~2 dp padding dies in this phase).

## 2. Pre-declared decisions

**D1 — dependency-free, still.** The A.1 rule (plain Views, no libraries) collides with research
L3's "take the platform's widgets": Material's `BottomSheetBehavior` and `ViewPager2` would each
pull in AndroidX/Material and an AppCompat theme migration. **Decision: stay dependency-free for
U.2.** The three-detent sheet is ~150 lines this project has already designed once (browser,
validated); `SwipePanel` already carries the pager gesture; and the boot/layout/gesture gates keep
hand-rolled widgets honest in a way they cannot keep a library's internals. Revisit only if the
sheet fights us — recorded as the re-entry condition.

**D2 — the one line.** Candidates the research left open: tick, census, nearest-band vital,
objective. **Decision: the census (with the world's clock), replaced by the objective + meters
while an experiment runs.** The vital-nearest-its-band idea is deferred: it needs the strain
warm-up (t ≥ 1,200) and a per-vital salience rule nobody has designed — a U.4 candidate, not a
line-one default.

**D3 — species chips become display + sheet.** The top strip becomes *passive* census text (part
of the one line, unreachable-zone-appropriate); the hide/show toggle — a real but niche affordance
— moves into the sheet's half detent at 48 dp. Nothing is lost; the tap moves to where thumbs are.

## 3. The increments

Each lands separately, gates green after every one (layout baseline stays at zero — new chrome
must fit where it ships), camera screenshots per increment, boot-gate coverage extended alongside
the code it tests. Order chosen so each step leaves the app strictly better if the phase stops.

- **U2.0 — the start screen.** Launch lands on Sandbox | Experiments (continue-autosave under
  Sandbox when one exists). The experiment list becomes a real screen, not an `AlertDialog`
  behind a bar button; briefing and prediction keep their flow. `exp` leaves the bar. Cut line:
  none — this is the owner-decided front door and ships first.
- **U2.S — the shell's design language** (added 2026-09-01 after the owner's verdict on U2.0's
  look: "everything looks like a 2000 webpage" — accurate, and until now unowned: the research
  explicitly excluded the shell's visual grammar and no phase had claimed it). The shell today
  wears two defaults — bare framework buttons on the stock theme, and monospace as the voice of
  everything rather than of numbers. Defined once, before the sheet ships gray: a type scale
  (a proper UI face for words; monospace kept for numbers, census, meters), buttons/chips/rows
  drawn by us — `Chrome.button` is already the single birthplace of every button, so one factory
  restyles the whole shell — a spacing system, and a palette derived from what the world already
  owns (abyss ground, slate text, species colours, amber the hand, rule 7 untouched). Every
  later increment ships styled; nothing gets built gray and repainted. Dependency-free holds:
  the pond itself is the proof that hand-drawn and beautiful coexist. Caveat recorded:
  Robolectric's camera shows the shapes, not the device's font rendering — the owner's phone
  stays the judge of taste.
- **U2.1 — the bottom sheet, three detents.** Hand-rolled (D1): peek / half / full, drag handle
  48 dp, detail level follows detent as the browser's did. Peek carries the one line's overflow
  (undo chip, the mode SWITCH — owner, from the mockups: a switch, not a segmented pair; the
  segmented version overflowed 390 dp); half carries the controls that today live in the
  scrolling bar plus the species toggles (D3); full carries the specimen card's long form and
  the Data entry. The scrolling bar — U0.1's honest stopgap — retires here.
  **The intervention flow (owner's question at the mockups, decided there): the half sheet is
  the tool chest, not the workbench.** Choosing a lever arms it AND lowers the sheet to peek;
  the act — tap, drag, long-press — happens on the open water with the armed tool riding the
  peek row in amber; done or cancelled, the arm clears. The sheet never covers the pond while
  the hand is working. This generalizes the wall tool's arm-once pattern to every lever's
  *placement* step without adding arming friction to any lever's *decision* (the outrun rule
  holds). Boot gate learns detent gestures and the arm-lowers-sheet flow.
- **U2.2 — the one line** (D2). Top of screen: passive, one line, census + clock; objective +
  meters during a level. Everything else that lived in the top stack moves into the sheet or
  Data. The top of the screen stops being interactive entirely.
- **U2.3 — the changed-sun badge.** While any source differs from its founding intensity/position,
  a persistent amber-edged badge names the standing change ("sun dimmed −0.3"); tapping it opens
  the sun card with the restore path. Amber because the standing change IS the player's hand,
  still pressing. This is the outrun study's one conviction, answered.
- **U2.4 — Data as tabs.** The page buttons become a real tab strip with a selected indicator
  sharing `SwipePanel`'s gesture; Data opens from the sheet's full detent. Reachability on the
  small-phone profile gated as ever.
- **U2.5 — back stack + predictive back.** Back navigates the sheet down (full → half → peek)
  before closing overlays, then leaves. The U0.5 handler grows into an ordered stack; predictive
  back animation deferred until an AndroidX decision (D1's re-entry condition) — recorded, not
  smuggled.
- **U2.6 — the strings gate.** `harness/prose.js` extended to the app's own strings (buttons,
  cards, badges, dialogs) — review §6's third gate. The precedent says the instrument will convict
  more than a manual read; budget for rewrites in the same increment.

**Cut lines.** U2.0–U2.3 are the phase's core and answer every measured finding; U2.4–U2.6 are
each independently deferrable without stranding the others. If the phase must stop early, it stops
after U2.3 with a coherent app.

## 4. What U.2 deliberately does not do

No world-screen tabs (research §8 left it open; nothing measured demands it). No contextual/radial
menus (the sources themselves concede the form breaks past eight levers). No per-vital line-one
salience (D2). No renderer or frame-gate changes. No new levers.

## 5. Acceptance

Per increment: `gradle -p android-app testReleaseUnitTest` (layout + boot + gesture gates), camera
PNGs eyeballed, `npm test` untouched-world proof. Phase acceptance is **U.3: the owner plays it**
— specifically: reach every feature one-handed on the Fairphone 5, grip and move the sun on
purpose and never by accident, notice a dimmed sun within a minute without being told, and find
nothing behind more taps than it is worth. Those are the review's five complaints, inverted into
a checklist.

## 6. DE — the German translation (shipped 2026-09-01, owner request)

One increment, three mechanisms, one constraint that shaped all of them: **the core's English
is certified, gated behavior** — narration is asserted by the K6 and heat gates, the level text
lives inside the hashed core, the trait words are the crate's own rows. So nothing in the core
changed; the translation is a display layer, and a sentence the layer does not know is shown in
English rather than paraphrased (untranslated is a gap; a guessed translation would lie about
what the Observatory said).

1. **Chrome** — ordinary Android localization. Every player literal moved to
   `res/values/strings.xml` (+ arrays for the intervention labels, undo chip, page titles) with
   `res/values-de/` carrying du-form German. `Chrome.kt` keeps its English inventory keys — the
   layout gate, boot gate and baseline key on them, and CI measures under the English locale —
   while `Chrome.label()` maps a key to its face; `dialRowState` now reads the row's tag instead
   of its display text, which the translation would have broken silently.
2. **The core's words** — `L10n.kt` + `res/values/narration.xml`: 19 full-match regexes over the
   observatory's templates, one German template each ({n} verbatim, {wn}/{ln} through the trait
   vocabulary: 9 locus labels, 18 pole words, the 2 non-species impact channels). Species names
   stay. Applied at display in `WorldView` (events feed, level narration, impact movers,
   specimen loci).
3. **The levels** — `assets/levels.de.json`, all six levels' player text plus a `whys` map for
   the fail reasons, merged over the core's JSON in `Levels.kt` when the locale is German. The
   core keeps judging over its English table, so verdicts are identical in every language.

Instruments, because a translation rots silently: `harness/prose-app.js` now parses the XML and
the overlay — English rules on `values/`, German rules on `values-de/` and the overlay (sentence
cap and a German banned list including rule 6's „weil"; FK skipped — its constants are
English-calibrated), key parity both directions, array-length parity, and overlay completeness
against `src/observatory/levels.json`. Negative-tested before trusting its first PASS (banned
word, missing key, missing why, 21-word sentence — all convicted). `GermanTest.kt` runs the
display layer on the JVM: every one of the 19 narration templates fed a core-shaped sentence and
required to come back German — the test that fires when a core template changes and the German
falls behind. It shares the boot gate's exact Robolectric sandbox signature (sdk + GraphicsMode)
because the JVM allows the JNI core in only one classloader; the locale is switched at runtime.

Wording decisions on record: impact cards say „Seitdem:" (rule 6's German — temporal, never
causal); "population" is „Bestand", "specimen" is „Lebewesen"; pole words are quotable nominals
(„zäher", „bleiben"/„weiterziehen") because German inflection would otherwise mangle the sweep
sentences. Known gap, accepted: the health/benchmark developer surfaces stay English (dev-mode
only), and number formatting follows the locale (German decimal comma) — display only.

## 7. The screen-lock loss (owner report, 2026-09-01 — root cause + fix)

"When my screen locks, all data is lost, no save." Two faults, and the second hid the first:

1. **Every unlock re-founded the world.** A lock destroys the SurfaceView surface; an unlock
   creates a new one and starts a new render thread — and `WorldView.run()` began with
   `resetWorld(); initWorld(11)` unconditionally. The pond was reset by the unlock itself, no
   process death required. `bootWorld` (the autosave) had been consumed at first boot, so there
   was nothing to restore either.
2. **The autosave lost the teardown race.** `onPause` queues the save onto the render thread's
   command queue — the very thread the surface teardown joins and kills. The loop exits without
   draining, so on a lock the save usually never ran, and the file on disk stayed stale.

Why the earlier device test said "autosave works": kill-and-relaunch goes through `onCreate`,
which re-reads the autosave file — that path was real. Lock/unlock never touches `onCreate`.

The fix mirrors what the core already is — a process-wide singleton: founding happens once per
process (`coreFounded`), every later surface resumes drawing the world that is already alive,
and a stale `bootWorld` is never loaded over it. `surfaceDestroyed` drains the command queue
after the join — at that point the caller is the core's sole owner, the same handover the boot
gate has always leaned on — so the pause-time save executes even when the teardown wins.

The gate: `theScreenLockKeepsTheWorld` locks and unlocks the real view. The unlock happens
paused, which makes the verdict deterministic — a kept world publishes exactly the tick it
locked at, a re-founded one publishes 0 (at speed, a re-founding could tick back past the mark
and slip through). Negative-tested against the pre-fix code: "unlock re-founded the world
(t 0, expected t 41)". A recorded side effect: a lock mid-experiment no longer loses the run —
the world persists in memory; levels are still never autosaved to disk, by the U0.6 decision.

## 8. U2.R3 — the owner's round 3 (played in German, 2026-09-01)

Five notes from the device, each traced before repair:

1. **„Speichern" overflowed its button** — and the instrument's silence was the bigger finding.
   Two gate gaps compounded: the layout gate measured rows at device width while the utility row
   ships inside the drawer's 260 dp, and it ran without GraphicsMode NATIVE, under which
   Robolectric's legacy text metrics measure labels near zero wide — so a button whose label
   overflows measured as fitting. Both fixed (drawer rows measure at `Chrome.DRAWER_DP` inner
   width, declared once and used by the app and the gate; NATIVE metrics), and the honest gate
   then convicted the old 1×4 row in BOTH languages — English had been squeezed on the owner's
   phone all along (reset 177 px laid, 214 wanted). The repair is a 2×2 grid, which stops
   fitting from depending on the language. Every profile now runs twice, EN and DE.
2. **The undo chip never vanished.** It is an offer, not a monument: it now leaves after
   the intervention it names stops being fresh (the outrun study's ground — undo within a
   minute is a time machine; past that the world has moved on). Interventions restored from a
   save are history, not fresh, and get no chip. The window shipped at 45 s and was cut to
   10 s on 2026-09-03 (§14).
3. **The seed picker was a bare name list.** Each row now wears the species' own colour from
   the core's bucket table — the world's palette, never a second one.
4. **Feed/kill were selection errands, redundant with the specimen sheet.** They are now armed
   touch tools: armed, a tap or a throttled drag feeds or erases what is under the finger
   (eraser semantics, the owner's words); the sheet keeps per-individual feed/kill, now
   localized. No dial tool needs a selection any more, and arming deselects.
5. **The specimen sheet collected overlaps** — dial rows, undo chip and hints all landed on it.
   The floating chrome now lifts above an open sheet (fabs, dial, centre chips), and the
   deselect-on-arm rule removes the main way the collision arose.

Gates: `theArmedToolTouchesTheWorld` (kill tool erases under the real gesture pipeline, doesn't
select, offers its undo); the layout gate's two new dimensions above, negative-tested — the old
row convicted 32 times before the grid passed clean. The owner's sixth note arrived truncated
("species …") and is carried as an open item for round 4.

## 9. EV — the evolution surfaces and the sun card (owner request, 2026-09-01)

"Did we fail to port all the traits and genetics?" — no: the genetics were fully ported and
running (11 loci, mutation on, certified by the corridor on the ported core). What was missing
were the WINDOWS: no Traits page, no Evolution panel, and — the owner's follow-up — no detailed
sun management. All three shipped, plus three JNI wrappers the bridge never exposed
(`evMutation`, `evLocus`, `locusGet` — the C ABI had them all along).

- **The Traits page** (sixth Data page, from ui-data.jsx `drawTraits`): one 160 dp band per
  (species, locus) — mean ± sd ribbon off the recorder's locus channels (LOCUS_CH, all four
  planes), the founder value dashed, a 24-bin now-histogram in the generic genotype tint (the
  documented grammar exception; the ±52° HSL tint mirrored from frame.rs as display math), pole
  words through L10n. The page scrolls; chart pages keep the viewport. Not ported: the per-sun
  patch marks and intervention markers — recorded, not smuggled.
- **The Evolution panel** (from ui.jsx `EvolutionPanel`, opened from the drawer, levelAllows(4)
  gated): mutation toggle, per-locus sigma [0–0.12] and curve [−0.5–0.8] sliders committing on
  release (one drag = one intervention), the seven price slopes behind a "prices" fold with the
  6.1 balance marks, and the four presets as ONE intervention each — recipes verbatim from 6.3,
  "shipped" meaning the sigma the world FOUNDED with (captured at founding, not at panel-open).
- **The sun card** (from ui.jsx `SourceCard`, replacing the three-button sun bar): light
  [0–1.5], warmth [−8..+15°], spread [90–300] sliders — a release commits one sourceSet — the
  six additive layouts as one intervention each (L.2: the shipped sun keeps its place), + sun /
  + heater arming a one-tap placement, remove (never the last source). The card outranks the
  specimen sheet at the bottom; the chrome lift covers both.

Gates: `theEvolutionAndSunLeversDriveTheCore` (mutation flips scalar 50, preset wild doubles a
real sigma and shipped restores it, layouts reshape the sky, the card opens on grip — all
against the host core through the new JNI). The layout gate measures the new presets/layouts
grids in both locales; the prose gate convicted the browser's own Traits title ("population",
banned since 8.4) — the port is newer than the wording it ports.

Recorded gaps: evolution/sun-slider changes are logged and impact-carded but the core's undo
slot covers world levers only (codes 1–12) — the browser's UI-side evolution undo is not
ported; Traits patch marks per sun; the light-budget line of the browser's card.

## 10. SP — the species Steckbrief and trait tracks (2026-09-01)

The specimen sheet knew a creature's numbers but not its species: four bare tiles (label,
genotype, pole pair) and no answer to "what IS this thing?". docs/species-profiles.md had
already designed the answer — a profile per species with a portrait slot — and the art existed
in `assets/species/` without a single consumer. This increment wires both in.

- **The portraits ride in from their one committed home**: `build.gradle` adds the repo's
  `assets/` to the source set (no second copy to drift) and `ignoreAssetsPattern` keeps the
  folder's README and the gitignored full-size originals out of the APK — verified by merging
  with a probe file planted in `full/`: five jpgs and the level overlay ship, nothing else.
- **The Steckbrief** (`Profiles.kt` + the sheet): tapping the specimen header unfolds a profile
  block — rounded portrait (`PortraitView`, shader-clipped, dependency-free), role line,
  "eats" / "eaten by", and a two-sentence description. Folded by default: the sheet floats over
  the pond and the pond stays the point. Every slot hides when a species has no art or no words
  (species-profiles.md's contract), so Mycora and Necro degrade to the identity dot, never a
  crash. Keys are the CORE's English names (species name for art, locus label for trait text) —
  a core rename surfaces as a missing profile, never a wrong one.
- **The trait tiles grew a track** (`TraitMeter`): pole-to-pole rail, hollow tick at the
  founding value (locusGet key 16), marker in the species' own colour at THIS creature's
  genotype, pole words at the rails, and one line on what the dial trades — nine explanation
  strings keyed by locus label, shared where the trade is shared (Thermal serves Drifta and
  Bacillus, deliberately). The lines are teleology-proof per the style guide: lines out-grow
  and out-breed; nothing adapts in order to.
- **Words within the gates**: all strings EN+DE in the resource files, prose gate PASS (330
  strings) — the profile texts are species-profiles.md rewritten into player language, since
  the originals lean on half the banned-science list.

Gates: the boot gate's selection block now unfolds the Steckbrief against the host core and
requires the portrait to decode from the BUNDLED assets, the words to be non-blank, and — after
its first run photographed a sheet whose VISIBLE profile had never been measured — the unfolded
block to take real laid-out space before it is photographed (`specimen@profile.png`). Layout
gate 0 violations across 4 profiles × EN/DE; German gate green; `npm test` green.

Recorded gaps: the Steckbrief is per-species, not per-individual (age/size/energy stay the
individual's rows above it); no portrait in the seed picker yet; the browser's specimen card
keeps its text-only form — the app is the product, the browser the renderer's oracle.

## 11. Owner round 4 — the seam and the lost experiment (2026-09-02)

Two reports from the device, both reproduced before repair.

**The world-boundary seam.** The screenshot showed a hard vertical edge where the torus wrap
crossed the screen (t=69,035). Pixel analysis: a constant step, one side reading darker than the
ABYSS ground, the other brighter — compositing, not content. Reproduced in a Robolectric NATIVE
probe (the wrap column's neighbouring-pixel difference spiked 2.4x against its surroundings) and
bisected by `hidden` bits: every layer carried it, the light tile loudest. Cause: the per-tile
`drawBitmap` loop clamps bilinear filtering at each tile's edge, so no layer could interpolate
across the wrap — and the 4x field prescale clamped the same way, flattening the edge texels on
top of it. Fix: every world layer samples through a `BitmapShader` in REPEAT mode (a torus has
no edge, so the filter must not either) — `Renderer.paintLayer` replaces the tile loop with one
viewport rect per layer, `Layers.upPaint` wraps the prescale. Painting only; frame.rs and the
display list untouched, the frame gate stands. New gate `WorldSeamTest`: sun parked on the wrap
corner, both wrap lines rendered mid-screen at the phone's zoom, seam column/row must not spike
1.8x over its neighbourhood — negative-tested (convicts the old renderer at 2.42x, passes the
fix at 1.03x). The browser's canvas tiling has the same clamp seam; it stays as the renderer's
frozen oracle and is recorded here rather than patched.

**Experiments don't save.** "World state is saved but the fact that I run an experiment is not"
— exact: the snapshot carried no level runtime, so a mid-experiment save (manual slot) restored
as sandbox, and the pause-time autosave skipped levels entirely by the U0.6 decision. That
decision existed only because a restored half-experiment would have been a lie; the owner's
report overturned it the day the snapshot could tell the truth. Shipped:

- **Snapshot format v2** (snapshot.rs): the running experiment rides at the end — keyed by the
  level's NAME (a reordered table cannot swap experiments), state/run/seenS/prediction/pour
  budget/latches/script watermark/fail reason (as a reference into the shipped table) and the
  F5 census ring; `rg_def` is derived (`levels::collect_regions`, factored out of level_start),
  so only state is stored. Loading always ends whatever level the session was in (verdicts must
  never judge a foreign world); a version-1 file still loads, with no level — the owner's
  existing saves survive. A key or ring shape this build cannot honour drops the experiment and
  keeps the world.
- **Proof** extended in `cargo run --bin snapshot` (inside `port:snapshot`): L7 saved mid-run
  past its scripted sunrise, loaded into a fresh sim, driven across the deadline — level state,
  fail reason and world all bit-identical to the uninterrupted run; level re-save
  byte-identical; the synthesised v1 file loads sandbox. Fingerprints bit-identical ×4,
  native == wasm, core baseline rebound (declared: snapshot format v2 + collect_regions
  factoring, behavior-neutral), no NOTE.
- **The shell adopts what it loads** (`adoptCoreLevel`): after any load — boot restore, manual
  slot — the core says whether an experiment rode along; the shell adopts running level, meter
  labels and deadline, or clears a stale one. This also re-adopts a live experiment after an
  activity recreation, which silently lost the shell's experiment context before.
- **The experiment autosaves to its own file** (`experiment.mcsm`): a mid-experiment pause can
  never clobber the kept sandbox pond (`autosave.mcsm` untouched); a sandbox pause deletes the
  stale experiment file. Boot prefers the experiment file — the player left mid-experiment, so
  mid-experiment is where the app comes back. Routing reads the CORE's level state on the
  render thread, not the shell's `running`, which can lag a frame around boot.
- **The front door offers both**: a "continue the experiment" row (after the two fixed rows, so
  the boot gate's child indices hold) appears whenever an experiment is live, named E{n} {title};
  the Sandbox row now honours its own subtitle — choosing it mid-experiment stops the level,
  deletes the experiment file and loads the kept pond back, instead of handing over the
  experiment's world wearing sandbox clothes. Strings EN+DE, prose gate PASS (414).

Gates: new boot-gate test `theExperimentSurvivesSaveAndLoad` (L7 saved mid-run through the real
render thread, world walked away to a fresh sandbox, loaded back: core mid-experiment at the
saved tick with the risen sun intact, shell adopts meters and shows the continue row). Full app
suite 14/14, `npm test` green, `test:port` green (levels gate byte-identical on the ported
core).

Recorded gaps: the Observatory ring is not in the snapshot (never was), so a restored
experiment's narration and Data pages start fresh — verdicts are unaffected because judged
samples travel as state (seenS, run, latches); the census strip in the level HUD resumes within
a sample (20 ticks). Levels are still never autosaved DURING a run below onPause granularity;
a hard kill between pauses loses since-pause progress, as the sandbox always has.

## 12. TH — experiment-menu thumbnails from gameplay (owner request, 2026-09-02)

One small picture per experiment, on both menus (browser start screen, app experiments list),
and a tool that makes them: `tools/level-thumbs.js` (`npm run thumbs`).

- **Captured from gameplay, not drawn**: the tool plays each level in the real browser UI
  (the playthrough instrument's approach — dev server, headless Chromium, genuine gestures)
  and photographs a 160px square of the world canvas. The camera work is all player-reachable
  input: observe-mode drags to pan, wheel notches to zoom, a pause so the framing and the
  frame agree. The owner's requirement — main actors and concept IN the picture — is met by a
  per-level shot spec: a tick, a world point, a zoom, and where the level's actor is absent
  from the null run, a scripted act (L5 seeds the grazer pack, L6 the Venator pack, which
  founds as cysts and needs ~1,200 ticks to hatch into the frame).
- **The core finds its own actors**: an untouched level run is deterministic (pinned seed,
  draw-free founding), so for `actor:` specs the tool pauses, reads the tick the pause landed
  on, replays the level headlessly to exactly that tick (the levels-gate drive loop:
  levelStart + levelScript + step) and centres the camera on that species' densest cluster.
  The first guessed-coordinate captures were empty water — L1's founders scatter over the
  whole torus; the exact replay is what made the actors findable.
- **One committed home, two consumers**: `assets/levels/<key>.jpg` rides into the APK beside
  the species portraits (`Profiles.levelThumb`, PortraitView row in the experiments list) and
  is inlined as data URIs into the single-file artifact (generated `src/ui-thumbs.js`, in
  build.py's UI parts; artifact +67 KB). Missing file = no picture, never a placeholder.
- **Gates**: `npm test` green with conformance bit-identical (UI-only — dist/core.js does not
  carry the module); the boot gate lays out the experiments panel and requires at least one
  thumbnail measured at real size (SP's VISIBLE-but-never-measured lesson); layout gate
  unchanged at zero violations.
- Recorded honestly: captures ride the live render loop, so the jpgs are not bit-reproducible
  between runs (±a few ticks) — a curation tool, not a gate. Regeneration is deliberate.
  L7's picture is the lonely risen sun on dark water by design: the level's concept is that
  nothing is there until something is carried there.

## 13. The standing-sun badge stops being a monument (owner report, 2026-09-02)

"Move the sun and an undo bar sits at the top forever; it should leave by itself after a
short while." Reproduced by reading the code: U2.3 shipped the badge as *persistent* — it wore
amber until the sun was put back, and a moved sun never returns to its founding by itself, so
the bar was permanent by construction. This is the round-3 undo-chip finding ("it is an offer,
not a monument") arriving one round later at the badge.

Fix (`WorldView`, the badge block): the badge is now a **notice with a freshness window**. Any
change to source 0's tuple (x, y, i, a, sigma) re-arms it for `SUN_BADGE_SHOW_NS` = 90 s of real
time — far longer than the undo chip (45 s then, 10 s since §14), so the notice still outlives
the offer to put the world back, which was U2.3's whole reason for existing — and then it goes. Nothing else re-arms it: an
unrelated pour leaves it alone (the chip's `ivCount` freshness would not have). Founding a
world, restarting a level and loading a save re-baseline the sky, so a restored change is
history and wears no badge, exactly as restored interventions get no chip.

What this costs, recorded rather than smoothed over: `putSunBack` — the one path back to the
*founding* sun — hangs off the badge's tap, so after 90 s that path is gone and the player is
left with the sun card's sliders and the undo slot. And the outrun study's conviction (a sun
press left standing five minutes outruns its undo) is now answered only while the notice is up;
past that the world carries a standing change the chrome no longer mentions. Both are the
owner's call, taken with the report; if the restore path is wanted permanently it belongs on the
sun card as its own row, not on a bar that never leaves.

Gate: the boot gate's badge block now walks the whole life — appears on a moved sun, clears on
restore (as before), then, with the window shortened through `world.sunBadgeShowNs`, leaves by
itself **while the change still stands**, and comes back when the sun is touched again. App
suite green, `npm test` green, conformance bit-identical (the core is untouched).

## 14. The undo chip's window is cut to 10 s (owner, 2026-09-03)

Owner instruction, plainly: *no undo button — after placing, moving a sun, editing — stands
longer than ten seconds.* So `UNDO_SHOW_NS` = 10 s replaces the 45 s of §8, as a named constant
beside `SUN_BADGE_SHOW_NS` rather than a literal buried in the frame loop, with
`world.undoShowNs` as the field the gate shortens.

The reasoning §8 recorded still holds in shape and only moves the line: undo is an offer made in
the moment the finger lifts, not a standing monument. What changes is who the offer is for. At
45 s it also served the player who wandered away and came back; at 10 s it serves only the hand
that just acted. The devil's-advocate case against this is worth writing down rather than
burying: a pour whose consequence takes 30 s of sim time to show is now un-undoable by the time
the player sees what it did, and the chip is the *only* affordance that puts a lever back
(`putSunBack` aside). That is a real loss and it is the owner's call, taken knowingly. If it
bites, the answer is not a longer window but a permanent per-lever restore row — the same
conclusion §13 reached about the founding sun.

One thing this deliberately does not touch: the standing-sun badge stays at 90 s. It is a
*notice* that a change is standing, not a button that puts anything back, and §13's whole point
was that the notice should outlive the offer. It now outlives it by more.

Gate: the boot gate's armed-tool test gains the chip's retirement — a fresh intervention arms
it, and with the window shortened through `world.undoShowNs` it goes on its own while the world
still carries the change. Core untouched, so conformance is bit-identical by construction.
