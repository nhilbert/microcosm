# MICROCOSM — Concept for a Torus-World Micro-Ecosystem Simulator

*A universal, interactive state machine of tiny organisms, running as a single-file mobile web app in the Claude sandbox (artifact).*

Version 0.3 — v0.2 plus a mobile UI/UX review: Section 10 rewritten as a full interaction specification, constraint K8 added, 2026-08-28

---

## 1. Reading guide

This document is a build-ready concept, not a finished truth. Sections 13 (Contradictions) and 15 (Open questions) matter as much as the feature sections: several of your requirements pull against each other, and the design below makes explicit choices you should veto or confirm before any code is written. Hypotheses are marked **[H]** where the design rests on an assumption that must be tested rather than believed.

## 2. Design principles

**P1 — One universal machine, species as data.** There is exactly one organism model. Every species — alga, bacterium, apex predator — is the *same* state machine with a different genome vector. "Producer" and "predator" are regions of one continuous parameter space, not different code paths. This is what makes the system universal: evolution can move organisms between ecological roles without any special-case logic, and you can add species by writing a preset, not code.

**P2 — Matter is conserved, energy flows through.** Minerals and structural biomass form a closed loop (organism → corpse → detritus → decomposer → dissolved mineral → producer). Energy enters as light and leaves as dissipated activity. A visible "mineral audit" (total matter in the world, which must stay constant) doubles as an ecosystem gauge and a permanent regression test. This principle is stolen from ALIEN's strict conservation and is the single strongest lever against runaway or collapsing simulations.

**P3 — Everything has a price.** Movement, sensing, armor, redundancy, repair, sex — every capability costs energy or building material. Niches and trade-offs then emerge from accounting, not from scripted rules.

**P4 — Death is an outcome, not a parameter.** No organism carries a "lifespan" number. Lifespans emerge from stochastic component failures (Section 7). Randomized, species-typical, and individually varying lifespans are a *result* of the failure model.

**P5 — The world is a formal state machine.** The entire world state `W` advances by a pure step function `W(t+1) = Step(W(t), E(t); seed)`, where `E(t)` is the ordered list of user interventions in tick `t` and all randomness comes from one seeded PRNG. Consequences: runs are reproducible from `(seed, config, event log)`, snapshots are serializable, and manual interventions are first-class events rather than dirty pokes into state. (Limits of this claim: Section 13, K2.)

**P6 — Legible at a glance, deep on tap.** On a phone screen the world must read as shapes and colors; every detail (genome, organ health, ancestry) is one tap away.

## 3. What we borrow from prior art

A survey of existing artificial-life and ecosystem simulators, with the specific idea each contributes:

**The Life Engine** (browser CA by Max Robinson): organisms built from functional cell types (mouth, producer, mover, killer, armor, eye), food as a placed resource, dead organisms turning into food, and a settings panel exposing mutation and food-production probabilities. Lesson taken: a small set of orthogonal capabilities plus a food-recycling rule generates surprising ecological variety; and its browser feasibility proves the platform. Lesson rejected: its lifespan is a flat "cells × multiplier" timer — exactly what you want to avoid.

**The Bibites** (Léo Caussan): evolving genomes plus evolving neural-net brains, pheromone channels (RGB) for emergent communication, speciation measured by genetic distance with a lineage panel, and template creatures as starting points. Lessons taken: speciation-by-distance, pheromone fields, template presets, a lineage view. Lesson deliberately deferred: evolving neural networks. They are the sophistication trap for a v1 — opaque, tuning-hungry, and they double the state space. A finite behavior automaton with evolvable thresholds delivers most of the observable behavior at a fraction of the complexity (Section 8); NN brains remain a possible Phase 6.

**Sugarscape** (Epstein & Axtell) and **NetLogo Wolf–Sheep**: the canonical agent-on-resource-landscape metabolism model, and the canonical demonstration that two-species predator–prey systems oscillate to extinction unless the resource base regrows with its own dynamics. Lesson: stability must be engineered (Section 12).

**Tierra / Avida**: mutation applied at the moment of replication, with parasites and arms races emerging unscripted. Lesson: put the mutation operator in the reproduction pathway and let mutation rate itself be a gene (second-order selection).

**ALIEN** (CUDA particle ALife): rigorous energy/matter bookkeeping in a physics substrate. Lesson: conservation as architecture. Rejected: particle physics, far beyond a phone budget.

**Evolving Protozoa / ProtoEvo, biosim4, ecosim**: 2D protozoa-like agents whose behaviors and morphologies evolve; pheromone-trail decision making. Confirmation that the protist aesthetic and scale is a proven sweet spot for this genre.

**E. coli chemotaxis (run-and-tumble)**: real bacteria navigate gradients with no brain at all — straight runs, random tumbles, tumble less when things improve. This is a gift: biologically authentic movement that costs a few lines of code (Section 8).

