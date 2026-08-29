# MICROCOSM — Phase 7 Plan, Block H: Local Heat

v0.1 · 2026-08-29 · Research and plan; nothing built. Owner order: light (done) → **heat** → walls → movement genome. Owner constraints: heat must *mean something* for the organisms (metabolism, not decoration); this block introduces gradient-field movement and enables it for light and heat; light and heat layers get separate view toggles.

## 1. What heat is for, after what light taught us

Block L showed that a second environmental axis only matters if it reaches the organisms' accounting: the light locus never responded because the mat reads shaded light, while predation — an axis that *did* differ between patches — sorted two loci within 15,000 ticks. Heat is the axis that reaches everyone's accounting at once: every rate in the world is a metabolic rate, and temperature multiplies all of them, unequally. That inequality (respiration steeper than photosynthesis, ingestion flatter than maintenance) is the biology; it is what makes a hot spot a *structure* rather than a speed-up.

## 2. Science background (references verified 2026-08-29; details in the brief)

**Rates.** Mass-specific metabolic rate rises as e^(−E/kT) with E ≈ 0.65 eV, i.e. Q10 ≈ 2.5 near 20 °C (Gillooly et al. 2001 *Science*; Brown et al. 2004 *Ecology*). The full thermal performance curve is unimodal and left-skewed: a slow Arrhenius rise to an optimum, then a fall to zero within a few degrees; CTmax sits only 4–6 °C above Topt (Dell, Pawar & Savage 2011 *PNAS*; Huey & Kingsolver 1989; Angilletta 2009). Phytoplankton strains live within ~5 °C of their limit (Thomas et al. 2012 *Science*).

**Autotrophs lose first.** Photosynthesis is less temperature-sensitive (E ≈ 0.32 eV, Q10 ≈ 1.5–1.9: Allen, Gillooly & Brown 2005; Eppley 1972; Kremer et al. 2017) than respiration (0.65 eV): warming lowers P:R and tips ecosystems toward heterotrophy (López-Urrutia et al. 2006 *PNAS*; Yvon-Durocher et al. 2010, 2012).

**Predators lose next.** Attack rates rise (E ≈ 0.4–0.5 eV) and handling times fall with temperature, but both flatter than maintenance, so ingestion cannot keep pace with cost (Rall et al. 2012 *Phil Trans B*). Warming therefore *stabilises* consumer–resource cycles (weaker paradox of enrichment) while pushing the top consumer toward starvation (Fussmann et al. 2014 *Nat Clim Change*; Vasseur & McCann 2005).

**Decomposers last.** Decomposition Q10 ≈ 2 (Davidson & Janssens 2006 *Nature*); warming speeds mineralisation and drains the labile pool. In Yellowstone effluent channels the community is a set of concentric rings around the source — chemotrophs at the source, cyanobacterial mats 55–73 °C, eukaryotic algae below ~56 °C, grazers below ~50 °C — each ring bounded inward by CTmax and outward by competition (Brock 1967 *Science*, 1978).

**Size.** Ectotherms mature smaller when warm (temperature–size rule, 83.5 % of 92 species: Atkinson 1994), ≈ −5 % mass per °C in aquatic organisms (Forster, Hirst & Atkinson 2012 *PNAS*).

**Heritable thermal optimum.** Thermal performance curves evolve within ~100 generations in phytoplankton, mostly by down-regulating respiration more than photosynthesis (Padfield et al. 2016 *Ecol Lett*; Schaum et al. 2017 *Nat Ecol Evol*: higher Topt bought with lower fitness at ambient — a real local-adaptation trade-off). Topt tracks habitat temperature across latitudes (Thomas et al. 2012): thermal niches partition species, a classic coexistence axis.

**Thermotaxis.** Bacteria cannot sense a gradient across their body; they compare now with a moment ago and suppress tumbles when things improve — a temporal klinokinesis (Berg & Brown 1972 *Nature*), demonstrated for temperature (Maeda et al. 1976; Paulick et al. 2017 *eLife*). *Paramecium* accumulates near its acclimation temperature by modulating avoiding-reaction frequency (Nakaoka & Oosawa 1977); *C. elegans* tracks its growth temperature and disperses when starved (Hedgecock & Russell 1975 *PNAS*). *Chlamydomonas* phototaxis is klinotaxis — periodic sampling steers a helical path (Bennett & Golestanian 2015).

