// ---------- trait schema ----------
// Every species is one row. Field reference (the future settings screen's data dictionary):
//   identity: name, bodyTag (bitmask), layer ("plankton"|"benthic"|"fungal"|"none")
//   metabolism: kb (basal coeff), kp (photosynthesis coeff), photosynth, pSynth (E->P rate),
//               mUp (mineral uptake rate), mQm (mineral quota multiplier), torpor (fraction of cap)
//   movement: movement ("sessile"|"drift"|"steer"|"tumble") + verb parameters
//             drift: damp, noise, phototaxis, driftSpeed, moveCostMul
//             steer: speed, sense, turnRate, satiation, interfRadius, interfCost, handling
//             tumble: speed, tumbleLow, tumbleHigh, tumbleField ("detritus"|"scent")
//   trophic:  diet (bitmask of edible bodyTags), bite, digest[], digestP[] (per-prey-species),
//             detritivore {rateE,effE,rateP,effP,minRate}, corpsivore {rate,effE,effP,radius,minMass}
//   defense:  grazeFloor (ungrazeable remnant), pursuitPenalty, escape {p,kick}
//   registry: live (seeded in the shipped world), apex (top predator: reported, never required;
//             no bloom/crash detection, "hunters" wording), mat (the carpet-rendered producer)
//   lifecycle: hazard, reproFrac, spread, reproCooldown, matureCd,
//              settleLimited + settleLimit (per-guild crowding cap),
//              cyst {enter, wake:"light"|"prey"|"detritus", p, grace, scMin}, cystDrainMul
// Presence-flags (cyst, escape, detritivore, corpsivore, photosynth) double as the RNG-contract
// short-circuits: an absent capability must consume zero PRNG draws (see contract above step()).
const TRAIT_DEFAULTS = {
  mQm: 1, pSynth: 0, mUp: 0, kp: 0, kb: 0.05, torpor: 0, cystYield: 0,
  cystDrainMul: 1, tumbleField: "detritus", sense: 0,
  hazard: 0, grazeFloor: 0, pursuitPenalty: 1,
  reproCooldown: 0, matureCd: 0, spread: 20, reproFrac: 0.7,
  settleLimited: false, settleLimit: 0, photosynth: false, diet: 0,
  cyst: null, escape: null, detritivore: null, corpsivore: null, locus: null,
  flee: null, alarmEmit: 0, burst: null,
  live: true, apex: false, mat: false,
  topt: 7, ctmax: 12,   // thermal performance (7.H): gains hold to topt (warmth above ambient), fall to 0 at ctmax; costs never fall
  thermo: 0,            // thermotaxis gain (7.H.2): how strongly this species moves toward its preferred warmth (tpref = topt); 0 = blind to it
};
const CYST_DEFAULTS = { scMin: 0.03 };
const CORPSIVORE_DEFAULTS = { minMass: 0, maxMass: 1e9, dietOnly: false };
// Locus effects: each slope is an exact no-op at 0, so a species expresses only the ones its row names.
//   escSlope   prey escape.p  + escSlope*(g-g0)         kpSlope   kp * (1 + kpSlope*(g0-g))
//   catchSlope prey's escape chance against THIS hunter x (1 + catchSlope*(g0-g))
//   kbSlope    basal cost kb * (1 + kbSlope*(g-g0))     (the price of keenness)
//   lightSlope photosynthesis x (1 + lightSlope*(g-g0)*(1-2L)), L = cell light: shade-adapted (g>g0)
//              gains in the dark and loses in the sun -- priced by the light field itself
//   curve      diminishing returns: EVERY expressed effect of the locus is reduced by curve*(g-g0)^2.
//              A linear trade-off is a knife-edge (the population sweeps to whichever rail has the
//              larger marginal value); concavity gives an interior optimum whose position the
//              ecology sets. See docs/genetics-scaling.md. 0 = the original linear form.
//   rateSlope  detritivore feeding rate x (1 + rateSlope*(g-g0))   effSlope   yield effE x (1 - effSlope*(g-g0))
//              the rate-yield trade-off of microbial metabolism (Pfeiffer, Schuster & Bonhoeffer 2001)
//   warmSlope  upkeep's warmth response down-regulated: maintenance x (1 - warmSlope*(g-g0)*dT/10) --
//              Padfield's respiration-Q10 compensation (7.H.5). warmGainSlope prices it: the species'
//              warmth-SCALED gain (photosynthesis for the drifter, decomposition for the decomposer)
//              x (1 - warmGainSlope*(g-g0)*dT/10). Both exactly 1 at dT <= 0: a locus expressing only
//              these is warmth-gated (warmGated, derived) -- invisible until the world warms.
const LOCUS_DEFAULTS = { sigma: 0, escSlope: 0, kpSlope: 0, catchSlope: 0, kbSlope: 0, lightSlope: 0, rateSlope: 0, effSlope: 0, warmSlope: 0, warmGainSlope: 0, curve: 0 };
// Multi-locus (Phase 7): a species row carries `locus` (its first, display locus) and optionally
// `loci: [...]` for the rest; the loader flattens both into t.loci, ordered — LOCUS ORDER IS PART OF
// THE RNG CONTRACT (one mutation draw per locus, in order, at every division). t.locus stays an alias
// for loci[0]: the display locus that drives tint, the single-locus channels and the legacy harness reads.
const MAXLOCI = 4; // W.g is sized MAXLOCI planes of MAXN; raising it is a storage change, not an ecology change
function normalizeTraits(rows){
  for (const t of rows){
    for (const k in TRAIT_DEFAULTS) if (t[k] === undefined) t[k] = TRAIT_DEFAULTS[k];
    if (t.cyst) for (const k in CYST_DEFAULTS) if (t.cyst[k] === undefined) t.cyst[k] = CYST_DEFAULTS[k];
    if (t.corpsivore) for (const k in CORPSIVORE_DEFAULTS) if (t.corpsivore[k] === undefined) t.corpsivore[k] = CORPSIVORE_DEFAULTS[k];
    t.loci = (t.locus ? [t.locus] : []).concat(t.loci || []);
    if (t.loci.length > MAXLOCI) throw new Error(t.name+" carries "+t.loci.length+" loci; W.g holds "+MAXLOCI);
    for (const L of t.loci){
      for (const k in LOCUS_DEFAULTS) if (L[k] === undefined) L[k] = LOCUS_DEFAULTS[k];
      L.warmGated = !(L.escSlope || L.kpSlope || L.catchSlope || L.kbSlope || L.lightSlope || L.rateSlope || L.effSlope)
        && !!(L.warmSlope || L.warmGainSlope); // expressed only through warmth: the narration detectors stay silent in an unwarmed world
      checkLocus(t, L);
    }
    t.locus = t.loci.length ? t.loci[0] : null;
  }
  return rows;
}
// Load-time guardrail: every multiplier a locus can express must stay inside [LOCUS_MULT_MIN, LOCUS_MULT_MAX]
// across the whole corridor, curvature included. A typo in a slope fails here, not in a 54k-tick run.
const LOCUS_MULT_MIN = 0.3, LOCUS_MULT_MAX = 3.0;
function checkLocus(t, L){
  const bad = [];
  for (const g of [0, 0.25, 0.5, 0.75, 1]){
    const d = g - L.g0, q = L.curve*d*d;
    const mults = { kb: 1 + L.kbSlope*d - q, kp: 1 - L.kpSlope*d - q, catch: 1 - L.catchSlope*d - q,
      rate: 1 + L.rateSlope*d - q, eff: 1 - L.effSlope*d - q,
      lightDark: 1 + L.lightSlope*d - q, lightBright: 1 - L.lightSlope*d - q,
      warmCost: 1 - L.warmSlope*d*1.5, warmGain: 1 - L.warmGainSlope*d*1.5, // at the hottest legal source (dT 15)
      escape: t.escape ? (t.escape.p + L.escSlope*d - t.escape.p*L.curve*d*d)/t.escape.p : 1 };
    for (const k in mults) if (!(mults[k] >= LOCUS_MULT_MIN && mults[k] <= LOCUS_MULT_MAX)) bad.push(k+"@g="+g+"="+mults[k].toFixed(2));
  }
  if (bad.length) throw new Error("locus on "+t.name+" expresses a multiplier outside ["+LOCUS_MULT_MIN+","+LOCUS_MULT_MAX+"]: "+bad.join(" "));
}
// ---------- the species table: src/sim/species.json, inlined by tools/build.py as SPECIES_ROWS ----------
// Row order is the species index and part of the RNG contract; never reorder. Tag names resolve to
// bitmasks here so the JSON stays plain data a settings screen or a native port can read unchanged.
function resolveRow(row){
  const t = { ...row };
  t.bodyTag = TAG[row.bodyTag];
  if (t.bodyTag === undefined) throw new Error("species.json: unknown bodyTag "+row.bodyTag+" on "+row.name);
  t.diet = (row.diet || []).reduce((m, n) => { if (TAG[n] === undefined) throw new Error("species.json: unknown diet tag "+n+" on "+row.name); return m | TAG[n]; }, 0);
  return t;
}
const TRAITS = normalizeTraits(SPECIES_ROWS.map(resolveRow));
// ---------- species registry (derived from TRAITS; the one place that knows which index is what) ----------
const SPECIES = {
  ALL: TRAITS.map((_, sp) => sp),
  LIVE: TRAITS.map((T, sp) => T.live ? sp : -1).filter(sp => sp >= 0),          // seeded in the shipped world
  CORE: TRAITS.map((T, sp) => T.live && !T.apex ? sp : -1).filter(sp => sp >= 0), // the ecosystem criterion
  APEX: TRAITS.findIndex(T => T.apex),
  MAT: TRAITS.findIndex(T => T.mat),
  LOCI: TRAITS.map((T, sp) => T.locus ? sp : -1).filter(sp => sp >= 0),
  // the Yoshida pair: the evolving prey and the grazer that eats it (harness experiments and gate5)
  PREY: 1, GRAZER: 2,
};
