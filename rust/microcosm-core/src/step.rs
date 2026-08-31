//! ============================================================
//! THE RNG-ORDER CONTRACT (carried over verbatim from src/sim/step.js — read before editing)
//!
//! Bit-exact conformance across refactors depends on step() consuming PRNG draws in a FIXED order:
//!   1. Organisms are processed in slot order (0..n-1); never reorder.
//!   2. A branch may draw from the PRNG only if its guarding trait is present and truthy: absent
//!      traits must SHORT-CIRCUIT before any draw. A species without a trait consumes ZERO draws
//!      for it — this is what makes new species additions inert for existing worlds.
//!   3. Never move a draw across a branch boundary, and never add an unconditional draw to a
//!      shared path.
//!   4. Field passes (diffusion, leach, scent) and the corpse pass are draw-free and must remain so.
//!   5. Heredity draws one mutation kick PER LOCUS, in `loci` order, at every division (sigma > 0
//!      and mutation only). Adding, removing or reordering a species' loci is a declared change.
//!   6. Walls draw NOTHING: movement blocking, the hunt filter and the field transmissions are
//!      draw-free and gated on walls_on.
//!
//! In Rust the guards are `&&` chains and `if let` on `Option` fields, which short-circuit exactly
//! as the JS `T.hazard && R() < T.hazard` pattern does. The one thing to watch when editing: an
//! `Option::map`/`unwrap_or` refactor that looks tidier can silently make a draw unconditional.
//! ============================================================

use crate::fields::*;
use crate::jsnum::{jmax, jmin, jmin3, to_f32, to_i16};
use crate::math;
use crate::params::*;
use crate::traits::{Movement, Species, TumbleField, Wake};
use crate::world::*;

const PI: f64 = std::f64::consts::PI;

