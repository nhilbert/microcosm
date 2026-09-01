//! The Observatory — ring-buffer recorder, calibrated detectors, narration.
//! Translated from `src/observatory/recorder.js` and `analysis.js`.
//!
//! `docs/porting.md` licenses rewriting this layer freely: it makes **zero** PRNG draws and mutates
//! no dynamic state, so nothing here can change the world. It is translated closely anyway, for one
//! reason that has nothing to do with the contract — every threshold in it was measured, and every
//! one of those measurements died at least once against the data (absolute thresholds, EWS
//! statistics, level-based depletion, the first heat-trap design). Re-deriving them idiomatically
//! would be re-fighting calibration battles that are already won and recorded.
//!
//! It lives in this crate rather than staying in JavaScript because the alternative is two living
//! copies of the detectors — exactly the dual maintenance the port exists to end.
//!
//! CONTRACT: pure observer. No draws, no writes to dynamic state. Conformance bit-identity with
//! the recorder running is the standing acceptance test for this whole layer.

use crate::fields::js_round;
use crate::math;
use crate::params::*;
use crate::traits::{Movement, Registry, Species};
use crate::world::{cell_at, wd, World};

/// Establishment thresholds per species.
const DET_ESTAB: [f64; 7] = [40.0, 40.0, 20.0, 80.0, 10.0, 4.0, 4.0];
/// `[mean base, sd base]` per recorded locus plane — full MAXLOCI coverage (MV.0).
const LOCUS_CH: [[usize; 2]; 4] = [[42, 49], [75, 82], [89, 96], [103, 110]];
const PATCH_MIN: f64 = 20.0;

/// Clinical reference ranges, measured on the healthy six-seed ensemble (462 windows/species):
/// like blood work, "low" is species-specific — a 50% Drifta crash is routine, a 10% Solara dip
/// is not.
#[derive(Clone, Copy)]
pub struct Band {
    pub res_p03: f64,
    pub res_p10: f64,
    pub pop_p03: f64,
    pub pop_p10: f64,
}

pub fn reference_band(sp: usize) -> Option<Band> {
    Some(match sp {
        0 => Band { res_p03: 0.43, res_p10: 0.44, pop_p03: 0.93, pop_p10: 0.97 },
        1 => Band { res_p03: 0.27, res_p10: 0.28, pop_p03: 0.44, pop_p10: 0.60 },
        2 => Band { res_p03: 0.33, res_p10: 0.37, pop_p03: 0.47, pop_p10: 0.62 },
        3 => Band { res_p03: 0.22, res_p10: 0.23, pop_p03: 0.82, pop_p10: 0.89 },
        6 => Band { res_p03: 0.24, res_p10: 0.27, pop_p03: 0.80, pop_p10: 0.88 },
        _ => return None,
    })
}

/// `Number.prototype.toFixed` — ties away from zero on the magnitude, where Rust's formatter
/// rounds half to even. Display only (the gates match on event type, species and tick), but the
/// narration should read the same in both implementations.
pub fn to_fixed(x: f64, f: u32) -> String {
    if x.is_nan() {
        return "NaN".to_string();
    }
    let neg = x < 0.0;
    let a = if neg { -x } else { x };
    let p = 10f64.powi(f as i32);
    let scaled = a * p;
    let mut n = scaled.floor();
    if scaled - n >= 0.5 {
        n += 1.0;
    }
    let v = n / p;
    let s = format!("{:.*}", f as usize, v);
    if neg && v != 0.0 {
        format!("-{}", s)
    } else {
        s
    }
}

#[derive(Clone, Debug)]
pub struct SysEvent {
    pub tick: i64,
    pub kind: &'static str,
    /// Species index, or -1 for a world-level event.
    pub sp: i32,
    pub locus: Option<usize>,
    pub text: String,
}

struct Det {
    estab: [i32; 7],
    run: [i32; 7],
    bloom: [i32; 7],
    crash: [i32; 7],
    pack_awake: bool,
    depleted: bool,
    locked_warn: bool,
    // heredity detectors run per (species, locus plane): index sp*4 + plane
    sweep: [i32; 28],
    uniform: [i32; 28],
    diverse: [i32; 28],
    diverse_run: [i32; 28],
    rail: [i32; 28],
    rail_run: [i32; 28],
    adapt: [i32; 28],
    adapt_run: [i32; 28],
    heat_retreat: [i32; 7],
    heat_pile: bool,
    heat_pile_run: i32,
    heat_starve: bool,
    heat_starve_run: i32,
    heat_trap: [i32; 7],
    heat_trap_run: [i32; 7],
}

impl Det {
    fn new() -> Det {
        Det {
            estab: [0; 7], run: [0; 7], bloom: [0; 7], crash: [0; 7],
            pack_awake: false, depleted: false, locked_warn: false,
            sweep: [0; 28], uniform: [0; 28], diverse: [0; 28], diverse_run: [0; 28],
            rail: [0; 28], rail_run: [0; 28], adapt: [0; 28], adapt_run: [0; 28],
            heat_retreat: [0; 7], heat_pile: false, heat_pile_run: 0,
            heat_starve: false, heat_starve_run: 0,
            heat_trap: [0; 7], heat_trap_run: [0; 7],
        }
    }
}

/// Movement-observatory memory: the previous sample's positions, for the net-step channel.
/// Slot reuse between samples is excluded by the birth guard.
struct Mv {
    px: Vec<f32>,
    py: Vec<f32>,
    ok: Vec<u8>,
    tick: i64,
}

#[derive(Default)]
struct RecPrev {
    uptake: f64,
    gpp: f64,
    resp: f64,
    bac_release: f64,
    corpse_to_det: f64,
    egest_e: f64,
    deaths: f64,
    deaths_by: [f64; 7],
}

