# MICROCOSM — Organism Graphics Research

2026-09-02 · owner request: "explore graphics improvement so the organisms look more real,
like an actual microscope view and real organisms — textures, predefined sprites, dynamic
vector graphics, low poly style."

Research only — nothing here is a decision. The house method applies: hypotheses, measured
substrate first, contradictions marked, the syntheses are proposals for an owner call.

---

## 0. The two facts that govern everything else

**Fact 1 — the pipeline is split, and only half of it is frozen.** Rendering is
grammar (frame.rs decides: which sprite bucket, where it projects, what the carpet pixel
is) plus painting (the platform decides: gradients, blend modes, the 64×64 bitmaps
themselves, stroke widths). The split is stated identically at `src/ui-render.js:183`,
`rust/microcosm-core/src/frame.rs:1` and `docs/android-app-plan.md`. The grammar is
bit-for-bit certified by `harness/fingerprint-frame.js` (in `port:check`, in CI). The
painting is explicitly NOT gate-compared (`ui-render.js:568`, `Sprites.kt:20`:
"deliberately not gate-compared"). **A graphics overhaul that changes only painting
touches no gate at all.** One that adds a display-list field, a bucket channel, or a new
LOD rule is a declared grammar change, written twice (JS reference + Rust) with a
recaptured fingerprint.

**Fact 2 — there is budget.** Measured on the Fairphone 5 at ~2,000 organisms
(`android-app-plan.md` A.1 table): the whole render is 1.26–1.84 ms/frame — 8–11% of a
60 Hz frame, ~9× headroom. The frame builder itself is 0.09–0.13 ms; the rest is Kotlin
issuing draw commands. The largest recorded inefficiency is not organisms at all: at low
zoom the six-layer torus tiling costs ~270 blits/frame, with a designed-but-not-taken fix
(compose layers into one tile bitmap per tick, ~45 blits). The bottleneck story
("core 250×, UI caps 16×") is about the renderer as a whole, and most of every frame is
**the world's floor and water, not the creature sprites**.

Corollary worth stating before any technique is weighed: today's organisms are 64×64
radial-gradient blobs with a shape mark; the mat — most of the visible biomass — is a
64×64 pixel field upscaled 16×, with an unresolved blockiness defect on device
(`Layers.kt:28`, plan §"open"). If the goal is "looks like a micrograph," **the cheapest
first win is probably the floor and the water, not the plankton**.

---

## 1. The substrate — what an organism IS on screen today

- Display list record (8 f64, `frame.rs:463`): kind, sx, sy, r, species, bucket
  (tint×morph bin), heading, strike flag. **No organism identity** crosses the boundary —
  the painter cannot tell individual A from individual B beyond position.
- ~112 baked 64×64 sprite bitmaps (species × tint bins × morph bins), four shape branches:
  nucleus (Solara marker), dot + defense ring (Drifta), tinted triangle (Cilio), rounded
  square (Bacillus). Venator is the one exception: `drawGhostRay`, procedural paths every
  frame, viable because the population is ~25.
- Fields, not sprites, carry the mass: carpet (Solara), mineral, corpse pall, wall shade —
  64×64 RGBA, once per tick.
- Animation is essentially absent: position interpolation, the 700 ms amber pour ring, and
  the strike stretch (sim-state-driven, not a clock). A `trail` parameter on
  `drawGhostRay` exists and is dead (only caller passes null); the Venator wake animation
  was **cut by owner decision** ("beside the point", CLAUDE.md history). Any time-varying
  organism rendering is greenfield — and, being painting, gate-free.
- Verification gap, honestly: **no screen exists in CI.** Instruments are
  `ChromeScreenshotTest` (Robolectric, `@GraphicsMode(NATIVE)`) and the bench-only
  playthrough. Whether anything *looks* right is settled only on the owner's device. Any
  graphics phase must plan its acceptance around that.

### Where a change may legally land — three tiers

