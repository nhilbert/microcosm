# Scaling heredity: calibration and guardrails beyond a handful of loci

v1.0 · 2026-08-29 · Research note, written after 5.0–5.7 and before multi-locus. The question: what we did for three loci — hand-priced slopes, 3-point price surfaces, corner-enumerated corridors — costs 2^L runs and a tuning session per locus. It does not scale. What does?

## 1. What today's measurements were actually telling us

Every locus we built has a **linear** trade-off: `hi = base·(1 + a·(g−g₀))`, `lo = base·(1 − b·(g−g₀))`. Three results, one cause:

- Drifta defense at `kpSlope` 0.25 swept to one rail; at 0.75 to the other; at 0.5 it *happened* to balance.
- Cilio pursuit at `kbSlope` 0.3 drifted one way, at 0 the other; 0.15 balanced.
- "Balanced" was fragile in both cases — the balance point was found by bisection, not by structure.

This is textbook **trade-off geometry** (Levins 1962; de Mazancourt & Dieckmann 2004; Rueffler et al. 2006). With a linear (or convex) trade-off curve, fitness is maximised at an *edge* of the feasible set: whichever side has the larger marginal value wins entirely, and the population sweeps to a rail. The interior "balance" exists only where the two marginal values happen to cancel — a knife-edge that depends on the ecology's current state, which is why it needed measuring. With a **concave** trade-off (diminishing returns on both sides), the singular strategy is interior and attracting — a continuously stable strategy in adaptive-dynamics terms (Geritz et al. 1998) — and it stays interior across a wide range of prices. The *position* of the equilibrium is then set by the ecology (grazing pressure, light), which is what we want the levers to move, and the *existence* of the equilibrium is set by curvature, which is what we want to guarantee.

Corollary worth noting for later: a **convex** trade-off combined with negative frequency dependence gives *evolutionary branching* — the population splits into two coexisting ecotypes. That is the emergent speciation the research doc hoped for, and it is a geometry choice, not a feature to script.

**Recommendation 1 — change the trade-off form, not the prices.** Express each locus as an allocation on a concave fitness set: with θ = g·π/2,

    hi_mult = (c + cos θ) / (c + cos θ₀)      lo_mult = (c + sin θ) / (c + sin θ₀)

Both multipliers equal exactly 1 at g₀ (silent genome stays bit-identical — the `θ₀ − θ₀` identity survives), both are bounded, and the curvature constant `c` sets how strongly interior the optimum is (c → ∞ recovers the linear case; c ≈ 1 is a gentle arc). One `c` per locus replaces two hand-tuned slopes, and the default can be shared. The 3-point price surface becomes a *verification* that the interior equilibrium exists, not a search for it. Draw-free; declared evolving change; silent identical.

## 2. Certification that scales

Corner enumeration is 2^L × 8 seeds. At L = 6 that is 512 runs (2.3 h); at L = 10 it is impossible. Three replacements, cheapest first, meant to be used together:

**Rails plus extremes — linear in L.** Each locus pinned at 0 and at 1 with all others at g₀ (2L runs), plus the all-low and all-high corners (2). Catches every single-locus failure and the two most likely interaction failures. 2L+2 = 14 configurations at L = 6.

**Evolution as the fuzzer — constant in L.** Evolution is an optimiser and will find exploits (Lehman & Stanley 2018 is a catalogue of exactly this). So let it: run the evolving world with mutation rate raised 3–5× (fast search) for 3× the acceptance horizon on 8 seeds and apply the ecosystem criterion. If the optimiser cannot break the world in 54k ticks with a hot mutator, the corridor is safe in the only sense that matters. 8 runs, whatever L is. This should become the *primary* certification; corners were only ever a proxy for "what could evolution reach".

**Sampled interior — fixed budget, statistical claim.** Latin-hypercube sample of N = 24 points in [0,1]^L (McKay et al. 1979), pinned, 8 seeds. Replaces exhaustive corners with a coverage claim: "no collapse in N random configurations". Optional; run when the rails or the fuzzer show anything marginal.

