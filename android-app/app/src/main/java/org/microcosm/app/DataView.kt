package org.microcosm.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.view.View
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Data mode's chart pages: Populations, Chemistry, Metabolism.
 *
 * The series are handed over by the render thread as a flat copy — never read live out of the
 * recorder ring. `indicators()` and the event feed genuinely mutate the core while computing, so
 * reading them from the UI thread would be a race on a `&mut Sim`; copying fourteen channels four
 * times a second costs nothing and removes the question.
 *
 * The scales and stacking are the browser's (`src/ui-data.jsx`): a log decade axis for populations
 * because the vast and the rare have to share one readable canvas, a stacked area for chemistry
 * whose bright top edge only moves when the hand adds matter, and metabolism's recycling line on
 * its own scale because it is a rate against two standing quantities.
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
        const val TRAIT_BAND_DP = 160f
        const val HIST_BINS = 24
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

    var page = PAGE_POPULATIONS
        set(v) { field = v; requestLayout(); invalidate() }

    /** `series[c * n + k]`, oldest first; set by the render thread. */
    private var series: FloatArray? = null
    private var n = 0
    private var speciesColor = IntArray(7) { Color.GRAY }
    private var bands: Array<Band> = emptyArray()
    /** `traitSeries[(band*2 + 0|1) * n + k]` — mean, sd — oldest first. */
    private var traitSeries: FloatArray = FloatArray(0)

    fun submit(data: FloatArray, count: Int, colors: IntArray) {
        series = data
        n = count
        speciesColor = colors
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

    private val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        // U2.R2 (owner note): the charts speak the language too — numbers in Plex Mono.
        typeface = Style.mono(context)
    }
    private val path = Path()
    /**
     * This canvas is in device pixels while the browser's chart (src/ui-data.jsx) is in CSS pixels,
     * so every size here carries the density. Without it the axis labels land at a third of their
     * intended size on a 3x phone — legible on a desktop screenshot, not on the device.
     */
    private val dp = context.resources.displayMetrics.density
    private val padL = 48f * dp
    private val padT = 16f * dp
    private val padB = 30f * dp
    private val padR = 18f * dp

    private fun at(c: Int, k: Int): Float {
        val s = series ?: return 0f
        return s[c * n + k]
    }

    /**
     * The Traits page scrolls: 160 dp per (species, locus) band, eleven bands in the shipped
     * world — the browser learned the same lesson (a fixed split overflowed every band). The
     * chart pages keep the viewport; the ScrollView around this view has fillViewport set, so
     * a chart page still gets the full height.
     */
    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        if (page == PAGE_TRAITS && bands.isNotEmpty()) {
            setMeasuredDimension(
                MeasureSpec.getSize(widthSpec),
                (bands.size * TRAIT_BAND_DP * dp).toInt(),
            )
        } else super.onMeasure(widthSpec, heightSpec)
    }

    override fun onDraw(canvas: Canvas) {
        if (page == PAGE_TRAITS) { drawTraits(canvas); return }
        val cw = width - padL - padR
        val ch = height - padT - padB
        p.color = Color.parseColor("#0B131E")
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), p)
        if (series == null || n < 5) {
            p.color = Color.parseColor("#5E7386")
            p.textSize = 26f * dp
            canvas.drawText(context.getString(R.string.health_gathering), padL, padT + ch / 2, p)
            return
        }
        // the axis corner: left edge and baseline, nothing more
        p.style = Paint.Style.STROKE
        p.strokeWidth = 1f * dp
        p.color = Color.argb(64, 94, 115, 134)
        canvas.drawLine(padL, padT, padL, padT + ch, p)
        canvas.drawLine(padL, padT + ch, padL + cw, padT + ch, p)
        p.style = Paint.Style.FILL
        p.textSize = 22f * dp

        when (page) {
            PAGE_POPULATIONS -> populations(canvas, cw, ch)
            PAGE_CHEMISTRY -> chemistry(canvas, cw, ch)
            else -> metabolism(canvas, cw, ch)
        }

        p.color = Color.parseColor("#5E7386")
        canvas.drawText("-${(n - 1) * REC_STRIDE / 10}s", padL, height - 6f * dp, p)
        canvas.drawText(context.getString(R.string.axis_now), padL + cw - 60f * dp, height - 6f * dp, p)
    }

    private fun xOf(k: Int, cw: Float) = padL + cw * k / max(1, n - 1)

    private fun line(canvas: Canvas, c: Int, cw: Float, yOf: (Float) -> Float, color: Int, w: Float) {
        path.reset()
        for (k in 0 until n) {
            val x = xOf(k, cw)
            val y = yOf(at(c, k))
            if (k == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        p.style = Paint.Style.STROKE
        p.color = color
        p.strokeWidth = w
        canvas.drawPath(path, p)
        p.style = Paint.Style.FILL
    }

    /** Every line a species, on a log axis: the mat and the hunter on one canvas. */
    private fun populations(canvas: Canvas, cw: Float, ch: Float) {
        var ymax = 10f
        for (c in 0 until 7) for (k in 0 until n) ymax = max(ymax, at(c, k))
        ymax *= 1.08f
        val lm = log10(1.0 + ymax)
        val yOf = { v: Float -> padT + ch * (1f - (log10(1.0 + v) / lm).toFloat()) }

        p.color = Color.parseColor("#5E7386")
        for (d in intArrayOf(1, 10, 100, 1000)) {
            if (d > ymax) break
            val y = yOf(d.toFloat())
            p.style = Paint.Style.STROKE
            p.color = Color.argb(46, 94, 115, 134)
            canvas.drawLine(padL, y, padL + cw, y, p)
            p.style = Paint.Style.FILL
            p.color = Color.parseColor("#5E7386")
            canvas.drawText(d.toString(), 6f * dp, y + 7f * dp, p)
        }
        for (sp in 0 until 7) {
            var any = false
            var k = 0
            while (k < n) { if (at(sp, k) > 0) { any = true; break }; k += 7 }
            if (!any) continue
            line(canvas, sp, cw, yOf, speciesColor[sp], 2.2f * dp)
        }
    }

    /** Where every unit of mineral sits. The top edge only moves when the hand adds. */
    private fun chemistry(canvas: Canvas, cw: Float, ch: Float) {
        val free = 7; val bound = 8; val corpse = 9; val detritus = 10 // indices into CHANNELS
        var ymax = 10f
        for (k in 0 until n) ymax = max(ymax, at(free, k) + at(bound, k) + at(corpse, k) + at(detritus, k))
        ymax *= 1.06f
        val acc = FloatArray(n)
        // life at the bottom, then corpses, then detritus, dissolved on top
        val order = arrayOf(
            Triple(bound, intArrayOf(70, 214, 140), 128),
            Triple(corpse, intArrayOf(158, 168, 178), 128),
            Triple(detritus, intArrayOf(110, 122, 134), 128),
            Triple(free, intArrayOf(91, 200, 232), 115),
        )
        for ((c, rgb, alpha) in order) {
            path.reset()
            for (k in 0 until n) {
                val x = xOf(k, cw)
                val y = padT + ch * (1f - acc[k] / ymax)
                if (k == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            for (k in n - 1 downTo 0) {
                acc[k] += at(c, k)
                path.lineTo(xOf(k, cw), padT + ch * (1f - acc[k] / ymax))
            }
            path.close()
            p.style = Paint.Style.FILL
            p.color = Color.argb(alpha, rgb[0], rgb[1], rgb[2])
            canvas.drawPath(path, p)
        }
        path.reset()
        for (k in 0 until n) {
            val x = xOf(k, cw)
            val y = padT + ch * (1f - acc[k] / ymax)
            if (k == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        p.style = Paint.Style.STROKE
        p.color = Color.argb(204, 230, 240, 250)
        p.strokeWidth = 1.8f * dp
        canvas.drawPath(path, p)
        p.style = Paint.Style.FILL
        p.color = Color.parseColor("#5E7386")
        canvas.drawText(ymax.roundToInt().toString(), 4f * dp, padT + 18f * dp, p)
    }

    /** What the world produces and burns, with recycling on its own scale. */
    private fun metabolism(canvas: Canvas, cw: Float, ch: Float) {
        val gpp = 11; val resp = 12; val minz = 13
        var ymax = 10f
        for (k in 0 until n) ymax = max(ymax, max(at(gpp, k), at(resp, k)))
        ymax *= 1.1f
        var m2 = 1f
        for (k in 0 until n) m2 = max(m2, at(minz, k))
        val yOf = { v: Float -> padT + ch * (1f - v / ymax) }
        line(canvas, gpp, cw, yOf, Color.rgb(140, 230, 170), 2.2f * dp)
        line(canvas, resp, cw, yOf, Color.rgb(196, 150, 140), 2.2f * dp)
        line(canvas, minz, cw, { v -> padT + ch * (1f - v / (m2 * 1.15f)) }, Color.argb(179, 91, 200, 232), 1.6f * dp)
        p.color = Color.parseColor("#5E7386")
        canvas.drawText(ymax.roundToInt().toString(), 4f * dp, padT + 18f * dp, p)
    }

    /**
     * The Traits page (EV, from src/ui-data.jsx drawTraits): one band per (species, locus).
     * Top: mean ± one standard deviation over time — variance drawn deliberately large, it is
     * the fuel gauge of evolution, and a sweep reads as the ribbon narrowing while it moves —
     * with the founder value as a dashed line. Bottom: histogram of the living population now,
     * bars in the generic genotype tint (the documented grammar exception: chart colour, not
     * the body grammar). Patch marks (multi-sun means) are not ported yet — recorded.
     */
    private fun drawTraits(canvas: Canvas) {
        p.color = Color.parseColor("#0B131E")
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), p)
        val dim = Color.parseColor("#5E7386")
        if (bands.isEmpty()) {
            p.color = dim
            p.textSize = 26f * dp
            canvas.drawText(context.getString(R.string.health_gathering), 24f * dp, 48f * dp, p)
            return
        }
        val bandH = TRAIT_BAND_DP * dp
        val pl = 34f * dp
        val pr = 10f * dp
        val cw = width - pl - pr
        // the browser's vertical budget at 160: title 14 + stats 20, ribbon, 24 gap, hist, 26 labels
        val histH = bandH * 0.26f
        val ribH = bandH - (34f + 24f + 26f) * dp - histH
        for ((bi, b) in bands.withIndex()) {
            val top = bi * bandH
            val ribT = top + 34f * dp
            val histT = ribT + ribH + 24f * dp
            p.textSize = 15f * dp
            p.color = b.color
            canvas.drawText(b.title, pl, top + 14f * dp, p)
            p.textSize = 13f * dp
            p.color = Color.parseColor("#B8C5D1")
            canvas.drawText(b.stats, pl, top + 29f * dp, p)
            // the ribbon's frame and scale words
            p.style = Paint.Style.STROKE
            p.strokeWidth = 1f * dp
            p.color = Color.argb(64, 94, 115, 134)
            canvas.drawLine(pl, ribT, pl, ribT + ribH, p)
            canvas.drawLine(pl, ribT + ribH, pl + cw, ribT + ribH, p)
            p.style = Paint.Style.FILL
            p.textSize = 12f * dp
            p.color = dim
            canvas.drawText("1", pl - 14f * dp, ribT + 9f * dp, p)
            canvas.drawText("0", pl - 14f * dp, ribT + ribH, p)
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
                p.color = (b.color and 0xFFFFFF) or (56 shl 24)
                canvas.drawPath(path, p)
                path.reset()
                for (k in 0 until n) {
                    val x = pl + cw * k / max(1, n - 1)
                    if (k == 0) path.moveTo(x, yOf(m(k))) else path.lineTo(x, yOf(m(k)))
                }
                p.style = Paint.Style.STROKE
                p.strokeWidth = 1.6f * dp
                p.color = b.color
                canvas.drawPath(path, p)
                p.style = Paint.Style.FILL
                p.textSize = 12f * dp
                p.color = dim
                canvas.drawText("-${(n - 1) * REC_STRIDE / 10}s", pl, ribT + ribH + 13f * dp, p)
                canvas.drawText(context.getString(R.string.axis_now), pl + cw - 34f * dp, ribT + ribH + 13f * dp, p)
            } else {
                p.color = dim
                p.textSize = 13f * dp
                canvas.drawText(context.getString(R.string.health_gathering), pl + 6f * dp, ribT + ribH / 2, p)
            }
            // histogram of the living population, bars in the genotype tint ramp
            var hmax = 1f
            for (v in b.hist) hmax = max(hmax, v)
            val bw = cw / HIST_BINS
            for (q in 0 until HIST_BINS) {
                val h = histH * b.hist[q] / hmax
                p.color = tint(b.color, (q + 0.5f) / HIST_BINS)
                canvas.drawRect(pl + q * bw + 0.5f, histT + histH - h, pl + (q + 1) * bw - 0.5f, histT + histH, p)
            }
            dashed(canvas, pl + cw * b.g0, histT, pl + cw * b.g0, histT + histH)
            p.textSize = 12f * dp
            p.color = dim
            canvas.drawText(b.lo, pl, histT + histH + 13f * dp, p)
            canvas.drawText(b.hi, pl + cw - p.measureText(b.hi), histT + histH + 13f * dp, p)
            val nl = b.alive.toString()
            canvas.drawText(nl, pl + cw / 2 - p.measureText(nl) / 2, histT + histH + 13f * dp, p)
        }
    }

    private fun dashed(canvas: Canvas, x0: Float, y0: Float, x1: Float, y1: Float) {
        p.style = Paint.Style.STROKE
        p.strokeWidth = 1f * dp
        p.color = Color.argb(90, 201, 215, 227)
        p.pathEffect = android.graphics.DashPathEffect(floatArrayOf(3f * dp, 4f * dp), 0f)
        canvas.drawLine(x0, y0, x1, y1, p)
        p.pathEffect = null
        p.style = Paint.Style.FILL
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
        val s = if (d == 0f) 0f else d / (1f - kotlin.math.abs(2f * l - 1f))
        if (d != 0f) h = when (mx) {
            r -> 60f * (((g - bl) / d) % 6f)
            g -> 60f * ((bl - r) / d + 2f)
            else -> 60f * ((r - g) / d + 4f)
        }
        val h2 = (h - 52f * k + 360f) % 360f
        val s2 = kotlin.math.min(1f, s + 0.10f * kotlin.math.abs(k))
        val l2 = kotlin.math.max(0.15f, kotlin.math.min(0.85f, l - 0.14f * k))
        val c = (1f - kotlin.math.abs(2f * l2 - 1f)) * s2
        val x = c * (1f - kotlin.math.abs((h2 / 60f) % 2f - 1f))
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
