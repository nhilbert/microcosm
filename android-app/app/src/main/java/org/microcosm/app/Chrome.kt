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

    /** The sun card's layout presets (EV — the browser's SOURCE_LAYOUTS, additive by the L.2
     *  finding: the shipped sun stays what and where it is; extra sources are tight and far). */
    val LAYOUTS = listOf("one", "twin", "dim", "isles", "hot", "heater")

    /** The Evolution panel's presets (6.3): one intervention each. */
    val PRESETS = listOf("shipped", "settled", "wild", "frozen")

    /** Data mode's pages, in order. `traits` is the evolution window (EV). */
    val PAGES = listOf("pops", "chem", "metab", "health", "events", "traits")

    /** The sheet's utility row. `bench` is dev-mode only at runtime. */
    val UTILITY = listOf("reset", "save", "data", "bench")

    /** The menu drawer's width and padding — declared here so the layout gate measures the
     *  drawer's rows at the width they actually get. "Speichern" overflowed at 260 dp inner
     *  width while every device-width sweep stayed green: a row is only measured honestly at
     *  the width of the container it ships in. */
    const val DRAWER_DP = 300
    const val DRAWER_PAD_DP = 20

    /** The rows that live inside the drawer, and so at its inner width, not the screen's. */
    val IN_DRAWER = setOf("pace", "utility")

    /** The specimen sheet's own padding, so its header row is measured at the width it gets. */
    const val SHEET_PAD_DP = 20

    const val TEXT_SP = 14f

    /**
     * The face a key wears on screen (DE.1). The lists above stay English keys — the gates and
     * the baseline key on them, and CI measures under the English locale — while the player sees
     * the locale's word from res/values*. A key with no resource shows itself ("1×" needs none).
     */
    fun label(ctx: Context, key: String): String {
        val id = when (key) {
            "pause" -> R.string.pace_pause
            "feed" -> R.string.tool_feed
            "kill" -> R.string.tool_kill
            "seed" -> R.string.tool_seed
            "wall" -> R.string.tool_wall
            "close" -> R.string.specimen_close
            "pops" -> R.string.page_pops
            "traits" -> R.string.page_traits
            "chem" -> R.string.page_chem
            "metab" -> R.string.page_metab
            "health" -> R.string.page_health
            "events" -> R.string.page_events
            "reset" -> R.string.util_reset
            "save" -> R.string.util_save
            "data" -> R.string.util_data
            "bench" -> R.string.util_bench
            "shipped" -> R.string.preset_shipped
            "settled" -> R.string.preset_settled
            "wild" -> R.string.preset_wild
            "frozen" -> R.string.preset_frozen
            "one" -> R.string.layout_one
            "twin" -> R.string.layout_twin
            "dim" -> R.string.layout_dim
            "isles" -> R.string.layout_isles
            "hot" -> R.string.layout_hot
            "heater" -> R.string.layout_heater
            else -> 0
        }
        return if (id == 0) key else ctx.getString(id)
    }

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

    /**
     * A square icon button in the same quiet voice as [button] — a glyph where a word would not
     * fit, at the same 48 dp the layout gate holds every other control to.
     *
     * `desc` is load-bearing, not decoration: an icon is never the whole label. It becomes the
     * contentDescription a screen reader speaks AND the long-press tooltip a sighted player uses
     * to find out what the picture means, so it must be the word the icon replaced.
     *
     * `bordered = false` drops the hairline box and keeps only the ripple — for a control that
     * shares a row with real actions without claiming to be one of them (the sheet's dismiss).
     */
    fun iconButton(
        ctx: Context, iconRes: Int, desc: String,
        tint: Int = Style.TEXT, bordered: Boolean = true, onTap: () -> Unit = {},
    ): android.widget.ImageButton = android.widget.ImageButton(ctx).apply {
        setImageResource(iconRes)
        imageTintList = ColorStateList.valueOf(tint)
        contentDescription = desc
        tooltipText = desc
        scaleType = android.widget.ImageView.ScaleType.CENTER
        background = Style.touchable(ctx, if (bordered) Style.quiet(ctx)
            else android.graphics.drawable.GradientDrawable().apply {
                setColor(Color.TRANSPARENT); cornerRadius = Style.dp(ctx, 12f).toFloat()
            })
        stateListAnimator = null
        layoutParams = LinearLayout.LayoutParams(Style.dp(ctx, 48f), Style.dp(ctx, 48f))
        setOnClickListener { onTap() }
    }

    /**
     * The specimen card's three actions, as icons (owner, 2026-09-02): feed and kill on THIS
     * creature, then the sheet's own dismiss.
     *
     * The gap before the dismiss is not decoration. The kill glyph is a circled cross and the
     * dismiss is a cross — they are neighbours, and one of them is irreversible in consequence
     * (docs/app-ux-research.md: undo puts the LEVER back, never the world). So the dismiss is
     * set apart, unboxed and dim, while feed and kill stay a boxed pair.
     *
     * It lives here rather than in `MainActivity` for the reason the whole file exists: the
     * layout gate measures `Chrome.ROWS`, and a row built somewhere else is a row nothing checks.
     */
    fun specimenActions(ctx: Context, onTap: (Int) -> Unit = {}): LinearLayout {
        val row = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
        }
        fun add(iconRes: Int, key: String, gapDp: Float, tint: Int, bordered: Boolean, k: Int) {
            row.addView(iconButton(ctx, iconRes, label(ctx, key), tint, bordered) { onTap(k) },
                LinearLayout.LayoutParams(Style.dp(ctx, 48f), Style.dp(ctx, 48f))
                    .apply { marginStart = Style.dp(ctx, gapDp) })
        }
        add(R.drawable.ic_feed, "feed", 0f, Style.TEXT, true, 0)
        add(R.drawable.ic_kill, "kill", 8f, Style.TEXT, true, 1)
        add(R.drawable.ic_close, "close", 14f, Style.DIM, false, 2)
        return row
    }

    /** One horizontal row of buttons, 8 dp apart. `onTap` receives the index into `labels`. */
    fun row(ctx: Context, labels: List<String>, onTap: (Int) -> Unit = {}): LinearLayout {
        val row = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
        for ((k, key) in labels.withIndex()) {
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            if (k > 0) lp.marginStart = Style.dp(ctx, 8f)
            row.addView(button(ctx, label(ctx, key)) { onTap(k) }, lp)
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

    /**
     * The Data screen's tab strip (U3).
     *
     * What shipped before was `scrollRow`: six full buttons, each a 48 dp hairline box, stacked
     * against a two-line page title. Together they took about a fifth of the phone and read as a
     * row of actions — six things to DO — when they are a place to BE. The owner's word for it
     * was "huge menu on top steals space", and that is the right reading of what a boxed button
     * says.
     *
     * So the strip is a tab strip in the ordinary sense, and the ordinary sense is worth stating
     * because it is the part that gets improvised: the tabs are text, not boxes; the selected tab
     * is the only bright one and carries a 2.5 dp underline; the strip scrolls when the labels do
     * not fit and [tabSelect] brings the selected one into view, so a tab off the edge is never a
     * tab a player cannot find; and the page body still swipes, which moves the selection here.
     * One state, three ways to reach it — tap, swipe, and the strip scrolling itself.
     *
     * The underline is slate, not amber. Rule 7 again, and the note the old row already carried:
     * looking is not touching.
     */
    fun tabs(ctx: Context, keys: List<String>, onTap: (Int) -> Unit = {}): HorizontalScrollView {
        val strip = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
        for ((k, key) in keys.withIndex()) strip.addView(TextView(ctx).apply {
            text = label(ctx, key)
            textSize = TEXT_SP
            typeface = Style.word(ctx)
            setTextColor(Style.DIM)
            gravity = android.view.Gravity.CENTER
            // the same 48 dp floor every other control is held to, height AND width
            minHeight = Style.dp(ctx, 48f)
            minimumHeight = Style.dp(ctx, 48f)
            minWidth = Style.dp(ctx, 48f)
            minimumWidth = Style.dp(ctx, 48f)
            setPadding(Style.dp(ctx, 14f), 0, Style.dp(ctx, 14f), 0)
            background = tabBackground(ctx, false)
            setOnClickListener { onTap(k) }
        })
        return HorizontalScrollView(ctx).apply {
            isHorizontalScrollBarEnabled = false
            // The one thing a bare scroll row could never say (the U0.1 note admitted it): that it
            // scrolls. A fading edge is the platform's own answer — the tab under the fade is
            // visibly cut off rather than absent, so the swipe suggests itself.
            isHorizontalFadingEdgeEnabled = true
            setFadingEdgeLength(Style.dp(ctx, 28f))
            addView(strip, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        }
    }

    /** A tab's ground: the ripple, plus the selected tab's underline sitting on the bottom edge. */
    private fun tabBackground(ctx: Context, selected: Boolean): android.graphics.drawable.Drawable {
        val base: android.graphics.drawable.Drawable = if (!selected)
            android.graphics.drawable.ColorDrawable(Color.TRANSPARENT)
        else android.graphics.drawable.LayerDrawable(arrayOf(
            android.graphics.drawable.GradientDrawable().apply {
                setColor(Style.BRIGHT)
                cornerRadius = Style.dp(ctx, 1.5f).toFloat()
            })).apply {
            setLayerGravity(0, android.view.Gravity.BOTTOM)
            setLayerHeight(0, Style.dp(ctx, 2.5f))
            setLayerInsetLeft(0, Style.dp(ctx, 6f))
            setLayerInsetRight(0, Style.dp(ctx, 6f))
        }
        return android.graphics.drawable.RippleDrawable(
            ColorStateList.valueOf(Color.argb(31, 201, 215, 227)), base, null)
    }

    /** Paint the strip's selection and scroll it into view. `sel` indexes the keys [tabs] got. */
    fun tabSelect(ctx: Context, view: View, sel: Int) {
        val strip = rowOf(view)
        for (k in 0 until strip.childCount) (strip.getChildAt(k) as TextView).apply {
            setTextColor(if (k == sel) Style.BRIGHT else Style.DIM)
            typeface = if (k == sel) Style.wordMedium(ctx) else Style.word(ctx)
            background = tabBackground(ctx, k == sel)
        }
        val tab = strip.getChildAt(sel) ?: return
        // post: on the first pass the strip has not been laid out, so left/right are still 0 and
        // the scroll would land on nothing.
        view.post {
            val hs = view as HorizontalScrollView
            val margin = Style.dp(ctx, 24f)
            val want = tab.left - margin
            val end = tab.right + margin
            if (want < hs.scrollX) hs.smoothScrollTo(maxOf(0, want), 0)
            else if (end > hs.scrollX + hs.width) hs.smoothScrollTo(end - hs.width, 0)
        }
    }

    /** The rows wide enough to need the scroll treatment. The rest fit or share width. */
    val SCROLLS = setOf("pages")

    /** Row names to their label lists — the inventory [build] and the gate walk together.
     *  (The old "sun" row — dimmer/brighter/release — retired with the sun card's sliders, EV.) */
    val ROWS = mapOf("pace" to PACE, "tools" to TOOLS, "pages" to PAGES,
        "utility" to UTILITY, "presets" to PRESETS, "layouts" to LAYOUTS,
        // The specimen card's action cluster — icons, so the list is what they SAY, not what
        // they show. It shares the header with the creature's name, so it is measured at the
        // width it actually competes for (Chrome.IN_SHEET).
        "specimen" to listOf("feed", "kill", "close"))

    /**
     * The one place a row's shipped construct is decided. `MainActivity` builds through this and
     * so does the layout gate — a second decision point would let the app and the measurement
     * drift apart, which is the failure this file exists to prevent.
     */
    fun build(ctx: Context, name: String, onTap: (Int) -> Unit = {}): View = when (name) {
        "pace" -> pace(ctx, onTap)
        "specimen" -> specimenActions(ctx, onTap)
        "tools" -> dial(ctx, onTap)
        // 2x2, not 1x4 (owner round 3): four buttons sharing the drawer's ~260 dp gave each 65,
        // which German ("Speichern") overflowed and even English only just survived. Two per row
        // doubles the budget and stops fitting from depending on the language.
        "utility" -> grid(ctx, UTILITY, 2, onTap)
        "presets" -> grid(ctx, PRESETS, 2, onTap)
        "layouts" -> grid(ctx, LAYOUTS, 2, onTap)
        // The Data screen's pages are a place to be, not six actions — a tab strip, not buttons.
        "pages" -> tabs(ctx, PAGES, onTap)
        in SCROLLS -> scrollRow(ctx, ROWS.getValue(name), onTap)
        else -> row(ctx, ROWS.getValue(name), onTap)
    }

    /** [labels] as weighted rows of [cols], top to bottom. `onTap` gets the flat index. */
    fun grid(ctx: Context, labels: List<String>, cols: Int, onTap: (Int) -> Unit = {}): LinearLayout {
        val box = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
        var k = 0
        while (k < labels.size) {
            val slice = labels.subList(k, minOf(k + cols, labels.size))
            val base = k
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT)
            if (k > 0) lp.topMargin = Style.dp(ctx, 8f)
            box.addView(weightedRow(ctx, slice) { i -> onTap(base + i) }, lp)
            k += cols
        }
        return box
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
        for ((k, key) in PACE.withIndex()) box.addView(TextView(ctx).apply {
            text = label(ctx, key)
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

    /** A floating round button (U2.R2 — the owner's overlay language). 56 dp, or 48 for minis. */
    fun fab(ctx: Context, iconRes: Int, sizeDp: Float = 56f, onTap: () -> Unit = {}): android.widget.ImageButton =
        android.widget.ImageButton(ctx).apply {
            setImageResource(iconRes)
            imageTintList = ColorStateList.valueOf(Style.TEXT)
            background = Style.touchable(ctx, android.graphics.drawable.GradientDrawable().apply {
                setColor(Style.SURFACE_SCRIM)
                setStroke(Style.dp(ctx, 1f), Style.HAIRLINE)
                cornerRadius = Style.dp(ctx, sizeDp / 2).toFloat()
            })
            stateListAnimator = null
            layoutParams = LinearLayout.LayoutParams(Style.dp(ctx, sizeDp), Style.dp(ctx, sizeDp))
            setOnClickListener { onTap() }
        }

    /** Repaint a fab: amber when it is the hand. `iconRes` swaps the glyph (armed tool, ×, +). */
    fun fabState(ctx: Context, fab: android.widget.ImageButton, amber: Boolean, iconRes: Int, sizeDp: Float = 56f) {
        fab.setImageResource(iconRes)
        fab.imageTintList = ColorStateList.valueOf(if (amber) Style.AMBER else Style.TEXT)
        fab.background = Style.touchable(ctx, android.graphics.drawable.GradientDrawable().apply {
            setColor(if (amber) Color.argb(245, 34, 30, 20) else Style.SURFACE_SCRIM)
            setStroke(Style.dp(ctx, 1f), if (amber) Style.AMBER_BORDER else Style.HAIRLINE)
            cornerRadius = Style.dp(ctx, sizeDp / 2).toFloat()
        })
    }

    /**
     * The intervene speed dial (owner, round 2): the four tools stacked vertically above the
     * hand's fab, each a labelled mini-fab, right-aligned. The rows are children 0..3 (in TOOLS
     * order), each row = [label pill, mini fab]; the caller toggles their visibility as one.
     */
    fun dial(ctx: Context, onTap: (Int) -> Unit = {}): LinearLayout {
        val stack = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            gravity = android.view.Gravity.END
        }
        for ((k, key) in TOOLS.withIndex()) {
            val row = LinearLayout(ctx).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER_VERTICAL
                tag = k // the tool's index — dialRowState must not key on display text (DE.1)
            }
            row.addView(TextView(ctx).apply {
                text = label(ctx, key)
                textSize = 13f
                typeface = Style.word(ctx)
                setTextColor(Style.TEXT)
                background = Style.pill(ctx)
                minHeight = Style.dp(ctx, 36f)
                gravity = android.view.Gravity.CENTER
                setPadding(Style.dp(ctx, 14f), 0, Style.dp(ctx, 14f), 0)
            }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT).apply { marginEnd = Style.dp(ctx, 10f) })
            row.addView(fab(ctx, TOOL_ICONS[k], 48f) { onTap(k) })
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.bottomMargin = Style.dp(ctx, 10f)
            // the whole row taps the tool: the label is as good a target as the disc
            row.setOnClickListener { onTap(k) }
            stack.addView(row, lp)
        }
        return stack
    }

    /** A dial row's enabled/armed paint. `row` is a child of [dial]. */
    fun dialRowState(ctx: Context, row: LinearLayout, armed: Boolean, enabled: Boolean) {
        val label = row.getChildAt(0) as TextView
        val mini = row.getChildAt(1) as android.widget.ImageButton
        label.setTextColor(if (armed) Style.AMBER else Style.TEXT)
        label.background = if (armed) Style.pill(ctx, amber = true) else Style.pill(ctx)
        fabState(ctx, mini, armed, TOOL_ICONS[row.tag as Int], 48f)
        row.alpha = if (enabled) 1f else 0.4f
    }

    /** A row of buttons sharing the width equally — the sheet's utility row. */
    fun weightedRow(ctx: Context, labels: List<String>, onTap: (Int) -> Unit = {}): LinearLayout {
        val row = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
        for ((k, key) in labels.withIndex()) {
            val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            if (k > 0) lp.marginStart = Style.dp(ctx, 8f)
            row.addView(button(ctx, label(ctx, key)) { onTap(k) }, lp)
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
            // no topMargin: it fought CENTER_VERTICAL and pushed the thumb off-axis (owner note)
            leftMargin = Style.dp(ctx, 3f); rightMargin = Style.dp(ctx, 3f)
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

    /** The named button of a construct built by [row], [scrollRow], [grid] or [build] — the
     *  buttons in build order, whatever the nesting, so a grid works like a row. */
    fun at(container: View, labels: List<String>, label: String): Button {
        val out = ArrayList<Button>()
        fun walk(v: View) {
            if (v is Button) out.add(v)
            else if (v is android.view.ViewGroup) for (i in 0 until v.childCount) walk(v.getChildAt(i))
        }
        walk(container)
        return out[labels.indexOf(label)]
    }
}
