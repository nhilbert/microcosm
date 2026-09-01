//! Impact cards — what changed *since* an intervention, and how sure we are.
//!
//! A transliteration of `src/observatory/impact.js`, which is frozen oracle code. Every threshold
//! here was measured, most of them twice: the natural-variability floors in `NOISE` exist because
//! mats barely move on their own while plankton blooms 2.5x unprovoked, so the same percentage
//! means different things for different species.
//!
//! The method is an interrupted time series. It fits the fifteen samples before the intervention as
//! a trend, extrapolates that trend forward, and credits the intervention only with the *departure*
//! from it — so a lever pulled during an ongoing decline is not credited with the decline. The
//! extrapolation is clamped at fifteen samples, because a trend should never be trusted further
//! than it was observed.
//!
//! Rule 6: the wording downstream is "since", never "because". `mixed` and `press_backdrop` exist
//! so a card can say when something else was happening at the same time.
//!
//! The interventions themselves are the shell's to log — the core cannot know that a player moved
//! a sun rather than a script — so `Sim::iv_log` is appended through the ABI and read here.

use crate::math::floor;
use crate::params::{REC_CH, REC_N, REC_STRIDE};
use crate::Sim;

/// The channels a card can report on, with the words it reports them in.
pub const CHS: [(usize, &str); 7] = [
    (0, "Solara"),
    (1, "Drifta"),
    (2, "Cilio"),
    (3, "Bacillus"),
    (6, "Venator"),
    (14, "dissolved mineral"),
    (19, "production"),
];

/// Natural-variability floors: measured, not chosen. Below these a move is weather, not effect.
fn noise(ch: usize) -> f64 {
    match ch {
        0 => 12.0,
        1 => 170.0,
        2 => 55.0,
        3 => 20.0,
        6 => 25.0,
        14 => 15.0,
        19 => 30.0,
        _ => 15.0,
    }
}

/// The interventions a shell can log, and whether each is a *press* — something that changes the
/// regime rather than poking it once. A press is given longer to show its effect and is never
/// credited with a recovery, because there is nothing to recover from.
pub const KINDS: [(&str, bool); 17] = [
    ("pour", false),
    ("kill", false),
    ("feed", false),
    ("seed", false),
    ("undo", false),
    ("source", true),
    ("sunlight", true),
    ("sourceAdd", true),
    ("sourceRemove", true),
    ("sourceSet", true),
    ("sourceLayout", true),
    ("mutation", true),
    ("evolution", true),
    ("preset", true),
    ("wallAdd", true),
    ("wallRemove", true),
    ("wallSet", true),
];

#[derive(Clone, Copy, Debug)]
pub struct IvEntry {
    pub tick: i64,
    pub kind: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    /// The intervention has fallen off the back of the recorder's ring.
    Rolled,
    /// Not enough has happened yet; `pct` is how far along the wait is.
    Watching,
    Done,
}

#[derive(Clone, Debug)]
pub struct Mover {
    pub ch: usize,
    pub name: &'static str,
    pub pct: f64,
    /// Half again past the noise floor: worth saying plainly rather than hedging.
    pub strong: bool,
}

#[derive(Clone, Debug)]
pub struct Impact {
    pub status: Status,
    pub watching_pct: f64,
    pub is_press: bool,
    pub notable: Vec<Mover>,
    /// Seconds until every notable channel was back inside 12% of its extrapolated trend, or None.
    pub recovered_s: Option<f64>,
    /// Another intervention overlapped this one's window: the card must not claim sole credit.
    pub mixed: bool,
    /// A press was already running when this pulse landed.
    pub press_backdrop: bool,
    /// The full window was available, rather than cut short by how much history there is.
    pub complete: bool,
}

impl Default for Impact {
    fn default() -> Self {
        Impact {
            status: Status::Rolled,
            watching_pct: 0.0,
            is_press: false,
            notable: Vec::new(),
            recovered_s: None,
            mixed: false,
            press_backdrop: false,
            complete: false,
        }
    }
}

#[inline]
fn js_round(v: f64) -> f64 {
    floor(v + 0.5)
}

