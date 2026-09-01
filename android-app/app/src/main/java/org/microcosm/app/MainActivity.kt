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

    internal lateinit var world: WorldView // internal so the boot gate can drive the real view
    private lateinit var hud: TextView
    private lateinit var card: TextView
    private lateinit var reportView: TextView
    private lateinit var undoChip: Button
    private lateinit var resetButton: Button
    private lateinit var benchButton: Button
    private var resetArmedAt = 0L
    private lateinit var sunBar: LinearLayout

    // ---- the sheet (U2.1): peek / half / full, the bar's heir. Internal: the boot gate walks it. ----
    internal enum class Detent { PEEK, HALF, FULL }
    internal var detent = Detent.PEEK
    private lateinit var sheet: LinearLayout
    private lateinit var halfSection: LinearLayout
    private lateinit var fullSection: LinearLayout
    private lateinit var modeSwitchView: LinearLayout
    private lateinit var paceBox: LinearLayout
    private lateinit var tilesRow: LinearLayout
    private lateinit var armedChip: Button
    private val speciesPills = ArrayList<LinearLayout>()
    private lateinit var dataPanel: LinearLayout
    private lateinit var pagesRow: View
    private lateinit var dataView: DataView
    private lateinit var dataText: TextView
    private lateinit var dataTitle: TextView
    private var dataPage = 0
    private lateinit var levelChip: TextView
    private lateinit var verdict: TextView
    internal lateinit var startPanel: LinearLayout // internal: the boot gate walks the front door
    internal lateinit var expPanel: LinearLayout
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
            card.text = if (text.isEmpty()) "tap a creature in the pond to read it here" else text
            for ((k, sp) in live.withIndex()) {
                val hiddenNow = world.hidden and (1 shl sp) != 0
                chips[k].text = "%s %d".format(shortName(sp), world.popOf(sp))
                chips[k].alpha = if (hiddenNow) 0.35f else 1f
            }
            // The levers show themselves only when they apply: amber is the hand, and a hand with
            // nothing to touch is clutter.
            val on = world.intervene
            Chrome.switchState(this@MainActivity, modeSwitchView, on)
            Chrome.paceSelect(this@MainActivity, paceBox,
                when { world.speed >= 16 -> 3; world.speed >= 4 -> 2; world.speed >= 1 -> 1; else -> 0 })
            val hasSel = world.selSpecies >= 0
            Chrome.tileState(this@MainActivity, Chrome.rowOf(tilesRow).getChildAt(0) as LinearLayout, false, on && hasSel)
            Chrome.tileState(this@MainActivity, Chrome.rowOf(tilesRow).getChildAt(1) as LinearLayout, false, on && hasSel)
            Chrome.tileState(this@MainActivity, Chrome.rowOf(tilesRow).getChildAt(2) as LinearLayout, world.seedSpecies >= 0, on)
            Chrome.tileState(this@MainActivity, Chrome.rowOf(tilesRow).getChildAt(3) as LinearLayout, world.wallArmed, on)
            sunBar.visibility = if (on && world.sunSel >= 0) ViewGroup.VISIBLE else ViewGroup.GONE
            // the armed tool rides the peek row: the sheet is down while the hand works
            val armedText = when {
                !on -> ""
                world.wallArmed -> "wall armed · drag on the water"
                world.seedSpecies >= 0 -> "seed ${Native.traitText(world.seedSpecies, 0)} · long-press the water"
                else -> ""
            }
            armedChip.text = armedText
            armedChip.visibility = if (armedText.isEmpty()) ViewGroup.GONE else ViewGroup.VISIBLE
            undoChip.visibility =
                if (world.undoKind != 0 && armedText.isEmpty()) ViewGroup.VISIBLE else ViewGroup.GONE
            undoChip.text = undoLabel(world.undoKind, world.undoSpecies)
            for ((k, sp) in live.withIndex()) {
                val hiddenNow = world.hidden and (1 shl sp) != 0
                speciesPills[k].alpha = if (hiddenNow) 0.45f else 1f
                speciesPills[k].background = Style.touchable(this@MainActivity,
                    if (hiddenNow) Style.pillDashed(this@MainActivity) else Style.pill(this@MainActivity))
            }
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
            textSize = 12f
            typeface = Style.mono(this@MainActivity)
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
                textSize = 12f
                typeface = Style.mono(this@MainActivity)
                setPadding(0, 6, 28, 6) // passive since U2.1: the toggles live in the sheet (D3)
            }
            chips.add(chip)
            strip.addView(chip)
        }
        top.addView(strip)

        // The experiment's objective, in the top stack's flow rather than over it: it never covers
        // the world, however many lines it grows to.
        levelChip = TextView(this).apply {
            setTextColor(Color.parseColor("#C9D7E3"))
            textSize = 13f
            typeface = Style.word(this@MainActivity)
            setPadding(0, 10, 0, 0)
            visibility = ViewGroup.GONE
        }
        top.addView(levelChip)
        top.setBackgroundColor(Color.parseColor("#D00B131E"))
        root.addView(top, FrameLayout.LayoutParams(MATCH, WRAP).apply { gravity = Gravity.TOP })

        // ---- the sheet (U2.1): peek / half / full, the scrolling bar's heir ----
        // The half detent is the tool chest, not the workbench: choosing a lever arms it and
        // lowers the sheet to peek — the act happens on the open water (the plan's rule, decided
        // at the mockups). Hand-rolled per D1; the browser designed this sheet first.
        val bottom = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        sheet = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = Style.sheet(this@MainActivity)
            setPadding(Style.dp(this@MainActivity, 20f), 0, Style.dp(this@MainActivity, 20f),
                Style.dp(this@MainActivity, 10f))
        }

        // the handle: a 48 dp strip that drags (or taps) between detents
        val handle = FrameLayout(this).apply {
            minimumHeight = Style.dp(this@MainActivity, 30f)
            addView(View(this@MainActivity).apply {
                background = Style.pill(this@MainActivity).apply { setColor(Color.argb(89, 148, 178, 204)) }
            }, FrameLayout.LayoutParams(Style.dp(this@MainActivity, 36f), Style.dp(this@MainActivity, 4f))
                .apply { gravity = Gravity.CENTER })
        }
        var downY = 0f
        handle.setOnTouchListener { v, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> { downY = e.rawY; true }
                MotionEvent.ACTION_UP -> {
                    val dy = e.rawY - downY
                    val slop = ViewConfiguration.get(this).scaledTouchSlop
                    when {
                        dy < -slop -> sheetTo(if (detent == Detent.PEEK) Detent.HALF else Detent.FULL)
                        dy > slop -> sheetTo(if (detent == Detent.FULL) Detent.HALF else Detent.PEEK)
                        else -> { v.performClick(); sheetTo(if (detent == Detent.PEEK) Detent.HALF else Detent.PEEK) }
                    }
                    true
                }
                else -> true
            }
        }
        sheet.addView(handle, LinearLayout.LayoutParams(MATCH, WRAP))

        // the peek row: the mode switch, and the hand's standing state (armed tool, or undo)
        val peekRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        modeSwitchView = Chrome.modeSwitch(this) {
            world.intervene = !world.intervene
            if (!world.intervene) { world.wallArmed = false; world.seedSpecies = -1 }
        }
        peekRow.addView(modeSwitchView)
        peekRow.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        armedChip = button("") {
            // tapping the armed chip stands the tool down
            world.wallArmed = false
            world.seedSpecies = -1
        }.apply {
            visibility = ViewGroup.GONE
            setTextColor(Style.AMBER)
            background = Style.touchable(this@MainActivity, Style.hand(this@MainActivity))
        }
        peekRow.addView(armedChip)
        undoChip = button("undo") { world.undoLast() }.apply {
            visibility = ViewGroup.GONE
            setTextColor(Style.AMBER)
            background = Style.touchable(this@MainActivity, Style.hand(this@MainActivity))
        }
        peekRow.addView(undoChip)
        sheet.addView(peekRow, LinearLayout.LayoutParams(MATCH, WRAP))

        // The sun's own controls, shown while a sun is gripped — at any detent, because the grip
        // happens on the open water. (The row goes in whole: moving children between parents was
        // the U.0 splash crash.)
        sunBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            visibility = ViewGroup.GONE
        }
        sunBar.addView(TextView(this).apply {
            text = "sun "
            setTextColor(Style.AMBER)
            textSize = 13f
            typeface = Style.word(this@MainActivity)
            setPadding(0, 0, Style.dp(this@MainActivity, 8f), 0)
        })
        sunBar.addView(Chrome.row(this, Chrome.SUN) { k ->
            when (k) {
                0 -> nudgeSun(-0.15)
                1 -> nudgeSun(0.15)
                else -> world.sunSel = -1
            }
        })
        sheet.addView(sunBar, LinearLayout.LayoutParams(MATCH, WRAP))

        // ---- the half detent: the tool chest ----
        halfSection = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = ViewGroup.GONE
        }
        halfSection.addView(sectionLabel("pace"))
        paceBox = Chrome.build(this, "pace") { k ->
            world.speed = when (k) { 0 -> 0.0; 1 -> 1.0; 2 -> 4.0; else -> 16.0 }
        } as LinearLayout
        halfSection.addView(paceBox, LinearLayout.LayoutParams(MATCH, WRAP))
        halfSection.addView(sectionLabel("the hand · choosing a tool lowers the sheet"))
        tilesRow = Chrome.build(this, "tools") { k ->
            if (!world.intervene) { toast("intervene is off"); return@build }
            when (k) {
                0 -> world.feedSelected()
                1 -> world.killSelected()
                2 -> seedPicker()
                else -> {
                    world.wallArmed = !world.wallArmed
                    if (world.wallArmed) { world.seedSpecies = -1; sheetTo(Detent.PEEK) }
                }
            }
        } as LinearLayout
        halfSection.addView(tilesRow, LinearLayout.LayoutParams(MATCH, WRAP))
        halfSection.addView(sectionLabel("species · tap to hide"))
        val pillRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        for (sp in live) {
            val pill = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                background = Style.touchable(this@MainActivity, Style.pill(this@MainActivity))
                minimumHeight = Style.dp(this@MainActivity, 48f)
                setPadding(Style.dp(this@MainActivity, 14f), 0, Style.dp(this@MainActivity, 14f), 0)
                setOnClickListener { world.hidden = world.hidden xor (1 shl sp) }
                addView(View(this@MainActivity).apply {
                    background = android.graphics.drawable.GradientDrawable().apply {
                        setColor(speciesColor(sp)); cornerRadius = Style.dp(this@MainActivity, 4f).toFloat()
                    }
                }, LinearLayout.LayoutParams(Style.dp(this@MainActivity, 8f), Style.dp(this@MainActivity, 8f))
                    .apply { rightMargin = Style.dp(this@MainActivity, 7f) })
                addView(TextView(this@MainActivity).apply {
                    text = Native.traitText(sp, 0)
                    textSize = 13f
                    typeface = Style.word(this@MainActivity)
                    setTextColor(Style.TEXT)
                })
            }
            speciesPills.add(pill)
            val lp = LinearLayout.LayoutParams(WRAP, WRAP)
            if (pillRow.childCount > 0) lp.marginStart = Style.dp(this@MainActivity, 8f)
            pillRow.addView(pill, lp)
        }
        halfSection.addView(HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            addView(pillRow)
        }, LinearLayout.LayoutParams(MATCH, WRAP))
        halfSection.addView(sectionLabel(""))
        val utility = Chrome.build(this, "utility") { k ->
            when (Chrome.UTILITY[k]) {
                "reset" -> resetTapped()
                "save" -> saveOrLoad()
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
        } as LinearLayout
        resetButton = Chrome.at(utility, Chrome.UTILITY, "reset")
        benchButton = Chrome.at(utility, Chrome.UTILITY, "bench").apply { visibility = ViewGroup.GONE }
        halfSection.addView(utility, LinearLayout.LayoutParams(MATCH, WRAP))
        sheet.addView(halfSection, LinearLayout.LayoutParams(MATCH, WRAP))

        // ---- the full detent: the specimen, in depth ----
        fullSection = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = ViewGroup.GONE
        }
        card = TextView(this).apply {
            setTextColor(Color.parseColor("#C9D7E3"))
            textSize = 11f
            typeface = Style.mono(this@MainActivity)
            setPadding(0, Style.dp(this@MainActivity, 12f), 0, Style.dp(this@MainActivity, 8f))
        }
        fullSection.addView(ScrollView(this).apply { addView(card) },
            LinearLayout.LayoutParams(MATCH, 0, 1f))
        sheet.addView(fullSection, LinearLayout.LayoutParams(MATCH, WRAP))

        // the dev toggle lives where the telemetry it reveals lives: long-press the HUD
        hud.setOnLongClickListener {
            devMode = !devMode
            benchButton.visibility = if (devMode) ViewGroup.VISIBLE else ViewGroup.GONE
            toast(if (devMode) "renderer telemetry on" else "renderer telemetry off")
            true
        }

        bottom.addView(sheet, LinearLayout.LayoutParams(MATCH, WRAP))
        root.addView(bottom, FrameLayout.LayoutParams(MATCH, WRAP).apply { gravity = Gravity.BOTTOM })

        // Data mode: the Observatory's screen, over the world rather than beside it. Charts are
        // drawn from the series the render thread copies out; Health and Events are its text.
        // The panel itself catches horizontal swipes and turns them into page changes (U0.3).
        dataPanel = SwipePanel(this) { d ->
            dataPage = (dataPage + d).coerceIn(0, Chrome.PAGES.size - 1)
            refreshData()
        }.apply {
            setBackgroundColor(Style.SURFACE_SCRIM)
            visibility = ViewGroup.GONE
        }
        dataTitle = TextView(this).apply {
            setTextColor(Style.BRIGHT)
            textSize = 14f
            typeface = Style.wordMedium(this@MainActivity)
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
            typeface = Style.mono(this@MainActivity)
            setPadding(24, 12, 24, 24)
        }
        dataPanel.addView(ScrollView(this).apply { addView(dataText) },
            LinearLayout.LayoutParams(MATCH, 0, 1f))
        dataPanel.addView(button("close") { world.dataOpen = false; dataPanel.visibility = ViewGroup.GONE })
        root.addView(dataPanel, FrameLayout.LayoutParams(MATCH, MATCH))

        // The verdict card: what happened, and why, in the level's own words.
        verdict = TextView(this).apply {
            setTextColor(Color.parseColor("#C9D7E3"))
            background = Style.card(this@MainActivity)
            textSize = 14f
            typeface = Style.word(this@MainActivity)
            setPadding(40, 36, 40, 36)
            visibility = ViewGroup.GONE
            setOnClickListener { visibility = ViewGroup.GONE }
        }
        root.addView(ScrollView(this).apply { addView(verdict) },
            FrameLayout.LayoutParams(MATCH, WRAP).apply { gravity = Gravity.CENTER })

        reportView = TextView(this).apply {
            setTextColor(Color.parseColor("#C9D7E3"))
            background = Style.card(this@MainActivity)
            textSize = 11f
            typeface = Style.mono(this@MainActivity)
            setPadding(40, 36, 40, 36)
            visibility = ViewGroup.GONE
            setOnClickListener { visibility = ViewGroup.GONE }
        }
        root.addView(ScrollView(this).apply { addView(reportView) },
            FrameLayout.LayoutParams(MATCH, WRAP).apply { gravity = Gravity.CENTER })

        // The front door (U2.0, owner decision): Sandbox | Experiments, every level open. A real
        // screen over the world, not a dialog behind a bar button — the ladder was the most
        // carefully built thing in the app and the least reachable. The world waits underneath
        // (speed 0) until the player chooses.
        startPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Style.ABYSS)
            gravity = Gravity.CENTER_VERTICAL
            isClickable = true // consume touches; the pond underneath is not tappable yet
        }
        // The title the owner chose from the canvas: Deep Signal's stacked bold on the
        // Observatory chrome. One TextView with a two-tone spannable, so the panel's child
        // order (which the boot gate walks) stays put.
        startPanel.addView(TextView(this).apply {
            val t = android.text.SpannableString("MICRO\nCOSM")
            t.setSpan(android.text.style.ForegroundColorSpan(Style.BRIGHT), 0, 5,
                android.text.Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
            t.setSpan(android.text.style.ForegroundColorSpan(Color.argb(71, 232, 241, 248)), 6, 10,
                android.text.Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
            text = t
            textSize = 58f
            typeface = Style.wordBold(this@MainActivity)
            setLineSpacing(0f, 0.98f)
            gravity = Gravity.START
            setPadding(Style.dp(this@MainActivity, 32f), 0, Style.dp(this@MainActivity, 32f), Style.dp(this@MainActivity, 4f))
        })
        startPanel.addView(TextView(this).apply {
            text = "a small pond, entirely yours"
            setTextColor(Style.DIM)
            textSize = 15f
            typeface = Style.word(this@MainActivity)
            gravity = Gravity.START
            setPadding(Style.dp(this@MainActivity, 32f), 0, Style.dp(this@MainActivity, 32f), Style.dp(this@MainActivity, 40f))
        })
        val hasAutosave = autosaveFile().baseFile.exists()
        startPanel.addView(startChoice("sandbox",
            if (hasAutosave) "your pond, as you left it" else "a fresh pond") {
            world.stopLevel()
            running = null
            lastVerdict = 0
            startPanel.visibility = ViewGroup.GONE
            world.speed = 1.0
        })
        startPanel.addView(startChoice("experiments", "questions with a pond attached") {
            expPanel.visibility = ViewGroup.VISIBLE
        })
        root.addView(startPanel, FrameLayout.LayoutParams(MATCH, MATCH))

        // The ladder, as a screen: every experiment open, none gated behind another.
        expPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Style.ABYSS)
            visibility = ViewGroup.GONE
            isClickable = true
        }
        expPanel.addView(TextView(this).apply {
            text = "Experiments"
            setTextColor(Style.BRIGHT)
            textSize = 20f
            typeface = Style.wordBold(this@MainActivity)
            setPadding(Style.dp(this@MainActivity, 24f), Style.dp(this@MainActivity, 16f),
                Style.dp(this@MainActivity, 24f), Style.dp(this@MainActivity, 12f))
        })
        val expList = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        for (l in levels) expList.addView(startChoice("E${l.n}  ${l.title}", l.science) {
            expPanel.visibility = ViewGroup.GONE
            briefing(l)
        })
        expPanel.addView(ScrollView(this).apply { addView(expList) },
            LinearLayout.LayoutParams(MATCH, 0, 1f))
        expPanel.addView(button("back") { expPanel.visibility = ViewGroup.GONE })
        root.addView(expPanel, FrameLayout.LayoutParams(MATCH, MATCH))

        world.speed = 0.0 // the pond waits behind the front door

        // targetSdk 35 draws edge to edge on Android 15, so without this the HUD sits under the
        // clock and the buttons under the gesture pill — which is what the first screenshots showed.
        @Suppress("DEPRECATION")
        root.setOnApplyWindowInsetsListener { _, insets ->
            top.setPadding(24, insets.systemWindowInsetTop + 20, 24, 16)
            bottom.setPadding(0, 0, 0, insets.systemWindowInsetBottom)
            // The Data panel is a full-screen overlay, so it needs the insets itself — without
            // this its title renders under the status bar clock (the owner's screenshots).
            dataPanel.setPadding(0, insets.systemWindowInsetTop, 0, insets.systemWindowInsetBottom)
            startPanel.setPadding(0, insets.systemWindowInsetTop, 0, insets.systemWindowInsetBottom)
            expPanel.setPadding(0, insets.systemWindowInsetTop, 0, insets.systemWindowInsetBottom)
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

    /** A front-door row: the choice in full strength, what it means in a quieter line under it. */
    private fun startChoice(title: String, sub: String, onTap: () -> Unit): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = Style.touchable(this@MainActivity, Style.card(this@MainActivity))
            layoutParams = LinearLayout.LayoutParams(MATCH, WRAP).apply {
                leftMargin = Style.dp(this@MainActivity, 24f)
                rightMargin = Style.dp(this@MainActivity, 24f)
                bottomMargin = Style.dp(this@MainActivity, 14f)
            }
            setPadding(Style.dp(this@MainActivity, 20f), Style.dp(this@MainActivity, 20f),
                Style.dp(this@MainActivity, 20f), Style.dp(this@MainActivity, 20f))
            setOnClickListener { onTap() }
            addView(TextView(this@MainActivity).apply {
                text = title
                setTextColor(Style.BRIGHT)
                textSize = 17f
                typeface = Style.wordMedium(this@MainActivity)
            })
            addView(TextView(this@MainActivity).apply {
                text = sub
                setTextColor(Style.DIM)
                textSize = 13f
                typeface = Style.word(this@MainActivity)
                setPadding(0, Style.dp(this@MainActivity, 3f), 0, 0)
            })
        }

    /** Show the front door mid-session: the pond pauses, saved, and the subtitle tells the truth. */
    private fun showStart(sub: String) {
        world.speed = 0.0
        (startPanel.getChildAt(2) as LinearLayout).let { (it.getChildAt(1) as TextView).text = sub }
        startPanel.visibility = ViewGroup.VISIBLE
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
        startPanel.visibility = ViewGroup.GONE
        expPanel.visibility = ViewGroup.GONE
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
            if (k == dataPage) {
                setTextColor(Style.BRIGHT)
                typeface = Style.wordMedium(this@MainActivity)
                background = Style.touchable(this@MainActivity, Style.selected(this@MainActivity))
            } else {
                setTextColor(Style.TEXT)
                typeface = Style.word(this@MainActivity)
                background = Style.touchable(this@MainActivity, Style.quiet(this@MainActivity))
            }
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

    /** The sheet's detents: sections show by state, and only FULL takes real height. */
    internal fun sheetTo(d: Detent) {
        detent = d
        halfSection.visibility = if (d == Detent.PEEK) ViewGroup.GONE else ViewGroup.VISIBLE
        fullSection.visibility = if (d == Detent.FULL) ViewGroup.VISIBLE else ViewGroup.GONE
        val lp = sheet.layoutParams ?: return
        lp.height = if (d == Detent.FULL) (resources.displayMetrics.heightPixels * 0.72).toInt()
                    else ViewGroup.LayoutParams.WRAP_CONTENT
        sheet.layoutParams = lp
    }

    /** The canvas's section voice: 11 tracked caps, dim. */
    private fun sectionLabel(text: String): TextView = TextView(this).apply {
        this.text = text.uppercase()
        textSize = 11f
        letterSpacing = 0.14f
        typeface = Style.word(this@MainActivity)
        setTextColor(Style.DIM)
        setPadding(0, Style.dp(this@MainActivity, 14f), 0, Style.dp(this@MainActivity, 8f))
    }

    private fun disarmReset() {
        resetArmedAt = 0L
        resetButton.text = "reset"
        resetButton.setTextColor(Style.TEXT)
    }

    /** The seeding picker: choose a species, then long-press the water to found a pack there. */
    private fun seedPicker() {
        val names = live.map { Native.traitText(it, 0) }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("Seed which species? Then long-press the water.")
            .setItems(names) { _, k -> world.seedSpecies = live[k]; world.wallArmed = false; sheetTo(Detent.PEEK) }
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
            expPanel.visibility == ViewGroup.VISIBLE -> expPanel.visibility = ViewGroup.GONE
            // On the front door, back leaves the app — the pond was saved on the way here, so
            // the exit costs nothing. (The old back-exit saved-then-finished because the
            // pause-time autosave lost the surface-teardown race, measured on the owner's
            // phone; routing the exit through the front door keeps that guarantee.)
            startPanel.visibility == ViewGroup.VISIBLE -> finish()
            reportView.visibility == ViewGroup.VISIBLE -> reportView.visibility = ViewGroup.GONE
            verdict.visibility == ViewGroup.VISIBLE -> verdict.visibility = ViewGroup.GONE
            world.dataOpen -> { world.dataOpen = false; dataPanel.visibility = ViewGroup.GONE }
            detent != Detent.PEEK -> sheetTo(if (detent == Detent.FULL) Detent.HALF else Detent.PEEK)
            world.sunSel >= 0 -> world.sunSel = -1
            world.wallArmed -> world.wallArmed = false
            world.intervene -> world.intervene = false
            else -> {
                // Top level: back goes to the front door, with the sandbox saved first. The
                // experiment list stays one back-press away for the whole session.
                if (running == null) world.save { bytes -> writeAtomic(autosaveFile(), bytes) }
                showStart(if (running != null) "your pond is waiting behind the experiment"
                          else "your pond, as it stands")
            }
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
