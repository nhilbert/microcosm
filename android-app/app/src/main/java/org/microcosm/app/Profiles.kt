package org.microcosm.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.view.View

/**
 * The species profile ("Steckbrief") the specimen sheet shows — docs/species-profiles.md made
 * real in the app.
 *
 * Two sources, kept strictly apart. The PORTRAITS are the repo's own art (assets/species, one
 * jpg per species, bundled by build.gradle from their one committed home) and are optional: the card hides the
 * slot when a file is missing, so a species without art (Mycora, Necro) degrades to the identity
 * dot, never a crash. The WORDS are ordinary localized resources (strings.xml / values-de), held
 * to the prose gate like every player string. Both are keyed by the CORE's English names —
 * species name for the art, locus label for the trait explanations — so a core rename surfaces
 * as a missing profile, never a wrong one.
 */
object Profiles {

    private val cache = HashMap<String, Bitmap?>()

    /** The species portrait, decoded once from the bundled assets; null when there is no art. */
    fun portrait(ctx: Context, species: String): Bitmap? {
        val key = species.lowercase()
        if (cache.containsKey(key)) return cache[key]
        val b = try {
            ctx.assets.open("species/$key.jpg").use { BitmapFactory.decodeStream(it) }
        } catch (e: Exception) { null }
        cache[key] = b
        return b
    }

    private val levelCache = HashMap<String, Bitmap?>()

    /**
     * A level's experiment-menu thumbnail: a moment of that level's own world, photographed from
     * real gameplay by tools/level-thumbs.js into assets/levels/<key>.jpg (the same committed
     * home and bundling path as the portraits). Keyed by the core's level key; null when the
     * level has no picture — the menu row then shows the words alone, never a placeholder.
     */
    fun levelThumb(ctx: Context, key: String): Bitmap? {
        if (levelCache.containsKey(key)) return levelCache[key]
        val b = try {
            ctx.assets.open("levels/$key.jpg").use { BitmapFactory.decodeStream(it) }
        } catch (e: Exception) { null }
        levelCache[key] = b
        return b
    }

    private val startCache = HashMap<String, Bitmap?>()

    /**
     * A start world's chooser thumbnail: a moment of that world, photographed from the app's own
     * renderer by `StartThumbsTest` (`gradle -Pthumbs`) into assets/starts/<key>.jpg — the same
     * committed home and bundling path as the portraits and the level pictures. Null when a start
     * has no picture; the row then shows the words alone, never a placeholder.
     */
    fun startThumb(ctx: Context, key: String): Bitmap? {
        if (startCache.containsKey(key)) return startCache[key]
        val b = try {
            ctx.assets.open("starts/$key.jpg").use { BitmapFactory.decodeStream(it) }
        } catch (e: Exception) { null }
        startCache[key] = b
        return b
    }

    /** What this species does, one line. 0 = no profile written for this species. */
    fun role(species: String) = when (species.lowercase()) {
        "solara" -> R.string.spec_role_solara
        "drifta" -> R.string.spec_role_drifta
        "cilio" -> R.string.spec_role_cilio
        "bacillus" -> R.string.spec_role_bacillus
        "venator" -> R.string.spec_role_venator
        else -> 0
    }

    /** Who this species is, two or three short sentences. */
    fun about(species: String) = when (species.lowercase()) {
        "solara" -> R.string.spec_about_solara
        "drifta" -> R.string.spec_about_drifta
        "cilio" -> R.string.spec_about_cilio
        "bacillus" -> R.string.spec_about_bacillus
        "venator" -> R.string.spec_about_venator
        else -> 0
    }

    fun eats(species: String) = when (species.lowercase()) {
        "solara" -> R.string.spec_eats_solara
        "drifta" -> R.string.spec_eats_drifta
        "cilio" -> R.string.spec_eats_cilio
        "bacillus" -> R.string.spec_eats_bacillus
        "venator" -> R.string.spec_eats_venator
        else -> 0
    }

