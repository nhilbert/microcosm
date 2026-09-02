package org.microcosm.app

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode

import android.graphics.RectF
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * PAINTING. Every decision behind this frame was already made by the core's frame builder
 * (rust/microcosm-core/src/frame.rs) and is proved equal to the browser's by
 * harness/fingerprint-frame.js. What is left here is strokes: blend modes, blits, paths.
 *
 * Nothing in this file may decide anything — if a number here would change what the player sees
 * about the *world* rather than how it is drawn, it belongs in frame.rs instead.
 *
 * @param density device pixels per CSS pixel. The browser draws on a CSS-pixel canvas and lets the
 * device pixel ratio scale it; this canvas is in device pixels, so every screen-space number
 * ported from `src/ui-render.js` — stroke widths, affordance radii, the LOD threshold — has to
 * carry the density itself, or it lands a third of its intended size on a 3x phone. Numbers
 * derived from the display list (`r`, `sx`, `sy`) already carry it through the zoom and are left
 * exactly alone.
 */
class Renderer(private val density: Double = 1.0) {
    companion object {
        val ABYSS: Int = Color.rgb(0x0B, 0x13, 0x1E)
        const val WORLD = 1024.0
        /** GR.3: CSS-px screen radius where the crisp overlay starts, and its fade-in span. */
        private const val VEC_AT = 28f
        private const val VEC_FADE = 8f
        /** GR.3: CSS zoom where the carpet's cells fade in over the upscaled field. */
        private const val CELLS_AT = 2.0
        /** World units between carpet cell candidates — 2x2 per 16-unit field cell. */
        private const val CELL_STEP = 8.0
    }

    private val layers = Layers()
    private val sprites: Array<Array<Bitmap>>
    private val grammar = Array(7) { sp -> DoubleArray(6) { f -> Native.grammarNum(sp, f) } }
    /** A CSS-pixel threshold in `frame.rs`, so it has to be compared against a CSS-pixel zoom. */
    private val lodZ = Native.frameConst(0) * density
    /** Screen-space sizes ported from the browser are in CSS pixels; this is the conversion. */
    private val dp = density.toFloat()
    private val orgStride = Native.frameConst(2).toInt()
    private val corpseStride = Native.frameConst(3).toInt()

    private val orgBuf = Native.orgBuffer().order(java.nio.ByteOrder.nativeOrder()).asDoubleBuffer()
    private val corpseBuf = Native.corpseBuffer().order(java.nio.ByteOrder.nativeOrder()).asDoubleBuffer()