**Gavrilov & Gavrilova, reliability theory of aging** (J. Theor. Biol. 2001): organisms modeled as series systems of vital blocks, each block a parallel set of redundant, non-aging components with constant failure rates. The theory shows that redundancy alone produces aging — mortality rising exponentially with age (Gompertz law), late-life mortality plateaus from redundancy exhaustion, and Weibull-type failure when systems start flaw-free versus Gompertz when they start with an initial damage load. This is the scientific backbone for your "death from real failures" requirement, and it is directly implementable (Section 7).

## 4. World model

**Topology.** A continuous 2D world of size `Wx × Wy` with toroidal wrap: positions are taken modulo world size, and all distances/gradients use the minimum-image convention. The torus removes edge artifacts (no corner-camping, no boundary die-offs) and is cheap: wrap is two modulo operations, and field diffusion stencils wrap for free.

**Resource fields.** Underneath the continuous space lies a grid (target 128×128, adjustable) of `Float32Array` fields:

| Field | Dynamics | Role |
|---|---|---|
| Light `L` | Derived each tick from the light source; not stored matter | Energy input for photosynthesis |
| Mineral `M` | Diffuses; consumed by producers; released by decomposers | The conserved currency (P2) |
| Detritus `D` | Deposited by death, egestion, leaf-fall; consumed by decomposers | The ecosystem's capacitor |
| Odor fields `S1..S3` | Emitted by organisms/corpses; decay + diffuse | Food smell, mating pheromone, death/alarm scent |
| Flow `(Fx,Fy)` (optional) | Static or slowly rotating Perlin vector field | Currents for drifting organisms |

Field updates are 5-point diffusion stencils with toroidal wrap — at 128² cells and ~6 fields this is a trivial per-tick cost even on a phone.

**The light source.** A single source with user-adjustable position (drag it), intensity, and radius; irradiance at a cell falls off as a Gaussian of toroidal distance. Two optional behaviors: an orbit mode (the source circles the torus, creating day/night and seasonal-style migration pressure) and canopy shading (dense producer biomass in a cell attenuates light reaching that cell, creating competition for light among producers — the mechanism that keeps producers from becoming a uniform carpet). **[H]** Canopy shading is hypothesized to be the cheapest driver of spatial pattern formation; verify in Phase 1.

**Mineral lifecycle.** Minerals exist in exactly four compartments: dissolved in cells (`M` field), bound in living bodies, bound in corpses, bound in detritus. Every transfer is a move between compartments, never creation or destruction. The UI shows the four-compartment breakdown as a stacked bar; the total is flat by construction, and any drift is a bug surfaced immediately.

## 5. The chemistry of food

Every parcel of biomass — a living body, a corpse, a detritus deposit, a user-dropped food pellet — is a vector of components:

`B = (E, P, M, S)` — energy carriers (sugars/lipids), protein (building material), minerals, and structure (cellulose/chitin-like, hard to digest, also serving as armor).

Organisms carry three internal stores (energy, protein, mineral) plus their structural body mass. The rules that make this vector matter:

