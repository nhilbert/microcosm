// ============================================================
// PORTABILITY BOUNDARY — SIM CORE (framework-free, no DOM/React).
// Everything down to the RENDER/UI marker ports verbatim to a
// WebView wrapper or React Native, and serves as the reference
// implementation for a native (Kotlin) rewrite. tune2.js drives
// this exact file as the conformance suite for any port.
//
// SPECIES AS DATA (Phase 2.1): all species-specific behavior lives
// in TRAITS; systems dispatch on traits, never on species ids.
// The step loop consumes the PRNG in exactly the order of the
// Phase 1 implementation — verified bit-exact by the 8-seed harness.
// ============================================================
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const P = {
  WORLD: 1024, GRID: 64,
  sunSigma: 210, sunI: 1.0, ambient: 0.03,   // defaults for the shipped sun and for every sun the player adds (7.L)
  maxSources: 4,    // energy sources (W.sources): light i and warmth a per source; the shipped world has one sun, centred
  maxWalls: 8,      // walls (7.W): face barriers with light/warmth/flow transmission and per-species passage
  tempAmb: 0,       // ambient warmth (Phase 7 H; the global press is deferred) -- every Q10 factor is exactly 1 at dT = 0
  // Q10 per process (7.H, phase7-heat-plan.md §3): maintenance steeper than photosynthesis (E 0.65 vs 0.32 eV),
  // decomposition in between, handling time shortens, pursuit speed rises less than cost. The separation is the content.
  // attack (7.H.4): ingestion rises with warmth (Rall E ~0.45 eV) but flatter than maintenance -- the eater still loses.
  q10: { resp: 2.5, photo: 1.6, decomp: 2.0, handling: 0.65, pursuit: 1.3, attack: 1.8 },
  divPlank: 70, divBenth: 150, shadeMax: 0.95,
  moveCost: 0.003, capMul: 10, invest: 0.5,
  mutSigma: 0.08,  // (settleLimit moved to per-trait rows in 3.0b)
  lightMul: 1.0,    // press lever 4.2b: sun intensity multiplier
  spawnDecomposers: true,  // K6 experiment switch: false = run the world without its recycling guild
  mutation: true,   // Phase 5 switch: false = silent genome (every locus pinned at its g0), the certified reference world
  // mineral cycle (2.2): stock-constrained, strictly conserved
  M0: 2.2,          // initial dissolved mineral per cell
  mDiff: 0.22,      // turbulent mixing: molecular diffusion alone leaves the dark-edge reservoir stranded
  mQuota: 0.6,      // bound mineral quota per unit size
  mCapMul: 1.2,     // store ceiling as multiple of quota
  // per-species uptake now lives in TRAITS.mUp (surface/volume: small cells absorb faster)
  mReproMin: 0.5,   // division requires mn >= this fraction of quota (Liebig gate)
  // protein & detritus (2.3)
  pQuota: 0.5,      // protein quota per unit size
  pReproMin: 0.5,   // division requires pr >= this fraction of protein quota
  pSynthEff: 0.6,   // E -> P conversion efficiency (the rest dissipates)
  dLeach: 0.0015,   // abiotic detritus breakdown per tick (slow; Bacillus will beat this ~10x)
  // corpses (2.4)
  sBody: 1.0,       // structural substance per unit size: paid at division, credited to the corpse
  corpseDecay: 0.008, // fraction of each corpse component transferred to detritus per tick
  scentEmit: 0.015, scentDecay: 0.97, scentDiff: 0.12,
  SEED: 77, TICK_MS: 100,
};

// Body tags are a bitmask; a predator's diet is the OR of tags it can eat.
const TAG = { SOLARA: 1, DRIFTA: 2, CILIO: 4, BACILLUS: 8, MYCORA: 16, NECRO: 32, VENATOR: 64 };

const SPECIES_ROWS = [
  {
    "name": "Solara",
    "bodyTag": "SOLARA",
    "layer": "benthic",
    "mat": true,
    "movement": "sessile",
    "photosynth": true,
    "kp": 0.12,
    "mUp": 0.22,
    "mQm": 0.65,
    "pSynth": 0.1,
    "hazard": 0.0012,
    "grazeFloor": 35,
    "pursuitPenalty": 1.8,
    "spread": 70,
    "settleLimited": true,
    "settleLimit": 90,
    "locus": {
      "g0": 0.5,
      "sigma": 0.03,
      "lightSlope": 0.5,
      "label": "Light",
      "hiWord": "shade-tolerant",
      "loWord": "sun-loving",
      "hiTrait": "shade tolerance",
      "loTrait": "sun tolerance"
    },
    "topt": 7,
    "ctmax": 12
  },
  {
    "name": "Drifta",
    "bodyTag": "DRIFTA",
    "layer": "plankton",
    "movement": "drift",
    "photosynth": true,
    "kp": 0.3,
    "mUp": 0.6,
    "pSynth": 0.08,
    "damp": 0.96,
    "noise": 0.09,
    "phototaxis": 0.035,
    "driftSpeed": 0.5,
    "moveCostMul": 0.3,
    "cyst": {
      "enter": 0.18,
      "wake": "light",
      "p": 0.015,
      "grace": 60
    },
    "escape": {
      "p": 0.35,
      "kick": 16
    },
    "locus": {
      "g0": 0.5,
      "sigma": 0.03,
      "escSlope": 0.22,
      "kpSlope": 0.5,
      "label": "Defense",
      "hiWord": "tougher",
      "loWord": "faster-growing",
      "hiTrait": "grazing resistance",
      "loTrait": "growth rate"
    },
    "loci": [
      {
        "g0": 0.5,
        "sigma": 0.03,
        "warmSlope": 0.4,
        "warmGainSlope": 0.25,
        "label": "Thermal",
        "hiWord": "heat-tolerant",
        "loWord": "quick-burning",
        "hiTrait": "warm upkeep relief",
        "loTrait": "warm intake"
      },
      {
        "g0": 0.5,
        "sigma": 0.03,
        "tprefSpan": 4,
        "label": "Warmth preference",
        "hiWord": "warm-seeking",
        "loWord": "cool-seeking",
        "hiTrait": "warmer set-point",
        "loTrait": "cooler set-point"
      },
      {
        "g0": 0.5,
        "sigma": 0.03,
        "dampSpan": 0.04,
        "label": "Restlessness",
        "hiWord": "roving",
        "loWord": "settled",
        "hiTrait": "path persistence",
        "loTrait": "quick settling"
      }
    ],
    "topt": 9,
    "ctmax": 14,
    "thermo": 0.6
  },
  {
    "name": "Cilio",
    "bodyTag": "CILIO",
    "layer": "none",
    "movement": "steer",
    "alarmEmit": 0.25,
    "flee": {
      "sense": 0.06,
      "speedMul": 1.15,
      "dur": 25
    },
    "speed": 2,
    "sense": 42,
    "turnRate": 0.35,
    "bite": 8,
    "digest": [
      0.1,
      0.5,
      0,
      0.25,
      0,
      0,
      0
    ],
    "digestP": [
      0.2,
      0.5,
      0,
      0.4,
      0,
      0,
      0
    ],
    "satiation": 0.85,
    "torpor": 0.3,
    "interfRadius": 40,
    "interfCost": 0.05,
    "handling": 14,
    "reproFrac": 0.9,
    "reproCooldown": 160,
    "matureCd": 200,
    "diet": [
      "SOLARA",
      "DRIFTA",
      "BACILLUS"
    ],
    "cyst": {
      "enter": 0.22,
      "wake": "prey",
      "p": 0.02,
      "grace": 100
    },
    "escape": {
      "p": 0.3,
      "kick": 22
    },
    "loci": [
      {
        "g0": 0.5,
        "sigma": 0.03,
        "pcSpeedSlope": 0.5,
        "pcTurnSlope": 0.8,
        "label": "Hunting style",
        "hiWord": "kill-and-stay",
        "loWord": "kill-and-move",
        "hiTrait": "search at the kill",
        "loTrait": "swift departure"
      },
      {
        "g0": 0.5,
        "sigma": 0.03,
        "tprefSpan": 4,
        "label": "Warmth preference",
        "hiWord": "warm-seeking",
        "loWord": "cool-seeking",
        "hiTrait": "warmer set-point",
        "loTrait": "cooler set-point"
      }
    ],
    "locus": {
      "g0": 0.5,
      "sigma": 0.03,
      "catchSlope": 0.4,
      "kbSlope": 0.15,
      "label": "Pursuit",
      "hiWord": "keener",
      "loWord": "thriftier",
      "hiTrait": "catch chance",
      "loTrait": "energy thrift"
    },
    "topt": 5,
    "ctmax": 10,
    "thermo": 0.25
  },
  {
    "name": "Bacillus",
    "bodyTag": "BACILLUS",
    "layer": "none",
    "cystYield": 0.5,
    "grazeFloor": 4,
    "movement": "tumble",
    "mQm": 0.8,
    "pursuitPenalty": 1.6,
    "speed": 0.8,
    "tumbleLow": 0.05,
    "tumbleHigh": 0.35,
    "detritivore": {
      "rateE": 0.5,
      "effE": 0.6,
      "rateP": 0.15,
      "effP": 0.7,
      "minRate": 0.15
    },
    "spread": 15,
    "cyst": {
      "enter": 0.2,
      "wake": "detritus",
      "p": 0.03,
      "grace": 60
    },
    "locus": {
      "g0": 0.5,
      "sigma": 0.03,
      "rateSlope": 0.5,
      "effSlope": 0.15,
      "label": "Metabolism",
      "hiWord": "voracious",
      "loWord": "frugal",
      "hiTrait": "feeding rate",
      "loTrait": "yield"
    },
    "loci": [
      {
        "g0": 0.5,
        "sigma": 0.03,
        "warmSlope": 0.4,
        "warmGainSlope": 0.25,
        "label": "Thermal",
        "hiWord": "heat-tolerant",
        "loWord": "quick-burning",
        "hiTrait": "warm upkeep relief",
        "loTrait": "warm intake"
      },
      {
        "g0": 0.5,
        "sigma": 0.03,
        "tumbleSlope": 0.4,
        "kbSlope": 0.1,
        "label": "Search style",
        "hiWord": "smooth-running",
        "loWord": "twitchy",
        "hiTrait": "run length",
        "loTrait": "upkeep"
      }
    ],
    "topt": 12,
    "ctmax": 18,
    "thermo": 0.25
  },
  {
    "name": "Mycora",
    "bodyTag": "MYCORA",
    "layer": "fungal",
    "live": false,
    "movement": "sessile",
    "kb": 0.04,
    "cystDrainMul": 0.3,
    "mQm": 0.8,
    "hazard": 0.0008,
    "detritivore": {
      "rateE": 0.2,
      "effE": 0.55,
      "rateP": 0.1,
      "effP": 0.8,
      "minRate": 0.08
    },
    "corpsivore": {
      "rate": 0.35,
      "effE": 0.7,
      "effP": 0.8,
      "radius": 14
    },
    "reproFrac": 0.75,
    "spread": 120,
    "settleLimited": true,
    "settleLimit": 70,
    "reproCooldown": 120,
    "cyst": {
      "enter": 0.25,
      "wake": "detritus",
      "p": 0.03,
      "grace": 60
    }
  },
  {
    "name": "Necro",
    "bodyTag": "NECRO",
    "layer": "none",
    "live": false,
    "movement": "tumble",
    "tumbleField": "scent",
    "kb": 0.035,
    "torpor": 0.35,
    "speed": 1.4,
    "tumbleLow": 0.04,
    "tumbleHigh": 0.3,
    "cystDrainMul": 0.25,
    "corpsivore": {
      "rate": 0.5,
      "effE": 0.55,
      "effP": 0.6,
      "radius": 12,
      "minMass": 5,
      "maxMass": 15
    },
    "reproFrac": 0.8,
    "reproCooldown": 120,
    "matureCd": 150,
    "cyst": {
      "enter": 0.22,
      "wake": "detritus",
      "p": 0.02,
      "grace": 80,
      "scMin": 0.012
    }
  },
  {
    "name": "Venator",
    "bodyTag": "VENATOR",
    "layer": "none",
    "apex": true,
    "movement": "steer",
    "kb": 0.04,
    "alarmEmit": 0.3,
    "speed": 2.4,
    "sense": 50,
    "turnRate": 0.3,
    "bite": 14,
    "burst": {
      "mul": 1.8,
      "dur": 6,
      "cd": 60,
      "range": 30
    },
    "digest": [
      0,
      0,
      0.8,
      0,
      0,
      0,
      0
    ],
    "digestP": [
      0,
      0,
      0.7,
      0,
      0,
      0,
      0
    ],
    "corpsivore": {
      "rate": 1.2,
      "effE": 0.8,
      "effP": 0.7,
      "radius": 14,
      "minMass": 5,
      "dietOnly": true
    },
    "satiation": 0.85,
    "torpor": 0.3,
    "interfRadius": 80,
    "interfCost": 0.25,
    "handling": 30,
    "reproFrac": 0.92,
    "spread": 25,
    "reproCooldown": 700,
    "matureCd": 700,
    "diet": [
      "CILIO"
    ],
    "cyst": {
      "enter": 0.25,
      "wake": "prey",
      "p": 0.02,
      "grace": 120
    },
    "cystDrainMul": 0.3,
    "topt": 3,
    "ctmax": 8,
    "thermo": 0
  }
];
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
const LOCUS_DEFAULTS = { sigma: 0, escSlope: 0, kpSlope: 0, catchSlope: 0, kbSlope: 0, lightSlope: 0, rateSlope: 0, effSlope: 0, warmSlope: 0, warmGainSlope: 0, tprefSpan: 0, dampSpan: 0, pcSpeedSlope: 0, pcTurnSlope: 0, tumbleSlope: 0, curve: 0 };
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
        && !!(L.warmSlope || L.warmGainSlope || L.tprefSpan); // expressed only through warmth (a set-point needs a temp gradient): the narration detectors stay silent in an unwarmed world
      checkLocus(t, L);
    }
    t.locus = t.loci.length ? t.loci[0] : null;
  }
  // Hidden-class canonicalization (perf pass 2026-08-31, behavior-neutral): rows and their
  // sub-objects arrive with per-species key orders, giving V8 one hidden class per species at
  // every T.x / L.x load site in the step loop (measured ~8% of the tick). Rebuilding every
  // object with one fixed (sorted) key order makes those sites monomorphic. Pure data plumbing:
  // same keys, same values, and the locus === loci[0] alias is preserved.
  const canon = o => { const r = {}; for (const k of Object.keys(o).sort()) r[k] = o[k]; return r; };
  return rows.map(t => {
    t.loci = t.loci.map(canon);
    t.locus = t.loci.length ? t.loci[0] : null;
    for (const k of ["cyst", "escape", "detritivore", "corpsivore", "flee", "burst"]) if (t[k]) t[k] = canon(t[k]);
    return canon(t);
  });
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
      pcSpeedA: 1 - L.pcSpeedSlope*d, pcSpeedB: 1 + L.pcSpeedSlope*d,       // MV-C: both phases of the post-capture program
      pcTurnA: 1 + L.pcTurnSlope*d, pcTurnB: 1 - L.pcTurnSlope*d,
      tumble: 1 - L.tumbleSlope*d,                                          // MV.3: tumble propensity (che axis)
      escape: t.escape ? (t.escape.p + L.escSlope*d - t.escape.p*L.curve*d*d)/t.escape.p : 1 };
    for (const k in mults) if (!(mults[k] >= LOCUS_MULT_MIN && mults[k] <= LOCUS_MULT_MAX)) bad.push(k+"@g="+g+"="+mults[k].toFixed(2));
  }
  // A reference-shifting locus (MV.1): the set-point must stay inside the species' thermal niche at both rails
  if (L.tprefSpan){ const tLo = t.topt - L.tprefSpan*L.g0, tHi = t.topt + L.tprefSpan*(1-L.g0);
    if (!(tLo >= 0 && tHi <= t.ctmax)) bad.push("tpref["+tLo.toFixed(1)+".."+tHi.toFixed(1)+"] outside [0,"+t.ctmax+"]"); }
  // A persistence-gain locus (MV.2): damp must stay a damping at both rails, with headroom below 1
  if (L.dampSpan){ const dLo = t.damp - L.dampSpan*L.g0, dHi = t.damp + L.dampSpan*(1-L.g0);
    if (!(dLo >= 0.5 && dHi <= 0.99)) bad.push("damp["+dLo.toFixed(3)+".."+dHi.toFixed(3)+"] outside [0.5,0.99]"); }
  if (bad.length) throw new Error("locus on "+t.name+" expresses a multiplier outside ["+LOCUS_MULT_MIN+","+LOCUS_MULT_MAX+"] or an out-of-niche reference: "+bad.join(" "));
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
  MOBILE: TRAITS.map((T, sp) => T.live && T.movement !== "sessile" ? sp : -1).filter(sp => sp >= 0), // the movement observatory's row order (MV.0)
  // the Yoshida pair: the evolving prey and the grazer that eats it (harness experiments and gate5)
  PREY: 1, GRAZER: 2,
};
const CELL = P.WORLD / P.GRID;
const MAXN = 6000;
// Observatory ring buffer geometry (channel map documented atop src/observatory/recorder.js).
// Lives here because W.rec is sized from it; changing CH is a declared rebaseline.
const REC = { N: 900, STRIDE: 20, CH: 141 }; // 56-57: locus spread between patches (7.L); 58-64: mean warmth per species (7.H); 65-74: warm-core census (7.H.4); 75-88: second-locus mean/sd (multi-locus); 89-116: locus planes 2-3 mean/sd (MV.0); 117-140: movement observatory (MV.0)

