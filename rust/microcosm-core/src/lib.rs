//! Microcosm — the simulation core.
//!
//! A translation of `src/sim/` from the JavaScript reference, exact to the PRNG stream. The
//! contract it honours is `docs/porting.md`; the migration it belongs to is
//! `docs/android-port-plan.md`. Three targets are served from this one crate: the Android app
//! (NDK), the browser and the Node harnesses (WASM), and a native CLI for headless experiments.
//!
//! Two rules keep it honest:
//!
//! * **No platform math.** `math.rs` carries its own fdlibm-lineage routines, matched to V8, so
//!   every target produces identical bits by construction. Calling `f64::sin` here would silently
//!   fork the world per operating system.
//! * **The RNG-order contract**, reproduced in the banner at the top of `step.rs`. Read it before
//!   touching anything the tick reaches.

pub mod events;
pub mod fields;
pub mod jsnum;
#[cfg(feature = "stub-math")]
#[path = "math_stub.rs"]
pub mod math;
#[cfg(not(feature = "stub-math"))]
pub mod math;
pub mod params;
pub mod rng;
pub mod species_gen;
pub mod step;
pub mod traits;
pub mod world;

use params::*;
use traits::{Locus, Registry, Species};
use world::World;

/// Scenario founding (Phase 8 levels): overrides founding counts and starting mineral.
/// DRAW-FREE WHEN ABSENT — with no scenario every count is the shipped literal and the stream is
/// bit-identical; a scenario world diverges only through its different founding, like a moved sun.
#[derive(Clone, Debug, Default)]
pub struct Scenario {
    /// Per-species founding count override, indexed by species.
    pub found: [Option<i32>; 7],
    pub m0: Option<f64>,
}

pub struct Sim {
    pub w: World,
    pub p: Params,
    pub tr: Vec<Species>,
    pub reg: Registry,
    /// The shipped evolution settings, captured once at load; `init_world` restores them.
    locus_shipped: Vec<Vec<Locus>>,
}

impl Default for Sim {
    fn default() -> Self {
        Self::new()
    }
}

impl Sim {
    pub fn new() -> Sim {
        let p = Params::default();
        let tr = species_gen::species_table();
        let reg = Registry::build(&tr);
        let locus_shipped = tr.iter().map(|t| t.loci.clone()).collect();
        Sim {
            w: World::new(&p),
            p,
            tr,
            reg,
            locus_shipped,
        }
    }

    /// One tick. Events are applied at the boundary, before diffusion, exactly as in `step()`.
    pub fn step(&mut self) {
        events::drain_events(self);
        let Sim { w, p, tr, .. } = self;
        step::step_body(w, p, tr);
    }

    pub fn queue_event(&mut self, ev: events::Event) {
        events::queue_event(self, ev);
    }

    pub fn apply_event(&mut self, ev: events::Event) {
        events::apply_event(self, ev);
    }

    /// `resetWorld()` — clears the world without re-founding it.
    pub fn reset_world(&mut self) {
        self.w.initialized = false;
        self.w.n = 0;
        self.w.free_list.clear();
        self.w.alive.iter_mut().for_each(|v| *v = 0);
        self.w.tick = 0;
        self.w.events.clear();
        self.w.event_log.clear();
    }

