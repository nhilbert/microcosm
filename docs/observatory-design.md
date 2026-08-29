# MICROCOSM — Observatory Layer Design (Phase 4)

v1.0 · 2026-08-28 · The centerpiece phase: the instruments that built the system become the product.

## 1. Purpose (amended)

The project's thesis, restated: *a massively complex system, a set of sensible levers, and insightful information on status and development — including the impact of interventions.* The Observatory is pillar three. Design principle: everything that made our own engineering tractable (flow meters, compartment ledgers, extinction diagnostics) moves from the headless harness into the phone UI, in plain language. We are not inventing a dashboard; we are productizing our own lab bench — and grounding every indicator in what real ecosystem science actually measures.

## 2. Research foundations (what real ecology monitors, and what we take from each)

**2.1 Early-warning signals of critical transitions (Scheffer et al., Nature 2009; validated in a whole-lake manipulation by Carpenter et al., Science 2011).** Systems approaching a tipping point exhibit *critical slowing down*: recovery from small perturbations gets sluggish, which shows up in time series as rising lag-1 autocorrelation (approaching 1 near the bifurcation) and rising variance. These are generic — they don't require knowing the mechanism. *We take:* per-species stress indicators computed from rolling windows (AC1 + variance trend), surfaced as calm/tense/critical lights. *Honesty clause:* the literature is explicit that EWS have false positives and can miss sharp transitions; the UI wording is therefore "stress rising", never "collapse predicted". Our Phase 2/3 archives give us labeled collapses to calibrate against.

**2.2 Intervention assessment: BACI designs (Before-After-Control-Impact; standard in environmental effects monitoring).** The gold standard compares change at an impacted site against a simultaneous untreated control; a long-running field comparison found that Before-After-only designs failed to detect real effects that BACI caught. *We take:* our impact cards are honest Before-After (one world, no control — the W-singleton, debt D4, and the deferred barriers both block a true control). Therefore: (a) every impact statement is phrased "since", never "because"; (b) the roadmap notes two upgrades that would make claims causal — sequential seed-replay A/B (same seed, with and without the intervention, feasible today because the sim is deterministic) and, when barriers return, a literal walled control compartment, which would make Microcosm a BACI instrument in the textbook sense.

**2.3 Press vs pulse perturbations (Bender, Case & Gilpin, Ecology 1984).** The founding taxonomy of intervention ecology: a *pulse* is an instantaneous alteration after which the system relaxes back; a *press* is a sustained alteration held until a new equilibrium. The same paper frames a community as a black box whose interaction structure is revealed by observing responses to perturbations — which is literally this product's thesis, stated in 1984. *We take:* every lever gets classified — kill/feed/spawn = pulse (card shows response + recovery time back toward baseline); sun move and future settings changes = press (card shows the transition to a new regime, no "recovery" implied). Recovery time after pulses doubles as a measured resilience indicator.

