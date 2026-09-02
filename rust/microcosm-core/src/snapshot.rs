//! Save and load — a versioned flat binary snapshot of the whole world.
//!
//! The web artifact cannot persist anything (no localStorage, by project rule), so a running world
//! has always lived only in memory. The native port can do better, and this is where that lives:
//! the core owns the format, because the core owns the state.
//!
//! Design (docs/android-port-plan.md §2, the Factorio pattern):
//!
//! * **Snapshot, not replay.** Seed + event log would be smaller, but resuming an 18,000-tick
//!   world means re-simulating it — tens of seconds of load screen — and the log is lossily capped
//!   anyway. The log rides along as provenance instead.
//! * **Authoritative state only.** Everything derivable is recomputed on load: the light and warmth
//!   fields with their gradients and Q10 tables, the wall face planes, the spatial hash and the
//!   biomass layers. What must be stored is what no function can rebuild — positions, energies,
//!   the genome, the corpse pool, the free lists (whose ORDER decides which slot the next spawn
//!   takes), and the PRNG state.
//! * **Versioned, and refuses what it cannot honour.** The header carries the format version and
//!   the world's shape (MAXN, GRID, MAXLOCI, species count). A snapshot from a differently-shaped
//!   build is rejected with a reason rather than loaded into a world it does not fit.
//!
//! Correctness is checked the only way that means anything for a deterministic sim: save at tick T,
//! load, run on, and require the same fingerprint as the run that was never interrupted
//! (`cargo run --bin snapshot`).

use crate::events::{Event, LocusKey, LoggedEvent};
use crate::fields::{compile_walls, compute_light, compute_temp, make_wall, WallSpec};
use crate::params::*;
use crate::world::Source;
use crate::Sim;

const MAGIC: &[u8; 4] = b"MCSM";
/// Bump on any format change. Loading refuses versions it does not know.
///
/// Version history:
/// * 1 — the M3 format: world, settings, locus table, event log.
/// * 2 — appends the running experiment (owner report 2026-09-02: "world state is saved but the
///   fact that I run an experiment is not"). Version-1 files still load, with no level.
const VERSION: u32 = 2;

// ---------- little-endian writer / reader ----------

struct Wr {
    v: Vec<u8>,
}

impl Wr {
    fn new() -> Wr {
        Wr { v: Vec::with_capacity(1 << 20) }
    }
    fn u8(&mut self, x: u8) {
        self.v.push(x);
    }
    fn u32(&mut self, x: u32) {
        self.v.extend_from_slice(&x.to_le_bytes());
    }
    fn i32(&mut self, x: i32) {
        self.v.extend_from_slice(&x.to_le_bytes());
    }
    fn i64(&mut self, x: i64) {
        self.v.extend_from_slice(&x.to_le_bytes());
    }
    fn f64(&mut self, x: f64) {
        self.v.extend_from_slice(&x.to_bits().to_le_bytes());
    }
    fn f32s(&mut self, s: &[f32]) {
        self.u32(s.len() as u32);
        for v in s {
            self.v.extend_from_slice(&v.to_bits().to_le_bytes());
        }
    }
    fn f64s(&mut self, s: &[f64]) {
        self.u32(s.len() as u32);
        for v in s {
            self.v.extend_from_slice(&v.to_bits().to_le_bytes());
        }
    }
    fn u8s(&mut self, s: &[u8]) {
        self.u32(s.len() as u32);
        self.v.extend_from_slice(s);
    }
    fn i16s(&mut self, s: &[i16]) {
        self.u32(s.len() as u32);
        for v in s {
            self.v.extend_from_slice(&v.to_le_bytes());
        }
    }
    fn u16s(&mut self, s: &[u16]) {
        self.u32(s.len() as u32);
        for v in s {
            self.v.extend_from_slice(&v.to_le_bytes());
        }
    }
    fn i32s(&mut self, s: &[i32]) {
        self.u32(s.len() as u32);
        for v in s {
            self.v.extend_from_slice(&v.to_le_bytes());
        }
    }
    fn usizes(&mut self, s: &[usize]) {
        self.u32(s.len() as u32);
        for v in s {
            self.u32(*v as u32);
        }
    }
}

