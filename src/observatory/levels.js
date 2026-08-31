// ============================================================
// LEARNING LEVELS (Phase 8.0) — guided experiments over the certified world.
//
// Contract, same discipline as the rest of the observatory:
//   - Definitions are DATA. Every number below was measured, not designed;
//     the calibration runs live in docs/phase8-levels-plan.md and
//     harness/levels.js re-proves them on every run: a level must FAIL with
//     no player action and PASS with the intended strategy, or it is a
//     demonstration wearing a challenge's clothes.
//   - Evaluation (levelCheck) is a PURE OBSERVER: zero PRNG draws, zero
//     mutation of dynamic state. It reads the recorder's ring buffer one
//     sample at a time, so verdicts are identical at any UI speed and in
//     the headless harness.
//   - Setup (levelStart) composes only the legal entry points: the
//     initWorld scenario (draw-free when absent) and applyEvent. A level
//     world is its own world, like a moved sun — no conformance claim.
// ============================================================
const LVL = { def: null, state: "idle", run: 0, seenS: 0, pourLeft: 0, failWhy: "" };

// one recorder sample, `back` samples before the latest (pure ring-buffer reads)
function lvlSample(back){
  const r = ((W.recHead - 1 - back + REC.N) % REC.N) * REC.CH, B = W.rec;
  const total = B[r+14] + B[r+15] + B[r+16] + B[r+17];
  return { pop: sp => B[r+sp], free: B[r+14],
    lockShare: (B[r+16] + B[r+17]) / Math.max(1, total) };
}

function levelStart(def){
  P.mutation = false;   // experiments run on the certified silent world; the sandbox restores true
  P.lightMul = 1.0;
  resetWorld();
  initWorld(def.world.seed, { found: def.world.found, M0: def.world.M0 });
  if (def.world.lightMul !== undefined) applyEvent({ type: "lightMul", v: def.world.lightMul });
  LVL.def = def; LVL.state = "running"; LVL.run = 0; LVL.seenS = 0; LVL.failWhy = "";
  LVL.pourLeft = def.apparatus.pours === true ? Infinity : (def.apparatus.pours | 0);
}
function levelRestart(){ const d = LVL.def; if (d) levelStart(d); }
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
      const why = def.failNow ? def.failNow(S) : "";
      if (why){ L.state = "failed"; L.failWhy = why; break; }
      L.run = def.pass(S) ? L.run + 1 : 0;
      if (L.run >= (def.sustain || 10)) L.state = "passed";
    }
    L.seenS = sNow;
  }
  if (L.state === "running" && W.tick >= def.deadline){
    L.state = "failed"; L.failWhy = def.timeoutWhy || "Time ran out.";
  }
  return L.state;
}