pub struct Observatory {
    pub rec: Vec<f32>,
    pub head: usize,
    pub count: usize,
    pub sys_events: Vec<SysEvent>,
    det: Det,
    mv: Mv,
    prev: RecPrev,
}

impl Default for Observatory {
    fn default() -> Self {
        Self::new()
    }
}

impl Observatory {
    pub fn new() -> Observatory {
        Observatory {
            rec: vec![0.0; REC_N * REC_CH],
            head: 0,
            count: 0,
            sys_events: Vec::new(),
            det: Det::new(),
            mv: Mv { px: vec![0.0; MAXN], py: vec![0.0; MAXN], ok: vec![0; MAXN], tick: -1 },
            prev: RecPrev::default(),
        }
    }

    /// Cleared by `initWorld`, exactly where the JS clears its module-level detector state.
    pub fn reset(&mut self) {
        self.rec.iter_mut().for_each(|v| *v = 0.0);
        self.head = 0;
        self.count = 0;
        self.sys_events.clear();
        self.det = Det::new();
        self.mv.ok.iter_mut().for_each(|v| *v = 0);
        self.mv.tick = -1;
        self.prev = RecPrev::default();
    }

    #[inline]
    fn b(&self, r: usize, k: usize) -> f64 {
        self.rec[r + k] as f64
    }
    #[inline]
    fn set(&mut self, r: usize, k: usize, v: f64) {
        self.rec[r + k] = v as f32;
    }
    #[inline]
    fn row(&self, back: usize) -> usize {
        ((self.head + REC_N - back) % REC_N) * REC_CH
    }

    fn push_event(&mut self, tick: i64, kind: &'static str, sp: i32, text: String, locus: Option<usize>) {
        self.sys_events.push(SysEvent { tick, kind, sp, locus, text });
        if self.sys_events.len() > 200 {
            self.sys_events.remove(0);
        }
    }

    /// 7.L patch statistics: nearest sun by toroidal distance (the phototaxis rule), locus mean per
    /// patch. `spread` = max - min over patches holding >= PATCH_MIN (exactly 0 with one sun).
    fn patch_means(&self, w: &World, sp: usize, plane: usize) -> (f64, i32, i32) {
        let off = plane * MAXN;
        let k = w.sources.len();
        let mut n = vec![0.0f64; k];
        let mut m = vec![0.0f64; k];
        for i in 0..w.n_slots() {
            if w.alive[i] == 0 || w.sp[i] as usize != sp {
                continue;
            }
            let mut best = 0usize;
            let mut bd = f64::INFINITY;
            for (kk, s) in w.sources.iter().enumerate() {
                let dx = wd(s.x - w.x[i] as f64);
                let dy = wd(s.y - w.y[i] as f64);
                let d = dx * dx + dy * dy;
                if d < bd {
                    bd = d;
                    best = kk;
                }
            }
            n[best] += 1.0;
            m[best] += w.g[off + i] as f64;
        }
        let (mut hi, mut lo): (i32, i32) = (-1, -1);
        for kk in 0..k {
            if n[kk] < PATCH_MIN {
                continue;
            }
            m[kk] /= n[kk];
            if hi < 0 || m[kk] > m[hi as usize] {
                hi = kk as i32;
            }
            if lo < 0 || m[kk] < m[lo as usize] {
                lo = kk as i32;
            }
        }
        let spread = if hi >= 0 && lo >= 0 { m[hi as usize] - m[lo as usize] } else { 0.0 };
        (spread, hi, lo)
    }

