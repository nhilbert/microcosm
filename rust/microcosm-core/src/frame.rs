//! The frame builder — the visual GRAMMAR, in the core where both platforms can share it.
//!
//! `src/ui-render.js` carries the reference implementation and `harness/fingerprint-frame.js`
//! compares the two bit for bit, so what follows is a transliteration in the same sense `step.rs`
//! is: expressions in the same order, `Math.round` where JavaScript rounds, `f32` reads widened to
//! `f64` where a typed array is read. The plan is `docs/android-app-plan.md`.
//!
//! What lives here is *decisions*: which sprite bucket an organism lands in, where it projects,
//! what colour a cell of the mat carpet is, how far a sun's glow reaches. What does not live here
//! is *painting*: gradients, blend modes, the sprite bitmaps themselves. Two platforms will not
//! produce identical gradient pixels and nothing depends on their doing so — what must agree is
//! which bucket an organism is in.
//!
//! A pure observer, like the Observatory: zero PRNG draws, no mutation of dynamic state.

use crate::params::{CELL, GRID, MAXN, NCELL, WORLD};
use crate::traits::{Registry, Species};
use crate::world::{cell_of, wd, World};

/// `Math.round` — floor(x + 0.5), which is what JavaScript does and what `f64::round` does not
/// (it rounds half away from zero, so -0.5 differs).
#[inline]
fn js_round(v: f64) -> f64 {
    crate::math::floor(v + 0.5)
}

// ---------------------------------------------------------------------------
// The palette and the per-species sprite constants. These mirror `COL`, `SHAPES` and
// `SPRITE_SCALE` in src/ui-render.js. They are not shared as data because the display list carries
// their consequences — `kind` encodes the shape and `r` encodes the scale — so the frame gate
// catches a disagreement in either exactly as it would catch a mistyped threshold.

