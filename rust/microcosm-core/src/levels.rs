//! Learning levels (Phase 8) — guided experiments over the certified world.
//!
//! A transliteration of `src/observatory/levels.js`, and it keeps that file's three promises:
//!
//! * **Definitions are data.** The table lives in `src/observatory/levels.json` and reaches this
//!   crate through `levels_gen.rs`, generated from the built JS core and checked in CI. Predicates
//!   are comparison lists rather than closures for exactly this reason: a closure cannot cross the
//!   language boundary, so a shared definition would have become two definitions.
//! * **Evaluation is a pure observer.** `level_check` takes zero PRNG draws and mutates no dynamic
//!   state; it walks the recorder ring one sample at a time. Verdicts are therefore identical at
//!   any UI speed and in the headless harness.
//! * **Setup composes only the legal entry points** — the `init_world` scenario (draw-free when
//!   absent) and `apply_event`. A level world is its own world, like a moved sun: no conformance
//!   claim attaches to it.

use crate::events::Event;
use crate::levels_gen::LEVELS;
use crate::observatory::SysEvent;
use crate::params::{REC_CH, REC_N, REC_STRIDE};
use crate::{Scenario, Sim};

/// Fixed latch capacity, mirrored by `tools/gen-levels-rs.js`, so a run allocates nothing.
pub const MAX_LATCH: usize = 4;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Metric {
    /// Live population of a species.
    Pop(usize),
    /// Share of the world's mineral locked in corpses and mud.
    LockShare,
    /// Free dissolved mineral.
    Free,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Op {
    Ge,
    Le,
    Gt,
    Lt,
    Eq,
}

#[derive(Clone, Copy, Debug)]
pub enum Cond {
    Cmp(Metric, Op, f64),
    /// True once the level's latch of this slot has been set (see `LevelDef::latch`).
    Latched(usize),
}

#[derive(Debug)]
pub struct Latch {
    pub id: usize,
    pub when: &'static [Cond],
}

#[derive(Debug)]
pub struct FailRule {
    pub when: &'static [Cond],
    pub why: &'static str,
}

#[derive(Debug)]
pub struct MeterRow {
    pub label: &'static str,
    pub m: Metric,
    /// Read the metric as a rounded percentage (the locked share, in L3).
    pub pct: bool,
    /// `None` means the row is information, not an objective.
    pub goal: Option<f64>,
    /// -1 when the objective is to stay below the goal.
    pub dir: i32,
    pub unit: &'static str,
}

#[derive(Debug)]
pub struct LevelDef {
    pub key: &'static str,
    pub n: i32,
    pub seed: i32,
    /// Per-species founding override; -1 leaves the shipped literal in place.
    pub found: [i32; 7],
    pub m0: f64,
    pub has_m0: bool,
    pub light_mul: f64,
    pub has_light_mul: bool,
    /// Mineral doses the player carries; -1 is unlimited.
    pub pours: i32,
    pub seed_all: bool,
    pub sources: bool,
    pub walls: bool,
    pub evolution: bool,
    pub deadline: i64,
    /// Consecutive passing samples required (20 ticks each), so speed cannot change a verdict.
    pub sustain: i32,
    pub narrate: &'static [&'static str],
    pub pass: &'static [Cond],
    pub latch: &'static [Latch],
    pub fail_now: &'static [FailRule],
    pub timeout_why: &'static str,
    pub meter: &'static [MeterRow],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LvlState {
    Idle,
    Running,
    Passed,
    Failed,
}

impl LvlState {
    pub fn as_str(self) -> &'static str {
        match self {
            LvlState::Idle => "idle",
            LvlState::Running => "running",
            LvlState::Passed => "passed",
            LvlState::Failed => "failed",
        }
    }
}

/// The apparatus gates the UI consults; everything is open outside a level.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Apparatus {
    Pours,
    Seed,
    Sources,
    Walls,
    Evolution,
}

pub struct Lvl {
    /// Index into `LEVELS`, or -1 outside a level.
    pub def: i32,
    pub state: LvlState,
    pub run: i32,
    pub seen_s: i64,
    pub fail_why: &'static str,
    /// F1: the prediction committed before the run — contrast, never grade. -1 when unasked.
    pub predicted: i32,
    /// Doses left; -1 is unlimited.
    pub pour_left: i32,
    /// Per-run scratch for stateful predicates; sample-driven, therefore deterministic.
    pub mem: [u8; MAX_LATCH],
}