    /// One sample. Called from `step()` every `REC_STRIDE` ticks, after the tick counter advances.
    pub fn record(&mut self, w: &World, p: &Params, tr: &[Species], reg: &Registry) {
        let r = self.head * REC_CH;
        let mut awake = [0.0f64; 7];
        for k in 0..REC_CH {
            self.rec[r + k] = 0.0;
        }
        for i in 0..w.n_slots() {
            if w.alive[i] == 0 {
                continue;
            }
            let sp = w.sp[i] as usize;
            self.rec[r + sp] += 1.0;
            self.set(r, 7 + sp, self.b(r, 7 + sp) + w.en[i] as f64);
            self.set(r, 26 + sp, self.b(r, 26 + sp) + w.sz[i] as f64);
            if w.cy[i] == 0 {
                awake[sp] += 1.0;
            }
        }
        for sp in 0..7 {
            if self.b(r, sp) > 0.0 {
                self.set(r, 26 + sp, self.b(r, 26 + sp) / self.b(r, sp));
            }
        }
        // locus mean + sd per (species, plane), awake and dormant alike (the genome does not sleep)
        for sp in 0..7 {
            let loci = &tr[sp].loci;
            if loci.is_empty() || self.b(r, sp) == 0.0 {
                continue;
            }
            for k in 0..loci.len().min(LOCUS_CH.len()) {
                let off = k * MAXN;
                let (mut m, mut m2) = (0.0f64, 0.0f64);
                for i in 0..w.n_slots() {
                    if w.alive[i] != 0 && w.sp[i] as usize == sp {
                        let g = w.g[off + i] as f64;
                        m += g;
                        m2 += g * g;
                    }
                }
                let n = self.b(r, sp);
                let mean = m / n;
                let varr = crate::jsnum::jmax(0.0, m2 / n - mean * mean);
                self.set(r, LOCUS_CH[k][0] + sp, mean);
                self.set(r, LOCUS_CH[k][1] + sp, math::sqrt(varr));
            }
        }
        // 7.H: mean warmth experienced per species and warm-core population; exactly 0 unwarmed
        {
            let (mut st, mut sn, mut wc) = ([0.0f64; 7], [0.0f64; 7], [0.0f64; 7]);
            for i in 0..w.n_slots() {
                if w.alive[i] == 0 {
                    continue;
                }
                let tv = w.temp[cell_at(w.x[i] as f64, w.y[i] as f64)] as f64;
                let sp = w.sp[i] as usize;
                st[sp] += tv;
                sn[sp] += 1.0;
                if tv > 3.0 {
                    wc[sp] += 1.0;
                }
            }
            for sp in 0..7 {
                self.set(r, 58 + sp, if sn[sp] != 0.0 { st[sp] / sn[sp] } else { 0.0 });
                self.set(r, 66 + sp, wc[sp]);
            }
        }
        let multi = w.sources.len() > 1;
        let mat = reg.mat as usize;
        let prey = reg.prey;
        let v56 = if multi && !tr[mat].loci.is_empty() { self.patch_means(w, mat, 0).0 } else { 0.0 };
        let v57 = if multi && !tr[prey].loci.is_empty() { self.patch_means(w, prey, 0).0 } else { 0.0 };
        self.set(r, 56, v56);
        self.set(r, 57, v57);

        let (mut f_m, mut d_m, mut w_cells, mut w_det, mut a_det) = (0.0f64, 0.0, 0.0, 0.0, 0.0);
        for c in 0..NCELL {
            f_m += w.m[c] as f64;
            d_m += w.d_m[c] as f64;
            let dc = w.d_e[c] as f64 + w.d_p[c] as f64 + w.d_m[c] as f64;
            if w.temp[c] as f64 > 3.0 {
                w_cells += 1.0;
                w_det += dc;
            } else {
                a_det += dc;
            }
        }
        {
            let cells = NCELL as f64;
            self.set(r, 65, w_cells);
            self.set(r, 73, if w_cells != 0.0 { w_det / w_cells } else { 0.0 });
            self.set(r, 74, if w_cells != 0.0 && cells - w_cells != 0.0 { a_det / (cells - w_cells) } else { 0.0 });
        }

        // MV.0 movement observatory (117-140), by SPECIES.MOBILE row order
        {
            let mb = &reg.mobile;
            let n_m = mb.len();
            let mut m_idx = [-1i32; 7];
            for (m, sp) in mb.iter().enumerate() {
                m_idx[*sp] = m as i32;
            }
            let mut la = vec![0.0f64; n_m];
            let mut ln = vec![0.0f64; n_m];
            let mut ta = vec![0.0f64; n_m];
            let mut tn = vec![0.0f64; n_m];
            let mut ds = vec![0.0f64; n_m];
            let mut dn = vec![0.0f64; n_m];
            let mut we = vec![0.0f64; n_m];
            let mut wc2 = vec![0.0f64; n_m];
            let mut ae = vec![0.0f64; n_m];
            let mut an = vec![0.0f64; n_m];
            let mut occ = vec![0.0f64; n_m * 64];
            let ocell = WORLD / 8.0;
            for i in 0..w.n_slots() {
                if w.alive[i] == 0 {
                    continue;
                }
                let m = m_idx[w.sp[i] as usize];
                if m < 0 {
                    continue;
                }
                let m = m as usize;
                let c = cell_at(w.x[i] as f64, w.y[i] as f64);
                let drift = tr[w.sp[i] as usize].movement == Movement::Drift;
                let (mx, my) = if drift {
                    (w.vx[i] as f64, w.vy[i] as f64)
                } else {
                    (math::cos(w.hd[i] as f64), math::sin(w.hd[i] as f64))
                };
                let mm = math::hypot(mx, my);
                if mm > 1e-6 {
                    let lgm = math::hypot(w.lgx[c] as f64, w.lgy[c] as f64);
                    if lgm > 0.0 {
                        la[m] += (mx * w.lgx[c] as f64 + my * w.lgy[c] as f64) / (mm * lgm);
                        ln[m] += 1.0;
                    }
                    let tgm = math::hypot(w.tgx[c] as f64, w.tgy[c] as f64);
                    if tgm > 0.0 {
                        ta[m] += (mx * w.tgx[c] as f64 + my * w.tgy[c] as f64) / (mm * tgm);
                        tn[m] += 1.0;
                    }
                }
                if self.mv.tick >= 0 && self.mv.ok[i] != 0 && (w.birth[i] as i64) < self.mv.tick {
                    ds[m] += math::hypot(
                        wd(w.x[i] as f64 - self.mv.px[i] as f64),
                        wd(w.y[i] as f64 - self.mv.py[i] as f64),
                    );
                    dn[m] += 1.0;
                }
                let res = w.en[i] as f64 / (p.cap_mul * w.sz[i] as f64);
                if w.temp[c] as f64 > 3.0 {
                    we[m] += res;
                    wc2[m] += 1.0;
                } else {
                    ae[m] += res;
                    an[m] += 1.0;
                }
                let oy = (crate::jsnum::to_int32((w.y[i] as f64 / ocell).floor()) & 7) as usize;
                let ox = (crate::jsnum::to_int32((w.x[i] as f64 / ocell).floor()) & 7) as usize;
                occ[m * 64 + oy * 8 + ox] += 1.0;
            }
            for m in 0..n_m {
                self.set(r, 117 + m, if ln[m] != 0.0 { la[m] / ln[m] } else { 0.0 });
                self.set(r, 121 + m, if tn[m] != 0.0 { ta[m] / tn[m] } else { 0.0 });
                self.set(r, 125 + m, if dn[m] != 0.0 {
                    ds[m] / (dn[m] * (w.tick - self.mv.tick) as f64)
                } else { 0.0 });
                let mut h = 0.0f64;
                let mut tot = 0.0f64;
                for b in 0..64 {
                    tot += occ[m * 64 + b];
                }
                if tot > 0.0 {
                    for b in 0..64 {
                        let pp = occ[m * 64 + b] / tot;
                        if pp > 0.0 {
                            h -= pp * pp.ln();
                        }
                    }
                }
                self.set(r, 129 + m, if tot > 0.0 { h / 64f64.ln() } else { 0.0 });
                self.set(r, 133 + m, if wc2[m] != 0.0 { we[m] / wc2[m] } else { 0.0 });
                self.set(r, 137 + m, if an[m] != 0.0 { ae[m] / an[m] } else { 0.0 });
            }
            self.mv.px.copy_from_slice(&w.x);
            self.mv.py.copy_from_slice(&w.y);
            self.mv.ok.copy_from_slice(&w.alive);
            self.mv.tick = w.tick;
        }

        let mut b_m = 0.0f64;
        for i in 0..w.n_slots() {
            if w.alive[i] != 0 {
                b_m += w.mn[i] as f64;
            }
        }
        let (mut c_m, mut c_n2) = (0.0f64, 0.0f64);
        for k in 0..w.c_n {
            if w.c_alive[k] != 0 {
                c_m += w.c_m[k] as f64;
                c_n2 += 1.0;
            }
        }
        self.set(r, 14, f_m);
        self.set(r, 15, b_m);
        self.set(r, 16, c_m);
        self.set(r, 17, d_m);
        self.set(r, 25, c_n2);
        let f = &w.flows;
        self.set(r, 18, f.uptake - self.prev.uptake);
        self.prev.uptake = f.uptake;
        self.set(r, 19, f.gpp - self.prev.gpp);
        self.prev.gpp = f.gpp;
        self.set(r, 20, f.resp - self.prev.resp);
        self.prev.resp = f.resp;
        self.set(r, 21, f.bac_release - self.prev.bac_release);
        self.prev.bac_release = f.bac_release;
        self.set(r, 22, f.corpse_to_det - self.prev.corpse_to_det);
        self.prev.corpse_to_det = f.corpse_to_det;
        self.set(r, 23, f.egest_e - self.prev.egest_e);
        self.prev.egest_e = f.egest_e;
        self.set(r, 24, f.deaths - self.prev.deaths);
        self.prev.deaths = f.deaths;
        self.set(r, 33, w.sources[0].x);
        self.set(r, 34, w.sources[0].y);
        for sp in 0..7 {
            self.set(r, 35 + sp, f.deaths_by[sp] - self.prev.deaths_by[sp]);
            self.prev.deaths_by[sp] = f.deaths_by[sp];
        }

        self.detect(r, &awake, w, p, tr, reg);
        self.head = (self.head + 1) % REC_N;
        if self.count < REC_N {
            self.count += 1;
        }
    }

