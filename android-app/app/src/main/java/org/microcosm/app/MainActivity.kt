package org.microcosm.app

import android.app.Activity
import android.app.AlertDialog
import android.graphics.Color
import android.graphics.Typeface
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import kotlin.math.abs

/**
 * The shell. A.1 gave it a world and a clock; A.2 gives it a camera, a selection, a status strip
 * and a specimen card.
 *
 * Everything that reads the core happens on the render thread and arrives here as published
 * strings — the core is single-threaded, and a card that reaches into it from the UI thread is a
 * race waiting for a busy frame.
 *
 * Deliberately plain Views. The real chrome — panels, the Data pages, the levels shell — arrives
 * with the increments that need it (docs/android-app-plan.md).
 */
class MainActivity : Activity() {

    private lateinit var world: WorldView
    private lateinit var hud: TextView
    private lateinit var card: TextView
    private lateinit var reportView: TextView
    private lateinit var actions: View
    private lateinit var undoChip: Button
    private lateinit var modeButton: Button
    private lateinit var resetButton: Button
    private lateinit var benchButton: Button
    private var resetArmedAt = 0L
    private lateinit var wallButton: Button
    private lateinit var feedButton: Button
    private lateinit var killButton: Button
    private lateinit var sunBar: LinearLayout
    private lateinit var dataPanel: LinearLayout
    private lateinit var pagesRow: View
    private lateinit var dataView: DataView
    private lateinit var dataText: TextView
    private lateinit var dataTitle: TextView
    private var dataPage = 0
    private lateinit var levelChip: TextView
    private lateinit var verdict: TextView
    private val levels by lazy { Level.all() }
    private var running: Level? = null
    private var lastVerdict = 0
    private val chips = ArrayList<TextView>()
    private val ui = Handler(Looper.getMainLooper())

    /** The species actually in play, asked of the core rather than listed here. */
    private val live by lazy { (0 until 7).filter { Native.speciesFlag(it, 0) != 0 } }

    /** Developer instrumentation on the player's screen? Off unless asked for (U0.7). */
    private var devMode = false

    private val tickHud = object : Runnable {
        override fun run() {
            hud.text = if (devMode) world.stats + "\n" + world.statsDev else world.stats
            val text = world.card
            card.text = text
            card.visibility = if (text.isEmpty()) ViewGroup.GONE else ViewGroup.VISIBLE
            for ((k, sp) in live.withIndex()) {
                val hiddenNow = world.hidden and (1 shl sp) != 0
                chips[k].text = "%s %d".format(shortName(sp), world.popOf(sp))
                chips[k].alpha = if (hiddenNow) 0.35f else 1f
            }
            // The levers show themselves only when they apply: amber is the hand, and a hand with
            // nothing to touch is clutter.
            val on = world.intervene
            modeButton.text = if (on) "intervene" else "observe"
            actions.visibility = if (on) ViewGroup.VISIBLE else ViewGroup.GONE
            val hasSel = world.selSpecies >= 0
            feedButton.visibility = if (on && hasSel) ViewGroup.VISIBLE else ViewGroup.GONE
            killButton.visibility = if (on && hasSel) ViewGroup.VISIBLE else ViewGroup.GONE
            sunBar.visibility = if (on && world.sunSel >= 0) ViewGroup.VISIBLE else ViewGroup.GONE
            wallButton.alpha = if (world.wallArmed) 1f else 0.6f
            undoChip.visibility = if (world.undoKind != 0) ViewGroup.VISIBLE else ViewGroup.GONE
            undoChip.text = undoLabel(world.undoKind, world.undoSpecies)
            if (world.dataOpen) refreshData()
            showLevel()
            world.report?.let {
                reportView.text = it
                reportView.visibility = ViewGroup.VISIBLE
            }
            ui.postDelayed(this, 250)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Native.boot() // before anything asks the core for a name or a flag

        val root = FrameLayout(this)
        world = WorldView(this)
        // The autosaved pond, restored before the render thread founds anything (U0.6). One pond
        // you keep: backgrounding the app no longer costs the world.
        world.bootWorld = try { autosaveFile().readFully() } catch (e: Exception) { null }
        root.addView(world, FrameLayout.LayoutParams(MATCH, MATCH))

        val top = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        hud = TextView(this).apply {
            setTextColor(Color.parseColor("#C9D7E3"))
            textSize = 11f
            typeface = Typeface.MONOSPACE
        }
        top.addView(hud)

        // The status strip: one chip per live species, coloured as the world colours it, tapping to
        // hide and show. `hidden` is the same bitmask the frame builder culls with.
        val strip = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 12, 0, 0)
        }
        for (sp in live) {
            val chip = TextView(this).apply {
                setTextColor(speciesColor(sp))
                textSize = 11f
                typeface = Typeface.MONOSPACE
                setPadding(0, 6, 28, 6)
                setOnClickListener { world.hidden = world.hidden xor (1 shl sp) }
            }
            chips.add(chip)
            strip.addView(chip)
        }
        top.addView(strip)

