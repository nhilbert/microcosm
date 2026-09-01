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
            let mut ids: Vec<(usize, u16)> = Vec::new();
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
                    ids.push((j as usize, sim.w.gen[j as usize]));
                }
            }
            sim.undo = Undo::SpawnPack { ids };
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
            let mut cells = [(0usize, 0.0f64); 5];
            for (q, (dx2, dy2, f)) in wts.into_iter().enumerate() {
                let c = (((gy + dy2 + g) % g) * g + ((gx + dx2 + g) % g)) as usize;
                let amt = amount * f;
                sim.w.m[c] = to_f32(sim.w.m[c] as f64 + amt);
                cells[q] = (c, amt);
            }
            sim.w.added_m += amount;
            sim.undo = Undo::Fertilize { cells, amount };
        }
        Event::LightMul { v } => {
            let prev = sim.p.light_mul;
            sim.p.light_mul = jmax(0.2, jmin(2.0, v));
            compute_light(&mut sim.w, &sim.p);
            sim.undo = Undo::LightMul { prev };
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
            let (ox, oy) = (sim.w.sources[k].x, sim.w.sources[k].y);
            sim.w.sources[k].x = wrap(x);
            sim.w.sources[k].y = wrap(y);
            sim.undo = Undo::Source { k, x: ox, y: oy };
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
            sim.undo = Undo::SourceAdd { k };
            compute_light(&mut sim.w, &sim.p);
            compute_temp(&mut sim.w, &sim.p);
            sim.w.light_dirty = true;
        }
        Event::SourceRemove { k } => {
            // never fewer than one source (decision 2)
            if sim.w.sources.len() <= 1 || k >= sim.w.sources.len() {
                return;
            }
            let s = sim.w.sources.remove(k);
            sim.undo = Undo::SourceRemove { at: k, s };
            compute_light(&mut sim.w, &sim.p);
            compute_temp(&mut sim.w, &sim.p);
            sim.w.light_dirty = true;
        }
        Event::SourceSet { k, i, a, sigma } => {
            if k >= sim.w.sources.len() {
                return;
            }
            let prev = sim.w.sources[k];
            sim.undo = Undo::SourceSet { k, i: prev.i, a: prev.a, sigma: prev.sigma };
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
            sim.undo = Undo::WallAdd { k };
            compile_walls(&mut sim.w);
            compute_light(&mut sim.w, &sim.p);
            compute_temp(&mut sim.w, &sim.p);
            sim.w.light_dirty = true;
        }
        Event::WallRemove { k } => {
            if k >= sim.w.walls.len() {
                return;
            }
            let gone = sim.w.walls.remove(k);
            sim.undo = Undo::WallRemove {
                at: k,
                spec: WallSpec { x0: gone.x0, y0: gone.y0, dx: gone.dx, dy: gone.dy,
                    lt: gone.lt, ht: gone.ht, fl: gone.fl, pass: gone.pass },
            };
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
            {
                let p = &sim.w.walls[k];
                sim.undo = Undo::WallSet { k, lt: p.lt, ht: p.ht, fl: p.fl, pass: p.pass };
            }
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
            let before = sim.w.en[i] as f64;
            sim.w.en[i] = to_f32(jmin(cap, sim.w.en[i] as f64 + frac * cap));
            let pq = sim.p.p_quota * sim.w.sz[i] as f64;
            sim.w.pr[i] = to_f32(jmin(pq, sim.w.pr[i] as f64 + frac * pq));
            if sim.w.cy[i] != 0 {
                sim.w.cy[i] = 0;
                sim.w.gr[i] = to_i16(60.0);
            }
            sim.undo = Undo::Feed { i, gen, delta: sim.w.en[i] as f64 - before };
        }
        Event::Kill { i, gen } => {
            if !(sim.w.alive[i] != 0 && sim.w.gen[i] == gen) {
                return;
            }
            let snap = OrgSnap {
                sp: sim.w.sp[i] as usize,
                x: sim.w.x[i] as f64,
                y: sim.w.y[i] as f64,
                en: sim.w.en[i] as f64,
                sz: sim.w.sz[i] as f64,
                hd: sim.w.hd[i],
                cd: sim.w.cd[i],
                cy: sim.w.cy[i],
                gr: sim.w.gr[i],
                birth: sim.w.birth[i],
                mn: sim.w.mn[i] as f64,
                pr: sim.w.pr[i] as f64,
                corpse: -1,
            };
            let corpse = kill_org(&mut sim.w, &sim.p, i);
            sim.undo = Undo::Kill { snap: OrgSnap { corpse, ..snap } };
        }
    }
}

