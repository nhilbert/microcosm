// 7.L.2 — light patches: the measurement behind phase7-light-plan.md §3 (predictions P0–P5).
//
//   node harness/light.js --viability [--at 3000]   P0: is a mat viable under a dim sun, and from what intensity?
//   node harness/light.js --patches   [--at 3000] [--seed] [--layouts twin,dim]   P1–P3, P5: local adaptation across patches, 8 seeds
//                                     --seed: the player seeds the new patch (spawnPack kit); without it the patch must be reached by dispersal
//
// A layout is applied to an ESTABLISHED world at tick --at (default 3000) — the player's action, not a
// different founding — through the same events the UI sends (sunRemove/sun/sunSet/sunAdd). Patch
// membership = nearest sun by toroidal distance, the rule the phototaxis uses, so instrument and
// mechanism agree. Light at an organism is the FIELD (W.light), not the shaded value: the environment,
// not what the mat did to it. Zero PRNG draws outside the sim.
const L = require("./lib.js"); const { C, W, P, TRAITS, SPECIES, SEEDS, HORIZON } = L;
const args = process.argv.slice(2);
const flag = f => args.includes(f);
const num = (f, d) => { const i = args.indexOf(f); return i >= 0 ? +args[i+1] : d; };
const AT = num("--at", 3000);
const SOL = SPECIES.MAT, DRI = SPECIES.PREY;

// Layouts are ADDITIVE (L.2 finding): the shipped sun is never moved or shrunk -- doing so (first design:
// two sigma-130 suns at (256,256)/(768,768), input x0.63-0.81) collapsed the core on 5/8 seeds and left the
// dim patch a desert for mats below I=0.6. Extra suns go to the far corner (724 away; the shipped sun
// contributes 0.003 there). `matched` = one sun carrying the dim layout's light input, for attribution.
const LAYOUTS = {
  one:     [{ x:512, y:512, i:1.0, sigma:210 }],
  matched: [{ x:512, y:512, i:1.27, sigma:210 }],
  twin:    [{ x:512, y:512, i:1.0, sigma:210 }, { x:0, y:0, i:1.0, sigma:130 }],
  dim:     [{ x:512, y:512, i:1.0, sigma:210 }, { x:0, y:0, i:0.7, sigma:130 }],
};
const WHICH = (args.includes("--layouts") ? args[args.indexOf("--layouts")+1].split(",") : ["one","matched","twin","dim"]);
const SEEDED_REF = { v: flag("--seed") };   // colonisation kit: the player seeds the new patch (spawnPack events), else it must be reached by dispersal
function applyLayout(lay){
  for (let k = W.suns.length - 1; k >= 1; k--) C.applyEvent({ type:"sunRemove", k });
  C.applyEvent({ type:"sun", k:0, x: lay[0].x, y: lay[0].y });
  C.applyEvent({ type:"sunSet", k:0, i: lay[0].i, sigma: lay[0].sigma });
  for (let k = 1; k < lay.length; k++){ C.applyEvent({ type:"sunAdd", ...lay[k] });
    if (SEEDED_REF.v){ const s = lay[k]; // packs at four points around the new sun: mats, plankton, a grazer pack, decomposers
      for (const [dx,dy] of [[60,0],[-60,0],[0,60],[0,-60]]){ C.applyEvent({ type:"spawnPack", sp:SOL, x:C.wrap(s.x+dx), y:C.wrap(s.y+dy) }); C.applyEvent({ type:"spawnPack", sp:DRI, x:C.wrap(s.x+dx*1.5), y:C.wrap(s.y+dy*1.5) }); }
      C.applyEvent({ type:"spawnPack", sp:SPECIES.GRAZER, x:s.x, y:s.y });
      C.applyEvent({ type:"spawnPack", sp:3, x:C.wrap(s.x+40), y:C.wrap(s.y+40) }); }
  }
}
const lightInput = () => { let t=0; for (let c=0;c<W.light.length;c++) t+=W.light[c]; return t; };
const cellOf = i => (Math.floor(W.y[i]/(P.WORLD/P.GRID))&(P.GRID-1))*P.GRID + (Math.floor(W.x[i]/(P.WORLD/P.GRID))&(P.GRID-1));
function patchOf(i){ let best=0, bd=Infinity; for (let k=0;k<W.suns.length;k++){ const dx=C.wd(W.suns[k].x-W.x[i]), dy=C.wd(W.suns[k].y-W.y[i]), d=dx*dx+dy*dy; if (d<bd){ bd=d; best=k; } } return best; }
// per species: population and locus mean per patch, genotype-light correlation, global sd
function patchStats(sp){
  const K = W.suns.length, n = new Array(K).fill(0), m = new Array(K).fill(0);
  let N=0, sg=0, sl=0, sgg=0, sll=0, sgl=0;
  for (let i=0;i<W.n;i++){ if (!W.alive[i] || W.sp[i]!==sp) continue;
    const k = patchOf(i), g = W.g[i], l = W.light[cellOf(i)];
    n[k]++; m[k]+=g; N++; sg+=g; sl+=l; sgg+=g*g; sll+=l*l; sgl+=g*l; }
  const mean = N? sg/N : 0, sd = N? Math.sqrt(Math.max(0, sgg/N-mean*mean)) : 0;
  const ml = N? sl/N : 0, sdl = N? Math.sqrt(Math.max(0, sll/N-ml*ml)) : 0;
  const corr = (N>10 && sd>1e-6 && sdl>1e-6) ? (sgl/N - mean*ml)/(sd*sdl) : 0;
  return { N, mean, sd, corr, n, pm: m.map((v,k)=> n[k]? v/n[k] : NaN) };
}
function run(seed, layout, mutation){
  L.start(seed, mutation);
  let ref = lightInput(), input = 1, collapsed = false;
  for (let t=1;t<=HORIZON;t++){
    if (t === AT){ applyLayout(layout); input = lightInput()/ref; }
    C.step();
    if (!collapsed && L.coreCollapsed(L.pops(), t)) collapsed = true;
  }
  const p = L.pops();
  return { input, collapsed, pops: p, apex: p[SPECIES.APEX] > 0, sol: patchStats(SOL), dri: patchStats(DRI),
    events: W.sysEvents.filter(e => e.type==="sweep" || e.type==="diverse" || e.type==="uniform").map(e => e.type+":"+TRAITS[e.sp].name.slice(0,3)+"@"+e.tick) };
}
const f2 = v => isNaN(v) ? "  -  " : v.toFixed(2);