        // The experiment's objective, in the top stack's flow rather than over it: it never covers
        // the world, however many lines it grows to.
        levelChip = TextView(this).apply {
            setTextColor(Color.parseColor("#C9D7E3"))
            textSize = 11f
            typeface = Typeface.MONOSPACE
            setPadding(0, 10, 0, 0)
            visibility = ViewGroup.GONE
        }
        top.addView(levelChip)
        top.setBackgroundColor(Color.parseColor("#D00B131E"))
        root.addView(top, FrameLayout.LayoutParams(MATCH, WRAP).apply { gravity = Gravity.TOP })

        val bottom = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        card = TextView(this).apply {
            setTextColor(Color.parseColor("#C9D7E3"))
            setBackgroundColor(Color.parseColor("#E00B131E"))
            textSize = 11f
            typeface = Typeface.MONOSPACE
            setPadding(24, 20, 24, 20)
            visibility = ViewGroup.GONE
        }
        bottom.addView(card)

        // Intervene's own row: the levers that need a button rather than a touch on the world.
        // Rows come from Chrome.build so the layout gate measures the construct that ships —
        // scroll wrapper included — not a copy of it (docs/app-ux-review.md §6).
        actions = Chrome.build(this, "tools") { k ->
            when (k) {
                0 -> world.feedSelected()
                1 -> world.killSelected()
                2 -> seedPicker()
                else -> world.wallArmed = !world.wallArmed
            }
        }.apply {
            setPadding(12, 0, 12, 0)
            visibility = ViewGroup.GONE
        }
        feedButton = Chrome.at(actions, Chrome.TOOLS, "feed")
        killButton = Chrome.at(actions, Chrome.TOOLS, "kill")
        wallButton = Chrome.at(actions, Chrome.TOOLS, "wall")
        bottom.addView(actions)

