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
     * The measurement A.1 exists for: how much of a frame is the core, and how much is the paint,
     * at every zoom the player can reach. The world is held still (no stepping) so the population
     * is the same for every row and the zoom is the only thing that varies.
     */
    private fun runBenchmark(): String {
        val sb = StringBuilder()
        val savedZ = cam.z
        // a full pond first: the shipped world settles near 1,800 organisms by t=3,000
        val target = 3000L
        val t0 = System.nanoTime()
        while (Native.tick() < target) { Native.markPrev(); Native.step() }
        val simMs = (System.nanoTime() - t0) / 1e6
        val ticks = target.coerceAtLeast(1L)
        sb.append("BENCHMARK — %dx%d px\n".format(width, height))
        sb.append("sim: %d ticks in %.0f ms = %.3f ms/tick (%.0fx real time)\n\n"
            .format(ticks, simMs, simMs / ticks, TICK_MS / (simMs / ticks)))
        sb.append(" zoom   drawn    core   paint   total   fps\n")
        for (z in doubleArrayOf(0.35, 0.6, 0.9, 1.4, 2.2)) {
            cam.z = z
            repeat(10) { paintOnce(1.0) } // warm the pipeline before timing it
            var build = 0L
            var total = 0L
            val n = 60
            repeat(n) {
                val s = System.nanoTime()
                build += paintOnce(1.0)
                total += System.nanoTime() - s
            }
            val totalMs = total / 1e6 / n
            val buildMs = build / 1e6 / n
            sb.append("%5.2f  %6d  %6.2f  %6.2f  %6.2f  %4.0f\n".format(
                z, renderer.orgN, buildMs, totalMs - buildMs, totalMs, 1000.0 / totalMs))
        }
        cam.z = savedZ
        sb.append("\ncore = the frame builder (frame.rs); paint = Canvas.")
        return sb.toString()
    }
}