if (flag("--viability")){
  // P0: bright sun + a dim sun of intensity I; count the mats living in the dim patch at 18k. Silent world.
  const IS = [0.3, 0.4, 0.5, 0.6, 0.7]; const VS = [11,22,33,44];
  console.log(`P0 viability — bright sigma130 at (256,256) + dim sigma130 I at (768,768), layout at t=${AT}, silent world, seeds ${VS.join(",")}`);
  console.log("I     | seed | input | Solara total  in dim patch | Drifta total  in dim patch | core");
  const viable = {};
  for (const I of IS){ viable[I] = 0;
    for (const s of VS){
      const r = run(s, [{ x:256, y:256, i:1.0, sigma:130 }, { x:768, y:768, i:I, sigma:130 }], false);
      const sd = r.sol.n[1], dd = r.dri.n[1]; if (sd >= 20) viable[I]++;
      console.log(`${I.toFixed(1)}   | ${s}   | ${r.input.toFixed(2)}  | ${String(r.sol.N).padStart(6)}       ${String(sd).padStart(6)}     | ${String(r.dri.N).padStart(6)}       ${String(dd).padStart(6)}     | ${r.collapsed ? "COLLAPSED" : "ok"}`);
    }
  }
  console.log("\nmat viable (>= 20 Solara in the dim patch at 18k): " + IS.map(I => `I=${I}: ${viable[I]}/${VS.length}`).join("  "));
  const thr = IS.find(I => viable[I] >= 3);
  console.log(`threshold intensity (>= 3/4 seeds): ${thr === undefined ? "none in range" : thr}`);
}

