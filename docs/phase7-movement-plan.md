# Phase 7 MV — The Movement Genome (preliminary design)

v0.1 · 2026-08-30 · **DRAFT for owner review** — decisions D1–D7 at the end are open; nothing here ships until they land. Built on docs/movement-genome-research.md (the four-lens research and its §6 synthesis) and the substrate inventory in that document's §1. Owner order context: the UI block (species panel, locus visual grammar) is queued ahead of this phase; the elongation channel this plan uses is delivered there.

## 1. Principles (carried in from the research, restated as build rules)

1. **Parameters, never controllers.** Wiring, taxis rung, arbitration ordering, and draw structure stay species identity. Loci are scalar, monotone, one-signed, expressed draw-neutrally at the sites inventoried in research §1.2, exactly neutral at g0.
2. **Price realized kinematics.** Motion loci ride the existing quadratic-in-realized-velocity cost; navigation loci (set-points, gains) are priced by exposure through the fields, not by upkeep. New harness assertion at every movement corridor rail: energy per realized distance stays monotone (the anti-Sims check).
3. **Certify in the loop.** Movement corridors are certified across field layouts (shipped sun, hot sun, heater, press, unwarmed), not only genome corners — a movement locus balanced under one geometry is not thereby balanced under another (H.3 corner extinctions are the precedent).
4. **Instrument before knob.** MV.0 ships the movement observatory and measures reference bands in the shipped world *before* any locus goes live.
5. **Legibility or explicit exemption.** Every locus passes the 10-second rail test or is designated Observatory-only in its record.
6. **One structural rule amendment is required** (CONTRIBUTING/genetics-scaling): today "a locus expression may only scale a rate or a probability, never a stock." A set-point locus *shifts a reference*. Proposed amendment: "…scale a rate or a probability **or shift a bounded reference/threshold**, never a stock." `checkLocus` gains a case bounding additive reference spans the way it bounds multipliers. This is an owner-visible rule change (D1 gates the phase; the amendment ships with MV.1).

## 2. Increments (one at a time, each closed before the next)

**MV.0 — Movement observatory + substrate (observer-only, bit-identical).**
- Recorder: extend per-species locus coverage from 2 planes to MAXLOCI 4 (+14 channels), add per-mobile-species movement metrics — gradient alignment (mean cos θ, velocity vs. field gradient), mean run length/straightness, occupancy entropy — ≈ +12–15 channels, plus the **trap detector**: occupancy-weighted realized energy balance ("the population is concentrating where its budget is negative", worded *since*, calibrated against bands measured here). MSD-regime estimator lives in harness/lib.js (with selftest cases), not in the recorder.
- Zero PRNG draws, no dynamic-state mutation; conformance fingerprints must be bit-identical, hash rebound with declared reason ("MV.0 recorder extension").
- Deliverable: measured reference bands for every movement metric in the shipped world + the four heat/light scenario worlds; detectors calibrated (control silent).

