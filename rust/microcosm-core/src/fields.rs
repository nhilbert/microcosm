//! Walls, diffusion, the light and warmth fields, and the spatial hash — `src/sim/fields.js`.
//!
//! Everything here is draw-free and must stay so (RNG-order contract rule 4, and rule 6 for walls).
//! The two diffusion bodies are kept separate exactly as in the JS: every face factor is 1.0
//! without walls and multiplying by 1.0 is an exact identity, so the open body is the walled one
//! with the face loads elided — bit-identical, not merely equivalent.

use crate::jsnum::{jmax, jmin, to_f32, to_int32};
use crate::math;
use crate::params::*;
use crate::traits::{Layer, Species};
use crate::world::{cell_of, wd, wrap, Wall, World};

/// `Math.round` — ties toward +Infinity, unlike Rust's `f64::round` (ties away from zero).
/// `Math.round(-2.5)` is -2 in JavaScript and -3 in Rust; walls are snapped with it.
#[inline]
pub fn js_round(x: f64) -> f64 {
    if !x.is_finite() || x == 0.0 {
        return x;
    }
    if x > 0.0 && x < 0.5 {
        return 0.0;
    }
    if x < 0.0 && x >= -0.5 {
        return -0.0;
    }
    let f = x.floor();
    // The comparison (rather than `floor(x+0.5)`) keeps 0.49999999999999994 rounding to 0.
    if x - f >= 0.5 {
        f + 1.0
    } else {
        f
    }
}

/// Parameters of a `wallAdd` stroke: a start point plus the DRAG VECTOR (not a second endpoint —
/// the minimal-image rule would flip any stroke longer than half the world).
#[derive(Clone, Copy, Debug)]
pub struct WallSpec {
    pub x0: f64,
    pub y0: f64,
    pub dx: f64,
    pub dy: f64,
    pub lt: f64,
    pub ht: f64,
    pub fl: f64,
    pub pass: i32,
}

/// `makeWall(ev)` — snap to grid corners and rasterize a 4-connected staircase of cell-boundary
/// edges by an integer midpoint walk. The walk is part of the contract.
pub fn make_wall(spec: &WallSpec) -> Option<Wall> {
    let g = GRID_I;
    let x0 = wrap(spec.x0);
    let y0 = wrap(spec.y0);
    let kx0 = js_round(x0 / CELL) as i32;
    let ky0 = js_round(y0 / CELL) as i32;
    let cd = |v: f64| js_round(jmax(-WORLD, jmin(WORLD, v)) / CELL) as i32;
    let dkx = cd(spec.dx);
    let dky = cd(spec.dy);
    let ax = dkx.abs();
    let ay = dky.abs();
    if ax + ay == 0 {
        return None; // snapped to a point: no wall
    }
    let sx = if dkx > 0 { 1 } else { -1 };
    let sy = if dky > 0 { 1 } else { -1 };
    let mut faces: Vec<usize> = Vec::new();
    let mut path: Vec<(i32, i32)> = vec![(kx0, ky0)];
    let mut ix = 0i32;
    let mut iy = 0i32;
    while ix != ax || iy != ay {
        // midpoint rule: step the axis whose normalized progress is behind (pure integer)
        let step_x = iy == ay || (ix != ax && (2 * ix + 1) * ay <= (2 * iy + 1) * ax);
        let kx = kx0 + ix * sx;
        let ky = ky0 + iy * sy;
        if step_x {
            let col = if sx > 0 { kx } else { kx - 1 };
            faces.push((g * g + ((ky - 1) & GRID_MASK) * g + (col & GRID_MASK)) as usize);
            ix += 1;
        } else {
            let row = if sy > 0 { ky } else { ky - 1 };
            faces.push(((row & GRID_MASK) * g + ((kx - 1) & GRID_MASK)) as usize);
            iy += 1;
        }
        path.push((kx0 + ix * sx, ky0 + iy * sy));
    }
    let cl = |v: f64| jmax(0.0, jmin(1.0, v));
    Some(Wall {
        x0: wrap(kx0 as f64 * CELL),
        y0: wrap(ky0 as f64 * CELL),
        dx: dkx as f64 * CELL,
        dy: dky as f64 * CELL,
        lt: cl(spec.lt),
        ht: cl(spec.ht),
        fl: cl(spec.fl),
        pass: spec.pass,
        faces,
        path,
    })
}

