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
        const val IV_SOURCE_ADD = 7
        const val IV_SOURCE_REMOVE = 8
        const val IV_SOURCE_SET = 9
        const val IV_SOURCE_LAYOUT = 10
        const val IV_MUTATION = 11
        const val IV_LOCUS = 12
        const val IV_PRESET = 13
        const val IV_WALL_ADD = 14
        /** The recorder's locus channels: [mean base, sd base] per locus plane; +sp gives the row. */
        val LOCUS_CH = arrayOf(intArrayOf(42, 49), intArrayOf(75, 82), intArrayOf(89, 96), intArrayOf(103, 110))
        private const val REC_N = 900

        const val TOOL_FEED = 1
        const val TOOL_KILL = 2

        /**
         * Whether THIS PROCESS has founded a world in the core. The core is a process-wide
         * singleton; the surface is not — a screen lock destroys it and an unlock creates a new
         * one, and `run()` used to found unconditionally on every new surface, so every unlock
         * re-founded a fresh seed-11 world (the owner's "screen lock loses everything"; the
         * autosave couldn't catch it either, see [surfaceDestroyed]). One founding per process;
         * every later surface resumes drawing the world that is already alive.
         */
        private var coreFounded = false
        private const val REC_CH = 141
    }

    val cam = Camera()

    /** What the Events page calls each intervention, in the display language (DE.1). */
    private val ivLabel = context.resources.getStringArray(R.array.iv_labels)
    /** Resource shorthand — every published string speaks the display language. */
    private fun s(id: Int, vararg a: Any?) =
        if (a.isEmpty()) context.getString(id) else context.getString(id, *a)
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

    /** The player's line — tick and census — published once a frame. */
    @Volatile var stats: String = ""
        private set

    /**
     * The renderer's own numbers (zoom, ms/frame, core, drawn) — developer instrumentation,
     * published separately so the shell can keep it off the player's screen (U0.7): the review
     * found half the permanent HUD was telemetry in the same weight and colour as the census.
     */
    @Volatile var statsDev: String = ""
        private set

    /** The specimen card's text, or empty when nothing is selected. Published once a frame. */
    @Volatile var card: String = ""
        private set

    /** The one line's clock (U2.2). */
    @Volatile var clock: String = ""
        private set

    /**
     * The standing sun change (U2.3, the outrun study's one conviction): "" while the sun is as
     * this world founded it, else what stands and for how long — in the world's own minutes.
     */
    @Volatile var sunBadge: String = ""
        private set
    private var baseSun = DoubleArray(0) // x,y,i,a,sigma at founding; render thread only
    private var sunChangeTick = -1L

    /** Remember the sun as this world was founded; the badge measures departure from here. */
    private fun captureSunBaseline() {
        baseSun = if (Native.sourceCount() > 0) DoubleArray(5) { Native.sourceNum(0, it) }
                  else DoubleArray(0)
        sunChangeTick = -1L
    }

    /** Put the sun back as founded — the badge's tap, logged as the presses it is. */
    fun putSunBack() = post {
        if (baseSun.size < 5 || Native.sourceCount() == 0) return@post
        if (Native.levelAllows(2) == 0 || Native.levelAllowsSource(0) == 0) return@post
        Native.ivPush(IV_SOURCE_SET)
        Native.evSourceSet(0, baseSun[2], baseSun[3], baseSun[4])
        Native.ivPush(IV_SOURCE)
        Native.evSource(0, baseSun[0], baseSun[1])
    }

    // The core is single-threaded and lives on the render thread, so nothing outside may touch it.
    // Taps and levers are queued here and picked up at the top of the loop. Each gesture crosses
    // threads as ONE atomic reference: the earlier pair of volatile floats could be read torn (x
    // set, y stale) or lost outright in the clear window — the boot gate's grip test caught the
    // tap silently vanishing on CI, and the same race shipped in every build since A.2.
    private val pendingTap = java.util.concurrent.atomic.AtomicReference<FloatArray?>()
    private val pendingLong = java.util.concurrent.atomic.AtomicReference<FloatArray?>()
    private val commands = ConcurrentLinkedQueue<() -> Unit>()
    private var selI = -1
    private var selGen = 0

    /** Observe looks; Intervene touches. Amber marks the hand, and only in Intervene. */
    @Volatile var intervene = false
    /**
     * The armed touch tool (owner round 3): 0 none, [TOOL_FEED] or [TOOL_KILL]. Armed, a tap or a
     * drag feeds/kills what is under the finger — an eraser, not a selection ritual. The specimen
     * sheet keeps its own per-individual feed/kill; these are for working the crowd.
     */
    @Volatile var toolArmed = 0
    /** The armed one-shot wall tool: the next drag draws a wall instead of panning. */
    @Volatile var wallArmed = false
    /** The species the long-press picker will seed, set by the shell before the press lands. */
    @Volatile var seedSpecies = -1
    /** The selected sun, or -1. A drag that STARTS on it moves it; other drags pan (U0.4). */
    @Volatile var sunSel = -1
    /** The armed source-placement tool (EV sun card): 0 none, 1 a sun, 2 a heater — next tap places it. */
    @Volatile var placeSource = 0
    /** L7: the founded sun is part of the experiment — published per frame for the UI's gating. */
    @Volatile var homeSunLocked = false
    /** The gripped sun's live numbers for the card: [i, a, sigma, count], or null. Per frame. */
    @Volatile var sunInfo: DoubleArray? = null
        private set
    /** Whether mutation is on — the Evolution panel's master light. Published per frame. */
    @Volatile var mutationOn = true
        private set
    /** Whether the running experiment hands out the evolution apparatus (levelAllows 4). */
    @Volatile var evolutionAllowed = true
        private set
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
    /** Undo-chip freshness (render thread): the chip shows for 45 s after each intervention. */
    private var ivSeen = 0
    private var ivFreshUntil = 0L

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
        captureSunBaseline() // the level founds its own sky; the badge measures from there
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
        captureSunBaseline()
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
    // ---- the Traits page (EV) ----
    @Volatile var traitBands: Array<DataView.Band> = emptyArray()
        private set
    @Volatile var traitSeries: FloatArray = FloatArray(0)
        private set
    /** The (sp, locus, meanCh, sdCh) rows of the Traits page — built once, on the render thread. */
    private var bandDefs: List<IntArray>? = null
    /** The world's shipped mutation rates, captured at founding — the presets' "as shipped". */
    val shippedSigma = HashMap<Int, Double>()
    private var dataFrame = 0
    private var recBuf: java.nio.FloatBuffer? = null

    /** Amber pour rings: the hand's touch, fading. Screen space, like the browser's. */
    private class Pour(val sx: Float, val sy: Float, val t: Long)
    private val pours = ArrayList<Pour>()
    private var wallDrag: FloatArray? = null
    /** A sun drag is one intervention, not one per frame: log it when the grip starts moving. */
    private var sunLogged = -1
    /** The armed tool's drag throttle (UI thread). */
    private var lastToolNs = 0L

    /** One touch of the armed tool: feed or kill the creature under the point, if any. */
    private fun applyTool(wx: Double, wy: Double) {
        if (Native.pick(wx, wy, Native.pickRadius(cam.z / density, 0)) == 0) return
        val i = Native.pickAt(0, 0).toInt()
        val gen = Native.pickAt(0, 1).toInt()
        if (toolArmed == TOOL_KILL) {
            Native.ivPush(IV_KILL)
            Native.evKill(i, gen)
            if (i == selI) selI = -1
        } else {
            Native.ivPush(IV_FEED)
            Native.evFeed(i, gen, 0.35)
        }
    }

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
        // The queue must not die with the thread. On a screen lock the pause-time autosave is
        // queued at almost the same moment the teardown kills the loop, and losing that race
        // silently lost the save. Once the join returns, this thread is the core's sole owner
        // (the same handover the boot gate leans on), so the leftovers run here.
        while (true) (commands.poll() ?: break).invoke()
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
            // The armed touch tool sweeps: the drag feeds/kills along the path (throttled so a
            // slow stroke is not a massacre per pixel), and the camera stays put.
            if (intervene && toolArmed != 0) {
                val now = System.nanoTime()
                if (now - lastToolNs > 90_000_000L) {
                    lastToolNs = now
                    val wx = worldX(e2.x)
                    val wy = worldY(e2.y)
                    post { applyTool(wx, wy) }
                }
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
            pendingTap.set(floatArrayOf(e.x, e.y))
            return true
        }
        override fun onLongPress(e: MotionEvent) {
            pendingLong.set(floatArrayOf(e.x, e.y))
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

        val lp = pendingLong.getAndSet(null)
        if (lp != null) {
            val sp = seedSpecies
            if (intervene && sp >= 0 && Native.levelAllows(1) != 0) {
                Native.ivPush(IV_SEED)
                Native.evSpawnPack(sp, worldX(lp[0]), worldY(lp[1]))
                pours.add(Pour(lp[0], lp[1], System.nanoTime()))
            } else if (intervene && sp < 0 && Native.levelAllows(2) != 0) {
                // A held press on the sun grips it too. A player whose tap seems to do nothing
                // presses longer and harder — and a long press used to do nothing at all unless
                // a seed species was armed, which read as "I never get to grip it".
                val k = nearestSun(lp[0], lp[1])
                if (k >= 0 && Native.levelAllowsSource(k) != 0) sunSel = k // a locked sun (L7) takes no grip
            }
        }

        val tp = pendingTap.getAndSet(null) ?: return
        val sx = tp[0]
        val sy = tp[1]
        val wx = worldX(sx)
        val wy = worldY(sy)

        // An armed source placement (the sun card's add buttons) takes the very next tap.
        if (intervene && placeSource != 0 && Native.levelAllows(2) != 0) {
            if (Native.sourceCount() < 4) { // the world keeps at most four sources (P.maxSources)
                Native.ivPush(IV_SOURCE_ADD)
                if (placeSource == 1) Native.evSourceAdd(wx, wy, 1.0, 0.0, 130.0)
                else Native.evSourceAdd(wx, wy, 0.0, 10.0, 130.0)
                sunSel = Native.sourceCount() - 1 // grip the newborn, so the card shows it
            }
            placeSource = 0
            return
        }
        // In Intervene, an armed touch tool takes the tap whole: no gripping, pouring or
        // selecting while the hand is a feeder or an eraser.
        if (intervene && toolArmed != 0) {
            applyTool(wx, wy)
            return
        }
        // In Intervene, a tap near a sun grips it; a tap on open water pours mineral there.
        if (intervene) {
            // An experiment hands out its own apparatus: a level's sky may not be editable and its
            // mineral is budgeted. `levelAllows` is open outside a level.
            if (Native.levelAllows(2) != 0) {
                val k = nearestSun(sx, sy)
                // a locked sun (L7's founded sky) takes no grip — and swallows the tap, as the browser does
                if (k >= 0) { if (Native.levelAllowsSource(k) != 0) sunSel = k; return }
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

    /** Let go of the selection — the specimen drawer's dismiss (U2.R2). */
    fun deselect() = post { selI = -1 }

    /**
     * The selected creature, structured (U2.R2's rich card): everything the sheet draws, read on
     * the render thread and published whole. `cap` mirrors P.capMul (10) for the energy bar —
     * display only, never simulation.
     */
    /** One heritable dial as the sheet draws it: labelEn keys the explanation and stays the
     *  core's English; label/lo/hi are display words, already through L10n. */
    class Locus(
        val label: String, val labelEn: String, val g: Double, val g0: Double,
        val lo: String, val hi: String,
    )
    class Specimen(
        val sp: Int, val dormant: Boolean, val energy: Double, val cap: Double,
        val size: Double, val mineral: Double, val ageMin: Long,
        val loci: List<Locus>,
    )
    @Volatile var specimen: Specimen? = null
        private set

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
        if (ok) { selI = -1; Native.markPrev(); renderer.onTilesChanged(); captureSunBaseline() }
        ui.post { onDone(ok) }
    }
    private val ui = android.os.Handler(android.os.Looper.getMainLooper())

    override fun run() {
        Native.boot()
        if (!coreFounded) {
            Native.resetWorld()
            Native.initWorld(11)
            bootWorld?.let { Native.load(it) } // the autosaved pond, if there is one (U0.6)
            coreFounded = true
        }
        // Never past founding: a surface re-created after a lock, or an activity re-created over
        // the living core, must not load a stale autosave over the fresher world in memory.
        bootWorld = null
        Native.markPrev()
        renderer = Renderer(density)
        ivSeen = Native.ivCount() // interventions from a restored save are history, not fresh
        // "Shipped" for the Evolution presets = the mutation rates this world founded with.
        if (shippedSigma.isEmpty()) for (sp in 0 until 7) for (k in 0 until Native.locusCount(sp))
            shippedSigma[sp * 4 + k] = Native.locusGet(sp, k, 0)
        // The badge's memory survives lock/unlock (same view instance). A re-created ACTIVITY
        // re-baselines from the live sky — a standing change from before the recreation stops
        // being badged; accepted, the world itself is what must survive.
        if (baseSun.isEmpty()) captureSunBaseline()

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
                Native.levelScript() // F4/F5: per tick, inside the loop — a scripted sun rises on its tick at any pace
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

            stats = "t %d   %s".format(Native.tick(), popLine())
            statsDev = "z %.2f   %.1f ms/frame  (core %.2f)  %d drawn".format(
                cam.z / density, frameMs, buildMs, renderer.orgN,
            )
            card = renderer.cardText(selI, selGen)
            clock = "t %d".format(Native.tick())
            // The standing-change badge (U2.3): does the sun differ from this world's founding?
            if (baseSun.size == 5 && Native.sourceCount() > 0) {
                val di = Native.sourceNum(0, 2) - baseSun[2]
                val moved = hypot(wrapDelta(Native.sourceNum(0, 0) - baseSun[0]),
                    wrapDelta(Native.sourceNum(0, 1) - baseSun[1])) > 2.0
                val dimmed = kotlin.math.abs(di) > 0.005
                if (moved || dimmed) {
                    if (sunChangeTick < 0) sunChangeTick = Native.tick()
                    val mins = (Native.tick() - sunChangeTick) / 600
                    val what = StringBuilder(s(R.string.label_sun))
                    if (dimmed) what.append(" %+.1f".format(di))
                    if (moved) what.append(" · ").append(s(R.string.sun_badge_moved))
                    what.append(" · ").append(
                        if (mins < 1) s(R.string.sun_badge_just) else s(R.string.sun_badge_standing, mins))
                    sunBadge = what.toString()
                } else { sunChangeTick = -1L; sunBadge = "" }
            } else sunBadge = ""
            // Where the gripped sun is on screen this frame, for the drag-start test (U0.4).
            val gs = sunSel
            if (gs in 0 until Native.sourceCount()) {
                gripSx = (wrapDelta(Native.sourceNum(gs, 0) - cam.x) * cam.z + width / 2.0).toFloat()
                gripSy = (wrapDelta(Native.sourceNum(gs, 1) - cam.y) * cam.z + height / 2.0).toFloat()
                sunInfo = doubleArrayOf(Native.sourceNum(gs, 2), Native.sourceNum(gs, 3),
                    Native.sourceNum(gs, 4), Native.sourceCount().toDouble())
            } else {
                gripSx = Float.NaN
                gripSy = Float.NaN
                sunInfo = null
            }
            mutationOn = Native.scalar(50) != 0.0
            evolutionAllowed = Native.levelAllows(4) != 0
            homeSunLocked = Native.levelAllowsSource(0) == 0
            selSpecies = if (selI >= 0 && Native.frameSel(selI, selGen, 0) != 0.0)
                Native.org(selI, 1).toInt() else -1
            specimen = if (selSpecies >= 0) {
                val sp = selSpecies
                Specimen(sp, Native.org(selI, 9) != 0.0, Native.org(selI, 5),
                    10.0 * Native.org(selI, 6), Native.org(selI, 6), Native.org(selI, 7),
                    (Native.tick() - Native.org(selI, 8).toLong()) / 600,
                    renderer.locusText[sp].mapIndexed { k, t ->
                        Locus(L10n.trait(t[0]), t[0], Native.org(selI, 20 + k),
                            Native.locusGet(sp, k, 16), L10n.trait(t[2]), L10n.trait(t[1]))
                    })
            } else null
            // The undo chip is an offer, not a monument (owner round 3: "undo pour never
            // vanishes"): it shows while the intervention is fresh and leaves after 45 s. The
            // outrun study's ground for the number: undo within a minute is functionally a time
            // machine; past that the world has moved on, and so should the chrome.
            val ivn = Native.ivCount()
            if (ivn != ivSeen) {
                ivSeen = ivn
                ivFreshUntil = System.nanoTime() + 45_000_000_000L
            }
            undoKind = if (System.nanoTime() < ivFreshUntil) Native.undoKind() else 0
            undoSpecies = Native.undoSpecies()
            if (dataOpen && dataFrame++ % 15 == 0) publishData()
            publishLevel()
        }
    }

    /** What the Observatory can say about one intervention. Render thread only. */
    private fun impactLine(i: Int): String {
        return when (Native.impact(i)) {
            0 -> s(R.string.impact_rolled)
            1 -> s(R.string.impact_watching, Native.impactNum(0).toInt())
            else -> {
                val n = Native.impactNum(2).toInt()
                val sb = StringBuilder()
                if (n == 0) sb.append(s(R.string.impact_none))
                else {
                    sb.append(s(R.string.impact_since))
                    for (k in 0 until n) {
                        if (k > 0) sb.append(" · ")
                        val pct = Native.impactMover(k, 1)
                        sb.append(L10n.trait(Native.impactMoverName(k))).append(' ')
                            .append(if (pct > 0) "+" else "").append(pct.toInt()).append('%')
                        if (Native.impactMover(k, 2) == 0.0) sb.append(s(R.string.impact_natural_swing))
                    }
                }
                val tails = ArrayList<String>()
                val rec = Native.impactNum(3)
                if (!rec.isNaN() && rec != 0.0) tails.add(s(R.string.impact_relaxed, rec.toInt()))
                else if (Native.impactNum(1) != 0.0) tails.add(s(R.string.impact_settling))
                else if (Native.impactNum(6) == 0.0) tails.add(s(R.string.impact_developing))
                if (Native.impactNum(4) != 0.0) tails.add(s(R.string.impact_mixed))
                if (Native.impactNum(5) != 0.0) tails.add(s(R.string.impact_sun_regime))
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
        if (left >= 0) sb.append(s(R.string.pours_left, left.toInt()))
        levelHud = "t ${Native.tick()}/$levelDeadline   $sb"
        levelWhy = if (st == 3) L10n.why(Native.levelFailWhy()) else ""
        levelPredicted = Native.levelNum(4).toInt()
        val nk = Native.levelNarration()
        levelNarration = if (nk >= 0) L10n.narrate(Native.sysEventText(nk, 1)) else ""
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

        publishTraits(rec, head, n)

        val sb = StringBuilder()
        if (Native.indOk() == 0) sb.append(s(R.string.health_gathering))
        else {
            sb.append(s(R.string.health_variety, Native.indNum(1), Native.indNum(2))).append('\n')
            val rec2 = Native.indNum(3)
            sb.append(s(R.string.health_recycling,
                if (rec2.isNaN()) "–" else s(R.string.health_every, (rec2 * 60).roundToInt()),
                Native.indNum(4).toInt())).append('\n')
            val ad = Native.indNum(0)
            if (!ad.isNaN()) sb.append(s(R.string.health_adapt, ad)).append('\n')
            sb.append('\n').append(s(R.string.health_vitals_header)).append('\n')
            for (sp in 0 until 7) {
                if (Native.indStrain(sp, 0) == 0.0) continue
                val lvl = Native.indStrain(sp, 1).toInt()
                val word = s(if (lvl == 2) R.string.vital_critical
                             else if (lvl == 1) R.string.vital_tense else R.string.vital_calm)
                val trend = Native.indStrain(sp, 3)
                val arrow = if (trend < -0.03) "↓" else if (trend > 0.03) "↑" else "→"
                sb.append(s(R.string.health_row,
                    renderer.speciesName[sp], (Native.indStrain(sp, 2) * 100).toInt(), arrow,
                    Native.indStrain(sp, 4), word)).append('\n')
            }
            if (Native.indVenator(0) != 0.0)
                sb.append(s(R.string.health_venator,
                    "Venator", (Native.indVenator(1) * 100).toInt(), Native.indVenator(2))).append('\n')
            sb.append('\n').append(s(R.string.health_reference))
        }
        healthText = sb.toString()

        // The player's own hands first, each with its card. Rule 6: "since", never "because".
        val ev = StringBuilder()
        val ivs = Native.ivCount()
        for (i in ivs - 1 downTo maxOf(0, ivs - 8)) {
            ev.append("t %-6d %s\n".format(Native.ivAt(i, 0).toLong(), ivLabel[Native.ivAt(i, 1).toInt()]))
            ev.append("        ").append(impactLine(i)).append('\n')
        }
        if (ivs > 0) ev.append('\n')
        val count = Native.sysEventCount()
        for (i in count - 1 downTo maxOf(0, count - 40)) {
            ev.append("t %-6d %s\n".format(Native.sysEventNum(i, 0).toLong(),
                L10n.narrate(Native.sysEventText(i, 1))))
        }
        if (count == 0) ev.append(s(R.string.events_none))
        eventsText = ev.toString()
    }

    /**
     * The Traits page's data (EV, mirroring src/ui-data.jsx drawTraits): per (species, locus)
     * the mean±sd ribbon out of the recorder's locus channels, the founder value, the pole
     * words through [L10n], and a 24-bin histogram of the living population's genotypes read
     * straight off the organisms. Render thread only, like everything that touches the core.
     */
    private fun publishTraits(rec: java.nio.FloatBuffer, head: Int, n: Int) {
        val defs = bandDefs ?: buildList {
            for (sp in 0 until 7) {
                if (Native.speciesFlag(sp, 1) != 0) continue // the apex carries no locus (decision 3)
                for (k in 0 until minOf(Native.locusCount(sp), LOCUS_CH.size))
                    add(intArrayOf(sp, k, LOCUS_CH[k][0] + sp, LOCUS_CH[k][1] + sp))
            }
        }.also { bandDefs = it }
        if (defs.isEmpty()) return
        val series = FloatArray(defs.size * 2 * n)
        for ((b, d) in defs.withIndex()) for (k in 0 until n) {
            val row = ((head - n + k + REC_N) % REC_N) * REC_CH
            series[(b * 2) * n + k] = rec.get(row + d[2])
            series[(b * 2 + 1) * n + k] = rec.get(row + d[3])
        }
        // one pass over the living for every band's histogram
        val hists = Array(defs.size) { FloatArray(DataView.HIST_BINS) }
        val alive = IntArray(defs.size)
        val slotOf = HashMap<Int, Int>()
        for ((b, d) in defs.withIndex()) slotOf[d[0] * 4 + d[1]] = b
        val cnt = Native.scalar(0).toInt()
        for (i in 0 until cnt) {
            if (Native.org(i, 0) == 0.0) continue
            val sp = Native.org(i, 1).toInt()
            for (k in 0 until minOf(Native.locusCount(sp), LOCUS_CH.size)) {
                val b = slotOf[sp * 4 + k] ?: continue
                val g = Native.org(i, 20 + k)
                hists[b][(g * DataView.HIST_BINS).toInt().coerceIn(0, DataView.HIST_BINS - 1)]++
                alive[b]++
            }
        }
        traitBands = Array(defs.size) { b ->
            val d = defs[b]
            val sp = d[0]
            val mean = if (n > 0) series[(b * 2) * n + n - 1] else 0f
            val sd = if (n > 0) series[(b * 2 + 1) * n + n - 1] else 0f
            DataView.Band(
                android.graphics.Color.rgb(Native.specNum(sp, 0, 0, 0).toInt(),
                    Native.specNum(sp, 0, 0, 1).toInt(), Native.specNum(sp, 0, 0, 2).toInt()),
                Native.traitText(sp, 0) + " · " + L10n.trait(Native.traitText(sp, 10 + d[1])).lowercase(),
                s(R.string.trait_stats, mean, sd),
                Native.locusGet(sp, d[1], 16).toFloat(),
                L10n.trait(Native.traitText(sp, 30 + d[1])),
                L10n.trait(Native.traitText(sp, 20 + d[1])),
                alive[b], hists[b],
            )
        }
        traitSeries = series
    }

    private fun popLine(): String {
        val p = renderer.pops
        return "S %d  D %d  C %d  B %d  V %d".format(p[0], p[1], p[2], p[3], p[6])
    }

    /** Last frame's census, for the status strip. Safe to read from the UI thread. */
    fun popOf(sp: Int): Int = if (::renderer.isInitialized) renderer.pops[sp] else 0

    /** One frame. Returns the nanoseconds the core spent building the display list. */
    private fun paintOnce(alpha: Double): Long {
        // A holder that cannot give a hardware canvas (a surface mid-teardown; Robolectric's
        // fake in the boot gate) gets the software one instead of killing the render thread.
        val c: Canvas = (try { holder.lockHardwareCanvas() }
            catch (e: IllegalStateException) { holder.lockCanvas() }) ?: return 0
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
