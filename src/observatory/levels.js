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
const LVL = { def: null, state: "idle", run: 0, seenS: 0, pourLeft: 0, failWhy: "", predicted: -1 };

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
    predict: { prompt: "Twenty founders under a weak sun. If you only watch, what happens?",
      options: ["The mat grows slowly, but it gets there", "It starves at any size — light is the income",
                "It grows until the water's mineral runs out"],
      reflect: ["Patience was not the missing ingredient: below its break-even light the mat loses energy at every size, so time alone never saves it.",
                "Exactly what the energy bars showed: photosynthesis below upkeep, at any population size.",
                "Mineral never got the chance to matter — the energy books failed first, long before the water emptied."] },
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
    predict: { prompt: "The sun is already at its maximum. What will ten doses of mineral do?",
      options: ["Placement won't matter — mixing spreads them anyway", "They help only where the mat can drink them first",
                "Nothing — light must still be the problem"],
      reflect: ["Mixing does spread them — measured here at roughly a fifth of the pace the mat needed. The dark-shore doses arrived, but late.",
                "The transport books agree: mineral moves slowly, and the mat drinks what lands beside it.",
                "The lever was pinned at its ceiling the whole time — the scarcest ingredient ruled, and it was not light."] },
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
    predict: { prompt: "The mat is thriving. Where is the free mineral going?",
      options: ["Nowhere — a healthy pond cycles by itself", "Into the dead — and it stays there",
                "The living mat is hoarding all of it"],
      reflect: ["Cycling is work, and nobody in this world was doing it — matter flowed downhill into the mud and stopped.",
                "The chemistry page agrees: the locked share climbed, tick after tick, until something ate the dead.",
                "Bodies held part of it — but the mud held more, and the mud gives nothing back on its own."] },
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
  {
    key: "garden", n: 4,
    title: "The Gardener", science: "Competitive exclusion · keystone grazing",
    question: "The water is poor and the bloom owns it. Can the meadow be saved?",
    briefing: "Poor water, and the quick plankton owns it: Drifta's uptake outraces the mat's, and the " +
      "meadow starves at the bottom of a bright pond. You carry eight doses of mineral, and the seeding " +
      "bench is open. Choose your instrument.",
    goalText: "Rescue the mat — 250 Solara, held",
    predict: { prompt: "What could save the mat?",
      options: ["Pour minerals — feed the mat directly", "Seed a grazer — the bloom's enemy is the meadow's friend",
                "Nothing — the quick always win"],
      reflect: ["The bloom's uptake outraces the mat's, so every pour fed the bloom first — measured here: eight doses left the mat under 70 while the plankton grew fatter.",
                "The keystone bet: pressure on the winner is the only lever that opens space for the loser.",
                "They do win the water — until something eats them. Competition has more than one referee."] },
    world: { seed: 101, found: { 0: 20, 1: 120, 2: 0, 3: 0, 6: 0 }, M0: 0.5 },
    apparatus: { pours: 8, seed: "all", sources: false, walls: false, evolution: false },
    deadline: 12000, sustain: 10,
    narrate: ["estab", "extinct", "crashev", "bloom"],
    pass: S => S.pop(0) >= 250,
    failNow: S => S.pop(0) === 0 ? "The last Solara died — the meadow is gone."
      : S.pop(1) === 0 ? "The bloom is gone — exterminated, not gardened. That is not the rescue this pond needed." : "",
    timeoutWhy: "The mat never rose past 250 — the bloom held the water to the end. Minerals feed whoever " +
      "drinks fastest; only pressure on the bloom itself opens space below it.",
    meter: S => [{ label: "Solara", v: S.pop(0), goal: 250 }, { label: "Drifta", v: S.pop(1) }],
    debrief: {
      pass: "Cilio ate the bloom, and the mat took the light and mineral the bloom released — a keystone " +
        "consumer holds open the space its prey would otherwise close (Paine's classic result, in your own " +
        "pond). Now keep watching: in water this poor the gardener eats itself out of a job. When the bloom " +
        "is down, Cilio starves away — and the bloom creeps back. A keystone is a job, and jobs need wages.",
      fail: "The bloom kept the water. Feeding the loser cannot work here — the plankton's uptake outraces " +
        "the mat's, so every pour reached the bloom first. The lever that works points the other way: " +
        "seed the bloom's grazer and let pressure from above open space below.",
    },
  },
  {
    key: "richer", n: 5,
    title: "The Richer Pond", science: "Top-down structure · bottom-up inputs",
    question: "This pond is stable and full of plankton. Can you make it richer?",
    briefing: "A bloom, a mat, decomposers — and nobody eating anybody. Mineral is unlimited this time, " +
      "and the seeding bench is open. The goal is a richer pond: a meadow past 1,300 with every species " +
      "alive. Decide what this pond is actually missing.",
    goalText: "A richer pond — 1,300 Solara, everyone alive",
    predict: { prompt: "What does a pond need to become richer?",
      options: ["More input — pour mineral into the water", "A missing eater — restructure who eats whom",
                "Both — inputs and structure together"],
      reflect: ["Inputs alone sank into the bloom: thirty doses left the meadow near 900 and the water no " +
                  "richer. A pond's ceiling is set by its structure, not by its soup.",
                "The structural bet: a grazer turns standing bloom into flowing matter — and the meadow " +
                  "nearly doubles.",
                "Both works — but the experiment shows which half was necessary: pours alone failed, the " +
                  "grazer alone succeeded."] },
    world: { seed: 202, found: { 0: 120, 1: 500, 2: 0, 3: 60, 6: 0 } },
    apparatus: { pours: true, seed: "all", sources: false, walls: false, evolution: false },
    deadline: 17000, sustain: 10,
    narrate: ["estab", "crashev", "bloom", "extinct"],
    pass: S => S.pop(0) >= 1250 && S.pop(2) >= 20,
    failNow: S => S.pop(0) === 0 ? "The meadow is gone — richer was the goal, and everything died at the bottom."
      : S.pop(1) === 0 ? "The plankton is gone — grazed to nothing. A structure with a hole in it feeds no one." : "",
    timeoutWhy: "The pond stayed poor. Everything you poured sank into the standing bloom — nothing turned " +
      "it over. Richness needed an eater, not an input.",
    meter: S => [{ label: "Solara", v: S.pop(0), goal: 1250 }, { label: "Cilio", v: S.pop(2), goal: 20 },
                 { label: "Drifta", v: S.pop(1) }],
    debrief: {
      pass: "The grazer restructured the pond, and the pond got richer — the meadow near-doubled while " +
        "the bloom fell to a quarter and held. Grazing turned standing plankton into flowing matter: " +
        "eaten, excreted, recycled, and taken up again by the mat the bloom used to shade and starve. " +
        "Top-down structure set the ceiling that bottom-up pouring never touched — this pond was never " +
        "hungry, it was unfinished. And note what the crash was: not a catastrophe, but the system " +
        "finding its richer arrangement.",
      fail: "More soup did not make a richer pond. The bloom drank every pour and stood still — standing " +
        "stock is not flow, and richness lives in the flow. What this pond was missing had a mouth: seed " +
        "the grazer and let structure do what input could not.",
    },
  },
];

// __LEVELS_NOTE__ deferred arcs (L6-L12): specs in docs/phase8-ladder-design.md; each enters through the honesty gate.
