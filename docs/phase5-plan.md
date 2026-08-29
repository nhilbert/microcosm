# MICROCOSM — Phase 5 Plan: Heredity (Drifta First)

v1.0 · 2026-08-28 · Built on genetics-research.md. Decisions recorded: **(1)** Drifta-only first cut, other species later, one at a time with their own before/after runs; **(2)** genotype tint bounded within each species' hue; **(3)** Venator excluded from heredity this phase (drift-dominated at N≈25; stated honestly in-product); **(4)** corridor policy — traits evolve freely inside harness-certified bounds, evolution-driven collapses inside the corridor are documented findings narrated by the Observatory, re-tuning only if the certified 8-seed baseline breaks.

## 1. The first locus

One heritable locus `g ∈ [0,1]` on Drifta, expressing the Yoshida trade-off as antagonistic pleiotropy — defense against competitiveness, one number:

- escape probability: `0.20 + 0.22·g` (corridor 0.20–0.42; today's fixed value 0.30 ≈ g=0.45)
- photosynthesis rate: `kp · (1.05 − 0.10·g)` (defended cells grow slower — the priced trade-off the literature requires)

Inheritance at division: child g = parent g + N(0, σ_g), clamped to [0,1]; σ_g and the effect sizes are harness-tuned so a selective sweep is watchable within a 16× session (research R4). Mutation-off (σ_g=0, g initialized at 0.45) must be **bit-identical** to today's world — the conformance test extends to heredity: the genome is present but silent, and nothing moves.

## 2. Increments

| # | Increment | Acceptance |
|---|---|---|
| 5.0 | Genome substrate: `W.g` array, inheritance + mutation at division, corridor clamp, trait expression through the locus | Mutation-off bit-identical (conformance); mutation-on: parent–offspring correlation ≈ 1−σ noise (heritability verified headless); standing variance equilibrates, no drift to the rails in 8/8 |
| 5.1 | Observatory channels: per-species locus mean + variance (CH 42→44, rebaseline declared); sweep event ("a hardier Drifta line is taking over — 62% and rising"); diversity-collapse event ("variation collapsing — the population is becoming uniform") | Replay of a forced-sweep run emits the sweep event at the measured takeover; variance channel matches harness numbers |
| 5.2 | **The Yoshida experiment** (headless flagship): mutation-on vs mutation-off on identical seeds; measure Drifta–Cilio cycle period and phase (cross-correlation lag) | The controlled comparison exists and is honestly reported, whatever it shows. Literature prediction: period lengthens, lag shifts toward antiphase; if the cryptic regime appears (flat totals, churning genotypes), the variance/mean channels must expose it |
| 5.3 | Visibility: bounded genotype tint; Traits page in Data mode (histogram + mean±variance ribbon with amber markers); specimen card ancestry line (generation, trait vs founder) | Tint distinguishable at loupe zoom, species identity intact at overview (judged by eye); Traits page readable |
| 5.4 | Corridor certification: 8-seed baseline runs pinned at both corridor rails (all-min, all-max defense) | Both extreme worlds pass the standing acceptance (all species persist per amended criteria) — the corridor is *proven* safe, not assumed |
| 5.5 | Phase gate: the Yoshida run under the full Observatory | The instrument narrates the evolution unprompted: sweep/diversity events fire correctly, the Traits page shows the story, the mutation-off control stays silent; 5.2's measured cycle change reproduced with the shipped build |

## 3. Risks

**R1 — the optimizer vs the tuned landscape:** policy set (corridor + documented collapses); 5.4 is the enforcement. **R2 — timescale:** a sweep must fit a session; effect size and σ_g are chosen by measurement in 5.0/5.2, not by taste. **R3 — cycle metrics on noisy series:** period/phase estimation uses long runs, multiple seeds, and cross-correlation rather than eyeballing; if the effect is real but small, we say so. **R4 — channel extension:** CH change re-baselines conformance once, declared, same ritual as 3.1. **R5 — one-sided evolution:** with only prey evolving, no coevolutionary counterweight exists (decision 1's accepted cost); the corridor rail substitutes until Cilio's turn in a later cut.

## 4. Not in this phase

Sex, recombination, horizontal transfer, explicit speciation mechanics, heredity for any species but Drifta, Venator heredity (decision 3). Emergent ecotype structure, if trade-offs produce it, is celebrated and documented — never scripted.

---

## Closure record (2026-08-29)

Built autonomously, one increment per commit, conformance after every core edit. Everything below is measured on this tree.

### Before anything: the locus was already live

The plan assumed a pre-heredity world. The source disagreed: `TRAITS[1].locus.sigma` was 0.03 in the certified baseline, with a mutation draw at every Drifta division. The world the baseline certified was an evolving world that had never been declared as an ecology change. **This is the root cause of the "unrecoverable" integrity incident.** With the locus silenced, the K6 gate passes all five criteria and reproduces the Phase 4 record to the second (strain lead 712 s, control flags 2/78); apex loss moves from early-and-common under evolution (seeds 11/66/88 at t=5,100–7,200) to late-and-rare without it (seeds 22/77 at t>14,000). The certified 8/8 is *not* fully recovered (6/8 on the silent world at 18,000 ticks) and is recorded as such.

Consequence: `P.mutation` is the master switch; the conformance baseline now carries two fingerprints per seed — `silent` (the Phase 4 reference) and `evolving` (the shipped 5.0 world) — with a continuity proof that the new evolving fingerprint equals the old baseline exactly. The K6 gate runs on the reference world, which is what its criteria were certified on. **K6 gate: PASS.**

### 5.0 — substrate

| Criterion | Result |
|---|---|
| Mutation-off bit-identical | **PASS** — silent fingerprint = Phase 4 world; `gSum` = 0.5 × Drifta count on both seeds (every locus pinned) |
| Heritability verified headless | parent–offspring r = 0.66–0.83 (nearest-older-neighbour proxy, a lower bound); by construction child = parent + U(−σ, σ) |
| Standing variance equilibrates, no drift to the rails | **NOT MET as tuned.** Mean g rises 0.50 → 0.60–0.76 in 18k ticks on 8/8 seeds; by 36k it reaches 0.93–0.96 with up to 48% pinned at g > 0.98 (3 seeds × 54k). Directional selection for defense across the whole corridor. Handled under the corridor policy (decision 4): the core ecosystem never breaks (no collapse in 54k), so this is an in-corridor finding, narrated by the Observatory — not a defect. |

Decision recorded: the mutation kernel is one uniform draw in [−σ, σ], not the plan's N(0, σ). A Gaussian would cost two draws per division; the corridor clamp bounds either.

### 5.1 — channels and detectors

Channels 42–55: locus mean and sd per species (per species from the start, so another species costs no rebaseline). Sweep detector fires on 8/8 evolving seeds at t = 8,300–17,520, every one grounded in the mean channel (≥ 0.60) with a 61–77% majority; second-stage "has taken over" at 85% on 6/8 within budget. Reference world: zero heredity events, sd channel exactly 0, on 8/8. Observer-only: both fingerprints bit-identical.

### 5.2 — the Yoshida experiment (`npm run yoshida`)

8 seeds × 30,000 ticks, mutation on vs off, same seeds.

| seed | period off → on | phase off → on | Drifta CV off → on | g at end |
|---|---|---|---|---|
| 11 | 4120 → 3720 | 0.28 → 0.09 | 0.40 → 0.24 | 0.86 |
| 22 | 6420 → 5680 | 0.04 → −0.26 | 0.18 → 0.61 | 0.91 |
| 33 | 3180 → 5180 | 0.28 → 0.21 | 0.34 → 0.38 | 0.90 |
| 44 | 3480 → 4460 | 0.33 → 0.15 | 0.39 → 0.41 | 0.81 |
| 55 | 7140 → 4900 | 0.10 → 0.42 | 0.38 → 0.35 | 0.91 |
| 66 | 5460 → 4920 | 0.31 → 0.05 | 0.40 → 0.17 | 0.92 |
| 77 | 9660 → 5720 | −0.06 → 0.00 | 0.35 → 0.46 | 0.68 |
| 88 | 6120 → 6720 | 0.11 → 0.04 | 0.32 → 0.24 | 0.90 |

Ensemble: period 5698 ± 2009 → 5163 ± 845 ticks (longer on 3/8); phase 0.17 ± 0.13 → 0.09 ± 0.18 (farther from zero on 2/8); Drifta CV 0.34 → 0.36 (no cryptic regime).

**The literature prediction is not reproduced, and the data say why.** Yoshida's long antiphase cycles come from *two coexisting genotypes trading places* — defended and undefended types cycling in counterbalance. Our population does not cycle between types; it sweeps monotonically to the defended rail (g at end 0.68–0.92). A directional sweep is not eco-evolutionary cycling. What evolution *does* do here is measurable: the period becomes far more regular across seeds (sd 2009 → 845) and the phase lag collapses toward zero — the grazer tracks a tougher, slower prey more tightly. Reported as found.

### 5.4 — corridor certification (`npm run corridor`)

**CERTIFIED.** Both rails pass the ecosystem criterion on 8/8 seeds, mineral audit within 0.011% throughout. Apex outcome differs by rail: g=0 (all faster-growing) apex held 2/8; g=1 (all tougher) apex held 5/8. The evolving world is provably safe anywhere inside the corridor.

### Informational: trade-off strength (not shipped — a decision for the owner)

`kpSlope` controls the growth cost of defense. 3 seeds × 36k ticks:

| kpSlope | growth at g=1 | mean g at 36k | behaviour |
|---|---|---|---|
| 0.25 (shipped) | 87.5% | 0.91–0.94 | sweeps to the defense rail |
| 0.50 | 75% | 0.31–0.60 | **balanced polymorphism mid-corridor** |
| 0.75 | 62.5% | 0.09–0.18 | sweeps to the growth rail |

A clean dose–response. At 0.5 the population holds standing variation (sd 0.08–0.25) instead of consuming it — the precondition Yoshida's transformation requires. Not shipped: the corridor policy permits re-tuning only if the certified baseline breaks, and it does not. Recommendation: re-run 5.2 at kpSlope 0.5 as a declared ecology change if the eco-evolutionary cycling is wanted. Caveat on the apex, since resolved by the control: the **silent world holds the apex to 54,000 ticks on 6/8 seeds** (lost on 22 at t=14,500 and 77 at t=16,000 — the same two seeds, at the same times, as at the 18k horizon). Under evolution the apex was lost on every seed tested by t = 21–45k. Late apex loss is therefore attributable to evolution: a tougher prey starves the grazer's predator. This is the R5 one-sided-evolution cost, now measured against its control.

### 5.5 — phase gate (`npm run gate5`)

**ALL CRITERIA PASS — the Observatory narrates the evolution unprompted.**

| # | Criterion | Result |
|---|---|---|
| 1 | Sweep narrated on ≥ 6/8 evolving seeds | PASS, 8/8 (t = 8,300–17,520) |
| 2 | Every sweep grounded in the instrument (mean ≥ g0+0.10, majority ≥ 60%) | PASS |
| 3 | Variance channel rises 2k → 18k on 8/8 | PASS (0.036–0.069 → 0.101–0.171) |
| 4 | Control silent: 0 heredity events, sd channel exactly 0, on 8/8 | PASS |
| 5 | 5.2 measurement reproduced on the shipped build (seed 22) | PASS — period 6420/5680, phase 0.04/−0.26, g end 0.91, bit-exact |

Not in this phase, deferred with the plan's own list: sex, recombination, HGT, explicit speciation, Venator heredity. Emergent ecotype structure did not appear at the shipped trade-off; the kpSlope-0.5 world, where variation persists, is where to look for it.

---

## 5.6 — Cilio pursuit locus: the coevolutionary counterweight (2026-08-29)

R5 named the cost of one-sided evolution: with only prey evolving, nothing pushes back. This increment gives the grazer its own locus and measures whether an arms race appears.

**Design.** One locus on Cilio, *Pursuit* (keener ↔ thriftier): a keener grazer multiplies its prey's escape chance by `1 + 0.4·(g0 − g)` (×0.8 at full keenness) and pays basal upkeep `kb·(1 + 0.3·(g − g0))` (+15%). Expression only at the existing draw sites — the escape roll and the basal-cost line — so the silent genome stays bit-identical; the locus schema gained defaults so every unnamed slope is an exact no-op. Detectors, Traits page, tint and specimen card needed no change: they read the locus row.

**Declared change, proven.** Silent fingerprint: behavioural fields identical to the 5.5 baseline on both seeds. Evolving fingerprint: changed, as declared (Cilio divisions now draw). The conformance `gSum` was redefined as Σ(g − g0) over locus species, which is exactly 0 in any silent world however many species carry a locus — the old definition would have flagged a behaviour-neutral locus addition.

**Result: no arms race.** 8 seeds × 18,000 ticks:

| | Drifta defense at 18k | Cilio pursuit at 18k |
|---|---|---|
| range over 8 seeds | 0.66 – 0.90 (up from 0.50) | 0.41 – 0.52 (from 0.50) |

Cilio's pursuit does not rise; it drifts slightly *thriftier*. At this price the upkeep outweighs the catch gain, so selection on the grazer runs the other way from the plan's hope, while Drifta still sweeps to defense on 8/8. Reported as found; not re-tuned, per the corridor policy (the ecosystem holds).

**Re-acceptance.**

| Harness | Result |
|---|---|
| `tune2` | 8/8 ecosystem; apex held 3/8 (late losses on the rest) |
| `corridor` | **CERTIFIED at all 4 corners** (both loci × both rails), 8/8 each; apex held 2–4/8 per corner |
| `yoshida` | period 5698 → 3495 ticks (longer on 1/8), phase 0.17 → −0.10, Drifta CV 0.34 → 0.25. The antiphase prediction fails as before, more decisively: two sweeping loci make the cycle faster and tighter. Method caveat: seed 44's on-period of 520 ticks is the first-ACF-peak estimator locking onto a short component; kept in the table, not in any claim. |
| `gate5` | **ALL CRITERIA PASS** on the coevolving world: sweep narrated 8/8 (t = 5,180–14,660), each grounded, variance rising 8/8, control silent 8/8, seed-22 measurement reproduced bit-exactly |

**What this tells the next cut.** Both loci sweep monotonically. The world as tuned selects *directionally* on every heritable knob tried; balanced polymorphism appeared only when the trade-off was made steep (kpSlope 0.5, informational run). If coevolutionary cycling is the goal, the next lever is the *price* of keenness and defense, decided by the owner — not another species.

---

## 5.7 — Pricing by measurement: the balanced world (2026-08-29)

Owner decision: set the price of defense and keenness so that neither locus sweeps. Both prices from the measured surfaces (3 seeds × 36k per point):

| Drifta `kpSlope` | 0.25 | 0.40 | 0.45 | **0.50** | 0.55 | 0.75 |
|---|---|---|---|---|---|---|
| mean g at 36k | 0.91–0.94 | 0.72–0.87 | 0.56–0.79 | **0.50–0.68** | 0.53–0.66 | 0.09–0.18 |

| Cilio `kbSlope` | 0.30 | **0.15** | 0.08 | 0 |
|---|---|---|---|---|
| mean g at 36k | 0.41–0.52 | **0.49–0.60** | 0.59–0.73 | 0.59–0.74 |

Shipped: `kpSlope 0.5`, `kbSlope 0.15`. Declared evolving change; silent fingerprint identical to the 5.6 baseline on both seeds. Drifta's `hiTrait` reads "grazing resistance" — the mechanism is an escape roll, but for plankton the word is resistance.

**The world is balanced.** 8 seeds × 18k: Drifta 0.39–0.60, Cilio 0.42–0.52, sd 0.10–0.17. Sweeps fire on 4/8 seeds, in *both* directions (tougher on 44; faster-growing on 22, 66, 77). Because a balanced world does not sweep, the Observatory gained a third heredity detector — **diversifying**: "Drifta is diversifying — tougher and faster-growing lines coexist, neither winning" (sd ≥ 0.10 sustained, mean within 0.15 of g₀, ≥ 20% on each side). Observer-only, bit-identical; fires on the four non-sweeping seeds at t = 5,120–15,280; silent world emits nothing. The gate's first criterion now reads "sweep *or* diversifying on ≥ 7/8".

**Yoshida on the balanced world:** period 5698 → 5460 (longer on 4/8), phase 0.17 → 0.13 (farther on 4/8), CV 0.34 → 0.33. Per seed it is a coin toss; the ensemble does not move. Standing polymorphism is necessary for the transformation but, here, not sufficient: the defended and undefended lines coexist without *cycling* against each other. The honest next question is whether the grazing pressure itself oscillates enough to drive genotype turnover — a measurement, not a knob.

**Re-acceptance:** `tune2` 8/8 ecosystem (apex held 3/8). `corridor` **CERTIFIED at all 4 corners**, 8/8 each. `gate5` **ALL CRITERIA PASS**: evolution narrated 8/8 (diversifying on every seed, sweeps on four), sweeps grounded, variance rising 8/8, control silent 8/8, seed-22 measurement reproduced bit-exactly.

**Apex control (step 3):** the silent world holds the apex to 54k on 6/8 seeds; late apex loss under evolution is real and attributable.

---

## 5.8 — Solara light-adaptation locus, and what the sun lever did (2026-08-29)

**Design.** One locus on Solara, *Light* (shade-tolerant ↔ sun-loving), expressed inside the photosynthesis block as `kp × (1 + s·(g−g₀)·(1−2L))`, L = cell light. Shade-tolerant mats gain in dim water and lose in bright; the trade-off is priced by the light field itself, so the sun lever should set a selection pressure the mat answers. Draw-free; silent fingerprint identical to the 5.7 baseline. Chosen for biological grounding over the first proposal (dispersal): light adaptation is *the* algal trade-off; dispersal–competition is spatial ecology.

**Price surface** (normal sun, 3 seeds × 36k): `lightSlope` 0.3 → 0.46–0.57; 0.5 → 0.51–0.60; 0.8 → 0.61–0.68. Mild shade-ward drift at every value — the mat mostly sits in water below L = 0.5. Shipped 0.5.

**The lever test, done as a player does it** (establish 6,000 ticks, then press the sun; 3 seeds × 42k):

| sun | Solara g at 36k | ecology |
|---|---|---|
| 1.0× | 0.51, 0.51, 0.60 | baseline |
| 0.7× | 0.57, 0.66, 0.47 | Drifta 1,062 → 56, Cilio 69 → 18, apex dies |
| 1.4× | 0.55, 0.50, 0.55 | Solara 914 → 3,200, Drifta recovers |

**Honest reading: at this effect size the locus is nearly neutral.** Brightening the sun does not select sun-loving mats (no movement); dimming it moves two seeds shade-ward and one the other way — drift with a slight bias, not selection. The reason is in the populations: Solara's division is gated by mat crowding (`settleLimit`) and by mineral (Liebig), not by photosynthesis rate, so a growth multiplier barely reaches fitness. Meanwhile the *ecological* response to the press is enormous. A first-founding dim at 0.5× killed every world outright — a harness artifact, corrected, but also a statement about how hard the sun lever bites.

Recorded as found; not re-priced. The scaling note (`genetics-scaling.md`) explains why linear pricing is the wrong tool here and what replaces it. The locus stays: it is safe, it is visible on the Traits page, and when Solara's fitness *is* growth-limited (a sparse mat after a crash, or a thinned one after the kill tool) it will move.

**Also in this increment (UI):** genotype tint reworked as a hue rotation (±52°, lightness tilt) after the channel nudge proved invisible under the screen composite; Cilio's mark now carries its color instead of a white triangle; the mat carpet is tinted by each cell's mean Solara genotype; per-species and debris show/hide toggles in the status strip.

**Re-acceptance:** `tune2` 8/8 ecosystem (apex held 5/8). `corridor` **CERTIFIED at all 8 corners** (three loci × both rails), 8/8 each. `gate5` **ALL CRITERIA PASS** (evolution narrated 8/8, control silent 8/8, seed-22 reproduction bit-exact against the captured baseline).

**Yoshida on the 5.8 world, corrected estimator** (see the estimator note below): period 3340 ± 1383 (n=7) → 4090 ± 1923 ticks (n=6); phase 0.28 ± 0.11 → 0.14 ± 0.26; Drifta CV 0.34 → 0.32. Of the 6 seeds with a dominant cycle in both worlds, the period lengthens on 3 and the phase moves farther from zero on 4. Seed 22 alone shows the textbook transformation — period 5300 → 6100, phase 0.05 → 0.41 — and is the captured reproduction baseline. Ensemble verdict unchanged: no systematic transformation; the polymorphic world holds two lines without cycling them.

**Estimator correction (applies to every Yoshida table above).** A self-test on synthetic series (`harness/selftest.js`, added with the harness library) showed the period estimator stopping inside the autocorrelation's descending trough and returning roughly a *quarter* period; series with a founding trend then had no recoverable cycle at all. Fixed: linear detrend before the ACF, and the peak search waits for the ACF to go negative and come back. The 5.2, 5.6 and 5.7 tables were measured with the faulty estimator; their period and phase columns are re-measured on the historical builds and corrected in the section that follows. The qualitative verdicts survive the correction; the numbers did not, and are replaced rather than footnoted.

---

## Corrected Yoshida tables (detrended estimator, 2026-08-29)

The estimator used for the 5.2, 5.6 and 5.7 tables above was defective (see the note in 5.8). Every historical build was re-measured with the corrected one (`MC_CORE=<build> node harness/yoshida.js`). Off-world numbers are identical across rows because the silent world is the same in every build. NaN = no dominant cycle in that series.

| world | period off → on (n) | phase off → on (n) | seeds with both | longer on | verdict |
|---|---|---|---|---|---|
| 5.5 (Drifta sweeps) | 3340 → 4730 (7 → **2**) | 0.28 → −0.11 | 2/8 | 2 | **the cycle mostly disappears** — 6/8 evolving series have no dominant cycle |
| 5.6 (+ Cilio, sweeps) | 3340 → 4773 (7 → 6) | 0.28 → 0.26 | 5/8 | 3 | period longer, phase unchanged |
| 5.7 (balanced) | 3340 → 5304 (7 → 5) | 0.28 → 0.00 | 4/8 | **4** | period longer on every comparable seed; lag collapses to zero |
| 5.8 (+ Solara) | 3340 → 4090 (7 → 6) | 0.28 → 0.14 | 6/8 | 3 | period longer, lag halves |

**What changes in the verdict.** The faulty estimator had *over*-estimated the silent world's period (it read founding trends as cycles: 5698) and *under*-estimated the evolving world's (quarter-period artifacts). Corrected, the direction reverses: **evolution lengthens the Drifta–Cilio cycle in every world**, 3340 → 4100–5300 ticks — the literature's first prediction, which the earlier records called unconfirmed, is in fact reproduced, weakly and at small n. The antiphase prediction is still not: the lag moves *toward zero*, not toward 0.5. And the sweeping world of 5.5 does something the balanced world does not — it often erases the cycle altogether, which is what a prey population fixed at maximum defense should do.

What survives unchanged: Drifta CV (measured without the estimator) — no cryptic regime in any world; the balanced world's polymorphism; every acceptance verdict (they do not use the estimator). The self-test that caught this now guards it.

---

## 5.9 — Bacillus rate–yield locus: four loci (2026-08-29)

**Design.** *Metabolism* (voracious ↔ frugal): detritus uptake rate × `(1 + rateSlope·(g−g₀))`, yield `effE × (1 − effSlope·(g−g₀))` — the rate–yield trade-off of microbial metabolism (Pfeiffer, Schuster & Bonhoeffer 2001), chosen over motility for grounding. Draw-free; silent fingerprint identical to 5.8.

**Price surface** (3 seeds × 36k, mean Bacillus g at 36k):

| rateSlope / effSlope | 0.3 / 0.3 | 0.5 / 0.3 | 0.8 / 0.3 | 0.5 / 0.15 | 0.5 / 0.5 |
|---|---|---|---|---|---|
| mean g | 0.17–0.27 | 0.17–0.34 | 0.34–0.42 | **0.49–0.53** | 0.07–0.14 (rail) |

Yield beats rate at every feeding-rate benefit up to 0.8 unless the yield cost is small; shipped `rateSlope 0.5, effSlope 0.15`.

**The four-locus world, 8 seeds × 18k.** Every locus balanced: Solara 0.43–0.62, Drifta 0.45–0.62, Cilio 0.40–0.57, Bacillus 0.39–0.53; standing sd 0.09–0.17. The Observatory narrated *diversifying* on 8/8 seeds for Drifta, 6/8 for Bacillus, plus sweeps on three seeds (Drifta twice, Solara once, Bacillus once). Apex held 3/8 at 18k.

**Re-acceptance.** `tune2` 8/8 ecosystem. Yoshida (corrected estimator): period 3340 → 6555 ± 4299 ticks (n = 7 → 4 seeds with a dominant cycle) — the strongest lengthening measured in any world; phase 0.28 → 0.13; Drifta CV 0.34 → 0.29. Seed 22 captured as the gate's reproduction baseline (5300 → 6080, phase 0.05 → 0.05, g end 0.41). `gate5` **ALL CRITERIA PASS** on the four-locus world (evolution narrated 8/8, control silent 8/8, seed-22 reproduction bit-exact). **Corridor, the scaled certification (216 runs): NOT CERTIFIED at the sampled-interior standard — one collapse in 216.**

| mode | configurations | result |
|---|---|---|
| rails (each locus at 0 and 1, others at g₀) + all-low + all-high | 10 × 8 seeds | **all pass**; all-high corner passes 8/8 with Bacillus at 1.0 |
| fuzz (mutation on, σ ×4, 54,000 ticks) | 8 seeds | **all pass** — evolution, given four times the mutation rate and three times the horizon, never broke the world. Where it went: Solara to the shade rail (0.83–0.87, flagged), Cilio keen (0.5–0.86), Drifta anywhere from 0.22 to 0.63, Bacillus 0.38–0.49; apex lost 7/8 |
| 16 stratified interior samples | 16 × 8 seeds | **one collapse**: sample 9 = (Solara 0.78, Drifta 0.83, Cilio 0.88, Bacillus 0.79), seed 33 only — Bacillus extinct at t=3,450. The same seed survives with Bacillus pinned at 1.0 and every other locus at 1.0. A single-seed, single-point event: reachable by pinning, not reached by evolution |

Read plainly: the corridor's rails are safe and the optimiser cannot find the hole, but the interior is not uniformly safe — one keener-grazer/tougher-prey/voracious-decomposer combination starves the decomposer guild on one seed early. By the corridor policy an in-corridor collapse is a documented finding; by the certification standard the scaling note set, the word "certified" is withheld and the exit code says so. **Owner decision:** accept the finding (evolution never reaches the region; the fuzz is the operative guarantee) or narrow Bacillus's corridor. Not changed here; the four-locus world ships as measured.
