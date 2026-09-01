// ============================================================
// LEARNING LEVELS (Phase 8.0) — guided experiments over the certified world.
//
// Contract, same discipline as the rest of the observatory:
//   - Definitions are DATA, predicates included. Every number below was
//     measured, not designed; the calibration runs live in
//     docs/phase8-levels-plan.md and harness/levels.js re-proves them on every
//     run: a level must FAIL with no player action and PASS with the intended
//     strategy, or it is a demonstration wearing a challenge's clothes. The
//     table itself lives in src/observatory/levels.json (inlined by
//     tools/build.py as LEVEL_ROWS) and reaches the Rust core through
//     rust/microcosm-core/src/levels_gen.rs, generated from the built core.
//     Predicates are comparison lists rather than closures for exactly that
//     reason: a closure cannot cross the language boundary, so one shared
//     definition would quietly have become two definitions.
//   - Evaluation (levelCheck) is a PURE OBSERVER: zero PRNG draws, zero
//     mutation of dynamic state. It reads the recorder's ring buffer one
//     sample at a time, so verdicts are identical at any UI speed and in
//     the headless harness.
//   - Setup (levelStart) composes only the legal entry points: the
//     initWorld scenario (draw-free when absent) and applyEvent. A level
//     world is its own world, like a moved sun — no conformance claim.
// ============================================================
const LVL = { def: null, state: "idle", run: 0, seenS: 0, pourLeft: 0, failWhy: "", predicted: -1,
  mem: {} }; // per-run scratch for stateful predicates (e.g. "extinct AFTER being present"); sample-driven, so deterministic

// one recorder sample, `back` samples before the latest (pure ring-buffer reads)
function lvlSample(back){
  const r = ((W.recHead - 1 - back + REC.N) % REC.N) * REC.CH, B = W.rec;
  const total = B[r+14] + B[r+15] + B[r+16] + B[r+17];
  return { pop: sp => B[r+sp], free: B[r+14],
    lockShare: (B[r+16] + B[r+17]) / Math.max(1, total) };
}

function levelStart(def, predicted){
  P.mutation = false;   // experiments run on the certified silent world; the sandbox restores true
  P.lightMul = 1.0;
  resetWorld();
  initWorld(def.world.seed, { found: def.world.found, M0: def.world.M0 });
  if (def.world.lightMul !== undefined) applyEvent({ type: "lightMul", v: def.world.lightMul });
  LVL.def = def; LVL.state = "running"; LVL.run = 0; LVL.seenS = 0; LVL.failWhy = "";
  LVL.pourLeft = def.apparatus.pours === true ? Infinity : (def.apparatus.pours | 0);
  LVL.predicted = predicted === undefined ? -1 : predicted; // F1: committed before the run; contrast, never grade
  LVL.mem = {};
}
function levelRestart(){ const d = LVL.def, p = LVL.predicted; if (d) levelStart(d, p); }
// F2: the freshest Observatory event of a type this level narrates (pure read; null outside a level)
function levelNarration(){
  const def = LVL.def; if (!def || !def.narrate) return null;
  for (let k = W.sysEvents.length - 1; k >= 0; k--)
    if (def.narrate.indexOf(W.sysEvents[k].type) >= 0) return W.sysEvents[k];
  return null;
}
function levelStop(){ LVL.def = null; LVL.state = "idle"; }
// apparatus gates the UI consults; everything open outside a level
function levelAllows(what){
  if (!LVL.def) return true;
  const a = LVL.def.apparatus;
  if (what === "seed") return a.seed === "all";
  return !!a[what];
}
function levelPourOk(){ return !LVL.def || LVL.pourLeft > 0; }
function levelNotePour(d){ if (LVL.def && LVL.pourLeft !== Infinity) LVL.pourLeft = Math.max(0, LVL.pourLeft - d); }

// ---- the predicate evaluator. Schema:
//   condition  { m: "pop", sp } | { m: "lockShare" } | { m: "free" }, with op one of
//              >= <= > < ==, and v the right-hand side; or { latched: id } for a set latch.
//   pass       AND of conditions.
//   latch      [{ id, when }] — set once its conditions hold, evaluated before failNow, so a
//              level can say "extinct AFTER being present". Per-run scratch (LVL.mem), sample-
//              driven, therefore deterministic.
//   failNow    ordered [{ when, why }]; the first match ends the run.
//   meter      [{ label, m, sp?, pct?, goal?, dir?, unit? }] — pct reads the share as a rounded
//              percentage. A row with no goal is information, not an objective.
function lvlMetric(S, r){
  return r.m === "lockShare" ? S.lockShare : r.m === "free" ? S.free : S.pop(r.sp);
}
function lvlCond(S, M, c){
  if (c.latched !== undefined) return !!(M && M[c.latched]);
  const v = lvlMetric(S, c);
  switch (c.op){
    case ">=": return v >= c.v;
    case "<=": return v <= c.v;
    case ">":  return v >  c.v;
    case "<":  return v <  c.v;
    case "==": return v === c.v;
  }
  throw new Error("levels: unknown operator " + c.op);
}
function lvlAll(S, M, list){
  for (let k = 0; k < list.length; k++) if (!lvlCond(S, M, list[k])) return false;
  return true;
}
// the HUD's meter rows for the latest sample; [] outside a level or before the first sample
function levelMeter(){
  const def = LVL.def; if (!def || !W.recCount) return [];
  const S = lvlSample(0);
  return def.meter.map(m => {
    const o = { label: m.label, v: m.pct ? Math.round(lvlMetric(S, m) * 100) : lvlMetric(S, m) };
    if (m.goal !== undefined) o.goal = m.goal;
    if (m.dir !== undefined) o.dir = m.dir;
    if (m.unit !== undefined) o.unit = m.unit;
    return o;
  });
}

// The verdict loop: walk every recorder sample exactly once, oldest first.
// Sustain is counted in samples (20 ticks each), so speed cannot change a verdict.
function levelCheck(){
  const L = LVL, def = L.def;
  if (!def || L.state !== "running") return L.state;
  const sNow = Math.floor(W.tick / REC.STRIDE);
  let news = sNow - L.seenS;
  if (news > 0){
    if (news > W.recCount) news = W.recCount;
    if (news > REC.N) news = REC.N;
    for (let k = news - 1; k >= 0 && L.state === "running"; k--){
      const S = lvlSample(k);
      if (def.latch) for (const l of def.latch) if (lvlAll(S, L.mem, l.when)) L.mem[l.id] = 1;
      let why = "";
      for (const f of def.failNow) if (lvlAll(S, L.mem, f.when)){ why = f.why; break; }
      if (why){ L.state = "failed"; L.failWhy = why; break; }
      L.run = lvlAll(S, L.mem, def.pass) ? L.run + 1 : 0;
      if (L.run >= (def.sustain || 10)) L.state = "passed";
    }
    L.seenS = sNow;
  }
  if (L.state === "running" && W.tick >= def.deadline){
    L.state = "failed"; L.failWhy = def.timeoutWhy || "Time ran out.";
  }
  return L.state;
}

// ---- the ladder (increment 1: the single-producer arc; the rest is planned in
// docs/phase8-ladder-design.md). Naming rule 8: functional title first, the science as
// subtitle. Amber-handed tools only.
const LEVELS = LEVEL_ROWS;

// __LEVELS_NOTE__ deferred arcs (L7-L12): specs in docs/phase8-ladder-design.md; each enters through the honesty gate.