## 3. Design — what a heat source does in this world

Temperature is expressed as **warmth above ambient**, `ΔT` in degrees, so the certified world is `ΔT = 0` everywhere and every factor below is exactly 1 there (bit-identical by construction, same discipline as the loci).

**Field.** `W.heats = [{x, y, a, sigma}]` (0 to `P.maxHeats = 4`), `W.temp[c] = P.tempAmb + Σ a·exp(−d²/2σ²)`, recomputed on events only (static, like light; diffusion adds nothing the Gaussian does not already give). `P.tempAmb` (default 0) is the **global warming press** — the mesocosm experiment of §2 as one slider. Amplitude 0–15, spread 90–300.

**Rates** (per organism, `dT = W.temp[cellOf(i)]`, `q(Q10) = Q10^(dT/10)`):

| rate | factor | source |
|---|---|---|
| basal cost `kb` | `q(2.5)` | E 0.65 eV |
| photosynthesis `kp` | `q(1.6) · tpc(dT)` | E 0.32 eV; unimodal cut-off |
| detritivore `rateE/rateP`, corpse decay, `dLeach` | `q(2.0)` | Davidson & Janssens |
| hunting: `handling` | `q(0.65)` (shorter) | Rall et al. |
| hunting: `speed` while pursuing | `q(1.3)` | attack rate flatter than maintenance; cost is quadratic in speed so this is self-limiting |
| every gain | `× tpc(dT)` | the falling limb |

`tpc(dT) = 1` below the species' `topt`, then falls linearly to 0 at `ctmax` (per-species trait, °C above ambient; first values from the Yellowstone ordering — Bacillus 18, Drifta 14, Solara 12, Cilio 10, Venator 8 — to be priced by measurement). Costs never fall, so beyond `ctmax` an organism starves: death stays an outcome, not a parameter (concept P4), and the apex starves first because its margin is thinnest.

**Temperature–size rule** (H.2b, optional after measurement): division size threshold `× (1 − 0.03·dT)`, floor 0.6 — warm lines are smaller and faster; the 0.75 exponent makes them cheaper per head automatically.

**Movement — the gradient primitive.** One draw-free helper `grad(field, c) → (gx, gy)` by central differences on the torus, and one behaviour rule per movement type:

- *drift* (Drifta): `v += k_T · ∇(−|dT − tpref|)` — toward its preferred warmth, away above it; `tpref = 0` at first (ambient-loving), so the term is a pure avoidance of heat. Exactly 0 in a flat field.
- *tumble* (Bacillus): the temporal comparison already exists (`W.mem`); the compared quantity becomes `food − w·|dT − tpref|`, so discomfort raises tumbling (Berg & Brown / Maeda). No new draw: the existing `R() < pT` is the klinokinesis.
- *steer* (Cilio, Venator): when not hunting or fleeing, heading turns toward `−∇|dT − tpref|` with the existing `turnRate` clamp; hunger relaxes it (Hedgecock's starved dispersal). No new draw.

**Phototaxis by gradient (declared change, H.3).** Drifta's nearest-sun vector becomes `∇light` (the sensing rule the heat term uses, so light and heat share one primitive as the owner asked). This is a behaviour change with one sun — the grid gradient is not the point vector — so it is its own declared increment with full re-acceptance (tune2, gate, gate5 + Yoshida recapture, corridor). Expected effect: none on the far-patch problem — the *grazer* does not follow light, and Block L showed the grazer is what keeps a patch's food web whole. Recorded as a hypothesis to test, not a fix.

**Thermal locus** (H.5, later): `tpref`/`topt` heritable with the Schaum trade-off (higher Topt, lower gain at ambient). Needs the multi-locus array, since every species already carries one locus; the block's evolutionary question is first asked of the *existing* loci (H.4).

## 4. Predictions, stated before anything runs

- **H-P1 (autotrophs lose first).** One hot spot (a = 10, σ = 130) on an established world: Solara's realised net production in the warm core falls below ambient within 2,000 ticks; the mat retreats to a ring. Kill criterion: if the mat thrives in the core, `Q10_P ≥ Q10_R` somewhere in the accounting — find it, do not re-price.
- **H-P2 (rings).** At 18k, species' mean distance from the source orders as Venator > Cilio > Solara ≈ Drifta > Bacillus (Brock's zonation, inverted CTmax order). Measured as a per-species radial profile.
- **H-P3 (apex first).** Under a global press `tempAmb = +6`, Venator is lost before any core species on ≥ 6/8 seeds, and Drifta–Cilio cycle amplitude falls (Fussmann) — Yoshida machinery reused.
- **H-P4 (decomposition speeds, mineral drains).** Near the source, detritus stocks fall and dissolved mineral rises first, then the whole cell's stock declines (the labile pool drained) — the Chemistry page shows it.
- **H-P5 (existing loci respond).** Bacillus's rate–yield locus shifts toward *frugal* in the warm core (cost rises faster than yield); Drifta's defense locus shifts toward *faster-growing* where the grazer has left. Measured with the patch machinery from Block L (patch = nearest heat source or nearest sun).
- **H-P6 (thermotaxis is visible).** With avoidance on, Drifta density in the core drops by ≥ 50 % relative to avoidance off, at equal metabolism.

