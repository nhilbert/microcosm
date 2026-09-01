# The lever-outrun study — which consequences outrun the undo

**2026-09-01 · `harness/outrun.js` (`npm run outrun`) · the measurement behind U.2's friction
decisions (app-ux-research.md §7.1: "run it, do not guess it").**

## Question

The app's undo puts the lever back, not the world (research lens 4). For which levers does that
distinction *matter* — where has the world moved so far by the time the undo lands that the player
should have been slowed down before pulling?

## Method

Same-seed A/B on the ported core (the JS oracle has no undo slot; the product's world is the
crate). For each lever × delay: apply at t0=3000, run `delay` ticks (50 / 600 / 3000 — instant
regret, one minute, five minutes at 1x), undo through the **core's own undo slot** (the exact
mechanism the phone's undo chip fires), keep running. Departure from the untouched control is the
sum over the five live species of |ln((pop_T+1)/(pop_C+1))|, measured 1,200 and 6,000 ticks after
the undo. Eight seeds (11–88), mutation on. Collapse mismatches (core lost in one arm, not the
other) counted separately.

**The floor.** The world is chaotic, so any perturbation diverges eventually and raw departure
would convict every lever. The yardstick is `residue` — a 0.001-unit pour never undone: what chaos
alone produces. By +6000 the residue reaches median 0.15–0.70, **max 2.74** — the band any
"absorbed" lever lands in.

**Levers, at app amplitudes**: pour 40 · feed 0.35 · kill one Drifta · seed a grazer pack · seed
an apex pack · sun moved 128 units · sun intensity −0.3 · a 128-unit stone wall.

## Findings

1. **No lever + undo ever cost a core species.** 8 seeds × 8 levers × 3 delays: zero collapse
   mismatches. Even the sun moved for five minutes and put back — the light plan's 5/8 collapse
   belongs to the move that *stays*. With an undo in the loop, the scariest number in the project
   does not apply.

2. **Undo within a minute is functionally a time machine.** At delays ≤ 600 every lever's median
   departure (0.75–1.60 at +6000) sits inside the residue band. Sharper: a pour undone at d=50
   rejoins **bit-exactly** (0.00 divergence, 8/8) — `unfertilize` reclaims what the water still
   holds, and before diffusion moves the splash that is everything. The undo was gate-proved as an
   inverse event; this measures that the inverse is also *ecologically* sufficient at thumb
   timescales.

3. **One lever outruns its undo: the sun's intensity press, left standing.** Its departure grows
   cleanly with delay (med 0.83 → 1.60 → 3.23) and at five minutes it is the only lever whose
   median exceeds the residue floor's own max. A dimmed sun quietly reshapes the energy budget the
   whole time it stands; putting the number back does not refund the five minutes.

4. Everything else at five minutes stays in or near the chaos band (0.71–2.18; the feed 2.18 is
   the elevated tail of a cell that read 3.81 at n=4 and regressed with seeds — treated as noise).

## What U.2 should take from this

- **No lever earns arming-friction on irreversibility grounds.** The measured basis for
  quasimodality is gone for pour, feed, kill, seed, wall, and even the sun *move*.
- **The sun's case for quasimodal treatment is accident-frequency, not consequence** — the owner's
  actual complaint (silent grips, stolen drags), already repaired in U0.4. That is a gesture
  problem, not an irreversibility problem.
- **The design owes visibility, not friction**: the one convicted failure mode is a changed sun
  state standing *unnoticed*. A changed sun (intensity, position) must be impossible to miss while
  it differs from where the player left it — and the undo chip must stay one thumb away, because
  within a minute it undoes everything.

## Limits, so nobody over-reads

One amplitude per lever; horizons stop 10 minutes after the undo (a K6-style strangulation
unfolds over longer, though every mechanism here was removed by its undo); the metric is
population-level, so pure chemistry shifts register only through their ecology; and at +6000
trajectories have decorrelated, so mid-table *order* is noise — only the three classes (absorbed /
chaos-band / outran) are findings. n=8 supports classes, not tight effect sizes.
