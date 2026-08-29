# MICROCOSM — Phase 6 Plan: Settings for Evolution

v1.0 · 2026-08-29 · Owner direction: "improved settings, interactive for the user", with the trade-off curvature and locus prices as in-game sliders rather than calibration constants. Built on Phase 5 (four loci) and `genetics-scaling.md`.

## 1. Principle

Every evolution setting is an **intervention** — the player's hand on the second-order loop — and follows the rules every other lever follows: it goes through the event queue (`queueEvent`), is logged with its previous value, is undoable, is replay-safe, and gets an impact card that says *since*, never *because*. Amber, like the sun. Settings are never applied to `P` or `TRAITS` directly from the UI.

Changing a setting changes the world's future PRNG stream (a mutation-rate change adds or removes draws) exactly as moving the sun does; it does not change the past. The conformance baselines certify the defaults; a settings event is a declared change the player makes.

## 2. Increments

| # | Increment | Acceptance |
|---|---|---|
| 6.0 ✅ | **Evolution panel** in Intervene mode: mutation on/off (`P.mutation`); per species with a locus: mutation rate σ (0–0.08) and trade-off curvature (−0.4 … +0.6). Event types `mutation` and `locus`; undo; Events-feed labels; impact lines | Settings round-trip through the queue (log entry, undo restores the previous value); conformance with the default settings bit-identical on both fingerprints; the Traits legend reflects the switch |
| 6.1 ✅ | Price sliders (the effect slopes) per locus, with the measured surfaces from Phase 5 as marked "balance" ticks on the slider | Slider positions correspond to the surfaces in `phase5-record.md`; the sweep/diversifying detectors still fire correctly at the extremes (headless check) |
| 6.2 ✅ | Observatory feedback for settings: a `rail` event ("Drifta has reached the limit of its defense — 34% at the corridor edge") and an *Adaptability* vital (mean heritable variation across loci) on the Health page | Rail event fires within 10 samples of ≥ 30% rail occupancy on a pinned world; silent on the balanced default |
| 6.3 ✅ | Presets: "settled" (curvature 0.3 all), "wild" (linear, σ ×2), "frozen" (mutation off) as one-tap event bundles, logged as one intervention | Each preset is one undoable log entry; conformance unaffected |

## 3. Not in this phase

Multi-locus per species (needs the `W.g[k·MAXN+i]` change and per-locus channels — Phase 7), snapshots/replay UI, barriers.

## 4. Risks

**R1 — settings as exploits:** a player can set σ to 0.08 and curvature to −0.4 and produce a sweep-and-collapse. By the corridor policy that is a finding the Observatory narrates, not a bug; the `--fuzz` certification (σ ×4) bounds how bad it can get and is the acceptance for the σ range. **R2 — RNG stream and replay:** every setting is an event with a tick, so replay reproduces it; a setting is never read from `localStorage` or the URL (artifact constraint). **R3 — UI clutter on the phone:** the panel is a second detent of the existing Intervene sheet, not a new mode.

## 5. Record

**6.0 shipped (2026-08-29).** Events `mutation` and `locus` in `src/sim/events.js` (apply, hand back `prev`); `initWorld` restores the shipped locus settings, the UI reset restores `P.mutation` (kept a harness-level switch so `conform.js` can pin it). Impact cards treat settings as press-type changes. Panel under the sun lever: mutation on/off; per locus species, mutation rate (0–0.12) and trade-off curve (−0.5 … +0.8), amber, one undo per drag, feed entries "You switched mutation" / "You changed an evolution setting". Verified headless (round-trip + undo) and in the browser. Behaviour-neutral: both conformance fingerprints identical, hash rebound.

**6.1 + 6.3 shipped (2026-08-29).** "prices…" reveals one slider per effect slope a locus carries (0–1), with the measured balance value marked beside it (Drifta kp 0.5, Cilio kb 0.15, Solara light 0.5, Bacillus rate 0.5 / yield 0.15). Presets *Shipped / Settled / Wild / Frozen* are one intervention each: a bundle of `locus`/`mutation` events, one feed entry ("You applied an evolution preset"), one undo that restores every previous value. Verified in the browser: Settled sets all curves to +0.30 with "Preset: Settled · Undo"; Frozen switches mutation off; Shipped restores 0 / on. UI plus a two-word observer change (presets count as press-type for impact cards); fingerprints identical, hash rebound.

**6.2 shipped (2026-08-29).** `rail` event: ≥ 30% of a species at a corridor edge for 10 samples → "Drifta has reached the limit of its defense — 100% at the tougher edge"; rearms below 15%. *Adaptability* vital on the Health page (mean locus sd over species with a locus and ≥ 20 alive; flagged "low" under 0.03). Measured: pinned world fires at t=200; shipped world 0 rail events in 18k with adaptability 0.11; silent world 0 / 0. Observer-only, fingerprints identical, hash rebound.
