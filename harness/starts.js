// Phase 9 S — the sandbox start worlds: measurement and acceptance.
//
// A start world is a pond the front door offers. The table lives in ONE place, the crate's
// `starts.rs`, and reaches this harness the way the level table does: as the JSON the core
// carries (`C.STARTS`). So the numbers measured here are the numbers that ship.
//
// Modes:
//   (default)   ACCEPTANCE — every start, 8 seeds x 18,000 ticks, held to its own criterion.
//               Exits non-zero if any start fails. This is what makes "calibrated" a claim
//               rather than a hope.
//   --check     the two identity gates, fast (3,000 ticks, 2 seeds):
//                 * `pond` composes nothing, so founding it must be bit-identical to the
//                   shipped `initWorld(seed)` — the sandbox's own world, unchanged.
//                 * every start founded by the CRATE must be bit-identical to the same start
//                   composed here out of ordinary events. That is what licenses --sweep: a
//                   sweep perturbs the JS composition, and this gate says the composition is
//                   the real one.
//   --empty     the `still` criterion in full: it stays empty, its mineral stays flat, and it
//               is HABITABLE — a scripted player founds a community in it that holds.
//   --sweep [key]  the calibration instrument: perturb one start's numbers around the shipped
//               values and print the ecology each variant produces. 3 seeds x 9,000 ticks.
//
// The acceptance criterion for a populated start is tune2's, deliberately unchanged: Solara,
// Drifta, Cilio and Bacillus persist to the horizon (the grazer only after its founding
// transient) and the mineral audit stays flat. Venator is reported, never required.
const L = require("./lib.js");
const { C, W, P, SEEDS, HORIZON, pops, auditM, coreCollapsed } = L;
const argv = process.argv.slice(2);

if (!C.STARTS || !C.startWorld) {
  console.error("this core has no start table — starts live in the Rust core; run with MC_CORE=$PWD/rust/wasm/core.js");
  process.exit(2);
}
const STARTS = C.STARTS;

// ---------------------------------------------------------------------------
// composition

/** Found start `k` the way the crate does it. The one call the app makes. */
function founded(k, seed, mutation = true) {
  P.mutation = mutation;
  C.startWorld(k, seed);
}

/** The same world, composed here out of ordinary events. --check proves the two agree. */
function composed(spec, seed, mutation = true) {
  P.mutation = mutation;
  C.resetWorld();
  const overrides = spec.found.some(c => c >= 0) || spec.M0 !== undefined;
  if (overrides) {
    const found = {};
    spec.found.forEach((c, i) => { if (c >= 0) found[i] = c; });
    C.initWorld(seed, { found, M0: spec.M0 });
  } else C.initWorld(seed);
  spec.sky.forEach((s, i) => {
    if (i === 0) {
      C.applyEvent({ type: "source", k: 0, x: s.x, y: s.y });
      C.applyEvent({ type: "sourceSet", k: 0, i: s.i, a: s.a, sigma: s.sigma });
    } else C.applyEvent({ type: "sourceAdd", x: s.x, y: s.y, i: s.i, a: s.a, sigma: s.sigma });
  });
  spec.walls.forEach(w => C.applyEvent({ type: "wallAdd", ...w }));
  spec.packs.forEach(p => C.applyEvent({ type: "spawnPack", sp: p.sp, x: p.x, y: p.y }));
}

const clone = o => JSON.parse(JSON.stringify(o));

// ---------------------------------------------------------------------------
// measurement

/** The whole-world state fingerprint the identity gates compare (walls.js's, verbatim in spirit). */
function fp() {
  const p = [0, 0, 0, 0, 0, 0, 0]; let sx = 0, se = 0, sm = 0;
  for (let i = 0; i < W.n; i++) {
    if (!W.alive[i]) continue;
    p[W.sp[i]]++; sx += W.x[i] + W.y[i]; se += W.en[i]; sm += W.mn[i];
  }
  let fM = 0, lit = 0;
  for (let c = 0; c < P.GRID * P.GRID; c++) { fM += W.M[c]; lit += W.light[c]; }
  return JSON.stringify({ p, sx: +sx.toFixed(3), se: +se.toFixed(3), sm: +sm.toFixed(3),
    fM: +fM.toFixed(3), lit: +lit.toFixed(4) });
}