1. **Photosynthesis** converts light + dissolved mineral into `E` and (at extra cost) `P`.
2. **Digestion** is genome-specific: an eater absorbs each component with its own efficiency gene (`digE`, `digP`, `digS`). What is not absorbed is egested as detritus at the eater's position — closing the loop and feeding the decomposers. A grazer with high `digS` can live on tough algae mats; a predator with high `digP` needs meat.
3. **Stoichiometry (Liebig's law of the minimum).** Growth and reproduction require `E`, `P`, and `M` in fixed ratios; the scarcest component limits. An organism can be energy-rich yet mineral-starved — visible in its detail card — which produces realistic limitation patterns (e.g., a bloom stalls when minerals run out even under full light).
4. **Metabolic pricing.** Basal metabolism scales with body mass^0.75 (Kleiber-like), movement costs scale with speed² × size, and maintaining structure/armor and organ redundancy has ongoing costs.

Four components is a deliberate ceiling. Each additional component multiplies genome loci, digestion parameters, and tuning surface; below four, the interesting phenomena (energy/building-material tension, decomposer niche, armor trade-off) disappear. **[H]** Four is hypothesized to be the sweet spot; the architecture allows adding a component later (all chemistry is vectorized), but the concept argues against it.

## 6. Organisms: body, senses, behavior, movement

**Body.** An organism is: position/velocity, species id, genome (Section 8), three stores, structural mass, subsystem health (Section 7), behavior state, and age. Rendered as a symbol: shape encodes trophic role (disk = producer, triangle = grazer, chevron = predator, square = decomposer, ring = filter feeder, cross = scavenger), fill color is the genome's pigment genes (so genetic drift is literally visible as color drift), size encodes body mass, and small overlays encode state (pulse = seeking mate, flicker = starving, gray-out = dying, dotted outline = encysted).

**Sensing.** Organisms sample the fields at a few offsets around themselves (gradient of food odor, mating pheromone, alarm scent, light) and query neighbors within `sensorRange` via the spatial hash. No raycasting or vision cones in v1 — smell-driven navigation is cheaper, more authentic at microbe scale, and creates readable behavior (organisms visibly follow plumes).

**Behavior: a finite automaton per organism** — your "state machine" requirement at the micro level. States: `Rest`, `Forage`, `Pursue`, `Flee`, `SeekMate`, `Reproduce`, `Encyst`, `Settle` (for larval stages of sessile species). Transitions are driven by internal thresholds (hunger, fear, reproductive readiness, damage) that are themselves genes. Example: `Forage → Flee` when alarm scent × `fearfulness` exceeds threshold; `Forage → SeekMate` when stores exceed `reproThreshold`. The automaton is identical for all species; genomes shape which transitions ever fire. A sessile alga is simply an organism whose thresholds and movement type make it never leave `Rest`/`Reproduce`.

**Encystment** deserves emphasis: under prolonged starvation an organism may (gene-gated) enter a dormant cyst — near-zero metabolism, failure clock nearly paused, blind and immobile — and awaken when nutrient odor returns. Real protists do exactly this, it is nearly free to implement, and it is one of the strongest stabilizers against extinction spirals (Section 12).

**Movement techniques**, each a distinct kinematic controller with its own cost profile, selected by a discrete genome locus:

| Technique | Kinematics | Cost profile | Real-world model |
|---|---|---|---|
| Run-and-tumble | Straight runs; random reorientation; tumble rate drops when the sensed gradient improves | Cheap, jittery | Bacterial flagella (E. coli chemotaxis) |
| Ciliary steering | Smooth continuous turning with inertia | Moderate, efficient cruising | Ciliates (Paramecium) |
| Amoeboid crawl | Slow biased random walk; ignores flow | Very cheap, very slow | Amoebae |
| Passive drift | Carried by the flow field; buoyancy trim only | Nearly free, uncontrolled | Phytoplankton |
| Jet burst | Impulse with cooldown; used to strike or escape | Expensive spikes | Copepod escape jumps |
| Sessile (+larva) | Fixed after settling; offspring drift then settle | Zero locomotion, all-in on defense/filtering | Algae mats, ambush hunters |

## 7. Aging and death from real failures — the reliability engine

This is the heart of the concept, and the direct answer to your question whether lifespan can rest on "real failures like in actual life." The honest answer: molecular realism (telomeres, ROS chemistry, protein misfolding) is out of reach in any simulation, let alone a phone. But the *statistical structure* of real biological failure is reachable, because Gavrilov & Gavrilova showed that it follows from architecture alone: model the organism as vital blocks in series, each block a parallel bundle of redundant components with constant (non-aging!) failure rates, and you get organisms that age — with mortality rising exponentially (Gompertz law), decelerating into plateaus at extreme ages, and switching to Weibull-type kinetics when individuals start life flaw-free. We implement exactly that:

**Structure.** Each organism has four vital subsystems in series — membrane, metabolism, locomotion, sensing — plus reproduction as a fifth, non-vital one. Subsystem `i` has `n_i` redundant units (a genome locus; more redundancy costs more protein and mineral to grow, and more upkeep — P3).

**Failure.** Each tick, each working unit fails independently with hazard `h = h0 × stress`, where stress aggregates metabolic rate (fast living burns components — rate-of-living emerges), starvation, injuries from attacks, toxin exposure, and heat near an over-cranked light source. Units do not age individually; the *organism* ages because redundancy silently depletes.

**Degradation before death.** A subsystem's performance scales with its fraction of working units: a half-failed locomotion subsystem means a visibly slower organism; failing sensors mean blundering navigation. Old organisms therefore become slower and easier prey *before* they die — which is how senescence actually enters ecology.

**Repair.** A `repairAllocation` gene diverts energy and protein to restoring failed units, imperfectly and at rising cost. This single gene reproduces the disposable-soma trade-off: allocate to repair and live long but reproduce slowly, or allocate to offspring and burn bright. Selection gets to decide — and will decide differently for a bacterium than for an apex predator, which is precisely the r/K spectrum emerging from accounting.

**Initial damage load.** Newborns can start with some units already failed (a configurable fraction, per Gavrilov's "high initial damage" conjecture). Sliding this parameter between 0 and high load moves populations between Weibull-like and Gompertz-like mortality — a genuinely publishable-quality experiment your users (or you, with a mathematician's eye) can run from the settings screen.

**Death and its ledger.** An organism dies when any vital subsystem hits zero working units — or from starvation (energy store empty pays basal cost with body mass until collapse) or predation. Every death is logged with its cause: `predation`, `starvation`, `membrane failure`, `metabolic failure`, etc. The statistics screen shows cause-of-death composition and per-species lifespan histograms with a Gompertz fit overlay. Expect predation and starvation to dominate in the wild — as in real ecosystems, where few organisms die of old age; to *see* the Gompertz curve, run a predator-free "hospice world" preset. This expectation is stated here so it is not later mistaken for a bug.

No parameter anywhere says "this species lives ~800 ticks." Species-typical lifespans emerge from their redundancy, repair allocation, metabolic pace, and ecological danger — randomized per individual by the stochastic failures. This satisfies the requirement in its strong form.

## 8. Genome, reproduction, and evolution

**Genome.** One fixed-length vector of ~24 real-valued loci plus three discrete loci, identical across all species (P1). Real loci include: body size, max speed, sensor range, the three digestion efficiencies, pigment (3 loci, doubling as display color), armor investment, aggression, fearfulness, hunger/fear/reproduction thresholds, offspring investment, clutch size, repair allocation, four redundancy counts, mutation rate (itself evolvable), sex probability, and pheromone emission strengths. Discrete loci: movement technique, diet tag mask, body tag mask.

**Who eats whom.** Not a hardcoded matrix. Predation is possible when the eater's diet tags match the target's body tags *and* the size ratio falls inside a genome-tuned window, modulated by armor vs. attack. The initial 12 species (Section 9) are simply genome presets whose tags and sizes produce the intended food web — but because the web is computed from genomes, evolution can rewire it: a grazer lineage can drift toward carnivory. That is the payoff of universality, and also a maintenance hazard (Section 13, K5).

**Asexual reproduction.** Fission: the parent splits stores and body mass by `offspringInvestment`; the child's genome is a copy passed through the mutation operator (Gaussian noise on real loci scaled by the evolvable mutation rate; rare bit flips on discrete loci; very rare macro-mutation switching movement technique). Mutation sits in the reproduction pathway, Tierra-style.

**Sexual reproduction.** Gene-gated and for some species obligate: readiness triggers mating-pheromone emission; partners of the same species (genetic distance below a mating threshold) find each other by following the pheromone field; both invest gametes (a real fitness cost — sex must pay for itself); the offspring genome is a per-locus crossover of both parents plus mutation. Facultative species use a real protist strategy: clone when times are good, switch to sex under stress — letting you watch, live, the conditions under which recombination beats cloning. **[H]** Whether sex ever outcompetes cloning in this world is an open experiment, not a promise; the literature suggests it needs parasites or rapidly shifting environments, which the orbiting light source can provide.

**Horizontal gene transfer.** Bacteria-preset organisms may, on contact, copy one random locus from a neighbor — conjugation. Cheap to implement, and it makes decomposer populations adapt disturbingly fast, which is exactly right.

**Speciation and lineage.** Each organism carries a species id; when an individual's genetic distance to its species centroid exceeds a threshold, a new species id is minted with the individual as founder (the Bibites mechanism). Per-species aggregates (population, mean genome, founder, parent-species) feed a phylogeny view. Memory is bounded by keeping species-level aggregates plus a fixed ring buffer of history — never per-individual ancestry chains.

## 9. The base species roster

Twelve presets spanning four trophic levels. All are the one universal organism; the table shows the *intended* starting niches.

| # | Name | Role | Movement | Eats | Signature traits |
|---|---|---|---|---|---|
| 1 | Solara | Producer (mat) | Sessile + drifting spores | Light + minerals | Canopy shading, high structure, seed-bank floor |
| 2 | Drifta | Producer (plankton) | Passive drift | Light + minerals | Tiny, fast fission, boom–bust engine of the world |
| 3 | Chlora | Mixotroph | Run-and-tumble | Light, bacteria | Switch-hitter; photosynthesizes in light, hunts in shade |
| 4 | Bacillus | Decomposer | Run-and-tumble | Detritus | Fastest reproducer, HGT, encystment |
| 5 | Mycora | Decomposer (fungus) | Sessile + spores | Detritus, corpses | External digestion aura, spreads as patches |
| 6 | Cilio | Grazer | Ciliary steering | Bacteria, Drifta, Chlora | The classic protist everyman; facultative sex |
| 7 | Filtra | Filter feeder | Semi-sessile | Drifting cells in flow | Lives on the current; starves if flow is off |
| 8 | Gastro | Grazer (scraper) | Amoeboid crawl | Solara mats | Armored, slow, high structure-digestion |
| 9 | Venator | Predator | Cilia + jet burst | Cilio, Filtra | Pursuit hunter, high metabolism, short candle |
| 10 | Insidia | Ambush predator | Sessile + strike | Passing grazers | Near-zero idle cost, all-in on one strike |
| 11 | Rex | Apex predator | Jet propulsion | Venator, Gastro | Big, obligate-sexual, high redundancy, long-lived |
| 12 | Necro | Scavenger | Run-and-tumble | Corpses | Follows death-scent plumes; sanitation service |

Design intent behind the shape of this web: two producers with different strategies (sessile vs. drifting) prevent a single point of failure at the base; the decomposer pair turns every death back into minerals; predators are staggered so no single species controls all grazers; and Necro plus Mycora ensure corpses never pile up as dead matter outside the loop.

## 10. Interaction and UI — mobile UX specification (rewritten in v0.3)

### 10.1 Review findings: what was wrong with the v0.2 UI

A dedicated mobile pass on the previous Section 10 found seven concrete defects. (1) *Toolbar overload:* eight tools in one bottom bar on a ~390 px screen is icon soup for a first-time user. (2) *Fat fingers vs. microbes:* organisms render at 4–10 px; direct tap selection is physically impossible against a 44 px minimum touch target. (3) *Gesture conflicts:* pan, zoom, paint, and sun-drag all competed for one finger. (4) *A modal kill tool is a loaded gun:* one stray tap executes an organism by accident. (5) *Occlusion:* dragging the sun directly means the finger hides exactly what is being placed. (6) *No undo:* touch input mis-fires constantly; interventions were replayable but not reversible in the moment. (7) *Charts as a dashboard grid:* unreadable at phone width. Everything below exists to fix these.

### 10.2 Interaction model: two modes, the world always on screen

The world canvas never unmounts; everything else is a sheet drawn over it. There are exactly two modes, switched in the primary bar: **Observe** (default — pan, zoom, inspect; zero clutter, nothing can be altered by accident) and **Intervene** (a tool tray slides up; exactly one tool armed at a time, screen edge tinted amber as an unmistakable "you are editing the world" signal). The gesture grammar is fixed and identical everywhere:

| Gesture | Observe mode | Intervene mode |
|---|---|---|
| 1-finger drag | Pan the world | Apply armed tool (paint, place, drag sun) |
| 2-finger pinch/drag | Zoom + pan — *reserved, never a tool* | Same: always zoom + pan |
| Tap | Select nearest organism (inflated radius) | Apply armed tool once |
| Long-press | Magnifier loupe for precise selection | Tool options popover |
| Double-tap | Unassigned (avoids conflict with select) | Unassigned |

Two-finger navigation being permanently reserved means the user can always escape any tool state by simply using two fingers — there is no trapped mode.

### 10.3 Selecting a microbe with a thumb

Tap selection queries the spatial hash for the nearest organism within a 24 px world-space radius (hit target inflation); if several candidates fall inside, a chip row appears above the thumb showing their symbols for disambiguation. Long-press raises a loupe (offset above the finger, like text selection) for precise picking in dense blooms. Selection engages a follow-cam so the specimen cannot wander out from under its own card. The **specimen card** is a bottom sheet with three detents: *peek* (name, age, behavior state, store bars — world stays fully visible), *half* (adds the four subsystem health bars — the reliability engine made visible; watching an elder's bars thin out is the emotional core of the app), *full* (genome radar vs. species mean, lineage, per-organism actions). Individual actions — feed, energize, clone, kill — live **only on this card**, never as area tools: targeted, deliberate, and impossible to trigger by a stray tap.

### 10.4 Interventions, safety, and undo

The tool tray (Intervene mode) holds only area/world tools: mineral brush, feed drop, spawn (species chip carousel, then tap to place with ghost preview), barrier brush (grid-snapped with a thick preview line), barrier eraser, and sun control. Brushes show a ghost circle of their radius before committing. The sun is moved by *indirect* drag — while the sun tool is armed, dragging anywhere on screen moves the sun by the same delta — so the finger never occludes the placement, and fine positioning is easy. Every intervention is an event (P5), and every event gets an **undo chip** ("Wall added · Undo", visible ~5 s): touch input misfires are treated as normal, not exceptional. Undo is implemented honestly as event revocation at the next tick boundary, which the event-sourced core gives us nearly for free.

### 10.5 Layout, thumb zones, and screens

All interactive chrome sits in the bottom third; the top strip is passive status only. Portrait-first; in landscape, sheets become right-side panels.

```
┌──────────────────────────────┐
│ tick 48,211   ●audit   pop 1.4k │  ← passive status strip (safe-area inset)
│                              │
│        WORLD CANVAS          │  ← always visible, glows dark-field
│      (pan/zoom/tap)          │
│                              │
│                       [⏸/1×] │  ← speed FAB: tap cycles ⏸→1×→4×→16×,
│ ┌──────────────────────────┐ │     long-press = single-tick step
│ │ Observe Intervene Data ⋯ │ │  ← primary bar (44px+ targets)
└─┴──────────────────────────┴─┘
```

**Data** opens full-screen, horizontally swipeable chart pages — one chart per page (population by species, biomass by trophic level, mineral audit, causes of death, lifespan histograms with Gompertz overlay, phylogeny, per-compartment divergence), finger-scrub to read values, rendered from ring-buffer aggregates. **⋯** holds Scenarios, Settings (accordion groups; sliders paired with tap-to-type values because sliders alone are imprecise on touch; the research-grade surface folded under *Advanced*), and save slots.

### 10.6 Scenario and presenter mode

Scenario cards are bottom sheets with two or three sentences and exactly one CTA each; progress dots; the flagship card's CTA is "Remove the barrier." **Presenter mode** strips all chrome except that single CTA and the speed FAB — on stage, the screen shows a living world and one button.

### 10.7 Visual design direction (tokens)

Subject-grounded direction: **dark-field microscopy** — the world looks like backlit plankton in a droplet of pond water, which is both the literal subject and the reason a dark canvas is a functional necessity (genome pigments must carry meaning, so they need a dark ground to read against). The palette is a two-temperature system: the *world* is cool, the *human hand* is warm — every intervention affordance (Intervene tint, tool tray, undo chips, event markers on charts) uses one amber, so "what nature did" vs. "what you did" is legible at a glance, on canvas and in charts alike.

| Token | Value | Use |
|---|---|---|
| Abyss | `#0B131E` | Canvas ground |
| Water | `#152233` | Sheets, panels |
| Plankton | `#C9D7E3` | Primary text |
| Silt | `#5E7386` | Secondary text, hairlines |
| Lantern | `#F2B24A` | All human interventions, and only those |
| Pigments | genome-driven | Clamped to a minimum lightness (OKLCH L ≥ 0.6) so no lineage can evolve into invisibility |

Type: a single display face with a scientific-instrument character (e.g., Space Grotesk) for scenario cards and large numerals; the system UI stack for controls; tabular/monospaced numerals for tick counter and audit so values don't jitter. The **signature element** is the dark-field glow itself: organisms rendered with a soft additive bloom, so the ecosystem reads as luminous life on black water — memorable, subject-true, and doubling as the selection/state highlight system. Everything else stays quiet: hairline dividers, sentence case, no decoration. Quality floor: 44 px minimum targets throughout, visible focus states, `prefers-reduced-motion` respected (bloom becomes static, camera cuts replace glides), shape+color redundancy already covers color-blind users.

### 10.8 K8 — mobile-web platform limits (honest constraints)

The artifact runs in a browser iframe, which sets hard limits worth stating up front. `touch-action: none` on the canvas is mandatory or the browser will fight every gesture with page-zoom. Haptics are unreliable (Android-only `vibrate`, nothing on iOS) — feedback is therefore visual (ripples, the amber tint, undo chips). Wake-lock and true fullscreen may be unavailable inside the iframe: on a long unattended run the screen can sleep, and a backgrounded tab is throttled to a crawl — so the Phase 1 "30 minutes unattended" acceptance test runs screen-on, and the sim treats tab-restore gracefully (it resumes from its last tick rather than trying to fast-forward a fictional gap). Battery and thermals are UX on mobile: device-pixel-ratio capped at 2, three-layer canvas (slow-changing fields at low Hz, organisms per frame, chrome in DOM), dot-LOD when zoomed out, and an auto-degrade ladder (render fps → field resolution → population cap) rather than a sudden stutter.

## 11. Architecture and performance inside the sandbox

**Platform.** A single-file React artifact. The simulation core is a plain, framework-free JS module (pure functions over typed arrays); React only renders the shell, canvas, and sheets. This split keeps the hot loop out of React's render cycle and would let the core be lifted into a Web Worker later without rewrite.

**Data layout.** Structure-of-arrays with typed arrays: `Float32Array` columns for position, velocity, stores, body mass; `Uint8`/`Uint16` columns for species, state, movement type, and per-subsystem working-unit counts; genomes in one `Float32Array` with stride 27. Dead slots go to a free list; no per-organism JS objects, no per-tick allocation, no GC pressure.

**Spatial index.** A uniform hash grid with cell size = max interaction radius; neighbor queries read 9 cells. Rebuilt (counting-sort style) each tick — O(n), cache-friendly.

**Time.** Fixed simulation timestep (target 10 Hz) decoupled from rendering (30–60 fps with interpolation). If a device can't hold the budget, the sim drops to fewer steps per second (slow motion) rather than growing the timestep — determinism and stability are never sacrificed to frame rate. Speed 4×/16× runs extra sim steps per frame and skips render interpolation.

**Budget.** Target: 1,500–2,500 organisms plus 128² fields at 10 Hz on a mid-range phone. **[H]** This is an estimate from comparable JS simulations, not a fact; Phase 1 includes a benchmark scene, and the population cap plus field resolution auto-degrade on weak devices. Density-dependent mortality (crowding raises stress) doubles as the soft population cap and as ecological realism.

**Determinism.** One seeded PRNG (mulberry32), a strict system-update order, interventions applied only at tick boundaries, and no `Math.random` in the core. Transcendental functions (`Math.sin`, `Math.exp` …) are permitted: under the Section 15 decision (same-device replay only) they are deterministic on any given engine, and the earlier lookup-table rule is withdrawn as obsolete. A native port therefore guarantees statistical, not bit-exact, agreement with this implementation — verified via the headless tuner as a conformance suite. Replay = seed + config + event log. Honest caveat in Section 13, K2.

**Persistence.** The artifact storage API (`window.storage`) holds config presets and world snapshots: fields and organism arrays serialize to base64 at roughly 0.5 MB per snapshot — comfortably inside the 5 MB/key limit — giving multiple save slots plus an auto-checkpoint. Snapshots can also be exported/imported as JSON text for sharing.

## 12. Stability engineering — why most ecosystem sims die, and our countermeasures

The genre's classic failure is known since Lotka–Volterra: closed predator–prey systems oscillate with growing amplitude until a trough hits zero, and a small map makes it worse. Realistic parameters usually produce a beautiful bloom, a crash, and a dead screen after ten minutes. The countermeasures, in order of realism:

Fully realistic: the detritus/decomposer loop acts as a capacitor smoothing pulses; encystment lets prey and decomposers wait out famines; two producer strategies and staggered predators remove single points of failure; density-dependent stress caps blooms; canopy shading self-limits producers. Semi-realistic: a refugia floor — algae mats and cysts cannot be grazed below a small seed-bank remnant (defensible: real grazers can't extract the last spore from sediment). Frankly artificial: an optional "spore rain" immigration trickle that reseeds extinct base species at very low rate — off by default, clearly labeled in the UI as an artificial stabilizer, because silently faking persistence would corrupt every conclusion drawn from the sim.

**[H]** The realistic measures alone may hold a 12-species web for 30+ minutes; nobody can promise this before tuning, and tuning is the project's real cost center — expect it to consume as much effort as all feature code combined.

## 13. Contradictions and tensions in the requirements — read before approving

**K1. "As sophisticated as possible" vs. a phone in a sandbox.** These conflict directly. This concept resolves it by choosing *depth over breadth*: deep chemistry, reliability-based mortality, and real evolutionary operators — while cutting neural-net brains, morphological body plans, and 3D. If you would rather trade the reliability engine for evolving brains, say so now; both do not fit.

**K2. "Universal state machine" vs. interactivity and randomness.** Resolved in principle by seeding and event-sourcing (P5). Two honest limits remain: floating-point results can differ across browser engines, so bit-exact replay is guaranteed on the same device only; and any UI interaction that reads state mid-tick must be queued, which adds up to one tick of input latency. If cross-device reproducibility matters to you, the core must use fixed-point integer math — feasible, costs effort and some speed.

**K3. "Real failures like in actual life."** Contradiction between "real" as mechanism and "real" as statistics. Mechanistic realism (actual biochemistry of aging) is impossible at any budget. Statistical realism — mortality curves with the same laws, plateaus, and trade-offs as real organisms, produced by the same *architectural* cause (redundancy exhaustion) — is what Section 7 delivers. You should decide whether that satisfies the intent; I claim it is the strongest honest interpretation available.

**K4. Ecological realism vs. persistence.** Real small closed ecosystems go extinct; a sandbox that must run indefinitely therefore cannot be fully realistic. The design makes every anti-realistic stabilizer optional and visible rather than hiding it. Could it be entirely otherwise? Yes: you could embrace extinction as the product — a memento-mori sandbox where every world eventually dies and the interesting object is the *history*. That would be a different, arguably more honest app. Flagging it as a real alternative, not a straw man.

**K5. Twelve curated species vs. open evolution.** Evolution will erode your curated roles: after an hour, "Cilio" may be a paraphyletic label on a swarm of things. Either accept this as the point of the exercise (recommended — the phylogeny view exists to make it legible), or add a "role lock" toggle that clamps diet tags per species and sacrifices open-endedness.

**K6. Detailed food chemistry vs. observability.** Devil's advocate against my own Section 5: a viewer cannot *see* protein versus energy; detailed chemistry risks being invisible bookkeeping that only makes tuning harder. The mitigation is UI (store bars, limitation badges like "mineral-starved" over stalled blooms). If, in Phase 2, the chemistry produces no visible ecological difference from a single-currency model, it should be simplified back. Pre-committing to that test guards us against sunk-cost sophistication.

## 14. Build roadmap

Five phases, each shippable and each ending in a falsifiable acceptance test:

**Phase 1 — Skeleton world.** Torus, fields, draggable light, Solara + Drifta + Cilio, energy-only chemistry, fission with mutation, the Observe/Intervene shell with the full gesture map and specimen card (Section 10), speed control, benchmark scene. *Accept when:* 30 minutes screen-on on a mid phone, no extinction at defaults, ≥ 30 fps at 1,000 organisms, and every interactive element passes a 44 px touch-target audit.

**Phase 2 — The loop closes.** Full E/P/M/S chemistry, detritus, Bacillus, Mycora, Necro, egestion, mineral audit. *Accept when:* the audit stays flat to ±0.1% over an hour, and switching decomposers off visibly chokes the producers (the loop demonstrably matters — this is also the K6 test). *Detailed increment plan (post-Phase-1 revision): see phase2-plan.md.*

**Phase 3 — The web.** Remaining species, all movement techniques, behavior automaton, encystment, god tools including the barrier brush (Section 16), compartment labeling, event-sourced interventions. *Accept when:* a three-trophic-level web persists 30+ minutes with artificial stabilizers off, and a walled-off compartment maintains its own independent, flat mineral audit. *Detailed increment plan (post-Phase-2 revision, incl. scope re-pricing to eight species): see phase3-plan.md.*

**Phase 4 — Mortality.** Reliability subsystems, repair gene, initial damage load, death ledger, lifespan histograms with Gompertz overlay, "Hospice world" preset. *Accept when:* the predator-free control run shows an emergent exponential mortality rise without any lifespan parameter existing in the code.

**Phase 5 — Evolution and polish.** Sexual reproduction, HGT, speciation + phylogeny view, per-compartment divergence analytics, guided scenarios (Section 16), charts, presets, snapshots/replay, performance auto-degrade. *Accept when:* a facultative-sex species measurably shifts its sex rate under an orbiting light, a saved world reloads bit-identically on the same device, and the split–diverge–reconnect experiment runs end-to-end from a scenario card.

Each phase is one focused build session in the sandbox; the concept assumes 5 iterations, not one heroic prompt.

## 15. Decisions from review round 1 (2026-08-28)

**Purpose:** a sandbox for exploring and playing with artificial organisms — the world has to be complex enough to surprise you and legible enough that you can see why. Consequences: UI in English; polish, presets, and guided scenarios (Section 16) are core scope rather than nice-to-have; the research-grade parameter surface stays but moves behind an "Advanced" fold so the first screen reads clean. Rigor is operationalized, not asserted: acceptance-tested phases (Section 14), a visible conservation invariant (the mineral audit), honest labeling of every artificial stabilizer, and reproducible runs. **Determinism:** same-device replay is sufficient — a fixed seed reproduces a run exactly, which is what makes an experiment repeatable; the fixed-point cross-device option is dropped. No open points block Phase 1.

## 16. Barriers and split-world experiments (added in v0.2)

New requirement: manually build barriers that partition the world, remove them later, and watch the previously separated ecosystems interact. Verdict: possible, cheap relative to its payoff, and probably the strongest single feature in the app.

**Mechanics.** A barrier is a wall mask (`Uint8`) over the resource grid, painted and erased with a brush tool (The Life Engine's wall cells are the precedent). Walls block organism movement (sliding collision against the mask) and field diffusion (a no-flux condition in the stencil). One elegant consequence falls out of the existing design: because navigation is smell-driven, blocking diffusion automatically blocks perception — organisms cannot smell food behind a wall, so they never pathologically press against it, and no pathfinding code is needed. Housekeeping rules: painting over occupied cells nudges organisms to the nearest free cell; matter (detritus, corpses) in overwritten cells is relocated to an adjacent cell, so the mineral audit stays exact to the gram. Wall edits are events under P5, hence replayable — a replayed run can include the wall removal at a fixed tick.

**Compartments as first-class objects.** Whenever walls change, a flood-fill labels connected regions (trivial at 128²). Each compartment then gets its own analytics: population by species, four-compartment mineral audit, mean genome per species, and a genetic-divergence measure between compartments. On a torus, note, a single straight wall across one dimension already splits the world in two — the cheapest possible staging.

**What this unlocks scientifically.** Allopatric speciation: split the world, let the two populations drift apart (visible directly, since pigment genes are the display color — the two halves literally change color independently), then remove the wall: do the lineages still interbreed, or has divergence crossed the mating threshold? Plus founder effects and drift in small compartments, island-biogeography size effects (small compartments go extinct more often), and invasion dynamics on reconnection when one side has evolved the more efficient grazer or predator.

**K7 — barriers vs. the single light source.** A sealed compartment far from the sun starves by construction; the single-light requirement and the compartment feature interact. Three resolutions, all worth building: an ambient-light floor (slider, small but nonzero by default), orbit mode so the sun visits all compartments (default-on when barriers exist), or deliberately embracing the starvation as the lesson about energy dependence. The concept defaults to orbit-on but keeps all three.

**Guided experiments.** Alongside the open sandbox, the app gains a set of scenarios ("Experiments"): pre-staged worlds with fixed seeds, two or three short narration cards, and exactly one decisive user action each — "remove the barrier now" being the flagship. The open sandbox rewards patience; a five-minute experiment with a visible payoff is the way in for someone meeting the world for the first time, and determinism means it unfolds the same way every run.

**A caution about metaphor.** Split-and-reconnect dynamics invite social readings — separated groups diverging, reconnection producing dominance, hybridization, or the loss of local practice — and the reading suggests itself without any help. Treat it as an illustration of what complex adaptive systems generically do, never as evidence about any real population or organization; a toy ecosystem has no standing to predict anything outside itself. Saying that limitation out loud is part of using the model honestly.

---

*Sources drawn on: The Life Engine (M. Robinson, thelifeengine.net); The Bibites (L. Caussan); dietrich-stein/awesome-evolution-simulators; ALIEN (alien-project.org); Evolving Protozoa; Sugarscape (Epstein & Axtell 1996); NetLogo Wolf–Sheep Predation; Tierra (T. Ray) / Avida; Berg & Brown's E. coli chemotaxis work; Gavrilov & Gavrilova, "The reliability theory of aging and longevity", J. Theor. Biol. 213 (2001) 527–545.*

---

## Purpose amendment (2026-08-28)

The centerpiece is re-founded: not the staged split-world experiment, but the app as a living instrument — deep modeling plus ecosystem monitoring good enough to learn what an intervention actually did. The goal: a massively complex system, a set of sensible levers, and understandable, honest information on status and development. Phase order re-cut accordingly: Phase 4 = Observatory (see observatory-design.md), Phase 5 = reproduction & genetics (arriving observable, onto ready-made charts), then polish; reliability-aging engine and barriers retain their design sections and re-entry conditions but leave the critical path.