// ---------- world state (module singletons; one artifact instance) ----------
const W = {
  x: new Float32Array(MAXN), y: new Float32Array(MAXN),
  px: new Float32Array(MAXN), py: new Float32Array(MAXN), // previous tick, for render interpolation
  vx: new Float32Array(MAXN), vy: new Float32Array(MAXN),
  en: new Float32Array(MAXN), sz: new Float32Array(MAXN),
  szPow: new Float64Array(MAXN), // sz^0.75, cached at spawn (sz is written nowhere else; perf pass 2026-08-31 — the pow was the tick's single hottest line)
  sp: new Uint8Array(MAXN), alive: new Uint8Array(MAXN),
  hd: new Float32Array(MAXN), handle: new Int16Array(MAXN),
  cd: new Int16Array(MAXN), cy: new Uint8Array(MAXN), gr: new Int16Array(MAXN),
  mn: new Float32Array(MAXN), pr: new Float32Array(MAXN), mem: new Float32Array(MAXN),
  g: new Float32Array(MAXLOCI*MAXN),  // heritable locus values in [0,1]: locus k of organism i at k*MAXN+i (plane 0 = the display locus, so W.g[i] keeps reading it), else 0
  lg: new Uint16Array(MAXN),          // lineage generation: founders 0, child = parent + 1 (draw-free bookkeeping)
  flee: new Int16Array(MAXN), bst: new Int16Array(MAXN),
  pc: new Int16Array(MAXN),   // post-capture program timer (MV-C): ticks left in the two-phase after-kill window; expresses nothing at g0
  birth: new Int32Array(MAXN), gen: new Uint16Array(MAXN),
  n: 0, freeList: [], tick: 0, initialized: false, rng: mulberry32(P.SEED),
  events: [], eventLog: [], lightDirty: false,
  sources: [{ x: P.WORLD / 2, y: P.WORLD / 2, i: P.sunI, a: 0, sigma: P.sunSigma }],  // energy sources (7.L/7.H): light i, warmth a
  // Walls (7.W): thin barriers on cell boundaries. W.walls holds the drawn strokes; compileWalls()
  // (the only writer) stamps them into per-FACE property planes -- vertical faces indexed by the LEFT
  // cell, horizontal by the TOP cell. An open face is pass = all bits, every transmission exactly 1,
  // and W.wallsOn false short-circuits every wall branch: the certified world's arithmetic bit for bit.
  walls: [], wallsOn: false,
  wfPassV: new Int32Array(P.GRID * P.GRID).fill(-1), wfPassH: new Int32Array(P.GRID * P.GRID).fill(-1),
  wfLtV: new Float32Array(P.GRID * P.GRID).fill(1), wfLtH: new Float32Array(P.GRID * P.GRID).fill(1),
  wfHtV: new Float32Array(P.GRID * P.GRID).fill(1), wfHtH: new Float32Array(P.GRID * P.GRID).fill(1),
  wfFlV: new Float32Array(P.GRID * P.GRID).fill(1), wfFlH: new Float32Array(P.GRID * P.GRID).fill(1),
  wShade: new Float32Array(P.GRID * P.GRID).fill(1),  // occluded/unoccluded light ratio per cell (UI honesty layer; 1 without walls)
  temp: new Float32Array(P.GRID * P.GRID),   // warmth above ambient per cell (7.H); exactly 0 without a warm source
  // per-cell Q10 factors, all exactly 1 where temp is 0 (7.H): maintenance, photosynthesis, decomposition, handling, pursuit
  qR: new Float32Array(P.GRID * P.GRID).fill(1), qP: new Float32Array(P.GRID * P.GRID).fill(1), qD: new Float32Array(P.GRID * P.GRID).fill(1),
  qH: new Float32Array(P.GRID * P.GRID).fill(1), qS: new Float32Array(P.GRID * P.GRID).fill(1),
  qA: new Float32Array(P.GRID * P.GRID).fill(1),   // attack/ingestion (7.H.4): bite scales with warmth, flatter than maintenance
  tgx: new Float32Array(P.GRID * P.GRID), tgy: new Float32Array(P.GRID * P.GRID),   // warmth gradient per cell (7.H.2), exactly 0 when flat
  lgx: new Float32Array(P.GRID * P.GRID), lgy: new Float32Array(P.GRID * P.GRID),   // light gradient per cell (7.H.3): what the drifter steers by
  light: new Float32Array(P.GRID * P.GRID),
  pB: new Float32Array(P.GRID * P.GRID), bB: new Float32Array(P.GRID * P.GRID),
  M: new Float32Array(P.GRID * P.GRID), Mtmp: new Float32Array(P.GRID * P.GRID),
  fB: new Float32Array(P.GRID * P.GRID),
  dE: new Float32Array(P.GRID * P.GRID), dP: new Float32Array(P.GRID * P.GRID),
  dM: new Float32Array(P.GRID * P.GRID),
  sc: new Float32Array(P.GRID * P.GRID), scTmp: new Float32Array(P.GRID * P.GRID),
  al: new Float32Array(P.GRID * P.GRID), alTmp: new Float32Array(P.GRID * P.GRID),
  flows: { uptake: 0, release: 0, excrete: 0, transfer: 0, egestE: 0, egestP: 0, leachM: 0, corpseToDet: 0, bacRelease: 0, gpp: 0, resp: 0, deaths: 0, deathsBy: [0,0,0,0,0,0,0] },
  hashHead: new Int32Array(P.GRID * P.GRID), hashNext: new Int32Array(MAXN),
  cHashHead: new Int32Array(P.GRID * P.GRID), cHashNext: new Int32Array(1500),
  pops: [0, 0, 0, 0, 0, 0, 0],
  rec: new Float32Array(REC.N*REC.CH), recHead: 0, recCount: 0, sysEvents: [],
  addedM: 0,  // provenance: mineral added by the human hand (fertilize lever)
  evLog: [],  // committed interventions, for chart markers and impact cards
  // corpse pool (separate entity class: no behavior, only decay)
  cN: 0, cFree: [],
  cAlive: new Uint8Array(1500), cX: new Float32Array(1500), cY: new Float32Array(1500),
  cE: new Float32Array(1500), cP: new Float32Array(1500), cM: new Float32Array(1500),
  cSz: new Float32Array(1500), cSp: new Uint8Array(1500),
};
const R = () => W.rng();
const wrap = v => { v %= P.WORLD; return v < 0 ? v + P.WORLD : v; };
const wd = d => { if (d > P.WORLD / 2) d -= P.WORLD; if (d < -P.WORLD / 2) d += P.WORLD; return d; };

function spawn(species, sx, sy, e, size, mnEndow, prEndow){
  const i = W.freeList.length ? W.freeList.pop() : W.n++;
  if (i >= MAXN) return -1;
  W.x[i]=wrap(sx); W.y[i]=wrap(sy); W.px[i]=W.x[i]; W.py[i]=W.y[i];
  W.vx[i]=0; W.vy[i]=0; W.en[i]=e; W.sz[i]=size; W.szPow[i]=Math.pow(W.sz[i],0.75); W.sp[i]=species; W.alive[i]=1;
  W.hd[i]=R()*6.283; W.cd[i]=TRAITS[species].matureCd; W.handle[i]=0; W.cy[i]=0; W.gr[i]=0;
  W.mn[i]=mnEndow||0; W.pr[i]=prEndow||0; W.mem[i]=0; W.flee[i]=0; W.bst[i]=0; W.pc[i]=0;
  { const loci = TRAITS[species].loci; // every plane reset: slots are reused across species
    for (let k=0;k<MAXLOCI;k++) W.g[k*MAXN+i] = k < loci.length ? loci[k].g0 : 0; }
  W.lg[i]=0;
  W.birth[i]=W.tick; W.gen[i]=(W.gen[i]+1)&0xffff;
  return i;
}
const cellOf = i => (Math.floor(W.y[i]/CELL)&(P.GRID-1))*P.GRID + (Math.floor(W.x[i]/CELL)&(P.GRID-1));
function endowFounder(i){ // founders draw mineral from their birth cell, up to 70% of quota (draw-free)
  if (i < 0) return;
  const c = cellOf(i), want = 0.7*P.mQuota*TRAITS[W.sp[i]].mQm*W.sz[i];
  const got = Math.min(W.M[c], want);
  W.M[c]-=got; W.mn[i]=got; W.pr[i]=0.6*P.pQuota*W.sz[i];
}
const cellAt = (x,y) => (Math.floor(y/CELL)&(P.GRID-1))*P.GRID + (Math.floor(x/CELL)&(P.GRID-1));
function spawnCorpse(x, y, e, p, m, sz, sp){
  const k = W.cFree.length ? W.cFree.pop() : (W.cN < 1500 ? W.cN++ : -1);
  if (k < 0){ // pool full: overflow decays instantly to detritus (ledger stays closed)
    const c = cellAt(x,y); W.dE[c]+=e; W.dP[c]+=p; W.dM[c]+=m; return -1;
  }
  W.cAlive[k]=1; W.cX[k]=x; W.cY[k]=y; W.cE[k]=e; W.cP[k]=p; W.cM[k]=m; W.cSz[k]=sz; W.cSp[k]=sp;
  return k;
}
const killOrg = i => {
  W.flows.deaths++; W.flows.deathsBy[W.sp[i]]++;
  const m = W.mn[i]; W.mn[i]=0;
  const bodyE = Math.max(0, W.en[i]) + P.sBody*W.sz[i];
  let k = -1;
  if (bodyE + W.pr[i] + m < 4.0){ // micro-bodies (bacterial colonies etc.) decompose directly
    const c = cellAt(W.x[i], W.y[i]);
    W.dE[c]+=bodyE; W.dP[c]+=W.pr[i]; W.dM[c]+=m;
  } else {
    k = spawnCorpse(W.x[i], W.y[i], bodyE, W.pr[i], m, W.sz[i], W.sp[i]);
  }
  W.pr[i]=0;
  W.alive[i] = 0; W.freeList.push(i);
  return k;
};

// ---------- intervention events (the ONLY legal way to mutate world state from outside) ----------
function applyEvent(ev){
  const { done, ...logged } = ev;
  W.eventLog.push({ t: W.tick, ...logged });          // payload log: replay substrate (Phase 5)
  if (W.eventLog.length > 4000) W.eventLog.splice(0, 1000);
  switch(ev.type){
    case "spawnPack": {
      // seed a small founding group of a species at a location (conservation-safe: endow pulls
      // mineral from the local water; energy and protein are open books, as at world-founding)
      const KIT = { 0:{n:6,sz:5,en:30}, 1:{n:8,sz:3.4,en:25}, 2:{n:4,sz:6,en:35}, 3:{n:12,sz:2,en:12}, 6:{n:3,sz:9,en:70} };
      const kit = KIT[ev.sp]; if (!kit) break;
      const ids = [];
      for (let k=0;k<kit.n;k++){
        const j = spawn(ev.sp, wrap(ev.x+(R()-0.5)*70), wrap(ev.y+(R()-0.5)*70), kit.en*(0.8+R()*0.4), kit.sz);
        if (j>=0){ endowFounder(j); ids.push([j, W.gen[j]]); }
      }
      done && done({ ids }); break; }
    case "unspawnPack": {
      const sn=ev.snap; if(!sn) break;
      for (const [j,g] of sn.ids){
        if (W.alive[j] && W.gen[j]===g){
          if (W.mn[j] > 0) W.M[cellOf(j)] += W.mn[j]; // quiet removal: mineral back to the water, no corpse
          W.mn[j]=0; W.pr[j]=0; W.alive[j]=0; W.freeList.push(j);
        }
      }
      break; }
    case "fertilize": {
      // pulse lever: a mineral pour — splash over the tapped cell and its neighbours
      const G=P.GRID, gx=Math.floor(ev.x/CELL)&(G-1), gy=Math.floor(ev.y/CELL)&(G-1);
      const w=[[0,0,0.4],[1,0,0.15],[-1,0,0.15],[0,1,0.15],[0,-1,0.15]];
      const cells=[];
      for (const [dx2,dy2,f] of w){
        const c=(((gy+dy2+G)%G))*G+(((gx+dx2+G)%G));
        const amt=ev.amount*f;
        W.M[c]+=amt; cells.push([c,amt]);
      }
      W.addedM += ev.amount;
      done && done({ cells, amount: ev.amount }); break; }
    case "unfertilize": {
      // reclaim only what the water still holds; what life absorbed stays in bodies
      const sn=ev.snap; if(!sn) break;
      let reclaimed=0;
      for (const [c,amt] of sn.cells){ const take=Math.min(W.M[c], amt); W.M[c]-=take; reclaimed+=take; }
      W.addedM = Math.max(0, W.addedM - reclaimed);
      break; }
    case "lightMul": {
      const prev = P.lightMul;
      P.lightMul = Math.max(0.2, Math.min(2.0, ev.v));
      computeLight();
      done && done({ prev }); break; }
    // Phase 6 evolution settings: the player's hand on the second-order loop. Same rules as every
    // lever -- through the queue, logged, undoable via prev. Changing sigma changes the future
    // PRNG stream (draws appear or vanish at divisions) exactly as moving the sun does.
    case "mutation": {
      const prev = P.mutation;
      P.mutation = !!ev.v;
      done && done({ prev }); break; }
    case "locus": {
      const Lc = TRAITS[ev.sp] && TRAITS[ev.sp].loci[ev.locus|0]; if (!Lc || !(ev.key in LOCUS_DEFAULTS)) break; // ev.locus: which locus (default 0, the display locus)
      const prev = Lc[ev.key];
      const lim = ev.key === "sigma" ? [0, 0.12] : ev.key === "curve" ? [-0.5, 0.8] : ev.key === "tprefSpan" ? [0, 8] : ev.key === "dampSpan" ? [0, 0.08] : [0, 1.5]; // slopes are prices: bounded too; reference spans carry their own units (degrees, damping)
      Lc[ev.key] = Math.max(lim[0], Math.min(lim[1], +ev.v || 0));
      done && done({ prev }); break; }
    // Energy sources (7.L/7.H): light i (0-1.5) and warmth a (-8..15) per source. Never fewer than one
    // (decision 2); at most P.maxSources. None of these draw; they change the future stream only through
    // ecology, like moving the sun always has.
    case "source": {
      const s = W.sources[ev.k|0]; if (!s) break;
      s.x = wrap(ev.x); s.y = wrap(ev.y);
      computeLight(); computeTemp(); W.lightDirty = true; break; }
    case "sourceAdd": {
      if (W.sources.length >= P.maxSources) break;
      const s = { x: wrap(ev.x), y: wrap(ev.y),
        i: Math.max(0, Math.min(1.5, ev.i === undefined ? P.sunI : +ev.i)),
        a: Math.max(-8, Math.min(15, ev.a === undefined ? 0 : +ev.a)),
        sigma: Math.max(90, Math.min(300, ev.sigma === undefined ? P.sunSigma : +ev.sigma)) };
      const k = ev.at === undefined ? W.sources.length : Math.max(0, Math.min(W.sources.length, ev.at|0)); // `at` restores an undone removal at its old index
      W.sources.splice(k, 0, s);
      computeLight(); computeTemp(); W.lightDirty = true; done && done({ k }); break; }
    case "sourceRemove": {
      const k = ev.k|0; if (W.sources.length <= 1 || !W.sources[k]) break;
      const snap = W.sources.splice(k, 1)[0];
      computeLight(); computeTemp(); W.lightDirty = true; done && done({ k, snap }); break; }
    case "sourceSet": {
      const s = W.sources[ev.k|0]; if (!s) break;
      const prev = { i: s.i, a: s.a, sigma: s.sigma };
      if (ev.i !== undefined) s.i = Math.max(0, Math.min(1.5, +ev.i));
      if (ev.a !== undefined) s.a = Math.max(-8, Math.min(15, +ev.a));
      if (ev.sigma !== undefined) s.sigma = Math.max(90, Math.min(300, +ev.sigma));
      computeLight(); computeTemp(); W.lightDirty = true; done && done({ prev }); break; }
    // Walls (7.W, docs/phase7-walls-plan.md): face barriers -- light/warmth/flow transmission and
    // per-species passage. Draw-free, like sources: they change the future stream only through ecology.
    case "wallAdd": {
      if (W.walls.length >= P.maxWalls) break;
      const wl = makeWall(ev); if (!wl) break;   // stroke snapped to nothing
      const k = ev.at === undefined ? W.walls.length : Math.max(0, Math.min(W.walls.length, ev.at|0)); // `at` restores an undone removal at its old index
      W.walls.splice(k, 0, wl);
      compileWalls(); computeLight(); computeTemp(); W.lightDirty = true;
      done && done({ k }); break; }
    case "wallRemove": {
      const k = ev.k|0; if (!W.walls[k]) break;
      const s = W.walls.splice(k, 1)[0];
      compileWalls(); computeLight(); computeTemp(); W.lightDirty = true;
      done && done({ k, snap: { x0:s.x0, y0:s.y0, dx:s.dx, dy:s.dy, lt:s.lt, ht:s.ht, fl:s.fl, pass:s.pass } }); break; }
    case "wallSet": {
      const wl = W.walls[ev.k|0]; if (!wl) break;
      const prev = { lt: wl.lt, ht: wl.ht, fl: wl.fl, pass: wl.pass };
      if (ev.lt !== undefined) wl.lt = Math.max(0, Math.min(1, +ev.lt || 0));
      if (ev.ht !== undefined) wl.ht = Math.max(0, Math.min(1, +ev.ht || 0));
      if (ev.fl !== undefined) wl.fl = Math.max(0, Math.min(1, +ev.fl || 0));
      if (ev.pass !== undefined) wl.pass = ev.pass|0;
      compileWalls(); computeLight(); computeTemp(); W.lightDirty = true;
      done && done({ prev }); break; }
    case "feed": {
      const i = ev.i; if (!(W.alive[i] && W.gen[i] === ev.gen)) break;
      const cap = P.capMul*W.sz[i], before = W.en[i];
      W.en[i] = Math.min(cap, W.en[i] + ev.frac*cap);
      W.pr[i] = Math.min(P.pQuota*W.sz[i], W.pr[i] + ev.frac*P.pQuota*W.sz[i]);
      if (W.cy[i]){ W.cy[i] = 0; W.gr[i] = 60; }
      done && done(W.en[i] - before); break; }
    case "unfeed": {
      const i = ev.i;
      if (W.alive[i] && W.gen[i] === ev.gen) W.en[i] = Math.max(0.5, W.en[i] - ev.delta);
      break; }
    case "kill": {
      const i = ev.i; if (!(W.alive[i] && W.gen[i] === ev.gen)) break;
      const snap = { sp:W.sp[i], x:W.x[i], y:W.y[i], en:W.en[i], sz:W.sz[i],
        hd:W.hd[i], cd:W.cd[i], cy:W.cy[i], gr:W.gr[i], birth:W.birth[i], mn:W.mn[i], pr:W.pr[i] };
      snap.corpse = killOrg(i); done && done(snap); break; }
    case "revive": {
      const sn = ev.snap;
      const j = spawn(sn.sp, sn.x, sn.y, sn.en, sn.sz);
      if (j >= 0){ W.hd[j]=sn.hd; W.cd[j]=sn.cd; W.cy[j]=sn.cy; W.gr[j]=sn.gr; W.birth[j]=sn.birth; W.pr[j]=sn.pr||0;
        let got = 0;
        if (sn.corpse >= 0 && W.cAlive[sn.corpse]){ // reclaim the corpse's remaining mineral
          got = W.cM[sn.corpse]; W.cM[sn.corpse]=0;
          W.cAlive[sn.corpse]=0; W.cFree.push(sn.corpse);
        }
        const c=cellOf(j), top=Math.min(W.M[c], Math.max(0,(sn.mn||0)-got)); W.M[c]-=top;
        W.mn[j]=got+top; }
      break; }
  }
}
function drainEvents(){ while (W.events.length) applyEvent(W.events.shift()); }
function queueEvent(ev){
  if (ev.type === "source"){ // coalesce: only the latest position of that sun matters
    const k = W.events.findIndex(e => e.type === "source" && (e.k|0) === (ev.k|0));
    if (k >= 0){ W.events[k] = ev; return; }
  }
  if (ev.type === "wallSet"){ // coalesce a slider drag: only the latest properties of that wall matter within one tick
    const k = W.events.findIndex(e => e.type === "wallSet" && (e.k|0) === (ev.k|0));
    if (k >= 0){ W.events[k] = { ...W.events[k], ...ev }; return; }
  }
  W.events.push(ev);
}

