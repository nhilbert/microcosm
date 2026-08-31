// Impact fingerprint — does the ported card say the same thing as the frozen one?
//
// `impact()` is the honesty machinery: an interrupted time series that credits a lever only with
// the departure from the trend it interrupted, filtered through natural-variability floors that
// were measured rather than chosen. Every one of those thresholds is a calibration fight from
// Phase 4, so a port that gets one wrong does not crash — it quietly narrates a different world.
//
// The two implementations take their intervention log differently. The browser's is an array the
// UI keeps (`W.evLog`); the core's is `iv_log`, appended through `ivPush`, because the core cannot
// tell a player's hand from a script. Same arithmetic either way, so the cards must match.
//
//   node harness/fingerprint-impact.js
//   MC_CORE=rust/wasm/core.js node harness/fingerprint-impact.js
const path = require("path");

const ROOT = path.join(__dirname, "..");
const C = require(process.env.MC_CORE || path.join(ROOT, "dist", "core.js"));
const { W, P } = C;

const buf = Buffer.alloc(8);
const h = d => {
  if (d === null || d === undefined) return "null";
  buf.writeDoubleBE(d);
  return buf.toString("hex");
};

const ported = typeof C.ivPush === "function";

// One log, two mechanisms. The Rust core stamps the tick itself, so entries must be pushed as the
// world reaches them; the JavaScript core takes the tick in the entry.
const log = [];
function logIv(type){
  if (ported) C.ivPush(type);
  else W.evLog.push({ tick: W.tick, type });
  log.push({ tick: W.tick, type });
}

function card(i){
  return ported ? C.impact(i) : C.impact(W.evLog[i]);
}

function show(label, r){
  if (r.status !== "done"){
    console.log(`  ${label.padEnd(26)} ${r.status}${r.status === "watching" ? ` ${h(r.pct)}` : ""}`);
    return;
  }
  const movers = r.notable.map(m => `${m.name}:${h(m.pct)}${m.strong ? "!" : ""}`).join(" ") || "(none)";
  console.log(`  ${label.padEnd(26)} done press ${r.isPress ? 1 : 0} complete ${r.complete ? 1 : 0}` +
    ` mixed ${r.mixed ? 1 : 0} backdrop ${r.pressBackdrop ? 1 : 0}` +
    ` recovered ${h(r.recoveredS)}  ${movers}`);
}

// A run with several hands in it: a pulse alone, a press, a pulse under that press's backdrop, and
// two pulses close enough together that neither can claim sole credit.
P.mutation = false;
if (ported) C.ivClear(); else W.evLog.length = 0;
C.resetWorld();
C.initWorld(11);
for (let t = 0; t < 900; t++) C.step();

console.log("IMPACT FINGERPRINT — interrupted time series against the trend it interrupted");

logIv("pour");
C.applyEvent({ type: "fertilize", x: 512, y: 512, amount: 40 });
for (let t = 0; t < 40; t++) C.step();
show("pour, 40 ticks on", card(0));      // too soon: watching
for (let t = 0; t < 300; t++) C.step();
show("pour, 340 ticks on", card(0));     // enough for a verdict
for (let t = 0; t < 600; t++) C.step();
show("pour, 940 ticks on", card(0));     // the full window

logIv("sunlight");
C.applyEvent({ type: "lightMul", v: 1.4 });
for (let t = 0; t < 1200; t++) C.step();
show("a press, 1200 ticks on", card(1));

logIv("seed");
C.applyEvent({ type: "spawnPack", sp: 2, x: 512, y: 470 });
for (let t = 0; t < 60; t++) C.step();
logIv("pour");
C.applyEvent({ type: "fertilize", x: 400, y: 600, amount: 40 });
for (let t = 0; t < 900; t++) C.step();
show("seed, under a backdrop", card(2)); // press before it -> pressBackdrop
show("pour, 60 ticks after it", card(3)); // another hand in the window -> mixed

// And one so old it has rolled off the back of the ring.
for (let t = 0; t < 900 * 20 + 200; t++) C.step();
show("the first pour, much later", card(0));

console.log(`  entries ${log.length}: ${log.map(e => `${e.type}@${e.tick}`).join(" ")}`);
P.mutation = true;
