// The Rust core, presented as `dist/core.js`.
//
// Point any harness at it and the existing acceptance battery runs against the ported core:
//
//   MC_CORE=rust/wasm/core.js node harness/tune2.js
//
// The world's columns live in WASM linear memory and are exposed here as typed-array views over
// it, so `W.x[i]`, `W.g[k*MAXN+i]` and `pin()`-style writes work exactly as they do against the
// JavaScript core — including writes, which land in the same memory the tick reads. Scalars
// (`W.n`, `W.tick`, `P.mutation`, …) are accessor properties backed by calls, so they are always
// live rather than snapshots.
//
// The observatory is here too: `W.rec`, `W.recHead/recCount` and `W.sysEvents` (decoded from WASM
// memory on read). Still absent are the on-demand read-outs built on top of it — `indicators`,
// `impact` and the level API — which throw rather than silently returning undefined, so a harness
// that needs them fails loudly instead of quietly measuring nothing.
const fs = require("fs");
const path = require("path");

const WASM = path.join(__dirname, "..", "microcosm-core", "target", "wasm32-unknown-unknown", "release", "microcosm_core.wasm");
if (!fs.existsSync(WASM))
  throw new Error("microcosm_core.wasm not built — run: npm run wasm");

const instance = new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(WASM)), {});
const X = instance.exports;
const MEM = X.memory;
X.mc_boot();

// ---------- constants (mirrored from src/sim/params.js; asserted against Rust below) ----------
const MAXN = 6000, MAXLOCI = 4, GRID = 64, WORLD = 1024, CELL = WORLD / GRID;
const NCELL = GRID * GRID, MAXCORPSE = 1500;
const REC = { N: 900, STRIDE: 20, CH: 141 };
const TAG = { SOLARA: 1, DRIFTA: 2, CILIO: 4, BACILLUS: 8, MYCORA: 16, NECRO: 32, VENATOR: 64 };

// ---------- array columns: id -> [name, constructor, length] ----------
const COLS = [
  [0, "x", Float32Array, MAXN], [1, "y", Float32Array, MAXN],
  [2, "vx", Float32Array, MAXN], [3, "vy", Float32Array, MAXN],
  [4, "en", Float32Array, MAXN], [5, "sz", Float32Array, MAXN],
  [6, "sp", Uint8Array, MAXN], [7, "alive", Uint8Array, MAXN],
  [8, "hd", Float32Array, MAXN], [9, "mn", Float32Array, MAXN],
  [10, "pr", Float32Array, MAXN], [11, "mem", Float32Array, MAXN],
  [12, "g", Float32Array, MAXLOCI * MAXN],
  [13, "cy", Uint8Array, MAXN], [14, "gr", Int16Array, MAXN],
  [15, "handle", Int16Array, MAXN], [16, "cd", Int16Array, MAXN],
  [17, "flee", Int16Array, MAXN], [18, "bst", Int16Array, MAXN],
  [19, "pc", Int16Array, MAXN], [20, "lg", Uint16Array, MAXN],
  [21, "gen", Uint16Array, MAXN], [22, "birth", Int32Array, MAXN],
  [23, "szPow", Float64Array, MAXN],
  [24, "px", Float32Array, MAXN], [25, "py", Float32Array, MAXN],
  [30, "M", Float32Array, NCELL], [31, "dE", Float32Array, NCELL],
  [32, "dP", Float32Array, NCELL], [33, "dM", Float32Array, NCELL],
  [34, "sc", Float32Array, NCELL], [35, "al", Float32Array, NCELL],
  [36, "light", Float32Array, NCELL], [37, "temp", Float32Array, NCELL],
  [38, "qR", Float32Array, NCELL], [39, "qP", Float32Array, NCELL],
  [40, "qD", Float32Array, NCELL], [41, "qH", Float32Array, NCELL],
  [42, "qS", Float32Array, NCELL], [43, "qA", Float32Array, NCELL],
  [44, "pB", Float32Array, NCELL], [45, "bB", Float32Array, NCELL],
  [46, "fB", Float32Array, NCELL],
  [47, "lgx", Float32Array, NCELL], [48, "lgy", Float32Array, NCELL],
  [49, "tgx", Float32Array, NCELL], [50, "tgy", Float32Array, NCELL],
  [51, "wShade", Float32Array, NCELL],
  [60, "cAlive", Uint8Array, MAXCORPSE], [61, "cX", Float32Array, MAXCORPSE],
  [62, "cY", Float32Array, MAXCORPSE], [63, "cE", Float32Array, MAXCORPSE],
  [64, "cP", Float32Array, MAXCORPSE], [65, "cM", Float32Array, MAXCORPSE],
  [66, "cSz", Float32Array, MAXCORPSE], [67, "cSp", Uint8Array, MAXCORPSE],
];

