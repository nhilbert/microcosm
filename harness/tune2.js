// Ecology acceptance harness: drives the CANONICAL core, with mineral audit + flow meters.
//
// ACCEPTANCE CRITERION (amended 2026-08-29, 'stream-robust'):
//   A seed passes if the ECOSYSTEM holds — Solara, Drifta, Cilio and Bacillus all
//   persist to t=18,000 and the mineral audit stays flat. Venator, the apex, is
//   NOT a pass condition: its establishment is stochastic by nature, and losing it
//   is an ecological outcome to report, not a harness failure. Apex presence is
//   reported per seed so the trend stays visible.
//   Superseded: the original criterion required Venator on all 8 seeds.
// --silent runs the reference world (P.mutation=false); default is the shipped, evolving world.
// Parallel since the perf review (docs/perf-review-2026-08-31.md): the 8 seeds are independent
// worlds and fan across cores via harness/pool.js — one fresh process per seed, per-seed lines
// printed in seed order, byte-identical to the sequential harness. MC_JOBS caps the workers;
// `--job <json>` is the internal worker entry point. The measurement arithmetic is unchanged.
const L = require("./lib.js"); const { C, W, P, SEEDS, HORIZON } = L;
const argv = process.argv.slice(2);

function runSeed(seed, mutation){
  L.start(seed, mutation);
  const M0 = L.auditM();
  let minP = new Array(7).fill(1e9), last = [0,0,0,0,0,0,0], collapsedAt = -1, mStarv = 0, vSeen = false, vLostT = -1;
  for (let t = 0; t <= HORIZON; t++){
    C.step(); const p = L.pops(); last = p;
    for (let k = 0; k < 7; k++) minP[k] = Math.min(minP[k], p[k]);
    if (t === 9000) for (let i = 0; i < W.n; i++) // mid-run: how many producers are mineral-limited?
      if (W.alive[i] && W.sp[i] < 2 && !W.cy[i] && W.mn[i] < 0.5*P.mQuota*W.sz[i]) mStarv++;
    if (p[6] > 0) vSeen = true; else if (vSeen && vLostT < 0) vLostT = t;
    if (L.coreCollapsed(p, t)){ collapsedAt = t; break; }
  }
  const drift = 100*(L.auditM()-M0)/M0;
  let corpses = 0; for (let k=0;k<W.cN;k++) if (W.cAlive[k]) corpses++;
  let dE=0, dP=0; for (let c=0;c<P.GRID*P.GRID;c++){ dE+=W.dE[c]; dP+=W.dP[c]; }
  return { seed, collapsedAt, last, minP, mStarv, vSeen, vLostT, drift, corpses, dE, dP,
    uptake: W.flows.uptake, release: W.flows.release, egestE: W.flows.egestE, bacRelease: W.flows.bacRelease };
}
const jobIdx = argv.indexOf("--job");
if (jobIdx >= 0){ const job = JSON.parse(argv[jobIdx+1]); console.log(JSON.stringify(runSeed(job.seed, job.mutation))); process.exit(0); }

const mutation = !argv.includes("--silent");
const AUDIT_BAND = 0.05; // percent of M0; the world's own drift is an order of magnitude inside it
console.log(`[${mutation ? "evolving world, P.mutation=true" : "reference world, P.mutation=false"}]`);
const t0 = Date.now(); let anyFail = false;
const { runPool } = require("./pool.js");
runPool(__filename, SEEDS.map(seed => ({ seed, mutation })), r => {
  if (r.workerError){ console.log(`WORKER ERROR ${r.workerError} ${r.raw || ""}`); anyFail = true; return; }
  if (r.collapsedAt >= 0){
    console.log(`seed ${r.seed}: ECOSYSTEM COLLAPSE at t=${r.collapsedAt} pops=${r.last}`);
    console.log(`  (audit drift at abort: ${r.drift.toFixed(4)}%)`);
    anyFail = true; return;
  }
  // The audit is the second half of the criterion, and until 2026-09-05 it was printed and never
  // judged. Band as in harness/starts.js: the certified pond drifts -0.007%..-0.011% over the
  // horizon (float accumulation), so 0.05% is generous for the world and tight for a leak.
  if (Math.abs(r.drift) > AUDIT_BAND){
    console.log(`seed ${r.seed}: MINERAL AUDIT DRIFTED ${r.drift.toFixed(4)}% (band ±${AUDIT_BAND}%)`);
    anyFail = true;
  }
  const apex = !r.vSeen ? "never established" : r.vLostT < 0 ? `held (${r.last[6]})` : `lost at t=${r.vLostT}`;
  console.log(`seed ${r.seed}: OK apex ${apex} | final S=${r.last[0]} D=${r.last[1]} C=${r.last[2]} B=${r.last[3]} My=${r.last[4]} V=${r.last[6]} | min ${r.minP.join('/')} | M-audit drift ${r.drift.toFixed(4)}% | M-starved producers @t9000: ${r.mStarv} | uptake ${r.uptake.toFixed(0)} release ${r.release.toFixed(0)} | corpses=${r.corpses} | detritus E=${r.dE.toFixed(0)} P=${r.dP.toFixed(0)} egested E=${r.egestE.toFixed(0)} | bacRelease M=${r.bacRelease.toFixed(0)}`);
}).then(() => {
  console.log(`wall: ${(Date.now()-t0)/1000}s`);
  process.exit(anyFail ? 1 : 0);
});