impl Sim {
    /// One entry's card. `idx` indexes `self.iv_log`.
    pub fn impact(&self, idx: usize) -> Impact {
        let entry = match self.iv_log.get(idx) {
            Some(e) => *e,
            None => return Impact::default(),
        };
        let is_press = KINDS[entry.kind].1;
        let count = self.obs.count as i64;
        let head = self.obs.head as i64;
        let i0 = count - 1 - floor((self.w.tick - entry.tick) as f64 / REC_STRIDE as f64) as i64;
        if i0 < 15 {
            return Impact { status: Status::Rolled, is_press, ..Impact::default() };
        }
        let avail = count - 1 - i0;
        let need: i64 = if is_press { 45 } else { 30 };
        if avail < 8 {
            return Impact {
                status: Status::Watching,
                watching_pct: (99.0f64).min(js_round(100.0 * avail as f64 / need as f64)),
                is_press,
                ..Impact::default()
            };
        }
        let win = avail.min(need);
        let at = |k: i64, ch: usize| -> f64 {
            let r = ((head - count + k).rem_euclid(REC_N as i64)) as usize * REC_CH;
            self.obs.rec[r + ch] as f64
        };

        let mut base = [(0.0f64, 0.0f64, 0.0f64); 7]; // (b, slope, icpt) per CHS row
        let mut movers: Vec<Mover> = Vec::new();
        for (row, &(ch, name)) in CHS.iter().enumerate() {
            let (mut sx, mut sy, mut sxy, mut sxx) = (0.0, 0.0, 0.0, 0.0);
            for j in 0..15i64 {
                let v = at(i0 - 15 + j, ch);
                let jf = j as f64;
                sx += jf;
                sy += v;
                sxy += jf * v;
                sxx += jf * jf;
            }
            let den = 15.0 * sxx - sx * sx;
            let slope = (15.0 * sxy - sx * sy) / if den != 0.0 { den } else { 1.0 };
            let icpt = (sy - slope * sx) / 15.0;
            let b = icpt + slope * 14.0; // the baseline level at the intervention
            base[row] = (b, slope, icpt);

            let (mut a, mut ex, mut cnt) = (0.0, 0.0, 0i64);
            let from = i0 + (win - 10).max(1);
            for k in from..=(i0 + win) {
                a += at(k, ch);
                // never trust a trend farther than it was observed: clamp at 15 samples
                ex += icpt + slope * (14.0 + ((k - i0).min(15)) as f64);
                cnt += 1;
            }
            let c = if cnt != 0 { cnt as f64 } else { 1.0 };
            a /= c;
            ex /= c;
            if b < 2.0 && a < 2.0 {
                continue;
            }
            movers.push(Mover {
                ch,
                name,
                pct: js_round(100.0 * (a - ex) / (3.0f64).max(b.abs())),
                strong: false,
            });
        }
        // stable, descending by magnitude — same as Array.prototype.sort with that comparator
        movers.sort_by(|x, y| {
            y.pct
                .abs()
                .partial_cmp(&x.pct.abs())
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        let notable: Vec<Mover> = movers
            .into_iter()
            .filter(|m| m.pct.abs() >= noise(m.ch))
            .map(|m| Mover { strong: m.pct.abs() >= 1.5 * noise(m.ch), ..m })
            .take(3)
            .collect();

        let mut recovered_s = None;
        if !is_press && !notable.is_empty() {
            'outer: for k in (i0 + 5)..=(i0 + win) {
                for m in &notable {
                    let row = CHS.iter().position(|&(c, _)| c == m.ch).unwrap();
                    let (_, slope, icpt) = base[row];
                    let ex = icpt + slope * (14.0 + ((k - i0).min(15)) as f64);
                    if (at(k, m.ch) - ex).abs() > 0.12 * (1.0f64).max(ex.abs()) {
                        continue 'outer;
                    }
                }
                recovered_s = Some(js_round((k - i0) as f64 * REC_STRIDE as f64 / 10.0));
                break;
            }
        }

        // Another hand in the same window, and whether a press was already running.
        let win_ticks = win * REC_STRIDE;
        let mixed = self.iv_log.iter().enumerate().any(|(j, e)| {
            j != idx
                && KINDS[e.kind].0 != "undo"
                && e.tick > entry.tick - 600
                && e.tick < entry.tick + win_ticks
        });
        let press_backdrop = !is_press
            && self
                .iv_log
                .iter()
                .enumerate()
                .any(|(j, e)| j != idx && KINDS[e.kind].1 && e.tick < entry.tick);

        Impact {
            status: Status::Done,
            watching_pct: 0.0,
            is_press,
            notable,
            recovered_s,
            mixed,
            press_backdrop,
            complete: win >= need,
        }
    }
}
