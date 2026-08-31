package org.microcosm.app

import android.app.Activity
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

        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(12, 12, 12, 12)
        }
        for (s in doubleArrayOf(0.0, 1.0, 4.0, 16.0)) bar.addView(button(if (s == 0.0) "pause" else "${s.toInt()}x") {
            world.speed = s
        })
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
