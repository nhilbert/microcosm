//! The species table — `TRAITS` in `src/sim/traits.js`.
//!
//! Row order is the species index and part of the RNG contract; never reorder. The table itself is
//! generated into `species_gen.rs` by `tools/gen-species-rs.js`, which reads the *normalized* rows
//! out of the built JS core (`dist/core.js`) rather than re-implementing `normalizeTraits` here.
//! That is deliberate: defaults, the diet bitmask fold, the `loci` flattening and the derived
//! `warmGated` flag are then the same values by construction, not by careful copying.
//!
//! Fields a row does not carry default to 0/false, exactly as `undefined` reads in the guarded JS
//! sites (`T.hazard && ...`, `T.thermo && ...`): a capability a species lacks must consume zero
//! PRNG draws, which is why those guards are the RNG contract's short-circuits.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Movement {
    Sessile,
    Drift,
    Steer,
    Tumble,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Layer {
    None,
    Plankton,
    Benthic,
    Fungal,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Wake {
    Light,
    Prey,
    Detritus,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TumbleField {
    Detritus,
    Scent,
}

/// One heritable locus. Every slope is an exact no-op at 0, so a species expresses only the ones
/// its row names; `curve` reduces every expressed effect by `curve*(g-g0)^2`.
#[derive(Clone, Copy, Debug, Default)]
pub struct Locus {
    pub g0: f64,
    pub sigma: f64,
    pub esc_slope: f64,
    pub kp_slope: f64,
    pub catch_slope: f64,
    pub kb_slope: f64,
    pub light_slope: f64,
    pub rate_slope: f64,
    pub eff_slope: f64,
    pub warm_slope: f64,
    pub warm_gain_slope: f64,
    pub tpref_span: f64,
    pub damp_span: f64,
    pub pc_speed_slope: f64,
    pub pc_turn_slope: f64,
    pub tumble_slope: f64,
    pub curve: f64,
    /// Expressed only through warmth: the narration detectors stay silent in an unwarmed world.
    pub warm_gated: bool,
    /// Player-facing names for this axis — the observatory narrates with them ("a tougher Drifta
    /// line is taking over"). Part of the trait row because the words belong to the trait, not to
    /// any one renderer.
    pub label: &'static str,
    pub hi_word: &'static str,
    pub lo_word: &'static str,
}

#[derive(Clone, Copy, Debug)]
pub struct Cyst {
    pub enter: f64,
    pub wake: Wake,
    pub p: f64,
    pub grace: f64,
    pub sc_min: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct Escape {
    pub p: f64,
    pub kick: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct Detritivore {
    pub rate_e: f64,
    pub eff_e: f64,
    pub rate_p: f64,
    pub eff_p: f64,
    pub min_rate: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct Corpsivore {
    pub rate: f64,
    pub eff_e: f64,
    pub eff_p: f64,
    pub radius: f64,
    pub min_mass: f64,
    pub max_mass: f64,
    pub diet_only: bool,
}

#[derive(Clone, Copy, Debug)]
pub struct Flee {
    pub sense: f64,
    pub dur: f64,
    pub speed_mul: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct Burst {
    pub mul: f64,
    pub dur: f64,
    pub cd: f64,
    pub range: f64,
}

#[derive(Clone, Debug)]
pub struct Species {
    pub name: &'static str,
    pub body_tag: i32,
    pub layer: Layer,
    pub movement: Movement,
    // metabolism
    pub photosynth: bool,
    pub kp: f64,
    pub kb: f64,
    pub m_up: f64,
    pub m_qm: f64,
    pub p_synth: f64,
    pub torpor: f64,
    pub cyst_yield: f64,
    pub cyst_drain_mul: f64,
    // movement verbs
    pub damp: f64,
    pub noise: f64,
    pub phototaxis: f64,
    pub drift_speed: f64,
    pub move_cost_mul: f64,
    pub speed: f64,
    pub sense: f64,
    pub turn_rate: f64,
    pub satiation: f64,
    pub interf_radius: f64,
    pub interf_cost: f64,
    pub handling: f64,
    pub tumble_low: f64,
    pub tumble_high: f64,
    pub tumble_field: TumbleField,
    // trophic
    pub diet: i32,
    pub bite: f64,
    pub digest: [f64; 7],
    pub digest_p: [f64; 7],
    // defense
    pub graze_floor: f64,
    pub pursuit_penalty: f64,
    pub alarm_emit: f64,
    // thermal (7.H)
    pub topt: f64,
    pub ctmax: f64,
    pub thermo: f64,
    // lifecycle
    pub hazard: f64,
    pub repro_frac: f64,
    pub spread: f64,
    pub repro_cooldown: f64,
    pub mature_cd: f64,
    pub settle_limited: bool,
    pub settle_limit: f64,
    // optional capabilities — `None` is the RNG-contract short-circuit
    pub cyst: Option<Cyst>,
    pub escape: Option<Escape>,
    pub detritivore: Option<Detritivore>,
    pub corpsivore: Option<Corpsivore>,
    pub flee: Option<Flee>,
    pub burst: Option<Burst>,
    // registry
    pub live: bool,
    pub apex: bool,
    pub mat: bool,
    pub loci: Vec<Locus>,
}

impl Species {
    /// `T.locus` — the display locus, an alias for `loci[0]`.
    #[inline]
    pub fn locus(&self) -> Option<&Locus> {
        self.loci.first()
    }
}

/// Derived registry — `SPECIES` in traits.js, the one place that knows which index is what.
#[derive(Clone, Debug)]
pub struct Registry {
    pub all: Vec<usize>,
    pub live: Vec<usize>,
    /// The ecosystem criterion: live and not apex.
    pub core: Vec<usize>,
    pub apex: i32,
    pub mat: i32,
    pub loci: Vec<usize>,
    pub mobile: Vec<usize>,
    pub prey: usize,
    pub grazer: usize,
}

impl Registry {
    pub fn build(tr: &[Species]) -> Registry {
        Registry {
            all: (0..tr.len()).collect(),
            live: (0..tr.len()).filter(|&sp| tr[sp].live).collect(),
            core: (0..tr.len())
                .filter(|&sp| tr[sp].live && !tr[sp].apex)
                .collect(),
            apex: tr.iter().position(|t| t.apex).map_or(-1, |v| v as i32),
            mat: tr.iter().position(|t| t.mat).map_or(-1, |v| v as i32),
            loci: (0..tr.len()).filter(|&sp| !tr[sp].loci.is_empty()).collect(),
            mobile: (0..tr.len())
                .filter(|&sp| tr[sp].live && tr[sp].movement != Movement::Sessile)
                .collect(),
            prey: 1,
            grazer: 2,
        }
    }
}
