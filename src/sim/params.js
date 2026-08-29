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
  tempAmb: 0,       // ambient warmth (Phase 7 H; the global press is deferred) -- every Q10 factor is exactly 1 at dT = 0
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

