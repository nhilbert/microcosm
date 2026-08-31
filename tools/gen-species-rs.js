// Generate rust/microcosm-core/src/species_gen.rs from the BUILT JS core.
//
// Deliberately not a re-implementation of normalizeTraits: this requires dist/core.js and reads the
// already-normalized TRAITS rows, so every default, the diet bitmask fold, the loci flattening and
// the derived warmGated flag land in Rust as the same values by construction. Row order is the
// species index and part of the RNG contract — it is preserved verbatim.
//
// Generated and committed, like dist/: never hand-edit species_gen.rs; re-run this instead.
//   node tools/gen-species-rs.js
const fs = require("fs");
const path = require("path");

const C = require(path.join(__dirname, "..", "dist", "core.js"));
const TRAITS = C.TRAITS;

const NSP = TRAITS.length;

// Shortest round-trip decimal; Rust's f64 parser is correctly rounded, so this is exact.
function f(v, what) {
  if (v === undefined || v === null) return "0.0";
  if (typeof v !== "number" || !isFinite(v)) throw new Error(`non-finite/non-number ${what}: ${v}`);
  if (Object.is(v, -0)) return "-0.0";
  let s = JSON.stringify(v);
  if (/^-?\d+$/.test(s)) s += ".0";
  return s;
}
const b = v => (v ? "true" : "false");

function enumOf(kind, v, map, what) {
  if (v === undefined || v === null) {
    if (map.__default) return `${kind}::${map.__default}`;
    throw new Error(`missing ${what}`);
  }
  const r = map[v];
  if (!r) throw new Error(`unknown ${what}: ${JSON.stringify(v)}`);
  return `${kind}::${r}`;
}
const MOVEMENT = { sessile: "Sessile", drift: "Drift", steer: "Steer", tumble: "Tumble" };
const LAYER = { plankton: "Plankton", benthic: "Benthic", fungal: "Fungal", none: "None", __default: "None" };
const WAKE = { light: "Light", prey: "Prey", detritus: "Detritus" };
const TFIELD = { detritus: "Detritus", scent: "Scent", __default: "Detritus" };

// Per-prey-species digestion arrays, padded to the species count.
function digestArr(a, what) {
  const out = new Array(NSP).fill(0);
  if (a === undefined || a === null) return out.map(v => f(v));
  if (!Array.isArray(a)) throw new Error(`${what} is not an array`);
  if (a.length > NSP) throw new Error(`${what} longer than the species table (${a.length} > ${NSP})`);
  for (let i = 0; i < a.length; i++) out[i] = a[i] === undefined ? 0 : a[i];
  return out.map((v, i) => f(v, `${what}[${i}]`));
}

function locus(L) {
  return `        Locus { g0: ${f(L.g0, "g0")}, sigma: ${f(L.sigma)}, esc_slope: ${f(L.escSlope)}, kp_slope: ${f(L.kpSlope)}, ` +
    `catch_slope: ${f(L.catchSlope)}, kb_slope: ${f(L.kbSlope)}, light_slope: ${f(L.lightSlope)}, rate_slope: ${f(L.rateSlope)}, ` +
    `eff_slope: ${f(L.effSlope)}, warm_slope: ${f(L.warmSlope)}, warm_gain_slope: ${f(L.warmGainSlope)}, ` +
    `tpref_span: ${f(L.tprefSpan)}, damp_span: ${f(L.dampSpan)}, pc_speed_slope: ${f(L.pcSpeedSlope)}, ` +
    `pc_turn_slope: ${f(L.pcTurnSlope)}, tumble_slope: ${f(L.tumbleSlope)}, curve: ${f(L.curve)}, warm_gated: ${b(L.warmGated)} }`;
}

function opt(v, body) {
  return v ? `Some(${body})` : "None";
}

