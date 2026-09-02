package org.microcosm.app

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * PAINTING, not grammar (docs/android-app-plan.md §3).
 *
 * The core decides which bucket an organism is in and what colour and shape dials that bucket
 * carries; this turns one bucket into a 64x64 bitmap. Since GR.2 (docs/organism-graphics-plan.md)
 * the bodies are micrograph cells — membrane distinct from interior, nucleus, vacuoles — in the
 * style the owner chose from the probe (dev/graphics-probe/stilproben.html, the design record).
 * Deliberately not gate-compared: two platforms will not produce identical gradient pixels, and
 * nothing depends on their doing so. SpriteSheetTest photographs the full bucket grid and holds
 * the two dials visible at their rails.
 *
 * The channel meanings are the certified grammar's and do not move here: `rgb` arrives already
 * tint-turned (temperature locus), `outline` is the defense dial (tougher wears spines — the old
 * ring, grown bristles), `round` the feeding/metabolic dial (thrifty rounds, keen stays sharp).
 *
 * Since GR.7 the bake also has a second regime. Every colour goes through `Optics`, so the dark
 * field bakes exactly the bitmap it always did, and the light field bakes the same body as an
 * absorbing one: faded interior, darkened membrane, charcoal ink, and the bloom replaced by the
 * bright phase-contrast rim a membrane throws in transmitted light. The Renderer rebakes the set
 * when the regime changes; nothing here decides which regime is on.
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

    /** Drifta's own light — a Cilio food vacuole glows in its last meal's colour. */
    val MEAL = intArrayOf(91, 200, 232)

    /** Map a Canvas 2D gradient stop onto Android's single-radius gradient. */
    private fun stop(t: Float) = (2f + 30f * t) / 32f

    private fun argb(a: Double, r: Int, g: Int, b: Int) =
        Color.argb((a * 255.0).roundToInt().coerceIn(0, 255), r, g, b)

    /** One channel leaned toward a target — the interior is the species colour in shadow. */
    private fun lean(v: Int, target: Int, t: Double) = (v + (target - v) * t).roundToInt()

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
            p.color = Optics.line(0.55f, (r * 0.8).roundToInt(), (gg * 0.9).roundToInt(), (b * 0.85).roundToInt())
            g.drawCircle(C, C, 5f, p)
            p.color = Optics.ink(0.35f, 230, 255, 240)
            g.drawCircle(C, C, 2.2f, p)
            return bmp
        }

        if (shape == SQUARE) {
            // Bacillus: a rod colony in a shared capsule — still the dimmest body by design.
            // The rods form a loose CHAIN along +x (streptobacillus-style), because the painter
            // rotates this bake by the record's own heading: the owner's report (2026-09-02) was
            // that a fixed unrotated triangle constellation read as "Formationsflug/Raumschiff" —
            // a chain gives the colony an axis, so it swims lengthwise and visibly slews at
            // every tumble. Relative rod motion inside the colony would be clock animation,
            // which the owner rejected; the dynamics come from the sim's heading instead.
            g.save()
            g.translate(C, C)
            g.scale(1.5f, 0.65f) // the shared capsule follows the chain
            if (Optics.lightField) {
                // no bloom on the lamp: the capsule is a faint stain the rods sit in
                p.color = Optics.wash(0.22f, r, gg, b)
                g.drawCircle(0f, 0f, C * 0.52f, p)
            } else {
                p.shader = RadialGradient(
                    0f, 0f, C,
                    intArrayOf(argb(0.45, r, gg, b), argb(0.45, r, gg, b), argb(0.15, r, gg, b), argb(0.0, r, gg, b)),
                    floatArrayOf(0f, stop(0f), stop(0.45f), stop(1f)),
                    Shader.TileMode.CLAMP,
                )
                g.drawRect(-C, -C, C, C, p)
            }
            g.restore()
            p.shader = null
            p.style = Paint.Style.FILL
            p.color = Optics.line(0.85f, min(255, r + 45), min(255, gg + 45), min(255, b + 40))
            // the dial reshapes the rods at constant area — rounding must never read as growth:
            // keen = long sharp rods, thrifty = short plump ones (its first bake failed the
            // dial-visibility gate at 34 px; corner radius alone was too subtle)
            val hw = (5.0 - round * 1.1).toFloat()
            val hh = (1.9 + round * 0.6).toFloat()
            val corner = (1.0 + round * 2.4).toFloat()
            val rod = RectF(-hw, -hh, hw, hh)
            // end-to-end with organic jitter; each rod wears a dark seam so overlaps separate
            val place = floatArrayOf(-7.4f, -0.9f, -9f, 0.2f, 0.7f, 5f, 7.6f, -0.5f, -4f)
            // the seam separates overlapping rods: darker than the body on black water, and
            // brighter than it on the lamp — the same job, the ground decides the direction
            val seam = if (Optics.lightField) Optics.halo(0.55f)
                else argb(0.6, (r * 0.35).roundToInt(), (gg * 0.35).roundToInt(), (b * 0.35).roundToInt())
            val body = p.color
            for (i in 0 until 3) {
                g.save()
                g.translate(C + place[i * 3], C + place[i * 3 + 1])
                g.rotate(place[i * 3 + 2])
                p.style = Paint.Style.FILL
                p.color = body
                g.drawRoundRect(rod, corner, corner, p)
                p.style = Paint.Style.STROKE
                p.strokeWidth = 1f
                p.color = seam
                g.drawRoundRect(rod, corner, corner, p)
                g.restore()
            }
            return bmp
        }

        if (shape == TRI || shape == RAY) {
            // Cilio: teardrop cell in pursuit — membrane, shadowed interior, static cilia
            // fringe, oral groove, glowing food vacuoles. (The ray is drawn as paths, never
            // blitted — it gets a bitmap only so the array has no holes.)
            if (!Optics.lightField) {
                p.shader = glow(r, gg, b, 0.8, 0.35)
                g.drawRect(0f, 0f, S.toFloat(), S.toFloat(), p)
                p.shader = null
            }
            // thrifty rounds: the nose blunts and the edge softens; keen stays sharp
            val nose = (15.0 - 3.5 * round).toFloat()
            val body = Path().apply {
                moveTo(C + nose, C)
                cubicTo(C + nose * 0.55f, C + 8.6f, C - 11.7f, C + 8.2f, C - 12.4f, C)
                cubicTo(C - 11.7f, C - 8.2f, C + nose * 0.55f, C - 8.6f, C + nose, C)
                close()
            }
            if (Optics.lightField) { // the phase-contrast rim, in place of the bloom
                p.style = Paint.Style.STROKE
                p.strokeJoin = Paint.Join.ROUND
                p.strokeWidth = 3.4f
                p.color = Optics.halo(0.9f)
                g.drawPath(body, p)
            }
            p.style = Paint.Style.FILL
            // the interior: the species colour in shadow on black water, faded onto the lamp
            p.color = if (Optics.lightField) Optics.wash(0.35f, r, gg, b)
                else argb(0.6, lean(r, 12, 0.5), lean(gg, 20, 0.5), lean(b, 34, 0.5))
            g.drawPath(body, p)
            p.style = Paint.Style.STROKE
            p.strokeJoin = Paint.Join.ROUND
            p.strokeWidth = (1.8 + round * 2.5).toFloat()
            p.color = Optics.line(0.95f, r, gg, b)
            g.drawPath(body, p)
            // the fringe: short strokes around an inscribed ellipse, still — texture, not animation
            p.strokeWidth = 1f
            p.color = Optics.line(0.55f, r, gg, b)
            for (i in 0 until 22) {
                val a = i / 22.0 * 2.0 * Math.PI
                g.drawLine(
                    C + (cos(a) * 12.5).toFloat(), C + (sin(a) * 8.3).toFloat(),
                    C + (cos(a) * 15.5).toFloat(), C + (sin(a) * 11.2).toFloat(), p,
                )
            }
            p.strokeWidth = 1.2f
            p.color = Optics.ink(0.7f, 245, 235, 255)
            val groove = Path().apply {
                moveTo(C + nose * 0.95f, C)
                quadTo(C + 6f, C + 3.4f, C + 1f, C + 1.5f)
            }
            g.drawPath(groove, p)
            p.style = Paint.Style.FILL
            p.color = Optics.wash(0.7f, MEAL[0], MEAL[1], MEAL[2])
            g.drawCircle(C - 3f, C - 2.2f, 2.2f, p)
            g.drawCircle(C - 6.2f, C + 2.4f, 1.7f, p)
            return bmp
        }

        // Drifta: gel halo, membrane over a shadowed interior, off-centre nucleus, one vacuole.
        // The defense dial grew from a plain ring into spines — same meaning, tougher bristles.
        val ir = 14f
        if (Optics.lightField) { // the phase-contrast rim, in place of the gel bloom
            p.style = Paint.Style.STROKE
            p.strokeWidth = 2.6f
            p.color = Optics.halo(0.9f)
            g.drawCircle(C, C, ir * 1.12f, p)
        } else {
            p.shader = glow(r, gg, b, 0.4, 0.16)
            g.drawRect(0f, 0f, S.toFloat(), S.toFloat(), p)
            p.shader = null
        }
        p.style = Paint.Style.FILL
        p.color = if (Optics.lightField) Optics.wash(0.35f, r, gg, b)
            else argb(0.55, lean(r, 10, 0.55), lean(gg, 25, 0.55), lean(b, 40, 0.55))
        g.drawCircle(C, C, ir, p)
        p.style = Paint.Style.STROKE
        p.strokeWidth = 1.8f
        p.color = Optics.line(0.95f, r, gg, b)
        g.drawCircle(C, C, ir, p)
        p.style = Paint.Style.FILL
        p.color = Optics.ink(0.9f, 235, 250, 255)
        g.drawCircle(C + 4f, C - 2.8f, 3.1f, p)
        // the vacuole is the interior's counter-tone: darker than the body on black water,
        // brighter than it on the lamp
        p.color = if (Optics.lightField) Optics.halo(0.45f)
            else argb(0.5, (r * 0.6).roundToInt(), (gg * 0.6).roundToInt(), (b * 0.6).roundToInt())
        g.drawCircle(C - 4.2f, C + 3.5f, 2.5f, p)
        if (outline > 0.02) {
            p.style = Paint.Style.STROKE
            p.strokeWidth = (1 + 1.2 * outline).toFloat()
            p.color = Optics.ink((0.15 + 0.7 * outline).toFloat(), 235, 246, 255)
            val s0 = ir + 0.5f
            val s1 = ir + (2.0 + 3.5 * outline).toFloat()
            for (i in 0 until 10) {
                val a = i / 10.0 * 2.0 * Math.PI
                g.drawLine(
                    C + (cos(a) * s0).toFloat(), C + (sin(a) * s0).toFloat(),
                    C + (cos(a) * s1).toFloat(), C + (sin(a) * s1).toFloat(), p,
                )
            }
        }
        return bmp
    }
}
