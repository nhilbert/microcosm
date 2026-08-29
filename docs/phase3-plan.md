# MICROCOSM — Phase 3 Plan: The Web and the Wall

v1.0 · 2026-08-28 · Supersedes the one-paragraph Phase 3 entry in concept Section 14.

## 1. Where Phase 3 starts

Phase 3 inherits more than the original roadmap assumed. Already done from its original scope: encystment, event-sourced interventions, most god tools, and the behavior machinery. Newly inherited *into* it: Necro and Mycora with their complete mechanics (deferred with named causes: both need the predator kill-flux this phase creates), the 2.7 UI backlog (store bars, limitation badges, detritus layer, corpse aggregation, LOD), and the four review pre-work items (RNG contract + fast conformance, `normalizeTraits`, `ui.jsx` split, render budget). The purpose remains fixed, and its flagship is the split–diverge–reconnect experiment — which makes **barriers the single most important deliverable of this phase**, ahead of species count.

## 2. Phase 2 lessons, promoted to Phase 3 rules

The Phase 2 process rules (headless-first, 8-seed always, paper budgets, instrument-before-guessing, per-edit patch verification) carry over unchanged. New rules earned this phase: **R-N1, suspect transport before metabolism** — both hard Phase 2 problems were plumbing (mineral mixing, scent range), so any "species X starves amid plenty" finding triggers a spatial-distribution diagnostic first. **R-N2, name the niche axes before coding a guild member** — the decomposer guild collapsed twice because coexistence axes (substrate, corpse freshness, dormancy economics) were discovered by failure instead of designed; every new species below has its axes written down in advance. **R-N3, paper-check colonization R₀** for any sessile or spore-dispersed species (Mycora's killer). **R-N4, stage the arrivals** — higher trophic levels enter after their resource base establishes (the founding-transient lesson, now standard). **R-N5, deterministic timestamps are diagnostic gold** — uniform event times mean mechanism, not ecology; grep for them first.

## 3. The scope decision — read this section as a decision, not information

The concept promises twelve species. Phase 2's empirical cost curve (nine iterations to *fail* to add two decomposers to a working world; every trophic link a multi-iteration negotiation) makes eight new species in one phase a fantasy. The plan therefore cuts Phase 3's ecology to **one complete, deep, three-trophic web plus the full decomposer guild — eight live species** — and defers Filtra (requires the flow-field subsystem), Gastro (armor mechanics), Insidia (ambush verb), and Rex (needs a stable Venator beneath it) to a possible Phase 6. The twelve-species vision is not abandoned; it is re-priced. Alternative: trade the barrier block for two more species — recommended against, because the flagship experiment needs walls and species count is not what makes the world interesting, but it is a legitimate trade.

## 4. Ecology design briefs (niche axes and budgets declared up front, per R-N2/R-N3)

**3.1 — Cilio eats Bacillus.** The deliberate re-opening of the apparent-competition channel, added alone so its effect is attributable. Axes: Bacillus's refuges are dormancy (decision: cysts ARE edible at half yield — hiding must not be free) and dispersion (colonies sit where Cilio rarely patrols). Risk, stated in advance: Bacillus subsidizes Cilio through Drifta crashes → Drifta suppression (the Solara-subsidy pattern of Phase 1). Countermeasure ready: low digestion efficiency on Bacillus (0.25) so it is survival food, not growth food. Accept: 8/8 with Drifta bands statistically unchanged versus the 2.6 baseline.

**3.2 — Venator, the first true predator.** Traits: steer movement, diet = CILIO, size 9, jet-burst as a *cost spike* (short speed multiplier with cooldown — no new verb, a steer parameter), staged arrival ~t=1,500 as cysts waking on prey presence. The paper budget written first, as Phase 1 taught: Cilio at size ~6 yields ~35–45 body energy × 0.55 efficiency ≈ 22 net per kill; Venator upkeep ≈ 0.5/tick with pursuit; one kill buys ~45 s — viable at kill intervals under ~400 ticks, which ~60 standing Cilio support. Population ceiling: single digits to low tens — correct for an apex-adjacent predator and cheap to render. **Prey side is the real work:** Cilio gets the automaton's missing Flee state — an alarm scent emitted on attack (field exists), flight gated by a fearfulness trait, and the escape-jink mechanism generalized (already trait-shaped). Necro's food supply is the byproduct: every Venator kill leaves a fresh mid-size corpse. Accept: 8/8 with all six species; Venator min ≥ 3; Cilio bands reduced but stable.

**3.3 — Necro returns.** Unchanged mechanics; the hypothesis it was deferred to test: scavengers are viable on kill-flux where they were not on hazard-trickle. Staged arrival after Venator establishes. Accept: 8/8, Necro min ≥ 3, and the run report showing Necro population tracking Venator kill rate (the flow meters make this a one-line check).

**3.4 — Mycora returns.** Colonization R₀ fixed on paper first: founders seeded into the detritus ring (not uniform), spore spread 60 (local, near the parent's proven substrate), cooldown 60; the fungal field, freshness partition, and cheap dormancy all stand from 2.6. Accept: 8/8 with all eight; Mycora min ≥ 8; Bacillus bands statistically unchanged (the guild axes hold).

**3.5 — Chlora, the mixotroph (stretch, may be dropped without ceremony).** Photosynth + steer + diet = BACILLUS, switching by light: the organism that is plant in the sun and hunter in the shade. Zero new mechanics — a pure traits row, and the most conceptually charming specimen card in the app. Include only if 3.1–3.4 land under budget.

## 5. Barriers and compartments — technical design

**Wall representation.** `Uint8` wall mask on the grid; painted/erased via `wall` events (grid-cell runs, event-logged, undoable as inverse paint). **Physics:** organism movement resolves against the mask with sliding collision (cheap: reject the wrapped position component-wise); all field diffusion (mineral, scent) and the detritus leach treat wall cells as no-flux; light is unaffected (from above). The elegant Phase-1 consequence still holds and now matters: blocked diffusion blocks smell, so nothing pathologically presses against walls — no pathfinding needed, and it emerges rather than being coded. **Housekeeping:** painting over occupied cells nudges organisms and relocates corpse/detritus vectors to the nearest open cell — the ledger must not notice walls. **Compartments:** flood-fill labeling on wall change (trivial at 64²), compartment id per cell; the audit, population counts, and flow meters gain a per-compartment dimension, surfaced as a compartment card when one is tapped. Acceptance is the concept's original: **a walled-off compartment maintains its own independent, flat mineral audit** — conservation proven per-region, which is the quietly impressive result.

**The sun problem (K7, now due).** A sealed compartment far from the sun starves by construction. Both concept resolutions get built: an ambient-light floor (exists as `P.ambient`, promoted to a visible setting) and **orbit mode** — the sun traversing a slow circle, default-on when walls exist. New contradiction to log now, **K9: orbit versus sessile producers** — mats cannot migrate; a moving sun kills each mat field left in shadow and reseeds by spores in light. That is either a beautiful seasonal dynamic (mats as annual vegetation) or an extinction machine, and only the harness will say which; orbit period is the tuning knob, and the headless orbit test is a mandatory increment, not a UI toggle shipped untested.

**UI.** The Intervene tray becomes a real tool row (sun / wall / erase), grid-snapped wall preview, amber per the two-temperature rule; compartment tap-card with per-region populations and mineral bar. This is where the deferred 2.7 card work (three store bars, "mineral-starved" / "protein-starved" badges) also lands, because the specimen card must explain the chemistry to whoever opens it.

## 6. Increments

| # | Increment | Acceptance test |
|---|---|---|
| 3.0a | RNG-contract block + fast conformance mode (2 seeds × 3k ticks) | Contract documented; fast check < 5 s; wired into the patch workflow |
| 3.0b | `normalizeTraits()` + trait schema doc | All defaults removed from use sites; 8-seed bit-identical |
| 3.0c | `ui.jsx` split + corpse aggregation below zoom threshold + bacteria dot-LOD + card store bars & limitation badges | ≥ 50 fps at 16× at Phase-2 populations on the reference phone; chemistry legible on the card |
| 3.0d | Usability test: one uninitiated person, their phone, no coaching | Written list of their first three confusions; fixes triaged before 3.1 |
| 3.1 | Cilio–Bacillus link | 8/8; Drifta bands unchanged vs baseline |
| 3.2 | Venator + Cilio flee/alarm | AMENDED (accepted 2026-08-28): establishes 8/8, persists ≥23 min 8/8, full 30 min ≥6/8; late extinction = natural apex turnover with verified post-extinction stability; re-immigration as labeled Phase 5 option |
| 3.3 | Necro on kill-flux | EXECUTED & DEFERRED (2026-08-28): hypothesis half-confirmed — Necro survives 8/8 on kill-flux, but crashes Venator (kleptoparasitism on cached kills; 1/8). One extension (carcass-dominance gate) spent and failed. Re-entry condition: predator surplus margin. World verified bit-identically restored to 3.2 state. |
| 3.4 | Mycora with fixed colonization | EXECUTED & DEFERRED (2026-08-28): both failure modes at once — marginal R₀ where it fails, predator-cache robbery where it succeeds (sessility falsified as protection). Extension not spent (no single fix addresses both). Joint re-entry condition with Necro: predator surplus margin. |
| 3.5 | Chlora (stretch) | DROPPED without renegotiation, per its own clause (decision to stabilize, 2026-08-28). |
| 3.6–3.9 | Barriers/compartments/orbit block | DEFERRED by decision (2026-08-28): stabilize first, then reproduction/genetics, then polish. Consequence recorded: the split–diverge–reconnect experiment has no vehicle until this block returns. |
| 3.7 | Compartment labeling + per-compartment audit/populations | Sealed compartment: independent flat audit over 10 min |
| 3.8 | Orbit mode + ambient floor + K9 orbit tuning (headless) | 8/8 under default orbit period; mats persist as a migrating population |
| 3.9 | Barrier/compartment/orbit UI (tool row, previews, compartment card) | Manual split–run–reconnect performable end-to-end on the phone |

Phase acceptance: the original concept test, upgraded — **a three-trophic web of eight species persists 30 minutes on 8/8 seeds; a walled compartment keeps an independent flat audit; and the split-world experiment is manually performable on a phone.** Stabilizer disclosure (the concept's honesty clause): the world runs with no immigration trickle and no artificial floors beyond the mat seed-bank (`grazeFloor`, defended as sediment refugia) and escape jinks (defended as real prey behavior); staged arrivals affect founding only.

## 7. Risks, ranked

**R1 — Predator tuning is the budget**, again: assume 3.2 alone costs what all of 2.2–2.5 cost; the flee/alarm system doubles the moving parts. Mitigation: alarm/flee is built and verified on the *existing* Venator-free world first (alarm triggered via god-tool kills), so 3.2 tunes one new species, not two new systems. **R2 — Apparent competition (3.1)** is invited on purpose; the abort criterion is written into its acceptance. **R3 — K9** could make orbit mode an extinction machine; it is tuned headless before any UI exposes it. **R4 — Barrier edge cases** (diffusion at corners, torus-wrapping walls, paint-during-run races) — mitigated by the event system (paints apply at tick boundaries) and a dedicated wall-fuzz test in 3.6. **R5 — Scope creep via the returning species:** Necro and Mycora re-enter with their 2.6 mechanics frozen; any tuning beyond founder/arrival parameters triggers the same one-extension-then-defer rule that governed 2.6, pre-committed here.

## 8. Not in Phase 3

Genetic variation beyond size, pigment drift, sexual reproduction, speciation (Phase 4/5 per concept); the reliability-aging engine (Phase 4); charts screen, presets, snapshots, scenario cards (Phase 5); Filtra, Gastro, Insidia, Rex (Phase 6, if ever); flow field/currents (with Filtra). One phase, one claim: *a real food web behind a wall you can build and tear down.*

## 9. Open questions before 3.0

1. **The species cut (Section 3):** confirmed, or trade barriers for web breadth?
2. **The usability test (3.0d):** run it with one real person before the ecology work starts? It is the cheapest high-value item in the plan and the only one that cannot be done from inside the sandbox.
3. **Scenario timing:** if guided scenarios are wanted sooner rather than later, Phase 5's scenario work should interleave with Phase 3 rather than follow it, and the plan would be re-cut accordingly.

---
**Decisions (2026-08-28):** species cut confirmed; usability test deferred until after Phase 3 (accepted trade: first-user corrections arrive late); no deadline — best effort. Phase 3 execution begins with 3.0a.
