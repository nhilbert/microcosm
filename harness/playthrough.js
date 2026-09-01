// The playthrough harness (promoted 2026-09-01, owner request): calibration protocol §6
// step 6 — a full-speed run of a level through the REAL browser UI, not the core API.
// The levels gate proves the world's verdicts; this proves the path a player walks to
// them: start screen → prediction chip → HUD → gestures → verdict card → Try again.
// Its first ad-hoc run earned the promotion by convicting a latent bug no other gate
// could see (reset() set ui.chips to the truthy [], crashing the React tree on every
// in-level retry and sandbox reset).
//
//   npm run play            all scripted paths
//   npm run play -- outpost one level's paths
//
// Needs a Chromium and playwright-core, so it is NOT inside npm test / CI (which has no
// browser): it is a bench instrument, run before a level ships and after UI surgery.
//   - chromium: MC_CHROMIUM, else the Playwright default /opt/pw-browsers/chromium
//   - playwright-core: `npm i --no-save playwright-core` if the require below fails
//
// The dev server is started on its own port and killed afterwards. The viewport is
// pinned to 420x900 CSS px: at that size the camera's zoom is exactly 1 (ui.jsx clamps
// z to max(1, min(vw,vh)/620)), so pan gestures move the world pixel-for-pixel and the
// scripted drags below stay exact.
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

let chromium;
try { ({ chromium } = require("playwright-core")); }
catch { console.error("playthrough: playwright-core not installed — run: npm i --no-save playwright-core"); process.exit(1); }

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 5199;
const EXECUTABLE = process.env.MC_CHROMIUM || "/opt/pw-browsers/chromium";
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---- helpers every path shares ----
function makeHelpers(page){
  const bodyText = () => page.evaluate(() => document.body.innerText);
  const tick = async () => {
    const m = (await bodyText()).match(/t\s+(\d+)/);
    return m ? +m[1] : -1;
  };
  const untilTick = async (goal, timeoutMs) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end){ if (await tick() >= goal) return; await wait(500); }
    throw new Error(`tick never reached ${goal}`);
  };
  const untilText = async (needle, timeoutMs, abortNeedle) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end){
      const t = await bodyText();
      if (t.includes(needle)) return true;
      if (abortNeedle && t.includes(abortNeedle)) return false;
      await wait(1000);
    }
    throw new Error(`never saw ${JSON.stringify(needle)}`);
  };
  // observe-mode pan: drag strokes in CSS px; at z=1, +x/+y drags move the camera by -x/-y
  const pan = async strokes => {
    await page.keyboard.press("o");
    for (const [x0, y0, x1, y1] of strokes){
      await page.mouse.move(x0, y0); await page.mouse.down();
      for (let s = 1; s <= 8; s++) await page.mouse.move(x0 + (x1 - x0) * s / 8, y0 + (y1 - y0) * s / 8);
      await page.mouse.up(); await wait(120);
    }
  };
  // intervene-mode long-press at screen centre, then pick a species chip by its label
  const seedAtCentre = async label => {
    await page.keyboard.press("i");
    await page.mouse.move(210, 450); await page.mouse.down();
    await wait(600); await page.mouse.up();
    await page.waitForSelector(`text=${label}`, { timeout: 5000 });
    await page.click(`text=${label}`);
    await wait(300);
  };
  const enter = async (title, chip) => {
    await page.click(`text=${title}`);
    await page.click(`text=${chip}`);
    await page.waitForSelector("canvas");
    await page.keyboard.press("3"); // 16x
  };
  return { bodyText, tick, untilTick, untilText, pan, seedAtCentre, enter };
}

// ---- the scripted paths, one entry per shipped level that has any ----
// Each path returns nothing and throws (or process.exitCode=1) on failure; console lines
// are the record. Levels earn paths as they ship; a level with none is simply not listed.
const PLAYS = {
  outpost: async (page, h) => {
    // null: watch the sun rise on empty water, to the honest timeout verdict
    await h.enter("The Second Sun", "It stays empty until something is carried there");
    console.log("  outpost/null: entered at 16x");
    await h.untilTick(2100, 120000);
    if (!(await h.bodyText()).includes("Solara · sun 2")) throw new Error("HUD meter missing after sunrise");
    console.log("  outpost/null: sun rose, region meters on the HUD");
    await h.untilTick(12000, 300000);
    await wait(2000);
    if (!(await h.bodyText()).includes("no working pond")) throw new Error("timeout verdict missing");
    console.log("  outpost/null: timeout verdict shown");

    // strategy: Try again (the retry that once crashed), pan to the risen sun, carry both
    await page.click("text=Try again");
    await wait(1000);
    await page.keyboard.press("3");
    await h.untilTick(2100, 120000);
    await page.keyboard.press("1"); // work the gestures at 1x
    await h.pan([[80, 300, 400, 620], [80, 300, 336, 556]]); // (512,512) -> (0,0) at z=1
    await h.seedAtCentre("● Solara");
    await h.seedAtCentre("● Drifta");
    console.log("  outpost/strategy: seeded Solara + Drifta at the risen sun");
    await page.keyboard.press("3");
    const passed = await h.untilText("colonization", 300000, "no working pond");
    if (!passed) throw new Error("strategy run failed instead of passing");
    console.log(`  outpost/strategy: pass debrief shown (t=${await h.tick()})`);
  },

  sorting: async (page, h) => {
    // strategy only (the null is a 18k-tick timeout — the levels gate owns it): open the
    // Evolution panel's price fold and pull Drifta's kp slider to 0.2 through the real handler
    await h.enter("The Sorting", "Tough lines out-breed the fast lines");
    await page.keyboard.press("i");
    await page.click("text=prices…");
    const drove = await page.evaluate(() => {
      const spans = [...document.querySelectorAll("span")];
      const head = spans.find(s => s.textContent.trim().startsWith("Drifta defense prices"));
      if (!head) return "no Drifta defense section";
      const labels = [...head.nextElementSibling.querySelectorAll("span")];
      const kp = labels.find(s => s.textContent.trim().startsWith("kp"));
      if (!kp) return "no kp label";
      const input = kp.nextElementSibling;
      if (!input || input.type !== "range") return "no slider after the kp label";
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      set.call(input, "0.2");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return "ok";
    });
    if (drove !== "ok") throw new Error("kp slider not driven: " + drove);
    console.log("  sorting/strategy: kp pulled to 0.2 through the panel's own slider");
    await page.keyboard.press("3");
    const passed = await h.untilText("natural selection", 420000, "never took over");
    if (!passed) throw new Error("strategy run failed instead of passing");
    console.log(`  sorting/strategy: pass debrief shown (t=${await h.tick()})`);
  },
};

(async () => {
  const only = process.argv[2];
  const keys = only ? [only] : Object.keys(PLAYS);
  for (const k of keys) if (!PLAYS[k]) { console.error(`playthrough: no scripted path for ${JSON.stringify(k)}`); process.exit(1); }

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
    for (const k of keys){
      const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
      page.on("pageerror", e => { console.log(`  PAGE ERROR (${k}): ${e.message}`); failed = true; });
      await page.goto(`http://127.0.0.1:${PORT}`, { waitUntil: "networkidle" });
      console.log(`L? ${k}`);
      try { await PLAYS[k](page, makeHelpers(page)); }
      catch (e){ console.log(`  FAIL ${k}: ${e.message}`); failed = true; }
      await page.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(failed ? "PLAYTHROUGH: FAIL — the UI path does not deliver the level"
                     : "PLAYTHROUGH: ALL PASS — every scripted path plays end to end in the real UI");
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("PLAYTHROUGH ERROR:", e.message); process.exit(1); });
