//! World state and lifecycle — `src/sim/world.js`.
//!
//! Structure-of-arrays over flat vectors, sized `MAXN`, allocating nothing per tick. Slots are
//! recycled: an organism is identified by `(index, gen)`, and index alone is not stable across
//! ticks. Kept exactly as the JS layout because `docs/porting.md` is explicit that turning
//! organisms into objects is the one "refactor" guaranteed to make a port slower than the
//! JavaScript it replaces.
//!
//! Every read of an f32 column widens to f64 and every write narrows back, which is what
//! JavaScript does implicitly with `Float32Array` and doubles. That pattern is load-bearing for
//! bit-exactness, so it is spelled out at each site rather than hidden behind accessors that might
//! tempt someone to keep an f32 intermediate.

use crate::jsnum::{jmin, to_f32, to_i16, to_int32};
use crate::math;
use crate::params::*;
use crate::rng::Rng;
use crate::traits::Species;

/// An energy source (7.L/7.H): light `i`, warmth `a` (negative = a cold source).
#[derive(Clone, Copy, Debug)]
pub struct Source {
    pub x: f64,
    pub y: f64,
    pub i: f64,
    pub a: f64,
    pub sigma: f64,
}

/// A wall stroke (7.W). `faces` holds vertical faces at `y*G+x` and horizontal faces offset by
/// `G*G`, exactly as the JS rasterizer stamps them.
#[derive(Clone, Debug)]
pub struct Wall {
    pub x0: f64,
    pub y0: f64,
    pub dx: f64,
    pub dy: f64,
    pub lt: f64,
    pub ht: f64,
    pub fl: f64,
    pub pass: i32,
    pub faces: Vec<usize>,
    pub path: Vec<(i32, i32)>,
}

/// Conservation bookkeeping (`W.flows`). Pure accounting: nothing here feeds back into the sim.
#[derive(Clone, Debug, Default)]
pub struct Flows {
    pub uptake: f64,
    pub release: f64,
    pub excrete: f64,
    pub transfer: f64,
    pub egest_e: f64,
    pub egest_p: f64,
    pub leach_m: f64,
    pub corpse_to_det: f64,
    pub bac_release: f64,
    pub gpp: f64,
    pub resp: f64,
    pub deaths: f64,
    pub deaths_by: [f64; 7],
}

pub struct World {
    // --- per-organism columns
    pub x: Vec<f32>,
    pub y: Vec<f32>,
    pub px: Vec<f32>,
    pub py: Vec<f32>,
    pub vx: Vec<f32>,
    pub vy: Vec<f32>,
    pub en: Vec<f32>,
    pub sz: Vec<f32>,
    /// `sz^0.75`, cached at spawn (sz is written nowhere else) — a Float64Array in JS, so no
    /// narrowing here either.
    pub sz_pow: Vec<f64>,
    pub sp: Vec<u8>,
    pub alive: Vec<u8>,
    pub hd: Vec<f32>,
    pub handle: Vec<i16>,
    pub cd: Vec<i16>,
    pub cy: Vec<u8>,
    pub gr: Vec<i16>,
    pub mn: Vec<f32>,
    pub pr: Vec<f32>,
    pub mem: Vec<f32>,
    /// Heritable locus values in [0,1]: locus k of organism i at `k*MAXN+i`.
    pub g: Vec<f32>,
    pub lg: Vec<u16>,
    pub flee: Vec<i16>,
    pub bst: Vec<i16>,
    pub pc: Vec<i16>,
    pub birth: Vec<i32>,
    pub gen: Vec<u16>,

    // --- scalars
    pub n: usize,
    pub free_list: Vec<usize>,
    pub tick: i64,
    pub initialized: bool,
    pub rng: Rng,
    /// Provenance: the seed this world was founded on (M0; the JS reference carries it too).
    pub seed: i32,
    pub added_m: f64,
    pub light_dirty: bool,
    /// Pending interventions, applied at the next tick boundary.
    pub events: Vec<crate::events::Event>,
    /// The applied-event log — replay substrate, capped exactly as the JS caps it.
    pub event_log: Vec<crate::events::LoggedEvent>,

    // --- sources and walls
    pub sources: Vec<Source>,
    pub walls: Vec<Wall>,
    pub walls_on: bool,
    pub wf_pass_v: Vec<i32>,
    pub wf_pass_h: Vec<i32>,
    pub wf_lt_v: Vec<f32>,
    pub wf_lt_h: Vec<f32>,
    pub wf_ht_v: Vec<f32>,
    pub wf_ht_h: Vec<f32>,
    pub wf_fl_v: Vec<f32>,
    pub wf_fl_h: Vec<f32>,
    pub w_shade: Vec<f32>,