const W = {};
let boundBuffer = null;
function bindViews(){
  boundBuffer = MEM.buffer;
  for (const [id, name, Ctor, len] of COLS) W[name] = new Ctor(boundBuffer, X.mc_ptr(id), len);
  if (X.mc_rec_ptr) W.rec = new Float32Array(boundBuffer, X.mc_rec_ptr(), REC.N * REC.CH);
}
// WASM memory grows only if the core allocates (a wall's face list, say). Growth detaches every
// view, so re-bind whenever the buffer identity changes. The core pre-reserves its growable
// structures, which makes this a safety net rather than a hot path.
function sync(){ if (MEM.buffer !== boundBuffer) bindViews(); }
bindViews();

// ---------- scalars ----------
const SC = { n:0, tick:1, cN:2, rngState:3, addedM:4, initialized:5, wallsOn:6,
  nSources:7, nWalls:8, nEventLog:9, seed:10, nFree:11, lightDirty:12,
  recHead:13, recCount:14 };
const FLOW = ["uptake","release","excrete","transfer","egestE","egestP","leachM",
  "corpseToDet","bacRelease","gpp","resp","deaths"];

for (const [name, id] of Object.entries(SC)){
  const bool = (name === "initialized" || name === "wallsOn" || name === "lightDirty");
  Object.defineProperty(W, name, {
    get(){ const v = X.mc_scalar(id); return bool ? v !== 0 : v; },
    set(v){ X.mc_set_scalar(id, bool ? (v ? 1 : 0) : v); },
    enumerable: true,
  });
}

// W.flows — read-only accessors; the harnesses only ever read these meters.
const flows = {};
FLOW.forEach((name, k) => Object.defineProperty(flows, name, {
  get(){ return X.mc_scalar(20 + k); }, enumerable: true }));
Object.defineProperty(flows, "deathsBy", {
  get(){ const a = []; for (let i = 0; i < 7; i++) a.push(X.mc_scalar(32 + i)); return a; },
  enumerable: true });
W.flows = flows;

// W.sources / W.walls — live mirrors, rebuilt on read (they are small and read rarely).
Object.defineProperty(W, "sources", { get(){
  const n = X.mc_scalar(SC.nSources), out = [];
  for (let k = 0; k < n; k++) out.push({ x: X.mc_source_get(k,0), y: X.mc_source_get(k,1),
    i: X.mc_source_get(k,2), a: X.mc_source_get(k,3), sigma: X.mc_source_get(k,4) });
  return out; }, enumerable: true });
Object.defineProperty(W, "walls", { get(){
  const n = X.mc_scalar(SC.nWalls), out = [];
  for (let k = 0; k < n; k++) out.push({ x0: X.mc_wall_get(k,0), y0: X.mc_wall_get(k,1),
    dx: X.mc_wall_get(k,2), dy: X.mc_wall_get(k,3), lt: X.mc_wall_get(k,4), ht: X.mc_wall_get(k,5),
    fl: X.mc_wall_get(k,6), pass: X.mc_wall_get(k,7), faces: { length: X.mc_wall_get(k,8) } });
  return out; }, enumerable: true });

