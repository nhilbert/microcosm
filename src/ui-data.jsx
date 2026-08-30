// ============================================================
// DATA MODE (4.3/4.4) — the Observatory's screen. Own module by decision.
// Pages: Populations · Chemistry · Metabolism · Health
// ============================================================
const PAGE_TITLES = [
  ["Populations", "every line a species · amber = your interventions · drag across to scrub"],
  ["Chemistry", "where every unit of mineral sits · the top edge is the world's total"],
  ["Metabolism", "what the world produces and burns"],
  ["Health", "vitals against species reference ranges, like blood work"],
  ["Events", "the world's story, oldest at the bottom · since ≠ because"],
  ["Traits", "what is being inherited · mean and spread over time, the population now"],
];
const IV_LABEL = { pour:"You poured mineral", kill:"You killed a specimen", feed:"You fed a specimen", seed:"You introduced organisms",
  source:"You moved an energy source", sunlight:"You changed the sunlight", undo:"You undid the last action",
  sourceAdd:"You added an energy source", sourceRemove:"You removed an energy source", sourceSet:"You changed an energy source", sourceLayout:"You changed the source layout",
  mutation:"You switched mutation", evolution:"You changed an evolution setting", preset:"You applied an evolution preset" };
function ImpactLine({ ev }){
  const r = typeof impact === "function" ? impact(ev) : null;
  if (!r) return null;
  const sub = { fontSize:10, color:"#5E7386", marginTop:2 };
  if (r.status === "rolled") return <div style={sub}>history has rolled past this one</div>;
  if (r.status === "watching") return <div style={sub}>watching impact… {r.pct}%</div>;
  let text;
  if (!r.notable.length)
    text = "no clear shift beyond normal variability — the world absorbed it";
  else
    text = "Since: " + r.notable.map(m =>
      m.name + " " + (m.pct>0?"+":"") + m.pct + "%" + (m.strong ? "" : " (could be a natural swing)")
    ).join(" · ");
  const tails = [];
  if (r.recoveredS) tails.push("relaxed back after " + r.recoveredS + " s");
  else if (r.isPress) tails.push("settling toward a new regime");
  else if (!r.complete) tails.push("still developing");
  if (r.mixed) tails.push("mixed with other interventions");
  if (r.pressBackdrop) tails.push("under a changed-sun regime — attribution weak");
  return <div style={sub}>{text}{tails.length ? " · " + tails.join(" · ") : ""}</div>;
}
function EventsPage(){
  const items = [];
  for (const e of W.sysEvents) items.push({ tick: e.tick, sys: true, sp: e.sp, text: e.text });
  for (const e of W.evLog) items.push({ tick: e.tick, sys: false, type: e.type,
    text: IV_LABEL[e.type] || e.type, ev: e });
  items.sort((a,b) => b.tick - a.tick);
  const fmt = t => { const sec = Math.floor(t/10);
    return Math.floor(sec/60) + ":" + String(sec%60).padStart(2,"0"); };
  return (
    <div style={{ padding:"2px 16px", overflowY:"auto", flex:1 }}>
      {items.slice(0, 60).map((it, ix) => {
        const col = it.sys
          ? (it.sp >= 0 ? "rgb("+SPECIES_META[it.sp].rgb.join(",")+")" : "#8FA3B5")
          : "#F2B24A";
        return (
          <div key={ix} style={{ padding:"7px 0", borderBottom:"1px solid rgba(94,115,134,0.12)" }}>
            <div style={{ display:"flex", gap:10, fontSize:12, alignItems:"baseline" }}>
              <span style={{ color:"#42566A", fontSize:10, width:34 }}>{fmt(it.tick)}</span>
              <span style={{ color: col }}>{it.text}</span>
            </div>
            {!it.sys && it.type !== "undo" && <div style={{ marginLeft:44 }}><ImpactLine ev={it.ev} /></div>}
          </div>
        );
      })}
      {items.length === 0 && <div style={{ color:"#5E7386", fontSize:12, padding:16 }}>nothing yet — the world is young</div>}
      <div style={{ color:"#42566A", fontSize:10, padding:"12px 0 8px" }}>
        Impact readings are before-after comparisons against each channel's own trend and natural
        variability — one world, no control group, so they say "since", never "because". A walled
        control compartment or a replayed twin world would upgrade this to a true experiment.
      </div>
    </div>
  );
}
function drawFrame(g, wpx, hpx){
  g.fillStyle = "#0B131E"; g.fillRect(0, 0, wpx, hpx);
  return { padL: 38, padR: 10, padT: 8, padB: 20, cw: wpx-48, ch: hpx-28 };
}
function seriesAt(n){ return (k, chan) => W.rec[((W.recHead-n+k+REC.N)%REC.N)*REC.CH + chan]; }
function drawMarkers(g, F, n, tickNow){
  const tick0 = tickNow - (n-1)*REC.STRIDE;
  for (const ev of W.evLog){
    if (ev.tick < tick0) continue;
    const x = F.padL + F.cw*(ev.tick-tick0)/Math.max(1,(tickNow-tick0));
    g.strokeStyle = ev.type==="undo" ? "rgba(242,178,74,0.28)" : "rgba(242,178,74,0.55)";
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, F.padT); g.lineTo(x, F.padT+F.ch); g.stroke();
  }
}
function axisText(g, F, hpx, n, topLabel){
  g.fillStyle = "#5E7386"; g.font = "10px ui-monospace, Menlo, monospace";
  if (topLabel) g.fillText(topLabel, 4, F.padT+8);
  g.fillText("0", 4, F.padT+F.ch);
  g.fillText("-"+Math.round((n-1)*REC.STRIDE/10)+"s", F.padL, hpx-6);
  g.fillText("now", F.padL+F.cw-24, hpx-6);
}
function smooth3(get, n, chan){
  return k => {
    const a = get(Math.max(0,k-1),chan), b = get(k,chan), c = get(Math.min(n-1,k+1),chan);
    return (a+b+c)/3;
  };
}

