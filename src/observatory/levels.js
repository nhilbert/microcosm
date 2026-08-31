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
      const why = def.failNow ? def.failNow(S, L.mem) : "";
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
      reflect: ["Patience can't fix this pond. Below a certain light the mat loses energy at every size — waiting only makes it smaller.",
                "That's what the energy bars showed. Under this sun, every Solara burns more than it earns.",
                "The water never got to matter. The energy ran out first — light is the income here."] },
    world: { seed: 101, found: SOLO_MAT, lightMul: 0.5 },
    apparatus: { pours: true, seed: false, sources: false, walls: false, evolution: false },
    deadline: 8000, sustain: 10,
    pass: S => S.pop(0) >= 400,
    failNow: S => S.pop(0) === 0 ? "The last Solara died — the mat never caught the light." : "",
    timeoutWhy: "The mat never took hold. Under this sun, every Solara spends more than it earns — at any number.",
    meter: S => [{ label: "Solara", v: S.pop(0), goal: 400 }],
    debrief: {
      pass: "Light is the pond's only income. Under a dim sun the mat spends more than it earns, so it " +
        "shrinks at any size. With enough light it grows fast, then flattens — the mat shades itself and " +
        "runs out of ground. That ceiling is the carrying capacity: not a quota, just income meeting cost.",
      fail: "The mat needed more income, and only light is income here. Tap a Solara and watch its card: " +
        "the energy bar never fills. The ☀ lever raises what the whole pond earns — everything else just " +
        "moves it around.",
    },
  },
  {
    key: "mineral", n: 2,
    title: "The Hungry Water", science: "Liebig's law of the minimum",
    question: "The sun is already at its fiercest — why does the mat stall anyway?",
    briefing: "The ☀ lever starts pinned at its maximum — but the water is poor. The mat rises, then " +
      "stalls; more light has nothing left to give. You carry ten doses of mineral: tap open water to " +
      "pour one, and choose the spot with care.",
    goalText: "Grow the mat past 600 on ten pours",
    predict: { prompt: "The sun is maxed out. What will ten doses of mineral do?",
      options: ["Placement won't matter — mixing spreads them anyway", "They only help where the mat drinks first",
                "Nothing — light must still be the problem"],
      reflect: ["Mixing does spread them — but far too slowly. Doses poured at the dark shore arrived late, and the clock ran out.",
                "Right: mineral moves slowly, and the mat drinks what lands beside it.",
                "The lever was pinned at its ceiling the whole time. The scarcest ingredient ruled, and it was not light."] },
    world: { seed: 202, found: SOLO_MAT, M0: 0.4, lightMul: 1.6 },
    apparatus: { pours: 10, seed: false, sources: false, walls: false, evolution: false },
    deadline: 9000, sustain: 10,
    pass: S => S.pop(0) >= 600,
    failNow: S => S.pop(0) === 0 ? "The mat has died out." : "",
    timeoutWhy: "The mat stalled below 600. Light was maxed out the whole time — the scarcest ingredient set the ceiling.",
    meter: S => [{ label: "Solara", v: S.pop(0), goal: 600 }],
    debrief: {
      pass: "The scarcest ingredient sets the ceiling — not the most generous one. The sun had nothing more " +
        "to give; mineral was the limit. And it only helped where the mat could drink it before the slow " +
        "mixing thinned it out. Check the M bar: everything you poured is still somewhere. In bodies, in " +
        "the water, or in the dead — matter never leaves, it only moves.",
      fail: "The cards told the story: Mineral-limited, under a maxed-out sun. Pours at the dark edge " +
        "mostly feed empty water — mixing is slow. Pour early, and pour where the mat lives.",
    },
  },
  {
    key: "cycle", n: 3,
    title: "Everything Flows", science: "Decomposition · the mineral cycle",
    question: "The mat is thriving — so why is the water emptying?",
    briefing: "The same pond as your first experiment, under a full sun. The mat booms — and still the " +
      "free mineral drains away. Everything that dies takes its mineral into the mud, and nothing brings " +
      "it back. Long-press open water to seed a species, and choose well.",
    goalText: "Unlock the mud — recyclers in, mat 1,000",
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
      pass: "Bacillus eats the dead and returns their mineral to the water. Creatures with this job are " +
        "called decomposers — they close the loop. The same matter now goes around instead of piling up " +
        "in the mud. That is this world's deepest rule: matter moves in a loop, energy flows through " +
        "like a river. A pond without its recyclers slowly chokes on its own dead.",
      fail: "Only a decomposer returns locked mineral to the water. Grazers and hunters just move matter " +
        "between bodies — and everything they kill locks more of it in the mud. Seed Bacillus near the " +
        "mat, where the dead are.",
    },
  },
  {
    key: "garden", n: 4,
    title: "The Gardener", science: "Competitive exclusion · keystone grazing",
    question: "The water is poor and the bloom owns it. Can the meadow be saved?",
    briefing: "Poor water, and the quick plankton owns it: Drifta drinks faster, and the meadow starves " +
      "under a bright sun. You carry eight doses of mineral, and the seeding bench is open. Choose your " +
      "instrument.",
    goalText: "Rescue the mat — 250 Solara, held",
    predict: { prompt: "What could save the mat?",
      options: ["Pour minerals — feed the mat directly", "Seed a grazer — the bloom's enemy, the meadow's friend",
                "Nothing — the quick always win"],
      reflect: ["The bloom drinks faster than the mat, so your pours fed the bloom first. Eight doses: the mat stayed under 70.",
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
      pass: "Cilio ate the bloom, and the mat took the light and mineral it freed. One eater held the " +
        "door open for a whole meadow — that is called a keystone. Now keep watching. In water this " +
        "poor, the gardener eats itself out of a job: Cilio starves, and the bloom creeps back. A " +
        "keystone is a job, and jobs need wages.",
      fail: "The bloom kept the water. Feeding the loser can't work here — the plankton drinks faster, " +
        "so every pour fed the bloom first. Try the other direction: seed the bloom's grazer, and let " +
        "pressure from above open space below.",
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
      reflect: ["Thirty doses sank into the bloom, and the meadow stayed near 900. A pond's ceiling is " +
                  "set by its structure, not by its soup.",
                "The structural bet: give the pond an eater, and the meadow nearly doubles.",
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
      pass: "You added an eater, and the whole pond got richer. The meadow nearly doubled; the bloom " +
        "fell to a quarter — and held. Here is why: grazing keeps mineral moving. Eaten, returned to " +
        "the water, taken up again. All your pouring couldn't do that. This pond was never hungry. " +
        "It was unfinished.",
      fail: "More soup did not make a richer pond. The bloom drank every pour and just stood there. " +
        "What this pond is missing has a mouth: seed the grazer, and watch what an eater does that " +
        "pouring can't.",
    },
  },
  {
    key: "hunters", n: 6,
    title: "A Head Full of Hunters", science: "Energy pyramid · apex predators",
    question: "The pond is rich. How many hunters can it feed?",
    briefing: "A full pond: meadow, bloom, grazers, recyclers — and no hunter yet. Venator waits on " +
      "your seeding bench. Found a pack that lasts.",
    goalText: "A lasting pack — 4+ hunters, held long",
    predict: { prompt: "You're adding a top hunter. How many packs would you release?",
      options: ["Two packs — twice as safe", "One pack — all this pond can spare",
                "None can live here at all"],
      reflect: ["Twice the hunters meant twice the hunger. Packs released into the same water strip it " +
                  "together — and starve together.",
                "Right. Hunters live on what the pond can spare, and even a rich pond spares little.",
                "A pack can live here. But only a small one, fed by the whole pond below it."] },
    world: { seed: 101, found: { 0: 120, 1: 500, 2: 12, 3: 60, 6: 0 } },
    apparatus: { pours: true, seed: "all", sources: false, walls: false, evolution: false },
    deadline: 15000, sustain: 350, // V >= 4 held for 7,000 ticks: the doomed double-pack's best stretch is 5,400
    narrate: ["wake", "estab", "extinct", "crashev"],
    pass: S => S.pop(6) >= 4,
    failNow: (S, M) => {
      if (S.pop(6) > 0) M.v = 1;
      if (M.v && S.pop(6) === 0) return "The pack is gone. It ate through what the pond could spare — " +
        "the top of a pond is a narrow ledge.";
      if (S.pop(2) === 0) return "The grazers are gone. Nothing now stands between the hunters and starving.";
      return "";
    },
    timeoutWhy: "No lasting pack took hold. A hunter eats a lot and breeds slowly — seed early, and seed small.",
    meter: S => [{ label: "Venator", v: S.pop(6), goal: 4 }, { label: "Cilio", v: S.pop(2) }],
    debrief: {
      pass: "Your pack holds — a few hunters riding a wave of grazers, riding a wave of plankton. " +
        "Count the layers: hundreds of plankton feed a hundred grazers feed a handful of hunters. " +
        "Every meal loses most of its energy on the way up. That is the food chain's price, and why " +
        "the top is always small — and always one bad season from gone.",
      fail: "Hunters don't run out of courage — they run out of prey. The pond only makes so many " +
        "grazers, and every extra mouth shrinks each hunter's share. Try one pack, seeded early, and " +
        "give it room.",
    },
  },
];

// __LEVELS_NOTE__ deferred arcs (L7-L12): specs in docs/phase8-ladder-design.md; each enters through the honesty gate.
