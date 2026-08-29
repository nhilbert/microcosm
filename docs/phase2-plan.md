# MICROCOSM — Phase 2 Plan: The Loop Closes

v1.0 · 2026-08-28 · Supersedes the one-paragraph Phase 2 entry in concept Section 14.
Scope from the concept: full E/P/M/S chemistry, detritus, the decomposer guild (Bacillus, Mycora, Necro), egestion, and a visible mineral audit flat to ±0.1%.

## 1. What Phase 1 taught us — encoded as process rules

**L1 — Headless first, always.** Nine tuning iterations against instrumented death-cause counters found six distinct ecological failure modes before a single pixel was drawn. Phase 2 ecology is tuned entirely in the sandbox tuner before the artifact is touched; the artifact port is one late increment, not the workbench.

**L2 — Multi-seed from the first run.** Single-seed tuning overfit twice (a "fix" that was a lucky trajectory, an extinction that was an unlucky one). The 8-seed harness runs on every parameter change, no exceptions.

**L3 — Close the household budget on paper first.** The predator once had literally zero births because per-kill yield sat below per-cycle upkeep — an arithmetic fact discoverable without simulating. Every new consumer (all three decomposers) gets a one-paragraph energy/matter budget check in this plan before any code.

**L4 — Instrument before guessing.** Death-and-flow counters, not intuition, found the real killers. Phase 2 adds flow meters per compartment edge (photosynthesis, grazing, egestion, decay, uptake) from day one — they double as the audit.

**L5 — Verify every patch.** One silent no-op patch produced a false causal story about what fixed the founding transient. Every scripted patch is followed by a grep/assert that it actually landed.

**L6 — Aggregate the numerous.** The mat-carpet renderer (density field instead of sprites) solved both legibility and performance; detritus and minerals render the same way for free.

## 2. Standing architecture decisions for Phase 2

**D1 — Core extraction with an assembly step.** The sim core moves to a canonical `core.js` consumed by *both* the tuner (Node) and the artifact (assembled into the single-file JSX by a build script). This ends the duplicate-constants risk, makes the tuner a true conformance suite, and is precisely the file a Kotlin port would translate. Cost: one increment. The artifact stays single-file — assembly happens in the sandbox, not at runtime.

**D2 — Species as data before new species.** The review flagged `if (sp===2)` branching as unscalable; Phase 2 adds three species, so the refactor happens *now*, not in Phase 3: a traits table (metabolic coefficients, movement type, diet mask, digestion vector, reproduction params) with dispatch by trait, never by species id. Alternative considered and rejected: bolting three more branches on first is faster this week and strictly more expensive next month — but if you prefer visible chemistry progress over refactor hygiene, say so and I'll invert 2.1 and 2.2.

**D3 — Bacteria are colonies, not cells.** Individually simulated bacteria would explode the entity budget. One Bacillus entity represents a colony: it grows in mass, splits, and is grazed as a unit. This is also how they'll read visually (specks, not fog).

**D4 — Corpses are entities; detritus is a field.** A death converts the body's E/P/M/S vector into a corpse entity (drifting, decaying, emitting death-scent) so Necro has something to find and the world tells death visibly; corpse decay and all egestion flow into the per-cell detritus field, which decomposers graze. Two representations, one conservation ledger.

**D5 — Conservation scope.** Minerals (M) are strictly conserved across four compartments: dissolved field, living bodies, corpses, detritus. Energy is open (light in, dissipation out). Protein (P) is synthesized from E+M by producers and decays back to M — conserved only via its M content. The audit tracks M exactly; float drift is measured first (JS arithmetic is f64; only storage rounds), and M stores move to Float64 arrays if drift exceeds 0.02%/hour.

## 3. The chemistry, concretely

Each organism gains `pr` (protein) and `mn` (mineral) stores beside `en`; structural mass S is a fixed fraction of size and counted in the body vector. Producers photosynthesize E from light, then synthesize P at cost E+M, with M taken up from the local cell (Liebig: the scarcest of E/P/M gates growth and division — this is the *realistic* bloom control Phase 1 lacked, and the working hypothesis **[H]** is that mineral depletion will let us keep blooms honest with less reliance on shading). Digestion applies per-component genome efficiencies; the unabsorbed remainder egests to the detritus field at the eater's position. Reproduction requires all three components in ratio; the card will later show which one is binding ("mineral-starved").

