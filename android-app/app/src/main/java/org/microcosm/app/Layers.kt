package org.microcosm.app

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.RadialGradient
import android.graphics.Shader
import java.nio.ByteBuffer
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * The world's layers: four per-cell pixel fields and three world-tile paintings.
 *
 * The core decides every value (frame.rs); this turns them into bitmaps. The fields refresh once
 * per tick, the tiles only when a source or a wall moves — the same split the browser makes.
 */
class Layers {
    companion object {
        const val GRID = 64
        const val TILE = 512
        /**
         * The per-cell fields are upscaled 16x to the world tile, and on the device they came back
         * as hard squares where the browser smooths them — setting `isFilterBitmap` on the Paint
         * did not change it. Rather than guess again at why the hardware canvas will not filter, the
         * fields are prescaled 4x here on a software canvas, where filtering is not in doubt. Costs
         * ~262k filtered pixels per tick, and it settles the question either way: if the next device
         * screenshot is smooth, the hardware path was the problem; if the blocks are unchanged, they
         * were never the carpet and the search moves elsewhere.
         */
        const val UP = 4
        const val FIELD = GRID * UP
    }

    // per-cell fields, prescaled from the core's RGBA buffers
    val carpet: Bitmap = Bitmap.createBitmap(FIELD, FIELD, Bitmap.Config.ARGB_8888)
    val mineral: Bitmap = Bitmap.createBitmap(FIELD, FIELD, Bitmap.Config.ARGB_8888)
    val pall: Bitmap = Bitmap.createBitmap(FIELD, FIELD, Bitmap.Config.ARGB_8888)
    val shade: Bitmap = Bitmap.createBitmap(FIELD, FIELD, Bitmap.Config.ARGB_8888)
    private val cell: Bitmap = Bitmap.createBitmap(GRID, GRID, Bitmap.Config.ARGB_8888)
    // The upscale samples the cell grid through a REPEAT shader: the world is a torus, so the
    // filter must read the wrapped neighbour at the edges — a plain scaled drawBitmap clamps
    // there, and that flat edge column became half of the visible world-boundary seam.
    private val upPaint = Paint(Paint.FILTER_BITMAP_FLAG).apply {
        isFilterBitmap = true
        shader = android.graphics.BitmapShader(
            cell,
            android.graphics.Shader.TileMode.REPEAT,
            android.graphics.Shader.TileMode.REPEAT,
        ).apply {
            setLocalMatrix(android.graphics.Matrix().apply { setScale(UP.toFloat(), UP.toFloat()) })
        }
    }
    private val upDst = android.graphics.RectF(0f, 0f, FIELD.toFloat(), FIELD.toFloat())

    // world-tile paintings
    val light: Bitmap = Bitmap.createBitmap(TILE, TILE, Bitmap.Config.ARGB_8888)
    val heat: Bitmap = Bitmap.createBitmap(TILE, TILE, Bitmap.Config.ARGB_8888)
    val walls: Bitmap = Bitmap.createBitmap(TILE, TILE, Bitmap.Config.ARGB_8888)

    /** Whether the world has any wall at all — cached, because asking the core costs a Vec. */
    var hasWalls = false
        private set

    /** Whether the heat layer holds anything — a heatless world skips a full-screen fill. */
    var hasHeat = false
        private set

    private val px = IntArray(GRID * GRID)
    /**
     * The carpet field's straight ARGB per cell, kept for the near-zoom cell painter (GR.3).
     * The field already carries the mat's colour ramp AND the light-locus genotype turn (the
     * recorded grammar exception), so the cells take their colour from the core's own pixels
     * instead of a second ramp that could drift.
     */
    val carpetColor = IntArray(GRID * GRID)
    // The core's scratch field lives at a fixed address, so this is wrapped once, not per frame.
    private val fieldBuf: ByteBuffer = Native.fieldBuffer()
    private var fieldTick = -1L