**MV.1 — Drifta warmth-preference locus (the flagship; declared ecology change).**
- Name: "Warmth preference — thermotaxis set-point." Expression (draw-free, at the existing thermotaxis comparison): `tp = T.topt + L.tprefSpan·(g − g0)`, sgn compared against `tp` instead of `T.topt`. At g0: bit-identical. In an unwarmed world the branch is gradient-gated → the locus is inert; selection-story detectors gated accordingly (drift is not narrated, the H.5 pattern).
- No synthetic price: the set-point *is* exposure (research §2.1, §4.8). tprefSpan sized by measurement, but see D3 — the rails should make trap escape physically possible (tp below the +8 core's edge warmth at the low rail), else the flagship experiment cannot falsify anything.
- σ 0.03 shipped (D4); corridor [0,1]; rails across field layouts per principle 3.
- **Flagship experiment / candidate phase gate — the trap-escape test**: same-seed A/B at the +8 sun, locus live vs. frozen, σ swept {0.03, 0.06, 0.09, 0.12}. Pre-registered predictions (research §6.4): (a) escape is threshold-like in σ; at 0.03 collapse may still outrun selection — *that is the expected, honest result*; (b) where escape occurs, the Bogert interaction: selection on the H.5 thermal-compensation locus stalls measurably; (c) heater-patch worlds show local set-point adaptation (the analogue of H.5's adapt 5/8). Gate: the Observatory narrates whichever outcome occurs (trap detector fires ahead of collapse in non-escaping worlds; adapt/sweep detectors in escaping ones); control worlds silent.

**MV.2 — Drifta restlessness locus (rover/sitter).**
- Name: "Restlessness — exploration vs exploitation." Syndrome expression with fixed signs at the two existing drift draws: noise × (1 + rsSlope·d) and damp pulled toward 1 by a bounded term (rover = stronger kicks, straighter persistence; sitter = the reverse). Exact form is a design-phase measurement (damp is delicate near 1 — the damp term needs a hard cap < 1).
- Price: automatic — realized-velocity quadratic cost plus predation exposure. The scientific target is **frequency-dependent balance** (research §3.3), a new maintenance mechanism: test by invasion-from-rare in both directions (pin g distribution, seed 5% minority, 8 seeds). Secondary free prediction: spatial sorting after seeding events (allele frequency vs. distance from population core).
- Takes Drifta to 4 loci = MAXLOCI. Elongation grammar channel binds here (delivered by the UI block; see D7).

**MV.3 — Bacillus search-style locus (tumble).**
- Name: "Search style — run length." Expression at the existing tumble-threshold draw: tumbleLow/High × (1 − tumbleSlope·d) (g high = smoother/longer runs, g low = twitchier/tighter). The most literal genotype→controller mapping in biology (che circuit).
- Blocked on D5 (the tumble branch's flat `T.speed²` cost — realized-pricing fix is a declared change that must be decided before this locus sits on top of it). Prediction: run statistics adapt to detritus patchiness; smooth alleles collapse toward the cheap rail where food is uniform — narrated as loss, not failure.

**MV.4 — Cilio warmth-preference unblinding.**
- Give Cilio a small fixed thermo gain (measured, ~0.2–0.3) governed by a heritable set-point locus, idle-branch only, draw-free — evolution pricing what hard-coding got wrong (3/8 core loss when fed hunters walked away from prey). Venator stays excluded (N≈25 drift-dominated; the genetics-phase honesty rule extends).

**Deferred, with re-entry conditions**: speed loci (re-enter with the elongation grammar shipped and MV.1–2 records closed); boldness/flee-threshold (re-enter when a diversifying story is wanted for Cilio); protean escape-angle (re-enter after a measured pursuit arms race exists); heritable plasticity rate (re-enter only as its own declared phase — research §3.4 honesty note applies until then).

## 3. Harness

`harness/move.js` in the heat.js pattern: `--trap [--sigma S] [--frozen]` (MV.1 A/B + sweep), `--invade sp,dir` (MV.2 frequency dependence), `--sort` (post-seeding spatial sorting), `--metrics` (band capture for MV.0). Corridor.js gains `--fields` (layout sampling per principle 3). Anti-Sims monotonicity assertion runs inside corridor rails. All under `npm run` scripts; selftest covers the MSD estimator (the Yoshida quarter-period lesson).

## 4. What this phase does *not* claim

The flagship's expected first result at shipped σ is that evolution does **not** outrun the trap — the phase's honest deliverable is a world that can finally be *asked*, plus the measured escape threshold if one exists in the legal σ range. Inherited set-points are recorded as the model's known departure from biology (which learns them — research §3.4) in this plan, before measurement, the way the Yoshida non-reproduction was recorded.

## 5. Decisions needed (owner)

- **D1 — Phase scope and order.** Ship MV.0→MV.1 first (set-point flagship; scientifically mandated by the trap record, but its expected first result is a null — an honest "no rescue at σ 0.03") vs. leading with MV.2 (rover/sitter: a positive, visible polymorphism story, faster payoff, weaker mandate). *Recommendation: MV.0→MV.1; the trap is this phase's founding problem and the null is a finding.* Devil's advocate, stated plainly: if the σ sweep shows no escape anywhere in [0, 0.12], MV.1 ships a locus whose headline is that it cannot do the one thing it was built for — the owner should decide now whether that is acceptable as the flagship, because it is the *likely* outcome per the research.
- **D2 — Recorder extension.** 2→4 locus planes (+14 channels) + movement metrics (+~15) + trap detector, with the declared hash rebind. Required before *any* Drifta or Bacillus movement locus (both carry 2 loci already). *Recommendation: yes, in MV.0, once.*
- **D3 — Set-point span at the rails.** tprefSpan sized so the low rail physically clears the +8 core (escape possible by construction, ±2-ish) vs. biologically modest (±1, escape possibly impossible regardless of σ). *Recommendation: escape-capable rails — otherwise the flagship experiment tests nothing; biological modesty is preserved by σ, not by the corridor.*
- **D4 — Shipped σ for MV.1.** Standard 0.03 with the sweep as measurement (recommended), or ship whatever σ the sweep shows escapes (if any) — which would be tuning the world to rescue itself, against rule 6. *Recommendation: 0.03; the sweep is reported, not shipped.*
- **D5 — The tumble-cost inconsistency.** Bacillus pays flat `T.speed²` per tick regardless of realized motion (unlike drift/steer's realized-velocity pricing). Fix to realized pricing (declared ecology change + full re-acceptance) before MV.3, or leave and record. *Recommendation: measure first in MV.0 (how large is the distortion?), decide with data at MV.3 entry.*
- **D6 — Hunter unblinding in scope?** MV.4 reverses a shipped safety decision (`thermo: 0`) behind a locus. In this phase, or deferred to its own block after MV.1's verdict on set-point loci? *Recommendation: keep in phase but last, contingent on MV.1's record.*
- **D7 — Grammar sequencing.** Elongation = mobility is reserved but the UI grammar increment is queued *before* this phase; MV.2 assumes it exists. Confirm the ordering holds (grammar first), or MV.2 ships Observatory-only and the elongation binding follows. *Recommendation: grammar first, as queued.*

## 6. Risks

Research §6.6 applies wholesale (integrator exploits, trap-by-design, sign-flip, dead knobs, positional epistasis, apex drift, the honesty note). Phase-specific addition: MV.1 + MV.2 give Drifta four live loci — the joint corridor is 4-dimensional; rails/fuzz/sample discipline (5.9 pattern) replaces corners entirely, and the two H.3 extreme-corner grazer extinctions may gain siblings — in-corridor findings to document, not tune away, unless the owner rules otherwise.