## 5. Observatory

Instrument before knob: channels first (per-species mean `dT` experienced, 58–62; production in warm vs ambient cells), detectors only after H.1 has been measured. Candidate narrations, to be calibrated: "Solara is retreating from the warm water", "The pack is starving in the heat", "The warm core is draining its mineral". Impact presses gain `heat`, `heatAdd`, `heatRemove`, `heatSet`, `tempAmb`.

## 6. UI / UX

- **Heat sources are things, like suns**: same selection, indirect drag, card (warmth 0–15, spread, layouts, remove), long-press picker entry "♨ Heat", keyboard `h`. Affordance ring amber (the hand); the *layer* is not amber — a translucent ember gradient (deep red → transparent) so it reads as warmth without claiming the intervention colour. Naming functional first: "Heat — local warming"; the card shows "warmer by +8°".
- **Layer toggles**: the show/hide row (species + debris) gains two view-only chips, `light` and `heat`, so either field can be inspected alone. Off by default: heat shows when a source exists.
- **Global press**: the ☀ lever row gets a sibling `🌡 ±0°` slider (`tempAmb`, −3…+8) — the warming experiment; a press in impact terms.
- **Specimen card**: a "warmth here +6° · cost ×1.7" line when `dT ≠ 0`, so the accounting is visible where the player looks.

## 7. Increments

| # | Increment | Acceptance |
|---|---|---|
| H.0 | `W.heats`, `W.temp`, events, renderer + layer toggles for light and heat, heat card, picker, keys | conform: silent + evolving bit-identical (no source → `ΔT = 0`); hash rebound with reason; manual add/drag/set/remove/undo on phone and desktop |
| H.1 | Metabolic factors (table in §3) with per-species `topt`/`ctmax`; `harness/heat.js --spot` (H-P1, H-P2, H-P4) and `--press` (H-P3) | bit-identical without sources; predictions confronted; first prices recorded |
| H.2 | Thermotaxis via the gradient primitive (drift / tumble / steer rules); H-P6; optional H.2b temperature–size | bit-identical without sources; H-P6 measured |
| H.3 | **Declared change**: phototaxis by `∇light` | tune2 8/8, k6 gate, gate5 + Yoshida recapture, corridor rails/fuzz; record the cycle-metric shift |
| H.4 | Existing loci under heat (H-P5) with the patch machinery; Observatory channels and the first calibrated narration | narrated ≥ 6/8 on the reference layout, control silent 8/8 |
| H.5 | Records, porting.md, CLAUDE.md; thermal locus deferred to multi-locus | conform prints no NOTE |