    fun eatenBy(species: String) = when (species.lowercase()) {
        "solara" -> R.string.spec_eaten_solara
        "drifta" -> R.string.spec_eaten_drifta
        "cilio" -> R.string.spec_eaten_cilio
        "bacillus" -> R.string.spec_eaten_bacillus
        "venator" -> R.string.spec_eaten_venator
        else -> 0
    }

    /**
     * One line on what a heritable dial trades, keyed by the core's locus label. Labels are
     * shared where the trade is the same (Thermal on Drifta and Bacillus, Warmth preference on
     * Drifta and Cilio), so one explanation serves both — deliberately.
     */
    fun explain(locusLabel: String) = when (locusLabel.lowercase()) {
        "light" -> R.string.trait_explain_light
        "defense" -> R.string.trait_explain_defense
        "thermal" -> R.string.trait_explain_thermal
        "warmth preference" -> R.string.trait_explain_warmth_pref
        "restlessness" -> R.string.trait_explain_restlessness
        "pursuit" -> R.string.trait_explain_pursuit
        "hunting style" -> R.string.trait_explain_hunting_style
        "metabolism" -> R.string.trait_explain_metabolism
        "search style" -> R.string.trait_explain_search_style
        else -> 0
    }
}

/**
 * A rounded-corner portrait, dependency-free: the square art center-cropped into whatever box
 * the layout gives it, clipped by shader (no androidx), with the chrome's hairline as frame.
 */
class PortraitView(ctx: Context) : View(ctx) {
    private var bmp: Bitmap? = null
    private var shader: BitmapShader? = null
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val frame = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        color = Style.HAIRLINE
    }
    private val rect = RectF()
    private val m = Matrix()

    fun show(b: Bitmap?) {
        bmp = b
        shader = b?.let { BitmapShader(it, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP) }
        visibility = if (b == null) GONE else VISIBLE
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val b = bmp ?: return
        val s = shader ?: return
        if (width == 0 || height == 0) return
        val scale = maxOf(width / b.width.toFloat(), height / b.height.toFloat())
        m.setScale(scale, scale)
        m.postTranslate((width - b.width * scale) / 2f, (height - b.height * scale) / 2f)
        s.setLocalMatrix(m)
        paint.shader = s
        rect.set(0f, 0f, width.toFloat(), height.toFloat())
        val r = Style.dp(context, 12f).toFloat()
        canvas.drawRoundRect(rect, r, r, paint)
        frame.strokeWidth = Style.dp(context, 1f).toFloat()
        canvas.drawRoundRect(rect, r, r, frame)
    }
}

/**
 * One heritable dial, drawn instead of only printed: the pole-to-pole track, a hollow tick where
 * the species was founded (g0), and a filled marker in the species' own colour where THIS
 * creature sits. The number stays on the tile for whoever wants it; the track is for everyone
 * else. Display only — it reads what the render thread published, never the core.
 */
class TraitMeter(ctx: Context) : View(ctx) {
    private var frac = 0.5f
    private var founder = 0.5f
    private var markerColor = Style.TEXT
    private val track = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Style.HAIRLINE_FAINT }
    private val tick = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Style.DIM }
    private val marker = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()

    fun set(g: Double, g0: Double, color: Int) {
        frac = g.coerceIn(0.0, 1.0).toFloat()
        founder = g0.coerceIn(0.0, 1.0).toFloat()
        markerColor = color
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val cy = height / 2f
        val pad = Style.dp(context, 5f).toFloat() // the marker never clips at the rails
        val r = Style.dp(context, 2f).toFloat()
        rect.set(pad, cy - r, w - pad, cy + r)
        canvas.drawRoundRect(rect, r, r, track)
        val fx = pad + (w - 2 * pad) * founder
        tick.strokeWidth = Style.dp(context, 1f).toFloat()
        val th = Style.dp(context, 4f).toFloat()
        canvas.drawLine(fx, cy - th, fx, cy + th, tick)
        marker.color = markerColor
        canvas.drawCircle(pad + (w - 2 * pad) * frac, cy, Style.dp(context, 4f).toFloat(), marker)
    }
}
