# Phase 7 M — multi-locus genomes and the thermal locus (H.5)

v1.0 · 2026-08-30 · Plan + record. Prerequisites: genetics-scaling.md §5 (the multi-locus spec), phase7-heat-plan.md §10/§12 (the measured design guidance for the thermal trait). This block delivers the `W.g[k·MAXN+i]` storage the scaling doc budgeted for, and asks the heat block's deferred evolutionary question: can a lineage buy its way into warm water?

## 1. What shipped

### M.0 — the substrate (behavior-neutral, bit-identical)

- **Storage**: `W.g` becomes MAXLOCI (4) planes of MAXN — locus k of organism i at `k·MAXN+i`. Plane 0 is the **display locus**: every pre-existing `W.g[i]` read (tint, channels 42–55, patch spreads, harness stats) keeps its meaning without edits.
- **Schema**: a species row's `locus` is its first locus; `loci: [...]` appends more. The loader flattens into `TRAITS[sp].loci` and keeps `t.locus` aliasing `loci[0]`. **Locus order is part of the RNG contract** — banner rule 5: one uniform mutation kick per locus, in order, at every division (sigma > 0 and P.mutation only).
- **Expression**: every site (kb, kp/light, catch/escape, rate/eff) multiplies one factor per locus, `1 + slope·d − curve·d²`. A slope the locus does not name is 0, its factor exactly 1.0 — the single-locus arithmetic reproduced bit for bit (all four conformance fingerprints identical; hash rebound with the declared reason).
- **Guardrail**: `checkLocus` runs per locus, warmth multipliers included (evaluated at the hottest legal source, dT 15). More loci than MAXLOCI fails at load.

### M.1 — per-locus observatory (observer-only, bit-identical)

Channels 75–81/82–88 carry the second locus's mean/sd (42–55 stay plane 0, so every calibrated reader keeps its meaning). The heredity detectors (sweep, diversifying, uniform, rail, adapt) run per (species, locus) with unchanged thresholds and unchanged locus-0 wording; heredity events carry `locus`. `patchMeans`/`locusStats`/`pin` take a plane. The Adaptability vital averages over every recorded locus. Traits page: one band per (species, locus). Evolution panel: one row per locus, `locus` events carry the index. Visual grammar: tint stays the display locus; the owner's shape/outline encoding for further loci is **deferred to owner review** (a second visual channel is a grammar decision, not a code decision).

### M.2 — the thermal locus (H.5; declared ecology change)

Design followed the heat block's measured verdict (§10.3: *tolerance never binds — budgets do*; §12: act on the gain–cost separation, not on `ctmax`):