// ---------- Walls (7.W): face barriers (docs/phase7-walls-plan.md) ----------
// A wall is a player stroke snapped to grid corners and rasterized into a 4-connected staircase of
// cell-boundary edges (integer Bresenham over corners) -- infinitely thin, so nothing is ever "inside"
// a wall. Everything here is draw-free. Face indices: vertical face between (x,y) and (x+1,y) lives at
// y*G+x (the LEFT cell); horizontal face between (x,y) and (x,y+1) at y*G+x (the TOP cell); a wall
// object stores horizontal faces offset by G*G to keep one list.
function makeWall(ev){
  // The stroke is a start point plus the DRAG VECTOR (dx,dy) -- not a second endpoint, because the
  // minimal-image rule would flip any stroke longer than half the world. A full-height wall is one
  // stroke with |dy| = WORLD, closing on itself around the torus.
  const G=P.GRID;
  const x0=wrap(+ev.x0||0), y0=wrap(+ev.y0||0);
  const kx0=Math.round(x0/CELL), ky0=Math.round(y0/CELL);
  const cd=v=>Math.round(Math.max(-P.WORLD,Math.min(P.WORLD,+v||0))/CELL); // one wrap at most: past that the staircase would overwrite itself
  const dkx=cd(ev.dx), dky=cd(ev.dy);
  const ax=Math.abs(dkx), ay=Math.abs(dky);
  if(ax+ay===0) return null;                       // snapped to a point: no wall
  const sx=dkx>0?1:-1, sy=dky>0?1:-1;
  const faces=[], path=[[kx0,ky0]];
  let ix=0, iy=0;
  while(ix!==ax||iy!==ay){
    // midpoint rule: step the axis whose normalized progress is behind (pure integer, deterministic)
    const stepX = iy===ay || (ix!==ax && (2*ix+1)*ay <= (2*iy+1)*ax);
    const kx=kx0+ix*sx, ky=ky0+iy*sy;
    if(stepX){ faces.push(G*G + ((ky-1)&(G-1))*G + ((sx>0?kx:kx-1)&(G-1))); ix++; } // edge along row-line ky
    else     { faces.push(((sy>0?ky:ky-1)&(G-1))*G + ((kx-1)&(G-1))); iy++; }      // edge along column-line kx
    path.push([kx0+ix*sx, ky0+iy*sy]);
  }
  const cl=(v,d)=>v===undefined?d:Math.max(0,Math.min(1,+v||0));
  return { x0:wrap(kx0*CELL), y0:wrap(ky0*CELL), dx:dkx*CELL, dy:dky*CELL,
    lt:cl(ev.lt,0), ht:cl(ev.ht,0), fl:cl(ev.fl,0), pass:ev.pass===undefined?0:(ev.pass|0),
    faces, path };
}
function compileWalls(){ // the only writer of the face planes; later walls win on shared faces
  const N=P.GRID*P.GRID;
  W.wfPassV.fill(-1); W.wfPassH.fill(-1);
  W.wfLtV.fill(1); W.wfLtH.fill(1); W.wfHtV.fill(1); W.wfHtH.fill(1); W.wfFlV.fill(1); W.wfFlH.fill(1);
  W.wallsOn = W.walls.length > 0;
  if(!W.wallsOn){ W.wShade.fill(1); return; }
  for(const wl of W.walls) for(const f of wl.faces){
    if(f>=N){ const c=f-N; W.wfPassH[c]=wl.pass; W.wfLtH[c]=wl.lt; W.wfHtH[c]=wl.ht; W.wfFlH[c]=wl.fl; }
    else    { W.wfPassV[f]=wl.pass; W.wfLtV[f]=wl.lt; W.wfHtV[f]=wl.ht; W.wfFlV[f]=wl.fl; }
  }
}
// Passage: a step's x (or y) component is dropped when any face it crosses refuses the bodyTag.
function xPassBlocked(tag, x, y, dx){
  const G=P.GRID, row=(Math.floor(y/CELL)&(G-1))*G;
  const c0=Math.floor(x/CELL), c1=Math.floor((x+dx)/CELL);
  if(dx>0){ for(let cc=c0;cc<c1;cc++)    if(!(W.wfPassV[row+(cc&(G-1))]&tag)) return true; }
  else    { for(let cc=c0-1;cc>=c1;cc--) if(!(W.wfPassV[row+(cc&(G-1))]&tag)) return true; }
  return false;
}
function yPassBlocked(tag, x, y, dy){
  const G=P.GRID, col=Math.floor(x/CELL)&(G-1);
  const r0=Math.floor(y/CELL), r1=Math.floor((y+dy)/CELL);
  if(dy>0){ for(let rr=r0;rr<r1;rr++)    if(!(W.wfPassH[(rr&(G-1))*G+col]&tag)) return true; }
  else    { for(let rr=r0-1;rr>=r1;rr--) if(!(W.wfPassH[(rr&(G-1))*G+col]&tag)) return true; }
  return false;
}
// Reachability along the L-path (x leg at the start row, then y leg at the end column) -- the same
// geometry the axis-separated mover walks, so "can target" and "can get there" agree.
function pathBlocked(tag, x, y, dx, dy){
  return xPassBlocked(tag,x,y,dx) || yPassBlocked(tag,x+dx,y,dy);
}
function moveOrg(i, dx, dy){ // THE position write for organism motion; draw-free; slides along walls
  if(!W.wallsOn){ W.x[i]=wrap(W.x[i]+dx); W.y[i]=wrap(W.y[i]+dy); return; }
  const tag=TRAITS[W.sp[i]].bodyTag;
  if(!xPassBlocked(tag,W.x[i],W.y[i],dx)) W.x[i]=wrap(W.x[i]+dx);
  if(!yPassBlocked(tag,W.x[i],W.y[i],dy)) W.y[i]=wrap(W.y[i]+dy);
}
// Product of a face-transmission plane over every boundary crossed by the minimal-image segment from
// (x0,y0) along (dx,dy). A product is order-free, so the two axes walk their crossings independently.
function marchMul(x0, y0, dx, dy, AV, AH){
  const G=P.GRID; let m=1;
  if(dx!==0){
    const s=dx>0?1:-1, c0=Math.floor(x0/CELL), c1=Math.floor((x0+dx)/CELL);
    for(let cc=c0; cc!==c1; cc+=s){
      const t=((s>0?cc+1:cc)*CELL-x0)/dx;
      const row=Math.floor((y0+t*dy)/CELL)&(G-1);
      m*=AV[row*G+((s>0?cc:cc-1)&(G-1))];
      if(m===0) return 0;
    }
  }
  if(dy!==0){
    const s=dy>0?1:-1, r0=Math.floor(y0/CELL), r1=Math.floor((y0+dy)/CELL);
    for(let rr=r0; rr!==r1; rr+=s){
      const t=((s>0?rr+1:rr)*CELL-y0)/dy;
      const col=Math.floor((x0+t*dx)/CELL)&(G-1);
      m*=AH[((s>0?rr:rr-1)&(G-1))*G+col];
      if(m===0) return 0;
    }
  }
  return m;
}

// Perf pass 2026-08-31: two bodies, one arithmetic. Every face factor is exactly 1.0 without
// walls, and multiplying by 1.0 is an exact identity in IEEE 754 — so the open-world body drops
// the four face loads+multiplies per cell per field and stays bit-identical to the walled one.
// Banner rule 4 holds for both: draw-free.
function diffuseM(){ return W.wallsOn ? diffuseMWalled() : diffuseMOpen(); }
function diffuseMWalled(){
  const G=P.GRID, M=W.M, T=W.Mtmp, k=P.mDiff*0.25;
  const FV=W.wfFlV, FH=W.wfFlH; // face flow transmission (7.W): exactly 1 on open faces, so the flux-pair form is the shipped stencil bit for bit
  for(let y=0;y<G;y++){
    const yu=((y-1+G)%G)*G, yd=((y+1)%G)*G, y0=y*G;
    for(let x=0;x<G;x++){
      const xl=(x-1+G)%G, xr=(x+1)%G;
      const c=y0+x, m=M[c];
      T[c]=m + k*(FV[y0+xl]*(M[y0+xl]-m)+FV[c]*(M[y0+xr]-m)+FH[yu+x]*(M[yu+x]-m)+FH[c]*(M[yd+x]-m));
    }
  }
  M.set(T);
  const dE=W.dE, dP=W.dP, dM=W.dM, qD=W.qD;
  for(let c=0;c<G*G;c++){
    const back=dM[c]*P.dLeach*qD[c], keep=1-P.dLeach*qD[c]; // abiotic breakdown warms with the cell (7.H)
    if(back>0){ M[c]+=back; W.flows.leachM+=back; }
    dM[c]*=keep; dE[c]*=keep; dP[c]*=keep;  // organic fractions dissipate
  }
  const S=W.sc, ST=W.scTmp, ks=P.scentDiff*0.25;
  for(let y=0;y<G;y++){
    const yu=((y-1+G)%G)*G, yd=((y+1)%G)*G, y0=y*G;
    for(let x=0;x<G;x++){
      const xl=(x-1+G)%G, xr=(x+1)%G;
      const c=y0+x, v=S[c];
      ST[c]=(v + ks*(FV[y0+xl]*(S[y0+xl]-v)+FV[c]*(S[y0+xr]-v)+FH[yu+x]*(S[yu+x]-v)+FH[c]*(S[yd+x]-v)))*P.scentDecay;
    }
  }
  S.set(ST);
  // alarm channel: fast decay, local reach — spikes, not ambience (Schreckstoff time constant)
  const A=W.al, AT=W.alTmp, ka=0.2*0.25;
  for(let y=0;y<G;y++){
    const yu=((y-1+G)%G)*G, yd=((y+1)%G)*G, y0=y*G;
    for(let x=0;x<G;x++){
      const xl=(x-1+G)%G, xr=(x+1)%G;
      const c=y0+x, v=A[c];
      AT[c]=(v + ka*(FV[y0+xl]*(A[y0+xl]-v)+FV[c]*(A[y0+xr]-v)+FH[yu+x]*(A[yu+x]-v)+FH[c]*(A[yd+x]-v)))*0.85;
    }
  }
  A.set(AT);
}
function diffuseMOpen(){ // the wall-free fast path: the walled body with every face factor (exactly 1) elided
  const G=P.GRID, M=W.M, T=W.Mtmp, k=P.mDiff*0.25;
  for(let y=0;y<G;y++){
    const yu=((y-1+G)%G)*G, yd=((y+1)%G)*G, y0=y*G;
    for(let x=0;x<G;x++){
      const xl=(x-1+G)%G, xr=(x+1)%G;
      const c=y0+x, m=M[c];
      T[c]=m + k*((M[y0+xl]-m)+(M[y0+xr]-m)+(M[yu+x]-m)+(M[yd+x]-m));
    }
  }
  M.set(T);
  const dE=W.dE, dP=W.dP, dM=W.dM, qD=W.qD;
  for(let c=0;c<G*G;c++){
    const back=dM[c]*P.dLeach*qD[c], keep=1-P.dLeach*qD[c]; // abiotic breakdown warms with the cell (7.H)
    if(back>0){ M[c]+=back; W.flows.leachM+=back; }
    dM[c]*=keep; dE[c]*=keep; dP[c]*=keep;  // organic fractions dissipate
  }
  const S=W.sc, ST=W.scTmp, ks=P.scentDiff*0.25;
  for(let y=0;y<G;y++){
    const yu=((y-1+G)%G)*G, yd=((y+1)%G)*G, y0=y*G;
    for(let x=0;x<G;x++){
      const xl=(x-1+G)%G, xr=(x+1)%G;
      const c=y0+x, v=S[c];
      ST[c]=(v + ks*((S[y0+xl]-v)+(S[y0+xr]-v)+(S[yu+x]-v)+(S[yd+x]-v)))*P.scentDecay;
    }
  }
  S.set(ST);
  const A=W.al, AT=W.alTmp, ka=0.2*0.25;
  for(let y=0;y<G;y++){
    const yu=((y-1+G)%G)*G, yd=((y+1)%G)*G, y0=y*G;
    for(let x=0;x<G;x++){
      const xl=(x-1+G)%G, xr=(x+1)%G;
      const c=y0+x, v=A[c];
      AT[c]=(v + ka*((A[y0+xl]-v)+(A[y0+xr]-v)+(A[yu+x]-v)+(A[yd+x]-v)))*0.85;
    }
  }
  A.set(AT);
}
// Irradiance adds: the field is the ambient floor plus one toroidal Gaussian per source's light. Draw-free.
// Walls (7.W) occlude each source's term by the product of light transmissions over faces crossed on the
// minimal-image ray; the ambient floor is a floor, not a source, and passes. W.wShade keeps the honest
// occluded/unoccluded ratio for the painted light layer. Without walls the arithmetic is the shipped one.
function computeLight(){
  const S = W.sources, on = W.wallsOn;
  for (let gy = 0; gy < P.GRID; gy++) for (let gx = 0; gx < P.GRID; gx++){
    const cx=(gx+0.5)*CELL, cyy=(gy+0.5)*CELL;
    let v = P.ambient, v0 = P.ambient;
    for (let k = 0; k < S.length; k++){
      const s = S[k], dx=wd(cx-s.x), dy=wd(cyy-s.y);
      const g = s.i * Math.exp(-(dx*dx+dy*dy)/(2*s.sigma*s.sigma));
      if (on){ v0 += g; v += g * marchMul(s.x, s.y, dx, dy, W.wfLtV, W.wfLtH); }
      else v += g;
    }
    const c = gy*P.GRID+gx;
    W.light[c] = v * P.lightMul;
    if (on) W.wShade[c] = v0 > 0 ? v/v0 : 1;
  }
  // the gradient the drifter senses (7.H.3, declared change): central differences on the torus, light per world unit
  const G = P.GRID, Lt = W.light;
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++){
    const c = gy*G+gx;
    W.lgx[c] = (Lt[gy*G+((gx+1)&(G-1))] - Lt[gy*G+((gx-1+G)&(G-1))]) / (2*CELL);
    W.lgy[c] = (Lt[((gy+1)&(G-1))*G+gx] - Lt[((gy-1+G)&(G-1))*G+gx]) / (2*CELL);
  }
}
// Warmth above ambient (7.H): the same Gaussians, each source's `a` (negative = a cold source). Static like
// light, recomputed on events only. Sources with a = 0 are skipped so the shipped world's field is exactly 0.
function computeTemp(){
  const S = W.sources, on = W.wallsOn; // walls (7.W) conduct each source's warmth by their ht per crossed face
  for (let gy = 0; gy < P.GRID; gy++) for (let gx = 0; gx < P.GRID; gx++){
    const cx=(gx+0.5)*CELL, cyy=(gy+0.5)*CELL;
    let v = P.tempAmb;
    for (let k = 0; k < S.length; k++){
      const s = S[k]; if (s.a === 0) continue;
      const dx=wd(cx-s.x), dy=wd(cyy-s.y);
      let g = s.a * Math.exp(-(dx*dx+dy*dy)/(2*s.sigma*s.sigma));
      if (on) g *= marchMul(s.x, s.y, dx, dy, W.wfHtV, W.wfHtH);
      v += g;
    }
    const c = gy*P.GRID+gx; W.temp[c] = v;
    const Q = P.q10, e = v/10; // Math.pow(q, 0) is exactly 1: the certified world's factors stay 1
    W.qR[c] = Math.pow(Q.resp, e); W.qP[c] = Math.pow(Q.photo, e); W.qD[c] = Math.pow(Q.decomp, e);
    W.qH[c] = Math.pow(Q.handling, e); W.qS[c] = Math.pow(Q.pursuit, e); W.qA[c] = Math.pow(Q.attack, e);
  }
  // the gradient the organisms sense (7.H.2): central differences on the torus, degrees per world unit
  const G = P.GRID, Tm = W.temp;
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++){
    const c = gy*G+gx;
    W.tgx[c] = (Tm[gy*G+((gx+1)&(G-1))] - Tm[gy*G+((gx-1+G)&(G-1))]) / (2*CELL);
    W.tgy[c] = (Tm[((gy+1)&(G-1))*G+gx] - Tm[((gy-1+G)&(G-1))*G+gx]) / (2*CELL);
  }
}

function rebuild(){
  W.pB.fill(0); W.bB.fill(0); W.fB.fill(0); W.hashHead.fill(-1); W.cHashHead.fill(-1);
  for (let k=0;k<W.cN;k++){ if(!W.cAlive[k]) continue;
    const c=(Math.floor(W.cY[k]/CELL)&(P.GRID-1))*P.GRID+(Math.floor(W.cX[k]/CELL)&(P.GRID-1));
    W.cHashNext[k]=W.cHashHead[c]; W.cHashHead[c]=k;
  }
  for (let i=0;i<W.n;i++){ if(!W.alive[i]) continue;
    const gx=Math.floor(W.x[i]/CELL)&(P.GRID-1), gy=Math.floor(W.y[i]/CELL)&(P.GRID-1);
    const c=gy*P.GRID+gx;
    W.hashNext[i]=W.hashHead[c]; W.hashHead[c]=i;
    const L = TRAITS[W.sp[i]].layer;
    if(L==="plankton" && !W.cy[i]) W.pB[c]+=W.en[i];
    else if(L==="benthic") W.bB[c]+=W.en[i];
    else if(L==="fungal") W.fB[c]+=W.en[i];
  }
}
function cellLight(i){
  const gx=Math.floor(W.x[i]/CELL)&(P.GRID-1), gy=Math.floor(W.y[i]/CELL)&(P.GRID-1);
  const c=gy*P.GRID+gx;
  const shade = TRAITS[W.sp[i]].layer==="plankton"
    ? Math.min(P.shadeMax, W.pB[c]/P.divPlank)   // plankton floats above: shaded only by plankton
    : Math.min(P.shadeMax, (W.pB[c]+W.bB[c]+W.fB[c]*0.5)/P.divBenth); // benthos: shaded from above; fungal cover half-counts
  return W.light[c]*(1-shade);
}
function neighbors(i, radius, cb){
  const r=Math.ceil(radius/CELL);
  const gx=Math.floor(W.x[i]/CELL), gy=Math.floor(W.y[i]/CELL);
  for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){
    const c=((gy+dy+P.GRID)%P.GRID)*P.GRID + ((gx+dx+P.GRID)%P.GRID);
    for(let j=W.hashHead[c]; j>=0; j=W.hashNext[j]){
      if(j===i||!W.alive[j]) continue;
      const ddx=wd(W.x[j]-W.x[i]), ddy=wd(W.y[j]-W.y[i]);
      const d2=ddx*ddx+ddy*ddy;
      if(d2<=radius*radius) cb(j, ddx, ddy, Math.sqrt(d2));
    }
  }
}

