// Frame fingerprint — the visual grammar, as data.
//
// The renderer decides things that were measured or owner-decided: which sprite bucket an organism
// lands in, where it projects, what colour a cell of the mat carpet is, how far a sun's glow
// reaches. With a native app those decisions would ordinarily be written twice, in two languages,
// with no way to notice a disagreement short of putting two screens side by side. So the core
// carries them (rust/microcosm-core/src/frame.rs), `src/ui-render.js` carries the reference, and
// this prints both as raw bits.
//
// Against dist/core.js it loads the grammar out of the render layer (which is not part of the
// core bundle — it is UI); against MC_CORE it asks the core. Same output either way, or a defect.
//
//   node harness/fingerprint-frame.js
//   MC_CORE=rust/wasm/core.js node harness/fingerprint-frame.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const C = require(process.env.MC_CORE || path.join(ROOT, "dist", "core.js"));
const { W, P, TRAITS, SPECIES, MAXN, CELL, cellOf, wd, wrap, makeWall } = C;

// The frame builder: the core's when it has one, otherwise the render layer's.
const F = C.frameOf ? C : (() => {
  const src = fs.readFileSync(path.join(ROOT, "src", "ui-render.js"), "utf8");
  const names = ["makeGrammar", "bucketSpec", "frameOf", "TINT_BINS",
    "fieldCarpet", "fieldMineral", "fieldCorpsePall", "fieldShade",
    "sunGlows", "sunMarks", "heatGlows", "heatMarks", "wallStrokes"];
  // `document` is never touched by the grammar half of the file — only by makeSprite and
  // makeWorldLayers, which are painting and are not called here.
  return new Function("W", "P", "TRAITS", "SPECIES", "MAXN", "CELL", "cellOf", "wd", "wrap",
    "makeWall", "document", `${src}\n; return { ${names.join(", ")} };`)(
    W, P, TRAITS, SPECIES, MAXN, CELL, cellOf, wd, wrap, makeWall, undefined);
})();

const buf = Buffer.alloc(8);
const h = d => { buf.writeDoubleBE(d); return buf.toString("hex"); };
const sha = b => crypto.createHash("sha256").update(b).digest("hex").slice(0, 16);
const shaD = (arr, n) => sha(Buffer.from(Float64Array.prototype.slice.call(arr, 0, n).buffer));

const GRID = P.GRID, FIELD = GRID * GRID * 4;
const fieldBuf = new Uint8ClampedArray(FIELD);
const fieldHash = fn => { fieldBuf.fill(0); fn(fieldBuf); return sha(Buffer.from(fieldBuf.buffer, 0, FIELD)); };

console.log("=== sprite bucket table (grammar) ===");
const G = F.makeGrammar();
for (let sp = 0; sp < 7; sp++){
  const g = G[sp];
  if (!g){ console.log(`  sp${sp} (none)`); continue; }
  console.log(`  sp${sp} tint ${g.tintPlane} morph ${g.morphPlane} outline ${g.outlinePlane}` +
    ` round ${g.roundPlane} tN ${g.tN} mN ${g.mN}`);
  for (let tb = 0; tb < g.tN; tb++) for (let mb = 0; mb < g.mN; mb++){
    const s = F.bucketSpec(G, sp, tb, mb);
    console.log(`    [${tb},${mb}] rgb ${s.rgb.join(",")} ${s.shape} scale ${h(s.scale)}` +
      ` outline ${h(s.outline)} round ${h(s.round)}`);
  }
}
// a species with no grammar still has to yield its plain sprite spec
for (const sp of [0, 6]){
  const s = F.bucketSpec(G, sp, 0, 0);
  console.log(`  plain sp${sp} rgb ${s.rgb.join(",")} ${s.shape} scale ${h(s.scale)}`);
}

// The cameras: the wrap seam, both sides of the LOD threshold, and every interpolation end.
const VIEWS = [
  { camX: 512, camY: 512, vw: 900, vh: 1600, z: 1.0,  hw: 450, hh: 800, alpha: 1,    lodZ: 0.9 },
  { camX: 512, camY: 512, vw: 900, vh: 1600, z: 0.45, hw: 450, hh: 800, alpha: 0,    lodZ: 0.9 },
  { camX: 30,  camY: 990, vw: 420, vh: 740,  z: 1.6,  hw: 210, hh: 370, alpha: 0.37, lodZ: 0.9 },
  { camX: 1000, camY: 12, vw: 420, vh: 740,  z: 0.9,  hw: 210, hh: 370, alpha: 0.5,  lodZ: 0.9 },
];
const HIDDEN = [
  ["nothing hidden",  [0,0,0,0,0,0,0,0,0,0]],
  ["Drifta hidden",   [0,1,0,0,0,0,0,0,0,0]],
  ["debris hidden",   [0,0,0,0,0,0,0,1,0,0]],
];