- **Expression** (Padfield down-regulation): maintenance `× (1 − warmSlope·d·dT/10)` — a heat-tolerant line's upkeep scales flatter with warmth. **Price**: the species' warmth-scaled gain flattens with it — photosynthesis for Drifta, decomposition intake for Bacillus, `× (1 − warmGainSlope·d·dT/10)`. Both exactly 1 at dT ≤ 0.
- **Warmth-gating, declared honestly**: a locus expressing only warm slopes is `warmGated` (derived at load). In an unwarmed world it is invisible to selection, so its standing variation is pure drift — and the selection-story detectors (sweep, diversifying, uniform, adapt) skip it there by construction, exactly as the heat channels are exactly 0 without a warm source. Rail contact is always reported (a corridor concern, not a selection story). The Traits band and the Adaptability vital still show the raw drift; the Observatory just refuses to call drift a story.
- **Species**: Drifta and Bacillus — the two species the heat block showed being priced out of warm water by budget (Drifta: the +8 thermal trap, §12.2; Bacillus: H-P5's "excluded before selection can act"). Solara and the hunters deferred: the mat's warm-core story is light/crowding-shaped, and a hunter's thermal biology belongs to the movement genome (§12 record).
- **RNG**: one extra draw per Drifta/Bacillus division when mutating. Silent fingerprints bit-identical (the reference world untouched); evolving fingerprints declared changed, full re-acceptance below.

## 2. Certification that scales (as budgeted)

`corridor.js` enumerates (species, locus) pairs: rails 2L+2 with L = 6, fuzz with every sigma ×4 over 54k, sample over the full genotype cube. A warmth-gated locus's rails in the certified (unwarmed) world certify storage and draws only; its **ecological** rails live in the heated worlds (`heat.js --thermal` pins implicit — the fuzzer covers the joint space). gate5 reads display-locus events only (`e.locus` filter).

## 3. Measurement record (2026-08-30)

`node harness/heat.js --thermal` — 8 seeds × 18,000 ticks each: drift control (certified world), hot sun (+8 on the shipped sun at t=3,000 — the §12.2 thermal-trap layout), heater (+10 at a seeded far sun). Prices measured at (warmSlope, warmGainSlope) = (0.4, 0.25), robustness point at (0.6, 0.25).

**Drift control (no warmth)** — core 0/8 lost, apex lost 3/8 (in the shipped band). The thermal locus does what an unexpressed locus should: mean wanders 0.29–0.61 (Drifta) / 0.46–0.61 (Bacillus), sd 0.08–0.23, rails ≤ 1%, and **zero narration** — the warmth-gate held on all 8 seeds. Without it, drift sd crosses the diversifying threshold (0.10) by ~10k ticks and the Observatory would have called neutral drift a balanced polymorphism. The gate is the honest-narration fix, same construction as the heat channels' exactly-0 contract.

**Hot sun +8 (the thermal trap)** — the core is still lost 8/8, at t = 4,180–5,444: the collapse runs its course 1,200–2,500 ticks after warming, faster than selection at sigma 0.03 can answer. **Evolution does not outrun the trap**; the §12.2 owner decision (accept as narrated finding vs reprice Drifta's set-point) is unchanged by H.5. Selection is real though, and runs both directions: Bacillus sweeps heat-tolerant (means 0.47–0.78, hi-rail up to 17%), while Drifta on 4/8 seeds sweeps quick-burning (means down to 0.17) — a photoautotroph whose warm gain response (Q10 1.6) is shallower than its upkeep response (Q10 2.5) can prefer keeping the full gain response and paying full upkeep, because photosynthesis dominates its ledger. The trade-off has two live sides; the prices sit in a region where the ecology, not the arithmetic, decides.

**Heater +10, far seeded patch** — core holds 8/8. Drifta's thermal locus **adapts locally**: warm-core means 0.50–0.62 vs whole-world 0.48–0.58, `adapt` narrated on 5/8 seeds (6/8 at warmSlope 0.6, with core-means 0.56–0.62) — the first locus in this world that separates by patch through its *own* expression rather than through predation (contrast Block L's finding for the defense locus). **Bacillus stays excluded from the warm core on 8/8 seeds at both prices** — no measurable warm-core population, so patch selection cannot act on it; H-P5's overturning ("its budget excludes it before selection can act") is price-robust up to warmSlope 0.6. At (0.4, 0.25) with g = 1 and dT = 10 its margin improves from 0.80 to 0.875, still short of 1 — a locus bounded by the guardrail cannot close a 2.5-vs-2.0 Q10 gap without being nearly free, which is exactly Brock's thermophile lesson from §10.3 restated in evolutionary terms.

**Decision (measured, shipped)**: warmSlope 0.4, warmGainSlope 0.25, sigma 0.03, corridor [0,1]. The 0.6 point buys slightly stronger Drifta adaptation and no Bacillus rescue; the milder price ships.

## 4. Re-acceptance at this commit (2026-08-30)

Declared change: one extra mutation draw per Drifta/Bacillus division (the thermal locus, sigma 0.03). Silent fingerprints bit-identical throughout — the reference world is untouched, which is why the K6 gate reproduces the Phase 4 record to the second yet again.

- **tune2 8/8 OK** — apex held 5/8, M-audit drift ≤ 0.0102%.
- **K6 gate ALL PASS** — lock-up warned t=6,860 (360 ticks ahead), depletion t=5,440, strain lead 482 s, extinction reported; control silent (3/78 vitals flags).
- **gate5 ALL PASS** — narrated 8/8 (display locus; the gate now filters `e.locus`), sweeps grounded, variance rises 8/8, control silent 8/8, Yoshida seed-22 recaptured and reproduced bit-exactly (period off 4,860 / on 4,280, phase 0.06/0.18, gEnd 0.34 — the stream moved with the declared draw, hence the recapture).
- **Heat gate ALL PASS** — pile-up 8/8, warm-core thinning 8/8 for Cilio and Bacillus, pack starving 8/8 always ahead of the extinction, control silent with channels exactly 0.
- **Light gate** — control silent with channels exactly 0 (the hard criterion); adaptation narrated 4/8 (was 7/8 on the H.3 stream). The plankton's patch-spread peaks now sit at 0.08–0.16, straddling the calibrated 0.10-for-10-samples threshold — a marginal detector moved by the stream change, not a mechanism change; recorded, not smoothed over.
- **Corridor (rails + fuzz, per (species, locus) — 6 loci, 14 pinned configurations × 8 seeds + 8 fuzz runs)**: rails **96/96** clean (the thermal rails inert in the unwarmed world, as §2 predicts — they certify storage and draws; the ecological rails are §3's heated worlds). The extreme corners reproduce the two owner-accepted grazer extinctions **tick-exact** (all-low seed 55 t=7,088; all-high seed 44 t=2,425 — the harness exits 1 on them by design), which doubles as proof that the silent world is bit-identical even with two extra loci pinned in the corner. Fuzz (sigma ×4, 54,000 ticks) **8/8 OK** — the thermal locus wanders freely (means 0.14–0.55, sd to 0.29) and the optimiser still cannot break the world; audits ≤ 0.054%.
- **conform**: silent 11/88 bit-identical through every commit of this block; evolving recaptured with this declared reason. No NOTE at handoff.

## 5. Owner decisions (2026-08-30, closing this block)

1. **The thermal trap stays (§12.2 → CLOSED as (a))**: the hot sun is a lethal, fully narrated lever. H.5's measurement — evolution does not outrun the trap — closed the last escape route; the set-point remains movement-genome territory.
2. **Visual grammar for loci (decided, implementation deferred to the UI block)**: **tint** encodes temperature-related loci (the heat lovers); **outline vs fill** encodes defense; **body form, elongated vs circular** encodes speed/mobility; **body form, circular vs square** encodes other functional axes (e.g. feeding preference). Consequence to carry into the implementation: tint currently encodes each species' display locus (defense for Drifta, pursuit for Cilio, metabolism for Bacillus, light for Solara) — the reassignment moves those to their designated channels and hands tint to the thermal loci, a deliberate change of what an existing player's colors mean. One grammar change, shipped as one increment with before/after documentation.
   **IMPLEMENTED (2026-08-30, with the movement-genome UI block).** Before: tint = each species' display locus (defense/pursuit/metabolism/light), one hue-rotation axis for everything. After (ui-render.js makeSpriteSet/makeSprite, channel assignment derived from each locus's slopes, no hand-kept table): **tint** = the temperature locus where one exists (Drifta and Bacillus thermal, plane 1), direction flipped so heat-tolerant leans *warm* — species without a temperature locus render their base colour; **ring outline** = Drifta's defense locus (tougher wears a shell, alpha and weight rise with g); **corner roundness** = the feeding/metabolic axes (Cilio pursuit, Bacillus metabolism: thrifty rounds the silhouette, keener/voracious keeps it sharp; body size compensated so roundness never reads as growth); **elongated↔circular stays reserved** for a future speed locus, and the warmth-preference locus carries **no body channel** per D7 — its display is behaviour. Two documented exceptions: the **mat carpet keeps its light-locus genotype turn** (a per-cell pixel field has no outline or form; an invisible locus is worse than an off-grammar one — **owner-confirmed 2026-08-30, stays as is**), and the **Traits-page histograms keep the generic tint axis** as chart colour, not body colour. A grammar key line ships on the Traits legend. Sprites are baked per (tint bin × morph bin), 7×7 where both channels live.
3. **Light gate at 4/8 accepted**: recorded stream sensitivity of a threshold-straddling detector; control silence stays the hard criterion; no recalibration chasing the stream.
4. **Thermal prices (0.4 / 0.25) accepted; Bacillus's warm-core exclusion accepted as a finding**: no stronger mechanism sought for now.

Merged to main with these decisions recorded. Next blocks in owner order: UI issues (species panel visibility), then the movement genome.
