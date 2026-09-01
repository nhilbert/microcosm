package org.microcosm.app

import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.TextView

/**
 * The Evolution panel (EV) — Phase 6's levers, on the phone.
 *
 * Ported from the browser's `EvolutionPanel` (src/ui.jsx): mutation on/off, per-locus mutation
 * rate (sigma) and trade-off curvature, the price slopes behind a "prices" fold with the measured
 * balance marks, and four presets that are ONE intervention each — a bundle of events under a
 * single log entry, exactly as 6.3 shipped them.
 *
 * Threading is the app's standing rule: the core is read and written on the render thread only.
 * The panel fetches a snapshot through `world.post` when it opens and after every commit; a
 * slider commits on release (one drag = one intervention, the browser's rule, by cheaper means).
 *
 * Recorded gap, honestly: the browser's evolution undo was UI-side (the core's undo slot covers
 * world levers only, codes 1–12), and it is not ported yet — evolution changes here are logged
 * and impact-carded, but the undo chip will not offer them.
 */
class EvolutionPanel(private val a: MainActivity, private val world: WorldView) {

    /** Locus key ids of the C ABI (wasm.rs `locus_key`). */
    private companion object {
        const val KEY_SIGMA = 0
        const val KEY_CURVE = 1
        /** The browser's PRICE_KEYS: esc, kp, catch, kb, light, rate, eff — ABI keys 2..8. */
        val PRICE_KEYS = 2..8
        val PRICE_NAMES = mapOf(2 to "esc", 3 to "kp", 4 to "catch", 5 to "kb",
            6 to "light", 7 to "rate", 8 to "eff")
        /** 6.1's measured balance marks: (sp, key) → the value that held the locus mid-corridor.
         *  First locus only, as the browser marks them. */
        val BALANCE = mapOf(0 to mapOf(6 to 0.5), 1 to mapOf(3 to 0.5),
            2 to mapOf(5 to 0.15), 3 to mapOf(8 to 0.15, 7 to 0.5))
    }

    private class Row(val sp: Int, val k: Int, val name: String, val label: String, val color: Int,
        var sigma: Double, var curve: Double, val prices: MutableMap<Int, Double>)