/** Mean light and warmth over the grid — what a start's sky is worth, before any life reads it. */
function sky() {
  let lit = 0, warm = 0, hot = 0;
  for (let c = 0; c < P.GRID * P.GRID; c++) {
    lit += W.light[c]; warm += W.temp[c]; if (W.temp[c] >= 1) hot++;
  }
  const n = P.GRID * P.GRID;
  return { light: lit / n, temp: warm / n, hotShare: hot / n };
}

/** Where the living are. `zone(i)` labels an organism; the counts come back per zone. */
function census(zone, nz) {
  const z = Array.from({ length: nz }, () => [0, 0, 0, 0, 0, 0, 0]);
  for (let i = 0; i < W.n; i++) if (W.alive[i]) z[zone(i)][W.sp[i]]++;
  return z;
}

/** One start, one seed, to the horizon. The numbers every mode reports. */
function run(k, seed, ticks = HORIZON) {
  founded(k, seed);
  const spec = STARTS[k];
  const M0 = auditM(), sk = sky();
  const minP = new Array(7).fill(1e9);
  let collapsedAt = -1, vSeen = false, floorD = 1e9;
  for (let t = 1; t <= ticks; t++) {
    C.step();
    const p = pops();
    for (let j = 0; j < 7; j++) minP[j] = Math.min(minP[j], p[j]);
    if (p[6] > 0) vSeen = true;
    if (t > 3000) floorD = Math.min(floorD, p[1]);
    if (spec.key !== "still" && coreCollapsed(p, t)) { collapsedAt = t; break; }
  }
  const last = pops();
  const drift = 100 * (auditM() - M0) / M0;
  return { seed, key: spec.key, collapsedAt, last, minP, floorD, vSeen, drift, sky: sk,
    zones: zonesOf(spec) };
}

/** The one thing each start is FOR, counted. Per key, because generality here would only blur. */
function zonesOf(spec) {
  if (spec.key === "twosuns") {
    const [a, b] = spec.sky;
    const near = (i, s) => Math.abs(C.wd(W.x[i] - s.x)) < 192;
    return { label: "west pool / east pool / strait",
      z: census(i => near(i, a) ? 0 : near(i, b) ? 1 : 2, 3) };
  }
  if (spec.key === "refuge") {
    const w = spec.walls;
    const x0 = Math.min(...w.map(s => s.x0)), x1 = Math.max(...w.map(s => s.x0));
    const y0 = Math.min(...w.map(s => s.y0)), y1 = Math.max(...w.map(s => s.y0));
    return { label: "inside the pen / outside",
      z: census(i => (W.x[i] > x0 && W.x[i] < x1 && W.y[i] > y0 && W.y[i] < y1) ? 0 : 1, 2) };
  }
  if (spec.key === "spring") {
    const G = P.GRID, cell = P.WORLD / G;
    const warm = i => W.temp[(Math.floor(W.y[i] / cell) & (G - 1)) * G + (Math.floor(W.x[i] / cell) & (G - 1))] >= 1;
    return { label: "in the warm water / in the cold", z: census(i => warm(i) ? 0 : 1, 2) };
  }
  return null;
}

const fmt = p => p.join("/");
const line = r => `seed ${String(r.seed).padStart(2)}: ` + (r.collapsedAt >= 0
  ? `COLLAPSE at t=${r.collapsedAt} pops=${fmt(r.last)}`
  : `OK  final ${fmt(r.last)} | min ${fmt(r.minP)} | Drifta floor ${r.floorD} | apex ${r.vSeen ? "seen" : "never"}`
    + ` | M drift ${r.drift.toFixed(4)}% | mean light ${r.sky.light.toFixed(3)}`
    + (r.sky.temp ? ` warmth ${r.sky.temp.toFixed(2)} (hot ${(100 * r.sky.hotShare).toFixed(0)}%)` : "")
    + (r.zones ? `\n         ${r.zones.label}: ${r.zones.z.map(fmt).join("  |  ")}` : ""));