    /**
     * The core writes straight (non-premultiplied) RGBA, matching the browser's ImageData; Android
     * bitmaps are premultiplied, and `setPixels` takes non-premultiplied Color ints and does the
     * conversion. So the bytes are repacked here rather than blitted — 4,096 pixels a field.
     */
    private fun blit(which: Int, into: Bitmap) {
        Native.fieldFill(which)
        for (i in px.indices) {
            val o = i * 4
            px[i] = ((fieldBuf.get(o + 3).toInt() and 0xFF) shl 24) or
                ((fieldBuf.get(o).toInt() and 0xFF) shl 16) or
                ((fieldBuf.get(o + 1).toInt() and 0xFF) shl 8) or
                (fieldBuf.get(o + 2).toInt() and 0xFF)
        }
        // The light field re-inks the fields here, once per tick, rather than at every read:
        // the same hue faded onto the lamp instead of glowing over black water. The carpet's
        // near-zoom cells copy the result, so the two can never drift apart.
        if (Optics.lightField) {
            for (i in px.indices) {
                val a = px[i] and -0x1000000
                if (a == 0) continue
                px[i] = a or (Optics.washRGB((px[i] shr 16) and 0xFF, (px[i] shr 8) and 0xFF,
                    px[i] and 0xFF) and 0xFFFFFF)
            }
        }
        if (which == 0) px.copyInto(carpetColor)
        cell.setPixels(px, 0, GRID, 0, 0, GRID, GRID)
        val g = Canvas(into)
        g.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
        g.drawRect(upDst, upPaint)
    }

    /** Drop the cached tick so the next frame repacks the fields — the optic changed under us. */
    fun invalidate() {
        fieldTick = -1L
    }

    /** Force a refresh and report the nanoseconds it took — the benchmark's `fields` row. */
    fun timeRefresh(tick: Long): Long {
        fieldTick = -1L
        val t = System.nanoTime()
        refreshFields(tick)
        return System.nanoTime() - t
    }

    /** Once per tick, like the browser's `updateCarpet`. */
    fun refreshFields(tick: Long) {
        if (tick == fieldTick) return
        fieldTick = tick
        blit(0, carpet)
        blit(1, mineral)
        blit(2, pall)
        blit(3, shade)
    }

    /** Redraw the three tile paintings. The browser does this only when `lightDirty` is set. */
    fun refreshTiles() {
        drawLight()
        drawHeat()
        drawWalls()
    }

    private fun argb(a: Double, r: Int, g: Int, b: Int) =
        Color.argb((a * 255.0).roundToInt().coerceIn(0, 255), r, g, b)

    private fun drawLight() {
        val g = Canvas(light)
        // Dark field: the layer IS the black water, and a source adds its glow to it. Light
        // field: the layer is the lamp, so it starts a shade under the bare ground and a source
        // adds warm white back — the same geometry, read as illumination instead of as glow.
        g.drawColor(if (Optics.lightField) Optics.LAMP_DIM else Renderer.ABYSS, PorterDuff.Mode.SRC)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        // one glow per source per wrapped offset, adding like the field they depict
        for (k in 0 until Native.glowCount(0)) {
            val x = Native.glowNum(0, k, 0).toFloat()
            val y = Native.glowNum(0, k, 1).toFloat()
            val r = Native.glowNum(0, k, 2).toFloat()
            if (r <= 0f) continue // a source with no spread has no glow to paint
            val a = Native.glowNum(0, k, 3)
            val c0 = if (Optics.lightField) intArrayOf(255, 250, 232) else intArrayOf(214, 238, 255)
            val c1 = if (Optics.lightField) intArrayOf(255, 244, 214) else intArrayOf(140, 190, 225)
            p.shader = RadialGradient(
                x, y, r,
                intArrayOf(argb(0.30 * a, c0[0], c0[1], c0[2]), argb(0.30 * a, c0[0], c0[1], c0[2]),
                    argb(0.12 * a, c1[0], c1[1], c1[2]), argb(0.0, c1[0], c1[1], c1[2])),
                floatArrayOf(0f, minOf(0.3f, 4f / r), 0.4f, 1f),
                Shader.TileMode.CLAMP,
            )
            // ADD, so overlapping glows sum: the Canvas 2D layer composites with "lighter"
            p.xfermode = android.graphics.PorterDuffXfermode(PorterDuff.Mode.ADD)
            g.drawRect(0f, 0f, TILE.toFloat(), TILE.toFloat(), p)
        }
        p.xfermode = null
        p.shader = null
        p.color = Optics.ink(0.9f, 240, 250, 255)
        for (k in 0 until Native.glowCount(2))
            g.drawCircle(Native.glowNum(2, k, 0).toFloat(), Native.glowNum(2, k, 1).toFloat(), 5f, p)
    }

