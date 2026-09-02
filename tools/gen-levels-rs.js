// Generate rust/microcosm-core/src/levels_gen.rs from the BUILT JS core.
//
// The level table is data on purpose — predicates included — precisely so that one definition can
// drive three consumers: the JS evaluator in src/observatory/levels.js, the Rust runtime in
// rust/microcosm-core/src/levels.rs, and any app shell that wants the player text. This reads
// dist/core.js rather than the JSON file so that what lands in Rust is what the built core
// actually carries.
//
// Generated and committed, like dist/: never hand-edit levels_gen.rs; re-run this instead.
//   node tools/gen-levels-rs.js
const fs = require("fs");
const path = require("path");

const C = require(path.join(__dirname, "..", "dist", "core.js"));
const ROWS = C.LEVEL_ROWS;

// Shortest round-trip decimal; Rust's f64 parser is correctly rounded, so this is exact.
function f(v, what) {
  if (typeof v !== "number" || !isFinite(v)) throw new Error(`non-finite/non-number ${what}: ${v}`);
  if (Object.is(v, -0)) return "-0.0";
  let s = JSON.stringify(v);
  if (/^-?\d+$/.test(s)) s += ".0";
  return s;
}
const b = v => (v ? "true" : "false");
const s = v => JSON.stringify(String(v)); // JSON string escapes are a subset of Rust's

const OPS = { ">=": "Ge", "<=": "Le", ">": "Gt", "<": "Lt", "==": "Eq" };

function metric(c, what) {
  if (c.m === "lockShare") return "Metric::LockShare";
  if (c.m === "free") return "Metric::Free";
  if (c.m === "pop") {
    if (!Number.isInteger(c.sp) || c.sp < 0 || c.sp > 6) throw new Error(`bad species in ${what}: ${c.sp}`);
    return `Metric::Pop(${c.sp})`;
  }
  if (c.m === "near") { // F5: region census — species sp within radius r of source src
    if (!Number.isInteger(c.sp) || c.sp < 0 || c.sp > 6) throw new Error(`bad species in ${what}: ${c.sp}`);
    if (!Number.isInteger(c.src) || c.src < 0) throw new Error(`bad source index in ${what}: ${c.src}`);
    return `Metric::Near { sp: ${c.sp}, src: ${c.src}, r: ${f(c.r, what + ".r")} }`;
  }
  if (c.m === "at") { // L11: the census around a fixed point (a marked site)
    if (!Number.isInteger(c.sp) || c.sp < 0 || c.sp > 6) throw new Error(`bad species in ${what}: ${c.sp}`);
    return `Metric::At { sp: ${c.sp}, x: ${f(c.x, what + ".x")}, y: ${f(c.y, what + ".y")}, r: ${f(c.r, what + ".r")} }`;
  }
  if (c.m === "share") { // L9: locus-plane share beyond g0±0.05, side 1 = hi / -1 = lo
    if (!Number.isInteger(c.sp) || c.sp < 0 || c.sp > 6) throw new Error(`bad species in ${what}: ${c.sp}`);
    if (!Number.isInteger(c.plane) || c.plane < 0 || c.plane > 3) throw new Error(`bad plane in ${what}: ${c.plane}`);
    if (c.side !== 1 && c.side !== -1) throw new Error(`bad side in ${what}: ${c.side}`);
    return `Metric::Share { sp: ${c.sp}, plane: ${c.plane}, side: ${c.side} }`;
  }
  if (c.m === "ch") { // a raw recorder channel
    if (!Number.isInteger(c.c) || c.c < 0 || c.c > 140) throw new Error(`bad channel in ${what}: ${c.c}`);
    return `Metric::Ch(${c.c})`;
  }
  throw new Error(`unknown metric in ${what}: ${JSON.stringify(c.m)}`);
}