// W.eventLog — the applied-event log. Its length is live; the entries themselves are not
// marshalled across the boundary, so indexing throws rather than returning a plausible-looking
// undefined. (Replay from the log is a save/load concern, M5.)
Object.defineProperty(W, "eventLog", { get(){
  return new Proxy({}, {
    get(_, k){
      if (k === "length") return X.mc_scalar(SC.nEventLog);
      if (typeof k === "string" && /^\d+$/.test(k))
        throw new Error("wasm core: event-log entries are not marshalled to JS (M5 of docs/android-port-plan.md); only .length is available");
      return undefined;
    } });
  }, enumerable: true });

// ---------- observatory ----------
// W.rec is a live view over the recorder ring (allocated once, so the view stays valid);
// W.sysEvents is rebuilt on read, decoding each event's type and text from WASM memory.
W.rec = new Float32Array(MEM.buffer, X.mc_rec_ptr(), REC.N * REC.CH);
const DEC = new TextDecoder();
const evStr = (i, which) => {
  const p = X.mc_sysev_ptr(i, which), n = X.mc_sysev_len(i, which);
  return n === 0 ? "" : DEC.decode(new Uint8Array(MEM.buffer, p, n));
};
Object.defineProperty(W, "sysEvents", { get(){
  const n = X.mc_sysev_count(), out = [];
  for (let i = 0; i < n; i++){
    const locus = X.mc_sysev_num(i, 2);
    const e = { tick: X.mc_sysev_num(i, 0), type: evStr(i, 0), sp: X.mc_sysev_num(i, 1), text: evStr(i, 1) };
    if (locus >= 0) e.locus = locus;
    out.push(e);
  }
  return out; }, enumerable: true });

// ---------- P ----------
const P = {
  WORLD, GRID, ambient: 0.03, sunSigma: 210, sunI: 1.0, maxSources: 4, maxWalls: 8,
  q10: { resp: 2.5, photo: 1.6, decomp: 2.0, handling: 0.65, pursuit: 1.3, attack: 1.8 },
  divPlank: 70, divBenth: 150, shadeMax: 0.95, moveCost: 0.003, capMul: 10, invest: 0.5,
  mutSigma: 0.08, M0: 2.2, mDiff: 0.22, mQuota: 0.6, mCapMul: 1.2, mReproMin: 0.5,
  pQuota: 0.5, pReproMin: 0.5, pSynthEff: 0.6, dLeach: 0.0015, sBody: 1.0,
  corpseDecay: 0.008, scentEmit: 0.015, scentDecay: 0.97, scentDiff: 0.12, TICK_MS: 100,
};
// The four settings the core actually owns are accessors, so writes reach Rust.
for (const [name, id, bool] of [["mutation",50,true], ["lightMul",51,false],
    ["tempAmb",52,false], ["spawnDecomposers",53,true], ["SEED",54,false]])
  Object.defineProperty(P, name, {
    get(){ const v = X.mc_scalar(id); return bool ? v !== 0 : v; },
    set(v){ X.mc_set_scalar(id, bool ? (v ? 1 : 0) : v); },
    enumerable: true });

// ---------- TRAITS ----------
// Static shape from the generated JSON; every numeric locus field (and the few species fields a
// harness pokes) is re-bound to a live accessor, so a write here lands in the Rust table and a
// read after initWorld sees the restored value rather than a stale copy.
const LOCUS_KEYS = ["sigma","curve","escSlope","kpSlope","catchSlope","kbSlope","lightSlope",
  "rateSlope","effSlope","warmSlope","warmGainSlope","tprefSpan","dampSpan","pcSpeedSlope",
  "pcTurnSlope","tumbleSlope"];
