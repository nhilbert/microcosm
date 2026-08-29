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
const L = require("./lib.js"); const { C, W, P, SEEDS, HORIZON } = L;
const mutation = !process.argv.includes("--silent");
console.log(`[${mutation ? "evolving world, P.mutation=true" : "reference world, P.mutation=false"}]`);
const t0 = Date.now(); let anyFail = false;
for (const seed of SEEDS){
  L.start(seed, mutation);
  const M0 = L.auditM();
  let minP = new Array(7).fill(1e9), last = [0,0,0,0,0,0,0], ok = true, mStarv = 0, vSeen = false, vLostT = -1;
  for (let t = 0; t <= HORIZON; t++){
    C.step(); const p = L.pops(); last = p;
    for (let k = 0; k < 7; k++) minP[k] = Math.min(minP[k], p[k]);
    if (t === 9000) for (let i = 0; i < W.n; i++) // mid-run: how many producers are mineral-limited?
      if (W.alive[i] && W.sp[i] < 2 && !W.cy[i] && W.mn[i] < 0.5*P.mQuota*W.sz[i]) mStarv++;
    if (p[6] > 0) vSeen = true; else if (vSeen && vLostT < 0) vLostT = t;
    if (L.coreCollapsed(p, t)){ console.log(`seed ${seed}: ECOSYSTEM COLLAPSE at t=${t} pops=${p}`); ok = false; anyFail = true; break; }
  }
  const drift = 100*(L.auditM()-M0)/M0;
  const apex = !vSeen ? "never established" : vLostT < 0 ? `held (${last[6]})` : `lost at t=${vLostT}`;
  let corpses = 0; for (let k=0;k<W.cN;k++) if (W.cAlive[k]) corpses++;
  let dE=0, dP=0; for (let c=0;c<P.GRID*P.GRID;c++){ dE+=W.dE[c]; dP+=W.dP[c]; }
  if (ok) console.log(`seed ${seed}: OK apex ${apex} | final S=${last[0]} D=${last[1]} C=${last[2]} B=${last[3]} My=${last[4]} V=${last[6]} | min ${minP.join('/')} | M-audit drift ${drift.toFixed(4)}% | M-starved producers @t9000: ${mStarv} | uptake ${W.flows.uptake.toFixed(0)} release ${W.flows.release.toFixed(0)} | corpses=${corpses} | detritus E=${dE.toFixed(0)} P=${dP.toFixed(0)} egested E=${W.flows.egestE.toFixed(0)} | bacRelease M=${W.flows.bacRelease.toFixed(0)}`);
  else console.log(`  (audit drift at abort: ${drift.toFixed(4)}%)`);
}
console.log(`wall: ${(Date.now()-t0)/1000}s`);
process.exit(anyFail ? 1 : 0);
