package org.microcosm.app

import android.app.Activity
import android.graphics.Color
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
 * A.1's shell: the world on a SurfaceView, a monospaced HUD, speed buttons, and the benchmark that
 * answers the question M5.0 left open — the core ticks at 250x real time, so how much frame budget
 * does the renderer actually have?
 *
 * Gestures, panels and the rest of the parity work arrive in A.2 onward
 * (docs/android-app-plan.md). Nothing here is meant to be the finished chrome.
 */
class MainActivity : Activity() {

    private lateinit var world: WorldView
    private lateinit var hud: TextView
    private lateinit var reportView: TextView
    private val ui = Handler(Looper.getMainLooper())

    private val tickHud = object : Runnable {
        override fun run() {
            hud.text = world.stats
            world.report?.let {
                reportView.text = it
                reportView.visibility = ViewGroup.VISIBLE
            }
            ui.postDelayed(this, 250)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = FrameLayout(this)
        world = WorldView(this)
        root.addView(world, FrameLayout.LayoutParams(MATCH, MATCH))

        hud = TextView(this).apply {
            setTextColor(Color.parseColor("#C9D7E3"))
            setBackgroundColor(Color.parseColor("#D00B131E"))
            textSize = 11f
            typeface = android.graphics.Typeface.MONOSPACE
            setPadding(24, 24, 24, 24)
        }
        root.addView(hud, FrameLayout.LayoutParams(MATCH, WRAP).apply { gravity = Gravity.TOP })

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
        root.addView(bar, FrameLayout.LayoutParams(MATCH, WRAP).apply { gravity = Gravity.BOTTOM })

        reportView = TextView(this).apply {
            setTextColor(Color.parseColor("#C9D7E3"))
            setBackgroundColor(Color.parseColor("#F00B131E"))
            textSize = 12f
            typeface = android.graphics.Typeface.MONOSPACE
            setPadding(32, 32, 32, 32)
            visibility = ViewGroup.GONE
            setOnClickListener { visibility = ViewGroup.GONE }
        }
        val scroll = ScrollView(this).apply { addView(reportView) }
        root.addView(scroll, FrameLayout.LayoutParams(MATCH, WRAP).apply { gravity = Gravity.CENTER })

        // targetSdk 35 draws edge to edge on Android 15, so without this the HUD sits under the
        // clock and the buttons under the gesture pill — which is exactly what the first device
        // screenshots showed.
        @Suppress("DEPRECATION")
        root.setOnApplyWindowInsetsListener { _, insets ->
            hud.setPadding(24, insets.systemWindowInsetTop + 24, 24, 24)
            bar.setPadding(12, 12, 12, insets.systemWindowInsetBottom + 12)
            insets
        }
        root.requestApplyInsets()

        setContentView(root)
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
