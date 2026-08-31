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
  sunSigma: 210, sunI: 1.0, ambient: 0.03,   // defaults for the shipped sun and for every sun the player adds (7.L)
  maxSources: 4,    // energy sources (W.sources): light i and warmth a per source; the shipped world has one sun, centred
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
    "thermo": 0
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
        "tumbleSlope": 0.5,
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
  W.vx[i]=0; W.vy[i]=0; W.en[i]=e; W.sz[i]=size; W.sp[i]=species; W.alive[i]=1;
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
// Irradiance adds: the field is the ambient floor plus one toroidal Gaussian per source's light. Draw-free.
function computeLight(){
  const S = W.sources;
  for (let gy = 0; gy < P.GRID; gy++) for (let gx = 0; gx < P.GRID; gx++){
    const cx=(gx+0.5)*CELL, cyy=(gy+0.5)*CELL;
    let v = P.ambient;
    for (let k = 0; k < S.length; k++){
      const s = S[k], dx=wd(cx-s.x), dy=wd(cyy-s.y);
      v += s.i * Math.exp(-(dx*dx+dy*dy)/(2*s.sigma*s.sigma));
    }
    W.light[gy*P.GRID+gx] = v * P.lightMul;
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
  const S = W.sources;
  for (let gy = 0; gy < P.GRID; gy++) for (let gx = 0; gx < P.GRID; gx++){
    const cx=(gx+0.5)*CELL, cyy=(gy+0.5)*CELL;
    let v = P.tempAmb;
    for (let k = 0; k < S.length; k++){
      const s = S[k]; if (s.a === 0) continue;
      const dx=wd(cx-s.x), dy=wd(cyy-s.y);
      v += s.a * Math.exp(-(dx*dx+dy*dy)/(2*s.sigma*s.sigma));
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
const IMPACT_PRESS = new Set(["source","sunlight","sourceAdd","sourceRemove","sourceSet","sourceLayout","mutation","evolution","preset"]);
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
//   5. Heredity draws one mutation kick PER LOCUS, in TRAITS[sp].loci
//      order, at every division (sigma > 0 and P.mutation only). Adding,
//      removing or reordering a species' loci is a declared ecology change.
// Modification protocol: after ANY edit to this file, run
//   `node conform.js`   (2 seeds x 3000 ticks, ~3 s)
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
    let cost = T.kb*kbG*Math.pow(W.sz[i],0.75)*W.qR[cT]*wR; // maintenance: Q10 2.5, flattened by the thermal locus
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
      W.x[i]=wrap(W.x[i]+W.vx[i]); W.y[i]=wrap(W.y[i]+W.vy[i]);
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
      W.x[i]=wrap(W.x[i]+Math.cos(W.hd[i])*T.speed*tor); W.y[i]=wrap(W.y[i]+Math.sin(W.hd[i])*T.speed*tor);
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
            W.x[target]=wrap(W.x[target]+Math.cos(ja)*TJ.escape.kick);
            W.y[target]=wrap(W.y[target]+Math.sin(ja)*TJ.escape.kick);
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
          const sgn = dT > T.topt ? -1 : 1, ta = Math.atan2(sgn*W.tgy[cT], sgn*W.tgx[cT]);
          let da=ta-W.hd[i]; while(da>Math.PI)da-=6.283; while(da<-Math.PI)da+=6.283;
          W.hd[i]+=Math.max(-T.turnRate*0.5, Math.min(T.turnRate*0.5, da)); }
        speed=(hungry? T.speed*0.7 : T.speed*0.3)*(torpid?0.75:1)*pcS;
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
function initWorld(seed){
  if (W.initialized) return; W.initialized = true;
  W.rng = mulberry32(seed === undefined ? P.SEED : seed);
  W.n=0; W.freeList.length=0; W.alive.fill(0); W.tick=0;
  W.M.fill(P.M0); W.dE.fill(0); W.dP.fill(0); W.dM.fill(0); W.sc.fill(0); W.al.fill(0);
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
  computeLight(); computeTemp();
  const nearSun = rad => { const a=R()*6.283, r=Math.sqrt(R())*rad;
    return [wrap(W.sources[0].x+Math.cos(a)*r), wrap(W.sources[0].y+Math.sin(a)*r)]; };
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
// specimen card. Image: assets/species/<key>.jpg (640px), optional -- the card hides the slot if missing.
const SPECIES_PROFILE = [
  { key:"solara",
    intro:"Solara is a colonial, mat-forming alga of the lit floor. Anchored in place, it turns light and dissolved mineral into biomass, spreading cell by cell across the sediment until crowding halts it. Where the light is strongest the carpet grows thickest — the pond's primary producer and its living floor.",
    habitat:"the lit floor near the sun; a carpet, thickest where light is strongest",
    behaviour:"sessile; photosynthesises; divides into the neighbouring floor until the mat is crowded",
    food:"light and dissolved mineral", eatenBy:"Cilio — poor food; the lowest 35 units of every mat are ungrazeable refugia",
    size:"7–9 units at founding", lifecycle:"small constant hazard; no cyst" },
  { key:"drifta",
    intro:"Drifta is a free-drifting planktonic alga of the open water and the fastest grower in the world. It rides the water with a weak pull toward light, and when starved it folds into a resistant cyst until light returns. As the grazer's favourite food, its numbers rise and crash in the pond's great prey cycles.",
    habitat:"open water wherever the light reaches; drifts up the local light gradient — in dark water there is nothing to steer by, so it never crosses to a farther sun",
    behaviour:"damped random walk with weak phototaxis; encysts when starved, wakes when light returns",
    food:"light and dissolved mineral — the fastest grower in the world", eatenBy:"Cilio — its best food; a 35% escape jink breaks contact",
    size:"3.4 units", lifecycle:"cyst at 18% reserve, wakes on light" },
  { key:"cilio",
    intro:"Cilio is a ciliate grazer — a single cell driven by a shimmering fringe of cilia. It steers actively toward its prey, prefers Drifta above all, and flees when the alarm scent of injured neighbours drifts past. It holds the middle of the food web: chief consumer of the producers, and the sole prey of the apex predator.",
    habitat:"the productive core, following its food",
    behaviour:"steering forager; pursues the nearest edible target; flees down the alarm gradient when neighbours are injured",
    food:"Drifta (best), Bacillus (survival food), Solara (poor)", eatenBy:"Venator — with a 30% escape jink of its own",
    size:"6 units", lifecycle:"matures 200 ticks after division, divides at most every 160; encysts when starved, wakes on prey" },
  { key:"bacillus",
    intro:"Bacillus is a colony-forming decomposer bacterium. Tumbling along detritus gradients, it consumes dead matter and returns its bound mineral to the water — the recycling service every other species depends on. Without it, the pond's mineral slowly locks up in corpses and the whole web strangles.",
    habitat:"wherever dead matter settles; follows detritus gradients",
    behaviour:"run-and-tumble; eats detritus and mineralises — returns bound mineral to the water. The recycling guild.",
    food:"detritus energy and protein", eatenBy:"Cilio — survival food; cysts edible at half yield",
    size:"2 units; colonies, not cells", lifecycle:"encysts when starved; wakes on detritus or death-scent" },
  null, null,
  { key:"venator",
    intro:"Venator is the pond's apex predator, a fast pursuit hunter that feeds on Cilio alone. It strikes in a straight line with a jet burst, holds a territory against its own kind, and breeds slower than anything else in the water. An apex is knife-edged by nature: it persists in most worlds and is lost in some.",
    habitat:"the hunting grounds around the core; a pack founds together as cysts",
    behaviour:"fast straight-line pursuit with a jet burst; outturned by its prey; territorial; finishes the carcasses of its own kills",
    food:"Cilio only", eatenBy:"nothing",
    size:"9 units", lifecycle:"the slowest breeder (700-tick cooldown); a knife-edged apex — reported, never required" },
];
const SHAPES = ["nucleus","dot","tri","square","dot","dot","ray"]; // sprite shape per species; "ray" = drawn as paths (drawGhostRay)
const SPRITE_SCALE = [1.1, 1.9, 2.2, 1.6, 2.2, 2.2, 1.0];          // screen radius = size * scale * zoom
const GLYPH = ["●","●","▲","▪","●","●","△"];                      // status-strip glyph per species
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
// vis (locus visual grammar, owner decision 2026-08-30, implemented with this UI block):
//   { outline: 0..1 }  defense loci -- tougher lines carry a shell-like ring around the body
//   { round: 0..1 }    feeding/metabolic axes, circular<->square -- thriftier rounds the silhouette,
//                      keener/voracious keeps it sharp
// Tint is applied by the CALLER and belongs to temperature loci alone (warm-adapted leans warm).
function makeSprite(rgb, shape, vis){
  const s = 64, c = document.createElement("canvas"); c.width = s; c.height = s;
  const g = c.getContext("2d"); const [r, gg, b] = rgb;
  const rnd = vis && vis.round !== undefined ? vis.round : 0;
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
    const half = 3.4 - rnd*1.1; // stroke-rounding fattens the core; shrink so the body stays one size
    g.beginPath(); g.rect(s/2-half, s/2-half, half*2, half*2); g.fill();
    if (rnd > 0.02){ g.strokeStyle = g.fillStyle; g.lineJoin = "round"; g.lineWidth = rnd*4.5; g.stroke(); }
    return c;
  }
  if (shape === "tri"){ // Cilio: rare + moving, allowed the luminance peak
    grad.addColorStop(0, `rgba(${r},${gg},${b},0.9)`);
    grad.addColorStop(0.4, `rgba(${r},${gg},${b},0.4)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    // the mark carries the color: a pure white triangle washed every tint out under the screen composite
    g.save();
    if (rnd > 0.02){ g.translate(s/2, s/2); g.scale(1 - 0.09*rnd, 1 - 0.09*rnd); g.translate(-s/2, -s/2); }
    g.fillStyle = `rgba(${Math.min(255,r+55)},${Math.min(255,gg+55)},${Math.min(255,b+55)},0.95)`;
    g.beginPath(); g.moveTo(s*0.72, s*0.5); g.lineTo(s*0.38, s*0.36); g.lineTo(s*0.38, s*0.64); g.closePath(); g.fill();
    g.lineJoin = "round";
    if (rnd > 0.02){ g.strokeStyle = g.fillStyle; g.lineWidth = rnd*7; g.stroke(); }
    g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 1.2 + rnd*4; g.stroke();
    g.restore();
  } else { // Drifta: soft glow, colored (not white) center, modest alpha
    grad.addColorStop(0, `rgba(${r},${gg},${b},0.6)`);
    grad.addColorStop(0.4, `rgba(${r},${gg},${b},0.22)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    g.fillStyle = `rgba(${Math.min(255,r+40)},${Math.min(255,gg+35)},${Math.min(255,b+30)},0.9)`;
    g.beginPath(); g.arc(s/2, s/2, 3.6, 0, 6.283); g.fill();
    if (vis && vis.outline !== undefined && vis.outline > 0.02){ // defense ring: the tougher end wears a shell
      g.strokeStyle = `rgba(235,246,255,${(0.10 + 0.75*vis.outline).toFixed(3)})`;
      g.lineWidth = 1 + 1.6*vis.outline;
      g.beginPath(); g.arc(s/2, s/2, 5.6, 0, 6.283); g.stroke();
    }
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
// WORLD VIEW DRAWING — the frame pipeline, extracted from the component so the visual
// grammar (sprites, tint, shape, layers) lives in one file. `view` = { cam, vw, vh, z, hw, hh, alpha, dpr, LOD_Z }.
// ============================================================
// World layers: light (redrawn when the sun moves), dissolved mineral, mat carpet, corpse pall.
// Everything reads the module-singleton W; the returned closures own their offscreen canvases.
function makeWorldLayers(){
  // light layer (world-space, redrawn only when a sun moves or changes): one glow per sun,
  // radius from its spread, alpha from its intensity; the glows add like the field they depict
  const LB = document.createElement("canvas"); LB.width = 512; LB.height = 512;
  const lg = LB.getContext("2d");
  const drawLight = () => {
    lg.fillStyle = COL.abyss; lg.fillRect(0,0,512,512);
    const k = 512 / P.WORLD;
    lg.globalCompositeOperation = "lighter";
    // the layer is one torus tile: a glow near a tile edge must continue on the far side, so each
    // sun is painted at every wrapped offset its radius reaches (the field itself wraps in computeLight)
    for (const s of W.sources){
      const a = Math.min(1, s.i), r = s.sigma*2.2*k, cx = s.x*k, cy = s.y*k;
      for (let ox = -512; ox <= 512; ox += 512) for (let oy = -512; oy <= 512; oy += 512){
        const x = cx+ox, y = cy+oy;
        if (x + r < 0 || x - r > 512 || y + r < 0 || y - r > 512) continue;
        const gr2 = lg.createRadialGradient(x, y, 4, x, y, r);
        gr2.addColorStop(0, `rgba(214,238,255,${(0.30*a).toFixed(3)})`);
        gr2.addColorStop(0.4, `rgba(140,190,225,${(0.12*a).toFixed(3)})`);
        gr2.addColorStop(1, "rgba(140,190,225,0)");
        lg.fillStyle = gr2; lg.fillRect(0,0,512,512);
      }
    }
    lg.globalCompositeOperation = "source-over";
    lg.fillStyle = "rgba(240,250,255,0.9)";
    for (const s of W.sources){ if (s.i <= 0) continue; const cx = s.x*k, cy = s.y*k;
      for (let ox = -512; ox <= 512; ox += 512) for (let oy = -512; oy <= 512; oy += 512){
        lg.beginPath(); lg.arc(cx+ox, cy+oy, 5, 0, 6.283); lg.fill(); } }
  };
  drawLight();
  // heat layer (7.H): warmth as an ember glow, cold as a blue one -- never amber, which is the hand's colour.
  // Transparent where nothing is warm, so the certified world looks exactly as before.
  const HB = document.createElement("canvas"); HB.width = 512; HB.height = 512;
  const hg = HB.getContext("2d");
  const drawHeat = () => {
    hg.clearRect(0,0,512,512);
    const k = 512 / P.WORLD;
    for (const s of W.sources){ if (s.a === 0) continue;
      const warm = s.a > 0, m = Math.min(1, Math.abs(s.a)/10), r = s.sigma*2.2*k, cx = s.x*k, cy = s.y*k;
      const c0 = warm ? "255,120,60" : "110,170,255", c1 = warm ? "200,70,40" : "80,120,220";
      for (let ox = -512; ox <= 512; ox += 512) for (let oy = -512; oy <= 512; oy += 512){
        const x = cx+ox, y = cy+oy;
        if (x + r < 0 || x - r > 512 || y + r < 0 || y - r > 512) continue;
        const gr = hg.createRadialGradient(x, y, 2, x, y, r);
        gr.addColorStop(0, `rgba(${c0},${(0.38*m).toFixed(3)})`);
        gr.addColorStop(0.45, `rgba(${c1},${(0.16*m).toFixed(3)})`);
        gr.addColorStop(1, `rgba(${c1},0)`);
        hg.fillStyle = gr; hg.fillRect(0,0,512,512);
      }
      if (s.i <= 0){ hg.fillStyle = warm ? "rgba(255,160,110,0.9)" : "rgba(170,210,255,0.9)"; // a dark source still needs a mark
        for (let ox = -512; ox <= 512; ox += 512) for (let oy = -512; oy <= 512; oy += 512){ hg.beginPath(); hg.arc(cx+ox, cy+oy, 4, 0, 6.283); hg.fill(); } }
    }
  };
  drawHeat();

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
    const matLocus = SPECIES.MAT >= 0 && TRAITS[SPECIES.MAT].locus;
    if (matLocus){
      cellG.fill(0); cellGn.fill(0);
      for (let i = 0; i < W.n; i++) if (W.alive[i] && W.sp[i] === SPECIES.MAT){ const c = cellOf(i); cellG[c] += W.g[i]; cellGn[c]++; }
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
  return { LB, HB, MC, MN, CC, LOD_Z, drawLight, drawHeat, updateCarpet };
}
// Sprite set under the locus visual grammar (owner decision 2026-08-30, one documented increment):
//   tint      <- the species' temperature locus (warmSlope/warmGainSlope), warm-adapted leaning WARM
//                (tintRgb runs warm at t=0, so the temperature axis passes 1-g). Tint no longer shows
//                the display loci -- a deliberate change of what an existing player's colors mean.
//   outline   <- the defense locus (escSlope): tougher wears a ring.
//   roundness <- feeding/metabolic axes (catchSlope/rateSlope/effSlope): thrifty rounds, keen stays sharp.
//   elongated<->circular stays reserved for a future speed locus; movement-strategy loci (tprefSpan)
//   carry NO body channel by owner decision D7 -- their display is behaviour itself.
// Exception, documented: the mat carpet keeps its plane-0 (light locus) genotype turn -- a per-cell
// pixel field has no outline or body form to carry it, and an invisible locus is worse than an
// off-grammar one.
function makeSpriteSet(){
  const sprites = [makeSprite(COL.solara,"nucleus"), makeSprite(COL.drifta,"dot"), makeSprite(COL.cilio,"tri"), makeSprite(COL.bacillus,"square"),
    makeSprite(COL.mycora,"dot"), makeSprite(COL.necro,"dot"), makeSprite(COL.venator,"tri")];
  const TINT_BINS = 7;
  const grammar = TRAITS.map((T, sp) => {
    if (!T.loci.length || SHAPES[sp] === "ray" || SHAPES[sp] === "nucleus") return null;
    const tintPlane = T.loci.findIndex(L => L.warmSlope || L.warmGainSlope);
    const outlinePlane = T.loci.findIndex(L => L.escSlope > 0);
    const roundPlane = T.loci.findIndex(L => L.catchSlope > 0 || L.rateSlope > 0 || L.effSlope > 0);
    const morphPlane = outlinePlane >= 0 ? outlinePlane : roundPlane;
    if (tintPlane < 0 && morphPlane < 0) return null;
    const tN = tintPlane >= 0 ? TINT_BINS : 1, mN = morphPlane >= 0 ? TINT_BINS : 1;
    const bins = Array.from({ length: tN }, (_, tb) =>
      Array.from({ length: mN }, (_, mb) => {
        const rgb = tintPlane >= 0 ? tintRgb(SPECIES_META[sp].rgb, 1 - tb/(TINT_BINS-1)) : SPECIES_META[sp].rgb;
        const gM = mb/(TINT_BINS-1);
        const vis = outlinePlane >= 0 ? { outline: gM } : roundPlane >= 0 ? { round: 1 - gM } : undefined;
        return makeSprite(rgb, SHAPES[sp], vis);
      }));
    return { tintPlane, morphPlane, tN, mN, bins };
  });
  return { sprites, grammar, TINT_BINS };
}
// Organisms, with the screen composite, cull margin and LOD; returns the live census the strip and card need.
function drawOrganisms(ctx, view, hidden, S){
  const { cam, vw, vh, z, hw, hh, alpha, LOD_Z } = view;
  ctx.globalCompositeOperation = "screen";
  const cull = 40;
  const pops = [0,0,0,0,0,0,0];
  let mnBound = 0;
  for (let i=0;i<W.n;i++){
    if (!W.alive[i]) continue;
    pops[W.sp[i]]++;
    mnBound += W.mn[i];
    if (hidden[W.sp[i]]) continue; // hidden from view, still counted
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
    if (SHAPES[spb] === "square" && z < LOD_Z){ // bacteria dot-LOD: batched rects instead of sprite blits
      ctx.fillStyle = "rgba(196,206,150,0.8)";
      ctx.fillRect(sx-1.1, sy-1.1, 2.2, 2.2);
      continue;
    }
    const r = W.sz[i] * SPRITE_SCALE[spb] * z;
    let spr = S.sprites[spb];
    const gr = S.grammar[spb];
    if (gr){ // locus visual grammar: tint by the temperature plane, outline/roundness by the defense/feeding plane
      const tb = gr.tN > 1 ? Math.max(0, Math.min(gr.tN-1, Math.round(W.g[gr.tintPlane*MAXN+i]*(gr.tN-1)))) : 0;
      const mb = gr.mN > 1 ? Math.max(0, Math.min(gr.mN-1, Math.round(W.g[gr.morphPlane*MAXN+i]*(gr.mN-1)))) : 0;
      spr = gr.bins[tb][mb];
    }
    if (SHAPES[spb] === "tri"){
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(W.hd[i]);
      ctx.drawImage(spr, -r, -r, r*2, r*2); ctx.restore();
    } else if (SHAPES[spb] === "ray"){
      drawGhostRay(ctx, sx, sy, W.hd[i], r, W.bst[i] > 0, null);
    } else {
      ctx.drawImage(spr, sx-r, sy-r, r*2, r*2);
    }
  }
  ctx.globalCompositeOperation = "source-over";
  return { pops, mnBound };
}
function drawPours(ctx, pours, nowT){
  // amber pour rings: the hand's touch, fading
  for (let q = pours.length-1; q >= 0; q--){
    const age = (nowT - pours[q].t) / 700;
    if (age >= 1){ pours.splice(q,1); continue; }
    ctx.strokeStyle = `rgba(242,178,74,${(0.7*(1-age)).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pours[q].sx, pours[q].sy, 10 + age*34, 0, 6.283); ctx.stroke();
  }
}
function drawCorpses(ctx, view, hiddenDebris){
  const { cam, vw, vh, z, hw, hh, LOD_Z } = view; const cull = 40;
  // corpses: pale husks when zoomed in; the aggregate layer covers zoomed-out
  if (z >= LOD_Z && !hiddenDebris) for (let k = 0; k < W.cN; k++){
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
}
function drawSunAffordance(ctx, view, selSun){
  const { cam, z, hw, hh } = view;
  W.sources.forEach((s, k) => {
    const ssx = hw + wd(s.x - cam.x)*z, ssy = hh + wd(s.y - cam.y)*z, on = k === selSun;
    ctx.strokeStyle = on ? "rgba(242,178,74,1)" : "rgba(242,178,74,0.9)"; ctx.lineWidth = on ? 2.5 : 1.5;
    ctx.beginPath(); ctx.arc(ssx, ssy, 16, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = on ? "rgba(242,178,74,0.5)" : "rgba(242,178,74,0.3)"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(ssx, ssy, 22, 0, 6.283); ctx.stroke();
  });
}
function drawSelectionRing(ctx, view, si){
  const { cam, z, hw, hh, alpha } = view;
  const ix = W.px[si] + wd(W.x[si]-W.px[si])*alpha, iy = W.py[si] + wd(W.y[si]-W.py[si])*alpha;
  const sx = hw + wd(ix - cam.x)*z, sy = hh + wd(iy - cam.y)*z;
  const rr = Math.max(14, W.sz[si]*2.6*z);
  ctx.strokeStyle = "rgba(201,215,227,0.95)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(sx, sy, rr, 0, 6.283); ctx.stroke();
  ctx.strokeStyle = "rgba(201,215,227,0.25)"; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(sx, sy, rr + 4, 0, 6.283); ctx.stroke();
}
function drawLoupe(ctx, canvas, LP, lpx, view, loupe){
  const { vw, dpr } = view;
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
  source:"You moved an energy source", sunlight:"You changed the sunlight", undo:"You undid the last action",
  sourceAdd:"You added an energy source", sourceRemove:"You removed an energy source", sourceSet:"You changed an energy source", sourceLayout:"You changed the source layout",
  mutation:"You switched mutation", evolution:"You changed an evolution setting", preset:"You applied an evolution preset" };
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
// One band per (species, locus). The canvas is sized by its parent to TRAIT_BAND_H per band and
// scrolls vertically (a phone screen holds ~3 bands; the world now grows loci faster than pixels —
// the old fixed-height split made every band overflow into the next one's header). The stats live
// on a second header line: right-aligning them collided with the title at phone widths.
const TRAIT_BAND_H = 160;
function traitBandList(){
  const bands = [];
  for (const sp of SPECIES.LOCI){ if (TRAITS[sp].apex) continue;
    TRAITS[sp].loci.forEach((_, k) => { if (k < LOCUS_CH.length) bands.push([sp, k]); }); }
  return bands;
}
function drawTraits(g, wpx, hpx){
  g.fillStyle = "#0B131E"; g.fillRect(0, 0, wpx, hpx);
  const bands = traitBandList();
  const n = W.recCount;
  if (!bands.length){ g.fillStyle="#5E7386"; g.font="11px ui-monospace, Menlo, monospace"; g.fillText("no heritable traits in this world", 12, 24); return; }
  const bandH = hpx / bands.length;
  bands.forEach(([sp, kL], bi) => {
    const L = TRAITS[sp].loci[kL], c = SPECIES_META[sp].rgb, col = "rgb("+c[0]+","+c[1]+","+c[2]+")";
    const mCh = LOCUS_CH[kL][0]+sp, sCh = LOCUS_CH[kL][1]+sp;
    const top = bi*bandH, padL = 34, padR = 10;
    // vertical budget per band (sums to bandH at 160): title 14 + stats line 20, ribbon, 24 for the
    // patch marks, histogram, 26 for its labels
    const histH = Math.max(20, Math.round(bandH*0.26)), ribH = Math.max(30, bandH - 34 - 24 - histH - 26);
    const ribT = top + 34, histT = ribT + ribH + 24;
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
      for (let k=0;k<n;k++){ const x = padL + cw*k/Math.max(1,n-1); const y = yOf(at(k,mCh)+at(k,sCh)); k===0 ? g.moveTo(x,y) : g.lineTo(x,y); }
      for (let k=n-1;k>=0;k--){ const x = padL + cw*k/Math.max(1,n-1); g.lineTo(x, yOf(at(k,mCh)-at(k,sCh))); }
      g.closePath(); g.fillStyle = "rgba("+c[0]+","+c[1]+","+c[2]+",0.22)"; g.fill();
      g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath();
      for (let k=0;k<n;k++){ const x = padL + cw*k/Math.max(1,n-1), y = yOf(at(k,mCh)); k===0 ? g.moveTo(x,y) : g.lineTo(x,y); }
      g.stroke();
      g.fillStyle = "#5E7386"; g.font = "10px ui-monospace, Menlo, monospace";
      g.fillText("-"+Math.round((n-1)*REC.STRIDE/10)+"s", padL, ribT+ribH+11); g.fillText("now", padL+cw-24, ribT+ribH+11);
      const last = at(n-1,mCh), lsd = at(n-1,sCh);
      let lab = "mean "+last.toFixed(2)+" · spread ±"+lsd.toFixed(2);
      if (W.sources.length > 1){ const pm = patchMeans(sp, kL); // 7.L: by patch, only when there is more than one sun
        const parts = pm.n.map((k, j) => k >= PATCH_MIN ? pm.mean[j].toFixed(2) : null).filter(Boolean);
        if (parts.length > 1) lab += " · by sun " + parts.join(" | "); }
      g.fillStyle = "#B8C5D1"; g.font = "10px ui-monospace, Menlo, monospace"; g.fillText(lab, padL, top+27);
    } else { g.fillStyle="#5E7386"; g.fillText("gathering history…", padL+6, ribT+ribH/2); }
    // histogram of the living population
    const BINS = 24, hist = new Float32Array(BINS); let tot=0;
    for (let i=0;i<W.n;i++) if (W.alive[i] && W.sp[i]===sp){ hist[Math.min(BINS-1, Math.floor(W.g[kL*MAXN+i]*BINS))]++; tot++; }
    let hmax = 1; for (let b=0;b<BINS;b++) hmax = Math.max(hmax, hist[b]);
    const bw = cw/BINS;
    for (let b=0;b<BINS;b++){
      const t = tintRgb(c, (b+0.5)/BINS), h = histH*hist[b]/hmax;
      g.fillStyle = "rgba("+t[0]+","+t[1]+","+t[2]+",0.85)";
      g.fillRect(padL + b*bw + 0.5, histT + histH - h, Math.max(1, bw-1), h);
    }
    g.strokeStyle = "rgba(201,215,227,0.35)"; g.setLineDash([3,4]);
    g.beginPath(); g.moveTo(padL + cw*L.g0, histT); g.lineTo(padL + cw*L.g0, histT+histH); g.stroke(); g.setLineDash([]);
    if (W.sources.length > 1){ // 7.L: one small sun mark per patch at that patch's mean -- the split, if any, read off the bars
      const pm = patchMeans(sp, kL); g.font = "9px ui-monospace, Menlo, monospace"; g.fillStyle = "#B8C5D1";
      pm.n.forEach((k, j) => { if (k < PATCH_MIN) return; const x = padL + cw*Math.max(0, Math.min(1, pm.mean[j]));
        g.fillRect(x-0.5, histT-6, 1, 6); g.fillText("☀"+(j+1), x-6, histT-8); }); }
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
  for (const sp of SPECIES.LOCI){ if (TRAITS[sp].apex) continue;
    TRAITS[sp].loci.forEach((L, kL) => { if (kL >= LOCUS_CH.length) return;
      const c = SPECIES_META[sp].rgb, mean = W.rec[r+LOCUS_CH[kL][0]+sp], sd = W.rec[r+LOCUS_CH[kL][1]+sp];
      let hi=0, tot=0; for (let i=0;i<W.n;i++) if (W.alive[i] && W.sp[i]===sp){ tot++; if (W.g[kL*MAXN+i] > L.g0+0.05) hi++; }
      rows.push(<span key={sp+"·"+kL} style={{ color:"rgb("+c[0]+","+c[1]+","+c[2]+")" }}>
        ● {SPECIES_META[sp].name} {L.label.toLowerCase()} {mean.toFixed(2)} ±{sd.toFixed(2)} · {L.hiWord} {tot ? Math.round(100*hi/tot) : 0}%</span>);
    });
  }
  return <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 14px", padding:"8px 16px", fontSize:12 }}>
    {rows}<span style={{ color:"#5E7386", marginLeft:"auto" }}>{P.mutation ? "mutation on" : "mutation off"}</span>
    <span style={{ flexBasis:"100%", color:"#42566A", fontSize:10 }}>
      in the world: body tint = warmth adaptation (warm-adapted leans warm) · ring = tougher defense ·
      rounded↔sharp body = thrifty↔keen feeding · warmth preference shows only in where they swim</span></div>;
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
  for (const sp of SPECIES.CORE){
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
        {ind.adaptability !== null && tile("ADAPTABILITY", "mean heritable variation", ind.adaptability < 0.03 ? "low · "+ind.adaptability.toFixed(2) : ind.adaptability.toFixed(2))}
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
      setPage(p => Math.max(0, Math.min(PAGE_TITLES.length-1, p + (dx < 0 ? 1 : -1))));
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
      {page === 3 ? <HealthPage /> : page === 4 ? <EventsPage /> : page === 5 ? (
        // Traits scrolls: the canvas takes TRAIT_BAND_H per (species, locus) band — a phone shows ~3
        // bands at a time — and the legend rides in the same scroll region. touchAction pan-y keeps
        // vertical scrolling native while the pointer handlers still catch the horizontal page swipe.
        <div style={{ flex:1, minHeight:0, overflowY:"auto", WebkitOverflowScrolling:"touch" }}>
          <canvas ref={cRef} onPointerDown={e => { e.stopPropagation(); swDown(e); }}
            onPointerUp={swUp}
            style={{ width:"100%", height: Math.max(1, traitBandList().length)*TRAIT_BAND_H,
              display:"block", touchAction:"pan-y" }} />
          <TraitsLegend />
        </div>
      ) : (
        <canvas ref={cRef} onPointerDown={e => { e.stopPropagation(); swDown(e); onScrub(e); }}
          onPointerMove={e => e.buttons && onScrub(e)}
          onPointerUp={e => { swUp(e); setScrub(null); }}
          style={{ width:"100%", height: docked ? "38%" : "46%", minHeight:170,
            touchAction:"none", cursor: page===0 ? "col-resize" : "default" }} />
      )}
      {page === 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 14px", padding:"8px 16px", fontSize:12 }}>
          {SPECIES.LIVE.map(sp => { const c=SPECIES_META[sp].rgb; return (
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
// Light budget (7.L): total light input of the shipped world (one sun, lever at 1), captured at mount.
// Adding a sun is never energy-neutral; the sun card says by how much, honestly.
const LIGHT_REF = { v: 0 };
const lightInput = () => { let t = 0; const L = W.light; for (let c = 0; c < L.length; c++) t += L[c]; return t; };
export default function Microcosm(){
  const canvasRef = useRef(null);
  const [ui, setUi] = useState({ tick: 0, fps: 0, pops: [0,0,0,0,0,0,0], speed: 1, card: null, mineral: { b: 0, f: 0, l: 0, add: 0 }, lightMul: 1, spawnPick: null, srcSel: -1 });
  const [detent, setDetent] = useState(0); // 0 peek, 1 half, 2 full
  const [undoChip, setUndoChip] = useState(null);
  const [uiMode, setUiMode] = useState("observe");
  const actionsRef = useRef({});
  const speedRef = useRef(1); // 0 = paused, 1, 4, 16
  const fabLong = useRef(null);
  const dragRef = useRef(null);
  const [hidden, setHidden] = useState([false,false,false,false,false,false,false,false,false,false]); // per-species show/hide (view only); 7 = debris, 8 = light layer, 9 = heat layer
  const hiddenRef = useRef(hidden); hiddenRef.current = hidden;

  useEffect(() => {
    initWorld();
    if (!LIGHT_REF.v) LIGHT_REF.v = lightInput();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let vw = 0, vh = 0;
    const cam = { x: W.sources[0].x, y: W.sources[0].y, z: Math.max(1, Math.min(window.innerWidth, window.innerHeight) / 620) };
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


    const S = makeSpriteSet();

    const { LB, HB, MC, MN, CC, LOD_Z, drawLight, drawHeat, updateCarpet } = makeWorldLayers();
    drawLight();

    // selection + follow-cam
    const sel = { i: -1, gen: 0 };
    const selValid = () => sel.i >= 0 && W.alive[sel.i] && W.gen[sel.i] === sel.gen;
    let follow = false;
    const SPECIES = SPECIES_META;
    const stateOf = i => { const T = TRAITS[W.sp[i]]; return W.cy[i] ? "Dormant (cyst)"
      : T.photosynth && T.movement === "sessile" ? "Photosynthesizing"
      : W.bst[i]>0 ? "Striking"
      : T.detritivore ? "Decomposing"
      : T.movement === "drift" ? "Drifting"
      : W.handle[i]>0 ? "Digesting"
      : W.en[i] < T.torpor*P.capMul*W.sz[i] ? "Torpid" : "Foraging"; };
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
      if (T.loci.length){
        heredity = T.loci.map((L, kk) => {
          const g = W.g[kk*MAXN+i];
          const parts = [];
          if (L.escSlope && T.escape) parts.push([L.hiTrait, Math.round(100 * L.escSlope*(g - L.g0) / T.escape.p)]);
          if (L.catchSlope) parts.push([L.hiTrait, Math.round(100 * L.catchSlope*(g - L.g0))]);
          if (L.kpSlope) parts.push([L.loTrait, Math.round(100 * L.kpSlope*(L.g0 - g))]);
          if (L.kbSlope) parts.push([L.loTrait, Math.round(-100 * L.kbSlope*(g - L.g0))]);
          if (L.rateSlope) parts.push([L.hiTrait, Math.round(100 * L.rateSlope*(g - L.g0))]);
          if (L.effSlope) parts.push([L.loTrait, Math.round(-100 * L.effSlope*(g - L.g0))]);
          if (L.lightSlope){ parts.push([L.hiTrait, Math.round(100 * L.lightSlope*(g - L.g0))]);
                             parts.push([L.loTrait, Math.round(-100 * L.lightSlope*(g - L.g0))]); }
          if (L.warmSlope) parts.push([L.hiTrait, Math.round(100 * L.warmSlope*(g - L.g0))]);
          if (L.warmGainSlope) parts.push([L.loTrait, Math.round(-100 * L.warmGainSlope*(g - L.g0))]);
          if (L.tprefSpan) parts.push(["preferred warmth", +(L.tprefSpan*(g - L.g0)).toFixed(1), "°"]); // a set-point shifts in degrees, not percent (MV.1)
          if (L.dampSpan) parts.push(["settling rate", Math.round(100*((1 - (T.damp + L.dampSpan*(g - L.g0)))/(1 - T.damp) - 1))]); // MV.2: how fast the drift decays vs the founder (roving = slower settling)
          if (L.pcTurnSlope) parts.push(["after-kill searching", Math.round(100 * L.pcTurnSlope*(g - L.g0))]); // MV-C: phase-A turn amplitude
          if (L.pcSpeedSlope) parts.push(["after-kill departure", Math.round(100 * L.pcSpeedSlope*(L.g0 - g))]); // MV-C: phase-A speed (movers leave faster)
          if (L.tumbleSlope) parts.push(["run length", Math.round(100 * L.tumbleSlope*(g - L.g0))]); // MV.3: fewer tumbles = longer runs
          return { label: L.label, g, g0: L.g0, hiWord: L.hiWord, loWord: L.loWord, parts };
        });
      }
      return { name: spc.name, role: spc.role, rgb: spc.rgb, id: `${i}·${W.gen[i]}`,
        age: Math.floor((W.tick - W.birth[i]) / 10), state: stateOf(i),
        en: W.en[i], cap, pr: W.pr[i], pQ, mn: W.mn[i], mQ, size: W.sz[i],
        badge, bind, lineage: W.lg[i], heredity, sp: W.sp[i],
        warmth: W.temp[cellOf(i)], qR: W.qR[cellOf(i)], topt: T.topt, ctmax: T.ctmax }; // 7.H: what the warmth here does to this one
    };
    const clearChips = () => { clearTimeout(chipTimer); setUi(u => (u.chips ? { ...u, chips: null } : u)); };
    const selectIndex = i => {
      sel.i = i; sel.gen = W.gen[i]; follow = true;
      clearTimeout(chipTimer);
      setUi(u => ({ ...u, card: buildCard(), chips: null })); setDetent(0);
    };
    const nearestSource = (sx, sy) => { let best = { k: 0, d: Infinity }; // nearest sun to a screen point, in px
      W.sources.forEach((s, k) => { const d = Math.hypot(vw/2 + wd(s.x - cam.x)*cam.z - sx, vh/2 + wd(s.y - cam.y)*cam.z - sy);
        if (d < best.d) best = { k, d }; });
      return best; };
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
    let srcDrag = null;         // indirect sun drag accumulator + undo origin
    let srcSel = -1;            // selected sun (intervene): the sun card's subject and the drag target (7.L)
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
      setMode: m => { mode = m; if (m === "intervene") follow = false; else if (srcSel >= 0) actionsRef.current.selectSource(-1); },
      pick: (i, g) => { if (W.alive[i] && W.gen[i] === g) selectIndex(i); else clearChips(); },
      undo: () => {
        if (undoAction){ undoAction(); undoAction = null; }
        clearTimeout(undoTimer); setUndoChip(null);
      },
      pushUndoExt: (label, fn) => pushUndo(label, fn),
      // 7.L suns: every change is an event (logged, undoable); a layout is one intervention
      selectSource: k => { srcSel = k; setUi(u => ({ ...u, srcSel: k })); },
      addSourceAt: (wx, wy, sx, sy, kind) => { // kind: "sun" (light 1) or "heat" (dark, warmth +10)
        if (W.sources.length >= P.maxSources) return;
        if (sx !== undefined) pours.push({ sx, sy, t: performance.now() });
        logIv("sourceAdd");
        const ch = kind === "heat" ? { i: 0, a: 10, sigma: 130 } : {};
        queueEvent({ type:"sourceAdd", x: wx, y: wy, ...ch, done: r => {
          actionsRef.current.selectSource(r.k);
          pushUndo("Added a sun · Undo", () => { logIv("undo"); actionsRef.current.selectSource(-1); queueEvent({ type:"sourceRemove", k: r.k }); });
        }});
      },
      addSourceCenter: kind => actionsRef.current.addSourceAt(cam.x, cam.y, vw/2, vh/2, kind),
      removeSource: k => {
        if (W.sources.length <= 1 || !W.sources[k]) return;
        actionsRef.current.selectSource(-1);
        logIv("sourceRemove");
        queueEvent({ type:"sourceRemove", k, done: r => {
          pushUndo("Removed a sun · Undo", () => { logIv("undo");
            queueEvent({ type:"sourceAdd", ...r.snap, at: r.k, done: a => actionsRef.current.selectSource(a.k) }); });
        }});
      },
      removeSelSource: () => { if (srcSel >= 0) actionsRef.current.removeSource(srcSel); },
      sourceLayout: (layout, label) => {
        const prev = W.sources.map(s => ({ ...s }));
        const apply = L => {
          for (let k = W.sources.length - 1; k >= 1; k--) queueEvent({ type:"sourceRemove", k });
          queueEvent({ type:"source", k: 0, x: L[0].x, y: L[0].y });
          queueEvent({ type:"sourceSet", k: 0, i: L[0].i, a: L[0].a || 0, sigma: L[0].sigma });
          for (let k = 1; k < L.length; k++) queueEvent({ type:"sourceAdd", ...L[k] });
        };
        apply(layout); actionsRef.current.selectSource(0);
        logIv("sourceLayout");
        pushUndo(label + " · Undo", () => { logIv("undo"); apply(prev); actionsRef.current.selectSource(-1); });
      },
      reset: () => {
        P.mutation = true; // a fresh world starts with the shipped settings (locus settings are restored by initWorld)
        resetWorld(); initWorld((Math.random()*1e9)|0);
        sel.i = -1; follow = false; srcSel = -1; undoAction = null; clearTimeout(undoTimer); setUndoChip(null);
        cam.x = W.sources[0].x; cam.y = W.sources[0].y;
        setUi(us => ({ ...us, card: null, chips: [], spawnPick: null, tick: 0,
          mineral: { b:0, f:0, l:0, add:0 }, lightMul: 1, srcSel: -1 }));
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
      if (mode === "intervene" && pointers.size === 1){
        // the drag target: the selected sun, else the sun nearest the finger at touch-down
        const k = srcSel >= 0 && W.sources[srcSel] ? srcSel : nearestSource(pp.sx, pp.sy).k, s = W.sources[k];
        srcDrag = { k, x: s.x, y: s.y, ox: s.x, oy: s.y };
      }
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
          if (mode === "intervene" && srcDrag){
            // indirect sun drag: move by the finger's delta, from anywhere on screen
            srcDrag.x += (nx - p.x) / cam.z; srcDrag.y += (ny - p.y) / cam.z;
            queueEvent({ type:"source", k: srcDrag.k, x: srcDrag.x, y: srcDrag.y });
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
        if (p && p.moved && srcDrag && pointers.size === 0){
          const { ox, oy } = srcDrag;
          logIv("source");
          const k = srcDrag.k;
          pushUndo("Moved the sun · Undo", () => { logIv("undo"); queueEvent({ type:"source", k, x: ox, y: oy }); });
        } else if (p && !p.moved && !wasPinch && pointers.size === 0 && performance.now() - p.t >= 350){
          const wx2 = wrap(cam.x + (p.sx - vw/2)/cam.z), wy2 = wrap(cam.y + (p.sy - vh/2)/cam.z);
          setUi(us => ({ ...us, spawnPick: { sx: p.sx, sy: p.sy, x: wx2, y: wy2 } }));
        } else if (p && !p.moved && !wasPinch && pointers.size === 0 && performance.now() - p.t < 350){
          const ns = nearestSource(p.sx, p.sy);
          if (ns.d <= 28) actionsRef.current.selectSource(ns.k === srcSel ? -1 : ns.k); // tap a sun: its card (again: let go)
          else if (srcSel >= 0) actionsRef.current.selectSource(-1);                    // tap water with a sun selected: just let go
          else {
            // fertilize pulse: tap open water to pour mineral there
            const fx = wrap(cam.x + (p.sx - vw/2)/cam.z), fy = wrap(cam.y + (p.sy - vh/2)/cam.z);
            pours.push({ sx: p.sx, sy: p.sy, t: performance.now() });
            logIv("pour");
            queueEvent({ type:"fertilize", x: fx, y: fy, amount: 40, done: snap => {
              pushUndo("Poured mineral · Undo", () => { logIv("undo"); queueEvent({ type:"unfertilize", snap }); });
            }});
          }
        }
        if (pointers.size === 0) srcDrag = null;
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
      if (W.lightDirty){ drawLight(); drawHeat(); W.lightDirty = false; }

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
      const view = { cam, vw, vh, z, hw, hh, alpha, dpr, LOD_Z };
      // tiled light and heat layers (view toggles: slots 8 and 9 of `hidden`)
      const tlx = cam.x - hw/z, tly = cam.y - hh/z;
      for (let ky = Math.floor(tly/P.WORLD); (ky*P.WORLD) < tly + vh/z; ky++)
        for (let kx = Math.floor(tlx/P.WORLD); (kx*P.WORLD) < tlx + vw/z; kx++){
          const dx0 = (kx*P.WORLD - cam.x)*z + hw, dy0 = (ky*P.WORLD - cam.y)*z + hh;
          if (!hiddenRef.current[8]) ctx.drawImage(LB, dx0, dy0, P.WORLD*z, P.WORLD*z);
          if (!hiddenRef.current[9]) ctx.drawImage(HB, dx0, dy0, P.WORLD*z, P.WORLD*z);
        }
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
      const { pops, mnBound } = drawOrganisms(ctx, view, hiddenRef.current, S);
      drawPours(ctx, pours, performance.now());
      drawCorpses(ctx, view, hiddenRef.current[7]);
      W.pops = pops;

      if (mode === "intervene") drawSunAffordance(ctx, view, srcSel);
      // selection ring (non-additive, drawn above organisms)
      if (selValid()){
        drawSelectionRing(ctx, view, sel.i);
      } else if (sel.i >= 0){ // selected organism died or slot was recycled
        sel.i = -1; follow = false; setUi(u => ({ ...u, card: null }));
      }

      if (loupe) drawLoupe(ctx, canvas, LP, lpx, view, loupe);

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
  const srcOpen = uiMode === "intervene" && ui.srcSel >= 0;            // the sun card is showing (7.L)
  const panelKind = !desktop ? null : uiMode === "data" ? "data" : srcOpen ? "src" : ui.card ? "card" : null;
  const panelW = panelKind === "data" ? LAYOUT.panelData
               : (panelKind === "card" || panelKind === "src") ? LAYOUT.panelCard : 0;
  const sheetUp = !desktop && (!!ui.card || srcOpen);                    // a bottom sheet is up: lift the controls
  const sheetPad = srcOpen ? 262 : 194;
  const srcLog = (type, label, undoFn) => { W.evLog.push({ tick: W.tick, type });
    actionsRef.current.pushUndoExt && actionsRef.current.pushUndoExt(label + " · Undo", undoFn); };

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
      else if (k === "s" || k === "S" || k === "h" || k === "H"){ setUiMode("intervene"); actionsRef.current.setMode && actionsRef.current.setMode("intervene");
        actionsRef.current.addSourceCenter && actionsRef.current.addSourceCenter(k === "h" || k === "H" ? "heat" : "sun"); }
      else if (k === "Delete" || k === "Backspace"){ actionsRef.current.removeSelSource && actionsRef.current.removeSelSource(); }
      else if (k === "Escape"){
        actionsRef.current.selectSource && actionsRef.current.selectSource(-1);
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
      {/* passive status strip. One column: on narrow screens the first row is
          allowed to wrap, and the mineral row below it moves down with the
          flow instead of sitting at a fixed offset for the wrapped text to
          land on (seen on phone-width WebViews). */}
      <div style={{ position:"absolute", top:0, left:0, right:0, padding:"calc(env(safe-area-inset-top, 0px) + 10px) 18px 8px 14px",
        display:"flex", flexDirection:"column", gap:4, pointerEvents:"none",
        color:COL.silt, fontSize:12, fontFamily:mono, textShadow:"0 1px 3px rgba(0,0,0,0.8)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline",
        flexWrap:"wrap", columnGap:12, rowGap:2 }}>
        <span style={{ whiteSpace:"nowrap" }}>t {String(ui.tick).padStart(6," ")}  ·  {ui.fps} fps</span>
        {/* species counts double as view toggles: click to hide a species from the world, click again to show */}
        <span style={{ pointerEvents:"auto", display:"inline-flex", gap:10, flexWrap:"wrap",
          justifyContent:"flex-end", marginLeft:"auto" }}>
          {[...SPECIES.LIVE.map(sp => [sp, GLYPH[sp]]), [7,"◌"], [8,"☀"], [9,"♨"]].map(([sp, glyph]) => {
            const debris = sp === 7, layer = sp >= 8;
            const c = debris ? [158,168,178] : layer ? (sp === 8 ? [200,222,240] : [240,150,110]) : SPECIES_META[sp].rgb;
            const name = debris ? "debris" : sp === 8 ? "the light layer" : sp === 9 ? "the heat layer" : SPECIES_META[sp].name;
            return (
            <button key={sp} className="mc-tab"
              onClick={() => setHidden(h => h.map((v, k) => k === sp ? !v : v))}
              title={(hidden[sp] ? "Show " : "Hide ") + name}
              style={{ background:"transparent", border:"none", padding:"2px 3px", cursor:"pointer", font:"inherit",
                color: !debris && !layer && TRAITS[sp].apex ? "rgb(230,240,250)" : `rgb(${c[0]},${c[1]},${c[2]})`,
                opacity: hidden[sp] ? 0.32 : 1, textDecoration: hidden[sp] ? "line-through" : "none",
                textShadow:"0 1px 3px rgba(0,0,0,0.8)" }}>
              {glyph}{layer ? "" : " " + (debris ? (ui.corpses || 0) : ui.pops[sp])}
            </button> ); })}
        </span>
      </div>
      {/* mineral audit: bound (in biomass) vs free (dissolved) — the sum is conserved */}
      <div style={{ display:"flex", alignItems:"center", gap:8, alignSelf:"flex-end",
        flexWrap:"wrap", justifyContent:"flex-end", rowGap:2,
        fontSize:11, fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace" }}>
        <span>M</span>
        <span style={{ display:"inline-flex", width:96, height:4, borderRadius:2, overflow:"hidden",
          background:"rgba(11,19,30,0.7)" }}>
          <span style={{ width:`${Math.round(100*ui.mineral.b/Math.max(1, ui.mineral.b+ui.mineral.l+ui.mineral.f))}%`,
            background:"rgba(70,214,140,0.85)" }} />
          <span style={{ width:`${Math.round(100*ui.mineral.l/Math.max(1, ui.mineral.b+ui.mineral.l+ui.mineral.f))}%`,
            background:"rgba(158,168,178,0.65)" }} />
          <span style={{ flex:1, background:"rgba(91,200,232,0.4)" }} />
        </span>
        {/* NBSP inside each entry: the summary may wrap, but only between entries */}
        <span style={{ textAlign:"right" }}>{(ui.mineral.b/1000).toFixed(1)}k{" "}bound · {(ui.mineral.l/1000).toFixed(1)}k{" "}locked · {(ui.mineral.f/1000).toFixed(1)}k{" "}free</span>
        {ui.mineral.add > 0.5 && <span style={{ color:"#F2B24A" }}> +{ui.mineral.add < 950 ? Math.round(ui.mineral.add) : (ui.mineral.add/1000).toFixed(1)+"k"}</span>}
      </div>
      </div>
      {/* intervene edge tint: unmistakable "you are editing the world" signal */}
      {uiMode === "intervene" && (
        <div style={{ position:"absolute", inset:0, pointerEvents:"none",
          boxShadow:"inset 0 0 46px rgba(242,178,74,0.32)" }} />
      )}
      {/* mode switch + tool hint. Hidden while the specimen sheet is expanded
          past its peek (same rule as the speed control): at half or full height
          the sheet owns that screen space, and a fixed-offset bar would float
          over its content (seen on phone: tabs across the portrait). */}
      {(srcOpen || !ui.card || detent === 0 || desktop) && (
      <div style={{ position:"absolute", left:16, zIndex:6,
        bottom: sheetUp ? sheetPad : "calc(env(safe-area-inset-bottom, 0px) + 20px)",
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
      )}
      {uiMode === "data" && !desktop && <DataMode />}
      <ResetButton onReset={() => actionsRef.current.reset && actionsRef.current.reset()} card={sheetUp} />
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
          <div style={{ fontSize:10, color:"rgba(242,178,74,0.75)", marginTop:4, whiteSpace:"nowrap" }}>
            drag → source · tap source → card · tap → pour · hold → seed · sun · heat</div>
        </div>
      )}
      {uiMode === "intervene" && (
        <EvolutionPanel desktop={desktop} mono={mono}
          onLog={(type, label, undoFn) => { W.evLog.push({ tick: W.tick, type });
            actionsRef.current.pushUndoExt && actionsRef.current.pushUndoExt(label + " · Undo", undoFn); }} />
      )}
      {ui.spawnPick && (
        <div style={{ position:"absolute", zIndex:7,
          left: Math.min(Math.max(8, ui.spawnPick.sx - 130), Math.max(8, vp.vw - panelW - 268)),
          top: Math.max(96, ui.spawnPick.sy - 76),
          display:"flex", flexWrap:"wrap", gap:6, padding:8, borderRadius:14, maxWidth: vp.vw - panelW - 16, boxSizing:"border-box",
          background:"rgba(11,19,30,0.94)", border:"1px solid rgba(242,178,74,0.45)" }}>
          {SPECIES.LIVE.map(sp => { const c = SPECIES_META[sp].rgb; return (
            <button key={sp}
              onClick={() => actionsRef.current.seedAt(sp, ui.spawnPick.x, ui.spawnPick.y, ui.spawnPick.sx, ui.spawnPick.sy)}
              style={{ padding:"7px 9px", borderRadius:10, fontSize:11, border:"none",
                background:"rgba(21,34,51,0.95)", color:`rgb(${c[0]},${c[1]},${c[2]})`,
                fontFamily:"ui-monospace, Menlo, monospace" }}>
              ● {SPECIES_META[sp].name}</button> ); })}
          {W.sources.length < P.maxSources && ["sun","heat"].map(kind => (
            <button key={kind} onClick={() => { actionsRef.current.addSourceAt(ui.spawnPick.x, ui.spawnPick.y, ui.spawnPick.sx, ui.spawnPick.sy, kind);
                setUi(us => ({ ...us, spawnPick: null })); }}
              style={{ padding:"7px 9px", borderRadius:10, fontSize:11, border:"1px solid rgba(242,178,74,0.45)",
                background:"rgba(21,34,51,0.95)", color:"#F2B24A", fontFamily:"ui-monospace, Menlo, monospace" }}>
              {kind === "sun" ? "☀ Sun" : "♨ Heat"}</button>
          ))}
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
            bottom: sheetUp ? (srcOpen ? sheetPad + 64 : detent===0 ? 194 + 64 : detent===1 ? "48vh" : "82vh")
                            : "calc(env(safe-area-inset-bottom, 0px) + 88px)",
            padding:"10px 18px", borderRadius:20, cursor:"pointer",
            border:"1px solid rgba(242,178,74,0.7)", background:"rgba(21,34,51,0.95)",
            color:"#F2B24A", fontSize:13, fontWeight:600, whiteSpace:"nowrap",
            boxShadow:"0 2px 12px rgba(0,0,0,0.5)" }}>
          {undoChip}
        </button>
      )}
      {/* specimen card — bottom sheet on mobile, docked panel on desktop */}
      {ui.card && !desktop && !srcOpen && (
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
            overflowY: detent>=1 ? "auto" : "hidden", flex:1 }}>
            <SpecimenBody card={ui.card} tick={ui.tick} detail={detent}
              onFeed={() => actionsRef.current.feed && actionsRef.current.feed()}
              onKill={() => actionsRef.current.kill && actionsRef.current.kill()} />
          </div>
        </div>
      )}
      {/* sun card (7.L) — the selected light source: bottom sheet on mobile, docked panel on desktop */}
      {srcOpen && !desktop && (
        <div style={{ position:"absolute", left:0, right:0, bottom:0, height: sheetPad - 16,
          background:"rgba(21,34,51,0.92)", backdropFilter:"blur(10px)",
          borderTop:"1px solid rgba(242,178,74,0.35)", borderRadius:"16px 16px 0 0",
          color:COL.plankTxt, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div className="mc-scroll" style={{ padding:"14px 18px calc(env(safe-area-inset-bottom, 0px) + 12px)", overflowY:"auto", flex:1 }}>
            <SourceCard k={ui.srcSel} mono={mono} actions={actionsRef} lightMul={ui.lightMul}
              onClose={() => actionsRef.current.selectSource(-1)} onLog={srcLog} />
          </div>
        </div>
      )}
      {/* speed control */}
      {(srcOpen || !ui.card || detent === 0 || desktop) && (
      <button className="mc-fab" onPointerDown={fabDown} onPointerUp={fabUp} onPointerCancel={fabUp}
        title={vp.fine ? "Space play/pause · 1 2 3 speed · . step" : undefined}
        aria-label={ui.speed === 0 ? "Play (long-press: step one tick)" : `Speed ${ui.speed}x (long-press: step one tick)`}
        style={{ position:"absolute", right:16, zIndex:6,
        bottom: sheetUp ? sheetPad : "calc(env(safe-area-inset-bottom, 0px) + 20px)",
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
          {panelKind === "src" ? (
            <>
              <div style={{ display:"flex", alignItems:"center", padding:"14px 16px 10px", flexShrink:0 }}>
                <span style={{ fontSize:11, letterSpacing:1.4, color:"#F2B24A", fontFamily:mono }}>ENERGY SOURCE</span>
                <button className="mc-hit" onClick={() => actionsRef.current.selectSource(-1)}
                  title="Close (Esc)"
                  style={{ marginLeft:"auto", width:28, height:28, borderRadius:8, cursor:"pointer",
                    border:"1px solid rgba(94,115,134,0.3)", background:"transparent",
                    color:COL.silt, fontSize:13, lineHeight:1 }}>✕</button>
              </div>
              <div className="mc-scroll" style={{ padding:"0 16px 18px", overflowY:"auto", flex:1 }}>
                <SourceCard k={ui.srcSel} desktop mono={mono} actions={actionsRef} lightMul={ui.lightMul} onLog={srcLog} />
              </div>
            </>
          ) : panelKind === "card" ? (
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

// Phase 6.0 — evolution settings. Every control is an intervention: it goes through the event
// queue (logged, undoable, replay-safe) and never writes P or TRAITS directly. Amber = the hand.
function EvolutionPanel({ desktop, mono, onLog }){
  const loci = []; for (let sp=0; sp<7; sp++) TRAITS[sp].loci.forEach((_, k) => loci.push({ sp, k })); // one row per (species, locus)
  const read = () => ({ mutation: P.mutation, rows: loci.map(({ sp, k }) => ({ sp, k, sigma: TRAITS[sp].loci[k].sigma, curve: TRAITS[sp].loci[k].curve })) });
  const [evo, setEvo] = React.useState(read);
  const [open, setOpen] = React.useState(desktop);
  const [advanced, setAdvanced] = React.useState(false);
  // 6.1: the effect slopes are prices; "balance" marks the value where the 5.x price surfaces held the locus mid-corridor
  const PRICE_KEYS = ["escSlope","kpSlope","catchSlope","kbSlope","lightSlope","rateSlope","effSlope"];
  const BALANCE = { 1:{ kpSlope:0.5 }, 2:{ kbSlope:0.15 }, 0:{ lightSlope:0.5 }, 3:{ effSlope:0.15, rateSlope:0.5 } };
  // 6.3: presets are one intervention each -- a bundle of events, one log entry, one undo that restores every prev
  const PRESETS = {
    shipped: { label:"Shipped", mutation:true,  set:(sp,L)=>({ sigma:L.sigma0, curve:0 }) },
    settled: { label:"Settled", mutation:true,  set:(sp,L)=>({ curve:0.3 }) },
    wild:    { label:"Wild",    mutation:true,  set:(sp,L)=>({ curve:-0.2, sigma:Math.min(0.12, L.sigma0*2) }) },
    frozen:  { label:"Frozen",  mutation:false, set:()=>({}) },
  };
  const shipped = React.useRef(loci.map(({ sp, k }) => ({ sp, k, sigma0: TRAITS[sp].loci[k].sigma }))); // captured on first mount
  const applyPreset = name => {
    const pr = PRESETS[name]; const prevs = [];
    if (P.mutation !== pr.mutation){ prevs.push({ type:"mutation", v:P.mutation }); queueEvent({ type:"mutation", v:pr.mutation }); }
    for (const { sp, k } of loci){ const L = TRAITS[sp].loci[k], s0 = shipped.current.find(x => x.sp===sp && x.k===k).sigma0;
      const vals = pr.set(sp, { ...L, sigma0:s0 });
      for (const key in vals){ if (Math.abs(L[key]-vals[key]) < 1e-9) continue; prevs.push({ type:"locus", sp, locus:k, key, v:L[key] }); queueEvent({ type:"locus", sp, locus:k, key, v:vals[key] }); } }
    if (prevs.length) onLog("preset", "Preset: " + pr.label, () => prevs.forEach(e => queueEvent(e)));
    setTimeout(() => setEvo(read), 150);
  };
  const dragStart = React.useRef({});   // value at the start of a drag, so one drag = one undo
  const logTimer = React.useRef({});
  React.useEffect(() => { const iv = setInterval(() => setEvo(read), 1000); return () => clearInterval(iv); }, []);
  const amber = "#F2B24A";
  const commit = (sp, kL, key, v, label) => {
    const k = sp + ":" + kL + ":" + key;
    if (dragStart.current[k] === undefined) dragStart.current[k] = TRAITS[sp].loci[kL][key];
    queueEvent({ type:"locus", sp, locus:kL, key, v });
    setEvo(e => ({ ...e, rows: e.rows.map(r => r.sp === sp && r.k === kL ? { ...r, [key]: v } : r) }));
    clearTimeout(logTimer.current[k]);
    logTimer.current[k] = setTimeout(() => {
      const prev = dragStart.current[k]; dragStart.current[k] = undefined;
      if (prev !== undefined && Math.abs(prev - v) > 1e-9)
        onLog("evolution", label, () => queueEvent({ type:"locus", sp, locus:kL, key, v: prev }));
    }, 700);
  };
  const toggleMutation = () => {
    const prev = P.mutation, v = !prev;
    queueEvent({ type:"mutation", v }); setEvo(e => ({ ...e, mutation: v }));
    onLog("mutation", v ? "Mutation on" : "Mutation off", () => queueEvent({ type:"mutation", v: prev }));
  };
  const slider = (sp, kL, key, min, max, step, label) => { const row = evo.rows.find(r => r.sp === sp && r.k === kL); return (
    <input type="range" min={min} max={max} step={step} value={row ? row[key] : 0}
      onChange={e => commit(sp, kL, key, +e.target.value, label)}
      title={label} style={{ width: desktop ? 110 : 84, accentColor: amber }} /> ); };
  return (
    <div style={{ position:"absolute", top: 126, left:"50%", transform:"translateX(-50%)", zIndex:5,
      padding:"6px 12px 8px", borderRadius:12, background:"rgba(11,19,30,0.78)", border:"1px solid rgba(242,178,74,0.35)",
      color:"#C9D7E3", fontSize:11, fontFamily:mono, maxWidth:"calc(100vw - 24px)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <button className="mc-hit" onClick={() => setOpen(o => !o)}
          style={{ background:"transparent", border:"none", color:amber, cursor:"pointer", font:"inherit", padding:0 }}>
          {open ? "▾" : "▸"} Evolution</button>
        <button className="mc-hit mc-hit-amber" onClick={toggleMutation}
          style={{ marginLeft:"auto", padding:"3px 9px", borderRadius:8, cursor:"pointer", font:"inherit", fontSize:10,
            border:"1px solid rgba(242,178,74,0.6)", background: evo.mutation ? "rgba(242,178,74,0.18)" : "transparent",
            color: evo.mutation ? amber : "#8FA3B5" }}>
          mutation {evo.mutation ? "on" : "off"}</button>
      </div>
      {open && (
        <div style={{ display:"grid", gridTemplateColumns:"auto auto auto", gap:"4px 10px", alignItems:"center", marginTop:6 }}>
          <span style={{ color:"#5E7386", fontSize:9 }}></span>
          <span style={{ color:"#5E7386", fontSize:9 }}>mutation rate</span>
          <span style={{ color:"#5E7386", fontSize:9 }}>trade-off curve</span>
          {evo.rows.map(r => { const c = SPECIES_META[r.sp].rgb, lab = TRAITS[r.sp].loci[r.k].label; return (
            <React.Fragment key={r.sp+"·"+r.k}>
              <span style={{ color:`rgb(${c[0]},${c[1]},${c[2]})` }}>{SPECIES_META[r.sp].name} <span style={{ color:"#5E7386" }}>{lab.toLowerCase()}</span></span>
              <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}>{slider(r.sp, r.k, "sigma", 0, 0.12, 0.005, "Mutation rate · " + SPECIES_META[r.sp].name + " " + lab)}<span style={{ width:34, color:amber }}>{r.sigma.toFixed(3)}</span></span>
              <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}>{slider(r.sp, r.k, "curve", -0.5, 0.8, 0.05, "Trade-off curvature · " + SPECIES_META[r.sp].name + " " + lab)}<span style={{ width:34, color:amber }}>{r.curve >= 0 ? "+" : ""}{r.curve.toFixed(2)}</span></span>
            </React.Fragment> ); })}
          <span style={{ gridColumn:"1 / -1", color:"rgba(242,178,74,0.7)", fontSize:9, marginTop:2 }}>
            curve &lt; 0 sweeps and splits · 0 as shipped · &gt; 0 settles to the middle</span>
          <span style={{ gridColumn:"1 / -1", display:"flex", gap:6, alignItems:"center", marginTop:4, flexWrap:"wrap" }}>
            <span style={{ color:"#5E7386", fontSize:9 }}>presets</span>
            {Object.keys(PRESETS).map(k => (
              <button key={k} className="mc-hit mc-hit-amber" onClick={() => applyPreset(k)}
                style={{ padding:"2px 8px", borderRadius:8, cursor:"pointer", font:"inherit", fontSize:10,
                  border:"1px solid rgba(242,178,74,0.45)", background:"transparent", color:amber }}>{PRESETS[k].label}</button>))}
            <button className="mc-hit" onClick={() => setAdvanced(a => !a)}
              style={{ marginLeft:"auto", padding:"2px 8px", borderRadius:8, cursor:"pointer", font:"inherit", fontSize:10,
                border:"1px solid rgba(94,115,134,0.4)", background:"transparent", color:"#8FA3B5" }}>{advanced ? "hide prices" : "prices…"}</button>
          </span>
          {advanced && evo.rows.map(r => { const L = TRAITS[r.sp].loci[r.k], c = SPECIES_META[r.sp].rgb;
            const keys = PRICE_KEYS.filter(k => L[k]); if (!keys.length) return null; return (
            <React.Fragment key={"p"+r.sp+"·"+r.k}>
              <span style={{ color:`rgb(${c[0]},${c[1]},${c[2]})`, fontSize:10, alignSelf:"start", paddingTop:3 }}>{SPECIES_META[r.sp].name} {L.label.toLowerCase()} prices</span>
              <span style={{ gridColumn:"2 / -1", display:"grid", gridTemplateColumns:"auto auto auto", gap:"2px 8px", alignItems:"center" }}>
                {keys.map(k => { const bal = r.k === 0 && BALANCE[r.sp] && BALANCE[r.sp][k]; return (
                  <React.Fragment key={k}>
                    <span style={{ color:"#5E7386", fontSize:9 }}>{k.replace("Slope","")}{bal ? <span style={{ color:"rgba(242,178,74,0.6)" }}> · balance {bal}</span> : ""}</span>
                    <input type="range" min={0} max={1} step={0.05} value={L[k]} onChange={e => commit(r.sp, r.k, k, +e.target.value, "Price · " + SPECIES_META[r.sp].name + " " + k.replace("Slope",""))}
                      style={{ width: desktop ? 110 : 84, accentColor: amber }} />
                    <span style={{ width:30, color:amber, fontSize:10 }}>{L[k].toFixed(2)}</span>
                  </React.Fragment> ); })}
              </span>
            </React.Fragment> ); })}
        </div>
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
      {detail >= 1 && SPECIES_PROFILE[card.sp] && (
        <img src={`assets/species/${SPECIES_PROFILE[card.sp].key}.jpg`} alt="" onError={e => { e.currentTarget.style.display = "none"; }}
          style={{ display:"block", width:"100%", maxHeight:200, objectFit:"cover", borderRadius:12, marginTop:12,
            border:"1px solid rgba(94,115,134,0.3)" }} />
      )}
      {detail >= 1 && SPECIES_PROFILE[card.sp] && (
        <div style={{ marginTop:10, fontSize:12.5, lineHeight:1.55 }}>
          {SPECIES_PROFILE[card.sp].intro}
        </div>
      )}
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
          {Math.abs(card.warmth) > 0.05 && (
            <div><div style={{fontSize:11,color:COL.silt}}>WARMTH HERE</div>
              {(card.warmth > 0 ? "+" : "") + card.warmth.toFixed(1)}° · upkeep ×{card.qR.toFixed(2)}
              {card.warmth > card.ctmax ? <span style={{ color:"rgb(226,96,96)" }}> · past its limit</span>
               : card.warmth > card.topt ? <span style={{ color:"rgb(206,186,120)" }}> · past its optimum</span> : null}</div>
          )}
        </div>
      )}
      {detail >= 1 && card.heredity && card.heredity.map((h, hk) => (
        <div key={hk} style={{ marginTop:14, fontSize:12, lineHeight:1.5 }}>
          <div style={{ fontSize:11, color:COL.silt }}>{h.label.toUpperCase()} · heritable</div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:4 }}>
            <span style={{ fontFamily:mono, fontSize:12 }}>{h.g.toFixed(2)}</span>
            <div style={{ flex:1, height:4, borderRadius:2, background:"rgba(11,19,30,0.8)", position:"relative" }}>
              <div style={{ position:"absolute", left:`${h.g0*100}%`, top:-3, width:1, height:10, background:"rgba(201,215,227,0.45)" }} />
              <div style={{ position:"absolute", left:`calc(${h.g*100}% - 3px)`, top:-1, width:6, height:6, borderRadius:3,
                background:`rgb(${card.rgb[0]},${card.rgb[1]},${card.rgb[2]})` }} />
            </div>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:COL.silt, marginTop:2 }}>
            <span>{h.loWord}</span><span>{h.hiWord}</span>
          </div>
          <div style={{ marginTop:4, color:COL.silt }}>
            vs founder: {h.parts.map(([nm, pct, unit], k) => (
              <span key={nm+k}>{k ? " · " : ""}<span style={{ color: pct === 0 ? COL.silt : pct > 0 ? "rgb(140,230,170)" : "rgb(226,170,150)" }}>
                {pct > 0 ? "+" : ""}{pct}{unit || "%"}</span> {nm}</span>))}
          </div>
        </div>
      ))}
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
      {detail >= 1 && SPECIES_PROFILE[card.sp] && (() => { const pf = SPECIES_PROFILE[card.sp]; return (
        <div style={{ marginTop:18, fontSize:12, lineHeight:1.5 }}>
          <div style={{ fontSize:11, color:COL.silt, letterSpacing:1.2 }}>PROFILE</div>
          <div style={{ display:"grid", gridTemplateColumns:"auto 1fr", gap:"5px 12px", marginTop:8 }}>
            {[["habitat", pf.habitat], ["behaviour", pf.behaviour], ["food", pf.food], ["eaten by", pf.eatenBy],
              ["size", pf.size], ["lifecycle", pf.lifecycle]].map(([k, v]) => (
              <React.Fragment key={k}>
                <span style={{ color:COL.silt, fontSize:10, textTransform:"uppercase", letterSpacing:0.8, paddingTop:2 }}>{k}</span>
                <span>{v}</span>
              </React.Fragment>))}
          </div>
        </div> ); })()}
      {detail >= 1 && (
        <div style={{ marginTop:18, fontSize:12, color:COL.silt, lineHeight:1.5 }}>
          Amber marks your hand: everything you do to the world, as opposed to what
          nature does, is shown in this color.
        </div>
      )}
    </>
  );
}

// 7.L/7.H — the source card: the selected ENERGY SOURCE. Two channels -- light (a sun) and warmth (a heater;
// negative = a cold source) -- plus spread; a source with both is a hot sun, with light only a sun, with warmth
// only a black heater. Sliders are levers (events, logged, undoable, one drag = one undo); a layout is one
// intervention; the light budget says plainly what the sky delivers relative to the shipped world.
// Layouts are ADDITIVE (L.2 finding, phase7-light-plan.md §11): the shipped sun stays where and what it is;
// extra sources are tight (sigma 130) and far away. Moving and shrinking the shipped sun collapsed the core.
const SOURCE_LAYOUTS = [
  { key:"one",    label:"One sun",     sources:[{ x:512, y:512, i:1.0, a:0, sigma:210 }] },
  { key:"twin",   label:"Second sun",  sources:[{ x:512, y:512, i:1.0, a:0, sigma:210 }, { x:0, y:0, i:1.0, a:0, sigma:130 }] },
  { key:"dim",    label:"Dim sun",     sources:[{ x:512, y:512, i:1.0, a:0, sigma:210 }, { x:0, y:0, i:0.7, a:0, sigma:130 }] },
  { key:"isles",  label:"Archipelago", sources:[{ x:512, y:512, i:1.0, a:0, sigma:210 }, { x:0, y:0, i:0.8, a:0, sigma:110 }, { x:0, y:512, i:0.8, a:0, sigma:110 }] },
  { key:"hot",    label:"Hot sun",     sources:[{ x:512, y:512, i:1.0, a:8, sigma:210 }] },
  { key:"heater", label:"Heater",      sources:[{ x:512, y:512, i:1.0, a:0, sigma:210 }, { x:0, y:0, i:0, a:10, sigma:130 }] },
];
const sourceKind = s => s.i > 0 && s.a > 0 ? "☀♨ Hot sun" : s.i > 0 && s.a < 0 ? "☀❄ Cold light" : s.i > 0 ? "☀ Sun" : s.a > 0 ? "♨ Heater" : s.a < 0 ? "❄ Cold source" : "○ Dark source";
function SourceCard({ k, desktop, mono, actions, lightMul, onClose, onLog }){
  const amber = "#F2B24A";
  const read = () => ({ sources: W.sources.map(s => ({ ...s })), input: lightInput() });
  const [st, setSt] = React.useState(read);
  React.useEffect(() => { const iv = setInterval(() => setSt(read), 400); return () => clearInterval(iv); }, []);
  const dragStart = React.useRef({}), logTimer = React.useRef({});
  const s = st.sources[k]; if (!s) return null;
  const commit = (key, v, label) => {
    if (dragStart.current[key] === undefined) dragStart.current[key] = W.sources[k][key];
    queueEvent({ type:"sourceSet", k, [key]: v });
    setSt(x => ({ ...x, sources: x.sources.map((q, j) => j === k ? { ...q, [key]: v } : q) }));
    clearTimeout(logTimer.current[key]);
    logTimer.current[key] = setTimeout(() => { const prev = dragStart.current[key]; dragStart.current[key] = undefined;
      if (prev !== undefined && Math.abs(prev - v) > 1e-9) onLog("sourceSet", label, () => queueEvent({ type:"sourceSet", k, [key]: prev })); }, 700);
  };
  const budget = LIGHT_REF.v ? st.input / LIGHT_REF.v : 1;
  const row = { display:"flex", alignItems:"center", gap:10, marginTop:8, fontSize:11, fontFamily:mono };
  const lab = { width:62, color:"#8FA3B5", flexShrink:0 };
  const val = { width:44, textAlign:"right", color:amber, flexShrink:0 };
  const btn = { padding:"5px 9px", borderRadius:8, cursor:"pointer", font:"inherit", fontSize:10, fontFamily:mono,
    border:"1px solid rgba(242,178,74,0.45)", background:"transparent", color:amber };
  const last = st.sources.length <= 1;
  const slider = (key, min, max, step, label) => (
    <input type="range" min={min} max={max} step={step} value={s[key]}
      onChange={e => commit(key, +e.target.value, label)} style={{ flex:1, accentColor:amber }} />);
  return (
    <div style={{ color:"#C9D7E3" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ fontSize:13, fontWeight:600, color:amber }}>{sourceKind(s)} · {k+1} of {st.sources.length}</span>
        <span style={{ fontSize:10, color:"#5E7386", fontFamily:mono, marginLeft:"auto", textAlign:"right" }}>
          light input ×{budget.toFixed(2)}<br/>of the shipped world</span>
        {onClose && <button className="mc-hit" onClick={onClose} aria-label="Close"
          style={{ border:"none", background:"transparent", color:"#5E7386", fontSize:13, cursor:"pointer", padding:"0 0 0 4px" }}>✕</button>}
      </div>
      <div style={row}><span style={lab}>light</span>{slider("i", 0, 1.5, 0.05, "Changed a source's light")}<span style={val}>{s.i.toFixed(2)}</span></div>
      <div style={row}><span style={lab}>warmth</span>{slider("a", -8, 15, 0.5, "Changed a source's warmth")}<span style={val}>{(s.a > 0 ? "+" : "") + s.a.toFixed(1)}°</span></div>
      <div style={row}><span style={lab}>spread</span>{slider("sigma", 90, 300, 10, "Changed a source's spread")}<span style={val}>{Math.round(s.sigma)}</span></div>
      <div style={{ ...row, flexWrap:"wrap", gap:6 }}>
        {SOURCE_LAYOUTS.map(L => (
          <button key={L.key} className="mc-hit" style={btn}
            onClick={() => actions.current.sourceLayout(L.sources.map(q => ({ ...q })), "Layout: " + L.label)}>{L.label}</button>))}
        <button className="mc-hit" disabled={last} onClick={() => actions.current.removeSource(k)}
          title={last ? "The world keeps at least one source" : "Remove this source (Delete)"}
          style={{ ...btn, marginLeft:"auto", opacity: last ? 0.35 : 1, borderColor:"rgba(226,96,96,0.6)", color:"rgb(226,96,96)" }}>Remove</button>
      </div>
      <div style={{ fontSize:10, color:"#5E7386", marginTop:8, lineHeight:1.5 }}>
        {st.sources.length < P.maxSources ? (desktop ? "S adds a sun, H a heater, at the view centre" : "hold on water → add a sun or a heater there") : "four sources at most"}
        {" · drag anywhere moves this one"}{Math.abs(lightMul - 1) > 1e-9 ? ` · ☀ lever ×${lightMul.toFixed(2)} on all light` : ""}
      </div>
    </div>
  );
}
