// Level-API fingerprint — the whole surface, not only the verdict.
//
// `harness/levels.js` already proves the verdicts agree across cores, and that is the load-bearing
// claim. But the level API is more than `levelCheck`: the apparatus gates decide which tools a
// player is handed, the pour budget decides how many doses they carry, `levelNarration` picks the
// Observatory's word for the HUD, and the meter rows are what they read while deciding. None of
// that is exercised by the honesty gate, because none of it is exercised headlessly. So this walks
// every level, drives it a little way, and prints the whole surface as text — cheap enough to run
// in `port:check`, specific enough that a divergence names the call.
//
//   node harness/fingerprint-levels.js [ticks per level]
const path = require("path");
const CORE = process.env.MC_CORE || path.join(__dirname, "..", "dist", "core.js");
const C = require(CORE);
const { W, P, LEVELS } = C;

const TICKS = parseInt(process.argv[2] || "1200", 10);
const APPARATUS = ["pours", "seed", "sources", "walls", "evolution"];
const buf = Buffer.alloc(8);
const h = d => { buf.writeDoubleBE(d); return buf.toString("hex"); };
const meterLine = () => C.levelMeter()
  .map(m => `${m.label}=${h(m.v)}${m.goal === undefined ? "" : `/${h(m.goal)}`}${m.dir === undefined ? "" : `d${m.dir}`}${m.unit || ""}`)
  .join(" ") || "(none)";

console.log(`levels: ${LEVELS.length} — ${LEVELS.map(L => L.key).join(", ")}`);
console.log(`outside a level: allows ${APPARATUS.map(a => `${a}=${C.levelAllows(a)}`).join(" ")}` +
  ` pourOk=${C.levelPourOk()} narration=${C.levelNarration()} state=${C.levelCheck()}`);

for (const def of LEVELS) {
  C.levelStart(def, 1);
  console.log(`\nL${def.n} ${def.key}  seed ${def.world.seed} deadline ${def.deadline} sustain ${def.sustain}`);
  console.log(`  founded: pops ${pops().join(",")}  M ${h(auditM())}  predicted ${C.LVL.predicted}`);
  console.log(`  allows ${APPARATUS.map(a => `${a}=${C.levelAllows(a)}`).join(" ")} pourLeft ${C.LVL.pourLeft}` +
    ` src ${[0, 1].map(k => `${k}=${C.levelAllowsSource(k)}`).join(" ")}`);
  // the pour budget, spent the way the UI spends it
  let spent = 0;
  while (C.levelPourOk() && spent < 12 && C.LVL.pourLeft !== Infinity) { C.levelNotePour(1); spent++; }
  console.log(`  pours spent ${spent} -> pourLeft ${C.LVL.pourLeft} pourOk ${C.levelPourOk()}`);

  for (let t = 0; t < TICKS; t++) {
    C.levelScript(); // F4/F5: the per-tick hook every driver shares
    C.step();
    if (C.levelCheck() !== "running") break;
  }
  const ev = C.levelNarration();
  console.log(`  t ${W.tick} state ${C.levelCheck()} run ${C.LVL.run} seenS ${C.LVL.seenS}` +
    ` sources ${W.sources.length} src ${[0, 1].map(k => `${k}=${C.levelAllowsSource(k)}`).join(" ")}`);
  console.log(`  meter ${meterLine()}`);
  console.log(`  narration ${ev ? `${ev.type}@${ev.tick} sp${ev.sp} ${ev.text}` : "(none)"}`);
  console.log(`  failWhy ${JSON.stringify(C.LVL.failWhy)}`);

  // restart re-founds the same world and forgets the run
  C.levelRestart();
  console.log(`  after restart: t ${W.tick} state ${C.LVL.state} pops ${pops().join(",")} M ${h(auditM())}` +
    ` pourLeft ${C.LVL.pourLeft} predicted ${C.LVL.predicted} failWhy ${JSON.stringify(C.LVL.failWhy)}`);
}

C.levelStop();
console.log(`\nafter stop: def ${C.LVL.def} state ${C.LVL.state}` +
  ` allows ${APPARATUS.map(a => `${a}=${C.levelAllows(a)}`).join(" ")} pourOk ${C.levelPourOk()}` +
  ` narration ${C.levelNarration()} meter ${meterLine()}`);
P.mutation = true;

function pops(){
  const p = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < W.n; i++) if (W.alive[i]) p[W.sp[i]]++;
  return p;
}
function auditM(){
  let t = 0;
  for (let c = 0; c < W.M.length; c++) t += W.M[c] + W.dM[c];
  for (let i = 0; i < W.n; i++) if (W.alive[i]) t += W.mn[i];
  for (let k = 0; k < W.cN; k++) if (W.cAlive[k]) t += W.cM[k];
  return t;
}