// ---- the ladder (increment 1: the single-producer arc; the rest is planned in docs/phase8-levels-plan.md)
// Naming rule 8: functional title first, the science as subtitle. Amber-handed tools only.
const SOLO_MAT = { 0: 20, 1: 0, 2: 0, 3: 0, 6: 0 };
const LEVELS = [
  {
    key: "light", n: 1,
    title: "First Light", science: "Photosynthesis · carrying capacity",
    question: "Why does nothing grow in a dim pond?",
    briefing: "Twenty founders of Solara drift onto a settling ground under a weak sun. " +
      "Left alone, the mat starves at any size — light is this world's only income. " +
      "Your instrument is the ☀ lever in Intervene mode.",
    goalText: "Establish the mat — 400 Solara, held",
    world: { seed: 101, found: SOLO_MAT, lightMul: 0.5 },
    apparatus: { pours: true, seed: false, sources: false, walls: false, evolution: false },
    deadline: 8000, sustain: 10,
    pass: S => S.pop(0) >= 400,
    failNow: S => S.pop(0) === 0 ? "The last Solara died — the mat never caught the light." : "",
    timeoutWhy: "The mat never established. Under this sun, photosynthesis cannot pay upkeep at any population size.",
    meter: S => [{ label: "Solara", v: S.pop(0), goal: 400 }],
    debrief: {
      pass: "Light is the pond's only income. Below roughly ×0.6 sun the mat's photosynthesis cannot pay " +
        "its upkeep, so it dwindles at any size. With enough light, growth runs fast at first and then " +
        "flattens: the mat shades itself and crowds its own settling ground. That plateau is the carrying " +
        "capacity — not a quota, but an equilibrium between energy income and cost.",
      fail: "The mat needed more energy income. Watch a single Solara in its specimen card: under the dim sun " +
        "its energy bar never fills — photosynthesis below upkeep. The ☀ lever raises the world's income; " +
        "everything else only moves what little there is around.",
    },
  },
  {
    key: "mineral", n: 2,
    title: "The Hungry Water", science: "Liebig's law of the minimum",
    question: "The sun is already at its fiercest — why does the mat stall anyway?",
    briefing: "The ☀ lever starts pinned at its maximum, over poor water: a fifth of the usual dissolved " +
      "mineral. The mat rises, then stalls far below its sunny-day size — more light has nothing left to " +
      "give. You carry ten doses of mineral: tap open water in Intervene mode to pour one. Where you pour " +
      "decides whether they feed the mat or the empty sea.",
    goalText: "Grow the mat past 600 on ten pours",
    world: { seed: 202, found: SOLO_MAT, M0: 0.4, lightMul: 1.6 },
    apparatus: { pours: 10, seed: false, sources: false, walls: false, evolution: false },
    deadline: 9000, sustain: 10,
    pass: S => S.pop(0) >= 600,
    failNow: S => S.pop(0) === 0 ? "The mat has died out." : "",
    timeoutWhy: "The mat stalled below 600. Light was maxed out the whole time — the scarcest ingredient set the ceiling.",
    meter: S => [{ label: "Solara", v: S.pop(0), goal: 600 }],
    debrief: {
      pass: "Growth is capped by the scarcest ingredient, not the most generous one — Liebig's law of the " +
        "minimum. The sun was already giving everything; mineral was the ceiling, and it rose only where " +
        "the mat could take it up before the slow mixing spread it thin. Check the M bar at the top: " +
        "everything you poured is still somewhere — in bodies, in the water, or in the dead. Matter is " +
        "conserved; only light is income.",
      fail: "The specimen cards told the story: Mineral-limited, under a maxed-out sun. Pours at the dark " +
        "edge feed mostly water — mixing moves mineral slowly, and the mat takes up only what arrives. " +
        "Pour early, and pour where the mat lives.",
    },
  },
  {
    key: "cycle", n: 3,
    title: "Everything Flows", science: "Decomposition · the mineral cycle",
    question: "The mat is thriving — so why is the water emptying?",
    briefing: "The same pond as your first experiment, under a full sun. The mat booms, and yet the free " +
      "mineral drains, tick after tick: everything that dies takes its mineral into the mud, and nothing " +
      "brings it back. Something is missing from this world. Long-press open water in Intervene mode to " +
      "seed a species — choose the right one.",
    goalText: "Close the cycle — locked mineral under 20%, recyclers established, mat 1000+",
    world: { seed: 101, found: SOLO_MAT },
    apparatus: { pours: true, seed: "all", sources: false, walls: false, evolution: false },
    deadline: 14000, sustain: 10,
    pass: S => S.pop(3) >= 80 && S.lockShare < 0.20 && S.pop(0) >= 1000,
    failNow: S => S.pop(0) === 0 ? "The producers are gone — without the mat, nothing eats and nothing returns." : "",
    timeoutWhy: "The dead kept their mineral. Over 40% of the world's matter ended up locked in corpses and " +
      "mud, and the water kept emptying.",
    meter: S => [{ label: "locked", v: Math.round(S.lockShare * 100), goal: 20, dir: -1, unit: "%" },
                 { label: "Bacillus", v: S.pop(3), goal: 80 }],
    debrief: {
      pass: "Decomposers close the loop. Bacillus eats the dead and excretes their mineral back into the " +
        "water — the same matter now cycles instead of accumulating in the mud. This is the deepest rule " +
        "of this world: matter is a loop, energy is a river. A pond without its recycling guild strangles " +
        "slowly on its own dead — this world's Observatory first learned to see that in an experiment " +
        "called K6, and it is why the mud here never lies.",
      fail: "Only a decomposer returns locked mineral to the water. Grazers and hunters just move matter " +
        "between bodies — and everything they kill locks more of it in the mud. Seed Bacillus near the " +
        "mat, where the dead are.",
    },
  },
];

// __LEVELS_NOTE__ deferred arcs (species interactions, environment, evolution): see docs/phase8-levels-plan.md.