/// `compileWalls()` — the only writer of the face planes; later walls win on shared faces.
pub fn compile_walls(w: &mut World) {
    let n = NCELL;
    w.wf_pass_v.iter_mut().for_each(|v| *v = -1);
    w.wf_pass_h.iter_mut().for_each(|v| *v = -1);
    for plane in [
        &mut w.wf_lt_v,
        &mut w.wf_lt_h,
        &mut w.wf_ht_v,
        &mut w.wf_ht_h,
        &mut w.wf_fl_v,
        &mut w.wf_fl_h,
    ] {
        plane.iter_mut().for_each(|v| *v = 1.0);
    }
    w.walls_on = !w.walls.is_empty();
    if !w.walls_on {
        w.w_shade.iter_mut().for_each(|v| *v = 1.0);
        return;
    }
    for wl in 0..w.walls.len() {
        let (pass, lt, ht, fl) = {
            let s = &w.walls[wl];
            (s.pass, to_f32(s.lt), to_f32(s.ht), to_f32(s.fl))
        };
        for k in 0..w.walls[wl].faces.len() {
            let f = w.walls[wl].faces[k];
            if f >= n {
                let c = f - n;
                w.wf_pass_h[c] = pass;
                w.wf_lt_h[c] = lt;
                w.wf_ht_h[c] = ht;
                w.wf_fl_h[c] = fl;
            } else {
                w.wf_pass_v[f] = pass;
                w.wf_lt_v[f] = lt;
                w.wf_ht_v[f] = ht;
                w.wf_fl_v[f] = fl;
            }
        }
    }
}

/// A step's x component is dropped when any face it crosses refuses the bodyTag.
pub fn x_pass_blocked(w: &World, tag: i32, x: f64, y: f64, dx: f64) -> bool {
    let g = GRID_I;
    let row = (to_int32((y / CELL).floor()) & GRID_MASK) * g;
    let c0 = to_int32((x / CELL).floor());
    let c1 = to_int32(((x + dx) / CELL).floor());
    if dx > 0.0 {
        let mut cc = c0;
        while cc < c1 {
            if w.wf_pass_v[(row + (cc & GRID_MASK)) as usize] & tag == 0 {
                return true;
            }
            cc += 1;
        }
    } else {
        let mut cc = c0 - 1;
        while cc >= c1 {
            if w.wf_pass_v[(row + (cc & GRID_MASK)) as usize] & tag == 0 {
                return true;
            }
            cc -= 1;
        }
    }
    false
}

pub fn y_pass_blocked(w: &World, tag: i32, x: f64, y: f64, dy: f64) -> bool {
    let g = GRID_I;
    let col = to_int32((x / CELL).floor()) & GRID_MASK;
    let r0 = to_int32((y / CELL).floor());
    let r1 = to_int32(((y + dy) / CELL).floor());
    if dy > 0.0 {
        let mut rr = r0;
        while rr < r1 {
            if w.wf_pass_h[(((rr & GRID_MASK) * g) + col) as usize] & tag == 0 {
                return true;
            }
            rr += 1;
        }
    } else {
        let mut rr = r0 - 1;
        while rr >= r1 {
            if w.wf_pass_h[(((rr & GRID_MASK) * g) + col) as usize] & tag == 0 {
                return true;
            }
            rr -= 1;
        }
    }
    false
}

/// Reachability along the L-path — the same geometry the axis-separated mover walks, so
/// "can target" and "can get there" agree.
#[inline]
pub fn path_blocked(w: &World, tag: i32, x: f64, y: f64, dx: f64, dy: f64) -> bool {
    x_pass_blocked(w, tag, x, y, dx) || y_pass_blocked(w, tag, x + dx, y, dy)
}

