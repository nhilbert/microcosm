# Phase 9 — the sandbox start worlds

*Record and calibration history. Written the way the phase records before it were
written: what was measured, what the measurement said, and what was decided
because of it — including the start that did not ship.*

Licence: CC BY-SA 4.0 (see `LICENSE-docs`).

---

## 1. The problem

The sandbox had exactly one opening: the shipped pond, founded on a random seed.
Everything else the app can show — two suns, a wall, water with less matter in
it — was reachable only by a player who already knew the levers well enough to
build it by hand. One opening teaches one lesson, and the front door was
offering it five times a week.

The owner's ask (2026-09-03): *various start seeds, at least four, all
calibrated; must have an empty one and a one-sun one.*

## 2. What a start is, and what it may not be

A start is a **composition of legal entry points** and nothing else: the
`init_world` scenario (founding counts, starting mineral — draw-free when
absent) followed by ordinary `apply_event` calls. It is exactly a world a player
could have built by hand, which is why no conformance claim attaches to it, and
why `pond` — which composes *nothing* — is still the certified world bit for
bit.

Three things a start may not do, each a gate in `harness/starts.js --check`:

| never | why | gate |
|---|---|---|
| touch `P.mutation` | the Evolution panel is the player's; a reset must not silently re-arm it | `leaves P.mutation alone` |
| leave the undo slot loaded | the world's own founding is not the player's last move | `leaves the undo slot empty` |
| log an intervention | the impact log is a record of *hands*, not of geology | `logs no intervention` |

The table lives in `rust/microcosm-core/src/starts.rs` — one definition, reached
by the app as JSON (`Native.startsJson()`, keyed player text in `strings.xml`)
and by every harness as the same JSON (`C.STARTS`). The harness's own composer
is proved equal to the crate's by fingerprint (`crate-founded === event-composed`,
3,000 ticks), which is what licenses `--sweep`: a sweep perturbs the JavaScript
composition, and that gate says the composition is the real one.

## 3. The acceptance criterion

tune2's, deliberately unchanged: Solara, Drifta, Cilio and Bacillus persist to
t=18,000 over the eight acceptance seeds (the grazer only after its founding
transient), and the mineral audit stays flat. Venator is reported, never
required — its establishment is stochastic by nature.

Two calibrations of the criterion itself, both forced by measurement:

* **The audit band is the pond's own.** The certified pond drifts −0.007 % to
  −0.011 % over the horizon (float accumulation in the audit, not matter leaving
  the world). The first draft of this harness gated at 0.01 % and failed the
  reference world. The band is now 0.05 %.
* **`still` is judged by its own rule** — it is supposed to stay empty, so
  "the core species persist" is meaningless for it. Its criterion is in §5.

## 4. The five that ship

Measured over 8 seeds × 18,000 ticks (`npm run starts`); populations are the
seed range at the horizon, S/D/C/B/V.

| key | the world | mean light | measured |
|---|---|---|---|
| `pond` | the certified world, on a new seed | 0.287 | S 1301–1831, D 283–1419, C 38–110, B 785–946; core 8/8, apex 6/8 |
| `still` | one sun, full mineral, nobody home | 0.287 | stays empty 8/8, audit exactly flat, settles 8/8 (§5) |
| `twosuns` | two suns at x=256 and x=768, i 1.1, σ 140 | 0.288 | S 1125–2085, D 288–1306, C 43–152, B 493–1193; core held 8/8, apex 4/8 |
| `refuge` | a fine-mesh pen, 128 units square, on the sun's flank | 0.279 | S 1279–1748, D 198–1003, C 80–115, B 839–917; core held 8/8, apex 2/8 |
| `shallows` | the same sun over M0 = 1.7 instead of 2.2 | 0.287 | S 1252–1676, D 192–382, C 25–67, B 716–864; core held 8/8, apex 0/8 |

Apex counts are what the pond's own row is for: 6/8 there, 4/8 under two suns,
2/8 in the pen, **0/8 in lean water** — the apex establishes in the shallows and
is gone again by the horizon on every seed. Reported, not gated, exactly as
tune2 reports it; a lean pond that cannot keep its hunter is a finding about
thin water, not a failed calibration.

### `twosuns` — the sweep