Decomposer budgets (L3, checked on paper):
- **Bacillus** (colony, size ~2 as entity): grazes detritus at its cell, absorbing E and P cheaply and *releasing M to the dissolved field* — the loop's return valve. Upkeep at size 2 ≈ 0.084/tick; a detritus-rich cell must sustain ≥ 0.3/tick intake for fission every ~60 ticks. Feasible iff detritus inflow (deaths + egestion) matches — this coupling *is* the ecosystem, and is the main tuning target.
- **Mycora** (sessile): consumes detritus and adjacent corpses in a small radius with the best digestion efficiencies in the world, paying zero locomotion — viable wherever detritus locally accumulates (under mats, at bloom graveyards). Spreads by cheap drifting spores; most spores die, which is correct.
- **Necro** (mobile scavenger): follows death-scent to corpses; a corpse is worth ~an entire body vector at high efficiency, so encounter rate can be low — upkeep at size 5 with slow cruising ≈ 0.22/tick means one mid-size corpse (~40E net) buys ~3 minutes. Viable at realistic death rates; starves in paradise, thrives after crashes. Expected and correct behavior: Necro population trails mortality waves.

Cilio's diet stays Drifta+Solara in Phase 2. Adding Bacillus to its menu (as the concept's Phase 3 web intends) re-opens the apparent-competition channel that nearly killed Phase 1 tuning — that link gets added deliberately, alone, in Phase 3, so its effect is attributable (one change per increment applies to ecology too).

## 4. Increments

| # | Increment | Acceptance test |
|---|---|---|
| 2.0 | Extract `core.js`; tuner imports it; artifact assembled by script | 8-seed harness reproduces Phase 1 results bit-identically |
| 2.1 | Species-as-data refactor (traits table, trait-dispatched systems) | 8/8 seeds survive; population bands statistically match Phase 1 (RNG order changes forbid bit-exactness — documented, not hidden) |
| 2.2 | Mineral field + producer uptake + audit + flow meters | Audit flat ≤0.02%/h headless; producers show M-limited bloom arrest |
| 2.3 | P stores, stoichiometric reproduction, digestion vectors, egestion→detritus | Audit still flat; egestion flow meter nonzero; reproduction visibly gated by scarcest component |
| 2.4 | Corpses as entities + decay + death-scent | Every death traceable through corpse→detritus in the ledger |
| 2.5 | Bacillus colonies (detritus grazer, M release) | 4-species 8-seed survival; M return flow closes the loop measurably |
| 2.6 | Mycora + Necro | 6-species 8-seed survival 30 min; Necro tracks mortality waves |
| 2.7 | Artifact port: mineral/detritus render layers (carpet pattern), corpses, 3 store bars + limitation state on card, audit chip in status strip | Phone: ≥30 fps at Phase 2 populations; audit chip flat in live run |
| 2.8 | K6 kill-test: decomposers-off experiment | Pre-committed: if switching decomposers off does NOT visibly choke producers within ~10 min, the chemistry has failed its own justification and gets simplified back — result recorded in the concept either way |

## 5. Risks, ranked

**R1 — Retuning is the budget.** Phase 1 needed 9 iterations for a 3-species chain; Phase 2 couples 6 species through 2 fields. Assume the tuning increments (2.2–2.6) cost as much as everything else combined; the flow meters (L4) exist to make each iteration a diagnosis instead of a guess. **R2 — The loop can be too good:** a perfectly efficient decomposer loop is a perpetual-motion bloom (energy leaks are mandatory at every transfer — enforced in code, checked by an energy-dissipation meter). **R3 — The loop can be too weak:** minerals lock up in an ever-growing detritus/corpse pool and producers starve globally (the real-world "peat bog" outcome) — the compartment stack plot makes this visible within minutes. **R4 — Refactor regression** (mitigated by 2.0/2.1 harness gates). **R5 — Entity budget:** 6 species + corpses could pass 4k entities; colony representation (D3) and, if needed, corpse merging (nearby corpses coalesce) keep the cap.

## 6. What Phase 2 does not do

No new UI beyond the card stores, render layers, and audit chip (charts screen, spawn tool with composition, and settings remain Phase 3+/5). No HGT, no encystment changes, no Cilio diet expansion, no barriers. One phase, one claim: *matter cycles, visibly and exactly.*

---

## Phase 2 closure record (2026-08-28)

Delivered: increments 2.0–2.5 fully; 2.6 partially (machinery complete and verified inert; Mycora and Necro deferred to Phase 3 after nine tuning iterations — Necro because scavengers require the predator kill-flux Phase 3 brings, Mycora because its colonization R₀ stays below 1 on hazard-trickle corpse supply); 2.7's UI items move to the Phase 3 backlog; 2.8 executed at closure: **K6 passed** — decomposers-off (mixing on) kills the predator in 2/3 seeds and strands ~3,900 mineral in the locked pool versus ~900 in the living world. The chemistry visibly matters; the pre-committed simplification clause is not triggered. Final state: four species, 8/8 seeds, audit ≤0.011%/30 min, bit-identical to the 2.5 baseline. Full findings: microcosm-architecture-review.md.