/// THE position write for organism motion; draw-free; slides along walls.
#[inline]
pub fn move_org(w: &mut World, tr: &[Species], i: usize, dx: f64, dy: f64) {
    if !w.walls_on {
        w.x[i] = to_f32(wrap(w.x[i] as f64 + dx));
        w.y[i] = to_f32(wrap(w.y[i] as f64 + dy));
        return;
    }
    let tag = tr[w.sp[i] as usize].body_tag;
    if !x_pass_blocked(w, tag, w.x[i] as f64, w.y[i] as f64, dx) {
        w.x[i] = to_f32(wrap(w.x[i] as f64 + dx));
    }
    if !y_pass_blocked(w, tag, w.x[i] as f64, w.y[i] as f64, dy) {
        w.y[i] = to_f32(wrap(w.y[i] as f64 + dy));
    }
}

/// Product of a face-transmission plane over every boundary crossed by the minimal-image segment.
/// A product is order-free, so the two axes walk their crossings independently.
pub fn march_mul(x0: f64, y0: f64, dx: f64, dy: f64, av: &[f32], ah: &[f32]) -> f64 {
    let g = GRID_I;
    let mut m = 1.0f64;
    if dx != 0.0 {
        let s = if dx > 0.0 { 1 } else { -1 };
        let c0 = to_int32((x0 / CELL).floor());
        let c1 = to_int32(((x0 + dx) / CELL).floor());
        let mut cc = c0;
        while cc != c1 {
            let t = ((if s > 0 { cc + 1 } else { cc }) as f64 * CELL - x0) / dx;
            let row = to_int32(((y0 + t * dy) / CELL).floor()) & GRID_MASK;
            let col = if s > 0 { cc } else { cc - 1 } & GRID_MASK;
            m *= av[(row * g + col) as usize] as f64;
            if m == 0.0 {
                return 0.0;
            }
            cc += s;
        }
    }
    if dy != 0.0 {
        let s = if dy > 0.0 { 1 } else { -1 };
        let r0 = to_int32((y0 / CELL).floor());
        let r1 = to_int32(((y0 + dy) / CELL).floor());
        let mut rr = r0;
        while rr != r1 {
            let t = ((if s > 0 { rr + 1 } else { rr }) as f64 * CELL - y0) / dy;
            let col = to_int32(((x0 + t * dx) / CELL).floor()) & GRID_MASK;
            let row = if s > 0 { rr } else { rr - 1 } & GRID_MASK;
            m *= ah[(row * g + col) as usize] as f64;
            if m == 0.0 {
                return 0.0;
            }
            rr += s;
        }
    }
    m
}

pub fn diffuse_m(w: &mut World, p: &Params) {
    if w.walls_on {
        diffuse_m_walled(w, p)
    } else {
        diffuse_m_open(w, p)
    }
}

/// The shared second half of both diffusion bodies: abiotic detritus breakdown.
fn leach(w: &mut World, p: &Params) {
    for c in 0..NCELL {
        let qd = w.q_d[c] as f64;
        let back = w.d_m[c] as f64 * p.d_leach * qd;
        let keep = 1.0 - p.d_leach * qd;
        if back > 0.0 {
            w.m[c] = to_f32(w.m[c] as f64 + back);
            w.flows.leach_m += back;
        }
        w.d_m[c] = to_f32(w.d_m[c] as f64 * keep);
        w.d_e[c] = to_f32(w.d_e[c] as f64 * keep);
        w.d_p[c] = to_f32(w.d_p[c] as f64 * keep);
    }
}

