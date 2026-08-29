// SPDX-License-Identifier: GPL-3.0-or-later
//
// Microcosm — a sandbox for artificial organisms
// Copyright (C) 2026 Norman Hilbert
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
//
// Documentation in docs/ is licensed CC BY-SA 4.0; see LICENSE-docs.

import React, { useEffect, useRef, useState } from "react";

// ============================================================
// MICROCOSM — Phase 1, Increment 2 (skeleton)
// Sim core ported 1:1 from the headless tuner (8/8 seeds stable, 30 min)
// ============================================================

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
  sunSigma: 210, sunI: 1.0, ambient: 0.03,
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
const LOCUS_DEFAULTS = { sigma: 0, escSlope: 0, kpSlope: 0, catchSlope: 0, kbSlope: 0, lightSlope: 0, curve: 0 };
function normalizeTraits(rows){
  for (const t of rows){
    for (const k in TRAIT_DEFAULTS) if (t[k] === undefined) t[k] = TRAIT_DEFAULTS[k];
    if (t.cyst) for (const k in CYST_DEFAULTS) if (t.cyst[k] === undefined) t.cyst[k] = CYST_DEFAULTS[k];
    if (t.corpsivore) for (const k in CORPSIVORE_DEFAULTS) if (t.corpsivore[k] === undefined) t.corpsivore[k] = CORPSIVORE_DEFAULTS[k];
    if (t.locus) for (const k in LOCUS_DEFAULTS) if (t.locus[k] === undefined) t.locus[k] = LOCUS_DEFAULTS[k];
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
    // Phase 5.8 heredity: light adaptation, the sessile producer's classic trade-off.
    // Shade-tolerant mats photosynthesize better in dim light and worse in bright; the sun
    // lever (drag, intensity press) therefore sets a selection pressure the mat answers.
    locus: { g0: 0.5, sigma: 0.03, lightSlope: 0.5,
             label: "Light", hiWord: "shade-tolerant", loWord: "sun-loving",
             hiTrait: "shade tolerance", loTrait: "sun tolerance" },
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
    // g in [0,1]; defense (escape.p + escSlope*(g-g0)) rises with g, growth (kp*(1+kpSlope*(g0-g)))
    // falls. At g = g0 both expressions collapse to the bare trait, so a silent genome
    // (P.mutation=false) is bit-identical to the Phase 4 reference world.
    // Mutation kernel: one uniform draw in [-sigma, sigma] per division (a Gaussian would cost
    // two draws); the corridor clamp bounds it. Price by measurement (5.7): kpSlope 0.25 swept
    // to the defense rail, 0.75 to the growth rail; 0.5 holds a balanced polymorphism.
    locus: { g0: 0.5, sigma: 0.03, escSlope: 0.22, kpSlope: 0.5,
             label: "Defense", hiWord: "tougher", loWord: "faster-growing",  // functional names for the two ends
             hiTrait: "grazing resistance", loTrait: "growth rate" },  // the mechanism is an escape roll; for plankton it reads as resistance
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
    // Phase 5.6 heredity: pursuit, the coevolutionary counterweight to Drifta's defense (R5).
    // A keener grazer cuts its prey's escape chance; it pays in basal upkeep every tick.
    // Price by measurement (5.7): kbSlope 0.3 drifted thriftier, 0 swept keener; 0.15 holds mid-corridor.
    locus: { g0: 0.5, sigma: 0.03, catchSlope: 0.4, kbSlope: 0.15,
             label: "Pursuit", hiWord: "keener", loWord: "thriftier",
             hiTrait: "catch chance", loTrait: "energy thrift" },
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
  sun: { x: P.WORLD / 2, y: P.WORLD / 2 },
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
    case "sun":
      W.sun.x = wrap(ev.x); W.sun.y = wrap(ev.y);
      computeLight(); W.lightDirty = true; break;
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
  if (ev.type === "sun"){ // coalesce: only the latest sun position matters
    const k = W.events.findIndex(e => e.type === "sun");
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
function computeLight(){
  const s2 = 2 * P.sunSigma * P.sunSigma;
  for (let gy = 0; gy < P.GRID; gy++) for (let gx = 0; gx < P.GRID; gx++){
    const cx=(gx+0.5)*CELL, cyy=(gy+0.5)*CELL;
    const dx=wd(cx-W.sun.x), dy=wd(cyy-W.sun.y);
    W.light[gy*P.GRID+gx] = (P.ambient + P.sunI * Math.exp(-(dx*dx+dy*dy)/s2)) * P.lightMul;
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
  diverse:[0,0,0,0,0,0,0], diverseRun:[0,0,0,0,0,0,0] }; // standing polymorphism: both ends coexist
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
    const now = sp===6 ? awake[6] : B[r+sp];
    const before = havePrev ? (sp===6 ? -1 : B[rPrev+sp]) : -1;
    // establishment (sustained)
    if (!det.estab[sp]){
      det.run[sp] = now >= DET_ESTAB[sp] ? det.run[sp]+1 : 0;
      if (det.run[sp] >= 5){ det.estab[sp]=1;
        pushEvent("estab", sp, sp===6 ? name+" established — "+(now|0)+" hunters." : name+" established — "+(now|0)+" strong."); }
    }
    // predator wake (first hunter out of its cyst)
    if (sp===6 && !det.packAwake && awake[6] >= 1){ det.packAwake=true;
      pushEvent("wake", sp, "The pack wakes — "+name+" is hunting."); }
    // extinction (any presence to zero, on the full count incl. dormant)
    if (havePrev && B[rPrev+sp] > 0 && B[r+sp] === 0)
      pushEvent("extinct", sp, name+" has died out.");
    // bloom onset / crash over a 10-sample window
    if (have10 && sp !== 6){
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
    let hi=0, lo=0, n=0;
    for (let i=0;i<W.n;i++) if (W.alive[i] && W.sp[i]===sp){ n++; if (W.g[i] > L.g0+0.05) hi++; else if (W.g[i] < L.g0-0.05) lo++; }
    const shareHi = hi/n, shareLo = lo/n;
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
  B[r+33]=W.sun.x; B[r+34]=W.sun.y;
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
  for(let sp=0;sp<7;sp++) strain.push(sp===6 ? null : strainOf(sp));
  let ven = null;
  if (B[r0+6] > 0){
    const meanSz = B[r0+32]||9, cap = P.capMul*meanSz;
    let loss=0; const KL=Math.min(10,W.recCount);
    for(let k=1;k<=KL;k++) loss+=B[((W.recHead-k+REC.N)%REC.N)*REC.CH+35+2];
    ven = { reserve: (B[r0+13]/B[r0+6])/cap, preyLossRate: loss/(KL*REC.STRIDE/10) };
  }
  return {
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
function impact(entry){
  const isPress = entry.type==="sun" || entry.type==="sunlight";
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
    (e.type === "sun" || e.type === "sunlight") && e.tick < entry.tick);
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
      const sdx=wd(W.sun.x-W.x[i]), sdy=wd(W.sun.y-W.y[i]); const sd=Math.hypot(sdx,sdy)+1;
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
      const eatE=Math.min(W.dE[c0], D.rateE*W.sz[i]);
      if(eatE>0){ W.dE[c0]-=eatE; W.en[i]=Math.min(cap, W.en[i]+eatE*D.effE); }
      const pQ3=P.pQuota*W.sz[i];
      const eatP=Math.min(W.dP[c0], D.rateP*W.sz[i], Math.max(0,(pQ3-W.pr[i])/D.effP));
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
  det.estab.fill(0); det.run.fill(0); det.bloom.fill(0); det.crash.fill(0);
  det.packAwake=false; det.depleted=false; det.lockedWarn=false; det.sweep.fill(0); det.uniform.fill(0); det.diverse.fill(0); det.diverseRun.fill(0);
  recPrev.uptake=recPrev.gpp=recPrev.resp=recPrev.bacRelease=recPrev.corpseToDet=recPrev.egestE=recPrev.deaths=0;
  recPrev.deathsBy.fill(0);
  W.cN=0; W.cFree.length=0; W.cAlive.fill(0);
  for (const k in W.flows) W.flows[k] = (k==="deathsBy") ? [0,0,0,0,0,0,0] : 0;
  computeLight();
  const nearSun = rad => { const a=R()*6.283, r=Math.sqrt(R())*rad;
    return [wrap(W.sun.x+Math.cos(a)*r), wrap(W.sun.y+Math.sin(a)*r)]; };
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

// ============================================================
// RENDER / UI LAYER — browser-specific (Canvas 2D, React, pointers).
// Rewritten per platform; must never be imported by the sim core.
// ============================================================
const COL = {
  abyss: "#0B131E", water: "#152233", plankTxt: "#C9D7E3", silt: "#5E7386",
  solara: [70, 214, 140], drifta: [91, 200, 232], cilio: [215, 166, 232], bacillus: [158, 168, 104],
  mycora: [206, 182, 148], necro: [228, 224, 210], venator: [168, 214, 244],
};
const SPECIES_META = [
  { name:"Solara", role:"Producer · sessile mat", rgb: COL.solara },
  { name:"Drifta", role:"Producer · plankton",    rgb: COL.drifta },
  { name:"Cilio",  role:"Grazer · ciliate",       rgb: COL.cilio  },
  { name:"Bacillus", role:"Decomposer · colony",   rgb: COL.bacillus },
  { name:"Mycora",   role:"Decomposer · fungus",   rgb: COL.mycora },   // dormant until 3.4
  { name:"Necro",    role:"Scavenger",             rgb: COL.necro },    // dormant until 3.3
  { name:"Venator",  role:"Predator · pursuit",    rgb: COL.venator },
];
// Species profiles ("Steckbrief"), from the same TRAITS rows the sim runs on. Shown on the
// specimen card. Image: assets/species/<key>.png, optional -- the card hides the slot if missing.
const SPECIES_PROFILE = [
  { key:"solara", habitat:"the lit floor near the sun; a carpet, thickest where light is strongest",
    behaviour:"sessile; photosynthesises; divides into the neighbouring floor until the mat is crowded",
    food:"light and dissolved mineral", eatenBy:"Cilio — poor food; the lowest 35 units of every mat are ungrazeable refugia",
    size:"7–9 units at founding", lifecycle:"small constant hazard; no cyst" },
  { key:"drifta", habitat:"open water wherever the light reaches; drifts toward brightness",
    behaviour:"damped random walk with weak phototaxis; encysts when starved, wakes when light returns",
    food:"light and dissolved mineral — the fastest grower in the world", eatenBy:"Cilio — its best food; a 35% escape jink breaks contact",
    size:"3.4 units", lifecycle:"cyst at 18% reserve, wakes on light" },
  { key:"cilio", habitat:"the productive core, following its food",
    behaviour:"steering forager; pursues the nearest edible target; flees down the alarm gradient when neighbours are injured",
    food:"Drifta (best), Bacillus (survival food), Solara (poor)", eatenBy:"Venator — with a 30% escape jink of its own",
    size:"6 units", lifecycle:"matures 200 ticks after division, divides at most every 160; encysts when starved, wakes on prey" },
  { key:"bacillus", habitat:"wherever dead matter settles; follows detritus gradients",
    behaviour:"run-and-tumble; eats detritus and mineralises — returns bound mineral to the water. The recycling guild.",
    food:"detritus energy and protein", eatenBy:"Cilio — survival food; cysts edible at half yield",
    size:"2 units; colonies, not cells", lifecycle:"encysts when starved; wakes on detritus or death-scent" },
  null, null,
  { key:"venator", habitat:"the hunting grounds around the core; a pack founds together as cysts",
    behaviour:"fast straight-line pursuit with a jet burst; outturned by its prey; territorial; finishes the carcasses of its own kills",
    food:"Cilio only", eatenBy:"nothing",
    size:"9 units", lifecycle:"the slowest breeder (700-tick cooldown); a knife-edged apex — reported, never required" },
];
const SHAPES = ["nucleus","dot","tri","square","dot","dot","tri"]; // sprite shape per species (Venator is drawn as paths)
// Genotype tint (Phase 5.3): a bounded shift WITHIN the species hue. t=0 (the loWord end) leans
// paler and warmer, t=1 (the hiWord end) deeper and cooler; the midpoint is the species color
// exactly, so a silent genome renders precisely as before. Species identity stays legible at
// overview; the shift is meant to be read at loupe zoom and on the Traits histogram.
// Implemented as a hue rotation of +-TINT_HUE degrees plus a lightness tilt, in HSL: a channel
// nudge disappears under the glow composite; a hue turn survives it. t=0 turns warm and light,
// t=1 turns cool and deep.
const TINT_HUE = 52, TINT_LIGHT = 0.14;
function rgbToHsl(r, g, b){
  r/=255; g/=255; b/=255;
  const mx = Math.max(r,g,b), mn = Math.min(r,g,b), l = (mx+mn)/2;
  if (mx === mn) return [0, 0, l];
  const d = mx-mn, s = l > 0.5 ? d/(2-mx-mn) : d/(mx+mn);
  let h = mx===r ? (g-b)/d + (g<b ? 6 : 0) : mx===g ? (b-r)/d + 2 : (r-g)/d + 4;
  return [h*60, s, l];
}
function hslToRgb(h, s, l){
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2*l - 1)) * s, x = c * (1 - Math.abs((h/60) % 2 - 1)), m = l - c/2;
  const [r,g,b] = h < 60 ? [c,x,0] : h < 120 ? [x,c,0] : h < 180 ? [0,c,x] : h < 240 ? [0,x,c] : h < 300 ? [x,0,c] : [c,0,x];
  return [Math.round((r+m)*255), Math.round((g+m)*255), Math.round((b+m)*255)];
}
function tintRgb(rgb, t){
  const k = (t - 0.5) * 2; // -1..1
  if (k === 0) return rgb.slice();
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  return hslToRgb(h - TINT_HUE*k, Math.min(1, s + 0.10*Math.abs(k)), Math.max(0.15, Math.min(0.85, l - TINT_LIGHT*k)));
}
function makeSprite(rgb, shape){
  const s = 64, c = document.createElement("canvas"); c.width = s; c.height = s;
  const g = c.getContext("2d"); const [r, gg, b] = rgb;
  if (shape === "nucleus"){ // Solara individual: small dim marker; the mass lives in the carpet layer
    g.fillStyle = `rgba(${Math.round(r*0.8)},${Math.round(gg*0.9)},${Math.round(b*0.85)},0.55)`;
    g.beginPath(); g.arc(s/2, s/2, 5, 0, 6.283); g.fill();
    g.fillStyle = "rgba(230,255,240,0.35)";
    g.beginPath(); g.arc(s/2, s/2, 2.2, 0, 6.283); g.fill();
    return c;
  }
  const grad = g.createRadialGradient(s/2, s/2, 2, s/2, s/2, s/2);
  if (shape === "square"){ // Bacillus: dim earthy speck, square = decomposer
    grad.addColorStop(0, `rgba(${r},${gg},${b},0.55)`);
    grad.addColorStop(0.45, `rgba(${r},${gg},${b},0.18)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    g.fillStyle = `rgba(${Math.min(255,r+60)},${Math.min(255,gg+60)},${Math.min(255,b+50)},0.85)`;
    g.fillRect(s/2-3.4, s/2-3.4, 6.8, 6.8);
    return c;
  }
  if (shape === "tri"){ // Cilio: rare + moving, allowed the luminance peak
    grad.addColorStop(0, `rgba(${r},${gg},${b},0.9)`);
    grad.addColorStop(0.4, `rgba(${r},${gg},${b},0.4)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    // the mark carries the color: a pure white triangle washed every tint out under the screen composite
    g.fillStyle = `rgba(${Math.min(255,r+55)},${Math.min(255,gg+55)},${Math.min(255,b+55)},0.95)`;
    g.beginPath(); g.moveTo(s*0.72, s*0.5); g.lineTo(s*0.38, s*0.36); g.lineTo(s*0.38, s*0.64); g.closePath(); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 1.2; g.stroke();
  } else { // Drifta: soft glow, colored (not white) center, modest alpha
    grad.addColorStop(0, `rgba(${r},${gg},${b},0.6)`);
    grad.addColorStop(0.4, `rgba(${r},${gg},${b},0.22)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    g.fillStyle = `rgba(${Math.min(255,r+40)},${Math.min(255,gg+35)},${Math.min(255,b+30)},0.9)`;
    g.beginPath(); g.arc(s/2, s/2, 3.6, 0, 6.283); g.fill();
  }
  return c;
}


// The Ghost Ray (Venator): hollow spearhead, bright leading edge, fading trail, wake ghosts.
// Drawn as paths (population is always small); heading-aligned; a Strike stretches it into a streak.
function drawRayHead(ctx, r, alpha, scale, stretch){
  // spearhead: barely longer than wide, broad shoulders, deep notch
  const L = r*1.0*stretch*scale, Wd = r*0.95*scale, back = r*0.75*stretch*scale, notch = r*0.5*stretch*scale;
  ctx.fillStyle = `rgba(150,200,235,${(0.10*alpha).toFixed(3)})`;
  ctx.beginPath();
  ctx.moveTo(L, 0); ctx.lineTo(-back, Wd); ctx.lineTo(-notch, 0); ctx.lineTo(-back, -Wd);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = `rgba(212,236,255,${(0.85*alpha).toFixed(3)})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-back, Wd); ctx.lineTo(L, 0); ctx.lineTo(-back, -Wd); ctx.stroke();
  ctx.strokeStyle = `rgba(150,200,235,${(0.20*alpha).toFixed(3)})`;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-back, Wd); ctx.lineTo(-notch, 0); ctx.lineTo(-back, -Wd); ctx.stroke();
}
function drawGhostRay(ctx, sx, sy, hd, r, striking, trail){
  const stretch = striking ? 1.4 : 1.0;
  // wake: the hunter's ACTUAL past positions — it bends through turns because it is the turn
  if (trail){
    for (let q = 0; q < trail.length; q++){
      const g = trail[q];
      ctx.save(); ctx.translate(g.sx, g.sy); ctx.rotate(g.hd);
      drawRayHead(ctx, r, q === trail.length-1 ? 0.26 : 0.11, q === trail.length-1 ? 0.85 : 0.7, 1);
      ctx.restore();
    }
  }
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(hd);
  drawRayHead(ctx, r, 1, 1, stretch);
  ctx.fillStyle = "rgba(240,250,255,0.95)";
  ctx.beginPath(); ctx.arc(r*1.0*stretch, 0, 1.4, 0, 6.283); ctx.fill();
  if (striking){
    ctx.strokeStyle = "rgba(212,236,255,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-r*3.2, 0); ctx.lineTo(r*0.8, 0); ctx.stroke();
  }
  ctx.restore();
}
// ============================================================
// LAYOUT LAYER — viewport breakpoints, desktop chrome, hover CSS.
// Browser-specific, like the render layer; never imported by the sim core.
//
// The app is mobile-first and stays that way: every desktop affordance here is
// ADDITIVE. Pointer Events already unify mouse and touch, so nothing below
// replaces a touch path — it only widens the layout and adds keyboard and hover,
// which a touch device simply never triggers.
// ============================================================

const LAYOUT = {
  wide: 900,      // px viewport width at which the desktop layout takes over
  panelCard: 372, // right panel width showing a specimen
  panelData: 460, // right panel width showing the Observatory (charts need room)
  readable: 1180, // max content width, so charts never smear across an ultrawide
};

// Viewport observer. `fine` is true for mouse/trackpad, false for touch — used
// only to decide whether to advertise keyboard shortcuts, never to gate input.
function useViewport(){
  const read = () => ({
    vw: typeof window === "undefined" ? 1024 : window.innerWidth,
    vh: typeof window === "undefined" ? 768 : window.innerHeight,
    fine: typeof window !== "undefined" && !!window.matchMedia
      && window.matchMedia("(hover: hover) and (pointer: fine)").matches,
  });
  const [v, setV] = React.useState(read);
  React.useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setV(read()));
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);
  return { ...v, desktop: v.vw >= LAYOUT.wide };
}

// Inline styles win over stylesheets, so hover/focus rules need !important.
// Keeping them in one place beats scattering onMouseEnter handlers everywhere.
const UI_CSS = `
.mc-hit{ transition: background .13s ease, border-color .13s ease, color .13s ease, transform .13s ease; }
@media (hover: hover) and (pointer: fine){
  .mc-hit:hover{ background: rgba(201,215,227,0.16) !important; color:#E6F0FA !important; }
  .mc-hit-amber:hover{ background: rgba(242,178,74,0.24) !important; }
  .mc-hit-solid:hover{ filter: brightness(1.08); }
  .mc-fab:hover{ background: rgba(31,48,70,0.95) !important; transform: translateY(-1px); }
  .mc-tab:hover{ color:#E6F0FA !important; }
}
.mc-hit:active{ transform: translateY(1px); }
.mc-hit:focus-visible, .mc-fab:focus-visible, .mc-tab:focus-visible{
  outline: 2px solid rgba(242,178,74,0.8); outline-offset: 2px;
}
.mc-scroll{ scrollbar-width: thin; scrollbar-color: rgba(94,115,134,0.5) transparent; }
.mc-scroll::-webkit-scrollbar{ width: 9px; height: 9px; }
.mc-scroll::-webkit-scrollbar-thumb{ background: rgba(94,115,134,0.45); border-radius: 5px; }
.mc-scroll::-webkit-scrollbar-thumb:hover{ background: rgba(94,115,134,0.7); }
.mc-scroll::-webkit-scrollbar-track{ background: transparent; }
.mc-kbd{ display:inline-block; min-width:15px; padding:1px 5px; border-radius:4px; text-align:center;
  background:rgba(201,215,227,0.10); border:1px solid rgba(94,115,134,0.38); font-size:10px; }
`;

function UiStyles(){ return <style dangerouslySetInnerHTML={{ __html: UI_CSS }} />; }
// ============================================================
// DATA MODE (4.3/4.4) — the Observatory's screen. Own module by decision.
// Pages: Populations · Chemistry · Metabolism · Health
// ============================================================
const PAGE_TITLES = [
  ["Populations", "every line a species · amber = your interventions · drag across to scrub"],
  ["Chemistry", "where every unit of mineral sits · the top edge is the world's total"],
  ["Metabolism", "what the world produces and burns"],
  ["Health", "vitals against species reference ranges, like blood work"],
  ["Events", "the world's story, oldest at the bottom · since ≠ because"],
  ["Traits", "what is being inherited · mean and spread over time, the population now"],
];
const IV_LABEL = { pour:"You poured mineral", kill:"You killed a specimen", feed:"You fed a specimen", seed:"You introduced organisms",
  sun:"You moved the sun", sunlight:"You changed the sunlight", undo:"You undid the last action" };
function ImpactLine({ ev }){
  const r = typeof impact === "function" ? impact(ev) : null;
  if (!r) return null;
  const sub = { fontSize:10, color:"#5E7386", marginTop:2 };
  if (r.status === "rolled") return <div style={sub}>history has rolled past this one</div>;
  if (r.status === "watching") return <div style={sub}>watching impact… {r.pct}%</div>;
  let text;
  if (!r.notable.length)
    text = "no clear shift beyond normal variability — the world absorbed it";
  else
    text = "Since: " + r.notable.map(m =>
      m.name + " " + (m.pct>0?"+":"") + m.pct + "%" + (m.strong ? "" : " (could be a natural swing)")
    ).join(" · ");
  const tails = [];
  if (r.recoveredS) tails.push("relaxed back after " + r.recoveredS + " s");
  else if (r.isPress) tails.push("settling toward a new regime");
  else if (!r.complete) tails.push("still developing");
  if (r.mixed) tails.push("mixed with other interventions");
  if (r.pressBackdrop) tails.push("under a changed-sun regime — attribution weak");
  return <div style={sub}>{text}{tails.length ? " · " + tails.join(" · ") : ""}</div>;
}
function EventsPage(){
  const items = [];
  for (const e of W.sysEvents) items.push({ tick: e.tick, sys: true, sp: e.sp, text: e.text });
  for (const e of W.evLog) items.push({ tick: e.tick, sys: false, type: e.type,
    text: IV_LABEL[e.type] || e.type, ev: e });
  items.sort((a,b) => b.tick - a.tick);
  const fmt = t => { const sec = Math.floor(t/10);
    return Math.floor(sec/60) + ":" + String(sec%60).padStart(2,"0"); };
  return (
    <div style={{ padding:"2px 16px", overflowY:"auto", flex:1 }}>
      {items.slice(0, 60).map((it, ix) => {
        const col = it.sys
          ? (it.sp >= 0 ? "rgb("+SPECIES_META[it.sp].rgb.join(",")+")" : "#8FA3B5")
          : "#F2B24A";
        return (
          <div key={ix} style={{ padding:"7px 0", borderBottom:"1px solid rgba(94,115,134,0.12)" }}>
            <div style={{ display:"flex", gap:10, fontSize:12, alignItems:"baseline" }}>
              <span style={{ color:"#42566A", fontSize:10, width:34 }}>{fmt(it.tick)}</span>
              <span style={{ color: col }}>{it.text}</span>
            </div>
            {!it.sys && it.type !== "undo" && <div style={{ marginLeft:44 }}><ImpactLine ev={it.ev} /></div>}
          </div>
        );
      })}
      {items.length === 0 && <div style={{ color:"#5E7386", fontSize:12, padding:16 }}>nothing yet — the world is young</div>}
      <div style={{ color:"#42566A", fontSize:10, padding:"12px 0 8px" }}>
        Impact readings are before-after comparisons against each channel's own trend and natural
        variability — one world, no control group, so they say "since", never "because". A walled
        control compartment or a replayed twin world would upgrade this to a true experiment.
      </div>
    </div>
  );
}
function drawFrame(g, wpx, hpx){
  g.fillStyle = "#0B131E"; g.fillRect(0, 0, wpx, hpx);
  return { padL: 38, padR: 10, padT: 8, padB: 20, cw: wpx-48, ch: hpx-28 };
}
function seriesAt(n){ return (k, chan) => W.rec[((W.recHead-n+k+REC.N)%REC.N)*REC.CH + chan]; }
function drawMarkers(g, F, n, tickNow){
  const tick0 = tickNow - (n-1)*REC.STRIDE;
  for (const ev of W.evLog){
    if (ev.tick < tick0) continue;
    const x = F.padL + F.cw*(ev.tick-tick0)/Math.max(1,(tickNow-tick0));
    g.strokeStyle = ev.type==="undo" ? "rgba(242,178,74,0.28)" : "rgba(242,178,74,0.55)";
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, F.padT); g.lineTo(x, F.padT+F.ch); g.stroke();
  }
}
function axisText(g, F, hpx, n, topLabel){
  g.fillStyle = "#5E7386"; g.font = "10px ui-monospace, Menlo, monospace";
  if (topLabel) g.fillText(topLabel, 4, F.padT+8);
  g.fillText("0", 4, F.padT+F.ch);
  g.fillText("-"+Math.round((n-1)*REC.STRIDE/10)+"s", F.padL, hpx-6);
  g.fillText("now", F.padL+F.cw-24, hpx-6);
}
function smooth3(get, n, chan){
  return k => {
    const a = get(Math.max(0,k-1),chan), b = get(k,chan), c = get(Math.min(n-1,k+1),chan);
    return (a+b+c)/3;
  };
}

function drawPopulations(g, wpx, hpx, scrub, logScale){
  const F = drawFrame(g, wpx, hpx);
  const n = W.recCount; if (n < 5) return;
  const at = seriesAt(n);
  let ymax = 10;
  for (let k=0;k<n;k++) for (let sp=0;sp<7;sp++) ymax = Math.max(ymax, at(k,sp));
  ymax *= 1.08;
  const LM = Math.log10(1 + ymax);
  const yOf = v => logScale ? F.padT + F.ch*(1 - Math.log10(1+v)/LM)
                            : F.padT + F.ch*(1 - v/ymax);
  g.strokeStyle = "rgba(94,115,134,0.25)"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(F.padL, F.padT); g.lineTo(F.padL, F.padT+F.ch); g.lineTo(F.padL+F.cw, F.padT+F.ch); g.stroke();
  g.fillStyle = "#5E7386"; g.font = "10px ui-monospace, Menlo, monospace";
  if (logScale){ // decade gridlines: the vast and the rare on one readable canvas
    for (const d of [1, 10, 100, 1000]){
      if (d > ymax) break;
      const y = yOf(d);
      g.strokeStyle = "rgba(94,115,134,0.18)";
      g.beginPath(); g.moveTo(F.padL, y); g.lineTo(F.padL+F.cw, y); g.stroke();
      g.fillText(String(d), 6, y+3);
    }
  } else {
    g.fillText(String(Math.round(ymax)), 4, F.padT+8);
    g.fillText("0", 4, F.padT+F.ch);
  }
  g.fillText("-"+Math.round((n-1)*REC.STRIDE/10)+"s", F.padL, hpx-6);
  g.fillText("now", F.padL+F.cw-24, hpx-6);
  drawMarkers(g, F, n, W.tick);
  for (let sp=0;sp<7;sp++){
    let any=false; for(let k=0;k<n;k+=7) if(at(k,sp)>0){any=true;break;}
    if(!any) continue;
    const c = SPECIES_META[sp].rgb;
    g.strokeStyle = "rgb("+c[0]+","+c[1]+","+c[2]+")"; g.lineWidth = 1.6;
    g.beginPath();
    for (let k=0;k<n;k++){
      const x = F.padL + F.cw*k/Math.max(1,n-1), y = yOf(at(k,sp));
      k===0 ? g.moveTo(x,y) : g.lineTo(x,y);
    }
    g.stroke();
  }
  if (scrub !== null && scrub >= 0 && scrub < n){
    const x = F.padL + F.cw*scrub/Math.max(1,n-1);
    g.strokeStyle = "rgba(230,240,250,0.6)";
    g.beginPath(); g.moveTo(x, F.padT); g.lineTo(x, F.padT+F.ch); g.stroke();
  }
}

function drawChemistry(g, wpx, hpx){
  const F = drawFrame(g, wpx, hpx);
  const n = W.recCount; if (n < 5) return;
  const at = seriesAt(n);
  let ymax = 10;
  for (let k=0;k<n;k++) ymax = Math.max(ymax, at(k,14)+at(k,15)+at(k,16)+at(k,17));
  ymax *= 1.06;
  // stack: bound (life) at bottom, corpse, detritus, dissolved on top
  const order = [[15,[70,214,140],0.5],[16,[158,168,178],0.5],[17,[110,122,134],0.5],[14,[91,200,232],0.45]];
  const acc = new Float32Array(n);
  for (const [chan, c, al] of order){
    g.beginPath();
    for (let k=0;k<n;k++){
      const x = F.padL + F.cw*k/Math.max(1,n-1);
      const y = F.padT + F.ch*(1 - acc[k]/ymax);
      k===0 ? g.moveTo(x,y) : g.lineTo(x,y);
    }
    for (let k=n-1;k>=0;k--){
      acc[k]+=at(k,chan);
      const x = F.padL + F.cw*k/Math.max(1,n-1);
      g.lineTo(x, F.padT + F.ch*(1 - acc[k]/ymax));
    }
    g.closePath();
    g.fillStyle = "rgba("+c[0]+","+c[1]+","+c[2]+","+al+")";
    g.fill();
  }
  // conserved-total top edge, bright: it only moves when the hand adds
  g.strokeStyle = "rgba(230,240,250,0.8)"; g.lineWidth = 1.4;
  g.beginPath();
  for (let k=0;k<n;k++){
    const x = F.padL + F.cw*k/Math.max(1,n-1);
    const y = F.padT + F.ch*(1 - acc[k]/ymax);
    k===0 ? g.moveTo(x,y) : g.lineTo(x,y);
  }
  g.stroke();
  axisText(g, F, hpx, n, String(Math.round(ymax)));
  drawMarkers(g, F, n, W.tick);
}

function drawMetabolism(g, wpx, hpx){
  const F = drawFrame(g, wpx, hpx);
  const n = W.recCount; if (n < 8) return;
  const at = seriesAt(n);
  const gpp = smooth3(at, n, 19), resp = smooth3(at, n, 20), minz = smooth3(at, n, 21);
  let ymax = 10;
  for (let k=0;k<n;k++) ymax = Math.max(ymax, gpp(k), resp(k));
  ymax *= 1.1;
  let m2 = 1; for (let k=0;k<n;k++) m2 = Math.max(m2, minz(k));
  g.strokeStyle = "rgba(94,115,134,0.25)"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(F.padL, F.padT); g.lineTo(F.padL, F.padT+F.ch); g.lineTo(F.padL+F.cw, F.padT+F.ch); g.stroke();
  axisText(g, F, hpx, n, String(Math.round(ymax)));
  drawMarkers(g, F, n, W.tick);
  const line = (fn, ym, color, width) => {
    g.strokeStyle = color; g.lineWidth = width;
    g.beginPath();
    for (let k=0;k<n;k++){
      const x = F.padL + F.cw*k/Math.max(1,n-1), y = F.padT + F.ch*(1 - fn(k)/ym);
      k===0 ? g.moveTo(x,y) : g.lineTo(x,y);
    }
    g.stroke();
  };
  line(gpp, ymax, "rgb(140,230,170)", 1.8);        // production
  line(resp, ymax, "rgb(196,150,140)", 1.8);       // consumption (respiration)
  line(minz, m2*1.15, "rgba(91,200,232,0.7)", 1.2); // recycling (own scale)
}

// Traits page (5.3): one band per species with a locus. Left/top: mean ± one standard deviation
// over time, the founder value as a dashed line, amber intervention markers. Bottom: histogram
// of the living population now, bars in the genotype tint. Variance is drawn deliberately large:
// it is the fuel gauge of evolution, and a sweep is visible as the ribbon narrowing while it moves.
function drawTraits(g, wpx, hpx){
  g.fillStyle = "#0B131E"; g.fillRect(0, 0, wpx, hpx);
  const loci = []; for (let sp=0;sp<7;sp++) if (TRAITS[sp].locus && sp !== 6) loci.push(sp);
  const n = W.recCount;
  if (!loci.length){ g.fillStyle="#5E7386"; g.font="11px ui-monospace, Menlo, monospace"; g.fillText("no heritable traits in this world", 12, 24); return; }
  const bandH = hpx / loci.length;
  loci.forEach((sp, bi) => {
    const L = TRAITS[sp].locus, c = SPECIES_META[sp].rgb, col = "rgb("+c[0]+","+c[1]+","+c[2]+")";
    const top = bi*bandH, padL = 34, padR = 10;
    const ribT = top + 22, ribH = Math.max(40, bandH*0.52), histT = ribT + ribH + 18, histH = Math.max(28, bandH - (ribT - top) - ribH - 40);
    const cw = wpx - padL - padR;
    g.font = "11px ui-monospace, Menlo, monospace";
    g.fillStyle = col; g.fillText(SPECIES_META[sp].name + " · " + L.label.toLowerCase(), padL, top + 14);
    // ribbon
    g.strokeStyle = "rgba(94,115,134,0.25)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(padL, ribT); g.lineTo(padL, ribT+ribH); g.lineTo(padL+cw, ribT+ribH); g.stroke();
    g.fillStyle = "#5E7386"; g.font = "10px ui-monospace, Menlo, monospace";
    g.fillText("1", padL-12, ribT+8); g.fillText("0", padL-12, ribT+ribH);
    const yOf = v => ribT + ribH*(1 - Math.max(0, Math.min(1, v)));
    g.setLineDash([3,4]); g.strokeStyle = "rgba(201,215,227,0.35)";
    g.beginPath(); g.moveTo(padL, yOf(L.g0)); g.lineTo(padL+cw, yOf(L.g0)); g.stroke(); g.setLineDash([]);
    if (n >= 5){
      const at = seriesAt(n);
      const F = { padL, padT: ribT, ch: ribH, cw };
      drawMarkers(g, F, n, W.tick);
      g.beginPath();
      for (let k=0;k<n;k++){ const x = padL + cw*k/Math.max(1,n-1); const y = yOf(at(k,42+sp)+at(k,49+sp)); k===0 ? g.moveTo(x,y) : g.lineTo(x,y); }
      for (let k=n-1;k>=0;k--){ const x = padL + cw*k/Math.max(1,n-1); g.lineTo(x, yOf(at(k,42+sp)-at(k,49+sp))); }
      g.closePath(); g.fillStyle = "rgba("+c[0]+","+c[1]+","+c[2]+",0.22)"; g.fill();
      g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath();
      for (let k=0;k<n;k++){ const x = padL + cw*k/Math.max(1,n-1), y = yOf(at(k,42+sp)); k===0 ? g.moveTo(x,y) : g.lineTo(x,y); }
      g.stroke();
      g.fillStyle = "#5E7386"; g.font = "10px ui-monospace, Menlo, monospace";
      g.fillText("-"+Math.round((n-1)*REC.STRIDE/10)+"s", padL, ribT+ribH+11); g.fillText("now", padL+cw-24, ribT+ribH+11);
      const last = at(n-1,42+sp), lsd = at(n-1,49+sp);
      const lab = "mean "+last.toFixed(2)+" · spread ±"+lsd.toFixed(2);
      g.fillStyle = "#B8C5D1"; g.fillText(lab, padL+cw-g.measureText(lab).width, top+14);
    } else { g.fillStyle="#5E7386"; g.fillText("gathering history…", padL+6, ribT+ribH/2); }
    // histogram of the living population
    const BINS = 24, hist = new Float32Array(BINS); let tot=0;
    for (let i=0;i<W.n;i++) if (W.alive[i] && W.sp[i]===sp){ hist[Math.min(BINS-1, Math.floor(W.g[i]*BINS))]++; tot++; }
    let hmax = 1; for (let b=0;b<BINS;b++) hmax = Math.max(hmax, hist[b]);
    const bw = cw/BINS;
    for (let b=0;b<BINS;b++){
      const t = tintRgb(c, (b+0.5)/BINS), h = histH*hist[b]/hmax;
      g.fillStyle = "rgba("+t[0]+","+t[1]+","+t[2]+",0.85)";
      g.fillRect(padL + b*bw + 0.5, histT + histH - h, Math.max(1, bw-1), h);
    }
    g.strokeStyle = "rgba(201,215,227,0.35)"; g.setLineDash([3,4]);
    g.beginPath(); g.moveTo(padL + cw*L.g0, histT); g.lineTo(padL + cw*L.g0, histT+histH); g.stroke(); g.setLineDash([]);
    g.fillStyle = "#5E7386"; g.font = "10px ui-monospace, Menlo, monospace";
    g.fillText(L.loWord, padL, histT+histH+11);
    g.fillText(L.hiWord, padL+cw-g.measureText(L.hiWord).width, histT+histH+11);
    const nl = tot+" alive now"; g.fillText(nl, padL+cw/2-g.measureText(nl).width/2, histT+histH+11);
  });
}
function TraitsLegend(){
  const n = W.recCount; if (n < 1) return null;
  const r = ((W.recHead-1+REC.N)%REC.N)*REC.CH;
  const rows = [];
  for (let sp=0;sp<7;sp++){ const L = TRAITS[sp].locus; if (!L || sp===6) continue;
    const c = SPECIES_META[sp].rgb, mean = W.rec[r+42+sp], sd = W.rec[r+49+sp];
    let hi=0, tot=0; for (let i=0;i<W.n;i++) if (W.alive[i] && W.sp[i]===sp){ tot++; if (W.g[i] > L.g0+0.05) hi++; }
    rows.push(<span key={sp} style={{ color:"rgb("+c[0]+","+c[1]+","+c[2]+")" }}>
      ● {SPECIES_META[sp].name} {L.label.toLowerCase()} {mean.toFixed(2)} ±{sd.toFixed(2)} · {L.hiWord} {tot ? Math.round(100*hi/tot) : 0}%</span>);
  }
  return <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 14px", padding:"8px 16px", fontSize:12 }}>
    {rows}<span style={{ color:"#5E7386", marginLeft:"auto" }}>{P.mutation ? "mutation on" : "mutation off"}</span></div>;
}
function HealthPage(){
  const ind = typeof indicators === "function" ? indicators() : null;
  if (!ind) return <div style={{ padding:24, color:"#5E7386", fontSize:12 }}>gathering history…</div>;
  const tile = (label, sub, value) => (
    <div key={label} style={{ background:"rgba(20,31,44,0.8)", borderRadius:12, padding:"10px 12px", minWidth:130, flex:1 }}>
      <div style={{ fontSize:11, color:"#5E7386" }}>{label}</div>
      <div style={{ fontSize:20, color:"#E6F0FA", fontWeight:600 }}>{value}</div>
      <div style={{ fontSize:9, color:"#42566A" }}>{sub}</div>
    </div>
  );
  const lightFor = lv => lv===2 ? ["●","rgb(226,96,96)","critical"] : lv===1 ? ["●","rgb(206,186,120)","tense"] : ["●","rgb(94,150,116)","calm"];
  const rows = [];
  for (const sp of [0,1,2,3]){
    const st = ind.strain[sp];
    if (!st) continue;
    const [dot, col, word] = lightFor(st.level);
    const arrow = st.trend < -0.03 ? "↓" : st.trend > 0.03 ? "↑" : "→";
    rows.push(
      <div key={sp} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 4px", fontSize:13 }}>
        <span style={{ color:col, fontSize:15 }}>{dot}</span>
        <span style={{ width:74 }}>{SPECIES_META[sp].name}</span>
        <span style={{ color:"#5E7386", fontSize:11 }}>reserve {(st.reserve*100|0)}% {arrow} · pop ×{st.popTrend}</span>
        <span style={{ marginLeft:"auto", color:col, fontSize:11 }}>{word}</span>
      </div>);
  }
  if (ind.venator) rows.push(
    <div key={6} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 4px", fontSize:13 }}>
      <span style={{ color: ind.venator.reserve < 0.24 ? "rgb(226,96,96)" : ind.venator.reserve < 0.30 ? "rgb(206,186,120)" : "rgb(94,150,116)", fontSize:15 }}>●</span>
      <span style={{ width:74 }}>Venator</span>
      <span style={{ color:"#5E7386", fontSize:11 }}>hunter reserve {(ind.venator.reserve*100|0)}% · prey losses {ind.venator.preyLossRate.toFixed(1)}/s</span>
    </div>);
  return (
    <div style={{ padding:"4px 16px", overflowY:"auto" }}>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {tile("VARIETY", "Shannon diversity", ind.variety)}
        {tile("PRODUCTION VS CONSUMPTION", "P/R ratio, Odum", ind.prodVsCons)}
        {tile("RECYCLING SPEED", "mineral turnover", ind.recyclingMin===null ? "–" : "every "+Math.round(ind.recyclingMin*60)+" s")}
        {tile("LOCKED AWAY", "corpses + detritus", ind.lockedPct+"%")}
      </div>
      <div style={{ marginTop:14, fontSize:11, color:"#5E7386" }}>SPECIES VITALS</div>
      <div style={{ marginTop:4 }}>{rows}</div>
      <div style={{ marginTop:12, fontSize:10, color:"#42566A" }}>
        Reference ranges measured on six healthy archived worlds. Statistical early-warning signals
        (rising autocorrelation/variance) run as an experimental overlay only — tested against ground
        truth, kept advisory.
      </div>
    </div>
  );
}

function DataMode({ docked }){
  const cRef = React.useRef(null);
  const [page, setPage] = React.useState(0);
  const [scrub, setScrub] = React.useState(null);
  const [logScale, setLogScale] = React.useState(true);
  const [, force] = React.useState(0);
  const swipe = React.useRef(null);
  React.useEffect(() => {
    const iv = setInterval(() => force(x => x+1), 1000);
    return () => clearInterval(iv);
  }, []);
  React.useEffect(() => {
    if (page === 3 || page === 4) return; // Health and Events are DOM, not canvas
    const cv = cRef.current; if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const wpx = cv.clientWidth, hpx = cv.clientHeight;
    cv.width = wpx*dpr; cv.height = hpx*dpr;
    const g = cv.getContext("2d"); g.scale(dpr, dpr);
    if (page === 0) drawPopulations(g, wpx, hpx, scrub, logScale);
    else if (page === 1) drawChemistry(g, wpx, hpx);
    else if (page === 2) drawMetabolism(g, wpx, hpx);
    else if (page === 5) drawTraits(g, wpx, hpx);
  });
  const onScrub = e => {
    if (page !== 0) return;
    const cv = cRef.current; if (!cv) return;
    const r = cv.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - r.left - 38) / (r.width - 48)));
    setScrub(Math.round(frac * (W.recCount-1)));
  };
  const swDown = e => { swipe.current = { x: e.clientX, t: performance.now() }; };
  const swUp = e => {
    const s = swipe.current; swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 64 && performance.now() - s.t < 600)
      setPage(p => Math.max(0, Math.min(4, p + (dx < 0 ? 1 : -1))));
  };
  const n = W.recCount;
  const k = (scrub !== null && n>0) ? Math.min(scrub, n-1) : (n>0 ? n-1 : 0);
  const at2 = sp => n>0 ? Math.round(W.rec[((W.recHead-n+k+REC.N)%REC.N)*REC.CH + sp]) : 0;
  const ago = n>0 ? Math.round((n-1-k)*REC.STRIDE/10) : 0;
  return (
    <div style={docked
      ? { position:"relative", flex:1, minHeight:0, display:"flex", flexDirection:"column",
          paddingTop:12, fontFamily:"ui-monospace, Menlo, monospace", color:"#B8C5D1" }
      : { position:"absolute", inset:0, background:"rgba(11,19,30,0.97)",
          zIndex:4, display:"flex", flexDirection:"column", paddingTop:88,
          fontFamily:"ui-monospace, Menlo, monospace", color:"#B8C5D1" }}
      onPointerDown={docked ? undefined : swDown} onPointerUp={docked ? undefined : swUp}>
      <div style={{ padding:"0 16px 6px", display:"flex", alignItems:"flex-start" }}>
        <div>
          <div style={{ fontSize:15, fontWeight:600, color:"#E6F0FA" }}>{PAGE_TITLES[page][0]}</div>
          <div style={{ fontSize:11, color:"#5E7386" }}>{PAGE_TITLES[page][1]}</div>
        </div>
        {page === 0 && (
          <button className="mc-hit" onClick={() => setLogScale(v => !v)}
            style={{ marginLeft:"auto", padding:"4px 10px", borderRadius:10, fontSize:11, cursor:"pointer",
              background:"rgba(20,31,44,0.9)", border:"1px solid rgba(94,115,134,0.4)",
              color:"#B8C5D1", fontFamily:"inherit" }}>{logScale ? "log" : "lin"}</button>
        )}
      </div>
      {page === 3 ? <HealthPage /> : page === 4 ? <EventsPage /> : (
        <canvas ref={cRef} onPointerDown={e => { e.stopPropagation(); swDown(e); onScrub(e); }}
          onPointerMove={e => e.buttons && onScrub(e)}
          onPointerUp={e => { swUp(e); setScrub(null); }}
          style={{ width:"100%", height: page===5 ? (docked ? "62%" : "58%") : docked ? "38%" : "46%", minHeight:170,
            touchAction:"none", cursor: page===0 ? "col-resize" : "default" }} />
      )}
      {page === 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 14px", padding:"8px 16px", fontSize:12 }}>
          {[0,1,2,3,6].map(sp => { const c=SPECIES_META[sp].rgb; return (
            <span key={sp} style={{ color:"rgb("+c[0]+","+c[1]+","+c[2]+")" }}>
              ● {SPECIES_META[sp].name} {at2(sp)}</span> ); })}
          <span style={{ color:"#5E7386", marginLeft:"auto" }}>{scrub!==null ? ago+"s ago" : "live"}</span>
        </div>
      )}
      {page === 1 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 14px", padding:"8px 16px", fontSize:12 }}>
          <span style={{color:"rgb(70,214,140)"}}>● in living bodies</span>
          <span style={{color:"rgb(158,168,178)"}}>● in corpses</span>
          <span style={{color:"rgb(110,122,134)"}}>● in detritus</span>
          <span style={{color:"rgb(91,200,232)"}}>● dissolved</span>
        </div>
      )}
      {page === 5 && <TraitsLegend />}
      {page === 2 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 14px", padding:"8px 16px", fontSize:12 }}>
          <span style={{color:"rgb(140,230,170)"}}>● production (GPP)</span>
          <span style={{color:"rgb(196,150,140)"}}>● consumption (R)</span>
          <span style={{color:"rgba(91,200,232,0.85)"}}>● recycling (own scale)</span>
        </div>
      )}
      {docked ? (
        <div className="mc-scroll" style={{ marginTop:"auto", flexShrink:0, display:"flex", flexWrap:"wrap",
          gap:4, padding:"10px 12px 14px", borderTop:"1px solid rgba(94,115,134,0.22)" }}>
          {[0,1,2,3,4,5].map(i => (
            <button key={i} className="mc-tab" onClick={() => setPage(i)}
              style={{ padding:"5px 10px", borderRadius:8, cursor:"pointer", fontFamily:"inherit", fontSize:11.5,
                border:"1px solid " + (i===page ? "rgba(94,115,134,0.5)" : "transparent"),
                background: i===page ? "rgba(201,215,227,0.12)" : "transparent",
                color: i===page ? "#E6F0FA" : "#5E7386" }}>
              {PAGE_TITLES[i][0]}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ textAlign:"center", color:"#5E7386", fontSize:13, marginTop:"auto", paddingBottom:96,
          letterSpacing:4 }}>
          {[0,1,2,3,4,5].map(i => (
            <span key={i} onClick={() => setPage(i)}
              style={{ cursor:"pointer", color: i===page ? "#E6F0FA" : "#42566A" }}>●</span>
          ))}
        </div>
      )}
    </div>
  );
}
// Reset control: confirm-tap, fresh random seed.
function ResetButton({ onReset, card }){
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 2600);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button aria-label="Reset world"
      onClick={() => { if (armed){ setArmed(false); onReset(); } else setArmed(true); }}
      style={{ position:"absolute", right:16, zIndex:6,
        bottom: card ? 254 : "calc(env(safe-area-inset-bottom, 0px) + 84px)",
        transition:"bottom 0.25s",
        width:44, height:44, borderRadius:22,
        background: armed ? "rgba(242,178,74,0.18)" : "rgba(21,34,51,0.85)",
        border: armed ? "1.5px solid rgba(242,178,74,0.8)" : "1px solid rgba(94,115,134,0.4)",
        color: armed ? "#F2B24A" : "#8FA3B5", fontSize:17,
        fontFamily:"ui-monospace, Menlo, monospace" }}>
      {armed ? "?" : "\u27F2"}
    </button>
  );
}
// (render helpers live in src/ui-render.js; concatenated by build.py)
export default function Microcosm(){
  const canvasRef = useRef(null);
  const [ui, setUi] = useState({ tick: 0, fps: 0, pops: [0,0,0,0,0,0,0], speed: 1, card: null, mineral: { b: 0, f: 0, l: 0, add: 0 }, lightMul: 1, spawnPick: null });
  const [detent, setDetent] = useState(0); // 0 peek, 1 half, 2 full
  const [undoChip, setUndoChip] = useState(null);
  const [uiMode, setUiMode] = useState("observe");
  const actionsRef = useRef({});
  const speedRef = useRef(1); // 0 = paused, 1, 4, 16
  const fabLong = useRef(null);
  const dragRef = useRef(null);
  const [hidden, setHidden] = useState([false,false,false,false,false,false,false,false]); // per-species show/hide (view only); slot 7 = debris (corpses)
  const hiddenRef = useRef(hidden); hiddenRef.current = hidden;

  useEffect(() => {
    initWorld();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let vw = 0, vh = 0;
    const cam = { x: W.sun.x, y: W.sun.y, z: Math.max(1, Math.min(window.innerWidth, window.innerHeight) / 620) };
    const minZ = () => Math.max(vw, vh) / P.WORLD;
    const clampZ = z => Math.max(minZ(), Math.min(6, z));
    const resize = () => {
      vw = canvas.clientWidth; vh = canvas.clientHeight;
      canvas.width = vw * dpr; canvas.height = vh * dpr;
      cam.z = clampZ(cam.z); // rotation / viewport change must re-clamp zoom
    };
    resize();
    window.addEventListener("resize", resize);
    // the side panel opening changes the canvas box without a window resize
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(canvas);

    // light layer (world-space, redrawn only when the sun moves — static in this increment)
    const LB = document.createElement("canvas"); LB.width = 512; LB.height = 512;
    const lg = LB.getContext("2d");
    const drawLight = () => {
      lg.fillStyle = COL.abyss; lg.fillRect(0,0,512,512);
      const k = 512 / P.WORLD;
      const gr2 = lg.createRadialGradient(W.sun.x*k, W.sun.y*k, 4, W.sun.x*k, W.sun.y*k, P.sunSigma*2.2*k);
      gr2.addColorStop(0, "rgba(214,238,255,0.30)");
      gr2.addColorStop(0.4, "rgba(140,190,225,0.12)");
      gr2.addColorStop(1, "rgba(140,190,225,0)");
      lg.fillStyle = gr2; lg.fillRect(0,0,512,512);
      lg.fillStyle = "rgba(240,250,255,0.9)";
      lg.beginPath(); lg.arc(W.sun.x*k, W.sun.y*k, 5, 0, 6.283); lg.fill();
    };
    drawLight();

    const sprites = [makeSprite(COL.solara,"nucleus"), makeSprite(COL.drifta,"dot"), makeSprite(COL.cilio,"tri"), makeSprite(COL.bacillus,"square"),
      makeSprite(COL.mycora,"dot"), makeSprite(COL.necro,"dot"), makeSprite(COL.venator,"tri")];
    // one sprite per genotype bin for every species that carries a locus (7 bins across [0,1])
    const TINT_BINS = 7;
    const tints = TRAITS.map((T, sp) => T.locus && sp !== 6
      ? Array.from({ length: TINT_BINS }, (_, b) => makeSprite(tintRgb(SPECIES_META[sp].rgb, b/(TINT_BINS-1)), SHAPES[sp]))
      : null);

    // mat carpet: density field for sessile producers (Splatterplots-style aggregation).
    // Denser mats render DARKER, saturated green — thick algae absorb light; brightness stays reserved.
    const MC = document.createElement("canvas"); MC.width = P.GRID; MC.height = P.GRID;
    const mcx = MC.getContext("2d");
    const mcImg = mcx.createImageData(P.GRID, P.GRID);
    // dissolved-mineral layer: faint blue nutrient water, dark where depleted
    const MN = document.createElement("canvas"); MN.width = P.GRID; MN.height = P.GRID;
    const mnx = MN.getContext("2d");
    const mnImg = mnx.createImageData(P.GRID, P.GRID);
    // corpse aggregation layer (zoomed out, husks merge into a gray pall)
    const CC = document.createElement("canvas"); CC.width = P.GRID; CC.height = P.GRID;
    const ccx = CC.getContext("2d");
    const ccImg = ccx.createImageData(P.GRID, P.GRID);
    const corpseMass = new Float32Array(P.GRID * P.GRID);
    // per-cell mean genotype of the mat species, so a heritable Solara trait shows in the carpet itself
    const cellG = new Float32Array(P.GRID * P.GRID), cellGn = new Uint16Array(P.GRID * P.GRID);
    const LOD_Z = 0.9; // below this zoom: aggregate corpses, draw bacteria as dots
    let carpetTick = -1;
    const updateCarpet = () => {
      if (W.tick === carpetTick) return; carpetTick = W.tick;
      const d = mcImg.data, dm = mnImg.data;
      const matLocus = TRAITS[0].locus;
      if (matLocus){
        cellG.fill(0); cellGn.fill(0);
        for (let i = 0; i < W.n; i++) if (W.alive[i] && W.sp[i] === 0){ const c = cellOf(i); cellG[c] += W.g[i]; cellGn[c]++; }
      }
      for (let c = 0; c < P.GRID*P.GRID; c++){
        const o = c*4;
        const m = Math.min(1, W.M[c] / 3.2);
        dm[o] = 64; dm[o+1] = 138; dm[o+2] = 205;
        dm[o+3] = Math.round(82 * m);
        const dens = Math.min(1, W.bB[c] / 200);
        if (dens <= 0.01){ d[o+3] = 0; continue; }
        const t = Math.sqrt(dens); // fast rise, then saturate
        if (matLocus && cellGn[c]){ // sparse [96,205,150] -> dense [34,123,78], both turned by the cell's mean genotype
          const gm = cellG[c] / cellGn[c];
          const lo = tintRgb([96,205,150], gm), hi = tintRgb([34,123,78], gm);
          d[o]   = Math.round(lo[0] + (hi[0]-lo[0])*t);
          d[o+1] = Math.round(lo[1] + (hi[1]-lo[1])*t);
          d[o+2] = Math.round(lo[2] + (hi[2]-lo[2])*t);
        } else {
          d[o]   = Math.round(96 - 62*t);   // r: 96 -> 34
          d[o+1] = Math.round(205 - 82*t);  // g: 205 -> 123
          d[o+2] = Math.round(150 - 72*t);  // b: 150 -> 78
        }
        d[o+3] = Math.round(70 + 150*t);  // alpha: sparse faint -> dense solid
      }
      mcx.putImageData(mcImg, 0, 0);
      mnx.putImageData(mnImg, 0, 0);
      corpseMass.fill(0);
      for (let k = 0; k < W.cN; k++){
        if (!W.cAlive[k]) continue;
        const cc = (Math.floor(W.cY[k]/(P.WORLD/P.GRID))&(P.GRID-1))*P.GRID + (Math.floor(W.cX[k]/(P.WORLD/P.GRID))&(P.GRID-1));
        corpseMass[cc] += W.cE[k] + W.cP[k] + W.cM[k];
      }
      const dc = ccImg.data;
      for (let c = 0; c < P.GRID*P.GRID; c++){
        const o = c*4;
        dc[o]=158; dc[o+1]=168; dc[o+2]=178;
        dc[o+3] = Math.min(150, Math.round(corpseMass[c] * 4));
      }
      ccx.putImageData(ccImg, 0, 0);
    };

    // selection + follow-cam
    const sel = { i: -1, gen: 0 };
    const selValid = () => sel.i >= 0 && W.alive[sel.i] && W.gen[sel.i] === sel.gen;
    let follow = false;
    const SPECIES = SPECIES_META;
    const stateOf = i => W.cy[i] ? "Dormant (cyst)"
      : W.sp[i]===0 ? "Photosynthesizing"
      : W.bst[i]>0 ? "Striking"
      : W.sp[i]===3 ? "Decomposing"
      : W.sp[i]===1 ? "Drifting"
      : W.handle[i]>0 ? "Digesting"
      : W.en[i] < TRAITS[W.sp[i]].torpor*P.capMul*W.sz[i] ? "Torpid" : "Foraging";
    const buildCard = () => {
      if (!selValid()) return null;
      const i = sel.i, spc = SPECIES[W.sp[i]], T = TRAITS[W.sp[i]];
      const cap = P.capMul*W.sz[i], pQ = P.pQuota*W.sz[i], mQ = P.mQuota*T.mQm*W.sz[i];
      // Liebig analysis: which division gate binds right now?
      const fE = W.en[i] / (T.reproFrac*cap);
      const fP = W.pr[i] / (P.pReproMin*pQ);
      const fM = W.mn[i] / (P.mReproMin*mQ);
      let badge, bind;
      if (W.cy[i]){ badge = "Dormant"; bind = 0; }
      else {
        const gates = [["Energy-limited", fE], ["Protein-limited", fP], ["Mineral-limited", fM]];
        gates.sort((a,b) => a[1]-b[1]);
        bind = Math.min(1, gates[0][1]);
        badge = gates[0][1] >= 1
          ? ((T.reproCooldown && W.cd[i] > 0) ? "Maturing" : "Ready to divide")
          : gates[0][0];
      }
      // ancestry line (5.3): lineage generation, and the locus expressed as % change vs the founder
      let heredity = null;
      if (T.locus){
        const L = T.locus, g = W.g[i];
        const parts = [];
        if (L.escSlope && T.escape) parts.push([L.hiTrait, Math.round(100 * L.escSlope*(g - L.g0) / T.escape.p)]);
        if (L.catchSlope) parts.push([L.hiTrait, Math.round(100 * L.catchSlope*(g - L.g0))]);
        if (L.kpSlope) parts.push([L.loTrait, Math.round(100 * L.kpSlope*(L.g0 - g))]);
        if (L.kbSlope) parts.push([L.loTrait, Math.round(-100 * L.kbSlope*(g - L.g0))]);
        if (L.lightSlope){ parts.push([L.hiTrait, Math.round(100 * L.lightSlope*(g - L.g0))]);
                           parts.push([L.loTrait, Math.round(-100 * L.lightSlope*(g - L.g0))]); }
        heredity = { label: L.label, g, g0: L.g0, hiWord: L.hiWord, loWord: L.loWord, parts };
      }
      return { name: spc.name, role: spc.role, rgb: spc.rgb, id: `${i}·${W.gen[i]}`,
        age: Math.floor((W.tick - W.birth[i]) / 10), state: stateOf(i),
        en: W.en[i], cap, pr: W.pr[i], pQ, mn: W.mn[i], mQ, size: W.sz[i],
        badge, bind, lineage: W.lg[i], heredity, sp: W.sp[i] };
    };
    const clearChips = () => { clearTimeout(chipTimer); setUi(u => (u.chips ? { ...u, chips: null } : u)); };
    const selectIndex = i => {
      sel.i = i; sel.gen = W.gen[i]; follow = true;
      clearTimeout(chipTimer);
      setUi(u => ({ ...u, card: buildCard(), chips: null })); setDetent(0);
    };
    const doSelect = (cxp, cyp, tight) => {
      const wxp = wrap(cam.x + (cxp - vw/2)/cam.z), wyp = wrap(cam.y + (cyp - vh/2)/cam.z);
      const rad = tight ? Math.max(10/cam.z, 7) : Math.max(24/cam.z, 14);
      const cand = [];
      for (let i=0;i<W.n;i++){
        if (!W.alive[i]) continue;
        const dx = wd(W.x[i]-wxp), dy = wd(W.y[i]-wyp), d2 = dx*dx+dy*dy;
        if (d2 < rad*rad) cand.push([d2, i]);
      }
      if (!cand.length){ sel.i = -1; follow = false;
        clearTimeout(chipTimer); setUi(u => ({ ...u, card: null, chips: null })); return; }
      cand.sort((a,b) => a[0]-b[0]);
      const species = new Set(cand.map(c => W.sp[c[1]]));
      // Same-species neighbors are interchangeable for inspection -> take nearest.
      // Chips appear only for true ambiguity: multiple SPECIES under the thumb.
      if (tight || species.size === 1){ selectIndex(cand[0][1]); return; }
      const opts = [];
      for (const s2 of species){
        const first = cand.find(c => W.sp[c[1]] === s2);
        opts.push({ i: first[1], gen: W.gen[first[1]], sp: s2 });
        if (opts.length === 3) break;
      }
      clearTimeout(chipTimer);
      chipTimer = setTimeout(clearChips, 4000);
      setUi(u => ({ ...u, chips: { x: cxp, y: cyp, opts } }));
    };

    let mode = "observe";      // gesture routing: observe = pan/select, intervene = tool
    let sunDrag = null;         // indirect sun drag accumulator + undo origin
    let loupe = null;           // magnifier: {x,y} in screen coords while long-pressing
    let chipTimer = 0;
    const LP = document.createElement("canvas"); LP.width = LP.height = Math.round(128 * dpr);
    const lpx = LP.getContext("2d");
    // interventions: feed / kill on the selected specimen, each with 5 s undo
    let undoAction = null, undoTimer = 0;
    const pours = []; // transient amber rings marking mineral pours
    const logIv = (type) => { W.evLog.push({ tick: W.tick, type }); if (W.evLog.length > 300) W.evLog.shift(); };
    const pushUndo = (label, fn) => {
      clearTimeout(undoTimer); undoAction = fn; setUndoChip(label);
      undoTimer = setTimeout(() => { undoAction = null; setUndoChip(null); }, 5000);
    };
    actionsRef.current = {
      stepOnce: () => { W.px.set(W.x); W.py.set(W.y); step(); },
      feed: () => {
        if (!selValid()) return;
        const i = sel.i, g = W.gen[i], nm = SPECIES[W.sp[i]].name;
        logIv("feed");
        queueEvent({ type:"feed", i, gen:g, frac:0.35, done: delta => {
          pushUndo(`Fed ${nm} · Undo`, () => { logIv("undo"); queueEvent({ type:"unfeed", i, gen:g, delta }); });
        }});
      },
      kill: () => {
        if (!selValid()) return;
        const i = sel.i, g = W.gen[i], nm = SPECIES[W.sp[i]].name;
        sel.i = -1; follow = false; setUi(u => ({ ...u, card: null }));
        logIv("kill");
        queueEvent({ type:"kill", i, gen:g, done: snap => {
          pushUndo(`Killed ${nm} · Undo`, () => { logIv("undo"); queueEvent({ type:"revive", snap }); });
        }});
      },
      setMode: m => { mode = m; if (m === "intervene") follow = false; },
      pick: (i, g) => { if (W.alive[i] && W.gen[i] === g) selectIndex(i); else clearChips(); },
      undo: () => {
        if (undoAction){ undoAction(); undoAction = null; }
        clearTimeout(undoTimer); setUndoChip(null);
      },
      pushUndoExt: (label, fn) => pushUndo(label, fn),
      reset: () => {
        resetWorld(); initWorld((Math.random()*1e9)|0);
        sel.i = -1; follow = false; undoAction = null; clearTimeout(undoTimer); setUndoChip(null);
        cam.x = W.sun.x; cam.y = W.sun.y;
        setUi(us => ({ ...us, card: null, chips: [], spawnPick: null, tick: 0,
          mineral: { b:0, f:0, l:0, add:0 }, lightMul: 1 }));
      },
      seedAt: (sp, wx, wy, sx, sy) => {
        const nm = SPECIES_META[sp].name;
        pours.push({ sx, sy, t: performance.now() });
        logIv("seed");
        queueEvent({ type:"spawnPack", sp, x: wx, y: wy, done: snap => {
          pushUndo(`Seeded ${nm} · Undo`, () => { logIv("undo"); queueEvent({ type:"unspawnPack", snap }); });
        }});
        setUi(us => ({ ...us, spawnPick: null }));
      },
    };

    // gestures: tap = select, 1-finger drag = pan, 2-finger pinch = zoom (always), wheel = zoom
    const pointers = new Map();
    let pinch = null;
    const onDown = e => { canvas.setPointerCapture(e.pointerId);
      const pp = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY,
        t: performance.now(), moved: false, louping: false, lt: null };
      pointers.set(e.pointerId, pp);
      if (mode === "intervene" && pointers.size === 1)
        sunDrag = { x: W.sun.x, y: W.sun.y, ox: W.sun.x, oy: W.sun.y };
      if (mode === "observe" && pointers.size === 1){
        pp.lt = setTimeout(() => { pp.lt = null;
          if (pointers.size === 1 && !pp.moved){ pp.louping = true; loupe = { x: pp.x, y: pp.y }; }
        }, 450);
      }
      if (pointers.size === 2) {
        const [a,b]=[...pointers.values()];
        a.moved = b.moved = true;
        for (const q of [a,b]){ if (q.lt){ clearTimeout(q.lt); q.lt = null; } q.louping = false; }
        loupe = null;
        pinch = { d: Math.hypot(a.x-b.x, a.y-b.y), z: cam.z };
      } };
    const onMove = e => {
      const p = pointers.get(e.pointerId); if (!p) return;
      const nx = e.clientX, ny = e.clientY;
      if (!p.moved && Math.hypot(nx-p.sx, ny-p.sy) > 8){
        p.moved = true;
        if (p.lt){ clearTimeout(p.lt); p.lt = null; } // movement before 450ms => it's a pan, not a loupe
        clearChips();
      }
      if (pointers.size === 1){
        if (p.louping){
          if (loupe){ loupe.x = nx; loupe.y = ny; } // loupe follows the finger; camera stays put
        } else if (p.moved){
          if (mode === "intervene" && sunDrag){
            // indirect sun drag: move by the finger's delta, from anywhere on screen
            sunDrag.x += (nx - p.x) / cam.z; sunDrag.y += (ny - p.y) / cam.z;
            queueEvent({ type:"sun", x: sunDrag.x, y: sunDrag.y });
          } else if (mode === "observe"){
            follow = false;
            cam.x = wrap(cam.x - (nx - p.x) / cam.z); cam.y = wrap(cam.y - (ny - p.y) / cam.z);
          }
        }
      } else if (pointers.size === 2 && pinch){
        p.x = nx; p.y = ny;
        const [a,b]=[...pointers.values()];
        cam.z = clampZ(pinch.z * Math.hypot(a.x-b.x, a.y-b.y) / pinch.d);
      }
      p.x = nx; p.y = ny;
    };
    const onUp = e => {
      const p = pointers.get(e.pointerId);
      const wasPinch = pointers.size >= 2;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (p && p.lt) clearTimeout(p.lt);
      if (p && p.louping){ loupe = null; doSelect(p.x, p.y, true); return; } // precision pick at loupe center
      if (mode === "intervene"){
        if (p && p.moved && sunDrag && pointers.size === 0){
          const { ox, oy } = sunDrag;
          logIv("sun");
          pushUndo("Moved the sun · Undo", () => { logIv("undo"); queueEvent({ type:"sun", x: ox, y: oy }); });
        } else if (p && !p.moved && !wasPinch && pointers.size === 0 && performance.now() - p.t >= 350){
          const wx2 = wrap(cam.x + (p.sx - vw/2)/cam.z), wy2 = wrap(cam.y + (p.sy - vh/2)/cam.z);
          setUi(us => ({ ...us, spawnPick: { sx: p.sx, sy: p.sy, x: wx2, y: wy2 } }));
        } else if (p && !p.moved && !wasPinch && pointers.size === 0 && performance.now() - p.t < 350){
          // fertilize pulse: tap open water to pour mineral there
          const fx = wrap(cam.x + (p.sx - vw/2)/cam.z), fy = wrap(cam.y + (p.sy - vh/2)/cam.z);
          pours.push({ sx: p.sx, sy: p.sy, t: performance.now() });
          logIv("pour");
          queueEvent({ type:"fertilize", x: fx, y: fy, amount: 40, done: snap => {
            pushUndo("Poured mineral · Undo", () => { logIv("undo"); queueEvent({ type:"unfertilize", snap }); });
          }});
        }
        if (pointers.size === 0) sunDrag = null;
        return; // no tap-select while a tool is armed
      }
      if (p && !p.moved && !wasPinch && performance.now() - p.t < 350) doSelect(p.sx, p.sy);
    };
    const onWheel = e => { e.preventDefault(); cam.z = clampZ(cam.z * (e.deltaY < 0 ? 1.12 : 0.89)); };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // main loop: fixed 10 Hz sim, interpolated render
    let raf = 0, last = performance.now(), acc = 0, frames = 0, fpsT = last, fps = 0, uiT = 0;
    const loop = now => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(120, now - last); last = now;
      const spd = speedRef.current;
      if (spd > 0) acc += dt * spd;
      const maxSteps = spd >= 16 ? 9 : spd >= 4 ? 5 : 3;
      let steps = 0;
      while (acc >= P.TICK_MS && steps < maxSteps){
        W.px.set(W.x); W.py.set(W.y);
        step(); acc -= P.TICK_MS; steps++;
      }
      if (steps === maxSteps) acc = 0; // shed backlog: slow-motion, never death-spiral
      const alpha = spd === 0 ? 1 : Math.min(1, acc / P.TICK_MS);
      if (spd === 0) drainEvents(); // interventions apply even while paused
      if (W.lightDirty){ drawLight(); W.lightDirty = false; }

      // follow-cam: ease toward the selected organism
      if (follow && selValid()){
        const si = sel.i;
        const tx = W.px[si] + wd(W.x[si]-W.px[si])*alpha, ty = W.py[si] + wd(W.y[si]-W.py[si])*alpha;
        cam.x = wrap(cam.x + wd(tx - cam.x)*0.10); cam.y = wrap(cam.y + wd(ty - cam.y)*0.10);
      }

      // ---- render ----
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = COL.abyss; ctx.fillRect(0, 0, vw, vh);
      const z = cam.z, hw = vw/2, hh = vh/2, k = P.WORLD/512;
      // tiled light layer
      const tlx = cam.x - hw/z, tly = cam.y - hh/z;
      for (let ky = Math.floor(tly/P.WORLD); (ky*P.WORLD) < tly + vh/z; ky++)
        for (let kx = Math.floor(tlx/P.WORLD); (kx*P.WORLD) < tlx + vw/z; kx++)
          ctx.drawImage(LB, (kx*P.WORLD - cam.x)*z + hw, (ky*P.WORLD - cam.y)*z + hh, P.WORLD*z, P.WORLD*z);
      // dissolved mineral (below life), then mat carpet (aggregate sessile producers)
      updateCarpet();
      ctx.imageSmoothingEnabled = true;
      for (let ky = Math.floor(tly/P.WORLD); (ky*P.WORLD) < tly + vh/z; ky++)
        for (let kx = Math.floor(tlx/P.WORLD); (kx*P.WORLD) < tlx + vw/z; kx++){
          const dx0 = (kx*P.WORLD - cam.x)*z + hw, dy0 = (ky*P.WORLD - cam.y)*z + hh;
          ctx.drawImage(MN, dx0, dy0, P.WORLD*z, P.WORLD*z);
          if (!hiddenRef.current[0]) ctx.drawImage(MC, dx0, dy0, P.WORLD*z, P.WORLD*z);
          if (z < LOD_Z && !hiddenRef.current[7]) ctx.drawImage(CC, dx0, dy0, P.WORLD*z, P.WORLD*z);
        }
      // organisms: saturating "screen" composition instead of unbounded addition
      ctx.globalCompositeOperation = "screen";
      const cull = 40;
      const pops = [0,0,0,0,0,0,0];
      let mnBound = 0;
      for (let i=0;i<W.n;i++){
        if (!W.alive[i]) continue;
        pops[W.sp[i]]++;
        mnBound += W.mn[i];
        if (hiddenRef.current[W.sp[i]]) continue; // hidden from view, still counted
        const ix = W.px[i] + wd(W.x[i]-W.px[i])*alpha;
        const iy = W.py[i] + wd(W.y[i]-W.py[i])*alpha;
        const sx = hw + wd(ix - cam.x)*z, sy = hh + wd(iy - cam.y)*z;
        if (sx < -cull || sx > vw+cull || sy < -cull || sy > vh+cull) continue;
        if (W.cy[i]){ // dormant cyst: dim ember, no glow
          ctx.globalCompositeOperation = "source-over";
          ctx.fillStyle = "rgba(120,135,150,0.5)";
          ctx.beginPath(); ctx.arc(sx, sy, Math.max(1, W.sz[i]*0.5*z), 0, 6.283); ctx.fill();
          ctx.globalCompositeOperation = "screen";
          continue;
        }
        const spb = W.sp[i];
        if (spb === 3 && z < LOD_Z){ // bacteria dot-LOD: batched rects instead of sprite blits
          ctx.fillStyle = "rgba(196,206,150,0.8)";
          ctx.fillRect(sx-1.1, sy-1.1, 2.2, 2.2);
          continue;
        }
        const r = (spb===0 ? W.sz[i]*1.1 : spb===1 ? W.sz[i]*1.9 : spb===3 ? W.sz[i]*1.6 : spb===6 ? W.sz[i]*1.0 : W.sz[i]*2.2) * z;
        const spr = tints[spb] ? tints[spb][Math.max(0, Math.min(TINT_BINS-1, Math.round(W.g[i]*(TINT_BINS-1))))] : sprites[spb];
        if (spb === 2){
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(W.hd[i]);
          ctx.drawImage(spr, -r, -r, r*2, r*2); ctx.restore();
        } else if (spb === 6){
          drawGhostRay(ctx, sx, sy, W.hd[i], r, W.bst[i] > 0, null);
        } else {
          ctx.drawImage(spr, sx-r, sy-r, r*2, r*2);
        }
      }
      ctx.globalCompositeOperation = "source-over";
      // amber pour rings: the hand's touch, fading
      const nowT = performance.now();
      for (let q = pours.length-1; q >= 0; q--){
        const age = (nowT - pours[q].t) / 700;
        if (age >= 1){ pours.splice(q,1); continue; }
        ctx.strokeStyle = `rgba(242,178,74,${(0.7*(1-age)).toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(pours[q].sx, pours[q].sy, 10 + age*34, 0, 6.283); ctx.stroke();
      }
      // corpses: pale husks when zoomed in; the aggregate layer covers zoomed-out
      if (z >= LOD_Z && !hiddenRef.current[7]) for (let k = 0; k < W.cN; k++){
        if (!W.cAlive[k]) continue;
        const sx = hw + wd(W.cX[k] - cam.x)*z, sy = hh + wd(W.cY[k] - cam.y)*z;
        if (sx < -cull || sx > vw+cull || sy < -cull || sy > vh+cull) continue;
        const mass = W.cE[k] + W.cP[k] + W.cM[k];
        const a = Math.min(0.55, 0.12 + 0.05*mass/W.cSz[k]);
        const r = Math.max(1.5, W.cSz[k]*1.0*z);
        ctx.fillStyle = `rgba(158,168,178,${a.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, 6.283); ctx.fill();
        ctx.strokeStyle = `rgba(110,120,130,${(a*0.8).toFixed(3)})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(sx, sy, r*0.55, 0, 6.283); ctx.stroke();
      }
      W.pops = pops;

      // sun affordance while the sun tool is armed
      if (mode === "intervene"){
        const ssx = hw + wd(W.sun.x - cam.x)*z, ssy = hh + wd(W.sun.y - cam.y)*z;
        ctx.strokeStyle = "rgba(242,178,74,0.9)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(ssx, ssy, 16, 0, 6.283); ctx.stroke();
        ctx.strokeStyle = "rgba(242,178,74,0.3)"; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(ssx, ssy, 22, 0, 6.283); ctx.stroke();
      }
      // selection ring (non-additive, drawn above organisms)
      if (selValid()){
        const si = sel.i;
        const ix = W.px[si] + wd(W.x[si]-W.px[si])*alpha, iy = W.py[si] + wd(W.y[si]-W.py[si])*alpha;
        const sx = hw + wd(ix - cam.x)*z, sy = hh + wd(iy - cam.y)*z;
        const rr = Math.max(14, W.sz[si]*2.6*z);
        ctx.strokeStyle = "rgba(201,215,227,0.95)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx, sy, rr, 0, 6.283); ctx.stroke();
        ctx.strokeStyle = "rgba(201,215,227,0.25)"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(sx, sy, rr + 4, 0, 6.283); ctx.stroke();
      } else if (sel.i >= 0){ // selected organism died or slot was recycled
        sel.i = -1; follow = false; setUi(u => ({ ...u, card: null }));
      }

      if (loupe){
        const R = 64, m = 2.5, sr = R/m;
        const cxL = Math.min(vw - R - 8, Math.max(R + 8, loupe.x));
        const cyL = Math.max(R + 72, loupe.y - 112);
        lpx.clearRect(0, 0, LP.width, LP.height);
        lpx.drawImage(canvas, (loupe.x - sr)*dpr, (loupe.y - sr)*dpr, sr*2*dpr, sr*2*dpr, 0, 0, LP.width, LP.height);
        ctx.strokeStyle = "rgba(201,215,227,0.25)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(loupe.x, loupe.y - 12); ctx.lineTo(cxL, cyL + R); ctx.stroke();
        ctx.save();
        ctx.beginPath(); ctx.arc(cxL, cyL, R, 0, 6.283); ctx.clip();
        ctx.drawImage(LP, cxL - R, cyL - R, R*2, R*2);
        ctx.restore();
        ctx.strokeStyle = "rgba(201,215,227,0.8)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cxL, cyL, R, 0, 6.283); ctx.stroke();
        ctx.fillStyle = "rgba(242,178,74,0.95)";
        ctx.beginPath(); ctx.arc(cxL, cyL, 2.2, 0, 6.283); ctx.fill();
      }

      frames++;
      if (now - fpsT > 500){ fps = Math.round(frames*1000/(now-fpsT)); frames = 0; fpsT = now; }
      if (now - uiT > 500){ uiT = now;
        let mFree = 0, mLocked = 0; const MF = W.M, DM = W.dM;
        for (let c = 0; c < MF.length; c++){ mFree += MF[c]; mLocked += DM[c]; }
        let corpses = 0;
        for (let k = 0; k < W.cN; k++) if (W.cAlive[k]){ mLocked += W.cM[k]; corpses++; }
        setUi(u => ({ ...u, tick: W.tick, fps, pops: [...pops], corpses, card: buildCard(),
          mineral: { b: mnBound, f: mFree, l: mLocked, add: W.addedM }, lightMul: P.lightMul }));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); clearTimeout(undoTimer); clearTimeout(chipTimer); window.removeEventListener("resize", resize);
      if (ro) ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel); };
  }, []);

  // speed FAB: tap cycles 1x -> 4x -> 16x -> paused; long-press = pause + single-tick step
  const cycleSpeed = () => {
    const order = [1, 4, 16, 0];
    const nxt = order[(order.indexOf(speedRef.current) + 1) % order.length];
    speedRef.current = nxt; setUi(u => ({ ...u, speed: nxt }));
  };
  const fabDown = () => {
    fabLong.current = setTimeout(() => {
      fabLong.current = "fired";
      speedRef.current = 0; setUi(u => ({ ...u, speed: 0 }));
      actionsRef.current.stepOnce && actionsRef.current.stepOnce();
    }, 450);
  };
  const fabUp = () => {
    if (fabLong.current === "fired"){ fabLong.current = null; return; }
    clearTimeout(fabLong.current); fabLong.current = null;
    cycleSpeed();
  };

  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
  const vp = useViewport();
  const desktop = vp.desktop;
  // On desktop the world keeps the stage and detail docks beside it, so you can
  // watch the pond and read the instruments at the same time — the whole point
  // of an observatory. On mobile nothing changes: sheet over world, as before.
  const panelKind = !desktop ? null : uiMode === "data" ? "data" : ui.card ? "card" : null;
  const panelW = panelKind === "data" ? LAYOUT.panelData
               : panelKind === "card" ? LAYOUT.panelCard : 0;

  // Keyboard: desktop affordance only. Touch never fires these, and every action
  // remains reachable by pointer, so this adds reach without removing any.
  React.useEffect(() => {
    const onKey = e => {
      const el = e.target;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const setSpeed = v => { speedRef.current = v; setUi(u => ({ ...u, speed: v })); };
      const k = e.key;
      if (k === " "){ e.preventDefault(); setSpeed(speedRef.current === 0 ? 1 : 0); }
      else if (k === "1") setSpeed(1);
      else if (k === "2") setSpeed(4);
      else if (k === "3") setSpeed(16);
      else if (k === "." ){ setSpeed(0); actionsRef.current.stepOnce && actionsRef.current.stepOnce(); }
      else if (k === "o" || k === "O"){ setUiMode("observe"); actionsRef.current.setMode && actionsRef.current.setMode("observe"); }
      else if (k === "i" || k === "I"){ setUiMode("intervene"); actionsRef.current.setMode && actionsRef.current.setMode("intervene"); }
      else if (k === "d" || k === "D"){ setUiMode(m => { const n = m === "data" ? "observe" : "data"; actionsRef.current.setMode && actionsRef.current.setMode(n); return n; }); }
      else if (k === "z" || k === "Z"){ actionsRef.current.undo && actionsRef.current.undo(); }
      else if (k === "Escape"){
        setUi(u => u.spawnPick ? { ...u, spawnPick: null } : { ...u, card: null });
        setUiMode(m => { if (m === "data"){ actionsRef.current.setMode && actionsRef.current.setMode("observe"); return "observe"; } return m; });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div onContextMenu={e => e.preventDefault()}
      style={{ position:"fixed", inset:0, background:COL.abyss, overflow:"hidden",
      fontFamily:"system-ui, -apple-system, sans-serif", userSelect:"none", WebkitUserSelect:"none",
      WebkitTouchCallout:"none" }}>
      <UiStyles />
      {/* stage: the world and everything overlaid on it. Insetting this by the
          panel width is what keeps every absolutely-placed control correct — no
          per-element offset maths anywhere below. */}
      <div style={{ position:"absolute", top:0, left:0, bottom:0, right:panelW,
        transition:"right 0.2s ease" }}>
      <canvas ref={canvasRef} style={{ width:"100%", height:"100%", display:"block",
        touchAction:"none", cursor: uiMode === "intervene" ? "crosshair" : "grab" }} />
      {/* passive status strip */}
      <div style={{ position:"absolute", top:0, left:0, right:0, padding:"calc(env(safe-area-inset-top, 0px) + 10px) 14px 8px",
        display:"flex", justifyContent:"space-between", alignItems:"baseline", pointerEvents:"none", paddingRight:18,
        color:COL.silt, fontSize:12, fontFamily:mono, textShadow:"0 1px 3px rgba(0,0,0,0.8)" }}>
        <span>t {String(ui.tick).padStart(6," ")}  ·  {ui.fps} fps</span>
        {/* species counts double as view toggles: click to hide a species from the world, click again to show */}
        <span style={{ pointerEvents:"auto", display:"inline-flex", gap:10 }}>
          {[[0,"●"],[1,"●"],[2,"▲"],[3,"▪"],[6,"△"],[7,"◌"]].map(([sp, glyph]) => {
            const debris = sp === 7, c = debris ? [158,168,178] : SPECIES_META[sp].rgb, name = debris ? "debris" : SPECIES_META[sp].name;
            return (
            <button key={sp} className="mc-tab"
              onClick={() => setHidden(h => h.map((v, k) => k === sp ? !v : v))}
              title={(hidden[sp] ? "Show " : "Hide ") + name}
              style={{ background:"transparent", border:"none", padding:"2px 3px", cursor:"pointer", font:"inherit",
                color: sp === 6 ? "rgb(230,240,250)" : `rgb(${c[0]},${c[1]},${c[2]})`,
                opacity: hidden[sp] ? 0.32 : 1, textDecoration: hidden[sp] ? "line-through" : "none",
                textShadow:"0 1px 3px rgba(0,0,0,0.8)" }}>
              {glyph} {debris ? (ui.corpses || 0) : ui.pops[sp]}
            </button> ); })}
        </span>
      </div>
      {/* mineral audit: bound (in biomass) vs free (dissolved) — the sum is conserved */}
      <div style={{ position:"absolute", top:"calc(env(safe-area-inset-top, 0px) + 34px)", right:18,
        display:"flex", alignItems:"center", gap:8, pointerEvents:"none",
        color:COL.silt, fontSize:11, fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",
        textShadow:"0 1px 3px rgba(0,0,0,0.8)" }}>
        <span>M</span>
        <span style={{ display:"inline-flex", width:96, height:4, borderRadius:2, overflow:"hidden",
          background:"rgba(11,19,30,0.7)" }}>
          <span style={{ width:`${Math.round(100*ui.mineral.b/Math.max(1, ui.mineral.b+ui.mineral.l+ui.mineral.f))}%`,
            background:"rgba(70,214,140,0.85)" }} />
          <span style={{ width:`${Math.round(100*ui.mineral.l/Math.max(1, ui.mineral.b+ui.mineral.l+ui.mineral.f))}%`,
            background:"rgba(158,168,178,0.65)" }} />
          <span style={{ flex:1, background:"rgba(91,200,232,0.4)" }} />
        </span>
        <span>{(ui.mineral.b/1000).toFixed(1)}k bound · {(ui.mineral.l/1000).toFixed(1)}k locked · {(ui.mineral.f/1000).toFixed(1)}k free</span>
        {ui.mineral.add > 0.5 && <span style={{ color:"#F2B24A" }}> +{ui.mineral.add < 950 ? Math.round(ui.mineral.add) : (ui.mineral.add/1000).toFixed(1)+"k"}</span>}
      </div>
      {/* intervene edge tint: unmistakable "you are editing the world" signal */}
      {uiMode === "intervene" && (
        <div style={{ position:"absolute", inset:0, pointerEvents:"none",
          boxShadow:"inset 0 0 46px rgba(242,178,74,0.32)" }} />
      )}
      {/* mode switch + tool hint */}
      <div style={{ position:"absolute", left:16, zIndex:6,
        bottom: (ui.card && !desktop) ? 194 : "calc(env(safe-area-inset-bottom, 0px) + 20px)",
        transition:"bottom 0.25s",
        display:"flex", flexDirection:"column", gap:8, alignItems:"flex-start" }}>

        <div style={{ display:"flex", gap:6, padding:4, borderRadius:14,
          background:"rgba(21,34,51,0.85)", border:"1px solid rgba(94,115,134,0.3)",
          backdropFilter:"blur(6px)" }}>
          {["observe","intervene","data"].map(m => (
            <button key={m}
              onClick={() => { setUiMode(m); actionsRef.current.setMode && actionsRef.current.setMode(m); }}
              style={{ height:40, padding:"0 16px", borderRadius:10, cursor:"pointer",
                fontSize:13, fontWeight:600, textTransform:"capitalize",
                border: m==="intervene" && uiMode===m ? "1px solid rgba(242,178,74,0.8)" : "1px solid transparent",
                background: uiMode===m
                  ? (m==="intervene" ? "rgba(242,178,74,0.18)" : "rgba(201,215,227,0.14)")
                  : "transparent",
                color: uiMode===m ? (m==="intervene" ? "#F2B24A" : "#C9D7E3") : "#5E7386" }}>
              {m}
            </button>
          ))}
        </div>
      </div>
      {uiMode === "data" && !desktop && <DataMode />}
      <ResetButton onReset={() => actionsRef.current.reset && actionsRef.current.reset()} card={!!ui.card && !desktop} />
      {/* sun-intensity press lever (intervene mode) */}
      {uiMode === "intervene" && (
        <div style={{ position:"absolute", top:64, left:"50%", transform:"translateX(-50%)",
          padding:"6px 12px", borderRadius:12,
          background:"rgba(11,19,30,0.72)", border:"1px solid rgba(242,178,74,0.35)", zIndex:5 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ color:"#F2B24A", fontSize:11, fontFamily:"ui-monospace, Menlo, monospace" }}>
            ☀ ×{ui.lightMul.toFixed(2)}</span>
          <input type="range" min="0.4" max="1.6" step="0.05" value={ui.lightMul}
            onChange={e => { const v = +e.target.value;
              setUi(u2 => ({ ...u2, lightMul: v }));
              queueEvent({ type:"lightMul", v, done: s => {
                if (Math.abs(s.prev - v) > 0.24) W.evLog.push({ tick: W.tick, type: "sunlight" });
                if (Math.abs(s.prev - v) > 0.24)
                  actionsRef.current.pushUndoExt && actionsRef.current.pushUndoExt("Changed the sun · Undo",
                    () => queueEvent({ type:"lightMul", v: s.prev }));
              }});
            }}
            style={{ width: 130, accentColor: "#F2B24A" }} />
          </div>
          <div style={{ fontSize:10, color:"rgba(242,178,74,0.75)", marginTop:4 }}>
            drag → sun · tap water → pour · hold → seed organisms</div>
        </div>
      )}
      {ui.spawnPick && (
        <div style={{ position:"absolute", zIndex:7,
          left: Math.min(Math.max(8, ui.spawnPick.sx - 130), Math.max(8, vp.vw - panelW - 268)),
          top: Math.max(96, ui.spawnPick.sy - 76),
          display:"flex", gap:6, padding:8, borderRadius:14,
          background:"rgba(11,19,30,0.94)", border:"1px solid rgba(242,178,74,0.45)" }}>
          {[0,1,2,3,6].map(sp => { const c = SPECIES_META[sp].rgb; return (
            <button key={sp}
              onClick={() => actionsRef.current.seedAt(sp, ui.spawnPick.x, ui.spawnPick.y, ui.spawnPick.sx, ui.spawnPick.sy)}
              style={{ padding:"7px 9px", borderRadius:10, fontSize:11, border:"none",
                background:"rgba(21,34,51,0.95)", color:`rgb(${c[0]},${c[1]},${c[2]})`,
                fontFamily:"ui-monospace, Menlo, monospace" }}>
              ● {SPECIES_META[sp].name}</button> ); })}
          <button onClick={() => setUi(us => ({ ...us, spawnPick: null }))}
            style={{ padding:"7px 8px", borderRadius:10, fontSize:11, border:"none",
              background:"transparent", color:"#5E7386" }}>✕</button>
        </div>
      )}
      {/* species disambiguation chips */}
      {ui.chips && (
        <div style={{ position:"absolute", left:0, top:0,
          transform:`translate(${ui.chips.x}px, ${ui.chips.y - 80}px) translateX(-50%)`,
          display:"flex", gap:6, padding:5, borderRadius:14,
          background:"rgba(21,34,51,0.95)", border:"1px solid rgba(94,115,134,0.4)",
          boxShadow:"0 2px 12px rgba(0,0,0,0.5)" }}>
          {ui.chips.opts.map(o => { const spc = SPECIES_META[o.sp]; return (
            <button key={o.sp}
              onClick={() => actionsRef.current.pick && actionsRef.current.pick(o.i, o.gen)}
              style={{ height:40, padding:"0 13px", borderRadius:10, cursor:"pointer",
                display:"flex", alignItems:"center", gap:7, fontSize:13, fontWeight:600,
                border:"1px solid transparent", background:"rgba(201,215,227,0.08)", color:"#C9D7E3" }}>
              <span style={{ width:9, height:9, borderRadius:5,
                background:`rgb(${spc.rgb[0]},${spc.rgb[1]},${spc.rgb[2]})`,
                boxShadow:`0 0 6px rgb(${spc.rgb[0]},${spc.rgb[1]},${spc.rgb[2]})` }} />
              {spc.name}
            </button> ); })}
        </div>
      )}
      {/* undo chip */}
      {undoChip && (
        <button onClick={() => actionsRef.current.undo && actionsRef.current.undo()}
          style={{ position:"absolute", left:"50%", transform:"translateX(-50%)",
            bottom: (ui.card && !desktop) ? (detent===0 ? 194 : detent===1 ? "48vh" : "82vh")
                            : "calc(env(safe-area-inset-bottom, 0px) + 88px)",
            padding:"10px 18px", borderRadius:20, cursor:"pointer",
            border:"1px solid rgba(242,178,74,0.7)", background:"rgba(21,34,51,0.95)",
            color:"#F2B24A", fontSize:13, fontWeight:600, whiteSpace:"nowrap",
            boxShadow:"0 2px 12px rgba(0,0,0,0.5)" }}>
          {undoChip}
        </button>
      )}
      {/* specimen card — bottom sheet on mobile, docked panel on desktop */}
      {ui.card && !desktop && (
        <div style={{ position:"absolute", left:0, right:0, bottom:0,
          height: detent===0 ? 178 : detent===1 ? "46vh" : "80vh",
          background:"rgba(21,34,51,0.92)", backdropFilter:"blur(10px)",
          borderTop:"1px solid rgba(94,115,134,0.35)", borderRadius:"16px 16px 0 0",
          color:COL.plankTxt, transition:"height 0.18s ease-out",
          display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); dragRef.current = { y: e.clientY }; }}
            onPointerUp={e => {
              const d = dragRef.current; dragRef.current = null; if (!d) return;
              const dy = e.clientY - d.y;
              if (dy < -40) setDetent(v => Math.min(2, v+1));
              else if (dy > 40) setDetent(v => { if (v === 0){ setUi(u => ({ ...u, card: null })); return 0; } return v-1; });
            }}
            style={{ padding:"16px 0 14px", cursor:"grab", touchAction:"none", flexShrink:0 }}>
            <div style={{ width:40, height:4, borderRadius:2, background:"rgba(94,115,134,0.7)", margin:"0 auto" }} />
          </div>
          <div className="mc-scroll" style={{ padding:"0 18px calc(env(safe-area-inset-bottom, 0px) + 14px)",
            overflowY: detent===2 ? "auto" : "hidden", flex:1 }}>
            <SpecimenBody card={ui.card} tick={ui.tick} detail={detent}
              onFeed={() => actionsRef.current.feed && actionsRef.current.feed()}
              onKill={() => actionsRef.current.kill && actionsRef.current.kill()} />
          </div>
        </div>
      )}
      {/* speed control */}
      {(!ui.card || detent === 0 || desktop) && (
      <button className="mc-fab" onPointerDown={fabDown} onPointerUp={fabUp} onPointerCancel={fabUp}
        title={vp.fine ? "Space play/pause · 1 2 3 speed · . step" : undefined}
        aria-label={ui.speed === 0 ? "Play (long-press: step one tick)" : `Speed ${ui.speed}x (long-press: step one tick)`}
        style={{ position:"absolute", right:16, zIndex:6,
        bottom: (ui.card && !desktop) ? 194 : "calc(env(safe-area-inset-bottom, 0px) + 20px)",
        width:52, height:52, borderRadius:26, border:"1px solid rgba(201,215,227,0.25)",
        background:"rgba(21,34,51,0.85)", color:COL.plankTxt, fontSize:18, cursor:"pointer",
        backdropFilter:"blur(6px)" }}>
        <span style={{ fontFamily:"ui-monospace, Menlo, monospace", fontSize: ui.speed===0?18:15 }}>
          {ui.speed === 0 ? "\u25B6" : `${ui.speed}\u00D7`}
        </span>
      </button>
      )}
      {/* keyboard legend: only where a keyboard exists, and only with room for it
          between the mode switch and the speed control */}
      {desktop && vp.fine && (vp.vw - panelW) > 1020 && (
        <div style={{ position:"absolute", left:"50%", transform:"translateX(-50%)",
          bottom:"calc(env(safe-area-inset-bottom, 0px) + 26px)", pointerEvents:"none",
          display:"flex", gap:10, alignItems:"center",
          padding:"7px 12px", borderRadius:12,
          background:"rgba(21,34,51,0.72)", border:"1px solid rgba(94,115,134,0.22)",
          backdropFilter:"blur(6px)",
          color:COL.silt, fontSize:10.5, fontFamily:mono, whiteSpace:"nowrap" }}>
          <span><span className="mc-kbd">space</span> play</span>
          <span><span className="mc-kbd">1</span><span className="mc-kbd">2</span><span className="mc-kbd">3</span> speed</span>
          <span><span className="mc-kbd">.</span> step</span>
          <span><span className="mc-kbd">o</span><span className="mc-kbd">i</span><span className="mc-kbd">d</span> mode</span>
          <span><span className="mc-kbd">z</span> undo</span>
        </div>
      )}
      </div>{/* /stage */}

      {/* desktop dock: instruments beside the world instead of on top of it */}
      {desktop && panelKind && (
        <aside style={{ position:"absolute", top:0, right:0, bottom:0, width:panelW,
          background:"rgba(16,26,40,0.97)", borderLeft:"1px solid rgba(94,115,134,0.32)",
          color:COL.plankTxt, display:"flex", flexDirection:"column", overflow:"hidden", zIndex:8 }}>
          {panelKind === "card" ? (
            <>
              <div style={{ display:"flex", alignItems:"center", padding:"14px 16px 10px", flexShrink:0 }}>
                <span style={{ fontSize:11, letterSpacing:1.4, color:COL.silt, fontFamily:mono }}>SPECIMEN</span>
                <button className="mc-hit" onClick={() => setUi(u => ({ ...u, card: null }))}
                  title="Close (Esc)"
                  style={{ marginLeft:"auto", width:28, height:28, borderRadius:8, cursor:"pointer",
                    border:"1px solid rgba(94,115,134,0.3)", background:"transparent",
                    color:COL.silt, fontSize:13, lineHeight:1 }}>✕</button>
              </div>
              <div className="mc-scroll" style={{ padding:"0 16px 18px", overflowY:"auto", flex:1 }}>
                <SpecimenBody card={ui.card} tick={ui.tick} detail={2}
                  onFeed={() => actionsRef.current.feed && actionsRef.current.feed()}
                  onKill={() => actionsRef.current.kill && actionsRef.current.kill()} />
              </div>
            </>
          ) : (
            <DataMode docked />
          )}
        </aside>
      )}
    </div>
  );
}

// Specimen detail. One implementation for both layouts: the mobile sheet passes
// its detent, the desktop dock passes 2 (everything visible, nothing to drag).
function SpecimenBody({ card, tick, detail, onFeed, onKill }){
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
  if (!card) return null;
  return (
    <>
      <div style={{ display:"flex", alignItems:"baseline", gap:10 }}>
        <span style={{ width:10, height:10, borderRadius:5, flexShrink:0, alignSelf:"center",
          background:`rgb(${card.rgb[0]},${card.rgb[1]},${card.rgb[2]})`,
          boxShadow:`0 0 8px rgb(${card.rgb[0]},${card.rgb[1]},${card.rgb[2]})` }} />
        <span style={{ fontSize:17, fontWeight:600 }}>{card.name}</span>
        <span style={{ fontSize:12, color:COL.silt }}>{card.role}</span>
        <span style={{ marginLeft:"auto", fontSize:11, color:COL.silt, fontFamily:mono }}>#{card.id}</span>
      </div>
      <div style={{ display:"flex", gap:16, marginTop:8, fontSize:13, alignItems:"center", flexWrap:"wrap" }}>
        <span>{card.state}</span>
        <span style={{ color:COL.silt }}>age {Math.floor(card.age/60)}:{String(card.age%60).padStart(2,"0")}</span>
        <span style={{ marginLeft:"auto", fontSize:11, fontWeight:600, padding:"3px 9px", borderRadius:9,
          background: card.badge==="Ready to divide" ? "rgba(70,214,140,0.15)" : "rgba(94,115,134,0.22)",
          color: card.badge==="Ready to divide" ? "rgb(70,214,140)" : COL.plankTxt }}>
          {card.badge}</span>
      </div>
      <div style={{ marginTop:10, display:"grid", gap:5 }}>
        {[["E", card.en, card.cap, `rgb(${card.rgb[0]},${card.rgb[1]},${card.rgb[2]})`],
          ["P", card.pr, card.pQ, "rgb(226,170,150)"],
          ["M", card.mn, card.mQ, "rgb(91,200,232)"]].map(([lb, v, mx, col]) => (
          <div key={lb} style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:10, color:COL.silt, width:10, fontFamily:mono }}>{lb}</span>
            <div style={{ flex:1, height:4, borderRadius:2, background:"rgba(11,19,30,0.8)" }}>
              <div style={{ height:4, borderRadius:2,
                width:`${Math.min(100, Math.round(100*v/Math.max(0.001, mx)))}%`,
                background:col, transition:"width 0.4s" }} />
            </div>
          </div>
        ))}
      </div>
      {detail >= 1 && (
        <div style={{ marginTop:16, fontSize:13, display:"grid",
          gridTemplateColumns:"repeat(auto-fit, minmax(128px, 1fr))", gap:"10px 16px" }}>
          <div><div style={{fontSize:11,color:COL.silt}}>SIZE</div>{card.size.toFixed(1)}</div>
          <div><div style={{fontSize:11,color:COL.silt}}>ENERGY</div>{card.en.toFixed(1)} / {card.cap.toFixed(0)}</div>
          <div><div style={{fontSize:11,color:COL.silt}}>PROTEIN</div>{card.pr.toFixed(1)} / {card.pQ.toFixed(1)}</div>
          <div><div style={{fontSize:11,color:COL.silt}}>MINERAL</div>{card.mn.toFixed(2)} / {card.mQ.toFixed(2)}</div>
          <div><div style={{fontSize:11,color:COL.silt}}>DIVISION GATE</div>{Math.round(100*card.bind)}%</div>
          <div><div style={{fontSize:11,color:COL.silt}}>SIM TIME / TICK</div>{tick}</div>
          <div><div style={{fontSize:11,color:COL.silt}}>GENERATION</div>{card.lineage}</div>
        </div>
      )}
      {detail >= 1 && card.heredity && (
        <div style={{ marginTop:14, fontSize:12, lineHeight:1.5 }}>
          <div style={{ fontSize:11, color:COL.silt }}>{card.heredity.label.toUpperCase()} · heritable</div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:4 }}>
            <span style={{ fontFamily:mono, fontSize:12 }}>{card.heredity.g.toFixed(2)}</span>
            <div style={{ flex:1, height:4, borderRadius:2, background:"rgba(11,19,30,0.8)", position:"relative" }}>
              <div style={{ position:"absolute", left:`${card.heredity.g0*100}%`, top:-3, width:1, height:10, background:"rgba(201,215,227,0.45)" }} />
              <div style={{ position:"absolute", left:`calc(${card.heredity.g*100}% - 3px)`, top:-1, width:6, height:6, borderRadius:3,
                background:`rgb(${card.rgb[0]},${card.rgb[1]},${card.rgb[2]})` }} />
            </div>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:COL.silt, marginTop:2 }}>
            <span>{card.heredity.loWord}</span><span>{card.heredity.hiWord}</span>
          </div>
          <div style={{ marginTop:4, color:COL.silt }}>
            vs founder: {card.heredity.parts.map(([nm, pct], k) => (
              <span key={nm}>{k ? " · " : ""}<span style={{ color: pct === 0 ? COL.silt : pct > 0 ? "rgb(140,230,170)" : "rgb(226,170,150)" }}>
                {pct > 0 ? "+" : ""}{pct}%</span> {nm}</span>))}
          </div>
        </div>
      )}
      {detail >= 1 && (
        <div style={{ display:"flex", gap:10, marginTop:18 }}>
          <button className="mc-hit mc-hit-amber" onClick={onFeed}
            style={{ flex:1, height:44, borderRadius:10, cursor:"pointer",
              border:"1px solid rgba(242,178,74,0.6)", background:"rgba(242,178,74,0.12)",
              color:"#F2B24A", fontSize:14, fontWeight:600 }}>Feed</button>
          <button className="mc-hit-solid" onClick={onKill}
            style={{ flex:1, height:44, borderRadius:10, cursor:"pointer",
              border:"1px solid rgba(242,178,74,0.9)", background:"rgba(242,178,74,0.85)",
              color:"#0B131E", fontSize:14, fontWeight:600 }}>Kill</button>
        </div>
      )}
      {detail === 2 && SPECIES_PROFILE[card.sp] && (() => { const pf = SPECIES_PROFILE[card.sp]; return (
        <div style={{ marginTop:18, fontSize:12, lineHeight:1.5 }}>
          <div style={{ fontSize:11, color:COL.silt, letterSpacing:1.2 }}>PROFILE</div>
          <img src={`assets/species/${pf.key}.png`} alt="" onError={e => { e.currentTarget.style.display = "none"; }}
            style={{ display:"block", width:"100%", maxHeight:220, objectFit:"cover", borderRadius:12, marginTop:8,
              border:"1px solid rgba(94,115,134,0.3)" }} />
          <div style={{ display:"grid", gridTemplateColumns:"auto 1fr", gap:"5px 12px", marginTop:10 }}>
            {[["habitat", pf.habitat], ["behaviour", pf.behaviour], ["food", pf.food], ["eaten by", pf.eatenBy],
              ["size", pf.size], ["lifecycle", pf.lifecycle]].map(([k, v]) => (
              <React.Fragment key={k}>
                <span style={{ color:COL.silt, fontSize:10, textTransform:"uppercase", letterSpacing:0.8, paddingTop:2 }}>{k}</span>
                <span>{v}</span>
              </React.Fragment>))}
          </div>
        </div> ); })()}
      {detail === 2 && (
        <div style={{ marginTop:18, fontSize:12, color:COL.silt, lineHeight:1.5 }}>
          Amber marks your hand: everything you do to the world, as opposed to what
          nature does, is shown in this color.
        </div>
      )}
    </>
  );
}
