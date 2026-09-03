package org.microcosm.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView

/**
 * The sky: the six scenarios as data, and as a picture.
 *
 * The data half is the browser's `SOURCE_LAYOUTS` (src/ui.jsx) verbatim — additive by the L.2
 * finding: the shipped sun stays what and where it is, and extra sources are tight and far. It
 * lived as a private list inside `MainActivity` until the sun lever moved into the intervene
 * dial (owner, 2026-09-03); it is here now because the picture needs it too, and one definition
 * is the rule.
 *
 * The picture half is the point. Six identical text buttons said "one sun / second sun / dim sun
 * / archipelago / hot sun / heater" and made the player read six names to learn what is really a
 * spatial fact — how many sources there are, where they sit, how wide they reach, and whether
 * they carry light or heat. [SkyPreview] draws exactly that, from the same numbers the button
 * applies, so the thumbnail cannot drift from what the tap does. It is the seed picker's species
 * dot one step further: a swatch of the thing itself, beside its name.
 *
 * Deliberately NOT the world's own light field: this is a diagram of a layout, painted from five
 * numbers per source, not a render of a pond that does not exist yet. The frame builder owns what
 * light actually looks like (`frame.rs`), and nothing here may pretend to be that.
 */
object Sky {

    /** One energy source: position, light, warmth, and the Gaussian width of its reach. */
    data class Src(val x: Double, val y: Double, val i: Double, val a: Double, val sigma: Double)

    /** The world's edge, for the preview's arithmetic — `params.rs` WORLD, and it wraps. */
    const val WORLD = 1024.0

    /** The six scenarios, in `Chrome.LAYOUTS` order: the labels and these rows are one table. */
    val LAYOUTS: List<List<Src>> = listOf(
        listOf(Src(512.0, 512.0, 1.0, 0.0, 210.0)),
        listOf(Src(512.0, 512.0, 1.0, 0.0, 210.0), Src(0.0, 0.0, 1.0, 0.0, 130.0)),
        listOf(Src(512.0, 512.0, 1.0, 0.0, 210.0), Src(0.0, 0.0, 0.7, 0.0, 130.0)),
        listOf(Src(512.0, 512.0, 1.0, 0.0, 210.0), Src(0.0, 0.0, 0.8, 0.0, 110.0), Src(0.0, 512.0, 0.8, 0.0, 110.0)),
        listOf(Src(512.0, 512.0, 1.0, 8.0, 210.0)),
        listOf(Src(512.0, 512.0, 1.0, 0.0, 210.0), Src(0.0, 0.0, 0.0, 10.0, 130.0)),
    )

    /**
     * The scenario grid: one card per layout — its picture, then its name — two to a row.
     *
     * Built here rather than in `MainActivity` for the reason `Chrome` exists: the layout gate
     * measures the construct that ships, and a row built somewhere else is a row nothing checks.
     * `Chrome.build(ctx, "layouts")` is the one door in.
     */
    fun scenarios(ctx: Context, onTap: (Int) -> Unit = {}): LinearLayout {
        val box = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
        var k = 0
        while (k < LAYOUTS.size) {
            val row = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
            for (c in 0 until 2) {
                val idx = k + c
                if (idx >= LAYOUTS.size) break
                val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                if (c > 0) lp.marginStart = Style.dp(ctx, 8f)
                row.addView(card(ctx, idx, onTap), lp)
            }
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT)
            if (k > 0) lp.topMargin = Style.dp(ctx, 8f)
            box.addView(row, lp)
            k += 2
        }
        return box
    }

    /** One scenario card: the sky it would make, beside the name it goes by. */
    private fun card(ctx: Context, k: Int, onTap: (Int) -> Unit): LinearLayout {
        val card = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = Style.touchable(ctx, Style.quiet(ctx))
            minimumHeight = Style.dp(ctx, 56f)
            setPadding(Style.dp(ctx, 8f), Style.dp(ctx, 8f), Style.dp(ctx, 8f), Style.dp(ctx, 8f))
            setOnClickListener { onTap(k) }
        }
        card.addView(SkyPreview(ctx).apply { sources = LAYOUTS[k] },
            LinearLayout.LayoutParams(Style.dp(ctx, 32f), Style.dp(ctx, 32f)))
        // 12 sp, not the chrome's 14: two of these share a 320 dp phone's sheet, and the longest
        // German name ("Heizquelle") is what decides whether the pair fits. The layout gate
        // measures exactly that case, in both languages, and convicted the first draft of it.
        card.addView(TextView(ctx).apply {
            text = Chrome.label(ctx, Chrome.LAYOUTS[k])
            textSize = 12f
            typeface = Style.word(ctx)
            setTextColor(Style.TEXT)
            maxLines = 1
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
            marginStart = Style.dp(ctx, 8f)
        })
        return card
    }
}

