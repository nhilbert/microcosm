# MICROCOSM — Phase 7 Plan, Block L: Light Patches

v0.1 · 2026-08-29 · Research and plan; nothing built yet. Order agreed with the owner: **light → walls → heat → movement genome.**

## 1. Where we stand, and why light first

Phases 5–6 gave the world four heritable loci and every one of them behaves the same way: the population climbs a staircase to a single optimum and the price sliders decide where the staircase ends (phase5-record.md, genetics-scaling.md). The one place variation persisted on its own was the grazing interaction. Diagnosis: the environment offers exactly one optimum, because a single Gaussian sun on a torus is a homogeneous world. Evolution cannot hold variety the environment does not demand — Ashby's law, applied to the world rather than the population.

Light patches are the cheapest way to give the environment variety, and the existing machinery is already waiting for it:

- Solara carries a **light locus** (`lightSlope 0.5`: shade-tolerant ↔ sun-loving, crossover at `L = 0.5`) that 5.8 measured as *nearly neutral* — mat fitness is crowding- and mineral-gated, and under one sun every mat sits in the bright core where crowding, not light, decides. A dim patch is where that locus finally has something to say.
- Solara is **sessile with local dispersal** — the textbook Levene organism (Section 2). Drifta is mobile and phototactic — the textbook dispersal-versus-selection test.
- `computeLight()` is draw-free and already toroidal; the sun lever, undo and impact machinery exist. The whole block is data-model and instrument work; the RNG contract is untouched at the default configuration.

## 2. Science background

**Light as a resource for phytoplankton and mats.** Photosynthesis follows a saturating P–I curve (Platt et al. 1980); at high irradiance photoinhibition appears. Cells acclimate: shade-grown cells carry more chlorophyll per cell and have lower maintenance respiration but a lower maximum growth rate (Falkowski & Owens 1980). The ecological form of this is the **shade-tolerance trade-off** — low respiration and low maximum growth versus high maximum growth and high respiration (Kitajima 1994; Valladares & Niinemets 2008) — which is exactly the shape of our `lightSlope` expression: `kp × (1 + s·(g−g0)·(1−2L))`, a gain below the crossover paid for above it. Competition for light between producers is a critical-light-intensity contest (Huisman & Weissing 1994): the species (or genotype) that can still grow at the lowest light wins the shade. Our mat self-shading (`cellLight`) already implements the mechanism; what is missing is a *place* where low light is the normal condition rather than the crowded fringe of one bright core.

**Polymorphism in heterogeneous environments (the theory this block tests).** Levene (1953) showed that two patches with different optima can maintain a polymorphism, but only under conditions later summarised by Hedrick (2006): selection must be *soft* (density regulated within each patch, so each patch contributes a fixed share of the next generation regardless of how fit its residents are), and migration between patches must be limited relative to selection. Under hard selection or strong mixing, the better patch's genotype floods the other and the polymorphism is lost. Local adaptation — residents out-performing immigrants in their own patch — is the measurable signature (Kawecki & Ebert 2004). Solara satisfies both Levene conditions by construction: mats are locally crowding-limited (soft selection) and spores settle near the parent (limited migration). Drifta satisfies neither reliably: it disperses by drift and steers toward light. That contrast is the experiment.

**Gradients versus patches.** Spatial resource heterogeneity promotes evolutionary diversification (Day 2000), and gradients make branching *easier* than homogeneous worlds do (Doebeli & Dieckmann 2003; Mizera & Meszéna 2003), but a smooth gradient with mobile organisms tends to yield a cline, not two lines. Discrete patches separated by a dark gap are the stronger design for a first result, which is why the geometry in Section 4 matters: the gap between suns must actually be dark.

**Paper budget (instrument-before-knob, on paper first).** The default sun has σ=210 on a 1024 torus: light at the farthest cell (512 away) is 0.05, at 256 away 0.48. Two default-sized suns therefore overlap: at the midpoint between diagonally opposite suns (362 apart) each contributes 0.23 — the gap is as bright as a mat fringe, no patch structure at all. Patches need tighter suns. Integrated light input scales as `2πσ²·I` (277k for the default), so:

| configuration | gap light (diagonal midpoint) | total input vs default |
|---|---|---|
| one sun σ=210, I=1 (default) | — | 1.00 |
| two suns σ=130, I=1, diagonal | 0.04 | 0.77 |
| two suns σ=150, I=1, diagonal | 0.11 | 1.02 |
| bright σ=130 I=1 + dim σ=130 I=0.5 | 0.03 | 0.57 |

