package org.microcosm.app

import android.content.Context
import android.graphics.Canvas
import android.view.SurfaceHolder
import android.view.SurfaceView
import kotlin.math.min

/**
 * The world, on its own render thread.
 *
 * The tick loop is the browser's: accumulate real milliseconds, spend them at the chosen speed,
 * cap the catch-up so a slow frame becomes slow motion rather than a death spiral, and interpolate
 * the leftover between ticks. `markPrev` before each step is what makes that interpolation possible
 * — it is the renderer's bookkeeping, deliberately not something the tick does for it.
 */
class WorldView(context: Context) : SurfaceView(context), SurfaceHolder.Callback, Runnable {

    companion object {
        const val TICK_MS = 100.0
    }

    val cam = Camera()
    // Touched from the UI thread, read by the render thread.
    @Volatile var speed = 1.0
    @Volatile var hidden = 0

    /** Set by [benchmark]; the loop hands the world over and reports when it is done. */
    @Volatile private var benchRequest = false
    @Volatile var report: String? = null
        private set

    /** Live numbers for the HUD, published once a frame. */
    @Volatile var stats: String = ""
        private set

    private var thread: Thread? = null
    @Volatile private var running = false
    private lateinit var renderer: Renderer

    init {
        holder.addCallback(this)
    }

    override fun surfaceCreated(h: SurfaceHolder) {
        running = true
        thread = Thread(this, "microcosm-render").also { it.start() }
    }

    override fun surfaceChanged(h: SurfaceHolder, format: Int, w: Int, ht: Int) = Unit

    override fun surfaceDestroyed(h: SurfaceHolder) {
        running = false
        thread?.join()
        thread = null
    }

    fun benchmark() { benchRequest = true }

    override fun run() {
        Native.boot()
        Native.resetWorld()
        Native.initWorld(11)
        Native.markPrev()
        renderer = Renderer()

        var last = System.nanoTime()
        var acc = 0.0
        var frameMs = 0.0
        var buildMs = 0.0

        while (running) {
            val now = System.nanoTime()
            val dt = min(120.0, (now - last) / 1e6)
            last = now

            if (benchRequest) {
                benchRequest = false
                report = runBenchmark()
                last = System.nanoTime()
                acc = 0.0
                continue
            }

            if (speed > 0) acc += dt * speed
            val maxSteps = if (speed >= 16) 9 else if (speed >= 4) 5 else 3
            var steps = 0
            while (acc >= TICK_MS && steps < maxSteps) {
                Native.markPrev()
                Native.step()
                acc -= TICK_MS
                steps++
            }
            if (steps == maxSteps) acc = 0.0 // shed the backlog: slow motion, never a death spiral
            val alpha = if (speed == 0.0) 1.0 else min(1.0, acc / TICK_MS)

            val t0 = System.nanoTime()
            val build = paintOnce(alpha)
            val ms = (System.nanoTime() - t0) / 1e6
            // an exponential average, so the HUD reads steadily rather than flickering
            frameMs += (ms - frameMs) * 0.1
            buildMs += (build / 1e6 - buildMs) * 0.1

            stats = "t %d   %s   z %.2f\n%.1f ms/frame  (core %.2f)  %d drawn".format(
                Native.tick(), popLine(), cam.z, frameMs, buildMs, renderer.orgN,
            )
        }
    }

    private fun popLine(): String {
        val p = renderer.pops
        return "S %d  D %d  C %d  B %d  V %d".format(p[0], p[1], p[2], p[3], p[6])
    }

    /** One frame. Returns the nanoseconds the core spent building the display list. */
    private fun paintOnce(alpha: Double): Long {
        val c: Canvas = holder.lockHardwareCanvas() ?: return 0
        try {
            return renderer.draw(c, cam, width.toFloat(), height.toFloat(), alpha, hidden)
        } finally {
            holder.unlockCanvasAndPost(c)
        }
    }

    /**
     * The measurement A.1 exists for. The first version of this reported one number per zoom and
     * every row came back at exactly 16.6 ms — which was the display's refresh interval, not the
     * cost of anything: `unlockCanvasAndPost` blocks until the next vblank, so a frame that takes
     * 2 ms and a frame that takes 16 ms both read 16.67. It measured waiting.
     *
     * So the timing is split three ways. `core` is the frame builder; `record` is the CPU time
     * Kotlin spends issuing draw commands; `present` is lock plus post — the GPU flush and the wait
     * for vblank, which is vsync-bound and therefore a floor, not a cost. Work is core + record;
     * everything else is the display setting the pace.
     */
    private fun runBenchmark(): String {
        val sb = StringBuilder()
        val savedZ = cam.z
        // a full pond first (untimed), then a fixed window timed wherever the world has got to —
        // the earlier version timed "run until t=3,000", which on a second press was already true
        // and divided by nothing
        while (Native.tick() < 3000L) { Native.markPrev(); Native.step() }
        val window = 1000
        val t0 = System.nanoTime()
        repeat(window) { Native.markPrev(); Native.step() }
        val simMs = (System.nanoTime() - t0) / 1e6
        sb.append("BENCHMARK — %dx%d px\n".format(width, height))
        sb.append("sim: %d ticks in %.0f ms = %.3f ms/tick (%.0fx real time)\n\n"
            .format(window, simMs, simMs / window, TICK_MS / (simMs / window)))
        val fieldMs = (0 until 5).minOf { renderer.timeFieldRefresh() } / 1e6
        sb.append("fields: %.2f ms — repack + upscale, once per advancing tick\n\n".format(fieldMs))
        sb.append(" zoom  drawn    core  record present   work\n")
        for (z in doubleArrayOf(0.35, 0.6, 0.9, 1.4, 2.2)) {
            cam.z = z
            repeat(10) { paintOnce(1.0) } // warm the pipeline before timing it
            var core = 0L
            var record = 0L
            var present = 0L
            val n = 60
            repeat(n) {
                val t1 = System.nanoTime()
                val c = holder.lockHardwareCanvas()
                if (c != null) {
                    val t2 = System.nanoTime()
                    core += renderer.draw(c, cam, width.toFloat(), height.toFloat(), 1.0, hidden)
                    val t3 = System.nanoTime()
                    holder.unlockCanvasAndPost(c)
                    record += t3 - t2
                    present += (t2 - t1) + (System.nanoTime() - t3)
                }
            }
            val coreMs = core / 1e6 / n
            val recordMs = record / 1e6 / n - coreMs // `record` brackets the core call too
            val presentMs = present / 1e6 / n
            sb.append("%5.2f %6d  %6.2f  %6.2f  %6.2f  %5.2f\n".format(
                z, renderer.orgN, coreMs, recordMs, presentMs, coreMs + recordMs))
        }
        cam.z = savedZ
        sb.append("\ncore    the frame builder (frame.rs)")
        sb.append("\nrecord  CPU time issuing draw commands")
        sb.append("\npresent lock + post: GPU flush and the wait for vblank — vsync-bound,")
        sb.append("\n        so it is a floor set by the display, not a cost")
        sb.append("\nwork    core + record. Headroom is 16.7 / work at 60 Hz.")
        sb.append("\nfields  measured separately: the world is paused here, so no frame")
        sb.append("\n        below pays it. In play it lands on ticks that advance.")
        return sb.toString()
    }
}