function drawPopulations(g, wpx, hpx, scrub, logScale){
  const F = drawFrame(g, wpx, hpx);
  const n = W.recCount; if (n < 5) return;
  const at = seriesAt(n);
  let ymax = 10;
  for (let k=0;k<n;k++) for (let sp=0;sp<7;sp++) ymax = Math.max(ymax, at(k,sp));
  ymax *= 1.08;
  const LM = Math.log10(1 + ymax);
  const yOf = v => logScale ? F.padT + F.ch*(1 - Math.log10(1+v)/LM)
                            : F.padT + F.ch*(1 - v/ymax);
  g.strokeStyle = "rgba(94,115,134,0.25)"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(F.padL, F.padT); g.lineTo(F.padL, F.padT+F.ch); g.lineTo(F.padL+F.cw, F.padT+F.ch); g.stroke();
  g.fillStyle = "#5E7386"; g.font = "10px ui-monospace, Menlo, monospace";
  if (logScale){ // decade gridlines: the vast and the rare on one readable canvas
    for (const d of [1, 10, 100, 1000]){
      if (d > ymax) break;
      const y = yOf(d);
      g.strokeStyle = "rgba(94,115,134,0.18)";
      g.beginPath(); g.moveTo(F.padL, y); g.lineTo(F.padL+F.cw, y); g.stroke();
      g.fillText(String(d), 6, y+3);
    }
  } else {
    g.fillText(String(Math.round(ymax)), 4, F.padT+8);
    g.fillText("0", 4, F.padT+F.ch);
  }
  g.fillText("-"+Math.round((n-1)*REC.STRIDE/10)+"s", F.padL, hpx-6);
  g.fillText("now", F.padL+F.cw-24, hpx-6);
  drawMarkers(g, F, n, W.tick);
  for (let sp=0;sp<7;sp++){
    let any=false; for(let k=0;k<n;k+=7) if(at(k,sp)>0){any=true;break;}
    if(!any) continue;
    const c = SPECIES_META[sp].rgb;
    g.strokeStyle = "rgb("+c[0]+","+c[1]+","+c[2]+")"; g.lineWidth = 1.6;
    g.beginPath();
    for (let k=0;k<n;k++){
      const x = F.padL + F.cw*k/Math.max(1,n-1), y = yOf(at(k,sp));
      k===0 ? g.moveTo(x,y) : g.lineTo(x,y);
    }
    g.stroke();
  }
  if (scrub !== null && scrub >= 0 && scrub < n){
    const x = F.padL + F.cw*scrub/Math.max(1,n-1);
    g.strokeStyle = "rgba(230,240,250,0.6)";
    g.beginPath(); g.moveTo(x, F.padT); g.lineTo(x, F.padT+F.ch); g.stroke();
  }
}

