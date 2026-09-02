# The app's UI: a review, and a plan for the research behind the redesign

**Status:** review complete (2026-09-01), research NOT yet done, redesign NOT yet planned.
Owner decisions pre-declared in §7.

The app reached full feature parity increment by increment, and each increment added its own row of
controls to a screen that was never designed as a whole. This is the reckoning for that. It is
written in the project's usual order: measure first, theorise second — §§1–3 are what the code and
the screenshots actually show, §§4–6 are what to go and find out, and nothing here proposes a
design yet.

---

## 1. The five complaints, traced

The owner played the app and named five things. Each one has a cause in the source, and two of them
are larger than the complaint suggested.

### 1.1 "A little cluttered, too much info, especially in intervene"

Counted from `MainActivity.onCreate`, the maximum simultaneous state — Intervene, an organism
selected, a sun gripped, an experiment running — puts **22 interactive targets** on one screen:

| surface | targets |
|---|---|
| bottom bar (always) | 9 — pause, 1x, 4x, 16x, mode, save, exp, data, bench |
| actions row (Intervene) | 4 — feed, kill, seed, wall |
| sun bar (sun gripped) | 3 — dimmer, brighter, release |
| undo chip | 1 |
| species strip | 5 |

Above them sit two lines of monospace HUD (`t / S / D / C / B / V / z / ms-per-frame / core /
drawn`), the objective chip, and the specimen card. **Roughly half of the permanent HUD is developer
telemetry** — `ms/frame`, `core`, `drawn` are numbers for whoever is optimising the renderer, and
they sit in the player's eyeline at all times, in the same weight and colour as the census.

The browser does not do this. It has a **three-detent bottom sheet** (`detent` 0 peek / 1 half /
2 full in `src/ui.jsx`), and it passes the detent down to the specimen body as a `detail` level, so
the card says less when the sheet is small. That is a progressive-disclosure mechanism the browser
already earned, and **the app did not port it**: the Android card is one `TextView`, all of it or
none of it.

### 1.2 "Too many UI elements frequently led to overlap issues"

This is the most serious finding, and it is arithmetic rather than opinion.

The bottom bar is a horizontal `LinearLayout` with **nine** `WRAP_CONTENT` buttons and **no overflow
strategy** — no scroll, no wrap, no weights, no menu. A `Button` with 11 sp text needs roughly 64 dp;
nine of them need ~576 dp. The Fairphone 5 is 1224 px at density 3 = **408 dp wide**. The bar cannot
fit, and `LinearLayout` does not report this: it hands each later child whatever width is left, so
the ones at the end are squeezed to nothing and then clipped.

The owner's own screenshot shows exactly that: five controls visible, the fifth ("observe") squeezed
into three stacked letters, and **`save`, `exp`, `data` and `bench` — four of the nine — not on the
screen at all.**

So this is not a tidiness problem. Features the milestone claims as shipped are, on that device, in
that state, unreachable. That the owner has used Data and Experiments means they were reachable at
some earlier size or build; it does not make the current layout sound.

### 1.3 "Intervene was fiddly and I often accidentally moved the sun"

Three separate design faults compound here, all in `WorldView.takeInput` / `onScroll`:

1. **Gripping a sun is silent and has priority.** A tap within 44 CSS px of a sun grips it, before
   any other interpretation of the tap, and the grip *persists*. The sun sits at the middle of the
   world, which is exactly where the mat is and where a player wants to look, pan and pour.
2. **A gripped sun steals the drag.** Once `sunSel >= 0`, every subsequent drag moves the sun rather
   than panning the camera. The only signal is a slightly brighter amber ring — and a "release"
   button on a row that may itself be off-screen (§1.2).