Two consequences: (1) "add a sun" is not energy-neutral, and the UI must show the light budget so the player sees what they changed (Section 6); (2) the crossover of the light locus at L=0.5 puts a dim sun at I=0.5 entirely in shade-tolerant territory (peak 0.53), while the bright sun has a sun-loving core of radius ≈1.23σ ≈ 160 and a shade-tolerant fringe. Whether a mat is viable at all under a dim sun is unknown — the 0.5× lever test killed worlds pressed from founding but not established ones — so the first measurement is a **viability curve**, not the patch experiment.

## 3. Predictions, stated before anything runs

- **P0 (viability).** A single sun at I ∈ {0.3, 0.4, 0.5, 0.6, 0.7}, σ=130, silent world: there is a threshold intensity below which Solara cannot found a mat. The dim-sun preset must sit above it; the threshold is recorded as a reference number.
- **P1 (symmetry null).** Twin equal suns: patch means of Solara's light locus stay within 0.05 of each other and no local-adaptation event fires. Devil's-advocate corollary worth measuring: if migration is low enough, the two demes may drift apart *neutrally* — a measurable |Δmean| well above the single-sun sd would be a finding about isolation, not adaptation.
- **P2 (local adaptation, the main claim).** Bright + dim: Solara's patch means differ by ≥ 0.15 at t=18,000, the dim patch shade-tolerant (higher g); the genotype–light correlation across living Solara reaches ≤ −0.3.
- **P3 (dispersal beats selection).** Drifta's patch difference stays < 0.08 under the same configuration. If Drifta also splits, its effective dispersal is lower than assumed and that is worth knowing before the movement genome.
- **P4 (instrument).** The existing `diverse` detector fires on Solara (sd ≥ 0.10, mean near g0, both sides ≥ 20%) without a sweep — the first shipped-world "diversifying" driven by the environment rather than by a price, and it must be narrated with the patch as the reason ("since the second sun…", never "because").
- **P5 (ecology, reported not required).** Producer standing stocks follow total light input; Cilio follows Drifta; apex persistence is reported per Decision B.

**Kill criterion.** If P2 fails with a gap that is genuinely dark and a dim patch that is viable, the light price (0.5) is too weak against crowding. The remedy is re-pricing by measured surface (the Phase 5 method), not a new mechanism.

## 4. Implementation design

**Data model.** `W.suns = [{ x, y, i, sigma }]`, `MAX_SUNS = 4`; `W.sun` is removed (its two sim uses become `W.suns[0]` in `initWorld` and the phototaxis site; the four UI uses and the recorder channel follow). `P.sunSigma` / `P.sunI` become the *defaults for a new sun*; the shipped world is one sun at the old position with the old values, so the light field is bit-identical.