Effort: H.0 an afternoon (mostly UI, reusing the sun code — worth generalising the sun card into a "source card" rather than copying it), H.1 a day including runs, H.2 half a day, H.3 half a day of runs, H.4 a day.

## 8. Risks and the devil's advocate

- **Units are fiction.** The world has no real temperature; "warmer by +8°" is a story about Q10 factors. Keep it honest by showing the factor next to the degrees.
- **Q10 on everything may just be a speed-up** if the exponents are too similar. The separation (1.6 photosynthesis, 2.0 decomposition, 2.5 maintenance) is the whole content; H-P1 tests it directly.
- **A hot spot in a σ=130 core removes ~10 % of the world from the mat.** Under one sun that is the lit centre — a heat source at the sun is the concept's "over-cranked lamp" and probably the most dramatic thing a player can do. Measure it as a layout ("Hot sun").
- **Thermotaxis may hide the metabolic effect** (organisms simply leave). That is biology, but H-P1/H-P2 are measured with avoidance *off* first, then on, so the two are attributable.
- **H.3 could move the Yoshida numbers.** It is declared for exactly that reason; if the cycle metrics shift materially, the record says so and the owner decides whether ∇light stays.

## 9. Decisions (owner, 2026-08-29)

1. `ctmax` ordering as proposed — agreed as the first hypothesis.
2. Global warming press (`tempAmb`) — **deferred**.
3. **One object: the energy source.** Suns and heaters are the same thing with two channels, light `i` (0–1.5) and warmth `a` (−8…+15, negative = a cold source). A sun is `a = 0`, a black heater `i = 0`, a hot sun both, a cold light `i > 0, a < 0`. One card with two sliders (light, warmth) plus spread; one set of events (`source`, `sourceAdd`, `sourceRemove`, `sourceSet {k, i?, a?, sigma?}`); the `W.suns` array of Block L becomes `W.sources`, and `computeLight`/`computeTemp` both read it. Phototaxis (until H.3) steers toward the nearest source with `i > 0`.

The questions as asked:

1. Per-species `ctmax` ordering as proposed (Bacillus most tolerant, Venator least) — agree as the first hypothesis?
2. The global warming press (`tempAmb`) in this block, or deferred?
3. Generalise the sun card into one "source card" for suns and heat (recommended: less UI, one grammar) — or a separate heat card?

## 10. H.1 measurement record (2026-08-29)

**Harness**: `harness/heat.js --spot [--a 8] | --heater [--a 10] | --press [--amb 6]`, 8 seeds, evolving world, the change applied to an established world at t=3000. Metabolism only — nothing senses or avoids warmth yet (H.2), so these are the pure accounting effects.

### 10.1 Hot sun (+8 on the shipped sun, σ 210) vs untouched control

| | control (8 seeds) | hot sun (8 seeds) |
|---|---|---|
| Solara at 18k | 1,587–2,013 | **614–1,059** |
| Drifta | 260–404 | **809–1,175** |
| Cilio | 71–112 | 122–169 |
| Bacillus | 865–1,002 | 942–1,078 |
| apex lost | 5/8 (t 4,695–6,819) | 8/8 (t 4,689–7,094) |
| core lost | 0/8 | 0/8 |
| detritus per warm cell / ambient cell | — / 2.0–2.4 | **8.7–9.7 / 0.01–0.05** |
| dissolved mineral warm / ambient | — / 0.36–0.55 | 0.60–0.89 / 0.69–0.87 |
| Drifta CV | 0.25 | 0.19 |

- **H-P1 confirmed**: the mat halves; the plankton doubles. Upkeep (Q10 2.5) outruns photosynthesis (1.6) for the mat, whose budget is tight; the plankton is light-limited rather than upkeep-limited and inherits the mat's mineral.
- **H-P4 inverted**: detritus *piles up* in the warm core (×4 the ambient stock) — corpse flux from the dying mat rises faster than decomposition (Q10 2.0) can eat it. The literature's "warming drains the labile pool" holds for a steady state; this world's warm core is a mass-mortality event first. Dissolved mineral in the warm core is not depleted (0.6–0.9 vs 0.4–0.5 control).
- **H-P3 (spot)**: apex lost 8/8 vs 5/8, at similar times — weak at +8 because the control already loses the apex on most seeds; the press is the cleaner test.
- **H-P2 (rings)** untestable at σ 210 — the warm core covers the whole populated area. The heater run (σ 130, dark) tests it.
- Drifta CV falls (0.25 → 0.19): a mild Fussmann stabilisation under a *local* hot spot.