const TRAITS = JSON.parse(fs.readFileSync(path.join(__dirname, "species-normalized.json"), "utf8"));
TRAITS.forEach((t, sp) => {
  t.loci.forEach((L, k) => {
    LOCUS_KEYS.forEach((key, ki) => {
      delete L[key];
      Object.defineProperty(L, key, {
        get(){ return X.mc_locus_get(sp, k, ki); },
        set(v){ X.mc_locus_set(sp, k, ki, v); },
        enumerable: true });
    });
  });
  t.locus = t.loci.length ? t.loci[0] : null;
  for (const [key, id] of [["thermo", 0], ["topt", 1], ["ctmax", 2]]){
    delete t[key];
    Object.defineProperty(t, key, {
      get(){ return X.mc_trait_get(sp, id); },
      set(v){ X.mc_trait_set(sp, id, v); },
      enumerable: true });
  }
});

const SPECIES = {
  ALL: TRAITS.map((_, sp) => sp),
  LIVE: TRAITS.map((T, sp) => T.live ? sp : -1).filter(sp => sp >= 0),
  CORE: TRAITS.map((T, sp) => T.live && !T.apex ? sp : -1).filter(sp => sp >= 0),
  APEX: TRAITS.findIndex(T => T.apex),
  MAT: TRAITS.findIndex(T => T.mat),
  LOCI: TRAITS.map((T, sp) => T.locus ? sp : -1).filter(sp => sp >= 0),
  MOBILE: TRAITS.map((T, sp) => T.live && T.movement !== "sessile" ? sp : -1).filter(sp => sp >= 0),
  PREY: 1, GRAZER: 2,
};

// ---------- functions ----------
const wrap = v => { v %= WORLD; return v < 0 ? v + WORLD : v; };
const wd = d => { if (d > WORLD / 2) d -= WORLD; if (d < -WORLD / 2) d += WORLD; return d; };
const cellOf = i => (Math.floor(W.y[i]/CELL)&(GRID-1))*GRID + (Math.floor(W.x[i]/CELL)&(GRID-1));
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

function resetWorld(){ X.mc_reset(); sync(); }
function initWorld(seed, sc){
  if (sc === undefined) X.mc_init(seed === undefined ? 0 : seed|0, seed === undefined ? 0 : 1);
  else {
    const f = i => (sc.found && sc.found[i] !== undefined) ? (sc.found[i]|0) : -1;
    X.mc_init_scenario(seed === undefined ? 0 : seed|0, seed === undefined ? 0 : 1,
      f(0), f(1), f(2), f(3), f(4), f(5), f(6),
      sc.M0 === undefined ? 0 : +sc.M0, sc.M0 === undefined ? 0 : 1);
  }
  sync();
}
function step(){ X.mc_step(); sync(); }