// ---------------------------------------------------------------------------
// --check: the identity gates

let fails = 0;
const gate = (name, ok, info) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (info ? " — " + info : ""));
  if (!ok) fails++;
};

function check() {
  console.log("--check: identity gates (3,000 ticks)");
  const T = 3000;
  for (const seed of [11, 88]) {
    P.mutation = true; C.resetWorld(); C.initWorld(seed);
    for (let t = 0; t < T; t++) C.step();
    const ref = fp();
    founded(0, seed);
    for (let t = 0; t < T; t++) C.step();
    gate(`pond is the shipped world, seed ${seed}`, fp() === ref);
  }
  for (let k = 0; k < STARTS.length; k++) {
    const seed = 11;
    founded(k, seed);
    for (let t = 0; t < T; t++) C.step();
    const a = fp();
    composed(STARTS[k], seed);
    for (let t = 0; t < T; t++) C.step();
    gate(`${STARTS[k].key}: crate-founded === event-composed`, fp() === a);
  }
  // The painter has to survive every start, and `still` is the one no world has ever been:
  // zero organisms, zero corpses. A frame builder that divides by a population would find out
  // here rather than on a phone.
  const field = new Uint8Array(P.GRID * P.GRID * 4);
  for (let k = 0; k < STARTS.length; k++) {
    founded(k, 11);
    for (let t = 0; t < 50; t++) C.step();
    const view = { camX: 512, camY: 512, vw: 1080, vh: 1920, z: 2.64, hw: 540, hh: 960,
      alpha: 0, lodZ: C.LOD_Z };
    let ok = true, info = "";
    try {
      const f = C.frameOf(view, {}, null);
      C.fieldCarpet(field); C.fieldMineral(field); C.fieldCorpsePall(field); C.fieldShade(field);
      C.sunGlows(); C.sunMarks(); C.heatGlows(); C.heatMarks(); C.wallStrokes();
      ok = Number.isFinite(f.orgN) && Number.isFinite(f.corpseN) && f.pops.every(Number.isFinite);
      info = `orgN ${f.orgN}, ${C.sunGlows().length} glows, ${C.wallStrokes().length} wall strokes`;
    } catch (e) { ok = false; info = String(e).slice(0, 120); }
    gate(`${STARTS[k].key}: the frame builder paints it`, ok, info);
  }

  // A start may not leave the player holding the world's own founding as their last move,
  // and may not touch the Evolution panel's switch.
  for (let k = 0; k < STARTS.length; k++) {
    P.mutation = false;
    founded(k, 11, false);
    gate(`${STARTS[k].key}: leaves the undo slot empty`, C.undoKind() === 0, "kind " + C.undoKind());
    gate(`${STARTS[k].key}: leaves P.mutation alone`, P.mutation === false);
    gate(`${STARTS[k].key}: logs no intervention`, C.ivCount() === 0);
  }
}

// ---------------------------------------------------------------------------
// --empty: the `still` criterion