function report(label){
  console.log(`\n=== ${label} — t ${W.tick} ===`);
  console.log(`  fields  carpet ${fieldHash(F.fieldCarpet)}  mineral ${fieldHash(F.fieldMineral)}` +
    `  pall ${fieldHash(F.fieldCorpsePall)}  shade ${fieldHash(F.fieldShade)}`);
  for (const g of F.sunGlows())  console.log(`  sun  x ${h(g.x)} y ${h(g.y)} r ${h(g.r)} a ${h(g.a)}`);
  for (const m of F.sunMarks())  console.log(`  sunMark  x ${h(m.x)} y ${h(m.y)}`);
  for (const g of F.heatGlows()) console.log(`  heat x ${h(g.x)} y ${h(g.y)} r ${h(g.r)} m ${h(g.m)} warm ${g.warm}`);
  for (const m of F.heatMarks()) console.log(`  heatMark x ${h(m.x)} y ${h(m.y)} warm ${m.warm}`);
  for (const wl of F.wallStrokes())
    console.log(`  wall a ${h(wl.a)} dashed ${wl.dashed} pts ${wl.pts.length} ${sha(Buffer.from(Float64Array.from(wl.pts.flat()).buffer))}`);
  for (const [hlabel, hidden] of HIDDEN){
    for (let v = 0; v < VIEWS.length; v++){
      const fr = F.frameOf(VIEWS[v], hidden, G);
      console.log(`  view${v} ${hlabel.padEnd(15)} org ${String(fr.orgN).padStart(5)}` +
        ` corpse ${String(fr.corpseN).padStart(4)} pops ${fr.pops.join(",")}` +
        ` mn ${h(fr.mnBound)} orgHash ${shaD(fr.org, fr.orgN * 8)}` +
        ` corpseHash ${shaD(fr.corpse, fr.corpseN * 4)}`);
      if (hlabel === "nothing hidden"){ // the first record of each kind in full, so a diff names the path
        const seen = new Set();
        for (let q = 0; q < fr.orgN; q++){
          const b = q * 8;
          if (seen.has(fr.org[b])) continue;
          seen.add(fr.org[b]);
          console.log(`    kind${fr.org[b]} org[${q}] sx ${h(fr.org[b+1])} sy ${h(fr.org[b+2])}` +
            ` r ${h(fr.org[b+3])} sp ${fr.org[b+4]} bucket ${fr.org[b+5]} hd ${h(fr.org[b+6])} flags ${fr.org[b+7]}`);
        }
        if (fr.corpseN) console.log(`    corpse[0] sx ${h(fr.corpse[0])} sy ${h(fr.corpse[1])}` +
          ` r ${h(fr.corpse[2])} a ${h(fr.corpse[3])}`);
      }
    }
  }
}

// An evolving world: with mutation off every genotype sits at g0 and every organism lands in the
// same bucket, which would let a mistranslated bin table pass unnoticed.
P.mutation = true;
C.resetWorld(); C.initWorld(11);
W.px.set(W.x); W.py.set(W.y);
report("founding");
for (let t = 0; t < 600; t++){ W.px.set(W.x); W.py.set(W.y); C.step(); }
report("t=600");
for (let t = 0; t < 2400; t++){ W.px.set(W.x); W.py.set(W.y); C.step(); }
report("t=3000");

// A world with the apparatus in it: a second sun, a cold one, and two walls — the glow, shade and
// wall-stroke lists are empty in the shipped world and would otherwise never be compared.
C.applyEvent({ type: "sourceAdd", x: 300, y: 700, i: 0.7, a: 6, sigma: 150 });
C.applyEvent({ type: "sourceAdd", x: 880, y: 120, i: 0, a: -8, sigma: 120 });
C.applyEvent({ type: "wallAdd", x0: 200, y0: 200, dx: 300, dy: 40, lt: 0.5, ht: 0.2, fl: 0.1, pass: 0 });
C.applyEvent({ type: "wallAdd", x0: 700, y0: 900, dx: -60, dy: 220, lt: 0, ht: 0, fl: 1, pass: 4 });
for (let t = 0; t < 200; t++){ W.px.set(W.x); W.py.set(W.y); C.step(); }
report("suns + walls, t=3200");
P.mutation = false;
