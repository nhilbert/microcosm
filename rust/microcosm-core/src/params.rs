//! Global constants and the mutable run settings — `P` in `src/sim/params.js`.
//!
//! Values that the JS core never writes are `const` here; the handful the harnesses and events do
//! write (`lightMul`, `mutation`, `spawnDecomposers`, `tempAmb`) live in [`Params`], which is part
//! of the saved state.

pub const WORLD: f64 = 1024.0;
pub const GRID: usize = 64;
pub const GRID_I: i32 = GRID as i32;
pub const GRID_MASK: i32 = GRID_I - 1;
pub const NCELL: usize = GRID * GRID;
/// `P.WORLD / P.GRID` — exactly 16, and exact in binary, so the division never rounds.
pub const CELL: f64 = WORLD / GRID as f64;

pub const MAXN: usize = 6000;
/// `W.g` is MAXLOCI planes of MAXN (src/sim/traits.js): raising it is a storage change.
pub const MAXLOCI: usize = 4;
pub const MAXCORPSE: usize = 1500;

/// Ring-buffer geometry (`REC` in src/sim/world.js) — sized here because `W.rec` is sized from it.
pub const REC_N: usize = 900;
pub const REC_STRIDE: i64 = 20;
pub const REC_CH: usize = 141;

/// MV-C post-capture window: afterglow / relocate phase lengths, in ticks (`src/sim/step.js`).
pub const PC_A: i32 = 30;
pub const PC_B: i32 = 30;

/// Body tags are a bitmask; a predator's diet is the OR of the tags it can eat.
pub mod tag {
    pub const SOLARA: i32 = 1;
    pub const DRIFTA: i32 = 2;
    pub const CILIO: i32 = 4;
    pub const BACILLUS: i32 = 8;
    pub const MYCORA: i32 = 16;
    pub const NECRO: i32 = 32;
    pub const VENATOR: i32 = 64;
}

/// Q10 per process (7.H): maintenance steeper than photosynthesis, decomposition in between,
/// handling shortens, pursuit rises less than cost, attack flatter than maintenance (7.H.4).
#[derive(Clone, Copy, Debug)]
pub struct Q10 {
    pub resp: f64,
    pub photo: f64,
    pub decomp: f64,
    pub handling: f64,
    pub pursuit: f64,
    pub attack: f64,
}

#[derive(Clone, Debug)]
pub struct Params {
    // --- light and warmth sources
    pub sun_sigma: f64,
    pub sun_i: f64,
    pub ambient: f64,
    pub max_sources: usize,
    pub max_walls: usize,
    /// Ambient warmth (7.H). Every Q10 factor is exactly 1 at dT = 0.
    pub temp_amb: f64,
    pub q10: Q10,
    // --- crowding and shading
    pub div_plank: f64,
    pub div_benth: f64,
    pub shade_max: f64,
    // --- metabolism
    pub move_cost: f64,
    pub cap_mul: f64,
    pub invest: f64,
    pub mut_sigma: f64,
    /// Press lever 4.2b: sun-intensity multiplier.
    pub light_mul: f64,
    /// K6 experiment switch: false runs the world without its recycling guild.
    pub spawn_decomposers: bool,
    /// Phase 5 switch: false = silent genome (every locus pinned at its g0) — the certified
    /// reference world for conformance.
    pub mutation: bool,
    // --- mineral cycle (2.2): stock-constrained, strictly conserved
    pub m0: f64,
    pub m_diff: f64,
    pub m_quota: f64,
    pub m_cap_mul: f64,
    pub m_repro_min: f64,
    // --- protein and detritus (2.3)
    pub p_quota: f64,
    pub p_repro_min: f64,
    pub p_synth_eff: f64,
    pub d_leach: f64,
    // --- corpses (2.4)
    pub s_body: f64,
    pub corpse_decay: f64,
    pub scent_emit: f64,
    pub scent_decay: f64,
    pub scent_diff: f64,
    pub seed: i32,
}

impl Default for Params {
    fn default() -> Self {
        Params {
            sun_sigma: 210.0,
            sun_i: 1.0,
            ambient: 0.03,
            max_sources: 4,
            max_walls: 8,
            temp_amb: 0.0,
            q10: Q10 {
                resp: 2.5,
                photo: 1.6,
                decomp: 2.0,
                handling: 0.65,
                pursuit: 1.3,
                attack: 1.8,
            },
            div_plank: 70.0,
            div_benth: 150.0,
            shade_max: 0.95,
            move_cost: 0.003,
            cap_mul: 10.0,
            invest: 0.5,
            mut_sigma: 0.08,
            light_mul: 1.0,
            spawn_decomposers: true,
            mutation: true,
            m0: 2.2,
            m_diff: 0.22,
            m_quota: 0.6,
            m_cap_mul: 1.2,
            m_repro_min: 0.5,
            p_quota: 0.5,
            p_repro_min: 0.5,
            p_synth_eff: 0.6,
            d_leach: 0.0015,
            s_body: 1.0,
            corpse_decay: 0.008,
            scent_emit: 0.015,
            scent_decay: 0.97,
            scent_diff: 0.12,
            seed: 77,
        }
    }
}
