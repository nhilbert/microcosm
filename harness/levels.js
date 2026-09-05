// Phase 8 levels gate: a level is a challenge, not a demonstration.
// For every shipped level this proves, on the level's own seed and clock:
//   null      no player action           -> must FAIL
//   strategy  the taught move            -> must PASS
//   wrong     a plausible wrong move     -> must FAIL (the lever that does not address the limit)
// Any mismatch exits non-zero. Calibration tables: docs/phase8-levels-plan.md.
const path = require("path");
const C = require(process.env.MC_CORE || path.join(__dirname, "..", "dist", "core.js"));
const { W, P, LEVELS } = C;

function drive(def, actions){
  C.levelStart(def);
  while (W.tick < def.deadline + 40 && C.levelCheck() === "running"){
    const t = W.tick + 1;
    C.levelScript(); // F4/F5: the level's own per-tick hook — scripted events + region census
    if (actions && actions[t]) actions[t]();
    C.step();
  }
  return { state: C.levelCheck(), t: W.tick };
}
const by = k => LEVELS.find(l => l.key === k);
const pour = (x, y) => () => C.applyEvent({ type: "fertilize", x, y, amount: 40 });
const nearPours = {}, farPours = {};
for (let k = 0; k < 10; k++){ const t = 600 + k * 300;
  nearPours[t] = pour(512 + ((k % 3) - 1) * 70, 512 + (((k / 3) | 0) % 3 - 1) * 70);
  farPours[t]  = pour(30 + k * 90, 990);
}
const dimPours = {}; for (let k = 0; k < 10; k++) dimPours[600 + k * 300] = nearPours[600 + k * 300];
const matPours = {}; for (let k = 0; k < 8; k++) matPours[800 + k * 400] = pour(512 + ((k % 3) - 1) * 80, 512 + (((k / 3) | 0) % 3 - 1) * 80);
const soup3 = {}; for (let k = 0; k < 30; k++)
  soup3[1000 + k * 300] = pour(512 + ((k % 3) - 1) * 60, 512 + (((k / 3) | 0) % 3 - 1) * 60);
const graze = t => ({ [t]: () => C.applyEvent({ type: "spawnPack", sp: 2, x: 512, y: 480 }) });
const grazeL5 = { 3000: () => C.applyEvent({ type: "spawnPack", sp: 2, x: 512, y: 470 }) };
const grazeL5x3 = { 3000: () => { for (const [x, y] of [[470, 512], [554, 512], [512, 470]])
  C.applyEvent({ type: "spawnPack", sp: 2, x, y }); } };
const soupOnly = {}; for (let k = 0; k < 30; k++)
  soupOnly[3000 + k * 150] = pour(512 + ((k % 3) - 1) * 60, 512 + (((k / 3) | 0) % 3 - 1) * 60);
const vpack = t => ({ [t]: () => C.applyEvent({ type: "spawnPack", sp: 6, x: 512, y: 512 }) });
const vtwo = t => ({ [t]: () => { C.applyEvent({ type: "spawnPack", sp: 6, x: 490, y: 512 });
                                  C.applyEvent({ type: "spawnPack", sp: 6, x: 534, y: 512 }); } });

// L7: the new sun rises at (0,0) by script; settlers are carried there or nothing is
const settle = (t, both) => ({ [t]: () => {
  if (both !== "driftaOnly") C.applyEvent({ type: "spawnPack", sp: 0, x: 0, y: 0 });
  if (both !== "solaraOnly") C.applyEvent({ type: "spawnPack", sp: 1, x: 0, y: 0 });
} });
const farSoup = {}; for (let k = 0; k < 10; k++)
  farSoup[3000 + k * 300] = pour((k % 3 - 1) * 60, (((k / 3) | 0) % 2) * 60);

// L9: the lever is the armor price (Evolution panel); the wrong levers are the mutation
// switch, harder grazing (this pond's crash-grazing pays SPEED — measured, see the record),
// and husbandry
const cheapArmor = t => ({ [t]: () => C.applyEvent({ type: "locus", sp: 1, locus: 0, key: "kpSlope", v: 0.2 }) });
const packs9 = t => ({ [t]: () => { C.applyEvent({ type: "spawnPack", sp: 2, x: 470, y: 512 });
                                    C.applyEvent({ type: "spawnPack", sp: 2, x: 554, y: 512 }); } });
const mutOff9 = { 500: () => C.applyEvent({ type: "mutation", v: false }), ...cheapArmor(1000) };
const feedHi9 = {}; // keep the 10 toughest Drifta fed by hand, every 200 ticks — must NOT fake a sweep
for (let t = 200; t < 18000; t += 200) feedHi9[t] = () => {
  const tough = [];
  for (let i = 0; i < W.n; i++) if (W.alive[i] && W.sp[i] === 1) tough.push([W.g[i], i]);
  tough.sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < Math.min(10, tough.length); k++){
    const i = tough[k][1];
    C.applyEvent({ type: "feed", i, gen: W.gen[i], frac: 0.5 });
  }
};

