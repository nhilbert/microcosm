# MICROCOSM — App UX Research

Research for the Android app's redesign, along the five lenses named in `docs/app-ux-review.md` §4.
Read that review first: it is the measured baseline this reasons about, and its §1 numbers (22
interactive targets, a 576 dp bar in a 408 dp screen, four clipped controls, no reset) are not
repeated here.

**Owner decisions this is written under (2026-09-01):**

1. **The app becomes the product.** The browser artifact retires to being the frozen oracle for the
   *renderer* — the same relationship `src/sim/` has to the simulation crate. So `src/ui-*.jsx` is
   prior art to learn from and no longer a specification to match. `frame.rs` and the frame gate are
   untouched by any of this: what the world *looks like* stays shared and proved; what the *shell*
   around it looks like is now the app's own.
2. **Research before repairs**, against the review's recommendation, which is recorded rather than
   re-argued.
3. **All five lenses, seriously.**

**Method, and its limit.** This is reading plus a teardown of our own source. It cannot say what
the app feels like in a hand — the project's own meta-lesson is that every calibration that started
from theory failed against measurement, and there is no reason UI should be the exception. So each
lens ends with a claim that can be *checked*, and §8 lists what only the phone can settle. Nothing
here is a design.

---

## 1. Lens 1 — Modes, quasimodes, and direct manipulation on touch

**The literature is unusually blunt.** Raskin's position in *The Humane Interface* is that modes are
a primary source of user error, that the error is structural rather than carelessness, and that
modes should be eliminated where possible and made unmissable where not. His alternative is the
**quasimode** — a mode "kept in place only through some constant action on the part of the user",
also called spring-loaded. The claim is specific: because the mode is held kinesthetically, *you
cannot forget you are in it*, so quasimodes do not produce the class of error that modes do. Shift
is the canonical example; Figma's space-bar-to-pan is the same idea in a canvas app.

**Our Intervene is the bad case, not the good one.** It is a persistent, invisible-until-consulted
mode, set by a button at the far end of a bar, that changes what a tap on the world *means* — from
"select this organism" to "pour mineral here". Nothing about the hand holding the phone maintains
it. That is precisely the shape Raskin says produces mode errors, and the owner reported the error.

**The sun grab is a second mode nested inside the first**, and worse in every dimension: entered
silently (a tap within a fingertip of a sun), retained indefinitely, and it *changes what dragging
does* — the single most-used gesture in the app. Games practice converges here from a different
direction: **keep destructive actions away from where a thumb rests**. Our most destructive lever is
parked in the middle of the screen, on top of the thing the player most wants to look at.

**Contextual invocation is the pattern the game-UI literature actually recommends** for a canvas:
trigger the menu *from the object you want to affect*, or from empty canvas with a long press — with
the caveat that radial menus stop scaling past about eight options. We have more levers than eight,
so a wheel is not a drop-in.

**What this costs.** A spring-loaded or armed model costs a deliberate act per intervention. Against
it: the wall tool in this app is *already* spring-loaded (arm, draw once, disarm) and the owner did
not complain about walls. That is a natural experiment we already ran without noticing.

**Checkable claim.** If Intervene's errors are mode errors, then making every lever an armed
one-shot — the wall tool's pattern generalised — should remove the accidental sun moves and the
accidental pours without removing any capability. It costs one tap per action, and that cost is
measurable in the event log: the number of interventions per session should not fall much if the
model is right, and should fall a lot if it is too bureaucratic.

