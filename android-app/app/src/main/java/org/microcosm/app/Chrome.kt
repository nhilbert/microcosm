package org.microcosm.app

import android.content.Context
import android.view.View
import android.widget.Button
import android.widget.HorizontalScrollView
import android.widget.LinearLayout

/**
 * The shell's control rows, as data and one builder.
 *
 * This exists so the layout gate measures *what ships*. A test that declared its own row of
 * buttons would be a second definition of the UI, and would have agreed with a broken app — which
 * is the failure mode this whole file is here to prevent (docs/app-ux-review.md §6: the nine-button
 * overflow shipped through nine green CI runs, because every gate in this project is about the
 * world and none was about the screen).
 *
 * So the labels live here, `MainActivity` builds its rows from them, and
 * `ChromeLayoutTest` measures the very same rows at several device sizes.
 *
 * These lists are an inventory, not an endorsement. `BAR` is nine controls wide — at the 48 dp
 * touch minimum that is 432 dp, more than a 408 dp phone HAS, so an overflow strategy is a matter
 * of arithmetic, not taste. U0.1's answer (docs/app-ux-review.md §5) is the cheapest honest one:
 * the wide rows scroll sideways instead of squeezing their tail to nothing. `SCROLLS` records
 * which rows ship that way, [build] is the one place the choice is made, and the gate measures
 * the same construct through the same call.
 */
object Chrome {

    /** Speed, then everything the shell hangs off the bottom bar. */
    val BAR = listOf("pause", "1x", "4x", "16x", "mode", "save", "exp", "data", "bench")

    /** Intervene's own row. `feed` and `kill` show only while something is selected. */
    val TOOLS = listOf("feed", "kill", "seed", "wall")

    /** Shown while a sun is gripped. */
    val SUN = listOf("dimmer", "brighter", "release")

    /** Data mode's pages, in order. */
    val PAGES = listOf("pops", "chem", "metab", "health", "events")

    const val TEXT_SP = 11f

    fun button(ctx: Context, label: String, onTap: () -> Unit = {}): Button = Button(ctx).apply {
        text = label
        textSize = TEXT_SP
        setOnClickListener { onTap() }
    }

    /** One horizontal row of buttons. `onTap` receives the index into `labels`. */
    fun row(ctx: Context, labels: List<String>, onTap: (Int) -> Unit = {}): LinearLayout {
        val row = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
        for ((k, label) in labels.withIndex()) row.addView(button(ctx, label) { onTap(k) })
        return row
    }

    /**
     * A row that scrolls sideways instead of squeezing. Inside a scroll container every button is
     * laid out at the width it asked for, so nothing is squeezed to zero and nothing is clipped —
     * a control past the right edge is a swipe away rather than gone. What this does NOT buy:
     * the player has to know to swipe, and nothing in a bare scroll view says so. That is the
     * redesign's problem; this repair's job is that every shipped feature can be reached at all.
     */
    fun scrollRow(ctx: Context, labels: List<String>, onTap: (Int) -> Unit = {}): HorizontalScrollView =
        HorizontalScrollView(ctx).apply {
            isHorizontalScrollBarEnabled = false
            addView(row(ctx, labels, onTap))
        }

    /** The rows wide enough to need the scroll treatment. SUN is three buttons and fits. */
    val SCROLLS = setOf("bar", "tools", "pages")

    /** Row names to their label lists — the inventory [build] and the gate walk together. */
    val ROWS = mapOf("bar" to BAR, "tools" to TOOLS, "sun" to SUN, "pages" to PAGES)

    /**
     * The one place a row's shipped construct is decided. `MainActivity` builds through this and
     * so does the layout gate — a second decision point would let the app and the measurement
     * drift apart, which is the failure this file exists to prevent.
     */
    fun build(ctx: Context, name: String, onTap: (Int) -> Unit = {}): View {
        val labels = ROWS.getValue(name)
        return if (name in SCROLLS) scrollRow(ctx, labels, onTap) else row(ctx, labels, onTap)
    }

    /** The button row inside a construct built by [row], [scrollRow] or [build]. */
    fun rowOf(v: View): LinearLayout =
        if (v is HorizontalScrollView) v.getChildAt(0) as LinearLayout else v as LinearLayout

    /** The named button of a construct built by [row], [scrollRow] or [build]. */
    fun at(container: View, labels: List<String>, label: String): Button =
        rowOf(container).getChildAt(labels.indexOf(label)) as Button
}
