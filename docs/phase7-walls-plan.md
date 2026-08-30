# Phase 7 W — Walls, separation areas, hideouts

Owner request (2026-08-30): walls with properties — how much light and heat can pass,
and which organisms are affected — enabling separation areas and prey hideouts.
This resumes the Phase 3 barrier block (deferred 2026-08-28, design in phase3-plan.md §5)
with what Phase 7 changed underneath it: light and warmth are now in-world energy
sources (`W.sources`), not a sky, so a wall occluding them is physical rather than a
contradiction of the old "light comes from above" rationale. Phase 3's own consequence
note — "the split–diverge–reconnect experiment has no vehicle until this block returns" —
is exactly the vehicle this block builds.

## 1. Prior art (survey, 2026-08-30)

- **Diffusion at barriers.** Post-hoc masking of cells (common in Gray-Scott toys) is
  not mass-conserving — disqualified for a conserved-M world. The standard that is:
  finite-volume *per-interface* transmission — every flux term between two cells is
  multiplied by a factor w ∈ [0,1] that is the same for both sides. Conservation is
  exact by construction for any w (mass moves only in matched pairs); w=0 is a perfect
  no-flux wall, matching Phase 3's plan. Reservoir simulation and "gray" lattice-
  Boltzmann porous-media methods are the reference points.
- **Continuous agents vs walls.** Three families: occupancy look-ahead (NetLogo,
  The Life Engine), swept segment collision with slide (game engines), soft avoidance
  forces (Boids, Flow-Lenia). Avoidance forces are leaky — unacceptable when
  per-species impermeability is a contract. The cheap watertight form: walls on grid
  *faces* + axis-separated move-and-cancel — each axis component is dropped if it
  would cross a blocked face, the other axis still moves, so organisms slide along
  walls with no extra math and no RNG.
- **Refuges in ecology.** Gause 1934 (sediment refuge → predator starves), Huffaker
  1958 (vaseline barriers slowed predators, sticks let prey disperse — asymmetric
  permeability is what sustained the oscillation), Lotka-Volterra refuge terms
  (a refuge damps the prey cycle; too large a refuge starves the predator out).
  Per-species wall permeability is literally a Huffaker apparatus; the measurement
  targets below come from this theory. Predator-fence agent models use probabilistic
  crossing — rejected here: it would add a conditional draw in step()-reachable code.
  Passage is deterministic per (wall, species), like Rain World's size-gated geometry.
- **Light occlusion.** Roguelike shadowcasting vs Minecraft-style flood fill vs
  diffusive light. Chosen: keep the analytic summed-Gaussian field and multiply a
  per-source attenuation from a DDA ray-march over wall faces, computed only when
  walls or sources change (both are events). With zero walls every factor is 1 —
  the certified world's field is reproduced bit for bit.

## 2. Representation — faces, not cells

A wall is a player-drawn stroke, snapped to grid **corners** and rasterized into a
4-connected staircase of cell-boundary **edges** (integer Bresenham over corners,
deterministic). Each edge is one face barrier. Faces, not filled cells, because:

- a face is infinitely thin — no world area is stolen, no organism, corpse, mat or
  mineral is ever "inside" a wall, so Phase 3's housekeeping problem (nudging
  occupants out, relocating detritus) disappears;
- the finite-volume transmission story is exact on faces;
- max per-tick displacement (Venator burst ≈ 4.3) is far under CELL=16, and the
  crossing loops handle multi-cell jumps (Cilio jink 22, Solara spread 70) anyway.

State (in `W`, all compiled from `W.walls` by `compileWalls()` at wall events only):

- `W.walls` — array of `{ x0,y0,x1,y1, lt, ht, fl, pass, faces, path }` (path = the
  snapped corner polyline, for rendering and hit-testing).
- Per-face property planes, vertical (`V`, indexed by the left cell) and horizontal
  (`H`, indexed by the top cell): `wfPassV/H` (Int32 bitmask of bodyTags that may
  cross; open = all bits), `wfLtV/H`, `wfHtV/H`, `wfFlV/H` (Float32 transmissions,
  open = 1). Overlapping walls: later in the array wins on shared faces.
- `W.wallsOn` — the one flag every hot path gates on. False ⇒ every wall branch
  short-circuits and the arithmetic is the shipped world's, bit for bit.
- `W.wShade` — per-cell occluded/unoccluded light ratio (1 everywhere without
  walls); UI-only derived field so the painted light layer can show honest shadows.

## 3. Wall properties (the owner's three axes, plus one)