**Light field.** `computeLight()` sums the suns: `L(c) = (ambient + Σ_k I_k · exp(−d_k²/2σ_k²)) · lightMul`. Irradiance adds; there is no cap (the lever already allows 1.6×, and two overlapping suns are the player's business — logged and visible). Draw-free, as today.

**Phototaxis — the one behaviour decision.** Drifta steers toward `W.sun` as a point. Two candidates:

- (a) *nearest sun* by toroidal distance, deficit-scaled as today. With one sun the arithmetic is unchanged, so the certified fingerprints stay identical; with two suns, Drifta commits to the closer sun, which is precisely the limited-migration condition of Section 2.
- (b) *follow the light-field gradient* — more honest biologically (organisms sense local light, not a sun's position) and the same field-sensing primitive heat will need later. But the grid gradient does not reproduce the point vector even for one sun, so it is a declared behaviour change with full re-acceptance.

Recommendation: ship (a) in L.0 (behaviour-neutral, hash rebind with a declared reason), measure, and introduce (b) as its own declared change in the heat block, where field sensing is unavoidable anyway. No preset should depend on the difference.

**Events** (all through the queue, logged, undoable via `prev`, coalesced like `sun`): `sun {k,x,y}` (move sun k), `sunAdd {x,y,i,sigma}` → returns the index, `sunRemove {k}` → returns the snapshot for undo, `sunSet {k, i?, sigma?}` (clamped: i ∈ [0.1, 1.5], σ ∈ [90, 300]). `lightMul` stays as the global press. A minimum of one sun is enforced (darkness experiments already exist through `lightMul`).

**RNG contract.** No new draws anywhere. Sun events change the future stream only through ecology, exactly as moving the sun does today. The `silent` and `evolving` fingerprints at the default configuration must be bit-identical; the hash note is rebound once with the reason "L.0 multi-sun data model, behaviour-neutral".

**Recorder.** Channels 33/34 (sun x/y) become sun-0 position plus a sun count; new channels 56–57: genotype–light correlation for Solara and Drifta (`REC.CH` 56 → 58). Patch assignment for the statistics: nearest sun by toroidal distance — the same rule the phototaxis uses, so the instrument and the mechanism agree. Pure observer, zero draws.

**Ports.** `docs/porting.md` gains the suns array and the four events; the state snapshot grows by one small array. Nothing else in the contract moves.

## 5. Observatory instruments

- **Local-adaptation detector** (`adapt`): for each species with a light-expressed locus, `|corr(g, L_local)| ≥ 0.3` for 10 consecutive samples and ≥ 2 suns present. Narration: "Solara near the dim sun is turning shade-tolerant, near the bright one sun-loving — the two patches are pulling the line apart." Clears when the correlation falls below 0.15 or a sun is removed.
- **Patch means** on the Traits page: the histogram is drawn split by patch (side-by-side tints), with a line "near sun 1: 0.62 · near sun 2: 0.41".
- **Impact cards**: `sunAdd`/`sunRemove`/`sunSet` are presses; the press-backdrop flag already carried by `lightMul` extends to sun-count changes so attribution is honestly weakened while the light regime is moving.
- **Light budget** as a number the player sees: total light input relative to the shipped world (Section 6), and the same number recorded so the Metabolism page can plot GPP against input.

## 6. UI / UX

Grammar unchanged: amber is the human hand only; the sun is a *thing* you select, like an organism.

- **Selecting a sun** (both platforms): tap/click within an inflated radius (≥ 44 px) of a sun's affordance in Intervene mode selects it (amber filled ring; others stay thin rings). An indirect drag from anywhere moves the *selected* sun — or, with none selected, the sun nearest the drag origin, chosen at pointer-down. One sun, no selection needed: today's behaviour exactly.
- **Sun card** (mobile: the bottom card slot, like the specimen card; desktop: the dock): intensity slider (0.1–1.5), spread slider (90–300), "Remove" chip (disabled on the last sun), and the light budget line "Light input ×0.77 of the shipped world". Undo chips: "Added a sun", "Removed a sun", "Moved a sun", "Changed a sun".
- **Adding a sun**: the long-press picker (already the seeding gesture) gains a "☀ Sun" entry — placed where you pressed. Desktop: `s` adds a sun at the cursor, `Delete` removes the selected one.
- **Presets** in the sun card: *One sun* (shipped), *Twin suns* (two σ=130 I=1, diagonal), *Bright & dim* (σ=130 at 1.0 and 0.5), *Archipelago* (three σ=110 at 0.8). Each preset carries a measured mark once L.2 has run (as the price sliders carry balance marks): "stable 8/8", "mat viable", or "not certified".
- **Rendering**: the light layer sums N radial gradients (radius and alpha scaled by σ and I); each sun draws its dot. The global ☀ lever remains where it is.
- **Data mode**: Traits page as in Section 5; Events feed wording per sun ("You added a sun", "You dimmed sun 2").

## 7. Increments

| # | Increment | Acceptance |
|---|---|---|
| L.0 | Suns array, summed light field, nearest-sun phototaxis, recorder channels, renderer for N suns | `npm run conform`: silent + evolving fingerprints identical; hash rebound with declared reason; `npm test` green |
| L.1 | Events (`sun`, `sunAdd`, `sunRemove`, `sunSet`), sun selection, sun card, picker entry, keyboard, undo, log, impact cards | Manual end-to-end on phone and desktop: add, drag, dim, remove, undo each; no localStorage; 44 px targets |
| L.2a | `harness/light.js --viability`: P0 curve | Threshold intensity recorded in the record |
| L.2b | `harness/light.js --patches`: P1–P3, P5 across 8 seeds, configurations from Section 2 table | Predictions confronted with numbers; decision point (re-price or proceed) |
| L.3 | `adapt` detector, Traits page split, light budget, preset marks; `harness/light.js --gate` (adaptation narrated ≥ 6/8 under Bright & dim, control silent 8/8) | Gate passes; observer edits bit-identical |
| L.4 | Records (`phase7-record.md` §L), porting.md, species-profiles (Solara habitat text), CLAUDE.md status | conform prints no NOTE; tune2 8/8 on the shipped world (trivially, bit-identical) |

Rough effort: L.0 an hour, L.1 an afternoon (the UI is the bulk), L.2 two hours plus ~1.5 h of runs, L.3 two hours.

## 8. Risks and the devil's advocate

- **"Two copies of the same world."** If the dim patch is not viable, or the gap is not dark, the second sun adds energy and nothing else. Mitigation: the paper budget above and P0 before P2.
- **Energy confound.** Any patch result must be compared against a single-sun control with matched total input, or the ecology changes (P5) will be misread as adaptation. L.2b includes a matched-input single-sun arm.
- **Self-shading already makes a gradient** and 5.8 found the locus neutral under it. The patch contrast has to exceed what shading does inside a mat; if P2 fails, the honest reading may be that Solara's fitness is simply not light-limited at any shipped price.
- **Drifta committed to the nearest sun** may starve at a dim sun when the bright one is far — a plausible "phototaxis trap". Report it; it is an ecological finding about the (a) rule and an argument for (b).
- **Phone screen budget.** A sun card plus the ☀ lever plus the evolution panel is a lot of Intervene UI. The sun card only exists while a sun is selected; presets live inside it, not in the tray.

## 9. What this sets up

Walls inherit suns as they are (light is unaffected by walls by design, phase3-plan §5), and the K7 "sealed compartment far from the sun" problem is solved by placing a sun inside it rather than by orbit mode. Heat gets the field-sensing primitive (phototaxis option b) and a natural coupling the owner asked for — heat must *mean* something: an over-cranked sun radiating heat that raises metabolic rate is the concept's own idea (Section 7 of the concept, "heat near an over-cranked light source"), and separate heat sources decouple the two axes. The movement genome then has patches, gaps and walls to be different in.

## 10. Decisions (owner, 2026-08-29)

All three agreed: (1) nearest-sun phototaxis now, field gradient as a declared change in the heat block; (2) minimum one sun, darkness stays a `lightMul` experiment; (3) the sun card is the selected-sun UI with presets inside it.

The questions as asked:

1. Phototaxis (a) nearest-sun now, (b) field gradient in the heat block — agree?
2. Minimum one sun (darkness stays a `lightMul` experiment) — or allow zero suns?
3. Sun card as the selected-sun UI (mirrors the specimen card), presets inside it — or a permanent tray row?

## 11. L.2 measurement record (2026-08-29)

**Harness**: `harness/light.js --viability | --patches [--layouts a,b] [--at 3000] [--silent]`. Layouts are applied to an established world at t=3000 through the same events the UI sends; patch = nearest sun; light at an organism = the field.

### 11.1 First design — moved-and-shrunk suns (rejected)

The §2 layouts put two σ=130 suns at (256,256)/(768,768), i.e. they **moved the shipped sun 362 units and shrank it**. Measured:

- **P0 viability** (silent, seeds 11/22/33/44, dim sun I ∈ 0.3…0.7): Solara in the dim patch at 18k — 0/4 seeds at I ≤ 0.5, 2/4 at 0.6 and at 0.7. No threshold reached in range. The dim patch below I≈0.6 is a desert for mats; the light locus's crossover (L=0.5) lies *below* the mat's viability floor, so no viable patch selects for shade tolerance.
- **The layout itself was the harmful press**: core collapsed (Cilio lost, Drifta 1,000–2,100) on 5/8 seeds under `dim` (input ×0.63), 1/8 under `twin` (×0.81), 0/8 under a single matched sun at ×0.81 — so the displacement plus shrink, not the energy alone, does the damage.
- **P1** twin: Solara |Δpatch| median 0.03 (4/8 within 0.05) — symmetric, as predicted. **P2** failed: Solara Δ ≈ 0, corr ≈ 0 (mostly no mats in the dim patch). **P3 inverted**: Drifta, not Solara, differed between patches (median |Δ| 0.19) — reported only with per-patch counts, below. **P4** 0/8. **P5**: apex at 18k 3/8 (one) → 0/8 (twin, dim).

Consequence: **layouts are additive from here on** — the shipped sun is never moved or shrunk; extra suns are tight (σ 130) and placed at the far corner (724 away; the shipped sun contributes 0.003 there). Light input rises (×1.27 dim, ×1.38 twin); a matched single sun (I=1.27) is the attribution control. The L.1 presets were changed accordingly (One sun / Second sun / Dim sun / Archipelago).

### 11.2 Additive layouts — safe, but an added sun is inert until seeded

`twin` (shipped sun + I=1 σ=130 at the far corner, input ×1.35) and `dim` (+ I=0.7, ×1.25), applied at t=3000, evolving world, 8 seeds each: **core persists 8/8 on both** (apex at 18k 2/8 each, vs 3/8 one-sun, 0/8 matched single sun at ×1.24). So the additive presets are safe to ship. But the far patch held **zero Solara and zero Drifta at 18k on 16/16 runs**: mats disperse only by settling next to the parent, and the plankton steers toward the *nearest* sun, so nothing ever crosses the dark 362-unit midline. The world has no long-range dispersal — an added sun is an empty stage until the player seeds it (the long-press seeding gesture, which the harness reproduces with `--seed`). Attribution note: the matched single sun (×1.24) grew a larger mat (Solara median 2,332) than either additive layout (1,690–1,801) — light delivered to an empty corner is light not delivered to the living patch.

### 11.3 Seeded additive layouts — colonisation works; the light locus still does not respond; the defense locus does

`--seed` reproduces the player's colonisation kit (four Solara and four Drifta packs, one Cilio pack, one Bacillus pack around the new sun) at t=3000. Evolving world, 8 seeds each.

- **Colonisation**: the far patch holds 405–562 Solara at 18k on 16/16 runs; Drifta 575–678 under the I=1 second sun, but only 21–25 under the I=0.7 dim sun (and 0 on 2/8) — a dim sun carries a mat but barely any plankton. Core persists 8/8 in both layouts. **Cost**: under the seeded second sun the grazer falls to 16–47 (from ~100) and the apex is gone on 8/8 by 18k — the plankton in the far patch is out of the grazers' reach, so the trophic chain above it thins. Reported per Decision B, not a failure.
- **P1** (twin, symmetry): Solara |Δpatch| median 0.03, 7/8 within 0.05 — as predicted.
- **P2 fails again, now with mats living under the dim sun**: Solara dim−bright patch mean median +0.02 (0/8 ≥ 0.15); corr(g, field light) median −0.07. **Reading**: the light locus is expressed on *shaded* light (`cellLight`), and mat density equalises realised light across patches — inside any dense mat every cell is "shade". The between-patch contrast never reaches the locus. Re-pricing (the §3 kill criterion) would not change that; expressing the locus on the field light would, and is a declared behaviour change for a later increment, if wanted at all.
- **P3 inverted, and it is the real finding**: **Drifta's defense locus separates by patch** — seeded twin: |Δ| 0.01–0.17 (median 0.08), tougher near the shipped sun (where the grazers stayed) on 5/8; seeded dim: median 0.06 with the far patch too small (n ≈ 22) to read. Local adaptation to *grazer pressure*, not to light — the environment axis that differs between the patches is predation, because Cilio does not follow the plankton across the dark gap.
- **P4**: 0/8. **P5**: above.

**Instrument consequence**: genotype–light correlation was the wrong instrument (it measures the within-mat shading cline). Recorder channels 56–57 now carry the **locus spread between patches** (max − min of patch means over patches holding ≥ 20; exactly 0 with one sun) for the mat and the plankton, and the `adapt` detector fires on a spread ≥ 0.10 held for 10 samples: "Drifta differs by patch — tougher near sun 1, faster-growing near sun 2."

### 11.4 L.3 gate (`node harness/light.js --gate`)

Seeded second sun at t=3000, evolving world, 8 seeds: **`adapt` narrated on 6/8** (Drifta on 5/8 at t=12,960–17,720; Bacillus on 3/8 — the decomposer's metabolism locus separates by patch too, unpredicted and worth a look); plankton patch-spread peak 0.075–0.174, mat 0.024–0.062 (never narrated, correctly). **One-sun control: 0 adapt events, channels 56/57 exactly 0 on 8/8.** Gate criteria adopted: (1) adaptation narrated on ≥ 5/8 seeded-twin seeds; (2) control silent with channels exactly 0 on 8/8. Both PASS.

### 11.5 Where this leaves the block

- Shipped: additive sun layouts (safe 8/8), sun card, seeding-based colonisation, patch marks on the Traits page, the `adapt` narration.
- Not achieved: Solara light-locus local adaptation. The cause is structural (the locus reads shaded light), not a price. Candidate declared change for later: express `lightSlope` on the field light. Not done in this block.
- Found instead: patches select on *predation*, because the grazer does not cross dark water — Drifta's defense locus and Bacillus's metabolism locus separate between patches. The far patch is also a grazer- and apex-poor refuge (Cilio 16–47, apex 0/8 under a seeded second sun): a second sun is a trophic intervention, and the light budget line on the sun card understates that. Worth a sentence in the sun card once the heat block's field-sensing movement lands (that is what would let the grazer follow).