fn diffuse_m_walled(w: &mut World, p: &Params) {
    let g = GRID;
    let k = p.m_diff * 0.25;
    for y in 0..g {
        let yu = ((y + g - 1) % g) * g;
        let yd = ((y + 1) % g) * g;
        let y0 = y * g;
        for x in 0..g {
            let xl = (x + g - 1) % g;
            let xr = (x + 1) % g;
            let c = y0 + x;
            let m = w.m[c] as f64;
            w.m_tmp[c] = to_f32(
                m + k * (w.wf_fl_v[y0 + xl] as f64 * (w.m[y0 + xl] as f64 - m)
                    + w.wf_fl_v[c] as f64 * (w.m[y0 + xr] as f64 - m)
                    + w.wf_fl_h[yu + x] as f64 * (w.m[yu + x] as f64 - m)
                    + w.wf_fl_h[c] as f64 * (w.m[yd + x] as f64 - m)),
            );
        }
    }
    w.m.copy_from_slice(&w.m_tmp);
    leach(w, p);
    let ks = p.scent_diff * 0.25;
    for y in 0..g {
        let yu = ((y + g - 1) % g) * g;
        let yd = ((y + 1) % g) * g;
        let y0 = y * g;
        for x in 0..g {
            let xl = (x + g - 1) % g;
            let xr = (x + 1) % g;
            let c = y0 + x;
            let v = w.sc[c] as f64;
            w.sc_tmp[c] = to_f32(
                (v + ks * (w.wf_fl_v[y0 + xl] as f64 * (w.sc[y0 + xl] as f64 - v)
                    + w.wf_fl_v[c] as f64 * (w.sc[y0 + xr] as f64 - v)
                    + w.wf_fl_h[yu + x] as f64 * (w.sc[yu + x] as f64 - v)
                    + w.wf_fl_h[c] as f64 * (w.sc[yd + x] as f64 - v)))
                    * p.scent_decay,
            );
        }
    }
    w.sc.copy_from_slice(&w.sc_tmp);
    let ka = 0.2 * 0.25;
    for y in 0..g {
        let yu = ((y + g - 1) % g) * g;
        let yd = ((y + 1) % g) * g;
        let y0 = y * g;
        for x in 0..g {
            let xl = (x + g - 1) % g;
            let xr = (x + 1) % g;
            let c = y0 + x;
            let v = w.al[c] as f64;
            w.al_tmp[c] = to_f32(
                (v + ka * (w.wf_fl_v[y0 + xl] as f64 * (w.al[y0 + xl] as f64 - v)
                    + w.wf_fl_v[c] as f64 * (w.al[y0 + xr] as f64 - v)
                    + w.wf_fl_h[yu + x] as f64 * (w.al[yu + x] as f64 - v)
                    + w.wf_fl_h[c] as f64 * (w.al[yd + x] as f64 - v)))
                    * 0.85,
            );
        }
    }
    w.al.copy_from_slice(&w.al_tmp);
}

fn diffuse_m_open(w: &mut World, p: &Params) {
    let g = GRID;
    let k = p.m_diff * 0.25;
    for y in 0..g {
        let yu = ((y + g - 1) % g) * g;
        let yd = ((y + 1) % g) * g;
        let y0 = y * g;
        for x in 0..g {
            let xl = (x + g - 1) % g;
            let xr = (x + 1) % g;
            let c = y0 + x;
            let m = w.m[c] as f64;
            w.m_tmp[c] = to_f32(
                m + k * ((w.m[y0 + xl] as f64 - m)
                    + (w.m[y0 + xr] as f64 - m)
                    + (w.m[yu + x] as f64 - m)
                    + (w.m[yd + x] as f64 - m)),
            );
        }
    }
    w.m.copy_from_slice(&w.m_tmp);
    leach(w, p);
    let ks = p.scent_diff * 0.25;
    for y in 0..g {
        let yu = ((y + g - 1) % g) * g;
        let yd = ((y + 1) % g) * g;
        let y0 = y * g;
        for x in 0..g {
            let xl = (x + g - 1) % g;
            let xr = (x + 1) % g;
            let c = y0 + x;
            let v = w.sc[c] as f64;
            w.sc_tmp[c] = to_f32(
                (v + ks * ((w.sc[y0 + xl] as f64 - v)
                    + (w.sc[y0 + xr] as f64 - v)
                    + (w.sc[yu + x] as f64 - v)
                    + (w.sc[yd + x] as f64 - v)))
                    * p.scent_decay,
            );
        }
    }
    w.sc.copy_from_slice(&w.sc_tmp);
    let ka = 0.2 * 0.25;
    for y in 0..g {
        let yu = ((y + g - 1) % g) * g;
        let yd = ((y + 1) % g) * g;
        let y0 = y * g;
        for x in 0..g {
            let xl = (x + g - 1) % g;
            let xr = (x + 1) % g;
            let c = y0 + x;
            let v = w.al[c] as f64;
            w.al_tmp[c] = to_f32(
                (v + ka * ((w.al[y0 + xl] as f64 - v)
                    + (w.al[y0 + xr] as f64 - v)
                    + (w.al[yu + x] as f64 - v)
                    + (w.al[yd + x] as f64 - v)))
                    * 0.85,
            );
        }
    }
    w.al.copy_from_slice(&w.al_tmp);
}