| tier | examples | cost of admission |
|---|---|---|
| **P — painting only** | richer sprite bakes, procedural paths from existing record fields, UI-clock animation, particles, post effects, field smoothing | none — no gate touched; app-only (the browser is the renderer's frozen oracle by the 2026-09-01 decision, so the browser keeps the old look — a deliberate fork, named below) |
| **G — grammar change** | new display-list field (organism id, elongation, age), per-tile organism emission, new LOD rule, new bucket channel | declared change, JS + Rust in lockstep, fingerprint-frame recaptured, owner call |
| **R — new render API** | OpenGL/Vulkan layer, AGSL RuntimeShader passes | platform work in the app only; frame.rs untouched; min-SDK and testing questions |

---

## 2. Lens 1 — what "an actual microscope view" actually looks like

Real microscopy is several distinct looks, and they disagree:

- **Brightfield**: pale ground, organisms as faint translucent ghosts — most live cells
  are "bags of water," nearly invisible without staining.
- **Phase contrast**: transparent structures made visible as darker bodies on a light
  ground, with the characteristic bright **halo** at edges (Nikon MicroscopyU).
- **Darkfield**: only scattered light collected — organisms **bright against near-black**,
  edges and appendages glowing (Microbehunter comparison).
- **Fluorescence**: dark ground, structures in saturated **false color** — the one
  scientific practice where vivid arbitrary pigment on black is the honest look.

The finding that matters: **Microcosm already is a darkfield/fluorescence micrograph.**
`COL.abyss #0B131E`, screen-composite glow, and the concept doc states the dark ground as
a functional necessity for pigment legibility (microcosm-concept.md §palette). The
species-profiles.md portrait prompt ("scientific illustration meets bioluminescent
microscopy… dark abyssal water, soft internal glow, cool rim light, shallow depth of
field") is an **existing art direction** pointing the same way. So "more real" almost
certainly means *deeper into darkfield-fluorescence*, not a switch of regime.

Marked contradiction: real microbes are colorless; our saturated species colors are false
color by design (and load-bearing — the whole locus tint grammar rides on them). "Look
like real organisms" therefore cannot be literal. The honest reading of the request:
**realism of structure and motion inside the existing false-color darkfield** — not
realism of palette. (Devil's advocate: the owner might mean the iconic *brightfield petri
dish* look — pale ground, dark specks. That would invert the ground, break the pigment
rationale, and collide with the amber-hand rule against a light background. It is a
different product. Question 1 below.)

What makes a darkfield micrograph read as real — the ingredient list any technique will
be judged against:

1. **Translucency** — you see *into* the body: membrane distinct from cytoplasm, interior
   darker or lighter than the rim.
2. **Membrane** — a soft, slightly irregular outline, never a geometric primitive.
3. **Organelles** — nucleus, vacuoles, granules; sparse, off-center, asymmetric.
4. **Motion appendages** — the cilia fringe shimmer, flagellar wave; motion is where
   micrographs live.
5. **Imperfection** — no two individuals identical; slight asymmetry; deformation with
   motion.
6. **Depth** — particulate water (drifting dust, bokeh specks), things slightly out of
   focus, the sense of a water column rather than a plane.
7. **Optics artifacts** — halo at edges (phase contrast), vignette, faint chromatic
   fringe, grain.

Items 1–3 are texture-level (a better bake solves them). Item 4 is animation. Item 5
needs per-individual identity (a grammar question — see §4). Items 6–7 are world-level
post effects and cost almost nothing.

---

## 3. Lens 2 — the four candidate techniques, weighed

### (a) Textures — richer *procedural* sprite bakes (tier P)

Keep the architecture exactly as is (buckets → baked bitmaps → blit) and make the bakes
good: paint membrane, nucleus, vacuole, fringe into the 64×64 (or 128×128) offscreen at
startup with procedural strokes — per species silhouette, per bucket tint/ring/roundness
as today. Spore's deep lesson applies at miniature scale: its entire creature surface was
**computer-painted procedural texture** (Chris Hecker's liner notes) — authored *rules*,
not authored *pixels*, which is why it scaled across a combinatorial space. Our bucket
grid (49 variants for Drifta and Bacillus alone) is exactly such a space.

- Cost: zero per-frame delta (same blit count); bake time and memory trivial
  (112 × 128² RGBA ≈ 7 MB, and 64² may suffice — organisms are 10–40 px on screen).
- Buys: ingredients 1–3 outright. The single biggest realism-per-effort ratio for the
  *creatures*.
- Limits: static per bucket — no per-individual variation, no animation. Both can be
  layered on later (multi-frame bakes; see (c)).
- Risk: detail competes with the locus channels (§4); the bake must keep ring, tint and
  roundness readable at 10–40 px — the 10-second test is the bar, not prettiness.

### (b) Predefined sprites — authored/AI-rendered sprite sheets (tier P, pipeline risk)

Render the species-profiles portraits (or purpose-made art) into sprite sheets and blit
those. Asset precedent exists (`assets/species/` bundled into the APK).

- Buys: the highest per-frame visual ceiling; the portrait art direction verbatim.
- The problem is the grammar grid: authored art does not scale across 49 buckets ×
  future loci. Workable only as a **layered pipeline**: base body art × programmatic hue
  turn (the tint code already exists) × composited ring/roundness overlays. That is
  authored art *plus* the procedural system, not instead of it.
- Risks: style drift against the painted fields (an illustrated Cilio floating on a
  16×-upscaled carpet reads as a sticker); resolution/rotation cost (kind 3 rotates at
  blit time — fine); every future locus channel needs an overlay design, forever. And the
  hue-turn on richly colored art can produce mud where it produces clean shifts on flat
  color — must be proofed at the rails before adoption.
- Honest assessment: (b) collapses into (a) with imported reference. Use the portraits as
  *style targets* for procedural bakes rather than as runtime assets. Runtime-authored
  sprites make sense only for the two singletons where the grid is small: Venator (already
  procedural paths) and the corpse husk.

### (c) Dynamic vector graphics — procedural per-frame drawing (tier P, with a G edge)

Generalize the Ghost Ray: draw organisms as paths built each frame from the record fields
(sx, sy, r, sp, bucket, heading, strike) plus the UI clock. This is what Cell Lab does —
all-vector GL cells, ~1,000 at frame rate — and what Thrive does for periphery organelles
(cilia as a shader/procedural effect over the membrane, per its GDD). It is the only
technique that delivers ingredient 4 (motion appendages) and 5 (deformation) properly:

- **Membrane wobble**: polar perturbation of the outline, r(θ) = r·(1 + Σ aₖ sin(kθ + φ(t)))
  — the standard soft-cell trick (agar.io-family, metaball/marching-squares literature).
  Two or three harmonics suffice; full metaballs/marching squares are for *merging* blobs
  and are overkill here — organisms don't merge.
- **Cilia fringe** (Cilio): 20–30 short strokes around the rim, phase running with the
  clock and heading — truthful, because Cilio actually steers and pursues.
- **Flagella** (Bacillus): 1–2 sine-wave polylines aft — truthful for a run-and-tumble
  swimmer; wave amplitude keyed to whether it moved this tick is *state*, available from
  position delta.
- **Strike/afterglow language** (Venator, Cilio post-capture): already state-flagged or
  visible as path shape; D7's own doctrine — behaviour is the display.

Costs and limits, honestly:
- Per-frame path building for ~2,000 organisms is unmeasured. The Ghost Ray proves ~25 is
  free; 2,000 is a different claim. Rule 4 applies: build a throwaway bench (N wobble-blob
  paths on the render thread) **before** committing. The 9× headroom says it is plausible;
  plausible is not measured. The obvious hybrid if it misses: paths above a zoom
  threshold, baked sprites below — a *painter-side* choice, legal in tier P because the
  record already carries everything needed either way.
- **Per-individual identity does not cross the boundary.** Stable per-organism wobble
  phase or asymmetry needs an id; hashing position drifts as the organism moves. Painting
  alone can vary by species/bucket/heading/time — every Drifta wobbles in species-rhythm,
  not its own. Fixing that is one added display-list field (org index or a spawn-fixed
  seed): a small, clean, declared **grammar change** — the first spend this research
  would put to the owner.
- **The elongation collision** — marked contradiction: the natural "realistic" move of
  stretching a body along its velocity is exactly the channel the grammar has **reserved
  for a future speed locus** (D7 record, phase7-multilocus-plan decision 2). A
  motion-stretch would spend that reservation silently. Options: keep stretch below
  legibility threshold (defeats the purpose), spend the reservation deliberately (owner
  call, recorded), or reserve stretch for the two species that will never carry a speed
  locus. Not a technicality — the grammar's value is that every body channel means one
  thing.

### (d) Low poly — faceted flat-shaded stylization (tier P technically, identity change actually)

Cheap, readable, strong silhouettes — the literature is unanimous on its legibility and
mobile-friendliness. But it must be said plainly: **low poly points away from the stated
goal.** Faceted flat shading is the opposite of translucent membranes and soft darkfield
glow; it would also sit against the portrait art direction and the painted fields. It is
a coherent *alternative identity* ("paper-cut pond"), not a step toward "an actual
microscope view." If the owner wants it, it deserves its own mock-up round — but choosing
it means choosing stylization over realism, and the two should not be blended halfway
(half-faceted glow blobs would read as neither).

### (e) Not on the list, but belongs in the comparison — shaders and post effects

- **World-level post (tier P, cheapest realism of all)**: drifting particulate motes in
  the water (UI-side randomness — legal, rule 5), a soft vignette, very faint grain, and
  slight blur on the *far* layers (mineral, pall) to fake a focal plane. These are the
  ingredients 6–7 and they act on every pixel of every frame for a handful of extra
  draws. Films and games fake "microscope" mostly with these, not with better cells.
- **AGSL RuntimeShader (tier R)**: Android 13+ puts SkSL fragment shaders directly into
  Canvas Paint — per-pixel membrane/SDF bodies, real DOF, halo bloom, without an OpenGL
  rewrite. SDF smooth-blending (Quilez/Ronja lineage) could draw the whole population in
  one pass eventually. Min SDK gate and a second rendering idiom to maintain; at 9×
  Canvas headroom it is **not needed for performance**, only for looks Canvas cannot do
  (true per-pixel translucency layering, refraction). Park it behind a measured Canvas
  failure or a specific coveted effect.

---

## 4. Lens 3 — realism vs. the visual grammar (the real design tension)

The grammar is not decoration; it is certified meaning: tint = temperature locus, ring =
defense, corner roundness = feeding/metabolic, elongation reserved, movement loci get no
body channel (D7), amber = the player's hand only, species color = identity, the mat's
carpet turn and the chart tint as recorded exceptions. The bar is recorded too: the
10-second test (two rail populations side by side, a naive viewer must tell them apart),
and Spore's contract — *form must predict motion and motion must confirm form, or one of
them reads as a lie.*

Every realism ingredient audited against that:

| ingredient | collides with | verdict |
|---|---|---|
| membrane texture, organelles | tint legibility at small radii | safe if bakes are proofed at the tint rails; interior detail must stay dimmer than the rim |
| membrane wobble | ring outline (defense) | wobble amplitude must stay well under ring width; a tough Drifta's shell should read *stiffer* — wobble could even scale down with the defense bin, which turns a conflict into grammar |
| motion stretch | **reserved elongation channel** | owner call; see §3(c) |
| cilia/flagella | D7 (movement loci have no body channel) | appendages keyed to *species* and *actual motion state* are display of behaviour, which D7 endorses; appendages keyed to a movement locus value would violate it |
| per-individual asymmetry | nothing — but needs identity across the boundary | grammar spend (id field) |
| brightfield inversion | amber-on-dark hand grammar, pigment rationale | rejected above unless the owner really means it |

The truthfulness rule bites hardest on appendages: **Drifta must not get a flagellum.**
It is a passive drifter with weak phototaxis; a beating tail would promise self-propulsion
the sim does not contain. Cilio's fringe, Bacillus's tumbling flagella, Venator's jet —
truthful. Solara is a carpet and its realism lives in the field, not a sprite. The
realism budget should be spent only where the motion code can cash the promise.

One more honesty point: **corpses and cysts are half the micrograph.** A dead cell in
darkfield is a collapsing ghost — membrane folding, contents dispersing. Today's corpse
is two gray circles and a cyst is a flat disc. Decay states (husk deflating toward the
pall field that already exists) may buy more perceived realism than anything done to the
living, and the display list already carries corpse mass/size for it.

---

## 5. Lens 4 — platform reality

- The app is the product; painting changes land **app-only**. The browser keeps the old
  look by the same owner decision that froze it as the renderer's oracle. Marked plainly:
  this forks the two surfaces' appearance. Acceptable by decision, but the fork should be
  conscious — and it strengthens the recorded exit (web consumes the WASM frame builder)
  if the fork ever hurts.
- Canvas today, and Canvas is enough for tiers P at current scale: sprite blits are the
  fast path; per-frame path-building is the one unmeasured cost (bench first). Multi-frame
  sprite animation (e.g. 8 fringe phases × 7 Cilio buckets) is memory-cheap and keeps the
  blit path — likely the pragmatic middle between (a) and (c) for cilia at distance.
- Order of operations matters: **fix the field pipeline first.** The mat's device
  blockiness (open diagnostic, `Layers.kt:28`) and the ~270-blit low-zoom cost (designed
  fix waiting) are the floor under every screenshot. A realism pass on creatures over a
  blocky carpet is lipstick.
- Acceptance protocol, given no screen in CI: each increment ships with (1) a
  `ChromeScreenshotTest`-style PNG for the record, (2) a before/after `record`-ms line
  from the A.1 telemetry at the standard zooms, (3) the owner's device as the only
  arbiter of *looks*. Budget rule proposal: painting stays under ~2× today's record cost
  (≤3.5 ms at 2,000 organisms), leaving the layer fix as reserve.

---

## 6. Where the sources and the house rules disagree

1. **Realism vs. false color** — real microbes are colorless; the grammar needs pigment.
   Resolved only by naming the target: fluorescence-darkfield, structure-realism not
   palette-realism (§2).
2. **Low poly vs. microscope** — opposed aesthetics; the list item contradicts the list's
   own goal. One of them wins; halfway loses both.
3. **Motion stretch vs. reserved elongation** — realism's most natural move is the
   grammar's one reserved channel.
4. **Wake/trail realism vs. the recorded cut** — a wake was already tried and cut as
   "beside the point"; reviving trails needs a reason the first round lacked, e.g. as the
   *truthful* display of the jet burst rather than ornament. The dead `trail` hook makes
   the experiment cheap.
5. **Per-individual life vs. display-list anonymity** — the literature's cheapest
   realism (no two alike) is the one thing painting cannot do alone here.
6. **Authored beauty vs. combinatorial grammar** — Spore's answer (author rules, not
   pixels) is the only one that has scaled; it argues (a)/(c) over (b).

---

## 7. Synthesis — a staged proposal (each stage measurable, cuttable)

- **G.0 — the floor**: resolve the mat upscale defect; take the layer-composite blit fix
  if the diagnostic warrants. Pure repair, prerequisite for judging anything else.
- **G.1 — procedural bakes** (tier P): rebuild the four sprite branches with membrane /
  interior / organelle structure at the portrait art direction, channels preserved,
  proofed at tint rails and ring extremes at 10–40 px. Acceptance: side-by-side PNGs +
  10-second test + unchanged record ms.
- **G.2 — the water** (tier P): motes, vignette, grain, far-layer softening. Small,
  world-wide payoff.
- **G.3 — truthful motion** (tier P): cilia fringe phases (baked frames or strokes —
  bench decides), Bacillus flagellar wiggle keyed to realized motion, cyst dormancy
  stillness (its *absence* of motion becomes visible once others move), corpse decay
  states. Explicitly excluded: Drifta appendages, any locus-keyed animation (D7).
- **G.4 — grammar spends, each an owner decision**: (i) organism id/seed field →
  per-individual wobble phase and asymmetry; (ii) the elongation reservation — spend on
  motion-stretch, keep for a speed locus, or split by species; (iii) per-tile emission if
  the whole-pond view ever wins the zoom argument.
- **G.5 — parked**: AGSL/SDF pipeline, behind a measured Canvas failure or a named effect
  Canvas cannot paint; low poly, behind an explicit owner choice of stylization over
  realism.

Recommended spine: **(a) procedural texture bakes as the backbone, (c) dynamic vector for
appendages and the few hero species, (b) demoted to style reference, (d) parked as a
different identity.** G.1–G.3 are gate-free and reversible; G.4 is where the contract is
touched and the owner decides.

## 8. What this research cannot settle

1. **Which microscope** — deeper darkfield-fluorescence (recommended, continuous with
   everything shipped) or the brightfield petri look (a palette inversion and a different
   product). Owner's call before G.1 sets a style.
2. **Realism vs. the 10-second test when they collide** — which yields? (Recommendation:
   the test wins; realism that erases a locus is a lie about the world.)
3. **The elongation reservation** — spend, keep, or split.
4. **Whether the browser look-fork is acceptable long-term**, or whether the web should
   consume the WASM frame builder before the looks diverge far.
5. **Taste.** No instrument in this repo can see beauty; only the owner's device settles
   whether a wobbling, fringed Cilio reads as alive or as noise. Every stage above ends
   there.

---

## 9. Owner verdicts from the probe rounds (2026-09-02)

A live probe (`dev/graphics-probe/stilproben.html` — its own mini-simulation, one seed,
switchable painters) put the candidates in front of the owner. Verdicts, in order:

1. **Low poly: rejected** ("sicher nicht"). §3(d) closes; the stylization-vs-realism
   contradiction resolved for realism.
2. **Ornament animation: rejected** ("die Animationen finde ich auch albern — sind ja
   keine Raketen"). The Lebendig probe (cilia phase, flagellar wave, wobble, motes,
   vignette) read as gimmick, and the probe's darty movement compounded it. G.3 shrinks
   accordingly: no clock-driven appendage animation; whatever motion realism survives
   must come from the sim's own state, and calm. The wake-cut precedent held twice now.
3. **Textures: confirmed and wanted deeper** ("mehr Liebe für die Texturen"). G.1 is the
   spine of the phase.
4. **Zoom-dependent representation requested by the owner unprompted**: far = carpet as
   surface and organisms as points; near = cells, then details. This is a painter-side
   **LOD ladder** (dot → body → cell → organelles), extending the dot-LOD the grammar
   already contains — tier P, gate-free, since the record's screen radius decides the
   tier. Probe round 3 implements it (dot &lt;6 px, body 6–14, cell 14–32, organelles
   &gt;32, carpet: wash → tiled cells → per-cell organelles) with a zoom slider.
5. From round 2: **Hellfeld and Texturen must differ only in the ground** — the bright
   probe now paints identical bodies, so the §8-question-1 comparison is single-variable.
   The mat needs real texture (tiled cells, seams, nuclei, margin filaments); on the real
   renderer this lands together with the G.0 field-pipeline repair.

Still open from §8: darkfield vs brightfield (now honestly comparable in the probe), and
the elongation reservation (moot while animation stays out).

## 10. Venator's model (owner request, 2026-09-02: "der braucht ein besseres Vorbild")

The Ghost Ray was an invented form; the owner asked for a real one. Researched candidates
among raptorial protists, audited against the rule that form must predict motion
(Venator: fast straight-line pursuit, jet burst, feeds on the ciliate Cilio alone,
engulfs its kill):

| candidate | look | motion truthfulness | verdict |
|---|---|---|---|
| **Didinium nasutum** | barrel body ~2:1, conical proboscis on a nematodesmata rod palisade, two pectinelle girdles (cilia used *only* for fast swimming), band macronucleus; toxicysts fired on contact | **exact**: hits ciliate prey head-on at speed, engulfs it whole — Didinium–Paramecium is *the* textbook ciliate predator–prey pair, i.e. Venator–Cilio's real twin; even the burst-locomotion girdles fit the jet | **the recommended model** |
| Lacrymaria olor | teardrop body, neck extensible to tens of body lengths, head knob with toxicysts | wrong: an anchored ambush hunter — a telescoping neck on a straight-line pursuer would lie | silhouette-only variant ("Lanze"), honestly labeled |
| Dileptus / Litonotus | proboscis-bearing creepers | wrong: substrate-creeping hunters, not open-water pursuit | dropped |
| Ghost Ray (refined) | the shipped spearhead with interior: mantle ribs, trailing veil, nose lens | neutral (invented, but shaped by the strike) | kept as the incumbent for comparison |

Probe round 4 renders all three as switchable Venator variants (full LOD tiers, dark and
bright), plus a follow-cam so the hunter can be judged while hunting. Owner's pick
pending. If Didinium wins, the species-profiles.md portrait prompt and the app's
Steckbrief text should be updated in the same increment, and the frame grammar is
untouched (the record already carries heading and strike — everything a barrel, snout
and girdles need).

Sources: [Nikon/Micscape "Didinium the master feeder"](http://www.microscopy-uk.org.uk/mag/art97/dingley3.html),
[NIES Didinium morphology](https://www.nies.go.jp/chiiki1/protoz/morpho/ciliopho/didinium.htm),
[Wessenberg &amp; Antipa 1970, capture and ingestion of Paramecium by D. nasutum](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1550-7408.1970.tb02366.x),
[Current Biology on Lacrymaria's hunt](https://www.cell.com/current-biology/fulltext/S0960-9822(19)31319-3),
[Wikipedia: Lacrymaria olor](https://en.wikipedia.org/wiki/Lacrymaria_olor),
[Litonotus lamella motor/predatory behavior](https://cdnsciencepub.com/doi/10.1139/z88-289).

---

### Sources (external)

- Nikon MicroscopyU, [phase contrast introduction](https://www.microscopyu.com/techniques/phase-contrast/introduction-to-phase-contrast-microscopy); Microbehunter, [brightfield vs darkfield vs phase contrast](https://www.microbehunter.com/what-are-the-differences-between-brightfield-darkfield-and-phase-contrast/).
- Chris Hecker, [My Liner Notes for Spore](https://chrishecker.com/My_Liner_Notes_for_Spore) (procedural paint system); Rempton Games, [How the Spore Creature Creator works](https://remptongames.com/2022/08/07/how-the-spore-creature-creator-works/).
- Thrive, [Microbe Stage visuals GDD](http://thrivegame.wikidot.com/gdd-microbe:visuals) (cilia as membrane shader; oscillation scaled by speed).
- Cell Lab ([cell-lab.net](https://cell-lab.net/)) — all-vector OpenGL cells, ~1,000 at frame rate (developer forum claim).
- Metaballs / marching squares: [luke161/Unity-Metaballs-2D](https://github.com/luke161/Unity-Metaballs-2D), [iradicator, 2D surface reconstruction](https://iradicator.com/2d-surface-reconstruction-marching-squares-with-meta-balls/).
- SDF: [Ronja, 2D SDF basics](https://www.ronja-tutorials.com/post/034-2d-sdf-basics/) and [combination](https://www.ronja-tutorials.com/post/035-2d-sdf-combination/); [Quilez, distance functions](https://iquilezles.org/articles/raymarchingdf/).
- Procedural animation: [Zucconi, procedural animations](https://www.alanzucconi.com/2017/04/17/procedural-animations/) and [tentacle IK](https://www.alanzucconi.com/2017/04/12/tentacles/).
- Android: [AGSL](https://developer.android.com/develop/ui/views/graphics/agsl) (Android 13+), [Haase, RenderEffects/AGSL](https://medium.com/androiddevelopers/agsl-made-in-the-shade-r-7d06d14fe02a); Canvas sprite cost: [independent-software.com on drawBitmap](http://www.independent-software.com/android-speeding-up-canvas-drawbitmap.html).
- Low poly: [RetroStyle Games guide](https://retrostylegames.com/blog/low-poly-game-art-an-ultimate-guide/), [RocketBrush, low poly in games](https://rocketbrush.com/blog/low-poly-art-in-games).
- Osmos aesthetic origins: [Nautilus interview](https://nautil.us/osmos-a-physics-game-where-its-survival-of-the-fattest-234823) (microbe footage as reference; "ambiguous mix of microscopic and galactic").
