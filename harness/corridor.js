// 5.4 CORRIDOR CERTIFICATION: a locus may evolve freely inside [0,1] ONLY if the rails are proven
// safe. Criterion throughout: the amended one -- the four core species persist and the mineral
// audit stays flat; the apex is reported. Modes (docs/genetics-scaling.md §2):
//   --corners    every combination of every locus at 0/1, mutation off   (2^L x 8 runs; default for L <= 3)
//   --rails      each locus at 0 and at 1 with the others at g0, plus the all-low and all-high corners
//                (2L+2 x 8 runs; default for L > 3)
//   --fuzz [k]   evolution as the fuzzer: mutation ON with every sigma x k (default 4), 3x the horizon,
//                8 seeds -- if the optimiser cannot break the world, the corridor is safe
//   --sample N   N stratified random interior points, pinned, mutation off (fixed budget, statistical claim)
// Several modes may be combined; the exit code is 1 if any configuration collapses.
const L = require("./lib.js"); const { C, W, P, TRAITS, SEEDS, HORIZON, LOCI } = L;
const argv = process.argv.slice(2);
const has = f => argv.includes(f), after = f => { const i = argv.indexOf(f); return i >= 0 && argv[i+1] && !argv[i+1].startsWith("--") ? +argv[i+1] : null; };
let modes = argv.filter(a => a.startsWith("--")).map(a => a.slice(2));
if (!modes.length) modes = [LOCI.length <= 3 ? "corners" : "rails"];
const sigma0 = LOCI.map(sp => TRAITS[sp].locus.sigma);
let anyFail = false, runs = 0;

function runPinned(label, corner, ticks = HORIZON){
  console.log(`\n=== ${label}, mutation off ===`);
  for (const seed of SEEDS){
    L.start(seed, false); L.pin(corner);
    const M0 = L.auditM(); let ok = true, vLost = -1, vSeen = false, last = null;
    for (let t = 0; t <= ticks; t++){ C.step(); const p = L.pops(); last = p;
      if (p[6] > 0) vSeen = true; else if (vSeen && vLost < 0) vLost = t;
      if (L.coreCollapsed(p, t)){ console.log(`seed ${seed}: ECOSYSTEM COLLAPSE at t=${t} pops=${p}`); ok = false; anyFail = true; break; } }
    runs++;
    if (ok) console.log(`seed ${seed}: OK apex ${!vSeen ? "never" : vLost < 0 ? "held ("+last[6]+")" : "lost t="+vLost} | S=${last[0]} D=${last[1]} C=${last[2]} B=${last[3]} | audit ${(100*(L.auditM()-M0)/M0).toFixed(4)}%`);
  }
}
const word = (sp, r) => TRAITS[sp].name + " " + (r >= 0.99 ? TRAITS[sp].locus.hiWord : r <= 0.01 ? TRAITS[sp].locus.loWord : r.toFixed(2));

if (modes.includes("corners")){
  for (let m = 0; m < (1 << LOCI.length); m++){ const corner = LOCI.map((sp, k) => [sp, (m >> k) & 1]);
    runPinned("corner: " + corner.map(([sp, r]) => word(sp, r)).join(" + "), corner); }
}
if (modes.includes("rails")){
  for (const sp of LOCI) for (const r of [0, 1]) runPinned(`rail: ${word(sp, r)}, others at g0`, [[sp, r]]);
  runPinned("corner: all low", LOCI.map(sp => [sp, 0]));
  runPinned("corner: all high", LOCI.map(sp => [sp, 1]));
}
if (modes.includes("sample")){
  const N = after("--sample") || 24, rng = C.mulberry32(20260829);
  for (let k = 0; k < N; k++){ // stratified per locus: stratum k of N, jittered
    const pt = LOCI.map(sp => [sp, +(((k + rng()) / N + rng() * 0.37) % 1).toFixed(3)]);
    runPinned(`sample ${k+1}/${N}: ` + pt.map(([sp, r]) => word(sp, r)).join(" + "), pt); }
}
if (modes.includes("fuzz")){
  const k = after("--fuzz") || 4, ticks = 3 * HORIZON;
  LOCI.forEach((sp, i) => TRAITS[sp].locus.sigma = sigma0[i] * k);
  console.log(`\n=== fuzz: mutation ON, every sigma x ${k}, ${ticks} ticks -- evolution as the adversary ===`);
  for (const seed of SEEDS){
    L.start(seed, true); const M0 = L.auditM(); let ok = true, last = null, worst = "";
    for (let t = 0; t <= ticks; t++){ C.step(); const p = L.pops(); last = p;
      if (L.coreCollapsed(p, t)){ console.log(`seed ${seed}: ECOSYSTEM COLLAPSE at t=${t} pops=${p}`); ok = false; anyFail = true; break; } }
    runs++;
    if (ok){ const g = LOCI.map(sp => { const s = L.locusStats(sp); return TRAITS[sp].name.slice(0,2) + L.fmtG(s) + (s.railHi > 0.2 || s.railLo > 0.2 ? "!" : ""); }).join(" ");
      console.log(`seed ${seed}: OK | S=${last[0]} D=${last[1]} C=${last[2]} B=${last[3]} V=${last[6]} | ${g} | audit ${(100*(L.auditM()-M0)/M0).toFixed(4)}%`); }
  }
  LOCI.forEach((sp, i) => TRAITS[sp].locus.sigma = sigma0[i]);
}
console.log(anyFail ? `\nCORRIDOR: NOT CERTIFIED — a configuration breaks the ecosystem (${modes.join("+")}, ${runs} runs)`
                    : `\nCORRIDOR CERTIFIED (${modes.join("+")}: ${runs} runs, 8 seeds, ${LOCI.length} loci) — the ecosystem criterion holds in every configuration`);
process.exit(anyFail ? 1 : 0);