if (flag("--patches")){
  const MUT = !flag("--silent");
  console.log(`P1–P3, P5 — layouts applied at t=${AT}${SEEDED_REF.v ? " and seeded (colonisation kit)" : ""}, ${MUT ? "evolving" : "silent"} world, 8 seeds`);
  const summary = {};
  for (const name of WHICH){
    console.log(`\n=== layout ${name}: ${LAYOUTS[name].map(s=>`(${s.x},${s.y}) I${s.i} s${s.sigma}`).join(" + ")} ===`);
    console.log("seed | input | pops S/D/C/B/V   | Solara mean±sd  p0    p1   |d|  corr | Drifta mean±sd  p0    p1   |d|  corr | events");
    const rows = summary[name] = [];
    for (const s of SEEDS){
      const r = run(s, LAYOUTS[name], MUT); rows.push(r);
      const st = x => `${f2(x.mean)}±${f2(x.sd)}  ${f2(x.pm[0])} ${f2(x.pm[1])} ${f2(Math.abs(x.pm[0]-x.pm[1]))} ${(x.corr>=0?"+":"")+x.corr.toFixed(2)} n${x.n.join("/")}`;
      const pp = [SOL, DRI, SPECIES.GRAZER, 3, SPECIES.APEX].map(k => r.pops[k]).join("/");
      console.log(`${s}   | ${r.input.toFixed(2)}  | ${pp.padEnd(17)}| ${st(r.sol)} | ${st(r.dri)} | ${r.collapsed?"CORE COLLAPSED ":""}${r.events.join(" ")||"-"}`);
    }
  }
  const med = xs => { const a = xs.filter(v => !isNaN(v)).sort((x,y)=>x-y); return a.length ? a[Math.floor(a.length/2)] : NaN; };
  console.log("\n=== predictions (phase7-light-plan.md §3) ===");
  const dimR = summary.dim || [], twinR = summary.twin || [];
  const dS = dimR.map(r => r.sol.pm[1]-r.sol.pm[0]), dD = dimR.map(r => r.dri.pm[1]-r.dri.pm[0]);
  const tS = twinR.map(r => Math.abs(r.sol.pm[1]-r.sol.pm[0]));
  const cS = dimR.map(r => r.sol.corr);
  console.log(`P1 twin: Solara |patch difference| median ${f2(med(tS))}, seeds within 0.05: ${tS.filter(v=>v<0.05).length}/8  (prediction: within 0.05; a large neutral divergence would be an isolation finding)`);
  console.log(`P2 dim : Solara dim-minus-bright patch mean median ${f2(med(dS))}, seeds >= +0.15: ${dS.filter(v=>v>=0.15).length}/8; corr(g,L) median ${f2(med(cS))}, seeds <= -0.3: ${cS.filter(v=>v<=-0.3).length}/8  (prediction: >= 0.15 and <= -0.3)`);
  console.log(`P3 dim : Drifta |patch difference| median ${f2(med(dD.map(Math.abs)))}, seeds < 0.08: ${dD.filter(v=>Math.abs(v)<0.08).length}/8  (prediction: dispersal beats selection)`);
  console.log(`P4 dim : Solara diverse events on ${dimR.filter(r => r.events.some(e => e.startsWith("diverse:Sol"))).length}/8 seeds`);
  for (const name of WHICH){ const rows = summary[name];
    console.log(`P5 ${name.padEnd(7)}: core persists ${rows.filter(r=>!r.collapsed).length}/8, apex at 18k ${rows.filter(r=>r.apex).length}/8, Solara median ${med(rows.map(r=>r.pops[SOL]))}, Drifta median ${med(rows.map(r=>r.pops[DRI]))}, input ×${f2(rows[0].input)}`); }
}
if (flag("--gate")){
  // L.3 gate: the Observatory narrates local adaptation unprompted. Seeded second sun at t=AT, evolving world,
  // 8 seeds: `adapt` events and the peak of the plankton's patch-spread channel (57); one-sun control must be
  // silent with channels 56/57 exactly 0. Criteria are printed with the numbers, not assumed.
  const chan = (ch) => W.rec[((W.recHead-1+REC.N)%REC.N)*REC.CH + ch];
  const REC = L.REC;
  const gate = (layout, seeded) => SEEDS.map(seed => {
    L.start(seed, true); let peak56=0, peak57=0;
    for (let t=1;t<=HORIZON;t++){
      if (t === AT && layout) applyLayoutSeeded(layout, seeded);
      C.step(); peak56 = Math.max(peak56, chan(56)); peak57 = Math.max(peak57, chan(57)); }
    const ad = W.sysEvents.filter(e => e.type === "adapt").map(e => TRAITS[e.sp].name.slice(0,3)+"@"+e.tick);
    return { seed, ad, peak56, peak57, collapsed: L.coreCollapsed(L.pops(), HORIZON) }; });
  function applyLayoutSeeded(layout, seeded){ const prev = SEEDED_REF.v; SEEDED_REF.v = seeded; applyLayout(layout); SEEDED_REF.v = prev; }
  console.log(`=== seeded second sun at t=${AT} (evolving) ===`);
  const ev = gate(LAYOUTS.twin, true);
  for (const r of ev) console.log(`seed ${r.seed}: adapt ${r.ad.join(" ")||"none"} | patch spread peak mat ${r.peak56.toFixed(3)} plankton ${r.peak57.toFixed(3)}${r.collapsed?" | CORE COLLAPSED":""}`);
  console.log(`=== one sun (control) ===`);
  const ct = gate(null, false);
  for (const r of ct) console.log(`seed ${r.seed}: adapt ${r.ad.length} | channels 56/57 peak ${r.peak56} ${r.peak57}`);
  const c1 = ev.filter(r => r.ad.length).length, c2 = ct.every(r => r.ad.length === 0 && r.peak56 === 0 && r.peak57 === 0);
  console.log(`\n1. adaptation narrated on ${c1}/8 seeded-twin seeds`);
  console.log(`2. control silent, channels exactly 0: ${c2 ? "PASS" : "FAIL"}`);
}
if (!flag("--viability") && !flag("--patches") && !flag("--gate")) console.log("usage: node harness/light.js --viability | --patches | --gate [--at 3000] [--seed] [--layouts a,b] [--silent]");