    fn detect(&mut self, r: usize, awake: &[f64; 7], w: &World, p: &Params, tr: &[Species], reg: &Registry) {
        self.detect_ecology(r, awake, w, tr);
        self.detect_heredity(r, w, p, tr);
        self.detect_chemistry(r, w);
        self.detect_heat(r, w, p, tr, reg);
        self.detect_move(r, w, p, tr, reg);
    }

    /// establishment, wake, extinction, blooms and crashes per species
    fn detect_ecology(&mut self, r: usize, awake: &[f64; 7], w: &World, tr: &[Species]) {
        let win_sec = (10 * REC_STRIDE) / 10; // the 10-sample window in seconds at 1x speed
        let have_prev = self.count >= 1;
        let have10 = self.count >= 10;
        let r_prev = self.row(1);
        let r10 = self.row(10);
        for sp in 0..7 {
            let name = tr[sp].name;
            let apex = tr[sp].apex;
            let now = if apex { awake[sp] } else { self.b(r, sp) };
            // establishment (sustained)
            if self.det.estab[sp] == 0 {
                self.det.run[sp] = if now >= DET_ESTAB[sp] { self.det.run[sp] + 1 } else { 0 };
                if self.det.run[sp] >= 5 {
                    self.det.estab[sp] = 1;
                    let n = crate::jsnum::to_int32(now);
                    let text = if apex {
                        format!("{} established — {} hunters.", name, n)
                    } else {
                        format!("{} established — {} strong.", name, n)
                    };
                    self.push_event(w.tick, "estab", sp as i32, text, None);
                }
            }
            // predator wake (first hunter out of its cyst)
            if apex && !self.det.pack_awake && awake[sp] >= 1.0 {
                self.det.pack_awake = true;
                self.push_event(w.tick, "wake", sp as i32, format!("The pack wakes — {} is hunting.", name), None);
            }
            // extinction (any presence to zero, on the full count incl. dormant)
            if have_prev && self.b(r_prev, sp) > 0.0 && self.b(r, sp) == 0.0 {
                self.push_event(w.tick, "extinct", sp as i32, format!("{} has died out.", name), None);
            }
            // bloom onset / crash over a 10-sample window
            if have10 && !apex {
                let ago = self.b(r10, sp);
                let growth = self.b(r, sp) / crate::jsnum::jmax(1.0, ago);
                if self.det.bloom[sp] == 0 && growth >= 1.8 && self.b(r, sp) >= 50.0 {
                    self.det.bloom[sp] = 1;
                    self.push_event(w.tick, "bloom", sp as i32,
                        format!("{} bloom under way — up {}x in {} s.", name, to_fixed(growth, 1), win_sec), None);
                } else if self.det.bloom[sp] == 1 && growth < 1.1 {
                    self.det.bloom[sp] = 0;
                }
                if self.det.crash[sp] == 0 && growth <= 0.55 && ago >= 50.0 {
                    self.det.crash[sp] = 1;
                    self.push_event(w.tick, "crashev", sp as i32,
                        format!("{} crashing — down {}% in {} s.", name, js_round((1.0 - growth) * 100.0) as i64, win_sec), None);
                } else if self.det.crash[sp] == 1 && growth > 0.9 {
                    self.det.crash[sp] = 0;
                }
            }
        }
    }

