package org.microcosm.app

import android.app.Activity
import android.app.AlertDialog
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

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
    private lateinit var actions: LinearLayout
    private lateinit var undoChip: Button
    private lateinit var modeButton: Button
    private lateinit var wallButton: Button
    private lateinit var feedButton: Button
    private lateinit var killButton: Button
    private lateinit var sunBar: LinearLayout
    private lateinit var dataPanel: LinearLayout
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

    private val tickHud = object : Runnable {
        override fun run() {
            hud.text = world.stats
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
        actions = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(12, 0, 12, 0)
            visibility = ViewGroup.GONE
        }
        // Rows come from Chrome so the layout gate measures the row that ships, not a copy of
        // it (docs/app-ux-review.md §6).
        val tools = Chrome.row(this, Chrome.TOOLS) { k ->
            when (k) {
                0 -> world.feedSelected()
                1 -> world.killSelected()
                2 -> seedPicker()
                else -> world.wallArmed = !world.wallArmed
            }
        }
        while (tools.childCount > 0) actions.addView(tools.getChildAt(0))
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

        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(12, 12, 12, 12)
        }
        val barRow = Chrome.row(this, Chrome.BAR) { k ->
            when (Chrome.BAR[k]) {
                "pause" -> world.speed = 0.0
                "1x" -> world.speed = 1.0
                "4x" -> world.speed = 4.0
                "16x" -> world.speed = 16.0
                "mode" -> world.intervene = !world.intervene
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
        }
        while (barRow.childCount > 0) bar.addView(barRow.getChildAt(0))
        modeButton = Chrome.at(bar, Chrome.BAR, "mode")
        bottom.addView(bar)
        root.addView(bottom, FrameLayout.LayoutParams(MATCH, WRAP).apply { gravity = Gravity.BOTTOM })

        // Data mode: the Observatory's screen, over the world rather than beside it. Charts are
        // drawn from the series the render thread copies out; Health and Events are its text.
        dataPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
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
        val pages = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(12, 0, 12, 0) }
        val pageRow = Chrome.row(this, Chrome.PAGES) { k -> dataPage = k; refreshData() }
        while (pageRow.childCount > 0) pages.addView(pageRow.getChildAt(0))
        dataPanel.addView(pages)
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

    private fun saveOrLoad() {
        val f = saveFile()
        val has = f.baseFile.exists()
        val items = if (has) arrayOf("save the world", "load the saved world") else arrayOf("save the world")
        AlertDialog.Builder(this)
            .setTitle("Saved world")
            .setItems(items) { _, k ->
                if (k == 0) world.save { bytes ->
                    var out: java.io.FileOutputStream? = null
                    try {
                        out = f.startWrite()
                        out.write(bytes)
                        f.finishWrite(out)
                        toast("Saved — %d KB".format(bytes.size / 1024))
                    } catch (e: Exception) {
                        if (out != null) f.failWrite(out)
                        toast("Could not save: ${e.message}")
                    }
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
            sb.append("\n\n(tap to dismiss · \"exp\" to run it again)")
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

    override fun onResume() {
        super.onResume()
        ui.post(tickHud)
    }

    override fun onPause() {
        super.onPause()
        ui.removeCallbacks(tickHud)
    }

    private companion object {
        val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
        val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT
    }
}
