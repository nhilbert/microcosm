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
  maxSuns: 4,       // light sources are a small array (W.suns); the shipped world has one, at the centre
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
    }
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
    }
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
    }
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
    }
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
    "cystDrainMul": 0.3
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
const LOCUS_DEFAULTS = { sigma: 0, escSlope: 0, kpSlope: 0, catchSlope: 0, kbSlope: 0, lightSlope: 0, rateSlope: 0, effSlope: 0, curve: 0 };
function normalizeTraits(rows){
  for (const t of rows){
    for (const k in TRAIT_DEFAULTS) if (t[k] === undefined) t[k] = TRAIT_DEFAULTS[k];
    if (t.cyst) for (const k in CYST_DEFAULTS) if (t.cyst[k] === undefined) t.cyst[k] = CYST_DEFAULTS[k];
    if (t.corpsivore) for (const k in CORPSIVORE_DEFAULTS) if (t.corpsivore[k] === undefined) t.corpsivore[k] = CORPSIVORE_DEFAULTS[k];
    if (t.locus) for (const k in LOCUS_DEFAULTS) if (t.locus[k] === undefined) t.locus[k] = LOCUS_DEFAULTS[k];
    if (t.locus) checkLocus(t);
  }
  return rows;
}
// Load-time guardrail: every multiplier a locus can express must stay inside [LOCUS_MULT_MIN, LOCUS_MULT_MAX]
// across the whole corridor, curvature included. A typo in a slope fails here, not in a 54k-tick run.
const LOCUS_MULT_MIN = 0.3, LOCUS_MULT_MAX = 3.0;
function checkLocus(t){
  const L = t.locus, bad = [];
  for (const g of [0, 0.25, 0.5, 0.75, 1]){
    const d = g - L.g0, q = L.curve*d*d;
    const mults = { kb: 1 + L.kbSlope*d - q, kp: 1 - L.kpSlope*d - q, catch: 1 - L.catchSlope*d - q,
      rate: 1 + L.rateSlope*d - q, eff: 1 - L.effSlope*d - q,
      lightDark: 1 + L.lightSlope*d - q, lightBright: 1 - L.lightSlope*d - q,
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
const CELL = P.WORLD / P.GRID;
const MAXN = 6000;
// Observatory ring buffer geometry (channel map documented atop src/observatory/recorder.js).
// Lives here because W.rec is sized from it; changing CH is a declared rebaseline.
const REC = { N: 900, STRIDE: 20, CH: 56 };

// ---------- world state (module singletons; one artifact instance) ----------
const W = {
  x: new Float32Array(MAXN), y: new Float32Array(MAXN),
  px: new Float32Array(MAXN), py: new Float32Array(MAXN), // previous tick, for render interpolation
  vx: new Float32Array(MAXN), vy: new Float32Array(MAXN),
  en: new Float32Array(MAXN), sz: new Float32Array(MAXN),
  sp: new Uint8Array(MAXN), alive: new Uint8Array(MAXN),
  hd: new Float32Array(MAXN), handle: new Int16Array(MAXN),
  cd: new Int16Array(MAXN), cy: new Uint8Array(MAXN), gr: new Int16Array(MAXN),
  mn: new Float32Array(MAXN), pr: new Float32Array(MAXN), mem: new Float32Array(MAXN),
  g: new Float32Array(MAXN),          // heritable locus value in [0,1] (species with TRAITS.locus), else 0
  lg: new Uint16Array(MAXN),          // lineage generation: founders 0, child = parent + 1 (draw-free bookkeeping)
  flee: new Int16Array(MAXN), bst: new Int16Array(MAXN),
  birth: new Int32Array(MAXN), gen: new Uint16Array(MAXN),
  n: 0, freeList: [], tick: 0, initialized: false, rng: mulberry32(P.SEED),
  events: [], eventLog: [], lightDirty: false,
  suns: [{ x: P.WORLD / 2, y: P.WORLD / 2, i: P.sunI, sigma: P.sunSigma }],  // light sources (7.L); suns[0] is the shipped sun
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
  W.vx[i]=0; W.vy[i]=0; W.en[i]=e; W.sz[i]=size; W.sp[i]=species; W.alive[i]=1;
  W.hd[i]=R()*6.283; W.cd[i]=TRAITS[species].matureCd; W.handle[i]=0; W.cy[i]=0; W.gr[i]=0;
  W.mn[i]=mnEndow||0; W.pr[i]=prEndow||0; W.mem[i]=0; W.flee[i]=0; W.bst[i]=0;
  W.g[i]=TRAITS[species].locus ? TRAITS[species].locus.g0 : 0; W.lg[i]=0;
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
      const Lc = TRAITS[ev.sp] && TRAITS[ev.sp].locus; if (!Lc || !(ev.key in LOCUS_DEFAULTS)) break;
      const prev = Lc[ev.key];
      const lim = ev.key === "sigma" ? [0, 0.12] : ev.key === "curve" ? [-0.5, 0.8] : [0, 1.5]; // slopes are prices: bounded too
      Lc[ev.key] = Math.max(lim[0], Math.min(lim[1], +ev.v || 0));
      done && done({ prev }); break; }
    // Suns (7.L): a small array of light sources. Never fewer than one (decision 2); at most P.maxSuns.
    // None of these draw; they change the future stream only through ecology, like moving the sun always has.
    case "sun": {
      const s = W.suns[ev.k|0]; if (!s) break;
      s.x = wrap(ev.x); s.y = wrap(ev.y);
      computeLight(); W.lightDirty = true; break; }
    case "sunAdd": {
      if (W.suns.length >= P.maxSuns) break;
      const s = { x: wrap(ev.x), y: wrap(ev.y),
        i: Math.max(0.1, Math.min(1.5, ev.i === undefined ? P.sunI : +ev.i)),
        sigma: Math.max(90, Math.min(300, ev.sigma === undefined ? P.sunSigma : +ev.sigma)) };
      const k = ev.at === undefined ? W.suns.length : Math.max(0, Math.min(W.suns.length, ev.at|0)); // `at` restores an undone removal at its old index
      W.suns.splice(k, 0, s);
      computeLight(); W.lightDirty = true; done && done({ k }); break; }
    case "sunRemove": {
      const k = ev.k|0; if (W.suns.length <= 1 || !W.suns[k]) break;
      const snap = W.suns.splice(k, 1)[0];
      computeLight(); W.lightDirty = true; done && done({ k, snap }); break; }
    case "sunSet": {
      const s = W.suns[ev.k|0]; if (!s) break;
      const prev = { i: s.i, sigma: s.sigma };
      if (ev.i !== undefined) s.i = Math.max(0.1, Math.min(1.5, +ev.i));
      if (ev.sigma !== undefined) s.sigma = Math.max(90, Math.min(300, +ev.sigma));
      computeLight(); W.lightDirty = true; done && done({ prev }); break; }
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
  if (ev.type === "sun"){ // coalesce: only the latest position of that sun matters
    const k = W.events.findIndex(e => e.type === "sun" && (e.k|0) === (ev.k|0));
    if (k >= 0){ W.events[k] = ev; return; }
  }
  W.events.push(ev);
}

function diffuseM(){
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
  const dE=W.dE, dP=W.dP, dM=W.dM, keep=1-P.dLeach;
  for(let c=0;c<G*G;c++){
    const back=dM[c]*P.dLeach;
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
  // alarm channel: fast decay, local reach — spikes, not ambience (Schreckstoff time constant)
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
// Irradiance adds: the field is the ambient floor plus one toroidal Gaussian per sun. Draw-free.
function computeLight(){
  const S = W.suns;
  for (let gy = 0; gy < P.GRID; gy++) for (let gx = 0; gx < P.GRID; gx++){
    const cx=(gx+0.5)*CELL, cyy=(gy+0.5)*CELL;
    let v = P.ambient;
    for (let k = 0; k < S.length; k++){
      const s = S[k], dx=wd(cx-s.x), dy=wd(cyy-s.y);
      v += s.i * Math.exp(-(dx*dx+dy*dy)/(2*s.sigma*s.sigma));
    }
    W.light[gy*P.GRID+gx] = v * P.lightMul;
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
// CONTRACT: the recorder is a pure observer — zero PRNG draws, zero
// mutation of dynamic state. Conformance bit-identity with the recorder
// running is the standing acceptance test for this whole layer.
// (REC itself is declared in src/sim/world.js, where the buffer is sized from it.)
// ============================================================
// ---- system-event detectors (Phase 4.1): pure observers narrating the world ----
const DET_ESTAB = [40, 40, 20, 80, 10, 4, 4]; // establishment thresholds per species
const det = { estab:[0,0,0,0,0,0,0], run:[0,0,0,0,0,0,0], bloom:[0,0,0,0,0,0,0], crash:[0,0,0,0,0,0,0],
  packAwake:false, depleted:false, lockedWarn:false,
  sweep:[0,0,0,0,0,0,0],   // +-1 a line is taking over, +-2 it has taken over (sign = direction from g0)
  uniform:[0,0,0,0,0,0,0],
  diverse:[0,0,0,0,0,0,0], diverseRun:[0,0,0,0,0,0,0],   // standing polymorphism: both ends coexist
  rail:[0,0,0,0,0,0,0], railRun:[0,0,0,0,0,0,0] };         // corridor contact: a locus pinned at its edge (6.2)
function pushEvent(type, sp, text){
  W.sysEvents.push({ tick: W.tick, type, sp, text });
  if (W.sysEvents.length > 200) W.sysEvents.shift();
}
function detect(r, awake){
  detectEcology(r, awake);
  detectHeredity(r);
  detectChemistry(r);
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
  for (let sp=0; sp<7; sp++){
    const L = TRAITS[sp].locus; if (!L || B[r+sp] < 50) continue;
    const mean = B[r+42+sp], sd = B[r+49+sp], name = TRAITS[sp].name;
    let hi=0, lo=0, n=0, railHi=0, railLo=0;
    for (let i=0;i<W.n;i++) if (W.alive[i] && W.sp[i]===sp){ n++; const g=W.g[i]; if (g > L.g0+0.05) hi++; else if (g < L.g0-0.05) lo++; if (g > 0.98) railHi++; else if (g < 0.02) railLo++; }
    const shareHi = hi/n, shareLo = lo/n;
    // rail contact (6.2): a third of the population pinned at a corridor edge for 10 samples -- the
    // trait has run out of room, which is a certification concern the player should see as a story
    const railShare = Math.max(railHi, railLo)/n, railDir = railHi >= railLo ? 1 : -1;
    det.railRun[sp] = railShare >= 0.30 ? det.railRun[sp]+1 : 0;
    if (!det.rail[sp] && det.railRun[sp] >= 10){ det.rail[sp] = railDir;
      pushEvent("rail", sp, name+" has reached the limit of its "+L.label.toLowerCase()+" — "+Math.round(railShare*100)+"% at the "+(railDir>0 ? L.hiWord : L.loWord)+" edge."); }
    else if (det.rail[sp] && railShare < 0.15) det.rail[sp] = 0;
    const dir = (mean - L.g0 >= 0.10 && shareHi >= 0.6) ? 1 : (L.g0 - mean >= 0.10 && shareLo >= 0.6) ? -1 : 0;
    const share = dir > 0 ? shareHi : shareLo;
    const word = dir > 0 ? L.hiWord : L.loWord;
    if (det.sweep[sp] === 0 && dir !== 0){ det.sweep[sp] = dir;
      pushEvent("sweep", sp, "A "+word+" "+name+" line is taking over — "+Math.round(share*100)+"% of the population and rising."); }
    else if (Math.abs(det.sweep[sp]) === 1 && dir === det.sweep[sp] && share >= 0.85){ det.sweep[sp] *= 2;
      pushEvent("sweep", sp, "The "+word+" "+name+" line has taken over — "+Math.round(share*100)+"% of the population."); }
    else if (det.sweep[sp] !== 0 && Math.max(shareHi, shareLo) < 0.45) det.sweep[sp] = 0;
    // diversifying: standing variation established with no line winning -- both strategies coexist.
    // Measured on the balanced (5.7) world: sd climbs 0.02 -> 0.10-0.17 while the mean stays near g0;
    // a sweep instead carries the mean away. The two events are mutually exclusive by construction.
    if (det.sweep[sp] === 0 && sd >= 0.10 && Math.abs(mean - L.g0) < 0.15 && shareHi >= 0.2 && shareLo >= 0.2) det.diverseRun[sp]++;
    else det.diverseRun[sp] = 0;
    if (!det.diverse[sp] && det.diverseRun[sp] >= 10){ det.diverse[sp] = 1;
      pushEvent("diverse", sp, name+" is diversifying — "+L.hiWord+" and "+L.loWord+" lines coexist, neither winning."); }
    else if (det.diverse[sp] && (sd < 0.06 || det.sweep[sp] !== 0)) det.diverse[sp] = 0;
    // diversity collapse: variation falls to well under half of what it was 270 samples ago.
    // Selection consuming variation is the normal end of a sweep; the event names the cost.
    if (W.recCount >= 271){
      const sdAgo = B[((W.recHead-270+N)%N)*CH + 49 + sp];
      if (!det.uniform[sp] && sdAgo >= 0.06 && sd <= 0.4*sdAgo){ det.uniform[sp] = 1;
        pushEvent("uniform", sp, "Variation collapsing in "+name+" — the population is becoming uniform."); }
      else if (det.uniform[sp] && sd > 0.7*sdAgo) det.uniform[sp] = 0;
    }
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
  // locus mean + sd per species, awake and dormant alike (the genome does not sleep)
  for (let sp=0;sp<7;sp++){
    if (!TRAITS[sp].locus || B[r+sp] === 0) continue;
    let m=0, m2=0;
    for (let i=0;i<W.n;i++) if (W.alive[i] && W.sp[i]===sp){ const g=W.g[i]; m+=g; m2+=g*g; }
    const n=B[r+sp], mean=m/n, varr=Math.max(0, m2/n - mean*mean);
    B[r+42+sp]=mean; B[r+49+sp]=Math.sqrt(varr);
  }
  let fM=0, dM=0;
  for (let c=0;c<P.GRID*P.GRID;c++){ fM+=W.M[c]; dM+=W.dM[c]; }
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
  B[r+33]=W.suns[0].x; B[r+34]=W.suns[0].y;
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
  let adSum=0, adN=0; // adaptability (6.2): mean locus sd over species with a locus and >= 20 alive
  for (let sp=0;sp<7;sp++) if (TRAITS[sp].locus && B[r0+sp] >= 20){ adSum += B[r0+49+sp]; adN++; }
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
const IMPACT_PRESS = new Set(["sun","sunlight","sunAdd","sunRemove","sunSet","sunLayout","mutation","evolution","preset"]);
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
// Modification protocol: after ANY edit to this file, run
//   `node conform.js`   (2 seeds x 3000 ticks, ~3 s)
// A changed fingerprint is fine only when an ecology change is the
// declared intent — then re-capture with `node conform.js --capture`
// and re-run the full 8-seed harness (tune2.js) before shipping.
// ============================================================
function step(){
  drainEvents();
  diffuseM();
  rebuild();
  for(let i=0;i<W.n;i++){
    if(!W.alive[i]) continue;
    const T = TRAITS[W.sp[i]];
    const cap = P.capMul*W.sz[i];
    if(W.cy[i]){ // dormant cyst
      W.en[i]-=0.002*W.sz[i]*T.cystDrainMul;
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
    const gd = T.locus ? W.g[i]-T.locus.g0 : 0, gq = T.locus ? T.locus.curve*gd*gd : 0; // locus deviation and its curvature penalty (exactly 0 at g0)
    let cost = T.kb*(T.locus ? 1 + T.locus.kbSlope*gd - gq : 1)*Math.pow(W.sz[i],0.75);
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
      const kpG = T.locus ? (1 + T.locus.kpSlope*(-gd) - gq) * (1 + T.locus.lightSlope*gd*(1 - 2*Lc) - gq) : 1;
      const gppGain = T.kp*kpG*Lc*W.sz[i]*sat;
      W.en[i]+=gppGain; W.flows.gpp+=gppGain;
      const pQ = P.pQuota*W.sz[i];
      if (W.pr[i] < pQ && W.en[i] > 0.6*cap){
        const conv = Math.min(T.pSynth*W.sz[i], W.en[i]-0.6*cap);
        W.en[i]-=conv; W.pr[i]=Math.min(pQ, W.pr[i]+conv*P.pSynthEff);
      }
    }
    if(T.movement==="drift"){ // damped random walk + light-deficit-scaled phototaxis
      const gx1=Math.floor(W.x[i]/CELL)&(P.GRID-1), gy1=Math.floor(W.y[i]/CELL)&(P.GRID-1);
      const deficit=Math.max(0, 0.9-W.light[gy1*P.GRID+gx1]);
      // steer toward the NEAREST sun (7.L decision 1): with one sun this is the Phase 1 arithmetic exactly;
      // with several, a drifter commits to the closest — the limited-migration condition patches need
      let sdx=wd(W.suns[0].x-W.x[i]), sdy=wd(W.suns[0].y-W.y[i]), sd2=sdx*sdx+sdy*sdy;
      for (let k=1;k<W.suns.length;k++){ const ex=wd(W.suns[k].x-W.x[i]), ey=wd(W.suns[k].y-W.y[i]), e2=ex*ex+ey*ey;
        if (e2 < sd2){ sdx=ex; sdy=ey; sd2=e2; } }
      const sd=Math.hypot(sdx,sdy)+1;
      W.vx[i]=W.vx[i]*T.damp + (R()-0.5)*T.noise + T.phototaxis*deficit*sdx/sd;
      W.vy[i]=W.vy[i]*T.damp + (R()-0.5)*T.noise + T.phototaxis*deficit*sdy/sd;
      const s=Math.hypot(W.vx[i],W.vy[i]);
      if(s>T.driftSpeed){ W.vx[i]*=T.driftSpeed/s; W.vy[i]*=T.driftSpeed/s; }
      W.x[i]=wrap(W.x[i]+W.vx[i]); W.y[i]=wrap(W.y[i]+W.vy[i]);
      cost += P.moveCost*(W.vx[i]*W.vx[i]+W.vy[i]*W.vy[i])*W.sz[i]*T.moveCostMul;
    }
    else if(T.movement==="tumble"){ // run-and-tumble chemotaxis along the detritus gradient
      const c0=cellOf(i);
      const here = T.tumbleField==="scent" ? W.sc[c0]*40 : W.dE[c0]+W.dP[c0]+W.dM[c0];
      const pT = here > W.mem[i]+0.01 ? T.tumbleLow : T.tumbleHigh;
      W.mem[i]=here;
      if(R()<pT) W.hd[i]=R()*6.283;
      const tor = T.torpor && W.en[i] < T.torpor*cap ? 0.6 : 1;
      W.x[i]=wrap(W.x[i]+Math.cos(W.hd[i])*T.speed*tor); W.y[i]=wrap(W.y[i]+Math.sin(W.hd[i])*T.speed*tor);
      cost += P.moveCost*T.speed*T.speed*W.sz[i]*tor;
    }
    else if(T.movement==="steer"){ // pursuit forager
      const torpid = W.en[i] < T.torpor*cap;
      const hungry = W.en[i] < T.satiation*cap && W.handle[i]<=0;
      if(W.handle[i]>0) W.handle[i]--; if(W.cd[i]>0) W.cd[i]--;
      let nearKin=0, tx=0, ty=0, best=1e9, found=false, target=-1;
      let fleeing=false;
      if(T.flee){
        if(W.flee[i]<=0 && W.al[cellOf(i)] > T.flee.sense) W.flee[i]=T.flee.dur;
        if(W.flee[i]>0){ W.flee[i]--; fleeing=true; }
      }
      if(hungry && !fleeing){
        neighbors(i, T.sense, (j,ddx,ddy,d)=>{
          if(W.cy[j] && !TRAITS[W.sp[j]].cystYield) return; // cysts of shelterless species are invisible; sheltered ones are half-yield prey
          const TJ = TRAITS[W.sp[j]];
          if(W.sp[j]===W.sp[i]){ if(d<T.interfRadius) nearKin++; return; }
          if(!(T.diet & TJ.bodyTag)) return;
          if(TJ.grazeFloor && W.en[j]<=TJ.grazeFloor) return;
          const pref = d*TJ.pursuitPenalty;
          if(pref<best){ best=pref; tx=ddx; ty=ddy; found=true; target=j; }
        });
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
        speed=T.speed*(torpid?0.75:1);
        if(best<W.sz[i]+6 && target>=0){
          const TJ = TRAITS[W.sp[target]];
          const tgd = TJ.locus ? W.g[target]-TJ.locus.g0 : 0;
          const escP = TJ.escape ? (TJ.locus ? TJ.escape.p + TJ.locus.escSlope*tgd - TJ.escape.p*TJ.locus.curve*tgd*tgd : TJ.escape.p)
                                   * (T.locus ? 1 + T.locus.catchSlope*(-gd) - gq : 1) : 0;
          if(TJ.escape && R()<escP){ // escape jink: prey darts away, contact broken
            const ja=R()*6.283;
            W.x[target]=wrap(W.x[target]+Math.cos(ja)*TJ.escape.kick);
            W.y[target]=wrap(W.y[target]+Math.sin(ja)*TJ.escape.kick);
            W.vx[target]=Math.cos(ja)*0.5; W.vy[target]=Math.sin(ja)*0.5;
          } else {
            const bite=Math.min(T.bite, W.en[target] - (TJ.grazeFloor? TJ.grazeFloor*0.99 : 0));
            if(bite>0){
              if(TJ.alarmEmit) W.al[cellOf(target)] += TJ.alarmEmit; // Schreckstoff: injury broadcasts alarm
              const yieldMul = W.cy[target] ? TJ.cystYield : 1;
              const effE2 = T.digest[W.sp[target]]*yieldMul, effP2 = T.digestP[W.sp[target]]*yieldMul;
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
              if(W.en[target]<=0.5){ killOrg(target); W.handle[i]=T.handling; }
            }
          }
        }
      } else {
        W.hd[i]+=(R()-0.5)*0.5;
        speed=(hungry? T.speed*0.7 : T.speed*0.3)*(torpid?0.75:1);
      }
      if(T.burst && !fleeing){ // jet burst: brief straight-line speed spike, quadratic cost, long cooldown
        if(W.bst[i]>0){ speed*=T.burst.mul; W.bst[i]--; if(W.bst[i]===0) W.bst[i]=-T.burst.cd; }
        else if(W.bst[i]<0) W.bst[i]++;
        else if(found && best>W.sz[i]+6 && best<T.burst.range){ W.bst[i]=T.burst.dur; speed*=T.burst.mul; W.bst[i]--; }
      }
      W.x[i]=wrap(W.x[i]+Math.cos(W.hd[i])*speed); W.y[i]=wrap(W.y[i]+Math.sin(W.hd[i])*speed);
      cost += P.moveCost*speed*speed*W.sz[i] + T.interfCost*nearKin;
      if(torpid) cost*=0.7;
    }
    if(T.detritivore){
      const c0=cellOf(i), D=T.detritivore;
      const rateG = T.locus ? 1 + T.locus.rateSlope*gd - gq : 1, effG = T.locus ? 1 - T.locus.effSlope*gd - gq : 1; // rate-yield locus; both exactly 1 at g0
      const eatE=Math.min(W.dE[c0], D.rateE*rateG*W.sz[i]);
      if(eatE>0){ W.dE[c0]-=eatE; W.en[i]=Math.min(cap, W.en[i]+eatE*D.effE*effG); }
      const pQ3=P.pQuota*W.sz[i];
      const eatP=Math.min(W.dP[c0], D.rateP*rateG*W.sz[i], Math.max(0,(pQ3-W.pr[i])/D.effP));
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
      const nx=wrap(W.x[i]+(R()-0.5)*T.spread), ny=wrap(W.y[i]+(R()-0.5)*T.spread);
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
        if (T.locus){ // heredity: child = parent, plus one uniform kick of +-sigma when mutation is on
          let gc = W.g[i];
          if (T.locus.sigma > 0 && P.mutation){ // draw only when mutating: the silent genome consumes zero draws
            gc += (R()-0.5)*2*T.locus.sigma;
            gc = gc < 0 ? 0 : gc > 1 ? 1 : gc; // the corridor
          }
          W.g[ci] = gc;
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
    const d = P.corpseDecay;
    W.dE[c]+=W.cE[k]*d; W.dP[c]+=W.cP[k]*d; W.dM[c]+=W.cM[k]*d;
    W.flows.corpseToDet += W.cM[k]*d;
    W.cE[k]*=(1-d); W.cP[k]*=(1-d); W.cM[k]*=(1-d);
    W.sc[c] += P.scentEmit * mass * 0.01;
  }
  W.tick++;
  if (W.tick % REC.STRIDE === 0) record();
}

// the shipped evolution settings, captured once at load; initWorld restores them (like P.lightMul)
const LOCUS_SHIPPED = TRAITS.map(T => T.locus ? { sigma: T.locus.sigma, curve: T.locus.curve } : null);
function resetWorld(){
  W.initialized = false; W.n = 0; W.freeList.length = 0; W.alive.fill(0);
  W.tick = 0; W.events.length = 0; W.eventLog.length = 0;
}
function initWorld(seed){
  if (W.initialized) return; W.initialized = true;
  W.rng = mulberry32(seed === undefined ? P.SEED : seed);
  W.n=0; W.freeList.length=0; W.alive.fill(0); W.tick=0;
  W.M.fill(P.M0); W.dE.fill(0); W.dP.fill(0); W.dM.fill(0); W.sc.fill(0); W.al.fill(0);
  W.recHead=0; W.recCount=0; W.rec.fill(0); W.sysEvents.length=0;
  W.addedM=0; P.lightMul=1.0; W.evLog.length=0;
  // P.mutation is a harness-level switch (like spawnDecomposers) and is NOT reset here; the UI reset restores it
  TRAITS.forEach((T, sp) => { if (T.locus){ T.locus.sigma = LOCUS_SHIPPED[sp].sigma; T.locus.curve = LOCUS_SHIPPED[sp].curve; } });
  det.estab.fill(0); det.run.fill(0); det.bloom.fill(0); det.crash.fill(0);
  det.packAwake=false; det.depleted=false; det.lockedWarn=false; det.sweep.fill(0); det.uniform.fill(0); det.diverse.fill(0); det.diverseRun.fill(0); det.rail.fill(0); det.railRun.fill(0);
  recPrev.uptake=recPrev.gpp=recPrev.resp=recPrev.bacRelease=recPrev.corpseToDet=recPrev.egestE=recPrev.deaths=0;
  recPrev.deathsBy.fill(0);
  W.cN=0; W.cFree.length=0; W.cAlive.fill(0);
  for (const k in W.flows) W.flows[k] = (k==="deathsBy") ? [0,0,0,0,0,0,0] : 0;
  W.suns.length = 0; W.suns.push({ x: P.WORLD/2, y: P.WORLD/2, i: P.sunI, sigma: P.sunSigma }); // one sun, centred (like P.lightMul)
  computeLight();
  const nearSun = rad => { const a=R()*6.283, r=Math.sqrt(R())*rad;
    return [wrap(W.suns[0].x+Math.cos(a)*r), wrap(W.suns[0].y+Math.sin(a)*r)]; };
  const endow = endowFounder; { // (hoisted to module scope in the tweaks batch; alias kept)
    void 0;
  };
  for(let k=0;k<120;k++){ const [a,b]=nearSun(380); endow(spawn(0,a,b,30+R()*30,7+R()*2)); }
  for(let k=0;k<500;k++){ const [a,b]=nearSun(330); endow(spawn(1,a,b,16+R()*12,3.4)); }
  for(let k=0;k<12;k++){ const [a,b]=nearSun(420); endow(spawn(2,a,b,60,6)); }
  if (P.spawnDecomposers) for(let k=0;k<60;k++){ const [a,b]=nearSun(460); endow(spawn(3,a,b,10+R()*6,2)); }
  { const [ax,ay]=nearSun(300); // pack founding: a brood arrives together, shares the discovered hunting ground
    for(let k=0;k<9;k++){ const v=spawn(6, wrap(ax+(R()-0.5)*120), wrap(ay+(R()-0.5)*120), 70, 9);
      if(v>=0){ endow(v); W.cy[v]=1; } } }
  // Mycora deferred (3.4 finding): establishment marginal AND, where established, it robs the predator's kill-caches — sessility does not spare the caches (spores colonize kill-grounds). Re-entry condition: predator surplus margin, jointly with Necro.
  // Necro deferred (3.3 finding): viable on kill-flux (8/8 survival) but a subsistence predator cannot afford a kleptoparasite — Venator caches kills, Necro empties the pantry. Re-entry condition: predator surplus margin.
}

// __NODE_EXPORTS__ (everything below is stripped from the artifact by build.py)
if (typeof module !== "undefined" && module.exports !== undefined){
  module.exports = { P, W, R, TRAITS, TAG, REC, SPECIES, LOCUS_DEFAULTS, normalizeTraits, indicators, impact, cellOf, diffuseM, wrap, wd, spawn, killOrg, computeLight, rebuild,
    cellLight, neighbors, step, initWorld, resetWorld, applyEvent, drainEvents,
    queueEvent, mulberry32, CELL, MAXN };
}
