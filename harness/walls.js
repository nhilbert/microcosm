// Phase 7 W — wall measurement harness (docs/phase7-walls-plan.md §7).
// Modes:
//   --open     property-continuity proof: a fully transparent wall present for 3000 ticks
//              must fingerprint EXACTLY like the no-wall world (2 seeds). Ships as a gate.
//   --seal     two full-height Stone walls split the torus: total M audit stays flat,
//              the sunless side strangles (K6 signature), light behind walls is ambient only.
//              Audit flatness ships as a gate; the ecology is reported.
//   --hideout  Fine-mesh box on the sun's flank, same-seed A/B over 8 seeds x 18000:
//              refuge theory (Gause/Huffaker/LV-refuge) predicts a prey floor and damped cycles.
//              Reported as findings, not gated.
//   --shade    an opaque wall segment east of the sun: the mat must retreat from the shadow
//              sector (the field, not the painted layer, is what selects). Reported.
// Default (no flag): --open + --seal — the shipping acceptance pair. Exits non-zero if a gate fails.
const { C, W, P, SPECIES, pops, auditM, start, cv } = require("./lib");

const TAGV = { SOLARA:1, DRIFTA:2, CILIO:4, BACILLUS:8, VENATOR:64 };
const MESH = TAGV.SOLARA | TAGV.DRIFTA | TAGV.BACILLUS; // Fine mesh: plankton and microbes pass, hunters do not
const wall = ev => C.queueEvent({ type:"wallAdd", ...ev });

function fp(){
  const p=[0,0,0,0,0,0,0]; let sx=0, se=0, sm=0;
  for (let i=0;i<W.n;i++){ if(!W.alive[i]) continue; p[W.sp[i]]++; sx+=W.x[i]+W.y[i]; se+=W.en[i]; sm+=W.mn[i]; }
  let fM=0; for (let c=0;c<P.GRID*P.GRID;c++) fM+=W.M[c];
  return JSON.stringify({ p, sx:+sx.toFixed(3), se:+se.toFixed(3), sm:+sm.toFixed(3), fM:+fM.toFixed(3) });
}
let fails = 0;
const gate = (name, ok, info) => { console.log((ok?"  PASS ":"  FAIL ")+name+(info?" — "+info:"")); if(!ok) fails++; };

function open(){
  console.log("--open: transparent wall (lt=ht=fl=1, pass=all) vs no wall, 3000 ticks");
  for (const seed of [11, 88]){
    start(seed, true); for (let t=0;t<3000;t++) C.step(); const ref = fp();
    start(seed, true); wall({ x0:512, y0:0, dx:0, dy:1024, lt:1, ht:1, fl:1, pass:-1 });
    for (let t=0;t<3000;t++) C.step();
    gate("seed "+seed+" bit-identical", fp() === ref);
  }
}

function seal(){
  console.log("--seal: Stone walls at x=256 and x=768 split the torus (sun side vs dark side), 12000 ticks");
  const sideOf = x => x >= 256 && x < 768 ? 0 : 1; // 0 = sun side
  for (const seed of [11, 44, 66, 88]){
    start(seed, true);
    wall({ x0:256, y0:0, dx:0, dy:1024 }); wall({ x0:768, y0:0, dx:0, dy:1024 });
    C.step();
    const M0 = auditM() + W.addedM;
    let maxDark = 0;
    for (let c=0;c<P.GRID*P.GRID;c++) if (sideOf(((c%P.GRID)+0.5)*(P.WORLD/P.GRID))===1) maxDark = Math.max(maxDark, W.light[c]);
    for (let t=1;t<12000;t++) C.step();
    const drift = Math.abs(auditM() + W.addedM - M0);
    const side = [[0,0,0,0,0,0,0],[0,0,0,0,0,0,0]];
    for (let i=0;i<W.n;i++) if (W.alive[i]) side[sideOf(W.x[i])][W.sp[i]]++;
    gate("seed "+seed+" M audit flat", drift < 1.0, "drift "+drift.toFixed(3));
    gate("seed "+seed+" dark side lit by ambient only", maxDark <= P.ambient*P.lightMul + 1e-6, "max "+maxDark.toFixed(4));
    console.log("    sun side "+side[0].join("/")+"  dark side "+side[1].join("/")+"  (Sol/Dri/Cil/Bac/-/-/Ven)");
  }
}

