package org.microcosm.app

import android.content.Context
import android.graphics.Canvas
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.SurfaceHolder
import android.view.SurfaceView
import java.util.concurrent.ConcurrentLinkedQueue
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

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
        // The core's KINDS table (impact.rs), by index. A press changes the regime; a pulse pokes it.
        const val IV_POUR = 0
        const val IV_KILL = 1
        const val IV_FEED = 2
        const val IV_SEED = 3
        const val IV_UNDO = 4
        const val IV_SOURCE = 5
        const val IV_SOURCE_SET = 9
        const val IV_WALL_ADD = 14
        /** What the Events page calls each one. */
        val IV_LABEL = arrayOf(
            "You poured mineral", "You killed a specimen", "You fed a specimen",
            "You introduced organisms", "You undid the last action", "You moved an energy source",
            "You changed the sunlight", "You added an energy source", "You removed an energy source",
            "You changed an energy source", "You changed the source layout", "You switched mutation",
            "You changed an evolution setting", "You applied an evolution preset",
            "You built a wall", "You removed a wall", "You changed a wall",
        )
        private const val REC_N = 900
        private const val REC_CH = 141
    }

    val cam = Camera()
    /**
     * The zoom range, in device pixels per world unit.
     *
     * The browser's numbers (`minZ`/`clampZ` in src/ui.jsx) are in CSS pixels, with the device
     * pixel ratio applied separately by the canvas transform. This canvas is in device pixels, so
     * the taste constants have to carry the density or the whole range lands in the wrong place:
     * a bare 6.0 ceiling on a 3x screen is the browser's 2.0, which is why the closest view still
     * looked like mid-range.
     *
     * The floor is not taste. `max(vw, vh) / WORLD` is the zoom at which one copy of the world
     * exactly covers the viewport, and below it the torus repeats on screen. The frame builder
     * projects each organism ONCE, through the minimal image (`wd` in frame.rs) — correct at or
     * above this floor, where one copy covers everything, and visibly wrong below it, where the
     * tiled layers repeat but the organisms cannot. The old fixed 0.25 floor was three octaves
     * under it: the pond appeared 45 times over with life in only one of them.
     */
    private val density: Double = context.resources.displayMetrics.density.toDouble()
    private fun minZ(w: Int = width, h: Int = height) = max(w, h).toDouble() / Renderer.WORLD
    private fun clampZ(z: Double, w: Int = width, h: Int = height) =
        z.coerceIn(minZ(w, h), 6.0 * density)
    /** The viewport has to exist before the floor means anything. */
    private var camPlaced = false
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

    /** The specimen card's text, or empty when nothing is selected. Published once a frame. */
    @Volatile var card: String = ""
        private set

    // The core is single-threaded and lives on the render thread, so nothing outside may touch it.
    // Taps and levers are queued here and picked up at the top of the loop.
    @Volatile private var pendingTapX = Float.NaN
    @Volatile private var pendingTapY = Float.NaN
    @Volatile private var pendingLongX = Float.NaN
    @Volatile private var pendingLongY = Float.NaN
    private val commands = ConcurrentLinkedQueue<() -> Unit>()
    private var selI = -1
    private var selGen = 0

    /** Observe looks; Intervene touches. Amber marks the hand, and only in Intervene. */
    @Volatile var intervene = false
    /** The armed one-shot wall tool: the next drag draws a wall instead of panning. */
    @Volatile var wallArmed = false
    /** The species the long-press picker will seed, set by the shell before the press lands. */
    @Volatile var seedSpecies = -1
    /** The selected sun, or -1. A drag that STARTS on it moves it; other drags pan (U0.4). */
    @Volatile var sunSel = -1
    /**
     * The gripped sun's screen position, published once a frame by the render thread so the
     * gesture arbiter can ask "did this drag start on the sun?" without touching the core from
     * the UI thread. NaN while nothing is gripped.
     */
    @Volatile private var gripSx = Float.NaN
    @Volatile private var gripSy = Float.NaN
    /** Latched at finger-down: this gesture is a sun move. Cleared on UP/CANCEL. */
    private var dragOnSun = false
    /** Published for the shell: what is selected, and what could be put back. */
    @Volatile var selSpecies = -1
        private set
    @Volatile var undoKind = 0
        private set
    @Volatile var undoSpecies = -1
        private set

    // ---- the learning levels (A.5) ----
    // The runtime is the core's (levels.rs) and its verdicts are counted in recorder samples, so
    // they are identical at any speed — which is why the check runs here, once a frame, rather than
    // on a UI timer.
    @Volatile var levelState = 0
        private set
    @Volatile var levelHud: String = ""
        private set
    @Volatile var levelWhy: String = ""
        private set
    @Volatile var levelNarration: String = ""
        private set
    /** The option committed before the run, or -1. Published, because the UI thread must not read the core. */
    @Volatile var levelPredicted = -1
        private set
    /** The level's own labels and units, handed over by the shell when it starts one. */
    @Volatile var meterLabels: Array<String> = emptyArray()
    @Volatile var meterUnits: Array<String> = emptyArray()
    @Volatile var levelDeadline = 0L

    fun startLevel(idx: Int, predicted: Int, labels: Array<String>, units: Array<String>, deadline: Long) = post {
        meterLabels = labels
        meterUnits = units
        levelDeadline = deadline
        Native.levelStart(idx, predicted)
        selI = -1
    }
    fun restartLevel() = post { Native.levelRestart(); selI = -1 }
    fun stopLevel() = post { Native.levelStop(); levelState = 0; levelHud = "" }

    /**
     * A fresh pond on a new seed (U0.2 — the reset the review found did not exist). UI-side
     * randomness for reset seeds is legal (CLAUDE.md rule 5); the world itself stays deterministic
     * from the seed it is given. Everything the old world was holding — selection, grip, armed
     * tool, the undo slot — is let go, because all of it names things that no longer exist.
     */
    fun resetWorld(seed: Int) = post {
        Native.resetWorld()
        Native.initWorld(seed)
        Native.undoClear()
        selI = -1
        sunSel = -1
        wallArmed = false
        seedSpecies = -1
        Native.markPrev()
        renderer.onTilesChanged()
    }

    // ---- Data mode (A.4) ----
    // Everything here is produced on the render thread and published. `indicators()` and the event
    // feed mutate the core while computing, so reading them from the UI thread would be a race on
    // a &mut Sim; the recorder ring is copied for the same reason, and because fourteen channels
    // four times a second costs nothing.
    @Volatile var dataOpen = false
    @Volatile var series: FloatArray? = null
        private set
    @Volatile var seriesN = 0
        private set
    @Volatile var healthText: String = ""
        private set
    @Volatile var eventsText: String = ""
        private set
    private var dataFrame = 0
    private var recBuf: java.nio.FloatBuffer? = null

    /** Amber pour rings: the hand's touch, fading. Screen space, like the browser's. */
    private class Pour(val sx: Float, val sy: Float, val t: Long)
    private val pours = ArrayList<Pour>()
    private var wallDrag: FloatArray? = null
    /** A sun drag is one intervention, not one per frame: log it when the grip starts moving. */
    private var sunLogged = -1

    /** Run something against the core on the render thread, where the core may be touched. */
    fun post(cmd: () -> Unit) { commands.add(cmd) }

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

    override fun surfaceChanged(h: SurfaceHolder, format: Int, w: Int, ht: Int) {
        // A viewport change moves the floor, so the zoom must be re-clamped against it — the
        // browser does the same in its `resize`.
        if (!camPlaced) {
            camPlaced = true
            // the browser's opening zoom, max(1, min(vw, vh) / 620) in CSS pixels
            cam.z = max(density, min(w, ht).toDouble() / 620.0)
        }
        cam.z = clampZ(cam.z, w, ht)
    }

    override fun surfaceDestroyed(h: SurfaceHolder) {
        running = false
        thread?.join()
        thread = null
    }

    fun benchmark() { benchRequest = true }

    // ---- gestures ----
    // Drag pans, pinch zooms, a tap selects. Long-press is where A.3's seeding picker will go.
    private val scaleDetector = ScaleGestureDetector(context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
        override fun onScale(d: ScaleGestureDetector): Boolean {
            cam.z = clampZ(cam.z * d.scaleFactor)
            return true
        }
    })
    private val tapDetector = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
        override fun onDown(e: MotionEvent): Boolean = true
        override fun onScroll(e1: MotionEvent?, e2: MotionEvent, dx: Float, dy: Float): Boolean {
            if (scaleDetector.isInProgress) return true
            // Drawing a wall and dragging a sun both take the drag away from the camera: the hand
            // is on the world, not on the view.
            if (wallArmed && e1 != null) {
                wallDrag = floatArrayOf(e1.x, e1.y, e2.x, e2.y)
                return true
            }
            // U0.4: the grip no longer owns every drag. Moving a sun is a press — the light
            // plan measured 5/8 core loss for it — so it takes a drag that STARTED on the sun
            // (latched at finger-down, because the sun follows the finger and a live distance
            // check would flip mid-gesture). Every other drag pans the camera, gripped or not.
            // The deliberateness threshold is the GestureDetector's own touch slop, which no
            // onScroll arrives without.
            if (intervene && sunSel >= 0 && dragOnSun) {
                val k = sunSel
                val wx = wrapWorld(cam.x + (e2.x - width / 2.0) / cam.z)
                val wy = wrapWorld(cam.y + (e2.y - height / 2.0) / cam.z)
                post {
                    if (sunLogged != k) { Native.ivPush(IV_SOURCE); sunLogged = k }
                    Native.evSource(k, wx, wy)
                }
                return true
            }
            cam.x = wrapWorld(cam.x + dx / cam.z)
            cam.y = wrapWorld(cam.y + dy / cam.z)
            return true
        }
        override fun onSingleTapUp(e: MotionEvent): Boolean {
            pendingTapX = e.x
            pendingTapY = e.y
            return true
        }
        override fun onLongPress(e: MotionEvent) {
            pendingLongX = e.x
            pendingLongY = e.y
        }
    })

    override fun onTouchEvent(e: MotionEvent): Boolean {
        performClick()
        if (e.actionMasked == MotionEvent.ACTION_DOWN) {
            val gx = gripSx
            val gy = gripSy
            dragOnSun = !gx.isNaN() && hypot((e.x - gx).toDouble(), (e.y - gy).toDouble()) < 44.0 * density
        }
        scaleDetector.onTouchEvent(e)
        tapDetector.onTouchEvent(e)
        if (e.actionMasked == MotionEvent.ACTION_UP || e.actionMasked == MotionEvent.ACTION_CANCEL) {
            sunLogged = -1
            dragOnSun = false
            val d = wallDrag
            wallDrag = null
            if (d != null && wallArmed) {
                wallArmed = false
                val x0 = wrapWorld(cam.x + (d[0] - width / 2.0) / cam.z)
                val y0 = wrapWorld(cam.y + (d[1] - height / 2.0) / cam.z)
                val x1 = cam.x + (d[2] - width / 2.0) / cam.z
                val y1 = cam.y + (d[3] - height / 2.0) / cam.z
                // wallAdd takes the stroke as a VECTOR, not two endpoints: a long stroke is
                // minimal-imaged across the seam rather than wrapped the long way round
                post {
                    Native.ivPush(IV_WALL_ADD)
                    Native.evWallAdd(x0, y0, x1 - (cam.x + (d[0] - width / 2.0) / cam.z),
                        y1 - (cam.y + (d[1] - height / 2.0) / cam.z), 0.0, 0.0, 0.0, 0)
                }
            }
        }
        return true
    }

    override fun performClick(): Boolean = super.performClick()

    private fun wrapWorld(v: Double): Double {
        val m = v % Renderer.WORLD
        return if (m < 0) m + Renderer.WORLD else m
    }

    /** Runs on the render thread, where the core may be touched. */
    private fun takeInput() {
        while (true) (commands.poll() ?: break).invoke()

        val lx = pendingLongX
        if (!lx.isNaN()) {
            val ly = pendingLongY
            pendingLongY = Float.NaN
            pendingLongX = Float.NaN
            val sp = seedSpecies
            if (intervene && sp >= 0 && Native.levelAllows(1) != 0) {
                Native.ivPush(IV_SEED)
                Native.evSpawnPack(sp, worldX(lx), worldY(ly))
                pours.add(Pour(lx, ly, System.nanoTime()))
            }
        }

        val sx = pendingTapX
        if (sx.isNaN()) return
        val sy = pendingTapY
        pendingTapY = Float.NaN
        pendingTapX = Float.NaN
        val wx = worldX(sx)
        val wy = worldY(sy)

        // In Intervene, a tap near a sun grips it; a tap on open water pours mineral there.
        if (intervene) {
            // An experiment hands out its own apparatus: a level's sky may not be editable and its
            // mineral is budgeted. `levelAllows` is open outside a level.
            if (Native.levelAllows(2) != 0) {
                val k = nearestSun(sx, sy)
                if (k >= 0) { sunSel = k; return }
            }
            if (Native.pick(wx, wy, Native.pickRadius(cam.z / density, 0)) == 0) {
                if (Native.levelAllows(0) != 0 && Native.levelPourOk() != 0) {
                    Native.ivPush(IV_POUR)
                    Native.evFertilize(wx, wy, 40.0)
                    Native.levelNotePour(1)
                    pours.add(Pour(sx, sy, System.nanoTime()))
                }
                return
            }
        }
        if (Native.pick(wx, wy, Native.pickRadius(cam.z / density, 0)) == 0) {
            selI = -1
            return
        }
        // Nearest wins. The browser also offers species chips when several species are under the
        // thumb; that ambiguity affordance is UI and has not been ported yet.
        selI = Native.pickAt(0, 0).toInt()
        selGen = Native.pickAt(0, 1).toInt()
    }

    private fun worldX(sx: Float) = wrapWorld(cam.x + (sx - width / 2.0) / cam.z)
    private fun worldY(sy: Float) = wrapWorld(cam.y + (sy - height / 2.0) / cam.z)

    /** The sun under the thumb, within a thumb's width, or -1. */
    private fun nearestSun(sx: Float, sy: Float): Int {
        var best = -1
        var bd = 44.0 * density // 44 CSS px, as the browser's grip
        for (k in 0 until Native.sourceCount()) {
            val dx = wrapDelta(Native.sourceNum(k, 0) - cam.x) * cam.z + width / 2.0 - sx
            val dy = wrapDelta(Native.sourceNum(k, 1) - cam.y) * cam.z + height / 2.0 - sy
            val d = hypot(dx, dy)
            if (d < bd) { bd = d; best = k }
        }
        return best
    }

    private fun wrapDelta(d: Double): Double {
        var v = d
        if (v > Renderer.WORLD / 2) v -= Renderer.WORLD
        if (v < -Renderer.WORLD / 2) v += Renderer.WORLD
        return v
    }

    /** Feed and kill act on what is selected, so the shell does not need the slot index. */
    fun feedSelected() = post {
        if (selI >= 0) { Native.ivPush(IV_FEED); Native.evFeed(selI, selGen, 0.35) }
    }
    fun killSelected() = post {
        if (selI >= 0) { Native.ivPush(IV_KILL); Native.evKill(selI, selGen); selI = -1 }
    }
    fun undoLast() = post { Native.ivPush(IV_UNDO); Native.undo() }

    // ---- save and load (A.6) ----
    // Both run on the render thread, then hand the result back on the UI thread: a snapshot taken
    // mid-tick would be a torn world, and the tick is here.
    fun save(onDone: (ByteArray) -> Unit) = post { val b = Native.save(); ui.post { onDone(b) } }

    /**
     * A world to restore at boot instead of founding fresh (U0.6 — autosave). The shell sets it
     * before the surface exists; the render thread consumes it once, and a byte stream that is
     * not one of ours simply loses to the fresh world it was loaded over.
     */
    @Volatile var bootWorld: ByteArray? = null
    fun load(bytes: ByteArray, onDone: (Boolean) -> Unit) = post {
        val ok = Native.load(bytes) != 0
        if (ok) { selI = -1; Native.markPrev(); renderer.onTilesChanged() }
        ui.post { onDone(ok) }
    }
    private val ui = android.os.Handler(android.os.Looper.getMainLooper())

    override fun run() {
        Native.boot()
        Native.resetWorld()
        Native.initWorld(11)
        bootWorld?.let { Native.load(it) } // the autosaved pond, if there is one (U0.6)
        bootWorld = null
        Native.markPrev()
        renderer = Renderer(density)

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

            takeInput()
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
                Native.tick(), popLine(), cam.z / density, frameMs, buildMs, renderer.orgN,
            )
            card = renderer.cardText(selI, selGen)
            // Where the gripped sun is on screen this frame, for the drag-start test (U0.4).
            val gs = sunSel
            if (gs in 0 until Native.sourceCount()) {
                gripSx = (wrapDelta(Native.sourceNum(gs, 0) - cam.x) * cam.z + width / 2.0).toFloat()
                gripSy = (wrapDelta(Native.sourceNum(gs, 1) - cam.y) * cam.z + height / 2.0).toFloat()
            } else {
                gripSx = Float.NaN
                gripSy = Float.NaN
            }
            selSpecies = if (selI >= 0 && Native.frameSel(selI, selGen, 0) != 0.0)
                Native.org(selI, 1).toInt() else -1
            undoKind = Native.undoKind()
            undoSpecies = Native.undoSpecies()
            if (dataOpen && dataFrame++ % 15 == 0) publishData()
            publishLevel()
        }
    }

    /** What the Observatory can say about one intervention. Render thread only. */
    private fun impactLine(i: Int): String {
        return when (Native.impact(i)) {
            0 -> "history has rolled past this one"
            1 -> "watching impact… ${Native.impactNum(0).toInt()}%"
            else -> {
                val n = Native.impactNum(2).toInt()
                val sb = StringBuilder()
                if (n == 0) sb.append("no clear shift beyond normal variability — the world absorbed it")
                else {
                    sb.append("Since: ")
                    for (k in 0 until n) {
                        if (k > 0) sb.append(" · ")
                        val pct = Native.impactMover(k, 1)
                        sb.append(Native.impactMoverName(k)).append(' ')
                            .append(if (pct > 0) "+" else "").append(pct.toInt()).append('%')
                        if (Native.impactMover(k, 2) == 0.0) sb.append(" (could be a natural swing)")
                    }
                }
                val tails = ArrayList<String>()
                val rec = Native.impactNum(3)
                if (!rec.isNaN() && rec != 0.0) tails.add("relaxed back after ${rec.toInt()} s")
                else if (Native.impactNum(1) != 0.0) tails.add("settling toward a new regime")
                else if (Native.impactNum(6) == 0.0) tails.add("still developing")
                if (Native.impactNum(4) != 0.0) tails.add("mixed with other interventions")
                if (Native.impactNum(5) != 0.0) tails.add("under a changed-sun regime — attribution weak")
                if (tails.isNotEmpty()) sb.append(" · ").append(tails.joinToString(" · "))
                sb.toString()
            }
        }
    }

    /** The verdict, the meters and the level's latest narrated line. Render thread only. */
    private fun publishLevel() {
        val st = Native.levelCheck()
        levelState = st
        if (st == 0) { levelHud = ""; return }
        val sb = StringBuilder()
        for (k in meterLabels.indices) {
            val v = Native.levelMeter(k, 0)
            if (v.isNaN()) continue
            val unit = meterUnits.getOrElse(k) { "" }
            sb.append(meterLabels[k]).append(' ')
                .append(if (v == v.toLong().toDouble()) v.toLong().toString() else "%.1f".format(v))
                .append(unit)
            if (Native.levelMeter(k, 1) != 0.0) {
                val dir = Native.levelMeter(k, 3)
                sb.append(if (dir < 0) " → ≤ " else " / ")
                    .append(Native.levelMeter(k, 2).toLong()).append(unit)
            }
            sb.append("   ")
        }
        val left = Native.levelNum(5)
        if (left >= 0) sb.append("pours left ").append(left.toInt())
        levelHud = "t ${Native.tick()}/$levelDeadline   $sb"
        levelWhy = if (st == 3) Native.levelFailWhy() else ""
        levelPredicted = Native.levelNum(4).toInt()
        val nk = Native.levelNarration()
        levelNarration = if (nk >= 0) Native.sysEventText(nk, 1) else ""
    }

    /** Copy the channels the charts need, and write out the two text pages. Render thread only. */
    private fun publishData() {
        val rec = recBuf ?: Native.recBuffer().order(java.nio.ByteOrder.nativeOrder())
            .asFloatBuffer().also { recBuf = it }
        val head = Native.scalar(13).toInt()
        val n = Native.scalar(14).toInt()
        val chans = DataView.CHANNELS
        val out = FloatArray(chans.size * n)
        for (k in 0 until n) {
            val row = ((head - n + k + REC_N) % REC_N) * REC_CH
            for (c in chans.indices) out[c * n + k] = rec.get(row + chans[c])
        }
        series = out
        seriesN = n

        val sb = StringBuilder()
        if (Native.indOk() == 0) sb.append("gathering history…")
        else {
            sb.append("VARIETY %.2f    P/R %.2f\n".format(Native.indNum(1), Native.indNum(2)))
            val rec2 = Native.indNum(3)
            sb.append("RECYCLING %s    LOCKED %d%%\n".format(
                if (rec2.isNaN()) "–" else "every ${(rec2 * 60).roundToInt()} s", Native.indNum(4).toInt()))
            val ad = Native.indNum(0)
            if (!ad.isNaN()) sb.append("ADAPTABILITY %.2f\n".format(ad))
            sb.append("\nSPECIES VITALS\n")
            for (sp in 0 until 7) {
                if (Native.indStrain(sp, 0) == 0.0) continue
                val lvl = Native.indStrain(sp, 1).toInt()
                val word = if (lvl == 2) "critical" else if (lvl == 1) "tense" else "calm"
                val trend = Native.indStrain(sp, 3)
                val arrow = if (trend < -0.03) "↓" else if (trend > 0.03) "↑" else "→"
                sb.append("%-9s reserve %3d%% %s  pop x%.2f   %s\n".format(
                    renderer.speciesName[sp], (Native.indStrain(sp, 2) * 100).toInt(), arrow,
                    Native.indStrain(sp, 4), word))
            }
            if (Native.indVenator(0) != 0.0)
                sb.append("%-9s reserve %3d%%    prey losses %.1f/s\n".format(
                    "Venator", (Native.indVenator(1) * 100).toInt(), Native.indVenator(2)))
            sb.append("\nReference ranges measured on six healthy archived worlds.")
        }
        healthText = sb.toString()

        // The player's own hands first, each with its card. Rule 6: "since", never "because".
        val ev = StringBuilder()
        val ivs = Native.ivCount()
        for (i in ivs - 1 downTo maxOf(0, ivs - 8)) {
            ev.append("t %-6d %s\n".format(Native.ivAt(i, 0).toLong(), IV_LABEL[Native.ivAt(i, 1).toInt()]))
            ev.append("        ").append(impactLine(i)).append('\n')
        }
        if (ivs > 0) ev.append('\n')
        val count = Native.sysEventCount()
        for (i in count - 1 downTo maxOf(0, count - 40)) {
            ev.append("t %-6d %s\n".format(Native.sysEventNum(i, 0).toLong(), Native.sysEventText(i, 1)))
        }
        if (count == 0) ev.append("nothing to report yet.")
        eventsText = ev.toString()
    }

    private fun popLine(): String {
        val p = renderer.pops
        return "S %d  D %d  C %d  B %d  V %d".format(p[0], p[1], p[2], p[3], p[6])
    }

    /** Last frame's census, for the status strip. Safe to read from the UI thread. */
    fun popOf(sp: Int): Int = if (::renderer.isInitialized) renderer.pops[sp] else 0

    /** One frame. Returns the nanoseconds the core spent building the display list. */
    private fun paintOnce(alpha: Double): Long {
        val c: Canvas = holder.lockHardwareCanvas() ?: return 0
        try {
            val n = renderer.draw(c, cam, width.toFloat(), height.toFloat(), alpha, hidden, selI, selGen)
            // amber last, and only in Intervene: it marks the hand, never the world
            if (intervene) {
                val now = System.nanoTime()
                pours.removeAll { (now - it.t) / 7e8 >= 1.0 }
                val ring = FloatArray(pours.size * 3)
                for ((q, p) in pours.withIndex()) {
                    ring[q * 3] = p.sx
                    ring[q * 3 + 1] = p.sy
                    ring[q * 3 + 2] = ((now - p.t) / 7e8).toFloat()
                }
                renderer.paintHand(c, ring, wallDrag, sunSel, cam, width.toFloat(), height.toFloat())
            }
            return n
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
        // multiples of the floor, not absolute numbers: the floor depends on the screen, and a
        // row below it is a view the player can never reach
        val z0 = minZ()
        for (mul in doubleArrayOf(1.0, 1.3, 1.8, 2.5, 3.5)) {
            val z = (z0 * mul).coerceAtMost(6.0 * density)
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
