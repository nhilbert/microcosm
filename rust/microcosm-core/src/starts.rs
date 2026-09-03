//! Sandbox start worlds ("Anfangswelten") — the ponds the front door offers.
//!
//! Before this table the sandbox had exactly one opening: the shipped pond on a random seed. A
//! sandbox with one opening teaches one lesson. These are the others.
//!
//! Three promises, and they are the same three the learning levels make (`levels.rs`):
//!
//! * **A start is data.** The table below is the only definition. The shell reads it as JSON
//!   (`mc_starts_json`) for keys, and every harness reads the same JSON for the numbers it
//!   sweeps — so a calibration is a measurement OF WHAT SHIPS, not of a transcription of it.
//! * **Setup composes only the legal entry points** — the `init_world` scenario (draw-free when
//!   absent) and `apply_event`. Nothing here reaches into the world behind the events' backs, so
//!   a start world is exactly a world a player could have built by hand. `pond` composes NOTHING
//!   and is therefore the certified world, bit for bit: `harness/starts.js --check` proves it.
//! * **A start is calibrated or it does not ship.** `harness/starts.js` runs every row over the
//!   eight acceptance seeds to the 18,000-tick horizon and holds it to the criterion its own row
//!   declares. Measured numbers and the sweeps behind the values are in docs/phase9-starts.md.
//!
//! What a start may NOT do: touch `p.mutation` (the Evolution panel is the player's, and a reset
//! must not silently re-arm it), or leave anything in the undo slot (the world's own founding is
//! not the player's last move).

use crate::events::{Event, Undo};
use crate::fields::WallSpec;
use crate::{Scenario, Sim};

/// A source as a start declares it. Row 0 RE-SHAPES the sun `init_world` founded (so founding
/// still happens around the world's centre, exactly as the certified world does); every further
/// row is added.
#[derive(Clone, Copy, Debug)]
pub struct Sun {
    pub x: f64,
    pub y: f64,
    /// Light amplitude (clamped to [0, 1.5] by the event).
    pub i: f64,
    /// Warmth amplitude (clamped to [-8, 15]).
    pub a: f64,
    /// Falloff (clamped to [90, 300]).
    pub sigma: f64,
}

/// A founding colony, seeded exactly as the player's own seeding tool seeds one.
#[derive(Clone, Copy, Debug)]
pub struct Pack {
    pub sp: usize,
    pub x: f64,
    pub y: f64,
}

pub struct Start {
    /// Stable identity. The shell's player text (title, subtitle) is keyed by this, never by index.
    pub key: &'static str,
    /// Per-species founding count, `-1` = the shipped literal.
    pub found: [i32; 7],
    /// Starting mineral per cell; `None` = `P.M0`.
    pub m0: Option<f64>,
    /// The sky. Empty = the founded sun, untouched.
    pub sky: &'static [Sun],
    /// Walls, built before the first tick.
    pub walls: &'static [WallSpec],
    /// Colonies seeded after the walls stand.
    pub packs: &'static [Pack],
}

/// Fine mesh: plankton and microbes pass, hunters do not (the property `harness/walls.js`
/// measured as `--hideout`).
const MESH: i32 = 1 | 2 | 8;

pub static STARTS: &[Start] = &[
    // 0 — the certified pond. Composes nothing at all: this row IS `initWorld(seed)`.
    Start {
        key: "pond",
        found: [-1; 7],
        m0: None,
        sky: &[],
        walls: &[],
        packs: &[],
    },
    // 1 — still water: the mineral is there, the sun is there, nobody is home.
    Start {
        key: "still",
        found: [0, 0, 0, 0, 0, 0, 0],
        m0: None,
        sky: &[],
        walls: &[],
        packs: &[],
    },
    // 2 — two suns, two pools, a dim strait between them.
    Start {
        key: "twosuns",
        found: [-1; 7],
        m0: None,
        sky: &[
            Sun { x: 256.0, y: 512.0, i: 1.1, a: 0.0, sigma: 140.0 },
            Sun { x: 768.0, y: 512.0, i: 1.1, a: 0.0, sigma: 140.0 },
        ],
        walls: &[],
        packs: &[],
    },
    // 3 — the refuge: a fine-mesh pen on the sun's flank.
    Start {
        key: "refuge",
        found: [-1; 7],
        m0: None,
        sky: &[],
        walls: &[
            WallSpec { x0: 352.0, y0: 544.0, dx: 128.0, dy: 0.0, lt: 0.9, ht: 0.9, fl: 0.7, pass: MESH },
            WallSpec { x0: 480.0, y0: 544.0, dx: 0.0, dy: 128.0, lt: 0.9, ht: 0.9, fl: 0.7, pass: MESH },
            WallSpec { x0: 480.0, y0: 672.0, dx: -128.0, dy: 0.0, lt: 0.9, ht: 0.9, fl: 0.7, pass: MESH },
            WallSpec { x0: 352.0, y0: 672.0, dx: 0.0, dy: -128.0, lt: 0.9, ht: 0.9, fl: 0.7, pass: MESH },
        ],
        packs: &[],
    },
    // 4 — lean water: the same sun over a pond with less matter in it. What limits life here is
    // not the light but the mineral, and the pour lever finally has something to say.
    Start {
        key: "shallows",
        found: [-1; 7],
        m0: Some(1.7),
        sky: &[],
        walls: &[],
        packs: &[],
    },
];