/// Species base colours. Rule 7: species colours belong to the world; amber is the player's hand
/// alone and never appears here. Venator identity: glacier blue.
pub const SPECIES_RGB: [[u8; 3]; 7] = [
    [70, 214, 140],  // Solara
    [91, 200, 232],  // Drifta
    [215, 166, 232], // Cilio
    [158, 168, 104], // Bacillus
    [206, 182, 148], // Mycora  (dormant)
    [228, 224, 210], // Necro   (dormant)
    [168, 214, 244], // Venator
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Shape {
    Nucleus,
    Dot,
    Tri,
    Square,
    Ray,
}

pub const SHAPES: [Shape; 7] = [
    Shape::Nucleus,
    Shape::Dot,
    Shape::Tri,
    Shape::Square,
    Shape::Dot,
    Shape::Dot,
    Shape::Ray,
];
pub const SPRITE_SCALE: [f64; 7] = [1.1, 1.9, 2.2, 1.6, 2.2, 2.2, 1.0];

/// Below this zoom: aggregate corpses into the pall layer, draw bacteria as dots.
pub const LOD_Z: f64 = 0.9;
pub const TINT_BINS: usize = 7;
const TINT_HUE: f64 = 52.0;
const TINT_LIGHT: f64 = 0.14;

// ---------------------------------------------------------------------------
// Genotype tint (Phase 5.3): a bounded shift WITHIN the species hue, as a hue rotation plus a
// lightness tilt. A channel nudge disappears under the glow composite; a hue turn survives it.

pub fn rgb_to_hsl(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    let (r, g, b) = (r / 255.0, g / 255.0, b / 255.0);
    let mx = r.max(g).max(b);
    let mn = r.min(g).min(b);
    let l = (mx + mn) / 2.0;
    if mx == mn {
        return (0.0, 0.0, l);
    }
    let d = mx - mn;
    let s = if l > 0.5 { d / (2.0 - mx - mn) } else { d / (mx + mn) };
    let h = if mx == r {
        (g - b) / d + if g < b { 6.0 } else { 0.0 }
    } else if mx == g {
        (b - r) / d + 2.0
    } else {
        (r - g) / d + 4.0
    };
    (h * 60.0, s, l)
}

pub fn hsl_to_rgb(h: f64, s: f64, l: f64) -> [u8; 3] {
    let h = ((h % 360.0) + 360.0) % 360.0;
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
    let m = l - c / 2.0;
    let (r, g, b) = if h < 60.0 {
        (c, x, 0.0)
    } else if h < 120.0 {
        (x, c, 0.0)
    } else if h < 180.0 {
        (0.0, c, x)
    } else if h < 240.0 {
        (0.0, x, c)
    } else if h < 300.0 {
        (x, 0.0, c)
    } else {
        (c, 0.0, x)
    };
    [
        js_round((r + m) * 255.0) as u8,
        js_round((g + m) * 255.0) as u8,
        js_round((b + m) * 255.0) as u8,
    ]
}

/// `t = 0` (the loWord end) leans paler and warmer, `t = 1` deeper and cooler; the midpoint is the
/// species colour exactly, so a silent genome renders precisely as it did before heredity shipped.
pub fn tint_rgb(rgb: [u8; 3], t: f64) -> [u8; 3] {
    let k = (t - 0.5) * 2.0;
    if k == 0.0 {
        return rgb;
    }
    let (h, s, l) = rgb_to_hsl(rgb[0] as f64, rgb[1] as f64, rgb[2] as f64);
    hsl_to_rgb(
        h - TINT_HUE * k,
        (s + 0.10 * k.abs()).min(1.0),
        (l - TINT_LIGHT * k).min(0.85).max(0.15),
    )
}

// ---------------------------------------------------------------------------
// The sprite bucket table (owner decision, 2026-08-30):
//   tint      <- the species' temperature locus (warmSlope/warmGainSlope), warm-adapted leaning WARM
//   outline   <- the defense locus (escSlope): tougher wears a ring
//   roundness <- feeding/metabolic axes (catchSlope/rateSlope/effSlope): thrifty rounds, keen sharp
// Movement-strategy loci carry NO body channel (decision D7) — their display is behaviour itself.

#[derive(Clone, Copy, Debug)]
pub struct Grammar {
    pub tint_plane: i32,
    pub morph_plane: i32,
    pub outline_plane: i32,
    pub round_plane: i32,
    pub t_n: usize,
    pub m_n: usize,
}

pub fn grammar(tr: &[Species]) -> Vec<Option<Grammar>> {
    tr.iter()
        .enumerate()
        .map(|(sp, t)| {
            if t.loci.is_empty() || SHAPES[sp] == Shape::Ray || SHAPES[sp] == Shape::Nucleus {
                return None;
            }
            let find = |f: &dyn Fn(&crate::traits::Locus) -> bool| -> i32 {
                t.loci.iter().position(|l| f(l)).map_or(-1, |k| k as i32)
            };
            let tint_plane = find(&|l| l.warm_slope != 0.0 || l.warm_gain_slope != 0.0);
            let outline_plane = find(&|l| l.esc_slope > 0.0);
            let round_plane =
                find(&|l| l.catch_slope > 0.0 || l.rate_slope > 0.0 || l.eff_slope > 0.0);
            let morph_plane = if outline_plane >= 0 { outline_plane } else { round_plane };
            if tint_plane < 0 && morph_plane < 0 {
                return None;
            }
            Some(Grammar {
                tint_plane,
                morph_plane,
                outline_plane,
                round_plane,
                t_n: if tint_plane >= 0 { TINT_BINS } else { 1 },
                m_n: if morph_plane >= 0 { TINT_BINS } else { 1 },
            })
        })
        .collect()
}

/// Everything a painter needs to render one bucket's 64×64 sprite. The colour and the two shape
/// dials are decided here so a platform's painter never has to know what a locus is.
#[derive(Clone, Copy, Debug)]
pub struct SpriteSpec {
    pub rgb: [u8; 3],
    pub shape: Shape,
    pub scale: f64,
    /// Defense ring weight, 0 when this species carries no defense locus.
    pub outline: f64,
    /// Silhouette rounding, 0 when this species carries no feeding/metabolic locus.
    pub round: f64,
}

pub fn bucket_spec(g: &[Option<Grammar>], sp: usize, tb: usize, mb: usize) -> SpriteSpec {
    let base = SpriteSpec {
        rgb: SPECIES_RGB[sp],
        shape: SHAPES[sp],
        scale: SPRITE_SCALE[sp],
        outline: 0.0,
        round: 0.0,
    };
    let gr = match g[sp] {
        Some(gr) => gr,
        None => return base,
    };
    let g_m = mb as f64 / (TINT_BINS - 1) as f64;
    SpriteSpec {
        rgb: if gr.tint_plane >= 0 {
            tint_rgb(SPECIES_RGB[sp], 1.0 - tb as f64 / (TINT_BINS - 1) as f64)
        } else {
            SPECIES_RGB[sp]
        },
        outline: if gr.outline_plane >= 0 { g_m } else { 0.0 },
        round: if gr.outline_plane < 0 && gr.round_plane >= 0 { 1.0 - g_m } else { 0.0 },
        ..base
    }
}

// ---------------------------------------------------------------------------
// Per-cell pixel fields: GRID × GRID RGBA. A fully transparent pixel is written as 0,0,0,0 rather
// than left holding whatever it held before — it paints identically and it makes the buffer
// comparable, which is the whole point of having a gate.

pub fn field_mineral(w: &World, d: &mut [u8]) {
    for c in 0..NCELL {
        let o = c * 4;
        let m = (w.m[c] as f64 / 3.2).min(1.0);
        d[o] = 64;
        d[o + 1] = 138;
        d[o + 2] = 205;
        d[o + 3] = js_round(82.0 * m) as u8;
    }
}

/// The mat carpet: denser mats render DARKER and more saturated — thick algae absorb light, and
/// brightness stays reserved. Documented grammar exception: the carpet keeps its plane-0 (light
/// locus) genotype turn, because a per-cell pixel field has no outline or body form to carry it.
pub fn field_carpet(w: &World, tr: &[Species], reg: &Registry, d: &mut [u8]) {
    let mat = reg.mat;
    let mat_locus = mat >= 0 && !tr[mat as usize].loci.is_empty();
    let mut cell_g = vec![0.0f32; NCELL];
    let mut cell_gn = vec![0u16; NCELL];
    if mat_locus {
        for i in 0..w.n_slots() {
            if w.alive[i] != 0 && w.sp[i] as i32 == mat {
                let c = cell_of(w, i);
                cell_g[c] += w.g[i];
                cell_gn[c] += 1;
            }
        }
    }
    for c in 0..NCELL {
        let o = c * 4;
        let dens = (w.b_b[c] as f64 / 200.0).min(1.0);
        if dens <= 0.01 {
            d[o] = 0;
            d[o + 1] = 0;
            d[o + 2] = 0;
            d[o + 3] = 0;
            continue;
        }
        let t = crate::math::sqrt(dens); // fast rise, then saturate
        if mat_locus && cell_gn[c] != 0 {
            // sparse [96,205,150] -> dense [34,123,78], both turned by the cell's mean genotype
            let gm = cell_g[c] as f64 / cell_gn[c] as f64;
            let lo = tint_rgb([96, 205, 150], gm);
            let hi = tint_rgb([34, 123, 78], gm);
            for k in 0..3 {
                d[o + k] = js_round(lo[k] as f64 + (hi[k] as f64 - lo[k] as f64) * t) as u8;
            }
        } else {
            d[o] = js_round(96.0 - 62.0 * t) as u8;
            d[o + 1] = js_round(205.0 - 82.0 * t) as u8;
            d[o + 2] = js_round(150.0 - 72.0 * t) as u8;
        }
        d[o + 3] = js_round(70.0 + 150.0 * t) as u8;
    }
}

/// Zoomed out, husks merge into a grey pall.
pub fn field_corpse_pall(w: &World, d: &mut [u8]) {
    let mut mass = vec![0.0f32; NCELL];
    for k in 0..w.c_n {
        if w.c_alive[k] == 0 {
            continue;
        }
        let cc = ((crate::math::floor(w.c_y[k] as f64 / (WORLD / GRID as f64)) as i64
            & (GRID as i64 - 1)) as usize)
            * GRID
            + (crate::math::floor(w.c_x[k] as f64 / (WORLD / GRID as f64)) as i64
                & (GRID as i64 - 1)) as usize;
        mass[cc] += w.c_e[k] + w.c_p[k] + w.c_m[k];
    }
    for c in 0..NCELL {
        let o = c * 4;
        d[o] = 158;
        d[o + 1] = 168;
        d[o + 2] = 178;
        d[o + 3] = js_round(mass[c] as f64 * 4.0).min(150.0) as u8;
    }
}

/// 7.W: the honest darkening where walls occlude the sources, so the painted glow never claims
/// light the field does not deliver. Fully transparent without walls.
pub fn field_shade(w: &World, d: &mut [u8]) {
    for c in 0..NCELL {
        let o = c * 4;
        d[o] = 6;
        d[o + 1] = 10;
        d[o + 2] = 16;
        d[o + 3] = js_round(175.0 * (1.0 - w.w_shade[c] as f64)) as u8;
    }
}

// ---------------------------------------------------------------------------
// World-tile vector lists, in the 512-unit tile space the layers are painted on. A glow near a
// tile edge must continue on the far side, so each source is emitted at every wrapped offset its
// radius reaches (the field itself wraps in compute_light).

#[derive(Clone, Copy, Debug)]
pub struct Glow {
    pub x: f64,
    pub y: f64,
    pub r: f64,
    /// Sun: intensity, clamped to 1. Heat: magnitude |a|/10, clamped to 1.
    pub a: f64,
    /// Heat only: a warm source glows like an ember, a cold one blue.
    pub warm: bool,
}

const TILE: f64 = 512.0;

fn tiled(w: &World, out: &mut Vec<Glow>, pick: &dyn Fn(&crate::world::Source) -> Option<(f64, f64)>) {
    let k = TILE / WORLD;
    for s in &w.sources {
        let (a, warm) = match pick(s) {
            Some(v) => v,
            None => continue,
        };
        let r = s.sigma * 2.2 * k;
        let (cx, cy) = (s.x * k, s.y * k);
        let mut ox = -TILE;
        while ox <= TILE {
            let mut oy = -TILE;
            while oy <= TILE {
                let (x, y) = (cx + ox, cy + oy);
                if !(x + r < 0.0 || x - r > TILE || y + r < 0.0 || y - r > TILE) {
                    out.push(Glow { x, y, r, a, warm: warm != 0.0 });
                }
                oy += TILE;
            }
            ox += TILE;
        }
    }
}

pub fn sun_glows(w: &World) -> Vec<Glow> {
    let mut out = Vec::new();
    tiled(w, &mut out, &|s| Some((s.i.min(1.0), 0.0)));
    out
}

pub fn heat_glows(w: &World) -> Vec<Glow> {
    let mut out = Vec::new();
    tiled(w, &mut out, &|s| {
        if s.a == 0.0 {
            None
        } else {
            Some(((s.a.abs() / 10.0).min(1.0), if s.a > 0.0 { 1.0 } else { 0.0 }))
        }
    });
    out
}

/// The bright dot at each lit source; and, for heat, the mark a dark source still needs.
#[derive(Clone, Copy, Debug)]
pub struct Mark {
    pub x: f64,
    pub y: f64,
    pub warm: bool,
}

fn marks(w: &World, keep: &dyn Fn(&crate::world::Source) -> bool) -> Vec<Mark> {
    let k = TILE / WORLD;
    let mut out = Vec::new();
    for s in &w.sources {
        if !keep(s) {
            continue;
        }
        let mut ox = -TILE;
        while ox <= TILE {
            let mut oy = -TILE;
            while oy <= TILE {
                out.push(Mark { x: s.x * k + ox, y: s.y * k + oy, warm: s.a > 0.0 });
                oy += TILE;
            }
            ox += TILE;
        }
    }
    out
}

pub fn sun_marks(w: &World) -> Vec<Mark> {
    marks(w, &|s| s.i > 0.0)
}

pub fn heat_marks(w: &World) -> Vec<Mark> {
    marks(w, &|s| s.a != 0.0 && s.i <= 0.0)
}

/// 7.W: crisp slate polylines. Dashed = something may pass (a grille); translucency follows light
/// transmission (glass fades). Never amber — a placed wall belongs to the world.
#[derive(Clone, Debug)]
pub struct WallStroke {
    pub a: f64,
    pub dashed: bool,
    pub pts: Vec<(f64, f64)>,
}

pub fn wall_strokes(w: &World) -> Vec<WallStroke> {
    let k = TILE / WORLD;
    w.walls
        .iter()
        .map(|wl| WallStroke {
            a: 0.92 - 0.62 * wl.lt,
            dashed: wl.pass != 0,
            pts: wl
                .path
                .iter()
                .map(|p| (p.0 as f64 * CELL * k, p.1 as f64 * CELL * k))
                .collect(),
        })
        .collect()
}

// ---------------------------------------------------------------------------
// The display list.

/// The camera and viewport a frame is built for. `alpha` interpolates between the previous tick's
/// positions and this one's, which is why `px`/`py` are maintained by the shell rather than the
/// tick — see `mc_mark_prev`.
#[derive(Clone, Copy, Debug)]
pub struct View {
    pub cam_x: f64,
    pub cam_y: f64,
    pub vw: f64,
    pub vh: f64,
    pub z: f64,
    pub hw: f64,
    pub hh: f64,
    pub alpha: f64,
    pub lod_z: f64,
}

/// Organism record kinds. The painter switches on this and nothing else.
pub const KIND_CYST: f64 = 0.0;
pub const KIND_DOT: f64 = 1.0;
pub const KIND_SPRITE: f64 = 2.0;
pub const KIND_SPRITE_ROT: f64 = 3.0;
pub const KIND_RAY: f64 = 4.0;

pub const ORG_STRIDE: usize = 8;
pub const CORPSE_STRIDE: usize = 6;

/// Preallocated and reused: a frame allocates nothing, exactly like a tick.
pub struct Frame {
    /// kind, sx, sy, r, sp, bucket, hd, flags — `ORG_STRIDE` doubles per instance.
    pub org: Vec<f64>,
    pub org_n: usize,
    /// sx, sy, r, alpha, sp, fresh — `CORPSE_STRIDE` doubles per instance. `sp` and `fresh`
    /// (remaining mass over size — the sim's own decay clock, drained by rot and by Bacillus)
    /// joined in GR.6 (declared frame change 2026-09-02): a fresh husk may wear a ghost of its
    /// species colour and deflate as it decays, so a death reads as a collapse, not a pop.
    pub corpse: Vec<f64>,
    pub corpse_n: usize,
    pub pops: [i32; 7],
    pub mn_bound: f64,
    /// The view the last frame was built for, so a selection can be projected without the shell
    /// having to hand the camera back.
    pub view: View,
    /// Scratch for `pick`.
    pub cand: Vec<(f64, usize)>,
}

impl Default for Frame {
    fn default() -> Self {
        Frame {
            org: vec![0.0; MAXN * ORG_STRIDE],
            org_n: 0,
            corpse: vec![0.0; 1500 * CORPSE_STRIDE],
            corpse_n: 0,
            pops: [0; 7],
            mn_bound: 0.0,
            view: View {
                cam_x: 0.0, cam_y: 0.0, vw: 0.0, vh: 0.0, z: 1.0,
                hw: 0.0, hh: 0.0, alpha: 1.0, lod_z: LOD_Z,
            },
            cand: Vec::new(),
        }
    }
}

/// The display-path spline (GR.5, declared frame change 2026-09-02, both builders in lockstep):
/// a quadratic B-spline through the midpoints of the last two tick segments. Velocity is
/// continuous across tick boundaries — the 10 Hz kinks of a random walk stop reading as jumps —
/// at the price of half a tick of display latency, and the curve never leaves the segment hull.
/// The guard straightens a stale previous segment (a recycled slot, a fresh load, a teleport)
/// back to plain linear. Zero draws, zero mutation: `ppx/ppy` are render scratch fed by
/// `mc_mark_prev` and never read by the tick.
fn ipos(w: &World, i: usize, alpha: f64) -> (f64, f64) {
    let px = w.px[i] as f64;
    let py = w.py[i] as f64;
    let mut d1x = wd(px - w.ppx[i] as f64);
    let mut d1y = wd(py - w.ppy[i] as f64);
    let d2x = wd(w.x[i] as f64 - px);
    let d2y = wd(w.y[i] as f64 - py);
    if d1x.abs().max(d1y.abs()) > 4.0 * d2x.abs().max(d2y.abs()) + 8.0 {
        d1x = d2x;
        d1y = d2y;
    }
    let omt = 1.0 - alpha;
    (
        px - omt * omt * d1x * 0.5 + alpha * alpha * d2x * 0.5,
        py - omt * omt * d1y * 0.5 + alpha * alpha * d2y * 0.5,
    )
}

pub fn frame_of(
    f: &mut Frame,
    w: &World,
    g: &[Option<Grammar>],
    v: &View,
    hidden: &[bool; 10],
) {
    let cull = 40.0;
    f.view = *v;
    f.pops = [0; 7];
    let mut n = 0usize;
    let mut mn_bound = 0.0f64;
    for i in 0..w.n_slots() {
        if w.alive[i] == 0 {
            continue;
        }
        let sp = w.sp[i] as usize;
        f.pops[sp] += 1;
        mn_bound += w.mn[i] as f64;
        if hidden[sp] {
            continue; // hidden from view, still counted
        }
        let (ix, iy) = ipos(w, i, v.alpha);
        let sx = v.hw + wd(ix - v.cam_x) * v.z;
        let sy = v.hh + wd(iy - v.cam_y) * v.z;
        if sx < -cull || sx > v.vw + cull || sy < -cull || sy > v.vh + cull {
            continue;
        }
        let b = n * ORG_STRIDE;
        f.org[b + 1] = sx;
        f.org[b + 2] = sy;
        f.org[b + 4] = sp as f64;
        f.org[b + 5] = -1.0;
        f.org[b + 6] = 0.0;
        f.org[b + 7] = 0.0;
        if w.cy[i] != 0 {
            // dormant cyst: dim ember, no glow
            f.org[b] = KIND_CYST;
            f.org[b + 3] = (w.sz[i] as f64 * 0.5 * v.z).max(1.0);
            n += 1;
            continue;
        }
        if SHAPES[sp] == Shape::Square && v.z < v.lod_z {
            // bacteria dot-LOD: batched rects instead of sprite blits
            f.org[b] = KIND_DOT;
            f.org[b + 3] = 1.1;
            n += 1;
            continue;
        }
        f.org[b + 3] = w.sz[i] as f64 * SPRITE_SCALE[sp] * v.z;
        if let Some(gr) = g[sp] {
            let bin = |plane: i32, nb: usize| -> usize {
                if nb <= 1 {
                    return 0;
                }
                let raw = js_round(w.g[plane as usize * MAXN + i] as f64 * (nb - 1) as f64);
                raw.max(0.0).min((nb - 1) as f64) as usize
            };
            let tb = bin(gr.tint_plane, gr.t_n);
            let mb = bin(gr.morph_plane, gr.m_n);
            f.org[b + 5] = (tb * gr.m_n + mb) as f64;
        }
        f.org[b] = match SHAPES[sp] {
            Shape::Tri => KIND_SPRITE_ROT,
            Shape::Ray => KIND_RAY,
            _ => KIND_SPRITE,
        };
        f.org[b + 6] = w.hd[i] as f64;
        if SHAPES[sp] == Shape::Ray && w.bst[i] > 0 {
            f.org[b + 7] = 1.0;
        }
        n += 1;
    }
    f.org_n = n;
    f.mn_bound = mn_bound;

    // corpses: pale husks when zoomed in; the aggregate pall layer covers zoomed-out
    let mut m = 0usize;
    if v.z >= v.lod_z && !hidden[7] {
        for k in 0..w.c_n {
            if w.c_alive[k] == 0 {
                continue;
            }
            let sx = v.hw + wd(w.c_x[k] as f64 - v.cam_x) * v.z;
            let sy = v.hh + wd(w.c_y[k] as f64 - v.cam_y) * v.z;
            if sx < -cull || sx > v.vw + cull || sy < -cull || sy > v.vh + cull {
                continue;
            }
            let mass = w.c_e[k] as f64 + w.c_p[k] as f64 + w.c_m[k] as f64;
            let b = m * CORPSE_STRIDE;
            f.corpse[b] = sx;
            f.corpse[b + 1] = sy;
            f.corpse[b + 2] = (w.c_sz[k] as f64 * 1.0 * v.z).max(1.5);
            f.corpse[b + 3] = (0.12 + 0.05 * mass / w.c_sz[k] as f64).min(0.55);
            f.corpse[b + 4] = w.c_sp[k] as f64;
            f.corpse[b + 5] = mass / w.c_sz[k] as f64;
            m += 1;
        }
    }
    f.corpse_n = m;
}

// ---------------------------------------------------------------------------
// Selection. Grammar, because the radius and the tie-breaking decide *which* organism a thumb
// lands on, and the two platforms must not disagree about that.

/// Every live organism within `rad` of a world point, nearest first. Raw positions, not the
/// interpolated ones: a tap picks what is there, not what is being drawn on the way there.
/// Ties keep slot order, because both `Array.prototype.sort` and `sort_by` are stable.
pub fn pick(w: &World, wx: f64, wy: f64, rad: f64, out: &mut Vec<(f64, usize)>) {
    out.clear();
    let rr = rad * rad;
    for i in 0..w.n_slots() {
        if w.alive[i] == 0 {
            continue;
        }
        let dx = wd(w.x[i] as f64 - wx);
        let dy = wd(w.y[i] as f64 - wy);
        let d2 = dx * dx + dy * dy;
        if d2 < rr {
            out.push((d2, i));
        }
    }
    out.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
}

/// The tap radius the browser uses: loose for a thumb, tight after the loupe.
pub fn pick_radius(z: f64, tight: bool) -> f64 {
    if tight {
        (10.0 / z).max(7.0)
    } else {
        (24.0 / z).max(14.0)
    }
}

/// The selected organism's ring: interpolated screen position and radius, or `None` once the slot
/// has been recycled — the generation guard is what stops a selection following a dead index.
pub fn sel_screen(w: &World, i: usize, gen: u16, v: &View) -> Option<(f64, f64, f64)> {
    if i >= w.n_slots() || w.alive[i] == 0 || w.gen[i] != gen {
        return None;
    }
    let (ix, iy) = ipos(w, i, v.alpha);
    Some((
        v.hw + wd(ix - v.cam_x) * v.z,
        v.hh + wd(iy - v.cam_y) * v.z,
        (w.sz[i] as f64 * 2.6 * v.z).max(14.0),
    ))
}
