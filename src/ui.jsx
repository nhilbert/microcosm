// (render helpers live in src/ui-render.js; concatenated by build.py)
// Light budget (7.L): total light input of the shipped world (one sun, lever at 1), captured at mount.
// Adding a sun is never energy-neutral; the sun card says by how much, honestly.
const LIGHT_REF = { v: 0 };
const lightInput = () => { let t = 0; const L = W.light; for (let c = 0; c < L.length; c++) t += L[c]; return t; };
export default function Microcosm(){
  const canvasRef = useRef(null);
  const [ui, setUi] = useState({ tick: 0, fps: 0, pops: [0,0,0,0,0,0,0], speed: 1, card: null, mineral: { b: 0, f: 0, l: 0, add: 0 }, lightMul: 1, spawnPick: null, srcSel: -1 });
  const [detent, setDetent] = useState(0); // 0 peek, 1 half, 2 full
  const [undoChip, setUndoChip] = useState(null);
  const [uiMode, setUiMode] = useState("observe");
  const actionsRef = useRef({});
  const speedRef = useRef(1); // 0 = paused, 1, 4, 16
  const fabLong = useRef(null);
  const dragRef = useRef(null);
  const [hidden, setHidden] = useState([false,false,false,false,false,false,false,false,false,false]); // per-species show/hide (view only); 7 = debris, 8 = light layer, 9 = heat layer
  const hiddenRef = useRef(hidden); hiddenRef.current = hidden;

  useEffect(() => {
    initWorld();
    if (!LIGHT_REF.v) LIGHT_REF.v = lightInput();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let vw = 0, vh = 0;
    const cam = { x: W.sources[0].x, y: W.sources[0].y, z: Math.max(1, Math.min(window.innerWidth, window.innerHeight) / 620) };
    const minZ = () => Math.max(vw, vh) / P.WORLD;
    const clampZ = z => Math.max(minZ(), Math.min(6, z));
    const resize = () => {
      vw = canvas.clientWidth; vh = canvas.clientHeight;
      canvas.width = vw * dpr; canvas.height = vh * dpr;
      cam.z = clampZ(cam.z); // rotation / viewport change must re-clamp zoom
    };
    resize();
    window.addEventListener("resize", resize);
    // the side panel opening changes the canvas box without a window resize
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(canvas);


    const S = makeSpriteSet();

    const { LB, HB, MC, MN, CC, LOD_Z, drawLight, drawHeat, updateCarpet } = makeWorldLayers();
    drawLight();

    // selection + follow-cam
    const sel = { i: -1, gen: 0 };
    const selValid = () => sel.i >= 0 && W.alive[sel.i] && W.gen[sel.i] === sel.gen;
    let follow = false;
    const SPECIES = SPECIES_META;
    const stateOf = i => { const T = TRAITS[W.sp[i]]; return W.cy[i] ? "Dormant (cyst)"
      : T.photosynth && T.movement === "sessile" ? "Photosynthesizing"
      : W.bst[i]>0 ? "Striking"
      : T.detritivore ? "Decomposing"
      : T.movement === "drift" ? "Drifting"
      : W.handle[i]>0 ? "Digesting"
      : W.en[i] < T.torpor*P.capMul*W.sz[i] ? "Torpid" : "Foraging"; };
    const buildCard = () => {
      if (!selValid()) return null;
      const i = sel.i, spc = SPECIES[W.sp[i]], T = TRAITS[W.sp[i]];
      const cap = P.capMul*W.sz[i], pQ = P.pQuota*W.sz[i], mQ = P.mQuota*T.mQm*W.sz[i];
      // Liebig analysis: which division gate binds right now?
      const fE = W.en[i] / (T.reproFrac*cap);
      const fP = W.pr[i] / (P.pReproMin*pQ);
      const fM = W.mn[i] / (P.mReproMin*mQ);
      let badge, bind;
      if (W.cy[i]){ badge = "Dormant"; bind = 0; }
      else {
        const gates = [["Energy-limited", fE], ["Protein-limited", fP], ["Mineral-limited", fM]];
        gates.sort((a,b) => a[1]-b[1]);
        bind = Math.min(1, gates[0][1]);
        badge = gates[0][1] >= 1
          ? ((T.reproCooldown && W.cd[i] > 0) ? "Maturing" : "Ready to divide")
          : gates[0][0];
      }
      // ancestry line (5.3): lineage generation, and the locus expressed as % change vs the founder
      let heredity = null;
      if (T.loci.length){
        heredity = T.loci.map((L, kk) => {
          const g = W.g[kk*MAXN+i];
          const parts = [];
          if (L.escSlope && T.escape) parts.push([L.hiTrait, Math.round(100 * L.escSlope*(g - L.g0) / T.escape.p)]);
          if (L.catchSlope) parts.push([L.hiTrait, Math.round(100 * L.catchSlope*(g - L.g0))]);
          if (L.kpSlope) parts.push([L.loTrait, Math.round(100 * L.kpSlope*(L.g0 - g))]);
          if (L.kbSlope) parts.push([L.loTrait, Math.round(-100 * L.kbSlope*(g - L.g0))]);
          if (L.rateSlope) parts.push([L.hiTrait, Math.round(100 * L.rateSlope*(g - L.g0))]);
          if (L.effSlope) parts.push([L.loTrait, Math.round(-100 * L.effSlope*(g - L.g0))]);
          if (L.lightSlope){ parts.push([L.hiTrait, Math.round(100 * L.lightSlope*(g - L.g0))]);
                             parts.push([L.loTrait, Math.round(-100 * L.lightSlope*(g - L.g0))]); }
          if (L.warmSlope) parts.push([L.hiTrait, Math.round(100 * L.warmSlope*(g - L.g0))]);
          if (L.warmGainSlope) parts.push([L.loTrait, Math.round(-100 * L.warmGainSlope*(g - L.g0))]);
          return { label: L.label, g, g0: L.g0, hiWord: L.hiWord, loWord: L.loWord, parts };
        });
      }
      return { name: spc.name, role: spc.role, rgb: spc.rgb, id: `${i}·${W.gen[i]}`,
        age: Math.floor((W.tick - W.birth[i]) / 10), state: stateOf(i),
        en: W.en[i], cap, pr: W.pr[i], pQ, mn: W.mn[i], mQ, size: W.sz[i],
        badge, bind, lineage: W.lg[i], heredity, sp: W.sp[i],
        warmth: W.temp[cellOf(i)], qR: W.qR[cellOf(i)], topt: T.topt, ctmax: T.ctmax }; // 7.H: what the warmth here does to this one
    };
    const clearChips = () => { clearTimeout(chipTimer); setUi(u => (u.chips ? { ...u, chips: null } : u)); };
    const selectIndex = i => {
      sel.i = i; sel.gen = W.gen[i]; follow = true;
      clearTimeout(chipTimer);
      setUi(u => ({ ...u, card: buildCard(), chips: null })); setDetent(0);
    };
    const nearestSource = (sx, sy) => { let best = { k: 0, d: Infinity }; // nearest sun to a screen point, in px
      W.sources.forEach((s, k) => { const d = Math.hypot(vw/2 + wd(s.x - cam.x)*cam.z - sx, vh/2 + wd(s.y - cam.y)*cam.z - sy);
        if (d < best.d) best = { k, d }; });
      return best; };
    const doSelect = (cxp, cyp, tight) => {
      const wxp = wrap(cam.x + (cxp - vw/2)/cam.z), wyp = wrap(cam.y + (cyp - vh/2)/cam.z);
      const rad = tight ? Math.max(10/cam.z, 7) : Math.max(24/cam.z, 14);
      const cand = [];
      for (let i=0;i<W.n;i++){
        if (!W.alive[i]) continue;
        const dx = wd(W.x[i]-wxp), dy = wd(W.y[i]-wyp), d2 = dx*dx+dy*dy;
        if (d2 < rad*rad) cand.push([d2, i]);
      }
      if (!cand.length){ sel.i = -1; follow = false;
        clearTimeout(chipTimer); setUi(u => ({ ...u, card: null, chips: null })); return; }
      cand.sort((a,b) => a[0]-b[0]);
      const species = new Set(cand.map(c => W.sp[c[1]]));
      // Same-species neighbors are interchangeable for inspection -> take nearest.
      // Chips appear only for true ambiguity: multiple SPECIES under the thumb.
      if (tight || species.size === 1){ selectIndex(cand[0][1]); return; }
      const opts = [];
      for (const s2 of species){
        const first = cand.find(c => W.sp[c[1]] === s2);
        opts.push({ i: first[1], gen: W.gen[first[1]], sp: s2 });
        if (opts.length === 3) break;
      }
      clearTimeout(chipTimer);
      chipTimer = setTimeout(clearChips, 4000);
      setUi(u => ({ ...u, chips: { x: cxp, y: cyp, opts } }));
    };

    let mode = "observe";      // gesture routing: observe = pan/select, intervene = tool
    let srcDrag = null;         // indirect sun drag accumulator + undo origin
    let srcSel = -1;            // selected sun (intervene): the sun card's subject and the drag target (7.L)
    let loupe = null;           // magnifier: {x,y} in screen coords while long-pressing
    let chipTimer = 0;
    const LP = document.createElement("canvas"); LP.width = LP.height = Math.round(128 * dpr);
    const lpx = LP.getContext("2d");
    // interventions: feed / kill on the selected specimen, each with 5 s undo
    let undoAction = null, undoTimer = 0;
    const pours = []; // transient amber rings marking mineral pours
    const logIv = (type) => { W.evLog.push({ tick: W.tick, type }); if (W.evLog.length > 300) W.evLog.shift(); };
    const pushUndo = (label, fn) => {
      clearTimeout(undoTimer); undoAction = fn; setUndoChip(label);
      undoTimer = setTimeout(() => { undoAction = null; setUndoChip(null); }, 5000);
    };
    actionsRef.current = {
      stepOnce: () => { W.px.set(W.x); W.py.set(W.y); step(); },
      feed: () => {
        if (!selValid()) return;
        const i = sel.i, g = W.gen[i], nm = SPECIES[W.sp[i]].name;
        logIv("feed");
        queueEvent({ type:"feed", i, gen:g, frac:0.35, done: delta => {
          pushUndo(`Fed ${nm} · Undo`, () => { logIv("undo"); queueEvent({ type:"unfeed", i, gen:g, delta }); });
        }});
      },
      kill: () => {
        if (!selValid()) return;
        const i = sel.i, g = W.gen[i], nm = SPECIES[W.sp[i]].name;
        sel.i = -1; follow = false; setUi(u => ({ ...u, card: null }));
        logIv("kill");
        queueEvent({ type:"kill", i, gen:g, done: snap => {
          pushUndo(`Killed ${nm} · Undo`, () => { logIv("undo"); queueEvent({ type:"revive", snap }); });
        }});
      },
      setMode: m => { mode = m; if (m === "intervene") follow = false; else if (srcSel >= 0) actionsRef.current.selectSource(-1); },
      pick: (i, g) => { if (W.alive[i] && W.gen[i] === g) selectIndex(i); else clearChips(); },
      undo: () => {
        if (undoAction){ undoAction(); undoAction = null; }
        clearTimeout(undoTimer); setUndoChip(null);
      },
      pushUndoExt: (label, fn) => pushUndo(label, fn),
      // 7.L suns: every change is an event (logged, undoable); a layout is one intervention
      selectSource: k => { srcSel = k; setUi(u => ({ ...u, srcSel: k })); },
      addSourceAt: (wx, wy, sx, sy, kind) => { // kind: "sun" (light 1) or "heat" (dark, warmth +10)
        if (W.sources.length >= P.maxSources) return;
        if (sx !== undefined) pours.push({ sx, sy, t: performance.now() });
        logIv("sourceAdd");
        const ch = kind === "heat" ? { i: 0, a: 10, sigma: 130 } : {};
        queueEvent({ type:"sourceAdd", x: wx, y: wy, ...ch, done: r => {
          actionsRef.current.selectSource(r.k);
          pushUndo("Added a sun · Undo", () => { logIv("undo"); actionsRef.current.selectSource(-1); queueEvent({ type:"sourceRemove", k: r.k }); });
        }});
      },
      addSourceCenter: kind => actionsRef.current.addSourceAt(cam.x, cam.y, vw/2, vh/2, kind),
      removeSource: k => {
        if (W.sources.length <= 1 || !W.sources[k]) return;
        actionsRef.current.selectSource(-1);
        logIv("sourceRemove");
        queueEvent({ type:"sourceRemove", k, done: r => {
          pushUndo("Removed a sun · Undo", () => { logIv("undo");
            queueEvent({ type:"sourceAdd", ...r.snap, at: r.k, done: a => actionsRef.current.selectSource(a.k) }); });
        }});
      },
      removeSelSource: () => { if (srcSel >= 0) actionsRef.current.removeSource(srcSel); },
      sourceLayout: (layout, label) => {
        const prev = W.sources.map(s => ({ ...s }));
        const apply = L => {
          for (let k = W.sources.length - 1; k >= 1; k--) queueEvent({ type:"sourceRemove", k });
          queueEvent({ type:"source", k: 0, x: L[0].x, y: L[0].y });
          queueEvent({ type:"sourceSet", k: 0, i: L[0].i, a: L[0].a || 0, sigma: L[0].sigma });
          for (let k = 1; k < L.length; k++) queueEvent({ type:"sourceAdd", ...L[k] });
        };
        apply(layout); actionsRef.current.selectSource(0);
        logIv("sourceLayout");
        pushUndo(label + " · Undo", () => { logIv("undo"); apply(prev); actionsRef.current.selectSource(-1); });
      },
      reset: () => {
        P.mutation = true; // a fresh world starts with the shipped settings (locus settings are restored by initWorld)
        resetWorld(); initWorld((Math.random()*1e9)|0);
        sel.i = -1; follow = false; srcSel = -1; undoAction = null; clearTimeout(undoTimer); setUndoChip(null);
        cam.x = W.sources[0].x; cam.y = W.sources[0].y;
        setUi(us => ({ ...us, card: null, chips: [], spawnPick: null, tick: 0,
          mineral: { b:0, f:0, l:0, add:0 }, lightMul: 1, srcSel: -1 }));
      },
      seedAt: (sp, wx, wy, sx, sy) => {
        const nm = SPECIES_META[sp].name;
        pours.push({ sx, sy, t: performance.now() });
        logIv("seed");
        queueEvent({ type:"spawnPack", sp, x: wx, y: wy, done: snap => {
          pushUndo(`Seeded ${nm} · Undo`, () => { logIv("undo"); queueEvent({ type:"unspawnPack", snap }); });
        }});
        setUi(us => ({ ...us, spawnPick: null }));
      },
    };

    // gestures: tap = select, 1-finger drag = pan, 2-finger pinch = zoom (always), wheel = zoom
    const pointers = new Map();
    let pinch = null;
    const onDown = e => { canvas.setPointerCapture(e.pointerId);
      const pp = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY,
        t: performance.now(), moved: false, louping: false, lt: null };
      pointers.set(e.pointerId, pp);
      if (mode === "intervene" && pointers.size === 1){
        // the drag target: the selected sun, else the sun nearest the finger at touch-down
        const k = srcSel >= 0 && W.sources[srcSel] ? srcSel : nearestSource(pp.sx, pp.sy).k, s = W.sources[k];
        srcDrag = { k, x: s.x, y: s.y, ox: s.x, oy: s.y };
      }
      if (mode === "observe" && pointers.size === 1){
        pp.lt = setTimeout(() => { pp.lt = null;
          if (pointers.size === 1 && !pp.moved){ pp.louping = true; loupe = { x: pp.x, y: pp.y }; }
        }, 450);
      }
      if (pointers.size === 2) {
        const [a,b]=[...pointers.values()];
        a.moved = b.moved = true;
        for (const q of [a,b]){ if (q.lt){ clearTimeout(q.lt); q.lt = null; } q.louping = false; }
        loupe = null;
        pinch = { d: Math.hypot(a.x-b.x, a.y-b.y), z: cam.z };
      } };
    const onMove = e => {
      const p = pointers.get(e.pointerId); if (!p) return;
      const nx = e.clientX, ny = e.clientY;
      if (!p.moved && Math.hypot(nx-p.sx, ny-p.sy) > 8){
        p.moved = true;
        if (p.lt){ clearTimeout(p.lt); p.lt = null; } // movement before 450ms => it's a pan, not a loupe
        clearChips();
      }
      if (pointers.size === 1){
        if (p.louping){
          if (loupe){ loupe.x = nx; loupe.y = ny; } // loupe follows the finger; camera stays put
        } else if (p.moved){
          if (mode === "intervene" && srcDrag){
            // indirect sun drag: move by the finger's delta, from anywhere on screen
            srcDrag.x += (nx - p.x) / cam.z; srcDrag.y += (ny - p.y) / cam.z;
            queueEvent({ type:"source", k: srcDrag.k, x: srcDrag.x, y: srcDrag.y });
          } else if (mode === "observe"){
            follow = false;
            cam.x = wrap(cam.x - (nx - p.x) / cam.z); cam.y = wrap(cam.y - (ny - p.y) / cam.z);
          }
        }
      } else if (pointers.size === 2 && pinch){
        p.x = nx; p.y = ny;
        const [a,b]=[...pointers.values()];
        cam.z = clampZ(pinch.z * Math.hypot(a.x-b.x, a.y-b.y) / pinch.d);
      }
      p.x = nx; p.y = ny;
    };
    const onUp = e => {
      const p = pointers.get(e.pointerId);
      const wasPinch = pointers.size >= 2;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (p && p.lt) clearTimeout(p.lt);
      if (p && p.louping){ loupe = null; doSelect(p.x, p.y, true); return; } // precision pick at loupe center
      if (mode === "intervene"){
        if (p && p.moved && srcDrag && pointers.size === 0){
          const { ox, oy } = srcDrag;
          logIv("source");
          const k = srcDrag.k;
          pushUndo("Moved the sun · Undo", () => { logIv("undo"); queueEvent({ type:"source", k, x: ox, y: oy }); });
        } else if (p && !p.moved && !wasPinch && pointers.size === 0 && performance.now() - p.t >= 350){
          const wx2 = wrap(cam.x + (p.sx - vw/2)/cam.z), wy2 = wrap(cam.y + (p.sy - vh/2)/cam.z);
          setUi(us => ({ ...us, spawnPick: { sx: p.sx, sy: p.sy, x: wx2, y: wy2 } }));
        } else if (p && !p.moved && !wasPinch && pointers.size === 0 && performance.now() - p.t < 350){
          const ns = nearestSource(p.sx, p.sy);
          if (ns.d <= 28) actionsRef.current.selectSource(ns.k === srcSel ? -1 : ns.k); // tap a sun: its card (again: let go)
          else if (srcSel >= 0) actionsRef.current.selectSource(-1);                    // tap water with a sun selected: just let go
          else {
            // fertilize pulse: tap open water to pour mineral there
            const fx = wrap(cam.x + (p.sx - vw/2)/cam.z), fy = wrap(cam.y + (p.sy - vh/2)/cam.z);
            pours.push({ sx: p.sx, sy: p.sy, t: performance.now() });
            logIv("pour");
            queueEvent({ type:"fertilize", x: fx, y: fy, amount: 40, done: snap => {
              pushUndo("Poured mineral · Undo", () => { logIv("undo"); queueEvent({ type:"unfertilize", snap }); });
            }});
          }
        }
        if (pointers.size === 0) srcDrag = null;
        return; // no tap-select while a tool is armed
      }
      if (p && !p.moved && !wasPinch && performance.now() - p.t < 350) doSelect(p.sx, p.sy);
    };
    const onWheel = e => { e.preventDefault(); cam.z = clampZ(cam.z * (e.deltaY < 0 ? 1.12 : 0.89)); };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // main loop: fixed 10 Hz sim, interpolated render
    let raf = 0, last = performance.now(), acc = 0, frames = 0, fpsT = last, fps = 0, uiT = 0;
    const loop = now => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(120, now - last); last = now;
      const spd = speedRef.current;
      if (spd > 0) acc += dt * spd;
      const maxSteps = spd >= 16 ? 9 : spd >= 4 ? 5 : 3;
      let steps = 0;
      while (acc >= P.TICK_MS && steps < maxSteps){
        W.px.set(W.x); W.py.set(W.y);
        step(); acc -= P.TICK_MS; steps++;
      }
      if (steps === maxSteps) acc = 0; // shed backlog: slow-motion, never death-spiral
      const alpha = spd === 0 ? 1 : Math.min(1, acc / P.TICK_MS);
      if (spd === 0) drainEvents(); // interventions apply even while paused
      if (W.lightDirty){ drawLight(); drawHeat(); W.lightDirty = false; }

      // follow-cam: ease toward the selected organism
      if (follow && selValid()){
        const si = sel.i;
        const tx = W.px[si] + wd(W.x[si]-W.px[si])*alpha, ty = W.py[si] + wd(W.y[si]-W.py[si])*alpha;
        cam.x = wrap(cam.x + wd(tx - cam.x)*0.10); cam.y = wrap(cam.y + wd(ty - cam.y)*0.10);
      }

      // ---- render ----
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = COL.abyss; ctx.fillRect(0, 0, vw, vh);
      const z = cam.z, hw = vw/2, hh = vh/2, k = P.WORLD/512;
      const view = { cam, vw, vh, z, hw, hh, alpha, dpr, LOD_Z };
      // tiled light and heat layers (view toggles: slots 8 and 9 of `hidden`)
      const tlx = cam.x - hw/z, tly = cam.y - hh/z;
      for (let ky = Math.floor(tly/P.WORLD); (ky*P.WORLD) < tly + vh/z; ky++)
        for (let kx = Math.floor(tlx/P.WORLD); (kx*P.WORLD) < tlx + vw/z; kx++){
          const dx0 = (kx*P.WORLD - cam.x)*z + hw, dy0 = (ky*P.WORLD - cam.y)*z + hh;
          if (!hiddenRef.current[8]) ctx.drawImage(LB, dx0, dy0, P.WORLD*z, P.WORLD*z);
          if (!hiddenRef.current[9]) ctx.drawImage(HB, dx0, dy0, P.WORLD*z, P.WORLD*z);
        }
      // dissolved mineral (below life), then mat carpet (aggregate sessile producers)
      updateCarpet();
      ctx.imageSmoothingEnabled = true;
      for (let ky = Math.floor(tly/P.WORLD); (ky*P.WORLD) < tly + vh/z; ky++)
        for (let kx = Math.floor(tlx/P.WORLD); (kx*P.WORLD) < tlx + vw/z; kx++){
          const dx0 = (kx*P.WORLD - cam.x)*z + hw, dy0 = (ky*P.WORLD - cam.y)*z + hh;
          ctx.drawImage(MN, dx0, dy0, P.WORLD*z, P.WORLD*z);
          if (!hiddenRef.current[0]) ctx.drawImage(MC, dx0, dy0, P.WORLD*z, P.WORLD*z);
          if (z < LOD_Z && !hiddenRef.current[7]) ctx.drawImage(CC, dx0, dy0, P.WORLD*z, P.WORLD*z);
        }
      // organisms: saturating "screen" composition instead of unbounded addition
      const { pops, mnBound } = drawOrganisms(ctx, view, hiddenRef.current, S);
      drawPours(ctx, pours, performance.now());
      drawCorpses(ctx, view, hiddenRef.current[7]);
      W.pops = pops;

      if (mode === "intervene") drawSunAffordance(ctx, view, srcSel);
      // selection ring (non-additive, drawn above organisms)
      if (selValid()){
        drawSelectionRing(ctx, view, sel.i);
      } else if (sel.i >= 0){ // selected organism died or slot was recycled
        sel.i = -1; follow = false; setUi(u => ({ ...u, card: null }));
      }

      if (loupe) drawLoupe(ctx, canvas, LP, lpx, view, loupe);

      frames++;
      if (now - fpsT > 500){ fps = Math.round(frames*1000/(now-fpsT)); frames = 0; fpsT = now; }
      if (now - uiT > 500){ uiT = now;
        let mFree = 0, mLocked = 0; const MF = W.M, DM = W.dM;
        for (let c = 0; c < MF.length; c++){ mFree += MF[c]; mLocked += DM[c]; }
        let corpses = 0;
        for (let k = 0; k < W.cN; k++) if (W.cAlive[k]){ mLocked += W.cM[k]; corpses++; }
        setUi(u => ({ ...u, tick: W.tick, fps, pops: [...pops], corpses, card: buildCard(),
          mineral: { b: mnBound, f: mFree, l: mLocked, add: W.addedM }, lightMul: P.lightMul }));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); clearTimeout(undoTimer); clearTimeout(chipTimer); window.removeEventListener("resize", resize);
      if (ro) ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel); };
  }, []);

  // speed FAB: tap cycles 1x -> 4x -> 16x -> paused; long-press = pause + single-tick step
  const cycleSpeed = () => {
    const order = [1, 4, 16, 0];
    const nxt = order[(order.indexOf(speedRef.current) + 1) % order.length];
    speedRef.current = nxt; setUi(u => ({ ...u, speed: nxt }));
  };
  const fabDown = () => {
    fabLong.current = setTimeout(() => {
      fabLong.current = "fired";
      speedRef.current = 0; setUi(u => ({ ...u, speed: 0 }));
      actionsRef.current.stepOnce && actionsRef.current.stepOnce();
    }, 450);
  };
  const fabUp = () => {
    if (fabLong.current === "fired"){ fabLong.current = null; return; }
    clearTimeout(fabLong.current); fabLong.current = null;
    cycleSpeed();
  };

  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
  const vp = useViewport();
  const desktop = vp.desktop;
  // On desktop the world keeps the stage and detail docks beside it, so you can
  // watch the pond and read the instruments at the same time — the whole point
  // of an observatory. On mobile nothing changes: sheet over world, as before.
  const srcOpen = uiMode === "intervene" && ui.srcSel >= 0;            // the sun card is showing (7.L)
  const panelKind = !desktop ? null : uiMode === "data" ? "data" : srcOpen ? "src" : ui.card ? "card" : null;
  const panelW = panelKind === "data" ? LAYOUT.panelData
               : (panelKind === "card" || panelKind === "src") ? LAYOUT.panelCard : 0;
  const sheetUp = !desktop && (!!ui.card || srcOpen);                    // a bottom sheet is up: lift the controls
  const sheetPad = srcOpen ? 262 : 194;
  const srcLog = (type, label, undoFn) => { W.evLog.push({ tick: W.tick, type });
    actionsRef.current.pushUndoExt && actionsRef.current.pushUndoExt(label + " · Undo", undoFn); };

  // Keyboard: desktop affordance only. Touch never fires these, and every action
  // remains reachable by pointer, so this adds reach without removing any.
  React.useEffect(() => {
    const onKey = e => {
      const el = e.target;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const setSpeed = v => { speedRef.current = v; setUi(u => ({ ...u, speed: v })); };
      const k = e.key;
      if (k === " "){ e.preventDefault(); setSpeed(speedRef.current === 0 ? 1 : 0); }
      else if (k === "1") setSpeed(1);
      else if (k === "2") setSpeed(4);
      else if (k === "3") setSpeed(16);
      else if (k === "." ){ setSpeed(0); actionsRef.current.stepOnce && actionsRef.current.stepOnce(); }
      else if (k === "o" || k === "O"){ setUiMode("observe"); actionsRef.current.setMode && actionsRef.current.setMode("observe"); }
      else if (k === "i" || k === "I"){ setUiMode("intervene"); actionsRef.current.setMode && actionsRef.current.setMode("intervene"); }
      else if (k === "d" || k === "D"){ setUiMode(m => { const n = m === "data" ? "observe" : "data"; actionsRef.current.setMode && actionsRef.current.setMode(n); return n; }); }
      else if (k === "z" || k === "Z"){ actionsRef.current.undo && actionsRef.current.undo(); }
      else if (k === "s" || k === "S" || k === "h" || k === "H"){ setUiMode("intervene"); actionsRef.current.setMode && actionsRef.current.setMode("intervene");
        actionsRef.current.addSourceCenter && actionsRef.current.addSourceCenter(k === "h" || k === "H" ? "heat" : "sun"); }
      else if (k === "Delete" || k === "Backspace"){ actionsRef.current.removeSelSource && actionsRef.current.removeSelSource(); }
      else if (k === "Escape"){
        actionsRef.current.selectSource && actionsRef.current.selectSource(-1);
        setUi(u => u.spawnPick ? { ...u, spawnPick: null } : { ...u, card: null });
        setUiMode(m => { if (m === "data"){ actionsRef.current.setMode && actionsRef.current.setMode("observe"); return "observe"; } return m; });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div onContextMenu={e => e.preventDefault()}
      style={{ position:"fixed", inset:0, background:COL.abyss, overflow:"hidden",
      fontFamily:"system-ui, -apple-system, sans-serif", userSelect:"none", WebkitUserSelect:"none",
      WebkitTouchCallout:"none" }}>
      <UiStyles />
      {/* stage: the world and everything overlaid on it. Insetting this by the
          panel width is what keeps every absolutely-placed control correct — no
          per-element offset maths anywhere below. */}
      <div style={{ position:"absolute", top:0, left:0, bottom:0, right:panelW,
        transition:"right 0.2s ease" }}>
      <canvas ref={canvasRef} style={{ width:"100%", height:"100%", display:"block",
        touchAction:"none", cursor: uiMode === "intervene" ? "crosshair" : "grab" }} />
      {/* passive status strip. One column: on narrow screens the first row is
          allowed to wrap, and the mineral row below it moves down with the
          flow instead of sitting at a fixed offset for the wrapped text to
          land on (seen on phone-width WebViews). */}
      <div style={{ position:"absolute", top:0, left:0, right:0, padding:"calc(env(safe-area-inset-top, 0px) + 10px) 18px 8px 14px",
        display:"flex", flexDirection:"column", gap:4, pointerEvents:"none",
        color:COL.silt, fontSize:12, fontFamily:mono, textShadow:"0 1px 3px rgba(0,0,0,0.8)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline",
        flexWrap:"wrap", columnGap:12, rowGap:2 }}>
        <span style={{ whiteSpace:"nowrap" }}>t {String(ui.tick).padStart(6," ")}  ·  {ui.fps} fps</span>
        {/* species counts double as view toggles: click to hide a species from the world, click again to show */}
        <span style={{ pointerEvents:"auto", display:"inline-flex", gap:10, flexWrap:"wrap",
          justifyContent:"flex-end", marginLeft:"auto" }}>
          {[...SPECIES.LIVE.map(sp => [sp, GLYPH[sp]]), [7,"◌"], [8,"☀"], [9,"♨"]].map(([sp, glyph]) => {
            const debris = sp === 7, layer = sp >= 8;
            const c = debris ? [158,168,178] : layer ? (sp === 8 ? [200,222,240] : [240,150,110]) : SPECIES_META[sp].rgb;
            const name = debris ? "debris" : sp === 8 ? "the light layer" : sp === 9 ? "the heat layer" : SPECIES_META[sp].name;
            return (
            <button key={sp} className="mc-tab"
              onClick={() => setHidden(h => h.map((v, k) => k === sp ? !v : v))}
              title={(hidden[sp] ? "Show " : "Hide ") + name}
              style={{ background:"transparent", border:"none", padding:"2px 3px", cursor:"pointer", font:"inherit",
                color: !debris && !layer && TRAITS[sp].apex ? "rgb(230,240,250)" : `rgb(${c[0]},${c[1]},${c[2]})`,
                opacity: hidden[sp] ? 0.32 : 1, textDecoration: hidden[sp] ? "line-through" : "none",
                textShadow:"0 1px 3px rgba(0,0,0,0.8)" }}>
              {glyph}{layer ? "" : " " + (debris ? (ui.corpses || 0) : ui.pops[sp])}
            </button> ); })}
        </span>
      </div>
      {/* mineral audit: bound (in biomass) vs free (dissolved) — the sum is conserved */}
      <div style={{ display:"flex", alignItems:"center", gap:8, alignSelf:"flex-end",
        flexWrap:"wrap", justifyContent:"flex-end", rowGap:2,
        fontSize:11, fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace" }}>
        <span>M</span>
        <span style={{ display:"inline-flex", width:96, height:4, borderRadius:2, overflow:"hidden",
          background:"rgba(11,19,30,0.7)" }}>
          <span style={{ width:`${Math.round(100*ui.mineral.b/Math.max(1, ui.mineral.b+ui.mineral.l+ui.mineral.f))}%`,
            background:"rgba(70,214,140,0.85)" }} />
          <span style={{ width:`${Math.round(100*ui.mineral.l/Math.max(1, ui.mineral.b+ui.mineral.l+ui.mineral.f))}%`,
            background:"rgba(158,168,178,0.65)" }} />
          <span style={{ flex:1, background:"rgba(91,200,232,0.4)" }} />
        </span>
        {/* NBSP inside each entry: the summary may wrap, but only between entries */}
        <span style={{ textAlign:"right" }}>{(ui.mineral.b/1000).toFixed(1)}k{" "}bound · {(ui.mineral.l/1000).toFixed(1)}k{" "}locked · {(ui.mineral.f/1000).toFixed(1)}k{" "}free</span>
        {ui.mineral.add > 0.5 && <span style={{ color:"#F2B24A" }}> +{ui.mineral.add < 950 ? Math.round(ui.mineral.add) : (ui.mineral.add/1000).toFixed(1)+"k"}</span>}
      </div>
      </div>
      {/* intervene edge tint: unmistakable "you are editing the world" signal */}
      {uiMode === "intervene" && (
        <div style={{ position:"absolute", inset:0, pointerEvents:"none",
          boxShadow:"inset 0 0 46px rgba(242,178,74,0.32)" }} />
      )}
      {/* mode switch + tool hint */}
      <div style={{ position:"absolute", left:16, zIndex:6,
        bottom: sheetUp ? sheetPad : "calc(env(safe-area-inset-bottom, 0px) + 20px)",
        transition:"bottom 0.25s",
        display:"flex", flexDirection:"column", gap:8, alignItems:"flex-start" }}>

        <div style={{ display:"flex", gap:6, padding:4, borderRadius:14,
          background:"rgba(21,34,51,0.85)", border:"1px solid rgba(94,115,134,0.3)",
          backdropFilter:"blur(6px)" }}>
          {["observe","intervene","data"].map(m => (
            <button key={m}
              onClick={() => { setUiMode(m); actionsRef.current.setMode && actionsRef.current.setMode(m); }}
              style={{ height:40, padding:"0 16px", borderRadius:10, cursor:"pointer",
                fontSize:13, fontWeight:600, textTransform:"capitalize",
                border: m==="intervene" && uiMode===m ? "1px solid rgba(242,178,74,0.8)" : "1px solid transparent",
                background: uiMode===m
                  ? (m==="intervene" ? "rgba(242,178,74,0.18)" : "rgba(201,215,227,0.14)")
                  : "transparent",
                color: uiMode===m ? (m==="intervene" ? "#F2B24A" : "#C9D7E3") : "#5E7386" }}>
              {m}
            </button>
          ))}
        </div>
      </div>
      {uiMode === "data" && !desktop && <DataMode />}
      <ResetButton onReset={() => actionsRef.current.reset && actionsRef.current.reset()} card={sheetUp} />
      {/* sun-intensity press lever (intervene mode) */}
      {uiMode === "intervene" && (
        <div style={{ position:"absolute", top:64, left:"50%", transform:"translateX(-50%)",
          padding:"6px 12px", borderRadius:12,
          background:"rgba(11,19,30,0.72)", border:"1px solid rgba(242,178,74,0.35)", zIndex:5 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ color:"#F2B24A", fontSize:11, fontFamily:"ui-monospace, Menlo, monospace" }}>
            ☀ ×{ui.lightMul.toFixed(2)}</span>
          <input type="range" min="0.4" max="1.6" step="0.05" value={ui.lightMul}
            onChange={e => { const v = +e.target.value;
              setUi(u2 => ({ ...u2, lightMul: v }));
              queueEvent({ type:"lightMul", v, done: s => {
                if (Math.abs(s.prev - v) > 0.24) W.evLog.push({ tick: W.tick, type: "sunlight" });
                if (Math.abs(s.prev - v) > 0.24)
                  actionsRef.current.pushUndoExt && actionsRef.current.pushUndoExt("Changed the sun · Undo",
                    () => queueEvent({ type:"lightMul", v: s.prev }));
              }});
            }}
            style={{ width: 130, accentColor: "#F2B24A" }} />
          </div>
          <div style={{ fontSize:10, color:"rgba(242,178,74,0.75)", marginTop:4, whiteSpace:"nowrap" }}>
            drag → source · tap source → card · tap → pour · hold → seed · sun · heat</div>
        </div>
      )}
      {uiMode === "intervene" && (
        <EvolutionPanel desktop={desktop} mono={mono}
          onLog={(type, label, undoFn) => { W.evLog.push({ tick: W.tick, type });
            actionsRef.current.pushUndoExt && actionsRef.current.pushUndoExt(label + " · Undo", undoFn); }} />
      )}
      {ui.spawnPick && (
        <div style={{ position:"absolute", zIndex:7,
          left: Math.min(Math.max(8, ui.spawnPick.sx - 130), Math.max(8, vp.vw - panelW - 268)),
          top: Math.max(96, ui.spawnPick.sy - 76),
          display:"flex", flexWrap:"wrap", gap:6, padding:8, borderRadius:14, maxWidth: vp.vw - panelW - 16, boxSizing:"border-box",
          background:"rgba(11,19,30,0.94)", border:"1px solid rgba(242,178,74,0.45)" }}>
          {SPECIES.LIVE.map(sp => { const c = SPECIES_META[sp].rgb; return (
            <button key={sp}
              onClick={() => actionsRef.current.seedAt(sp, ui.spawnPick.x, ui.spawnPick.y, ui.spawnPick.sx, ui.spawnPick.sy)}
              style={{ padding:"7px 9px", borderRadius:10, fontSize:11, border:"none",
                background:"rgba(21,34,51,0.95)", color:`rgb(${c[0]},${c[1]},${c[2]})`,
                fontFamily:"ui-monospace, Menlo, monospace" }}>
              ● {SPECIES_META[sp].name}</button> ); })}
          {W.sources.length < P.maxSources && ["sun","heat"].map(kind => (
            <button key={kind} onClick={() => { actionsRef.current.addSourceAt(ui.spawnPick.x, ui.spawnPick.y, ui.spawnPick.sx, ui.spawnPick.sy, kind);
                setUi(us => ({ ...us, spawnPick: null })); }}
              style={{ padding:"7px 9px", borderRadius:10, fontSize:11, border:"1px solid rgba(242,178,74,0.45)",
                background:"rgba(21,34,51,0.95)", color:"#F2B24A", fontFamily:"ui-monospace, Menlo, monospace" }}>
              {kind === "sun" ? "☀ Sun" : "♨ Heat"}</button>
          ))}
          <button onClick={() => setUi(us => ({ ...us, spawnPick: null }))}
            style={{ padding:"7px 8px", borderRadius:10, fontSize:11, border:"none",
              background:"transparent", color:"#5E7386" }}>✕</button>
        </div>
      )}
      {/* species disambiguation chips */}
      {ui.chips && (
        <div style={{ position:"absolute", left:0, top:0,
          transform:`translate(${ui.chips.x}px, ${ui.chips.y - 80}px) translateX(-50%)`,
          display:"flex", gap:6, padding:5, borderRadius:14,
          background:"rgba(21,34,51,0.95)", border:"1px solid rgba(94,115,134,0.4)",
          boxShadow:"0 2px 12px rgba(0,0,0,0.5)" }}>
          {ui.chips.opts.map(o => { const spc = SPECIES_META[o.sp]; return (
            <button key={o.sp}
              onClick={() => actionsRef.current.pick && actionsRef.current.pick(o.i, o.gen)}
              style={{ height:40, padding:"0 13px", borderRadius:10, cursor:"pointer",
                display:"flex", alignItems:"center", gap:7, fontSize:13, fontWeight:600,
                border:"1px solid transparent", background:"rgba(201,215,227,0.08)", color:"#C9D7E3" }}>
              <span style={{ width:9, height:9, borderRadius:5,
                background:`rgb(${spc.rgb[0]},${spc.rgb[1]},${spc.rgb[2]})`,
                boxShadow:`0 0 6px rgb(${spc.rgb[0]},${spc.rgb[1]},${spc.rgb[2]})` }} />
              {spc.name}
            </button> ); })}
        </div>
      )}
      {/* undo chip */}
      {undoChip && (
        <button onClick={() => actionsRef.current.undo && actionsRef.current.undo()}
          style={{ position:"absolute", left:"50%", transform:"translateX(-50%)",
            bottom: sheetUp ? (srcOpen ? sheetPad + 64 : detent===0 ? 194 + 64 : detent===1 ? "48vh" : "82vh")
                            : "calc(env(safe-area-inset-bottom, 0px) + 88px)",
            padding:"10px 18px", borderRadius:20, cursor:"pointer",
            border:"1px solid rgba(242,178,74,0.7)", background:"rgba(21,34,51,0.95)",
            color:"#F2B24A", fontSize:13, fontWeight:600, whiteSpace:"nowrap",
            boxShadow:"0 2px 12px rgba(0,0,0,0.5)" }}>
          {undoChip}
        </button>
      )}
      {/* specimen card — bottom sheet on mobile, docked panel on desktop */}
      {ui.card && !desktop && !srcOpen && (
        <div style={{ position:"absolute", left:0, right:0, bottom:0,
          height: detent===0 ? 178 : detent===1 ? "46vh" : "80vh",
          background:"rgba(21,34,51,0.92)", backdropFilter:"blur(10px)",
          borderTop:"1px solid rgba(94,115,134,0.35)", borderRadius:"16px 16px 0 0",
          color:COL.plankTxt, transition:"height 0.18s ease-out",
          display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); dragRef.current = { y: e.clientY }; }}
            onPointerUp={e => {
              const d = dragRef.current; dragRef.current = null; if (!d) return;
              const dy = e.clientY - d.y;
              if (dy < -40) setDetent(v => Math.min(2, v+1));
              else if (dy > 40) setDetent(v => { if (v === 0){ setUi(u => ({ ...u, card: null })); return 0; } return v-1; });
            }}
            style={{ padding:"16px 0 14px", cursor:"grab", touchAction:"none", flexShrink:0 }}>
            <div style={{ width:40, height:4, borderRadius:2, background:"rgba(94,115,134,0.7)", margin:"0 auto" }} />
          </div>
          <div className="mc-scroll" style={{ padding:"0 18px calc(env(safe-area-inset-bottom, 0px) + 14px)",
            overflowY: detent===2 ? "auto" : "hidden", flex:1 }}>
            <SpecimenBody card={ui.card} tick={ui.tick} detail={detent}
              onFeed={() => actionsRef.current.feed && actionsRef.current.feed()}
              onKill={() => actionsRef.current.kill && actionsRef.current.kill()} />
          </div>
        </div>
      )}
      {/* sun card (7.L) — the selected light source: bottom sheet on mobile, docked panel on desktop */}
      {srcOpen && !desktop && (
        <div style={{ position:"absolute", left:0, right:0, bottom:0, height: sheetPad - 16,
          background:"rgba(21,34,51,0.92)", backdropFilter:"blur(10px)",
          borderTop:"1px solid rgba(242,178,74,0.35)", borderRadius:"16px 16px 0 0",
          color:COL.plankTxt, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div className="mc-scroll" style={{ padding:"14px 18px calc(env(safe-area-inset-bottom, 0px) + 12px)", overflowY:"auto", flex:1 }}>
            <SourceCard k={ui.srcSel} mono={mono} actions={actionsRef} lightMul={ui.lightMul}
              onClose={() => actionsRef.current.selectSource(-1)} onLog={srcLog} />
          </div>
        </div>
      )}
      {/* speed control */}
      {(srcOpen || !ui.card || detent === 0 || desktop) && (
      <button className="mc-fab" onPointerDown={fabDown} onPointerUp={fabUp} onPointerCancel={fabUp}
        title={vp.fine ? "Space play/pause · 1 2 3 speed · . step" : undefined}
        aria-label={ui.speed === 0 ? "Play (long-press: step one tick)" : `Speed ${ui.speed}x (long-press: step one tick)`}
        style={{ position:"absolute", right:16, zIndex:6,
        bottom: sheetUp ? sheetPad : "calc(env(safe-area-inset-bottom, 0px) + 20px)",
        width:52, height:52, borderRadius:26, border:"1px solid rgba(201,215,227,0.25)",
        background:"rgba(21,34,51,0.85)", color:COL.plankTxt, fontSize:18, cursor:"pointer",
        backdropFilter:"blur(6px)" }}>
        <span style={{ fontFamily:"ui-monospace, Menlo, monospace", fontSize: ui.speed===0?18:15 }}>
          {ui.speed === 0 ? "\u25B6" : `${ui.speed}\u00D7`}
        </span>
      </button>
      )}
      {/* keyboard legend: only where a keyboard exists, and only with room for it
          between the mode switch and the speed control */}
      {desktop && vp.fine && (vp.vw - panelW) > 1020 && (
        <div style={{ position:"absolute", left:"50%", transform:"translateX(-50%)",
          bottom:"calc(env(safe-area-inset-bottom, 0px) + 26px)", pointerEvents:"none",
          display:"flex", gap:10, alignItems:"center",
          padding:"7px 12px", borderRadius:12,
          background:"rgba(21,34,51,0.72)", border:"1px solid rgba(94,115,134,0.22)",
          backdropFilter:"blur(6px)",
          color:COL.silt, fontSize:10.5, fontFamily:mono, whiteSpace:"nowrap" }}>
          <span><span className="mc-kbd">space</span> play</span>
          <span><span className="mc-kbd">1</span><span className="mc-kbd">2</span><span className="mc-kbd">3</span> speed</span>
          <span><span className="mc-kbd">.</span> step</span>
          <span><span className="mc-kbd">o</span><span className="mc-kbd">i</span><span className="mc-kbd">d</span> mode</span>
          <span><span className="mc-kbd">z</span> undo</span>
        </div>
      )}
      </div>{/* /stage */}

      {/* desktop dock: instruments beside the world instead of on top of it */}
      {desktop && panelKind && (
        <aside style={{ position:"absolute", top:0, right:0, bottom:0, width:panelW,
          background:"rgba(16,26,40,0.97)", borderLeft:"1px solid rgba(94,115,134,0.32)",
          color:COL.plankTxt, display:"flex", flexDirection:"column", overflow:"hidden", zIndex:8 }}>
          {panelKind === "src" ? (
            <>
              <div style={{ display:"flex", alignItems:"center", padding:"14px 16px 10px", flexShrink:0 }}>
                <span style={{ fontSize:11, letterSpacing:1.4, color:"#F2B24A", fontFamily:mono }}>ENERGY SOURCE</span>
                <button className="mc-hit" onClick={() => actionsRef.current.selectSource(-1)}
                  title="Close (Esc)"
                  style={{ marginLeft:"auto", width:28, height:28, borderRadius:8, cursor:"pointer",
                    border:"1px solid rgba(94,115,134,0.3)", background:"transparent",
                    color:COL.silt, fontSize:13, lineHeight:1 }}>✕</button>
              </div>
              <div className="mc-scroll" style={{ padding:"0 16px 18px", overflowY:"auto", flex:1 }}>
                <SourceCard k={ui.srcSel} desktop mono={mono} actions={actionsRef} lightMul={ui.lightMul} onLog={srcLog} />
              </div>
            </>
          ) : panelKind === "card" ? (
            <>
              <div style={{ display:"flex", alignItems:"center", padding:"14px 16px 10px", flexShrink:0 }}>
                <span style={{ fontSize:11, letterSpacing:1.4, color:COL.silt, fontFamily:mono }}>SPECIMEN</span>
                <button className="mc-hit" onClick={() => setUi(u => ({ ...u, card: null }))}
                  title="Close (Esc)"
                  style={{ marginLeft:"auto", width:28, height:28, borderRadius:8, cursor:"pointer",
                    border:"1px solid rgba(94,115,134,0.3)", background:"transparent",
                    color:COL.silt, fontSize:13, lineHeight:1 }}>✕</button>
              </div>
              <div className="mc-scroll" style={{ padding:"0 16px 18px", overflowY:"auto", flex:1 }}>
                <SpecimenBody card={ui.card} tick={ui.tick} detail={2}
                  onFeed={() => actionsRef.current.feed && actionsRef.current.feed()}
                  onKill={() => actionsRef.current.kill && actionsRef.current.kill()} />
              </div>
            </>
          ) : (
            <DataMode docked />
          )}
        </aside>
      )}
    </div>
  );
}

// Phase 6.0 — evolution settings. Every control is an intervention: it goes through the event
// queue (logged, undoable, replay-safe) and never writes P or TRAITS directly. Amber = the hand.
function EvolutionPanel({ desktop, mono, onLog }){
  const loci = []; for (let sp=0; sp<7; sp++) TRAITS[sp].loci.forEach((_, k) => loci.push({ sp, k })); // one row per (species, locus)
  const read = () => ({ mutation: P.mutation, rows: loci.map(({ sp, k }) => ({ sp, k, sigma: TRAITS[sp].loci[k].sigma, curve: TRAITS[sp].loci[k].curve })) });
  const [evo, setEvo] = React.useState(read);
  const [open, setOpen] = React.useState(desktop);
  const [advanced, setAdvanced] = React.useState(false);
  // 6.1: the effect slopes are prices; "balance" marks the value where the 5.x price surfaces held the locus mid-corridor
  const PRICE_KEYS = ["escSlope","kpSlope","catchSlope","kbSlope","lightSlope","rateSlope","effSlope"];
  const BALANCE = { 1:{ kpSlope:0.5 }, 2:{ kbSlope:0.15 }, 0:{ lightSlope:0.5 }, 3:{ effSlope:0.15, rateSlope:0.5 } };
  // 6.3: presets are one intervention each -- a bundle of events, one log entry, one undo that restores every prev
  const PRESETS = {
    shipped: { label:"Shipped", mutation:true,  set:(sp,L)=>({ sigma:L.sigma0, curve:0 }) },
    settled: { label:"Settled", mutation:true,  set:(sp,L)=>({ curve:0.3 }) },
    wild:    { label:"Wild",    mutation:true,  set:(sp,L)=>({ curve:-0.2, sigma:Math.min(0.12, L.sigma0*2) }) },
    frozen:  { label:"Frozen",  mutation:false, set:()=>({}) },
  };
  const shipped = React.useRef(loci.map(({ sp, k }) => ({ sp, k, sigma0: TRAITS[sp].loci[k].sigma }))); // captured on first mount
  const applyPreset = name => {
    const pr = PRESETS[name]; const prevs = [];
    if (P.mutation !== pr.mutation){ prevs.push({ type:"mutation", v:P.mutation }); queueEvent({ type:"mutation", v:pr.mutation }); }
    for (const { sp, k } of loci){ const L = TRAITS[sp].loci[k], s0 = shipped.current.find(x => x.sp===sp && x.k===k).sigma0;
      const vals = pr.set(sp, { ...L, sigma0:s0 });
      for (const key in vals){ if (Math.abs(L[key]-vals[key]) < 1e-9) continue; prevs.push({ type:"locus", sp, locus:k, key, v:L[key] }); queueEvent({ type:"locus", sp, locus:k, key, v:vals[key] }); } }
    if (prevs.length) onLog("preset", "Preset: " + pr.label, () => prevs.forEach(e => queueEvent(e)));
    setTimeout(() => setEvo(read), 150);
  };
  const dragStart = React.useRef({});   // value at the start of a drag, so one drag = one undo
  const logTimer = React.useRef({});
  React.useEffect(() => { const iv = setInterval(() => setEvo(read), 1000); return () => clearInterval(iv); }, []);
  const amber = "#F2B24A";
  const commit = (sp, kL, key, v, label) => {
    const k = sp + ":" + kL + ":" + key;
    if (dragStart.current[k] === undefined) dragStart.current[k] = TRAITS[sp].loci[kL][key];
    queueEvent({ type:"locus", sp, locus:kL, key, v });
    setEvo(e => ({ ...e, rows: e.rows.map(r => r.sp === sp && r.k === kL ? { ...r, [key]: v } : r) }));
    clearTimeout(logTimer.current[k]);
    logTimer.current[k] = setTimeout(() => {
      const prev = dragStart.current[k]; dragStart.current[k] = undefined;
      if (prev !== undefined && Math.abs(prev - v) > 1e-9)
        onLog("evolution", label, () => queueEvent({ type:"locus", sp, locus:kL, key, v: prev }));
    }, 700);
  };
  const toggleMutation = () => {
    const prev = P.mutation, v = !prev;
    queueEvent({ type:"mutation", v }); setEvo(e => ({ ...e, mutation: v }));
    onLog("mutation", v ? "Mutation on" : "Mutation off", () => queueEvent({ type:"mutation", v: prev }));
  };
  const slider = (sp, kL, key, min, max, step, label) => { const row = evo.rows.find(r => r.sp === sp && r.k === kL); return (
    <input type="range" min={min} max={max} step={step} value={row ? row[key] : 0}
      onChange={e => commit(sp, kL, key, +e.target.value, label)}
      title={label} style={{ width: desktop ? 110 : 84, accentColor: amber }} /> ); };
  return (
    <div style={{ position:"absolute", top: 126, left:"50%", transform:"translateX(-50%)", zIndex:5,
      padding:"6px 12px 8px", borderRadius:12, background:"rgba(11,19,30,0.78)", border:"1px solid rgba(242,178,74,0.35)",
      color:"#C9D7E3", fontSize:11, fontFamily:mono, maxWidth:"calc(100vw - 24px)",
      // six locus rows since multi-locus: the panel must never outgrow the screen — header stays, rows scroll
      maxHeight:"calc(100vh - 190px)", display:"flex", flexDirection:"column" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
        <button className="mc-hit" onClick={() => setOpen(o => !o)}
          style={{ background:"transparent", border:"none", color:amber, cursor:"pointer", font:"inherit", padding:0 }}>
          {open ? "▾" : "▸"} Evolution</button>
        <button className="mc-hit mc-hit-amber" onClick={toggleMutation}
          style={{ marginLeft:"auto", padding:"3px 9px", borderRadius:8, cursor:"pointer", font:"inherit", fontSize:10,
            border:"1px solid rgba(242,178,74,0.6)", background: evo.mutation ? "rgba(242,178,74,0.18)" : "transparent",
            color: evo.mutation ? amber : "#8FA3B5" }}>
          mutation {evo.mutation ? "on" : "off"}</button>
      </div>
      {open && (
        <div className="mc-scroll" style={{ display:"grid", gridTemplateColumns:"auto auto auto", gap:"4px 10px", alignItems:"center", marginTop:6,
          overflowY:"auto", minHeight:0 }}>
          <span style={{ color:"#5E7386", fontSize:9 }}></span>
          <span style={{ color:"#5E7386", fontSize:9 }}>mutation rate</span>
          <span style={{ color:"#5E7386", fontSize:9 }}>trade-off curve</span>
          {evo.rows.map(r => { const c = SPECIES_META[r.sp].rgb, lab = TRAITS[r.sp].loci[r.k].label; return (
            <React.Fragment key={r.sp+"·"+r.k}>
              <span style={{ color:`rgb(${c[0]},${c[1]},${c[2]})` }}>{SPECIES_META[r.sp].name} <span style={{ color:"#5E7386" }}>{lab.toLowerCase()}</span></span>
              <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}>{slider(r.sp, r.k, "sigma", 0, 0.12, 0.005, "Mutation rate · " + SPECIES_META[r.sp].name + " " + lab)}<span style={{ width:34, color:amber }}>{r.sigma.toFixed(3)}</span></span>
              <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}>{slider(r.sp, r.k, "curve", -0.5, 0.8, 0.05, "Trade-off curvature · " + SPECIES_META[r.sp].name + " " + lab)}<span style={{ width:34, color:amber }}>{r.curve >= 0 ? "+" : ""}{r.curve.toFixed(2)}</span></span>
            </React.Fragment> ); })}
          <span style={{ gridColumn:"1 / -1", color:"rgba(242,178,74,0.7)", fontSize:9, marginTop:2 }}>
            curve &lt; 0 sweeps and splits · 0 as shipped · &gt; 0 settles to the middle</span>
          <span style={{ gridColumn:"1 / -1", display:"flex", gap:6, alignItems:"center", marginTop:4, flexWrap:"wrap" }}>
            <span style={{ color:"#5E7386", fontSize:9 }}>presets</span>
            {Object.keys(PRESETS).map(k => (
              <button key={k} className="mc-hit mc-hit-amber" onClick={() => applyPreset(k)}
                style={{ padding:"2px 8px", borderRadius:8, cursor:"pointer", font:"inherit", fontSize:10,
                  border:"1px solid rgba(242,178,74,0.45)", background:"transparent", color:amber }}>{PRESETS[k].label}</button>))}
            <button className="mc-hit" onClick={() => setAdvanced(a => !a)}
              style={{ marginLeft:"auto", padding:"2px 8px", borderRadius:8, cursor:"pointer", font:"inherit", fontSize:10,
                border:"1px solid rgba(94,115,134,0.4)", background:"transparent", color:"#8FA3B5" }}>{advanced ? "hide prices" : "prices…"}</button>
          </span>
          {advanced && evo.rows.map(r => { const L = TRAITS[r.sp].loci[r.k], c = SPECIES_META[r.sp].rgb;
            const keys = PRICE_KEYS.filter(k => L[k]); if (!keys.length) return null; return (
            <React.Fragment key={"p"+r.sp+"·"+r.k}>
              <span style={{ color:`rgb(${c[0]},${c[1]},${c[2]})`, fontSize:10, alignSelf:"start", paddingTop:3 }}>{SPECIES_META[r.sp].name} {L.label.toLowerCase()} prices</span>
              <span style={{ gridColumn:"2 / -1", display:"grid", gridTemplateColumns:"auto auto auto", gap:"2px 8px", alignItems:"center" }}>
                {keys.map(k => { const bal = r.k === 0 && BALANCE[r.sp] && BALANCE[r.sp][k]; return (
                  <React.Fragment key={k}>
                    <span style={{ color:"#5E7386", fontSize:9 }}>{k.replace("Slope","")}{bal ? <span style={{ color:"rgba(242,178,74,0.6)" }}> · balance {bal}</span> : ""}</span>
                    <input type="range" min={0} max={1} step={0.05} value={L[k]} onChange={e => commit(r.sp, r.k, k, +e.target.value, "Price · " + SPECIES_META[r.sp].name + " " + k.replace("Slope",""))}
                      style={{ width: desktop ? 110 : 84, accentColor: amber }} />
                    <span style={{ width:30, color:amber, fontSize:10 }}>{L[k].toFixed(2)}</span>
                  </React.Fragment> ); })}
              </span>
            </React.Fragment> ); })}
        </div>
      )}
    </div>
  );
}
// Specimen detail. One implementation for both layouts: the mobile sheet passes
// its detent, the desktop dock passes 2 (everything visible, nothing to drag).
function SpecimenBody({ card, tick, detail, onFeed, onKill }){
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
  if (!card) return null;
  return (
    <>
      <div style={{ display:"flex", alignItems:"baseline", gap:10 }}>
        <span style={{ width:10, height:10, borderRadius:5, flexShrink:0, alignSelf:"center",
          background:`rgb(${card.rgb[0]},${card.rgb[1]},${card.rgb[2]})`,
          boxShadow:`0 0 8px rgb(${card.rgb[0]},${card.rgb[1]},${card.rgb[2]})` }} />
        <span style={{ fontSize:17, fontWeight:600 }}>{card.name}</span>
        <span style={{ fontSize:12, color:COL.silt }}>{card.role}</span>
        <span style={{ marginLeft:"auto", fontSize:11, color:COL.silt, fontFamily:mono }}>#{card.id}</span>
      </div>
      <div style={{ display:"flex", gap:16, marginTop:8, fontSize:13, alignItems:"center", flexWrap:"wrap" }}>
        <span>{card.state}</span>
        <span style={{ color:COL.silt }}>age {Math.floor(card.age/60)}:{String(card.age%60).padStart(2,"0")}</span>
        <span style={{ marginLeft:"auto", fontSize:11, fontWeight:600, padding:"3px 9px", borderRadius:9,
          background: card.badge==="Ready to divide" ? "rgba(70,214,140,0.15)" : "rgba(94,115,134,0.22)",
          color: card.badge==="Ready to divide" ? "rgb(70,214,140)" : COL.plankTxt }}>
          {card.badge}</span>
      </div>
      {detail >= 1 && SPECIES_PROFILE[card.sp] && (
        <img src={`assets/species/${SPECIES_PROFILE[card.sp].key}.jpg`} alt="" onError={e => { e.currentTarget.style.display = "none"; }}
          style={{ display:"block", width:"100%", maxHeight:200, objectFit:"cover", borderRadius:12, marginTop:12,
            border:"1px solid rgba(94,115,134,0.3)" }} />
      )}
      <div style={{ marginTop:10, display:"grid", gap:5 }}>
        {[["E", card.en, card.cap, `rgb(${card.rgb[0]},${card.rgb[1]},${card.rgb[2]})`],
          ["P", card.pr, card.pQ, "rgb(226,170,150)"],
          ["M", card.mn, card.mQ, "rgb(91,200,232)"]].map(([lb, v, mx, col]) => (
          <div key={lb} style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:10, color:COL.silt, width:10, fontFamily:mono }}>{lb}</span>
            <div style={{ flex:1, height:4, borderRadius:2, background:"rgba(11,19,30,0.8)" }}>
              <div style={{ height:4, borderRadius:2,
                width:`${Math.min(100, Math.round(100*v/Math.max(0.001, mx)))}%`,
                background:col, transition:"width 0.4s" }} />
            </div>
          </div>
        ))}
      </div>
      {detail >= 1 && (
        <div style={{ marginTop:16, fontSize:13, display:"grid",
          gridTemplateColumns:"repeat(auto-fit, minmax(128px, 1fr))", gap:"10px 16px" }}>
          <div><div style={{fontSize:11,color:COL.silt}}>SIZE</div>{card.size.toFixed(1)}</div>
          <div><div style={{fontSize:11,color:COL.silt}}>ENERGY</div>{card.en.toFixed(1)} / {card.cap.toFixed(0)}</div>
          <div><div style={{fontSize:11,color:COL.silt}}>PROTEIN</div>{card.pr.toFixed(1)} / {card.pQ.toFixed(1)}</div>
          <div><div style={{fontSize:11,color:COL.silt}}>MINERAL</div>{card.mn.toFixed(2)} / {card.mQ.toFixed(2)}</div>
          <div><div style={{fontSize:11,color:COL.silt}}>DIVISION GATE</div>{Math.round(100*card.bind)}%</div>
          <div><div style={{fontSize:11,color:COL.silt}}>SIM TIME / TICK</div>{tick}</div>
          <div><div style={{fontSize:11,color:COL.silt}}>GENERATION</div>{card.lineage}</div>
          {Math.abs(card.warmth) > 0.05 && (
            <div><div style={{fontSize:11,color:COL.silt}}>WARMTH HERE</div>
              {(card.warmth > 0 ? "+" : "") + card.warmth.toFixed(1)}° · upkeep ×{card.qR.toFixed(2)}
              {card.warmth > card.ctmax ? <span style={{ color:"rgb(226,96,96)" }}> · past its limit</span>
               : card.warmth > card.topt ? <span style={{ color:"rgb(206,186,120)" }}> · past its optimum</span> : null}</div>
          )}
        </div>
      )}
      {detail >= 1 && card.heredity && card.heredity.map((h, hk) => (
        <div key={hk} style={{ marginTop:14, fontSize:12, lineHeight:1.5 }}>
          <div style={{ fontSize:11, color:COL.silt }}>{h.label.toUpperCase()} · heritable</div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:4 }}>
            <span style={{ fontFamily:mono, fontSize:12 }}>{h.g.toFixed(2)}</span>
            <div style={{ flex:1, height:4, borderRadius:2, background:"rgba(11,19,30,0.8)", position:"relative" }}>
              <div style={{ position:"absolute", left:`${h.g0*100}%`, top:-3, width:1, height:10, background:"rgba(201,215,227,0.45)" }} />
              <div style={{ position:"absolute", left:`calc(${h.g*100}% - 3px)`, top:-1, width:6, height:6, borderRadius:3,
                background:`rgb(${card.rgb[0]},${card.rgb[1]},${card.rgb[2]})` }} />
            </div>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:COL.silt, marginTop:2 }}>
            <span>{h.loWord}</span><span>{h.hiWord}</span>
          </div>
          <div style={{ marginTop:4, color:COL.silt }}>
            vs founder: {h.parts.map(([nm, pct], k) => (
              <span key={nm+k}>{k ? " · " : ""}<span style={{ color: pct === 0 ? COL.silt : pct > 0 ? "rgb(140,230,170)" : "rgb(226,170,150)" }}>
                {pct > 0 ? "+" : ""}{pct}%</span> {nm}</span>))}
          </div>
        </div>
      ))}
      {detail >= 1 && (
        <div style={{ display:"flex", gap:10, marginTop:18 }}>
          <button className="mc-hit mc-hit-amber" onClick={onFeed}
            style={{ flex:1, height:44, borderRadius:10, cursor:"pointer",
              border:"1px solid rgba(242,178,74,0.6)", background:"rgba(242,178,74,0.12)",
              color:"#F2B24A", fontSize:14, fontWeight:600 }}>Feed</button>
          <button className="mc-hit-solid" onClick={onKill}
            style={{ flex:1, height:44, borderRadius:10, cursor:"pointer",
              border:"1px solid rgba(242,178,74,0.9)", background:"rgba(242,178,74,0.85)",
              color:"#0B131E", fontSize:14, fontWeight:600 }}>Kill</button>
        </div>
      )}
      {detail === 2 && SPECIES_PROFILE[card.sp] && (() => { const pf = SPECIES_PROFILE[card.sp]; return (
        <div style={{ marginTop:18, fontSize:12, lineHeight:1.5 }}>
          <div style={{ fontSize:11, color:COL.silt, letterSpacing:1.2 }}>PROFILE</div>
          <div style={{ display:"grid", gridTemplateColumns:"auto 1fr", gap:"5px 12px", marginTop:8 }}>
            {[["habitat", pf.habitat], ["behaviour", pf.behaviour], ["food", pf.food], ["eaten by", pf.eatenBy],
              ["size", pf.size], ["lifecycle", pf.lifecycle]].map(([k, v]) => (
              <React.Fragment key={k}>
                <span style={{ color:COL.silt, fontSize:10, textTransform:"uppercase", letterSpacing:0.8, paddingTop:2 }}>{k}</span>
                <span>{v}</span>
              </React.Fragment>))}
          </div>
        </div> ); })()}
      {detail === 2 && (
        <div style={{ marginTop:18, fontSize:12, color:COL.silt, lineHeight:1.5 }}>
          Amber marks your hand: everything you do to the world, as opposed to what
          nature does, is shown in this color.
        </div>
      )}
    </>
  );
}