**2.4 Ecosystem metabolism and succession (Odum's classic energetics).** Lake and stream ecologists monitor gross primary production (GPP), respiration (R), and their ratio; P/R ≈ 1 characterizes mature systems, P/R > 1 growing ones. *We take:* GPP = photosynthesis flow (we meter it), R = total dissipation, displayed with P/R as a one-number maturity gauge. **2.5 Community structure:** Shannon diversity H over species biomass; trophic pyramid shares (producer/grazer/predator/decomposer). **2.6 Nutrient cycling:** turnover time = stock/flux — our "the mineral pool cycles 13× per half hour" finding, productized — plus the locked-fraction (corpse+detritus share) as the strangulation index that Phase 2 proved diagnostic.

## 3. Data substrate (core-side, portable, draw-free)

A recorder in `core.js`, because the Kotlin port must inherit it and the headless harness must share it. Ring buffer: one sample every 20 ticks (2 s at 1×), 900 samples ≈ 30 minutes of history, ~40 Float32 channels ≈ 150 KB fixed. Channels: per-species population + biomass (7×2), mineral compartments (dissolved/bound/corpse/detritus + light-weighted core availability), flow deltas since last sample (uptake, GPP, egestion, mineralization, kill count, corpse-to-detritus), corpse count, mean size per species (the genetics-ready column), sun position. The recorder and every detector **consume zero PRNG draws and never mutate world state** — RNG-contract rule 4 extends to the whole Observatory, and conformance bit-identity with the recorder enabled is the 4.0 acceptance test.

## 4. Auto-event detectors and the event feed

Detectors run at sample cadence over the ring buffer, appending to a bounded system-event log that merges chronologically with the (existing) intervention log: extinction (pop hits 0), establishment (first sustained pop above threshold for N samples), bloom onset/crash (relative growth rate beyond ±bands), depletion warning (compartment below fraction of conserved total), predator arrival (first wake), stress transitions (from §5). Each event carries a plain-language template ("Venator established — 12 hunters", "Drifta bloom collapsing", "Dissolved mineral below 15% — the water is running dry"). The feed is the narrative spine: a user returning after five minutes reads what happened as a story.

## 4b. The lever pack (review finding: insight without levers starves the thesis)

Phase 4 gains two levers so the impact machinery has real material: **light intensity** (a press lever — a settings slider scaling the sun's output; the first true settings-surface item) and **fertilize** (a pulse lever — an amber mineral pour at a tapped location, the whole-lake-fertilization classic). Fertilize deliberately amends the conservation story rather than breaking it: the ledger becomes "closed except where your hand added", and the mineral bar grows an amber tick marking cumulative human additions — conservation *with visible provenance*, which is the stronger story. Both levers are events (undoable, logged, replay-safe).

## 5. Derived indicators (the health dashboard)

Computed on demand from the buffer: Shannon H; trophic pyramid shares; GPP, R, P/R; mineral turnover time and locked fraction; per-species volatility (CV over rolling window); per-species stress light from EWS (rolling AC1 + variance slope over ~60-sample windows, thresholds calibrated on our archived collapse runs — we possess ground-truth labeled data most ecologists would envy, because we caused the collapses ourselves and kept the seeds).

**Naming rule (review finding):** every indicator's primary label is plain functional language — *Variety* (subtitle: Shannon diversity), *Production vs. consumption* (P/R), *Recycling speed* (mineral turnover), *Strain* (early-warning stress), *Locked away* (locked fraction). The scientific term is the subtitle, never the headline. The intervention vocabulary (press vs. pulse, "since ≠ because", strain-before-collapse) is deliberately the language of intervening in a complex system, and the cards should read that way.

**Calibration verdict (4.2, recorded):** tested against archived ground truth, generic EWS statistics misfired both ways — absolute thresholds flag slow-lifecycle species (mats carry naturally high AC1), and baseline-relative thresholds normalize chronic decline (the K6 press-ramp produced one warning). *Strain* therefore leads with mechanistic vitals — mean energy-reserve level and trend, population trend — which our own diagnostics validated all phase; AC1/variance ship as a clearly-labeled experimental overlay. The honest summary: we tested the famous method against ground truth and kept it advisory.

**EWS scope restriction (review finding, statistical soundness):** stress lights compute only for species whose rolling mean population ≥ 50 — autocorrelation and variance on a ~25-head predator population is demographic noise, a failure mode the EWS literature itself flags. Venator instead gets the two leading indicators our archives show would genuinely have predicted its late extinctions: mean energy reserve per hunter and kill-rate trend.

## 6. Intervention impact analysis

Every intervention already logs tick + payload. On each one, the Observatory opens a BA window: baseline = the 30 samples before, response = the samples after (pulse: until indicators re-enter baseline bands or 90 s elapse; press: until bands stabilize around new means). The impact card then reports, per affected channel, delta and (for pulses) recovery time; wording per §2.2 ("Since the kill: ..."). Overlapping interventions collapse into one combined window with an honest "multiple interventions — effects mixed" label rather than fake attribution. Amber markers land on every chart at intervention ticks: the two-temperature rule extends to data — the world's story in cool colors, the human's touches in amber.

## 7. UI surfacing (Data mode — the reserved third mode)

Swipeable full-screen pages, canvas-drawn from the ring buffer (no chart library), scrubbable: **(1) Populations** — 7 series, amber intervention markers, event flags; tap a flag for the event card. **(2) Chemistry** — stacked area of the four mineral compartments summing to the conserved total (the strangulation view; the K6 story told live). **(3) Metabolism & flows** — GPP, R, P/R, mineralization rate, kill rate. **(4) Health** — the §5 dashboard: diversity, turnover, locked %, per-species stress lights. **(5) Events** — the merged narrative feed, newest first, impact cards inline. The status strip gains nothing (it is already dense); the specimen card stays as-is. This work triggers the deferred `ui.jsx` split (its declared trigger — "before the charts screen" — has now arrived): 4.3 begins with the component split.

## 8. Increments

| # | Increment | Acceptance |
|---|---|---|
| 4.0 | Recorder ring buffer + channels in core; harness reads it | Conformance bit-identical with recorder on; memory bound verified |
| 4.1 | Detectors + system-event log + plain-language templates | Replaying archived Phase-2/3 seeds emits correct events at known ticks (extinctions, establishments) |
| 4.2 | Indicators: H, pyramid, P/R, turnover, locked %, EWS stress (pop ≥ 50 rule; Venator reserve/kill-rate indicators) | Headless: stress lights fire before ≥2 of 3 archived collapses, with false-positive rate reported honestly |
| 4.2b | Lever pack: light-intensity press, fertilize pulse (amber provenance on the ledger) | Fertilize logged/undoable; mineral bar shows amber added-by-hand tick; audit closed net of recorded additions |
| 4.3 | ui.jsx component split, then Data mode shell + Populations page | 60 fps world untouched; chart scrub usable on phone |
| 4.4 | Chemistry + Metabolism + Health pages | Compartment areas visibly sum constant; badges match harness numbers |
| 4.5 | Event feed UI + intervention impact cards (BA windows, press/pulse) | Kill a mat cluster → card reports local release + recovery; sun drag → press card reports regime shift |
| 4.6 | Retro-detection acceptance: run K6 (decomposers-off) under full Observatory | The instrument must tell the strangulation story unprompted: depletion warnings, rising locked %, Cilio stress, extinction events — the Phase 2 discovery, rediscovered automatically |

4.6 is the phase gate: if the Observatory can autonomously narrate the collapse we spent Phase 2 diagnosing by hand, the centerpiece claim is proven.

## 9. Risks

**R1 — EWS credibility:** false alarms are certain (literature says so); mitigated by wording ("stress", not prophecy) and calibration on archived runs. **R2 — Chart performance:** canvas redraw at 2 s cadence + on-demand scrub only; no per-frame chart work. **R3 — Scope creep in indicators:** the §5 list is closed for Phase 4; anything else goes to a backlog. **R4 — Attribution overreach:** the BA design cannot prove causation; every card carries the "since ≠ because" discipline, and the seed-replay A/B upgrade is the sanctioned path to stronger claims. **R5 — ui.jsx split regression risk:** mitigated by doing the split as its own zero-behavior-change step with device check before any chart lands on it. **R6 — The first three minutes (review finding):** a fresh world has no history; EWS needs ~2 minutes of samples and charts need a past. Reading the indicators therefore wants a warmed world: run 3–5 minutes at 16× first — and the world-snapshot feature (currently Phase 5) is flagged as the structural fix, decision at 4.5. **R7 — Usability test:** Phase 3 has closed, the deferral condition is met; putting the app in front of one uninitiated person before 4.3 builds the chart pages is the cheapest correction available and is formally recommended here.

---

## Phase 4 closure record (2026-08-28)

All increments delivered (4.0–4.6, incl. 4.2b levers; the usability test remains outstanding). **The 4.6 gate passed on all five criteria:** the finished Observatory, given the K6 decomposers-off world, narrates the strangulation unprompted — early flow warning ("mineral is flowing into dead matter faster than it returns") 7 minutes before the grazer's death, lock-level warning, sustained CRITICAL strain with a 712-second lead, and the extinctions in their ecologically correct order (predator starves before prey) — while the healthy control stays fully silent (0 false collapse warnings, 2.6% critical vitals flags). The depletion detector alone took five calibration iterations, each of my theories failing against measurement: level thresholds (healthy worlds dip lower than dying ones), dissolved-trend (healthy *growth* also drains the pool), destination-conditioning (crash transients), window-lengthening (secular growth), before landing on locked-share trend + level floor with a founding-edge guard. That saga is the phase's honest epitaph: every insight this instrument reports was earned against ground truth, usually over my own first theory's dead body. Conformance remained bit-identical through every change — the entire Observatory is provably a pure observer.