// F4: a level's timeline entry. Only event types a shipped level actually uses are legal here —
// extending the set means extending ScriptEvent in levels.rs first.
function scriptStep(e, what) {
  if (!Number.isInteger(e.t) || e.t < 0) throw new Error(`${what}: bad script tick ${e.t}`);
  const ev = e.event;
  const opt = k => ev[k] === undefined ? "None" : `Some(${f(ev[k], `${what}.${k}`)})`;
  if (ev.type === "sourceAdd") {
    return `ScriptStep { t: ${e.t}, event: ScriptEvent::SourceAdd { x: ${f(ev.x, what + ".x")}, ` +
      `y: ${f(ev.y, what + ".y")}, i: ${opt("i")}, a: ${opt("a")}, sigma: ${opt("sigma")} } }`;
  }
  if (ev.type === "sourceSet") {
    if (!Number.isInteger(ev.k) || ev.k < 0) throw new Error(`${what}: bad source index ${ev.k}`);
    return `ScriptStep { t: ${e.t}, event: ScriptEvent::SourceSet { k: ${ev.k}, ` +
      `i: ${opt("i")}, a: ${opt("a")}, sigma: ${opt("sigma")} } }`;
  }
  if (ev.type === "wallAdd") { // L11: scripted pen sides — every field explicit, no defaults
    for (const k of ["x0", "y0", "dx", "dy", "lt", "ht", "fl"]) f(ev[k], `${what}.${k}`);
    if (!Number.isInteger(ev.pass)) throw new Error(`${what}: bad wall pass mask ${ev.pass}`);
    return `ScriptStep { t: ${e.t}, event: ScriptEvent::WallAdd { x0: ${f(ev.x0, what)}, y0: ${f(ev.y0, what)}, ` +
      `dx: ${f(ev.dx, what)}, dy: ${f(ev.dy, what)}, lt: ${f(ev.lt, what)}, ht: ${f(ev.ht, what)}, ` +
      `fl: ${f(ev.fl, what)}, pass: ${ev.pass} } }`;
  }
  if (ev.type === "spawnPack") { // L10: the timeline founds a colony
    if (!Number.isInteger(ev.sp) || ev.sp < 0 || ev.sp > 6) throw new Error(`${what}: bad species ${ev.sp}`);
    return `ScriptStep { t: ${e.t}, event: ScriptEvent::SpawnPack { sp: ${ev.sp}, ` +
      `x: ${f(ev.x, what + ".x")}, y: ${f(ev.y, what + ".y")} } }`;
  }
  throw new Error(`${what}: unknown script event ${JSON.stringify(ev.type)}`);
}

// Latch ids are strings in the table (readable) and slots in Rust (no allocation at check time).
function condList(list, latchIds, what) {
  return "&[" + list.map(c => {
    if (c.latched !== undefined) {
      const k = latchIds.indexOf(c.latched);
      if (k < 0) throw new Error(`${what}: condition reads latch "${c.latched}", which the level does not declare`);
      return `Cond::Latched(${k})`;
    }
    if (!OPS[c.op]) throw new Error(`${what}: unknown operator ${JSON.stringify(c.op)}`);
    return `Cond::Cmp(${metric(c, what)}, Op::${OPS[c.op]}, ${f(c.v, what + ".v")})`;
  }).join(", ") + "]";
}

const MAX_LATCH = 4; // mirrors levels.rs; the mem array is fixed-size so a run allocates nothing

const out = [];
out.push("// GENERATED by tools/gen-levels-rs.js from the built dist/core.js -- DO NOT EDIT.");
out.push("//");
out.push("// The level table of src/observatory/levels.json, in two forms: the verbatim JSON (which");
out.push("// carries the player text an app shell needs) and the typed table the runtime in levels.rs");
out.push("// walks. CI re-runs the generator and fails on a diff, so the two cores cannot drift.");
out.push("#![allow(clippy::all)]");
out.push("");
out.push("use crate::levels::{Cond, FailRule, Latch, LevelDef, MeterRow, Metric, Op, ScriptEvent, ScriptStep, SourcesGate};");
out.push("");
out.push("/// The level definitions exactly as `src/observatory/levels.json` carries them.");
out.push("pub const LEVELS_JSON: &str = r##\"" + JSON.stringify(ROWS) + "\"##;");
out.push("");
out.push("pub static LEVELS: &[LevelDef] = &[");

