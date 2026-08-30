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
function makeSprite(rgb, shape){
  const s = 64, c = document.createElement("canvas"); c.width = s; c.height = s;
  const g = c.getContext("2d"); const [r, gg, b] = rgb;
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
    g.fillRect(s/2-3.4, s/2-3.4, 6.8, 6.8);
    return c;
  }
  if (shape === "tri"){ // Cilio: rare + moving, allowed the luminance peak
    grad.addColorStop(0, `rgba(${r},${gg},${b},0.9)`);
    grad.addColorStop(0.4, `rgba(${r},${gg},${b},0.4)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    // the mark carries the color: a pure white triangle washed every tint out under the screen composite
    g.fillStyle = `rgba(${Math.min(255,r+55)},${Math.min(255,gg+55)},${Math.min(255,b+55)},0.95)`;
    g.beginPath(); g.moveTo(s*0.72, s*0.5); g.lineTo(s*0.38, s*0.36); g.lineTo(s*0.38, s*0.64); g.closePath(); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 1.2; g.stroke();
  } else { // Drifta: soft glow, colored (not white) center, modest alpha
    grad.addColorStop(0, `rgba(${r},${gg},${b},0.6)`);
    grad.addColorStop(0.4, `rgba(${r},${gg},${b},0.22)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    g.fillStyle = `rgba(${Math.min(255,r+40)},${Math.min(255,gg+35)},${Math.min(255,b+30)},0.9)`;
    g.beginPath(); g.arc(s/2, s/2, 3.6, 0, 6.283); g.fill();
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
// WORLD VIEW DRAWING — the frame pipeline, extracted from the component so the visual
// grammar (sprites, tint, shape, layers) lives in one file. `view` = { cam, vw, vh, z, hw, hh, alpha, dpr, LOD_Z }.
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
    // the layer is one torus tile: a glow near a tile edge must continue on the far side, so each
    // sun is painted at every wrapped offset its radius reaches (the field itself wraps in computeLight)
    for (const s of W.sources){
      const a = Math.min(1, s.i), r = s.sigma*2.2*k, cx = s.x*k, cy = s.y*k;
      for (let ox = -512; ox <= 512; ox += 512) for (let oy = -512; oy <= 512; oy += 512){
        const x = cx+ox, y = cy+oy;
        if (x + r < 0 || x - r > 512 || y + r < 0 || y - r > 512) continue;
        const gr2 = lg.createRadialGradient(x, y, 4, x, y, r);
        gr2.addColorStop(0, `rgba(214,238,255,${(0.30*a).toFixed(3)})`);
        gr2.addColorStop(0.4, `rgba(140,190,225,${(0.12*a).toFixed(3)})`);
        gr2.addColorStop(1, "rgba(140,190,225,0)");
        lg.fillStyle = gr2; lg.fillRect(0,0,512,512);
      }
    }
    lg.globalCompositeOperation = "source-over";
    lg.fillStyle = "rgba(240,250,255,0.9)";
    for (const s of W.sources){ if (s.i <= 0) continue; const cx = s.x*k, cy = s.y*k;
      for (let ox = -512; ox <= 512; ox += 512) for (let oy = -512; oy <= 512; oy += 512){
        lg.beginPath(); lg.arc(cx+ox, cy+oy, 5, 0, 6.283); lg.fill(); } }
  };
  drawLight();
  // heat layer (7.H): warmth as an ember glow, cold as a blue one -- never amber, which is the hand's colour.
  // Transparent where nothing is warm, so the certified world looks exactly as before.
  const HB = document.createElement("canvas"); HB.width = 512; HB.height = 512;
  const hg = HB.getContext("2d");
  const drawHeat = () => {
    hg.clearRect(0,0,512,512);
    const k = 512 / P.WORLD;
    for (const s of W.sources){ if (s.a === 0) continue;
      const warm = s.a > 0, m = Math.min(1, Math.abs(s.a)/10), r = s.sigma*2.2*k, cx = s.x*k, cy = s.y*k;
      const c0 = warm ? "255,120,60" : "110,170,255", c1 = warm ? "200,70,40" : "80,120,220";
      for (let ox = -512; ox <= 512; ox += 512) for (let oy = -512; oy <= 512; oy += 512){
        const x = cx+ox, y = cy+oy;
        if (x + r < 0 || x - r > 512 || y + r < 0 || y - r > 512) continue;
        const gr = hg.createRadialGradient(x, y, 2, x, y, r);
        gr.addColorStop(0, `rgba(${c0},${(0.38*m).toFixed(3)})`);
        gr.addColorStop(0.45, `rgba(${c1},${(0.16*m).toFixed(3)})`);
        gr.addColorStop(1, `rgba(${c1},0)`);
        hg.fillStyle = gr; hg.fillRect(0,0,512,512);
      }
      if (s.i <= 0){ hg.fillStyle = warm ? "rgba(255,160,110,0.9)" : "rgba(170,210,255,0.9)"; // a dark source still needs a mark
        for (let ox = -512; ox <= 512; ox += 512) for (let oy = -512; oy <= 512; oy += 512){ hg.beginPath(); hg.arc(cx+ox, cy+oy, 4, 0, 6.283); hg.fill(); } }
    }
  };
  drawHeat();

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
  const corpseMass = new Float32Array(P.GRID * P.GRID);
  // per-cell mean genotype of the mat species, so a heritable Solara trait shows in the carpet itself
  const cellG = new Float32Array(P.GRID * P.GRID), cellGn = new Uint16Array(P.GRID * P.GRID);
  const LOD_Z = 0.9; // below this zoom: aggregate corpses, draw bacteria as dots
  let carpetTick = -1;
  const updateCarpet = () => {
    if (W.tick === carpetTick) return; carpetTick = W.tick;
    const d = mcImg.data, dm = mnImg.data;
    const matLocus = SPECIES.MAT >= 0 && TRAITS[SPECIES.MAT].locus;
    if (matLocus){
      cellG.fill(0); cellGn.fill(0);
      for (let i = 0; i < W.n; i++) if (W.alive[i] && W.sp[i] === SPECIES.MAT){ const c = cellOf(i); cellG[c] += W.g[i]; cellGn[c]++; }
    }
    for (let c = 0; c < P.GRID*P.GRID; c++){
      const o = c*4;
      const m = Math.min(1, W.M[c] / 3.2);
      dm[o] = 64; dm[o+1] = 138; dm[o+2] = 205;
      dm[o+3] = Math.round(82 * m);
      const dens = Math.min(1, W.bB[c] / 200);
      if (dens <= 0.01){ d[o+3] = 0; continue; }
      const t = Math.sqrt(dens); // fast rise, then saturate
      if (matLocus && cellGn[c]){ // sparse [96,205,150] -> dense [34,123,78], both turned by the cell's mean genotype
        const gm = cellG[c] / cellGn[c];
        const lo = tintRgb([96,205,150], gm), hi = tintRgb([34,123,78], gm);
        d[o]   = Math.round(lo[0] + (hi[0]-lo[0])*t);
        d[o+1] = Math.round(lo[1] + (hi[1]-lo[1])*t);
        d[o+2] = Math.round(lo[2] + (hi[2]-lo[2])*t);
      } else {
        d[o]   = Math.round(96 - 62*t);   // r: 96 -> 34
        d[o+1] = Math.round(205 - 82*t);  // g: 205 -> 123
        d[o+2] = Math.round(150 - 72*t);  // b: 150 -> 78
      }
      d[o+3] = Math.round(70 + 150*t);  // alpha: sparse faint -> dense solid
    }
    mcx.putImageData(mcImg, 0, 0);
    mnx.putImageData(mnImg, 0, 0);
    corpseMass.fill(0);
    for (let k = 0; k < W.cN; k++){
      if (!W.cAlive[k]) continue;
      const cc = (Math.floor(W.cY[k]/(P.WORLD/P.GRID))&(P.GRID-1))*P.GRID + (Math.floor(W.cX[k]/(P.WORLD/P.GRID))&(P.GRID-1));
      corpseMass[cc] += W.cE[k] + W.cP[k] + W.cM[k];
    }
    const dc = ccImg.data;
    for (let c = 0; c < P.GRID*P.GRID; c++){
      const o = c*4;
      dc[o]=158; dc[o+1]=168; dc[o+2]=178;
      dc[o+3] = Math.min(150, Math.round(corpseMass[c] * 4));
    }
    ccx.putImageData(ccImg, 0, 0);
  };
  return { LB, HB, MC, MN, CC, LOD_Z, drawLight, drawHeat, updateCarpet };
}
// Sprite set: one sprite per species, plus one per genotype bin for every species with a locus.
function makeSpriteSet(){
  const sprites = [makeSprite(COL.solara,"nucleus"), makeSprite(COL.drifta,"dot"), makeSprite(COL.cilio,"tri"), makeSprite(COL.bacillus,"square"),
    makeSprite(COL.mycora,"dot"), makeSprite(COL.necro,"dot"), makeSprite(COL.venator,"tri")];
  // one sprite per genotype bin for every species that carries a locus (7 bins across [0,1])
  const TINT_BINS = 7;
  const tints = TRAITS.map((T, sp) => T.locus && SHAPES[sp] !== "ray"
    ? Array.from({ length: TINT_BINS }, (_, b) => makeSprite(tintRgb(SPECIES_META[sp].rgb, b/(TINT_BINS-1)), SHAPES[sp]))
    : null);
  return { sprites, tints, TINT_BINS };
}
// Organisms, with the screen composite, cull margin and LOD; returns the live census the strip and card need.
function drawOrganisms(ctx, view, hidden, S){
  const { cam, vw, vh, z, hw, hh, alpha, LOD_Z } = view;
  ctx.globalCompositeOperation = "screen";
  const cull = 40;
  const pops = [0,0,0,0,0,0,0];
  let mnBound = 0;
  for (let i=0;i<W.n;i++){
    if (!W.alive[i]) continue;
    pops[W.sp[i]]++;
    mnBound += W.mn[i];
    if (hidden[W.sp[i]]) continue; // hidden from view, still counted
    const ix = W.px[i] + wd(W.x[i]-W.px[i])*alpha;
    const iy = W.py[i] + wd(W.y[i]-W.py[i])*alpha;
    const sx = hw + wd(ix - cam.x)*z, sy = hh + wd(iy - cam.y)*z;
    if (sx < -cull || sx > vw+cull || sy < -cull || sy > vh+cull) continue;
    if (W.cy[i]){ // dormant cyst: dim ember, no glow
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(120,135,150,0.5)";
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(1, W.sz[i]*0.5*z), 0, 6.283); ctx.fill();
      ctx.globalCompositeOperation = "screen";
      continue;
    }
    const spb = W.sp[i];
    if (SHAPES[spb] === "square" && z < LOD_Z){ // bacteria dot-LOD: batched rects instead of sprite blits
      ctx.fillStyle = "rgba(196,206,150,0.8)";
      ctx.fillRect(sx-1.1, sy-1.1, 2.2, 2.2);
      continue;
    }
    const r = W.sz[i] * SPRITE_SCALE[spb] * z;
    const spr = S.tints[spb] ? S.tints[spb][Math.max(0, Math.min(S.TINT_BINS-1, Math.round(W.g[i]*(S.TINT_BINS-1))))] : S.sprites[spb];
    if (SHAPES[spb] === "tri"){
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(W.hd[i]);
      ctx.drawImage(spr, -r, -r, r*2, r*2); ctx.restore();
    } else if (SHAPES[spb] === "ray"){
      drawGhostRay(ctx, sx, sy, W.hd[i], r, W.bst[i] > 0, null);
    } else {
      ctx.drawImage(spr, sx-r, sy-r, r*2, r*2);
    }
  }
  ctx.globalCompositeOperation = "source-over";
  return { pops, mnBound };
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
function drawCorpses(ctx, view, hiddenDebris){
  const { cam, vw, vh, z, hw, hh, LOD_Z } = view; const cull = 40;
  // corpses: pale husks when zoomed in; the aggregate layer covers zoomed-out
  if (z >= LOD_Z && !hiddenDebris) for (let k = 0; k < W.cN; k++){
    if (!W.cAlive[k]) continue;
    const sx = hw + wd(W.cX[k] - cam.x)*z, sy = hh + wd(W.cY[k] - cam.y)*z;
    if (sx < -cull || sx > vw+cull || sy < -cull || sy > vh+cull) continue;
    const mass = W.cE[k] + W.cP[k] + W.cM[k];
    const a = Math.min(0.55, 0.12 + 0.05*mass/W.cSz[k]);
    const r = Math.max(1.5, W.cSz[k]*1.0*z);
    ctx.fillStyle = `rgba(158,168,178,${a.toFixed(3)})`;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, 6.283); ctx.fill();
    ctx.strokeStyle = `rgba(110,120,130,${(a*0.8).toFixed(3)})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(sx, sy, r*0.55, 0, 6.283); ctx.stroke();
  }
}
function drawSunAffordance(ctx, view, selSun){
  const { cam, z, hw, hh } = view;
  W.sources.forEach((s, k) => {
    const ssx = hw + wd(s.x - cam.x)*z, ssy = hh + wd(s.y - cam.y)*z, on = k === selSun;
    ctx.strokeStyle = on ? "rgba(242,178,74,1)" : "rgba(242,178,74,0.9)"; ctx.lineWidth = on ? 2.5 : 1.5;
    ctx.beginPath(); ctx.arc(ssx, ssy, 16, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = on ? "rgba(242,178,74,0.5)" : "rgba(242,178,74,0.3)"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(ssx, ssy, 22, 0, 6.283); ctx.stroke();
  });
}
function drawSelectionRing(ctx, view, si){
  const { cam, z, hw, hh, alpha } = view;
  const ix = W.px[si] + wd(W.x[si]-W.px[si])*alpha, iy = W.py[si] + wd(W.y[si]-W.py[si])*alpha;
  const sx = hw + wd(ix - cam.x)*z, sy = hh + wd(iy - cam.y)*z;
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
