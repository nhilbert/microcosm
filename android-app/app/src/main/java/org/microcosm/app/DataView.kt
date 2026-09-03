package org.microcosm.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.view.View
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * Data mode's drawn pages: Populations, Chemistry, Metabolism, Traits.
 *
 * The series are handed over by the render thread as a flat copy — never read live out of the
 * recorder ring. `indicators()` and the event feed genuinely mutate the core while computing, so
 * reading them from the UI thread would be a race on a `&mut Sim`; copying fourteen channels four
 * times a second costs nothing and removes the question.
 *
 * ## The U3 pass (owner review, 2026-09-03)
 *
 * The owner's five screenshots and five sentences: the charts are too huge with no free space,
 * the labels are too big, there is no legend, the text pages are almost raw, and the row of pages
 * on top steals a fifth of the phone. Every one of those is true and every one has the same
 * cause — the browser's chart code was ported as *drawing* and never as *design*. What changed
 * here, and why, in the order the eye meets it:
 *
 * 1. **The plot no longer eats the view.** It used to be `height - padT - padB`, so the chart was
 *    exactly as tall as whatever container it sat in — which on a phone is everything. Now
 *    [contentHeight] MEASURES the page: a plot bounded to ~0.62 of its own width (170–300 dp), an
 *    axis band, the legend, and done. The ScrollView's `fillViewport` still hands us the rest of
 *    the screen; we simply decline to draw into it. That is the free space.
 * 2. **Type is in sp, and small.** Axis labels were `22f * density` — about twice a caption, and
 *    deaf to the player's font-size setting. They are [Style.CHART_AXIS_SP] now, through
 *    [Style.sp], like every other piece of text in the app.
 * 3. **Every colour gets a name.** A legend row per series — a colour dot, the name in ordinary
 *    ink, and the current value in mono on the right. It is not decoration: the species palette
 *    is the WORLD's (rule 7 — those colours belong to the creatures, and a chart that recoloured
 *    them would break the one link that makes the chart worth reading), and measured against the
 *    data-viz checks that palette collapses under deuteranopia (Cilio↔Drifta ΔE 1.9) and is thin
 *    even in full colour (Drifta↔Venator ΔE 8.9, floor 15). Since the hues cannot move, the
 *    identity has to arrive through a second channel: the legend names it, the value column reads
 *    as a table, and the population lines carry a direct end-label apiece. Colour alone never
 *    decides anything here.
 * 4. **Metabolism stopped lying.** It drew production and burn against one scale and recycling
 *    against a second, invisible one, in the same box — a dual-axis chart, which invents whatever
 *    correlation the two scalings happen to imply. It is two stacked panels now, each honest on
 *    its own axis, sharing one time axis: small multiples, the standard repair.
 * 5. **Stacked bands are separated by the ground, not by outlines.** A 2 dp gap in the surface
 *    colour between chemistry's compartments, which is what makes four quiet fills readable
 *    without four loud borders.
 *
 * What was deliberately NOT changed: the scales and the stacking are still the browser's
 * (`src/ui-data.jsx`) — a log decade axis for populations because the vast and the rare have to
 * share one readable canvas, and a stacked area for chemistry whose bright top edge only moves
 * when the hand adds matter.
 */
class DataView(context: Context) : View(context) {

