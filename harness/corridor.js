// 5.4 CORRIDOR CERTIFICATION: a locus may evolve freely inside [0,1] ONLY if the rails are proven
// safe. Criterion throughout: the amended one -- the four core species persist and the mineral
// audit stays flat; the apex is reported. Modes (docs/genetics-scaling.md §2):
//   --corners    every combination of every locus at 0/1, mutation off   (2^L x 8 runs; default for L <= 3)
//   --rails      each locus at 0 and at 1 with the others at g0, plus the all-low and all-high corners
//                (2L+2 x 8 runs; default for L > 3)
//   --fuzz [k]   evolution as the fuzzer: mutation ON with every sigma x k (default 4), 3x the horizon,
//                8 seeds -- if the optimiser cannot break the world, the corridor is safe
//   --sample N   N stratified random interior points, pinned, mutation off (fixed budget, statistical claim)
// Multi-locus: L counts (species, locus) pairs -- every plane is pinned and fuzzed. A warmth-gated
// locus (thermal) is expression-inert in the unwarmed certified world; its rails here certify only the
// storage and draw machinery, and its ecological rails live in the heated worlds of harness/heat.js.
// Several modes may be combined; the exit code is 1 if any configuration collapses.
// Parallel since the perf review (docs/perf-review-2026-08-31.md): every run is an independent
// world, so runs fan across cores via harness/pool.js — one fresh process per run, results printed
// in the sequential order and format. MC_JOBS caps the worker count. `--job <json>` is the internal
// worker entry point; the measurement arithmetic below is unchanged from the sequential harness.
const L = require("./lib.js"); const { C, W, P, TRAITS, SEEDS, HORIZON, LOCI } = L;
const argv = process.argv.slice(2);
const has = f => argv.includes(f), after = f => { const i = argv.indexOf(f); return i >= 0 && argv[i+1] && !argv[i+1].startsWith("--") ? +argv[i+1] : null; };
const PAIRS = []; LOCI.forEach(sp => TRAITS[sp].loci.forEach((Lc, k) => PAIRS.push({ sp, k, L: Lc })));
const sigma0 = PAIRS.map(p => p.L.sigma);

// ---- worker: one run per process, result as one JSON line on stdout ----
// job: { kind:"pinned", seed, corner, ticks } | { kind:"fuzz", seed, kf, ticks }
function runJob(job){
  if (job.kind === "fuzz"){
    L.start(job.seed, true);
    // AFTER start, per seed: initWorld restores shipped sigma from LOCUS_SHIPPED (the Phase 6 reset
    // guard), so setting it before start would silently fuzz at x1 -- the instrument incident
    // recorded in phase7-movement-plan.md. A fresh process per run keeps even that class of leak
    // structurally impossible between runs.
    PAIRS.forEach((p, j) => p.L.sigma = sigma0[j] * job.kf);
  } else {
    L.start(job.seed, false); L.pin(job.corner);
  }
  const M0 = L.auditM(); let vLost = -1, vSeen = false, last = null, collapsedAt = -1;
  for (let t = 0; t <= job.ticks; t++){ C.step(); const p = L.pops(); last = p;
    if (p[6] > 0) vSeen = true; else if (vSeen && vLost < 0) vLost = t;
    if (L.coreCollapsed(p, t)){ collapsedAt = t; break; } }
  const out = { seed: job.seed, collapsedAt, last, vSeen, vLost, audit: 100*(L.auditM()-M0)/M0 };
  if (job.kind === "fuzz" && collapsedAt < 0)
    out.g = PAIRS.map(p => { const s = L.locusStats(p.sp, p.k); return TRAITS[p.sp].name.slice(0,2) + (p.k ? "ᵗ" : "") + L.fmtG(s) + (s.railHi > 0.2 || s.railLo > 0.2 ? "!" : ""); }).join(" ");
  return out;
}
const jobIdx = argv.indexOf("--job");
if (jobIdx >= 0){ console.log(JSON.stringify(runJob(JSON.parse(argv[jobIdx+1])))); process.exit(0); }