    /// sweeps, diversifying, rail contact, local adaptation, diversity collapse
    fn detect_heredity(&mut self, r: usize, w: &World, p: &Params, tr: &[Species]) {
        // A warmth-gated locus is unexpressed in an unwarmed world: its variation is pure drift, and
        // narrating drift as selection would be a lie. Selection stories wait for warmth; rail
        // contact is a corridor concern and is always reported.
        let warm_world = p.temp_amb > 0.0 || w.sources.iter().any(|s| s.a > 0.0);
        for sp in 0..7 {
            let n_loci = tr[sp].loci.len();
            if n_loci == 0 || self.b(r, sp) < 50.0 {
                continue;
            }
            for k_l in 0..n_loci.min(LOCUS_CH.len()) {
                let l = tr[sp].loci[k_l];
                let di = sp * 4 + k_l;
                let off = k_l * MAXN;
                let gated = l.warm_gated && !warm_world;
                let mean = self.b(r, LOCUS_CH[k_l][0] + sp);
                let sd = self.b(r, LOCUS_CH[k_l][1] + sp);
                let name = tr[sp].name;
                let (mut hi, mut lo, mut n, mut rail_hi, mut rail_lo) = (0.0f64, 0.0, 0.0, 0.0, 0.0);
                for i in 0..w.n_slots() {
                    if w.alive[i] != 0 && w.sp[i] as usize == sp {
                        n += 1.0;
                        let g = w.g[off + i] as f64;
                        if g > l.g0 + 0.05 { hi += 1.0; } else if g < l.g0 - 0.05 { lo += 1.0; }
                        if g > 0.98 { rail_hi += 1.0; } else if g < 0.02 { rail_lo += 1.0; }
                    }
                }
                let share_hi = hi / n;
                let share_lo = lo / n;
                // rail contact (6.2): a third of the population pinned at a corridor edge for 10
                // samples — the trait has run out of room
                let rail_share = crate::jsnum::jmax(rail_hi, rail_lo) / n;
                let rail_dir = if rail_hi >= rail_lo { 1 } else { -1 };
                self.det.rail_run[di] = if rail_share >= 0.30 { self.det.rail_run[di] + 1 } else { 0 };
                if self.det.rail[di] == 0 && self.det.rail_run[di] >= 10 {
                    self.det.rail[di] = rail_dir;
                    let word = if rail_dir > 0 { l.hi_word } else { l.lo_word };
                    self.push_event(w.tick, "rail", sp as i32,
                        format!("{} has reached the limit of its {} — {}% at the {} edge.",
                            name, l.label.to_lowercase(), js_round(rail_share * 100.0) as i64, word), Some(k_l));
                } else if self.det.rail[di] != 0 && rail_share < 0.15 {
                    self.det.rail[di] = 0;
                }
                let dir = if gated {
                    0
                } else if mean - l.g0 >= 0.10 && share_hi >= 0.6 {
                    1
                } else if l.g0 - mean >= 0.10 && share_lo >= 0.6 {
                    -1
                } else {
                    0
                };
                let share = if dir > 0 { share_hi } else { share_lo };
                let word = if dir > 0 { l.hi_word } else { l.lo_word };
                if gated {
                    self.det.sweep[di] = 0;
                }
                if self.det.sweep[di] == 0 && dir != 0 {
                    self.det.sweep[di] = dir;
                    self.push_event(w.tick, "sweep", sp as i32,
                        format!("A {} {} line is taking over — {}% of the population and rising.",
                            word, name, js_round(share * 100.0) as i64), Some(k_l));
                } else if self.det.sweep[di].abs() == 1 && dir == self.det.sweep[di] && share >= 0.85 {
                    self.det.sweep[di] *= 2;
                    self.push_event(w.tick, "sweep", sp as i32,
                        format!("The {} {} line has taken over — {}% of the population.",
                            word, name, js_round(share * 100.0) as i64), Some(k_l));
                } else if self.det.sweep[di] != 0 && crate::jsnum::jmax(share_hi, share_lo) < 0.45 {
                    self.det.sweep[di] = 0;
                }
                // diversifying: standing variation with no line winning
                if !gated && self.det.sweep[di] == 0 && sd >= 0.10 && (mean - l.g0).abs() < 0.15
                    && share_hi >= 0.2 && share_lo >= 0.2 {
                    self.det.diverse_run[di] += 1;
                } else {
                    self.det.diverse_run[di] = 0;
                }
                if self.det.diverse[di] == 0 && self.det.diverse_run[di] >= 10 {
                    self.det.diverse[di] = 1;
                    self.push_event(w.tick, "diverse", sp as i32,
                        format!("{} is diversifying — {} and {} lines coexist, neither winning.",
                            name, l.hi_word, l.lo_word), Some(k_l));
                } else if self.det.diverse[di] != 0 && (sd < 0.06 || self.det.sweep[di] != 0) {
                    self.det.diverse[di] = 0;
                }
                // local adaptation (7.L)
                if w.sources.len() > 1 && !gated {
                    let (spread, p_hi, p_lo) = self.patch_means(w, sp, k_l);
                    self.det.adapt_run[di] = if spread >= 0.10 { self.det.adapt_run[di] + 1 } else { 0 };
                    if self.det.adapt[di] == 0 && self.det.adapt_run[di] >= 10 {
                        self.det.adapt[di] = 1;
                        self.push_event(w.tick, "adapt", sp as i32,
                            format!("{} differs by patch — {} near sun {}, {} near sun {}.",
                                name, l.hi_word, p_hi + 1, l.lo_word, p_lo + 1), Some(k_l));
                    } else if self.det.adapt[di] != 0 && spread < 0.05 {
                        self.det.adapt[di] = 0;
                    }
                } else {
                    self.det.adapt[di] = 0;
                    self.det.adapt_run[di] = 0;
                }
                // diversity collapse: variation falls to well under half of 270 samples ago
                if self.count >= 271 && !gated {
                    let sd_ago = self.b(self.row(270), LOCUS_CH[k_l][1] + sp);
                    if self.det.uniform[di] == 0 && sd_ago >= 0.06 && sd <= 0.4 * sd_ago {
                        self.det.uniform[di] = 1;
                        let text = if k_l == 0 {
                            format!("Variation collapsing in {} — the population is becoming uniform.", name)
                        } else {
                            format!("Variation collapsing in {}'s {} — the trait is becoming uniform.",
                                name, l.label.to_lowercase())
                        };
                        self.push_event(w.tick, "uniform", sp as i32, text, Some(k_l));
                    } else if self.det.uniform[di] != 0 && sd > 0.7 * sd_ago {
                        self.det.uniform[di] = 0;
                    }
                }
            }
        }
    }