    companion object {
        /** The channels copied across, in this order. */
        val CHANNELS = intArrayOf(0, 1, 2, 3, 4, 5, 6, 14, 15, 16, 17, 19, 20, 21)
        const val PAGE_POPULATIONS = 0
        const val PAGE_CHEMISTRY = 1
        const val PAGE_METABOLISM = 2
        const val PAGE_TRAITS = 5
        private const val REC_STRIDE = 20
        const val TRAIT_BAND_DP = 228f
        const val HIST_BINS = 24

        // ---- indices into CHANNELS, named once so the draw code reads ----
        private const val C_FREE = 7
        private const val C_BOUND = 8
        private const val C_CORPSE = 9
        private const val C_DETRITUS = 10
        private const val C_GPP = 11
        private const val C_RESP = 12
        private const val C_RECYCLE = 13

        /**
         * Chemistry's four compartments, bottom of the stack first: what is alive, what has died,
         * what has fallen apart, and what is back in the water.
         *
         * The hues are the world's semantics, not a chart palette — green is life and blue is
         * dissolved mineral everywhere else in this app, and the two greys are dead matter reading
         * as dead matter. Measured (data-viz six checks, dark, surface #0B131E): worst adjacent
         * pair ΔE 9.2 under deuteranopia and 15.3 in full colour — both above the gates. They fail
         * the lightness-band and chroma-floor checks, which is the deliberate part: those two ask
         * a palette to be uniformly loud, and "corpses" and "detritus" are supposed to be dull.
         * The legend below the plot carries the names either way.
         */
        private val CHEM_FILL = intArrayOf(
            Color.rgb(70, 214, 140),   // in living bodies
            Color.rgb(158, 168, 178),  // in the dead
            Color.rgb(110, 122, 134),  // in detritus
            Color.rgb(91, 200, 232),   // dissolved
        )
        private val CHEM_CHANNEL = intArrayOf(C_BOUND, C_CORPSE, C_DETRITUS, C_FREE)

        /**
         * Metabolism's three. Production leads, burn answers it, recycling is the mineral coming
         * back. Measured: production↔burn ΔE 13.6 deuteranopia / 21.1 full colour — comfortably
         * above the gates, and notably BETTER than the saturated green/red pair that a first pass
         * reached for, which collapsed to 5.2 (the classic red-green confusion). The separation
         * here is carried by lightness, which is why the burn line is a muted tan and stays one.
         */
        private val METAB_COLOR = intArrayOf(
            Color.rgb(140, 230, 170),  // produced
            Color.rgb(196, 150, 140),  // burned
            Color.rgb(91, 200, 232),   // recycled
        )
    }

    /**
     * One (species, locus) band of the Traits page (EV): everything the render thread reads out
     * of the core for it — the histogram of the living population, the founder value, the words
     * at the poles. The mean±sd ribbon comes separately as [traitSeries].
     */
    class Band(
        val color: Int, val title: String, val stats: String, val g0: Float,
        val lo: String, val hi: String, val alive: Int, val hist: FloatArray,
    )

    /** One legend row: a colour, the name it answers to, and what it reads right now. */
    private class Key(val color: Int, val name: String, val value: Float, val share: Float = -1f)

    var page = PAGE_POPULATIONS
        set(v) { field = v; requestLayout(); invalidate() }

    /** `series[c * n + k]`, oldest first; set by the render thread. */
    private var series: FloatArray? = null
    private var n = 0
    private var speciesColor = IntArray(7) { Color.GRAY }
    private var speciesName = Array(7) { "" }
    private var bands: Array<Band> = emptyArray()
    /** `traitSeries[(band*2 + 0|1) * n + k]` — mean, sd — oldest first. */
    private var traitSeries: FloatArray = FloatArray(0)

    fun submit(data: FloatArray, count: Int, colors: IntArray, names: Array<String>) {
        val grew = count != n
        series = data
        n = count
        speciesColor = colors
        speciesName = names
        // The legend's height depends on how many species are ALIVE in the window, so a species
        // dying out changes the page's measured height. Cheap to re-measure; wrong to skip.
        if (grew) requestLayout()
        postInvalidate()
    }

    fun submitTraits(b: Array<Band>, s: FloatArray, count: Int) {
        val grew = b.size != bands.size
        bands = b
        traitSeries = s
        n = count
        if (grew) requestLayout()
        postInvalidate()
    }

    private val dp = context.resources.displayMetrics.density

