package org.microcosm.app

import android.view.View
import android.view.ViewGroup
import android.widget.TextView

/**
 * The layout gate: does the chrome fit, and can it be touched?
 *
 * Why this exists, in one sentence from docs/app-ux-review.md §6 — the nine-button bottom bar
 * overflowed a 408 dp phone and shipped through nine green CI runs, because every gate in this
 * project is about the world and none was about the screen.
 *
 * It checks four things, and each corresponds to a defect actually seen on the owner's phone:
 *
 *   SQUEEZED  a control laid out narrower than it asked to be. This is the whole bottom-bar
 *             defect: LinearLayout hands each later child whatever width is left, so "observe"
 *             broke across three lines and the four controls after it were laid out at zero.
 *   CLIPPED   a control laid out partly or wholly outside the viewport — present in the tree,
 *             absent from the screen.
 *   TINY      a touch target under 48 dp. Material asks 48; WCAG 2.2 SC 2.5.8 (AA) asks 24 CSS px
 *            or spacing, so this takes the larger, stricter number deliberately.
 *   OVERLAP   two interactive controls sharing screen area, where a tap is ambiguous.
 *
 * What it cannot do: say whether the result looks right, reads well, or falls under a thumb. It
 * runs without a screen, which is the only way CI can run it at all, and Robolectric's text
 * metrics are its own rather than the device's — so a violation here is real, and the absence of
 * one is not proof of beauty. It is the floor, not the ceiling.
 */
object LayoutGate {

    const val MIN_TARGET_DP = 48

    /** A device to measure against: logical size in dp, and the density that turns it into pixels. */
    data class Profile(val name: String, val wDp: Int, val hDp: Int, val density: Float) {
        val wPx get() = (wDp * density).toInt()
        val hPx get() = (hDp * density).toInt()
    }

    /**
     * The profiles the chrome must survive. The Fairphone 5 is the owner's phone, measured:
     * 1224 x 2700 px at density 3. The others bracket it.
     */
    val PROFILES = listOf(
        Profile("small phone   320x568 @2", 320, 568, 2f),
        Profile("Fairphone 5   408x900 @3", 408, 900, 3f),
        Profile("large phone   411x891 @2.625", 411, 891, 2.625f),
        Profile("tablet        800x1280 @2", 800, 1280, 2f),
    )

    /** One thing wrong, in one place, on one device. `key` is stable; `detail` carries the numbers. */
    data class Violation(val kind: String, val subject: String, val profile: String, val detail: String) {
        /** What the baseline stores. Deliberately free of pixel counts, which move with the toolkit. */
        val key get() = "$kind $subject @ $profile"
        override fun toString() = "$key  ($detail)"
    }

    /** Interactive means "a tap does something": those are the views a player must be able to hit. */
    private fun interactive(v: View) = v.isClickable || v.isLongClickable

    private fun label(v: View) = (v as? TextView)?.text?.toString()?.ifBlank { null } ?: v.javaClass.simpleName

    /**
     * Measure [root] as if it were laid out across [p]'s width, then report every violation.
     * Rows are given the width they would really get and as much height as they ask for, which is
     * how the shell's own bars are laid out.
     */
    fun check(what: String, root: View, p: Profile): List<Violation> {
        val minPx = MIN_TARGET_DP * p.density

        // What each control would like to be, before the parent divides the space up.
        val wanted = HashMap<View, Int>()
        walk(root) { v ->
            if (interactive(v)) {
                v.measure(
                    View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
                    View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
                )
                wanted[v] = v.measuredWidth
            }
        }

        root.measure(
            View.MeasureSpec.makeMeasureSpec(p.wPx, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(p.hPx, View.MeasureSpec.AT_MOST),
        )
        root.layout(0, 0, p.wPx, root.measuredHeight)

        val out = ArrayList<Violation>()
        val boxes = ArrayList<Pair<View, IntArray>>()
        walk(root) { v ->
            if (!interactive(v) || v.visibility == View.GONE) return@walk
            val b = absolute(v, root)
            boxes.add(v to b)
            val name = "$what/${label(v)}"
            fun say(kind: String, subject: String, detail: String) =
                out.add(Violation(kind, subject, p.name, detail))

            val want = wanted[v] ?: 0
            if (want > 0 && v.width < want) say("SQUEEZED", name, "${v.width}px laid out, ${want}px wanted")
            if (b[0] < 0 || b[2] > p.wPx) say("CLIPPED", name, "x ${b[0]}..${b[2]} outside 0..${p.wPx}")
            if (v.width < minPx || v.height < minPx)
                say("TINY", name, "${px(v.width, p)}x${px(v.height, p)}dp under ${MIN_TARGET_DP}dp")
        }
        for (i in boxes.indices) for (j in i + 1 until boxes.size) {
            val (a, ab) = boxes[i]
            val (c, cb) = boxes[j]
            if (ab[0] < cb[2] && cb[0] < ab[2] && ab[1] < cb[3] && cb[1] < ab[3])
                out.add(Violation("OVERLAP", "$what/${label(a)} over ${label(c)}", p.name,
                    "${ab.joinToString(",")} vs ${cb.joinToString(",")}"))
        }
        return out
    }

    private fun px(v: Int, p: Profile) = (v / p.density).toInt()

    private fun absolute(v: View, root: View): IntArray {
        var x = 0
        var y = 0
        var cur: View? = v
        while (cur != null && cur !== root) {
            x += cur.left
            y += cur.top
            cur = cur.parent as? View
        }
        return intArrayOf(x, y, x + v.width, y + v.height)
    }

    private fun walk(v: View, f: (View) -> Unit) {
        f(v)
        if (v is ViewGroup) for (i in 0 until v.childCount) walk(v.getChildAt(i), f)
    }
}