    private fun drawHeat() {
        val g = Canvas(heat)
        g.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
        hasHeat = Native.glowCount(1) > 0 || Native.glowCount(3) > 0
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        // warmth as an ember glow, cold as a blue one — never amber, which is the hand's colour
        for (k in 0 until Native.glowCount(1)) {
            val x = Native.glowNum(1, k, 0).toFloat()
            val y = Native.glowNum(1, k, 1).toFloat()
            val r = Native.glowNum(1, k, 2).toFloat()
            if (r <= 0f) continue
            val m = Native.glowNum(1, k, 3)
            val warm = Native.glowNum(1, k, 4) != 0.0
            val c0 = if (warm) intArrayOf(255, 120, 60) else intArrayOf(110, 170, 255)
            val c1 = if (warm) intArrayOf(200, 70, 40) else intArrayOf(80, 120, 220)
            p.shader = RadialGradient(
                x, y, r,
                intArrayOf(Optics.wash(0.38f * m.toFloat(), c0[0], c0[1], c0[2]),
                    Optics.wash(0.38f * m.toFloat(), c0[0], c0[1], c0[2]),
                    Optics.wash(0.16f * m.toFloat(), c1[0], c1[1], c1[2]),
                    argb(0.0, c1[0], c1[1], c1[2])),
                floatArrayOf(0f, minOf(0.3f, 2f / r), 0.45f, 1f),
                Shader.TileMode.CLAMP,
            )
            g.drawRect(0f, 0f, TILE.toFloat(), TILE.toFloat(), p)
        }
        p.shader = null
        for (k in 0 until Native.glowCount(3)) {
            val warm = Native.glowNum(3, k, 4) != 0.0
            p.color = if (warm) Optics.wash(0.9f, 255, 160, 110) else Optics.wash(0.9f, 170, 210, 255)
            g.drawCircle(Native.glowNum(3, k, 0).toFloat(), Native.glowNum(3, k, 1).toFloat(), 4f, p)
        }
    }

    private fun drawWalls() {
        val g = Canvas(walls)
        g.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
        }
        val dash = DashPathEffect(floatArrayOf(5f, 4f), 0f)
        val walls = Native.wallCount()
        hasWalls = walls > 0
        for (k in 0 until walls) {
            val a = Native.wallNum(k, 0)
            val dashed = Native.wallNum(k, 1) != 0.0
            val pts = Native.wallNum(k, 2).toInt()
            if (pts < 2) continue
            val path = Path()
            for (q in 0 until pts) {
                val x = Native.wallPt(k, q, 0).toFloat()
                val y = Native.wallPt(k, q, 1).toFloat()
                if (q == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            p.pathEffect = if (dashed) dash else null
            // a wall that crosses the tile edge has to continue on the far side
            for (ox in -TILE..TILE step TILE) for (oy in -TILE..TILE step TILE) {
                g.save(); g.translate(ox.toFloat(), oy.toFloat())
                // The backing is the ground's own colour, so the wall reads as a solid edge
                // against whatever it crosses; the line above it is the contrast ink.
                p.color = if (Optics.lightField) argb(0.8 * a, 252, 250, 244) else argb(0.8 * a, 11, 19, 30)
                p.strokeWidth = 4.4f; g.drawPath(path, p)
                p.color = Optics.ink(a.toFloat(), 148, 167, 184); p.strokeWidth = 2.2f; g.drawPath(path, p)
                g.restore()
            }
        }
    }

    /** True when a source or a wall has moved since the last redraw. */
    fun tilesDirty(): Boolean {
        if (Native.scalar(12) == 0.0) return false
        Native.setScalar(12, 0.0)
        return true
    }

    /** Any warm or cold source at all? The heat layer is transparent without one. */
    fun anyHeat(): Boolean {
        for (k in 0 until Native.sourceCount()) if (abs(Native.sourceNum(k, 3)) > 0.0) return true
        return false
    }
}