/// What it would take to put the world back. One slot, not a stack — the browser offers a single
/// five-second undo and nothing deeper, and matching that is the point.
///
/// The inverses live here rather than crossing the boundary as payloads, which is what kept them
/// out of M3: a snapshot marshalled to Kotlin and back is a second representation of world state,
/// and the one thing this port exists to avoid is a second representation of anything. Every
/// inverse below is draw-free except `Kill`'s, whose `spawn` draws a heading exactly as the
/// JavaScript's `revive` does. `harness/fingerprint-undo.js` drives both and compares the worlds.
#[derive(Clone, Debug)]
pub struct OrgSnap {
    pub sp: usize,
    pub x: f64,
    pub y: f64,
    pub en: f64,
    pub sz: f64,
    pub hd: f32,
    pub cd: i16,
    pub cy: u8,
    pub gr: i16,
    pub birth: i32,
    pub mn: f64,
    pub pr: f64,
    /// The corpse the kill left, so reviving can reclaim its mineral. -1 if none.
    pub corpse: i32,
}

#[derive(Clone, Debug)]
pub enum Undo {
    None,
    Feed { i: usize, gen: u16, delta: f64 },
    Kill { snap: OrgSnap },
    SpawnPack { ids: Vec<(usize, u16)> },
    Fertilize { cells: [(usize, f64); 5], amount: f64 },
    LightMul { prev: f64 },
    Source { k: usize, x: f64, y: f64 },
    SourceAdd { k: usize },
    SourceRemove { at: usize, s: Source },
    SourceSet { k: usize, i: f64, a: f64, sigma: f64 },
    WallAdd { k: usize },
    WallRemove { at: usize, spec: WallSpec },
    WallSet { k: usize, lt: f64, ht: f64, fl: f64, pass: i32 },
}

impl Default for Undo {
    fn default() -> Self {
        Undo::None
    }
}

impl Undo {
    /// A code the shell can switch on for its label. 0 nothing to undo.
    pub fn code(&self) -> i32 {
        match self {
            Undo::None => 0,
            Undo::Feed { .. } => 1,
            Undo::Kill { .. } => 2,
            Undo::SpawnPack { .. } => 3,
            Undo::Fertilize { .. } => 4,
            Undo::LightMul { .. } => 5,
            Undo::Source { .. } => 6,
            Undo::SourceAdd { .. } => 7,
            Undo::SourceRemove { .. } => 8,
            Undo::SourceSet { .. } => 9,
            Undo::WallAdd { .. } => 10,
            Undo::WallRemove { .. } => 11,
            Undo::WallSet { .. } => 12,
        }
    }

    /// The species a Feed/Kill/SpawnPack undo concerns, so the shell can name it. -1 otherwise.
    pub fn species(&self, sim: &Sim) -> i32 {
        match self {
            Undo::Feed { i, .. } => sim.w.sp[*i] as i32,
            Undo::Kill { snap } => snap.sp as i32,
            Undo::SpawnPack { ids } => ids.first().map_or(-1, |(j, _)| sim.w.sp[*j] as i32),
            _ => -1,
        }
    }
}

