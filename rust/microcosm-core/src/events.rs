//! Intervention events — the ONLY legal way to mutate world state from outside (`src/sim/events.js`).
//!
//! Events are applied at tick boundaries and logged, which is what makes interventions undoable and
//! replayable. A port must expose exactly this and nothing else: a UI that writes into the world
//! directly desynchronises from the event log and breaks replay (docs/porting.md).
//!
//! None of these draw from the PRNG except `SpawnPack`, which draws exactly as founding does. The
//! sources and walls change the future stream only through ecology, like moving the sun always has.

use crate::fields::{compile_walls, compute_light, compute_temp, make_wall, WallSpec};
use crate::jsnum::{jmax, jmin, to_f32, to_i16};
use crate::params::*;
use crate::world::*;
use crate::Sim;

/// Which locus field a `Locus` event writes. Mirrors the `ev.key in LOCUS_DEFAULTS` guard: a key
/// outside this set is not writable, which the type system now enforces instead of a runtime test.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LocusKey {
    Sigma,
    Curve,
    EscSlope,
    KpSlope,
    CatchSlope,
    KbSlope,
    LightSlope,
    RateSlope,
    EffSlope,
    WarmSlope,
    WarmGainSlope,
    TprefSpan,
    DampSpan,
    PcSpeedSlope,
    PcTurnSlope,
    TumbleSlope,
}

#[derive(Clone, Debug)]
pub enum Event {
    /// Seed a small founding group of a species at a location.
    SpawnPack { sp: usize, x: f64, y: f64 },
    /// Pulse lever: a mineral pour — splash over the tapped cell and its neighbours.
    Fertilize { x: f64, y: f64, amount: f64 },
    LightMul { v: f64 },
    Mutation { v: bool },
    Locus {
        sp: usize,
        locus: usize,
        key: LocusKey,
        v: f64,
    },
    Source { k: usize, x: f64, y: f64 },
    SourceAdd {
        x: f64,
        y: f64,
        i: Option<f64>,
        a: Option<f64>,
        sigma: Option<f64>,
        at: Option<usize>,
    },
    SourceRemove { k: usize },
    SourceSet {
        k: usize,
        i: Option<f64>,
        a: Option<f64>,
        sigma: Option<f64>,
    },
    WallAdd { spec: WallSpec, at: Option<usize> },
    WallRemove { k: usize },
    WallSet {
        k: usize,
        lt: Option<f64>,
        ht: Option<f64>,
        fl: Option<f64>,
        pass: Option<i32>,
    },
    Feed { i: usize, gen: u16, frac: f64 },
    Kill { i: usize, gen: u16 },
}

/// One entry of `W.eventLog` — the replay substrate. Kept as the event plus its tick.
#[derive(Clone, Debug)]
pub struct LoggedEvent {
    pub t: i64,
    pub ev: Event,
}

/// Founding kits for `SpawnPack`, keyed by species index.
fn kit(sp: usize) -> Option<(usize, f64, f64)> {
    match sp {
        0 => Some((6, 5.0, 30.0)),
        1 => Some((8, 3.4, 25.0)),
        2 => Some((4, 6.0, 35.0)),
        3 => Some((12, 2.0, 12.0)),
        6 => Some((3, 9.0, 70.0)),
        _ => None,
    }
}