function row(t, sp) {
  const cyst = opt(t.cyst, t.cyst && `Cyst { enter: ${f(t.cyst.enter)}, wake: ${enumOf("Wake", t.cyst.wake, WAKE, "cyst.wake")}, ` +
    `p: ${f(t.cyst.p)}, grace: ${f(t.cyst.grace)}, sc_min: ${f(t.cyst.scMin)} }`);
  const escape = opt(t.escape, t.escape && `Escape { p: ${f(t.escape.p)}, kick: ${f(t.escape.kick)} }`);
  const det = opt(t.detritivore, t.detritivore && `Detritivore { rate_e: ${f(t.detritivore.rateE)}, eff_e: ${f(t.detritivore.effE)}, ` +
    `rate_p: ${f(t.detritivore.rateP)}, eff_p: ${f(t.detritivore.effP)}, min_rate: ${f(t.detritivore.minRate)} }`);
  const cor = opt(t.corpsivore, t.corpsivore && `Corpsivore { rate: ${f(t.corpsivore.rate)}, eff_e: ${f(t.corpsivore.effE)}, ` +
    `eff_p: ${f(t.corpsivore.effP)}, radius: ${f(t.corpsivore.radius)}, min_mass: ${f(t.corpsivore.minMass)}, ` +
    `max_mass: ${f(t.corpsivore.maxMass)}, diet_only: ${b(t.corpsivore.dietOnly)} }`);
  const flee = opt(t.flee, t.flee && `Flee { sense: ${f(t.flee.sense)}, dur: ${f(t.flee.dur)}, speed_mul: ${f(t.flee.speedMul)} }`);
  const burst = opt(t.burst, t.burst && `Burst { mul: ${f(t.burst.mul)}, dur: ${f(t.burst.dur)}, cd: ${f(t.burst.cd)}, range: ${f(t.burst.range)} }`);

  return `    // ${sp}: ${t.name}
    Species {
        name: ${JSON.stringify(t.name)},
        body_tag: ${t.bodyTag | 0},
        layer: ${enumOf("Layer", t.layer, LAYER, "layer")},
        movement: ${enumOf("Movement", t.movement, MOVEMENT, "movement")},
        photosynth: ${b(t.photosynth)},
        kp: ${f(t.kp)}, kb: ${f(t.kb)}, m_up: ${f(t.mUp)}, m_qm: ${f(t.mQm)}, p_synth: ${f(t.pSynth)},
        torpor: ${f(t.torpor)}, cyst_yield: ${f(t.cystYield)}, cyst_drain_mul: ${f(t.cystDrainMul)},
        damp: ${f(t.damp)}, noise: ${f(t.noise)}, phototaxis: ${f(t.phototaxis)}, drift_speed: ${f(t.driftSpeed)}, move_cost_mul: ${f(t.moveCostMul)},
        speed: ${f(t.speed)}, sense: ${f(t.sense)}, turn_rate: ${f(t.turnRate)}, satiation: ${f(t.satiation)},
        interf_radius: ${f(t.interfRadius)}, interf_cost: ${f(t.interfCost)}, handling: ${f(t.handling)},
        tumble_low: ${f(t.tumbleLow)}, tumble_high: ${f(t.tumbleHigh)}, tumble_field: ${enumOf("TumbleField", t.tumbleField, TFIELD, "tumbleField")},
        diet: ${t.diet | 0}, bite: ${f(t.bite)},
        digest: [${digestArr(t.digest, "digest").join(", ")}],
        digest_p: [${digestArr(t.digestP, "digestP").join(", ")}],
        graze_floor: ${f(t.grazeFloor)}, pursuit_penalty: ${f(t.pursuitPenalty)}, alarm_emit: ${f(t.alarmEmit)},
        topt: ${f(t.topt)}, ctmax: ${f(t.ctmax)}, thermo: ${f(t.thermo)},
        hazard: ${f(t.hazard)}, repro_frac: ${f(t.reproFrac)}, spread: ${f(t.spread)},
        repro_cooldown: ${f(t.reproCooldown)}, mature_cd: ${f(t.matureCd)},
        settle_limited: ${b(t.settleLimited)}, settle_limit: ${f(t.settleLimit)},
        cyst: ${cyst},
        escape: ${escape},
        detritivore: ${det},
        corpsivore: ${cor},
        flee: ${flee},
        burst: ${burst},
        live: ${b(t.live)}, apex: ${b(t.apex)}, mat: ${b(t.mat)},
        loci: vec![
${t.loci.map(locus).join(",\n")}${t.loci.length ? "\n" : ""}        ],
    }`;
}

const out = `// GENERATED by tools/gen-species-rs.js from dist/core.js — DO NOT EDIT.
// Row order is the species index and part of the RNG contract (src/sim/species.json).
// Regenerate with:  node tools/gen-species-rs.js
use crate::traits::*;

/// ${NSP} rows, in species-index order.
pub fn species_table() -> Vec<Species> {
    vec![
${TRAITS.map(row).join(",\n")},
    ]
}
`;

const dest = path.join(__dirname, "..", "rust", "microcosm-core", "src", "species_gen.rs");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log(`wrote ${dest}  (${NSP} species, ${out.length} bytes)`);

// The same normalized rows as JSON, for the WASM shim's TRAITS mirror. Emitted here, from the same
// source, so the Rust table and the shim's view of it cannot drift. Numeric locus fields are
// re-bound to live WASM accessors by the shim; everything else (names, labels, flags) is static.
const jsonDest = path.join(__dirname, "..", "rust", "wasm", "species-normalized.json");
fs.mkdirSync(path.dirname(jsonDest), { recursive: true });
fs.writeFileSync(jsonDest, JSON.stringify(TRAITS, null, 1));
console.log(`wrote ${jsonDest}`);