3. **There is no drag threshold.** `onScroll` fires on the first pixel of movement, so a sloppy tap
   is a sun move — and moving a sun is a *press*, a regime change, not a poke. The measurements in
   `docs/phase7-light-plan.md` are blunt about what that does: **moving or shrinking the shipped sun
   collapses the core on 5 of 8 seeds.** The fiddliest gesture in the app is wired to one of the two
   most destructive levers in the world.

And in Intervene a stray tap on open water is not inert: it **pours mineral**, immediately, no
threshold and no confirmation.

### 1.4 "Data had tabs, which was good, but I could not swipe between them"

The five page buttons are plain `Button`s that set an integer. There is no `ViewPager2`, so no
swipe; and — separately — **no selected state**: all five look identical whichever page is showing.
The only indication of where you are is the sentence in the title bar.

### 1.5 "Reset didn't work"

It did not work because **it does not exist**. There is no reset control anywhere in the app.
`Native.resetWorld()` is called once, at boot, in the render thread's `run()`.

Two distinct things are missing, and the browser has both:

- **World reset.** `src/ui-reset.jsx` is a confirm-tap button (arm, then tap again within 2.6 s)
  that restarts on a fresh random seed. Not ported.
- **Re-run the experiment.** `WorldView.restartLevel()` exists and compiles, and **nothing calls
  it** — the verdict card even tells the player `"exp" to run it again`, which routes them through
  a picker, a briefing and a prediction to get back to a level they just played. In the browser,
  reset inside a level *is* re-running the experiment.

---

## 2. What else the review turned up

Not complained about, found while looking:

- **No back-button handling.** `MainActivity` has no `onBackPressed`. Back does not close the Data
  panel, the verdict card or the benchmark report — it leaves the app. On Android that is close to
  a reflex, so it will be pressed.
- **No autosave.** `onPause` only stops the HUD timer. Backgrounding the app and losing the process
  loses the world, even though a working save slot exists a few lines away.
- **Touch targets below the minimum.** The species chips use `setPadding(0, 6, 28, 6)` in raw
  pixels — about 2 dp of vertical padding at density 3 — giving a target well under the 48 dp
  minimum. They are the control for hiding a species.
- **Dialogs are the navigation.** Experiments, briefing, prediction, seeding and save/load are all
  `AlertDialog`. The start screen the browser has (`src/ui-levels.jsx`) is, here, a list inside a
  dialog behind a clipped button.
- **The renderer's own instrumentation ships to the player** (§1.1), including a `bench` button that
  pauses the world and runs a 60-frame timing sweep.

None of this is surprising for a shell built in six increments in one night, and the plan records it
rather than smoothing it over (rule 6).

### 2.1 A browser finding, turned up while reworking the specimen panel (2026-09-02)

The owner asked for three things on the specimen page: icons instead of the words *Feed* and
*Kill*, a close icon beside the drag gesture, and identity before instrumentation — the photo, the
name, what the species does and its reserves in the peek, with the measurements, the genome and the
profile behind the second detent instead of the other way round. All three shipped in
`src/ui.jsx`; the peek is 212 px, measured against its own content (176 px) rather than guessed.

Measuring the new close icon turned up a defect the *shipped* gesture had too. Closing the sheet
only cleared `ui.card`, and the 500 ms UI loop rebuilds the card from the live selection — so the
sheet reopened by itself within half a second. Verified in a browser rather than reasoned about:
gone right after the drag, back 1.2 s later. Letting go of a specimen is now one action
(`deselect`, which clears the selection as well), used by the gesture, both close icons and Esc.
The reset control also rode on a hard-coded offset tuned for the old 178 px peek; it follows the
same stack as the speed control now and steps aside with it when the sheet is more than a peek.

Two consequences for the app. The Kotlin specimen card is a `TextView` with no photo, no profile
and no close control, so it inherits none of this yet — the reorder is a design decision the app
should copy, not a repair. And the reopening close is a *class* of bug worth hunting wherever the
app mirrors state the core owns: a control that appears to do something the render loop undoes on
the next frame.

---