pub fn apply_event(sim: &mut Sim, ev: Event) {
    // payload log: replay substrate
    sim.w.event_log.push(LoggedEvent {
        t: sim.w.tick,
        ev: ev.clone(),
    });
    if sim.w.event_log.len() > 4000 {
        sim.w.event_log.drain(0..1000);
    }
    match ev {
        Event::SpawnPack { sp, x, y } => {
            // conservation-safe: endow pulls mineral from the local water; energy and protein are
            // open books, as at world-founding
            let (n, sz, en) = match kit(sp) {
                Some(k) => k,
                None => return,
            };
            for _ in 0..n {
                let r1 = sim.w.r();
                let r2 = sim.w.r();
                let r3 = sim.w.r();
                let j = spawn(
                    &mut sim.w,
                    &sim.tr,
                    sp,
                    wrap(x + (r1 - 0.5) * 70.0),
                    wrap(y + (r2 - 0.5) * 70.0),
                    en * (0.8 + r3 * 0.4),
                    sz,
                    0.0,
                    0.0,
                );
                if j >= 0 {
                    endow_founder(&mut sim.w, &sim.p, &sim.tr, j);
                }
            }
        }
        Event::Fertilize { x, y, amount } => {
            let g = GRID_I;
            let gx = crate::jsnum::to_int32((x / CELL).floor()) & GRID_MASK;
            let gy = crate::jsnum::to_int32((y / CELL).floor()) & GRID_MASK;
            let wts: [(i32, i32, f64); 5] = [
                (0, 0, 0.4),
                (1, 0, 0.15),
                (-1, 0, 0.15),
                (0, 1, 0.15),
                (0, -1, 0.15),
            ];
            for (dx2, dy2, f) in wts {
                let c = (((gy + dy2 + g) % g) * g + ((gx + dx2 + g) % g)) as usize;
                let amt = amount * f;
                sim.w.m[c] = to_f32(sim.w.m[c] as f64 + amt);
            }
            sim.w.added_m += amount;
        }
        Event::LightMul { v } => {
            sim.p.light_mul = jmax(0.2, jmin(2.0, v));
            compute_light(&mut sim.w, &sim.p);
        }
        Event::Mutation { v } => {
            sim.p.mutation = v;
        }
        Event::Locus { sp, locus, key, v } => {
            if sp >= sim.tr.len() || locus >= sim.tr[sp].loci.len() {
                return;
            }
            // slopes are prices: bounded too; reference spans carry their own units
            let lim = match key {
                LocusKey::Sigma => (0.0, 0.12),
                LocusKey::Curve => (-0.5, 0.8),
                LocusKey::TprefSpan => (0.0, 8.0),
                LocusKey::DampSpan => (0.0, 0.08),
                _ => (0.0, 1.5),
            };
            let val = jmax(lim.0, jmin(lim.1, v));
            let l = &mut sim.tr[sp].loci[locus];
            match key {
                LocusKey::Sigma => l.sigma = val,
                LocusKey::Curve => l.curve = val,
                LocusKey::EscSlope => l.esc_slope = val,
                LocusKey::KpSlope => l.kp_slope = val,
                LocusKey::CatchSlope => l.catch_slope = val,
                LocusKey::KbSlope => l.kb_slope = val,
                LocusKey::LightSlope => l.light_slope = val,
                LocusKey::RateSlope => l.rate_slope = val,
                LocusKey::EffSlope => l.eff_slope = val,
                LocusKey::WarmSlope => l.warm_slope = val,
                LocusKey::WarmGainSlope => l.warm_gain_slope = val,
                LocusKey::TprefSpan => l.tpref_span = val,
                LocusKey::DampSpan => l.damp_span = val,
                LocusKey::PcSpeedSlope => l.pc_speed_slope = val,
                LocusKey::PcTurnSlope => l.pc_turn_slope = val,
                LocusKey::TumbleSlope => l.tumble_slope = val,
            }
        }
        Event::Source { k, x, y } => {
            if k >= sim.w.sources.len() {
                return;
            }
            sim.w.sources[k].x = wrap(x);
            sim.w.sources[k].y = wrap(y);
            compute_light(&mut sim.w, &sim.p);
            compute_temp(&mut sim.w, &sim.p);
            sim.w.light_dirty = true;
        }
        Event::SourceAdd {
            x,
            y,
            i,
            a,
            sigma,
            at,
        } => {
            if sim.w.sources.len() >= sim.p.max_sources {
                return;
            }
            let s = Source {
                x: wrap(x),
                y: wrap(y),
                i: jmax(0.0, jmin(1.5, i.unwrap_or(sim.p.sun_i))),
                a: jmax(-8.0, jmin(15.0, a.unwrap_or(0.0))),
                sigma: jmax(90.0, jmin(300.0, sigma.unwrap_or(sim.p.sun_sigma))),
            };
            // `at` restores an undone removal at its old index
            let k = at.unwrap_or(sim.w.sources.len()).min(sim.w.sources.len());
            sim.w.sources.insert(k, s);
            compute_light(&mut sim.w, &sim.p);
            compute_temp(&mut sim.w, &sim.p);
            sim.w.light_dirty = true;
        }
        Event::SourceRemove { k } => {
            // never fewer than one source (decision 2)
            if sim.w.sources.len() <= 1 || k >= sim.w.sources.len() {
                return;
            }
            sim.w.sources.remove(k);
            compute_light(&mut sim.w, &sim.p);
            compute_temp(&mut sim.w, &sim.p);
            sim.w.light_dirty = true;
        }
        Event::SourceSet { k, i, a, sigma } => {
            if k >= sim.w.sources.len() {
                return;
            }
            if let Some(v) = i {
                sim.w.sources[k].i = jmax(0.0, jmin(1.5, v));
            }
            if let Some(v) = a {
                sim.w.sources[k].a = jmax(-8.0, jmin(15.0, v));
            }
            if let Some(v) = sigma {
                sim.w.sources[k].sigma = jmax(90.0, jmin(300.0, v));
            }
            compute_light(&mut sim.w, &sim.p);
            compute_temp(&mut sim.w, &sim.p);
            sim.w.light_dirty = true;
        }
        Event::WallAdd { spec, at } => {
            if sim.w.walls.len() >= sim.p.max_walls {
                return;
            }
            let wl = match make_wall(&spec) {
                Some(v) => v,
                None => return, // stroke snapped to nothing
            };
            let k = at.unwrap_or(sim.w.walls.len()).min(sim.w.walls.len());
            sim.w.walls.insert(k, wl);
            compile_walls(&mut sim.w);
            compute_light(&mut sim.w, &sim.p);
            compute_temp(&mut sim.w, &sim.p);
            sim.w.light_dirty = true;
        }
        Event::WallRemove { k } => {
            if k >= sim.w.walls.len() {
                return;
            }
            sim.w.walls.remove(k);
            compile_walls(&mut sim.w);
            compute_light(&mut sim.w, &sim.p);
            compute_temp(&mut sim.w, &sim.p);
            sim.w.light_dirty = true;
        }
        Event::WallSet {
            k,
            lt,
            ht,
            fl,
            pass,
        } => {
            if k >= sim.w.walls.len() {
                return;
            }
            let cl = |v: f64| jmax(0.0, jmin(1.0, v));
            if let Some(v) = lt {
                sim.w.walls[k].lt = cl(v);
            }
            if let Some(v) = ht {
                sim.w.walls[k].ht = cl(v);
            }
            if let Some(v) = fl {
                sim.w.walls[k].fl = cl(v);
            }
            if let Some(v) = pass {
                sim.w.walls[k].pass = v;
            }
            compile_walls(&mut sim.w);
            compute_light(&mut sim.w, &sim.p);
            compute_temp(&mut sim.w, &sim.p);
            sim.w.light_dirty = true;
        }
        Event::Feed { i, gen, frac } => {
            if !(sim.w.alive[i] != 0 && sim.w.gen[i] == gen) {
                return;
            }
            let cap = sim.p.cap_mul * sim.w.sz[i] as f64;
            sim.w.en[i] = to_f32(jmin(cap, sim.w.en[i] as f64 + frac * cap));
            let pq = sim.p.p_quota * sim.w.sz[i] as f64;
            sim.w.pr[i] = to_f32(jmin(pq, sim.w.pr[i] as f64 + frac * pq));
            if sim.w.cy[i] != 0 {
                sim.w.cy[i] = 0;
                sim.w.gr[i] = to_i16(60.0);
            }
        }
        Event::Kill { i, gen } => {
            if !(sim.w.alive[i] != 0 && sim.w.gen[i] == gen) {
                return;
            }
            kill_org(&mut sim.w, &sim.p, i);
        }
    }
}

