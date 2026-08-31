// ============================================================
// RENDER / UI LAYER — browser-specific (Canvas 2D, React, pointers).
// Rewritten per platform; must never be imported by the sim core.
// ============================================================
const COL = {
  abyss: "#0B131E", water: "#152233", plankTxt: "#C9D7E3", silt: "#5E7386",
  solara: [70, 214, 140], drifta: [91, 200, 232], cilio: [215, 166, 232], bacillus: [158, 168, 104],
  mycora: [206, 182, 148], necro: [228, 224, 210], venator: [168, 214, 244],
};
const SPECIES_META = [
  { name:"Solara", role:"Producer · sessile mat", rgb: COL.solara },
  { name:"Drifta", role:"Producer · plankton",    rgb: COL.drifta },
  { name:"Cilio",  role:"Grazer · ciliate",       rgb: COL.cilio  },
  { name:"Bacillus", role:"Decomposer · colony",   rgb: COL.bacillus },
  { name:"Mycora",   role:"Decomposer · fungus",   rgb: COL.mycora },   // dormant until 3.4
  { name:"Necro",    role:"Scavenger",             rgb: COL.necro },    // dormant until 3.3
  { name:"Venator",  role:"Predator · pursuit",    rgb: COL.venator },
];
// Species profiles ("Steckbrief"), from the same TRAITS rows the sim runs on. Shown on the
// specimen card. Image: assets/species/<key>.jpg (640px), optional -- the card hides the slot if missing.
const SPECIES_PROFILE = [
  { key:"solara",
    intro:"Solara is a colonial, mat-forming alga of the lit floor. Anchored in place, it turns light and dissolved mineral into biomass, spreading cell by cell across the sediment until crowding halts it. Where the light is strongest the carpet grows thickest — the pond's primary producer and its living floor.",
    habitat:"the lit floor near the sun; a carpet, thickest where light is strongest",
    behaviour:"sessile; photosynthesises; divides into the neighbouring floor until the mat is crowded",
    food:"light and dissolved mineral", eatenBy:"Cilio — poor food; the lowest 35 units of every mat are ungrazeable refugia",
    size:"7–9 units at founding", lifecycle:"small constant hazard; no cyst" },
  { key:"drifta",
    intro:"Drifta is a free-drifting planktonic alga of the open water and the fastest grower in the world. It rides the water with a weak pull toward light, and when starved it folds into a resistant cyst until light returns. As the grazer's favourite food, its numbers rise and crash in the pond's great prey cycles.",
    habitat:"open water wherever the light reaches; drifts up the local light gradient — in dark water there is nothing to steer by, so it never crosses to a farther sun",
    behaviour:"damped random walk with weak phototaxis; encysts when starved, wakes when light returns",
    food:"light and dissolved mineral — the fastest grower in the world", eatenBy:"Cilio — its best food; a 35% escape jink breaks contact",
    size:"3.4 units", lifecycle:"cyst at 18% reserve, wakes on light" },
  { key:"cilio",
    intro:"Cilio is a ciliate grazer — a single cell driven by a shimmering fringe of cilia. It steers actively toward its prey, prefers Drifta above all, and flees when the alarm scent of injured neighbours drifts past. It holds the middle of the food web: chief consumer of the producers, and the sole prey of the apex predator.",
    habitat:"the productive core, following its food",
    behaviour:"steering forager; pursues the nearest edible target; flees down the alarm gradient when neighbours are injured",
    food:"Drifta (best), Bacillus (survival food), Solara (poor)", eatenBy:"Venator — with a 30% escape jink of its own",
    size:"6 units", lifecycle:"matures 200 ticks after division, divides at most every 160; encysts when starved, wakes on prey" },
  { key:"bacillus",
    intro:"Bacillus is a colony-forming decomposer bacterium. Tumbling along detritus gradients, it consumes dead matter and returns its bound mineral to the water — the recycling service every other species depends on. Without it, the pond's mineral slowly locks up in corpses and the whole web strangles.",
    habitat:"wherever dead matter settles; follows detritus gradients",
    behaviour:"run-and-tumble; eats detritus and mineralises — returns bound mineral to the water. The recycling guild.",
    food:"detritus energy and protein", eatenBy:"Cilio — survival food; cysts edible at half yield",
    size:"2 units; colonies, not cells", lifecycle:"encysts when starved; wakes on detritus or death-scent" },
  null, null,
  { key:"venator",
    intro:"Venator is the pond's apex predator, a fast pursuit hunter that feeds on Cilio alone. It strikes in a straight line with a jet burst, holds a territory against its own kind, and breeds slower than anything else in the water. An apex is knife-edged by nature: it persists in most worlds and is lost in some.",
    habitat:"the hunting grounds around the core; a pack founds together as cysts",
    behaviour:"fast straight-line pursuit with a jet burst; outturned by its prey; territorial; finishes the carcasses of its own kills",
    food:"Cilio only", eatenBy:"nothing",
    size:"9 units", lifecycle:"the slowest breeder (700-tick cooldown); a knife-edged apex — reported, never required" },
];
const SHAPES = ["nucleus","dot","tri","square","dot","dot","ray"]; // sprite shape per species; "ray" = drawn as paths (drawGhostRay)
const SPRITE_SCALE = [1.1, 1.9, 2.2, 1.6, 2.2, 2.2, 1.0];          // screen radius = size * scale * zoom
const GLYPH = ["●","●","▲","▪","●","●","△"];                      // status-strip glyph per species
// Genotype tint (Phase 5.3): a bounded shift WITHIN the species hue. t=0 (the loWord end) leans
// paler and warmer, t=1 (the hiWord end) deeper and cooler; the midpoint is the species color
// exactly, so a silent genome renders precisely as before. Species identity stays legible at
// overview; the shift is meant to be read at loupe zoom and on the Traits histogram.
// Implemented as a hue rotation of +-TINT_HUE degrees plus a lightness tilt, in HSL: a channel
// nudge disappears under the glow composite; a hue turn survives it. t=0 turns warm and light,
// t=1 turns cool and deep.
const TINT_HUE = 52, TINT_LIGHT = 0.14;
function rgbToHsl(r, g, b){
  r/=255; g/=255; b/=255;
  const mx = Math.max(r,g,b), mn = Math.min(r,g,b), l = (mx+mn)/2;
  if (mx === mn) return [0, 0, l];
  const d = mx-mn, s = l > 0.5 ? d/(2-mx-mn) : d/(mx+mn);
  let h = mx===r ? (g-b)/d + (g<b ? 6 : 0) : mx===g ? (b-r)/d + 2 : (r-g)/d + 4;
  return [h*60, s, l];
}
function hslToRgb(h, s, l){
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2*l - 1)) * s, x = c * (1 - Math.abs((h/60) % 2 - 1)), m = l - c/2;
  const [r,g,b] = h < 60 ? [c,x,0] : h < 120 ? [x,c,0] : h < 180 ? [0,c,x] : h < 240 ? [0,x,c] : h < 300 ? [x,0,c] : [c,0,x];
  return [Math.round((r+m)*255), Math.round((g+m)*255), Math.round((b+m)*255)];
}
function tintRgb(rgb, t){
  const k = (t - 0.5) * 2; // -1..1
  if (k === 0) return rgb.slice();
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  return hslToRgb(h - TINT_HUE*k, Math.min(1, s + 0.10*Math.abs(k)), Math.max(0.15, Math.min(0.85, l - TINT_LIGHT*k)));
}
// vis (locus visual grammar, owner decision 2026-08-30, implemented with this UI block):
//   { outline: 0..1 }  defense loci -- tougher lines carry a shell-like ring around the body
//   { round: 0..1 }    feeding/metabolic axes, circular<->square -- thriftier rounds the silhouette,
//                      keener/voracious keeps it sharp
// Tint is applied by the CALLER and belongs to temperature loci alone (warm-adapted leans warm).
function makeSprite(rgb, shape, vis){
  const s = 64, c = document.createElement("canvas"); c.width = s; c.height = s;
  const g = c.getContext("2d"); const [r, gg, b] = rgb;
  const rnd = vis && vis.round !== undefined ? vis.round : 0;
  if (shape === "nucleus"){ // Solara individual: small dim marker; the mass lives in the carpet layer
    g.fillStyle = `rgba(${Math.round(r*0.8)},${Math.round(gg*0.9)},${Math.round(b*0.85)},0.55)`;
    g.beginPath(); g.arc(s/2, s/2, 5, 0, 6.283); g.fill();
    g.fillStyle = "rgba(230,255,240,0.35)";
    g.beginPath(); g.arc(s/2, s/2, 2.2, 0, 6.283); g.fill();
    return c;
  }
  const grad = g.createRadialGradient(s/2, s/2, 2, s/2, s/2, s/2);
  if (shape === "square"){ // Bacillus: dim earthy speck, square = decomposer
    grad.addColorStop(0, `rgba(${r},${gg},${b},0.55)`);
    grad.addColorStop(0.45, `rgba(${r},${gg},${b},0.18)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    g.fillStyle = `rgba(${Math.min(255,r+60)},${Math.min(255,gg+60)},${Math.min(255,b+50)},0.85)`;
    const half = 3.4 - rnd*1.1; // stroke-rounding fattens the core; shrink so the body stays one size
    g.beginPath(); g.rect(s/2-half, s/2-half, half*2, half*2); g.fill();
    if (rnd > 0.02){ g.strokeStyle = g.fillStyle; g.lineJoin = "round"; g.lineWidth = rnd*4.5; g.stroke(); }
    return c;
  }
  if (shape === "tri"){ // Cilio: rare + moving, allowed the luminance peak
    grad.addColorStop(0, `rgba(${r},${gg},${b},0.9)`);
    grad.addColorStop(0.4, `rgba(${r},${gg},${b},0.4)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    // the mark carries the color: a pure white triangle washed every tint out under the screen composite
    g.save();
    if (rnd > 0.02){ g.translate(s/2, s/2); g.scale(1 - 0.09*rnd, 1 - 0.09*rnd); g.translate(-s/2, -s/2); }
    g.fillStyle = `rgba(${Math.min(255,r+55)},${Math.min(255,gg+55)},${Math.min(255,b+55)},0.95)`;
    g.beginPath(); g.moveTo(s*0.72, s*0.5); g.lineTo(s*0.38, s*0.36); g.lineTo(s*0.38, s*0.64); g.closePath(); g.fill();
    g.lineJoin = "round";
    if (rnd > 0.02){ g.strokeStyle = g.fillStyle; g.lineWidth = rnd*7; g.stroke(); }
    g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 1.2 + rnd*4; g.stroke();
    g.restore();
  } else { // Drifta: soft glow, colored (not white) center, modest alpha
    grad.addColorStop(0, `rgba(${r},${gg},${b},0.6)`);
    grad.addColorStop(0.4, `rgba(${r},${gg},${b},0.22)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    g.fillStyle = `rgba(${Math.min(255,r+40)},${Math.min(255,gg+35)},${Math.min(255,b+30)},0.9)`;
    g.beginPath(); g.arc(s/2, s/2, 3.6, 0, 6.283); g.fill();
    if (vis && vis.outline !== undefined && vis.outline > 0.02){ // defense ring: the tougher end wears a shell
      g.strokeStyle = `rgba(235,246,255,${(0.10 + 0.75*vis.outline).toFixed(3)})`;
      g.lineWidth = 1 + 1.6*vis.outline;
      g.beginPath(); g.arc(s/2, s/2, 5.6, 0, 6.283); g.stroke();
    }
  }
  return c;
}


// The Ghost Ray (Venator): hollow spearhead, bright leading edge, fading trail, wake ghosts.
// Drawn as paths (population is always small); heading-aligned; a Strike stretches it into a streak.
function drawRayHead(ctx, r, alpha, scale, stretch){
  // spearhead: barely longer than wide, broad shoulders, deep notch
  const L = r*1.0*stretch*scale, Wd = r*0.95*scale, back = r*0.75*stretch*scale, notch = r*0.5*stretch*scale;
  ctx.fillStyle = `rgba(150,200,235,${(0.10*alpha).toFixed(3)})`;
  ctx.beginPath();
  ctx.moveTo(L, 0); ctx.lineTo(-back, Wd); ctx.lineTo(-notch, 0); ctx.lineTo(-back, -Wd);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = `rgba(212,236,255,${(0.85*alpha).toFixed(3)})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-back, Wd); ctx.lineTo(L, 0); ctx.lineTo(-back, -Wd); ctx.stroke();
  ctx.strokeStyle = `rgba(150,200,235,${(0.20*alpha).toFixed(3)})`;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-back, Wd); ctx.lineTo(-notch, 0); ctx.lineTo(-back, -Wd); ctx.stroke();
}
function drawGhostRay(ctx, sx, sy, hd, r, striking, trail){
  const stretch = striking ? 1.4 : 1.0;
  // wake: the hunter's ACTUAL past positions — it bends through turns because it is the turn
  if (trail){
    for (let q = 0; q < trail.length; q++){
      const g = trail[q];
      ctx.save(); ctx.translate(g.sx, g.sy); ctx.rotate(g.hd);
      drawRayHead(ctx, r, q === trail.length-1 ? 0.26 : 0.11, q === trail.length-1 ? 0.85 : 0.7, 1);
      ctx.restore();
    }
  }
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(hd);
  drawRayHead(ctx, r, 1, 1, stretch);
  ctx.fillStyle = "rgba(240,250,255,0.95)";
  ctx.beginPath(); ctx.arc(r*1.0*stretch, 0, 1.4, 0, 6.283); ctx.fill();
  if (striking){
    ctx.strokeStyle = "rgba(212,236,255,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-r*3.2, 0); ctx.lineTo(r*0.8, 0); ctx.stroke();
  }
  ctx.restore();
}

// ============================================================
// THE FRAME BUILDER — the visual GRAMMAR, separated from the painting.
//
// Everything below decides *what* to draw: which sprite bucket an organism lands in, where it
// projects on screen, what colour a cell of the mat carpet is, how wide a sun's glow reaches.
// Those are measured or owner-decided rules, and the phone and the browser must not disagree
// about any of them — so they live once, in the core (rust/microcosm-core/src/frame.rs), with
// this as the reference implementation. `harness/fingerprint-frame.js` runs both and compares
// raw bits; `tools/port-check.js` runs that comparison.
//
// The painting stays per platform: gradients, blend modes, the sprite bitmaps themselves, text.
// Two platforms will not produce identical gradient pixels, and it does not matter — what must
// agree is which bucket an organism is in, not how prettily the bucket is drawn.
//
// Pure observers, all of them: zero PRNG draws, no mutation of dynamic state.
// ============================================================

// ---- per-cell pixel fields: GRID x GRID RGBA, written into a caller's buffer ----
// A fully transparent pixel is written as 0,0,0,0 rather than left with whatever it held before.
// It paints identically (alpha 0 contributes nothing) and it makes the buffer comparable.
function fieldMineral(d){ // faint blue nutrient water, dark where depleted
  for (let c = 0; c < P.GRID*P.GRID; c++){
    const o = c*4, m = Math.min(1, W.M[c] / 3.2);
    d[o] = 64; d[o+1] = 138; d[o+2] = 205; d[o+3] = Math.round(82 * m);
  }
}
// mat carpet: density field for sessile producers (Splatterplots-style aggregation).
// Denser mats render DARKER, saturated green — thick algae absorb light; brightness stays reserved.
// Documented grammar exception: the carpet keeps its plane-0 (light locus) genotype turn, because a
// per-cell pixel field has no outline or body form to carry it.
const _cellG = new Float32Array(P.GRID * P.GRID), _cellGn = new Uint16Array(P.GRID * P.GRID);
function fieldCarpet(d){
  const matLocus = SPECIES.MAT >= 0 && TRAITS[SPECIES.MAT].locus;
  if (matLocus){
    _cellG.fill(0); _cellGn.fill(0);
    for (let i = 0; i < W.n; i++) if (W.alive[i] && W.sp[i] === SPECIES.MAT){ const c = cellOf(i); _cellG[c] += W.g[i]; _cellGn[c]++; }
  }
  for (let c = 0; c < P.GRID*P.GRID; c++){
    const o = c*4;
    const dens = Math.min(1, W.bB[c] / 200);
    if (dens <= 0.01){ d[o] = 0; d[o+1] = 0; d[o+2] = 0; d[o+3] = 0; continue; }
    const t = Math.sqrt(dens); // fast rise, then saturate
    if (matLocus && _cellGn[c]){ // sparse [96,205,150] -> dense [34,123,78], both turned by the cell's mean genotype
      const gm = _cellG[c] / _cellGn[c];
      const lo = tintRgb([96,205,150], gm), hi = tintRgb([34,123,78], gm);
      d[o]   = Math.round(lo[0] + (hi[0]-lo[0])*t);
      d[o+1] = Math.round(lo[1] + (hi[1]-lo[1])*t);
      d[o+2] = Math.round(lo[2] + (hi[2]-lo[2])*t);
    } else {
      d[o]   = Math.round(96 - 62*t);   // r: 96 -> 34
      d[o+1] = Math.round(205 - 82*t);  // g: 205 -> 123
      d[o+2] = Math.round(150 - 72*t);  // b: 150 -> 78
    }
    d[o+3] = Math.round(70 + 150*t);    // alpha: sparse faint -> dense solid
  }
}
const _corpseMass = new Float32Array(P.GRID * P.GRID);
function fieldCorpsePall(d){ // zoomed out, husks merge into a gray pall
  _corpseMass.fill(0);
  for (let k = 0; k < W.cN; k++){
    if (!W.cAlive[k]) continue;
    const cc = (Math.floor(W.cY[k]/(P.WORLD/P.GRID))&(P.GRID-1))*P.GRID + (Math.floor(W.cX[k]/(P.WORLD/P.GRID))&(P.GRID-1));
    _corpseMass[cc] += W.cE[k] + W.cP[k] + W.cM[k];
  }
  for (let c = 0; c < P.GRID*P.GRID; c++){
    const o = c*4;
    d[o] = 158; d[o+1] = 168; d[o+2] = 178;
    d[o+3] = Math.min(150, Math.round(_corpseMass[c] * 4));
  }
}
function fieldShade(d){ // 7.W: the honest darkening where walls occlude the sources
  for (let c = 0; c < P.GRID*P.GRID; c++){
    const o = c*4;
    d[o] = 6; d[o+1] = 10; d[o+2] = 16;
    d[o+3] = Math.round(175 * (1 - W.wShade[c]));
  }
}

// ---- world-tile vector lists, in the 512-unit tile space the layers are painted on ----
// A glow near a tile edge must continue on the far side, so each source is emitted at every
// wrapped offset its radius reaches (the field itself wraps in computeLight).
function sunGlows(){
  const k = 512 / P.WORLD, out = [];
  for (const s of W.sources){
    const a = Math.min(1, s.i), r = s.sigma*2.2*k, cx = s.x*k, cy = s.y*k;
    for (let ox = -512; ox <= 512; ox += 512) for (let oy = -512; oy <= 512; oy += 512){
      const x = cx+ox, y = cy+oy;
      if (x + r < 0 || x - r > 512 || y + r < 0 || y - r > 512) continue;
      out.push({ x, y, r, a });
    }
  }
  return out;
}
function sunMarks(){
  const k = 512 / P.WORLD, out = [];
  for (const s of W.sources){ if (s.i <= 0) continue;
    for (let ox = -512; ox <= 512; ox += 512) for (let oy = -512; oy <= 512; oy += 512)
      out.push({ x: s.x*k+ox, y: s.y*k+oy }); }
  return out;
}
// 7.H: warmth as an ember glow, cold as a blue one — never amber, which is the hand's colour.
function heatGlows(){
  const k = 512 / P.WORLD, out = [];
  for (const s of W.sources){
    if (s.a === 0) continue;
    const warm = s.a > 0, m = Math.min(1, Math.abs(s.a)/10), r = s.sigma*2.2*k, cx = s.x*k, cy = s.y*k;
    for (let ox = -512; ox <= 512; ox += 512) for (let oy = -512; oy <= 512; oy += 512){
      const x = cx+ox, y = cy+oy;
      if (x + r < 0 || x - r > 512 || y + r < 0 || y - r > 512) continue;
      out.push({ x, y, r, m, warm });
    }
  }
  return out;
}
function heatMarks(){ // a dark source still needs a mark
  const k = 512 / P.WORLD, out = [];
  for (const s of W.sources){ if (s.a === 0 || s.i > 0) continue;
    for (let ox = -512; ox <= 512; ox += 512) for (let oy = -512; oy <= 512; oy += 512)
      out.push({ x: s.x*k+ox, y: s.y*k+oy, warm: s.a > 0 }); }
  return out;
}
// 7.W: crisp slate polylines. Dashed = something may pass (a grille); translucency follows light
// transmission (glass fades). Never amber — a placed wall belongs to the world.
function wallStrokes(){
  const k = 512 / P.WORLD;
  return W.walls.map(wl => ({
    a: 0.92 - 0.62*wl.lt,
    dashed: wl.pass !== 0,
    pts: wl.path.map(p => [p[0]*CELL*k, p[1]*CELL*k]),
  }));
}

// ---- the sprite bucket table ----
// Which bin an organism lands in is grammar; the 64x64 bitmaps are painting. Split so the frame
// builder runs without a canvas, and so the core can carry the same table.
//   tint      <- the species' temperature locus (warmSlope/warmGainSlope), warm-adapted leaning WARM
//   outline   <- the defense locus (escSlope): tougher wears a ring
//   roundness <- feeding/metabolic axes (catchSlope/rateSlope/effSlope): thrifty rounds, keen stays sharp
// Movement-strategy loci carry NO body channel (owner decision D7) — their display is behaviour.
const TINT_BINS = 7;
// Below this zoom: aggregate corpses into the pall layer, draw bacteria as dots. Grammar, so the
// core carries it too (frame.rs LOD_Z) and the frame gate compares them.
const LOD_Z = 0.9;
function makeGrammar(){
  return TRAITS.map((T, sp) => {
    if (!T.loci.length || SHAPES[sp] === "ray" || SHAPES[sp] === "nucleus") return null;
    const tintPlane = T.loci.findIndex(L => L.warmSlope || L.warmGainSlope);
    const outlinePlane = T.loci.findIndex(L => L.escSlope > 0);
    const roundPlane = T.loci.findIndex(L => L.catchSlope > 0 || L.rateSlope > 0 || L.effSlope > 0);
    const morphPlane = outlinePlane >= 0 ? outlinePlane : roundPlane;
    if (tintPlane < 0 && morphPlane < 0) return null;
    return { tintPlane, morphPlane, outlinePlane, roundPlane,
      tN: tintPlane >= 0 ? TINT_BINS : 1, mN: morphPlane >= 0 ? TINT_BINS : 1 };
  });
}

// Everything a painter needs to render one bucket's 64x64 sprite. The colour and the two shape
// dials are decided here, so a platform's painter never has to know what a locus is.
function bucketSpec(G, sp, tb, mb){
  const base = { rgb: SPECIES_META[sp].rgb, shape: SHAPES[sp], scale: SPRITE_SCALE[sp], outline: 0, round: 0 };
  const gr = G[sp];
  if (!gr) return base;
  const gM = mb/(TINT_BINS-1);
  return Object.assign(base, {
    rgb: gr.tintPlane >= 0 ? tintRgb(SPECIES_META[sp].rgb, 1 - tb/(TINT_BINS-1)) : SPECIES_META[sp].rgb,
    outline: gr.outlinePlane >= 0 ? gM : 0,
    round: gr.outlinePlane < 0 && gr.roundPlane >= 0 ? 1 - gM : 0,
  });
}

// ---- the display list ----
// Organism record (8 doubles): kind, sx, sy, r, sp, bucket, hd, flags.
//   kind 0 dormant cyst | 1 bacteria dot-LOD | 2 sprite | 3 sprite, heading-aligned | 4 ghost ray
//   bucket = tintBin*mN + morphBin, or -1 for a species with no grammar
//   flags  bit 0: striking (the ray's stretched form)
// Corpse record (4 doubles): sx, sy, r, alpha.
// Preallocated and reused: a frame allocates nothing, exactly like a tick.
const FRAME = {
  org: new Float64Array(MAXN * 8), orgN: 0,
  corpse: new Float64Array(1500 * 4), corpseN: 0,
  pops: [0,0,0,0,0,0,0], mnBound: 0,
};
function frameOf(view, hidden, G){
  const { camX, camY, vw, vh, z, hw, hh, alpha, lodZ } = view;
  const F = FRAME, o = F.org, cull = 40, pops = F.pops;
  for (let s = 0; s < 7; s++) pops[s] = 0;
  let n = 0, mnBound = 0;
  for (let i = 0; i < W.n; i++){
    if (!W.alive[i]) continue;
    pops[W.sp[i]]++;
    mnBound += W.mn[i];
    if (hidden[W.sp[i]]) continue; // hidden from view, still counted
    const ix = W.px[i] + wd(W.x[i]-W.px[i])*alpha;
    const iy = W.py[i] + wd(W.y[i]-W.py[i])*alpha;
    const sx = hw + wd(ix - camX)*z, sy = hh + wd(iy - camY)*z;
    if (sx < -cull || sx > vw+cull || sy < -cull || sy > vh+cull) continue;
    const sp = W.sp[i], b = n*8;
    o[b+1] = sx; o[b+2] = sy; o[b+4] = sp; o[b+5] = -1; o[b+6] = 0; o[b+7] = 0;
    if (W.cy[i]){ // dormant cyst: dim ember, no glow
      o[b] = 0; o[b+3] = Math.max(1, W.sz[i]*0.5*z); n++; continue;
    }
    if (SHAPES[sp] === "square" && z < lodZ){ // bacteria dot-LOD: batched rects instead of sprite blits
      o[b] = 1; o[b+3] = 1.1; n++; continue;
    }
    o[b+3] = W.sz[i] * SPRITE_SCALE[sp] * z;
    const gr = G[sp];
    if (gr){
      const tb = gr.tN > 1 ? Math.max(0, Math.min(gr.tN-1, Math.round(W.g[gr.tintPlane*MAXN+i]*(gr.tN-1)))) : 0;
      const mb = gr.mN > 1 ? Math.max(0, Math.min(gr.mN-1, Math.round(W.g[gr.morphPlane*MAXN+i]*(gr.mN-1)))) : 0;
      o[b+5] = tb*gr.mN + mb;
    }
    const shape = SHAPES[sp];
    o[b] = shape === "tri" ? 3 : shape === "ray" ? 4 : 2;
    o[b+6] = W.hd[i];
    if (shape === "ray" && W.bst[i] > 0) o[b+7] = 1;
    n++;
  }
  F.orgN = n; F.mnBound = mnBound;
  // corpses: pale husks when zoomed in; the aggregate pall layer covers zoomed-out
  const c = F.corpse;
  let m = 0;
  if (z >= lodZ && !hidden[7]) for (let k = 0; k < W.cN; k++){
    if (!W.cAlive[k]) continue;
    const sx = hw + wd(W.cX[k] - camX)*z, sy = hh + wd(W.cY[k] - camY)*z;
    if (sx < -cull || sx > vw+cull || sy < -cull || sy > vh+cull) continue;
    const mass = W.cE[k] + W.cP[k] + W.cM[k], b = m*4;
    c[b] = sx; c[b+1] = sy;
    c[b+2] = Math.max(1.5, W.cSz[k]*1.0*z);
    c[b+3] = Math.min(0.55, 0.12 + 0.05*mass/W.cSz[k]);
    m++;
  }
  F.corpseN = m;
  return F;
}

// ============================================================
// PAINTING — Canvas 2D. `view` = { camX, camY, vw, vh, z, hw, hh, alpha, dpr, lodZ }.
// ============================================================
// World layers: light (redrawn when the sun moves), dissolved mineral, mat carpet, corpse pall.
// Everything reads the module-singleton W; the returned closures own their offscreen canvases.
function makeWorldLayers(){
  // light layer (world-space, redrawn only when a sun moves or changes): one glow per sun,
  // radius from its spread, alpha from its intensity; the glows add like the field they depict
  const LB = document.createElement("canvas"); LB.width = 512; LB.height = 512;
  const lg = LB.getContext("2d");
  const drawLight = () => {
    lg.fillStyle = COL.abyss; lg.fillRect(0,0,512,512);
    const k = 512 / P.WORLD;
    lg.globalCompositeOperation = "lighter";
    for (const s of sunGlows()){
      const gr2 = lg.createRadialGradient(s.x, s.y, 4, s.x, s.y, s.r);
      gr2.addColorStop(0, `rgba(214,238,255,${(0.30*s.a).toFixed(3)})`);
      gr2.addColorStop(0.4, `rgba(140,190,225,${(0.12*s.a).toFixed(3)})`);
      gr2.addColorStop(1, "rgba(140,190,225,0)");
      lg.fillStyle = gr2; lg.fillRect(0,0,512,512);
    }
    lg.globalCompositeOperation = "source-over";
    lg.fillStyle = "rgba(240,250,255,0.9)";
    for (const m of sunMarks()){ lg.beginPath(); lg.arc(m.x, m.y, 5, 0, 6.283); lg.fill(); }
  };
  drawLight();
  // heat layer (7.H): warmth as an ember glow, cold as a blue one -- never amber, which is the hand's colour.
  // Transparent where nothing is warm, so the certified world looks exactly as before.
  const HB = document.createElement("canvas"); HB.width = 512; HB.height = 512;
  const hg = HB.getContext("2d");
  const drawHeat = () => {
    hg.clearRect(0,0,512,512);
    for (const s of heatGlows()){
      const c0 = s.warm ? "255,120,60" : "110,170,255", c1 = s.warm ? "200,70,40" : "80,120,220";
      const gr = hg.createRadialGradient(s.x, s.y, 2, s.x, s.y, s.r);
      gr.addColorStop(0, `rgba(${c0},${(0.38*s.m).toFixed(3)})`);
      gr.addColorStop(0.45, `rgba(${c1},${(0.16*s.m).toFixed(3)})`);
      gr.addColorStop(1, `rgba(${c1},0)`);
      hg.fillStyle = gr; hg.fillRect(0,0,512,512);
    }
    for (const m of heatMarks()){
      hg.fillStyle = m.warm ? "rgba(255,160,110,0.9)" : "rgba(170,210,255,0.9)";
      hg.beginPath(); hg.arc(m.x, m.y, 4, 0, 6.283); hg.fill();
    }
  };
  drawHeat();

  // wall layer (7.W): crisp slate polylines on the world tile, redrawn on wall events only.
  // Dashed = something may pass (a grille); translucency follows light transmission (glass fades).
  // Never amber -- a placed wall belongs to the world; amber is the preview and the selection.
  const WB = document.createElement("canvas"); WB.width = 512; WB.height = 512;
  const wg = WB.getContext("2d");
  const drawWalls = () => {
    wg.clearRect(0,0,512,512);
    const tracePath = (pts, ox, oy) => {
      wg.beginPath();
      for (let q = 0; q < pts.length; q++) q ? wg.lineTo(pts[q][0]+ox, pts[q][1]+oy) : wg.moveTo(pts[q][0]+ox, pts[q][1]+oy);
      wg.stroke();
    };
    wg.lineCap = "round"; wg.lineJoin = "round";
    for (const wl of wallStrokes()){
      wg.setLineDash(wl.dashed ? [5,4] : []);
      for (let ox = -512; ox <= 512; ox += 512) for (let oy = -512; oy <= 512; oy += 512){
        wg.strokeStyle = `rgba(11,19,30,${(0.8*wl.a).toFixed(3)})`; wg.lineWidth = 4.4; tracePath(wl.pts, ox, oy);
        wg.strokeStyle = `rgba(148,167,184,${wl.a.toFixed(3)})`;    wg.lineWidth = 2.2; tracePath(wl.pts, ox, oy);
      }
    }
    wg.setLineDash([]);
  };
  drawWalls();
  // wall shade (7.W): the honest darkening where walls occlude the sources, so the painted glow
  // never claims light the field does not deliver. Fed by W.wShade; fully transparent without walls.
  const SB = document.createElement("canvas"); SB.width = P.GRID; SB.height = P.GRID;
  const sbx = SB.getContext("2d");
  const sbImg = sbx.createImageData(P.GRID, P.GRID);
  const drawShade = () => { fieldShade(sbImg.data); sbx.putImageData(sbImg, 0, 0); };
  drawShade();

  // mat carpet: density field for sessile producers (Splatterplots-style aggregation).
  // Denser mats render DARKER, saturated green — thick algae absorb light; brightness stays reserved.
  const MC = document.createElement("canvas"); MC.width = P.GRID; MC.height = P.GRID;
  const mcx = MC.getContext("2d");
  const mcImg = mcx.createImageData(P.GRID, P.GRID);
  // dissolved-mineral layer: faint blue nutrient water, dark where depleted
  const MN = document.createElement("canvas"); MN.width = P.GRID; MN.height = P.GRID;
  const mnx = MN.getContext("2d");
  const mnImg = mnx.createImageData(P.GRID, P.GRID);
  // corpse aggregation layer (zoomed out, husks merge into a gray pall)
  const CC = document.createElement("canvas"); CC.width = P.GRID; CC.height = P.GRID;
  const ccx = CC.getContext("2d");
  const ccImg = ccx.createImageData(P.GRID, P.GRID);
  let carpetTick = -1;
  const updateCarpet = () => {
    if (W.tick === carpetTick) return; carpetTick = W.tick;
    fieldCarpet(mcImg.data);     mcx.putImageData(mcImg, 0, 0);
    fieldMineral(mnImg.data);    mnx.putImageData(mnImg, 0, 0);
    fieldCorpsePall(ccImg.data); ccx.putImageData(ccImg, 0, 0);
  };
  return { LB, HB, MC, MN, CC, WB, SB, LOD_Z, drawLight, drawHeat, drawWalls, drawShade, updateCarpet };
}
// Wall affordances (7.W): amber marks the hand -- the selected wall and the drawing preview only.
// Paths are unwrapped corner staircases; the first point is placed by minimal image, the rest follow
// by their deltas so a wall crossing the seam never tears across the screen.
function traceWallScreen(ctx, view, path){
  const { camX, camY, z, hw, hh } = view;
  let sx = hw + wd(path[0][0]*CELL - camX)*z, sy = hh + wd(path[0][1]*CELL - camY)*z;
  ctx.beginPath(); ctx.moveTo(sx, sy);
  for (let q = 1; q < path.length; q++){
    sx += (path[q][0]-path[q-1][0])*CELL*z; sy += (path[q][1]-path[q-1][1])*CELL*z;
    ctx.lineTo(sx, sy);
  }
  ctx.stroke();
}
function drawWallAffordance(ctx, view, k){
  const wl = W.walls[k]; if (!wl) return;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(242,178,74,0.35)"; ctx.lineWidth = 7; traceWallScreen(ctx, view, wl.path);
  ctx.strokeStyle = "rgba(242,178,74,0.95)"; ctx.lineWidth = 2; traceWallScreen(ctx, view, wl.path);
}
function drawWallPreview(ctx, view, drag){
  const wl = makeWall(drag);              // pure: the exact staircase the release would build
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (!wl){                               // too short still: show the anchor point
    const { camX, camY, z, hw, hh } = view;
    const sx = hw + wd(drag.x0 - camX)*z, sy = hh + wd(drag.y0 - camY)*z;
    ctx.fillStyle = "rgba(242,178,74,0.9)";
    ctx.beginPath(); ctx.arc(sx, sy, 3, 0, 6.283); ctx.fill();
    return;
  }
  ctx.setLineDash([7,5]);
  ctx.strokeStyle = "rgba(242,178,74,0.35)"; ctx.lineWidth = 6.5; traceWallScreen(ctx, view, wl.path);
  ctx.strokeStyle = "rgba(242,178,74,0.9)";  ctx.lineWidth = 2.2; traceWallScreen(ctx, view, wl.path);
  ctx.setLineDash([]);
}
// The sprite bitmaps for the bucket table makeGrammar() defines. Painting, not grammar: two
// platforms will not produce identical gradient pixels, and nothing depends on their doing so.
// Exception, documented above fieldCarpet: the mat carpet carries its own genotype turn.
function makeSpriteSet(){
  const sprites = [makeSprite(COL.solara,"nucleus"), makeSprite(COL.drifta,"dot"), makeSprite(COL.cilio,"tri"), makeSprite(COL.bacillus,"square"),
    makeSprite(COL.mycora,"dot"), makeSprite(COL.necro,"dot"), makeSprite(COL.venator,"tri")];
  const grammar = makeGrammar();
  const bins = grammar.map((gr, sp) => gr && Array.from({ length: gr.tN }, (_, tb) =>
    Array.from({ length: gr.mN }, (_, mb) => {
      const sc = bucketSpec(grammar, sp, tb, mb);
      const vis = gr.outlinePlane >= 0 ? { outline: sc.outline } : gr.roundPlane >= 0 ? { round: sc.round } : undefined;
      return makeSprite(sc.rgb, sc.shape, vis);
    })));
  return { sprites, grammar, bins };
}
// Organisms, from the display list: the screen composite and the sprite blits, nothing decided here.
function paintOrganisms(ctx, F, S){
  ctx.globalCompositeOperation = "screen";
  const o = F.org;
  for (let q = 0; q < F.orgN; q++){
    const b = q*8, kind = o[b], sx = o[b+1], sy = o[b+2], r = o[b+3], sp = o[b+4], bucket = o[b+5];
    if (kind === 0){ // dormant cyst: dim ember, no glow
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(120,135,150,0.5)";
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, 6.283); ctx.fill();
      ctx.globalCompositeOperation = "screen";
      continue;
    }
    if (kind === 1){ // bacteria dot-LOD: batched rects instead of sprite blits
      ctx.fillStyle = "rgba(196,206,150,0.8)";
      ctx.fillRect(sx-r, sy-r, r*2, r*2);
      continue;
    }
    if (kind === 4){ drawGhostRay(ctx, sx, sy, o[b+6], r, o[b+7] !== 0, null); continue; }
    const gr = S.grammar[sp];
    const spr = bucket >= 0 && gr ? S.bins[sp][(bucket / gr.mN)|0][bucket % gr.mN] : S.sprites[sp];
    if (kind === 3){ ctx.save(); ctx.translate(sx, sy); ctx.rotate(o[b+6]); ctx.drawImage(spr, -r, -r, r*2, r*2); ctx.restore(); }
    else ctx.drawImage(spr, sx-r, sy-r, r*2, r*2);
  }
  ctx.globalCompositeOperation = "source-over";
}
function drawPours(ctx, pours, nowT){
  // amber pour rings: the hand's touch, fading
  for (let q = pours.length-1; q >= 0; q--){
    const age = (nowT - pours[q].t) / 700;
    if (age >= 1){ pours.splice(q,1); continue; }
    ctx.strokeStyle = `rgba(242,178,74,${(0.7*(1-age)).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pours[q].sx, pours[q].sy, 10 + age*34, 0, 6.283); ctx.stroke();
  }
}
function paintCorpses(ctx, F){
  const c = F.corpse;
  for (let q = 0; q < F.corpseN; q++){
    const b = q*4, sx = c[b], sy = c[b+1], r = c[b+2], a = c[b+3];
    ctx.fillStyle = `rgba(158,168,178,${a.toFixed(3)})`;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, 6.283); ctx.fill();
    ctx.strokeStyle = `rgba(110,120,130,${(a*0.8).toFixed(3)})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(sx, sy, r*0.55, 0, 6.283); ctx.stroke();
  }
}
function drawSunAffordance(ctx, view, selSun){
  const { camX, camY, z, hw, hh } = view;
  W.sources.forEach((s, k) => {
    const ssx = hw + wd(s.x - camX)*z, ssy = hh + wd(s.y - camY)*z, on = k === selSun;
    ctx.strokeStyle = on ? "rgba(242,178,74,1)" : "rgba(242,178,74,0.9)"; ctx.lineWidth = on ? 2.5 : 1.5;
    ctx.beginPath(); ctx.arc(ssx, ssy, 16, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = on ? "rgba(242,178,74,0.5)" : "rgba(242,178,74,0.3)"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(ssx, ssy, 22, 0, 6.283); ctx.stroke();
  });
}
function drawSelectionRing(ctx, view, si){
  const { camX, camY, z, hw, hh, alpha } = view;
  const ix = W.px[si] + wd(W.x[si]-W.px[si])*alpha, iy = W.py[si] + wd(W.y[si]-W.py[si])*alpha;
  const sx = hw + wd(ix - camX)*z, sy = hh + wd(iy - camY)*z;
  const rr = Math.max(14, W.sz[si]*2.6*z);
  ctx.strokeStyle = "rgba(201,215,227,0.95)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(sx, sy, rr, 0, 6.283); ctx.stroke();
  ctx.strokeStyle = "rgba(201,215,227,0.25)"; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(sx, sy, rr + 4, 0, 6.283); ctx.stroke();
}
function drawLoupe(ctx, canvas, LP, lpx, view, loupe){
  const { vw, dpr } = view;
  const R = 64, m = 2.5, sr = R/m;
  const cxL = Math.min(vw - R - 8, Math.max(R + 8, loupe.x));
  const cyL = Math.max(R + 72, loupe.y - 112);
  lpx.clearRect(0, 0, LP.width, LP.height);
  lpx.drawImage(canvas, (loupe.x - sr)*dpr, (loupe.y - sr)*dpr, sr*2*dpr, sr*2*dpr, 0, 0, LP.width, LP.height);
  ctx.strokeStyle = "rgba(201,215,227,0.25)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(loupe.x, loupe.y - 12); ctx.lineTo(cxL, cyL + R); ctx.stroke();
  ctx.save();
  ctx.beginPath(); ctx.arc(cxL, cyL, R, 0, 6.283); ctx.clip();
  ctx.drawImage(LP, cxL - R, cyL - R, R*2, R*2);
  ctx.restore();
  ctx.strokeStyle = "rgba(201,215,227,0.8)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cxL, cyL, R, 0, 6.283); ctx.stroke();
  ctx.fillStyle = "rgba(242,178,74,0.95)";
  ctx.beginPath(); ctx.arc(cxL, cyL, 2.2, 0, 6.283); ctx.fill();
}