/**
 * A layout's sky, drawn small: the world as a square of dark water with each source's reach
 * bloomed onto it — warm for light, red for warmth, blue for cold.
 *
 * Two things it takes seriously, because they are the two things the six names cannot say. The
 * world **wraps**, so a source at (0,0) is not a corner light but one glow reaching all four
 * corners; every source is therefore drawn nine times, once per neighbouring copy of the world,
 * and the ones that fall outside cost a rejected bounds test. And `sigma` is a **reach**, so the
 * radius is that width in world units carried onto the swatch, not a decorative constant.
 */
class SkyPreview(ctx: Context) : View(ctx) {

    var sources: List<Sky.Src> = emptyList()
        set(v) { field = v; placed = roll(v); invalidate() }

    /** [sources] with the view rolled onto them: each source's fraction of the world, 0..1. */
    private var placed: List<FloatArray> = emptyList()

    private val glow = Paint(Paint.ANTI_ALIAS_FLAG)
    private val ground = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Style.ABYSS }
    private val edge = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        color = Style.HAIRLINE_FAINT
        strokeWidth = Style.dp(ctx, 1f).toFloat()
    }
    private val box = RectF()
    /**
     * The four corner offcuts — the square minus the rounded pond — cleared out of the layer at
     * the end, antialiased.
     *
     * Two wrong ways were tried first and both are worth the line they cost. A rectangular clip
     * leaves the rounding unpainted, so a corner source (the world wraps: its glow belongs in all
     * four corners) grew four bright square teeth. And a DST_IN mask drawn as the rounded shape
     * does nothing at all outside that shape — Porter-Duff composites only where the source
     * actually paints, so the corners were never touched. Clearing the offcuts is the operation
     * that means what it says.
     */
    private val offcuts = android.graphics.Path()
    private var offcutsFor = 0f
    private val cut = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.BLACK
        xfermode = android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.CLEAR)
    }

    /** Square: the world is, and a stretched pond would be a lie about where the sources sit. */
    override fun onMeasure(wSpec: Int, hSpec: Int) {
        val s = minOf(MeasureSpec.getSize(wSpec), MeasureSpec.getSize(hSpec))
        setMeasuredDimension(s, s)
    }

    override fun onDraw(c: Canvas) {
        val s = width.toFloat()
        if (s <= 0f) return
        val r = Style.dp(context, 6f).toFloat()
        box.set(0f, 0f, s, height.toFloat())
        // Ground and glows go into one layer, and the rounded shape is punched out of it at the
        // end. A corner source's glow reaches the corners by design — the world wraps — so with
        // a plain rectangular clip the swatch grew four bright square teeth where the rounding
        // should be, on exactly the scenarios that HAVE a corner source.
        if (offcutsFor != s) {
            offcutsFor = s
            val round = android.graphics.Path()
            round.addRoundRect(box, r, r, android.graphics.Path.Direction.CW)
            offcuts.reset()
            offcuts.addRect(box, android.graphics.Path.Direction.CW)
            offcuts.op(round, android.graphics.Path.Op.DIFFERENCE)
        }
        val save = c.saveLayer(box, null)
        c.drawRoundRect(box, r, r, ground)
        for ((k, src) in sources.withIndex()) {
            val rad = (src.sigma / Sky.WORLD).toFloat() * s * 1.5f
            if (rad <= 0f) continue
            val at = placed.getOrNull(k) ?: continue
            val colors = tint(src)
            for (dx in -1..1) for (dy in -1..1) {
                val cx = (at[0] + dx) * s
                val cy = (at[1] + dy) * s
                if (cx + rad < 0f || cx - rad > s || cy + rad < 0f || cy - rad > s) continue
                glow.shader = RadialGradient(cx, cy, rad, colors, STOPS, Shader.TileMode.CLAMP)
                c.drawCircle(cx, cy, rad, glow)
            }
        }
        c.drawPath(offcuts, cut)
        c.restoreToCount(save)
        box.inset(edge.strokeWidth / 2f, edge.strokeWidth / 2f)
        c.drawRoundRect(box, r, r, edge)
    }

    /**
     * Where each source sits once the view is rolled onto the arrangement.
     *
     * The world is a torus, so where you cut it open is arbitrary — and cut at the origin, the
     * scenarios that place a source at (0,0) drew it as a wash in all four corners rather than as
     * a second sun. True to the geometry and useless as a picture (owner, 2026-09-03: "two suns
     * should have two suns"). So the cut is moved instead: every source is taken at the copy
     * nearest the first one, and the view is rolled until that little constellation sits in the
     * middle of the frame. One sun stays centred; a pair lands on the diagonal; the archipelago's
     * three land apart. Nothing about the sky changes — only where this picture's edge falls.
     */
    private fun roll(srcs: List<Sky.Src>): List<FloatArray> {
        if (srcs.isEmpty()) return emptyList()
        val w = Sky.WORLD
        fun delta(v: Double): Double {
            var d = v % w
            if (d > w / 2) d -= w
            if (d < -w / 2) d += w
            return d
        }
        val p0 = srcs[0]
        val reps = srcs.map { doubleArrayOf(p0.x + delta(it.x - p0.x), p0.y + delta(it.y - p0.y)) }
        val rx = w / 2 - (reps.minOf { it[0] } + reps.maxOf { it[0] }) / 2
        val ry = w / 2 - (reps.minOf { it[1] } + reps.maxOf { it[1] }) / 2
        return reps.map {
            floatArrayOf((((it[0] + rx) % w + w) % w / w).toFloat(),
                (((it[1] + ry) % w + w) % w / w).toFloat())
        }
    }

    /**
     * A source's colour, from the two channels it actually has.
     *
     * Warmth and cold are the world's own — `Layers.kt` paints the heat field in exactly this
     * ember (255,120,60) and this blue (110,170,255), so a swatch and the pond it describes
     * cannot disagree about which is which. Light is the one deliberate departure: the darkfield
     * paints its light layer pale blue-white, which at 32 dp beside an ember reads as "some other
     * cold thing" rather than as the sun. Here it is sunlight yellow, by the owner's call
     * (2026-09-03) — kept clear of the hand's amber (#F2B24A, rule 7) by being paler and less
     * orange, and it appears only in this picker, never on the world.
     *
     * A source carrying both (the hot sun) lands between them, which is what its name says it is.
     */
    private fun tint(src: Sky.Src): IntArray {
        // 1.0 is the shipped sun, so that — not the slider's 1.5 ceiling — is what "full" means
        // here. Scaled by the ceiling instead, the one scenario that differs ONLY in intensity
        // ("dim sun", 0.7 against 1.0) came out indistinguishable from its neighbour.
        val lit = src.i.coerceIn(0.0, 1.25)
        val heat = (src.a / 10.0).coerceIn(-1.0, 1.0)
        val warm = if (heat > 0) heat else 0.0
        val cold = if (heat < 0) -heat else 0.0
        // Weighted mix, never a sum: a source with no light and no warmth is a dark source, and
        // it must draw as nothing rather than as an arbitrary colour.
        val w = lit + warm + cold
        if (w <= 0.0) return intArrayOf(Color.TRANSPARENT, Color.TRANSPARENT, Color.TRANSPARENT)
        val red = (255 * lit + 255 * warm + 110 * cold) / w
        val green = (216 * lit + 120 * warm + 170 * cold) / w
        val blue = (110 * lit + 60 * warm + 255 * cold) / w
        val peak = (235 * minOf(1.0, w)).toInt()
        fun at(a: Double) = Color.argb((peak * a).toInt(), red.toInt(), green.toInt(), blue.toInt())
        return intArrayOf(at(1.0), at(0.34), at(0.0))
    }

    private companion object {
        /** A Gaussian's shoulder, cheaply: bright core, long fade, nothing at the rim. */
        val STOPS = floatArrayOf(0f, 0.30f, 1f)
    }
}
