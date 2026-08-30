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
const L = require("./lib.js"); const { C, W, P, TRAITS, SEEDS, HORIZON, LOCI } = L;
const argv = process.argv.slice(2);
const has = f => argv.includes(f), after = f => { const i = argv.indexOf(f); return i >= 0 && argv[i+1] && !argv[i+1].startsWith("--") ? +argv[i+1] : null; };
let modes = argv.filter(a => a.startsWith("--")).map(a => a.slice(2));
const PAIRS = []; LOCI.forEach(sp => TRAITS[sp].loci.forEach((Lc, k) => PAIRS.push({ sp, k, L: Lc })));
if (!modes.length) modes = [PAIRS.length <= 3 ? "corners" : "rails"];
const sigma0 = PAIRS.map(p => p.L.sigma);
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
const word = (p, r) => TRAITS[p.sp].name + (p.k ? " " + p.L.label.toLowerCase() : "") + " " + (r >= 0.99 ? p.L.hiWord : r <= 0.01 ? p.L.loWord : r.toFixed(2));

if (modes.includes("corners")){
  for (let m = 0; m < (1 << PAIRS.length); m++){ const corner = PAIRS.map((p, j) => [p.sp, (m >> j) & 1, p.k]);
    runPinned("corner: " + corner.map(([, r], j) => word(PAIRS[j], r)).join(" + "), corner); }
}
if (modes.includes("rails")){
  for (const p of PAIRS) for (const r of [0, 1]) runPinned(`rail: ${word(p, r)}, others at g0`, [[p.sp, r, p.k]]);
  runPinned("corner: all low", PAIRS.map(p => [p.sp, 0, p.k]));
  runPinned("corner: all high", PAIRS.map(p => [p.sp, 1, p.k]));
}
if (modes.includes("sample")){
  const N = after("--sample") || 24, rng = C.mulberry32(20260829);
  for (let j = 0; j < N; j++){ // stratified per locus: stratum j of N, jittered
    const pt = PAIRS.map(p => [p.sp, +(((j + rng()) / N + rng() * 0.37) % 1).toFixed(3), p.k]);
    runPinned(`sample ${j+1}/${N}: ` + pt.map(([, r], jj) => word(PAIRS[jj], r)).join(" + "), pt); }
}
if (modes.includes("fuzz")){
  const kf = after("--fuzz") || 4, ticks = 3 * HORIZON;
  console.log(`\n=== fuzz: mutation ON, every sigma x ${kf}, ${ticks} ticks -- evolution as the adversary ===`);
  for (const seed of SEEDS){
    L.start(seed, true);
    // AFTER start, per seed: initWorld restores shipped sigma from LOCUS_SHIPPED (the Phase 6 reset
    // guard), so setting it before the loop silently fuzzed at x1 from Phase 6 until MV.1's battery
    // caught it -- the "fuzz" seed-77 collapse reproduced tune2's shipped-sigma collapse tick-exact,
    // which only an unmultiplied sigma explains. Instrument incident recorded in phase7-movement-plan.md.
    PAIRS.forEach((p, j) => p.L.sigma = sigma0[j] * kf);
    const M0 = L.auditM(); let ok = true, last = null;
    for (let t = 0; t <= ticks; t++){ C.step(); const p = L.pops(); last = p;
      if (L.coreCollapsed(p, t)){ console.log(`seed ${seed}: ECOSYSTEM COLLAPSE at t=${t} pops=${p}`); ok = false; anyFail = true; break; } }
    runs++;
    if (ok){ const g = PAIRS.map(p => { const s = L.locusStats(p.sp, p.k); return TRAITS[p.sp].name.slice(0,2) + (p.k ? "ᵗ" : "") + L.fmtG(s) + (s.railHi > 0.2 || s.railLo > 0.2 ? "!" : ""); }).join(" ");
      console.log(`seed ${seed}: OK | S=${last[0]} D=${last[1]} C=${last[2]} B=${last[3]} V=${last[6]} | ${g} | audit ${(100*(L.auditM()-M0)/M0).toFixed(4)}%`); }
  }
  PAIRS.forEach((p, j) => p.L.sigma = sigma0[j]);
}
console.log(anyFail ? `\nCORRIDOR: NOT CERTIFIED — a configuration breaks the ecosystem (${modes.join("+")}, ${runs} runs)`
                    : `\nCORRIDOR CERTIFIED (${modes.join("+")}: ${runs} runs, 8 seeds, ${PAIRS.length} loci) — the ecosystem criterion holds in every configuration`);
process.exit(anyFail ? 1 : 0);