## 3. Three positions worth arguing against ourselves

**(a) The clutter is a scope problem, not a layout problem.** Rearranging 22 targets more cleverly
still leaves 22 targets. The app shows every lever the browser has, all of them at once, because
each increment added its own row and none ever removed one. The real question is not *where do the
controls go* but *what does a phone player do most*, and everything else becomes secondary. No
amount of research substitutes for that decision.

**(b) Most of the complaints are defects, and researching them is a delay.** Four of the five —
the clipped bar, the missing reset, the un-swipeable tabs, the missing drag threshold — have known,
uncontroversial repairs and need no literature at all. Doing the research first means studying a
baseline the owner could not fairly evaluate, and some complaints may simply evaporate once the
defects are gone, which would change what the research has to answer. The honest split is in §5.

**(c) A real redesign forks the UI from the browser.** `src/ui-*.js(x)` is still JavaScript and
still evolves; the app is Kotlin. Today they are the same design in two languages. A phone-native
redesign makes them two designs, and the second implementation of a design is exactly the kind of
duplication this port existed to end. That is a decision to take deliberately (§7 Q1), not to
discover later.

---

## 4. What actually needs research

Strip out the defects and one structural question is left, in five parts. These are the lenses.

**L1 — Modes and direct manipulation on touch.** Is "Intervene" a mode at all? The wall tool is
already a *spring-loaded* one-shot: arm, draw once, disarm. That pattern applied to every lever
would make the sun ungrabbable unless the player asked for it. Against: an armed-tool model costs a
tap per action and may make play feel bureaucratic. Sources: Raskin on quasimodes and modelessness;
Tesler's mode-error literature; teardowns of touch apps that mix a viewport with tools — map
editors, Procreate, Figma, Google Earth, Universe Sandbox, sandbox/god games on tablets.
*Question:* what makes a destructive lever on a pannable canvas feel deliberate without a
confirmation dialog?

**L2 — Progressive disclosure and glanceable density.** What belongs on the permanent HUD, what
belongs one gesture away, what belongs in Data. The browser's own three-detent sheet is prior art
this project already built and validated; the research is whether the detent model is the right one
on a phone, and what the *peek* line should carry. Sources: Material 3 bottom sheets and their
detent guidance; NN/g on progressive disclosure; monitoring-dashboard practice on glanceable vs
diagnostic information.
*Question:* what is the single line a player should see at all times, and what earns the second?

**L3 — Android navigation as the platform means it.** Swipeable tabs (`ViewPager2` + `TabLayout`)
for Data; predictive back and a real back stack; edge-to-edge and window insets done once rather
than per-view; the thumb zone on a 2700 px-tall screen, where the top of the display is out of reach
one-handed. Sources: Material 3, the Android large-screen and gesture-navigation guidance, the
predictive-back migration notes.
*Question:* which of the app's own inventions are just platform patterns rebuilt worse?

**L4 — Reversibility instead of confirmation.** The project already has honest undo and impact
cards, which is a stronger position than most apps start from. What it lacks is a way to make an
action *deliberate at the moment it is taken*. Options to study: press-and-hold to charge a pour,
explicit armed tools, a drag threshold before a press-lever engages, a two-stage confirm-tap of the
kind the browser's reset button already uses.
*Question:* where is the line between "undo covers it" and "do not let them do it by accident"?

**L5 — The shell for a thing that is both a sandbox and a ladder.** Sandbox and Experiments are
currently a mode flag and a dialog. `docs/phase8-ladder-design.md` researched the *pedagogy*
thoroughly and said nothing about the *shell*. Sources: PhET's sim chrome, Foldit's puzzle/sandbox
split, Kerbal's career-vs-sandbox framing, plus the project's own §8.1 findings.
*Question:* does a player arrive at a free pond, or at a list of questions?

A sixth lens, **accessibility** (48 dp targets, contrast against a dark animated field, text scaling,
one-handed reach), is not a lens so much as a constraint that applies to all five, and it should be
expressed as gates (§6) rather than as reading.