    val view: LinearLayout = LinearLayout(a).apply {
        orientation = LinearLayout.VERTICAL
        setBackgroundColor(Style.SURFACE_SCRIM)
        visibility = ViewGroup.GONE
        isClickable = true
    }
    private val body = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL }
    private lateinit var mutationBtn: TextView
    private var pricesOpen = false
    private lateinit var pricesBox: LinearLayout
    private lateinit var pricesBtn: android.widget.Button
    private val valueViews = HashMap<String, TextView>()
    private val sliderViews = HashMap<String, SeekBar>()
    private var rows: List<Row> = emptyList()
    private var mutation = true
    private var built = false

    init {
        val title = TextView(a).apply {
            text = a.getString(R.string.evo_title)
            setTextColor(Style.BRIGHT)
            textSize = 20f
            typeface = Style.wordBold(a)
            setPadding(Style.dp(a, 24f), Style.dp(a, 16f), Style.dp(a, 24f), Style.dp(a, 6f))
        }
        view.addView(title)
        view.addView(ScrollView(a).apply { addView(body) },
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        view.addView(Chrome.button(a, a.getString(R.string.btn_close)) { close() })
        body.setPadding(Style.dp(a, 24f), 0, Style.dp(a, 24f), Style.dp(a, 16f))
    }

    fun isOpen() = view.visibility == ViewGroup.VISIBLE

    fun open() {
        view.visibility = ViewGroup.VISIBLE
        refresh()
    }

    fun close() {
        view.visibility = ViewGroup.GONE
    }

    /** Read the world's evolution state on the render thread, then (re)build or repaint. */
    private fun refresh() {
        world.post {
            val got = ArrayList<Row>()
            for (sp in 0 until 7) for (k in 0 until Native.locusCount(sp)) {
                val prices = HashMap<Int, Double>()
                for (key in PRICE_KEYS) {
                    val v = Native.locusGet(sp, k, key)
                    if (!v.isNaN() && v != 0.0) prices[key] = v
                }
                got.add(Row(sp, k, Native.traitText(sp, 0),
                    L10n.trait(Native.traitText(sp, 10 + k)).lowercase(),
                    android.graphics.Color.rgb(Native.specNum(sp, 0, 0, 0).toInt(),
                        Native.specNum(sp, 0, 0, 1).toInt(), Native.specNum(sp, 0, 0, 2).toInt()),
                    Native.locusGet(sp, k, KEY_SIGMA), Native.locusGet(sp, k, KEY_CURVE), prices))
            }
            val mut = Native.scalar(50) != 0.0
            a.runOnUiThread {
                rows = got
                mutation = mut
                if (!built) { built = true; build() }
                repaint()
            }
        }
    }

    // ---- building ----

    private fun sectionLabel(text: String) = TextView(a).apply {
        this.text = text.uppercase()
        textSize = 11f
        letterSpacing = 0.14f
        typeface = Style.word(a)
        setTextColor(Style.DIM)
        setPadding(0, Style.dp(a, 14f), 0, Style.dp(a, 6f))
    }

    /** One slider row: dim label, amber-thumbed slider, mono value. Commits on release. */
    private fun sliderRow(id: String, label: String, min: Double, max: Double, step: Double,
                          fmt: (Double) -> String, onCommit: (Double) -> Unit): LinearLayout {
        val row = LinearLayout(a).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            minimumHeight = Style.dp(a, 44f)
        }
        row.addView(TextView(a).apply {
            text = label
            textSize = 12f
            typeface = Style.word(a)
            setTextColor(Style.DIM)
        }, LinearLayout.LayoutParams(Style.dp(a, 96f), ViewGroup.LayoutParams.WRAP_CONTENT))
        val steps = Math.round((max - min) / step).toInt()
        val bar = SeekBar(a).apply {
            this.max = steps
            progressTintList = android.content.res.ColorStateList.valueOf(Style.AMBER)
            thumbTintList = android.content.res.ColorStateList.valueOf(Style.AMBER)
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(s: SeekBar?, p: Int, fromUser: Boolean) {
                    if (fromUser) valueViews[id]?.text = fmt(min + p * step)
                }
                override fun onStartTrackingTouch(s: SeekBar?) {}
                override fun onStopTrackingTouch(s: SeekBar) {
                    onCommit(min + s.progress * step)
                }
            })
        }
        sliderViews[id] = bar
        row.addView(bar, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        val value = TextView(a).apply {
            textSize = 13f
            typeface = Style.monoMedium(a)
            setTextColor(Style.AMBER)
            gravity = Gravity.END
        }
        valueViews[id] = value
        row.addView(value, LinearLayout.LayoutParams(Style.dp(a, 56f), ViewGroup.LayoutParams.WRAP_CONTENT))
        return row
    }

    private fun setSlider(id: String, min: Double, step: Double, v: Double, fmt: (Double) -> String) {
        sliderViews[id]?.progress = Math.round((v - min) / step).toInt()
        valueViews[id]?.text = fmt(v)
    }

    private fun build() {
        // the master switch
        mutationBtn = TextView(a).apply {
            textSize = 14f
            typeface = Style.word(a)
            gravity = Gravity.CENTER
            minHeight = Style.dp(a, 48f)
            setPadding(Style.dp(a, 16f), Style.dp(a, 12f), Style.dp(a, 16f), Style.dp(a, 12f))
            setOnClickListener { toggleMutation() }
        }
        body.addView(mutationBtn, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        val f3 = { v: Double -> "%.3f".format(v) }
        val f2s = { v: Double -> (if (v >= 0) "+" else "") + "%.2f".format(v) }
        for (r in rows) {
            val head = TextView(a).apply {
                text = r.name + "  ·  " + r.label
                textSize = 14f
                typeface = Style.wordMedium(a)
                setTextColor(r.color)
                setPadding(0, Style.dp(a, 14f), 0, Style.dp(a, 2f))
            }
            body.addView(head)
            body.addView(sliderRow("${r.sp}:${r.k}:s", a.getString(R.string.evo_rate),
                0.0, 0.12, 0.005, f3) { v -> commit(r, KEY_SIGMA, v) })
            body.addView(sliderRow("${r.sp}:${r.k}:c", a.getString(R.string.evo_curve),
                -0.5, 0.8, 0.05, f2s) { v -> commit(r, KEY_CURVE, v) })
        }
        body.addView(TextView(a).apply {
            text = a.getString(R.string.evo_explainer)
            textSize = 12f
            typeface = Style.word(a)
            setTextColor(Style.AMBER_BORDER)
            setPadding(0, Style.dp(a, 8f), 0, 0)
        })

        body.addView(sectionLabel(a.getString(R.string.evo_presets)))
        body.addView(Chrome.build(a, "presets") { k -> applyPreset(k) },
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        pricesBtn = Chrome.button(a, a.getString(R.string.evo_prices)) { togglePrices() }
        body.addView(pricesBtn, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = Style.dp(a, 12f)
        })
        pricesBox = LinearLayout(a).apply {
            orientation = LinearLayout.VERTICAL
            visibility = ViewGroup.GONE
        }
        val f2 = { v: Double -> "%.2f".format(v) }
        for (r in rows) {
            if (r.prices.isEmpty()) continue
            pricesBox.addView(TextView(a).apply {
                text = r.name + "  ·  " + r.label
                textSize = 13f
                typeface = Style.wordMedium(a)
                setTextColor(r.color)
                setPadding(0, Style.dp(a, 12f), 0, 0)
            })
            for ((key, _) in r.prices.toSortedMap()) {
                val bal = if (r.k == 0) BALANCE[r.sp]?.get(key) else null
                val lab = PRICE_NAMES[key] + (bal?.let { "  · " + a.getString(R.string.evo_balance, f2(it)) } ?: "")
                pricesBox.addView(sliderRow("${r.sp}:${r.k}:$key", lab, 0.0, 1.0, 0.05, f2) { v ->
                    commit(r, key, v)
                })
            }
        }
        body.addView(pricesBox)
    }

    private fun repaint() {
        val on = mutation
        mutationBtn.text = a.getString(if (on) R.string.evo_mutation_on else R.string.evo_mutation_off)
        mutationBtn.setTextColor(if (on) Style.AMBER else Style.DIM)
        mutationBtn.background = Style.touchable(a,
            if (on) Style.pill(a, amber = true) else Style.pill(a))
        val f3 = { v: Double -> "%.3f".format(v) }
        val f2s = { v: Double -> (if (v >= 0) "+" else "") + "%.2f".format(v) }
        val f2 = { v: Double -> "%.2f".format(v) }
        for (r in rows) {
            setSlider("${r.sp}:${r.k}:s", 0.0, 0.005, r.sigma, f3)
            setSlider("${r.sp}:${r.k}:c", -0.5, 0.05, r.curve, f2s)
            for ((key, v) in r.prices) setSlider("${r.sp}:${r.k}:$key", 0.0, 0.05, v, f2)
        }
    }

    // The boot gate drives the same paths the buttons call — real methods, not test doubles.
    internal fun gateToggleMutation() = toggleMutation()
    internal fun gatePreset(k: Int) = applyPreset(k)

    private fun togglePrices() {
        pricesOpen = !pricesOpen
        pricesBox.visibility = if (pricesOpen) ViewGroup.VISIBLE else ViewGroup.GONE
        pricesBtn.text = a.getString(if (pricesOpen) R.string.evo_prices_hide else R.string.evo_prices)
    }

    // ---- commits: every control is an event, logged like the browser's ----

    private fun commit(r: Row, key: Int, v: Double) {
        world.post {
            Native.ivPush(WorldView.IV_LOCUS)
            Native.evLocus(r.sp, r.k, key, v)
        }
        refresh()
    }

    private fun toggleMutation() {
        val target = !mutation
        world.post {
            Native.ivPush(WorldView.IV_MUTATION)
            Native.evMutation(if (target) 1 else 0)
        }
        refresh()
    }

    /**
     * A preset is ONE intervention (6.3): one log entry, a bundle of events. The recipes are the
     * browser's PRESETS verbatim; "shipped" means the sigma this world FOUNDED with
     * ([WorldView.shippedSigma], captured at founding).
     */
    private fun applyPreset(which: Int) {
        world.post {
            Native.ivPush(WorldView.IV_PRESET)
            val wantMutation = which != 3 // frozen is the only mutation-off preset
            if ((Native.scalar(50) != 0.0) != wantMutation) Native.evMutation(if (wantMutation) 1 else 0)
            for (sp in 0 until 7) for (k in 0 until Native.locusCount(sp)) {
                val s0 = world.shippedSigma[sp * 4 + k] ?: Native.locusGet(sp, k, KEY_SIGMA)
                val targets: Map<Int, Double> = when (which) {
                    0 -> mapOf(KEY_SIGMA to s0, KEY_CURVE to 0.0)                       // shipped
                    1 -> mapOf(KEY_CURVE to 0.3)                                        // settled
                    2 -> mapOf(KEY_CURVE to -0.2, KEY_SIGMA to minOf(0.12, s0 * 2))     // wild
                    else -> emptyMap()                                                  // frozen
                }
                for ((key, v) in targets)
                    if (Math.abs(Native.locusGet(sp, k, key) - v) > 1e-9) Native.evLocus(sp, k, key, v)
            }
        }
        refresh()
    }
}