pub fn drain_events(sim: &mut Sim) {
    while !sim.w.events.is_empty() {
        let ev = sim.w.events.remove(0);
        apply_event(sim, ev);
    }
}

/// `queueEvent` — with the two coalescing rules: only the latest position of a sun, and only the
/// latest properties of a wall, matter within one tick.
pub fn queue_event(sim: &mut Sim, ev: Event) {
    if let Event::Source { k, .. } = ev {
        if let Some(idx) = sim
            .w
            .events
            .iter()
            .position(|e| matches!(e, Event::Source { k: k2, .. } if *k2 == k))
        {
            sim.w.events[idx] = ev;
            return;
        }
    }
    if let Event::WallSet { k, lt, ht, fl, pass } = ev {
        if let Some(idx) = sim
            .w
            .events
            .iter()
            .position(|e| matches!(e, Event::WallSet { k: k2, .. } if *k2 == k))
        {
            // merge, as the JS spread `{ ...old, ...new }` does
            if let Event::WallSet {
                lt: olt,
                ht: oht,
                fl: ofl,
                pass: opass,
                ..
            } = sim.w.events[idx]
            {
                sim.w.events[idx] = Event::WallSet {
                    k,
                    lt: lt.or(olt),
                    ht: ht.or(oht),
                    fl: fl.or(ofl),
                    pass: pass.or(opass),
                };
            }
            return;
        }
    }
    sim.w.events.push(ev);
}