/// Irradiance adds: the ambient floor plus one toroidal Gaussian per source's light.
pub fn compute_light(w: &mut World, p: &Params) {
    let on = w.walls_on;
    for gy in 0..GRID {
        for gx in 0..GRID {
            let cx = (gx as f64 + 0.5) * CELL;
            let cyy = (gy as f64 + 0.5) * CELL;
            let mut v = p.ambient;
            let mut v0 = p.ambient;
            for k in 0..w.sources.len() {
                let s = w.sources[k];
                let dx = wd(cx - s.x);
                let dy = wd(cyy - s.y);
                let g = s.i * math::exp(-(dx * dx + dy * dy) / (2.0 * s.sigma * s.sigma));
                if on {
                    v0 += g;
                    v += g * march_mul(s.x, s.y, dx, dy, &w.wf_lt_v, &w.wf_lt_h);
                } else {
                    v += g;
                }
            }
            let c = gy * GRID + gx;
            w.light[c] = to_f32(v * p.light_mul);
            if on {
                w.w_shade[c] = to_f32(if v0 > 0.0 { v / v0 } else { 1.0 });
            }
        }
    }
    // the gradient the drifter senses (7.H.3): central differences on the torus
    for gy in 0..GRID_I {
        for gx in 0..GRID_I {
            let c = (gy * GRID_I + gx) as usize;
            w.lgx[c] = to_f32(
                (w.light[(gy * GRID_I + ((gx + 1) & GRID_MASK)) as usize] as f64
                    - w.light[(gy * GRID_I + ((gx - 1 + GRID_I) & GRID_MASK)) as usize] as f64)
                    / (2.0 * CELL),
            );
            w.lgy[c] = to_f32(
                (w.light[(((gy + 1) & GRID_MASK) * GRID_I + gx) as usize] as f64
                    - w.light[(((gy - 1 + GRID_I) & GRID_MASK) * GRID_I + gx) as usize] as f64)
                    / (2.0 * CELL),
            );
        }
    }
}

/// Warmth above ambient (7.H) and the per-cell Q10 tables, every one exactly 1 where temp is 0.
pub fn compute_temp(w: &mut World, p: &Params) {
    let on = w.walls_on;
    for gy in 0..GRID {
        for gx in 0..GRID {
            let cx = (gx as f64 + 0.5) * CELL;
            let cyy = (gy as f64 + 0.5) * CELL;
            let mut v = p.temp_amb;
            for k in 0..w.sources.len() {
                let s = w.sources[k];
                if s.a == 0.0 {
                    continue;
                }
                let dx = wd(cx - s.x);
                let dy = wd(cyy - s.y);
                let mut g = s.a * math::exp(-(dx * dx + dy * dy) / (2.0 * s.sigma * s.sigma));
                if on {
                    g *= march_mul(s.x, s.y, dx, dy, &w.wf_ht_v, &w.wf_ht_h);
                }
                v += g;
            }
            let c = gy * GRID + gx;
            w.temp[c] = to_f32(v);
            let e = v / 10.0; // pow(q, 0) is exactly 1: the certified world's factors stay 1
            w.q_r[c] = to_f32(math::pow(p.q10.resp, e));
            w.q_p[c] = to_f32(math::pow(p.q10.photo, e));
            w.q_d[c] = to_f32(math::pow(p.q10.decomp, e));
            w.q_h[c] = to_f32(math::pow(p.q10.handling, e));
            w.q_s[c] = to_f32(math::pow(p.q10.pursuit, e));
            w.q_a[c] = to_f32(math::pow(p.q10.attack, e));
        }
    }
    for gy in 0..GRID_I {
        for gx in 0..GRID_I {
            let c = (gy * GRID_I + gx) as usize;
            w.tgx[c] = to_f32(
                (w.temp[(gy * GRID_I + ((gx + 1) & GRID_MASK)) as usize] as f64
                    - w.temp[(gy * GRID_I + ((gx - 1 + GRID_I) & GRID_MASK)) as usize] as f64)
                    / (2.0 * CELL),
            );
            w.tgy[c] = to_f32(
                (w.temp[(((gy + 1) & GRID_MASK) * GRID_I + gx) as usize] as f64
                    - w.temp[(((gy - 1 + GRID_I) & GRID_MASK) * GRID_I + gx) as usize] as f64)
                    / (2.0 * CELL),
            );
        }
    }
}