    /** Numbers: IBM Plex Mono, so a column of values lines up. */
    private val pv = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Style.mono(context) }
    /** Words: Space Grotesk, like every other label in the app. */
    private val pw = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Style.word(context) }
    /** Marks: no text, so it keeps stroke settings across a draw. */
    private val pm = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val path = Path()

    private val axisSp = Style.sp(context, Style.CHART_AXIS_SP)
    private val legendSp = Style.sp(context, Style.CHART_LEGEND_SP)

    // ---- the page's own metrics; everything below is derived, nothing reads `height` ----
    private val padL = 44f * dp          // the y-axis gutter
    private val padT = 10f * dp
    private val padB = 22f * dp
    private val padSide = 18f * dp       // the page's left/right air
    private val xBand = 20f * dp         // the time labels under the plot
    private val legendGap = 18f * dp
    private val legendRow = 27f * dp
    private val panelCap = 17f * dp      // a small-multiple panel's caption line
    /** The right gutter the population page's direct end-labels live in. */
    private val endGutter = 50f * dp

    private fun at(c: Int, k: Int): Float {
        val s = series ?: return 0f
        return s[c * n + k]
    }

    private fun rightPad() = if (page == PAGE_POPULATIONS) endGutter else padSide

    /**
     * The plot's own height.
     *
     * Two failures to avoid, and they pull opposite ways. The old chart took whatever height the
     * container had, so on a phone it ran edge to edge with nothing around it — the owner's "too
     * huge with no free space". A fixed small height instead would answer the words and miss the
     * point: the fix for a cramped chart is air around it, not a stamp.
     *
     * So the plot spends what the screen offers and stops at an aspect: never taller than its own
     * plotting width (a square is already a tall chart for a time series on a phone), never
     * shorter than 0.55 of it. What is left over is the free space, and it is deliberate rather
     * than left over. [avail] is the body height when the container states one, else 0.
     */
    private fun plotH(w: Int, avail: Int): Float {
        val cw = (w - padL - rightPad()).coerceAtLeast(1f)
        val spare = if (avail <= 0) cw * 0.62f
        else avail - (padT + padB + xBand + legendGap + keyCount() * legendRow +
            if (page == PAGE_METABOLISM) panelCap * 2 + 10f * dp else 0f)
        return spare.coerceIn(cw * 0.55f, cw)
    }

    /** How many legend rows this page will draw, so the measure and the paint agree. */
    private fun keyCount(): Int = when (page) {
        PAGE_POPULATIONS -> if (series == null || n < 2) 0 else (0 until 7).count { alive(it) }
        PAGE_CHEMISTRY -> if (series == null || n < 2) 0 else 4
        PAGE_METABOLISM -> if (series == null || n < 2) 0 else 3
        else -> 0
    }

    private fun alive(sp: Int): Boolean {
        var k = 0
        while (k < n) { if (at(sp, k) > 0f) return true; k += 3 }
        return false
    }

    /**
     * The height this page actually needs. The Traits page is a stack of small multiples and is
     * taller than any screen; the chart pages are a plot plus a legend and are deliberately not.
     */
    private fun contentHeight(w: Int, avail: Int): Int {
        if (page == PAGE_TRAITS)
            return if (bands.isEmpty()) (200f * dp).toInt() else (bands.size * TRAIT_BAND_DP * dp).toInt()
        val plot = plotH(w, avail) + if (page == PAGE_METABOLISM) panelCap * 2 + 10f * dp else 0f
        val keys = keyCount()
        val legend = if (keys == 0) 0f else legendGap + keys * legendRow
        return (padT + plot + xBand + legend + padB).toInt()
    }

    /** What this page asks for in a [w]×[h] px body — the gate's handle on the bounded-plot promise. */
    internal fun measureSelf(w: Int, h: Int): Int = contentHeight(w, h)

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val w = MeasureSpec.getSize(widthSpec)
        // A fillViewport ScrollView says "you may have the whole screen" with an EXACTLY spec.
        // Take what the page needs from it and no more; the remainder becomes air under the legend.
        val avail = MeasureSpec.getSize(heightSpec)
            .takeIf { MeasureSpec.getMode(heightSpec) != MeasureSpec.UNSPECIFIED } ?: 0
        setMeasuredDimension(w, max(contentHeight(w, avail), avail))
    }

    override fun onDraw(canvas: Canvas) {
        pm.color = Style.ABYSS
        pm.style = Paint.Style.FILL
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), pm)
        if (page == PAGE_TRAITS) { drawTraits(canvas); return }

        val cw = width - padL - rightPad()
        val ph = plotH(width, height)
        if (series == null || n < 5) { gathering(canvas, padL, padT + ph / 2); return }

        val keys = when (page) {
            PAGE_POPULATIONS -> populations(canvas, cw, ph)
            PAGE_CHEMISTRY -> chemistry(canvas, cw, ph)
            else -> metabolism(canvas, cw, ph)
        }
        val plotBottom = padT + ph + if (page == PAGE_METABOLISM) panelCap * 2 + 10f * dp else 0f
        timeAxis(canvas, cw, plotBottom)
        legend(canvas, keys, plotBottom + xBand + legendGap)
    }

    private fun gathering(canvas: Canvas, x: Float, y: Float) {
        pw.color = Style.CHART_INK
        pw.textSize = legendSp
        canvas.drawText(context.getString(R.string.health_gathering), x, y, pw)
    }

    private fun xOf(k: Int, cw: Float) = padL + cw * k / max(1, n - 1)

    /** The corner rules: the left edge and the baseline, hairline and solid. Never dashed. */
    private fun frame(canvas: Canvas, cw: Float, top: Float, h: Float) {
        pm.style = Paint.Style.STROKE
        pm.strokeWidth = 1f * dp
        pm.color = Style.CHART_AXIS
        canvas.drawLine(padL, top, padL, top + h, pm)
        canvas.drawLine(padL, top + h, padL + cw, top + h, pm)
        pm.style = Paint.Style.FILL
    }

    private fun gridline(canvas: Canvas, cw: Float, y: Float) {
        pm.style = Paint.Style.STROKE
        pm.strokeWidth = 1f * dp
        pm.color = Style.CHART_GRID
        canvas.drawLine(padL, y, padL + cw, y, pm)
        pm.style = Paint.Style.FILL
    }

    /** A y tick's number, right-aligned into the gutter so the digits sit off the plot. */
    private fun yTick(canvas: Canvas, label: String, y: Float) {
        pv.color = Style.CHART_INK
        pv.textSize = axisSp
        canvas.drawText(label, padL - 8f * dp - pv.measureText(label), y + axisSp * 0.36f, pv)
    }

    private fun timeAxis(canvas: Canvas, cw: Float, plotBottom: Float) {
        pv.color = Style.CHART_INK
        pv.textSize = axisSp
        val y = plotBottom + xBand * 0.72f
        canvas.drawText("−${(n - 1) * REC_STRIDE / 10} s", padL, y, pv)
        val now = context.getString(R.string.axis_now)
        canvas.drawText(now, padL + cw - pv.measureText(now), y, pv)
    }

    /**
     * The legend: a dot in the series colour, the name in ordinary ink, the value in mono on the
     * right. Text never wears the data colour — a light hue is illegible as text on the abyss, and
     * the coloured dot beside the words is what carries identity.
     *
     * Read down the value column and it is also the table view of the chart above it, which is
     * what makes a palette this app is not allowed to change safe to ship.
     */
    private fun legend(canvas: Canvas, keys: List<Key>, top: Float) {
        if (keys.isEmpty()) return
        val r = 4.5f * dp
        val right = width - padSide
        for ((i, key) in keys.withIndex()) {
            val cy = top + i * legendRow + legendRow / 2
            pm.style = Paint.Style.FILL
            pm.color = key.color
            canvas.drawCircle(padSide + r, cy, r, pm)
            pw.color = Style.TEXT
            pw.textSize = legendSp
            canvas.drawText(key.name, padSide + 2 * r + 10f * dp, cy + legendSp * 0.35f, pw)
            pv.textSize = legendSp
            pv.color = Style.BRIGHT
            val v = fmt(key.value)
            canvas.drawText(v, right - pv.measureText(v), cy + legendSp * 0.35f, pv)
            if (key.share >= 0f) {
                pv.color = Style.CHART_INK
                pv.textSize = axisSp
                val s = "${(key.share * 100).roundToInt()} %"
                canvas.drawText(s, right - pv.measureText(v) - 12f * dp - pv.measureText(s),
                    cy + legendSp * 0.35f, pv)
            }
        }
    }

    private fun line(canvas: Canvas, c: Int, cw: Float, yOf: (Float) -> Float, color: Int, w: Float) {
        path.reset()
        for (k in 0 until n) {
            val x = xOf(k, cw)
            val y = yOf(at(c, k))
            if (k == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        pm.style = Paint.Style.STROKE
        pm.color = color
        pm.strokeWidth = w
        canvas.drawPath(path, pm)
        pm.style = Paint.Style.FILL
    }

    /** The series' last value, as a dot with a 2 dp ring in the ground so crossings stay legible. */
    private fun endDot(canvas: Canvas, x: Float, y: Float, color: Int) {
        pm.style = Paint.Style.FILL
        pm.color = Style.ABYSS
        canvas.drawCircle(x, y, 5.5f * dp, pm)
        pm.color = color
        canvas.drawCircle(x, y, 3.5f * dp, pm)
    }

    // ---------------------------------------------------------------- populations

    /**
     * Every line a species, on a log axis: the mat and the hunter on one canvas.
     *
     * Each line ends in a ringed dot and its own short name in the right gutter — the direct
     * labelling the data-viz pass owes the reader, since the world's palette cannot be re-stepped
     * to clear the colourblind gates. Labels are placed top-down and a label that would collide
     * with the one above it is dropped rather than nudged: a label detached from its line is
     * worse than no label, and the legend below carries every name anyway.
     */
    private fun populations(canvas: Canvas, cw: Float, ch: Float): List<Key> {
        var ymax = 10f
        for (c in 0 until 7) for (k in 0 until n) ymax = max(ymax, at(c, k))
        ymax *= 1.08f
        val lm = log10(1.0 + ymax)
        val yOf = { v: Float -> padT + ch * (1f - (log10(1.0 + v) / lm).toFloat()) }

        frame(canvas, cw, padT, ch)
        for (d in intArrayOf(1, 10, 100, 1000, 10000)) {
            if (d > ymax) break
            val y = yOf(d.toFloat())
            gridline(canvas, cw, y)
            yTick(canvas, group(d.toLong()), y)
        }

        val keys = ArrayList<Key>()
        val ends = ArrayList<Triple<Float, Int, String>>()
        for (sp in 0 until 7) {
            if (!alive(sp)) continue
            line(canvas, sp, cw, yOf, speciesColor[sp], 2f * dp)
            val last = at(sp, n - 1)
            val y = yOf(last)
            endDot(canvas, padL + cw, y, speciesColor[sp])
            keys.add(Key(speciesColor[sp], speciesName[sp], last))
            ends.add(Triple(y, speciesColor[sp], speciesName[sp].take(3)))
        }
        // top-down, dropping anything that would land on its neighbour
        ends.sortBy { it.first }
        pv.textSize = axisSp
        var lastY = -1e9f
        for ((y, color, tag) in ends) {
            if (y - lastY < axisSp * 1.15f) continue
            pv.color = color
            canvas.drawText(tag, padL + cw + 10f * dp, y + axisSp * 0.36f, pv)
            lastY = y
        }
        return keys
    }

    // ---------------------------------------------------------------- chemistry

    /**
     * Where every unit of mineral sits. The bright top edge only moves when the hand adds.
     *
     * The bands are separated by a 2 dp gap in the ground rather than by outlines — the surface
     * doing the separating, which is what lets four quiet fills stay readable without four borders
     * competing with the data.
     */
    private fun chemistry(canvas: Canvas, cw: Float, ch: Float): List<Key> {
        var ymax = 10f
        for (k in 0 until n) {
            var t = 0f
            for (c in CHEM_CHANNEL) t += at(c, k)
            ymax = max(ymax, t)
        }
        val top = niceCeil(ymax * 1.06f)
        frame(canvas, cw, padT, ch)
        val step = niceStep(top / 3f)
        var g = step
        while (g < top) { gridline(canvas, cw, padT + ch * (1f - g / top)); yTick(canvas, fmt(g), padT + ch * (1f - g / top)); g += step }

        val acc = FloatArray(n)
        val boundaries = ArrayList<FloatArray>()
        for ((i, c) in CHEM_CHANNEL.withIndex()) {
            path.reset()
            for (k in 0 until n) {
                val x = xOf(k, cw)
                val y = padT + ch * (1f - acc[k] / top)
                if (k == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            for (k in n - 1 downTo 0) {
                acc[k] += at(c, k)
                path.lineTo(xOf(k, cw), padT + ch * (1f - acc[k] / top))
            }
            path.close()
            pm.style = Paint.Style.FILL
            pm.color = (CHEM_FILL[i] and 0xFFFFFF) or (200 shl 24)
            canvas.drawPath(path, pm)
            boundaries.add(acc.copyOf())
        }
        // the 2 dp surface gaps between touching bands, then the world's total as a bright edge
        pm.style = Paint.Style.STROKE
        pm.strokeWidth = 2f * dp
        pm.color = Style.ABYSS
        for (i in 0 until boundaries.size - 1) {
            path.reset()
            for (k in 0 until n) {
                val x = xOf(k, cw)
                val y = padT + ch * (1f - boundaries[i][k] / top)
                if (k == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            canvas.drawPath(path, pm)
        }
        path.reset()
        for (k in 0 until n) {
            val x = xOf(k, cw)
            val y = padT + ch * (1f - acc[k] / top)
            if (k == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        pm.strokeWidth = 1.8f * dp
        pm.color = Color.argb(220, 232, 241, 248)
        canvas.drawPath(path, pm)
        pm.style = Paint.Style.FILL

        // the total, direct-labelled on the edge it belongs to — the one number this page is about
        val total = acc[n - 1]
        pv.textSize = axisSp
        pv.color = Style.BRIGHT
        val t = fmt(total)
        canvas.drawText(t, padL + cw - pv.measureText(t),
            padT + ch * (1f - total / top) - 7f * dp, pv)

        val names = context.resources.getStringArray(R.array.chem_parts)
        return CHEM_CHANNEL.mapIndexed { i, c ->
            val v = at(c, n - 1)
            Key(CHEM_FILL[i], names.getOrElse(i) { "" }, v, if (total > 0f) v / total else 0f)
        }
    }

    // ---------------------------------------------------------------- metabolism

    /**
     * What the world produces and burns, and — on its OWN panel — what comes back.
     *
     * The old chart put recycling on a second, invisible y-scale inside the same box. A dual-axis
     * chart states a relationship that is an artefact of how the two scalings were chosen, and it
     * is the single most-flagged mistake in charting. Two panels sharing one time axis say the
     * same thing without asserting anything that is not in the data.
     */
    private fun metabolism(canvas: Canvas, cw: Float, ch: Float): List<Key> {
        val hA = ch * 0.6f
        val hB = ch * 0.4f
        val topA = padT + panelCap
        val topB = topA + hA + 10f * dp + panelCap

        var mA = 1e-6f
        for (k in 0 until n) mA = max(mA, max(at(C_GPP, k), at(C_RESP, k)))
        var mB = 1e-6f
        for (k in 0 until n) mB = max(mB, at(C_RECYCLE, k))
        val tA = niceCeil(mA * 1.1f)
        val tB = niceCeil(mB * 1.15f)

        panel(canvas, cw, topA, hA, tA, context.getString(R.string.metab_panel_flows))
        val yA = { v: Float -> topA + hA * (1f - v / tA) }
        line(canvas, C_GPP, cw, yA, METAB_COLOR[0], 2f * dp)
        line(canvas, C_RESP, cw, yA, METAB_COLOR[1], 2f * dp)
        endDot(canvas, padL + cw, yA(at(C_GPP, n - 1)), METAB_COLOR[0])
        endDot(canvas, padL + cw, yA(at(C_RESP, n - 1)), METAB_COLOR[1])

        panel(canvas, cw, topB, hB, tB, context.getString(R.string.metab_panel_recycle))
        val yB = { v: Float -> topB + hB * (1f - v / tB) }
        // a single series, so it gets the wash: the hue at ~10 %, with the line on top
        path.reset()
        path.moveTo(padL, topB + hB)
        for (k in 0 until n) path.lineTo(xOf(k, cw), yB(at(C_RECYCLE, k)))
        path.lineTo(padL + cw, topB + hB)
        path.close()
        pm.style = Paint.Style.FILL
        pm.color = (METAB_COLOR[2] and 0xFFFFFF) or (28 shl 24)
        canvas.drawPath(path, pm)
        line(canvas, C_RECYCLE, cw, yB, METAB_COLOR[2], 2f * dp)
        endDot(canvas, padL + cw, yB(at(C_RECYCLE, n - 1)), METAB_COLOR[2])

        val names = context.resources.getStringArray(R.array.metab_parts)
        return listOf(
            Key(METAB_COLOR[0], names.getOrElse(0) { "" }, at(C_GPP, n - 1)),
            Key(METAB_COLOR[1], names.getOrElse(1) { "" }, at(C_RESP, n - 1)),
            Key(METAB_COLOR[2], names.getOrElse(2) { "" }, at(C_RECYCLE, n - 1)),
        )
    }

    /** One small multiple: its caption, its frame, its own top tick. */
    private fun panel(canvas: Canvas, cw: Float, top: Float, h: Float, ymax: Float, caption: String) {
        pw.color = Style.CHART_INK
        pw.textSize = axisSp
        canvas.drawText(caption, padL, top - 6f * dp, pw)
        frame(canvas, cw, top, h)
        val step = niceStep(ymax / 3f)
        var g = step
        while (g < ymax * 0.99f) {
            gridline(canvas, cw, top + h * (1f - g / ymax))
            yTick(canvas, fmt(g), top + h * (1f - g / ymax))
            g += step
        }
    }

    // ---------------------------------------------------------------- traits

    /**
     * The Traits page (EV, from src/ui-data.jsx drawTraits): one band per (species, locus) — a
     * page of small multiples, which is already the right form and stayed one. What the U3 pass
     * changed is only what it changed everywhere: type in sp rather than raw density, the chart
     * ink instead of the resting dim, a 10 % wash under the mean line rather than a flat block,
     * and the founder mark labelled where it used to be an unexplained dashed line.
     *
     * Top: mean ± one standard deviation over time — variance drawn deliberately large, it is the
     * fuel gauge of evolution, and a sweep reads as the ribbon narrowing while it moves. Bottom:
     * histogram of the living population now, bars in the generic genotype tint (the documented
     * grammar exception: chart colour, not the body grammar). Patch marks (multi-sun means) are
     * not ported yet — recorded.
     */
    private fun drawTraits(canvas: Canvas) {
        if (bands.isEmpty()) { gathering(canvas, padSide, 44f * dp); return }
        val bandH = TRAIT_BAND_DP * dp
        val pl = 32f * dp
        val pr = padSide
        val cw = width - pl - pr
        // The ribbon is the point of this page — mean and spread over time — so it takes the
        // room. At the first band height the ±0.05 spread of a settled locus drew inside two
        // pixels and the page said nothing it was built to say.
        val histH = bandH * 0.23f
        val ribH = bandH - (38f + 26f + 28f) * dp - histH
        for ((bi, b) in bands.withIndex()) {
            val top = bi * bandH
            val ribT = top + 38f * dp
            val histT = ribT + ribH + 26f * dp

            pw.textSize = Style.sp(context, 14f)
            pw.typeface = Style.wordMedium(context)
            pw.color = Style.TEXT
            canvas.drawText(b.title, pl, top + 16f * dp, pw)
            pw.typeface = Style.word(context)
            pv.textSize = axisSp
            pv.color = Style.CHART_INK
            canvas.drawText(b.stats, pl, top + 31f * dp, pv)

            pm.style = Paint.Style.STROKE
            pm.strokeWidth = 1f * dp
            pm.color = Style.CHART_AXIS
            canvas.drawLine(pl, ribT, pl, ribT + ribH, pm)
            canvas.drawLine(pl, ribT + ribH, pl + cw, ribT + ribH, pm)
            pm.style = Paint.Style.FILL
            pv.textSize = axisSp
            pv.color = Style.CHART_INK
            canvas.drawText("1", pl - 6f * dp - pv.measureText("1"), ribT + axisSp * 0.8f, pv)
            canvas.drawText("0", pl - 6f * dp - pv.measureText("0"), ribT + ribH, pv)

            val yOf = { v: Float -> ribT + ribH * (1f - v.coerceIn(0f, 1f)) }
            dashed(canvas, pl, yOf(b.g0), pl + cw, yOf(b.g0))
            if (n >= 5) {
                val m = { k: Int -> traitSeries[(bi * 2) * n + k] }
                val sd = { k: Int -> traitSeries[(bi * 2 + 1) * n + k] }
                path.reset()
                for (k in 0 until n) {
                    val x = pl + cw * k / max(1, n - 1)
                    if (k == 0) path.moveTo(x, yOf(m(k) + sd(k))) else path.lineTo(x, yOf(m(k) + sd(k)))
                }
                for (k in n - 1 downTo 0) path.lineTo(pl + cw * k / max(1, n - 1), yOf(m(k) - sd(k)))
                path.close()
                pm.style = Paint.Style.FILL
                pm.color = (b.color and 0xFFFFFF) or (48 shl 24)
                canvas.drawPath(path, pm)
                path.reset()
                for (k in 0 until n) {
                    val x = pl + cw * k / max(1, n - 1)
                    if (k == 0) path.moveTo(x, yOf(m(k))) else path.lineTo(x, yOf(m(k)))
                }
                pm.style = Paint.Style.STROKE
                pm.strokeWidth = 2f * dp
                pm.color = b.color
                canvas.drawPath(path, pm)
                pm.style = Paint.Style.FILL
                endDot(canvas, pl + cw, yOf(m(n - 1)), b.color)
                pv.textSize = axisSp
                pv.color = Style.CHART_INK
                canvas.drawText("−${(n - 1) * REC_STRIDE / 10} s", pl, ribT + ribH + 14f * dp, pv)
                val now = context.getString(R.string.axis_now)
                canvas.drawText(now, pl + cw - pv.measureText(now), ribT + ribH + 14f * dp, pv)
            } else {
                gathering(canvas, pl + 6f * dp, ribT + ribH / 2)
            }

            var hmax = 1f
            for (v in b.hist) hmax = max(hmax, v)
            val bw = cw / HIST_BINS
            // a 2 dp surface gap between neighbours, the same spacer the stacked page uses
            for (q in 0 until HIST_BINS) {
                if (b.hist[q] <= 0f) continue   // an empty bin is nothing, not a hairline stub
                val h = histH * b.hist[q] / hmax
                pm.color = tint(b.color, (q + 0.5f) / HIST_BINS)
                canvas.drawRect(pl + q * bw + 1f * dp, histT + histH - h,
                    pl + (q + 1) * bw - 1f * dp, histT + histH, pm)
            }
            dashed(canvas, pl + cw * b.g0, histT, pl + cw * b.g0, histT + histH)
            pw.textSize = axisSp
            pw.color = Style.CHART_INK
            canvas.drawText(b.lo, pl, histT + histH + 14f * dp, pw)
            canvas.drawText(b.hi, pl + cw - pw.measureText(b.hi), histT + histH + 14f * dp, pw)
            pv.textSize = axisSp
            pv.color = Style.CHART_INK
            val nl = context.getString(R.string.traits_alive, b.alive)
            canvas.drawText(nl, pl + cw / 2 - pv.measureText(nl) / 2, histT + histH + 14f * dp, pv)
        }
    }

    private fun dashed(canvas: Canvas, x0: Float, y0: Float, x1: Float, y1: Float) {
        pm.style = Paint.Style.STROKE
        pm.strokeWidth = 1f * dp
        pm.color = Color.argb(90, 201, 215, 227)
        pm.pathEffect = android.graphics.DashPathEffect(floatArrayOf(3f * dp, 4f * dp), 0f)
        canvas.drawLine(x0, y0, x1, y1, pm)
        pm.pathEffect = null
        pm.style = Paint.Style.FILL
    }

    // ---------------------------------------------------------------- numbers

    /**
     * A value the way a reader wants it: grouped thousands under ten thousand, then compacted, and
     * a decimal only where the number is small enough for one to mean something. The grouping
     * separator is the locale's — German writes 9.594 where English writes 9,594.
     */
    private fun fmt(v: Float): String {
        val a = abs(v)
        return when {
            a >= 100_000f -> group((v / 1000f).roundToInt().toLong()) + " k"
            a >= 1000f -> group(v.roundToInt().toLong())
            a >= 10f -> v.roundToInt().toString()
            a >= 0.1f -> String.format(java.util.Locale.getDefault(), "%.1f", v)
            a > 0f -> String.format(java.util.Locale.getDefault(), "%.2f", v)
            else -> "0"
        }
    }

    private fun group(v: Long): String =
        java.text.NumberFormat.getIntegerInstance(java.util.Locale.getDefault()).format(v)

    /** A round number at or above [v] — 1, 2, 2.5 or 5 times a power of ten. */
    private fun niceCeil(v: Float): Float {
        if (v <= 0f) return 1f
        val e = floor(log10(v.toDouble())).toInt()
        val p = 10.0.pow(e.toDouble()).toFloat()
        for (m in floatArrayOf(1f, 2f, 2.5f, 5f, 10f)) if (v <= m * p * 1.0001f) return m * p
        return 10f * p
    }

    /** A round gridline step near [v], so ticks land on numbers a reader recognises. */
    private fun niceStep(v: Float): Float {
        if (v <= 0f) return 1f
        val e = floor(log10(v.toDouble())).toInt()
        val p = 10.0.pow(e.toDouble()).toFloat()
        val m = v / p
        return when {
            m < 1.5f -> p
            m < 3.5f -> 2f * p
            m < 7.5f -> 5f * p
            else -> 10f * p
        }
    }

    /**
     * The generic genotype tint, mirrored from the frame builder (frame.rs / ui-render.js
     * `tintRgb`): a ±52° hue rotation with a 0.14 lightness tilt. A display-layer mirror of a
     * pure function — the same numbers, checked against the source by eye, never fed back into
     * anything the core computes.
     */
    private fun tint(color: Int, t: Float): Int {
        val k = (t - 0.5f) * 2f
        if (k == 0f) return color
        return hslShift(color, k)
    }

    private fun hslShift(color: Int, k: Float): Int {
        val r = Color.red(color) / 255f
        val g = Color.green(color) / 255f
        val bl = Color.blue(color) / 255f
        val mx = maxOf(r, g, bl)
        val mn = minOf(r, g, bl)
        val l = (mx + mn) / 2f
        val d = mx - mn
        var h = 0f
        val s = if (d == 0f) 0f else d / (1f - abs(2f * l - 1f))
        if (d != 0f) h = when (mx) {
            r -> 60f * (((g - bl) / d) % 6f)
            g -> 60f * ((bl - r) / d + 2f)
            else -> 60f * ((r - g) / d + 4f)
        }
        val h2 = (h - 52f * k + 360f) % 360f
        val s2 = min(1f, s + 0.10f * abs(k))
        val l2 = max(0.15f, min(0.85f, l - 0.14f * k))
        val c = (1f - abs(2f * l2 - 1f)) * s2
        val x = c * (1f - abs((h2 / 60f) % 2f - 1f))
        val m = l2 - c / 2f
        val (r2, g2, b2) = when {
            h2 < 60f -> Triple(c, x, 0f)
            h2 < 120f -> Triple(x, c, 0f)
            h2 < 180f -> Triple(0f, c, x)
            h2 < 240f -> Triple(0f, x, c)
            h2 < 300f -> Triple(x, 0f, c)
            else -> Triple(c, 0f, x)
        }
        return Color.rgb(((r2 + m) * 255).toInt(), ((g2 + m) * 255).toInt(), ((b2 + m) * 255).toInt())
    }
}