    private val screen = Paint(Paint.FILTER_BITMAP_FLAG).apply {
        xfermode = PorterDuffXfermode(PorterDuff.Mode.SCREEN)
    }
    private val flat = Paint(Paint.ANTI_ALIAS_FLAG)
    private val dst = RectF()
    private val rayPath = Path()
    // The world is a torus, and a torus has no edge to filter against: every layer is sampled
    // through a REPEAT shader, so bilinear filtering interpolates across the wrap exactly as it
    // does everywhere else (filtering itself is what keeps the upscaled fields from reading as
    // hard squares — the browser's imageSmoothingEnabled). The per-tile drawBitmap loop this
    // replaces clamped at each tile's edge, which painted a visible vertical/horizontal seam
    // wherever the wrap crossed the screen (owner report, 2026-09-02).
    private val layerShaders = HashMap<Bitmap, android.graphics.BitmapShader>()
    private val layerMatrix = android.graphics.Matrix()
    private val layerPaint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG).apply {
        isFilterBitmap = true
        isDither = true
    }
    private val venOval = RectF()
    /** Girdle positions as fractions of the barrel half-length — a frame allocates nothing. */
    private val girdleFrac = floatArrayOf(0.42f, -0.18f)

    // GR.3 (docs/organism-graphics-plan.md): the zoom ladder's near tier. Above VEC_AT the 64px
    // bake blurs, so a crisp vector overlay — same geometry as the bake, so the handoff does not
    // pop — draws over the blit, fading in across VEC_FADE. Bucket specs are cached at init so
    // the overlay never crosses JNI per frame.
    private val vecPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        xfermode = PorterDuffXfermode(PorterDuff.Mode.SCREEN)
    }
    // Cell paints deliberately carry NO anti-alias: the owner's first device read-out was
    // 32 ms/frame at cell zoom — ~1,500 visible cells x two AA circles. Cells overlap densely,
    // so AA buys nothing visible; dedicated paints also spare per-cell style switching.
    private val cellFill = Paint()
    private val cellSeam = Paint().apply { style = Paint.Style.STROKE }
    private val cellDot = Paint()
    /** Cells drawn last frame — the dev telemetry's read-out, so a budget claim is checkable. */
    @Volatile var cellsDrawn = 0
        private set
    private val vecPath = Path()
    private val specShape = IntArray(7)
    private val specRGB = Array(7) { IntArray(0) }
    private val specOut = Array(7) { FloatArray(0) }
    private val specRound = Array(7) { FloatArray(0) }
    /** Fixed granule pattern (bake-space offsets) — the display list carries no per-organism seed. */
    private val granule = floatArrayOf(-6f, 2f, 3f, 6f, -2f, -6.5f, 7f, 3f, -8f, -3f, 1f, 9f, 8f, -4f, -3f, 7.5f)

    /**
     * Species names and locus words, read once from the trait rows. They belong to the traits, not
     * to any renderer — the browser reads the same strings — so they are fetched, never retyped.
     */
    val speciesName = Array(7) { Native.traitText(it, 0) }
    val locusText = Array(7) { sp ->
        Array(Native.locusCount(sp)) { k ->
            arrayOf(Native.traitText(sp, 10 + k), Native.traitText(sp, 20 + k), Native.traitText(sp, 30 + k))
        }
    }

    /** Census from the last frame: what a HUD or a status strip reads. */
    val pops = IntArray(7)
    var orgN = 0
        private set
    var corpseN = 0
        private set

    init {
        Native.grammarBuild()
        for (sp in 0 until 7) for (f in 0 until 6) grammar[sp][f] = Native.grammarNum(sp, f)
        // One bitmap per bucket, built once. The bucket table is the core's; the pixels are ours.
        sprites = Array(7) { sp ->
            val tN = if (grammar[sp][4] > 0) grammar[sp][4].toInt() else 1
            val mN = if (grammar[sp][5] > 0) grammar[sp][5].toInt() else 1
            specShape[sp] = Native.specNum(sp, 0, 0, 3).toInt()
            specRGB[sp] = IntArray(tN * mN * 3)
            specOut[sp] = FloatArray(tN * mN)
            specRound[sp] = FloatArray(tN * mN)
            Array(tN * mN) { i ->
                val tb = i / mN
                val mb = i % mN
                specRGB[sp][i * 3] = Native.specNum(sp, tb, mb, 0).toInt()
                specRGB[sp][i * 3 + 1] = Native.specNum(sp, tb, mb, 1).toInt()
                specRGB[sp][i * 3 + 2] = Native.specNum(sp, tb, mb, 2).toInt()
                specOut[sp][i] = Native.specNum(sp, tb, mb, 5).toFloat()
                specRound[sp][i] = Native.specNum(sp, tb, mb, 6).toFloat()
                Sprites.make(
                    intArrayOf(specRGB[sp][i * 3], specRGB[sp][i * 3 + 1], specRGB[sp][i * 3 + 2]),
                    Native.specNum(sp, tb, mb, 3).toInt(),
                    specOut[sp][i].toDouble(),
                    specRound[sp][i].toDouble(),
                )
            }
        }
        layers.refreshTiles()
    }

    fun onTilesChanged() = layers.refreshTiles()

    /** Nanoseconds to repack and upscale the four per-cell fields — once per advancing tick. */
    fun timeFieldRefresh(): Long = layers.timeRefresh(Native.tick())

    /**
     * Build the display list and paint it. Returns nanoseconds spent in the core, so the caller can
     * tell a slow frame builder from a slow painter — the whole question A.1 exists to answer.
     */
    fun draw(c: Canvas, cam: Camera, vw: Float, vh: Float, alpha: Double, hidden: Int,
             selI: Int = -1, selGen: Int = 0): Long {
        val t0 = System.nanoTime()
        Native.frameBuild(
            cam.x, cam.y, vw.toDouble(), vh.toDouble(), cam.z,
            (vw / 2).toDouble(), (vh / 2).toDouble(), alpha, lodZ, hidden,
        )
        val buildNanos = System.nanoTime() - t0
        orgN = Native.frameNum(0).toInt()
        corpseN = Native.frameNum(1).toInt()
        for (sp in 0 until 7) pops[sp] = Native.frameNum(10 + sp).toInt()
        layers.refreshFields(Native.tick())
        if (layers.tilesDirty()) layers.refreshTiles()

        c.drawColor(ABYSS, PorterDuff.Mode.SRC)
        // world layers, seam-free: each covers the viewport once through its REPEAT shader
        if (hidden and (1 shl 8) == 0) {
            paintLayer(c, layers.light, cam, vw, vh)
            // the wall shade keeps the painted glow honest: it must not claim occluded light
            if (layers.hasWalls) paintLayer(c, layers.shade, cam, vw, vh)
        }
        if (hidden and (1 shl 9) == 0 && layers.hasHeat) paintLayer(c, layers.heat, cam, vw, vh)
        paintLayer(c, layers.mineral, cam, vw, vh)
        if (hidden and 1 == 0) {
            paintLayer(c, layers.carpet, cam, vw, vh)
            paintCarpetCells(c, cam, vw, vh)
        } else cellsDrawn = 0
        if (cam.z < lodZ && hidden and (1 shl 7) == 0) paintLayer(c, layers.pall, cam, vw, vh)
        if (layers.hasWalls) paintLayer(c, layers.walls, cam, vw, vh)

        paintOrganisms(c)
        paintCorpses(c, cam, vw, vh)
        // The selection ring is an affordance, above the world and never additive. Slate, not
        // amber: amber is the player's hand on the world, and looking is not touching.
        if (selI >= 0 && Native.frameSel(selI, selGen, 0) != 0.0) {
            val sx = Native.frameSel(selI, selGen, 1).toFloat()
            val sy = Native.frameSel(selI, selGen, 2).toFloat()
            val rr = Native.frameSel(selI, selGen, 3).toFloat()
            flat.style = Paint.Style.STROKE
            flat.color = Color.argb(242, 201, 215, 227)
            flat.strokeWidth = 1.5f * dp
            c.drawCircle(sx, sy, rr, flat)
            flat.color = Color.argb(64, 201, 215, 227)
            flat.strokeWidth = 5f * dp
            c.drawCircle(sx, sy, rr + 4f * dp, flat)
            flat.style = Paint.Style.FILL
        }
        return buildNanos
    }

    /**
     * One world layer over the whole viewport, sampled toroidally. The shader's local matrix maps
     * bitmap pixels to screen exactly as the old tile rects did (world w lands at
     * `vw/2 + (w - cam.x) * z`); REPEAT supplies every torus copy AND lets the bilinear filter
     * read across the wrap, which per-tile blits cannot.
     */
    private fun paintLayer(c: Canvas, bmp: Bitmap, cam: Camera, vw: Float, vh: Float) {
        val sh = layerShaders.getOrPut(bmp) {
            android.graphics.BitmapShader(
                bmp,
                android.graphics.Shader.TileMode.REPEAT,
                android.graphics.Shader.TileMode.REPEAT,
            )
        }
        val scale = (WORLD * cam.z / bmp.width).toFloat()
        layerMatrix.setScale(scale, scale)
        layerMatrix.postTranslate(
            (vw / 2 - cam.x * cam.z).toFloat(),
            (vh / 2 - cam.y * cam.z).toFloat(),
        )
        sh.setLocalMatrix(layerMatrix)
        layerPaint.shader = sh
        c.drawRect(0f, 0f, vw, vh, layerPaint)
    }

    /**
     * Amber: the player's hand, and nothing else (rule 7). Pour rings fading, the wall the current
     * drag would build, and a ring on every sun with the gripped one brighter. Drawn above the
     * world, never additive, and only in Intervene.
     *
     * `pours` is (screen x, screen y, age 0..1) triples.
     */
    fun paintHand(c: Canvas, pours: FloatArray, wallDrag: FloatArray?, sunSel: Int,
                  cam: Camera, vw: Float, vh: Float) {
        flat.style = Paint.Style.STROKE
        var q = 0
        while (q + 2 < pours.size) {
            val age = pours[q + 2]
            flat.color = Color.argb(((0.7f * (1f - age)) * 255).toInt().coerceIn(0, 255), 242, 178, 74)
            flat.strokeWidth = 2f * dp
            c.drawCircle(pours[q], pours[q + 1], (10f + age * 34f) * dp, flat)
            q += 3
        }
        // every sun wears a ring in Intervene; the gripped one wears a brighter one
        for (k in 0 until Native.sourceCount()) {
            val sx = (vw / 2 + wd(Native.sourceNum(k, 0) - cam.x) * cam.z).toFloat()
            val sy = (vh / 2 + wd(Native.sourceNum(k, 1) - cam.y) * cam.z).toFloat()
            val on = k == sunSel
            flat.color = Color.argb(if (on) 255 else 230, 242, 178, 74)
            flat.strokeWidth = (if (on) 2.5f else 1.5f) * dp
            c.drawCircle(sx, sy, 16f * dp, flat)
            flat.color = Color.argb(if (on) 128 else 77, 242, 178, 74)
            flat.strokeWidth = 6f * dp
            c.drawCircle(sx, sy, 22f * dp, flat)
        }
        if (wallDrag != null) {
            flat.color = Color.argb(230, 242, 178, 74)
            flat.strokeWidth = 2.2f * dp
            c.drawLine(wallDrag[0], wallDrag[1], wallDrag[2], wallDrag[3], flat)
            flat.style = Paint.Style.FILL
            c.drawCircle(wallDrag[0], wallDrag[1], 3f * dp, flat)
        }
        flat.style = Paint.Style.FILL
    }

    /** Toroidal minimal image, as the core's `wd`. */
    private fun wd(d: Double): Double {
        var v = d
        if (v > WORLD / 2) v -= WORLD
        if (v < -WORLD / 2) v += WORLD
        return v
    }

    /** The specimen card's text, built where the core can be read: on the render thread. */
    fun cardText(selI: Int, selGen: Int): String {
        if (selI < 0 || Native.frameSel(selI, selGen, 0) == 0.0) return ""
        val sp = Native.org(selI, 1).toInt()
        val sb = StringBuilder(speciesName[sp])
        if (Native.org(selI, 9) != 0.0) sb.append("   · dormant")
        sb.append("\nenergy %.1f   size %.1f   mineral %.2f".format(
            Native.org(selI, 5), Native.org(selI, 6), Native.org(selI, 7)))
        sb.append("\nage %d ticks".format(Native.tick() - Native.org(selI, 8).toLong()))
        for (k in locusText[sp].indices) {
            val t = locusText[sp][k]
            sb.append("\n%-14s %.2f   %s ↔ %s".format(t[0], Native.org(selI, 20 + k), t[2], t[1]))
        }
        return sb.toString()
    }

    private fun paintOrganisms(c: Canvas) {
        for (q in 0 until orgN) {
            val b = q * orgStride
            val kind = orgBuf.get(b).toInt()
            val sx = orgBuf.get(b + 1).toFloat()
            val sy = orgBuf.get(b + 2).toFloat()
            val r = orgBuf.get(b + 3).toFloat()
            val sp = orgBuf.get(b + 4).toInt()
            val bucket = orgBuf.get(b + 5).toInt()
            when (kind) {
                0 -> { // dormant cyst: dim ember, no glow
                    flat.color = Color.argb(128, 120, 135, 150)
                    flat.style = Paint.Style.FILL
                    c.drawCircle(sx, sy, r, flat)
                }
                1 -> { // bacteria dot-LOD
                    flat.color = Color.argb(204, 196, 206, 150)
                    flat.style = Paint.Style.FILL
                    c.drawRect(sx - r, sy - r, sx + r, sy + r, flat)
                }
                4 -> didinium(c, sx, sy, orgBuf.get(b + 6).toFloat(), r, orgBuf.get(b + 7) != 0.0)
                else -> {
                    val set = sprites[sp]
                    val bk = if (bucket >= 0 && bucket < set.size) bucket else 0
                    val bmp = set[bk]
                    // GR.3 near tier: the blit stays (it carries the glow), a crisp vector
                    // overlay in the bake's own geometry fades in where the 64px bake blurs
                    val fade = ((r - VEC_AT * dp) / (VEC_FADE * dp)).coerceIn(0f, 1f)
                    if (kind == 3) {
                        c.save()
                        c.translate(sx, sy)
                        c.rotate(Math.toDegrees(orgBuf.get(b + 6)).toFloat())
                        dst.set(-r, -r, r, r)
                        c.drawBitmap(bmp, null, dst, screen)
                        if (fade > 0f && specShape[sp] == Sprites.TRI) vecTri(c, r, sp, bk, fade)
                        c.restore()
                    } else if (specShape[sp] == Sprites.SQUARE) {
                        // Bacillus turns with its own heading — hd is written into every record
                        // (frame.rs:569), so this is representation, not a new decision: the
                        // chain bake swims lengthwise and slews at each tumble instead of
                        // gliding as a fixed constellation (owner report, 2026-09-02)
                        c.save()
                        c.translate(sx, sy)
                        c.rotate(Math.toDegrees(orgBuf.get(b + 6)).toFloat())
                        dst.set(-r, -r, r, r)
                        c.drawBitmap(bmp, null, dst, screen)
                        c.restore()
                    } else {
                        dst.set(sx - r, sy - r, sx + r, sy + r)
                        c.drawBitmap(bmp, null, dst, screen)
                        if (fade > 0f && specShape[sp] == Sprites.DOT) vecDot(c, sx, sy, r, sp, bk, fade)
                    }
                }
            }
        }
    }

    /** Species base colours, mirroring frame.rs SPECIES_RGB — the one palette, do not drift. */
    private val speciesRGB = arrayOf(
        intArrayOf(70, 214, 140), intArrayOf(91, 200, 232), intArrayOf(215, 166, 232),
        intArrayOf(158, 168, 104), intArrayOf(206, 182, 148), intArrayOf(228, 224, 210),
        intArrayOf(168, 214, 244),
    )
    private val CORPSE_GRAY = intArrayOf(158, 168, 178)

    /**
     * GR.6: a death reads as a collapse, not a pop. The record carries the species and the sim's
     * own decay clock (`fresh` = remaining mass over size, drained by rot and by Bacillus), so a
     * fresh husk still wears a ghost of its colour, then greys, deflates, and slowly changes
     * shape as it rots — every visible change is driven by the simulation, never by a UI clock.
     * A starved body starts lean and its husk starts already sunken: honest by construction.
     */
    /**
     * The one UI-clock moment in the corpse story: a husk that was not on screen last frame
     * settles in over ~0.4 s (fade + a slight deflate), so the living body's disappearance and
     * the husk's arrival overlap perceptually instead of cutting. Same category as the amber
     * pour ring — a one-shot event transition, not idle ornament; after it, every change is the
     * sim's own decay clock again. Corpses never move, so world position identifies them; the
     * map is primitive-keyed (no boxing) and swept when it grows past its high-water mark.
     */
    private val corpseSeen = HashMap<Long, Long>()
    private var corpseSweep = 0

    private fun paintCorpses(c: Canvas, cam: Camera, vw: Float, vh: Float) {
        val now = System.nanoTime()
        if (++corpseSweep >= 600 && corpseSeen.size > 2048) { corpseSweep = 0; corpseSeen.clear() }
        for (q in 0 until corpseN) {
            val b = q * corpseStride
            val sx = corpseBuf.get(b).toFloat()
            val sy = corpseBuf.get(b + 1).toFloat()
            val r = corpseBuf.get(b + 2).toFloat()
            val a = corpseBuf.get(b + 3)
            val sp = corpseBuf.get(b + 4).toInt().coerceIn(0, 6)
            val fresh = (corpseBuf.get(b + 5) / 8.0).coerceIn(0.0, 1.0).toFloat()
            // arrival transition: keyed by quantized world position (corpses never move)
            val wx = cam.x + (sx - vw / 2.0) / cam.z
            val wy = cam.y + (sy - vh / 2.0) / cam.z
            val key = (Math.round(((wx % 1024.0 + 1024.0) % 1024.0) * 4.0) shl 13) or
                Math.round(((wy % 1024.0 + 1024.0) % 1024.0) * 4.0)
            var seen = corpseSeen[key] ?: 0L
            if (seen == 0L) { seen = now; corpseSeen[key] = seen }
            val arrive = ((now - seen) / 4e8).coerceIn(0.0, 1.0).toFloat()
            val aa = a * arrive
            val col = speciesRGB[sp]
            val t = fresh * 0.45f // colour ghost strength: fresh tinted, decayed grey
            val cr = (CORPSE_GRAY[0] + (col[0] - CORPSE_GRAY[0]) * t).toInt()
            val cg = (CORPSE_GRAY[1] + (col[1] - CORPSE_GRAY[1]) * t).toInt()
            val cb = (CORPSE_GRAY[2] + (col[2] - CORPSE_GRAY[2]) * t).toInt()
            val rr = r * (0.7f + 0.3f * fresh) * (1.1f - 0.1f * arrive) // deflates as the mass leaves; settles on arrival
            if (rr < 8f * dp) { // far tier: the old simple husk
                flat.style = Paint.Style.FILL
                flat.color = Color.argb((aa * 255).roundToInt().coerceIn(0, 255), cr, cg, cb)
                c.drawCircle(sx, sy, rr, flat)
                continue
            }
            // near tier: a collapsed membrane ghost whose outline drifts as the decay advances
            val ph = fresh * 7f + sp
            rayPath.reset()
            for (s in 0..20) {
                val ang = s / 20f * (Math.PI * 2).toFloat()
                val w = 1f + 0.16f * kotlin.math.sin(3f * ang + ph) + 0.10f * kotlin.math.sin(5f * ang - 1.3f * ph)
                val px = sx + kotlin.math.cos(ang) * rr * w
                val py = sy + kotlin.math.sin(ang) * rr * w
                if (s == 0) rayPath.moveTo(px, py) else rayPath.lineTo(px, py)
            }
            rayPath.close()
            flat.style = Paint.Style.FILL
            flat.color = Color.argb((aa * 0.6 * 255).roundToInt().coerceIn(0, 255), cr, cg, cb)
            c.drawPath(rayPath, flat)
            flat.style = Paint.Style.STROKE
            flat.strokeWidth = 1f * dp
            flat.color = Color.argb((aa * 255).roundToInt().coerceIn(0, 255), cr, cg, cb)
            c.drawPath(rayPath, flat)
            flat.style = Paint.Style.FILL // the inner fold — the collapsed contents
            flat.color = Color.argb((aa * 0.7 * 255).roundToInt().coerceIn(0, 255),
                cr * 8 / 10, cg * 8 / 10, cb * 8 / 10)
            c.drawCircle(sx + rr * 0.2f, sy - rr * 0.15f, rr * 0.3f, flat)
        }
        flat.style = Paint.Style.FILL
    }

    private fun vecArgb(a: Float, r: Int, g: Int, b: Int) =
        Color.argb((a * 255f).roundToInt().coerceIn(0, 255), r, g, b)

    /**
     * Drifta above the blur line: crisp membrane, nucleus, vacuole, spines and granules over the
     * blit. Geometry is the bake's, scaled by r/32 (bake half-size), so the handoff does not pop.
     * The granule pattern is fixed — the display list carries no per-organism seed (plan §3).
     */
    private fun vecDot(c: Canvas, sx: Float, sy: Float, r: Float, sp: Int, bk: Int, fade: Float) {
        val s = r / 32f
        val cr = specRGB[sp][bk * 3]
        val cg = specRGB[sp][bk * 3 + 1]
        val cb = specRGB[sp][bk * 3 + 2]
        val outline = specOut[sp][bk]
        vecPaint.style = Paint.Style.STROKE
        vecPaint.strokeWidth = 1.8f * s
        vecPaint.color = vecArgb(0.95f * fade, cr, cg, cb)
        c.drawCircle(sx, sy, 14f * s, vecPaint)
        vecPaint.strokeWidth = 1f * s
        vecPaint.color = vecArgb(0.3f * fade, cr, cg, cb)
        c.drawCircle(sx, sy, 11.5f * s, vecPaint)
        vecPaint.style = Paint.Style.FILL
        vecPaint.color = vecArgb(0.9f * fade, 235, 250, 255)
        c.drawCircle(sx + 4f * s, sy - 2.8f * s, 3.1f * s, vecPaint)
        vecPaint.color = vecArgb(0.5f * fade, cr * 6 / 10, cg * 6 / 10, cb * 6 / 10)
        c.drawCircle(sx - 4.2f * s, sy + 3.5f * s, 2.5f * s, vecPaint)
        vecPaint.color = vecArgb(0.3f * fade, cr, cg, cb)
        for (i in 0 until 8) {
            c.drawCircle(sx + granule[i * 2] * s, sy + granule[i * 2 + 1] * s, 0.9f * s, vecPaint)
        }
        if (outline > 0.02f) {
            vecPaint.style = Paint.Style.STROKE
            vecPaint.strokeWidth = (1f + 1.2f * outline) * s
            vecPaint.color = vecArgb((0.15f + 0.7f * outline) * fade, 235, 246, 255)
            val s0 = 14.5f * s
            val s1 = (16f + 3.5f * outline) * s
            for (i in 0 until 10) {
                val a = i / 10.0 * 2.0 * Math.PI
                c.drawLine(
                    sx + (cos(a) * s0).toFloat(), sy + (sin(a) * s0).toFloat(),
                    sx + (cos(a) * s1).toFloat(), sy + (sin(a) * s1).toFloat(), vecPaint,
                )
            }
        }
        vecPaint.style = Paint.Style.FILL
    }

    /**
     * Cilio above the blur line, drawn at the origin of the already-rotated canvas: crisp
     * teardrop, fringe, groove, food vacuoles and a pale macronucleus (bright, because the
     * overlay composites with SCREEN — dark ink would vanish).
     */
    private fun vecTri(c: Canvas, r: Float, sp: Int, bk: Int, fade: Float) {
        val s = r / 32f
        val cr = specRGB[sp][bk * 3]
        val cg = specRGB[sp][bk * 3 + 1]
        val cb = specRGB[sp][bk * 3 + 2]
        val round = specRound[sp][bk]
        val nose = (15f - 3.5f * round) * s
        vecPath.reset()
        vecPath.moveTo(nose, 0f)
        vecPath.cubicTo(nose * 0.55f, 8.6f * s, -11.7f * s, 8.2f * s, -12.4f * s, 0f)
        vecPath.cubicTo(-11.7f * s, -8.2f * s, nose * 0.55f, -8.6f * s, nose, 0f)
        vecPath.close()
        vecPaint.style = Paint.Style.STROKE
        vecPaint.strokeJoin = Paint.Join.ROUND
        vecPaint.strokeWidth = (1.8f + round * 2.5f) * s
        vecPaint.color = vecArgb(0.95f * fade, cr, cg, cb)
        c.drawPath(vecPath, vecPaint)
        // fainter than the bake's fringe: overlay and blit add under SCREEN, and at this size
        // the doubled strokes read sun-white instead of the species colour (first photograph)
        vecPaint.strokeWidth = 1f * s
        vecPaint.color = vecArgb(0.4f * fade, cr, cg, cb)
        for (i in 0 until 26) {
            val a = i / 26.0 * 2.0 * Math.PI
            c.drawLine(
                (cos(a) * 12.5 * s).toFloat(), (sin(a) * 8.3 * s).toFloat(),
                (cos(a) * 15.5 * s).toFloat(), (sin(a) * 11.2 * s).toFloat(), vecPaint,
            )
        }
        vecPaint.strokeWidth = 1.2f * s
        vecPaint.color = vecArgb(0.7f * fade, 245, 235, 255)
        vecPath.reset()
        vecPath.moveTo(nose * 0.95f, 0f)
        vecPath.quadTo(6f * s, 3.4f * s, 1f * s, 1.5f * s)
        c.drawPath(vecPath, vecPaint)
        vecPaint.style = Paint.Style.FILL
        vecPaint.color = vecArgb(0.55f * fade, 225, 240, 250)
        venOval.set(-4.5f * s, -1.3f * s, 3.5f * s, 1.7f * s)
        c.save(); c.rotate(24f)
        c.drawOval(venOval, vecPaint)
        c.restore()
        vecPaint.color = vecArgb(0.7f * fade, Sprites.MEAL[0], Sprites.MEAL[1], Sprites.MEAL[2])
        c.drawCircle(-3f * s, -2.2f * s, 2.2f * s, vecPaint)
        c.drawCircle(-6.2f * s, 2.4f * s, 1.7f * s, vecPaint)
    }

    /**
     * GR.3: the carpet's tissue. Below CELLS_AT the mat is the upscaled field alone; above it,
     * viewport-culled cells fade in, coloured by the core's own field pixels (ramp AND light-locus
     * turn included — Layers.carpetColor). Layout is a hash of the grid point — no PRNG, no state,
     * no draws — and the margin thins into scattered single cells as the field weakens.
     */
    private fun paintCarpetCells(c: Canvas, cam: Camera, vw: Float, vh: Float) {
        cellsDrawn = 0
        val cssZ = cam.z / density
        if (cssZ < CELLS_AT) return
        val fade = min(1.0, (cssZ - CELLS_AT) / 0.6).toFloat()
        // the seam ring is subpixel until the cells are big; below this zoom it is only cost
        val seams = cssZ >= 3.0
        cellSeam.strokeWidth = 1f * dp
        val z = cam.z.toFloat()
        val colors = layers.carpetColor
        val halfW = vw / (2f * z) + CELL_STEP.toFloat()
        val halfH = vh / (2f * z) + CELL_STEP.toFloat()
        val ix0 = floor((cam.x - halfW) / CELL_STEP).toInt()
        val ix1 = ceil((cam.x + halfW) / CELL_STEP).toInt()
        val iy0 = floor((cam.y - halfH) / CELL_STEP).toInt()
        val iy1 = ceil((cam.y + halfH) / CELL_STEP).toInt()
        val camX = cam.x.toFloat()
        val camY = cam.y.toFloat()
        val step = CELL_STEP.toFloat()
        for (iy in iy0..iy1) {
            val fy = (((iy % 128) + 128) % 128) shr 1
            for (ix in ix0..ix1) {
                val fx = (((ix % 128) + 128) % 128) shr 1
                val col = colors[(fy shl 6) or fx]
                val aByte = col ushr 24
                if (aByte < 64) continue // no mat in this field cell
                val q = ((aByte - 70) / 150f).coerceIn(0f, 1f)
                val h1 = hash01(ix, iy, 1)
                val h2 = hash01(ix, iy, 2)
                val h3 = hash01(ix, iy, 3)
                if (q < 0.25f && h3 > 0.3f + q * 2f) continue // the margin thins to single cells
                val sx = vw / 2f + (ix * step + h1 * step - camX) * z
                val sy = vh / 2f + (iy * step + h2 * step - camY) * z
                val rad = (2.6f + q * 3.2f) * (0.85f + h3 * 0.35f) * z
                val r8 = (col shr 16) and 0xFF
                val g8 = (col shr 8) and 0xFF
                val b8 = col and 0xFF
                cellFill.color = vecArgb(fade * (0.6f + 0.35f * q), r8, g8, b8)
                c.drawCircle(sx, sy, rad, cellFill)
                if (seams) {
                    cellSeam.color = vecArgb(fade * 0.5f, r8 * 35 / 100, g8 * 35 / 100, b8 * 35 / 100)
                    c.drawCircle(sx, sy, rad, cellSeam)
                }
                if (h1 < 0.14f) { // a nucleus point, here and there
                    cellDot.color = vecArgb(fade * 0.6f, 235, 255, 244)
                    c.drawCircle(sx + (h2 - 0.5f) * rad, sy + (h3 - 0.5f) * rad, 1.1f * dp, cellDot)
                }
                cellsDrawn++
            }
        }
    }

    /** Deterministic layout without a PRNG: the same grid point hashes the same every frame. */
    private fun hash01(ix: Int, iy: Int, salt: Int): Float {
        var h = ix * 73856093 xor iy * 19349663 xor salt * 83492791
        h = h xor (h shr 13)
        h *= -0x61c88647
        h = h xor (h ushr 16)
        return (h ushr 8) * (1f / (1 shl 24))
    }

    /**
     * Venator as Didinium nasutum (GR.1, docs/organism-graphics-plan.md; model research in
     * docs/organism-graphics-research.md §10): stretched barrel ~2:1, rod-palisade proboscis,
     * two pectinelle girdles, band macronucleus. Paths, never a blit — the population is small
     * by nature. Same display-list inputs the Ghost Ray read; the strike flag reads as a
     * proboscis-forward lunge. Detail gates on the screen radius in CSS px (probe start values,
     * to be tuned on the owner's device).
     */
    private fun didinium(c: Canvas, sx: Float, sy: Float, hd: Float, r: Float, striking: Boolean) {
        val st = if (striking) 1.18f else 1.0f
        val len = r * 1.4f
        val wid = r * 0.72f
        c.save()
        c.translate(sx, sy)
        c.rotate(Math.toDegrees(hd.toDouble()).toFloat())
        // body — a real body, not a ghost: dark translucent interior, glacier membrane
        venOval.set(-len, -wid, len, wid)
        flat.style = Paint.Style.FILL
        flat.color = Color.argb(128, 90, 120, 142)
        c.drawOval(venOval, flat)
        flat.style = Paint.Style.STROKE
        flat.strokeWidth = 1.7f * dp
        flat.color = Color.argb(242, 168, 214, 244)
        c.drawOval(venOval, flat)
        // the proboscis: the seizing organ, brighter than anything behind it
        val px = len * 0.92f
        val pl = r * 0.55f * st
        rayPath.reset()
        rayPath.moveTo(px, -wid * 0.34f)
        rayPath.quadTo(px + pl * 1.15f, 0f, px, wid * 0.34f)
        rayPath.close()
        flat.style = Paint.Style.FILL
        flat.color = Color.argb(115, 203, 230, 248)
        c.drawPath(rayPath, flat)
        flat.style = Paint.Style.STROKE
        flat.strokeWidth = 1.5f * dp
        flat.color = Color.argb(242, 235, 248, 255)
        c.drawPath(rayPath, flat)
        if (r >= 12f * dp) {
            // the two pectinelle girdles — the fast-swim rings, fringe densest at the rim
            for (f in girdleFrac) {
                val gx = len * f
                val yh = wid * sqrt((1f - f * f).coerceAtLeast(0f))
                flat.strokeWidth = 1f * dp
                flat.color = Color.argb(102, 168, 214, 244)
                venOval.set(gx - r * 0.13f, -yh, gx + r * 0.13f, yh)
                c.drawOval(venOval, flat)
                flat.strokeWidth = 1.3f * dp
                flat.color = Color.argb(217, 225, 242, 252)
                for (s in -4..4) {
                    if (s == 0) continue
                    val yy = yh * (s / 4.6f)
                    val out = (if (abs(s) > 2) 1f else 0.6f) * r * 0.34f
                    val ny = if (yy >= 0f) 1f else -1f
                    c.drawLine(gx + r * 0.05f, yy, gx + r * 0.09f, yy + ny * out, flat)
                }
            }
        }
        if (r >= 32f * dp) {
            // organelle tier: nematodesmata rods, band macronucleus, toxicysts at the snout.
            // Toxicyst positions are a fixed pattern — the display list carries no per-organism
            // seed (organism-graphics-plan.md §3, per-individual variation is a grammar change).
            flat.strokeWidth = 1f * dp
            flat.color = Color.argb(89, 168, 214, 244)
            for (i in -2..2) {
                c.drawLine(px - r * 0.15f, i * wid * 0.12f, px + pl * 0.85f, i * wid * 0.05f, flat)
            }
            flat.strokeWidth = 3f * dp
            flat.color = Color.argb(204, 225, 240, 250)
            venOval.set(-len * 0.1f - r * 0.42f, -r * 0.42f, -len * 0.1f + r * 0.42f, r * 0.42f)
            c.drawArc(venOval, 135f, 207f, false, flat)
            flat.style = Paint.Style.FILL
            flat.color = Color.argb(204, 212, 235, 250)
            c.drawCircle(px + pl * 0.55f, -wid * 0.10f, 1.1f * dp, flat)
            c.drawCircle(px + pl * 0.75f, wid * 0.06f, 1.1f * dp, flat)
            c.drawCircle(px + pl * 0.92f, -wid * 0.02f, 1.1f * dp, flat)
        }
        if (striking) {
            flat.style = Paint.Style.STROKE
            flat.strokeWidth = 2f * dp
            flat.color = Color.argb(89, 212, 236, 255)
            c.drawLine(-r * 3.2f, 0f, -len, 0f, flat)
        }
        c.restore()
        flat.style = Paint.Style.FILL
    }
}

/** Where the player is looking. Written by the gesture handlers, read by the render thread. */
class Camera {
    @Volatile var x: Double = 512.0
    @Volatile var y: Double = 512.0
    @Volatile var z: Double = 1.0
}
