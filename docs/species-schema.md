# Species schema and design notes

The species table lives in `src/sim/species.json` — one object per species, **array order = species index** (part of the RNG contract; never reorder). `tools/build.py` inlines it into the artifact and into `dist/core.js` as `SPECIES_ROWS`; `src/sim/traits.js` resolves tag names to bitmasks, fills defaults (`TRAIT_DEFAULTS`, `CYST_DEFAULTS`, `CORPSIVORE_DEFAULTS`, `LOCUS_DEFAULTS`) and runs the locus guardrail. Only fields that differ from the defaults need to appear in a row.

## Field reference

See the comment block at the top of `src/sim/traits.js` (identity, metabolism, movement verbs, trophic, defense, lifecycle, registry flags) and `LOCUS_DEFAULTS` for the locus effects. `bodyTag` is a tag name (`SOLARA` … `VENATOR`); `diet` is a list of tag names.

## Design notes carried over from the rows

- **species 0** — Solara: sessile benthic producer (mats)
- **species 1** — Drifta: drifting planktonic producer
- **species 2** — Cilio: steering grazer
- **species 3** — Bacillus: detritivorous colony (decomposer). Its job: shrink the locked pool.
- **species 4** — Mycora: sessile fungus. Best digestion in the world; pays for it with immobility.
- **species 5** — Necro: scavenger. Follows the death-scent; starves in paradise, thrives after crashes.
- **species 6** — Venator: pursuit predator. Fast in a straight line, outturned by its prey.

Design notes that lived beside the numbers (one paragraph per locus):

- Phase 5.8 heredity: light adaptation, the sessile producer's classic trade-off. Shade-tolerant mats photosynthesize better in dim light and worse in bright; the sun lever (drag, intensity press) therefore sets a selection pressure the mat answers.

- Phase 5 heredity: one locus, the Yoshida trade-off as antagonistic pleiotropy. g in [0,1]; defense (escape.p + escSlope*(g-g0)) rises with g, growth (kp*(1+kpSlope*(g0-g))) falls. At g = g0 both expressions collapse to the bare trait, so a silent genome (P.mutation=false) is bit-identical to the Phase 4 reference world. Mutation kernel: one uniform draw in [-sigma, sigma] per division (a Gaussian would cost two draws); the corridor clamp bounds it. Price by measurement (5.7): kpSlope 0.25 swept to the defense rail, 0.75 to the growth rail; 0.5 holds a balanced polymorphism.

- Phase 5.6 heredity: pursuit, the coevolutionary counterweight to Drifta's defense (R5). A keener grazer cuts its prey's escape chance; it pays in basal upkeep every tick. Price by measurement (5.7): kbSlope 0.3 drifted thriftier, 0 swept keener; 0.15 holds mid-corridor.

- Phase 5.9 heredity: rate vs yield, the textbook microbial trade-off. A voracious colony takes up detritus faster and wastes more of it; a frugal one is slow and efficient. Price by measurement (5.9): effSlope 0.3 and 0.5 drift/sweep frugal, rateSlope 0.3-0.8 cannot offset them; rateSlope 0.5 with effSlope 0.15 holds 0.49-0.53 at 36k on 3/3 seeds.

- Multi-locus (Phase 7): a row's `locus` is its first, **display locus** (tint, single-locus channels, legacy reads); `loci: [...]` appends further loci. The loader flattens both into `TRAITS[sp].loci`, ordered — **locus order is part of the RNG contract** (one uniform mutation draw per locus, in order, at every division). Storage is planes: locus k of organism i at `W.g[k*MAXN+i]`, so plane 0 keeps every existing `W.g[i]` read honest. Every locus contributes one factor per expression site, `1 + slope*(g-g0) - curve*(g-g0)^2`; unexpressed factors are exactly 1, so a species' single-locus arithmetic is reproduced bit for bit.

- Phase 7.H.5 heredity: thermal compensation (Drifta, Bacillus), Padfield's respiration down-regulation as the gain–cost separation the heat block measured (tolerance never binds — budgets do). A heat-tolerant line's upkeep scales flatter with warmth (`maintenance × (1 - warmSlope*(g-g0)*dT/10)`); it pays with a flatter warmth response of its warmth-scaled gain (photosynthesis for the drifter, decomposition for the decomposer: `× (1 - warmGainSlope*(g-g0)*dT/10)`). Both exactly 1 at dT ≤ 0, so the locus is **warmth-gated** (`warmGated`, derived): unexpressed in the certified world, where its variation is pure drift — the selection-story detectors (sweep, diversifying, uniform, adapt) stay silent there by construction; rail contact is always reported. Prices by measurement: see phase7-heat-plan.md §13.