// 7.L/7.H — the source card: the selected ENERGY SOURCE. Two channels -- light (a sun) and warmth (a heater;
// negative = a cold source) -- plus spread; a source with both is a hot sun, with light only a sun, with warmth
// only a black heater. Sliders are levers (events, logged, undoable, one drag = one undo); a layout is one
// intervention; the light budget says plainly what the sky delivers relative to the shipped world.
// Layouts are ADDITIVE (L.2 finding, phase7-light-plan.md §11): the shipped sun stays where and what it is;
// extra sources are tight (sigma 130) and far away. Moving and shrinking the shipped sun collapsed the core.
const SOURCE_LAYOUTS = [
  { key:"one",    label:"One sun",     sources:[{ x:512, y:512, i:1.0, a:0, sigma:210 }] },
  { key:"twin",   label:"Second sun",  sources:[{ x:512, y:512, i:1.0, a:0, sigma:210 }, { x:0, y:0, i:1.0, a:0, sigma:130 }] },
  { key:"dim",    label:"Dim sun",     sources:[{ x:512, y:512, i:1.0, a:0, sigma:210 }, { x:0, y:0, i:0.7, a:0, sigma:130 }] },
  { key:"isles",  label:"Archipelago", sources:[{ x:512, y:512, i:1.0, a:0, sigma:210 }, { x:0, y:0, i:0.8, a:0, sigma:110 }, { x:0, y:512, i:0.8, a:0, sigma:110 }] },
  { key:"hot",    label:"Hot sun",     sources:[{ x:512, y:512, i:1.0, a:8, sigma:210 }] },
  { key:"heater", label:"Heater",      sources:[{ x:512, y:512, i:1.0, a:0, sigma:210 }, { x:0, y:0, i:0, a:10, sigma:130 }] },
];
const sourceKind = s => s.i > 0 && s.a > 0 ? "☀♨ Hot sun" : s.i > 0 && s.a < 0 ? "☀❄ Cold light" : s.i > 0 ? "☀ Sun" : s.a > 0 ? "♨ Heater" : s.a < 0 ? "❄ Cold source" : "○ Dark source";
function SourceCard({ k, desktop, mono, actions, lightMul, onClose, onLog }){
  const amber = "#F2B24A";
  const read = () => ({ sources: W.sources.map(s => ({ ...s })), input: lightInput() });
  const [st, setSt] = React.useState(read);
  React.useEffect(() => { const iv = setInterval(() => setSt(read), 400); return () => clearInterval(iv); }, []);
  const dragStart = React.useRef({}), logTimer = React.useRef({});
  const s = st.sources[k]; if (!s) return null;
  const commit = (key, v, label) => {
    if (dragStart.current[key] === undefined) dragStart.current[key] = W.sources[k][key];
    queueEvent({ type:"sourceSet", k, [key]: v });
    setSt(x => ({ ...x, sources: x.sources.map((q, j) => j === k ? { ...q, [key]: v } : q) }));
    clearTimeout(logTimer.current[key]);
    logTimer.current[key] = setTimeout(() => { const prev = dragStart.current[key]; dragStart.current[key] = undefined;
      if (prev !== undefined && Math.abs(prev - v) > 1e-9) onLog("sourceSet", label, () => queueEvent({ type:"sourceSet", k, [key]: prev })); }, 700);
  };
  const budget = LIGHT_REF.v ? st.input / LIGHT_REF.v : 1;
  const row = { display:"flex", alignItems:"center", gap:10, marginTop:8, fontSize:11, fontFamily:mono };
  const lab = { width:62, color:"#8FA3B5", flexShrink:0 };
  const val = { width:44, textAlign:"right", color:amber, flexShrink:0 };
  const btn = { padding:"5px 9px", borderRadius:8, cursor:"pointer", font:"inherit", fontSize:10, fontFamily:mono,
    border:"1px solid rgba(242,178,74,0.45)", background:"transparent", color:amber };
  const last = st.sources.length <= 1;
  const slider = (key, min, max, step, label) => (
    <input type="range" min={min} max={max} step={step} value={s[key]}
      onChange={e => commit(key, +e.target.value, label)} style={{ flex:1, accentColor:amber }} />);
  return (
    <div style={{ color:"#C9D7E3" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ fontSize:13, fontWeight:600, color:amber }}>{sourceKind(s)} · {k+1} of {st.sources.length}</span>
        <span style={{ fontSize:10, color:"#5E7386", fontFamily:mono, marginLeft:"auto", textAlign:"right" }}>
          light input ×{budget.toFixed(2)}<br/>of the shipped world</span>
        {onClose && <button className="mc-hit" onClick={onClose} aria-label="Close"
          style={{ border:"none", background:"transparent", color:"#5E7386", fontSize:13, cursor:"pointer", padding:"0 0 0 4px" }}>✕</button>}
      </div>
      <div style={row}><span style={lab}>light</span>{slider("i", 0, 1.5, 0.05, "Changed a source's light")}<span style={val}>{s.i.toFixed(2)}</span></div>
      <div style={row}><span style={lab}>warmth</span>{slider("a", -8, 15, 0.5, "Changed a source's warmth")}<span style={val}>{(s.a > 0 ? "+" : "") + s.a.toFixed(1)}°</span></div>
      <div style={row}><span style={lab}>spread</span>{slider("sigma", 90, 300, 10, "Changed a source's spread")}<span style={val}>{Math.round(s.sigma)}</span></div>
      <div style={{ ...row, flexWrap:"wrap", gap:6 }}>
        {SOURCE_LAYOUTS.map(L => (
          <button key={L.key} className="mc-hit" style={btn}
            onClick={() => actions.current.sourceLayout(L.sources.map(q => ({ ...q })), "Layout: " + L.label)}>{L.label}</button>))}
        <button className="mc-hit" disabled={last} onClick={() => actions.current.removeSource(k)}
          title={last ? "The world keeps at least one source" : "Remove this source (Delete)"}
          style={{ ...btn, marginLeft:"auto", opacity: last ? 0.35 : 1, borderColor:"rgba(226,96,96,0.6)", color:"rgb(226,96,96)" }}>Remove</button>
      </div>
      <div style={{ fontSize:10, color:"#5E7386", marginTop:8, lineHeight:1.5 }}>
        {st.sources.length < P.maxSources ? (desktop ? "S adds a sun, H a heater, at the view centre" : "hold on water → add a sun or a heater there") : "four sources at most"}
        {" · drag anywhere moves this one"}{Math.abs(lightMul - 1) > 1e-9 ? ` · ☀ lever ×${lightMul.toFixed(2)} on all light` : ""}
      </div>
    </div>
  );
}
