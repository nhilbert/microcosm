// tools/level-thumbs.js — experiment-menu thumbnails, captured from real gameplay.
//
// For every shipped level this tool plays the level in the REAL browser UI (the
// playthrough instrument's approach: dev server + headless Chromium + genuine
// gestures) and photographs a curated moment of the world: a tick, a place, a
// zoom, and — where the level's main actor is absent from the null run — a
// scripted act (seeding the gardener's grazer, the hunters' pack) so the
// concept is IN the picture, not implied by it. The camera work is all
// player-reachable input (observe-mode drags, wheel zoom), so a thumbnail is
// always a frame a player could have framed.
//
//   npm run thumbs             capture every level in SHOTS
//   npm run thumbs -- outpost  capture one level (the module is still rebuilt
//                              from ALL jpgs on disk, so partial runs are safe)
//
// Output, both committed:
//   assets/levels/<key>.jpg    one home for browser and APK alike (the app's
//                              build.gradle bundles repo-root assets/, the
//                              species-portrait precedent)
//   src/ui-thumbs.js           the same images as data URIs for the single-file
//                              artifact (const LEVEL_THUMBS), GENERATED — the
//                              build fails without it, so it stays committed
//
// This is a curation tool, not a gate: captures ride the live render loop at
// wall-clock speed, so two runs of the same spec differ by a few ticks and the
// jpgs are not bit-reproducible. Regenerating is a deliberate act (the images
// are committed); the per-level spec below is the record of what each picture
// means. Needs Chromium + playwright-core, same as harness/playthrough.js.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

let chromium;
try { ({ chromium } = require("playwright-core")); }
catch { console.error("level-thumbs: playwright-core not installed — run: npm i --no-save playwright-core"); process.exit(1); }

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "assets", "levels");
const MODULE = path.join(ROOT, "src", "ui-thumbs.js");
const PORT = Number(process.env.PORT) || 5198;
const EXECUTABLE = process.env.MC_CHROMIUM || "/opt/pw-browsers/chromium";
const SIDE = 160;         // thumbnail edge, px — organisms stay at z× native scale
const QUALITY = 0.85;     // jpeg, like the species portraits
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---- the shot list: one curated moment per shipped level ----
// t      capture tick (approximate — the run is live, so ±a few ticks)
// at     world point the camera centres on (default: the home sun, 512,512)
// actor  species index — no `at`? the tool replays the level headlessly
//        (levelStart + levelScript + step, the harness drive loop) to t and
//        centres on that species' densest cluster, so the main actors are IN
//        the frame rather than somewhere on a 1024-wide torus
// z      zoom at capture (wheel-driven, clamped by the UI to [1,6])
// acts   scripted gameplay before the capture: {t, seed:"<picker chip label>"}
//        long-presses the water below the sun (world ~512,622) and picks that
//        species — used where the level's actor is absent until the player acts
const SHOTS = {
  light:    { t: 400,  actor: 0, z: 2.6 },          // founders under the dim sun
  mineral:  { t: 1500, actor: 0, z: 2.2 },          // fierce sun, stalled mat
  cycle:    { t: 2500, actor: 0, z: 2.2 },          // the mat and what it sheds
  garden:   { t: 1200, actor: 1, z: 2.0 },          // the bloom that eats the garden
  richer:   { t: 2200, at: [512, 622], z: 2.2,      // the meadow, grazed at last
              acts: [{ t: 1800, seed: "● Cilio" }] },
  hunters:  { t: 3200, at: [512, 622], z: 2.2,      // the hatched pack among the plankton
              acts: [{ t: 2000, seed: "● Venator" }] },
  outpost:  { t: 2600, at: [0, 0], z: 1.4 },        // the risen sun, empty water
  warmyear: { t: 4600, at: [512, 528], z: 1.6 },    // the swollen sun of the warm year
  sorting:  { t: 1500, actor: 1, z: 2.8 },          // the Drifta cloud under selection
  refuge:   { t: 1600, at: [416, 596], z: 1.15 },   // the mesh pen and its grazers
  outrun:   { t: 3600, at: [520, 600], z: 2.2 },    // life under the pressed sun's heat
};