    /// mineral depletion trend and lock-up level — the K6 detectors
    fn detect_chemistry(&mut self, r: usize, w: &World) {
        let total = self.b(r, 14) + self.b(r, 15) + self.b(r, 16) + self.b(r, 17);
        let locked_frac = (self.b(r, 16) + self.b(r, 17)) / crate::jsnum::jmax(1.0, total);
        // Depletion is a trend, not a level (healthy worlds DIP to 17% and recover; the dying world
        // never once turns). The true death axis is the locked share's trend.
        if self.count >= 271 {
            let r270 = self.row(270);
            let tot270 = self.b(r270, 14) + self.b(r270, 15) + self.b(r270, 16) + self.b(r270, 17);
            let locked_ago = (self.b(r270, 16) + self.b(r270, 17)) / crate::jsnum::jmax(1.0, tot270);
            let lock_gain = locked_frac - locked_ago;
            // founding-edge guard: require the locked LEVEL to already be abnormal
            if !self.det.depleted && lock_gain >= 0.08 && locked_frac >= 0.15 {
                self.det.depleted = true;
                self.push_event(w.tick, "depleted", -1,
                    "Mineral is flowing into dead matter faster than it returns.".to_string(), None);
            } else if self.det.depleted && lock_gain < 0.02 {
                self.det.depleted = false;
            }
        }
        if !self.det.locked_warn && locked_frac > 0.35 {
            self.det.locked_warn = true;
            self.push_event(w.tick, "locked", -1,
                "Over a third of the world's mineral is locked in dead matter.".to_string(), None);
        } else if self.det.locked_warn && locked_frac < 0.28 {
            self.det.locked_warn = false;
        }
    }

    /// the warm-water narrations (7.H.4) — all read channels that are exactly 0 without a warm source
    fn detect_heat(&mut self, r: usize, w: &World, p: &Params, tr: &[Species], reg: &Registry) {
        let w_n = self.b(r, 65);
        let cells = NCELL as f64;
        // retreat: a species' warm-core count halves against 50 samples ago
        if self.count >= 51 && w_n >= 20.0 {
            let r50 = self.row(50);
            for sp in 0..7 {
                let ago = self.b(r50, 66 + sp);
                let now = self.b(r, 66 + sp);
                if self.det.heat_retreat[sp] == 0 && ago >= 30.0 && now <= 0.5 * ago {
                    self.det.heat_retreat[sp] = 1;
                    self.push_event(w.tick, "heatRetreat", sp as i32,
                        format!("{} is thinning out of the warm water — down {}% where it is warm.",
                            tr[sp].name, js_round((1.0 - now / crate::jsnum::jmax(1.0, ago)) * 100.0) as i64), None);
                } else if self.det.heat_retreat[sp] != 0 && now >= 0.8 * crate::jsnum::jmax(1.0, ago) {
                    self.det.heat_retreat[sp] = 0;
                }
            }
        } else if w_n < 20.0 {
            self.det.heat_retreat = [0; 7];
        }
        // pile-up: dead matter accumulating in the warm core faster than decomposition eats it
        let warm_d = self.b(r, 73);
        let amb_d = self.b(r, 74);
        self.det.heat_pile_run = if w_n >= 20.0 && cells - w_n >= 100.0 && warm_d >= 4.0
            && warm_d >= 2.0 * crate::jsnum::jmax(0.2, amb_d) {
            self.det.heat_pile_run + 1
        } else {
            0
        };
        if !self.det.heat_pile && self.det.heat_pile_run >= 10 {
            self.det.heat_pile = true;
            self.push_event(w.tick, "heatPile", -1,
                format!("Dead matter is piling up in the warm water — {} per cell against {} outside.",
                    to_fixed(warm_d, 1), to_fixed(amb_d, 1)), None);
        } else if self.det.heat_pile && (w_n < 20.0 || warm_d < 2.0) {
            self.det.heat_pile = false;
        }
        // apex starving in the heat
        let apx = reg.apex;
        if apx >= 0 {
            let apx = apx as usize;
            let felt = self.b(r, 58 + apx);
            self.det.heat_starve_run = if felt >= 3.0 && self.b(r, apx) > 0.0 {
                self.det.heat_starve_run + 1
            } else {
                0
            };
            if !self.det.heat_starve && self.det.heat_starve_run >= 10 && self.count >= 26 {
                let r25 = self.row(25);
                if self.b(r, apx) < self.b(r25, apx) {
                    self.det.heat_starve = true;
                    self.push_event(w.tick, "heatStarve", apx as i32,
                        format!("The pack is starving in the heat — upkeep ×{} against meals that scale flatter.",
                            to_fixed(math::pow(p.q10.resp, felt / 10.0), 1)), None);
                }
            } else if self.det.heat_starve && felt < 2.0 {
                self.det.heat_starve = false;
            }
        }
    }