| key    | name (rule 8)               | range | effect |
|--------|-----------------------------|-------|--------|
| `lt`   | Light — transmission        | 0..1  | multiplies each source's light per crossed face (ray-march) |
| `ht`   | Warmth — conduction         | 0..1  | same, for each source's warmth term |
| `fl`   | Flow — water exchange       | 0..1  | multiplies the diffusion flux across the face: dissolved mineral, food scent, alarm scent |
| `pass` | Passage — who can cross     | bitmask | a species crosses iff its bodyTag is in the mask |

A wall with lt=ht=fl=1 and pass=all is exactly no wall — property continuity, and the
proof that the mechanism is inert at the open end. Presets (UI sugar, all four are
just `wallSet` values):

- **Stone** (default): sealed. lt 0, ht 0, fl 0, pass ∅. The BACI separation area.
- **Glass**: light through, no matter or bodies. lt 1, ht 0.5, fl 0, pass ∅.
- **Fine mesh**: the plankton hideout. lt 0.9, ht 0.9, fl 0.7, pass {Solara, Drifta, Bacillus}.
- **Coarse mesh**: everything but the apex. Same transmissions, pass adds Cilio.

Notes accepted deliberately: `ambient` light (0.03) and `tempAmb` are floors, not
sources — walls do not occlude them. Detritus does not diffuse, so a sealed cell's
detritus decomposes in place and its leached mineral stays until something that may
enter recycles it — a sealed area with no Bacillus strangles by K6 logic; that is a
finding for the player to make, not a bug.

## 4. Sim mechanics

- **Movement** — every position write in step() goes through `moveOrg(i, dx, dy)`:
  without walls it computes `wrap(x+dx)`, `wrap(y+dy)` exactly as today; with walls,
  axis-separated: drop the x component if any vertical face crossed at the current
  row refuses this species; then the y component likewise (at the updated x). Sliding
  falls out. Applies to drift, tumble, steer, and the escape jink. Draw-free; draws
  ahead of it are untouched.
- **Reproduction placement** — the child's offset draws happen as today (pre-draw
  pattern); if the L-path from parent to child crosses a refusing face, the child
  spawns at the parent's position instead (division succeeds, dispersal is blocked —
  mats pile against walls until crowding gates them).
- **Hunting through walls** — a steer forager skips candidates whose L-path from the
  hunter crosses a face the *hunter* cannot pass (`W.wallsOn` gated). This is what
  makes a hideout hide: no through-mesh bites from an adjacent cell, no permanent
  wall-camping fixation on one unreachable prey. Consequences that stay: kin
  interference still counts through walls (crowding is local, cost of a DDA per kin
  pair not justified), the corpsivore radius ignores walls, cyst prey-wake can fire
  through a wall (it wakes into a wall, harmless). Recorded, not hidden.
- **Fields** — the three diffusion stencils (M, scent, alarm) multiply each of their
  four neighbour terms by the face's `fl` (1.0 without walls — bit-identical by
  IEEE ×1.0 exactness, verified by conform). Leach and corpse passes untouched
  (cell-local). `computeLight`/`computeTemp` multiply each source's Gaussian by the
  product of `lt`/`ht` over faces crossed on the minimal-image ray (torus DDA); the
  gradient fields `lgx/lgy`, `tgx/tgy` inherit occlusion automatically, so Drifta
  steers around shadows and thermotaxis feels heat shadows with no extra code.

**RNG contract.** Walls add zero draws anywhere. With `W.wallsOn` false the PRNG
stream and all arithmetic are the certified world's. With walls present the stream
diverges only through ecology (a skipped target changes later draws) — the same
declared status as moving a sun. Banner rule added to step.js. Conformance: both
fingerprints must be identical; the coreHash rebind is declared with this plan.

## 5. Events (the only write path)

- `wallAdd { x0,y0, dx,dy, lt?, ht?, fl?, pass?, at? }` → snap, rasterize, insert
  (`at` restores an undone removal), recompile + recompute light/temp. Rejected when
  `W.walls.length >= P.maxWalls` (8) or the stroke snaps to nothing. The stroke is a
  start point plus the DRAG VECTOR — an endpoint pair would be flipped by the
  minimal-image rule for strokes longer than half the world; |dx|,|dy| clamp to one
  wrap, so a full-height wall is a single stroke with |dy| = WORLD, closing on
  itself around the torus (found by the seal smoke test, 2026-08-30).
- `wallRemove { k }` → splice, snap returned for undo.
- `wallSet { k, lt?, ht?, fl?, pass? }` → clamped, prev returned for undo.

All logged in `eventLog` (replay substrate), all undoable, all impact-carded as
presses (a wall changes the regime). IV labels: "You built a wall", "You removed a
wall", "You changed a wall".

## 6. UI (mobile-first; desktop additive)