impl Default for Lvl {
    fn default() -> Self {
        Lvl {
            def: -1,
            state: LvlState::Idle,
            run: 0,
            seen_s: 0,
            fail_why: "",
            predicted: -1,
            pour_left: -1,
            mem: [0; MAX_LATCH],
        }
    }
}

impl Lvl {
    pub fn def(&self) -> Option<&'static LevelDef> {
        if self.def < 0 {
            None
        } else {
            LEVELS.get(self.def as usize)
        }
    }
}

/// One recorder sample: `back` samples before the latest. Pure ring-buffer reads.
#[derive(Clone, Copy, Debug)]
pub struct LvlSample {
    pop: [f64; 7],
    pub free: f64,
    pub lock_share: f64,
}

impl LvlSample {
    #[inline]
    pub fn pop(&self, sp: usize) -> f64 {
        self.pop[sp]
    }

    #[inline]
    fn metric(&self, m: Metric) -> f64 {
        match m {
            Metric::Pop(sp) => self.pop[sp],
            Metric::LockShare => self.lock_share,
            Metric::Free => self.free,
        }
    }
}

#[allow(clippy::float_cmp)] // the JS compares recorder counts with `===`; so does this
fn cond(s: &LvlSample, mem: &[u8; MAX_LATCH], c: &Cond) -> bool {
    match *c {
        Cond::Latched(k) => mem[k] != 0,
        Cond::Cmp(m, op, v) => {
            let a = s.metric(m);
            match op {
                Op::Ge => a >= v,
                Op::Le => a <= v,
                Op::Gt => a > v,
                Op::Lt => a < v,
                Op::Eq => a == v,
            }
        }
    }
}

fn all(s: &LvlSample, mem: &[u8; MAX_LATCH], list: &[Cond]) -> bool {
    list.iter().all(|c| cond(s, mem, c))
}

/// `Math.round` — half away from zero towards +infinity, which is what JavaScript does.
#[inline]
fn js_round(v: f64) -> f64 {
    crate::math::floor(v + 0.5)
}

/// One meter row, evaluated: what the HUD shows beside the objective.
#[derive(Clone, Copy, Debug)]
pub struct MeterOut {
    pub label: &'static str,
    pub v: f64,
    pub goal: Option<f64>,
    pub dir: i32,
    pub unit: &'static str,
}

impl Sim {
    /// `lvlSample(back)` — the ring row `back` samples before the latest.
    pub fn lvl_sample(&self, back: usize) -> LvlSample {
        // The JS reads `(recHead - 1 - back + N) % N`; the Rust ring's `head` is likewise the next
        // write slot, so the latest written row is `row(1)`.
        let r = ((self.obs.head + REC_N - (back + 1) % REC_N) % REC_N) * REC_CH;
        let b = |k: usize| self.obs.rec[r + k] as f64;
        let mut pop = [0.0f64; 7];
        for (sp, v) in pop.iter_mut().enumerate() {
            *v = b(sp);
        }
        let total = b(14) + b(15) + b(16) + b(17);
        LvlSample {
            pop,
            free: b(14),
            lock_share: (b(16) + b(17)) / if total > 1.0 { total } else { 1.0 },
        }
    }

    /// `levelStart(def, predicted)` — found the level's world and arm the verdict loop.
    pub fn level_start(&mut self, idx: usize, predicted: i32) {
        let def = &LEVELS[idx];
        self.p.mutation = false; // experiments run on the certified silent world; the sandbox restores true
        self.p.light_mul = 1.0;
        self.reset_world();
        let mut sc = Scenario::default();
        for sp in 0..7 {
            if def.found[sp] >= 0 {
                sc.found[sp] = Some(def.found[sp]);
            }
        }
        if def.has_m0 {
            sc.m0 = Some(def.m0);
        }
        self.init_world(Some(def.seed), Some(&sc));
        if def.has_light_mul {
            self.apply_event(Event::LightMul { v: def.light_mul });
        }
        self.lvl = Lvl {
            def: idx as i32,
            state: LvlState::Running,
            run: 0,
            seen_s: 0,
            fail_why: "",
            pour_left: def.pours,
            predicted,
            mem: [0; MAX_LATCH],
        };
    }