function empty() {
  const k = STARTS.findIndex(s => s.key === "still");
  if (k < 0) { console.error("no `still` start in the table"); process.exit(2); }
  console.log("--empty: `still` stays empty, stays flat, and can be settled");
  for (const seed of [11, 88]) {
    founded(k, seed);
    const M0 = auditM();
    let anyLife = 0;
    for (let t = 1; t <= HORIZON; t++) { C.step(); anyLife += pops().reduce((a, b) => a + b, 0); }
    gate(`seed ${seed}: nothing appears on its own in ${HORIZON} ticks`, anyLife === 0, "organism-ticks " + anyLife);
    gate(`seed ${seed}: mineral audit flat`, Math.abs(100 * (auditM() - M0) / M0) < 0.01,
      "drift " + (100 * (auditM() - M0) / M0).toFixed(5) + "%");
  }
  // An empty world is the one the Observatory was never founded into: no producers to divide by,
  // no strain to read. It must answer in nulls and zeros, not in NaN.
  founded(k, 11);
  for (let t = 0; t < 600; t++) C.step();
  const ind = C.indicators();
  const finite = v => v === null || (typeof v === "number" && Number.isFinite(v));
  gate("the Observatory survives an empty world",
    finite(ind.adaptability) && finite(ind.variety) && finite(ind.prodVsCons)
    && finite(ind.recyclingMin) && finite(ind.lockedPct)
    && Object.values(ind.pyramid).every(finite) && ind.strain.every(v => v === null || typeof v === "object"),
    JSON.stringify(ind).slice(0, 120));

  // Habitability: a plausible player, founding the web from nothing with the seeding tool alone.
  // Producers and decomposers first, then the plankton, then the grazer — the order the help
  // page teaches. If this does not hold, an empty pond is a dead end, not a start.
  const script = [
    [0, 0, 3], [0, 3, 2],            // t=0:    three mats and two microbe colonies
    [2000, 1, 3],                     // t=2000: plankton
    [5000, 2, 2],                     // t=5000: the grazer
  ];
  for (const seed of SEEDS) {
    founded(k, seed);
    let at = 0;
    const put = (sp, n) => { for (let j = 0; j < n; j++)
      C.applyEvent({ type: "spawnPack", sp, x: 512 + (j - (n - 1) / 2) * 90, y: 512 }); };
    for (let t = 0; t <= HORIZON; t++) {
      for (const [tt, sp, n] of script) if (tt === t) put(sp, n);
      C.step();
      at = t;
    }
    const p = pops();
    const held = [0, 1, 3].every(sp => p[sp] > 0);
    gate(`seed ${seed}: a settled pond holds to t=${at}`, held,
      "pops " + fmt(p) + " | grazer " + (p[2] > 0 ? "took (" + p[2] + ")" : "never took"));
  }
}

// ---------------------------------------------------------------------------
// --sweep: the calibration instrument

/** Variants around the shipped numbers. Each entry: a label and a mutated copy of the spec. */
function variants(spec) {
  const out = [];
  if (spec.key === "twosuns") {
    for (const sep of [448, 512]) for (const sg of [130, 140, 150]) for (const i of [1.0, 1.1, 1.2]) {
      const v = clone(spec);
      v.sky[0] = { ...v.sky[0], x: 512 - sep / 2, i, sigma: sg };
      v.sky[1] = { ...v.sky[1], x: 512 + sep / 2, i, sigma: sg };
      out.push([`sep ${sep} sigma ${sg} i ${i}`, v]);
    }
  } else if (spec.key === "shallows") {
    for (const M0 of [0.8, 1.1, 1.4, 1.7, 2.2, 3.2]) {
      const v = clone(spec); v.M0 = M0; out.push([`M0 ${M0}`, v]);
    }
  } else if (spec.key === "refuge") {
    for (const half of [48, 64, 88]) for (const fl of [0.4, 0.7, 1.0]) {
      const v = clone(spec);
      const cx = 416, cy = 608;
      v.walls = [
        { x0: cx - half, y0: cy - half, dx: 2 * half, dy: 0 },
        { x0: cx + half, y0: cy - half, dx: 0, dy: 2 * half },
        { x0: cx + half, y0: cy + half, dx: -2 * half, dy: 0 },
        { x0: cx - half, y0: cy + half, dx: 0, dy: -2 * half },
      ].map(w => ({ ...w, lt: 0.9, ht: 0.9, fl, pass: spec.walls[0].pass }));
      out.push([`pen ${2 * half} fl ${fl}`, v]);
    }
  } else out.push(["shipped", clone(spec)]);
  return out;
}

function sweepJob(job) {
  const [label, v] = variants(STARTS[job.k])[job.v];
  composed(v, job.seed);
  const sk = sky();
  const minP = new Array(7).fill(1e9);
  let collapsedAt = -1, floorD = 1e9;
  for (let t = 1; t <= job.ticks; t++) {
    C.step(); const p = pops();
    for (let j = 0; j < 7; j++) minP[j] = Math.min(minP[j], p[j]);
    if (t > 3000) floorD = Math.min(floorD, p[1]);
    if (coreCollapsed(p, t)) { collapsedAt = t; break; }
  }
  return { label, seed: job.seed, collapsedAt, last: pops(), minP, floorD, sky: sk,
    zones: zonesOf({ ...v, key: STARTS[job.k].key }) };
}

