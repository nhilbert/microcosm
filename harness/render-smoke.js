// Render smoke test — does the painting half of the render layer actually run?
//
// `harness/fingerprint-frame.js` proves the visual GRAMMAR agrees across implementations. Nothing
// proves the PAINTING, because painting needs a screen and there is no screen in CI. This is the
// weaker check that is still worth having: drive every painter against a recording canvas stub and
// require that each one runs without throwing and touches the canvas.
//
// It cannot tell you the frame looks right — only the owner's eyes and the owner's phone can do
// that. It can tell you that a refactor left a dangling reference or a wrong argument shape, which
// is the failure mode a blind edit actually has.
//
//   node harness/render-smoke.js
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const C = require(path.join(ROOT, "dist", "core.js"));
const { W, P, TRAITS, SPECIES, MAXN, CELL, cellOf, wd, wrap, makeWall } = C;

// ---- a Canvas 2D stub that counts what it is asked to do ----
let calls = 0;
const CTX_METHODS = ["fillRect", "clearRect", "beginPath", "arc", "fill", "stroke", "moveTo",
  "lineTo", "closePath", "save", "restore", "translate", "rotate", "scale", "rect", "clip",
  "setLineDash", "putImageData", "setTransform", "drawImage", "measureText", "fillText"];
function makeCtx(w, h){
  const ctx = {
    createRadialGradient(){ calls++; return { addColorStop(){ calls++; } }; },
    createImageData(cw, ch){ return { width: cw, height: ch, data: new Uint8ClampedArray(cw*ch*4) }; },
    getImageData(_x, _y, cw, ch){ return { width: cw, height: ch, data: new Uint8ClampedArray(cw*ch*4) }; },
    canvas: { width: w, height: h },
  };
  for (const m of CTX_METHODS) ctx[m] = () => { calls++; };
  return ctx;
}
global.document = {
  createElement(){
    const el = { width: 300, height: 150 };
    el.getContext = () => makeCtx(el.width, el.height);
    return el;
  },
};

// ---- load the render layer (it is UI, so it is not in dist/core.js) ----
const src = fs.readFileSync(path.join(ROOT, "src", "ui-render.js"), "utf8");
const names = ["makeGrammar", "makeSpriteSet", "makeWorldLayers", "frameOf", "paintOrganisms",
  "paintCorpses", "drawPours", "drawSunAffordance", "drawSelectionRing", "drawWallAffordance",
  "drawWallPreview", "drawGhostRay", "makeSprite", "bucketSpec", "tintRgb", "SPECIES_META", "SHAPES"];
const R = new Function("W", "P", "TRAITS", "SPECIES", "MAXN", "CELL", "cellOf", "wd", "wrap",
  "makeWall", "document", `${src}\n; return { ${names.join(", ")} };`)(
  W, P, TRAITS, SPECIES, MAXN, CELL, cellOf, wd, wrap, makeWall, global.document);

// ---- a world with something in it, plus the apparatus ----
P.mutation = true;
C.resetWorld(); C.initWorld(11);
for (let t = 0; t < 400; t++){ W.px.set(W.x); W.py.set(W.y); C.step(); }
C.applyEvent({ type: "sourceAdd", x: 300, y: 700, i: 0.7, a: 6, sigma: 150 });
C.applyEvent({ type: "wallAdd", x0: 200, y0: 200, dx: 300, dy: 40, lt: 0.5, ht: 0.2, fl: 0.1, pass: 0 });
for (let t = 0; t < 60; t++){ W.px.set(W.x); W.py.set(W.y); C.step(); }

let fails = 0;
// `draws: false` for the two cases where drawing nothing is the correct answer: the frame builder
// is grammar and owns no canvas, and below the LOD threshold corpses live in the pall layer.
function run(label, fn, draws = true){
  const before = calls;
  try {
    fn();
  } catch (e){
    console.log(`  FAIL  ${label.padEnd(34)} threw: ${e && e.message}`);
    fails++;
    return;
  }
  const n = calls - before;
  if (draws && n === 0){
    console.log(`  FAIL  ${label.padEnd(34)} ran but never touched the canvas`);
    fails++;
    return;
  }
  console.log(`  ok    ${label.padEnd(34)} ${draws ? `${n} draw calls` : "no drawing, as expected"}`);
}

console.log("RENDER SMOKE — the painting path runs (not that it looks right)");
let S, L;
run("makeSpriteSet", () => { S = R.makeSpriteSet(); });
run("makeWorldLayers", () => { L = R.makeWorldLayers(); });
run("drawLight / drawHeat / drawWalls", () => { L.drawLight(); L.drawHeat(); L.drawWalls(); });
run("drawShade + updateCarpet", () => { L.drawShade(); L.updateCarpet(); });

const ctx = makeCtx(900, 1600);
const G = R.makeGrammar();
// zoomed in (sprites, husks, the ray) and zoomed out (the dot LOD), so both paths are painted
for (const [zl, z] of [["zoomed in", 1.6], ["zoomed out", 0.45]]){
  const view = { camX: 512, camY: 512, vw: 900, vh: 1600, z, hw: 450, hh: 800, alpha: 0.4, dpr: 2, lodZ: L.LOD_Z };
  const hidden = [0,0,0,0,0,0,0,0,0,0];
  let F;
  run(`frameOf (${zl})`, () => {
    F = R.frameOf(view, hidden, G);
    if (!F.orgN) throw new Error("empty display list");
    if (z < L.LOD_Z && F.corpseN) throw new Error("corpses below the LOD threshold belong to the pall layer");
    if (z >= L.LOD_Z && !F.corpseN) throw new Error("no corpse husks above the LOD threshold");
  }, false);
  run(`paintOrganisms (${zl})`, () => R.paintOrganisms(ctx, F, S));
  run(`paintCorpses (${zl})`, () => R.paintCorpses(ctx, F), z >= 0.9);
  run(`drawSunAffordance (${zl})`, () => R.drawSunAffordance(ctx, view, 0));
  run(`drawWallAffordance (${zl})`, () => R.drawWallAffordance(ctx, view, 0));
  run(`drawWallPreview (${zl})`, () => R.drawWallPreview(ctx, view, { x0: 100, y0: 100, x1: 400, y1: 160 }));
  run(`drawSelectionRing (${zl})`, () => {
    let i = 0; while (i < W.n && !W.alive[i]) i++;
    R.drawSelectionRing(ctx, view, i);
  });
  run(`drawGhostRay (${zl})`, () => R.drawGhostRay(ctx, 100, 100, 0.5, 9, true, null));
  run(`drawPours (${zl})`, () => R.drawPours(ctx, [{ sx: 10, sy: 10, t: 0 }], 200));
}
// every sprite bucket has to render, not just the ones this world happens to occupy
run("every sprite bucket renders", () => {
  for (let sp = 0; sp < 7; sp++){
    const g = G[sp];
    for (let tb = 0; tb < (g ? g.tN : 1); tb++) for (let mb = 0; mb < (g ? g.mN : 1); mb++){
      const spec = R.bucketSpec(G, sp, tb, mb);
      R.makeSprite(spec.rgb, spec.shape, { outline: spec.outline, round: spec.round });
    }
  }
});

P.mutation = false;
console.log(fails === 0 ? "RENDER SMOKE: ALL PASS" : `RENDER SMOKE: ${fails} FAILED`);
if (fails) process.exit(1);
