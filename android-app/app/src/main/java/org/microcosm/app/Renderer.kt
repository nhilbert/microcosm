package org.microcosm.app

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.graphics.RectF
import kotlin.math.floor
import kotlin.math.roundToInt

/**
 * PAINTING. Every decision behind this frame was already made by the core's frame builder
 * (rust/microcosm-core/src/frame.rs) and is proved equal to the browser's by
 * harness/fingerprint-frame.js. What is left here is strokes: blend modes, blits, paths.
 *
 * Nothing in this file may decide anything — if a number here would change what the player sees
 * about the *world* rather than how it is drawn, it belongs in frame.rs instead.
 */
/**
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
    // The per-cell fields are 64x64 upscaled to the whole world tile, so filtering is what keeps
    // the mat carpet from reading as hard squares. The browser sets imageSmoothingEnabled for the
    // same reason. Set on the instance as well as through the flag, because the flag alone has been
    // unreliable across versions.
    private val plain = Paint(Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG).apply {
        isFilterBitmap = true
        isDither = true
    }
    private val flat = Paint(Paint.ANTI_ALIAS_FLAG)
    private val src = Rect(0, 0, Layers.FIELD, Layers.FIELD)
    private val srcTile = Rect(0, 0, Layers.TILE, Layers.TILE)
    private val dst = RectF()
    private val rayPath = Path()

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
            Array(tN * mN) { i ->
                val tb = i / mN
                val mb = i % mN
                Sprites.make(
                    intArrayOf(
                        Native.specNum(sp, tb, mb, 0).toInt(),
                        Native.specNum(sp, tb, mb, 1).toInt(),
                        Native.specNum(sp, tb, mb, 2).toInt(),
                    ),
                    Native.specNum(sp, tb, mb, 3).toInt(),
                    Native.specNum(sp, tb, mb, 5),
                    Native.specNum(sp, tb, mb, 6),
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
        val hw = vw / 2
        val hh = vh / 2
        val span = (WORLD * cam.z).toFloat()
        val tlx = cam.x - hw / cam.z
        val tly = cam.y - hh / cam.z

        // the torus tiles that touch the viewport
        var ky = floor(tly / WORLD).toInt()
        while (ky * WORLD < tly + vh / cam.z) {
            var kx = floor(tlx / WORLD).toInt()
            while (kx * WORLD < tlx + vw / cam.z) {
                val dx0 = ((kx * WORLD - cam.x) * cam.z).toFloat() + hw
                val dy0 = ((ky * WORLD - cam.y) * cam.z).toFloat() + hh
                dst.set(dx0, dy0, dx0 + span, dy0 + span)
                if (hidden and (1 shl 8) == 0) {
                    c.drawBitmap(layers.light, srcTile, dst, plain)
                    // the wall shade keeps the painted glow honest: it must not claim occluded light
                    if (layers.hasWalls) c.drawBitmap(layers.shade, src, dst, plain)
                }
                if (hidden and (1 shl 9) == 0) c.drawBitmap(layers.heat, srcTile, dst, plain)
                c.drawBitmap(layers.mineral, src, dst, plain)
                if (hidden and 1 == 0) c.drawBitmap(layers.carpet, src, dst, plain)
                if (cam.z < lodZ && hidden and (1 shl 7) == 0) c.drawBitmap(layers.pall, src, dst, plain)
                if (layers.hasWalls) c.drawBitmap(layers.walls, srcTile, dst, plain)
                kx++
            }
            ky++
        }

        paintOrganisms(c)
        paintCorpses(c)
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
                4 -> ghostRay(c, sx, sy, orgBuf.get(b + 6).toFloat(), r, orgBuf.get(b + 7) != 0.0)
                else -> {
                    val set = sprites[sp]
                    val bmp = if (bucket >= 0 && bucket < set.size) set[bucket] else set[0]
                    dst.set(sx - r, sy - r, sx + r, sy + r)
                    if (kind == 3) {
                        c.save()
                        c.translate(sx, sy)
                        c.rotate(Math.toDegrees(orgBuf.get(b + 6)).toFloat())
                        dst.set(-r, -r, r, r)
                        c.drawBitmap(bmp, null, dst, screen)
                        c.restore()
                    } else {
                        c.drawBitmap(bmp, null, dst, screen)
                    }
                }
            }
        }
    }

    private fun paintCorpses(c: Canvas) {
        for (q in 0 until corpseN) {
            val b = q * corpseStride
            val sx = corpseBuf.get(b).toFloat()
            val sy = corpseBuf.get(b + 1).toFloat()
            val r = corpseBuf.get(b + 2).toFloat()
            val a = corpseBuf.get(b + 3)
            flat.style = Paint.Style.FILL
            flat.color = Color.argb((a * 255).roundToInt().coerceIn(0, 255), 158, 168, 178)
            c.drawCircle(sx, sy, r, flat)
            flat.style = Paint.Style.STROKE
            flat.strokeWidth = 1f * dp
            flat.color = Color.argb((a * 0.8 * 255).roundToInt().coerceIn(0, 255), 110, 120, 130)
            c.drawCircle(sx, sy, r * 0.55f, flat)
        }
        flat.style = Paint.Style.FILL
    }

    /** The Ghost Ray (Venator): hollow spearhead, bright leading edge. Paths, never a blit. */
    private fun ghostRay(c: Canvas, sx: Float, sy: Float, hd: Float, r: Float, striking: Boolean) {
        val stretch = if (striking) 1.4f else 1.0f
        val l = r * stretch
        val w = r * 0.95f
        val back = r * 0.75f * stretch
        val notch = r * 0.5f * stretch
        c.save()
        c.translate(sx, sy)
        c.rotate(Math.toDegrees(hd.toDouble()).toFloat())
        rayPath.reset()
        rayPath.moveTo(l, 0f); rayPath.lineTo(-back, w); rayPath.lineTo(-notch, 0f); rayPath.lineTo(-back, -w)
        rayPath.close()
        flat.style = Paint.Style.FILL
        flat.color = Color.argb(26, 150, 200, 235)
        c.drawPath(rayPath, flat)
        flat.style = Paint.Style.STROKE
        flat.strokeWidth = 1.6f * dp
        flat.color = Color.argb(217, 212, 236, 255)
        rayPath.reset()
        rayPath.moveTo(-back, w); rayPath.lineTo(l, 0f); rayPath.lineTo(-back, -w)
        c.drawPath(rayPath, flat)
        flat.strokeWidth = 1f * dp
        flat.color = Color.argb(51, 150, 200, 235)
        rayPath.reset()
        rayPath.moveTo(-back, w); rayPath.lineTo(-notch, 0f); rayPath.lineTo(-back, -w)
        c.drawPath(rayPath, flat)
        flat.style = Paint.Style.FILL
        flat.color = Color.argb(242, 240, 250, 255)
        c.drawCircle(l, 0f, 1.4f * dp, flat)
        if (striking) {
            flat.style = Paint.Style.STROKE
            flat.strokeWidth = 2f * dp
            flat.color = Color.argb(89, 212, 236, 255)
            c.drawLine(-r * 3.2f, 0f, r * 0.8f, 0f, flat)
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