/// Put the world back, and clear the slot. Applying an inverse never fills the slot again — an
/// undo is not itself undoable, exactly as in the browser.
pub fn apply_undo(sim: &mut Sim) {
    let u = std::mem::replace(&mut sim.undo, Undo::None);
    match u {
        Undo::None => {}
        Undo::Feed { i, gen, delta } => {
            if sim.w.alive[i] != 0 && sim.w.gen[i] == gen {
                sim.w.en[i] = to_f32(jmax(0.5, sim.w.en[i] as f64 - delta));
            }
        }
        Undo::Kill { snap } => {
            let j = spawn(&mut sim.w, &sim.tr, snap.sp, snap.x, snap.y, snap.en, snap.sz, 0.0, 0.0);
            if j >= 0 {
                let j = j as usize;
                sim.w.hd[j] = snap.hd;
                sim.w.cd[j] = snap.cd;
                sim.w.cy[j] = snap.cy;
                sim.w.gr[j] = snap.gr;
                sim.w.birth[j] = snap.birth;
                sim.w.pr[j] = to_f32(snap.pr);
                // reclaim the corpse's remaining mineral, then top up from the water
                let mut got = 0.0;
                if snap.corpse >= 0 && sim.w.c_alive[snap.corpse as usize] != 0 {
                    let k = snap.corpse as usize;
                    got = sim.w.c_m[k] as f64;
                    sim.w.c_m[k] = 0.0;
                    sim.w.c_alive[k] = 0;
                    sim.w.c_free.push(k);
                }
                let c = cell_of(&sim.w, j);
                let top = jmin(sim.w.m[c] as f64, jmax(0.0, snap.mn - got));
                sim.w.m[c] = to_f32(sim.w.m[c] as f64 - top);
                sim.w.mn[j] = to_f32(got + top);
            }
        }
        Undo::SpawnPack { ids } => {
            // quiet removal: mineral back to the water, no corpse
            for (j, g) in ids {
                if sim.w.alive[j] != 0 && sim.w.gen[j] == g {
                    if sim.w.mn[j] > 0.0 {
                        let c = cell_of(&sim.w, j);
                        sim.w.m[c] = to_f32(sim.w.m[c] as f64 + sim.w.mn[j] as f64);
                    }
                    sim.w.mn[j] = 0.0;
                    sim.w.pr[j] = 0.0;
                    sim.w.alive[j] = 0;
                    sim.w.free_list.push(j);
                }
            }
        }
        Undo::Fertilize { cells, amount: _ } => {
            // reclaim only what the water still holds; what life absorbed stays in bodies
            let mut reclaimed = 0.0;
            for (c, amt) in cells {
                let take = jmin(sim.w.m[c] as f64, amt);
                sim.w.m[c] = to_f32(sim.w.m[c] as f64 - take);
                reclaimed += take;
            }
            sim.w.added_m = jmax(0.0, sim.w.added_m - reclaimed);
        }
        Undo::LightMul { prev } => {
            sim.p.light_mul = prev;
            compute_light(&mut sim.w, &sim.p);
        }
        Undo::Source { k, x, y } => apply_event(sim, Event::Source { k, x, y }),
        Undo::SourceAdd { k } => apply_event(sim, Event::SourceRemove { k }),
        Undo::SourceRemove { at, s } => apply_event(sim, Event::SourceAdd {
            x: s.x, y: s.y, i: Some(s.i), a: Some(s.a), sigma: Some(s.sigma), at: Some(at),
        }),
        Undo::SourceSet { k, i, a, sigma } => apply_event(sim, Event::SourceSet {
            k, i: Some(i), a: Some(a), sigma: Some(sigma),
        }),
        Undo::WallAdd { k } => apply_event(sim, Event::WallRemove { k }),
        Undo::WallRemove { at, spec } => apply_event(sim, Event::WallAdd { spec, at: Some(at) }),
        Undo::WallSet { k, lt, ht, fl, pass } => apply_event(sim, Event::WallSet {
            k, lt: Some(lt), ht: Some(ht), fl: Some(fl), pass: Some(pass),
        }),
    }
    // an inverse must not become the next thing to undo
    sim.undo = Undo::None;
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
