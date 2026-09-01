package org.microcosm.app

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.Shader
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * PAINTING, not grammar (docs/android-app-plan.md §3).
 *
 * The core decides which bucket an organism is in and what colour and shape dials that bucket
 * carries; this turns one bucket into a 64x64 bitmap. It is a port of `makeSprite` in
 * src/ui-render.js and deliberately not gate-compared: two platforms will not produce identical
 * gradient pixels, and nothing depends on their doing so.
 *
 * One faithful detail worth naming. Canvas 2D's `createRadialGradient(c,c,2, c,c,32)` has an inner
 * radius; Android's `RadialGradient` does not. A stop at fraction t of the JS gradient sits at
 * radius 2 + 30t, so it maps to (2 + 30t)/32 here, with the inner disc held at the first colour.
 */
object Sprites {
    const val S = 64
    private const val C = 32f

    const val NUCLEUS = 0
    const val DOT = 1
    const val TRI = 2
    const val SQUARE = 3
    const val RAY = 4

    /** Map a Canvas 2D gradient stop onto Android's single-radius gradient. */
    private fun stop(t: Float) = (2f + 30f * t) / 32f

    private fun argb(a: Double, r: Int, g: Int, b: Int) =
        Color.argb((a * 255.0).roundToInt().coerceIn(0, 255), r, g, b)

    private fun glow(r: Int, g: Int, b: Int, a0: Double, a1: Double): RadialGradient =
        RadialGradient(
            C, C, C,
            intArrayOf(argb(a0, r, g, b), argb(a0, r, g, b), argb(a1, r, g, b), argb(0.0, r, g, b)),
            floatArrayOf(0f, stop(0f), stop(0.4f), stop(1f)),
            Shader.TileMode.CLAMP,
        )

    /** `shape` and the two dials come straight from the core's bucket spec. */
    fun make(rgb: IntArray, shape: Int, outline: Double, round: Double): Bitmap {
        val bmp = Bitmap.createBitmap(S, S, Bitmap.Config.ARGB_8888)
        val g = Canvas(bmp)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        val r = rgb[0]
        val gg = rgb[1]
        val b = rgb[2]

        if (shape == NUCLEUS) {
            // Solara individual: small dim marker; the mass lives in the carpet layer
            p.color = argb(0.55, (r * 0.8).roundToInt(), (gg * 0.9).roundToInt(), (b * 0.85).roundToInt())
            g.drawCircle(C, C, 5f, p)
            p.color = argb(0.35, 230, 255, 240)
            g.drawCircle(C, C, 2.2f, p)
            return bmp
        }

        if (shape == SQUARE) {
            // Bacillus: dim earthy speck, square = decomposer
            p.shader = RadialGradient(
                C, C, C,
                intArrayOf(argb(0.55, r, gg, b), argb(0.55, r, gg, b), argb(0.18, r, gg, b), argb(0.0, r, gg, b)),
                floatArrayOf(0f, stop(0f), stop(0.45f), stop(1f)),
                Shader.TileMode.CLAMP,
            )
            g.drawRect(0f, 0f, S.toFloat(), S.toFloat(), p)
            p.shader = null
            // stroke-rounding fattens the core; shrink so the body stays one size
            val half = (3.4 - round * 1.1).toFloat()
            p.color = argb(0.85, min(255, r + 60), min(255, gg + 60), min(255, b + 50))
            p.style = Paint.Style.FILL
            g.drawRect(C - half, C - half, C + half, C + half, p)
            if (round > 0.02) {
                p.style = Paint.Style.STROKE
                p.strokeJoin = Paint.Join.ROUND
                p.strokeWidth = (round * 4.5).toFloat()
                g.drawRect(C - half, C - half, C + half, C + half, p)
            }
            return bmp
        }

        if (shape == TRI || shape == RAY) {
            // Cilio: rare and moving, so it is allowed the luminance peak. (The ray is drawn as
            // paths, never blitted — it gets a bitmap only so the array has no holes.)
            p.shader = glow(r, gg, b, 0.9, 0.4)
            g.drawRect(0f, 0f, S.toFloat(), S.toFloat(), p)
            p.shader = null
            // the mark carries the colour: a pure white triangle washed every tint out under screen
            g.save()
            if (round > 0.02) {
                val k = (1.0 - 0.09 * round).toFloat()
                g.translate(C, C); g.scale(k, k); g.translate(-C, -C)
            }
            val path = Path().apply {
                moveTo(S * 0.72f, S * 0.5f)
                lineTo(S * 0.38f, S * 0.36f)
                lineTo(S * 0.38f, S * 0.64f)
                close()
            }
            p.color = argb(0.95, min(255, r + 55), min(255, gg + 55), min(255, b + 55))
            p.style = Paint.Style.FILL
            g.drawPath(path, p)
            p.style = Paint.Style.STROKE
            p.strokeJoin = Paint.Join.ROUND
            if (round > 0.02) {
                p.strokeWidth = (round * 7).toFloat()
                g.drawPath(path, p)
            }
            p.color = argb(0.55, 255, 255, 255)
            p.strokeWidth = (1.2 + round * 4).toFloat()
            g.drawPath(path, p)
            g.restore()
            return bmp
        }

        // Drifta: soft glow, coloured (not white) centre, modest alpha
        p.shader = glow(r, gg, b, 0.6, 0.22)
        g.drawRect(0f, 0f, S.toFloat(), S.toFloat(), p)
        p.shader = null
        p.color = argb(0.9, min(255, r + 40), min(255, gg + 35), min(255, b + 30))
        p.style = Paint.Style.FILL
        g.drawCircle(C, C, 3.6f, p)
        if (outline > 0.02) {
            // defense ring: the tougher end wears a shell
            p.style = Paint.Style.STROKE
            p.color = argb(0.10 + 0.75 * outline, 235, 246, 255)
            p.strokeWidth = (1 + 1.6 * outline).toFloat()
            g.drawCircle(C, C, 5.6f, p)
        }
        return bmp
    }
}
