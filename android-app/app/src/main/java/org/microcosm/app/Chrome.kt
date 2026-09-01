package org.microcosm.app

import android.content.Context
import android.widget.Button
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
 * These lists are an inventory, not an endorsement. `BAR` is nine controls wide and does not fit a
 * 408 dp phone; the gate records that against a baseline rather than hiding it.
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

    /** The k-th button of a row built by [row]. */
    fun at(row: LinearLayout, labels: List<String>, label: String): Button =
        row.getChildAt(labels.indexOf(label)) as Button
}
