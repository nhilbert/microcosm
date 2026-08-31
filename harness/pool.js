// Worker pool for the acceptance harnesses (perf-review increment A, docs/perf-review-2026-08-31.md §5).
// Every corridor/acceptance run is an independent world, so they fan across cores: the parent
// enumerates jobs, each job runs in a FRESH node process (a cold module load — no cross-run state
// can leak, the strongest form of the reset guarantee; the Phase 6 sigma-reset incident is the
// cautionary tale), and results print in job order the moment their turn is reached, so the
// output is byte-identical to the sequential harness whatever the completion order.
// MC_JOBS overrides the worker count (default: every core). The measurement arithmetic lives in
// the harness scripts themselves — this file only schedules.
const { spawn } = require("child_process");
const os = require("os");

function runPool(script, jobs, onResult){
  const N = Math.max(1, +process.env.MC_JOBS || os.availableParallelism());
  return new Promise((resolve, reject) => {
    const results = new Array(jobs.length);
    let next = 0, printed = 0, running = 0;
    const flush = () => { while (printed < jobs.length && results[printed] !== undefined) onResult(results[printed], printed++); };
    const launch = () => {
      while (running < N && next < jobs.length){
        const idx = next++; running++;
        const child = spawn(process.execPath, [script, "--job", JSON.stringify(jobs[idx])],
          { stdio: ["ignore", "pipe", "inherit"], env: process.env });
        let out = "";
        child.stdout.on("data", d => out += d);
        child.on("error", reject);
        child.on("close", code => {
          running--;
          let r;
          try { if (code !== 0) throw new Error("worker exited " + code); r = JSON.parse(out); }
          catch (e){ r = { workerError: String(e), raw: String(out).slice(0, 400) }; }
          results[idx] = r; flush();
          if (printed === jobs.length) resolve(results); else launch();
        });
      }
    };
    if (!jobs.length) return resolve(results);
    launch();
  });
}
module.exports = { runPool };