// ============================================================
// OBSERVATORY RECORDER (Phase 4.0)
// Ring buffer sampled every REC.STRIDE ticks. Channels (Float32):
//  0-6   population per species        7-13  biomass (energy sum) per species
//  14    dissolved mineral   15 bound  16 in-corpses  17 in-detritus
//  18-24 flow deltas since previous sample:
//        18 uptake  19 GPP  20 respiration  21 mineralization(bacRelease)
//        22 corpseToDet  23 egested E  24 deaths
//  25    corpse count       26-32 mean size per species   33-34 sun x,y
//  35-41 deaths per species since previous sample
//  42-48 locus mean per species (Phase 5.1; 0 for species without a locus or with none alive)
//  49-55 locus standard deviation per species — variance is the fuel gauge of evolution
//  56-57 locus spread between light patches, mat/plankton (7.L)  58-64 mean warmth experienced per species (7.H)
//  65    warm-cell count (dT > 3)   66-72 population in warm cells per species
//  73-74 detritus per warm cell / per ambient cell (7.H.4; all of 65-74 exactly 0 without a warm source)
//  75-81 second-locus mean per species   82-88 second-locus sd (multi-locus: locus plane 1;
//        channels 42-55 stay the DISPLAY locus, plane 0, so every calibrated reader keeps its meaning)
//  89-95 plane-2 locus mean   96-102 plane-2 sd   103-109 plane-3 mean   110-116 plane-3 sd (MV.0:
//        full MAXLOCI coverage; exactly 0 while no species carries a third locus)
//  117-140 movement observatory (MV.0), indexed by SPECIES.MOBILE row order (Dri, Cil, Bac, Ven):
//        117-120 light-gradient alignment (mean cos between motion and W.lg*, over organisms in a lit slope)
//        121-124 warmth-gradient alignment (same against W.tg*; exactly 0 in an unwarmed world)
//        125-128 net displacement per tick over the last sample stride (slot-reuse-guarded; 0 on the first sample)
//        129-132 occupancy entropy over an 8x8 grid, normalized to [0,1] (falling = the species is packing)
//        133-136 mean energy reserve (en / cap) of organisms in warm cells (dT > 3; exactly 0 without a warm core)
//        137-140 mean energy reserve of organisms in ambient cells
// CONTRACT: the recorder is a pure observer — zero PRNG draws, zero
// mutation of dynamic state. Conformance bit-identity with the recorder
// running is the standing acceptance test for this whole layer.
// (REC itself is declared in src/sim/world.js, where the buffer is sized from it.)
// ============================================================
// ---- system-event detectors (Phase 4.1): pure observers narrating the world ----
const DET_ESTAB = [40, 40, 20, 80, 10, 4, 4]; // establishment thresholds per species
const det = { estab:[0,0,0,0,0,0,0], run:[0,0,0,0,0,0,0], bloom:[0,0,0,0,0,0,0], crash:[0,0,0,0,0,0,0],
  packAwake:false, depleted:false, lockedWarn:false,
  // heredity detectors run per (species, locus plane): index sp*4 + plane, MAXLOCI recorded planes (LOCUS_CH)
  sweep:new Array(28).fill(0),   // +-1 a line is taking over, +-2 it has taken over (sign = direction from g0)
  uniform:new Array(28).fill(0),
  diverse:new Array(28).fill(0), diverseRun:new Array(28).fill(0),   // standing polymorphism: both ends coexist
  rail:new Array(28).fill(0), railRun:new Array(28).fill(0),           // corridor contact: a locus pinned at its edge (6.2)
  adapt:new Array(28).fill(0), adaptRun:new Array(28).fill(0),         // local adaptation (7.L): the locus differs between patches
  heatRetreat:[0,0,0,0,0,0,0],                              // 7.H.4: a species is thinning out of the warm water
  heatPile:false, heatPileRun:0,                            // 7.H.4: detritus piling up in the warm core (measured 10.1/10.3: x4+ ambient)
  heatStarve:false, heatStarveRun:0,                        // 7.H.4: the apex declining while the warmth it feels stays >= 3
  heatTrap:[0,0,0,0,0,0,0], heatTrapRun:[0,0,0,0,0,0,0] };  // MV.0: a species crowding into warm water while its reserve runs below ambient