// ---------------------------------------------------------------------------
// worker entry (harness/pool.js) — one fresh process per job, as everywhere else

const jobIdx = argv.indexOf("--job");
if (jobIdx >= 0) {
  const job = JSON.parse(argv[jobIdx + 1]);
  console.log(JSON.stringify(job.sweep ? sweepJob(job) : run(job.k, job.seed, job.ticks)));
  process.exit(0);
}

const { runPool } = require("./pool.js");
const t0 = Date.now();

if (argv.includes("--check")) {
  check();
  console.log(fails ? `STARTS CHECK: ${fails} FAILED` : "STARTS CHECK: ALL PASS");
  process.exit(fails ? 1 : 0);
}

if (argv.includes("--empty")) {
  empty();
  console.log(fails ? `STILL WATER: ${fails} FAILED` : "STILL WATER: ALL PASS");
  process.exit(fails ? 1 : 0);
}

if (argv.includes("--sweep")) {
  const key = argv[argv.indexOf("--sweep") + 1];
  const keys = key && !key.startsWith("--") ? [key] : STARTS.map(s => s.key);
  const ticks = 9000, seeds = [11, 44, 88];
  const jobs = [];
  for (const kk of keys) {
    const k = STARTS.findIndex(s => s.key === kk);
    if (k < 0) { console.error("unknown start: " + kk); process.exit(2); }
    variants(STARTS[k]).forEach((_, v) => seeds.forEach(seed =>
      jobs.push({ sweep: true, k, v, seed, ticks })));
  }
  console.log(`--sweep: ${keys.join(", ")} — ${jobs.length} runs, ${seeds.length} seeds x ${ticks} ticks`);
  runPool(__filename, jobs, r => {
    if (r.workerError) { console.log("WORKER ERROR " + r.workerError + " " + (r.raw || "")); return; }
    console.log(`  ${r.label.padEnd(26)} seed ${String(r.seed).padStart(2)}  `
      + (r.collapsedAt >= 0 ? `COLLAPSE t=${r.collapsedAt} ${fmt(r.last)}`
        : `${fmt(r.last)} | min ${fmt(r.minP)} | floor D ${r.floorD} | light ${r.sky.light.toFixed(3)}`
          + (r.sky.temp ? ` warmth ${r.sky.temp.toFixed(2)}` : "")
          + (r.zones ? ` | ${r.zones.z.map(fmt).join(" | ")}` : "")));
  }).then(() => { console.log(`wall: ${(Date.now() - t0) / 1000}s`); });
  return;
}

// acceptance
console.log(`STARTS ACCEPTANCE — ${STARTS.length} start worlds x ${SEEDS.length} seeds x ${HORIZON} ticks`);
const jobs = [];
STARTS.forEach((s, k) => SEEDS.forEach(seed => jobs.push({ k, seed, ticks: HORIZON })));
let bad = 0;
runPool(__filename, jobs, (r, idx) => {
  if (idx % SEEDS.length === 0) console.log(`\n[${STARTS[Math.floor(idx / SEEDS.length)].key}]`);
  if (r.workerError) { console.log("  WORKER ERROR " + r.workerError + " " + (r.raw || "")); bad++; return; }
  console.log("  " + line(r));
  if (r.key === "still") {
    if (r.last.some(v => v > 0)) { console.log("    FAIL: still water grew something on its own"); bad++; }
  } else if (r.collapsedAt >= 0) bad++;
  // The certified pond itself drifts -0.007%..-0.011% over the horizon — float accumulation in
  // the audit, not matter leaving the world. The band is therefore the pond's, with margin: a
  // threshold tighter than the reference world would fail the reference world.
  if (Math.abs(r.drift) > 0.05) { console.log("    FAIL: mineral audit drifted"); bad++; }
}).then(() => {
  console.log(`\nwall: ${(Date.now() - t0) / 1000}s`);
  console.log(bad ? `STARTS ACCEPTANCE: ${bad} FAILURE(S)` : "STARTS ACCEPTANCE: ALL PASS — every start world holds to the horizon");
  process.exit(bad ? 1 : 0);
});