// Events. `queue` mirrors queueEvent (applied at the next tick boundary, with the coalescing
// rules); applyEvent applies immediately, as in the JS.
function dispatch(ev, queue){
  const q = queue ? 1 : 0;
  const u = v => v === undefined;
  switch (ev.type){
    case "fertilize":   X.mc_event_fertilize(+ev.x, +ev.y, +ev.amount, q); break;
    case "lightMul":    X.mc_event_light_mul(+ev.v, q); break;
    case "mutation":    X.mc_event_mutation(ev.v ? 1 : 0, q); break;
    case "spawnPack":   X.mc_event_spawn_pack(ev.sp|0, +ev.x, +ev.y, q); break;
    case "locus": {
      const ki = LOCUS_KEYS.indexOf(ev.key);
      if (ki >= 0) X.mc_event_locus(ev.sp|0, (ev.locus|0), ki, +ev.v, q);
      break; }
    case "source":      X.mc_event_source(ev.k|0, +ev.x, +ev.y, q); break;
    case "sourceAdd":   X.mc_event_source_add(+ev.x, +ev.y, u(ev.i)?0:+ev.i, u(ev.i)?0:1,
                          u(ev.a)?0:+ev.a, u(ev.a)?0:1, u(ev.sigma)?0:+ev.sigma, u(ev.sigma)?0:1,
                          u(ev.at)?-1:(ev.at|0), q); break;
    case "sourceRemove":X.mc_event_source_remove(ev.k|0, q); break;
    case "sourceSet":   X.mc_event_source_set(ev.k|0, u(ev.i)?0:+ev.i, u(ev.i)?0:1,
                          u(ev.a)?0:+ev.a, u(ev.a)?0:1, u(ev.sigma)?0:+ev.sigma, u(ev.sigma)?0:1, q); break;
    case "wallAdd":     X.mc_event_wall_add(+ev.x0||0, +ev.y0||0, +ev.dx||0, +ev.dy||0,
                          u(ev.lt)?0:+ev.lt, u(ev.ht)?0:+ev.ht, u(ev.fl)?0:+ev.fl,
                          u(ev.pass)?0:(ev.pass|0), u(ev.at)?-1:(ev.at|0), q); break;
    case "wallRemove":  X.mc_event_wall_remove(ev.k|0, q); break;
    case "wallSet":     X.mc_event_wall_set(ev.k|0, u(ev.lt)?0:+ev.lt, u(ev.lt)?0:1,
                          u(ev.ht)?0:+ev.ht, u(ev.ht)?0:1, u(ev.fl)?0:+ev.fl, u(ev.fl)?0:1,
                          u(ev.pass)?0:(ev.pass|0), u(ev.pass)?0:1, q); break;
    case "feed":        X.mc_event_feed(ev.i|0, ev.gen|0, +ev.frac, q); break;
    case "kill":        X.mc_event_kill(ev.i|0, ev.gen|0, q); break;
    default:
      throw new Error(`wasm core: event "${ev.type}" is not implemented (undo/snapshot events are UI-side; see docs/android-port-plan.md M5)`);
  }
  sync();
}
const queueEvent = ev => dispatch(ev, true);
const applyEvent = ev => dispatch(ev, false);

// indicators() — the health dashboard, assembled from the core's own numbers. Same shape as the
// JavaScript version, including which fields are null.
const nn = v => (Number.isNaN(v) ? null : v);
function indicators(){
  if (!X.mc_ind_ok()) return null;
  const strain = [];
  for (let sp = 0; sp < 7; sp++){
    if (!X.mc_ind_strain(sp, 0)){ strain.push(null); continue; }
    const st = { level: X.mc_ind_strain(sp,1), reserve: X.mc_ind_strain(sp,2),
      trend: X.mc_ind_strain(sp,3), popTrend: X.mc_ind_strain(sp,4) };
    if (X.mc_ind_strain(sp,5)){ st.dAc1 = X.mc_ind_strain(sp,6); st.varX = X.mc_ind_strain(sp,7); }
    strain.push(st);
  }
  const ven = X.mc_ind_venator(0)
    ? { reserve: X.mc_ind_venator(1), preyLossRate: X.mc_ind_venator(2) } : null;
  return {
    adaptability: nn(X.mc_ind_num(0)), variety: X.mc_ind_num(1), prodVsCons: X.mc_ind_num(2),
    recyclingMin: nn(X.mc_ind_num(3)), lockedPct: X.mc_ind_num(4),
    pyramid: { producers: X.mc_ind_num(5), grazers: X.mc_ind_num(6),
               decomposers: X.mc_ind_num(7), predators: X.mc_ind_num(8) },
    strain, venator: ven,
  };
}

// Still JS-only: impact() and the level API. Fail loudly rather than let a gate quietly measure
// nothing.
const notYet = name => () => {
  throw new Error(`wasm core: ${name} is not ported yet (docs/android-port-plan.md) — run this harness against dist/core.js`);
};

module.exports = {
  W, P, TRAITS, TAG, REC, SPECIES, MAXN, MAXLOCI, CELL,
  resetWorld, initWorld, step, queueEvent, applyEvent,
  wrap, wd, cellOf, mulberry32,
  indicators, impact: notYet("impact"),
  levelCheck: notYet("levelCheck"), levelStart: notYet("levelStart"),
};