function drawChemistry(g, wpx, hpx){
  const F = drawFrame(g, wpx, hpx);
  const n = W.recCount; if (n < 5) return;
  const at = seriesAt(n);
  let ymax = 10;
  for (let k=0;k<n;k++) ymax = Math.max(ymax, at(k,14)+at(k,15)+at(k,16)+at(k,17));
  ymax *= 1.06;
  // stack: bound (life) at bottom, corpse, detritus, dissolved on top
  const order = [[15,[70,214,140],0.5],[16,[158,168,178],0.5],[17,[110,122,134],0.5],[14,[91,200,232],0.45]];
  const acc = new Float32Array(n);
  for (const [chan, c, al] of order){
    g.beginPath();
    for (let k=0;k<n;k++){
      const x = F.padL + F.cw*k/Math.max(1,n-1);
      const y = F.padT + F.ch*(1 - acc[k]/ymax);
      k===0 ? g.moveTo(x,y) : g.lineTo(x,y);
    }
    for (let k=n-1;k>=0;k--){
      acc[k]+=at(k,chan);
      const x = F.padL + F.cw*k/Math.max(1,n-1);
      g.lineTo(x, F.padT + F.ch*(1 - acc[k]/ymax));
    }
    g.closePath();
    g.fillStyle = "rgba("+c[0]+","+c[1]+","+c[2]+","+al+")";
    g.fill();
  }
  // conserved-total top edge, bright: it only moves when the hand adds
  g.strokeStyle = "rgba(230,240,250,0.8)"; g.lineWidth = 1.4;
  g.beginPath();
  for (let k=0;k<n;k++){
    const x = F.padL + F.cw*k/Math.max(1,n-1);
    const y = F.padT + F.ch*(1 - acc[k]/ymax);
    k===0 ? g.moveTo(x,y) : g.lineTo(x,y);
  }
  g.stroke();
  axisText(g, F, hpx, n, String(Math.round(ymax)));
  drawMarkers(g, F, n, W.tick);
}

function drawMetabolism(g, wpx, hpx){
  const F = drawFrame(g, wpx, hpx);
  const n = W.recCount; if (n < 8) return;
  const at = seriesAt(n);
  const gpp = smooth3(at, n, 19), resp = smooth3(at, n, 20), minz = smooth3(at, n, 21);
  let ymax = 10;
  for (let k=0;k<n;k++) ymax = Math.max(ymax, gpp(k), resp(k));
  ymax *= 1.1;
  let m2 = 1; for (let k=0;k<n;k++) m2 = Math.max(m2, minz(k));
  g.strokeStyle = "rgba(94,115,134,0.25)"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(F.padL, F.padT); g.lineTo(F.padL, F.padT+F.ch); g.lineTo(F.padL+F.cw, F.padT+F.ch); g.stroke();
  axisText(g, F, hpx, n, String(Math.round(ymax)));
  drawMarkers(g, F, n, W.tick);
  const line = (fn, ym, color, width) => {
    g.strokeStyle = color; g.lineWidth = width;
    g.beginPath();
    for (let k=0;k<n;k++){
      const x = F.padL + F.cw*k/Math.max(1,n-1), y = F.padT + F.ch*(1 - fn(k)/ym);
      k===0 ? g.moveTo(x,y) : g.lineTo(x,y);
    }
    g.stroke();
  };
  line(gpp, ymax, "rgb(140,230,170)", 1.8);        // production
  line(resp, ymax, "rgb(196,150,140)", 1.8);       // consumption (respiration)
  line(minz, m2*1.15, "rgba(91,200,232,0.7)", 1.2); // recycling (own scale)
}

