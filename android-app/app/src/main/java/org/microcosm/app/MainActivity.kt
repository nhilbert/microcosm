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
    private lateinit var reportView: TextView
    private lateinit var undoChip: Button
    private lateinit var resetIcon: android.widget.ImageButton
    private lateinit var benchButton: Button
    private var resetArmedAt = 0L

    // ---- the sun card (EV — "detailed sun management"): sliders and layouts for the grip ----
    internal lateinit var sunSheet: LinearLayout // internal: the boot gate asserts it opens
    private lateinit var sunTitle: TextView
    private lateinit var sunRemoveBtn: Button
    private lateinit var sunLayoutsRow: android.view.View // hidden while the founded sky is locked (L7)
    private val sunSliders = HashMap<String, android.widget.SeekBar>()
    private val sunValues = HashMap<String, TextView>()
    private var sunGripShown = -1
    internal val evoPanel by lazy { EvolutionPanel(this, world) } // internal: the boot gate drives it

    /** The browser's SOURCE_LAYOUTS (src/ui.jsx), verbatim: additive by the L.2 finding. */
    private data class Src(val x: Double, val y: Double, val i: Double, val a: Double, val sigma: Double)
    private val sourceLayouts = listOf(
        listOf(Src(512.0, 512.0, 1.0, 0.0, 210.0)),
        listOf(Src(512.0, 512.0, 1.0, 0.0, 210.0), Src(0.0, 0.0, 1.0, 0.0, 130.0)),
        listOf(Src(512.0, 512.0, 1.0, 0.0, 210.0), Src(0.0, 0.0, 0.7, 0.0, 130.0)),
        listOf(Src(512.0, 512.0, 1.0, 0.0, 210.0), Src(0.0, 0.0, 0.8, 0.0, 110.0), Src(0.0, 512.0, 0.8, 0.0, 110.0)),
        listOf(Src(512.0, 512.0, 1.0, 8.0, 210.0)),
        listOf(Src(512.0, 512.0, 1.0, 0.0, 210.0), Src(0.0, 0.0, 0.0, 10.0, 130.0)),
    )

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
    private lateinit var specimenSub: TextView
    private lateinit var specimenEnergyText: TextView
    private lateinit var specimenEnergyBar: LinearLayout
    internal lateinit var specimenTiles: LinearLayout
    private val specimenTileViews = ArrayList<LinearLayout>()
    // ---- the species profile (Steckbrief) inside the specimen sheet ----
    internal lateinit var specimenProfile: LinearLayout // internal: the boot gate asserts it opens
    internal lateinit var profilePortrait: PortraitView
    private lateinit var specimenChevron: TextView
    /** The disclosure row for the trait tiles; internal, the boot gate taps it. */
    internal lateinit var specimenDetails: LinearLayout
    /** The sheet's own dismiss; internal, the boot gate needs the second way to close. */
    internal lateinit var specimenClose: android.widget.ImageButton
    private lateinit var profileRole: TextView
    private lateinit var profileEats: TextView
    private lateinit var profileEaten: TextView
    internal lateinit var profileAbout: TextView // internal: the boot gate reads its words
    /** Whether the trait tiles are unfolded; remembered across selections, never across launches. */
    private var detailsOpen = false
    /** Which species' static card content (portrait, words, tile labels) is populated. */
    private var specimenShownSp = -1
    private val specimenDot by lazy {
        View(this).apply {
            background = android.graphics.drawable.GradientDrawable().apply { cornerRadius = 99f }
        }
    }
    private lateinit var paceBox: LinearLayout
    private lateinit var dialWrap: LinearLayout
    private lateinit var centerChips: LinearLayout
    /** How far the floating chrome is lifted above an open specimen sheet (round 3). */
    private var chromeLift = 0
    /** The gesture-pill inset, recorded by the insets listener for the lift arithmetic. */
    private var insetBottom = 0
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
    /** GR.7: the two switches that say which microscope the world is in — front door and drawer.
     *  One state, two ways to reach it; [refreshOptic] paints both from `world.lightField`. */
    internal lateinit var opticRow: LinearLayout // internal: the boot gate taps the switch
    private lateinit var opticTitle: TextView
    internal lateinit var opticSwatch: OpticSwatch // internal: the boot gate compares its grounds
    internal lateinit var opticTrack: android.widget.FrameLayout // internal: the gate reads the thumb's side
    private lateinit var opticSwitch: LinearLayout
    internal lateinit var opticLabel: TextView // internal: the boot gate reads the drawer's word
    /** The front door's continue-the-experiment row — added after the fixed rows the boot gate walks. */
    internal lateinit var continueRow: LinearLayout
    internal lateinit var expPanel: LinearLayout
    internal lateinit var helpPanel: LinearLayout // internal: the boot gate opens the help page
    private val levels by lazy { Level.all(this) }
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
            sunBadgeView.text = world.sunBadge +
                if (world.sunBadge.isEmpty()) "" else " · " + getString(R.string.badge_tap_restores)
            sunBadgeView.visibility = if (world.sunBadge.isEmpty()) ViewGroup.GONE else ViewGroup.VISIBLE
            // In an experiment the objective IS the line (D2): the census yields to it.
            strip.visibility = if (running != null && world.levelState != 0) ViewGroup.GONE
                               else ViewGroup.VISIBLE
            for ((k, sp) in live.withIndex()) {
                val hiddenNow = world.hidden and (1 shl sp) != 0
                chips[k].text = "%s %d".format(shortName(sp), world.popOf(sp))
                chips[k].alpha = if (hiddenNow) 0.35f else 1f
            }
            // The floating chrome (U2.R2): the fab is the hand — amber when the mode is on,
            // wearing the armed tool's icon while one stands, × while the dial is open.
            val on = world.intervene
            val armedIcon = when {
                world.wallArmed -> R.drawable.ic_wall
                world.seedSpecies >= 0 -> R.drawable.ic_seed
                world.toolArmed == WorldView.TOOL_FEED -> R.drawable.ic_feed
                world.toolArmed == WorldView.TOOL_KILL -> R.drawable.ic_kill
                else -> 0
            }
            Chrome.fabState(this@MainActivity, interveneFab, on,
                when { armedIcon != 0 -> armedIcon; dialOpen -> R.drawable.ic_close; else -> R.drawable.ic_plus })
            val armedText = when {
                !on -> ""
                world.placeSource != 0 -> getString(R.string.hint_place_source)
                world.wallArmed -> getString(R.string.hint_wall_drag)
                world.seedSpecies >= 0 -> getString(R.string.hint_seed_press)
                world.toolArmed != 0 -> getString(R.string.hint_tool_touch)
                else -> ""
            }
            fabLabel.text = armedText
            fabLabel.visibility = if (armedText.isEmpty()) ViewGroup.GONE else ViewGroup.VISIBLE
            for (k in 0 until toolsDial.childCount) Chrome.dialRowState(this@MainActivity,
                toolsDial.getChildAt(k) as LinearLayout,
                when (k) {
                    0 -> world.toolArmed == WorldView.TOOL_FEED
                    1 -> world.toolArmed == WorldView.TOOL_KILL
                    2 -> world.seedSpecies >= 0
                    else -> world.wallArmed
                },
                true) // round 3: no tool needs a selection any more
            Chrome.paceSelect(this@MainActivity, paceBox,
                when { world.speed >= 16 -> 3; world.speed >= 4 -> 2; world.speed >= 1 -> 1; else -> 0 })
            // The sun card (EV) follows the grip and outranks the specimen sheet at the bottom.
            val si = world.sunInfo
            val sunOpen = on && world.sunSel >= 0 && si != null
            sunSheet.visibility = if (sunOpen) ViewGroup.VISIBLE else ViewGroup.GONE
            if (sunOpen && si != null) {
                sunTitle.text = "${sunKind(si[0], si[1])}  ·  ${world.sunSel + 1}/${si[3].toInt()}"
                val last = si[3] <= 1.0
                sunRemoveBtn.isEnabled = !last
                sunRemoveBtn.alpha = if (last) 0.4f else 1f
                sunLayoutsRow.visibility = if (world.homeSunLocked) ViewGroup.GONE else ViewGroup.VISIBLE
                if (world.sunSel != sunGripShown) { // a fresh grip: sliders take the sun's values
                    sunGripShown = world.sunSel
                    sunSliders["i"]?.progress = Math.round(si[0] / 0.05).toInt()
                    sunValues["i"]?.text = "%.2f".format(si[0])
                    sunSliders["a"]?.progress = Math.round((si[1] + 8.0) / 0.5).toInt()
                    sunValues["a"]?.text = (if (si[1] > 0) "+" else "") + "%.1f°".format(si[1])
                    sunSliders["sigma"]?.progress = Math.round((si[2] - 90.0) / 10.0).toInt()
                    sunValues["sigma"]?.text = "%.0f".format(si[2])
                }
            } else sunGripShown = -1
            undoChip.visibility =
                if (world.undoKind != 0 && armedText.isEmpty()) ViewGroup.VISIBLE else ViewGroup.GONE
            undoChip.text = undoLabel(world.undoKind, world.undoSpecies)
            // the specimen drawer follows the selection — the drawer the owner found missing.
            // The sun card outranks it: one bottom sheet at a time.
            val snap = world.specimen
            specimenSheet.visibility = if (snap != null && !sunOpen) ViewGroup.VISIBLE else ViewGroup.GONE
            // Round 3: the drawer must not sit UNDER the floating chrome — while a sheet is
            // open, the fabs, the dial and the centre chips ride above it. (Its height settles
            // a frame after it becomes visible; the next 250 ms tick corrects the lift.)
            val lift = if (sunOpen) sunSheet.height else if (snap != null) specimenSheet.height else 0
            if (lift != chromeLift) {
                chromeLift = lift
                (dialWrap.layoutParams as FrameLayout.LayoutParams).bottomMargin =
                    Style.dp(this@MainActivity, 24f) + insetBottom + lift
                (menuFab.layoutParams as FrameLayout.LayoutParams).bottomMargin =
                    Style.dp(this@MainActivity, 24f) + insetBottom + lift
                (centerChips.layoutParams as FrameLayout.LayoutParams).bottomMargin =
                    Style.dp(this@MainActivity, 92f) + insetBottom + lift
                dialWrap.requestLayout(); menuFab.requestLayout(); centerChips.requestLayout()
            }
            if (snap != null) {
                specimenName.text = Native.traitText(snap.sp, 0) +
                    if (snap.dormant) "  · " + getString(R.string.specimen_dormant) else ""
                (specimenDot.background as android.graphics.drawable.GradientDrawable)
                    .setColor(speciesColor(snap.sp))
                specimenSub.text = getString(R.string.specimen_sub, snap.ageMin, snap.size, snap.mineral)
                specimenEnergyText.text = "%.1f / %.0f".format(snap.energy, snap.cap)
                val frac = (snap.energy / snap.cap).coerceIn(0.02, 1.0).toFloat()
                val fill = specimenEnergyBar.getChildAt(0)
                (fill.background as android.graphics.drawable.GradientDrawable).setColor(speciesColor(snap.sp))
                (fill.layoutParams as LinearLayout.LayoutParams).weight = frac
                (specimenEnergyBar.getChildAt(1).layoutParams as LinearLayout.LayoutParams).weight = 1f - frac
                specimenEnergyBar.requestLayout()
                // What only changes with the SPECIES — the Steckbrief and the tiles' words —
                // is written once per selection change, not forty times a second.
                if (snap.sp != specimenShownSp) {
                    specimenShownSp = snap.sp
                    populateProfile(snap)
                }
                // The living numbers, every tick: value and marker.
                for ((k, tile) in specimenTileViews.withIndex()) {
                    val locus = snap.loci.getOrNull(k) ?: continue
                    ((tile.getChildAt(0) as LinearLayout).getChildAt(1) as TextView).text =
                        "%.2f".format(locus.g)
                    (tile.getChildAt(1) as TraitMeter).set(locus.g, locus.g0, speciesColor(snap.sp))
                }
            } else specimenShownSp = -1
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
        L10n.init(this) // the display language, before anything shows the core's words (DE.4)
        // GR.7: the microscope the player last chose, read BEFORE the render thread bakes its
        // first bodies — the bake depends on the ground they will land on.
        Optics.lightField = prefs().getBoolean(KEY_OPTIC, false)

        val root = FrameLayout(this)
        world = WorldView(this)
        world.lightField = Optics.lightField
        // The autosaved pond, restored before the render thread founds anything (U0.6). One pond
        // you keep: backgrounding the app no longer costs the world. A running experiment
        // autosaves to its own file (owner report 2026-09-02) and outranks the sandbox at boot —
        // the player left mid-experiment, so mid-experiment is where the app comes back.
        world.bootWorld = try { experimentFile().readFully() } catch (e: Exception) { null }
            ?: try { autosaveFile().readFully() } catch (e: Exception) { null }
        root.addView(world, FrameLayout.LayoutParams(MATCH, MATCH))
        // Once the render thread has consumed bootWorld, ask the core whether an experiment rode
        // in the snapshot — this also re-adopts a live experiment after an activity recreation.
        adoptCoreLevel()

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
        specHeader.addView(specimenDot, LinearLayout.LayoutParams(
            Style.dp(this, 12f), Style.dp(this, 12f)).apply { marginEnd = Style.dp(this@MainActivity, 9f) })
        specHeader.addView(specimenName, LinearLayout.LayoutParams(0, WRAP, 1f))
        // Icons, not words (owner, 2026-09-02) — feed and kill on THIS creature, and the dismiss
        // the sheet never had a control for (back still closes it; this is the visible second
        // way). Built through Chrome so the layout gate measures the row that ships, and each
        // icon carries the word it replaced as contentDescription and tooltip: an icon is never
        // the whole label, and these two are exactly the kind a player can read wrong.
        val specActions = Chrome.build(this, "specimen") { k ->
            when (k) {
                0 -> world.feedSelected()
                1 -> world.killSelected()
                else -> world.deselect()
            }
        } as LinearLayout
        specimenClose = specActions.getChildAt(2) as android.widget.ImageButton
        specHeader.addView(specActions, LinearLayout.LayoutParams(WRAP, WRAP))
        specHeader.minimumHeight = Style.dp(this, 48f)
        specimenSheet.addView(specHeader)

        // The Steckbrief (docs/species-profiles.md): portrait beside the food-web facts, the
        // description below. Shown at first glance since 2026-09-02 (owner) — it used to sit
        // folded behind the header, so the picture and the words, the two things that say what
        // this creature IS, arrived only on a second tap, after the numbers. Every slot still
        // hides when a species has no art or no words for it.
        specimenProfile = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        val profileRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        profilePortrait = PortraitView(this)
        profileRow.addView(profilePortrait, LinearLayout.LayoutParams(
            Style.dp(this, 92f), Style.dp(this, 92f)))
        val profileFacts = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        profileRole = TextView(this).apply {
            setTextColor(Style.TEXT)
            textSize = 12f
            typeface = Style.wordMedium(this@MainActivity)
        }
        profileEats = TextView(this).apply {
            setTextColor(Style.DIM)
            textSize = 11f
            typeface = Style.word(this@MainActivity)
            setPadding(0, Style.dp(this@MainActivity, 6f), 0, 0)
        }
        profileEaten = TextView(this).apply {
            setTextColor(Style.DIM)
            textSize = 11f
            typeface = Style.word(this@MainActivity)
            setPadding(0, Style.dp(this@MainActivity, 2f), 0, 0)
        }
        profileFacts.addView(profileRole)
        profileFacts.addView(profileEats)
        profileFacts.addView(profileEaten)
        profileRow.addView(profileFacts, LinearLayout.LayoutParams(0, WRAP, 1f).apply {
            marginStart = Style.dp(this@MainActivity, 12f)
        })
        specimenProfile.addView(profileRow)
        profileAbout = TextView(this).apply {
            setTextColor(Style.TEXT)
            textSize = 12f
            typeface = Style.word(this@MainActivity)
            setLineSpacing(0f, 1.15f)
            setPadding(0, Style.dp(this@MainActivity, 8f), 0, 0)
        }
        specimenProfile.addView(profileAbout)
        specimenSheet.addView(specimenProfile, LinearLayout.LayoutParams(MATCH, WRAP).apply {
            bottomMargin = Style.dp(this@MainActivity, 10f)
        })
        specimenSub = TextView(this).apply {
            setTextColor(Style.DIM)
            textSize = 11f
            typeface = Style.mono(this@MainActivity)
            setPadding(Style.dp(this@MainActivity, 21f), 0, 0, Style.dp(this@MainActivity, 10f))
        }
        specimenSheet.addView(specimenSub)
        // the energy bar: the one meter whose ceiling the shell truly knows
        val energyRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        energyRow.addView(TextView(this).apply {
            text = getString(R.string.label_energy)
            setTextColor(Style.DIM); textSize = 12f; typeface = Style.word(this@MainActivity)
        }, LinearLayout.LayoutParams(0, WRAP, 1f))
        specimenEnergyText = TextView(this).apply {
            setTextColor(Style.TEXT); textSize = 12f; typeface = Style.mono(this@MainActivity)
        }
        energyRow.addView(specimenEnergyText)
        specimenSheet.addView(energyRow)
        specimenEnergyBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            background = android.graphics.drawable.GradientDrawable().apply {
                setColor(Color.argb(31, 148, 178, 204)); cornerRadius = Style.dp(this@MainActivity, 3f).toFloat()
            }
        }
        specimenEnergyBar.addView(View(this).apply {
            background = android.graphics.drawable.GradientDrawable().apply {
                cornerRadius = Style.dp(this@MainActivity, 3f).toFloat()
            }
        }, LinearLayout.LayoutParams(0, Style.dp(this, 5f), 0.5f))
        specimenEnergyBar.addView(View(this), LinearLayout.LayoutParams(0, 1, 0.5f))
        specimenSheet.addView(specimenEnergyBar, LinearLayout.LayoutParams(MATCH, Style.dp(this, 5f)).apply {
            topMargin = Style.dp(this@MainActivity, 6f); bottomMargin = Style.dp(this@MainActivity, 12f)
        })
        // The disclosure the header used to be. What is behind it changed with the reordering:
        // the tiles are the DETAILS now, the Steckbrief is the first glance. A labelled row, not
        // a bare chevron — a glyph alone never says what it would open.
        specimenDetails = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            minimumHeight = Style.dp(this@MainActivity, 48f)
            background = Style.touchable(this@MainActivity,
                android.graphics.drawable.GradientDrawable().apply {
                    setColor(Color.TRANSPARENT)
                    cornerRadius = Style.dp(this@MainActivity, 12f).toFloat()
                })
            setOnClickListener { setDetailsOpen(!detailsOpen) }
        }
        specimenDetails.addView(TextView(this).apply {
            text = getString(R.string.specimen_details)
            setTextColor(Style.DIM); textSize = 12f; typeface = Style.word(this@MainActivity)
        }, LinearLayout.LayoutParams(0, WRAP, 1f))
        specimenChevron = TextView(this).apply {
            setTextColor(Style.DIM)
            textSize = 13f
            text = "▾"
        }
        specimenDetails.addView(specimenChevron)
        specimenSheet.addView(specimenDetails, LinearLayout.LayoutParams(MATCH, WRAP))

        // The trait tiles, two a row, populated per selection; species without a locus hide them.
        // Each tile: label and value up top, then the pole-to-pole track (TraitMeter — marker at
        // this creature, tick at the founding stock), the pole words at the rails, and one line
        // on what the dial trades. Child indices are read back in tickHud — keep them in step.
        specimenTiles = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = ViewGroup.GONE
        }
        repeat(2) { r ->
            val rowOfTiles = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            repeat(2) { c ->
                val tile = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    background = Style.quiet(this@MainActivity)
                    setPadding(Style.dp(this@MainActivity, 12f), Style.dp(this@MainActivity, 10f),
                        Style.dp(this@MainActivity, 12f), Style.dp(this@MainActivity, 10f))
                    addView(LinearLayout(this@MainActivity).apply { // 0: label · value
                        orientation = LinearLayout.HORIZONTAL
                        addView(TextView(this@MainActivity).apply {
                            setTextColor(Style.DIM); textSize = 11f; typeface = Style.word(this@MainActivity)
                        }, LinearLayout.LayoutParams(0, WRAP, 1f))
                        addView(TextView(this@MainActivity).apply {
                            setTextColor(Style.BRIGHT); textSize = 12f
                            typeface = Style.monoMedium(this@MainActivity)
                        })
                    })
                    addView(TraitMeter(this@MainActivity), // 1: the track
                        LinearLayout.LayoutParams(MATCH, Style.dp(this@MainActivity, 16f)).apply {
                            topMargin = Style.dp(this@MainActivity, 4f)
                        })
                    addView(LinearLayout(this@MainActivity).apply { // 2: the pole words
                        orientation = LinearLayout.HORIZONTAL
                        addView(TextView(this@MainActivity).apply {
                            setTextColor(Style.DIM); textSize = 10f; typeface = Style.word(this@MainActivity)
                        }, LinearLayout.LayoutParams(0, WRAP, 1f))
                        addView(TextView(this@MainActivity).apply {
                            setTextColor(Style.DIM); textSize = 10f; typeface = Style.word(this@MainActivity)
                            gravity = Gravity.END
                        }, LinearLayout.LayoutParams(0, WRAP, 1f))
                    })
                    addView(TextView(this@MainActivity).apply { // 3: what the dial trades
                        setTextColor(Style.DIM); textSize = 10f; typeface = Style.word(this@MainActivity)
                        setLineSpacing(0f, 1.1f)
                        setPadding(0, Style.dp(this@MainActivity, 5f), 0, 0)
                    })
                }
                specimenTileViews.add(tile)
                // MATCH height: neighbouring tiles stay one box even when their explanation
                // lines wrap differently.
                val lp = LinearLayout.LayoutParams(0, MATCH, 1f)
                if (c > 0) lp.marginStart = Style.dp(this@MainActivity, 8f)
                rowOfTiles.addView(tile, lp)
            }
            specimenTiles.addView(rowOfTiles, LinearLayout.LayoutParams(MATCH, WRAP).apply {
                if (r > 0) topMargin = Style.dp(this@MainActivity, 8f)
            })
        }
        specimenSheet.addView(specimenTiles)
        root.addView(specimenSheet, FrameLayout.LayoutParams(MATCH, WRAP).apply { gravity = Gravity.BOTTOM })

        // The sun card (EV): the gripped ENERGY SOURCE's own sheet — light, warmth and spread as
        // sliders (the browser's SourceCard ranges), the six additive layouts, add and remove.
        // It replaces U2.R2's three-button sun bar: dimmer/brighter was a slider wearing buttons.
        sunSheet = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = Style.sheet(this@MainActivity)
            setPadding(Style.dp(this@MainActivity, 20f), Style.dp(this@MainActivity, 12f),
                Style.dp(this@MainActivity, 20f), Style.dp(this@MainActivity, 14f))
            visibility = ViewGroup.GONE
        }
        val sunHeader = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        sunTitle = TextView(this).apply {
            setTextColor(Style.AMBER)
            textSize = 16f
            typeface = Style.wordMedium(this@MainActivity)
        }
        sunHeader.addView(sunTitle, LinearLayout.LayoutParams(0, WRAP, 1f))
        sunHeader.addView(button(getString(R.string.sun_release)) { world.sunSel = -1; world.placeSource = 0 })
        sunSheet.addView(sunHeader)
        sunSheet.addView(sunSliderRow("i", getString(R.string.sun_light), 0.0, 1.5, 0.05) { v -> "%.2f".format(v) })
        sunSheet.addView(sunSliderRow("a", getString(R.string.sun_warmth), -8.0, 15.0, 0.5) { v ->
            (if (v > 0) "+" else "") + "%.1f°".format(v) })
        sunSheet.addView(sunSliderRow("sigma", getString(R.string.sun_spread), 90.0, 300.0, 10.0) { v ->
            "%.0f".format(v) })
        sunLayoutsRow = Chrome.build(this, "layouts") { k -> applyLayout(k) }
        sunSheet.addView(sunLayoutsRow,
            LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = Style.dp(this@MainActivity, 10f) })
        val sunActions = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        sunActions.addView(button(getString(R.string.sun_add)) { world.placeSource = 1 },
            LinearLayout.LayoutParams(0, WRAP, 1f))
        sunActions.addView(button(getString(R.string.heater_add)) { world.placeSource = 2 },
            LinearLayout.LayoutParams(0, WRAP, 1f).apply { marginStart = Style.dp(this@MainActivity, 8f) })
        sunRemoveBtn = button(getString(R.string.sun_remove)) {
            val k = world.sunSel
            if (k >= 0) world.post {
                if (Native.sourceCount() > 1 && Native.levelAllowsSource(k) != 0) { // keep one source; a locked sky stays (L7)
                    Native.ivPush(WorldView.IV_SOURCE_REMOVE)
                    Native.evSourceRemove(k)
                }
            }
            world.sunSel = -1
        }
        sunActions.addView(sunRemoveBtn, LinearLayout.LayoutParams(0, WRAP, 1f).apply {
            marginStart = Style.dp(this@MainActivity, 8f)
        })
        sunSheet.addView(sunActions, LinearLayout.LayoutParams(MATCH, WRAP).apply {
            topMargin = Style.dp(this@MainActivity, 8f)
        })
        root.addView(sunSheet, FrameLayout.LayoutParams(MATCH, WRAP).apply { gravity = Gravity.BOTTOM })

        // floating centre chips: the sun's controls while gripped, undo while it applies
        centerChips = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }
        undoChip = button(getString(R.string.btn_undo)) { world.undoLast() }.apply {
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
        dialWrap = LinearLayout(this).apply {
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
            // width and padding come from Chrome so the layout gate measures the drawer's rows
            // at exactly the width this gives them
            val pad = Style.dp(this@MainActivity, Chrome.DRAWER_PAD_DP.toFloat())
            setPadding(pad, pad, pad, pad)
        }
        // The drawer's head (owner, 2026-09-03): home, save and reset as glyphs, pinned above
        // the scroll. They are the session's own three — leave the pond, keep it, start it over —
        // and they take one 48 dp line instead of the 2x2 word grid that used to sit at the foot.
        // The wordmark went with it: the way home is now a button rather than a title, and the
        // front door carries the name in full the moment it is tapped.
        val drawerTop = Chrome.build(this, "drawerTop") { k ->
            when (Chrome.DRAWER_TOP[k]) {
                "home" -> {
                    // The same path back-at-top-level takes: the pond is saved to its own file
                    // first, so leaving through the drawer costs exactly nothing.
                    closeDrawer()
                    autosave()
                    showStart(getString(if (running != null) R.string.start_sub_behind_experiment
                                        else R.string.start_sub_as_stands))
                }
                "save" -> { closeDrawer(); saveOrLoad() }
                else -> resetTapped()
            }
        } as LinearLayout
        resetIcon = drawerTop.getChildAt(2) as android.widget.ImageButton
        drawer.addView(drawerTop, LinearLayout.LayoutParams(MATCH, WRAP).apply {
            bottomMargin = Style.dp(this@MainActivity, 6f)
        })
        val drawerBody = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        drawerBody.addView(sectionLabel(getString(R.string.section_pace)))
        paceBox = Chrome.build(this, "pace") { k ->
            world.speed = when (k) { 0 -> 0.0; 1 -> 1.0; 2 -> 4.0; else -> 16.0 }
        } as LinearLayout
        drawerBody.addView(paceBox, LinearLayout.LayoutParams(MATCH, WRAP))
        // The same switch as the front door's, where a player already stands looking at the pond:
        // the point of a second optic is the comparison, and the comparison needs the world in
        // sight. One state, two ways to reach it.
        drawerBody.addView(sectionLabel(getString(R.string.section_view)))
        opticSwitch = Chrome.build(this, "optic") { toggleOptic() } as LinearLayout
        drawerBody.addView(opticSwitch, LinearLayout.LayoutParams(MATCH, WRAP))
        opticLabel = Chrome.switchLabel(opticSwitch)
        drawerBody.addView(sectionLabel(getString(R.string.section_species)))
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
        // The bench is dev-mode only and stays a word: nobody who has not long-pressed the census
        // strip will ever see it, and a glyph for it would be a picture of a stopwatch nobody
        // asked for. The experiments button left the drawer with this round — the ladder is the
        // front door's second row, and a menu entry that duplicates the door is a second door.
        val benchRow = Chrome.build(this, "bench") {
            closeDrawer()
            reportView.visibility = ViewGroup.GONE
            world.speed = 0.0
            world.benchmark()
        } as LinearLayout
        benchButton = Chrome.at(benchRow, Chrome.BENCH, "bench").apply { visibility = ViewGroup.GONE }
        drawerBody.addView(benchRow, LinearLayout.LayoutParams(MATCH, WRAP).apply {
            topMargin = Style.dp(this@MainActivity, 8f)
        })
        drawer.addView(ScrollView(this).apply { addView(drawerBody) },
            LinearLayout.LayoutParams(MATCH, 0, 1f))
        // The drawer's foot: the two screens it leads to, pinned under the scroll so they are in
        // the same place whatever the species list is doing above them.
        drawer.addView(Chrome.build(this, "drawerNav") { k ->
            if (Chrome.DRAWER_NAV[k] == "data") {
                closeDrawer()
                world.dataOpen = true
                dataPanel.visibility = ViewGroup.VISIBLE
                refreshData()
            } else if (!world.evolutionAllowed) toast(getString(R.string.evo_locked))
            else { closeDrawer(); evoPanel.open() }
        }, LinearLayout.LayoutParams(MATCH, WRAP).apply {
            topMargin = Style.dp(this@MainActivity, 10f)
        })
        root.addView(drawer, FrameLayout.LayoutParams(
            Style.dp(this, Chrome.DRAWER_DP.toFloat()), MATCH).apply {
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
        // In a scroll container since EV: the Traits page is taller than any screen (160 dp per
        // (species, locus) band, eleven bands); fillViewport keeps the chart pages full-height.
        dataPanel.addView(ScrollView(this).apply {
            isFillViewport = true
            addView(dataView, ViewGroup.LayoutParams(MATCH, WRAP))
        }, LinearLayout.LayoutParams(MATCH, 0, 1f))
        dataText = TextView(this).apply {
            setTextColor(Color.parseColor("#C9D7E3"))
            textSize = 11f
            typeface = Style.mono(this@MainActivity)
            setPadding(24, 12, 24, 24)
        }
        dataPanel.addView(ScrollView(this).apply { addView(dataText) },
            LinearLayout.LayoutParams(MATCH, 0, 1f))
        dataPanel.addView(button(getString(R.string.btn_close)) { world.dataOpen = false; dataPanel.visibility = ViewGroup.GONE })
        root.addView(dataPanel, FrameLayout.LayoutParams(MATCH, MATCH))
        root.addView(evoPanel.view, FrameLayout.LayoutParams(MATCH, MATCH))

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
        startPanel = StartDoor(this).apply {
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
            text = getString(R.string.app_tagline)
            setTextColor(Style.DIM)
            textSize = 15f
            typeface = Style.word(this@MainActivity)
            gravity = Gravity.START
            setPadding(Style.dp(this@MainActivity, 32f), 0, Style.dp(this@MainActivity, 32f), Style.dp(this@MainActivity, 40f))
        })
        val hasAutosave = autosaveFile().baseFile.exists()
        startPanel.addView(startChoice(getString(R.string.choice_sandbox),
            getString(if (hasAutosave) R.string.sub_sandbox_resume else R.string.sub_sandbox_fresh)) {
            // Choosing the sandbox while an experiment is live is leaving the experiment: the
            // pond that comes back is the one the subtitle promises — the kept sandbox from its
            // own autosave file — never the experiment's world wearing sandbox clothes.
            if (running != null) {
                world.stopLevel()
                experimentFile().delete()
                val pond = try { autosaveFile().readFully() } catch (e: Exception) { null }
                if (pond != null) world.load(pond) {} else world.resetWorld(kotlin.random.Random.nextInt(1, 100000))
            }
            running = null
            lastVerdict = 0
            refreshContinueRow(0)
            startPanel.visibility = ViewGroup.GONE
            world.speed = 1.0
        })
        startPanel.addView(startChoice(getString(R.string.choice_experiments), getString(R.string.sub_experiments)) {
            expPanel.visibility = ViewGroup.VISIBLE
        })
        // The continue row (2026-09-02): a saved or paused experiment resumes from the door. It
        // sits AFTER the two fixed rows, so the boot gate's child indices stay put.
        continueRow = startChoice(getString(R.string.choice_continue_exp), "") {
            startPanel.visibility = ViewGroup.GONE
            world.speed = 1.0
        }
        continueRow.visibility = ViewGroup.GONE
        startPanel.addView(continueRow)
        // Help (owner request, 2026-09-02): the page a beginner opens first and a curious player
        // comes back to. It sits on the front door, where someone who does not know what any of
        // this is has already been handed a choice.
        startPanel.addView(startChoice(getString(R.string.choice_help), getString(R.string.sub_help)) {
            helpPanel.visibility = ViewGroup.VISIBLE
        })
        // The optic (GR.7). Last row, after the two fixed ones and the continue row, so the boot
        // gate's child indices stay put. It is a view, not a lever: it changes how the world is
        // painted and nothing about what the world does — which is why, since the owner asked for
        // a switch here (2026-09-03), it wears one: the other rows are doors, and a door that
        // comes back to the same screen with a different ground was never one.
        opticRow = startSwitch { toggleOptic() }
        startPanel.addView(opticRow)
        refreshOptic()
        // The front door scrolls (owner request, 2026-09-03). It had been growing rows — the
        // continue row, help, the optic — under a wordmark that takes 145 dp on its own, and at
        // 320 dp wide the last of them fell off the bottom edge with nothing to say so. The look
        // is unchanged wherever it still fits: `isFillViewport` stretches the panel to the
        // viewport when the content is shorter, so its CENTER_VERTICAL still centres, and only
        // a door too tall for the screen scrolls at all.
        root.addView(ScrollView(this).apply {
            isFillViewport = true
            isVerticalScrollBarEnabled = false
            addView(startPanel, FrameLayout.LayoutParams(MATCH, WRAP))
        }, FrameLayout.LayoutParams(MATCH, MATCH))

        // The ladder, as a screen: every experiment open, none gated behind another.
        expPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Style.ABYSS)
            visibility = ViewGroup.GONE
            isClickable = true
        }
        expPanel.addView(TextView(this).apply {
            text = getString(R.string.experiments_title)
            setTextColor(Style.BRIGHT)
            textSize = 20f
            typeface = Style.wordBold(this@MainActivity)
            setPadding(Style.dp(this@MainActivity, 24f), Style.dp(this@MainActivity, 16f),
                Style.dp(this@MainActivity, 24f), Style.dp(this@MainActivity, 12f))
        })
        val expList = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        for (l in levels) expList.addView(expChoice(l) {
            expPanel.visibility = ViewGroup.GONE
            briefing(l)
        })
        expPanel.addView(ScrollView(this).apply { addView(expList) },
            LinearLayout.LayoutParams(MATCH, 0, 1f))
        expPanel.addView(button(getString(R.string.btn_back)) { expPanel.visibility = ViewGroup.GONE })
        root.addView(expPanel, FrameLayout.LayoutParams(MATCH, MATCH))

        helpPanel = Help.page(this) { helpPanel.visibility = ViewGroup.GONE }
        root.addView(helpPanel, FrameLayout.LayoutParams(MATCH, MATCH))

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
            sunSheet.setPadding(Style.dp(this, 20f), Style.dp(this, 12f),
                Style.dp(this, 20f), Style.dp(this, 14f) + ib)
            evoPanel.view.setPadding(0, insets.systemWindowInsetTop, 0, ib)
            insetBottom = ib
            chromeLift = -1 // margins are lift+inset; a changed inset re-applies them (tickHud)
            (menuFab.layoutParams as FrameLayout.LayoutParams).bottomMargin = Style.dp(this, 24f) + ib
            (dialWrap.layoutParams as FrameLayout.LayoutParams).bottomMargin = Style.dp(this, 24f) + ib
            val dpad = Style.dp(this, Chrome.DRAWER_PAD_DP.toFloat())
            drawer.setPadding(dpad, dpad + insets.systemWindowInsetTop, dpad, dpad + ib)
            // The Data panel is a full-screen overlay, so it needs the insets itself — without
            // this its title renders under the status bar clock (the owner's screenshots).
            dataPanel.setPadding(0, insets.systemWindowInsetTop, 0, insets.systemWindowInsetBottom)
            startPanel.setPadding(0, insets.systemWindowInsetTop, 0, insets.systemWindowInsetBottom)
            expPanel.setPadding(0, insets.systemWindowInsetTop, 0, insets.systemWindowInsetBottom)
            helpPanel.setPadding(0, insets.systemWindowInsetTop, 0, insets.systemWindowInsetBottom)
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

    /**
     * A running experiment's autosave (2026-09-02). Its own file, so pausing mid-experiment can
     * never clobber the kept sandbox pond — the two worlds coexist on disk, and the front door
     * offers both. Deleted when the player leaves the experiment for the sandbox, or when a
     * sandbox pause writes a fresher world.
     */
    private fun experimentFile() = android.util.AtomicFile(java.io.File(filesDir, "experiment.mcsm"))

    /**
     * After a load, the core says whether an experiment rode in the snapshot (format v2) — the
     * shell adopts it: running level, meter labels, deadline, the front door's continue row. A
     * level-free world clears any experiment the shell thought it was in, so its verdicts can
     * never judge a foreign world. Read on the render thread, applied on the UI thread.
     */
    internal fun adoptCoreLevel() {
        world.post {
            val st = Native.levelNum(0).toInt()
            val idx = Native.levelNum(1).toInt()
            runOnUiThread {
                if (st != 0 && idx >= 0 && idx < levels.size) {
                    val l = levels[idx]
                    running = l
                    lastVerdict = 0
                    verdict.visibility = ViewGroup.GONE
                    world.meterLabels = l.meterLabels
                    world.meterUnits = l.meterUnits
                    world.levelDeadline = l.deadline
                } else if (running != null) {
                    running = null
                    lastVerdict = 0
                    verdict.visibility = ViewGroup.GONE
                }
                refreshContinueRow(st)
            }
        }
    }

    /** The front door's third row: visible only while an experiment is live to continue. */
    private fun refreshContinueRow(st: Int = world.levelState) {
        val l = running
        if (l != null && st != 0) {
            (continueRow.getChildAt(1) as TextView).text =
                getString(R.string.sub_continue_exp, l.n, l.title)
            continueRow.visibility = ViewGroup.VISIBLE
        } else {
            continueRow.visibility = ViewGroup.GONE
        }
    }

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
        val save = getString(R.string.item_save_world)
        val items = if (has) arrayOf(save, getString(R.string.item_load_world)) else arrayOf(save)
        AlertDialog.Builder(this, R.style.MicrocosmDialog)
            .setTitle(getString(R.string.dlg_saved_world))
            .setItems(items) { _, k ->
                if (k == 0) world.save { bytes ->
                    if (writeAtomic(f, bytes)) toast(getString(R.string.toast_saved, bytes.size / 1024))
                    else toast(getString(R.string.toast_save_failed))
                } else {
                    val bytes = try { f.readFully() } catch (e: Exception) { null }
                    if (bytes == null) toast(getString(R.string.toast_load_unreadable))
                    else world.load(bytes) { ok ->
                        toast(getString(if (ok) R.string.toast_loaded else R.string.toast_not_world))
                        // the loaded snapshot may carry an experiment — or end the current one
                        if (ok) adoptCoreLevel()
                    }
                }
            }
            .setNegativeButton(getString(R.string.btn_cancel), null)
            .show()
    }

    /**
     * GR.7 — the microscope's regime, and the one setting the app keeps outside a world file: it
     * belongs to the player's eyes, not to any pond, so it survives a reset and rides along into
     * every experiment.
     */
    private fun prefs() = getSharedPreferences(PREFS, MODE_PRIVATE)

    /** Flip the optic. The render thread picks it up on its next frame and rebakes the bodies. */
    private fun toggleOptic() {
        val light = !world.lightField
        world.lightField = light
        prefs().edit().putBoolean(KEY_OPTIC, light).apply()
        refreshOptic()
    }

    /** Both switches say the same thing: what you are looking at now, and what a tap gives you. */
    private fun refreshOptic() {
        val light = world.lightField
        val title = getString(if (light) R.string.choice_view_light else R.string.choice_view_dark)
        opticTitle.text = title
        opticSwatch.setRegime(light)
        // The sentence the card used to show is now what it SAYS: the picture is not readable by
        // a screen reader, so the words it replaced become the card's accessible name.
        opticRow.contentDescription = "$title. " +
            getString(if (light) R.string.sub_view_light else R.string.sub_view_dark)
        Chrome.switchTrackState(this, opticTrack, light)
        Chrome.switchState(this, opticSwitch, light, title)
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

    /**
     * The front door's optic row: the field of view on the left, the regime's name, the switch at
     * the right edge. The whole card is one target, so the switch shows the state rather than
     * being a second control.
     *
     * What used to sit here was a sentence describing the look ("glowing life on black water —
     * tap for the light field"). It is gone for the reason [OpticSwatch] carries in full: a switch
     * already states the side you are on, so a line naming the ACTION beside it is the ambiguity
     * that makes a reader treat a switch as a command — and where the outcome is a look, the
     * outcome itself beats prose about it. The sentence survives where it still earns its keep,
     * as the card's contentDescription: a screen reader gets the words a sighted player now gets
     * from the picture.
     */
    private fun startSwitch(onTap: () -> Unit): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = Style.touchable(this@MainActivity, Style.card(this@MainActivity))
            layoutParams = LinearLayout.LayoutParams(MATCH, WRAP).apply {
                leftMargin = Style.dp(this@MainActivity, 24f)
                rightMargin = Style.dp(this@MainActivity, 24f)
                bottomMargin = Style.dp(this@MainActivity, 14f)
            }
            setPadding(Style.dp(this@MainActivity, 18f), Style.dp(this@MainActivity, 16f),
                Style.dp(this@MainActivity, 20f), Style.dp(this@MainActivity, 16f))
            setOnClickListener { onTap() }
            opticSwatch = OpticSwatch(this@MainActivity).apply {
                show(swatchCast())
                setRegime(world.lightField)
                // The picture is the card's, not a thing of its own to land on: the card carries
                // the whole meaning as its contentDescription.
                importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
            }
            addView(opticSwatch, LinearLayout.LayoutParams(
                Style.dp(this@MainActivity, 52f), Style.dp(this@MainActivity, 52f)))
            opticTitle = TextView(this@MainActivity).apply {
                setTextColor(Style.BRIGHT)
                textSize = 17f
                typeface = Style.wordMedium(this@MainActivity)
            }
            addView(opticTitle, LinearLayout.LayoutParams(0, WRAP, 1f).apply {
                marginStart = Style.dp(this@MainActivity, 16f)
            })
            opticTrack = Chrome.switchTrack(this@MainActivity)
            addView(opticTrack, LinearLayout.LayoutParams(
                Style.dp(this@MainActivity, 52f), Style.dp(this@MainActivity, 30f)).apply {
                marginStart = Style.dp(this@MainActivity, 12f)
            })
        }

    /**
     * The four the preview shows, biggest first, at fixed spots in the field (position and radius
     * as fractions of it, so the picture is the same at any size).
     *
     * Chosen by NAME rather than by index: the species table is the core's and may grow, and a
     * creature this does not know about simply does not appear rather than turning the picture
     * into something else. The colours are the core's own bucket table — the same call the drawer
     * pills and the seed picker make, never a second palette here — read once, so flipping the
     * optic repaints from cached data and never touches the core again.
     */
    private fun swatchCast(): List<OpticSwatch.Body> {
        val spots = listOf(
            Triple("Cilio", 0.36f to 0.41f, 0.21f),
            Triple("Venator", 0.69f to 0.63f, 0.17f),
            Triple("Drifta", 0.70f to 0.30f, 0.13f),
            Triple("Solara", 0.33f to 0.73f, 0.10f),
        )
        val byName = live.associateBy { Native.traitText(it, 0) }
        return spots.mapNotNull { (name, at, r) ->
            val sp = byName[name] ?: return@mapNotNull null
            OpticSwatch.Body(
                intArrayOf(Native.specNum(sp, 0, 0, 0).toInt(), Native.specNum(sp, 0, 0, 1).toInt(),
                    Native.specNum(sp, 0, 0, 2).toInt()),
                at.first, at.second, r,
            )
        }
    }

    /**
     * An experiment row: the level's captured moment beside its words. The picture comes from
     * assets/levels/<key>.jpg (photographed from real gameplay by tools/level-thumbs.js); a
     * level without one gets the words alone — the portraits' missing-art contract.
     */
    private fun expChoice(l: Level, onTap: () -> Unit): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = Style.touchable(this@MainActivity, Style.card(this@MainActivity))
            layoutParams = LinearLayout.LayoutParams(MATCH, WRAP).apply {
                leftMargin = Style.dp(this@MainActivity, 24f)
                rightMargin = Style.dp(this@MainActivity, 24f)
                bottomMargin = Style.dp(this@MainActivity, 14f)
            }
            setPadding(Style.dp(this@MainActivity, 16f), Style.dp(this@MainActivity, 16f),
                Style.dp(this@MainActivity, 20f), Style.dp(this@MainActivity, 16f))
            setOnClickListener { onTap() }
            Profiles.levelThumb(this@MainActivity, l.key)?.let { bm ->
                addView(PortraitView(this@MainActivity).apply { show(bm) },
                    LinearLayout.LayoutParams(Style.dp(this@MainActivity, 56f),
                        Style.dp(this@MainActivity, 56f)).apply {
                        rightMargin = Style.dp(this@MainActivity, 14f)
                    })
            }
            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.VERTICAL
                addView(TextView(this@MainActivity).apply {
                    text = "E${l.n}  ${l.title}"
                    setTextColor(Style.BRIGHT)
                    textSize = 17f
                    typeface = Style.wordMedium(this@MainActivity)
                })
                addView(TextView(this@MainActivity).apply {
                    text = l.science
                    setTextColor(Style.DIM)
                    textSize = 13f
                    typeface = Style.word(this@MainActivity)
                    setPadding(0, Style.dp(this@MainActivity, 3f), 0, 0)
                })
            }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        }

    /** Show the front door mid-session: the pond pauses, saved, and the subtitle tells the truth. */
    private fun showStart(sub: String) {
        world.speed = 0.0
        (startPanel.getChildAt(2) as LinearLayout).let { (it.getChildAt(1) as TextView).text = sub }
        refreshContinueRow()
        startPanel.visibility = ViewGroup.VISIBLE
    }

    /** The briefing, then the prediction. Committing is never graded — it is there to be contrasted. */
    private fun briefing(l: Level) {
        AlertDialog.Builder(this, R.style.MicrocosmDialog)
            .setTitle("E${l.n}  ${l.title}")
            .setMessage("${l.question}\n\n${l.briefing}\n\n" + getString(R.string.goal_prefix, l.goalText))
            .setPositiveButton(getString(R.string.btn_begin)) { _, _ -> predict(l) }
            .setNegativeButton(getString(R.string.btn_back), null)
            .show()
    }

    private fun predict(l: Level) {
        val opts = l.predictOptions
        if (opts.isEmpty()) { begin(l, -1); return }
        AlertDialog.Builder(this, R.style.MicrocosmDialog)
            .setTitle(l.predictPrompt)
            .setItems(opts.toTypedArray()) { _, k -> begin(l, k) }
            .setNegativeButton(getString(R.string.btn_skip)) { _, _ -> begin(l, -1) }
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
            if (p >= 0 && p < reflect.size)
                sb.append("\n\n").append(getString(R.string.verdict_predicted, l.predictOptions[p]))
                    .append("\n").append(reflect[p])
            sb.append("\n\n").append(getString(R.string.verdict_dismiss))
            verdict.text = sb.toString()
            verdict.visibility = ViewGroup.VISIBLE
        }
    }

    private val pageTitles by lazy { resources.getStringArray(R.array.page_titles) }

    /** Chart pages draw; Health and Events are text. Only one of the two is ever visible. */
    private fun refreshData() {
        dataTitle.text = pageTitles[dataPage]
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
        val chart = dataPage <= 2 || dataPage == DataView.PAGE_TRAITS
        (dataView.parent as ViewGroup).visibility = if (chart) ViewGroup.VISIBLE else ViewGroup.GONE
        (dataText.parent as ViewGroup).visibility = if (chart) ViewGroup.GONE else ViewGroup.VISIBLE
        if (chart) {
            dataView.page = dataPage
            if (dataPage == DataView.PAGE_TRAITS)
                dataView.submitTraits(world.traitBands, world.traitSeries, world.seriesN)
            else world.series?.let { dataView.submit(it, world.seriesN, IntArray(7) { sp -> speciesColor(sp) }) }
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
            // The glyph cannot say "sure?", so it goes amber — the hand, about to act — and the
            // question is asked in words anyway, because a two-step guard whose first step is a
            // colour change is a guard the player has to already know about.
            armReset(Style.AMBER, getString(R.string.btn_reset_sure))
            toast(getString(R.string.btn_reset_sure))
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
            world.wallArmed || world.seedSpecies >= 0 || world.toolArmed != 0 -> {
                // armed: stand down, offer the dial
                world.wallArmed = false
                world.seedSpecies = -1
                world.toolArmed = 0
                setDial(true)
            }
            dialOpen -> { setDial(false); world.intervene = false }
            else -> { world.intervene = true; setDial(true) }
        }
    }

    /**
     * A tool arms the hand (owner round 3): feed and kill are no longer selection errands but
     * armed touch tools — tap or drag the water and the creature under the finger is fed or
     * erased. The specimen sheet keeps per-individual feed/kill for the selected one. Arming
     * deselects: an armed hand and an open specimen drawer were the round-3 overlap mess.
     */
    private fun onTool(k: Int) {
        world.deselect()
        when (k) {
            0 -> { world.toolArmed = WorldView.TOOL_FEED; world.seedSpecies = -1; world.wallArmed = false }
            1 -> { world.toolArmed = WorldView.TOOL_KILL; world.seedSpecies = -1; world.wallArmed = false }
            2 -> { world.toolArmed = 0; seedPicker() } // arms on choice and closes the dial there
            else -> { world.wallArmed = true; world.toolArmed = 0; world.seedSpecies = -1 }
        }
        if (k != 2) setDial(false)
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
        armReset(Style.TEXT, Chrome.label(this, "reset"))
    }

    /** Paint the reset glyph and say what a tap does now — the tooltip and the screen reader's
     *  word both follow the state, since the icon itself cannot. */
    private fun armReset(tint: Int, desc: String) {
        resetIcon.imageTintList = android.content.res.ColorStateList.valueOf(tint)
        resetIcon.contentDescription = desc
        resetIcon.tooltipText = desc
    }

    /**
     * The seeding picker: choose a species, then long-press the water to found a pack there.
     * Each row wears the species' own colour (round 3: a bare name list said nothing) — the
     * world's palette, from the core's bucket table, never a second one here.
     */
    private fun seedPicker() {
        val adapter = object : android.widget.BaseAdapter() {
            override fun getCount() = live.size
            override fun getItem(k: Int) = live[k]
            override fun getItemId(k: Int) = k.toLong()
            override fun getView(k: Int, recycled: View?, parent: ViewGroup?): View {
                val sp = live[k]
                return LinearLayout(this@MainActivity).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    minimumHeight = Style.dp(this@MainActivity, 48f)
                    setPadding(Style.dp(this@MainActivity, 20f), 0, Style.dp(this@MainActivity, 20f), 0)
                    addView(View(this@MainActivity).apply {
                        background = android.graphics.drawable.GradientDrawable().apply {
                            setColor(speciesColor(sp)); cornerRadius = 99f
                        }
                    }, LinearLayout.LayoutParams(Style.dp(this@MainActivity, 12f),
                        Style.dp(this@MainActivity, 12f)).apply { marginEnd = Style.dp(this@MainActivity, 12f) })
                    addView(TextView(this@MainActivity).apply {
                        text = Native.traitText(sp, 0)
                        textSize = 15f
                        typeface = Style.word(this@MainActivity)
                        setTextColor(Style.TEXT)
                    })
                }
            }
        }
        AlertDialog.Builder(this, R.style.MicrocosmDialog)
            .setTitle(getString(R.string.dlg_seed_title))
            .setAdapter(adapter) { _, k ->
                world.seedSpecies = live[k]
                world.wallArmed = false
                world.toolArmed = 0
                setDial(false)
            }
            .setNegativeButton(getString(R.string.btn_none)) { _, _ -> world.seedSpecies = -1 }
            .show()
    }

    /** One slider row of the sun card. `id` is the source field: i, a, or sigma. */
    private fun sunSliderRow(id: String, label: String, min: Double, max: Double, step: Double,
                             fmt: (Double) -> String): LinearLayout {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            minimumHeight = Style.dp(this@MainActivity, 44f)
        }
        row.addView(TextView(this).apply {
            text = label
            textSize = 12f
            typeface = Style.word(this@MainActivity)
            setTextColor(Style.DIM)
        }, LinearLayout.LayoutParams(Style.dp(this, 84f), WRAP))
        val bar = android.widget.SeekBar(this).apply {
            this.max = Math.round((max - min) / step).toInt()
            progressTintList = android.content.res.ColorStateList.valueOf(Style.AMBER)
            thumbTintList = android.content.res.ColorStateList.valueOf(Style.AMBER)
            setOnSeekBarChangeListener(object : android.widget.SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(s: android.widget.SeekBar?, p: Int, fromUser: Boolean) {
                    if (fromUser) sunValues[id]?.text = fmt(min + p * step)
                }
                override fun onStartTrackingTouch(s: android.widget.SeekBar?) {}
                override fun onStopTrackingTouch(s: android.widget.SeekBar) { commitSun() }
            })
        }
        sunSliders[id] = bar
        row.addView(bar, LinearLayout.LayoutParams(0, WRAP, 1f))
        val value = TextView(this).apply {
            textSize = 13f
            typeface = Style.monoMedium(this@MainActivity)
            setTextColor(Style.AMBER)
            gravity = Gravity.END
        }
        sunValues[id] = value
        row.addView(value, LinearLayout.LayoutParams(Style.dp(this, 56f), WRAP))
        return row
    }

    /** A slider release commits all three fields as one sourceSet — one drag, one intervention. */
    private fun commitSun() {
        val k = world.sunSel
        if (k < 0) return
        val i = 0.0 + (sunSliders["i"]?.progress ?: 0) * 0.05
        val a = -8.0 + (sunSliders["a"]?.progress ?: 0) * 0.5
        val sg = 90.0 + (sunSliders["sigma"]?.progress ?: 0) * 10.0
        world.post {
            if (Native.levelAllowsSource(k) == 0) return@post // L7: the founded sky is locked
            Native.ivPush(WorldView.IV_SOURCE_SET)
            Native.evSourceSet(k, i, a, sg)
        }
    }

    /** A layout is ONE intervention (7.L): the shipped sun keeps its place; the rest is rebuilt.
     *  Internal: the boot gate applies real layouts. */
    internal fun applyLayout(which: Int) {
        if (world.homeSunLocked) return // layouts rewrite the whole sky, the founded sun included (L7)
        val layout = sourceLayouts[which]
        world.post {
            if (Native.levelAllowsSource(0) == 0) return@post
            Native.ivPush(WorldView.IV_SOURCE_LAYOUT)
            for (q in Native.sourceCount() - 1 downTo 1) Native.evSourceRemove(q)
            Native.evSourceSet(0, layout[0].i, layout[0].a, layout[0].sigma)
            for (q in 1 until layout.size)
                Native.evSourceAdd(layout[q].x, layout[q].y, layout[q].i, layout[q].a, layout[q].sigma)
        }
        world.sunSel = 0
        sunGripShown = -1 // repopulate the sliders from the reshaped sky
    }

    /** The gripped source's nature, read off its two channels — the browser's `sourceKind`. */
    private fun sunKind(i: Double, a: Double): String = getString(when {
        i > 0 && a > 0 -> R.string.src_hot_sun
        i > 0 && a < 0 -> R.string.src_cold_light
        i > 0 -> R.string.src_sun
        a > 0 -> R.string.src_heater
        a < 0 -> R.string.src_cold
        else -> R.string.src_dark
    })

    private val undoLabels by lazy { resources.getStringArray(R.array.undo_labels) }

    /** Names the thing that would be put back, in the world's own words. Kinds 1–3 take a name. */
    private fun undoLabel(kind: Int, sp: Int): String {
        val t = undoLabels.getOrElse(kind) { undoLabels[0] }
        return if (kind in 1..3) t.format(if (sp >= 0) Native.traitText(sp, 0) else "") else t
    }

    private fun button(label: String, onTap: () -> Unit) = Chrome.button(this, label, onTap)

    /** Fold or unfold the trait tiles — immediately, not on the next 250 ms tick. */
    internal fun setDetailsOpen(open: Boolean) {
        detailsOpen = open
        specimenTiles.visibility = if (open) ViewGroup.VISIBLE else ViewGroup.GONE
        specimenChevron.text = if (open) "▴" else "▾"
    }

    /**
     * The per-SPECIES content of the specimen sheet: portrait, role, food-web lines, description,
     * and the tiles' words (label, poles, what the dial trades). Every slot hides when a species
     * has no art or no words — docs/species-profiles.md's contract.
     */
    private fun populateProfile(snap: WorldView.Specimen) {
        val name = Native.traitText(snap.sp, 0)
        val art = Profiles.portrait(this, name)
        profilePortrait.show(art)
        fun put(view: TextView, res: Int, wrap: (String) -> String = { it }) {
            view.visibility = if (res != 0) ViewGroup.VISIBLE else ViewGroup.GONE
            if (res != 0) view.text = wrap(getString(res))
        }
        put(profileRole, Profiles.role(name))
        put(profileEats, Profiles.eats(name)) { getString(R.string.spec_eats, it) }
        put(profileEaten, Profiles.eatenBy(name)) { getString(R.string.spec_eaten, it) }
        put(profileAbout, Profiles.about(name))
        // No art and no words: the Steckbrief block takes no space at all rather than showing
        // an empty frame. The disclosure now governs the TILES, so it hides when there are none.
        val hasProfile = art != null || Profiles.role(name) != 0 || Profiles.about(name) != 0
        specimenProfile.visibility = if (hasProfile) ViewGroup.VISIBLE else ViewGroup.GONE
        val hasTraits = snap.loci.isNotEmpty()
        specimenDetails.visibility = if (hasTraits) ViewGroup.VISIBLE else ViewGroup.GONE
        setDetailsOpen(hasTraits && detailsOpen)
        for ((k, tile) in specimenTileViews.withIndex()) {
            val locus = snap.loci.getOrNull(k)
            tile.visibility = if (locus != null) ViewGroup.VISIBLE else ViewGroup.INVISIBLE
            if (locus != null) {
                ((tile.getChildAt(0) as LinearLayout).getChildAt(0) as TextView).text = locus.label
                val poles = tile.getChildAt(2) as LinearLayout
                (poles.getChildAt(0) as TextView).text = locus.lo
                (poles.getChildAt(1) as TextView).text = locus.hi
                put(tile.getChildAt(3) as TextView, Profiles.explain(locus.labelEn))
            }
        }
        specimenTiles.getChildAt(1).visibility =
            if (snap.loci.size > 2) ViewGroup.VISIBLE else ViewGroup.GONE
    }

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
            helpPanel.visibility == ViewGroup.VISIBLE -> helpPanel.visibility = ViewGroup.GONE
            expPanel.visibility == ViewGroup.VISIBLE -> expPanel.visibility = ViewGroup.GONE
            // On the front door, back leaves the app — the pond was saved on the way here, so
            // the exit costs nothing. (The old back-exit saved-then-finished because the
            // pause-time autosave lost the surface-teardown race, measured on the owner's
            // phone; routing the exit through the front door keeps that guarantee.)
            startPanel.visibility == ViewGroup.VISIBLE -> finish()
            reportView.visibility == ViewGroup.VISIBLE -> reportView.visibility = ViewGroup.GONE
            verdict.visibility == ViewGroup.VISIBLE -> verdict.visibility = ViewGroup.GONE
            world.dataOpen -> { world.dataOpen = false; dataPanel.visibility = ViewGroup.GONE }
            evoPanel.isOpen() -> evoPanel.close()
            drawer.visibility == ViewGroup.VISIBLE -> closeDrawer()
            dialOpen -> { setDial(false); world.intervene = false }
            world.selSpecies >= 0 -> world.deselect()
            world.placeSource != 0 -> world.placeSource = 0
            world.sunSel >= 0 -> world.sunSel = -1
            world.toolArmed != 0 -> world.toolArmed = 0
            world.wallArmed -> world.wallArmed = false
            world.intervene -> world.intervene = false
            else -> {
                // Top level: back goes to the front door, with the pond saved first — to its own
                // file per world (sandbox or experiment, see autosave()). The experiment list
                // stays one back-press away for the whole session.
                autosave()
                showStart(getString(if (running != null) R.string.start_sub_behind_experiment
                                    else R.string.start_sub_as_stands))
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
        autosave()
    }

    /**
     * U0.6: the pond autosaves when the app goes to the background — before this, losing the
     * process lost the world with a working save slot a few lines away. Since 2026-09-02 the
     * snapshot carries the level runtime (format v2), so an experiment autosaves too — the
     * earlier "levels are never autosaved" decision existed only because a restored
     * half-experiment would have been a lie, and the owner's report overturned it the day the
     * snapshot could tell the truth. Each world keeps its own file, so an experiment can never
     * clobber the kept sandbox pond. Best effort by nature: the save is queued to the render
     * thread, which normally turns it around within a frame, but a process killed faster keeps
     * the previous autosave — atomically, never a torn file.
     */
    private fun autosave() {
        // The core is the authority on whether an experiment is live — the shell's `running`
        // can lag it for a frame around boot, and misrouting once would clobber the sandbox.
        world.post {
            val live = Native.levelNum(0).toInt() != 0
            val bytes = Native.save()
            ui.post {
                if (live) {
                    writeAtomic(experimentFile(), bytes)
                } else {
                    writeAtomic(autosaveFile(), bytes)
                    experimentFile().delete() // a sandbox pause means no experiment is live any more
                }
            }
        }
    }

    private companion object {
        val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
        val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT
        /** The app's only preferences file, and the one key in it (GR.7). */
        const val PREFS = "microcosm"
        const val KEY_OPTIC = "light_field"
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
    /**
     * The front door's panel, which lives inside a scroller and carries that scroller's
     * visibility with it.
     *
     * The alternative was to toggle the wrapper at every one of the shell's `startPanel.visibility
     * = …` sites — and at the boot gate's, which sets it too. That is a rule nobody can enforce:
     * the first line that hides the panel and forgets the scroller leaves a full-screen invisible
     * view over the pond, eating every touch. So the two are welded here instead, where there is
     * exactly one place to get it right. Reopening the door also returns it to the top: a player
     * who scrolled to the optic and left should not come back to a screen with no title on it.
     */
    private class StartDoor(ctx: Context) : LinearLayout(ctx) {
        override fun setVisibility(v: Int) {
            super.setVisibility(v)
            (parent as? ScrollView)?.let {
                it.visibility = v
                if (v == VISIBLE) it.scrollTo(0, 0)
            }
        }
    }

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
