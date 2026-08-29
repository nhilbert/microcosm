# Species profiles and image prompts

The specimen card shows a profile ("Steckbrief") per species, drawn from the same
`TRAITS` rows the simulation runs on — the numbers below are the sim's, in the
sim's units (world = 1024 units across; a tick = 0.1 s at 1×). Images live in
`assets/species/<key>.jpg` (640px square; full-size originals stay local under `full/`) and are optional: the card hides the slot
when a file is missing.

## Shared style prompt

> Scientific illustration meets bioluminescent microscopy. A single microscopic
> organism, centered, seen slightly from above, suspended in dark abyssal water
> (deep blue-black, #0B131E) with faint drifting particles. Soft internal glow in
> the organism's own color, cool rim light, shallow depth of field, no text, no
> UI, no background scenery. Square, 1:1. Realistic textures — membrane, cilia,
> cytoplasm — rendered with the restraint of a field guide plate, not a fantasy
> creature.

Append the species prompt to it. Keep the color literally as given: the app's
colour grammar is strict (amber is reserved for the human hand).

## Solara — producer · sessile mat

**Habitat** the lit floor near the sun; grows as a carpet, thickest where light is strongest.
**Behaviour** sessile; photosynthesises; divides into the neighbouring floor, and stops when the mat is crowded (about 90 units of biomass per cell).
**Food** light and dissolved mineral. **Eaten by** Cilio — poor food (10% energy yield), and the lowest 35 units of every mat are ungrazeable sediment refugia.
**Size** 7–9 units at founding; slow metabolism. **Lifecycle** small constant hazard; no cyst.
**Heritable** *Light* — shade-tolerant ↔ sun-loving.

> Prompt: a flat, lobed colonial alga spreading across dark sediment, seen from above; cells arranged in a tiled mat, deep green (#46D68C) with a translucent, slightly luminous edge; a few pale nuclei visible as points of light; the mat thins at its margin into single cells.

## Drifta — producer · plankton

**Habitat** open water, wherever the light reaches; drifts toward brightness.
**Behaviour** a damped random walk with weak phototaxis (drift speed 0.5); encysts when starved (18% reserve) and wakes when light returns.
**Food** light and dissolved mineral — the fastest grower in the world (kp 0.30). **Eaten by** Cilio — its best food (50% yield).
**Defense** an escape jink: 35% chance to break contact on each grazing attempt; heritably tougher or faster-growing.
**Size** 3.4 units. **Heritable** *Defense* — grazing resistance ↔ growth rate.

> Prompt: a single spherical planktonic alga, cyan-blue (#5BC8E8), with a bright nucleus and a faint radial gel halo; tiny surface spines suggesting its grazing defense; drifting, slightly off-axis, with motion blur on a few background particles.

## Cilio — grazer · ciliate

**Habitat** the productive core, following its food. **Behaviour** steering forager (speed 2.0, senses 42 units); pursues the nearest edible target, handles a catch for 14 ticks; flees down the alarm gradient when injured neighbours release alarm scent; encysts when starved and wakes when prey is near.
**Food** Drifta (best), Bacillus (survival food), Solara (poor). **Eaten by** Venator — with a 30% escape jink of its own.
**Size** 6 units; matures 200 ticks after division, divides at most every 160.
**Heritable** *Pursuit* — keener ↔ thriftier.

> Prompt: a teardrop-shaped ciliate, lavender-pink (#D7A6E8), oriented as if in pursuit, cilia rendered as a fine shimmering fringe, a visible oral groove at the front, cytoplasm with small food vacuoles glowing cyan (its last Drifta meal).

## Bacillus — decomposer · colony

**Habitat** wherever dead matter settles; follows detritus gradients by run-and-tumble (speed 0.8).
**Behaviour** eats detritus energy and protein, and *mineralises* — returns bound mineral to the water. The world's recycling guild: switch it off and the world slowly strangles (the K6 experiment).
**Food** detritus. **Eaten by** Cilio (survival food, 25% yield); its cysts are edible at half yield.
**Size** 2 units; colonies, not cells. **Lifecycle** encysts when starved; wakes on detritus or death-scent.

> Prompt: a small rod-shaped bacterial colony, olive-gold (#9EA868), a cluster of short rods with a faint shared capsule, resting on a dark mottled patch of detritus; a few flagella hinted as fine lines; subdued glow — the dimmest organism in the world by design.

## Venator — predator · pursuit

**Habitat** the hunting grounds around the core; a pack founds together as cysts and wakes when prey is near.
**Behaviour** fast straight-line pursuit (speed 2.4, senses 50 units) with a jet burst (×1.8 for 6 ticks, long cooldown); outturned by its prey; territorial — hunters near each other pay an interference cost; finishes the carcasses of its own kills.
**Food** Cilio only (80% yield). **Eaten by** nothing.
**Size** 9 units; the slowest breeder (700-tick cooldown). A knife-edged apex: present on most seeds, lost on some — reported, never required.
**Heritable** none, by decision: at ~25 individuals drift would dominate selection.

> Prompt: a sleek, spearhead-shaped predatory protist, glacier blue (#A8D6F4) with a bright leading edge and a translucent trailing mantle, seen head-on-quarter as it strikes; hollow, almost ghostly body with a luminous rim — the Ghost Ray of the app's render layer.

## Mycora, Necro — defined, dormant

Sessile fungus and scavenger, both deferred from Phase 3 with named re-entry conditions. Profiles and prompts when they enter the world.
