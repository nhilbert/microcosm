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