    pub fn level_restart(&mut self) {
        if self.lvl.def >= 0 {
            let (idx, predicted) = (self.lvl.def as usize, self.lvl.predicted);
            self.level_start(idx, predicted);
        }
    }

    pub fn level_stop(&mut self) {
        self.lvl.def = -1;
        self.lvl.state = LvlState::Idle;
    }

    /// The verdict loop: walk every recorder sample exactly once, oldest first.
    pub fn level_check(&mut self) -> LvlState {
        let def = match self.lvl.def() {
            Some(d) if self.lvl.state == LvlState::Running => d,
            _ => return self.lvl.state,
        };
        let s_now = self.w.tick.div_euclid(REC_STRIDE);
        let mut news = s_now - self.lvl.seen_s;
        if news > 0 {
            if news > self.obs.count as i64 {
                news = self.obs.count as i64;
            }
            if news > REC_N as i64 {
                news = REC_N as i64;
            }
            let mut k = news - 1;
            while k >= 0 && self.lvl.state == LvlState::Running {
                let s = self.lvl_sample(k as usize);
                for l in def.latch {
                    if all(&s, &self.lvl.mem, l.when) {
                        self.lvl.mem[l.id] = 1;
                    }
                }
                let why = def
                    .fail_now
                    .iter()
                    .find(|r| all(&s, &self.lvl.mem, r.when))
                    .map(|r| r.why);
                if let Some(why) = why {
                    self.lvl.state = LvlState::Failed;
                    self.lvl.fail_why = why;
                    break;
                }
                self.lvl.run = if all(&s, &self.lvl.mem, def.pass) { self.lvl.run + 1 } else { 0 };
                if self.lvl.run >= if def.sustain != 0 { def.sustain } else { 10 } {
                    self.lvl.state = LvlState::Passed;
                }
                k -= 1;
            }
            self.lvl.seen_s = s_now;
        }
        if self.lvl.state == LvlState::Running && self.w.tick >= def.deadline {
            self.lvl.state = LvlState::Failed;
            self.lvl.fail_why = def.timeout_why;
        }
        self.lvl.state
    }

    pub fn level_allows(&self, what: Apparatus) -> bool {
        let def = match self.lvl.def() {
            Some(d) => d,
            None => return true,
        };
        match what {
            Apparatus::Pours => def.pours != 0,
            Apparatus::Seed => def.seed_all,
            Apparatus::Sources => def.sources,
            Apparatus::Walls => def.walls,
            Apparatus::Evolution => def.evolution,
        }
    }

    pub fn level_pour_ok(&self) -> bool {
        self.lvl.def < 0 || self.lvl.pour_left != 0
    }

    pub fn level_note_pour(&mut self, d: i32) {
        if self.lvl.def >= 0 && self.lvl.pour_left >= 0 {
            self.lvl.pour_left = (self.lvl.pour_left - d).max(0);
        }
    }

    /// F2: the freshest Observatory event of a type this level narrates. `None` outside a level.
    pub fn level_narration(&self) -> Option<&SysEvent> {
        let def = self.lvl.def()?;
        self.obs
            .sys_events
            .iter()
            .rev()
            .find(|e| def.narrate.iter().any(|t| *t == e.kind))
    }

    /// The HUD's meter rows for the latest sample.
    pub fn level_meter(&self) -> Vec<MeterOut> {
        let def = match self.lvl.def() {
            Some(d) if self.obs.count > 0 => d,
            _ => return Vec::new(), // no sample yet: the JS guards on W.recCount, so does this
        };
        let s = self.lvl_sample(0);
        def.meter
            .iter()
            .map(|m| MeterOut {
                label: m.label,
                v: if m.pct { js_round(s.metric(m.m) * 100.0) } else { s.metric(m.m) },
                goal: m.goal,
                dir: m.dir,
                unit: m.unit,
            })
            .collect()
    }
}