pub struct Rd<'a> {
    b: &'a [u8],
    p: usize,
}

#[derive(Debug)]
pub struct LoadError(pub String);

impl std::fmt::Display for LoadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "snapshot: {}", self.0)
    }
}

type R<T> = Result<T, LoadError>;

impl<'a> Rd<'a> {
    fn new(b: &'a [u8]) -> Rd<'a> {
        Rd { b, p: 0 }
    }
    fn take(&mut self, n: usize) -> R<&'a [u8]> {
        if self.p + n > self.b.len() {
            return Err(LoadError(format!(
                "truncated: wanted {} bytes at offset {}, file has {}",
                n,
                self.p,
                self.b.len()
            )));
        }
        let s = &self.b[self.p..self.p + n];
        self.p += n;
        Ok(s)
    }
    fn u8(&mut self) -> R<u8> {
        Ok(self.take(1)?[0])
    }
    fn u32(&mut self) -> R<u32> {
        let s = self.take(4)?;
        Ok(u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
    }
    fn i32(&mut self) -> R<i32> {
        Ok(self.u32()? as i32)
    }
    fn i64(&mut self) -> R<i64> {
        let s = self.take(8)?;
        let mut a = [0u8; 8];
        a.copy_from_slice(s);
        Ok(i64::from_le_bytes(a))
    }
    fn f64(&mut self) -> R<f64> {
        let s = self.take(8)?;
        let mut a = [0u8; 8];
        a.copy_from_slice(s);
        Ok(f64::from_bits(u64::from_le_bytes(a)))
    }
    fn len_into(&mut self, want: usize, what: &str) -> R<usize> {
        let n = self.u32()? as usize;
        if n != want {
            return Err(LoadError(format!(
                "{}: length {} does not fit this build's {}",
                what, n, want
            )));
        }
        Ok(n)
    }
    fn f32s_into(&mut self, dst: &mut [f32], what: &str) -> R<()> {
        let n = self.len_into(dst.len(), what)?;
        for item in dst.iter_mut().take(n) {
            let s = self.take(4)?;
            *item = f32::from_bits(u32::from_le_bytes([s[0], s[1], s[2], s[3]]));
        }
        Ok(())
    }
    fn f64s_into(&mut self, dst: &mut [f64], what: &str) -> R<()> {
        let n = self.len_into(dst.len(), what)?;
        for item in dst.iter_mut().take(n) {
            *item = self.f64()?;
        }
        Ok(())
    }
    fn u8s_into(&mut self, dst: &mut [u8], what: &str) -> R<()> {
        let n = self.len_into(dst.len(), what)?;
        dst[..n].copy_from_slice(self.take(n)?);
        Ok(())
    }
    fn i16s_into(&mut self, dst: &mut [i16], what: &str) -> R<()> {
        let n = self.len_into(dst.len(), what)?;
        for item in dst.iter_mut().take(n) {
            let s = self.take(2)?;
            *item = i16::from_le_bytes([s[0], s[1]]);
        }
        Ok(())
    }
    fn u16s_into(&mut self, dst: &mut [u16], what: &str) -> R<()> {
        let n = self.len_into(dst.len(), what)?;
        for item in dst.iter_mut().take(n) {
            let s = self.take(2)?;
            *item = u16::from_le_bytes([s[0], s[1]]);
        }
        Ok(())
    }
    fn i32s_into(&mut self, dst: &mut [i32], what: &str) -> R<()> {
        let n = self.len_into(dst.len(), what)?;
        for item in dst.iter_mut().take(n) {
            *item = self.i32()?;
        }
        Ok(())
    }
    fn usizes(&mut self) -> R<Vec<usize>> {
        let n = self.u32()? as usize;
        let mut v = Vec::with_capacity(n);
        for _ in 0..n {
            v.push(self.u32()? as usize);
        }
        Ok(v)
    }
    fn bytes_vec(&mut self) -> R<Vec<u8>> {
        let n = self.u32()? as usize;
        Ok(self.take(n)?.to_vec())
    }
    fn f64s_vec(&mut self) -> R<Vec<f64>> {
        let n = self.u32()? as usize;
        let mut v = Vec::with_capacity(n);
        for _ in 0..n {
            v.push(self.f64()?);
        }
        Ok(v)
    }
}

// ---------- the event log, for provenance ----------

fn write_event(w: &mut Wr, ev: &Event) {
    match ev {
        Event::SpawnPack { sp, x, y } => {
            w.u8(1);
            w.u32(*sp as u32);
            w.f64(*x);
            w.f64(*y);
        }
        Event::Fertilize { x, y, amount } => {
            w.u8(2);
            w.f64(*x);
            w.f64(*y);
            w.f64(*amount);
        }
        Event::LightMul { v } => {
            w.u8(3);
            w.f64(*v);
        }
        Event::Mutation { v } => {
            w.u8(4);
            w.u8(if *v { 1 } else { 0 });
        }
        Event::Locus { sp, locus, key, v } => {
            w.u8(5);
            w.u32(*sp as u32);
            w.u32(*locus as u32);
            w.u32(locus_key_id(*key));
            w.f64(*v);
        }
        Event::Source { k, x, y } => {
            w.u8(6);
            w.u32(*k as u32);
            w.f64(*x);
            w.f64(*y);
        }
        Event::SourceAdd { x, y, i, a, sigma, at } => {
            w.u8(7);
            w.f64(*x);
            w.f64(*y);
            opt_f64(w, *i);
            opt_f64(w, *a);
            opt_f64(w, *sigma);
            w.i32(at.map_or(-1, |v| v as i32));
        }
        Event::SourceRemove { k } => {
            w.u8(8);
            w.u32(*k as u32);
        }
        Event::SourceSet { k, i, a, sigma } => {
            w.u8(9);
            w.u32(*k as u32);
            opt_f64(w, *i);
            opt_f64(w, *a);
            opt_f64(w, *sigma);
        }
        Event::WallAdd { spec, at } => {
            w.u8(10);
            write_spec(w, spec);
            w.i32(at.map_or(-1, |v| v as i32));
        }
        Event::WallRemove { k } => {
            w.u8(11);
            w.u32(*k as u32);
        }
        Event::WallSet { k, lt, ht, fl, pass } => {
            w.u8(12);
            w.u32(*k as u32);
            opt_f64(w, *lt);
            opt_f64(w, *ht);
            opt_f64(w, *fl);
            w.u8(pass.is_some() as u8);
            w.i32(pass.unwrap_or(0));
        }
        Event::Feed { i, gen, frac } => {
            w.u8(13);
            w.u32(*i as u32);
            w.u32(*gen as u32);
            w.f64(*frac);
        }
        Event::Kill { i, gen } => {
            w.u8(14);
            w.u32(*i as u32);
            w.u32(*gen as u32);
        }
    }
}

fn read_event(r: &mut Rd) -> R<Event> {
    Ok(match r.u8()? {
        1 => Event::SpawnPack { sp: r.u32()? as usize, x: r.f64()?, y: r.f64()? },
        2 => Event::Fertilize { x: r.f64()?, y: r.f64()?, amount: r.f64()? },
        3 => Event::LightMul { v: r.f64()? },
        4 => Event::Mutation { v: r.u8()? != 0 },
        5 => {
            let sp = r.u32()? as usize;
            let locus = r.u32()? as usize;
            let key = id_locus_key(r.u32()?)
                .ok_or_else(|| LoadError("event log: unknown locus key".into()))?;
            Event::Locus { sp, locus, key, v: r.f64()? }
        }
        6 => Event::Source { k: r.u32()? as usize, x: r.f64()?, y: r.f64()? },
        7 => Event::SourceAdd {
            x: r.f64()?,
            y: r.f64()?,
            i: rd_opt(r)?,
            a: rd_opt(r)?,
            sigma: rd_opt(r)?,
            at: { let v = r.i32()?; if v >= 0 { Some(v as usize) } else { None } },
        },
        8 => Event::SourceRemove { k: r.u32()? as usize },
        9 => Event::SourceSet { k: r.u32()? as usize, i: rd_opt(r)?, a: rd_opt(r)?, sigma: rd_opt(r)? },
        10 => Event::WallAdd {
            spec: read_spec(r)?,
            at: { let v = r.i32()?; if v >= 0 { Some(v as usize) } else { None } },
        },
        11 => Event::WallRemove { k: r.u32()? as usize },
        12 => Event::WallSet {
            k: r.u32()? as usize,
            lt: rd_opt(r)?,
            ht: rd_opt(r)?,
            fl: rd_opt(r)?,
            pass: { let has = r.u8()? != 0; let v = r.i32()?; if has { Some(v) } else { None } },
        },
        13 => Event::Feed { i: r.u32()? as usize, gen: r.u32()? as u16, frac: r.f64()? },
        14 => Event::Kill { i: r.u32()? as usize, gen: r.u32()? as u16 },
        t => return Err(LoadError(format!("event log: unknown tag {}", t))),
    })
}

fn opt_f64(w: &mut Wr, v: Option<f64>) {
    w.u8(v.is_some() as u8);
    w.f64(v.unwrap_or(0.0));
}
fn rd_opt(r: &mut Rd) -> R<Option<f64>> {
    let has = r.u8()? != 0;
    let v = r.f64()?;
    Ok(if has { Some(v) } else { None })
}
fn write_spec(w: &mut Wr, s: &WallSpec) {
    w.f64(s.x0);
    w.f64(s.y0);
    w.f64(s.dx);
    w.f64(s.dy);
    w.f64(s.lt);
    w.f64(s.ht);
    w.f64(s.fl);
    w.i32(s.pass);
}
fn read_spec(r: &mut Rd) -> R<WallSpec> {
    Ok(WallSpec {
        x0: r.f64()?,
        y0: r.f64()?,
        dx: r.f64()?,
        dy: r.f64()?,
        lt: r.f64()?,
        ht: r.f64()?,
        fl: r.f64()?,
        pass: r.i32()?,
    })
}

fn locus_key_id(k: LocusKey) -> u32 {
    use LocusKey::*;
    match k {
        Sigma => 0, Curve => 1, EscSlope => 2, KpSlope => 3, CatchSlope => 4, KbSlope => 5,
        LightSlope => 6, RateSlope => 7, EffSlope => 8, WarmSlope => 9, WarmGainSlope => 10,
        TprefSpan => 11, DampSpan => 12, PcSpeedSlope => 13, PcTurnSlope => 14, TumbleSlope => 15,
    }
}
fn id_locus_key(v: u32) -> Option<LocusKey> {
    use LocusKey::*;
    Some(match v {
        0 => Sigma, 1 => Curve, 2 => EscSlope, 3 => KpSlope, 4 => CatchSlope, 5 => KbSlope,
        6 => LightSlope, 7 => RateSlope, 8 => EffSlope, 9 => WarmSlope, 10 => WarmGainSlope,
        11 => TprefSpan, 12 => DampSpan, 13 => PcSpeedSlope, 14 => PcTurnSlope, 15 => TumbleSlope,
        _ => return None,
    })
}

// ---------- save ----------

impl Sim {
    /// Serialize the world. Take it at a tick boundary: a pending event queue is not saved (it is
    /// empty between ticks by construction), and saving mid-tick is not a state this can express.
    pub fn save(&self) -> Vec<u8> {
        let mut w = Wr::new();
        w.v.extend_from_slice(MAGIC);
        w.u32(VERSION);
        // world shape — a snapshot from a differently-shaped build must not silently half-load
        w.u32(MAXN as u32);
        w.u32(GRID as u32);
        w.u32(MAXLOCI as u32);
        w.u32(self.tr.len() as u32);

        let s = &self.w;
        w.i32(s.seed);
        w.i64(s.tick);
        w.i32(s.rng.state);
        w.u32(s.n as u32);
        w.u32(s.c_n as u32);
        w.f64(s.added_m);
        w.u8(s.initialized as u8);

        // mutable run settings
        w.u8(self.p.mutation as u8);
        w.u8(self.p.spawn_decomposers as u8);
        w.f64(self.p.light_mul);
        w.f64(self.p.temp_amb);
        w.i32(self.p.seed);

        // the locus table: session-mutable (the `locus` event and harness price sweeps write it),
        // and NOT fully restored by init_world — so it is state, not configuration
        w.u32(self.tr.len() as u32);
        for t in &self.tr {
            w.u32(t.loci.len() as u32);
            for l in &t.loci {
                for v in [
                    l.g0, l.sigma, l.curve, l.esc_slope, l.kp_slope, l.catch_slope, l.kb_slope,
                    l.light_slope, l.rate_slope, l.eff_slope, l.warm_slope, l.warm_gain_slope,
                    l.tpref_span, l.damp_span, l.pc_speed_slope, l.pc_turn_slope, l.tumble_slope,
                ] {
                    w.f64(v);
                }
            }
            w.f64(t.thermo);
            w.f64(t.topt);
            w.f64(t.ctmax);
        }

        // organism columns
        w.f32s(&s.x); w.f32s(&s.y); w.f32s(&s.px); w.f32s(&s.py);
        w.f32s(&s.vx); w.f32s(&s.vy); w.f32s(&s.en); w.f32s(&s.sz);
        w.f64s(&s.sz_pow);
        w.u8s(&s.sp); w.u8s(&s.alive); w.u8s(&s.cy);
        w.f32s(&s.hd); w.f32s(&s.mn); w.f32s(&s.pr); w.f32s(&s.mem);
        w.i16s(&s.handle); w.i16s(&s.cd); w.i16s(&s.gr);
        w.i16s(&s.flee); w.i16s(&s.bst); w.i16s(&s.pc);
        w.f32s(&s.g);
        w.u16s(&s.lg); w.u16s(&s.gen);
        w.i32s(&s.birth);
        // free-list ORDER decides which slot the next spawn takes — it is state, not a set
        w.usizes(&s.free_list);

        // grid fields (authoritative only; light/temp/gradients/Q10 are recomputed on load)
        w.f32s(&s.m); w.f32s(&s.d_e); w.f32s(&s.d_p); w.f32s(&s.d_m);
        w.f32s(&s.sc); w.f32s(&s.al);

        // corpse pool
        w.u8s(&s.c_alive); w.u8s(&s.c_sp);
        w.f32s(&s.c_x); w.f32s(&s.c_y); w.f32s(&s.c_e);
        w.f32s(&s.c_p); w.f32s(&s.c_m); w.f32s(&s.c_sz);
        w.usizes(&s.c_free);

        // sources and walls (walls as their strokes: compile_walls rebuilds the face planes)
        w.u32(s.sources.len() as u32);
        for src in &s.sources {
            w.f64(src.x); w.f64(src.y); w.f64(src.i); w.f64(src.a); w.f64(src.sigma);
        }
        w.u32(s.walls.len() as u32);
        for wl in &s.walls {
            w.f64(wl.x0); w.f64(wl.y0); w.f64(wl.dx); w.f64(wl.dy);
            w.f64(wl.lt); w.f64(wl.ht); w.f64(wl.fl); w.i32(wl.pass);
        }

        // flows
        let f = &s.flows;
        for v in [
            f.uptake, f.release, f.excrete, f.transfer, f.egest_e, f.egest_p, f.leach_m,
            f.corpse_to_det, f.bac_release, f.gpp, f.resp, f.deaths,
        ] {
            w.f64(v);
        }
        for v in f.deaths_by {
            w.f64(v);
        }

        // the event log, as provenance (and the debugging substrate a desync needs)
        w.u32(s.event_log.len() as u32);
        for e in &s.event_log {
            w.i64(e.t);
            write_event(&mut w, &e.ev);
        }

        // version 2: the running experiment. The level definition is the shipped table's; only the
        // RUN is state — keyed by the level's name, not its index, so a reordered table cannot
        // silently swap one experiment for another. `rg_def` is derived from the definition
        // (levels::collect_regions), so only the census ring itself is stored.
        let l = &self.lvl;
        match l.def() {
            Some(def) if l.state != crate::levels::LvlState::Idle => {
                w.u8(1);
                w.u8s(def.key.as_bytes());
                w.u8(match l.state {
                    crate::levels::LvlState::Idle => 0,
                    crate::levels::LvlState::Running => 1,
                    crate::levels::LvlState::Passed => 2,
                    crate::levels::LvlState::Failed => 3,
                });
                w.i32(l.run);
                w.i64(l.seen_s);
                w.i32(l.predicted);
                w.i32(l.pour_left);
                for b in l.mem {
                    w.u8(b);
                }
                w.u32(l.fired as u32);
                w.u32(l.src0 as u32);
                // fail_why as a reference into the definition: -1 none, -2 timeout, else the
                // fail_now rule that fired — the strings themselves stay in the shipped table
                w.i32(if l.fail_why.is_empty() {
                    -1
                } else if l.fail_why == def.timeout_why {
                    -2
                } else {
                    def.fail_now.iter().position(|r| r.why == l.fail_why).map_or(-2, |k| k as i32)
                });
                w.i64(l.rg_s);
                w.f64s(&l.rg);
            }
            _ => w.u8(0),
        }
        w.v
    }

