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
class Renderer {
    companion object {
        val ABYSS: Int = Color.rgb(0x0B, 0x13, 0x1E)
        const val WORLD = 1024.0
    }

    private val layers = Layers()
    private val sprites: Array<Array<Bitmap>>
    private val grammar = Array(7) { sp -> DoubleArray(6) { f -> Native.grammarNum(sp, f) } }
    private val lodZ = Native.frameConst(0)
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
    private val src = Rect(0, 0, Layers.GRID, Layers.GRID)
    private val srcTile = Rect(0, 0, Layers.TILE, Layers.TILE)
    private val dst = RectF()
    private val rayPath = Path()

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

    /**
     * Build the display list and paint it. Returns nanoseconds spent in the core, so the caller can
     * tell a slow frame builder from a slow painter — the whole question A.1 exists to answer.
     */
    fun draw(c: Canvas, cam: Camera, vw: Float, vh: Float, alpha: Double, hidden: Int): Long {
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
        return buildNanos
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
            flat.strokeWidth = 1f
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
        flat.strokeWidth = 1.6f
        flat.color = Color.argb(217, 212, 236, 255)
        rayPath.reset()
        rayPath.moveTo(-back, w); rayPath.lineTo(l, 0f); rayPath.lineTo(-back, -w)
        c.drawPath(rayPath, flat)
        flat.strokeWidth = 1f
        flat.color = Color.argb(51, 150, 200, 235)
        rayPath.reset()
        rayPath.moveTo(-back, w); rayPath.lineTo(-notch, 0f); rayPath.lineTo(-back, -w)
        c.drawPath(rayPath, flat)
        flat.style = Paint.Style.FILL
        flat.color = Color.argb(242, 240, 250, 255)
        c.drawCircle(l, 0f, 1.4f, flat)
        if (striking) {
            flat.style = Paint.Style.STROKE
            flat.strokeWidth = 2f
            flat.color = Color.argb(89, 212, 236, 255)
            c.drawLine(-r * 3.2f, 0f, r * 0.8f, 0f, flat)
        }
        c.restore()
        flat.style = Paint.Style.FILL
    }
}

/** Where the player is looking. Pan and pinch arrive in A.2; A.1 drives it programmatically. */
class Camera(var x: Double = 512.0, var y: Double = 512.0, var z: Double = 1.0)