        // The sun's own controls, shown while a sun is gripped. Drag the world to move it.
        sunBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(12, 0, 12, 0)
            visibility = ViewGroup.GONE
        }
        sunBar.addView(TextView(this).apply {
            text = "sun "
            setTextColor(Color.parseColor("#F2B24A"))
            textSize = 11f
            typeface = Typeface.MONOSPACE
            setPadding(0, 18, 8, 0)
        })
        val sunRow = Chrome.row(this, Chrome.SUN) { k ->
            when (k) {
                0 -> nudgeSun(-0.15)
                1 -> nudgeSun(0.15)
                else -> world.sunSel = -1
            }
        }
        while (sunRow.childCount > 0) sunBar.addView(sunRow.getChildAt(0))
        bottom.addView(sunBar)

        undoChip = button("undo") { world.undoLast() }.apply {
            visibility = ViewGroup.GONE
            setTextColor(Color.parseColor("#F2B24A"))
        }
        bottom.addView(undoChip)

        val bar = Chrome.build(this, "bar") { k ->
            when (Chrome.BAR[k]) {
                "pause" -> world.speed = 0.0
                "1x" -> world.speed = 1.0
                "4x" -> world.speed = 4.0
                "16x" -> world.speed = 16.0
                "mode" -> world.intervene = !world.intervene
                "reset" -> resetTapped()
                "save" -> saveOrLoad()
                "exp" -> experimentPicker()
                "data" -> {
                    world.dataOpen = true
                    dataPanel.visibility = ViewGroup.VISIBLE
                    refreshData()
                }
                else -> {
                    reportView.visibility = ViewGroup.GONE
                    world.speed = 0.0
                    world.benchmark()
                }
            }
        }.apply { setPadding(12, 12, 12, 12) }
        modeButton = Chrome.at(bar, Chrome.BAR, "mode")
        resetButton = Chrome.at(bar, Chrome.BAR, "reset")
        // The bench is the renderer measuring itself — developer instrumentation, not a lever.
        // It stays in the inventory (the gate measures the full row) and off the player's bar.
        benchButton = Chrome.at(bar, Chrome.BAR, "bench").apply { visibility = ViewGroup.GONE }
        // The dev toggle lives where the telemetry it reveals lives: long-press the HUD.
        hud.setOnLongClickListener {
            devMode = !devMode
            benchButton.visibility = if (devMode) ViewGroup.VISIBLE else ViewGroup.GONE
            toast(if (devMode) "renderer telemetry on" else "renderer telemetry off")
            true
        }
        bottom.addView(bar)
        root.addView(bottom, FrameLayout.LayoutParams(MATCH, WRAP).apply { gravity = Gravity.BOTTOM })

        // Data mode: the Observatory's screen, over the world rather than beside it. Charts are
        // drawn from the series the render thread copies out; Health and Events are its text.
        // The panel itself catches horizontal swipes and turns them into page changes (U0.3).
        dataPanel = SwipePanel(this) { d ->
            dataPage = (dataPage + d).coerceIn(0, Chrome.PAGES.size - 1)
            refreshData()
        }.apply {
            setBackgroundColor(Color.parseColor("#F00B131E"))
            visibility = ViewGroup.GONE
        }
        dataTitle = TextView(this).apply {
            setTextColor(Color.parseColor("#C9D7E3"))
            textSize = 12f
            typeface = Typeface.MONOSPACE
            setPadding(24, 20, 24, 8)
        }
        dataPanel.addView(dataTitle)
        pagesRow = Chrome.build(this, "pages") { k -> dataPage = k; refreshData() }
            .apply { setPadding(12, 0, 12, 0) }
        dataPanel.addView(pagesRow)
        dataView = DataView(this)
        dataPanel.addView(dataView, LinearLayout.LayoutParams(MATCH, 0, 1f))
        dataText = TextView(this).apply {
            setTextColor(Color.parseColor("#C9D7E3"))
            textSize = 11f
            typeface = Typeface.MONOSPACE
            setPadding(24, 12, 24, 24)
        }
        dataPanel.addView(ScrollView(this).apply { addView(dataText) },
            LinearLayout.LayoutParams(MATCH, 0, 1f))
        dataPanel.addView(button("close") { world.dataOpen = false; dataPanel.visibility = ViewGroup.GONE })
        root.addView(dataPanel, FrameLayout.LayoutParams(MATCH, MATCH))

        // The verdict card: what happened, and why, in the level's own words.
        verdict = TextView(this).apply {
            setTextColor(Color.parseColor("#C9D7E3"))
            setBackgroundColor(Color.parseColor("#F00B131E"))
            textSize = 12f
            typeface = Typeface.MONOSPACE
            setPadding(32, 32, 32, 32)
            visibility = ViewGroup.GONE
            setOnClickListener { visibility = ViewGroup.GONE }
        }
        root.addView(ScrollView(this).apply { addView(verdict) },
            FrameLayout.LayoutParams(MATCH, WRAP).apply { gravity = Gravity.CENTER })

        reportView = TextView(this).apply {
            setTextColor(Color.parseColor("#C9D7E3"))
            setBackgroundColor(Color.parseColor("#F00B131E"))
            textSize = 12f
            typeface = Typeface.MONOSPACE
            setPadding(32, 32, 32, 32)
            visibility = ViewGroup.GONE
            setOnClickListener { visibility = ViewGroup.GONE }
        }
        root.addView(ScrollView(this).apply { addView(reportView) },
            FrameLayout.LayoutParams(MATCH, WRAP).apply { gravity = Gravity.CENTER })

        // targetSdk 35 draws edge to edge on Android 15, so without this the HUD sits under the
        // clock and the buttons under the gesture pill — which is what the first screenshots showed.
        @Suppress("DEPRECATION")
        root.setOnApplyWindowInsetsListener { _, insets ->
            top.setPadding(24, insets.systemWindowInsetTop + 20, 24, 16)
            bottom.setPadding(0, 0, 0, insets.systemWindowInsetBottom)
            insets
        }
        root.requestApplyInsets()

        setContentView(root)
    }

    /** The species' own colour, from the core's bucket table — never a second palette here. */
    private fun speciesColor(sp: Int) = Color.rgb(
        Native.specNum(sp, 0, 0, 0).toInt(),
        Native.specNum(sp, 0, 0, 1).toInt(),
        Native.specNum(sp, 0, 0, 2).toInt(),
    )

    private fun shortName(sp: Int) = Native.traitText(sp, 0).take(3)

    /**
     * Save and load — the feature the whole port was for.
     *
     * `AtomicFile` writes to a shadow and renames, so a world half-written is a world not written:
     * the previous save survives a crash or a battery death mid-write. One slot for now; naming
     * saves is chrome, and the format carries its own version.
     */
    private fun saveFile() = android.util.AtomicFile(java.io.File(filesDir, "world.mcsm"))

    /** The autosave's own file (U0.6) — never the manual slot, which belongs to the player. */
    private fun autosaveFile() = android.util.AtomicFile(java.io.File(filesDir, "autosave.mcsm"))

    private fun writeAtomic(f: android.util.AtomicFile, bytes: ByteArray): Boolean {
        var out: java.io.FileOutputStream? = null
        return try {
            out = f.startWrite()
            out.write(bytes)
            f.finishWrite(out)
            true
        } catch (e: Exception) {
            if (out != null) f.failWrite(out)
            false
        }
    }

    private fun saveOrLoad() {
        val f = saveFile()
        val has = f.baseFile.exists()
        val items = if (has) arrayOf("save the world", "load the saved world") else arrayOf("save the world")
        AlertDialog.Builder(this)
            .setTitle("Saved world")
            .setItems(items) { _, k ->
                if (k == 0) world.save { bytes ->
                    if (writeAtomic(f, bytes)) toast("Saved — %d KB".format(bytes.size / 1024))
                    else toast("Could not save")
                } else {
                    val bytes = try { f.readFully() } catch (e: Exception) { null }
                    if (bytes == null) toast("Could not read the saved world")
                    else world.load(bytes) { ok ->
                        toast(if (ok) "Loaded" else "That file is not a Microcosm world")
                    }
                }
            }
            .setNegativeButton("cancel", null)
            .show()
    }

    private fun toast(s: String) =
        android.widget.Toast.makeText(this, s, android.widget.Toast.LENGTH_SHORT).show()

    /** The start screen, as a list: every experiment open, none of them gated behind another. */
    private fun experimentPicker() {
        val names = levels.map { "E${it.n}  ${it.title} — ${it.science}" }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("Experiments")
            .setItems(names) { _, k -> briefing(levels[k]) }
            .setNeutralButton("sandbox") { _, _ ->
                world.stopLevel()
                running = null
                lastVerdict = 0
            }
            .show()
    }

    /** The briefing, then the prediction. Committing is never graded — it is there to be contrasted. */
    private fun briefing(l: Level) {
        AlertDialog.Builder(this)
            .setTitle("E${l.n}  ${l.title}")
            .setMessage("${l.question}\n\n${l.briefing}\n\nGoal: ${l.goalText}")
            .setPositiveButton("begin") { _, _ -> predict(l) }
            .setNegativeButton("back", null)
            .show()
    }

    private fun predict(l: Level) {
        val opts = l.predictOptions
        if (opts.isEmpty()) { begin(l, -1); return }
        AlertDialog.Builder(this)
            .setTitle(l.predictPrompt)
            .setItems(opts.toTypedArray()) { _, k -> begin(l, k) }
            .setNegativeButton("skip") { _, _ -> begin(l, -1) }
            .show()
    }

    private fun begin(l: Level, predicted: Int) {
        running = l
        lastVerdict = 0
        verdict.visibility = ViewGroup.GONE
        world.startLevel(levels.indexOf(l), predicted, l.meterLabels, l.meterUnits, l.deadline)
        world.speed = 1.0
    }

    /** The objective chip while it runs, and the verdict card the moment it settles. */
    private fun showLevel() {
        val l = running
        val st = world.levelState
        if (l == null || st == 0) {
            levelChip.visibility = ViewGroup.GONE
            return
        }
        levelChip.visibility = ViewGroup.VISIBLE
        val head = "E${l.n} ${l.title}   ${l.goalText}"
        val narrated = world.levelNarration
        levelChip.text = head + "\n" + world.levelHud + (if (narrated.isEmpty()) "" else "\n⚑ $narrated")
        if (st != lastVerdict && st >= 2) {
            lastVerdict = st
            val passed = st == 2
            val sb = StringBuilder(if (passed) "✓ ${l.title}" else "✕ ${l.title}")
            if (!passed && world.levelWhy.isNotEmpty()) sb.append("\n\n").append(world.levelWhy)
            sb.append("\n\n").append(if (passed) l.debriefPass else l.debriefFail)
            // F1: contrast the prediction, never grade it
            val p = world.levelPredicted
            val reflect = l.predictReflect
            if (p >= 0 && p < reflect.size) sb.append("\n\nYou predicted: ").append(l.predictOptions[p])
                .append("\n").append(reflect[p])
            sb.append("\n\n(tap to dismiss · reset runs it again)")
            verdict.text = sb.toString()
            verdict.visibility = ViewGroup.VISIBLE
        }
    }

    private val PAGE_TITLES = listOf(
        "Populations — every line a species, on a log axis",
        "Chemistry — where every unit of mineral sits; the top edge is the world's total",
        "Metabolism — what the world produces and burns",
        "Health — vitals against measured reference ranges",
        "Events — the world's story, newest first; since is not because",
    )

    /** Chart pages draw; Health and Events are text. Only one of the two is ever visible. */
    private fun refreshData() {
        dataTitle.text = PAGE_TITLES[dataPage]
        // The selected page reads as selected (U0.3): full strength and bold, the rest receded.
        // Not amber — amber marks the player's hand on the world, and looking is not touching.
        val row = Chrome.rowOf(pagesRow)
        for (k in 0 until row.childCount) (row.getChildAt(k) as Button).apply {
            alpha = if (k == dataPage) 1f else 0.55f
            setTypeface(null, if (k == dataPage) Typeface.BOLD else Typeface.NORMAL)
        }
        val chart = dataPage <= 2
        dataView.visibility = if (chart) ViewGroup.VISIBLE else ViewGroup.GONE
        (dataText.parent as ViewGroup).visibility = if (chart) ViewGroup.GONE else ViewGroup.VISIBLE
        if (chart) {
            dataView.page = dataPage
            world.series?.let { dataView.submit(it, world.seriesN, IntArray(7) { sp -> speciesColor(sp) }) }
        } else {
            dataText.text = if (dataPage == 3) world.healthText else world.eventsText
        }
    }

    /**
     * Reset, guarded the browser's way (src/ui-reset.jsx): the first tap arms for 2.6 s and asks,
     * the second acts, and doing nothing disarms. U0.2 — the review's finding was not that reset
     * was broken but that it did not exist, while the verdict card promised it did.
     *
     * Inside an experiment, reset re-runs the experiment (`restartLevel` finally gets its caller).
     * In the sandbox it founds a fresh pond on a new random seed — UI-side randomness for reset
     * seeds is legal (CLAUDE.md rule 5).
     */
    private fun resetTapped() {
        val now = System.currentTimeMillis()
        if (now - resetArmedAt > 2600) {
            resetArmedAt = now
            resetButton.text = "sure?"
            resetButton.setTextColor(Color.parseColor("#F2B24A")) // the hand, about to act
            ui.postDelayed({ if (System.currentTimeMillis() - resetArmedAt >= 2600) disarmReset() }, 2700)
            return
        }
        disarmReset()
        if (running != null && world.levelState != 0) {
            lastVerdict = 0
            verdict.visibility = ViewGroup.GONE
            world.restartLevel()
        } else {
            running = null
            world.resetWorld(kotlin.random.Random.nextInt(1, 100000))
        }
    }

    private fun disarmReset() {
        resetArmedAt = 0L
        resetButton.text = "reset"
        resetButton.setTextColor(barTextColors)
    }

    /** The buttons' resting text colour, captured once so disarm can put it back. */
    private val barTextColors by lazy { modeButton.textColors }

    /** The seeding picker: choose a species, then long-press the water to found a pack there. */
    private fun seedPicker() {
        val names = live.map { Native.traitText(it, 0) }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("Seed which species? Then long-press the water.")
            .setItems(names) { _, k -> world.seedSpecies = live[k] }
            .setNegativeButton("none") { _, _ -> world.seedSpecies = -1 }
            .show()
    }

    /** The sun-intensity press, one step at a time. The core clamps; this only asks. */
    private fun nudgeSun(d: Double) {
        val k = world.sunSel
        if (k < 0) return
        world.post {
            Native.evSourceSet(k, Native.sourceNum(k, 2) + d, Native.sourceNum(k, 3), Native.sourceNum(k, 4))
        }
    }

    /** Names the thing that would be put back, in the world's own words. */
    private fun undoLabel(kind: Int, sp: Int): String {
        val who = if (sp >= 0) Native.traitText(sp, 0) else ""
        return when (kind) {
            1 -> "undo · fed $who"
            2 -> "undo · killed $who"
            3 -> "undo · seeded $who"
            4 -> "undo · poured mineral"
            5 -> "undo · the sunlight"
            6 -> "undo · moved the sun"
            7 -> "undo · added a sun"
            8 -> "undo · removed a sun"
            9 -> "undo · the sun's setting"
            10 -> "undo · built a wall"
            11 -> "undo · removed a wall"
            12 -> "undo · the wall's setting"
            else -> "undo"
        }
    }

    private fun button(label: String, onTap: () -> Unit) = Chrome.button(this, label, onTap)

    /**
     * Back closes what is open instead of leaving the app (U0.5) — on Android the press is close
     * to a reflex, and until now it always exited. Topmost first: the report, the verdict, Data,
     * then the held things (grip, armed wall, Intervene itself). Predictive back and a real back
     * stack are the redesign's problem (research lens 3); this only stops the reflex from killing
     * the session.
     */
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        when {
            reportView.visibility == ViewGroup.VISIBLE -> reportView.visibility = ViewGroup.GONE
            verdict.visibility == ViewGroup.VISIBLE -> verdict.visibility = ViewGroup.GONE
            world.dataOpen -> { world.dataOpen = false; dataPanel.visibility = ViewGroup.GONE }
            world.sunSel >= 0 -> world.sunSel = -1
            world.wallArmed -> world.wallArmed = false
            world.intervene -> world.intervene = false
            else -> @Suppress("DEPRECATION") super.onBackPressed()
        }
    }

    override fun onResume() {
        super.onResume()
        ui.post(tickHud)
    }

    override fun onPause() {
        super.onPause()
        ui.removeCallbacks(tickHud)
        // U0.6: the sandbox autosaves when the app goes to the background — before this, losing
        // the process lost the world with a working save slot a few lines away. Levels are not
        // autosaved: the snapshot carries the world and not the level runtime, and a restored
        // half-experiment would be a lie. Best effort by nature: the save is queued to the render
        // thread, which normally turns it around within a frame, but a process killed faster
        // keeps the previous autosave — atomically, never a torn file.
        if (running == null) world.save { bytes -> writeAtomic(autosaveFile(), bytes) }
    }

    private companion object {
        val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
        val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT
    }

    /**
     * A vertical panel whose horizontal swipes change the page (U0.3 — "Data had tabs but I could
     * not swipe between them"). Dependency-free by the app's own rule (A.1), so this is the small
     * honest kernel of a pager rather than ViewPager2: intercept a drag once it is decisively
     * horizontal (twice the slop, and twice as wide as it is tall), report its direction on
     * release. Vertical scrolling inside the panel is untouched, and a swipe that starts inside a
     * horizontally scrollable child — the pages row itself scrolls since U0.1 — is left alone,
     * because that child owns sideways motion.
     */
    private class SwipePanel(ctx: Context, val onSwipe: (Int) -> Unit) : LinearLayout(ctx) {
        private val slop = ViewConfiguration.get(ctx).scaledTouchSlop
        private var x0 = 0f
        private var y0 = 0f
        private var catching = false
        private var yielded = false // the touch began in a child that scrolls sideways itself

        init { orientation = VERTICAL }

        private fun inHScroll(v: View, x: Float, y: Float): Boolean {
            if (v is HorizontalScrollView) return true
            if (v is ViewGroup) for (i in 0 until v.childCount) {
                val c = v.getChildAt(i)
                if (c.visibility == View.VISIBLE &&
                    x >= c.left && x < c.right && y >= c.top && y < c.bottom &&
                    inHScroll(c, x - c.left + c.scrollX, y - c.top + c.scrollY)) return true
            }
            return false
        }

        override fun onInterceptTouchEvent(e: MotionEvent): Boolean {
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    x0 = e.x; y0 = e.y
                    catching = false
                    yielded = inHScroll(this, e.x, e.y)
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.x - x0
                    val dy = e.y - y0
                    if (!catching && !yielded && abs(dx) > 2 * slop && abs(dx) > 2 * abs(dy))
                        catching = true
                }
            }
            return catching
        }

        override fun onTouchEvent(e: MotionEvent): Boolean {
            if (e.actionMasked == MotionEvent.ACTION_UP && catching) {
                val dx = e.x - x0
                if (dx <= -2 * slop) onSwipe(1) else if (dx >= 2 * slop) onSwipe(-1)
                catching = false
            }
            return true
        }
    }
}