// Traits page (5.3): one band per species with a locus. Left/top: mean ± one standard deviation
// over time, the founder value as a dashed line, amber intervention markers. Bottom: histogram
// of the living population now, bars in the genotype tint. Variance is drawn deliberately large:
// it is the fuel gauge of evolution, and a sweep is visible as the ribbon narrowing while it moves.
function drawTraits(g, wpx, hpx){
  g.fillStyle = "#0B131E"; g.fillRect(0, 0, wpx, hpx);
  const bands = []; // one band per (species, locus): the multi-locus page
  for (const sp of SPECIES.LOCI){ if (TRAITS[sp].apex) continue;
    TRAITS[sp].loci.forEach((_, k) => { if (k < LOCUS_CH.length) bands.push([sp, k]); }); }
  const n = W.recCount;
  if (!bands.length){ g.fillStyle="#5E7386"; g.font="11px ui-monospace, Menlo, monospace"; g.fillText("no heritable traits in this world", 12, 24); return; }
  const bandH = hpx / bands.length;
  bands.forEach(([sp, kL], bi) => {
    const L = TRAITS[sp].loci[kL], c = SPECIES_META[sp].rgb, col = "rgb("+c[0]+","+c[1]+","+c[2]+")";
    const mCh = LOCUS_CH[kL][0]+sp, sCh = LOCUS_CH[kL][1]+sp;
    const top = bi*bandH, padL = 34, padR = 10;
    // vertical budget per band: header 22, ribbon, 24 for the patch marks, histogram, 26 for its labels
    const histH = Math.max(20, Math.round(bandH*0.28)), ribH = Math.max(30, bandH - 22 - 24 - histH - 26);
    const ribT = top + 22, histT = ribT + ribH + 24;
    const cw = wpx - padL - padR;
    g.font = "11px ui-monospace, Menlo, monospace";
    g.fillStyle = col; g.fillText(SPECIES_META[sp].name + " · " + L.label.toLowerCase(), padL, top + 14);
    // ribbon
    g.strokeStyle = "rgba(94,115,134,0.25)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(padL, ribT); g.lineTo(padL, ribT+ribH); g.lineTo(padL+cw, ribT+ribH); g.stroke();
    g.fillStyle = "#5E7386"; g.font = "10px ui-monospace, Menlo, monospace";
    g.fillText("1", padL-12, ribT+8); g.fillText("0", padL-12, ribT+ribH);
    const yOf = v => ribT + ribH*(1 - Math.max(0, Math.min(1, v)));
    g.setLineDash([3,4]); g.strokeStyle = "rgba(201,215,227,0.35)";
    g.beginPath(); g.moveTo(padL, yOf(L.g0)); g.lineTo(padL+cw, yOf(L.g0)); g.stroke(); g.setLineDash([]);
    if (n >= 5){
      const at = seriesAt(n);
      const F = { padL, padT: ribT, ch: ribH, cw };
      drawMarkers(g, F, n, W.tick);
      g.beginPath();
      for (let k=0;k<n;k++){ const x = padL + cw*k/Math.max(1,n-1); const y = yOf(at(k,mCh)+at(k,sCh)); k===0 ? g.moveTo(x,y) : g.lineTo(x,y); }
      for (let k=n-1;k>=0;k--){ const x = padL + cw*k/Math.max(1,n-1); g.lineTo(x, yOf(at(k,mCh)-at(k,sCh))); }
      g.closePath(); g.fillStyle = "rgba("+c[0]+","+c[1]+","+c[2]+",0.22)"; g.fill();
      g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath();
      for (let k=0;k<n;k++){ const x = padL + cw*k/Math.max(1,n-1), y = yOf(at(k,mCh)); k===0 ? g.moveTo(x,y) : g.lineTo(x,y); }
      g.stroke();
      g.fillStyle = "#5E7386"; g.font = "10px ui-monospace, Menlo, monospace";
      g.fillText("-"+Math.round((n-1)*REC.STRIDE/10)+"s", padL, ribT+ribH+11); g.fillText("now", padL+cw-24, ribT+ribH+11);
      const last = at(n-1,mCh), lsd = at(n-1,sCh);
      let lab = "mean "+last.toFixed(2)+" · spread ±"+lsd.toFixed(2);
      if (W.sources.length > 1){ const pm = patchMeans(sp, kL); // 7.L: by patch, only when there is more than one sun
        const parts = pm.n.map((k, j) => k >= PATCH_MIN ? pm.mean[j].toFixed(2) : null).filter(Boolean);
        if (parts.length > 1) lab += " · by sun " + parts.join(" | "); }
      g.fillStyle = "#B8C5D1"; g.fillText(lab, padL+cw-g.measureText(lab).width, top+14);
    } else { g.fillStyle="#5E7386"; g.fillText("gathering history…", padL+6, ribT+ribH/2); }
    // histogram of the living population
    const BINS = 24, hist = new Float32Array(BINS); let tot=0;
    for (let i=0;i<W.n;i++) if (W.alive[i] && W.sp[i]===sp){ hist[Math.min(BINS-1, Math.floor(W.g[kL*MAXN+i]*BINS))]++; tot++; }
    let hmax = 1; for (let b=0;b<BINS;b++) hmax = Math.max(hmax, hist[b]);
    const bw = cw/BINS;
    for (let b=0;b<BINS;b++){
      const t = tintRgb(c, (b+0.5)/BINS), h = histH*hist[b]/hmax;
      g.fillStyle = "rgba("+t[0]+","+t[1]+","+t[2]+",0.85)";
      g.fillRect(padL + b*bw + 0.5, histT + histH - h, Math.max(1, bw-1), h);
    }
    g.strokeStyle = "rgba(201,215,227,0.35)"; g.setLineDash([3,4]);
    g.beginPath(); g.moveTo(padL + cw*L.g0, histT); g.lineTo(padL + cw*L.g0, histT+histH); g.stroke(); g.setLineDash([]);
    if (W.sources.length > 1){ // 7.L: one small sun mark per patch at that patch's mean -- the split, if any, read off the bars
      const pm = patchMeans(sp, kL); g.font = "9px ui-monospace, Menlo, monospace"; g.fillStyle = "#B8C5D1";
      pm.n.forEach((k, j) => { if (k < PATCH_MIN) return; const x = padL + cw*Math.max(0, Math.min(1, pm.mean[j]));
        g.fillRect(x-0.5, histT-6, 1, 6); g.fillText("☀"+(j+1), x-6, histT-8); }); }
    g.fillStyle = "#5E7386"; g.font = "10px ui-monospace, Menlo, monospace";
    g.fillText(L.loWord, padL, histT+histH+11);
    g.fillText(L.hiWord, padL+cw-g.measureText(L.hiWord).width, histT+histH+11);
    const nl = tot+" alive now"; g.fillText(nl, padL+cw/2-g.measureText(nl).width/2, histT+histH+11);
  });
}
function TraitsLegend(){
  const n = W.recCount; if (n < 1) return null;
  const r = ((W.recHead-1+REC.N)%REC.N)*REC.CH;
  const rows = [];
  for (const sp of SPECIES.LOCI){ if (TRAITS[sp].apex) continue;
    TRAITS[sp].loci.forEach((L, kL) => { if (kL >= LOCUS_CH.length) return;
      const c = SPECIES_META[sp].rgb, mean = W.rec[r+LOCUS_CH[kL][0]+sp], sd = W.rec[r+LOCUS_CH[kL][1]+sp];
      let hi=0, tot=0; for (let i=0;i<W.n;i++) if (W.alive[i] && W.sp[i]===sp){ tot++; if (W.g[kL*MAXN+i] > L.g0+0.05) hi++; }
      rows.push(<span key={sp+"·"+kL} style={{ color:"rgb("+c[0]+","+c[1]+","+c[2]+")" }}>
        ● {SPECIES_META[sp].name} {L.label.toLowerCase()} {mean.toFixed(2)} ±{sd.toFixed(2)} · {L.hiWord} {tot ? Math.round(100*hi/tot) : 0}%</span>);
    });
  }
  return <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 14px", padding:"8px 16px", fontSize:12 }}>
    {rows}<span style={{ color:"#5E7386", marginLeft:"auto" }}>{P.mutation ? "mutation on" : "mutation off"}</span></div>;
}
function HealthPage(){
  const ind = typeof indicators === "function" ? indicators() : null;
  if (!ind) return <div style={{ padding:24, color:"#5E7386", fontSize:12 }}>gathering history…</div>;
  const tile = (label, sub, value) => (
    <div key={label} style={{ background:"rgba(20,31,44,0.8)", borderRadius:12, padding:"10px 12px", minWidth:130, flex:1 }}>
      <div style={{ fontSize:11, color:"#5E7386" }}>{label}</div>
      <div style={{ fontSize:20, color:"#E6F0FA", fontWeight:600 }}>{value}</div>
      <div style={{ fontSize:9, color:"#42566A" }}>{sub}</div>
    </div>
  );
  const lightFor = lv => lv===2 ? ["●","rgb(226,96,96)","critical"] : lv===1 ? ["●","rgb(206,186,120)","tense"] : ["●","rgb(94,150,116)","calm"];
  const rows = [];
  for (const sp of SPECIES.CORE){
    const st = ind.strain[sp];
    if (!st) continue;
    const [dot, col, word] = lightFor(st.level);
    const arrow = st.trend < -0.03 ? "↓" : st.trend > 0.03 ? "↑" : "→";
    rows.push(
      <div key={sp} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 4px", fontSize:13 }}>
        <span style={{ color:col, fontSize:15 }}>{dot}</span>
        <span style={{ width:74 }}>{SPECIES_META[sp].name}</span>
        <span style={{ color:"#5E7386", fontSize:11 }}>reserve {(st.reserve*100|0)}% {arrow} · pop ×{st.popTrend}</span>
        <span style={{ marginLeft:"auto", color:col, fontSize:11 }}>{word}</span>
      </div>);
  }
  if (ind.venator) rows.push(
    <div key={6} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 4px", fontSize:13 }}>
      <span style={{ color: ind.venator.reserve < 0.24 ? "rgb(226,96,96)" : ind.venator.reserve < 0.30 ? "rgb(206,186,120)" : "rgb(94,150,116)", fontSize:15 }}>●</span>
      <span style={{ width:74 }}>Venator</span>
      <span style={{ color:"#5E7386", fontSize:11 }}>hunter reserve {(ind.venator.reserve*100|0)}% · prey losses {ind.venator.preyLossRate.toFixed(1)}/s</span>
    </div>);
  return (
    <div style={{ padding:"4px 16px", overflowY:"auto" }}>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {tile("VARIETY", "Shannon diversity", ind.variety)}
        {tile("PRODUCTION VS CONSUMPTION", "P/R ratio, Odum", ind.prodVsCons)}
        {tile("RECYCLING SPEED", "mineral turnover", ind.recyclingMin===null ? "–" : "every "+Math.round(ind.recyclingMin*60)+" s")}
        {tile("LOCKED AWAY", "corpses + detritus", ind.lockedPct+"%")}
        {ind.adaptability !== null && tile("ADAPTABILITY", "mean heritable variation", ind.adaptability < 0.03 ? "low · "+ind.adaptability.toFixed(2) : ind.adaptability.toFixed(2))}
      </div>
      <div style={{ marginTop:14, fontSize:11, color:"#5E7386" }}>SPECIES VITALS</div>
      <div style={{ marginTop:4 }}>{rows}</div>
      <div style={{ marginTop:12, fontSize:10, color:"#42566A" }}>
        Reference ranges measured on six healthy archived worlds. Statistical early-warning signals
        (rising autocorrelation/variance) run as an experimental overlay only — tested against ground
        truth, kept advisory.
      </div>
    </div>
  );
}

