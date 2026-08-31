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
    }

    // per-cell fields, straight from the core's RGBA buffers
    val carpet: Bitmap = Bitmap.createBitmap(GRID, GRID, Bitmap.Config.ARGB_8888)
    val mineral: Bitmap = Bitmap.createBitmap(GRID, GRID, Bitmap.Config.ARGB_8888)
    val pall: Bitmap = Bitmap.createBitmap(GRID, GRID, Bitmap.Config.ARGB_8888)
    val shade: Bitmap = Bitmap.createBitmap(GRID, GRID, Bitmap.Config.ARGB_8888)

    // world-tile paintings
    val light: Bitmap = Bitmap.createBitmap(TILE, TILE, Bitmap.Config.ARGB_8888)
    val heat: Bitmap = Bitmap.createBitmap(TILE, TILE, Bitmap.Config.ARGB_8888)
    val walls: Bitmap = Bitmap.createBitmap(TILE, TILE, Bitmap.Config.ARGB_8888)

    /** Whether the world has any wall at all — cached, because asking the core costs a Vec. */
    var hasWalls = false
        private set

    private val px = IntArray(GRID * GRID)
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
        into.setPixels(px, 0, GRID, 0, 0, GRID, GRID)
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
        g.drawColor(Renderer.ABYSS, PorterDuff.Mode.SRC)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        // one glow per source per wrapped offset, adding like the field they depict
        for (k in 0 until Native.glowCount(0)) {
            val x = Native.glowNum(0, k, 0).toFloat()
            val y = Native.glowNum(0, k, 1).toFloat()
            val r = Native.glowNum(0, k, 2).toFloat()
            if (r <= 0f) continue // a source with no spread has no glow to paint
            val a = Native.glowNum(0, k, 3)
            p.shader = RadialGradient(
                x, y, r,
                intArrayOf(argb(0.30 * a, 214, 238, 255), argb(0.30 * a, 214, 238, 255),
                    argb(0.12 * a, 140, 190, 225), argb(0.0, 140, 190, 225)),
                floatArrayOf(0f, minOf(0.3f, 4f / r), 0.4f, 1f),
                Shader.TileMode.CLAMP,
            )
            // ADD, so overlapping glows sum: the Canvas 2D layer composites with "lighter"
            p.xfermode = android.graphics.PorterDuffXfermode(PorterDuff.Mode.ADD)
            g.drawRect(0f, 0f, TILE.toFloat(), TILE.toFloat(), p)
        }
        p.xfermode = null
        p.shader = null
        p.color = argb(0.9, 240, 250, 255)
        for (k in 0 until Native.glowCount(2))
            g.drawCircle(Native.glowNum(2, k, 0).toFloat(), Native.glowNum(2, k, 1).toFloat(), 5f, p)
    }

    private fun drawHeat() {
        val g = Canvas(heat)
        g.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
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
                intArrayOf(argb(0.38 * m, c0[0], c0[1], c0[2]), argb(0.38 * m, c0[0], c0[1], c0[2]),
                    argb(0.16 * m, c1[0], c1[1], c1[2]), argb(0.0, c1[0], c1[1], c1[2])),
                floatArrayOf(0f, minOf(0.3f, 2f / r), 0.45f, 1f),
                Shader.TileMode.CLAMP,
            )
            g.drawRect(0f, 0f, TILE.toFloat(), TILE.toFloat(), p)
        }
        p.shader = null
        for (k in 0 until Native.glowCount(3)) {
            val warm = Native.glowNum(3, k, 4) != 0.0
            p.color = if (warm) argb(0.9, 255, 160, 110) else argb(0.9, 170, 210, 255)
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
                p.color = argb(0.8 * a, 11, 19, 30); p.strokeWidth = 4.4f; g.drawPath(path, p)
                p.color = argb(a, 148, 167, 184); p.strokeWidth = 2.2f; g.drawPath(path, p)
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
