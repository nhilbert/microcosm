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
        feedButton = button("feed") { world.feedSelected() }
        killButton = button("kill") { world.killSelected() }
        wallButton = button("wall") { world.wallArmed = !world.wallArmed }
        actions.addView(feedButton)
        actions.addView(killButton)
        actions.addView(button("seed") { seedPicker() })
        actions.addView(wallButton)
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
        sunBar.addView(button("dimmer") { nudgeSun(-0.15) })
        sunBar.addView(button("brighter") { nudgeSun(0.15) })
        sunBar.addView(button("release") { world.sunSel = -1 })
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
        for (s in doubleArrayOf(0.0, 1.0, 4.0, 16.0)) bar.addView(button(if (s == 0.0) "pause" else "${s.toInt()}x") {
            world.speed = s
        })
        bar.addView(button("mode") { world.intervene = !world.intervene }.also { modeButton = it })
        bar.addView(button("bench") {
            reportView.visibility = ViewGroup.GONE
            world.speed = 0.0
            world.benchmark()
        })
        bottom.addView(bar)
        root.addView(bottom, FrameLayout.LayoutParams(MATCH, WRAP).apply { gravity = Gravity.BOTTOM })

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

    private fun button(label: String, onTap: () -> Unit) = Button(this).apply {
        text = label
        textSize = 11f
        setOnClickListener { onTap() }
    }

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