// MV.0 movement observatory state: the previous sample's positions, for the net-step channel.
// Pure observer memory (like recPrev); tick -1 = no previous sample. Slot reuse between samples is
// excluded by the birth guard: any spawn into a slot stamps W.birth at or after the previous sample.
const mv = { px: new Float32Array(MAXN), py: new Float32Array(MAXN), ok: new Uint8Array(MAXN), tick: -1 };
// 7.L patch statistics: nearest sun by toroidal distance (the phototaxis rule), locus mean per patch for one
// species. Pure reads; `spread` = max - min over patches holding >= 20 individuals (0 with one sun).
const PATCH_MIN = 20;
const LOCUS_CH = [[42,49],[75,82],[89,96],[103,110]]; // [mean base, sd base] per recorded locus plane (MV.0: all MAXLOCI planes)
function patchMeans(sp, plane){
  const off = (plane||0)*MAXN;
  const K = W.sources.length, n = new Array(K).fill(0), m = new Array(K).fill(0);
  for (let i=0;i<W.n;i++){ if (!W.alive[i] || W.sp[i]!==sp) continue;
    let best=0, bd=Infinity; for (let k=0;k<K;k++){ const dx=wd(W.sources[k].x-W.x[i]), dy=wd(W.sources[k].y-W.y[i]), d=dx*dx+dy*dy; if (d<bd){ bd=d; best=k; } }
    n[best]++; m[best]+=W.g[off+i]; }
  let hi=-1, lo=-1;
  for (let k=0;k<K;k++){ if (n[k] < PATCH_MIN) continue; m[k]/=n[k]; if (hi<0 || m[k]>m[hi]) hi=k; if (lo<0 || m[k]<m[lo]) lo=k; }
  return { n, mean: m, hi, lo, spread: hi>=0 && lo>=0 ? m[hi]-m[lo] : 0 };
}
function pushEvent(type, sp, text, locus){
  W.sysEvents.push(locus !== undefined ? { tick: W.tick, type, sp, locus, text } : { tick: W.tick, type, sp, text });
  if (W.sysEvents.length > 200) W.sysEvents.shift();
}
function detect(r, awake){
  detectEcology(r, awake);
  detectHeredity(r);
  detectChemistry(r);
  detectHeat(r);
  detectMove(r);
}
// ---- ecology: establishment, wake, extinction, blooms and crashes per species ----
function detectEcology(r, awake){
  const B = W.rec, N = REC.N, CH = REC.CH;
  const winSec = (10*REC.STRIDE)/10; // the 10-sample window in seconds at 1x speed (200 ticks = 20 s)
  const havePrev = W.recCount >= 1, have10 = W.recCount >= 10;
  const rPrev = ((W.recHead-1+N)%N)*CH, r10 = ((W.recHead-10+N)%N)*CH;
  for (let sp=0; sp<7; sp++){
    const name = TRAITS[sp].name;
    const apex = TRAITS[sp].apex;
    const now = apex ? awake[sp] : B[r+sp];
    const before = havePrev ? (apex ? -1 : B[rPrev+sp]) : -1;
    // establishment (sustained)
    if (!det.estab[sp]){
      det.run[sp] = now >= DET_ESTAB[sp] ? det.run[sp]+1 : 0;
      if (det.run[sp] >= 5){ det.estab[sp]=1;
        pushEvent("estab", sp, apex ? name+" established — "+(now|0)+" hunters." : name+" established — "+(now|0)+" strong."); }
    }
    // predator wake (first hunter out of its cyst)
    if (apex && !det.packAwake && awake[sp] >= 1){ det.packAwake=true;
      pushEvent("wake", sp, "The pack wakes — "+name+" is hunting."); }
    // extinction (any presence to zero, on the full count incl. dormant)
    if (havePrev && B[rPrev+sp] > 0 && B[r+sp] === 0)
      pushEvent("extinct", sp, name+" has died out.");
    // bloom onset / crash over a 10-sample window
    if (have10 && !apex){
      const ago = B[r10+sp], growth = B[r+sp]/Math.max(1, ago);
      if (det.bloom[sp]===0 && growth >= 1.8 && B[r+sp] >= 50){ det.bloom[sp]=1;
        pushEvent("bloom", sp, name+" bloom under way — up "+growth.toFixed(1)+"x in "+winSec+" s."); }
      else if (det.bloom[sp]===1 && growth < 1.1) det.bloom[sp]=0;
      if (det.crash[sp]===0 && growth <= 0.55 && ago >= 50){ det.crash[sp]=1;
        pushEvent("crashev", sp, name+" crashing — down "+Math.round((1-growth)*100)+"% in "+winSec+" s."); }
      else if (det.crash[sp]===1 && growth > 0.9) det.crash[sp]=0;
    }
  }
}
// ---- heredity (Phase 5.1/5.7): sweeps, diversifying, diversity collapse, per species with a locus ----
function detectHeredity(r){
  const B = W.rec, N = REC.N, CH = REC.CH;
  // Calibrated on the 8-seed evolving ensemble: founders sit within +-0.05 of g0 for the first
  // ~2,000 ticks (sd 0.02-0.05), so the dead zone silences the founding; a real sweep carries the
  // mean >= 0.10 from g0 with a 60% majority on that side, reached at t ~ 8,000-12,000.
  // a warmth-gated locus is unexpressed in an unwarmed world: its variation is pure drift, and narrating
  // drift as selection ("a line is taking over", "lines coexist, neither winning") would be a lie. Selection
  // stories wait for warmth; rail contact is a corridor concern and is always reported.
  const warmWorld = P.tempAmb > 0 || W.sources.some(s => s.a > 0);
  for (let sp=0; sp<7; sp++){
    const loci = TRAITS[sp].loci; if (!loci.length || B[r+sp] < 50) continue;
    for (let kL=0; kL<loci.length && kL<LOCUS_CH.length; kL++){
    const L = loci[kL], di = sp*4 + kL, off = kL*MAXN; // 4 = LOCUS_CH.length (MV.0: one detector slot per MAXLOCI plane)
    const gated = L.warmGated && !warmWorld;
    const mean = B[r+LOCUS_CH[kL][0]+sp], sd = B[r+LOCUS_CH[kL][1]+sp], name = TRAITS[sp].name;
    let hi=0, lo=0, n=0, railHi=0, railLo=0;
    for (let i=0;i<W.n;i++) if (W.alive[i] && W.sp[i]===sp){ n++; const g=W.g[off+i]; if (g > L.g0+0.05) hi++; else if (g < L.g0-0.05) lo++; if (g > 0.98) railHi++; else if (g < 0.02) railLo++; }
    const shareHi = hi/n, shareLo = lo/n;
    // rail contact (6.2): a third of the population pinned at a corridor edge for 10 samples -- the
    // trait has run out of room, which is a certification concern the player should see as a story
    const railShare = Math.max(railHi, railLo)/n, railDir = railHi >= railLo ? 1 : -1;
    det.railRun[di] = railShare >= 0.30 ? det.railRun[di]+1 : 0;
    if (!det.rail[di] && det.railRun[di] >= 10){ det.rail[di] = railDir;
      pushEvent("rail", sp, name+" has reached the limit of its "+L.label.toLowerCase()+" — "+Math.round(railShare*100)+"% at the "+(railDir>0 ? L.hiWord : L.loWord)+" edge.", kL); }
    else if (det.rail[di] && railShare < 0.15) det.rail[di] = 0;
    const dir = gated ? 0 : (mean - L.g0 >= 0.10 && shareHi >= 0.6) ? 1 : (L.g0 - mean >= 0.10 && shareLo >= 0.6) ? -1 : 0;
    const share = dir > 0 ? shareHi : shareLo;
    const word = dir > 0 ? L.hiWord : L.loWord;
    if (gated) det.sweep[di] = 0;
    if (det.sweep[di] === 0 && dir !== 0){ det.sweep[di] = dir;
      pushEvent("sweep", sp, "A "+word+" "+name+" line is taking over — "+Math.round(share*100)+"% of the population and rising.", kL); }
    else if (Math.abs(det.sweep[di]) === 1 && dir === det.sweep[di] && share >= 0.85){ det.sweep[di] *= 2;
      pushEvent("sweep", sp, "The "+word+" "+name+" line has taken over — "+Math.round(share*100)+"% of the population.", kL); }
    else if (det.sweep[di] !== 0 && Math.max(shareHi, shareLo) < 0.45) det.sweep[di] = 0;
    // diversifying: standing variation established with no line winning -- both strategies coexist.
    // Measured on the balanced (5.7) world: sd climbs 0.02 -> 0.10-0.17 while the mean stays near g0;
    // a sweep instead carries the mean away. The two events are mutually exclusive by construction.
    if (!gated && det.sweep[di] === 0 && sd >= 0.10 && Math.abs(mean - L.g0) < 0.15 && shareHi >= 0.2 && shareLo >= 0.2) det.diverseRun[di]++;
    else det.diverseRun[di] = 0;
    if (!det.diverse[di] && det.diverseRun[di] >= 10){ det.diverse[di] = 1;
      pushEvent("diverse", sp, name+" is diversifying — "+L.hiWord+" and "+L.loWord+" lines coexist, neither winning.", kL); }
    else if (det.diverse[di] && (sd < 0.06 || det.sweep[di] !== 0)) det.diverse[di] = 0;
    // local adaptation (7.L): with two or more suns, the locus mean differs between patches by >= 0.10 for
    // 10 samples (each patch holding >= 20). Calibrated on the seeded twin/dim layouts: the plankton's defense
    // locus separated by 0.10-0.18 where the grazers stayed in one patch; the mat's light locus by <= 0.04.
    if (W.sources.length > 1 && !gated){
      const pm = patchMeans(sp, kL);
      det.adaptRun[di] = pm.spread >= 0.10 ? det.adaptRun[di]+1 : 0;
      if (!det.adapt[di] && det.adaptRun[di] >= 10){ det.adapt[di] = 1;
        pushEvent("adapt", sp, name+" differs by patch — "+L.hiWord+" near sun "+(pm.hi+1)+", "+L.loWord+" near sun "+(pm.lo+1)+".", kL); }
      else if (det.adapt[di] && pm.spread < 0.05) det.adapt[di] = 0;
    } else { det.adapt[di] = 0; det.adaptRun[di] = 0; }
    // diversity collapse: variation falls to well under half of what it was 270 samples ago.
    // Selection consuming variation is the normal end of a sweep; the event names the cost.
    if (W.recCount >= 271 && !gated){
      const sdAgo = B[((W.recHead-270+N)%N)*CH + LOCUS_CH[kL][1] + sp];
      if (!det.uniform[di] && sdAgo >= 0.06 && sd <= 0.4*sdAgo){ det.uniform[di] = 1;
        pushEvent("uniform", sp, kL === 0 ? "Variation collapsing in "+name+" — the population is becoming uniform."
          : "Variation collapsing in "+name+"'s "+L.label.toLowerCase()+" — the trait is becoming uniform.", kL); }
      else if (det.uniform[di] && sd > 0.7*sdAgo) det.uniform[di] = 0;
    }
    }
  }
}
// ---- heat (7.H.4): the warm-water narrations, calibrated against the §10 tables of phase7-heat-plan.md ----
// All three read only warm-core channels (65-74) and warmth felt (58-64), every one exactly 0 without a warm
// source, so the certified world is silent by construction. Warm = dT > 3, the harness's own cut.
function detectHeat(r){
  const B = W.rec, N = REC.N, CH = REC.CH;
  const wN = B[r+65], cells = P.GRID*P.GRID;
  // retreat: a species' warm-core count halves against 50 samples (1,000 ticks) ago. Measured 10.1: the hot
  // sun halves the mat within ~2,000 ticks; 10.4: thermotaxis moves the plankton out at the same pace. The
  // wording claims only what is measured -- thinning where it is warm, whether by dying or by leaving.
  if (W.recCount >= 51 && wN >= 20){
    const r50 = ((W.recHead-50+N)%N)*CH;
    for (let sp=0; sp<7; sp++){
      const ago = B[r50+66+sp], now = B[r+66+sp];
      if (!det.heatRetreat[sp] && ago >= 30 && now <= 0.5*ago){ det.heatRetreat[sp] = 1;
        pushEvent("heatRetreat", sp, TRAITS[sp].name+" is thinning out of the warm water — down "+Math.round((1-now/Math.max(1,ago))*100)+"% where it is warm."); }
      else if (det.heatRetreat[sp] && now >= 0.8*Math.max(1,ago)) det.heatRetreat[sp] = 0;
    }
  } else if (wN < 20) det.heatRetreat.fill(0);
  // pile-up: dead matter accumulating in the warm core faster than decomposition eats it. Measured 10.1/10.3:
  // 3.4-9.7 per warm cell against 0.01-2.4 ambient; healthy cells carry ~2. Needs a real ambient outside
  // (>= 100 cells) so a global press does not read as a "core".
  const warmD = B[r+73], ambD = B[r+74];
  det.heatPileRun = (wN >= 20 && cells - wN >= 100 && warmD >= 4 && warmD >= 2*Math.max(0.2, ambD)) ? det.heatPileRun+1 : 0;
  if (!det.heatPile && det.heatPileRun >= 10){ det.heatPile = true;
    pushEvent("heatPile", -1, "Dead matter is piling up in the warm water — "+warmD.toFixed(1)+" per cell against "+ambD.toFixed(1)+" outside."); }
  else if (det.heatPile && (wN < 20 || warmD < 2)) det.heatPile = false;
  // apex starving in the heat: warmth felt >= 3 sustained while the pack shrinks. Upkeep scales x2.5^(dT/10)
  // against a bite at x1.8^(dT/10) -- the mismatch is the mechanism (10.2), the count falling is the evidence.
  const APX = SPECIES.APEX, felt = B[r+58+APX];
  det.heatStarveRun = (felt >= 3 && B[r+APX] > 0) ? det.heatStarveRun+1 : 0;
  if (!det.heatStarve && det.heatStarveRun >= 10 && W.recCount >= 26){
    const r25 = ((W.recHead-25+N)%N)*CH;
    if (B[r+APX] < B[r25+APX]){ det.heatStarve = true;
      pushEvent("heatStarve", APX, "The pack is starving in the heat — upkeep ×"+Math.pow(P.q10.resp, felt/10).toFixed(1)+" against meals that scale flatter."); }
  }
  else if (det.heatStarve && felt < 2) det.heatStarve = false;
}
// ---- movement (MV.0): the trap detector -- a species running its reserve down in warmth it stays in ----
// The statistic behind phase7-heat-plan.md §12 (the +8 core), calibrated in harness/move.js --trap.
// The first design contrasted warm-core reserve against the ambient population (channels 133-140) and
// died against the measurement: under +8 the warm region covers the whole inhabited area, the share
// saturates at 1.0 for every species, and no ambient population remains to contrast with (fired 0/8
// while the grazer went extinct 8/8). What separates the trap worlds is LEVEL, not contrast: warmth
// felt >= 3 sustained while the reserve sits below the species' measured healthy band (REFERENCE_BANDS
// resP10) and keeps falling. Measured on the +8 worlds: Drifta -- the species whose set-point drags it
// in -- fires 8/8 at t 3,700-4,680, ahead of the core loss (4,180-5,444) on every seed; Bacillus 5/8
// (a true squeeze, the one heatRetreat also sees); the grazer's own collapse outruns the trend window
// (~1,200 ticks) and stays narrated by its crash/extinction events. Warmth felt is exactly 0 in an
// unwarmed world, so the certified world is silent by construction. Apex excluded: heatStarve is its story.
function detectMove(r){
  const B = W.rec, N = REC.N, CH = REC.CH;
  if (W.recCount < 26) return;
  const r25 = ((W.recHead-25+N)%N)*CH;
  for (let m=0;m<SPECIES.MOBILE.length;m++){
    const sp = SPECIES.MOBILE[m]; if (sp === SPECIES.APEX) continue;
    const RB = REFERENCE_BANDS[sp]; if (!RB) continue;
    const pop = B[r+sp], felt = B[r+58+sp];
    const reserve = pop >= 1 ? (B[r+7+sp]/pop)/(P.capMul*(B[r+26+sp]||1)) : 0;
    const popAgo = B[r25+sp];
    const resAgo = popAgo >= 1 ? (B[r25+7+sp]/popAgo)/(P.capMul*(B[r25+26+sp]||1)) : reserve;
    const on = pop >= 50 && felt >= 3 && reserve < RB.resP10 && reserve < resAgo - 0.02;
    det.heatTrapRun[sp] = on ? det.heatTrapRun[sp]+1 : 0;
    if (!det.heatTrap[sp] && det.heatTrapRun[sp] >= 10){ det.heatTrap[sp] = 1;
      pushEvent("heatTrap", sp, TRAITS[sp].name+" is running itself down in the warm water — reserve "+Math.round(reserve*100)+"% against a healthy "+Math.round(RB.resP10*100)+"%+."); }
    else if (det.heatTrap[sp] && (felt < 2 || reserve > RB.resP10)) det.heatTrap[sp] = 0;
  }
}
// ---- chemistry: mineral depletion trend and lock-up level (the K6 detectors) ----
function detectChemistry(r){
  const B = W.rec, N = REC.N, CH = REC.CH;
  const total = B[r+14]+B[r+15]+B[r+16]+B[r+17];
  const dissolvedFrac = B[r+14]/Math.max(1,total), lockedFrac = (B[r+16]+B[r+17])/Math.max(1,total);
  // Depletion is a trend, not a level (calibrated: healthy worlds DIP to 17% and recover;
  // the dying world never once turns). Six minutes of relentless decline is the signature.
  if (W.recCount >= 271){
    // Calibration verdict (4.6): "dissolved falling" is what healthy GROWTH also does —
    // the true death axis is the locked share's trend. Measured: healthy nine-minute
    // locked gains never exceed +5.1 points; the strangling world climbs monotonically.
    const r270 = ((W.recHead-270+N)%N)*CH;
    const tot270 = B[r270+14]+B[r270+15]+B[r270+16]+B[r270+17];
    const lockedAgo = (B[r270+16]+B[r270+17])/Math.max(1,tot270);
    const lockGain = lockedFrac - lockedAgo;
    // founding-edge guard: the trend alone spikes when the window reaches back to the
    // corpse-free birth; require the locked LEVEL to already be abnormal (healthy ~9-11%).
    if (!det.depleted && lockGain >= 0.08 && lockedFrac >= 0.15){ det.depleted=true;
      pushEvent("depleted", -1, "Mineral is flowing into dead matter faster than it returns."); }
    else if (det.depleted && lockGain < 0.02) det.depleted=false;
  }
  if (!det.lockedWarn && lockedFrac > 0.35){ det.lockedWarn=true;
    pushEvent("locked", -1, "Over a third of the world's mineral is locked in dead matter."); }
  else if (det.lockedWarn && lockedFrac < 0.28) det.lockedWarn=false;
}
const recPrev = { uptake:0, gpp:0, resp:0, bacRelease:0, corpseToDet:0, egestE:0, deaths:0, deathsBy:[0,0,0,0,0,0,0] };
function record(){
  const r = W.recHead * REC.CH, B = W.rec;
  const awake = [0,0,0,0,0,0,0];
  for (let k=0;k<REC.CH;k++) B[r+k]=0;
  for (let i=0;i<W.n;i++){
    if (!W.alive[i]) continue;
    const sp = W.sp[i];
    B[r+sp]++; B[r+7+sp]+=W.en[i]; B[r+26+sp]+=W.sz[i];
    if (!W.cy[i]) awake[sp]++;
  }
  for (let sp=0;sp<7;sp++) if (B[r+sp]>0) B[r+26+sp]/=B[r+sp];
  // locus mean + sd per (species, locus plane), awake and dormant alike (the genome does not sleep)
  for (let sp=0;sp<7;sp++){
    const loci = TRAITS[sp].loci; if (!loci.length || B[r+sp] === 0) continue;
    for (let k=0;k<loci.length && k<LOCUS_CH.length;k++){
      let m=0, m2=0; const off=k*MAXN;
      for (let i=0;i<W.n;i++) if (W.alive[i] && W.sp[i]===sp){ const g=W.g[off+i]; m+=g; m2+=g*g; }
      const n=B[r+sp], mean=m/n, varr=Math.max(0, m2/n - mean*mean);
      B[r+LOCUS_CH[k][0]+sp]=mean; B[r+LOCUS_CH[k][1]+sp]=Math.sqrt(varr);
    }
  }
  // 7.L local adaptation: the locus spread between light patches for the mat (56) and the plankton (57);
  // exactly 0 with one sun. (Measured first as a genotype-light correlation: the wrong instrument -- Solara's
  // locus reads shaded light, which mat density equalises across patches; the patch difference is what moved.)
  // 7.H: mean warmth experienced per species (58-64) and warm-core population (66-72); exactly 0 without a warm source
  { const st = [0,0,0,0,0,0,0], sn = [0,0,0,0,0,0,0], wc = [0,0,0,0,0,0,0];
    for (let i=0;i<W.n;i++) if (W.alive[i]){ const tv = W.temp[cellOf(i)]; st[W.sp[i]] += tv; sn[W.sp[i]]++; if (tv > 3) wc[W.sp[i]]++; }
    for (let sp=0;sp<7;sp++){ B[r+58+sp] = sn[sp] ? st[sp]/sn[sp] : 0; B[r+66+sp] = wc[sp]; } }
  B[r+56] = W.sources.length > 1 && TRAITS[SPECIES.MAT].locus ? patchMeans(SPECIES.MAT).spread : 0;
  B[r+57] = W.sources.length > 1 && TRAITS[SPECIES.PREY].locus ? patchMeans(SPECIES.PREY).spread : 0;
  let fM=0, dM=0, wCells=0, wDet=0, aDet=0;
  for (let c=0;c<P.GRID*P.GRID;c++){ fM+=W.M[c]; dM+=W.dM[c];
    const Dc = W.dE[c]+W.dP[c]+W.dM[c];
    if (W.temp[c] > 3){ wCells++; wDet+=Dc; } else aDet+=Dc; }
  { const cells = P.GRID*P.GRID; // 7.H.4 warm-core census: count, detritus per warm cell / per ambient cell.
    // 74 is gated on a warm core existing, so all of 65-74 are exactly 0 in an unwarmed world.
    B[r+65]=wCells; B[r+73]= wCells ? wDet/wCells : 0; B[r+74]= wCells && cells-wCells ? aDet/(cells-wCells) : 0; }
  // MV.0 movement observatory (117-140): pure reads over positions, motion state and fields.
  // Motion direction is the velocity vector for the drifter and the heading for tumble/steer species
  // (each is what the organism actually moved along this tick). Net step pairs each organism with its
  // own position at the previous sample; the birth guard excludes newborns and reused slots.
  { const MB = SPECIES.MOBILE, nM = MB.length, mIdx = [-1,-1,-1,-1,-1,-1,-1];
    for (let m=0;m<nM;m++) mIdx[MB[m]] = m;
    const la=new Array(nM).fill(0), ln=new Array(nM).fill(0), ta=new Array(nM).fill(0), tn=new Array(nM).fill(0);
    const ds=new Array(nM).fill(0), dn=new Array(nM).fill(0), we=new Array(nM).fill(0), wc2=new Array(nM).fill(0);
    const ae=new Array(nM).fill(0), an=new Array(nM).fill(0), occ=new Array(nM*64).fill(0);
    const OCELL = P.WORLD/8;
    for (let i=0;i<W.n;i++){
      if (!W.alive[i]) continue; const m = mIdx[W.sp[i]]; if (m < 0) continue;
      const c = cellOf(i), drift = TRAITS[W.sp[i]].movement === "drift";
      const mx = drift ? W.vx[i] : Math.cos(W.hd[i]), my = drift ? W.vy[i] : Math.sin(W.hd[i]);
      const mm = Math.hypot(mx,my);
      if (mm > 1e-6){
        const lgm = Math.hypot(W.lgx[c],W.lgy[c]);
        if (lgm > 0){ la[m] += (mx*W.lgx[c]+my*W.lgy[c])/(mm*lgm); ln[m]++; }
        const tgm = Math.hypot(W.tgx[c],W.tgy[c]);
        if (tgm > 0){ ta[m] += (mx*W.tgx[c]+my*W.tgy[c])/(mm*tgm); tn[m]++; }
      }
      if (mv.tick >= 0 && mv.ok[i] && W.birth[i] < mv.tick){
        ds[m] += Math.hypot(wd(W.x[i]-mv.px[i]), wd(W.y[i]-mv.py[i])); dn[m]++; }
      const res = W.en[i]/(P.capMul*W.sz[i]);
      if (W.temp[c] > 3){ we[m] += res; wc2[m]++; } else { ae[m] += res; an[m]++; }
      occ[m*64 + (Math.floor(W.y[i]/OCELL)&7)*8 + (Math.floor(W.x[i]/OCELL)&7)]++;
    }
    for (let m=0;m<nM;m++){
      B[r+117+m] = ln[m] ? la[m]/ln[m] : 0;
      B[r+121+m] = tn[m] ? ta[m]/tn[m] : 0;
      B[r+125+m] = dn[m] ? ds[m]/(dn[m]*(W.tick - mv.tick)) : 0;
      let H=0, tot=0; for (let b=0;b<64;b++) tot += occ[m*64+b];
      if (tot > 0){ for (let b=0;b<64;b++){ const p = occ[m*64+b]/tot; if (p > 0) H -= p*Math.log(p); } }
      B[r+129+m] = tot > 0 ? H/Math.log(64) : 0;
      B[r+133+m] = wc2[m] ? we[m]/wc2[m] : 0;
      B[r+137+m] = an[m] ? ae[m]/an[m] : 0;
    }
    mv.px.set(W.x); mv.py.set(W.y); mv.ok.set(W.alive); mv.tick = W.tick;
  }
  let bM=0; for (let i=0;i<W.n;i++) if (W.alive[i]) bM+=W.mn[i];
  let cM=0, cN2=0;
  for (let k=0;k<W.cN;k++) if (W.cAlive[k]){ cM+=W.cM[k]; cN2++; }
  B[r+14]=fM; B[r+15]=bM; B[r+16]=cM; B[r+17]=dM; B[r+25]=cN2;
  const F=W.flows;
  B[r+18]=F.uptake-recPrev.uptake;       recPrev.uptake=F.uptake;
  B[r+19]=F.gpp-recPrev.gpp;             recPrev.gpp=F.gpp;
  B[r+20]=F.resp-recPrev.resp;           recPrev.resp=F.resp;
  B[r+21]=F.bacRelease-recPrev.bacRelease; recPrev.bacRelease=F.bacRelease;
  B[r+22]=F.corpseToDet-recPrev.corpseToDet; recPrev.corpseToDet=F.corpseToDet;
  B[r+23]=F.egestE-recPrev.egestE;       recPrev.egestE=F.egestE;
  B[r+24]=F.deaths-recPrev.deaths;       recPrev.deaths=F.deaths;
  B[r+33]=W.sources[0].x; B[r+34]=W.sources[0].y;
  for (let sp=0;sp<7;sp++){ B[r+35+sp]=F.deathsBy[sp]-recPrev.deathsBy[sp]; recPrev.deathsBy[sp]=F.deathsBy[sp]; }
  detect(r, awake);
  W.recHead=(W.recHead+1)%REC.N;
  if (W.recCount<REC.N) W.recCount++;
}
// ---- indicators (Phase 4.2): the health dashboard, computed on demand ----
function detrend(xs){
  const n=xs.length; let sx=0,sy=0,sxy=0,sxx=0;
  for(let i=0;i<n;i++){ sx+=i; sy+=xs[i]; sxy+=i*xs[i]; sxx+=i*i; }
  const b=(n*sxy-sx*sy)/((n*sxx-sx*sx)||1), a=(sy-b*sx)/n;
  return xs.map((v,i)=>v-(a+b*i));
}
function windowStats(sp, back, Wn){ // AC1 + variance of a detrended window ending `back` samples ago
  const xs=[];
  for(let k=back+Wn;k>back;k--) xs.push(W.rec[((W.recHead-k+REC.N)%REC.N)*REC.CH + sp]);
  const mean = xs.reduce((a,b)=>a+b,0)/Wn;
  const res = detrend(xs);
  let num=0, den=0;
  for(let i=0;i<Wn-1;i++) num+=res[i]*res[i+1];
  for(let i=0;i<Wn;i++) den+=res[i]*res[i];
  return { mean, ac1: den>0 ? num/den : 0, varr: den/Wn };
}
// Clinical reference ranges, measured on the healthy six-seed ensemble (462 windows/species):
// like blood work, "low" is species-specific — a 50% Drifta crash is routine, a 10% Solara dip is not.
const REFERENCE_BANDS = {
  0: { resP03: 0.43, resP10: 0.44, popP03: 0.93, popP10: 0.97 },
  1: { resP03: 0.27, resP10: 0.28, popP03: 0.44, popP10: 0.60 },
  2: { resP03: 0.33, resP10: 0.37, popP03: 0.47, popP10: 0.62 },
  3: { resP03: 0.22, resP10: 0.23, popP03: 0.82, popP10: 0.89 },
  6: { resP03: 0.24, resP10: 0.27, popP03: 0.80, popP10: 0.88 },
};
function strainOf(sp){
  // Calibration verdict (4.2, on archived ground truth): generic EWS statistics
  // misfire on this system — absolute AC1 flags slow-lifecycle species, and
  // baseline-relative AC1 normalizes chronic decline. The mechanistic vitals we
  // used for diagnosis all phase are the honest headline; EWS ships demoted to
  // an advisory overlay (dAc1/varX fields), clearly experimental.
  const Wn=60;
  if (W.recCount < 2*Wn) return null;
  const r0=((W.recHead-1+REC.N)%REC.N)*REC.CH, r60=((W.recHead-Wn+REC.N)%REC.N)*REC.CH;
  const pop=W.rec[r0+sp];
  if (pop < 20) return null;
  const meanSz = W.rec[r0+26+sp]||1;
  const reserve = (W.rec[r0+7+sp]/pop)/(P.capMul*meanSz);
  const popAgo = W.rec[r60+sp], resAgo = popAgo>0 ? (W.rec[r60+7+sp]/popAgo)/(P.capMul*(W.rec[r60+26+sp]||1)) : reserve;
  const resTrend = reserve - resAgo, popTrend = pop/Math.max(1,popAgo);
  const RB = REFERENCE_BANDS[sp];
  if (!RB) return null;
  const level = ((reserve < RB.resP03 && resTrend < -0.01) || popTrend < RB.popP03*0.9) ? 2
              : (reserve < RB.resP10 || popTrend < RB.popP10) ? 1 : 0;
  const adv = W.recCount >= 3*Wn ? (()=>{ const now=windowStats(sp,1,Wn), base=windowStats(sp,2*Wn,Wn);
    return { dAc1:+(now.ac1-base.ac1).toFixed(2), varX:+(now.varr/(base.varr||1)).toFixed(2) }; })() : {};
  return { level, reserve:+reserve.toFixed(2), trend:+resTrend.toFixed(3), popTrend:+popTrend.toFixed(2), ...adv };
}
function indicators(){ // labels follow the naming rule: functional first, science as subtitle
  if (W.recCount < 2) return null;
  const r0 = ((W.recHead-1+REC.N)%REC.N)*REC.CH, B=W.rec;
  let H=0, bioTot=0; const bio=[];
  for(let sp=0;sp<7;sp++){ bio.push(B[r0+7+sp]); bioTot+=B[r0+7+sp]; }
  for(let sp=0;sp<7;sp++){ const p=bio[sp]/(bioTot||1); if(p>0) H-=p*Math.log(p); }
  const K=Math.min(15, W.recCount); let g=0, rr=0, up=0;
  for(let k=1;k<=K;k++){ const rk=((W.recHead-k+REC.N)%REC.N)*REC.CH; g+=B[rk+19]; rr+=B[rk+20]; up+=B[rk+18]; }
  const total = B[r0+14]+B[r0+15]+B[r0+16]+B[r0+17];
  const turnoverTicks = (up>0) ? B[r0+15] / (up/(K*REC.STRIDE)) : Infinity;
  const strain = [];
  for(let sp=0;sp<7;sp++) strain.push(TRAITS[sp].apex ? null : strainOf(sp));
  let ven = null;
  if (B[r0+6] > 0){
    const meanSz = B[r0+32]||9, cap = P.capMul*meanSz;
    let loss=0; const KL=Math.min(10,W.recCount);
    for(let k=1;k<=KL;k++) loss+=B[((W.recHead-k+REC.N)%REC.N)*REC.CH+35+2];
    ven = { reserve: (B[r0+13]/B[r0+6])/cap, preyLossRate: loss/(KL*REC.STRIDE/10) };
  }
  let adSum=0, adN=0; // adaptability (6.2): mean locus sd over every (species, locus) with >= 20 alive
  for (let sp=0;sp<7;sp++) if (B[r0+sp] >= 20)
    TRAITS[sp].loci.forEach((L, k) => { if (k < LOCUS_CH.length){ adSum += B[r0+LOCUS_CH[k][1]+sp]; adN++; } });
  return {
    adaptability: adN ? +(adSum/adN).toFixed(3) : null, // subtitle: mean heritable variation
    variety: +H.toFixed(2),                      // subtitle: Shannon diversity
    prodVsCons: +(g/(rr||1)).toFixed(2),         // subtitle: P/R (Odum)
    recyclingMin: turnoverTicks===Infinity ? null : +(turnoverTicks/600).toFixed(1), // subtitle: mineral turnover time
    lockedPct: +(100*(B[r0+16]+B[r0+17])/(total||1)).toFixed(0), // subtitle: locked fraction
    pyramid: { producers:+((bio[0]+bio[1])/(bioTot||1)).toFixed(2), grazers:+(bio[2]/(bioTot||1)).toFixed(2),
               decomposers:+(bio[3]/(bioTot||1)).toFixed(2), predators:+(bio[6]/(bioTot||1)).toFixed(2) },
    strain, venator: ven,
  };
}
// ---- intervention impact (4.5): Before-After windows, honestly labeled ----
// One world, no control: BACI without the CI. Every consumer of this result
// must say "since", never "because" — the wording discipline lives in the UI,
// the arithmetic lives here so the Kotlin port inherits it.
const IMPACT_CHS = [[0,"Solara"],[1,"Drifta"],[2,"Cilio"],[3,"Bacillus"],[6,"Venator"],[14,"dissolved mineral"],[19,"production"]];
// natural-variability floors (measured: mats barely move, plankton blooms 2.5x unprovoked)
const IMPACT_NOISE = { 0:12, 1:170, 2:55, 3:20, 6:25, 14:15, 19:30 };
// presses: interventions that change the regime rather than poke it once (a changed sky, changed evolution settings)
const IMPACT_PRESS = new Set(["source","sunlight","sourceAdd","sourceRemove","sourceSet","sourceLayout","mutation","evolution","preset",
  "wallAdd","wallRemove","wallSet"]); // a wall changes the regime, not a moment (7.W)