---

## 5. The order this should happen in

Argued in §3(b), and the recommendation is explicit:

**Phase U.0 — repairs, before any research.** Cheap, uncontroversial, and they are the reason the
baseline cannot currently be judged: an overflow strategy for the bottom bar; world reset and
experiment restart; swipeable Data tabs with a selected state; a drag threshold plus an explicit
grip before a sun can move; back-button handling; autosave on pause; the developer telemetry behind
a toggle. None of these prejudge the redesign.

**Phase U.1 — the research**, along the five lenses, delivered as `docs/app-ux-research.md` in the
shape `docs/movement-genome-research.md` took: findings per lens, each with what it would cost us
and what it would cost the player, and an explicit note where the sources disagree.

**Phase U.2 — the design**, as increments with cut lines, in the shape of every other plan here.

**Phase U.3 — the owner plays it**, which is the only test that has ever settled anything about this
app.

## 6. How a UI claim gets verified in a project that gates everything

The bar overflow (§1.2) shipped through nine green CI runs. That is the interesting fact of this
review: **every gate this project owns is about the world, and none is about the screen.** The
frame gate compares the display list bit for bit and is completely blind to whether the controls
painted over it fit.

So the research plan owes a gate, and it should be built *before* the redesign, not after:

- **A layout gate.** Inflate the real view tree at several device profiles (small phone, the
  Fairphone 5, a tablet; smallest-width 320 dp upward) and assert that every interactive view is
  fully inside the viewport, that no two interactive views overlap, that every touch target is at
  least 48 dp, and that no text view is clipped. This would have failed on the first build that
  added the ninth button. Robolectric runs this without a device, which matters because CI has no
  screen.
- **A reachability list.** Every lever the browser offers, mapped to the control that offers it in
  the app, asserted to exist and to be enabled. The honest version of "full feature set".
- **`harness/prose.js` extended to the app's own strings.** The level text is gated for reading
  level and word budget; the buttons, dialogs and cards the player reads far more often are not.

That third one has a precedent worth remembering: promoting the prose audit into a gate convicted 32
violations where a manual read had found 8. The instrument is only as honest as the calibration
fights behind it.

## 7. Pre-declared decisions for the owner

**Answered 2026-09-01.** Q1 — **the app becomes the product**: the browser retires to being the
frozen oracle for the *renderer*, as `src/sim/` did for the simulation. Q2 — **research first**,
against the recommendation below, which stands as recorded rather than re-argued. Q3 — **all five
lenses, seriously**. The research is `docs/app-ux-research.md`; §7 there is what the design phase
should build, and §8 is what only the phone can settle.

**U.0 shipped 2026-09-01** — all seven repairs of §5, one commit each, the layout gate green after
every one and its baseline ratcheted from 35 violations to zero. Owed and open: the owner has not
played the repaired build; every claim above the gate's (that it *feels* fixed, not merely that it
measures fixed) waits on that.


**Q1 — May the app's UI diverge from the browser's?** Staying in step keeps one design and one set
of words, at the price of a phone UI shaped by a desktop-and-mobile-web artifact. Diverging gets a
phone-native app and creates a second design to maintain (§3c). A third answer exists: the browser
retires to being the frozen oracle for the *renderer*, as `src/sim/` did for the simulation, and the
app becomes the product.

**Q2 — Repairs first, or one redesign?** §5 recommends repairs first. The counter-argument is that
some repairs would be thrown away by the redesign — true of the bottom bar's overflow strategy,
false of reset, back, autosave and the drag threshold.

**Q3 — How deep should the research go?** The five lenses are a week of reading if taken seriously
and an afternoon if taken as a checklist. L1 and L2 are where the owner's actual complaints live;
L3 is largely settled by reading one specification; L4 and L5 could be deferred without blocking.