### 10.2 Global warming press (ambient +6 from t=3000)

Solara 1,038–1,346 (one seed 401), Drifta 497–668 (one seed 2,330), Cilio 124–163 (one seed 16), **Bacillus 659–795** (one seed 134; control 865–1,002), apex lost **8/8, earlier** (t 4,168–5,488 vs 4,695–6,819 with 3 held), core lost 0/8, **Drifta CV 0.41** (control 0.25). Seed 88 is a near-collapse: the grazer almost gone, the plankton at 2,330.

- **H-P3 confirmed**: the apex goes first and sooner on every seed; the decomposer is the second loser — its upkeep (2.5) rises faster than its feeding (2.0), Rall's mismatch in the decomposer's ledger.
- **Uniform warming destabilises** (CV 0.41 vs 0.25), the opposite of the local hot spot. Fussmann's stabilisation assumes the consumer's energetic efficiency falls; here the grazer's intake is *not* Q10-scaled while its cost is — the grazer is squeezed, control on the plankton loosens, and the cycle widens. Worth revisiting when the hunting rates get their own Q10 (attack rate E ≈ 0.45 eV is not yet in the model; only pursuit speed and handling are).
- Prices to revisit before shipping a warming lever: Bacillus's margin; a grazer attack-rate Q10. Not changed now — H.2 (sensing) may redistribute everyone first.

### 10.3 Heater at the far patch (seeded second sun, warmth +10, σ 130) — thermotaxis OFF (pre-H.2 core)

Reference = Block L's seeded second sun (mat 405–562, plankton 575–678 in the far patch). With the same sun warmed by +10 (core ≈ +6.5 where the organisms sit):

| in the warm core at 18k | reference far patch | heated far patch |
|---|---|---|
| Solara | 405–562 | **0–199** (0 on 4/8) |
| Drifta | 575–678 | **639–823** |
| Cilio | 16–47 (whole world) | **0** in the core |
| Bacillus | seeded kit | **0** in the core |
| detritus per warm cell | ≈ 2.3 (ambient) | **3.4–9.2** |
| apex lost | 8/8 by ~7k | 8/8, but 3 seeds only at 12–17k |
| Drifta CV | 0.30–0.47 | **0.08–0.16** |

- **The warm patch becomes a plankton monoculture.** The plankton (topt 9) sits below its optimum and its photosynthesis × 1.6^0.65 ≈ 1.36 beats its upkeep only because it is light-limited to begin with; the mat, the grazer and the decomposer all leave their budgets in the red and vanish from the core.
- **H-P2 (rings) fails in an instructive way**: Bacillus (ctmax 18) should have held the core by tolerance, but its *budget* fails first — upkeep 2.5^1 = 2.5× against feeding 2.0^1 = 2.0× at +10, with detritus piling up uneaten (3.4–9.2 per cell). Brock's decomposer core needs thermophiles whose gains scale with their costs; tolerance alone (the `ctmax` limb) never binds here. The ordering that *does* emerge is by budget margin: plankton > everyone.
- Plankton refuge without grazers → the world's Drifta–Cilio cycle is damped (CV 0.12 vs 0.30–0.47) and the apex sometimes survives much longer (3/8 past 12k): a warm, grazer-free plankton patch feeds the rest of the world with drifters.
- Dissolved mineral in the warm core is not depleted (0.05–0.18, same as ambient).

