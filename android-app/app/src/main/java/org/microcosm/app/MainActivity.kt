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

    // ---- the floating chrome (U2.R2, owner round 2). Internal pieces: the boot gate drives them. ----
    internal lateinit var interveneFab: android.widget.ImageButton
    internal lateinit var menuFab: android.widget.ImageButton
    internal lateinit var drawer: LinearLayout
    internal lateinit var specimenSheet: LinearLayout
    internal var dialOpen = false
        private set
    internal lateinit var toolsDial: LinearLayout
    private lateinit var fabLabel: TextView
    private lateinit var drawerScrim: View
    private lateinit var specimenName: TextView
    private lateinit var paceBox: LinearLayout
    private val speciesPills = ArrayList<LinearLayout>()
    private lateinit var dataPanel: LinearLayout
    private lateinit var pagesRow: View
    private lateinit var dataView: DataView
    private lateinit var dataText: TextView
    private lateinit var dataTitle: TextView
    private var dataPage = 0
    private lateinit var levelChip: TextView
    private lateinit var strip: LinearLayout
    private lateinit var clockView: TextView
    private lateinit var sunBadgeView: TextView
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
            if (devMode) hud.text = world.stats + "\n" + world.statsDev
            clockView.text = world.clock
            sunBadgeView.text = world.sunBadge + if (world.sunBadge.isEmpty()) "" else " · tap restores"
            sunBadgeView.visibility = if (world.sunBadge.isEmpty()) ViewGroup.GONE else ViewGroup.VISIBLE
            // In an experiment the objective IS the line (D2): the census yields to it.
            strip.visibility = if (running != null && world.levelState != 0) ViewGroup.GONE
                               else ViewGroup.VISIBLE
            card.text = world.card
            for ((k, sp) in live.withIndex()) {
                val hiddenNow = world.hidden and (1 shl sp) != 0
                chips[k].text = "%s %d".format(shortName(sp), world.popOf(sp))
                chips[k].alpha = if (hiddenNow) 0.35f else 1f
            }
            // The floating chrome (U2.R2): the fab is the hand — amber when the mode is on,
            // wearing the armed tool's icon while one stands, × while the dial is open.
            val on = world.intervene
            val hasSel = world.selSpecies >= 0
            val armedIcon = when {
                world.wallArmed -> R.drawable.ic_wall
                world.seedSpecies >= 0 -> R.drawable.ic_seed
                else -> 0
            }
            Chrome.fabState(this@MainActivity, interveneFab, on,
                when { armedIcon != 0 -> armedIcon; dialOpen -> R.drawable.ic_close; else -> R.drawable.ic_plus })
            val armedText = when {
                !on -> ""
                world.wallArmed -> "drag on the water"
                world.seedSpecies >= 0 -> "long-press the water"
                else -> ""
            }
            fabLabel.text = armedText
            fabLabel.visibility = if (armedText.isEmpty()) ViewGroup.GONE else ViewGroup.VISIBLE
            for (k in 0 until toolsDial.childCount) Chrome.dialRowState(this@MainActivity,
                toolsDial.getChildAt(k) as LinearLayout,
                (k == 3 && world.wallArmed) || (k == 2 && world.seedSpecies >= 0),
                if (k <= 1) hasSel else true)
            Chrome.paceSelect(this@MainActivity, paceBox,
                when { world.speed >= 16 -> 3; world.speed >= 4 -> 2; world.speed >= 1 -> 1; else -> 0 })
            sunBar.visibility = if (on && world.sunSel >= 0) ViewGroup.VISIBLE else ViewGroup.GONE
            undoChip.visibility =
                if (world.undoKind != 0 && armedText.isEmpty()) ViewGroup.VISIBLE else ViewGroup.GONE
            undoChip.text = undoLabel(world.undoKind, world.undoSpecies)
            // the specimen drawer follows the selection — the drawer the owner found missing
            specimenSheet.visibility = if (hasSel) ViewGroup.VISIBLE else ViewGroup.GONE
            if (hasSel) specimenName.text = Native.traitText(world.selSpecies, 0)
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
        // Developer telemetry, dev-mode only (U0.7); since U2.2 the whole TextView hides with it.
        hud = TextView(this).apply {
            setTextColor(Color.parseColor("#C9D7E3"))
            textSize = 12f
            typeface = Style.mono(this@MainActivity)
            visibility = ViewGroup.GONE
        }
        top.addView(hud)

        // THE ONE LINE (U2.2, D2): the clock and the census, passive, in the world's colours.
        // Everything else earns its place by being asked for. Long-press toggles dev telemetry.
        strip = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 0, 0, 0)
        }
        clockView = TextView(this).apply {
            setTextColor(Style.DIM)
            textSize = 12f
            typeface = Style.mono(this@MainActivity)
            setPadding(0, 6, 32, 6)
        }
        strip.addView(clockView)
        for (sp in live) {
            val chip = TextView(this).apply {
                setTextColor(speciesColor(sp))
                textSize = 12f
                typeface = Style.mono(this@MainActivity)
                setPadding(0, 6, 28, 6) // passive: the toggles live in the sheet (D3)
            }
            chips.add(chip)
            strip.addView(chip)
        }
        strip.setOnLongClickListener {
            devMode = !devMode
            hud.visibility = if (devMode) ViewGroup.VISIBLE else ViewGroup.GONE
            benchButton.visibility = if (devMode) ViewGroup.VISIBLE else ViewGroup.GONE
            toast(if (devMode) "renderer telemetry on" else "renderer telemetry off")
            true
        }
        // narrow phones: the line stays one line and peeks sideways rather than wrapping
        top.addView(HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            addView(strip)
        })

        // The standing-change badge (U2.3): the one lever measured to outrun its undo is a sun
        // change left standing unnoticed — so a standing change wears amber until it is put back,
        // and names its age instead of shouting. Tapping it puts the sun back as founded.
        sunBadgeView = TextView(this).apply {
            setTextColor(Style.AMBER)
            textSize = 12f
            typeface = Style.mono(this@MainActivity)
            background = Style.touchable(this@MainActivity, Style.pill(this@MainActivity, amber = true))
            minHeight = Style.dp(this@MainActivity, 40f)
            gravity = Gravity.CENTER_VERTICAL
            setPadding(Style.dp(this@MainActivity, 14f), 0, Style.dp(this@MainActivity, 14f), 0)
            visibility = ViewGroup.GONE
            setOnClickListener { world.putSunBack() }
        }
        top.addView(sunBadgeView, LinearLayout.LayoutParams(WRAP, WRAP).apply {
            topMargin = Style.dp(this@MainActivity, 6f)
        })

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

        // ---- the floating chrome (U2.R2, the owner's round 2) ----
        // Two overlay buttons over the pond, in the platform's own language: the hand is a fab
        // that speed-dials the four tools vertically; the menu slides in from the left. The
        // bottom sheet now belongs to the SPECIMEN alone — it opens when something is selected,
        // which is also the drawer the owner found missing.

        // the specimen drawer
        specimenSheet = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = Style.sheet(this@MainActivity)
            setPadding(Style.dp(this@MainActivity, 20f), Style.dp(this@MainActivity, 12f),
                Style.dp(this@MainActivity, 20f), Style.dp(this@MainActivity, 14f))
            visibility = ViewGroup.GONE
        }
        val specHeader = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        specimenName = TextView(this).apply {
            setTextColor(Style.BRIGHT)
            textSize = 17f
            typeface = Style.wordMedium(this@MainActivity)
        }
        specHeader.addView(specimenName, LinearLayout.LayoutParams(0, WRAP, 1f))
        specHeader.addView(button("feed") { world.feedSelected() },
            LinearLayout.LayoutParams(WRAP, WRAP).apply { marginEnd = Style.dp(this@MainActivity, 8f) })
        specHeader.addView(button("kill") { world.killSelected() })
        specimenSheet.addView(specHeader)
        card = TextView(this).apply {
            setTextColor(Color.parseColor("#C9D7E3"))
            textSize = 11f
            typeface = Style.mono(this@MainActivity)
            setPadding(0, Style.dp(this@MainActivity, 8f), 0, 0)
        }
        specimenSheet.addView(ScrollView(this).apply { addView(card) },
            LinearLayout.LayoutParams(MATCH, Style.dp(this@MainActivity, 200f)))
        root.addView(specimenSheet, FrameLayout.LayoutParams(MATCH, WRAP).apply { gravity = Gravity.BOTTOM })

        // floating centre chips: the sun's controls while gripped, undo while it applies
        val centerChips = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }
        sunBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = Style.card(this@MainActivity)
            setPadding(Style.dp(this@MainActivity, 14f), Style.dp(this@MainActivity, 4f),
                Style.dp(this@MainActivity, 8f), Style.dp(this@MainActivity, 4f))
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
        centerChips.addView(sunBar)
        undoChip = button("undo") { world.undoLast() }.apply {
            visibility = ViewGroup.GONE
            setTextColor(Style.AMBER)
            background = Style.touchable(this@MainActivity, Style.hand(this@MainActivity))
        }
        centerChips.addView(undoChip, LinearLayout.LayoutParams(WRAP, WRAP).apply {
            topMargin = Style.dp(this@MainActivity, 8f)
        })
        root.addView(centerChips, FrameLayout.LayoutParams(WRAP, WRAP).apply {
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            bottomMargin = Style.dp(this@MainActivity, 92f)
        })

        // the intervene fab and its speed dial
        val dialWrap = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.END
        }
        toolsDial = Chrome.build(this, "tools") { k -> onTool(k) } as LinearLayout
        toolsDial.visibility = ViewGroup.GONE
        dialWrap.addView(toolsDial)
        val fabRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        fabLabel = TextView(this).apply {
            setTextColor(Style.AMBER)
            textSize = 13f
            typeface = Style.word(this@MainActivity)
            background = Style.pill(this@MainActivity, amber = true)
            minHeight = Style.dp(this@MainActivity, 36f)
            gravity = Gravity.CENTER
            setPadding(Style.dp(this@MainActivity, 14f), 0, Style.dp(this@MainActivity, 14f), 0)
            visibility = ViewGroup.GONE
        }
        fabRow.addView(fabLabel, LinearLayout.LayoutParams(WRAP, WRAP).apply {
            marginEnd = Style.dp(this@MainActivity, 10f)
        })
        interveneFab = Chrome.fab(this, R.drawable.ic_plus) { onFabTap() }
        fabRow.addView(interveneFab)
        dialWrap.addView(fabRow)
        root.addView(dialWrap, FrameLayout.LayoutParams(WRAP, WRAP).apply {
            gravity = Gravity.BOTTOM or Gravity.END
            rightMargin = Style.dp(this@MainActivity, 20f)
            bottomMargin = Style.dp(this@MainActivity, 24f)
        })

        // the menu fab, mirrored bottom-left
        menuFab = Chrome.fab(this, R.drawable.ic_menu) { openDrawer() }
        root.addView(menuFab, FrameLayout.LayoutParams(Style.dp(this, 56f), Style.dp(this, 56f)).apply {
            gravity = Gravity.BOTTOM or Gravity.START
            leftMargin = Style.dp(this@MainActivity, 20f)
            bottomMargin = Style.dp(this@MainActivity, 24f)
        })

        // the menu drawer, sliding in from the left (owner: "standard best practice" — it is)
        drawerScrim = View(this).apply {
            setBackgroundColor(Color.argb(120, 0, 0, 0))
            visibility = ViewGroup.GONE
            setOnClickListener { closeDrawer() }
        }
        root.addView(drawerScrim, FrameLayout.LayoutParams(MATCH, MATCH))
        drawer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Style.ABYSS)
            visibility = ViewGroup.GONE
            isClickable = true
            setPadding(Style.dp(this@MainActivity, 20f), Style.dp(this@MainActivity, 20f),
                Style.dp(this@MainActivity, 20f), Style.dp(this@MainActivity, 20f))
        }
        val drawerBody = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        drawerBody.addView(TextView(this).apply {
            text = "Microcosm"
            setTextColor(Style.BRIGHT)
            textSize = 20f
            typeface = Style.wordBold(this@MainActivity)
            setPadding(0, 0, 0, Style.dp(this@MainActivity, 8f))
        })
        drawerBody.addView(sectionLabel("pace"))
        paceBox = Chrome.build(this, "pace") { k ->
            world.speed = when (k) { 0 -> 0.0; 1 -> 1.0; 2 -> 4.0; else -> 16.0 }
        } as LinearLayout
        drawerBody.addView(paceBox, LinearLayout.LayoutParams(MATCH, WRAP))
        drawerBody.addView(sectionLabel("species · tap to hide"))
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
            drawerBody.addView(pill, LinearLayout.LayoutParams(MATCH, WRAP).apply {
                bottomMargin = Style.dp(this@MainActivity, 8f)
            })
        }
        drawerBody.addView(sectionLabel(""))
        val utility = Chrome.build(this, "utility") { k ->
            when (Chrome.UTILITY[k]) {
                "reset" -> resetTapped()
                "save" -> { closeDrawer(); saveOrLoad() }
                "data" -> {
                    closeDrawer()
                    world.dataOpen = true
                    dataPanel.visibility = ViewGroup.VISIBLE
                    refreshData()
                }
                else -> {
                    closeDrawer()
                    reportView.visibility = ViewGroup.GONE
                    world.speed = 0.0
                    world.benchmark()
                }
            }
        } as LinearLayout
        resetButton = Chrome.at(utility, Chrome.UTILITY, "reset")
        benchButton = Chrome.at(utility, Chrome.UTILITY, "bench").apply { visibility = ViewGroup.GONE }
        drawerBody.addView(utility, LinearLayout.LayoutParams(MATCH, WRAP))
        drawerBody.addView(sectionLabel(""))
        drawerBody.addView(button("experiments") { closeDrawer(); expPanel.visibility = ViewGroup.VISIBLE },
            LinearLayout.LayoutParams(MATCH, WRAP))
        drawer.addView(ScrollView(this).apply { addView(drawerBody) },
            LinearLayout.LayoutParams(MATCH, MATCH))
        root.addView(drawer, FrameLayout.LayoutParams(Style.dp(this, 300f), MATCH).apply {
            gravity = Gravity.START
        })

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
            val ib = insets.systemWindowInsetBottom
            top.setPadding(24, insets.systemWindowInsetTop + 20, 24, 16)
            // The floating chrome clears the gesture pill; the specimen sheet absorbs it as padding.
            specimenSheet.setPadding(Style.dp(this, 20f), Style.dp(this, 12f),
                Style.dp(this, 20f), Style.dp(this, 14f) + ib)
            (menuFab.layoutParams as FrameLayout.LayoutParams).bottomMargin = Style.dp(this, 24f) + ib
            ((interveneFab.parent as View).parent as? View)?.let {
                (it.layoutParams as? FrameLayout.LayoutParams)?.bottomMargin = Style.dp(this, 24f) + ib
            }
            drawer.setPadding(Style.dp(this, 20f), Style.dp(this, 20f) + insets.systemWindowInsetTop,
                Style.dp(this, 20f), Style.dp(this, 20f) + ib)
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
        AlertDialog.Builder(this, R.style.MicrocosmDialog)
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
        AlertDialog.Builder(this, R.style.MicrocosmDialog)
            .setTitle("E${l.n}  ${l.title}")
            .setMessage("${l.question}\n\n${l.briefing}\n\nGoal: ${l.goalText}")
            .setPositiveButton("begin") { _, _ -> predict(l) }
            .setNegativeButton("back", null)
            .show()
    }

    private fun predict(l: Level) {
        val opts = l.predictOptions
        if (opts.isEmpty()) { begin(l, -1); return }
        AlertDialog.Builder(this, R.style.MicrocosmDialog)
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

    /** The speed dial's state. Opening it is opening the hand; closing it alone is not. */
    internal fun setDial(open: Boolean) {
        dialOpen = open
        toolsDial.visibility = if (open) ViewGroup.VISIBLE else ViewGroup.GONE
    }

    private fun onFabTap() {
        when {
            world.wallArmed || world.seedSpecies >= 0 -> { // armed: stand down, offer the dial
                world.wallArmed = false
                world.seedSpecies = -1
                setDial(true)
            }
            dialOpen -> { setDial(false); world.intervene = false }
            else -> { world.intervene = true; setDial(true) }
        }
    }

    private fun onTool(k: Int) {
        when (k) {
            0 -> world.feedSelected()
            1 -> world.killSelected()
            2 -> seedPicker() // arms on choice and closes the dial there
            else -> { world.wallArmed = true; world.seedSpecies = -1; setDial(false) }
        }
        if (k <= 1) setDial(false)
    }

    internal fun openDrawer() {
        drawerScrim.visibility = ViewGroup.VISIBLE
        drawer.visibility = ViewGroup.VISIBLE
    }

    internal fun closeDrawer() {
        drawerScrim.visibility = ViewGroup.GONE
        drawer.visibility = ViewGroup.GONE
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
        AlertDialog.Builder(this, R.style.MicrocosmDialog)
            .setTitle("Seed which species? Then long-press the water.")
            .setItems(names) { _, k -> world.seedSpecies = live[k]; world.wallArmed = false; setDial(false) }
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
            drawer.visibility == ViewGroup.VISIBLE -> closeDrawer()
            dialOpen -> { setDial(false); world.intervene = false }
            world.selSpecies >= 0 -> world.deselect()
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