function hideout(){
  console.log("--hideout: Fine-mesh box (352..480, 544..672) on the sun's flank; same-seed A/B, 18000 ticks");
  console.log("  refuge theory predicts: prey floor up, cycle damped; too-strong refuge starves the grazer");
  const inBox = i => W.x[i]>352 && W.x[i]<480 && W.y[i]>544 && W.y[i]<672;
  const run = (seed, withWall) => {
    start(seed, true);
    if (withWall){
      const m = { lt:0.9, ht:0.9, fl:0.7, pass:MESH };
      wall({ x0:352, y0:544, dx:128, dy:0, ...m }); wall({ x0:480, y0:544, dx:0, dy:128, ...m });
      wall({ x0:480, y0:672, dx:-128, dy:0, ...m }); wall({ x0:352, y0:672, dx:0, dy:-128, ...m });
    }
    const D=[]; let minD=Infinity;
    for (let t=1;t<=18000;t++){ C.step();
      if (t%20===0 && t>3000){ let d=0; for (let i=0;i<W.n;i++) if (W.alive[i]&&W.sp[i]===1) d++; D.push(d); minD=Math.min(minD,d); } }
    const p = pops(); let dIn=0, cIn=0;
    for (let i=0;i<W.n;i++){ if (!W.alive[i]) continue; if (W.sp[i]===1 && inBox(i)) dIn++; if (W.sp[i]===2 && inBox(i)) cIn++; }
    return { p, dIn, cIn, minD, cv:+cv(D).toFixed(2) };
  };
  console.log("  seed |  Drifta A/B | floor A/B |  cv A/B  | in-box D/C |  Cilio A/B | Venator A/B");
  for (const seed of [11,22,33,44,55,66,77,88]){
    const a = run(seed, true), b = run(seed, false);
    console.log("   "+String(seed).padStart(2)+"  | "+String(a.p[1]).padStart(5)+"/"+String(b.p[1]).padEnd(5)
      +"| "+String(a.minD).padStart(4)+"/"+String(b.minD).padEnd(4)
      +"| "+a.cv.toFixed(2)+"/"+b.cv.toFixed(2)
      +" | "+String(a.dIn).padStart(4)+"/"+String(a.cIn).padEnd(3)
      +"  | "+String(a.p[2]).padStart(4)+"/"+String(b.p[2]).padEnd(4)
      +"| "+String(a.p[6]).padStart(3)+"/"+b.p[6]);
    if (a.cIn > 0) console.log("        NOTE seed "+seed+": a grazer is inside the mesh (leak or was boxed in at founding)");
  }
}

function shade(){
  console.log("--shade: opaque wall x=608, y 320..704 east of the sun; mat biomass in the shadow sector, t=6000");
  const sector = c => { const gx=c%P.GRID, gy=(c/P.GRID)|0; // cells east of the wall, within the wall's rows
    return gx>=39 && gx<52 && gy>=20 && gy<44; };
  for (const seed of [11, 44, 66, 88]){
    const run = withWall => {
      start(seed, true);
      if (withWall) wall({ x0:608, y0:320, dx:0, dy:384 });
      for (let t=0;t<6000;t++) C.step();
      let s=0; for (let c=0;c<P.GRID*P.GRID;c++) if (sector(c)) s+=W.bB[c];
      return s;
    };
    const a = run(true), b = run(false);
    console.log("  seed "+seed+": shadow-sector mat "+a.toFixed(0)+" walled vs "+b.toFixed(0)+" control ("+(b>0?Math.round(100*a/b):0)+"%)");
  }
}

const args = process.argv.slice(2);
const all = args.length === 0;
if (all || args.includes("--open")) open();
if (all || args.includes("--seal")) seal();
if (args.includes("--hideout")) hideout();
if (args.includes("--shade")) shade();
console.log(fails ? "WALL GATES: "+fails+" FAILED" : "WALL GATES: ALL PASS");
process.exit(fails ? 1 : 0);
