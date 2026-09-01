package org.microcosm.app

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.view.View
import android.widget.Button
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView

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

    // The bottom BAR retired in U2.1: the sheet carries its controls. The lists below are the
    // sheet's own instruments, still declared here so the gate measures what ships.

    /** The pace instrument's cells, in order. One segmented control, not four buttons. */
    val PACE = listOf("pause", "1×", "4×", "16×")

    /** Intervene's levers, as icon tiles. `feed` and `kill` need a selection. */
    val TOOLS = listOf("feed", "kill", "seed", "wall")
    val TOOL_ICONS = listOf(R.drawable.ic_feed, R.drawable.ic_kill, R.drawable.ic_seed, R.drawable.ic_wall)

    /** Shown while a sun is gripped. */
    val SUN = listOf("dimmer", "brighter", "release")

    /** Data mode's pages, in order. */
    val PAGES = listOf("pops", "chem", "metab", "health", "events")

    /** The sheet's utility row. `bench` is dev-mode only at runtime. */
    val UTILITY = listOf("reset", "save", "data", "bench")

    const val TEXT_SP = 14f

    /**
     * Every button in the shell is born here (U2.S): the quiet voice of the approved canvas —
     * Space Grotesk, slate on a hairline, radius 12, 44 dp minimum — instead of the framework's
     * gray default. Because this is the single birthplace, a taste change is an edit in Style,
     * not a hunt through the shell.
     */
    fun button(ctx: Context, label: String, onTap: () -> Unit = {}): Button = Button(ctx).apply {
        text = label
        textSize = TEXT_SP
        isAllCaps = false
        typeface = Style.word(ctx)
        setTextColor(Style.TEXT)
        background = Style.touchable(ctx, Style.quiet(ctx))
        stateListAnimator = null
        // 48 dp, not the canvas's 44: the layout gate holds Material's number, deliberately
        // stricter than WCAG — and it convicted the first build of this factory at 44.
        minHeight = Style.dp(ctx, 48f)
        minimumHeight = Style.dp(ctx, 48f)
        minWidth = Style.dp(ctx, 48f)
        minimumWidth = Style.dp(ctx, 48f)
        setPadding(Style.dp(ctx, 18f), Style.dp(ctx, 12f), Style.dp(ctx, 18f), Style.dp(ctx, 12f))
        setOnClickListener { onTap() }
    }

    /** One horizontal row of buttons, 8 dp apart. `onTap` receives the index into `labels`. */
    fun row(ctx: Context, labels: List<String>, onTap: (Int) -> Unit = {}): LinearLayout {
        val row = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
        for ((k, label) in labels.withIndex()) {
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            if (k > 0) lp.marginStart = Style.dp(ctx, 8f)
            row.addView(button(ctx, label) { onTap(k) }, lp)
        }
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

    /** The rows wide enough to need the scroll treatment. The rest fit or share width. */
    val SCROLLS = setOf("pages")

    /** Row names to their label lists — the inventory [build] and the gate walk together. */
    val ROWS = mapOf("pace" to PACE, "tools" to TOOLS, "sun" to SUN,
        "pages" to PAGES, "utility" to UTILITY)

    /**
     * The one place a row's shipped construct is decided. `MainActivity` builds through this and
     * so does the layout gate — a second decision point would let the app and the measurement
     * drift apart, which is the failure this file exists to prevent.
     */
    fun build(ctx: Context, name: String, onTap: (Int) -> Unit = {}): View = when (name) {
        "pace" -> pace(ctx, onTap)
        "tools" -> tiles(ctx, onTap)
        "utility" -> weightedRow(ctx, UTILITY, onTap)
        in SCROLLS -> scrollRow(ctx, ROWS.getValue(name), onTap)
        else -> row(ctx, ROWS.getValue(name), onTap)
    }

    /**
     * The pace instrument: one hairline container, four cells sharing its width, the selected
     * cell filled by the caller ([paceSelect]). A segmented control, not four buttons.
     */
    fun pace(ctx: Context, onTap: (Int) -> Unit = {}): LinearLayout {
        val box = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            background = Style.quiet(ctx)
        }
        for ((k, label) in PACE.withIndex()) box.addView(TextView(ctx).apply {
            text = label
            textSize = 13f
            typeface = Style.mono(ctx)
            setTextColor(Style.DIM)
            gravity = android.view.Gravity.CENTER
            minHeight = Style.dp(ctx, 48f)
            setPadding(0, Style.dp(ctx, 14f), 0, Style.dp(ctx, 14f))
            setOnClickListener { onTap(k) }
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        return box
    }

    /** Paint the pace instrument's selected cell. `sel` indexes [PACE]. */
    fun paceSelect(ctx: Context, box: LinearLayout, sel: Int) {
        for (k in 0 until box.childCount) (box.getChildAt(k) as TextView).apply {
            if (k == sel) {
                setTextColor(Style.BRIGHT)
                typeface = Style.monoMedium(ctx)
                background = Style.selected(ctx)
            } else {
                setTextColor(Style.DIM)
                typeface = Style.mono(ctx)
                background = null
            }
        }
    }

    /** The lever tiles: icon over label, four sharing the row's width, 8 dp apart. */
    fun tiles(ctx: Context, onTap: (Int) -> Unit = {}): LinearLayout {
        val grid = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
        for ((k, label) in TOOLS.withIndex()) {
            val tile = LinearLayout(ctx).apply {
                orientation = LinearLayout.VERTICAL
                gravity = android.view.Gravity.CENTER
                background = Style.touchable(ctx, Style.quiet(ctx))
                minimumHeight = Style.dp(ctx, 64f)
                setPadding(0, Style.dp(ctx, 12f), 0, Style.dp(ctx, 12f))
                setOnClickListener { onTap(k) }
                addView(android.widget.ImageView(ctx).apply {
                    setImageResource(TOOL_ICONS[k])
                    imageTintList = ColorStateList.valueOf(Style.TEXT)
                })
                addView(TextView(ctx).apply {
                    text = label
                    textSize = 12f
                    typeface = Style.word(ctx)
                    setTextColor(Style.TEXT)
                    setPadding(0, Style.dp(ctx, 6f), 0, 0)
                })
            }
            val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            if (k > 0) lp.marginStart = Style.dp(ctx, 8f)
            grid.addView(tile, lp)
        }
        return grid
    }

    /** A tile's armed/idle/disabled look. Amber is the hand; a tile without a target recedes. */
    fun tileState(ctx: Context, tile: LinearLayout, armed: Boolean, enabled: Boolean = true) {
        val color = if (armed) Style.AMBER else Style.TEXT
        tile.background = Style.touchable(ctx, if (armed) Style.hand(ctx) else Style.quiet(ctx))
        (tile.getChildAt(0) as android.widget.ImageView).imageTintList = ColorStateList.valueOf(color)
        (tile.getChildAt(1) as TextView).setTextColor(color)
        tile.alpha = if (enabled) 1f else 0.4f
    }

    /** A row of buttons sharing the width equally — the sheet's utility row. */
    fun weightedRow(ctx: Context, labels: List<String>, onTap: (Int) -> Unit = {}): LinearLayout {
        val row = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
        for ((k, label) in labels.withIndex()) {
            val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            if (k > 0) lp.marginStart = Style.dp(ctx, 8f)
            row.addView(button(ctx, label) { onTap(k) }, lp)
        }
        return row
    }

    /**
     * The mode switch (owner, from the canvas: a switch, not a segmented pair). The track and
     * thumb are index 0 and its child; [switchState] repaints them. Amber when the hand is on.
     */
    fun modeSwitch(ctx: Context, onTap: () -> Unit): LinearLayout {
        val sw = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            minimumHeight = Style.dp(ctx, 48f)
            setOnClickListener { onTap() }
        }
        val track = android.widget.FrameLayout(ctx).apply {
            layoutParams = LinearLayout.LayoutParams(Style.dp(ctx, 52f), Style.dp(ctx, 30f))
        }
        track.addView(View(ctx), android.widget.FrameLayout.LayoutParams(
            Style.dp(ctx, 22f), Style.dp(ctx, 22f)).apply {
            topMargin = Style.dp(ctx, 3f); leftMargin = Style.dp(ctx, 3f); rightMargin = Style.dp(ctx, 3f)
        })
        sw.addView(track)
        sw.addView(TextView(ctx).apply {
            text = "intervene"
            textSize = 14f
            typeface = Style.word(ctx)
            setPadding(Style.dp(ctx, 10f), 0, 0, 0)
        })
        switchState(ctx, sw, false)
        return sw
    }

    fun switchState(ctx: Context, sw: LinearLayout, on: Boolean) {
        val track = sw.getChildAt(0) as android.widget.FrameLayout
        val thumb = track.getChildAt(0)
        val label = sw.getChildAt(1) as TextView
        track.background = android.graphics.drawable.GradientDrawable().apply {
            setColor(if (on) Style.AMBER_FILL else Color.argb(46, 148, 178, 204))
            setStroke(Style.dp(ctx, 1f), if (on) Style.AMBER_BORDER else Style.HAIRLINE)
            cornerRadius = Style.dp(ctx, 15f).toFloat()
        }
        thumb.background = android.graphics.drawable.GradientDrawable().apply {
            setColor(if (on) Style.AMBER else Style.DIM)
            cornerRadius = Style.dp(ctx, 11f).toFloat()
        }
        (thumb.layoutParams as android.widget.FrameLayout.LayoutParams).gravity =
            (if (on) android.view.Gravity.END else android.view.Gravity.START) or android.view.Gravity.CENTER_VERTICAL
        thumb.requestLayout()
        label.setTextColor(if (on) Style.AMBER else Style.DIM)
    }

    /** The button row inside a construct built by [row], [scrollRow] or [build]. */
    fun rowOf(v: View): LinearLayout =
        if (v is HorizontalScrollView) v.getChildAt(0) as LinearLayout else v as LinearLayout

    /** The named button of a construct built by [row], [scrollRow] or [build]. */
    fun at(container: View, labels: List<String>, label: String): Button =
        rowOf(container).getChildAt(labels.indexOf(label)) as Button
}
