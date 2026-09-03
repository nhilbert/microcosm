package org.microcosm.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.Shader
import android.view.View

/**
 * THE OPTIC'S PREVIEW: a field of view, in the regime the switch beside it is set to.
 *
 * It replaces the sentence the front door used to carry ("glowing life on black water — tap for
 * the light field"). Two findings put it there, and both are the same failure: the row was saying
 * three things at once.
 *
 *  1. A switch's position already states which side you are on. A line beside it naming the
 *     ACTION is the toggle's classic ambiguity — the reader cannot tell whether the control
 *     reports a state or offers a command, and the standing advice is to let the control carry
 *     the state and stop writing the rest (UX Movement, "The Confusing State of Toggle
 *     Switches"; Cieden's switch guidance: label the thing, never the action).
 *  2. Where the outcome is a look, show the look. The appearance pickers in macOS and iOS are
 *     the everyday case of the Preview pattern, and prose about a look is a translation the
 *     reader has to undo.
 *
 * So the sentence goes and this takes its place: the picture the pond would give you, small.
 *
 * **Not a pair of drawables**, and that is the whole point. Every colour here comes out of the
 * same three rules the renderer paints the world through ([Optics.wash] a fill, [Optics.line] a
 * structure, [Optics.ink] the contrast), and the one structural difference between the regimes is
 * made the way `Renderer` and `Sprites` make it: the dark field's additive bloom becomes the
 * bright phase-contrast rim a membrane throws in transmitted light. Change the light field's
 * recipe and this changes with it. Two hand-picked icons would have been a second definition of
 * the look, which is the thing this repository keeps learning not to build.
 *
 * **Why it takes the regime as an argument** instead of reading `Optics.lightField`: that flag
 * belongs to the render thread. The menu writes `world.lightField` and the render loop applies it
 * a frame later — so at the moment of the tap the global still says the old regime, and a preview
 * that read it would show the microscope the player just left. Flipping the global here instead
 * would race the renderer AND cancel the real switch, which the renderer guards by comparing
 * against that very flag. So the regime is passed in, the rules are pure, and the picture is
 * right in the same frame as the tap.
 *
 * The bodies are simplified on purpose — an interior, a membrane, a nucleus. At 52 dp the sprite
 * bakes' vacuoles and spines are mud, and the thing this has to communicate is which ground the
 * pond is on and how a body sits on it.
 */
class OpticSwatch(ctx: Context) : View(ctx) {

    /** One body: the core's own colour for a species, and where it sits in the field. */
    class Body(val rgb: IntArray, val x: Float, val y: Float, val d: Float)

    private var cast: List<Body> = emptyList()
    private var light = false
    private var face: Bitmap? = null

    private val blit = Paint(Paint.ANTI_ALIAS_FLAG).apply { isFilterBitmap = true }
    private val flat = Paint(Paint.ANTI_ALIAS_FLAG)
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }

    /** The pond's own cast, biggest first — handed in by the shell, where the core lives. */
    fun show(bodies: List<Body>) {
        cast = bodies
        face = null
        invalidate()
    }

    /** Show a regime. Cheap and idempotent: the face is only repainted when it really changed. */
    fun setRegime(lightField: Boolean) {
        if (light == lightField && face != null) return
        light = lightField
        face = null
        invalidate()
    }

    /** What the picture currently shows — the boot gate compares the two grounds through this. */
    val regime: Boolean get() = light

    override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) {
        super.onSizeChanged(w, h, ow, oh)
        face = null
    }

    override fun onDraw(c: Canvas) {
        if (width <= 0 || height <= 0) return
        val f = face ?: paintFace(width, height).also { face = it }
        c.drawBitmap(f, 0f, 0f, blit)
    }

    /**
     * The whole picture into its own bitmap: ground, the cast, the eyepiece's edge. Offscreen
     * rather than straight onto the view's canvas because the bodies are drawn with overlapping
     * translucent gradients, and a cached face costs one blit per frame instead of all of it.
     */
    private fun paintFace(w: Int, h: Int): Bitmap {
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val r = minOf(w, h) / 2f
        val cx = w / 2f
        val cy = h / 2f

        flat.color = Optics.ground(light)
        flat.shader = null
        c.drawCircle(cx, cy, r, flat)

        val save = c.save()
        c.clipPath(Path().apply { addCircle(cx, cy, r, Path.Direction.CW) })
        for (b in cast) {
            val br = b.d * r
            val bx = cx + (b.x - 0.5f) * 2f * r
            val by = cy + (b.y - 0.5f) * 2f * r
            cell(c, bx, by, br, b.rgb[0], b.rgb[1], b.rgb[2])
        }
        c.restoreToCount(save)

        // The eyepiece's edge, through the ink rule: a slate hairline on black water, and the one
        // charcoal on the lamp, where a slate hairline would not exist.
        stroke.shader = null
        stroke.color = Optics.ink(light, 0.34f, 148, 178, 204)
        stroke.strokeWidth = Style.dp(context, 1f).toFloat()
        c.drawCircle(cx, cy, r - stroke.strokeWidth / 2f, stroke)
        return bmp
    }

    /** One body, in the regime's own terms: glowing out of the water, or absorbing the lamp. */
    private fun cell(c: Canvas, x: Float, y: Float, r: Float, cr: Int, cg: Int, cb: Int) {
        if (!light) {
            // Dark field: the body scatters light into the water around it.
            flat.shader = RadialGradient(
                x, y, r * 2.1f,
                intArrayOf(Optics.wash(false, 0.34f, cr, cg, cb), Optics.wash(false, 0f, cr, cg, cb)),
                floatArrayOf(0.32f, 1f), Shader.TileMode.CLAMP,
            )
            c.drawCircle(x, y, r * 2.1f, flat)
            flat.shader = null
        } else {
            // Light field: no bloom on the lamp — the membrane throws a bright rim instead.
            stroke.shader = null
            stroke.color = Optics.halo(0.85f)
            stroke.strokeWidth = r * 0.20f
            c.drawCircle(x, y, r * 1.03f, stroke)
        }
        flat.color = Optics.wash(light, if (light) 0.88f else 0.62f, cr, cg, cb)
        c.drawCircle(x, y, r, flat)
        stroke.color = Optics.line(light, 0.95f, cr, cg, cb)
        stroke.strokeWidth = (r * 0.16f).coerceAtLeast(1f)
        c.drawCircle(x, y, r * 0.94f, stroke)
        flat.color = Optics.ink(light, 0.8f, 235, 250, 255)
        c.drawCircle(x - r * 0.16f, y - r * 0.14f, r * 0.28f, flat)
    }
}