/// Found one of the start worlds on `seed`, through the legal entry points and in this order:
/// scenario founding, sky, walls, colonies. Nothing else.
pub fn start_apply(sim: &mut Sim, idx: usize, seed: i32) {
    let s = match STARTS.get(idx) {
        Some(s) => s,
        None => return,
    };
    sim.reset_world();
    let composes = s.found.iter().any(|c| *c >= 0) || s.m0.is_some();
    if composes {
        let mut sc = Scenario::default();
        for sp in 0..7 {
            if s.found[sp] >= 0 {
                sc.found[sp] = Some(s.found[sp]);
            }
        }
        sc.m0 = s.m0;
        sim.init_world(Some(seed), Some(&sc));
    } else {
        // draw-free: `pond` must be `initWorld(seed)` and nothing else
        sim.init_world(Some(seed), None);
    }
    for (k, sun) in s.sky.iter().enumerate() {
        if k == 0 {
            sim.apply_event(Event::Source { k: 0, x: sun.x, y: sun.y });
            sim.apply_event(Event::SourceSet {
                k: 0,
                i: Some(sun.i),
                a: Some(sun.a),
                sigma: Some(sun.sigma),
            });
        } else {
            sim.apply_event(Event::SourceAdd {
                x: sun.x,
                y: sun.y,
                i: Some(sun.i),
                a: Some(sun.a),
                sigma: Some(sun.sigma),
                at: None,
            });
        }
    }
    for w in s.walls {
        sim.apply_event(Event::WallAdd { spec: *w, at: None });
    }
    for p in s.packs {
        sim.apply_event(Event::SpawnPack { sp: p.sp, x: p.x, y: p.y });
    }
    // The world's own founding is not the player's last move, and it is not an intervention.
    sim.undo = Undo::None;
    sim.iv_log.clear();
}

/// The table as JSON — one definition, read by the shell (for keys) and by the harness (for the
/// numbers it sweeps). Built from `STARTS`, never written by hand.
pub fn starts_json() -> String {
    let n = |v: f64| {
        let s = format!("{}", v);
        if s.ends_with(".0") { s[..s.len() - 2].to_string() } else { s }
    };
    let mut out = String::from("[");
    for (k, s) in STARTS.iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        out.push_str(&format!("{{\"key\":\"{}\",\"found\":[", s.key));
        for (i, c) in s.found.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            out.push_str(&format!("{}", c));
        }
        out.push(']');
        if let Some(m) = s.m0 {
            out.push_str(&format!(",\"M0\":{}", n(m)));
        }
        out.push_str(",\"sky\":[");
        for (i, s2) in s.sky.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            out.push_str(&format!(
                "{{\"x\":{},\"y\":{},\"i\":{},\"a\":{},\"sigma\":{}}}",
                n(s2.x), n(s2.y), n(s2.i), n(s2.a), n(s2.sigma)
            ));
        }
        out.push_str("],\"walls\":[");
        for (i, w) in s.walls.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            out.push_str(&format!(
                "{{\"x0\":{},\"y0\":{},\"dx\":{},\"dy\":{},\"lt\":{},\"ht\":{},\"fl\":{},\"pass\":{}}}",
                n(w.x0), n(w.y0), n(w.dx), n(w.dy), n(w.lt), n(w.ht), n(w.fl), w.pass
            ));
        }
        out.push_str("],\"packs\":[");
        for (i, p) in s.packs.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            out.push_str(&format!("{{\"sp\":{},\"x\":{},\"y\":{}}}", p.sp, n(p.x), n(p.y)));
        }
        out.push_str("]}");
    }
    out.push(']');
    out
}