Sources: [Mode / quasimode](https://en.wikipedia.org/wiki/Quasimode_(computer_interface)) ·
[The Humane Interface](https://en.wikipedia.org/wiki/The_Humane_Interface) ·
[Raskin Center — core principles](https://raskincenter.org/rchi/core-principles/) ·
[Figma toolbar and the hand tool](https://help.figma.com/hc/en-us/articles/360041064174-Access-design-tools-from-the-toolbar) ·
[Radial menus for touch](https://bigmedium.com/ideas/radial-menus-for-touch-ui.html) ·
[Game UI principles](https://www.strayspark.studio/blog/game-ui-ux-design-principles)

---

## 2. Lens 2 — Progressive disclosure and glanceable density

**The pattern is old and well-evidenced.** Nielsen introduced progressive disclosure in 1995:
defer advanced or rarely-used features to a secondary screen so the first screen carries only what
most users need most of the time. NN/g treats it as a primary technique for *reducing information
density* specifically, and names it a key mobile guideline because screen space is the binding
constraint. Reported effects run to 20–40% faster task completion with better comprehension —
figures worth treating as indicative rather than as our numbers.

**Material gives the mechanism we would use.** A **standard** (non-modal) bottom sheet is exactly
the right component for a world you must keep watching: it allows simultaneous interaction with the
sheet *and* the screen behind, where a modal sheet blocks it and dims it. `BottomSheetBehavior`
provides `COLLAPSED` (peek height only), `HALF_EXPANDED` (with `fitToContents=false` and a
`halfExpandedRatio`), and `EXPANDED`; `BottomSheetDragHandleView` exists for the handle and carries
its own accessibility affordances, and it requires 48 dp of height.

That is, to the state, **the browser's three-detent sheet** — peek / half / full — which this project
built and validated on its own and the app then did not port. The finding is not "adopt Material's
sheet"; it is that the design we already had is the platform's own recommendation, and the app
regressed from it to a single all-or-nothing `TextView`.

**PhET's answer to the same problem is worth taking seriously**, because PhET's users are ours: it
parses, layers and sequences complexity **through tabs**, each tab a different environment for a
subset of goals. We have that shape already in Data's five pages. The unexamined question is whether
the *world* screen should have it too.

**Where the app's density actually goes wrong** is not only quantity but *kind*: roughly half the
permanent HUD is renderer telemetry (`ms/frame`, `core`, `drawn`), rendered in the same weight and
colour as the census. That is not a disclosure problem, it is a **misclassification** — developer
instrumentation shown as player information. Progressive disclosure has nothing to say about
information that should not be on the player's screen in any state.

**Checkable claim.** There is a single line the player should see always. Everything else earns its
place by being asked for. The line's content is a design decision; that it should be *one line* is
what the literature supports.

Sources: [NN/g — Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) ·
[NN/g — managing visual complexity](https://www.nngroup.com/videos/managing-visual-complexity/) ·
[Progressive disclosure in mobile UX](https://www.digia.tech/post/progressive-disclosure-mobile-ux/) ·
[Material bottom sheets (Android)](https://github.com/material-components/material-components-android/blob/master/docs/components/BottomSheet.md) ·
[PhET implicit scaffolding](https://arxiv.org/pdf/1306.6544) ·
[PhET research](https://phet.colorado.edu/en/research)

---

## 3. Lens 3 — Android as the platform means it

Mostly settled by specification, which is why the review predicted this lens would be the cheapest.

**Swipeable tabs are a solved widget.** `TabLayout` + `ViewPager2` is the documented pattern, gives
the swipe the owner asked for, and brings the selected-tab indicator the current five identical
buttons lack. Our Data pages are a textbook instance.

**Predictive back is not optional any more.** Modal bottom sheets get it free; a standard sheet
needs the app to forward `BackEventCompat` to the behavior. Either way the app needs a real back
stack first — it currently has none, so back leaves the app rather than closing Data, the verdict or
the report.

**Touch targets: two numbers, and they are not the same number.** WCAG 2.2 SC 2.5.8 (AA) asks 24×24
CSS px *or* adequate spacing; Material asks **48 dp** and Apple 44 pt, both well above the floor. The
drag handle alone is specified at 48 dp. Our species chips get about 2 dp of vertical padding. Note
the AA criterion would arguably pass on spacing while the platform guideline plainly fails — a case
where accessibility conformance and usability diverge, and where we should take the larger number.

**Thumb reach changes where controls belong.** Hoober's 2013 field study — 1,333 observations,
780 of them touch interactions — found 49% one-handed, 36% cradled, 15% two-thumbed, and thumbs
driving about 75% of interactions. Only roughly the bottom third of the screen is effortless. On a
2,700 px-tall phone this is not a nicety.

Applied to our screen, it produces a specific finding the review did not have: the app's bottom bar
is interactive and correctly placed, but **the species chips are interactive and sit at the very
top** — the least reachable strip on the display — while the *passive* specimen card sits low, in
the thumb zone, where it can be read but never needs to be touched. Two controls are inverted with
respect to reach.

**Touch slop is the fix for the accidental sun.** Android exposes
`ViewConfiguration.getScaledTouchSlop()` precisely as "the distance a touch can wander before we
think the user is scrolling", and its stated purpose is preventing accidental drags. Our `onScroll`
acts on the first pixel. This is a platform default we opted out of by not thinking about it.

Sources: [ViewPager2 + tabs](https://developer.android.com/guide/navigation/navigation-swipe-view-2) ·
[Material bottom sheets & predictive back](https://github.com/material-components/material-components-android/blob/master/docs/components/BottomSheet.md) ·
[WCAG 2.5.8 target size](https://www.digitala11y.com/understanding-sc-2-5-8-target-size-minimum/) ·
[Android minimum touch target](https://github.com/cvs-health/android-view-accessibility-techniques/blob/main/doc/basics/MinimumTouchTargetSize.md) ·
[Hoober — how users hold devices](https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php) ·
[The thumb zone](https://www.smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users/) ·
[Touch slop / gestures](https://developer.android.com/develop/ui/views/touch-and-input/gestures/viewgroup)

---

## 4. Lens 4 — Reversibility, and the place where our undo stops being enough

This lens produced the finding that changes the others, and it comes from putting the literature
next to our own measurements rather than from either alone.

**The literature's position is clear and it favours us.** NN/g: prefer undo to confirmation; add
friction only when an action is genuinely irreversible; too many dialogs *increase* errors, because
people learn to dismiss them; and keep consequential options away from benign ones. By that
standard Microcosm starts strong — it has one-slot undo, wired to every lever, plus impact cards
that report honestly what changed *since* a lever was pulled.

**But our undo puts the lever back, not the world.** `apply_undo` restores the thing the hand
touched — the sun's position, the light multiplier, the poured mineral, the seeded pack. **It does
not rewind the ticks.** The world kept running between the mistake and the correction, and this
world is not the kind that returns to where it was: `docs/phase7-light-plan.md` measured that
**moving or shrinking the shipped sun collapses the core on 5 of 8 seeds**, and a collapse does not
un-collapse when the sun goes home. The undo is honest about being an inverse *event*, and it was
gate-proved as one (`fingerprint-undo.js`, ten inverses, bit-identical). It was never a time machine
and does not claim to be.

So the app contains a class of action that reads as reversible, is labelled as reversible, and is
**effectively irreversible in consequence**. NN/g's own rule then applies in the direction we did not
take it: irreversible actions earn friction. And it applies *narrowly* — to sun moves and layout
changes, not to pours, feeds, kills or seeds, which the world genuinely absorbs.

**This also resolves the tension in Lens 1** without a blanket rule. Not every lever needs arming.
The levers whose consequences outlive their undo do.

**Checkable claim.** Give friction only to the levers whose consequences outrun their undo, and
find out which those are by measuring rather than by intuition: pull each lever, undo it after a
realistic delay, and compare the world against the same seed unpulled. `impact()` is most of that
instrument already — an interrupted time series with measured natural-variability floors — and the
one place its answer is known in advance is the sun, where the light plan's 5-of-8 core loss is on
record.

Sources: [NN/g — confirmation dialogs](https://www.nngroup.com/articles/confirmation-dialog/) ·
[NN/g — preventing user errors](https://www.nngroup.com/articles/user-mistakes/) ·
[NN/g — consequential options near benign ones](https://www.nngroup.com/articles/proximity-consequential-options/) ·
plus `docs/phase7-light-plan.md` and `harness/fingerprint-undo.js` in this repository.

---

## 5. Lens 5 — The shell for a thing that is both a sandbox and a ladder

**What the games literature says about the split.** Sandbox and campaign are treated as genuinely
different modes with different contracts: a sandbox has free-form play, relaxed rules and minimal
goals; a campaign has progression and stakes. And, usefully for us, **sandboxes are the recommended
shape for tutorials** — "game play much like the real game, but where things cannot go too wrong too
quickly" — because the teaching happens by doing.

**What PhET says, and PhET is the closer relative.** Implicit scaffolding: guide without instructing,
using affordances and constraints so that students engage productively *without feeling guided*,
keeping their agency. Its four categories are scaffolding the concept, the framing of the sim's use,
sense-making, and continued engagement. And the structural device is **tabs** — each tab a different
environment, each with a subset of the goals.

**Microcosm has already researched the pedagogy and skipped the shell.** `docs/phase8-ladder-design.md`
took implicit scaffolding, productive failure and predict–observe–explain seriously and built twelve
levels on them. What it never designed is *arrival*: today Experiments is an `AlertDialog` list
behind a button that, on the owner's phone, is off the screen. The ladder is the most carefully
built thing in the app and the least reachable.

**The unresolved question is which is the front door.** The browser answers "both, choose" — a start
screen with Sandbox and Experiments side by side, every level open, none gated. PhET answers "one
environment, tabs to move between framings". Sandbox-as-tutorial answers "free play first, structure
when you want it". These are three different products, and the literature does not choose between
them; it only rules out the current arrangement, where the structured half is hidden behind chrome.

**One observation from our own data.** The levels are all open, ungated, by explicit design (§8.0),
and the honesty gate proves each one fails untouched and passes on its taught strategy. That is a
ladder that does not need to be a gate — which makes "arrive at a list of questions" much less
coercive than it would be in a game with locked content.

Sources: [PhET implicit scaffolding](https://arxiv.org/pdf/1306.6544) ·
[Implicit scaffolding & inclusive design](https://link.springer.com/chapter/10.1007/978-3-319-40238-3_12) ·
[Sandbox game design](https://gamedesignskills.com/game-design/sandbox/) ·
[Sandbox mode: game or toy?](https://mollaboutgames.wordpress.com/2019/04/24/simulation-sandbox-mode-game-or-toy/) ·
plus `docs/phase8-ladder-design.md`.

---

## 6. Where the sources disagree

Recorded because a research doc that finds unanimity has usually not read enough.

- **Modelessness vs. modes-made-visible.** Raskin says eliminate modes; mainstream platform and game
  practice says keep the mode and signal it hard (a lit tool, a changed cursor, a coloured chrome).
  Both cannot be followed. The reconciliation available to us is Lens 4's: be modeless where undo
  restores the world, quasimodal where it does not.
- **Undo vs. friction.** NN/g prefers undo and warns that dialogs breed dismissal; the destructive-
  action literature wants friction on anything irreversible. The disagreement is only apparent —
  it dissolves once "irreversible" is defined by consequence rather than by whether an inverse
  exists. In our case that redefinition moves sun moves across the line.
- **Contextual (radial) menus vs. persistent toolbars.** Touch-UI writing likes contextual invocation
  from the object; the same sources concede radial menus break past ~8 options. We have more levers
  than that, so the honest reading is that contextual invocation is right and *radial* is not
  necessarily the form.
- **Accessibility floor vs. platform guideline.** WCAG AA's 24 px would let our species chips pass on
  spacing; Material's 48 dp fails them outright. Conformance and usability point different ways;
  take the larger number.
- **Tabs, from two directions.** PhET uses tabs to *parse complexity* pedagogically; Android treats
  tabs as peer navigation and wants them swipeable. Same widget, different justification — worth
  noticing before the world screen acquires tabs for the wrong reason.

---

## 7. Synthesis — what the design phase should build

Pre-design conclusions, in the order they constrain each other. None of this is a layout.

1. **Sort the levers by how fast their consequences outrun their undo** (Lens 4), and produce that
   list first, because everything below depends on it. To be exact: **no undo here rewinds time** —
   every inverse is applied to the world as it now is, which is what the gate proves. So the sorting
   is not "reversible vs irreversible" but *how much the world has already moved on* by the time a
   player notices. A pour undone ten ticks later is close to a null; a sun moved for a minute may
   have started a collapse the sun's return does not stop. Which levers fall where is a measurement,
   not a taste — and the instrument exists: `impact()` already reports the departure since every
   lever, against a trend, with measured natural-variability floors. Run it, do not guess it.
2. **Make the second class quasimodal, and only that class** (Lens 1 + 4). The wall tool's
   arm-once-and-disarm pattern is the in-house precedent, and it is the one lever the owner did not
   complain about. A sun should not be grabbable by a tap that was aiming at water.
3. **Give the world screen one always-visible line, and a standard bottom sheet for everything
   else** (Lens 2 + 3). Peek / half / full, with the detail level following the detent — which is
   what the browser already does and what Material independently recommends. The renderer telemetry
   leaves the player's screen entirely; it is not disclosure-managed, it is reclassified as
   developer instrumentation behind a switch.
4. **Take the platform's widgets instead of rebuilding them worse** (Lens 3): `TabLayout` +
   `ViewPager2` for Data, a real back stack with predictive back, `getScaledTouchSlop()` before any
   drag is believed, 48 dp targets everywhere, insets applied once at the root.
5. **Fix the reach inversion** (Lens 3): interactive species chips sit at the top of a 2,700 px
   screen; the passive specimen card sits in the thumb zone. One of the two is in the wrong half.
6. **Decide the front door explicitly** (Lens 5). Three defensible answers; the literature rules out
   only the current one. Since every level is already open and ungated, arriving at the questions
   costs the player nothing they cannot immediately leave.
7. **Build the layout gate before the redesign, not after** (review §6). The bar overflow shipped
   through nine green CI runs because every gate in this project is about the world and none is
   about the screen. The precedent for what a gate is worth is `harness/prose.js`: promoting the
   audit into a gate convicted 32 violations where a careful manual read had found 8.

---

## 8. What this research cannot settle

Listed so the design phase does not mistake reading for measurement.

- **Whether armed levers feel deliberate or bureaucratic.** Only playing settles it. The event log
  makes it measurable after the fact: interventions per session, before and after.
- **What belongs on the one always-visible line.** Candidates exist (tick, the census, the vital
  nearest its reference band, the objective when a level runs) and no source can rank them for this
  world.
- **Whether the world screen wants tabs at all**, or whether tabs belong only to Data.
- **Whether a contextual, object-triggered menu beats a persistent bar** given more than eight
  levers — the sources like the idea and concede the form does not scale.
- **The front door** (§7.6), which is a product decision rather than a research finding.
- **Everything about how it looks.** This document is about structure and behaviour. The visual
  grammar of the *world* is settled, shared and gate-proved (`frame.rs`); the visual grammar of the
  *shell* is not designed here.
