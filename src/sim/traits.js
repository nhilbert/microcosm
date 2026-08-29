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
};
const CYST_DEFAULTS = { scMin: 0.03 };
const CORPSIVORE_DEFAULTS = { minMass: 0, maxMass: 1e9, dietOnly: false };
function normalizeTraits(rows){
  for (const t of rows){
    for (const k in TRAIT_DEFAULTS) if (t[k] === undefined) t[k] = TRAIT_DEFAULTS[k];
    if (t.cyst) for (const k in CYST_DEFAULTS) if (t.cyst[k] === undefined) t.cyst[k] = CYST_DEFAULTS[k];
    if (t.corpsivore) for (const k in CORPSIVORE_DEFAULTS) if (t.corpsivore[k] === undefined) t.corpsivore[k] = CORPSIVORE_DEFAULTS[k];
  }
  return rows;
}
const TRAITS = normalizeTraits([
  { // 0 — Solara: sessile benthic producer (mats)
    name: "Solara", bodyTag: TAG.SOLARA, layer: "benthic",
    movement: "sessile", photosynth: true, kp: 0.12, kb: 0.05, mUp: 0.22, mQm: 0.65, pSynth: 0.10,
    hazard: 0.0012, grazeFloor: 35, pursuitPenalty: 1.8,
    reproFrac: 0.70, spread: 70, settleLimited: true, settleLimit: 90,
    reproCooldown: 0, matureCd: 0, diet: 0, cyst: null, escape: null,
  },
  { // 1 — Drifta: drifting planktonic producer
    name: "Drifta", bodyTag: TAG.DRIFTA, layer: "plankton",
    movement: "drift", photosynth: true, kp: 0.30, kb: 0.05, mUp: 0.60, mQm: 1.0, pSynth: 0.08,
    hazard: 0, grazeFloor: 0, pursuitPenalty: 1.0,
    damp: 0.96, noise: 0.09, phototaxis: 0.035, driftSpeed: 0.5, moveCostMul: 0.3,
    reproFrac: 0.70, spread: 20, settleLimited: false,
    reproCooldown: 0, matureCd: 0, diet: 0,
    cyst: { enter: 0.18, wake: "light", p: 0.015, grace: 60 },
    escape: { p: 0.35, kick: 16 },
    // Phase 5 heredity: one locus, the Yoshida trade-off as antagonistic pleiotropy.
    // g in [0,1]; defense (escape) rises with g, growth (kp) falls. At g0 the world
    // is EXACTLY the certified baseline: silent genome = bit-identical world.
    locus: { g0: 0.5, sigma: 0.03, escSlope: 0.22, kpSlope: 0.25 },  // defense must cost: cheap defense sweeps to the rail and starves the apex
  },
  { // 2 — Cilio: steering grazer
    name: "Cilio", bodyTag: TAG.CILIO, layer: "none",
    movement: "steer", photosynth: false, kp: 0, kb: 0.05,
    hazard: 0, grazeFloor: 0, pursuitPenalty: 1.0,
    mQm: 1.0, alarmEmit: 0.25,
    flee: { sense: 0.06, speedMul: 1.15, dur: 25 },
    speed: 2.0, sense: 42, turnRate: 0.35, bite: 8,
    digest:  [0.10, 0.5, 0, 0.25, 0, 0, 0],  // energy absorption per prey species (Bacillus = survival food)
    digestP: [0.20, 0.5, 0, 0.40, 0, 0, 0],
    satiation: 0.85, torpor: 0.3, interfRadius: 40, interfCost: 0.05, handling: 14,
    reproFrac: 0.90, spread: 20, settleLimited: false,
    reproCooldown: 160, matureCd: 200,
    diet: TAG.SOLARA | TAG.DRIFTA | TAG.BACILLUS,
    cyst: { enter: 0.22, wake: "prey", p: 0.02, grace: 100 },
    escape: { p: 0.30, kick: 22 },
  },
  { // 3 — Bacillus: detritivorous colony (decomposer). Its job: shrink the locked pool.
    name: "Bacillus", bodyTag: TAG.BACILLUS, layer: "none", cystYield: 0.5, grazeFloor: 4,
    movement: "tumble", photosynth: false, kp: 0, kb: 0.05,
    mUp: 0, mQm: 0.8, pSynth: 0,
    hazard: 0, pursuitPenalty: 1.6,
    speed: 0.8, tumbleLow: 0.05, tumbleHigh: 0.35, tumbleField: "detritus",
    detritivore: { rateE: 0.5, effE: 0.6, rateP: 0.15, effP: 0.7, minRate: 0.15 },
    reproFrac: 0.70, spread: 15, settleLimited: false,
    reproCooldown: 0, matureCd: 0, diet: 0,
    cyst: { enter: 0.20, wake: "detritus", p: 0.03, grace: 60 },
    escape: null,
  },
  { // 4 - Mycora: sessile fungus. Best digestion in the world; pays for it with immobility.
    name: "Mycora", bodyTag: TAG.MYCORA, layer: "fungal",
    movement: "sessile", photosynth: false, kp: 0, kb: 0.04, cystDrainMul: 0.3,
    mUp: 0, mQm: 0.8, pSynth: 0,
    hazard: 0.0008, grazeFloor: 0, pursuitPenalty: 1.0,
    detritivore: { rateE: 0.2, effE: 0.55, rateP: 0.1, effP: 0.8, minRate: 0.08 },
    corpsivore: { rate: 0.35, effE: 0.7, effP: 0.8, radius: 14 },
    reproFrac: 0.75, spread: 120, settleLimited: true, settleLimit: 70,
    reproCooldown: 120, matureCd: 0, diet: 0,
    cyst: { enter: 0.25, wake: "detritus", p: 0.03, grace: 60 },
    escape: null,
  },
  { // 5 - Necro: scavenger. Follows the death-scent; starves in paradise, thrives after crashes.
    name: "Necro", bodyTag: TAG.NECRO, layer: "none",
    movement: "tumble", tumbleField: "scent", photosynth: false, kp: 0, kb: 0.035, torpor: 0.35,
    mUp: 0, mQm: 1.0, pSynth: 0,
    hazard: 0, grazeFloor: 0, pursuitPenalty: 1.0,
    speed: 1.4, tumbleLow: 0.04, tumbleHigh: 0.30, cystDrainMul: 0.25,
    corpsivore: { rate: 0.5, effE: 0.55, effP: 0.6, radius: 12, minMass: 5.0, maxMass: 15 }, // carcass dominance: fresh kills belong to the killer; the scavenger takes remains and mat-fall
    reproFrac: 0.80, spread: 20, settleLimited: false,
    reproCooldown: 120, matureCd: 150, diet: 0,
    cyst: { enter: 0.22, wake: "detritus", p: 0.02, grace: 80, scMin: 0.012 },
    escape: null,
  },
  { // 6 — Venator: pursuit predator. Fast in a straight line, outturned by its prey.
    name: "Venator", bodyTag: TAG.VENATOR, layer: "none",
    movement: "steer", photosynth: false, kb: 0.04,
    mQm: 1.0, alarmEmit: 0.3,
    speed: 2.4, sense: 50, turnRate: 0.30, bite: 14,
    burst: { mul: 1.8, dur: 6, cd: 60, range: 30 },
    digest:  [0, 0, 0.80, 0, 0, 0, 0],   // meat digests well: that is why predation pays
    digestP: [0, 0, 0.70, 0, 0, 0, 0],
    corpsivore: { rate: 1.2, effE: 0.8, effP: 0.7, radius: 14, minMass: 5, dietOnly: true }, // finishes carcasses of its PREY only — carrion subsidy from mat-fall belongs to Necro
    satiation: 0.85, torpor: 0.3, interfRadius: 80, interfCost: 0.25, handling: 30,
    reproFrac: 0.92, spread: 25, settleLimited: false,
    reproCooldown: 700, matureCd: 700,
    diet: TAG.CILIO,
    cyst: { enter: 0.25, wake: "prey", p: 0.02, grace: 120 },
    cystDrainMul: 0.3,
    escape: null,
  },
]);