/// `rebuild()` — biomass layers and the spatial hash, rebuilt at the top of every tick.
/// Chains are prepended in ascending slot order, so traversal order is descending; the hunt scan's
/// strict `<` comparison makes that order observable, and it is preserved exactly.
pub fn rebuild(w: &mut World, tr: &[Species]) {
    w.p_b.iter_mut().for_each(|v| *v = 0.0);
    w.b_b.iter_mut().for_each(|v| *v = 0.0);
    w.f_b.iter_mut().for_each(|v| *v = 0.0);
    w.hash_head.iter_mut().for_each(|v| *v = -1);
    w.c_hash_head.iter_mut().for_each(|v| *v = -1);
    for k in 0..w.c_n {
        if w.c_alive[k] == 0 {
            continue;
        }
        let c = crate::world::cell_at(w.c_x[k] as f64, w.c_y[k] as f64);
        w.c_hash_next[k] = w.c_hash_head[c];
        w.c_hash_head[c] = k as i32;
    }
    let lim = w.n_slots();
    for i in 0..lim {
        if w.alive[i] == 0 {
            continue;
        }
        let c = crate::world::cell_at(w.x[i] as f64, w.y[i] as f64);
        w.hash_next[i] = w.hash_head[c];
        w.hash_head[c] = i as i32;
        match tr[w.sp[i] as usize].layer {
            Layer::Plankton => {
                if w.cy[i] == 0 {
                    w.p_b[c] = to_f32(w.p_b[c] as f64 + w.en[i] as f64);
                }
            }
            Layer::Benthic => w.b_b[c] = to_f32(w.b_b[c] as f64 + w.en[i] as f64),
            Layer::Fungal => w.f_b[c] = to_f32(w.f_b[c] as f64 + w.en[i] as f64),
            Layer::None => {}
        }
    }
}

/// `cellLight(i)` — light at an organism, after the shading its layer sees.
pub fn cell_light(w: &World, p: &Params, tr: &[Species], i: usize) -> f64 {
    let c = crate::world::cell_at(w.x[i] as f64, w.y[i] as f64);
    let shade = if tr[w.sp[i] as usize].layer == Layer::Plankton {
        // plankton floats above: shaded only by plankton
        jmin(p.shade_max, w.p_b[c] as f64 / p.div_plank)
    } else {
        // benthos: shaded from above; fungal cover half-counts
        jmin(
            p.shade_max,
            (w.p_b[c] as f64 + w.b_b[c] as f64 + w.f_b[c] as f64 * 0.5) / p.div_benth,
        )
    };
    w.light[c] as f64 * (1.0 - shade)
}

/// The `neighbors()` scan specialised to its one remaining caller: the "prey" cyst wake.
/// Same cell walk, same arithmetic, no early exit — draw-free either way.
pub fn any_prey_near(w: &World, tr: &[Species], i: usize, radius: f64, diet: i32) -> bool {
    let r = (radius / CELL).ceil() as i32;
    let gx = to_int32((w.x[i] as f64 / CELL).floor());
    let gy = to_int32((w.y[i] as f64 / CELL).floor());
    let mut found = false;
    for dy in -r..=r {
        for dx in -r..=r {
            let c = (((gy + dy + GRID_I) % GRID_I) * GRID_I + ((gx + dx + GRID_I) % GRID_I)) as usize;
            let mut j = w.hash_head[c];
            while j >= 0 {
                let ju = j as usize;
                if ju != i && w.alive[ju] != 0 {
                    let ddx = wd(w.x[ju] as f64 - w.x[i] as f64);
                    let ddy = wd(w.y[ju] as f64 - w.y[i] as f64);
                    let d2 = ddx * ddx + ddy * ddy;
                    if d2 <= radius * radius
                        && (diet & tr[w.sp[ju] as usize].body_tag) != 0
                        && w.cy[ju] == 0
                    {
                        found = true;
                    }
                }
                j = w.hash_next[ju];
            }
        }
    }
    found
}

/// Unused helper kept for parity with the JS module surface.
pub fn cell_of_pub(w: &World, i: usize) -> usize {
    cell_of(w, i)
}
