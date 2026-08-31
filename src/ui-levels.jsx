// ============================================================
// Phase 8 — the app shell: start screen, experiment HUD, verdicts.
// The world component (src/ui.jsx) is unchanged in spirit: this layer only
// decides WHICH world it mounts (sandbox, or a level via levelStart) and
// paints the level's objective and verdict over it. Level state itself
// lives in the sim-side observer (src/observatory/levels.js), so the UI
// reads verdicts, never computes them. Colors: navigation stays neutral —
// amber remains reserved for the player's hand on the world.
// ============================================================
function HomeButton({ onExit }){
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 2600);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button aria-label="Back to the start screen"
      onClick={() => { if (armed){ setArmed(false); onExit(); } else setArmed(true); }}
      style={{ position:"absolute", left:14, top:"calc(env(safe-area-inset-top, 0px) + 46px)", zIndex:6,
        width:34, height:34, borderRadius:17,
        background: armed ? "rgba(201,215,227,0.16)" : "rgba(21,34,51,0.8)",
        border: armed ? "1.5px solid rgba(201,215,227,0.7)" : "1px solid rgba(94,115,134,0.4)",
        color: armed ? "#C9D7E3" : "#8FA3B5", fontSize:15, cursor:"pointer",
        fontFamily:"ui-monospace, Menlo, monospace" }}>
      {armed ? "?" : "⌂"}
    </button>
  );
}

