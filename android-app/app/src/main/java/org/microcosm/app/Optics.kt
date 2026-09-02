package org.microcosm.app

import android.graphics.Color
import kotlin.math.roundToInt

/**
 * THE MICROSCOPE'S TWO REGIMES (GR.7, docs/organism-graphics-plan.md).
 *
 * Microcosm has always been a darkfield micrograph: bright life scattering light out of black
 * water, which is also why the pigments read at all (docs/microcosm-concept.md §palette). The
 * light field is the other classical regime — brightfield: the ground is the lamp, and a body is
 * what ABSORBS it. Nothing about the world changes; only what the painter does with the same
 * numbers. The core's frame builder (rust/microcosm-core/src/frame.rs) is untouched by this
 * file, so no fingerprint moves and the browser oracle keeps its one look.
 *
 * The whole regime is three rules, and every painter goes through them rather than branching:
 *
 *   [wash]  a fill — a field, an interior, a glow. Dark: the colour as chosen. Light: the same
 *           hue half-faded toward the mid grey of a stained slide, so it sits ON the lamp instead
 *           of glowing over it.
 *   [line]  a structure — a membrane, a rod, a seam. Light: the faded hue darkened, which is what
 *           a body does to transmitted light.
 *   [ink]   the contrast ink. Dark it is the pale colour the call site chose (a white nucleus, a
 *           slate ring); light it is one charcoal, because on the lamp every pale ink is gone.
 *
 * Two structural differences a colour rule cannot express, so the call sites branch on
 * [lightField] directly and say why: an organism's additive bloom becomes a [halo] (the bright
 * rim brightfield actually shows at a membrane), and the blits stop compositing with SCREEN.
 *
 * The flag is written from the menu on the UI thread and read by the render thread. A toggle
 * mid-frame can only cost one frame painted half in each regime; the sprite bake behind it is
 * swapped atomically by the Renderer.
 */
object Optics {

    /** false = dark field, the shipped ground. The single source of truth for both threads. */
    @Volatile var lightField = false

    /** Black water. Kept equal to Renderer.ABYSS deliberately — one ground, named twice. */
    val GROUND_DARK: Int = Color.rgb(0x0B, 0x13, 0x1E)

    /** The lamp: exposed film, never paper white — a white ground burns under a bright mat. */
    val GROUND_LIGHT: Int = Color.rgb(0xEC, 0xE9, 0xDF)

    /** The light layer paints the lamp itself, so it starts a shade under the bare ground. */
    val LAMP_DIM: Int = Color.rgb(0xDF, 0xDC, 0xD0)

    /** The one charcoal every pale ink becomes on the lamp. */
    private val INK_LIGHT = intArrayOf(50, 56, 62)

    /** The mid grey of a stained slide: where a pigment fades to when it stops glowing. */
    private val SLIDE_GREY = intArrayOf(105, 105, 100)

    /** How far a pigment fades toward the slide grey, and how far a structure then darkens. */
    private const val FADE = 0.5
    private const val DEEP = 0.55

    fun ground(): Int = if (lightField) GROUND_LIGHT else GROUND_DARK

    private fun a8(a: Float) = (a * 255f).roundToInt().coerceIn(0, 255)

    private fun fade(v: Int, k: Int) = (v + (k - v) * FADE).roundToInt()

    /** A fill: a field, an interior, a glow. */
    fun wash(a: Float, r: Int, g: Int, b: Int): Int =
        if (!lightField) Color.argb(a8(a), r, g, b)
        else Color.argb(a8(a), fade(r, SLIDE_GREY[0]), fade(g, SLIDE_GREY[1]), fade(b, SLIDE_GREY[2]))

    /** The same fade as [wash], as a packed opaque colour — for the per-cell field pixels. */
    fun washRGB(r: Int, g: Int, b: Int): Int =
        if (!lightField) Color.rgb(r, g, b)
        else Color.rgb(fade(r, SLIDE_GREY[0]), fade(g, SLIDE_GREY[1]), fade(b, SLIDE_GREY[2]))

    /** A structure: membrane, rod, seam, filament — the faded hue, darkened. */
    fun line(a: Float, r: Int, g: Int, b: Int): Int =
        if (!lightField) Color.argb(a8(a), r, g, b)
        else Color.argb(
            a8(a),
            (fade(r, SLIDE_GREY[0]) * DEEP).roundToInt(),
            (fade(g, SLIDE_GREY[1]) * DEEP).roundToInt(),
            (fade(b, SLIDE_GREY[2]) * DEEP).roundToInt(),
        )

    /** The contrast ink: the call site's pale colour on black water, one charcoal on the lamp. */
    fun ink(a: Float, r: Int, g: Int, b: Int): Int =
        if (!lightField) Color.argb(a8(a), r, g, b)
        else Color.argb(a8(a), INK_LIGHT[0], INK_LIGHT[1], INK_LIGHT[2])

    /**
     * The phase-contrast rim — light field only. A membrane in transmitted light throws a bright
     * edge, and it is what keeps a body legible once the additive bloom is gone. Call sites guard
     * with [lightField]; on black water there is nothing to draw.
     */
    fun halo(a: Float): Int = Color.argb(a8(a), 255, 255, 252)

    /**
     * Amber stays the player's hand (CLAUDE.md rule 7) — one hue, in the tone its ground can
     * carry. #F2B24A on the lamp is a pale mark on a pale ground; this is the same amber deepened
     * until it reads. The concession is recorded in docs/organism-graphics-plan.md GR.7.
     */
    fun hand(a: Float): Int =
        if (!lightField) Color.argb(a8(a), 242, 178, 74) else Color.argb(a8(a), 176, 104, 12)
}
