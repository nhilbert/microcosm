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
- **U2.1 — the bottom sheet, three detents.** Hand-rolled (D1): peek / half / full, drag handle
  48 dp, detail level follows detent as the browser's did. Peek carries the one line's overflow
  (undo chip, mode); half carries the controls that today live in the scrolling bar plus the
  species toggles (D3); full carries the specimen card's long form and the Data entry. The
  scrolling bar — U0.1's honest stopgap — retires here. Boot gate learns detent gestures.
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