// objective HUD + verdict card for the running experiment; null in the sandbox
function LevelStage({ tick, desktop, panelW, onExit, onLevel, onRetry }){
  const def = LVL.def;
  const [dismissed, setDismissed] = React.useState(false);
  const prevSt = React.useRef("running");
  if (!def) return null;
  const st = LVL.state;
  if (prevSt.current !== st){ prevSt.current = st; if (dismissed) setDismissed(false); }
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
  const S = W.recCount ? lvlSample(0) : null;
  const meters = S ? def.meter(S) : [];
  const col = st === "passed" ? "rgb(70,214,140)" : st === "failed" ? "rgb(226,96,96)" : "rgba(148,166,184,0.55)";
  const next = LEVELS[LEVELS.indexOf(def) + 1];
  const btn = solid => ({ padding:"9px 14px", borderRadius:10, cursor:"pointer", fontSize:12.5, fontWeight:600,
    border:"1px solid rgba(148,166,184,0.45)", background: solid ? "rgba(201,215,227,0.16)" : "transparent",
    color:"#C9D7E3" });
  return (
    <>
      {/* objective chip: right of the home control, compact two lines — the sun lever steps below it in intervene mode */}
      <div style={{ position:"absolute", top:"calc(env(safe-area-inset-top, 0px) + 44px)", left:56, right:12,
        maxWidth:430, margin:"0 auto", zIndex:5, padding:"6px 11px", borderRadius:12,
        background:"rgba(11,19,30,0.82)", border:`1px solid ${col}`,
        color:"#C9D7E3", fontSize:11, fontFamily:mono, pointerEvents:"none" }}>
        <div style={{ display:"flex", gap:8, alignItems:"baseline", whiteSpace:"nowrap" }}>
          <span style={{ color:"#8FA3B5", fontSize:10, letterSpacing:1 }}>E{def.n}</span>
          <span style={{ fontWeight:600, overflow:"hidden", textOverflow:"ellipsis" }}>{def.title}</span>
          {st === "passed" && <span style={{ color:"rgb(70,214,140)" }}>✓ complete</span>}
          {st === "failed" && <span style={{ color:"rgb(226,96,96)" }}>✕ failed</span>}
          <span style={{ marginLeft:"auto", color: st === "running" && def.deadline - tick < 1500 ? "rgb(226,170,150)" : "#8FA3B5" }}>
            t {tick}/{def.deadline}</span>
        </div>
        <div style={{ marginTop:2, display:"flex", gap:12, flexWrap:"wrap", color:"#8FA3B5" }}>
          {meters.map(m => { const met = m.dir === -1 ? m.v <= m.goal : m.v >= m.goal; return (
            <span key={m.label} style={{ color: met ? "rgb(70,214,140)" : "#C9D7E3" }}>
              {m.label} {m.v}{m.unit || ""} {m.dir === -1 ? "→ ≤" : "/"} {m.goal}{m.unit || ""}</span> ); })}
          {LVL.pourLeft !== Infinity && <span style={{ color: LVL.pourLeft ? "#C9D7E3" : "rgb(226,170,150)" }}>pours left {LVL.pourLeft}</span>}
        </div>
      </div>
      {/* verdict card */}
      {(st === "passed" || st === "failed") && !dismissed && (
        <div style={{ position:"absolute", inset:0, zIndex:9, display:"flex", alignItems:"center",
          justifyContent:"center", padding:18, background:"rgba(5,10,17,0.45)" }}>
          <div style={{ maxWidth:430, maxHeight:"80%", overflowY:"auto", padding:"18px 20px", borderRadius:16,
            background:"rgba(16,26,40,0.97)", border:`1px solid ${col}`, color:"#C9D7E3",
            boxShadow:"0 4px 30px rgba(0,0,0,0.6)" }}>
            <div style={{ fontSize:11, letterSpacing:1.2, fontFamily:mono, color:col }}>
              {st === "passed" ? "EXPERIMENT COMPLETE" : "EXPERIMENT FAILED"}</div>
            <div style={{ fontSize:17, fontWeight:600, marginTop:4 }}>{def.title}</div>
            <div style={{ fontSize:11, color:"#8FA3B5", marginTop:2 }}>{def.science}</div>
            {st === "failed" && LVL.failWhy && (
              <div style={{ marginTop:10, fontSize:12.5, color:"rgb(226,170,150)", lineHeight:1.55 }}>{LVL.failWhy}</div>
            )}
            <div style={{ marginTop:10, fontSize:12.5, lineHeight:1.6 }}>
              {st === "passed" ? def.debrief.pass : def.debrief.fail}</div>
            <div style={{ display:"flex", gap:8, marginTop:16, flexWrap:"wrap" }}>
              {st === "failed" && <button className="mc-hit" style={btn(true)}
                onClick={() => { setDismissed(false); prevSt.current = "running"; onRetry(); }}>Try again</button>}
              {st === "passed" && next && <button className="mc-hit" style={btn(true)}
                onClick={() => onLevel(next)}>Next: {next.title} →</button>}
              <button className="mc-hit" style={btn(false)} onClick={onExit}>Experiments</button>
              <button className="mc-hit" style={btn(false)} onClick={() => setDismissed(true)}>Keep observing</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StartScreen({ badges, onSandbox, onLevel }){
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
  const card = { display:"block", width:"100%", textAlign:"left", padding:"14px 16px", borderRadius:14,
    background:"rgba(21,34,51,0.75)", border:"1px solid rgba(94,115,134,0.35)",
    color:"#C9D7E3", cursor:"pointer", font:"inherit" };
  return (
    <div style={{ position:"fixed", inset:0, background:"#0B131E", overflowY:"auto",
      fontFamily:"system-ui, -apple-system, sans-serif", userSelect:"none", WebkitUserSelect:"none" }}>
      <div style={{ maxWidth:520, margin:"0 auto",
        padding:"calc(env(safe-area-inset-top, 0px) + 48px) 20px calc(env(safe-area-inset-bottom, 0px) + 32px)" }}>
        <div style={{ fontSize:26, fontWeight:700, letterSpacing:5, color:"#C9D7E3", fontFamily:mono }}>MICROCOSM</div>
        <div style={{ fontSize:13, color:"#8FA3B5", marginTop:4 }}>an ecosystem in a drop of water</div>
        <button className="mc-hit" onClick={onSandbox} style={{ ...card, marginTop:26 }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:10 }}>
            <span style={{ fontSize:16, fontWeight:600 }}>Sandbox</span>
            <span style={{ fontSize:11, color:"#8FA3B5" }}>the open pond</span>
          </div>
          <div style={{ fontSize:12, color:"#8FA3B5", marginTop:5, lineHeight:1.5 }}>
            Five species, every lever, no goal but curiosity. The Observatory narrates what it sees.</div>
        </button>
        <div style={{ fontSize:11, letterSpacing:1.6, color:"#5E7386", fontFamily:mono, margin:"26px 0 10px" }}>
          EXPERIMENTS · learn the pond by running it</div>
        <div style={{ display:"grid", gap:10 }}>
          {LEVELS.map(def => (
            <button key={def.key} className="mc-hit" onClick={() => onLevel(def)} style={card}>
              <div style={{ display:"flex", alignItems:"baseline", gap:10 }}>
                <span style={{ fontSize:11, color:"#5E7386", fontFamily:mono }}>{def.n}</span>
                <span style={{ fontSize:15, fontWeight:600 }}>{def.title}</span>
                <span style={{ fontSize:11, color:"#8FA3B5" }}>{def.science}</span>
                {badges[def.key] && <span style={{ marginLeft:"auto", color:"rgb(70,214,140)", fontSize:14 }}>✓</span>}
              </div>
              <div style={{ fontSize:12, color:"#8FA3B5", marginTop:5, lineHeight:1.5, fontStyle:"italic" }}>
                {def.question}</div>
              <div style={{ fontSize:12, color:"#C9D7E3", marginTop:6, lineHeight:1.55 }}>{def.briefing}</div>
              <div style={{ fontSize:11.5, color:"#8FA3B5", marginTop:6, fontFamily:mono }}>goal · {def.goalText}</div>
            </button>
          ))}
        </div>
        <div style={{ fontSize:11, color:"#5E7386", marginTop:22, lineHeight:1.5 }}>
          More experiments — grazers, hunters, heat, evolution — are planned; each ships only once its
          challenge is calibrated by measurement. Progress marks last for this session.</div>
      </div>
    </div>
  );
}

export default function MicrocosmApp(){
  const [view, setView] = React.useState("menu");   // menu | world
  const [runId, setRunId] = React.useState(0);      // remount key: every entry is a fresh world
  const [badges, setBadges] = React.useState({});   // session-only completion marks (no localStorage by artifact rule)
  React.useEffect(() => {
    if (view !== "world") return;
    const iv = setInterval(() => {
      if (LVL.def && LVL.state === "passed")
        setBadges(b => b[LVL.def.key] ? b : { ...b, [LVL.def.key]: true });
    }, 1000);
    return () => clearInterval(iv);
  }, [view]);
  const harvest = () => { if (LVL.def && LVL.state === "passed")
    setBadges(b => b[LVL.def.key] ? b : { ...b, [LVL.def.key]: true }); };
  const enterSandbox = () => { harvest(); levelStop(); P.mutation = true; resetWorld(); initWorld();
    setRunId(r => r + 1); setView("world"); };
  const enterLevel = def => { harvest(); levelStart(def); setRunId(r => r + 1); setView("world"); };
  const exit = () => { harvest(); levelStop(); setView("menu"); };
  return view === "menu"
    ? <StartScreen badges={badges} onSandbox={enterSandbox} onLevel={enterLevel} />
    : <Microcosm key={runId} onExit={exit} onLevel={enterLevel} />;
}