Language changes with it: **"corridor certified"** becomes "rails pass, fuzzer pass (8 seeds × 54k × 4σ), interior sample pass (N = 24)". A probabilistic claim stated as one.

**Recommendation 2 — `harness/corridor.js` gains modes**: `--rails` (default), `--fuzz`, `--sample N`; `--corners` kept for L ≤ 3. CI's manual acceptance job runs rails + fuzz.

## 3. Guardrails inside the sim, not only around it

The certification above is *post hoc*. Some guardrails can be structural:

1. **Loci scale rates and probabilities, never stocks.** Every current locus multiplies a rate (`kp`, `kb`, `rateE`) or a probability (`escape.p`). None touches energy, mineral or protein stocks directly. Make that a stated rule (CONTRIBUTING) and a load-time check: `normalizeTraits` rejects a locus that names a stock. The mineral audit then stays a valid invariant under any evolution — which is the one guardrail we already trust.
2. **Bounded multipliers at load time.** `normalizeTraits` evaluates every locus effect at g = 0 and g = 1 and refuses anything outside [0.4, 2.5]. A typo in a slope fails at startup, not in a 54k-tick run.
3. **The corridor clamp stays.** [0,1] per locus; the concave form makes it rarely active.
4. **The Observatory reports rail contact.** A `rail` event — "Drifta has reached the limit of its defense — 34% of the population at the corridor edge" — turns a certification concern into something the player *sees*. It also tells us, from any user's world, when a corridor is being tested.
5. **Evolvability floor.** The `uniform` event already flags variation collapse. With many loci, add the per-species *mean* sd across loci to the Health page as one vital: "Adaptability" (subtitle: mean heritable variation).

## 4. Calibration as a harness, not a session

What was done by hand today — pick three slope values, three seeds, 36k ticks, read the drift — is a script. `harness/price.js --species 1 --param kpSlope --values 0.25,0.5,0.75` runs the surface and reports, per value, the direction and magnitude of drift and whether a rail was reached; with `--bisect` it finds the zero-drift value. Under the concave form this becomes a check that the drift is small at the default `c`; under the linear form it is the search we did manually. Either way it is reproducible and cheap to rerun after any ecology change, which is the real point: **every ecology change re-prices every locus**, and only a script can afford that.

## 5. Multi-locus specifics

- **Storage**: `W.g[k·MAXN + i]`, `TRAITS[sp].loci = [...]`. Inheritance draws one mutation per locus in locus order — L draws per division, declared once.
- **Pleiotropy as data**: each locus row lists its effects (`{kp: {...}, escape: {...}}`); a trait may be hit by several loci, which multiply. Genetic correlations then emerge from selection, not from design.
- **Channels per locus**, not per species; the Traits page gets one band per locus; the tint takes the species' declared *display locus*, with shape and outline (the owner's suggestion: circle → ellipse → square; outline vs fill) as the second and third visual channels.
- **Certification cost** is set by §2, not by L.

## 6. Proposed order

1. Concave trade-off form for the three existing loci (one declared change; silent identical; verify interior equilibrium on 8 seeds without re-pricing).
2. `corridor.js --rails/--fuzz/--sample`, `price.js`; retire corner enumeration above L = 3.
3. Load-time guardrails in `normalizeTraits`; the `rail` event; the Adaptability vital.
4. Then multi-locus, with the budget from §2 fixed in advance.

*Sources: Levins, Evolution in Changing Environments (1968); de Mazancourt & Dieckmann, Am. Nat. 164 (2004); Rueffler, Van Dooren & Metz, TREE 21 (2006); Geritz, Kisdi, Meszéna & Metz, Evol. Ecol. 12 (1998); van Noordwijk & de Jong, Am. Nat. 128 (1986); McKay, Beckman & Conover, Technometrics 21 (1979); Morris, Technometrics 33 (1991); Lehman, Stanley et al., "The surprising creativity of digital evolution" (2018).*