// ---- where are the actors? replay the level in-process and find out ----
// The headless run is the same drive loop the levels gate uses, so scripted
// events fire on their ticks; browser-side acts (seeding) are NOT replayed,
// which is why acted levels above carry a fixed `at` instead of an actor.
let CORE = null;
function actorTarget(key, t, sp){
  if (!CORE) CORE = require(path.join(ROOT, "dist", "core.js"));
  const def = CORE.LEVELS.find(l => l.key === key);
  CORE.levelStart(def);
  const W = CORE.W;
  while (W.tick < t){ CORE.levelScript(); CORE.step(); }
  const B = 16, bin = 1024 / B, count = new Array(B * B).fill(0);
  for (let i = 0; i < W.n; i++)
    if (W.alive[i] && W.sp[i] === sp)
      count[(Math.floor(W.y[i] / bin) % B) * B + (Math.floor(W.x[i] / bin) % B)]++;
  let best = 0;
  for (let b = 1; b < B * B; b++) if (count[b] > count[best]) best = b;
  // refine: toroidal mean of the species within 1.5 bins of the peak centre
  const cx = (best % B) * bin + bin/2, cy = Math.floor(best / B) * bin + bin/2;
  const wdist = d => { d %= 1024; if (d > 512) d -= 1024; if (d < -512) d += 1024; return d; };
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < W.n; i++){
    if (!W.alive[i] || W.sp[i] !== sp) continue;
    const dx = wdist(W.x[i] - cx), dy = wdist(W.y[i] - cy);
    if (dx*dx + dy*dy < (1.5*bin)*(1.5*bin)){ sx += dx; sy += dy; n++; }
  }
  const at = n ? [Math.round((cx + sx/n + 1024) % 1024), Math.round((cy + sy/n + 1024) % 1024)] : [cx, cy];
  CORE.levelStop();
  return at;
}

// ---- gameplay helpers (the playthrough instrument's vocabulary) ----
function makeHelpers(page){
  const bodyText = () => page.evaluate(() => document.body.innerText);
  const tick = async () => {
    const m = (await bodyText()).match(/t\s+(\d+)/);
    return m ? +m[1] : -1;
  };
  const untilTick = async (goal, timeoutMs) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end){ if (await tick() >= goal) return; await wait(300); }
    throw new Error(`tick never reached ${goal}`);
  };
  // click a button by the text it carries (titles and prediction options hold
  // punctuation Playwright's text engine trips on, so match in the DOM)
  const clickButton = async needle => {
    const ok = await page.evaluate(n => {
      const b = [...document.querySelectorAll("button")].find(x => x.textContent.includes(n));
      if (!b) return false;
      b.click(); return true;
    }, needle);
    if (!ok) throw new Error(`no button containing ${JSON.stringify(needle)}`);
    await wait(300);
  };
  // observe-mode drag strokes in CSS px; at z=1 a (+x,+y) drag moves the camera (-x,-y)
  const drag = async (x0, y0, x1, y1) => {
    await page.mouse.move(x0, y0); await page.mouse.down();
    for (let s = 1; s <= 8; s++) await page.mouse.move(x0 + (x1 - x0) * s / 8, y0 + (y1 - y0) * s / 8);
    await page.mouse.up(); await wait(120);
  };
  // centre the camera on a world point: axis-separated strokes at z=1, each
  // starting well clear of the sun's grab radius and short enough to stay
  // inside the 420x900 viewport
  const panTo = async (wx, wy) => {
    const wd = d => { const W = 1024; d %= W; if (d > W/2) d -= W; if (d < -W/2) d += W; return d; };
    let dx = -wd(wx - 512), dy = -wd(wy - 512); // drag px needed (camera starts on the home sun)
    while (Math.abs(dx) > 1){
      const c = Math.max(-250, Math.min(250, dx));
      await drag(c > 0 ? 80 : 340, 160, (c > 0 ? 80 : 340) + c, 160);
      dx -= c;
    }
    while (Math.abs(dy) > 1){
      const c = Math.max(-250, Math.min(250, dy));
      await drag(210, c > 0 ? 200 : 700, 210, (c > 0 ? 200 : 700) + c);
      dy -= c;
    }
  };
  // wheel zoom about the screen centre (the UI multiplies 1.12 per notch)
  const zoomTo = async z => {
    const n = Math.round(Math.log(z) / Math.log(1.12));
    await page.mouse.move(210, 450);
    for (let i = 0; i < n; i++){ await page.mouse.wheel(0, -120); await wait(60); }
    await wait(200);
  };
  // intervene-mode long-press on the water below the sun, then pick a species chip
  const seedBelowSun = async label => {
    await page.keyboard.press("i");
    await page.mouse.move(210, 560); await page.mouse.down();
    await wait(600); await page.mouse.up();
    await page.waitForSelector(`text=${label}`, { timeout: 5000 });
    await page.click(`text=${label}`);
    await wait(300);
    await page.keyboard.press("o");
  };
  // photograph a SIDE x SIDE crop of the world canvas, centred on the screen centre
  const capture = () => page.evaluate(({ side, q }) => {
    const c = document.querySelector("canvas");
    const r = c.getBoundingClientRect();
    const k = c.width / r.width; // CSS px -> backing px
    const s = side * k;
    const o = document.createElement("canvas");
    o.width = side; o.height = side;
    o.getContext("2d").drawImage(c, (r.width/2)*k - s/2, (r.height/2)*k - s/2, s, s, 0, 0, side, side);
    return o.toDataURL("image/jpeg", q);
  }, { side: SIDE, q: QUALITY });
  return { bodyText, tick, untilTick, clickButton, panTo, zoomTo, seedBelowSun, capture };
}

