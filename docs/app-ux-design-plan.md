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
2. **The undo chip never vanished.** It is an offer, not a monument: it now leaves 45 s after
   the intervention it names (the outrun study's ground — undo within a minute is a time
   machine; past that the world has moved on). Interventions restored from a save are history,
   not fresh, and get no chip.
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