    /// Restore a world saved by [`Sim::save`]. Rebuilds every derived field afterwards, so the
    /// loaded world is byte-for-byte the saved one and steps on identically.
    pub fn load(&mut self, bytes: &[u8]) -> Result<(), LoadError> {
        let mut r = Rd::new(bytes);
        if r.take(4)? != MAGIC {
            return Err(LoadError("not a Microcosm snapshot (bad magic)".into()));
        }
        let ver = r.u32()?;
        if ver < 1 || ver > VERSION {
            return Err(LoadError(format!(
                "format version {}, this build reads 1..={}",
                ver, VERSION
            )));
        }
        let (maxn, grid, maxloci, nsp) = (r.u32()?, r.u32()?, r.u32()?, r.u32()?);
        if maxn as usize != MAXN || grid as usize != GRID || maxloci as usize != MAXLOCI {
            return Err(LoadError(format!(
                "world shape MAXN={} GRID={} MAXLOCI={} does not match this build ({}, {}, {})",
                maxn, grid, maxloci, MAXN, GRID, MAXLOCI
            )));
        }
        if nsp as usize != self.tr.len() {
            return Err(LoadError(format!(
                "{} species in the snapshot, {} in this build",
                nsp,
                self.tr.len()
            )));
        }

        self.w.seed = r.i32()?;
        self.w.tick = r.i64()?;
        self.w.rng.state = r.i32()?;
        self.w.n = r.u32()? as usize;
        self.w.c_n = r.u32()? as usize;
        self.w.added_m = r.f64()?;
        self.w.initialized = r.u8()? != 0;

        self.p.mutation = r.u8()? != 0;
        self.p.spawn_decomposers = r.u8()? != 0;
        self.p.light_mul = r.f64()?;
        self.p.temp_amb = r.f64()?;
        self.p.seed = r.i32()?;

        let nt = r.u32()? as usize;
        if nt != self.tr.len() {
            return Err(LoadError("locus table length mismatch".into()));
        }
        for sp in 0..nt {
            let nl = r.u32()? as usize;
            if nl != self.tr[sp].loci.len() {
                return Err(LoadError(format!(
                    "species {} has {} loci in the snapshot, {} in this build",
                    sp,
                    nl,
                    self.tr[sp].loci.len()
                )));
            }
            for k in 0..nl {
                let l = &mut self.tr[sp].loci[k];
                l.g0 = r.f64()?;
                l.sigma = r.f64()?;
                l.curve = r.f64()?;
                l.esc_slope = r.f64()?;
                l.kp_slope = r.f64()?;
                l.catch_slope = r.f64()?;
                l.kb_slope = r.f64()?;
                l.light_slope = r.f64()?;
                l.rate_slope = r.f64()?;
                l.eff_slope = r.f64()?;
                l.warm_slope = r.f64()?;
                l.warm_gain_slope = r.f64()?;
                l.tpref_span = r.f64()?;
                l.damp_span = r.f64()?;
                l.pc_speed_slope = r.f64()?;
                l.pc_turn_slope = r.f64()?;
                l.tumble_slope = r.f64()?;
            }
            self.tr[sp].thermo = r.f64()?;
            self.tr[sp].topt = r.f64()?;
            self.tr[sp].ctmax = r.f64()?;
        }

        {
            let s = &mut self.w;
            r.f32s_into(&mut s.x, "x")?;
            r.f32s_into(&mut s.y, "y")?;
            r.f32s_into(&mut s.px, "px")?;
            r.f32s_into(&mut s.py, "py")?;
            r.f32s_into(&mut s.vx, "vx")?;
            r.f32s_into(&mut s.vy, "vy")?;
            r.f32s_into(&mut s.en, "en")?;
            r.f32s_into(&mut s.sz, "sz")?;
            r.f64s_into(&mut s.sz_pow, "szPow")?;
            r.u8s_into(&mut s.sp, "sp")?;
            r.u8s_into(&mut s.alive, "alive")?;
            r.u8s_into(&mut s.cy, "cy")?;
            r.f32s_into(&mut s.hd, "hd")?;
            r.f32s_into(&mut s.mn, "mn")?;
            r.f32s_into(&mut s.pr, "pr")?;
            r.f32s_into(&mut s.mem, "mem")?;
            r.i16s_into(&mut s.handle, "handle")?;
            r.i16s_into(&mut s.cd, "cd")?;
            r.i16s_into(&mut s.gr, "gr")?;
            r.i16s_into(&mut s.flee, "flee")?;
            r.i16s_into(&mut s.bst, "bst")?;
            r.i16s_into(&mut s.pc, "pc")?;
            r.f32s_into(&mut s.g, "g")?;
            r.u16s_into(&mut s.lg, "lg")?;
            r.u16s_into(&mut s.gen, "gen")?;
            r.i32s_into(&mut s.birth, "birth")?;
            s.free_list = r.usizes()?;

            r.f32s_into(&mut s.m, "M")?;
            r.f32s_into(&mut s.d_e, "dE")?;
            r.f32s_into(&mut s.d_p, "dP")?;
            r.f32s_into(&mut s.d_m, "dM")?;
            r.f32s_into(&mut s.sc, "sc")?;
            r.f32s_into(&mut s.al, "al")?;

            r.u8s_into(&mut s.c_alive, "cAlive")?;
            r.u8s_into(&mut s.c_sp, "cSp")?;
            r.f32s_into(&mut s.c_x, "cX")?;
            r.f32s_into(&mut s.c_y, "cY")?;
            r.f32s_into(&mut s.c_e, "cE")?;
            r.f32s_into(&mut s.c_p, "cP")?;
            r.f32s_into(&mut s.c_m, "cM")?;
            r.f32s_into(&mut s.c_sz, "cSz")?;
            s.c_free = r.usizes()?;

            let ns = r.u32()? as usize;
            s.sources.clear();
            for _ in 0..ns {
                s.sources.push(Source {
                    x: r.f64()?,
                    y: r.f64()?,
                    i: r.f64()?,
                    a: r.f64()?,
                    sigma: r.f64()?,
                });
            }
            let nw = r.u32()? as usize;
            s.walls.clear();
            for _ in 0..nw {
                let spec = WallSpec {
                    x0: r.f64()?,
                    y0: r.f64()?,
                    dx: r.f64()?,
                    dy: r.f64()?,
                    lt: r.f64()?,
                    ht: r.f64()?,
                    fl: r.f64()?,
                    pass: r.i32()?,
                };
                // The stored stroke is already corner-snapped, so re-rasterizing reproduces the
                // same staircase — the face planes are derived, never stored.
                if let Some(wl) = make_wall(&spec) {
                    s.walls.push(wl);
                }
            }

            let f = &mut s.flows;
            f.uptake = r.f64()?;
            f.release = r.f64()?;
            f.excrete = r.f64()?;
            f.transfer = r.f64()?;
            f.egest_e = r.f64()?;
            f.egest_p = r.f64()?;
            f.leach_m = r.f64()?;
            f.corpse_to_det = r.f64()?;
            f.bac_release = r.f64()?;
            f.gpp = r.f64()?;
            f.resp = r.f64()?;
            f.deaths = r.f64()?;
            for i in 0..7 {
                f.deaths_by[i] = r.f64()?;
            }

            let nlog = r.u32()? as usize;
            s.event_log.clear();
            for _ in 0..nlog {
                let t = r.i64()?;
                let ev = read_event(&mut r)?;
                s.event_log.push(LoggedEvent { t, ev });
            }
            s.events.clear();
        }

        // The running experiment (version 2). Whatever level THIS session was in ends here: its
        // verdicts would judge the loaded world against a run it never had. A version-1 file, or
        // one saved outside a level, therefore loads into the sandbox.
        self.lvl = crate::levels::Lvl::default();
        if ver >= 2 && r.u8()? != 0 {
            use crate::levels::{collect_regions, Lvl, LvlState, MAX_LATCH};
            let key = String::from_utf8_lossy(&r.bytes_vec()?).into_owned();
            let state = match r.u8()? {
                1 => LvlState::Running,
                2 => LvlState::Passed,
                3 => LvlState::Failed,
                t => return Err(LoadError(format!("level: unknown state {}", t))),
            };
            let run = r.i32()?;
            let seen_s = r.i64()?;
            let predicted = r.i32()?;
            let pour_left = r.i32()?;
            let mut mem = [0u8; MAX_LATCH];
            for b in mem.iter_mut() {
                *b = r.u8()?;
            }
            let fired = r.u32()? as usize;
            let src0 = r.u32()? as usize;
            let fail_code = r.i32()?;
            let rg_s = r.i64()?;
            let rg = r.f64s_vec()?;
            // Resolve against the shipped table. A key this build does not carry, or a census
            // ring whose shape no longer matches the definition, means the level itself has
            // changed since the save: the world is still whole and loads; the experiment cannot
            // honestly continue and is dropped rather than misjudged.
            let idx = crate::levels_gen::LEVELS.iter().position(|d| d.key == key);
            if let Some(idx) = idx {
                let def = &crate::levels_gen::LEVELS[idx];
                let rg_def = collect_regions(def);
                if rg.len() == crate::params::REC_N * rg_def.len() && fired <= def.script.len() {
                    self.lvl = Lvl {
                        def: idx as i32,
                        state,
                        run,
                        seen_s,
                        fail_why: match fail_code {
                            -1 => "",
                            -2 => def.timeout_why,
                            k => def.fail_now.get(k as usize).map_or(def.timeout_why, |f| f.why),
                        },
                        predicted,
                        pour_left,
                        mem,
                        fired,
                        src0,
                        rg_def,
                        rg,
                        rg_s,
                    };
                }
            }
        }

        // Derived state, rebuilt exactly as init_world builds it.
        compile_walls(&mut self.w);
        compute_light(&mut self.w, &self.p);
        compute_temp(&mut self.w, &self.p);
        Ok(())
    }
}