function DataMode({ docked }){
  const cRef = React.useRef(null);
  const [page, setPage] = React.useState(0);
  const [scrub, setScrub] = React.useState(null);
  const [logScale, setLogScale] = React.useState(true);
  const [, force] = React.useState(0);
  const swipe = React.useRef(null);
  React.useEffect(() => {
    const iv = setInterval(() => force(x => x+1), 1000);
    return () => clearInterval(iv);
  }, []);
  React.useEffect(() => {
    if (page === 3 || page === 4) return; // Health and Events are DOM, not canvas
    const cv = cRef.current; if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const wpx = cv.clientWidth, hpx = cv.clientHeight;
    cv.width = wpx*dpr; cv.height = hpx*dpr;
    const g = cv.getContext("2d"); g.scale(dpr, dpr);
    if (page === 0) drawPopulations(g, wpx, hpx, scrub, logScale);
    else if (page === 1) drawChemistry(g, wpx, hpx);
    else if (page === 2) drawMetabolism(g, wpx, hpx);
    else if (page === 5) drawTraits(g, wpx, hpx);
  });
  const onScrub = e => {
    if (page !== 0) return;
    const cv = cRef.current; if (!cv) return;
    const r = cv.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - r.left - 38) / (r.width - 48)));
    setScrub(Math.round(frac * (W.recCount-1)));
  };
  const swDown = e => { swipe.current = { x: e.clientX, t: performance.now() }; };
  const swUp = e => {
    const s = swipe.current; swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 64 && performance.now() - s.t < 600)
      setPage(p => Math.max(0, Math.min(4, p + (dx < 0 ? 1 : -1))));
  };
  const n = W.recCount;
  const k = (scrub !== null && n>0) ? Math.min(scrub, n-1) : (n>0 ? n-1 : 0);
  const at2 = sp => n>0 ? Math.round(W.rec[((W.recHead-n+k+REC.N)%REC.N)*REC.CH + sp]) : 0;
  const ago = n>0 ? Math.round((n-1-k)*REC.STRIDE/10) : 0;
  return (
    <div style={docked
      ? { position:"relative", flex:1, minHeight:0, display:"flex", flexDirection:"column",
          paddingTop:12, fontFamily:"ui-monospace, Menlo, monospace", color:"#B8C5D1" }
      : { position:"absolute", inset:0, background:"rgba(11,19,30,0.97)",
          zIndex:4, display:"flex", flexDirection:"column", paddingTop:88,
          fontFamily:"ui-monospace, Menlo, monospace", color:"#B8C5D1" }}
      onPointerDown={docked ? undefined : swDown} onPointerUp={docked ? undefined : swUp}>
      <div style={{ padding:"0 16px 6px", display:"flex", alignItems:"flex-start" }}>
        <div>
          <div style={{ fontSize:15, fontWeight:600, color:"#E6F0FA" }}>{PAGE_TITLES[page][0]}</div>
          <div style={{ fontSize:11, color:"#5E7386" }}>{PAGE_TITLES[page][1]}</div>
        </div>
        {page === 0 && (
          <button className="mc-hit" onClick={() => setLogScale(v => !v)}
            style={{ marginLeft:"auto", padding:"4px 10px", borderRadius:10, fontSize:11, cursor:"pointer",
              background:"rgba(20,31,44,0.9)", border:"1px solid rgba(94,115,134,0.4)",
              color:"#B8C5D1", fontFamily:"inherit" }}>{logScale ? "log" : "lin"}</button>
        )}
      </div>
      {page === 3 ? <HealthPage /> : page === 4 ? <EventsPage /> : (
        <canvas ref={cRef} onPointerDown={e => { e.stopPropagation(); swDown(e); onScrub(e); }}
          onPointerMove={e => e.buttons && onScrub(e)}
          onPointerUp={e => { swUp(e); setScrub(null); }}
          style={{ width:"100%", height: page===5 ? (docked ? "62%" : "58%") : docked ? "38%" : "46%", minHeight:170,
            touchAction:"none", cursor: page===0 ? "col-resize" : "default" }} />
      )}
      {page === 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 14px", padding:"8px 16px", fontSize:12 }}>
          {SPECIES.LIVE.map(sp => { const c=SPECIES_META[sp].rgb; return (
            <span key={sp} style={{ color:"rgb("+c[0]+","+c[1]+","+c[2]+")" }}>
              ● {SPECIES_META[sp].name} {at2(sp)}</span> ); })}
          <span style={{ color:"#5E7386", marginLeft:"auto" }}>{scrub!==null ? ago+"s ago" : "live"}</span>
        </div>
      )}
      {page === 1 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 14px", padding:"8px 16px", fontSize:12 }}>
          <span style={{color:"rgb(70,214,140)"}}>● in living bodies</span>
          <span style={{color:"rgb(158,168,178)"}}>● in corpses</span>
          <span style={{color:"rgb(110,122,134)"}}>● in detritus</span>
          <span style={{color:"rgb(91,200,232)"}}>● dissolved</span>
        </div>
      )}
      {page === 5 && <TraitsLegend />}
      {page === 2 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 14px", padding:"8px 16px", fontSize:12 }}>
          <span style={{color:"rgb(140,230,170)"}}>● production (GPP)</span>
          <span style={{color:"rgb(196,150,140)"}}>● consumption (R)</span>
          <span style={{color:"rgba(91,200,232,0.85)"}}>● recycling (own scale)</span>
        </div>
      )}
      {docked ? (
        <div className="mc-scroll" style={{ marginTop:"auto", flexShrink:0, display:"flex", flexWrap:"wrap",
          gap:4, padding:"10px 12px 14px", borderTop:"1px solid rgba(94,115,134,0.22)" }}>
          {[0,1,2,3,4,5].map(i => (
            <button key={i} className="mc-tab" onClick={() => setPage(i)}
              style={{ padding:"5px 10px", borderRadius:8, cursor:"pointer", fontFamily:"inherit", fontSize:11.5,
                border:"1px solid " + (i===page ? "rgba(94,115,134,0.5)" : "transparent"),
                background: i===page ? "rgba(201,215,227,0.12)" : "transparent",
                color: i===page ? "#E6F0FA" : "#5E7386" }}>
              {PAGE_TITLES[i][0]}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ textAlign:"center", color:"#5E7386", fontSize:13, marginTop:"auto", paddingBottom:96,
          letterSpacing:4 }}>
          {[0,1,2,3,4,5].map(i => (
            <span key={i} onClick={() => setPage(i)}
              style={{ cursor:"pointer", color: i===page ? "#E6F0FA" : "#42566A" }}>●</span>
          ))}
        </div>
      )}
    </div>
  );
}
