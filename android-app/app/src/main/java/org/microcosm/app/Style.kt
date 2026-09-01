package org.microcosm.app

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.content.res.ColorStateList

/**
 * The shell's design language (U2.S) — the Kotlin form of the approved canvas ("Microcosm Shell",
 * Observatory direction, owner 2026-09-01). One place for every colour, face and surface the
 * chrome is allowed to use, so a later taste change is an edit here, not a hunt.
 *
 * The palette is the world's own: the abyss ground, slate text, and amber — which stays the
 * player's hand exclusively (CLAUDE.md rule 7). Species colours belong to the world and appear
 * in chrome only as identity dots, painted from the core's bucket table, never from constants
 * here.
 *
 * Two faces, both OFL and bundled in res/font: Space Grotesk (variable, 300–700) for words,
 * IBM Plex Mono for numbers — the census, the clock, trait values, meters. Monospace stops being
 * the voice of everything; that was the developer HUD leaking into the product.
 */
object Style {

    // ---- the palette ----
    val ABYSS = Color.parseColor("#0B131E")
    val SURFACE = Color.parseColor("#101B28")
    /** Sheet/panel scrim: SURFACE at ~96% over the world. */
    val SURFACE_SCRIM = Color.argb(245, 16, 27, 40)
    val BRIGHT = Color.parseColor("#E8F1F8")
    val TEXT = Color.parseColor("#C9D7E3")
    val DIM = Color.parseColor("#5E7386")
    val AMBER = Color.parseColor("#F2B24A")
    val HAIRLINE = Color.argb(56, 148, 178, 204)     // 22% slate — borders
    val HAIRLINE_FAINT = Color.argb(41, 148, 178, 204)
    val FILL_SELECTED = Color.argb(36, 148, 178, 204) // 14% slate — the selected state's ground
    val AMBER_BORDER = Color.argb(140, 242, 178, 74)
    val AMBER_FILL = Color.argb(26, 242, 178, 74)

    // ---- type ----
    private var ui: Typeface? = null
    private var uiMedium: Typeface? = null
    private var uiBold: Typeface? = null
    private var monoR: Typeface? = null
    private var monoM: Typeface? = null

    fun word(ctx: Context): Typeface = ui ?: derive(ctx, 400).also { ui = it }
    fun wordMedium(ctx: Context): Typeface = uiMedium ?: derive(ctx, 500).also { uiMedium = it }
    fun wordBold(ctx: Context): Typeface = uiBold ?: derive(ctx, 700).also { uiBold = it }
    fun mono(ctx: Context): Typeface = monoR ?: ctx.resources.getFont(R.font.ibm_plex_mono).also { monoR = it }
    fun monoMedium(ctx: Context): Typeface = monoM ?: ctx.resources.getFont(R.font.ibm_plex_mono_medium).also { monoM = it }

    private fun derive(ctx: Context, weight: Int): Typeface {
        val base = ctx.resources.getFont(R.font.space_grotesk)
        return if (android.os.Build.VERSION.SDK_INT >= 28)
            Typeface.create(base, weight, false)
        else if (weight >= 700) Typeface.create(base, Typeface.BOLD) else base
    }

    // ---- surfaces ----
    fun dp(ctx: Context, v: Float): Int = (v * ctx.resources.displayMetrics.density + 0.5f).toInt()

    private fun rounded(ctx: Context, fill: Int, stroke: Int, radiusDp: Float): GradientDrawable =
        GradientDrawable().apply {
            setColor(fill)
            if (stroke != 0) setStroke(dp(ctx, 1f), stroke)
            cornerRadius = dp(ctx, radiusDp).toFloat()
        }

    /** The quiet button: hairline on nothing. The default voice of every control. */
    fun quiet(ctx: Context) = rounded(ctx, Color.TRANSPARENT, HAIRLINE, 12f)

    /** The selected state: 14% slate fill, no border. */
    fun selected(ctx: Context) = rounded(ctx, FILL_SELECTED, 0, 12f)

    /** The hand: amber border on a 10% amber ground. Armed tools, undo, the standing change. */
    fun hand(ctx: Context) = rounded(ctx, AMBER_FILL, AMBER_BORDER, 12f)

    /** A pill (chips, badges): same grammar, rounder. */
    fun pill(ctx: Context, amber: Boolean = false) =
        rounded(ctx, if (amber) AMBER_FILL else Color.TRANSPARENT, if (amber) AMBER_BORDER else HAIRLINE, 20f)

    /** The sheet/panel ground: scrim with the top corners rounded. */
    fun sheet(ctx: Context) = GradientDrawable().apply {
        setColor(SURFACE_SCRIM)
        val r = dp(ctx, 20f).toFloat()
        cornerRadii = floatArrayOf(r, r, r, r, 0f, 0f, 0f, 0f)
        setStroke(dp(ctx, 1f), HAIRLINE_FAINT)
    }

    /** A floating card (verdict, report, the front door's rows): surface on a faint hairline. */
    fun card(ctx: Context) = rounded(ctx, Color.argb(235, 16, 27, 40), HAIRLINE, 16f)

    /** Touch feedback on any of the above, kept subtle. */
    fun touchable(ctx: Context, content: GradientDrawable): RippleDrawable =
        RippleDrawable(ColorStateList.valueOf(Color.argb(31, 201, 215, 227)), content, null)
}