// L8: feed every Venator on a cadence — the dose is the lesson (light bridges, hard strips)
const feed8 = (every, frac) => { const o = {};
  for (let t = 3300; t < 16000; t += every) o[t] = () => {
    for (let i = 0; i < W.n; i++) if (W.alive[i] && W.sp[i] === 6)
      C.applyEvent({ type: "feed", i, gen: W.gen[i], frac });
  };
  return o;
};
const cold8 = { 3100: () => C.applyEvent({ type: "sourceAdd", x: 63, y: 512, i: 0, a: -8, sigma: 210 }) };
const pours8 = {}; for (let k = 0; k < 20; k++)
  pours8[3200 + k * 500] = pour(512 + (k % 3 - 1) * 60, 512 + (((k / 3) | 0) % 3 - 1) * 60);

// L11: close the pen's fourth side, with or without clearing the grazers inside first
const MESHW = { lt: 0.9, ht: 0.9, fl: 0.7, pass: 11 };
const pen11 = (t, clear) => ({ [t]: () => {
  if (clear) for (let i = 0; i < W.n; i++)
    if (W.alive[i] && W.sp[i] === 2 && W.x[i] > 352 && W.x[i] < 480 && W.y[i] > 544 && W.y[i] < 672)
      C.applyEvent({ type: "kill", i, gen: W.gen[i] });
  C.applyEvent({ type: "wallAdd", x0: 352, y0: 672, dx: 0, dy: -128, ...MESHW });
} });
// L12: the mutation-rate lever on Cilio's warmth preference (locus 2), the legal 0.12 ceiling
const sig12 = t => ({ [t]: () => C.applyEvent({ type: "locus", sp: 2, locus: 2, key: "sigma", v: 0.12 }) });

const CASES = [
  // L1 (2026-09-05): the taught move is proved through BOTH levers the product offers — the
  // browser's ☀ slider (lightMul) and the app's sun sheet (source 0's light, capped at 1.5 by
  // the core, so 0.5 x 1.5 = 0.75 of the founded sun). Until this date the gate knew only the
  // lightMul event, which no app control emits, while apparatus.sources:false hid the app's
  // sun sheet inside the level: the level was unwinnable in the product and the gate green.
  // Measured on the level machinery: light 1.5 at t<=5,000 passes (t=2,000 -> ~5,100;
  // t=5,000 -> 7,120), at t=6,000 fails at 395; 1.3 at t=2,000 fails at 386. The sun sheet's
  // other sliders are wrong levers: warmth +8 kills the mat by t=4,720, spread 300 ends at 42.
  ["light",   "null: wait under the dim sun",        null,                                             "failed"],
  ["light",   "strategy: browser lever, lightMul 1.2 at t=2000", { 2000: () => C.applyEvent({ type: "lightMul", v: 1.2 }) }, "passed"],
  ["light",   "strategy: app lever, the sun's light to 1.5 at t=2000", { 2000: () => C.applyEvent({ type: "sourceSet", k: 0, i: 1.5 }) }, "passed"],
  ["light",   "wrong: pour mineral, keep it dim",    dimPours,                                         "failed"],
  ["light",   "wrong: warm the sun instead of brightening it", { 2000: () => C.applyEvent({ type: "sourceSet", k: 0, a: 8 }) }, "failed"],
  ["mineral", "null: watch the mat stall",           null,                                             "failed"],
  ["mineral", "strategy: ten pours on the mat",      nearPours,                                        "passed"],
  ["mineral", "wrong: ten pours at the dark shore",  farPours,                                         "failed"],
  ["cycle",   "null: let the mud keep it all",       null,                                             "failed"],
  ["cycle",   "strategy: seed Bacillus at t=6000",   { 6000: () => C.applyEvent({ type: "spawnPack", sp: 3, x: 512, y: 470 }) }, "passed"],
  ["cycle",   "strategy: seed Bacillus early (t=1000)", { 1000: () => C.applyEvent({ type: "spawnPack", sp: 3, x: 512, y: 470 }) }, "passed"],
  // The wrong levers L3 lacked until 2026-09-05: an eater that is not a decomposer only moves
  // matter between bodies, and soup feeds the water, not the mud. Both fail at the deadline on
  // both cores (measured on the level machinery, as the standing rule requires).
  ["cycle",   "wrong: seed the grazer instead (t=6000)", { 6000: () => C.applyEvent({ type: "spawnPack", sp: 2, x: 512, y: 470 }) }, "failed"],
  ["cycle",   "wrong: thirty pours, nobody eats the dead", soup3,                                          "failed"],
  ["garden",  "null: let the bloom keep the water",  null,       "failed"],
  ["garden",  "strategy: seed the grazer at t=4000", graze(4000), "passed"],
  ["garden",  "strategy: a late grazer (t=7000)",    graze(7000), "passed"],
  ["garden",  "wrong: eight pours on the mat",       matPours,   "failed"],
  ["richer",  "null: a stable pond stays a poor pond", null,      "failed"],
  ["richer",  "strategy: seed the missing grazer (t=3000)", grazeL5, "passed"],
  ["richer",  "robustness: three packs at once",     grazeL5x3,  "passed"],
  ["richer",  "wrong: thirty pours, no grazer",      soupOnly,   "failed"],
  ["hunters", "null: a pond with no top",            null,        "failed"],
  ["hunters", "strategy: one pack at t=4000",        vpack(4000), "passed"],
  ["hunters", "strategy: one pack early (t=2000)",   vpack(2000), "passed"],
  ["hunters", "wrong: two packs at once (t=4000)",   vtwo(4000),  "failed"],
  ["outpost", "null: watch the new sun shine on nothing", null,            "failed"],
  ["outpost", "strategy: carry mat+plankton (t=3000)",  settle(3000),      "passed"],
  ["outpost", "strategy: a late expedition (t=9000)",   settle(9000),      "passed"],
  ["outpost", "wrong: ten pours under the new sun",     farSoup,           "failed"],
  ["outpost", "wrong: plankton alone (t=3000)",         settle(3000, "driftaOnly"), "failed"],
  ["sorting", "null: the balance holds at full price",   null,             "failed"],
  ["sorting", "strategy: cheap armor at t=1000",         cheapArmor(1000), "passed"],
  ["sorting", "strategy: cheap armor late (t=3000)",     cheapArmor(3000), "passed"],
  ["sorting", "wrong: mutation off, same cheap armor",   mutOff9,          "failed"],
  // The pack-pressure and husbandry cases are NOT pinned: on the level machinery's streams both
  // produced tough sweeps of their own (packs @14,920; feeding the toughest @6,300 — differential
  // feeding IS artificial selection, not a fake). Recalibration in the record; the honest wrong
  // lever is the mutation switch. packs9/feedHi9 stay for the next measurement round.
  // L8: the warm year — light feeding bridges the top; heavy feeding turns help into teeth
  ["warmyear", "null: the press bills the top first",     null,           "failed"],
  ["warmyear", "strategy: feed the hunters lightly",      feed8(900, 0.2), "passed"],
  ["warmyear", "wrong: feed the hunters hard",            feed8(300, 0.3), "failed"],
  ["warmyear", "wrong: a cold pocket, nothing else",      cold8,          "failed"],
  ["warmyear", "wrong: pours (mineral pays no heat bill)", pours8,        "failed"],
  // L11: the pen — the shepherd clears it before closing; closed dirty it farms the plankton
  ["refuge",  "null: never close the pen",              null,             "failed"],
  ["refuge",  "strategy: clear, then close (t=3000)",   pen11(3000, true),  "passed"],
  ["refuge",  "strategy: clear and close late (t=8000)", pen11(8000, true), "passed"],
  ["refuge",  "wrong: close without clearing",          pen11(3000, false), "failed"],
  // L12: the capstone — variation before the crisis, or not at all
  ["outrun",  "null: shipped mutation, hot sun wins",   null,          "failed"],
  ["outrun",  "strategy: raise Cilio warmth sigma early (t=500)", sig12(500), "passed"],
  ["outrun",  "strategy: sigma up just before the heat (t=2500)", sig12(2500), "passed"],
  ["outrun",  "wrong: sigma up after the trap fires (t=4300)",    sig12(4300), "failed"],
];
void packs9; void feedHi9;

