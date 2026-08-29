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
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.beginPath(); g.moveTo(s*0.72, s*0.5); g.lineTo(s*0.38, s*0.36); g.lineTo(s*0.38, s*0.64); g.closePath(); g.fill();
  } else { // Drifta: soft glow, colored (not white) center, modest alpha
    grad.addColorStop(0, `rgba(${r},${gg},${b},0.6)`);
    grad.addColorStop(0.4, `rgba(${r},${gg},${b},0.22)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    g.fillStyle = `rgba(${Math.min(255,r+90)},${Math.min(255,gg+70)},${Math.min(255,b+50)},0.8)`;
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
