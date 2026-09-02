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

Solara is a colonial, mat-forming alga of the lit floor. Anchored in place, it
turns light and dissolved mineral into biomass, spreading cell by cell across
the sediment until crowding halts it. Where the light is strongest the carpet
grows thickest — the pond's primary producer and its living floor.

**Habitat** the lit floor near the sun; grows as a carpet, thickest where light is strongest.
**Behaviour** sessile; photosynthesises; divides into the neighbouring floor, and stops when the mat is crowded (about 90 units of biomass per cell).
**Food** light and dissolved mineral. **Eaten by** Cilio — poor food (10% energy yield), and the lowest 35 units of every mat are ungrazeable sediment refugia.
**Size** 7–9 units at founding; slow metabolism. **Lifecycle** small constant hazard; no cyst.
**Heritable** *Light* — shade-tolerant ↔ sun-loving.

> Prompt: a flat, lobed colonial alga spreading across dark sediment, seen from above; cells arranged in a tiled mat, deep green (#46D68C) with a translucent, slightly luminous edge; a few pale nuclei visible as points of light; the mat thins at its margin into single cells.

## Drifta — producer · plankton

Drifta is a free-drifting planktonic alga of the open water and the fastest
grower in the world. It rides the water with a weak pull toward light, and when
starved it folds into a resistant cyst until light returns. As the grazer's
favourite food, its numbers rise and crash in the pond's great prey cycles.

**Habitat** open water, wherever the light reaches; drifts up the local light gradient (Phase 7 H.3) — in dark water there is nothing to steer by, so it never crosses to a farther sun (measured, Phase 7 L.2).
**Behaviour** a damped random walk with weak phototaxis (drift speed 0.5); encysts when starved (18% reserve) and wakes when light returns.
**Food** light and dissolved mineral — the fastest grower in the world (kp 0.30). **Eaten by** Cilio — its best food (50% yield).
**Defense** an escape jink: 35% chance to break contact on each grazing attempt; heritably tougher or faster-growing.
**Size** 3.4 units. **Heritable** *Defense* — grazing resistance ↔ growth rate.

> Prompt: a single spherical planktonic alga, cyan-blue (#5BC8E8), with a bright nucleus and a faint radial gel halo; tiny surface spines suggesting its grazing defense; drifting, slightly off-axis, with motion blur on a few background particles.

## Cilio — grazer · ciliate

Cilio is a ciliate grazer — a single cell driven by a shimmering fringe of
cilia. It steers actively toward its prey, prefers Drifta above all, and flees
when the alarm scent of injured neighbours drifts past. It holds the middle of
the food web: chief consumer of the producers, and the sole prey of the apex
predator.

**Habitat** the productive core, following its food. **Behaviour** steering forager (speed 2.0, senses 42 units); pursues the nearest edible target, handles a catch for 14 ticks; flees down the alarm gradient when injured neighbours release alarm scent; encysts when starved and wakes when prey is near.
**Food** Drifta (best), Bacillus (survival food), Solara (poor). **Eaten by** Venator — with a 30% escape jink of its own.
**Size** 6 units; matures 200 ticks after division, divides at most every 160.
**Heritable** *Pursuit* — keener ↔ thriftier.

> Prompt: a teardrop-shaped ciliate, lavender-pink (#D7A6E8), oriented as if in pursuit, cilia rendered as a fine shimmering fringe, a visible oral groove at the front, cytoplasm with small food vacuoles glowing cyan (its last Drifta meal).

## Bacillus — decomposer · colony

Bacillus is a colony-forming decomposer bacterium. Tumbling along detritus
gradients, it consumes dead matter and returns its bound mineral to the water —
the recycling service every other species depends on. Without it, the pond's
mineral slowly locks up in corpses and the whole web strangles.

**Habitat** wherever dead matter settles; follows detritus gradients by run-and-tumble (speed 0.8).
**Behaviour** eats detritus energy and protein, and *mineralises* — returns bound mineral to the water. The world's recycling guild: switch it off and the world slowly strangles (the K6 experiment).
**Food** detritus. **Eaten by** Cilio (survival food, 25% yield); its cysts are edible at half yield.
**Size** 2 units; colonies, not cells. **Lifecycle** encysts when starved; wakes on detritus or death-scent.

> Prompt: a small rod-shaped bacterial colony, olive-gold (#9EA868), a cluster of short rods with a faint shared capsule, resting on a dark mottled patch of detritus; a few flagella hinted as fine lines; subdued glow — the dimmest organism in the world by design.

## Venator — predator · pursuit

Venator is the pond's apex predator, a fast pursuit hunter that feeds on Cilio
alone. It strikes in a straight line with a jet burst, holds a territory against
its own kind, and breeds slower than anything else in the water. An apex is
knife-edged by nature: it persists in most worlds and is lost in some.

Its visual model is *Didinium nasutum* (owner decision 2026-09-02, research in
organism-graphics-research.md §10) — the textbook ciliate hunter whose head-on
charge and engulf-whole feeding match Venator's code exactly: a stretched barrel,
a conical proboscis on a palisade of rods, and two girdles of cilia used only for
fast swimming. The earlier Ghost Ray form is retired from the app's render layer.

**Habitat** the hunting grounds around the core; a pack founds together as cysts and wakes when prey is near.
**Behaviour** fast straight-line pursuit (speed 2.4, senses 50 units) with a jet burst (×1.8 for 6 ticks, long cooldown); outturned by its prey; territorial — hunters near each other pay an interference cost; finishes the carcasses of its own kills.
**Food** Cilio only (80% yield). **Eaten by** nothing.
**Size** 9 units; the slowest breeder (700-tick cooldown). A knife-edged apex: present on most seeds, lost on some — reported, never required.
**Heritable** none, by decision: at ~25 individuals drift would dominate selection.

> Prompt: a barrel-shaped predatory ciliate modeled on Didinium nasutum, glacier blue (#A8D6F4), seen slightly from above in mid-charge; the barrel about twice as long as wide with a luminous membrane rim, a pale conical proboscis at the front supported by faint internal rods, two shimmering girdles of short cilia banding the body, and a curved band nucleus visible through the translucent cytoplasm.

## Mycora, Necro — defined, dormant

Sessile fungus and scavenger, both deferred from Phase 3 with named re-entry conditions. Profiles and prompts when they enter the world.