let ok = true;
// Every shipped level needs all three kinds of case, or it is not gated: a level with no wrong
// lever is a demonstration. This check exists because L3 shipped without one (review 2026-09-05).
for (const def of LEVELS){
  const kinds = new Set(CASES.filter(c => c[0] === def.key).map(c => c[1].split(":")[0]));
  for (const k of ["null", "strategy", "wrong"]) if (!kinds.has(k)){
    ok = false; console.log(`  FAIL  L${def.n} ${def.key.padEnd(8)} has no "${k}" case in this gate`);
  }
}
for (const [key, label, actions, expect] of CASES){
  const def = by(key);
  const r = drive(def, actions);
  const good = r.state === expect;
  if (!good) ok = false;
  console.log(`  ${good ? "PASS" : "FAIL"}  L${def.n} ${key.padEnd(8)} ${label.padEnd(40)} -> ${r.state} at t=${r.t} (expected ${expect})`);
}
// L7's apparatus lock: the founded sun must be untouchable, the risen one editable —
// there must be no unlockable home-sun edit in the apparatus (ladder design, L7 case 4).
{
  const def = by("outpost");
  C.levelStart(def);
  while (W.tick < 2100){ C.levelScript(); C.step(); }
  const checks = [
    ["script raised the second sun", W.sources.length === 2],
    ["home sun locked", C.levelAllowsSource(0) === false],
    ["risen sun editable", C.levelAllowsSource(1) === true],
    ["sun card reachable", C.levelAllows("sources") === true],
  ];
  for (const [label, good] of checks){
    if (!good) ok = false;
    console.log(`  ${good ? "PASS" : "FAIL"}  L7 outpost  lock: ${label}`);
  }
}

C.levelStop(); P.mutation = true;
console.log(ok ? "LEVELS GATE: ALL PASS — every level fails untouched and passes on its lesson"
               : "LEVELS GATE: FAIL — a level is not the challenge it claims to be");
if (!ok) process.exit(1);