function impact(entry){
  const isPress = IMPACT_PRESS.has(entry.type);
  const i0 = W.recCount-1 - Math.floor((W.tick - entry.tick)/REC.STRIDE);
  if (i0 < 15) return { status:"rolled" };
  const avail = W.recCount-1 - i0, need = isPress ? 45 : 30;
  if (avail < 8) return { status:"watching", pct: Math.min(99, Math.round(100*avail/need)) };
  const win = Math.min(avail, need);
  const at = (k,ch) => W.rec[((W.recHead-W.recCount+k+REC.N)%REC.N)*REC.CH+ch];
  // Interrupted time series: fit the baseline TREND and measure departure from its
  // extrapolation — an intervention during an ongoing decline is credited only with
  // deviations from that decline, not with the decline itself.
  const base = {}, movers = [];
  for (const [ch,name] of IMPACT_CHS){
    let sx=0, sy=0, sxy=0, sxx=0;
    for (let j=0;j<15;j++){ const v=at(i0-15+j,ch); sx+=j; sy+=v; sxy+=j*v; sxx+=j*j; }
    const slope=(15*sxy-sx*sy)/((15*sxx-sx*sx)||1), icpt=(sy-slope*sx)/15;
    const b = icpt + slope*14; // baseline level at the intervention
    base[ch] = { b, slope, icpt };
    let a=0, ex=0, cnt=0;
    for (let k=i0+Math.max(1,win-10); k<=i0+win; k++){
      a += at(k,ch);
      // never trust a trend farther than it was observed: clamp extrapolation at 15 samples
      ex += icpt + slope*(14 + Math.min(k-i0, 15));
      cnt++;
    }
    a/=(cnt||1); ex/=(cnt||1);
    if (b<2 && a<2) continue;
    // departure from trend, expressed against the stable pre-intervention level
    movers.push({ ch, name, pct: Math.round(100*(a-ex)/Math.max(3,Math.abs(b))) });
  }
  movers.sort((x,y)=>Math.abs(y.pct)-Math.abs(x.pct));
  const notable = movers
    .filter(m => Math.abs(m.pct) >= (IMPACT_NOISE[m.ch]||15))
    .map(m => ({ ...m, strong: Math.abs(m.pct) >= 1.5*(IMPACT_NOISE[m.ch]||15) }))
    .slice(0,3);
  let recoveredS = null;
  if (!isPress && notable.length){
    for (let k=i0+5; k<=i0+win; k++){
      let allIn = true;
      for (const m of notable){
        const ex = base[m.ch].icpt + base[m.ch].slope*(14 + Math.min(k-i0, 15));
        if (Math.abs(at(k,m.ch)-ex) > 0.12*Math.max(1,Math.abs(ex))){ allIn=false; break; }
      }
      if (allIn){ recoveredS = Math.round((k-i0)*REC.STRIDE/10); break; }
    }
  }
  const mixed = W.evLog.some(e => e !== entry && e.type !== "undo" &&
    e.tick > entry.tick - 600 && e.tick < entry.tick + win*REC.STRIDE);
  const pressBackdrop = !isPress && W.evLog.some(e => e !== entry &&
    IMPACT_PRESS.has(e.type) && e.tick < entry.tick);
  return { status:"done", isPress, notable, recoveredS, mixed, pressBackdrop, complete: win >= need };
}
// ============================================================
// LEARNING LEVELS (Phase 8.0) — guided experiments over the certified world.
//
// Contract, same discipline as the rest of the observatory:
//   - Definitions are DATA. Every number below was measured, not designed;
//     the calibration runs live in docs/phase8-levels-plan.md and
//     harness/levels.js re-proves them on every run: a level must FAIL with
//     no player action and PASS with the intended strategy, or it is a
//     demonstration wearing a challenge's clothes.
//   - Evaluation (levelCheck) is a PURE OBSERVER: zero PRNG draws, zero
//     mutation of dynamic state. It reads the recorder's ring buffer one
//     sample at a time, so verdicts are identical at any UI speed and in
//     the headless harness.
//   - Setup (levelStart) composes only the legal entry points: the
//     initWorld scenario (draw-free when absent) and applyEvent. A level
//     world is its own world, like a moved sun — no conformance claim.
// ============================================================
const LVL = { def: null, state: "idle", run: 0, seenS: 0, pourLeft: 0, failWhy: "", predicted: -1 };

// one recorder sample, `back` samples before the latest (pure ring-buffer reads)
function lvlSample(back){
  const r = ((W.recHead - 1 - back + REC.N) % REC.N) * REC.CH, B = W.rec;
  const total = B[r+14] + B[r+15] + B[r+16] + B[r+17];
  return { pop: sp => B[r+sp], free: B[r+14],
    lockShare: (B[r+16] + B[r+17]) / Math.max(1, total) };
}

function levelStart(def, predicted){
  P.mutation = false;   // experiments run on the certified silent world; the sandbox restores true
  P.lightMul = 1.0;
  resetWorld();
  initWorld(def.world.seed, { found: def.world.found, M0: def.world.M0 });
  if (def.world.lightMul !== undefined) applyEvent({ type: "lightMul", v: def.world.lightMul });
  LVL.def = def; LVL.state = "running"; LVL.run = 0; LVL.seenS = 0; LVL.failWhy = "";
  LVL.pourLeft = def.apparatus.pours === true ? Infinity : (def.apparatus.pours | 0);
  LVL.predicted = predicted === undefined ? -1 : predicted; // F1: committed before the run; contrast, never grade
}
function levelRestart(){ const d = LVL.def, p = LVL.predicted; if (d) levelStart(d, p); }
// F2: the freshest Observatory event of a type this level narrates (pure read; null outside a level)
function levelNarration(){
  const def = LVL.def; if (!def || !def.narrate) return null;
  for (let k = W.sysEvents.length - 1; k >= 0; k--)
    if (def.narrate.indexOf(W.sysEvents[k].type) >= 0) return W.sysEvents[k];
  return null;
}
function levelStop(){ LVL.def = null; LVL.state = "idle"; }
// apparatus gates the UI consults; everything open outside a level
function levelAllows(what){
  if (!LVL.def) return true;
  const a = LVL.def.apparatus;
  if (what === "seed") return a.seed === "all";
  return !!a[what];
}
function levelPourOk(){ return !LVL.def || LVL.pourLeft > 0; }
function levelNotePour(d){ if (LVL.def && LVL.pourLeft !== Infinity) LVL.pourLeft = Math.max(0, LVL.pourLeft - d); }

// The verdict loop: walk every recorder sample exactly once, oldest first.
// Sustain is counted in samples (20 ticks each), so speed cannot change a verdict.
function levelCheck(){
  const L = LVL, def = L.def;
  if (!def || L.state !== "running") return L.state;
  const sNow = Math.floor(W.tick / REC.STRIDE);
  let news = sNow - L.seenS;
  if (news > 0){
    if (news > W.recCount) news = W.recCount;
    if (news > REC.N) news = REC.N;
    for (let k = news - 1; k >= 0 && L.state === "running"; k--){
      const S = lvlSample(k);
      const why = def.failNow ? def.failNow(S) : "";
      if (why){ L.state = "failed"; L.failWhy = why; break; }
      L.run = def.pass(S) ? L.run + 1 : 0;
      if (L.run >= (def.sustain || 10)) L.state = "passed";
    }
    L.seenS = sNow;
  }
  if (L.state === "running" && W.tick >= def.deadline){
    L.state = "failed"; L.failWhy = def.timeoutWhy || "Time ran out.";
  }
  return L.state;
}

// ---- the ladder (increment 1: the single-producer arc; the rest is planned in docs/phase8-levels-plan.md)
// Naming rule 8: functional title first, the science as subtitle. Amber-handed tools only.
const SOLO_MAT = { 0: 20, 1: 0, 2: 0, 3: 0, 6: 0 };
const LEVELS = [
  {
    key: "light", n: 1,
    title: "First Light", science: "Photosynthesis · carrying capacity",
    question: "Why does nothing grow in a dim pond?",
    briefing: "Twenty founders of Solara drift onto a settling ground under a weak sun. " +
      "Left alone, the mat starves at any size — light is this world's only income. " +
      "Your instrument is the ☀ lever in Intervene mode.",
    goalText: "Establish the mat — 400 Solara, held",
    predict: { prompt: "Twenty founders under a weak sun. If you only watch, what happens?",
      options: ["The mat grows slowly, but it gets there", "It starves at any size — light is the income",
                "It grows until the water's mineral runs out"],
      reflect: ["Patience was not the missing ingredient: below its break-even light the mat loses energy at every size, so time alone never saves it.",
                "Exactly what the energy bars showed: photosynthesis below upkeep, at any population size.",
                "Mineral never got the chance to matter — the energy books failed first, long before the water emptied."] },
    world: { seed: 101, found: SOLO_MAT, lightMul: 0.5 },
    apparatus: { pours: true, seed: false, sources: false, walls: false, evolution: false },
    deadline: 8000, sustain: 10,
    pass: S => S.pop(0) >= 400,
    failNow: S => S.pop(0) === 0 ? "The last Solara died — the mat never caught the light." : "",
    timeoutWhy: "The mat never established. Under this sun, photosynthesis cannot pay upkeep at any population size.",
    meter: S => [{ label: "Solara", v: S.pop(0), goal: 400 }],
    debrief: {
      pass: "Light is the pond's only income. Below roughly ×0.6 sun the mat's photosynthesis cannot pay " +
        "its upkeep, so it dwindles at any size. With enough light, growth runs fast at first and then " +
        "flattens: the mat shades itself and crowds its own settling ground. That plateau is the carrying " +
        "capacity — not a quota, but an equilibrium between energy income and cost.",
      fail: "The mat needed more energy income. Watch a single Solara in its specimen card: under the dim sun " +
        "its energy bar never fills — photosynthesis below upkeep. The ☀ lever raises the world's income; " +
        "everything else only moves what little there is around.",
    },
  },
  {
    key: "mineral", n: 2,
    title: "The Hungry Water", science: "Liebig's law of the minimum",
    question: "The sun is already at its fiercest — why does the mat stall anyway?",
    briefing: "The ☀ lever starts pinned at its maximum, over poor water: a fifth of the usual dissolved " +
      "mineral. The mat rises, then stalls far below its sunny-day size — more light has nothing left to " +
      "give. You carry ten doses of mineral: tap open water in Intervene mode to pour one. Where you pour " +
      "decides whether they feed the mat or the empty sea.",
    goalText: "Grow the mat past 600 on ten pours",
    predict: { prompt: "The sun is already at its maximum. What will ten doses of mineral do?",
      options: ["Placement won't matter — mixing spreads them anyway", "They help only where the mat can drink them first",
                "Nothing — light must still be the problem"],
      reflect: ["Mixing does spread them — measured here at roughly a fifth of the pace the mat needed. The dark-shore doses arrived, but late.",
                "The transport books agree: mineral moves slowly, and the mat drinks what lands beside it.",
                "The lever was pinned at its ceiling the whole time — the scarcest ingredient ruled, and it was not light."] },
    world: { seed: 202, found: SOLO_MAT, M0: 0.4, lightMul: 1.6 },
    apparatus: { pours: 10, seed: false, sources: false, walls: false, evolution: false },
    deadline: 9000, sustain: 10,
    pass: S => S.pop(0) >= 600,
    failNow: S => S.pop(0) === 0 ? "The mat has died out." : "",
    timeoutWhy: "The mat stalled below 600. Light was maxed out the whole time — the scarcest ingredient set the ceiling.",
    meter: S => [{ label: "Solara", v: S.pop(0), goal: 600 }],
    debrief: {
      pass: "Growth is capped by the scarcest ingredient, not the most generous one — Liebig's law of the " +
        "minimum. The sun was already giving everything; mineral was the ceiling, and it rose only where " +
        "the mat could take it up before the slow mixing spread it thin. Check the M bar at the top: " +
        "everything you poured is still somewhere — in bodies, in the water, or in the dead. Matter is " +
        "conserved; only light is income.",
      fail: "The specimen cards told the story: Mineral-limited, under a maxed-out sun. Pours at the dark " +
        "edge feed mostly water — mixing moves mineral slowly, and the mat takes up only what arrives. " +
        "Pour early, and pour where the mat lives.",
    },
  },
  {
    key: "cycle", n: 3,
    title: "Everything Flows", science: "Decomposition · the mineral cycle",
    question: "The mat is thriving — so why is the water emptying?",
    briefing: "The same pond as your first experiment, under a full sun. The mat booms, and yet the free " +
      "mineral drains, tick after tick: everything that dies takes its mineral into the mud, and nothing " +
      "brings it back. Something is missing from this world. Long-press open water in Intervene mode to " +
      "seed a species — choose the right one.",
    goalText: "Close the cycle — locked mineral under 20%, recyclers established, mat 1000+",
    predict: { prompt: "The mat is thriving. Where is the free mineral going?",
      options: ["Nowhere — a healthy pond cycles by itself", "Into the dead — and it stays there",
                "The living mat is hoarding all of it"],
      reflect: ["Cycling is work, and nobody in this world was doing it — matter flowed downhill into the mud and stopped.",
                "The chemistry page agrees: the locked share climbed, tick after tick, until something ate the dead.",
                "Bodies held part of it — but the mud held more, and the mud gives nothing back on its own."] },
    world: { seed: 101, found: SOLO_MAT },
    apparatus: { pours: true, seed: "all", sources: false, walls: false, evolution: false },
    deadline: 14000, sustain: 10,
    pass: S => S.pop(3) >= 80 && S.lockShare < 0.20 && S.pop(0) >= 1000,
    failNow: S => S.pop(0) === 0 ? "The producers are gone — without the mat, nothing eats and nothing returns." : "",
    timeoutWhy: "The dead kept their mineral. Over 40% of the world's matter ended up locked in corpses and " +
      "mud, and the water kept emptying.",
    meter: S => [{ label: "locked", v: Math.round(S.lockShare * 100), goal: 20, dir: -1, unit: "%" },
                 { label: "Bacillus", v: S.pop(3), goal: 80 }],
    debrief: {
      pass: "Decomposers close the loop. Bacillus eats the dead and excretes their mineral back into the " +
        "water — the same matter now cycles instead of accumulating in the mud. This is the deepest rule " +
        "of this world: matter is a loop, energy is a river. A pond without its recycling guild strangles " +
        "slowly on its own dead — this world's Observatory first learned to see that in an experiment " +
        "called K6, and it is why the mud here never lies.",
      fail: "Only a decomposer returns locked mineral to the water. Grazers and hunters just move matter " +
        "between bodies — and everything they kill locks more of it in the mud. Seed Bacillus near the " +
        "mat, where the dead are.",
    },
  },
  {
    key: "garden", n: 4,
    title: "The Gardener", science: "Competitive exclusion · keystone grazing",
    question: "The water is poor and the bloom owns it. Can the meadow be saved?",
    briefing: "Poor water, and the quick plankton owns it: Drifta's uptake outraces the mat's, and the " +
      "meadow starves at the bottom of a bright pond. You carry eight doses of mineral, and the seeding " +
      "bench is open. Choose your instrument.",
    goalText: "Rescue the mat — 250 Solara, held",
    predict: { prompt: "What could save the mat?",
      options: ["Pour minerals — feed the mat directly", "Seed a grazer — the bloom's enemy is the meadow's friend",
                "Nothing — the quick always win"],
      reflect: ["The bloom's uptake outraces the mat's, so every pour fed the bloom first — measured here: eight doses left the mat under 70 while the plankton grew fatter.",
                "The keystone bet: pressure on the winner is the only lever that opens space for the loser.",
                "They do win the water — until something eats them. Competition has more than one referee."] },
    world: { seed: 101, found: { 0: 20, 1: 120, 2: 0, 3: 0, 6: 0 }, M0: 0.5 },
    apparatus: { pours: 8, seed: "all", sources: false, walls: false, evolution: false },
    deadline: 12000, sustain: 10,
    narrate: ["estab", "extinct", "crashev", "bloom"],
    pass: S => S.pop(0) >= 250,
    failNow: S => S.pop(0) === 0 ? "The last Solara died — the meadow is gone."
      : S.pop(1) === 0 ? "The bloom is gone — exterminated, not gardened. That is not the rescue this pond needed." : "",
    timeoutWhy: "The mat never rose past 250 — the bloom held the water to the end. Minerals feed whoever " +
      "drinks fastest; only pressure on the bloom itself opens space below it.",
    meter: S => [{ label: "Solara", v: S.pop(0), goal: 250 }, { label: "Drifta", v: S.pop(1) }],
    debrief: {
      pass: "Cilio ate the bloom, and the mat took the light and mineral the bloom released — a keystone " +
        "consumer holds open the space its prey would otherwise close (Paine's classic result, in your own " +
        "pond). Now keep watching: in water this poor the gardener eats itself out of a job. When the bloom " +
        "is down, Cilio starves away — and the bloom creeps back. A keystone is a job, and jobs need wages.",
      fail: "The bloom kept the water. Feeding the loser cannot work here — the plankton's uptake outraces " +
        "the mat's, so every pour reached the bloom first. The lever that works points the other way: " +
        "seed the bloom's grazer and let pressure from above open space below.",
    },
  },
  {
    key: "richer", n: 5,
    title: "The Richer Pond", science: "Top-down structure · bottom-up inputs",
    question: "This pond is stable and full of plankton. Can you make it richer?",
    briefing: "A bloom, a mat, decomposers — and nobody eating anybody. Mineral is unlimited this time, " +
      "and the seeding bench is open. The goal is a richer pond: a meadow past 1,300 with every species " +
      "alive. Decide what this pond is actually missing.",
    goalText: "A richer pond — 1,300 Solara, everyone alive",
    predict: { prompt: "What does a pond need to become richer?",
      options: ["More input — pour mineral into the water", "A missing eater — restructure who eats whom",
                "Both — inputs and structure together"],
      reflect: ["Inputs alone sank into the bloom: thirty doses left the meadow near 900 and the water no " +
                  "richer. A pond's ceiling is set by its structure, not by its soup.",
                "The structural bet: a grazer turns standing bloom into flowing matter — and the meadow " +
                  "nearly doubles.",
                "Both works — but the experiment shows which half was necessary: pours alone failed, the " +
                  "grazer alone succeeded."] },
    world: { seed: 202, found: { 0: 120, 1: 500, 2: 0, 3: 60, 6: 0 } },
    apparatus: { pours: true, seed: "all", sources: false, walls: false, evolution: false },
    deadline: 17000, sustain: 10,
    narrate: ["estab", "crashev", "bloom", "extinct"],
    pass: S => S.pop(0) >= 1250 && S.pop(2) >= 20,
    failNow: S => S.pop(0) === 0 ? "The meadow is gone — richer was the goal, and everything died at the bottom."
      : S.pop(1) === 0 ? "The plankton is gone — grazed to nothing. A structure with a hole in it feeds no one." : "",
    timeoutWhy: "The pond stayed poor. Everything you poured sank into the standing bloom — nothing turned " +
      "it over. Richness needed an eater, not an input.",
    meter: S => [{ label: "Solara", v: S.pop(0), goal: 1250 }, { label: "Cilio", v: S.pop(2), goal: 20 },
                 { label: "Drifta", v: S.pop(1) }],
    debrief: {
      pass: "The grazer restructured the pond, and the pond got richer — the meadow near-doubled while " +
        "the bloom fell to a quarter and held. Grazing turned standing plankton into flowing matter: " +
        "eaten, excreted, recycled, and taken up again by the mat the bloom used to shade and starve. " +
        "Top-down structure set the ceiling that bottom-up pouring never touched — this pond was never " +
        "hungry, it was unfinished. And note what the crash was: not a catastrophe, but the system " +
        "finding its richer arrangement.",
      fail: "More soup did not make a richer pond. The bloom drank every pour and stood still — standing " +
        "stock is not flow, and richness lives in the flow. What this pond was missing had a mouth: seed " +
        "the grazer and let structure do what input could not.",
    },
  },
];

