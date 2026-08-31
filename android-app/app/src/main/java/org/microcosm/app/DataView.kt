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
        private const val REC_STRIDE = 20
    }

    var page = PAGE_POPULATIONS
        set(v) { field = v; invalidate() }

    /** `series[c * n + k]`, oldest first; set by the render thread. */
    private var series: FloatArray? = null
    private var n = 0
    private var speciesColor = IntArray(7) { Color.GRAY }

    fun submit(data: FloatArray, count: Int, colors: IntArray) {
        series = data
        n = count
        speciesColor = colors
        postInvalidate()
    }

    private val p = Paint(Paint.ANTI_ALIAS_FLAG)
    private val path = Path()
    private val padL = 46f
    private val padT = 10f
    private val padB = 26f
    private val padR = 12f

    private fun at(c: Int, k: Int): Float {
        val s = series ?: return 0f
        return s[c * n + k]
    }

    override fun onDraw(canvas: Canvas) {
        val cw = width - padL - padR
        val ch = height - padT - padB
        p.color = Color.parseColor("#0B131E")
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), p)
        if (series == null || n < 5) {
            p.color = Color.parseColor("#5E7386")
            p.textSize = 26f
            canvas.drawText("gathering history…", padL, padT + ch / 2, p)
            return
        }
        // the axis corner: left edge and baseline, nothing more
        p.style = Paint.Style.STROKE
        p.strokeWidth = 1f
        p.color = Color.argb(64, 94, 115, 134)
        canvas.drawLine(padL, padT, padL, padT + ch, p)
        canvas.drawLine(padL, padT + ch, padL + cw, padT + ch, p)
        p.style = Paint.Style.FILL
        p.textSize = 22f

        when (page) {
            PAGE_POPULATIONS -> populations(canvas, cw, ch)
            PAGE_CHEMISTRY -> chemistry(canvas, cw, ch)
            else -> metabolism(canvas, cw, ch)
        }

        p.color = Color.parseColor("#5E7386")
        canvas.drawText("-${(n - 1) * REC_STRIDE / 10}s", padL, height - 6f, p)
        canvas.drawText("now", padL + cw - 60f, height - 6f, p)
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
            canvas.drawText(d.toString(), 6f, y + 7f, p)
        }
        for (sp in 0 until 7) {
            var any = false
            var k = 0
            while (k < n) { if (at(sp, k) > 0) { any = true; break }; k += 7 }
            if (!any) continue
            line(canvas, sp, cw, yOf, speciesColor[sp], 2.2f)
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
        p.strokeWidth = 1.8f
        canvas.drawPath(path, p)
        p.style = Paint.Style.FILL
        p.color = Color.parseColor("#5E7386")
        canvas.drawText(ymax.roundToInt().toString(), 4f, padT + 18f, p)
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
        line(canvas, gpp, cw, yOf, Color.rgb(140, 230, 170), 2.2f)
        line(canvas, resp, cw, yOf, Color.rgb(196, 150, 140), 2.2f)
        line(canvas, minz, cw, { v -> padT + ch * (1f - v / (m2 * 1.15f)) }, Color.argb(179, 91, 200, 232), 1.6f)
        p.color = Color.parseColor("#5E7386")
        canvas.drawText(ymax.roundToInt().toString(), 4f, padT + 18f, p)
    }
}