    // --- fields
    pub temp: Vec<f32>,
    pub q_r: Vec<f32>,
    pub q_p: Vec<f32>,
    pub q_d: Vec<f32>,
    pub q_h: Vec<f32>,
    pub q_s: Vec<f32>,
    pub q_a: Vec<f32>,
    pub tgx: Vec<f32>,
    pub tgy: Vec<f32>,
    pub lgx: Vec<f32>,
    pub lgy: Vec<f32>,
    pub light: Vec<f32>,
    pub p_b: Vec<f32>,
    pub b_b: Vec<f32>,
    pub f_b: Vec<f32>,
    pub m: Vec<f32>,
    pub m_tmp: Vec<f32>,
    pub d_e: Vec<f32>,
    pub d_p: Vec<f32>,
    pub d_m: Vec<f32>,
    pub sc: Vec<f32>,
    pub sc_tmp: Vec<f32>,
    pub al: Vec<f32>,
    pub al_tmp: Vec<f32>,

    pub flows: Flows,

    // --- spatial hash
    pub hash_head: Vec<i32>,
    pub hash_next: Vec<i32>,
    pub c_hash_head: Vec<i32>,
    pub c_hash_next: Vec<i32>,

    pub pops: [i32; 7],

    // --- corpse pool
    pub c_n: usize,
    pub c_free: Vec<usize>,
    pub c_alive: Vec<u8>,
    pub c_x: Vec<f32>,
    pub c_y: Vec<f32>,
    pub c_e: Vec<f32>,
    pub c_p: Vec<f32>,
    pub c_m: Vec<f32>,
    pub c_sz: Vec<f32>,
    pub c_sp: Vec<u8>,
}

impl World {
    pub fn new(p: &Params) -> World {
        World {
            x: vec![0.0; MAXN],
            y: vec![0.0; MAXN],
            px: vec![0.0; MAXN],
            py: vec![0.0; MAXN],
            vx: vec![0.0; MAXN],
            vy: vec![0.0; MAXN],
            en: vec![0.0; MAXN],
            sz: vec![0.0; MAXN],
            sz_pow: vec![0.0; MAXN],
            sp: vec![0; MAXN],
            alive: vec![0; MAXN],
            hd: vec![0.0; MAXN],
            handle: vec![0; MAXN],
            cd: vec![0; MAXN],
            cy: vec![0; MAXN],
            gr: vec![0; MAXN],
            mn: vec![0.0; MAXN],
            pr: vec![0.0; MAXN],
            mem: vec![0.0; MAXN],
            g: vec![0.0; MAXLOCI * MAXN],
            lg: vec![0; MAXN],
            flee: vec![0; MAXN],
            bst: vec![0; MAXN],
            pc: vec![0; MAXN],
            birth: vec![0; MAXN],
            gen: vec![0; MAXN],

            n: 0,
            free_list: Vec::new(),
            tick: 0,
            initialized: false,
            rng: Rng::new(p.seed),
            seed: p.seed,
            added_m: 0.0,
            light_dirty: false,
            events: Vec::new(),
            event_log: Vec::new(),

            sources: vec![Source {
                x: WORLD / 2.0,
                y: WORLD / 2.0,
                i: p.sun_i,
                a: 0.0,
                sigma: p.sun_sigma,
            }],
            walls: Vec::new(),
            walls_on: false,
            wf_pass_v: vec![-1; NCELL],
            wf_pass_h: vec![-1; NCELL],
            wf_lt_v: vec![1.0; NCELL],
            wf_lt_h: vec![1.0; NCELL],
            wf_ht_v: vec![1.0; NCELL],
            wf_ht_h: vec![1.0; NCELL],
            wf_fl_v: vec![1.0; NCELL],
            wf_fl_h: vec![1.0; NCELL],
            w_shade: vec![1.0; NCELL],

            temp: vec![0.0; NCELL],
            q_r: vec![1.0; NCELL],
            q_p: vec![1.0; NCELL],
            q_d: vec![1.0; NCELL],
            q_h: vec![1.0; NCELL],
            q_s: vec![1.0; NCELL],
            q_a: vec![1.0; NCELL],
            tgx: vec![0.0; NCELL],
            tgy: vec![0.0; NCELL],
            lgx: vec![0.0; NCELL],
            lgy: vec![0.0; NCELL],
            light: vec![0.0; NCELL],
            p_b: vec![0.0; NCELL],
            b_b: vec![0.0; NCELL],
            f_b: vec![0.0; NCELL],
            m: vec![0.0; NCELL],
            m_tmp: vec![0.0; NCELL],
            d_e: vec![0.0; NCELL],
            d_p: vec![0.0; NCELL],
            d_m: vec![0.0; NCELL],
            sc: vec![0.0; NCELL],
            sc_tmp: vec![0.0; NCELL],
            al: vec![0.0; NCELL],
            al_tmp: vec![0.0; NCELL],

            flows: Flows::default(),

            hash_head: vec![0; NCELL],
            hash_next: vec![0; MAXN],
            c_hash_head: vec![0; NCELL],
            c_hash_next: vec![0; MAXCORPSE],

            pops: [0; 7],

            c_n: 0,
            c_free: Vec::new(),
            c_alive: vec![0; MAXCORPSE],
            c_x: vec![0.0; MAXCORPSE],
            c_y: vec![0.0; MAXCORPSE],
            c_e: vec![0.0; MAXCORPSE],
            c_p: vec![0.0; MAXCORPSE],
            c_m: vec![0.0; MAXCORPSE],
            c_sz: vec![0.0; MAXCORPSE],
            c_sp: vec![0; MAXCORPSE],
        }
    }