// ---- one level, start screen to jpg ----
async function shoot(page, h, def, cfg){
  await h.clickButton(def.title);
  if ((await h.bodyText()).includes("BEFORE YOU START")) // F1: commit any prediction — never graded
    await h.clickButton(def.predict.options[0]);
  await page.waitForSelector("canvas");
  await page.keyboard.press("3"); // 16x to the moment
  for (const act of cfg.acts || []){
    await h.untilTick(act.t, 300000);
    await page.keyboard.press("1");
    await h.seedBelowSun(act.seed);
    console.log(`  ${def.key}: seeded ${act.seed} at t=${await h.tick()}`);
    await page.keyboard.press("3");
  }
  await h.untilTick(cfg.t, 600000);
  await page.keyboard.press(" "); // pause: the framing and the frame agree
  await page.keyboard.press("o");
  // exact actor targeting: an untouched level run is deterministic (pinned
  // seed, draw-free founding), so replaying headlessly to the tick the pause
  // actually landed on reproduces the browser's world bit for bit
  const [wx, wy] = cfg.at || (cfg.actor !== undefined
    ? actorTarget(def.key, await h.tick(), cfg.actor) : [512, 512]);
  await h.panTo(wx, wy);
  await h.zoomTo(cfg.z || 2);
  const url = await h.capture();
  const jpg = Buffer.from(url.split(",")[1], "base64");
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, def.key + ".jpg"), jpg);
  console.log(`  ${def.key}: t=${await h.tick()} at (${wx},${wy}) z≈${cfg.z} — ${jpg.length} bytes`);
}

// ---- the generated module: every jpg on disk, in ladder order ----
function writeModule(rows){
  const order = new Map(rows.map((r, i) => [r.key, i]));
  const keys = fs.existsSync(OUT)
    ? fs.readdirSync(OUT).filter(f => f.endsWith(".jpg")).map(f => f.slice(0, -4))
        .sort((a, b) => (order.has(a) ? order.get(a) : 99) - (order.has(b) ? order.get(b) : 99))
    : [];
  const lines = keys.map(k => {
    const b64 = fs.readFileSync(path.join(OUT, k + ".jpg")).toString("base64");
    return `  ${JSON.stringify(k)}: "data:image/jpeg;base64,${b64}",`;
  });
  fs.writeFileSync(MODULE, [
    "// ============================================================",
    "// GENERATED by tools/level-thumbs.js — never hand-edit; regenerate with",
    "// `npm run thumbs`. Experiment-menu thumbnails captured from real gameplay",
    "// (assets/levels/*.jpg as data URIs — the artifact is a single file).",
    "// The start screen shows a level's picture only when its key is here;",
    "// a level without one simply has no picture, never a placeholder.",
    "// ============================================================",
    "const LEVEL_THUMBS = {",
    ...lines,
    "};",
    "",
  ].join("\n"));
  console.log(`wrote src/ui-thumbs.js — ${keys.length} thumbnails (${keys.join(", ")})`);
}

(async () => {
  const rows = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "observatory", "levels.json"), "utf8"));
  const only = process.argv[2];
  const targets = rows.filter(r => SHOTS[r.key] && (!only || r.key === only));
  if (only && !targets.length){ console.error(`level-thumbs: no shot spec for ${JSON.stringify(only)}`); process.exit(1); }

  const server = spawn("node", [path.join(ROOT, "tools", "dev-server.js")],
    { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  const up = async () => new Promise(res => {
    const probe = () => http.get({ host: "127.0.0.1", port: PORT, path: "/" },
      r => res()).on("error", () => setTimeout(probe, 500));
    probe();
  });
  await Promise.race([up(), wait(30000).then(() => { throw new Error("dev server never came up"); })]);

  const browser = await chromium.launch({ executablePath: EXECUTABLE, headless: true, args: ["--no-sandbox"] });
  let failed = false;
  try {
    for (const def of targets){
      const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
      page.on("pageerror", e => { console.log(`  PAGE ERROR (${def.key}): ${e.message}`); failed = true; });
      await page.goto(`http://127.0.0.1:${PORT}`, { waitUntil: "networkidle" });
      console.log(`E${def.n} ${def.key} — ${def.title}`);
      try { await shoot(page, makeHelpers(page), def, SHOTS[def.key]); }
      catch (e){ console.log(`  FAIL ${def.key}: ${e.message}`); failed = true; }
      await page.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
  writeModule(rows);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("LEVEL-THUMBS ERROR:", e.message); process.exit(1); });