// __LEVELS_NOTE__ deferred arcs (L6-L12): specs in docs/phase8-ladder-design.md; each enters through the honesty gate.
// ============================================================
// THE RNG-ORDER CONTRACT (read before editing anything below)
//
// Bit-exact conformance across refactors depends on step() consuming
// PRNG draws in a FIXED order. The rules:
//   1. Organisms are processed in slot order (0..n-1); never reorder.
//   2. A branch may draw from the PRNG only if its guarding trait is
//      present and truthy: absent traits must SHORT-CIRCUIT before any
//      R() call (e.g. `T.hazard && R()<T.hazard`). A species without a
//      trait consumes ZERO draws for it — this is what makes new
//      species additions inert for existing worlds.
//   3. Never move an R() call across a branch boundary, and never add
//      an unconditional R() to a shared path.
//   4. Field passes (diffusion, leach, scent) and the corpse pass are
//      draw-free and must remain so.
//   5. Heredity draws one mutation kick PER LOCUS, in TRAITS[sp].loci
//      order, at every division (sigma > 0 and P.mutation only). Adding,
//      removing or reordering a species' loci is a declared ecology change.
//   6. Walls (7.W) draw NOTHING: movement blocking, the hunt filter and
//      the field transmissions are draw-free and gated on W.wallsOn --
//      a world without walls runs the certified arithmetic bit for bit;
//      a walled world diverges only through ecology, like a moved sun.
// Modification protocol: after ANY edit to this file, run
//   `node conform.js`   (2 seeds x 2 genomes x 3000 ticks; the perf review caught this
//   note claiming ~3 s when the tick had grown 6x past it — time it, don't trust it)
// A changed fingerprint is fine only when an ecology change is the
// declared intent — then re-capture with `node conform.js --capture`
// and re-run the full 8-seed harness (tune2.js) before shipping.
// ============================================================
const PC_A = 30, PC_B = 30; // MV-C post-capture window: afterglow / relocate phase lengths (ticks)
function step(){
  drainEvents();
  diffuseM();
  rebuild();
  for(let i=0;i<W.n;i++){
    if(!W.alive[i]) continue;
    const T = TRAITS[W.sp[i]];
    const cap = P.capMul*W.sz[i];
    const cT = cellOf(i), dT = W.temp[cT]; // 7.H: warmth here; tpc = the falling limb of the thermal performance curve
    const tpc = dT <= T.topt ? 1 : Math.max(0, 1 - (dT - T.topt)/(T.ctmax - T.topt));
    if(W.cy[i]){ // dormant cyst
      W.en[i]-=0.002*W.sz[i]*T.cystDrainMul*W.qR[cT];
      if(W.en[i]<=0){ killOrg(i); continue; }
      if(T.cyst && T.cyst.wake==="light"){
        const c=(Math.floor(W.y[i]/CELL)&(P.GRID-1))*P.GRID+(Math.floor(W.x[i]/CELL)&(P.GRID-1));
        if(W.light[c]>0.3 && R()<T.cyst.p){ W.cy[i]=0; W.gr[i]=T.cyst.grace; }
      } else if(T.cyst && T.cyst.wake==="prey" && R()<T.cyst.p){
        let prey=false;
        neighbors(i, T.sense*2, (j)=>{ if((T.diet & TRAITS[W.sp[j]].bodyTag) && !W.cy[j]) prey=true; });
        if(prey){ W.cy[i]=0; W.gr[i]=T.cyst.grace; }
      } else if(T.cyst && T.cyst.wake==="detritus" && R()<T.cyst.p){
        const c=cellOf(i);
        if(W.dE[c]+W.dM[c] > 1.0 || W.sc[c] > T.cyst.scMin){ W.cy[i]=0; W.gr[i]=T.cyst.grace; }
      }
      continue;
    }
    if(W.gr[i]>0) W.gr[i]--;
    if(T.cyst && W.gr[i]<=0 && W.en[i]<T.cyst.enter*cap){
      W.cy[i]=1; W.vx[i]=0; W.vy[i]=0; continue;
    }
    // Multi-locus expression (Phase 7): every locus contributes one factor per site, in locus order,
    // each `1 + slope*d - curve*d*d`. A slope the locus does not name is 0 and its curve defaults to 0,
    // so an unexpressed factor multiplies by exactly 1.0 — the single-locus arithmetic bit for bit.
    const loci = T.loci, nL = loci.length;
    let kbG = 1;
    for (let k=0;k<nL;k++){ const L=loci[k], d=W.g[k*MAXN+i]-L.g0; kbG *= 1 + L.kbSlope*d - L.curve*d*d; }
    // thermal locus (7.H.5): warmth-response down-regulation (Padfield) -- upkeep's warmth response
    // flattened (wR), the warmth-scaled gain flattened with it (wA, the price). Exactly 1 at dT <= 0,
    // so the unwarmed world expresses nothing; curvature runs through the ambient sites like any locus.
    let wR = 1, wA = 1;
    if (dT > 0) for (let k=0;k<nL;k++){ const L=loci[k]; if (L.warmSlope !== 0 || L.warmGainSlope !== 0){
      const d=W.g[k*MAXN+i]-L.g0, hw=dT*0.1;
      wR *= 1 - L.warmSlope*d*hw; wA *= 1 - L.warmGainSlope*d*hw; } }
    let cost = T.kb*kbG*W.szPow[i]*W.qR[cT]*wR; // maintenance: Q10 2.5, flattened by the thermal locus (szPow = sz^0.75 cached at spawn — the same double)
    const mQ = P.mQuota*T.mQm*W.sz[i], mCap = mQ*P.mCapMul;
    if(T.photosynth){
      const c0 = cellOf(i);
      const want = Math.min(T.mUp*W.sz[i]*(1 - W.mn[i]/mCap), mCap - W.mn[i]);
      if (want > 0){
        const got = Math.min(W.M[c0], want);
        if (got > 0){ W.M[c0]-=got; W.mn[i]+=got; W.flows.uptake+=got; }
      }
      const sat = Math.min(1, W.mn[i]/mQ); // Liebig: mineral-starved cells photosynthesize weakly
      const Lc = cellLight(i);
      let kpG = 1;
      for (let k=0;k<nL;k++){ const L=loci[k], d=W.g[k*MAXN+i]-L.g0, q=L.curve*d*d;
        kpG *= (1 + L.kpSlope*(-d) - q) * (1 + L.lightSlope*d*(1 - 2*Lc) - q); }
      const gppGain = T.kp*kpG*Lc*W.sz[i]*sat*W.qP[cT]*tpc*wA; // photosynthesis: Q10 1.6, cut off past ctmax, flattened by the thermal locus (its price)
      W.en[i]+=gppGain; W.flows.gpp+=gppGain;
      const pQ = P.pQuota*W.sz[i];
      if (W.pr[i] < pQ && W.en[i] > 0.6*cap){
        const conv = Math.min(T.pSynth*W.sz[i], W.en[i]-0.6*cap);
        W.en[i]-=conv; W.pr[i]=Math.min(pQ, W.pr[i]+conv*P.pSynthEff);
      }
    }
    if(T.movement==="drift"){ // damped random walk + light-deficit-scaled phototaxis
      const deficit=Math.max(0, 0.9-W.light[cT]);
      // 7.H.3 (declared change, replaces the nearest-sun vector of 7.L): the drifter climbs the LOCAL light
      // gradient -- what a cell can actually sense (Chlamydomonas klinotaxis) -- scaled by its light deficit.
      // Unit direction of the gradient; in a flat cell there is nothing to steer by. Same two draws as before.
      const lgx=W.lgx[cT], lgy=W.lgy[cT], lg=Math.hypot(lgx,lgy);
      const px = lg > 0 ? T.phototaxis*deficit*lgx/lg : 0, py = lg > 0 ? T.phototaxis*deficit*lgy/lg : 0;
      // MV.2 (declared change): persistence is heritable -- damp + dampSpan*(g - g0) summed over the
      // loci carrying dampSpan, in locus order; exactly T.damp at g0. Damp-led by measurement (the
      // noise syndrome cancels in the diffusion exponent; phase7-movement-plan.md MV.2 design notes):
      // roving lines wander straighter, settled lines decay their drift quickly. Same two draws.
      let dp = T.damp;
      for (let k=0;k<T.loci.length;k++){ const Lk = T.loci[k]; if (Lk.dampSpan) dp += Lk.dampSpan*(W.g[k*MAXN+i]-Lk.g0); }
      W.vx[i]=W.vx[i]*dp + (R()-0.5)*T.noise + px;
      W.vy[i]=W.vy[i]*dp + (R()-0.5)*T.noise + py;
      if (T.thermo && (W.tgx[cT] !== 0 || W.tgy[cT] !== 0)){ // 7.H.2 thermotaxis: down the discomfort gradient |dT - tpref| (draw-free; skipped in a flat field)
        // MV.1 (declared change): the set-point is heritable -- tpref = topt + tprefSpan*(g - g0) summed
        // over the loci carrying tprefSpan, in locus order; exactly topt at g0. The §12 trap decision made
        // real: evolution, not a reprice, owns the set-point that walked the swarm into the +8 core.
        let tp = T.topt;
        for (let k=0;k<T.loci.length;k++){ const Lk = T.loci[k]; if (Lk.tprefSpan) tp += Lk.tprefSpan*(W.g[k*MAXN+i]-Lk.g0); }
        const sgn = dT > tp ? -1 : dT < tp ? 1 : 0;
        W.vx[i] += T.thermo*sgn*W.tgx[cT]; W.vy[i] += T.thermo*sgn*W.tgy[cT]; }
      const s=Math.hypot(W.vx[i],W.vy[i]);
      if(s>T.driftSpeed){ W.vx[i]*=T.driftSpeed/s; W.vy[i]*=T.driftSpeed/s; }
      moveOrg(i, W.vx[i], W.vy[i]); // 7.W: slides along walls; identical writes without them
      cost += P.moveCost*(W.vx[i]*W.vx[i]+W.vy[i]*W.vy[i])*W.sz[i]*T.moveCostMul;
    }
    else if(T.movement==="tumble"){ // run-and-tumble chemotaxis along the detritus gradient
      const c0=cellOf(i);
      let here = T.tumbleField==="scent" ? W.sc[c0]*40 : W.dE[c0]+W.dP[c0]+W.dM[c0];
      if (T.thermo && dT !== T.topt && (W.tgx[c0] !== 0 || W.tgy[c0] !== 0)) here -= T.thermo*Math.abs(dT - T.topt); // 7.H.2 klinokinesis: discomfort reads as "worse", raising tumbling (Berg & Brown)
      // MV.3 (declared): tumble frequency is heritable -- the whole tumble propensity scaled by
      // 1 - tumbleSlope*(g - g0) per locus carrying tumbleSlope, in locus order; exactly the bare
      // thresholds at g0 (the che-circuit axis: smooth-running lengthens runs, twitchy shortens them).
      // The draw at R()<pT stays unconditional; only its threshold value moves.
      let pT = here > W.mem[i]+0.01 ? T.tumbleLow : T.tumbleHigh;
      for (let k=0;k<nL;k++){ const Lk = loci[k]; if (Lk.tumbleSlope) pT *= 1 - Lk.tumbleSlope*(W.g[k*MAXN+i]-Lk.g0); }
      W.mem[i]=here;
      if(R()<pT) W.hd[i]=R()*6.283;
      const tor = T.torpor && W.en[i] < T.torpor*cap ? 0.6 : 1;
      moveOrg(i, Math.cos(W.hd[i])*T.speed*tor, Math.sin(W.hd[i])*T.speed*tor);
      cost += P.moveCost*T.speed*T.speed*W.sz[i]*tor;
    }
    else if(T.movement==="steer"){ // pursuit forager
      const torpid = W.en[i] < T.torpor*cap;
      const hungry = W.en[i] < T.satiation*cap && W.handle[i]<=0;
      if(W.handle[i]>0) W.handle[i]--; if(W.cd[i]>0) W.cd[i]--; if(W.pc[i]>0) W.pc[i]--;
      let nearKin=0, tx=0, ty=0, best=1e9, found=false, target=-1;
      let fleeing=false;
      if(T.flee){
        if(W.flee[i]<=0 && W.al[cellOf(i)] > T.flee.sense) W.flee[i]=T.flee.dur;
        if(W.flee[i]>0){ W.flee[i]--; fleeing=true; }
      }
      if(hungry && !fleeing){
        // The hunt scan, inlined (perf pass 2026-08-31): the same cell walk and arithmetic as
        // neighbors(), without the per-tick closure and per-candidate call (they were ~20% of the
        // tick between them), and with the sqrt taken only on candidates that reach a distance
        // comparison — the same doubles wherever a value is used, so the chosen target, nearKin
        // and best are bit-identical. Draw-free, like the callback it replaces.
        const rr=Math.ceil(T.sense/CELL), r2=T.sense*T.sense;
        const gx=Math.floor(W.x[i]/CELL), gy=Math.floor(W.y[i]/CELL);
        for(let dy=-rr;dy<=rr;dy++) for(let dx=-rr;dx<=rr;dx++){
          const c=((gy+dy+P.GRID)%P.GRID)*P.GRID + ((gx+dx+P.GRID)%P.GRID);
          for(let j=W.hashHead[c]; j>=0; j=W.hashNext[j]){
            if(j===i||!W.alive[j]) continue;
            const ddx=wd(W.x[j]-W.x[i]), ddy=wd(W.y[j]-W.y[i]);
            const d2=ddx*ddx+ddy*ddy;
            if(d2>r2) continue;
            if(W.cy[j] && !TRAITS[W.sp[j]].cystYield) continue; // cysts of shelterless species are invisible; sheltered ones are half-yield prey
            const TJ = TRAITS[W.sp[j]];
            if(W.sp[j]===W.sp[i]){ if(Math.sqrt(d2)<T.interfRadius) nearKin++; continue; }
            if(!(T.diet & TJ.bodyTag)) continue;
            if(TJ.grazeFloor && W.en[j]<=TJ.grazeFloor) continue;
            if(W.wallsOn && pathBlocked(T.bodyTag, W.x[i], W.y[i], ddx, ddy)) continue; // 7.W: prey beyond a face this hunter cannot cross is out of reach -- and out of mind (no wall-camping, no through-mesh bites)
            const pref = Math.sqrt(d2)*TJ.pursuitPenalty;
            if(pref<best){ best=pref; tx=ddx; ty=ddy; found=true; target=j; }
          }
        }
      }
      let speed;
      if(fleeing){ // run down the alarm gradient, foraging suspended
        const gx2=Math.floor(W.x[i]/CELL), gy2=Math.floor(W.y[i]/CELL), G=P.GRID;
        const cR=(gy2&(G-1))*G+((gx2+1)&(G-1)), cL=(gy2&(G-1))*G+((gx2-1+G)&(G-1));
        const cD=(((gy2+1)&(G-1)))*G+(gx2&(G-1)), cU=(((gy2-1+G)&(G-1)))*G+(gx2&(G-1));
        let bx=1, bv=W.al[cR];
        if(W.al[cL]<bv){ bv=W.al[cL]; bx=-1; }
        let byy=0;
        if(W.al[cD]<bv){ bv=W.al[cD]; bx=0; byy=1; }
        if(W.al[cU]<bv){ bv=W.al[cU]; bx=0; byy=-1; }
        const ta=Math.atan2(byy,bx);
        let da=ta-W.hd[i]; while(da>Math.PI)da-=6.283; while(da<-Math.PI)da+=6.283;
        W.hd[i]+=Math.max(-0.5,Math.min(0.5,da));
        speed=T.speed*T.flee.speedMul;
      }
      else if(found){
        const ta=Math.atan2(ty,tx);
        let da=ta-W.hd[i]; while(da>Math.PI)da-=6.283; while(da<-Math.PI)da+=6.283;
        W.hd[i]+=Math.max(-T.turnRate,Math.min(T.turnRate,da));
        speed=T.speed*(torpid?0.75:1)*W.qS[cT]; // pursuit quickens with warmth (Q10 1.3), its quadratic cost with it
        if(best<W.sz[i]+6 && target>=0){
          const TJ = TRAITS[W.sp[target]];
          let escP = 0;
          if (TJ.escape){ // prey loci shift the base chance additively, hunter loci multiply what remains
            escP = TJ.escape.p;
            const lJ = TJ.loci;
            for (let k=0;k<lJ.length;k++){ const L=lJ[k], d=W.g[k*MAXN+target]-L.g0;
              escP = escP + L.escSlope*d - TJ.escape.p*L.curve*d*d; }
            for (let k=0;k<nL;k++){ const L=loci[k], d=W.g[k*MAXN+i]-L.g0;
              escP *= 1 + L.catchSlope*(-d) - L.curve*d*d; }
          }
          if(TJ.escape && R()<escP){ // escape jink: prey darts away, contact broken
            const ja=R()*6.283;
            moveOrg(target, Math.cos(ja)*TJ.escape.kick, Math.sin(ja)*TJ.escape.kick); // 7.W: a jink cannot cross a wall the prey cannot pass
            W.vx[target]=Math.cos(ja)*0.5; W.vy[target]=Math.sin(ja)*0.5;
          } else {
            const bite=Math.min(T.bite*W.qA[cT], W.en[target] - (TJ.grazeFloor? TJ.grazeFloor*0.99 : 0)); // ingestion warms too (7.H.4, Q10 1.8) -- flatter than upkeep, so the hunter still loses ground
            if(bite>0){
              if(TJ.alarmEmit) W.al[cellOf(target)] += TJ.alarmEmit; // Schreckstoff: injury broadcasts alarm
              const yieldMul = W.cy[target] ? TJ.cystYield : 1;
              const effE2 = T.digest[W.sp[target]]*yieldMul*tpc, effP2 = T.digestP[W.sp[target]]*yieldMul*tpc; // past ctmax the meal is wasted, not eaten
              const frac = W.en[target] > 0 ? bite/W.en[target] : 0;
              const mShare = W.mn[target]*frac, pShare = W.pr[target]*frac;
              const cHere = cellOf(i);
              W.en[target]-=bite;
              W.en[i]=Math.min(cap, W.en[i]+bite*effE2);
              const wasteE = bite*(1-effE2);
              if (wasteE>0){ W.dE[cHere]+=wasteE; W.flows.egestE+=wasteE; }
              if (pShare>0){
                W.pr[target]-=pShare;
                const pQ2 = P.pQuota*W.sz[i];
                const absP = Math.min(pShare*effP2, Math.max(0, pQ2-W.pr[i]));
                W.pr[i]+=absP;
                const wasteP = pShare-absP;
                if (wasteP>0){ W.dP[cHere]+=wasteP; W.flows.egestP+=wasteP; }
              }
              if (mShare > 0){
                W.mn[target]-=mShare; W.flows.transfer+=mShare;
                const room = mQ*P.mCapMul - W.mn[i];
                const kept = Math.min(room, mShare);
                W.mn[i]+=kept;
                const spill = mShare-kept;
                if (spill>0){ W.M[cellOf(i)]+=spill; W.flows.excrete+=spill; }
              }
              if(W.en[target]<=0.5){ killOrg(target); W.handle[i]=T.handling*W.qH[cT]; W.pc[i]=PC_A+PC_B; } // handling shortens with warmth (Q10 0.65); the kill starts the post-capture window (MV-C)
            }
          }
        }
      } else {
        // MV-C (declared): the post-capture program. A fixed two-phase state machine on W.pc whose
        // dials are the hunting-style locus: phase A (first PC_A ticks after a kill) and phase B
        // (the PC_B after) mirror one axis -- kill-and-stay searches the kill site first (slow, turny)
        // and leaves decisively after; kill-and-move departs at once and settles elsewhere. Every
        // factor is exactly 1 at g0: the timer runs, nothing expresses (the warmth-gate pattern as a
        // behaviour gate). Value modulation only, at the existing idle draw and idle speed -- no draw
        // is added, moved, or made conditional.
        let pcS = 1, pcT2 = 1;
        if (W.pc[i] > 0){
          const ph = W.pc[i] > PC_B ? 1 : -1;
          for (let k=0;k<nL;k++){ const L=loci[k]; if (L.pcSpeedSlope || L.pcTurnSlope){
            const d = W.g[k*MAXN+i]-L.g0;
            pcS *= 1 - L.pcSpeedSlope*d*ph;
            pcT2 *= 1 + L.pcTurnSlope*d*ph; } }
        }
        W.hd[i]+=(R()-0.5)*0.5*pcT2;
        if (T.thermo && !hungry && (W.tgx[cT] !== 0 || W.tgy[cT] !== 0)){ // 7.H.2: an idle, fed hunter turns toward its preferred warmth; hunger overrides (Hedgecock)
          // MV.4 (declared): the hunter is unblinded -- gain 0.25, and the set-point is heritable
          // (tprefSpan, like MV.1). H.2's fixed set-point walked fed hunters off their prey (3/8);
          // "the hunters stay blind until the movement genome can price a set-point for them" -- this
          // is that price: selection, not a constant, owns where a fed hunter idles. Draw-free.
          let tp = T.topt;
          for (let k=0;k<nL;k++){ const Lk = loci[k]; if (Lk.tprefSpan) tp += Lk.tprefSpan*(W.g[k*MAXN+i]-Lk.g0); }
          const sgn = dT > tp ? -1 : 1, ta = Math.atan2(sgn*W.tgy[cT], sgn*W.tgx[cT]);
          let da=ta-W.hd[i]; while(da>Math.PI)da-=6.283; while(da<-Math.PI)da+=6.283;
          W.hd[i]+=Math.max(-T.turnRate*0.5, Math.min(T.turnRate*0.5, da)); }
        speed=(hungry? T.speed*0.7 : T.speed*0.3)*(torpid?0.75:1)*pcS;
      }
      if(T.burst && !fleeing){ // jet burst: brief straight-line speed spike, quadratic cost, long cooldown
        if(W.bst[i]>0){ speed*=T.burst.mul; W.bst[i]--; if(W.bst[i]===0) W.bst[i]=-T.burst.cd; }
        else if(W.bst[i]<0) W.bst[i]++;
        else if(found && best>W.sz[i]+6 && best<T.burst.range){ W.bst[i]=T.burst.dur; speed*=T.burst.mul; W.bst[i]--; }
      }
      moveOrg(i, Math.cos(W.hd[i])*speed, Math.sin(W.hd[i])*speed);
      cost += P.moveCost*speed*speed*W.sz[i] + T.interfCost*nearKin;
      if(torpid) cost*=0.7;
    }
    if(T.detritivore){
      const c0=cellOf(i), D=T.detritivore;
      let rateG = 1, effG = 1; // rate-yield locus; both exactly 1 at g0
      for (let k=0;k<nL;k++){ const L=loci[k], d=W.g[k*MAXN+i]-L.g0, q=L.curve*d*d;
        rateG *= 1 + L.rateSlope*d - q; effG *= 1 - L.effSlope*d - q; }
      const eatE=Math.min(W.dE[c0], D.rateE*rateG*W.sz[i]*W.qD[c0]*tpc*wA); // decomposition: Q10 2.0, flattened by the thermal locus (its price)
      if(eatE>0){ W.dE[c0]-=eatE; W.en[i]=Math.min(cap, W.en[i]+eatE*D.effE*effG); }
      const pQ3=P.pQuota*W.sz[i];
      const eatP=Math.min(W.dP[c0], D.rateP*rateG*W.sz[i]*W.qD[c0]*tpc*wA, Math.max(0,(pQ3-W.pr[i])/D.effP));
      if(eatP>0){ W.dP[c0]-=eatP; W.pr[i]+=eatP*D.effP; }
      const minz=Math.min(W.dM[c0], D.minRate*W.sz[i]);
      if(minz>0){
        W.dM[c0]-=minz;
        const room=Math.max(0, mQ*P.mCapMul - W.mn[i]);
        const kept=Math.min(room, minz);
        W.mn[i]+=kept;
        const rel=minz-kept;
        if(rel>0){ W.M[c0]+=rel; W.flows.bacRelease+=rel; }
      }
    }
    if(T.corpsivore){
      const CV=T.corpsivore;
      let bk=-1, bd2=CV.radius*CV.radius;
      const gx=Math.floor(W.x[i]/CELL), gy=Math.floor(W.y[i]/CELL);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const c=((gy+dy+P.GRID)%P.GRID)*P.GRID+((gx+dx+P.GRID)%P.GRID);
        for(let k=W.cHashHead[c];k>=0;k=W.cHashNext[k]){
          if(!W.cAlive[k])continue;
          const ddx=wd(W.cX[k]-W.x[i]), ddy=wd(W.cY[k]-W.y[i]);
          { const cm = W.cE[k]+W.cP[k]+W.cM[k]; if(cm < CV.minMass || cm > CV.maxMass) continue; }
          if(CV.dietOnly && !(T.diet & TRAITS[W.cSp[k]].bodyTag)) continue;
          const d2=ddx*ddx+ddy*ddy; if(d2<bd2){bd2=d2;bk=k;}
        }
      }
      if(bk>=0){
        const mass=W.cE[bk]+W.cP[bk]+W.cM[bk];
        const f=Math.min(1, CV.rate*W.sz[i]/Math.max(1,mass));
        const gE=W.cE[bk]*f, gP=W.cP[bk]*f, gM=W.cM[bk]*f;
        W.cE[bk]-=gE; W.cP[bk]-=gP; W.cM[bk]-=gM;
        const c0=cellOf(i);
        W.en[i]=Math.min(cap, W.en[i]+gE*CV.effE);
        W.dE[c0]+=gE*(1-CV.effE); W.flows.egestE+=gE*(1-CV.effE);
        const pQ4=P.pQuota*W.sz[i];
        const absP=Math.min(gP*CV.effP, Math.max(0,pQ4-W.pr[i]));
        W.pr[i]+=absP; W.dP[c0]+=gP-absP;
        const room=Math.max(0, mQ*P.mCapMul - W.mn[i]);
        const kept=Math.min(room,gM); W.mn[i]+=kept;
        if(gM-kept>0){ W.M[c0]+=gM-kept; W.flows.bacRelease+=gM-kept; }
      }
    }
    W.en[i]=Math.min(cap, W.en[i]-cost); W.flows.resp+=cost;
    if(W.en[i]<=0){ killOrg(i); continue; }
    if(T.hazard && R()<T.hazard){ killOrg(i); continue; }
    if(W.en[i] > T.reproFrac*cap && W.mn[i] >= P.mReproMin*mQ && W.pr[i] >= P.pReproMin*P.pQuota*W.sz[i] && (!T.reproCooldown || W.cd[i]<=0)){
      const childE = W.en[i]*P.invest;
      const childM = W.mn[i]*P.invest;
      const childP = W.pr[i]*P.invest;
      let nx=wrap(W.x[i]+(R()-0.5)*T.spread), ny=wrap(W.y[i]+(R()-0.5)*T.spread);
      if(W.wallsOn && pathBlocked(T.bodyTag, W.x[i], W.y[i], wd(nx-W.x[i]), wd(ny-W.y[i]))){ nx=W.x[i]; ny=W.y[i]; } // 7.W: dispersal blocked -- the child settles beside the parent (draws above already spent)
      if(T.settleLimited){
        const c=(Math.floor(ny/CELL)&(P.GRID-1))*P.GRID+(Math.floor(nx/CELL)&(P.GRID-1));
        const crowd = T.layer==="fungal" ? W.fB[c] : W.bB[c];
        if(crowd > T.settleLimit){ W.en[i]-=childE*0.3; continue; }
      }
      W.en[i]-=childE+2;
      W.mn[i]-=childM; W.pr[i]-=childP;
      const childSz = Math.max(1.5, W.sz[i]*(R()<0.2? (1+(R()-0.5)*P.mutSigma*2):1));
      W.en[i]-=P.sBody*childSz; // structural substance: an energy sink now, a corpse credit later
      const ci = spawn(W.sp[i], nx, ny, childE, childSz, childM, childP);
      if (ci >= 0){
        W.lg[ci] = W.lg[i] + 1;
        for (let k=0;k<nL;k++){ // heredity: child = parent, plus one uniform kick of +-sigma PER LOCUS, in locus order (the declared L-draws-per-division rule)
          const L = loci[k];
          let gc = W.g[k*MAXN+i];
          if (L.sigma > 0 && P.mutation){ // draw only when mutating: the silent genome consumes zero draws
            gc += (R()-0.5)*2*L.sigma;
            gc = gc < 0 ? 0 : gc > 1 ? 1 : gc; // the corridor
          }
          W.g[k*MAXN+ci] = gc;
        }
      }
      if(T.reproCooldown) W.cd[i]=T.reproCooldown;
    }
  }
  for (let k = 0; k < W.cN; k++){
    if (!W.cAlive[k]) continue;
    const c = cellAt(W.cX[k], W.cY[k]);
    const mass = W.cE[k] + W.cP[k] + W.cM[k];
    if (mass < 0.5){ // expired: dump the remainder into detritus
      W.dE[c]+=W.cE[k]; W.dP[c]+=W.cP[k]; W.dM[c]+=W.cM[k];
      W.cAlive[k]=0; W.cFree.push(k); continue;
    }
    const d = P.corpseDecay*W.qD[c]; // corpses rot faster in warm water (7.H)
    W.dE[c]+=W.cE[k]*d; W.dP[c]+=W.cP[k]*d; W.dM[c]+=W.cM[k]*d;
    W.flows.corpseToDet += W.cM[k]*d;
    W.cE[k]*=(1-d); W.cP[k]*=(1-d); W.cM[k]*=(1-d);
    W.sc[c] += P.scentEmit * mass * 0.01;
  }
  W.tick++;
  if (W.tick % REC.STRIDE === 0) record();
}