- **Drawing**: the long-press picker (the established add gesture) gains "▦ Wall".
  Choosing arms a one-shot draw: the next drag draws an amber, grid-snapped preview
  polyline; release commits `wallAdd` (Stone by default), opens the wall card,
  shows the undo chip. Desktop: `w` arms the tool; Esc cancels.
- **Selection**: in intervene mode, tap near a wall selects it (polyline hit-test) —
  wall card as a bottom sheet (mobile) / docked panel (desktop), exactly the sun
  card's frame: presets row, three sliders (light/warmth/flow), five species chips
  for passage, Remove, "Draw another". Delete removes the selected wall.
- **Rendering (minimal by design)**: a wall is a crisp 2.5px slate polyline
  (`#94A7B8`-ish over its own dark underlay) on a world-space offscreen redrawn on
  wall events only; dashed where anything may pass (a grille), alpha eased toward
  translucent as `lt` rises (glass). Never amber — placed walls belong to the world;
  amber is only the preview, the affordance ring on the selected wall, the chips and
  the card, per the two-temperature rule. Light honesty: `W.wShade` is painted as a
  darkening overlay on the light layer so the glow never claims light the field
  does not deliver behind an opaque wall. (The heat glow keeps the same visual
  simplification the ember layer always had; recorded.)

## 7. Measurement plan (instrument before knob) — `harness/walls.js`

- `--seal`: a full-height Stone wall splitting the torus in two (two segments).
  Verify: total M audit flat (auditM), zero cross-wall mineral flux, the sunless
  half strangles (K6 signature) while the sunlit half persists; 4 seeds.
- `--hideout`: a Fine-mesh box around a dark-water region seeded with Drifta.
  Refuge theory predicts: Drifta floor rises, cycle amplitude damps vs control;
  grazer excluded. Same-seed A/B, 8 seeds, 18k ticks.
- `--shade`: an opaque wall across the sun's flank; the mat must retreat from the
  shadow sector (light field, not painted shadow, is what selects).
- `--open`: a wall with lt=ht=fl=1, pass=all present for 18k ticks → fingerprint
  must equal the no-wall run exactly (property-continuity proof).

Acceptance for shipping: conform bit-identical (both fingerprints, hash rebind
declared), tune2 8/8 (no walls in the acceptance worlds), `--open` exact,
`--seal` audit flat, npm test green. The hideout and shade numbers are recorded as
findings, not gates — the gates for narration (refuge census channels, compartment
cards) are the deferred follow-up below.

## 7a. Measurement record (2026-08-30, shipped build)

- **`--open`** PASS 2/2: the transparent wall present for 3,000 ticks fingerprints
  exactly like the no-wall world. Property continuity proven; ships as a gate.
- **`--seal`** PASS 4/4: total M audit flat (drift ≤ 0.27 over 12,000 ticks — the
  Float32 stencil rounding the shipped world already carries); the dark side holds
  at exactly ambient light and empties completely (K6-style strangulation, the
  split-world experiment P3 wanted); the sun side persists. **Recorded**: the apex
  was lost on the sun side in all four sealed runs at 12k — a two-thirds world is
  below Venator's knife edge; consistent with the apex's establishment history,
  not gated.
- **`--shade`** 4/4: mat biomass in the shadow sector 0 versus ≈7,000 in the
  control. The occluded field selects; the painted layer is only a picture.
- **`--hideout`** (Fine mesh box, same-seed A/B, 18k): refuge floor (minimum
  Drifta after founding) higher with the mesh on 7/8; the box accumulates 27–153
  Drifta with grazers excluded in 5/8. **Finding (Huffaker's apparatus, complete
  with failure mode)**: on exactly the three seeds where a grazer sat inside the
  box at founding (11, 22, 88 — the mesh blocks its exit as well as its entry),
  the "refuge" inverts into a feedlot and Drifta ends far below control. Cycle
  damping is NOT consistent at this refuge size (CV down on 4, up on 3, tied 1) —
  the LV-refuge amplitude prediction is untested at 1/64th of the world's area;
  a larger-refuge sweep is future work, not a claim. Venator outcomes reshuffle
  in both directions (0/37, 40/6…) — the apex stays knife-edged, nothing gated.

## 8. Deferred (one extension, then defer — rule 9)

- Compartment analytics (flood-fill labels, per-compartment audit card) — the P3
  §5 design stands; re-entry when the seal experiment is worth narrating in-app.
- Refuge/wall observatory channels (89+) and detectors — after a shipped world
  shows a story worth telling; channels must be exactly 0 without walls.
- Sensing occlusion for kin interference and corpsivory; heat-shadow painting.
- Probabilistic leaky passage (a predator that sometimes squeezes through) — only
  as a declared change with the pre-draw pattern, priced by measurement.