    /// MV.0 trap detector: a species running its reserve down in warmth it stays in.
    /// Level-based, not contrast-based — the first design died against the +8 measurement, where the
    /// warm region covers the whole inhabited area and no ambient population remains to contrast with.
    fn detect_move(&mut self, r: usize, w: &World, p: &Params, tr: &[Species], reg: &Registry) {
        if self.count < 26 {
            return;
        }
        let r25 = self.row(25);
        for m in 0..reg.mobile.len() {
            let sp = reg.mobile[m];
            if sp as i32 == reg.apex {
                continue;
            }
            let rb = match reference_band(sp) {
                Some(v) => v,
                None => continue,
            };
            let pop = self.b(r, sp);
            let felt = self.b(r, 58 + sp);
            let mean_sz = self.b(r, 26 + sp);
            let reserve = if pop >= 1.0 {
                (self.b(r, 7 + sp) / pop) / (p.cap_mul * if mean_sz != 0.0 { mean_sz } else { 1.0 })
            } else {
                0.0
            };
            let pop_ago = self.b(r25, sp);
            let mean_sz_ago = self.b(r25, 26 + sp);
            let res_ago = if pop_ago >= 1.0 {
                (self.b(r25, 7 + sp) / pop_ago) / (p.cap_mul * if mean_sz_ago != 0.0 { mean_sz_ago } else { 1.0 })
            } else {
                reserve
            };
            let on = pop >= 50.0 && felt >= 3.0 && reserve < rb.res_p10 && reserve < res_ago - 0.02;
            self.det.heat_trap_run[sp] = if on { self.det.heat_trap_run[sp] + 1 } else { 0 };
            if self.det.heat_trap[sp] == 0 && self.det.heat_trap_run[sp] >= 10 {
                self.det.heat_trap[sp] = 1;
                self.push_event(w.tick, "heatTrap", sp as i32,
                    format!("{} is running itself down in the warm water — reserve {}% against a healthy {}%+.",
                        tr[sp].name, js_round(reserve * 100.0) as i64, js_round(rb.res_p10 * 100.0) as i64), None);
            } else if self.det.heat_trap[sp] != 0 && (felt < 2.0 || reserve > rb.res_p10) {
                self.det.heat_trap[sp] = 0;
            }
        }
    }
}

// ---- indicators (Phase 4.2): the health dashboard, computed on demand ----
// Translated from src/observatory/analysis.js. Read-only over the ring buffer.

/// Per-species strain, or `None` where the species has no measured reference band or too little
/// population to judge.
#[derive(Clone, Copy, Debug)]
pub struct Strain {
    pub level: i32,
    pub reserve: f64,
    pub trend: f64,
    pub pop_trend: f64,
    /// EWS advisory overlay, present only past 3 windows. Shipped demoted and clearly
    /// experimental: the calibration verdict was that generic early-warning statistics misfire on
    /// this system, and the mechanistic vitals are the honest headline.
    pub adv: Option<(f64, f64)>,
}

#[derive(Clone, Debug)]
pub struct Indicators {
    pub adaptability: Option<f64>,
    pub variety: f64,
    pub prod_vs_cons: f64,
    pub recycling_min: Option<f64>,
    pub locked_pct: f64,
    pub pyramid: [f64; 4],
    pub strain: [Option<Strain>; 7],
    /// (reserve, preyLossRate) when any apex is alive.
    pub venator: Option<(f64, f64)>,
}

/// `+v.toFixed(n)` — the JS idiom for "round to n decimals and keep it a number".
fn round_to(v: f64, n: u32) -> f64 {
    to_fixed(v, n).parse::<f64>().unwrap_or(v)
}

impl Observatory {
    fn window_stats(&self, sp: usize, back: usize, wn: usize) -> (f64, f64, f64) {
        let mut xs = Vec::with_capacity(wn);
        let mut k = back + wn;
        while k > back {
            xs.push(self.b(self.row(k), sp));
            k -= 1;
        }
        let mean = xs.iter().sum::<f64>() / wn as f64;
        // detrend: subtract the least-squares line
        let n = xs.len();
        let (mut sx, mut sy, mut sxy, mut sxx) = (0.0f64, 0.0, 0.0, 0.0);
        for (i, v) in xs.iter().enumerate() {
            let i = i as f64;
            sx += i;
            sy += v;
            sxy += i * v;
            sxx += i * i;
        }
        let den = n as f64 * sxx - sx * sx;
        let b = (n as f64 * sxy - sx * sy) / if den != 0.0 { den } else { 1.0 };
        let a = (sy - b * sx) / n as f64;
        let res: Vec<f64> = xs.iter().enumerate().map(|(i, v)| v - (a + b * i as f64)).collect();
        let mut num = 0.0f64;
        for i in 0..wn - 1 {
            num += res[i] * res[i + 1];
        }
        let mut den2 = 0.0f64;
        for r in res.iter().take(wn) {
            den2 += r * r;
        }
        (mean, if den2 > 0.0 { num / den2 } else { 0.0 }, den2 / wn as f64)
    }