// the shipped evolution settings, captured once at load; initWorld restores them (like P.lightMul)
const LOCUS_SHIPPED = TRAITS.map(T => T.loci.map(L => ({ sigma: L.sigma, curve: L.curve })));
function resetWorld(){
  W.initialized = false; W.n = 0; W.freeList.length = 0; W.alive.fill(0);
  W.tick = 0; W.events.length = 0; W.eventLog.length = 0;
}
function initWorld(seed, sc){
  if (W.initialized) return; W.initialized = true;
  W.rng = mulberry32(seed === undefined ? P.SEED : seed);
  W.n=0; W.freeList.length=0; W.alive.fill(0); W.tick=0;
  W.M.fill(sc && sc.M0 !== undefined ? sc.M0 : P.M0); W.dE.fill(0); W.dP.fill(0); W.dM.fill(0); W.sc.fill(0); W.al.fill(0);
  W.recHead=0; W.recCount=0; W.rec.fill(0); W.sysEvents.length=0;
  W.addedM=0; P.lightMul=1.0; W.evLog.length=0;
  // P.mutation is a harness-level switch (like spawnDecomposers) and is NOT reset here; the UI reset restores it
  TRAITS.forEach((T, sp) => T.loci.forEach((L, k) => { L.sigma = LOCUS_SHIPPED[sp][k].sigma; L.curve = LOCUS_SHIPPED[sp][k].curve; }));
  det.estab.fill(0); det.run.fill(0); det.bloom.fill(0); det.crash.fill(0);
  det.packAwake=false; det.depleted=false; det.lockedWarn=false; det.sweep.fill(0); det.uniform.fill(0); det.diverse.fill(0); det.diverseRun.fill(0); det.rail.fill(0); det.railRun.fill(0); det.adapt.fill(0); det.adaptRun.fill(0);
  det.heatRetreat.fill(0); det.heatPile=false; det.heatPileRun=0; det.heatStarve=false; det.heatStarveRun=0;
  det.heatTrap.fill(0); det.heatTrapRun.fill(0); mv.ok.fill(0); mv.tick=-1;
  recPrev.uptake=recPrev.gpp=recPrev.resp=recPrev.bacRelease=recPrev.corpseToDet=recPrev.egestE=recPrev.deaths=0;
  recPrev.deathsBy.fill(0);
  W.cN=0; W.cFree.length=0; W.cAlive.fill(0);
  for (const k in W.flows) W.flows[k] = (k==="deathsBy") ? [0,0,0,0,0,0,0] : 0;
  W.sources.length = 0; W.sources.push({ x: P.WORLD/2, y: P.WORLD/2, i: P.sunI, a: 0, sigma: P.sunSigma }); // one sun, centred (like P.lightMul)
  W.walls.length = 0; compileWalls(); // a fresh world has no walls (7.W)
  computeLight(); computeTemp();
  const nearSun = rad => { const a=R()*6.283, r=Math.sqrt(R())*rad;
    return [wrap(W.sources[0].x+Math.cos(a)*r), wrap(W.sources[0].y+Math.sin(a)*r)]; };
  const endow = endowFounder; { // (hoisted to module scope in the tweaks batch; alias kept)
    void 0;
  };
  // Scenario founding (Phase 8 levels): sc = { found:{sp:count}, M0 } overrides founding counts and
  // starting mineral. DRAW-FREE WHEN ABSENT (the walls pattern, banner rule 6): with sc undefined
  // every count below is the shipped literal and the RNG stream is bit-identical; a scenario world
  // diverges only through its different founding, like a moved sun. A count of 0 skips the whole
  // block, so an unfounded species consumes zero draws (contract rule 2 at world scale).
  const nOf = (sp, n) => sc && sc.found && sc.found[sp] !== undefined ? sc.found[sp]|0 : n;
  for(let k=0;k<nOf(0,120);k++){ const [a,b]=nearSun(380); endow(spawn(0,a,b,30+R()*30,7+R()*2)); }
  for(let k=0;k<nOf(1,500);k++){ const [a,b]=nearSun(330); endow(spawn(1,a,b,16+R()*12,3.4)); }
  for(let k=0;k<nOf(2,12);k++){ const [a,b]=nearSun(420); endow(spawn(2,a,b,60,6)); }
  if (P.spawnDecomposers) for(let k=0;k<nOf(3,60);k++){ const [a,b]=nearSun(460); endow(spawn(3,a,b,10+R()*6,2)); }
  if (nOf(6,9) > 0){ const [ax,ay]=nearSun(300); // pack founding: a brood arrives together, shares the discovered hunting ground
    for(let k=0;k<nOf(6,9);k++){ const v=spawn(6, wrap(ax+(R()-0.5)*120), wrap(ay+(R()-0.5)*120), 70, 9);
      if(v>=0){ endow(v); W.cy[v]=1; } } }
  // Mycora deferred (3.4 finding): establishment marginal AND, where established, it robs the predator's kill-caches — sessility does not spare the caches (spores colonize kill-grounds). Re-entry condition: predator surplus margin, jointly with Necro.
  // Necro deferred (3.3 finding): viable on kill-flux (8/8 survival) but a subsistence predator cannot afford a kleptoparasite — Venator caches kills, Necro empties the pantry. Re-entry condition: predator surplus margin.
}

// __NODE_EXPORTS__ (everything below is stripped from the artifact by build.py)
if (typeof module !== "undefined" && module.exports !== undefined){
  module.exports = { P, W, R, TRAITS, TAG, REC, SPECIES, LOCUS_DEFAULTS, normalizeTraits, indicators, impact, cellOf, diffuseM, wrap, wd, spawn, killOrg, computeLight, computeTemp, rebuild,
    cellLight, neighbors, step, initWorld, resetWorld, applyEvent, drainEvents,
    queueEvent, mulberry32, CELL, MAXN, MAXLOCI,
    makeWall, compileWalls, marchMul, pathBlocked,
    LEVELS, LVL, levelStart, levelRestart, levelStop, levelCheck, levelAllows, levelPourOk, levelNotePour, levelNarration };
}