    /// One PRNG draw — `R()`.
    #[inline]
    pub fn r(&mut self) -> f64 {
        self.rng.next()
    }

    /// The organism loop's upper bound. `W.n` can be incremented past MAXN by a failed spawn
    /// (JS `W.n++` increments before the bounds test returns -1); in JS the extra slots read
    /// `undefined` and are skipped, so clamping here is exactly equivalent — and keeps Rust from
    /// indexing out of bounds where JS merely shrugged.
    #[inline]
    pub fn n_slots(&self) -> usize {
        if self.n > MAXN {
            MAXN
        } else {
            self.n
        }
    }
}

/// `wrap` — bring a coordinate back onto the torus. JS `%` is the truncated remainder, same as
/// Rust's, and a negative result is lifted by one world.
#[inline]
pub fn wrap(v: f64) -> f64 {
    let v = v % WORLD;
    if v < 0.0 {
        v + WORLD
    } else {
        v
    }
}

/// `wd` — minimal-image displacement. Two sequential `if`s in the original, not `else if`.
#[inline]
pub fn wd(d: f64) -> f64 {
    let mut d = d;
    if d > WORLD / 2.0 {
        d -= WORLD;
    }
    if d < -WORLD / 2.0 {
        d += WORLD;
    }
    d
}

/// `cellAt(x, y)`.
#[inline]
pub fn cell_at(x: f64, y: f64) -> usize {
    let gy = to_int32((y / CELL).floor()) & GRID_MASK;
    let gx = to_int32((x / CELL).floor()) & GRID_MASK;
    (gy * GRID_I + gx) as usize
}

/// `cellOf(i)` — the cell an organism stands in, read through its stored f32 position.
#[inline]
pub fn cell_of(w: &World, i: usize) -> usize {
    cell_at(w.x[i] as f64, w.y[i] as f64)
}

/// `spawn(...)` — returns the slot, or -1 when the pool is full.
///
/// The bounds test comes BEFORE the heading draw, so a failed spawn consumes zero PRNG draws.
/// That ordering is part of the RNG contract, not an optimization.
pub fn spawn(
    w: &mut World,
    tr: &[Species],
    species: usize,
    sx: f64,
    sy: f64,
    e: f64,
    size: f64,
    mn_endow: f64,
    pr_endow: f64,
) -> i32 {
    let i = match w.free_list.pop() {
        Some(k) => k,
        None => {
            let k = w.n;
            w.n += 1;
            k
        }
    };
    if i >= MAXN {
        return -1;
    }
    w.x[i] = to_f32(wrap(sx));
    w.y[i] = to_f32(wrap(sy));
    // px/py read the stored f32 back, as `W.px[i]=W.x[i]` does.
    w.px[i] = w.x[i];
    w.py[i] = w.y[i];
    w.vx[i] = 0.0;
    w.vy[i] = 0.0;
    w.en[i] = to_f32(e);
    w.sz[i] = to_f32(size);
    // `Math.pow(W.sz[i], 0.75)` — reads the narrowed sz, not the argument.
    w.sz_pow[i] = math::pow(w.sz[i] as f64, 0.75);
    w.sp[i] = species as u8;
    w.alive[i] = 1;
    let hd = w.r() * 6.283;
    w.hd[i] = to_f32(hd);
    w.cd[i] = to_i16(tr[species].mature_cd);
    w.handle[i] = 0;
    w.cy[i] = 0;
    w.gr[i] = 0;
    w.mn[i] = to_f32(mn_endow);
    w.pr[i] = to_f32(pr_endow);
    w.mem[i] = 0.0;
    w.flee[i] = 0;
    w.bst[i] = 0;
    w.pc[i] = 0;
    {
        // Every plane reset: slots are reused across species.
        let loci = &tr[species].loci;
        for k in 0..MAXLOCI {
            w.g[k * MAXN + i] = if k < loci.len() {
                to_f32(loci[k].g0)
            } else {
                0.0
            };
        }
    }
    w.lg[i] = 0;
    w.birth[i] = to_int32(w.tick as f64);
    w.gen[i] = w.gen[i].wrapping_add(1);
    i as i32
}