/// The tick, minus the event drain that precedes it (`Sim::step` calls `drain_events` first, as
/// `step()` does in the JS: events are applied at tick boundaries, before diffusion).
pub fn step_body(w: &mut World, p: &Params, tr: &[Species]) {
    diffuse_m(w, p);
    rebuild(w, tr);

    // `for (let i=0; i<W.n; i++)` re-reads W.n every iteration, and spawn() grows it — so a child
    // born this tick IS processed this tick, in the slot it landed in. Hoisting the bound (the
    // obvious Rust translation) leaves every newborn unstepped: the parents stay bit-identical
    // while the children silently differ. The counter advances before the body so that every
    // `continue` below is safe.
    let mut next = 0usize;
    while next < w.n_slots() {
        let i = next;
        next += 1;
        if w.alive[i] == 0 {
            continue;
        }
        let t = &tr[w.sp[i] as usize];
        let cap = p.cap_mul * w.sz[i] as f64;
        let c_t = cell_of(w, i);
        let d_t = w.temp[c_t] as f64;
        // the falling limb of the thermal performance curve
        let tpc = if d_t <= t.topt {
            1.0
        } else {
            jmax(0.0, 1.0 - (d_t - t.topt) / (t.ctmax - t.topt))
        };

        // ---------- dormant cyst ----------
        if w.cy[i] != 0 {
            w.en[i] = to_f32(
                w.en[i] as f64 - 0.002 * w.sz[i] as f64 * t.cyst_drain_mul * w.q_r[c_t] as f64,
            );
            if w.en[i] as f64 <= 0.0 {
                kill_org(w, p, i);
                continue;
            }
            if let Some(cy) = t.cyst {
                match cy.wake {
                    Wake::Light => {
                        let c = cell_at(w.x[i] as f64, w.y[i] as f64);
                        // the draw happens only past the light threshold (contract rule 2)
                        if w.light[c] as f64 > 0.3 && w.r() < cy.p {
                            w.cy[i] = 0;
                            w.gr[i] = to_i16(cy.grace);
                        }
                    }
                    Wake::Prey => {
                        if w.r() < cy.p {
                            let prey = any_prey_near(w, tr, i, t.sense * 2.0, t.diet);
                            if prey {
                                w.cy[i] = 0;
                                w.gr[i] = to_i16(cy.grace);
                            }
                        }
                    }
                    Wake::Detritus => {
                        if w.r() < cy.p {
                            let c = cell_of(w, i);
                            if w.d_e[c] as f64 + w.d_m[c] as f64 > 1.0
                                || w.sc[c] as f64 > cy.sc_min
                            {
                                w.cy[i] = 0;
                                w.gr[i] = to_i16(cy.grace);
                            }
                        }
                    }
                }
            }
            continue;
        }

        if w.gr[i] > 0 {
            w.gr[i] -= 1;
        }
        if let Some(cy) = t.cyst {
            if w.gr[i] <= 0 && (w.en[i] as f64) < cy.enter * cap {
                w.cy[i] = 1;
                w.vx[i] = 0.0;
                w.vy[i] = 0.0;
                continue;
            }
        }

        // ---------- multi-locus expression ----------
        // Every locus contributes one factor per site, in locus order, each `1 + slope*d - curve*d*d`.
        // A slope the locus does not name is 0, so an unexpressed factor multiplies by exactly 1.0.
        let n_l = t.loci.len();
        let mut kb_g = 1.0f64;
        for k in 0..n_l {
            let l = &t.loci[k];
            let d = w.g[k * MAXN + i] as f64 - l.g0;
            kb_g *= 1.0 + l.kb_slope * d - l.curve * d * d;
        }
        // thermal locus (7.H.5): warmth-response down-regulation, exactly 1 at dT <= 0
        let mut w_r = 1.0f64;
        let mut w_a = 1.0f64;
        if d_t > 0.0 {
            for k in 0..n_l {
                let l = &t.loci[k];
                if l.warm_slope != 0.0 || l.warm_gain_slope != 0.0 {
                    let d = w.g[k * MAXN + i] as f64 - l.g0;
                    let hw = d_t * 0.1;
                    w_r *= 1.0 - l.warm_slope * d * hw;
                    w_a *= 1.0 - l.warm_gain_slope * d * hw;
                }
            }
        }
        let mut cost = t.kb * kb_g * w.sz_pow[i] * w.q_r[c_t] as f64 * w_r;
        let m_q = p.m_quota * t.m_qm * w.sz[i] as f64;
        let m_cap = m_q * p.m_cap_mul;

        // ---------- photosynthesis ----------
        if t.photosynth {
            let c0 = cell_of(w, i);
            let want = jmin(
                t.m_up * w.sz[i] as f64 * (1.0 - w.mn[i] as f64 / m_cap),
                m_cap - w.mn[i] as f64,
            );
            if want > 0.0 {
                let got = jmin(w.m[c0] as f64, want);
                if got > 0.0 {
                    w.m[c0] = to_f32(w.m[c0] as f64 - got);
                    w.mn[i] = to_f32(w.mn[i] as f64 + got);
                    w.flows.uptake += got;
                }
            }
            // Liebig: mineral-starved cells photosynthesize weakly
            let sat = jmin(1.0, w.mn[i] as f64 / m_q);
            let lc = cell_light(w, p, tr, i);
            let mut kp_g = 1.0f64;
            for k in 0..n_l {
                let l = &t.loci[k];
                let d = w.g[k * MAXN + i] as f64 - l.g0;
                let q = l.curve * d * d;
                kp_g *= (1.0 + l.kp_slope * (-d) - q) * (1.0 + l.light_slope * d * (1.0 - 2.0 * lc) - q);
            }
            let gpp_gain =
                t.kp * kp_g * lc * w.sz[i] as f64 * sat * w.q_p[c_t] as f64 * tpc * w_a;
            w.en[i] = to_f32(w.en[i] as f64 + gpp_gain);
            w.flows.gpp += gpp_gain;
            let p_q = p.p_quota * w.sz[i] as f64;
            if (w.pr[i] as f64) < p_q && w.en[i] as f64 > 0.6 * cap {
                let conv = jmin(t.p_synth * w.sz[i] as f64, w.en[i] as f64 - 0.6 * cap);
                w.en[i] = to_f32(w.en[i] as f64 - conv);
                w.pr[i] = to_f32(jmin(p_q, w.pr[i] as f64 + conv * p.p_synth_eff));
            }
        }

        // ---------- movement ----------
        match t.movement {
            Movement::Drift => {
                // damped random walk + light-deficit-scaled phototaxis
                let deficit = jmax(0.0, 0.9 - w.light[c_t] as f64);
                // 7.H.3: the drifter climbs the LOCAL light gradient, not a sun bearing
                let lgx = w.lgx[c_t] as f64;
                let lgy = w.lgy[c_t] as f64;
                let lg = math::hypot(lgx, lgy);
                let px = if lg > 0.0 {
                    t.phototaxis * deficit * lgx / lg
                } else {
                    0.0
                };
                let py = if lg > 0.0 {
                    t.phototaxis * deficit * lgy / lg
                } else {
                    0.0
                };
                // MV.2: persistence is heritable; exactly T.damp at g0
                let mut dp = t.damp;
                for k in 0..t.loci.len() {
                    let lk = &t.loci[k];
                    if lk.damp_span != 0.0 {
                        dp += lk.damp_span * (w.g[k * MAXN + i] as f64 - lk.g0);
                    }
                }
                let r1 = w.r();
                w.vx[i] = to_f32(w.vx[i] as f64 * dp + (r1 - 0.5) * t.noise + px);
                let r2 = w.r();
                w.vy[i] = to_f32(w.vy[i] as f64 * dp + (r2 - 0.5) * t.noise + py);
                // 7.H.2 thermotaxis: down the discomfort gradient (draw-free; skipped in a flat field)
                if t.thermo != 0.0 && (w.tgx[c_t] != 0.0 || w.tgy[c_t] != 0.0) {
                    // MV.1: the set-point is heritable; exactly topt at g0
                    let mut tp = t.topt;
                    for k in 0..t.loci.len() {
                        let lk = &t.loci[k];
                        if lk.tpref_span != 0.0 {
                            tp += lk.tpref_span * (w.g[k * MAXN + i] as f64 - lk.g0);
                        }
                    }
                    let sgn = if d_t > tp {
                        -1.0
                    } else if d_t < tp {
                        1.0
                    } else {
                        0.0
                    };
                    w.vx[i] = to_f32(w.vx[i] as f64 + t.thermo * sgn * w.tgx[c_t] as f64);
                    w.vy[i] = to_f32(w.vy[i] as f64 + t.thermo * sgn * w.tgy[c_t] as f64);
                }
                let s = math::hypot(w.vx[i] as f64, w.vy[i] as f64);
                if s > t.drift_speed {
                    w.vx[i] = to_f32(w.vx[i] as f64 * (t.drift_speed / s));
                    w.vy[i] = to_f32(w.vy[i] as f64 * (t.drift_speed / s));
                }
                move_org(w, tr, i, w.vx[i] as f64, w.vy[i] as f64);
                cost += p.move_cost
                    * (w.vx[i] as f64 * w.vx[i] as f64 + w.vy[i] as f64 * w.vy[i] as f64)
                    * w.sz[i] as f64
                    * t.move_cost_mul;
            }
            Movement::Tumble => {
                // run-and-tumble chemotaxis along the detritus gradient
                let c0 = cell_of(w, i);
                let mut here = if t.tumble_field == TumbleField::Scent {
                    w.sc[c0] as f64 * 40.0
                } else {
                    w.d_e[c0] as f64 + w.d_p[c0] as f64 + w.d_m[c0] as f64
                };
                // 7.H.2 klinokinesis: discomfort reads as "worse", raising tumbling
                if t.thermo != 0.0
                    && d_t != t.topt
                    && (w.tgx[c0] != 0.0 || w.tgy[c0] != 0.0)
                {
                    here -= t.thermo * (d_t - t.topt).abs();
                }
                // MV.3: tumble propensity is heritable; the draw below stays unconditional,
                // only its threshold moves
                let mut p_t = if here > w.mem[i] as f64 + 0.01 {
                    t.tumble_low
                } else {
                    t.tumble_high
                };
                for k in 0..n_l {
                    let lk = &t.loci[k];
                    if lk.tumble_slope != 0.0 {
                        p_t *= 1.0 - lk.tumble_slope * (w.g[k * MAXN + i] as f64 - lk.g0);
                    }
                }
                w.mem[i] = to_f32(here);
                if w.r() < p_t {
                    let a = w.r() * 6.283;
                    w.hd[i] = to_f32(a);
                }
                let tor = if t.torpor != 0.0 && (w.en[i] as f64) < t.torpor * cap {
                    0.6
                } else {
                    1.0
                };
                let hd = w.hd[i] as f64;
                move_org(
                    w,
                    tr,
                    i,
                    math::cos(hd) * t.speed * tor,
                    math::sin(hd) * t.speed * tor,
                );
                cost += p.move_cost * t.speed * t.speed * w.sz[i] as f64 * tor;
            }
            Movement::Steer => {
                // pursuit forager
                let torpid = (w.en[i] as f64) < t.torpor * cap;
                let hungry = (w.en[i] as f64) < t.satiation * cap && w.handle[i] <= 0;
                if w.handle[i] > 0 {
                    w.handle[i] -= 1;
                }
                if w.cd[i] > 0 {
                    w.cd[i] -= 1;
                }
                if w.pc[i] > 0 {
                    w.pc[i] -= 1;
                }
                let mut near_kin = 0.0f64;
                let mut tx = 0.0f64;
                let mut ty = 0.0f64;
                let mut best = 1e9f64;
                let mut found = false;
                let mut target: i32 = -1;
                let mut fleeing = false;
                if let Some(fl) = t.flee {
                    if w.flee[i] <= 0 {
                        let c = cell_of(w, i);
                        if w.al[c] as f64 > fl.sense {
                            w.flee[i] = to_i16(fl.dur);
                        }
                    }
                    if w.flee[i] > 0 {
                        w.flee[i] -= 1;
                        fleeing = true;
                    }
                }
                if hungry && !fleeing {
                    // The hunt scan, inlined: the same cell walk and arithmetic as neighbors(),
                    // with the sqrt taken only on candidates that reach a distance comparison.
                    let rr = (t.sense / CELL).ceil() as i32;
                    let r2 = t.sense * t.sense;
                    let gx = crate::jsnum::to_int32((w.x[i] as f64 / CELL).floor());
                    let gy = crate::jsnum::to_int32((w.y[i] as f64 / CELL).floor());
                    for dy in -rr..=rr {
                        for dx in -rr..=rr {
                            let c = (((gy + dy + GRID_I) % GRID_I) * GRID_I
                                + ((gx + dx + GRID_I) % GRID_I))
                                as usize;
                            let mut j = w.hash_head[c];
                            while j >= 0 {
                                let ju = j as usize;
                                let next = w.hash_next[ju];
                                if ju == i || w.alive[ju] == 0 {
                                    j = next;
                                    continue;
                                }
                                let ddx = wd(w.x[ju] as f64 - w.x[i] as f64);
                                let ddy = wd(w.y[ju] as f64 - w.y[i] as f64);
                                let d2 = ddx * ddx + ddy * ddy;
                                if d2 > r2 {
                                    j = next;
                                    continue;
                                }
                                let tj = &tr[w.sp[ju] as usize];
                                // cysts of shelterless species are invisible; sheltered ones are
                                // half-yield prey
                                if w.cy[ju] != 0 && tj.cyst_yield == 0.0 {
                                    j = next;
                                    continue;
                                }
                                if w.sp[ju] == w.sp[i] {
                                    if math::sqrt(d2) < t.interf_radius {
                                        near_kin += 1.0;
                                    }
                                    j = next;
                                    continue;
                                }
                                if (t.diet & tj.body_tag) == 0 {
                                    j = next;
                                    continue;
                                }
                                if tj.graze_floor != 0.0 && (w.en[ju] as f64) <= tj.graze_floor {
                                    j = next;
                                    continue;
                                }
                                // 7.W: prey beyond a face this hunter cannot cross is out of reach
                                if w.walls_on
                                    && path_blocked(
                                        w,
                                        t.body_tag,
                                        w.x[i] as f64,
                                        w.y[i] as f64,
                                        ddx,
                                        ddy,
                                    )
                                {
                                    j = next;
                                    continue;
                                }
                                let pref = math::sqrt(d2) * tj.pursuit_penalty;
                                if pref < best {
                                    best = pref;
                                    tx = ddx;
                                    ty = ddy;
                                    found = true;
                                    target = j;
                                }
                                j = next;
                            }
                        }
                    }
                }
                let mut speed;
                if fleeing {
                    // run down the alarm gradient, foraging suspended
                    let fl = t.flee.unwrap();
                    let gx2 = crate::jsnum::to_int32((w.x[i] as f64 / CELL).floor());
                    let gy2 = crate::jsnum::to_int32((w.y[i] as f64 / CELL).floor());
                    let g = GRID_I;
                    let c_r = ((gy2 & GRID_MASK) * g + ((gx2 + 1) & GRID_MASK)) as usize;
                    let c_l = ((gy2 & GRID_MASK) * g + ((gx2 - 1 + g) & GRID_MASK)) as usize;
                    let c_d = (((gy2 + 1) & GRID_MASK) * g + (gx2 & GRID_MASK)) as usize;
                    let c_u = (((gy2 - 1 + g) & GRID_MASK) * g + (gx2 & GRID_MASK)) as usize;
                    let mut bx = 1.0f64;
                    let mut bv = w.al[c_r] as f64;
                    if (w.al[c_l] as f64) < bv {
                        bv = w.al[c_l] as f64;
                        bx = -1.0;
                    }
                    let mut byy = 0.0f64;
                    if (w.al[c_d] as f64) < bv {
                        bv = w.al[c_d] as f64;
                        bx = 0.0;
                        byy = 1.0;
                    }
                    if (w.al[c_u] as f64) < bv {
                        bx = 0.0;
                        byy = -1.0;
                    }
                    let ta = math::atan2(byy, bx);
                    let mut da = ta - w.hd[i] as f64;
                    while da > PI {
                        da -= 6.283;
                    }
                    while da < -PI {
                        da += 6.283;
                    }
                    w.hd[i] = to_f32(w.hd[i] as f64 + jmax(-0.5, jmin(0.5, da)));
                    speed = t.speed * fl.speed_mul;
                } else if found {
                    let ta = math::atan2(ty, tx);
                    let mut da = ta - w.hd[i] as f64;
                    while da > PI {
                        da -= 6.283;
                    }
                    while da < -PI {
                        da += 6.283;
                    }
                    w.hd[i] = to_f32(w.hd[i] as f64 + jmax(-t.turn_rate, jmin(t.turn_rate, da)));
                    // pursuit quickens with warmth (Q10 1.3), its quadratic cost with it
                    speed = t.speed * (if torpid { 0.75 } else { 1.0 }) * w.q_s[c_t] as f64;
                    if best < w.sz[i] as f64 + 6.0 && target >= 0 {
                        let tgt = target as usize;
                        let tj = &tr[w.sp[tgt] as usize];
                        let mut esc_p = 0.0f64;
                        if let Some(esc) = tj.escape {
                            // prey loci shift the base chance additively, hunter loci multiply
                            // what remains
                            esc_p = esc.p;
                            for k in 0..tj.loci.len() {
                                let l = &tj.loci[k];
                                let d = w.g[k * MAXN + tgt] as f64 - l.g0;
                                esc_p = esc_p + l.esc_slope * d - esc.p * l.curve * d * d;
                            }
                            for k in 0..n_l {
                                let l = &t.loci[k];
                                let d = w.g[k * MAXN + i] as f64 - l.g0;
                                esc_p *= 1.0 + l.catch_slope * (-d) - l.curve * d * d;
                            }
                        }
                        // the draw exists only where the prey can escape (contract rule 2)
                        let escaped = match tj.escape {
                            Some(_) => w.r() < esc_p,
                            None => false,
                        };
                        if escaped {
                            let esc = tj.escape.unwrap();
                            // escape jink: prey darts away, contact broken
                            let ja = w.r() * 6.283;
                            move_org(
                                w,
                                tr,
                                tgt,
                                math::cos(ja) * esc.kick,
                                math::sin(ja) * esc.kick,
                            );
                            w.vx[tgt] = to_f32(math::cos(ja) * 0.5);
                            w.vy[tgt] = to_f32(math::sin(ja) * 0.5);
                        } else {
                            // ingestion warms too (7.H.4, Q10 1.8) — flatter than upkeep
                            let bite = jmin(
                                t.bite * w.q_a[c_t] as f64,
                                w.en[tgt] as f64
                                    - if tj.graze_floor != 0.0 {
                                        tj.graze_floor * 0.99
                                    } else {
                                        0.0
                                    },
                            );
                            if bite > 0.0 {
                                if tj.alarm_emit != 0.0 {
                                    // Schreckstoff: injury broadcasts alarm
                                    let ct = cell_of(w, tgt);
                                    w.al[ct] = to_f32(w.al[ct] as f64 + tj.alarm_emit);
                                }
                                let yield_mul = if w.cy[tgt] != 0 { tj.cyst_yield } else { 1.0 };
                                // past ctmax the meal is wasted, not eaten
                                let eff_e2 = t.digest[w.sp[tgt] as usize] * yield_mul * tpc;
                                let eff_p2 = t.digest_p[w.sp[tgt] as usize] * yield_mul * tpc;
                                let frac = if w.en[tgt] as f64 > 0.0 {
                                    bite / w.en[tgt] as f64
                                } else {
                                    0.0
                                };
                                let m_share = w.mn[tgt] as f64 * frac;
                                let p_share = w.pr[tgt] as f64 * frac;
                                let c_here = cell_of(w, i);
                                w.en[tgt] = to_f32(w.en[tgt] as f64 - bite);
                                w.en[i] = to_f32(jmin(cap, w.en[i] as f64 + bite * eff_e2));
                                let waste_e = bite * (1.0 - eff_e2);
                                if waste_e > 0.0 {
                                    w.d_e[c_here] = to_f32(w.d_e[c_here] as f64 + waste_e);
                                    w.flows.egest_e += waste_e;
                                }
                                if p_share > 0.0 {
                                    w.pr[tgt] = to_f32(w.pr[tgt] as f64 - p_share);
                                    let p_q2 = p.p_quota * w.sz[i] as f64;
                                    let abs_p = jmin(
                                        p_share * eff_p2,
                                        jmax(0.0, p_q2 - w.pr[i] as f64),
                                    );
                                    w.pr[i] = to_f32(w.pr[i] as f64 + abs_p);
                                    let waste_p = p_share - abs_p;
                                    if waste_p > 0.0 {
                                        w.d_p[c_here] = to_f32(w.d_p[c_here] as f64 + waste_p);
                                        w.flows.egest_p += waste_p;
                                    }
                                }
                                if m_share > 0.0 {
                                    w.mn[tgt] = to_f32(w.mn[tgt] as f64 - m_share);
                                    w.flows.transfer += m_share;
                                    let room = m_q * p.m_cap_mul - w.mn[i] as f64;
                                    let kept = jmin(room, m_share);
                                    w.mn[i] = to_f32(w.mn[i] as f64 + kept);
                                    let spill = m_share - kept;
                                    if spill > 0.0 {
                                        let ci = cell_of(w, i);
                                        w.m[ci] = to_f32(w.m[ci] as f64 + spill);
                                        w.flows.excrete += spill;
                                    }
                                }
                                if w.en[tgt] as f64 <= 0.5 {
                                    kill_org(w, p, tgt);
                                    // handling shortens with warmth (Q10 0.65); the kill starts
                                    // the post-capture window (MV-C)
                                    w.handle[i] = to_i16(t.handling * w.q_h[c_t] as f64);
                                    w.pc[i] = to_i16((PC_A + PC_B) as f64);
                                }
                            }
                        }
                    }
                } else {
                    // MV-C: the post-capture program. Value modulation only, at the existing idle
                    // draw and idle speed — no draw is added, moved, or made conditional.
                    let mut pc_s = 1.0f64;
                    let mut pc_t2 = 1.0f64;
                    if w.pc[i] > 0 {
                        let ph = if w.pc[i] as i32 > PC_B { 1.0 } else { -1.0 };
                        for k in 0..n_l {
                            let l = &t.loci[k];
                            if l.pc_speed_slope != 0.0 || l.pc_turn_slope != 0.0 {
                                let d = w.g[k * MAXN + i] as f64 - l.g0;
                                pc_s *= 1.0 - l.pc_speed_slope * d * ph;
                                pc_t2 *= 1.0 + l.pc_turn_slope * d * ph;
                            }
                        }
                    }
                    let r = w.r();
                    w.hd[i] = to_f32(w.hd[i] as f64 + (r - 0.5) * 0.5 * pc_t2);
                    // 7.H.2 / MV.4: an idle, fed hunter turns toward its preferred warmth;
                    // hunger overrides. Draw-free.
                    if t.thermo != 0.0
                        && !hungry
                        && (w.tgx[c_t] != 0.0 || w.tgy[c_t] != 0.0)
                    {
                        let mut tp = t.topt;
                        for k in 0..n_l {
                            let lk = &t.loci[k];
                            if lk.tpref_span != 0.0 {
                                tp += lk.tpref_span * (w.g[k * MAXN + i] as f64 - lk.g0);
                            }
                        }
                        let sgn = if d_t > tp { -1.0 } else { 1.0 };
                        let ta = math::atan2(sgn * w.tgy[c_t] as f64, sgn * w.tgx[c_t] as f64);
                        let mut da = ta - w.hd[i] as f64;
                        while da > PI {
                            da -= 6.283;
                        }
                        while da < -PI {
                            da += 6.283;
                        }
                        w.hd[i] = to_f32(
                            w.hd[i] as f64
                                + jmax(-t.turn_rate * 0.5, jmin(t.turn_rate * 0.5, da)),
                        );
                    }
                    speed = (if hungry {
                        t.speed * 0.7
                    } else {
                        t.speed * 0.3
                    }) * (if torpid { 0.75 } else { 1.0 })
                        * pc_s;
                }
                // jet burst: brief straight-line speed spike, quadratic cost, long cooldown
                if let Some(bu) = t.burst {
                    if !fleeing {
                        if w.bst[i] > 0 {
                            speed *= bu.mul;
                            w.bst[i] -= 1;
                            if w.bst[i] == 0 {
                                w.bst[i] = to_i16(-bu.cd);
                            }
                        } else if w.bst[i] < 0 {
                            w.bst[i] += 1;
                        } else if found && best > w.sz[i] as f64 + 6.0 && best < bu.range {
                            w.bst[i] = to_i16(bu.dur);
                            speed *= bu.mul;
                            w.bst[i] -= 1;
                        }
                    }
                }
                let hd = w.hd[i] as f64;
                move_org(w, tr, i, math::cos(hd) * speed, math::sin(hd) * speed);
                cost += p.move_cost * speed * speed * w.sz[i] as f64 + t.interf_cost * near_kin;
                if torpid {
                    cost *= 0.7;
                }
            }
            Movement::Sessile => {}
        }

        // ---------- detritivory ----------
        if let Some(dv) = t.detritivore {
            let c0 = cell_of(w, i);
            let mut rate_g = 1.0f64; // rate-yield locus; both exactly 1 at g0
            let mut eff_g = 1.0f64;
            for k in 0..n_l {
                let l = &t.loci[k];
                let d = w.g[k * MAXN + i] as f64 - l.g0;
                let q = l.curve * d * d;
                rate_g *= 1.0 + l.rate_slope * d - q;
                eff_g *= 1.0 - l.eff_slope * d - q;
            }
            // decomposition: Q10 2.0, flattened by the thermal locus (its price)
            let eat_e = jmin(
                w.d_e[c0] as f64,
                dv.rate_e * rate_g * w.sz[i] as f64 * w.q_d[c0] as f64 * tpc * w_a,
            );
            if eat_e > 0.0 {
                w.d_e[c0] = to_f32(w.d_e[c0] as f64 - eat_e);
                w.en[i] = to_f32(jmin(cap, w.en[i] as f64 + eat_e * dv.eff_e * eff_g));
            }
            let p_q3 = p.p_quota * w.sz[i] as f64;
            let eat_p = jmin3(
                w.d_p[c0] as f64,
                dv.rate_p * rate_g * w.sz[i] as f64 * w.q_d[c0] as f64 * tpc * w_a,
                jmax(0.0, (p_q3 - w.pr[i] as f64) / dv.eff_p),
            );
            if eat_p > 0.0 {
                w.d_p[c0] = to_f32(w.d_p[c0] as f64 - eat_p);
                w.pr[i] = to_f32(w.pr[i] as f64 + eat_p * dv.eff_p);
            }
            let minz = jmin(w.d_m[c0] as f64, dv.min_rate * w.sz[i] as f64);
            if minz > 0.0 {
                w.d_m[c0] = to_f32(w.d_m[c0] as f64 - minz);
                let room = jmax(0.0, m_q * p.m_cap_mul - w.mn[i] as f64);
                let kept = jmin(room, minz);
                w.mn[i] = to_f32(w.mn[i] as f64 + kept);
                let rel = minz - kept;
                if rel > 0.0 {
                    w.m[c0] = to_f32(w.m[c0] as f64 + rel);
                    w.flows.bac_release += rel;
                }
            }
        }

        // ---------- corpse feeding ----------
        if let Some(cv) = t.corpsivore {
            let mut bk: i32 = -1;
            let mut bd2 = cv.radius * cv.radius;
            let gx = crate::jsnum::to_int32((w.x[i] as f64 / CELL).floor());
            let gy = crate::jsnum::to_int32((w.y[i] as f64 / CELL).floor());
            for dy in -1..=1 {
                for dx in -1..=1 {
                    let c = (((gy + dy + GRID_I) % GRID_I) * GRID_I
                        + ((gx + dx + GRID_I) % GRID_I)) as usize;
                    let mut k = w.c_hash_head[c];
                    while k >= 0 {
                        let ku = k as usize;
                        let next = w.c_hash_next[ku];
                        if w.c_alive[ku] == 0 {
                            k = next;
                            continue;
                        }
                        let ddx = wd(w.c_x[ku] as f64 - w.x[i] as f64);
                        let ddy = wd(w.c_y[ku] as f64 - w.y[i] as f64);
                        {
                            let cm =
                                w.c_e[ku] as f64 + w.c_p[ku] as f64 + w.c_m[ku] as f64;
                            if cm < cv.min_mass || cm > cv.max_mass {
                                k = next;
                                continue;
                            }
                        }
                        if cv.diet_only
                            && (t.diet & tr[w.c_sp[ku] as usize].body_tag) == 0
                        {
                            k = next;
                            continue;
                        }
                        let d2 = ddx * ddx + ddy * ddy;
                        if d2 < bd2 {
                            bd2 = d2;
                            bk = k;
                        }
                        k = next;
                    }
                }
            }
            if bk >= 0 {
                let bk = bk as usize;
                let mass = w.c_e[bk] as f64 + w.c_p[bk] as f64 + w.c_m[bk] as f64;
                let f = jmin(1.0, cv.rate * w.sz[i] as f64 / jmax(1.0, mass));
                let g_e = w.c_e[bk] as f64 * f;
                let g_p = w.c_p[bk] as f64 * f;
                let g_m = w.c_m[bk] as f64 * f;
                w.c_e[bk] = to_f32(w.c_e[bk] as f64 - g_e);
                w.c_p[bk] = to_f32(w.c_p[bk] as f64 - g_p);
                w.c_m[bk] = to_f32(w.c_m[bk] as f64 - g_m);
                let c0 = cell_of(w, i);
                w.en[i] = to_f32(jmin(cap, w.en[i] as f64 + g_e * cv.eff_e));
                w.d_e[c0] = to_f32(w.d_e[c0] as f64 + g_e * (1.0 - cv.eff_e));
                w.flows.egest_e += g_e * (1.0 - cv.eff_e);
                let p_q4 = p.p_quota * w.sz[i] as f64;
                let abs_p = jmin(g_p * cv.eff_p, jmax(0.0, p_q4 - w.pr[i] as f64));
                w.pr[i] = to_f32(w.pr[i] as f64 + abs_p);
                w.d_p[c0] = to_f32(w.d_p[c0] as f64 + g_p - abs_p);
                let room = jmax(0.0, m_q * p.m_cap_mul - w.mn[i] as f64);
                let kept = jmin(room, g_m);
                w.mn[i] = to_f32(w.mn[i] as f64 + kept);
                if g_m - kept > 0.0 {
                    w.m[c0] = to_f32(w.m[c0] as f64 + g_m - kept);
                    w.flows.bac_release += g_m - kept;
                }
            }
        }

        // ---------- upkeep, hazard, division ----------
        w.en[i] = to_f32(jmin(cap, w.en[i] as f64 - cost));
        w.flows.resp += cost;
        if w.en[i] as f64 <= 0.0 {
            kill_org(w, p, i);
            continue;
        }
        if t.hazard != 0.0 && w.r() < t.hazard {
            kill_org(w, p, i);
            continue;
        }
        if w.en[i] as f64 > t.repro_frac * cap
            && w.mn[i] as f64 >= p.m_repro_min * m_q
            && w.pr[i] as f64 >= p.p_repro_min * p.p_quota * w.sz[i] as f64
            && (t.repro_cooldown == 0.0 || w.cd[i] <= 0)
        {
            let child_e = w.en[i] as f64 * p.invest;
            let child_m = w.mn[i] as f64 * p.invest;
            let child_p = w.pr[i] as f64 * p.invest;
            let r1 = w.r();
            let mut nx = wrap(w.x[i] as f64 + (r1 - 0.5) * t.spread);
            let r2 = w.r();
            let mut ny = wrap(w.y[i] as f64 + (r2 - 0.5) * t.spread);
            // 7.W: dispersal blocked — the child settles beside the parent (draws already spent)
            if w.walls_on
                && path_blocked(
                    w,
                    t.body_tag,
                    w.x[i] as f64,
                    w.y[i] as f64,
                    wd(nx - w.x[i] as f64),
                    wd(ny - w.y[i] as f64),
                )
            {
                nx = w.x[i] as f64;
                ny = w.y[i] as f64;
            }
            if t.settle_limited {
                let c = cell_at(nx, ny);
                let crowd = if t.layer == crate::traits::Layer::Fungal {
                    w.f_b[c] as f64
                } else {
                    w.b_b[c] as f64
                };
                if crowd > t.settle_limit {
                    w.en[i] = to_f32(w.en[i] as f64 - child_e * 0.3);
                    continue;
                }
            }
            w.en[i] = to_f32(w.en[i] as f64 - (child_e + 2.0));
            w.mn[i] = to_f32(w.mn[i] as f64 - child_m);
            w.pr[i] = to_f32(w.pr[i] as f64 - child_p);
            let r3 = w.r();
            let child_sz = jmax(
                1.5,
                w.sz[i] as f64
                    * (if r3 < 0.2 {
                        let r4 = w.r();
                        1.0 + (r4 - 0.5) * p.mut_sigma * 2.0
                    } else {
                        1.0
                    }),
            );
            // structural substance: an energy sink now, a corpse credit later
            w.en[i] = to_f32(w.en[i] as f64 - p.s_body * child_sz);
            let sp_i = w.sp[i] as usize;
            let ci = spawn(w, tr, sp_i, nx, ny, child_e, child_sz, child_m, child_p);
            if ci >= 0 {
                let ci = ci as usize;
                w.lg[ci] = w.lg[i].wrapping_add(1);
                // heredity: child = parent, plus one uniform kick of +-sigma PER LOCUS, in locus
                // order (contract rule 5)
                for k in 0..n_l {
                    let l = &t.loci[k];
                    let mut gc = w.g[k * MAXN + i] as f64;
                    if l.sigma > 0.0 && p.mutation {
                        // draw only when mutating: the silent genome consumes zero draws
                        let r = w.r();
                        gc += (r - 0.5) * 2.0 * l.sigma;
                        gc = if gc < 0.0 {
                            0.0
                        } else if gc > 1.0 {
                            1.0
                        } else {
                            gc
                        };
                    }
                    w.g[k * MAXN + ci] = to_f32(gc);
                }
            }
            if t.repro_cooldown != 0.0 {
                w.cd[i] = to_i16(t.repro_cooldown);
            }
        }
    }

    // ---------- corpse pass (draw-free) ----------
    for k in 0..w.c_n {
        if w.c_alive[k] == 0 {
            continue;
        }
        let c = cell_at(w.c_x[k] as f64, w.c_y[k] as f64);
        let mass = w.c_e[k] as f64 + w.c_p[k] as f64 + w.c_m[k] as f64;
        if mass < 0.5 {
            // expired: dump the remainder into detritus
            w.d_e[c] = to_f32(w.d_e[c] as f64 + w.c_e[k] as f64);
            w.d_p[c] = to_f32(w.d_p[c] as f64 + w.c_p[k] as f64);
            w.d_m[c] = to_f32(w.d_m[c] as f64 + w.c_m[k] as f64);
            w.c_alive[k] = 0;
            w.c_free.push(k);
            continue;
        }
        let d = p.corpse_decay * w.q_d[c] as f64; // corpses rot faster in warm water
        w.d_e[c] = to_f32(w.d_e[c] as f64 + w.c_e[k] as f64 * d);
        w.d_p[c] = to_f32(w.d_p[c] as f64 + w.c_p[k] as f64 * d);
        w.d_m[c] = to_f32(w.d_m[c] as f64 + w.c_m[k] as f64 * d);
        w.flows.corpse_to_det += w.c_m[k] as f64 * d;
        w.c_e[k] = to_f32(w.c_e[k] as f64 * (1.0 - d));
        w.c_p[k] = to_f32(w.c_p[k] as f64 * (1.0 - d));
        w.c_m[k] = to_f32(w.c_m[k] as f64 * (1.0 - d));
        w.sc[c] = to_f32(w.sc[c] as f64 + p.scent_emit * mass * 0.01);
    }
    w.tick += 1;
    // The observatory sample lands here (`if (W.tick % REC.STRIDE === 0) record()`). It is a pure
    // observer with zero draws, so its absence cannot move the stream — M3 fills it in.
}