    /// `initWorld(seed, sc)` — found the world. Returns immediately if already initialized, so the
    /// reset→init pairing is mandatory, as in the JS.
    pub fn init_world(&mut self, seed: Option<i32>, sc: Option<&Scenario>) {
        if self.w.initialized {
            return;
        }
        self.w.initialized = true;
        self.w.seed = seed.unwrap_or(self.p.seed);
        self.w.rng = rng::Rng::new(self.w.seed);
        self.w.n = 0;
        self.w.free_list.clear();
        self.w.alive.iter_mut().for_each(|v| *v = 0);
        self.w.tick = 0;

        let m0 = sc.and_then(|s| s.m0).unwrap_or(self.p.m0);
        let m0f = jsnum_to_f32(m0);
        self.w.m.iter_mut().for_each(|v| *v = m0f);
        for f in [
            &mut self.w.d_e,
            &mut self.w.d_p,
            &mut self.w.d_m,
            &mut self.w.sc,
            &mut self.w.al,
        ] {
            f.iter_mut().for_each(|v| *v = 0.0);
        }
        self.w.added_m = 0.0;
        self.p.light_mul = 1.0;
        // Note: `mutation` is a harness-level switch (like spawn_decomposers) and is deliberately
        // NOT reset here — the UI reset restores it.

        // Restore the shipped evolution settings. Only sigma and curve are restored, matching the
        // JS exactly: harness price sweeps (heat.js --thermal) set slopes BEFORE start() and depend
        // on them surviving init. Documented in docs/android-port-plan.md; do not "fix" one side.
        for sp in 0..self.tr.len() {
            for k in 0..self.tr[sp].loci.len() {
                self.tr[sp].loci[k].sigma = self.locus_shipped[sp][k].sigma;
                self.tr[sp].loci[k].curve = self.locus_shipped[sp][k].curve;
            }
        }

        self.w.c_n = 0;
        self.w.c_free.clear();
        self.w.c_alive.iter_mut().for_each(|v| *v = 0);
        self.w.flows = world::Flows::default();

        // one sun, centred (like light_mul)
        self.w.sources.clear();
        self.w.sources.push(world::Source {
            x: WORLD / 2.0,
            y: WORLD / 2.0,
            i: self.p.sun_i,
            a: 0.0,
            sigma: self.p.sun_sigma,
        });
        self.w.walls.clear();
        fields::compile_walls(&mut self.w);
        fields::compute_light(&mut self.w, &self.p);
        fields::compute_temp(&mut self.w, &self.p);

        // Founding. Draw order here is as load-bearing as it is inside the tick: nearSun draws
        // (angle, radius) and each spawn draws its heading, with any argument draws in between
        // evaluated left to right, exactly as JavaScript evaluates a call's arguments.
        let n_of = |sp: usize, n: i32| -> i32 {
            match sc.and_then(|s| s.found[sp]) {
                Some(v) => v,
                None => n,
            }
        };

        for _ in 0..n_of(0, 120) {
            let (a, b) = self.near_sun(380.0);
            let r1 = self.w.r();
            let r2 = self.w.r();
            let j = world::spawn(
                &mut self.w,
                &self.tr,
                0,
                a,
                b,
                30.0 + r1 * 30.0,
                7.0 + r2 * 2.0,
                0.0,
                0.0,
            );
            world::endow_founder(&mut self.w, &self.p, &self.tr, j);
        }
        for _ in 0..n_of(1, 500) {
            let (a, b) = self.near_sun(330.0);
            let r1 = self.w.r();
            let j = world::spawn(
                &mut self.w,
                &self.tr,
                1,
                a,
                b,
                16.0 + r1 * 12.0,
                3.4,
                0.0,
                0.0,
            );
            world::endow_founder(&mut self.w, &self.p, &self.tr, j);
        }
        for _ in 0..n_of(2, 12) {
            let (a, b) = self.near_sun(420.0);
            let j = world::spawn(&mut self.w, &self.tr, 2, a, b, 60.0, 6.0, 0.0, 0.0);
            world::endow_founder(&mut self.w, &self.p, &self.tr, j);
        }
        if self.p.spawn_decomposers {
            for _ in 0..n_of(3, 60) {
                let (a, b) = self.near_sun(460.0);
                let r1 = self.w.r();
                let j = world::spawn(
                    &mut self.w,
                    &self.tr,
                    3,
                    a,
                    b,
                    10.0 + r1 * 6.0,
                    2.0,
                    0.0,
                    0.0,
                );
                world::endow_founder(&mut self.w, &self.p, &self.tr, j);
            }
        }
        // pack founding: a brood arrives together, sharing the discovered hunting ground
        if n_of(6, 9) > 0 {
            let (ax, ay) = self.near_sun(300.0);
            for _ in 0..n_of(6, 9) {
                let r1 = self.w.r();
                let r2 = self.w.r();
                let v = world::spawn(
                    &mut self.w,
                    &self.tr,
                    6,
                    world::wrap(ax + (r1 - 0.5) * 120.0),
                    world::wrap(ay + (r2 - 0.5) * 120.0),
                    70.0,
                    9.0,
                    0.0,
                    0.0,
                );
                if v >= 0 {
                    world::endow_founder(&mut self.w, &self.p, &self.tr, v);
                    self.w.cy[v as usize] = 1;
                }
            }
        }
    }

    /// `nearSun(rad)` — two draws, angle then radius.
    fn near_sun(&mut self, rad: f64) -> (f64, f64) {
        let a = self.w.r() * 6.283;
        let r = math::sqrt(self.w.r()) * rad;
        let s = self.w.sources[0];
        (
            world::wrap(s.x + math::cos(a) * r),
            world::wrap(s.y + math::sin(a) * r),
        )
    }

    /// Live population per species — what every harness counts first.
    pub fn pops(&self) -> [i32; 7] {
        let mut p = [0i32; 7];
        for i in 0..self.w.n_slots() {
            if self.w.alive[i] != 0 {
                p[self.w.sp[i] as usize] += 1;
            }
        }
        p
    }

    /// The mineral audit: dissolved + detrital + bound in bodies + held in corpses.
    pub fn audit_m(&self) -> f64 {
        let mut t = 0.0;
        for c in 0..NCELL {
            t += self.w.m[c] as f64 + self.w.d_m[c] as f64;
        }
        for i in 0..self.w.n_slots() {
            if self.w.alive[i] != 0 {
                t += self.w.mn[i] as f64;
            }
        }
        for k in 0..self.w.c_n {
            if self.w.c_alive[k] != 0 {
                t += self.w.c_m[k] as f64;
            }
        }
        t
    }
}

#[inline]
fn jsnum_to_f32(v: f64) -> f32 {
    jsnum::to_f32(v)
}