81 runs (separation 320/384/448 × σ 120/140/170 × i 0.9/1.1/1.3, 3 seeds ×
9,000 ticks), then 54 more around the finalists (separation 448/512 × σ
130/140/150 × i 1.0/1.1/1.2). **No configuration collapsed** — the two-sun world
is robust across the whole grid; what the sweep decided was character, not
survival.

* **Income.** A single sun's mean light is 0.287. Two suns match it at
  i·σ² ≈ 22,000 — σ 140 with i 1.1 gives 0.288. Everything brighter than that
  is a different world *plus* a bigger world; the shipped pair holds the income
  fixed so that only the geography differs.
* **Separation.** σ 210 (the shipped falloff) cannot make two pools on a
  1024-wide torus at all: at any separation the sum has one broad maximum. At
  σ 140 the pools separate. Separation 512 is the maximally symmetric case —
  the two suns are antipodal in x, so the two straits are identical and no
  band of the world is privileged. Measured on the shipped pair: peaks 1.128,
  both straits 0.444, darkest cell 0.031 (the one-sun pond for comparison: peak
  1.029, and 0.086 at the antipode — a much darker rim).
* **Founding.** Founders are placed around the world's centre (`near_sun` reads
  source 0 as `init_world` left it), which at separation 512 is exactly
  equidistant from both suns — so the founding population splits itself. The
  measured pools are balanced: 601/637, 543/717, 757/737 at t=9,000.
* **An emergent finding worth keeping:** on seed 22 the two pools ran *different
  ecologies* at the horizon — west 309 Solara / 1209 Drifta / 0 Cilio / 0
  Bacillus, east 761/97/43/468. One world, two regimes, no intervention.

### `refuge` — the pen

Nine pen configurations (96/128/176 units square × flow 0.4/0.7/1.0, 3 seeds),
no collapses. The shipped pen is `harness/walls.js --hideout`'s box exactly
(352–480, 544–672; lt 0.9, ht 0.9, fl 0.7, pass = Solara|Drifta|Bacillus), so
this start reproduces a configuration the walls phase had already measured over
8 seeds × 18,000 ticks rather than inventing a new one.

Note what the census shows and the concept does not: a few grazers are founded
*inside* the pen (founding happens before the walls are built) and their line
persists there — a predator locked in with its prey, which is the classic
Huffaker arrangement and not a defect. Four of the eight wall slots are used;
the player keeps four.

### `shallows` — lean water

Mineral swept 0.8 → 3.2 (3 seeds × 9,000 ticks), and this one has a cliff:

| M0 | outcome |
|---|---|
| 0.8 | collapse 3/3 |
| 1.1 | collapse 1/3; Cilio minimum 1–2 — a hair trigger |
| 1.4 | collapse 1/3; Cilio minimum 4 |
| 1.7 | 3/3 hold, Cilio minimum 10–12 — a thinner but complete web |
| 2.2 | the shipped pond |
| 3.2 | 3/3 hold, Cilio 153–229, Bacillus ~1,000–1,200 |

1.7 ships: the leanest water that still carries the whole web. The rich end
(3.2) held just as well and is recorded here as measured-but-not-shipped — it is
"more of the same", where the lean end changes *what limits life*, which is the
spine of everything the app teaches.

## 5. `still` — the empty pond, and what "calibrated" means for it

Three claims, all gated (`npm run starts:check`, in `test:port` and CI):

1. **It stays empty.** 18,000 ticks, zero organism-ticks, on every seed.
2. **Its mineral stays flat.** Drift 0.00000 % — with nothing alive there is
   nothing to round.