/// `endowFounder(i)` — founders draw mineral from their birth cell, up to 70% of quota. Draw-free.
pub fn endow_founder(w: &mut World, p: &Params, tr: &[Species], i: i32) {
    if i < 0 {
        return;
    }
    let i = i as usize;
    let c = cell_of(w, i);
    let want = 0.7 * p.m_quota * tr[w.sp[i] as usize].m_qm * w.sz[i] as f64;
    let got = jmin(w.m[c] as f64, want);
    w.m[c] = to_f32(w.m[c] as f64 - got);
    w.mn[i] = to_f32(got);
    w.pr[i] = to_f32(0.6 * p.p_quota * w.sz[i] as f64);
}

/// `spawnCorpse(...)` — returns the corpse slot, or -1 when the pool overflows (in which case the
/// body decays straight to detritus so the ledger stays closed).
pub fn spawn_corpse(
    w: &mut World,
    x: f64,
    y: f64,
    e: f64,
    pp: f64,
    m: f64,
    sz: f64,
    sp: u8,
) -> i32 {
    let k = match w.c_free.pop() {
        Some(k) => k as i32,
        None => {
            if w.c_n < MAXCORPSE {
                let k = w.c_n;
                w.c_n += 1;
                k as i32
            } else {
                -1
            }
        }
    };
    if k < 0 {
        let c = cell_at(x, y);
        w.d_e[c] = to_f32(w.d_e[c] as f64 + e);
        w.d_p[c] = to_f32(w.d_p[c] as f64 + pp);
        w.d_m[c] = to_f32(w.d_m[c] as f64 + m);
        return -1;
    }
    let k = k as usize;
    w.c_alive[k] = 1;
    w.c_x[k] = to_f32(x);
    w.c_y[k] = to_f32(y);
    w.c_e[k] = to_f32(e);
    w.c_p[k] = to_f32(pp);
    w.c_m[k] = to_f32(m);
    w.c_sz[k] = to_f32(sz);
    w.c_sp[k] = sp;
    k as i32
}

/// `killOrg(i)` — returns the corpse slot it produced, or -1.
pub fn kill_org(w: &mut World, p: &Params, i: usize) -> i32 {
    w.flows.deaths += 1.0;
    w.flows.deaths_by[w.sp[i] as usize] += 1.0;
    let m = w.mn[i] as f64;
    w.mn[i] = 0.0;
    let body_e = crate::jsnum::jmax(0.0, w.en[i] as f64) + p.s_body * w.sz[i] as f64;
    let mut k = -1;
    if body_e + w.pr[i] as f64 + m < 4.0 {
        // micro-bodies (bacterial colonies etc.) decompose directly
        let c = cell_at(w.x[i] as f64, w.y[i] as f64);
        w.d_e[c] = to_f32(w.d_e[c] as f64 + body_e);
        w.d_p[c] = to_f32(w.d_p[c] as f64 + w.pr[i] as f64);
        w.d_m[c] = to_f32(w.d_m[c] as f64 + m);
    } else {
        k = spawn_corpse(
            w,
            w.x[i] as f64,
            w.y[i] as f64,
            body_e,
            w.pr[i] as f64,
            m,
            w.sz[i] as f64,
            w.sp[i],
        );
    }
    w.pr[i] = 0.0;
    w.alive[i] = 0;
    w.free_list.push(i);
    k
}