for (const L of ROWS) {
  const what = `L${L.n} ${L.key}`;
  const latchIds = (L.latch || []).map(x => x.id);
  if (latchIds.length > MAX_LATCH) throw new Error(`${what}: ${latchIds.length} latches, max ${MAX_LATCH}`);
  if (new Set(latchIds).size !== latchIds.length) throw new Error(`${what}: duplicate latch id`);

  const found = [];
  for (let sp = 0; sp < 7; sp++) {
    const v = L.world.found ? L.world.found[sp] : undefined;
    if (v === undefined) found.push("-1");
    else {
      if (!Number.isInteger(v) || v < 0) throw new Error(`${what}: bad founding count ${v}`);
      found.push(String(v));
    }
  }
  const ap = L.apparatus;
  const pours = ap.pours === true ? "-1" : String(ap.pours | 0);
  if (ap.seed !== false && ap.seed !== "all") throw new Error(`${what}: unknown seed apparatus ${JSON.stringify(ap.seed)}`);
  const sources = ap.sources === true ? "SourcesGate::All" : ap.sources === "added" ? "SourcesGate::Added"
    : ap.sources === false ? "SourcesGate::None"
    : (() => { throw new Error(`${what}: unknown sources apparatus ${JSON.stringify(ap.sources)}`); })();
  const script = (L.script || []).map((e, i) => scriptStep(e, `${what}.script[${i}]`));
  for (let i = 1; i < (L.script || []).length; i++)
    if (L.script[i].t < L.script[i - 1].t) throw new Error(`${what}: script not sorted by tick`);

  out.push("    LevelDef {");
  out.push(`        key: ${s(L.key)}, n: ${L.n | 0},`);
  out.push(`        seed: ${L.world.seed | 0},`);
  out.push(`        found: [${found.join(", ")}],`);
  out.push(`        m0: ${L.world.M0 === undefined ? "0.0" : f(L.world.M0, what + ".M0")}, has_m0: ${b(L.world.M0 !== undefined)},`);
  out.push(`        mutation: ${b(L.world.mutation === true)},`);
  out.push(`        light_mul: ${L.world.lightMul === undefined ? "0.0" : f(L.world.lightMul, what + ".lightMul")}, has_light_mul: ${b(L.world.lightMul !== undefined)},`);
  out.push(`        pours: ${pours}, seed_all: ${b(ap.seed === "all")},`);
  out.push(`        sources: ${sources}, walls: ${b(ap.walls)}, evolution: ${b(ap.evolution)},`);
  out.push(`        script: &[${script.join(", ")}],`);
  out.push(`        deadline: ${L.deadline | 0}, sustain: ${L.sustain | 0},`);
  out.push(`        narrate: &[${(L.narrate || []).map(s).join(", ")}],`);
  out.push(`        pass: ${condList(L.pass, latchIds, what + ".pass")},`);
  out.push(`        latch: &[${(L.latch || []).map((x, k) =>
    `Latch { id: ${k}, when: ${condList(x.when, latchIds, `${what}.latch[${x.id}]`)} }`).join(", ")}],`);
  out.push("        fail_now: &[");
  for (const r of L.failNow)
    out.push(`            FailRule { when: ${condList(r.when, latchIds, what + ".failNow")}, why: ${s(r.why)} },`);
  out.push("        ],");
  out.push(`        timeout_why: ${s(L.timeoutWhy || "Time ran out.")},`);
  out.push("        meter: &[");
  for (const m of L.meter)
    out.push(`            MeterRow { label: ${s(m.label)}, m: ${metric(m, what + ".meter")}, pct: ${b(!!m.pct)}, ` +
      `goal: ${m.goal === undefined ? "None" : `Some(${f(m.goal, what + ".meter.goal")})`}, ` +
      `dir: ${m.dir === undefined ? 1 : m.dir | 0}, unit: ${s(m.unit || "")} },`);
  out.push("        ],");
  out.push("    },");
}
out.push("];");
out.push("");

const dest = path.join(__dirname, "..", "rust", "microcosm-core", "src", "levels_gen.rs");
fs.writeFileSync(dest, out.join("\n"));
console.log(`generated ${path.relative(path.join(__dirname, ".."), dest)}  (${ROWS.length} levels)`);