Consequence for the design: the interesting thermal biology is not the cut-off but the **gain–cost separation per species**; a heritable thermal trait should therefore act on that separation (Padfield: down-regulate respiration's Q10), not on `ctmax`. Recorded for H.5 / multi-locus.

### 10.4 The same heater with thermotaxis ON (H.2 core; reference half bit-identical to 10.3's, as it must be)

| in / around the warm core at 18k | thermotaxis off (10.3) | thermotaxis on |
|---|---|---|
| Drifta in the core | 639–823 | **269–299** |
| warmth felt by Drifta | 5.6–7.2 | **1.4–2.1** |
| Solara in the core | 0–199 | **375–420** |
| Drifta, whole world | 868–1,175 | 1,253–1,800 |
| Cilio, whole world | 17–51 | **0–26** |
| core lost | 0/8 | **3/8** (grazer extinct at 12.5–13.8k) |
| detritus per warm cell | 3.4–9.2 | 13–15 |
| Drifta CV | 0.12 | 0.18 |

- **H-P6 confirmed**: with the drifters steering toward their set-point (`tpref = topt = 9`, i.e. the +9 contour ≈ 60 units from the heater's centre), their density in the +6.5 core falls by ~60 % and they stop crowding the mat, which recovers (0–199 → 375–420). The crowd on the +9 ring self-shades (`divPlank`) — the drifters that reach their thermal optimum starve of light; detritus in the core rises to 13–15.
- **The hunters' set-point is harmful as shipped**: an idle, fed Cilio turning toward *its* preferred warmth (+5 ring around a far heater) walks away from where its prey is; the grazer goes extinct on 3/8 seeds and the core is lost. A naive "seek your optimum" rule is a bad controller for a predator whose food is elsewhere — exactly the kind of thing the movement genome should later be allowed to discover rather than have hard-coded. Decision pending on the numbers below: hunters blind to warmth (thermo 0 for Cilio and Venator) is being measured.

### 10.5 Hunters blind to warmth (Cilio, Venator `thermo = 0`) — the shipped H.2 default

Same heater, plankton and decomposer steering, hunters not: **core held 8/8**, Cilio 34–52 (vs 0–26 with hunters steering, 17–51 with nobody steering), Drifta in the core 272–309 (the H-P6 effect kept), Solara in the core 393–451 (the mat's recovery kept), whole-world mat 1,940–2,365, apex lost 7/8 (1 held). Detritus in the warm core 13–14 per cell (the self-shaded drifters' remains), mineral not depleted.

**Decision (shipped)**: thermotaxis for the drifter (gain 0.6) and the decomposer (0.25); the hunters stay blind until the movement genome can price a set-point for them. `species.json` carries it; a flat field skips every branch, so the certified world is unchanged.

### 10.6 Where this leaves the block

- Shipped H.0–H.2: energy sources with light and warmth, Q10 metabolism with per-species limits, one gradient primitive, thermotaxis for two species, heat layer + toggles, source card, specimen-card warmth line, `harness/heat.js`.
- Confirmed: H-P1 (mat loses first), H-P3 (apex first, then the decomposer, under uniform warming), H-P6 (thermotaxis moves the plankton out of the core and the mat back in).
- Overturned: H-P2 rings — tolerance never binds; budgets do. H-P4 — the warm core piles detritus up instead of draining mineral. Uniform warming *destabilises* the plankton–grazer cycle (CV 0.41 vs 0.25) because the grazer's intake carries no Q10 yet.
- Design consequence: the heritable thermal trait (H.5, after multi-locus) must act on the gain–cost separation (respiration Q10 down, Padfield), not on `ctmax`; and a hunter's thermal set-point belongs to the movement genome.
- Not done: H.3 (phototaxis by ∇light, a declared change), a grazer attack-rate Q10, the global press lever (deferred by owner), Observatory narration for heat (channels 58–64 exist; detectors wait for calibration against these tables).

## 11. H.3 — phototaxis by the light gradient (declared behaviour change, 2026-08-29)

**What changed.** The drifter's steering term was `phototaxis · deficit · (unit vector toward the nearest light-emitting source)`; it is now `phototaxis · deficit · (unit vector of the local light gradient ∇light)` — the same two draws, the same magnitude, a different direction. Light and warmth now share one sensing primitive (per-cell central differences, `W.lgx/lgy`, `W.tgx/tgy`), as the owner asked. Biologically this is klinotaxis: a cell steers by what it can sense at its own position, not by where a sun is.

**Why declared.** With one sun the grid gradient's direction differs from the point vector (16-unit cells, quantised direction, exactly flat cells at the peak and in the dark), so the certified fingerprints change: silent and evolving, both seeds. Hence full re-acceptance: tune2 8/8, k6 gate, Yoshida recapture + gate5, the light gate, corridor rails + fuzz; then `conform --capture` with this reason.

**Expected effect on Block L's finding.** None on colonisation — in dark water the gradient is zero, so a drifter still never crosses to a far sun — but drifters in a patch now distribute by local light rather than by distance to a point, which may change the within-patch cline and the Drifta–Cilio cycle numbers (recorded below).

**Re-acceptance (2026-08-29).** tune2 **8/8** (apex held at 18k on 4/8, was 3/8); K6 gate **PASS** (lock-up warned 360 ticks ahead, strain lead 482 s); Yoshida recaptured seed 22: period off 4,860 → on 6,120 (was 5,300 → 6,100), phase 0.06/0.06; gate5 **ALL PASS** (narrated 7/8, control silent 8/8); light gate: adaptation narrated **7/8** (was 6/8), control silent. Corridor: rails **64/64**, fuzz **8/8**, extreme corners **14/16** — two new grazer extinctions (all loci low, seed 55, t=7,088; all loci high, seed 44, t=2,425), both of which held under the nearest-sun rule.

**Mechanism (diagnosed, old vs new core on the same corners).** The gradient rule packs the plankton tighter around the sun: mean distance from the sun 91–113 (was 108–140), no drifters in dark water in either rule. A denser plankton core concentrates the grazers, and the pack hunts them more efficiently — Venator rises to 30–47 (was 22–28) and eats the grazer out. It is a trophic cascade at the genome extremes (faster-growing prey with a thrifty grazer; or tougher prey with a keen grazer and a voracious decomposer), and the same mechanism shows benignly in the shipped world as the apex holding on more seeds. Not an artefact: drifters at the peak cell (gradient exactly 0) and in the dark behave as intended.

**Decision (owner, 2026-08-29): H.3 accepted** with the two extreme-corner grazer extinctions as a documented in-corridor finding, consistent with the Phase 5.9 corner decision (rails + fuzz are the operative guarantee). Conformance recaptured with this reason; Yoshida baseline recaptured above.

## 12. Checkpoint (2026-08-29, evening) — measurement pending

Built, bit-identical at ambient, **not yet accepted**:
- **Attack-rate Q10 1.6** on intake per contact (`P.q10.attack`, `W.qA`). Measured under the +6 press: grazer no longer squeezed (Cilio 97–201), Drifta CV 0.41 → 0.28 — the Fussmann stabilisation appears once intake scales with warmth. Keep.
- **Heat narration** (`heat`, `pile` events; channel 65 = detritus warm/ambient ratio): "X is paying more for the warmth than it gains — upkeep ×1.73 against photosynthesis ×1.33", aggregated to one world sentence when ≥3 species fire; "Dead matter is piling up in the warm water — 4.2× the ambient stock". Silent at ambient by construction.
- **`tpref` trait** (preferred warmth, default = optimum; **Drifta 4**). Cause: under a +8 hot sun the H.3 light gradient and Drifta's thermotaxis toward its optimum (+9) pointed at the same spot — plankton packed onto the peak (mean distance 48, was 122) and the pack ate the grazer out: core lost 8/8. Attribution runs: attack Q10 off → still lost 8/8; thermotaxis off → held 8/8. So the set-point, not the Q10.

**Pending**: hot sun, heater and press with `tpref = 4` — the runs were interrupted by a shutdown; re-launch with `node harness/heat.js --spot --only-heated`, `--heater --only-heated`, `--press` (≈10 min in parallel). Acceptance = hot sun core held 8/8, heater keeps the H-P6 effect (drifters leave the +6.5 core), press unchanged. Then record here, update CLAUDE.md, commit.