    fn strain_of(&self, sp: usize, p: &Params) -> Option<Strain> {
        let wn = 60usize;
        if self.count < 2 * wn {
            return None;
        }
        let r0 = self.row(1);
        let r60 = self.row(wn);
        let pop = self.b(r0, sp);
        if pop < 20.0 {
            return None;
        }
        let mean_sz = {
            let v = self.b(r0, 26 + sp);
            if v != 0.0 { v } else { 1.0 }
        };
        let reserve = (self.b(r0, 7 + sp) / pop) / (p.cap_mul * mean_sz);
        let pop_ago = self.b(r60, sp);
        let res_ago = if pop_ago > 0.0 {
            let msz = { let v = self.b(r60, 26 + sp); if v != 0.0 { v } else { 1.0 } };
            (self.b(r60, 7 + sp) / pop_ago) / (p.cap_mul * msz)
        } else {
            reserve
        };
        let res_trend = reserve - res_ago;
        let pop_trend = pop / crate::jsnum::jmax(1.0, pop_ago);
        let rb = reference_band(sp)?;
        let level = if (reserve < rb.res_p03 && res_trend < -0.01) || pop_trend < rb.pop_p03 * 0.9 {
            2
        } else if reserve < rb.res_p10 || pop_trend < rb.pop_p10 {
            1
        } else {
            0
        };
        let adv = if self.count >= 3 * wn {
            let now = self.window_stats(sp, 1, wn);
            let base = self.window_stats(sp, 2 * wn, wn);
            Some((
                round_to(now.1 - base.1, 2),
                round_to(now.2 / if base.2 != 0.0 { base.2 } else { 1.0 }, 2),
            ))
        } else {
            None
        };
        Some(Strain {
            level,
            reserve: round_to(reserve, 2),
            trend: round_to(res_trend, 3),
            pop_trend: round_to(pop_trend, 2),
            adv,
        })
    }

    /// Labels follow the naming rule: functional first, science as subtitle.
    pub fn indicators(&self, p: &Params, tr: &[Species], reg: &Registry) -> Option<Indicators> {
        if self.count < 2 {
            return None;
        }
        let r0 = self.row(1);
        let mut bio = [0.0f64; 7];
        let mut bio_tot = 0.0f64;
        for sp in 0..7 {
            bio[sp] = self.b(r0, 7 + sp);
            bio_tot += bio[sp];
        }
        let mut h = 0.0f64;
        for sp in 0..7 {
            let pp = bio[sp] / if bio_tot != 0.0 { bio_tot } else { 1.0 };
            if pp > 0.0 {
                h -= pp * pp.ln();
            }
        }
        let k = self.count.min(15);
        let (mut g, mut rr, mut up) = (0.0f64, 0.0, 0.0);
        for kk in 1..=k {
            let rk = self.row(kk);
            g += self.b(rk, 19);
            rr += self.b(rk, 20);
            up += self.b(rk, 18);
        }
        let total = self.b(r0, 14) + self.b(r0, 15) + self.b(r0, 16) + self.b(r0, 17);
        let turnover_ticks = if up > 0.0 {
            self.b(r0, 15) / (up / (k as f64 * REC_STRIDE as f64))
        } else {
            f64::INFINITY
        };
        let mut strain: [Option<Strain>; 7] = [None; 7];
        for sp in 0..7 {
            strain[sp] = if tr[sp].apex { None } else { self.strain_of(sp, p) };
        }
        let venator = if self.b(r0, 6) > 0.0 {
            let mean_sz = { let v = self.b(r0, 32); if v != 0.0 { v } else { 9.0 } };
            let cap = p.cap_mul * mean_sz;
            let kl = self.count.min(10);
            let mut loss = 0.0f64;
            for kk in 1..=kl {
                loss += self.b(self.row(kk), 35 + 2);
            }
            Some((
                (self.b(r0, 13) / self.b(r0, 6)) / cap,
                loss / (kl as f64 * REC_STRIDE as f64 / 10.0),
            ))
        } else {
            None
        };
        // adaptability (6.2): mean locus sd over every (species, locus) with >= 20 alive
        let (mut ad_sum, mut ad_n) = (0.0f64, 0.0f64);
        for sp in 0..7 {
            if self.b(r0, sp) >= 20.0 {
                for k in 0..tr[sp].loci.len().min(LOCUS_CH.len()) {
                    ad_sum += self.b(r0, LOCUS_CH[k][1] + sp);
                    ad_n += 1.0;
                }
            }
        }
        let _ = reg;
        Some(Indicators {
            adaptability: if ad_n != 0.0 { Some(round_to(ad_sum / ad_n, 3)) } else { None },
            variety: round_to(h, 2),
            prod_vs_cons: round_to(g / if rr != 0.0 { rr } else { 1.0 }, 2),
            recycling_min: if turnover_ticks.is_infinite() { None } else { Some(round_to(turnover_ticks / 600.0, 1)) },
            locked_pct: round_to(100.0 * (self.b(r0, 16) + self.b(r0, 17)) / if total != 0.0 { total } else { 1.0 }, 0),
            pyramid: [
                round_to((bio[0] + bio[1]) / if bio_tot != 0.0 { bio_tot } else { 1.0 }, 2),
                round_to(bio[2] / if bio_tot != 0.0 { bio_tot } else { 1.0 }, 2),
                round_to(bio[3] / if bio_tot != 0.0 { bio_tot } else { 1.0 }, 2),
                round_to(bio[6] / if bio_tot != 0.0 { bio_tot } else { 1.0 }, 2),
            ],
            strain,
            venator,
        })
    }
}