// ---- parent: enumerate configurations (sequential order preserved), fan out, print, certify ----
let modes = argv.filter(a => a.startsWith("--")).map(a => a.slice(2));
if (!modes.length) modes = [PAIRS.length <= 3 ? "corners" : "rails"];
const word = (p, r) => TRAITS[p.sp].name + (p.k ? " " + p.L.label.toLowerCase() : "") + " " + (r >= 0.99 ? p.L.hiWord : r <= 0.01 ? p.L.loWord : r.toFixed(2));

const CONFIGS = [];
if (modes.includes("corners")){
  for (let m = 0; m < (1 << PAIRS.length); m++){ const corner = PAIRS.map((p, j) => [p.sp, (m >> j) & 1, p.k]);
    CONFIGS.push({ kind: "pinned", corner, label: "corner: " + corner.map(([, r], j) => word(PAIRS[j], r)).join(" + ") }); }
}
if (modes.includes("rails")){
  for (const p of PAIRS) for (const r of [0, 1]) CONFIGS.push({ kind: "pinned", corner: [[p.sp, r, p.k]], label: `rail: ${word(p, r)}, others at g0` });
  CONFIGS.push({ kind: "pinned", corner: PAIRS.map(p => [p.sp, 0, p.k]), label: "corner: all low" });
  CONFIGS.push({ kind: "pinned", corner: PAIRS.map(p => [p.sp, 1, p.k]), label: "corner: all high" });
}
if (modes.includes("sample")){
  const N = after("--sample") || 24, rng = C.mulberry32(20260829);
  for (let j = 0; j < N; j++){ // stratified per locus: stratum j of N, jittered
    const pt = PAIRS.map(p => [p.sp, +(((j + rng()) / N + rng() * 0.37) % 1).toFixed(3), p.k]);
    CONFIGS.push({ kind: "pinned", corner: pt, label: `sample ${j+1}/${N}: ` + pt.map(([, r], jj) => word(PAIRS[jj], r)).join(" + ") }); }
}
if (modes.includes("fuzz")){
  const kf = after("--fuzz") || 4;
  CONFIGS.push({ kind: "fuzz", kf, ticks: 3 * HORIZON, label: `fuzz: mutation ON, every sigma x ${kf}, ${3 * HORIZON} ticks -- evolution as the adversary` });
}

const jobs = [];
for (const cfg of CONFIGS) for (const seed of SEEDS)
  jobs.push(cfg.kind === "fuzz" ? { kind: "fuzz", seed, kf: cfg.kf, ticks: cfg.ticks }
                                : { kind: "pinned", seed, corner: cfg.corner, ticks: HORIZON });

let anyFail = false;
const { runPool } = require("./pool.js");
runPool(__filename, jobs, (r, idx) => {
  const cfg = CONFIGS[(idx / SEEDS.length) | 0];
  if (idx % SEEDS.length === 0) console.log(`\n=== ${cfg.label}${cfg.kind === "fuzz" ? "" : ", mutation off"} ===`);
  if (r.workerError){ console.log(`seed ${SEEDS[idx % SEEDS.length]}: WORKER ERROR ${r.workerError} ${r.raw || ""}`); anyFail = true; return; }
  if (r.collapsedAt >= 0){ console.log(`seed ${r.seed}: ECOSYSTEM COLLAPSE at t=${r.collapsedAt} pops=${r.last}`); anyFail = true; return; }
  const last = r.last;
  if (cfg.kind === "fuzz")
    console.log(`seed ${r.seed}: OK | S=${last[0]} D=${last[1]} C=${last[2]} B=${last[3]} V=${last[6]} | ${r.g} | audit ${r.audit.toFixed(4)}%`);
  else
    console.log(`seed ${r.seed}: OK apex ${!r.vSeen ? "never" : r.vLost < 0 ? "held ("+last[6]+")" : "lost t="+r.vLost} | S=${last[0]} D=${last[1]} C=${last[2]} B=${last[3]} | audit ${r.audit.toFixed(4)}%`);
}).then(() => {
  console.log(anyFail ? `\nCORRIDOR: NOT CERTIFIED — a configuration breaks the ecosystem (${modes.join("+")}, ${jobs.length} runs)`
                      : `\nCORRIDOR CERTIFIED (${modes.join("+")}: ${jobs.length} runs, 8 seeds, ${PAIRS.length} loci) — the ecosystem criterion holds in every configuration`);
  process.exit(anyFail ? 1 : 0);
});
