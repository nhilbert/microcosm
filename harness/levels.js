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

const CASES = [
  ["light",   "null: wait under the dim sun",        null,                                             "failed"],
  ["light",   "strategy: raise the lever at t=2000", { 2000: () => C.applyEvent({ type: "lightMul", v: 1.2 }) }, "passed"],
  ["light",   "wrong: pour mineral, keep it dim",    dimPours,                                         "failed"],
  ["mineral", "null: watch the mat stall",           null,                                             "failed"],
  ["mineral", "strategy: ten pours on the mat",      nearPours,                                        "passed"],
  ["mineral", "wrong: ten pours at the dark shore",  farPours,                                         "failed"],
  ["cycle",   "null: let the mud keep it all",       null,                                             "failed"],
  ["cycle",   "strategy: seed Bacillus at t=6000",   { 6000: () => C.applyEvent({ type: "spawnPack", sp: 3, x: 512, y: 470 }) }, "passed"],
  ["cycle",   "strategy: seed Bacillus early (t=1000)", { 1000: () => C.applyEvent({ type: "spawnPack", sp: 3, x: 512, y: 470 }) }, "passed"],
];

let ok = true;
for (const [key, label, actions, expect] of CASES){
  const def = by(key);
  const r = drive(def, actions);
  const good = r.state === expect;
  if (!good) ok = false;
  console.log(`  ${good ? "PASS" : "FAIL"}  L${def.n} ${key.padEnd(8)} ${label.padEnd(40)} -> ${r.state} at t=${r.t} (expected ${expect})`);
}
C.levelStop(); P.mutation = true;
console.log(ok ? "LEVELS GATE: ALL PASS — every level fails untouched and passes on its lesson"
               : "LEVELS GATE: FAIL — a level is not the challenge it claims to be");
if (!ok) process.exit(1);