3. **The Observatory survives it.** Indicators over a world with no producers
   answer in nulls and zeros, never NaN. (The app's health page has always
   guarded `indOk()`; this gate is about the core's own arithmetic.)
4. **It is habitable.** A scripted player — three mats and two microbe colonies
   at t=0, plankton at t=2,000, the grazer at t=5,000, seeded with nothing but
   the ordinary seeding tool — founds a community that holds to t=18,000 on
   **8/8 seeds**.

The grazer is reported rather than required in claim 4: it took on 5 of 8 seeds.
Establishing a predator from a single four-organism pack is a coin flip by
nature, and that stochasticity is exactly the lesson E6 teaches. Tuning the
script until it passed 8/8 would have hidden the finding.

## 6. The start that did not ship: the hot spring

A sun plus a separate warm vent (i = 0, a > 0) was the most attractive of the
original five — the app has a temperature field, thermotaxis and a warmth
preference locus, and none of it is visible in the sandbox's isothermal water.

It was measured and it does not hold. 36 runs (a 3/5/8/12 × σ 120/150/200,
3 seeds × 9,000 ticks): **12 collapsed**, the signature always the same —
Bacillus to zero, Drifta to four figures, Cilio to single digits.

The second sweep is the interesting one, because it rules out "too hot":

| vent | result |
|---|---|
| a = 0 (the exact no-op) | 3/3 hold; S 1128–1331, D 388–867, C 59–95, B 800–912 — the pond, as it must be |
| a = 1, σ 100 (mean warmth **0.06**) | 3/3 hold, but D 1164–1524, C 5–18, V 0 — a different world |
| a = ±2, ±3, ±4 | collapses appear at every amplitude, warm *and* cold |

The response is not a dose–response, it is a **switch**. The shipped pond is
isothermal by construction, so every temperature gradient in it is exactly zero
and thermotaxis contributes nothing; the first vent of any amplitude turns
directional movement on for Drifta and Cilio at once, and the world re-organises
into a plankton-dominated regime with a fragile decomposer.

That is a real result about this world, not a bug, and it is consistent with
where heat already lives: E8 (*warm year*) and E12 (*outrun*) use warmth as a
**press the player must survive**. A start world is water you potter around in.
A quarter of the seeds dying unprompted is an experiment without a goal, so the
spring is deferred, with a re-entry condition:

> **Re-entry:** ship a hot spring when a start may also compose founding counts
> that pay for it (a larger decomposer founding, or a grazer founding that can
> absorb the regime flip) and that composition holds 8/8 over the horizon. The
> machinery is already there — `Scenario.found` — so this is a calibration job,
> not a feature.

## 7. The pictures

Each start world's chooser row carries a photograph of that world, the way each experiment
row carries one. The tool is `StartThumbsTest` — a curation tool living in the app's test
source set, because that is the only place the real renderer runs without a phone:

    gradle -p android-app testReleaseUnitTest --tests '*StartThumbsTest*' -Pthumbs

It founds each start on seed 11, steps it headlessly to a fixed tick, and paints one frame
through `Renderer.draw` — the very painter that will display the result. Off without
`-Pthumbs`, since it writes committed files. Two differences from `tools/level-thumbs.js`,
both deliberate:

* **Reproducible.** The level pictures ride the browser's live render loop, so two captures
  of the same spec differ by a few ticks. These are driven headlessly from a fixed seed and
  a fixed tick count, so the same shot list gives the same jpg every time.
* **The app's own painter, not the browser's.** These pictures sit inside the app, beside
  the frame they are a picture of.

The shot list, which is the record of what each picture means:

| key | tick | camera | zoom | what it shows |
|---|---|---|---|---|
| `pond` | 1,200 | 512, 560 | 1.30 | the mat under the sun |
| `still` | 200 | 512, 512 | 0.50 | the whole lit pool, and nobody in it |
| `twosuns` | 1,500 | 512, 512 | 0.42 | both pools and the strait between them |
| `refuge` | 1,500 | 416, 608 | 1.55 | the mesh pen on the sun's flank |
| `shallows` | 1,500 | 512, 560 | 1.30 | the pond's framing, over thinner water |

`z` is backing pixels per world unit, so a 320-px frame shows `320/z` units of a
1024-wide torus. **`twosuns` is the one shot no phone could frame**: the app clamps
zoom-out at roughly 460 units and its suns stand 512 apart. It is a picture OF the world
rather than a screenshot of a session, and the tool says so where the number is set rather
than leaving it implied. `shallows` deliberately repeats `pond`'s framing, so the thinner
water is legible by comparison rather than by caption.

Two gates keep them honest: the tool asserts that every picture painted something over the
abyss (a thumbnail of nothing would otherwise ship silently), and `StartsTest` asserts that
every start the core carries still loads its picture — a file that stops loading is a
silent loss.

## 8. Where the numbers are reproduced

    npm run starts          # 5 worlds x 8 seeds x 18,000 ticks — the acceptance run
    npm run starts:check    # the identity gates + the `still` criterion (fast)
    npm run starts:sweep twosuns | refuge | shallows | still

`starts:check` runs inside `npm run test:port` and in CI on every push; the
acceptance run is in the manual ecology job, beside `tune`.
