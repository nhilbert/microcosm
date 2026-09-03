package org.microcosm.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.TextPaint
import android.text.style.ForegroundColorSpan
import android.text.style.LeadingMarginSpan
import android.text.style.MetricAffectingSpan
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView

/**
 * The Data screen's two written pages — Vitals and Events — as designed pages rather than dumps.
 *
 * What they were (U3 review, owner): one 11 sp monospace `TextView` each, holding a string the
 * render thread had assembled with `%-9s` column padding. The owner's word was "almost raw", and
 * that is exactly what it was: a developer's console print that had never been asked to be a
 * page. Monospace padding does not even hold its columns — the moment a species name or a German
 * word changed length, the columns bent.
 *
 * What they are now:
 *
 * **Vitals** is a built view tree, [HealthPanel], bound to a [Report] the render thread publishes
 * as numbers instead of as a sentence. Five stat tiles for the world's own readings, then a row
 * per species: the name against a coloured dot, a meter for the reserve, the population factor
 * and its trend, and the state as a WORD — calm, tense, critical — beside the colour, never as
 * the colour alone. The status ladder deliberately skips amber (rule 7: amber is the hand).
 *
 * **Events** stays one text view, and that is the right form for a chronological feed, but it is
 * a styled one now: the tick in mono and receded, the sentence in the app's word face, the
 * player's own interventions marked in amber and their impact line indented under them, and each
 * block under a section label. Wrapped lines hang under the text rather than under the tick, so
 * the time column stays a column.
 *
 * Neither page invents a number. Everything here is what the observatory already said, laid out.
 */
object DataPages {

    /** One species' vitals, as the observatory reads them. `level` is 0 calm, 1 tense, 2 critical. */
    class Vital(
        val name: String, val color: Int, val reserve: Float, val trend: Float,
        val popFactor: Float, val level: Int, val preyLoss: Float = Float.NaN,
    )

    /**
     * The Vitals page's numbers. `ok == false` means the observatory has not gathered enough
     * history yet, which is a state the page shows rather than a case it hides.
     */
    class Report(
        val ok: Boolean,
        val variety: Float = 0f, val pr: Float = 0f,
        val recycleSeconds: Float = Float.NaN, val locked: Int = 0,
        val adapt: Float = Float.NaN,
        val vitals: List<Vital> = emptyList(),
    )

    /** One line of the world's story. `hand` marks the player's own doing. */
    class Event(val tick: Long, val text: String, val detail: String?, val hand: Boolean)

    // ------------------------------------------------------------------ vitals

    /**
     * The Vitals page. Built once and re-bound in place — it is refreshed four times a second, and
     * rebuilding a view tree at that rate to change five numbers is how a page starts dropping
     * frames for no reason a player can see.
     */
    class HealthPanel(ctx: Context) : LinearLayout(ctx) {

        private val gathering = TextView(ctx).apply {
            setTextColor(Style.CHART_INK)
            textSize = Style.CHART_LEGEND_SP
            typeface = Style.word(ctx)
        }
        private val tileValues = ArrayList<TextView>()
        private val vitalRows = ArrayList<VitalRow>()
        private val vitalsHead: TextView
        private val footnote: TextView
        private val tileGrid: LinearLayout

        init {
            orientation = VERTICAL
            val pad = Style.dp(ctx, 18f)
            setPadding(pad, Style.dp(ctx, 4f), pad, Style.dp(ctx, 28f))
            addView(gathering)

            tileGrid = LinearLayout(ctx).apply { orientation = VERTICAL }
            addView(tileGrid)
            val labels = ctx.resources.getStringArray(R.array.health_tiles)
            var r = 0
            while (r < labels.size) {
                val row = LinearLayout(ctx).apply { orientation = HORIZONTAL }
                for (c in 0 until 2) {
                    val i = r + c
                    val filled = i < labels.size
                    val cell = if (filled) tile(ctx, labels[i]) else View(ctx)
                    // The empty half of an odd last row is height ZERO, not WRAP_CONTENT. A bare
                    // View measured WRAP_CONTENT under an AT_MOST spec takes the WHOLE spec —
                    // `View.getDefaultSize` returns specSize for AT_MOST — so the spacer swallowed
                    // the column and pushed the vitals and the footnote off the page. Caught by
                    // the page gate's first photograph, which is what the gate is for.
                    row.addView(cell, LayoutParams(0, if (filled) LayoutParams.WRAP_CONTENT else 0, 1f))
                }
                tileGrid.addView(row, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
                r += 2
            }

            vitalsHead = sectionLabel(ctx, ctx.getString(R.string.health_vitals_header))
            addView(vitalsHead, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                topMargin = Style.dp(ctx, 22f)
            })
            // Seven rows is the species table's whole width; the ones with nothing to say hide.
            for (k in 0 until 7) {
                val row = VitalRow(ctx)
                vitalRows.add(row)
                addView(row, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
            }

            footnote = TextView(ctx).apply {
                text = ctx.getString(R.string.health_reference)
                setTextColor(Style.CHART_INK)
                textSize = Style.CHART_AXIS_SP + 0.5f
                typeface = Style.word(ctx)
                setLineSpacing(0f, 1.3f)
            }
            addView(footnote, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                topMargin = Style.dp(ctx, 22f)
            })
        }

        /** A stat tile: the label above, the reading below. No box — air does the grouping. */
        private fun tile(ctx: Context, label: String): View {
            val box = LinearLayout(ctx).apply {
                orientation = VERTICAL
                setPadding(0, Style.dp(ctx, 14f), Style.dp(ctx, 12f), 0)
            }
            box.addView(TextView(ctx).apply {
                text = label
                setTextColor(Style.CHART_INK)
                textSize = Style.CHART_AXIS_SP
                typeface = Style.word(ctx)
            })
            val v = TextView(ctx).apply {
                setTextColor(Style.BRIGHT)
                textSize = Style.FIGURE_SP
                // Plex Mono is this app's voice for numbers (U2.S) and these readings sit in a
                // grid where the digits should line up column to column. A hero figure would take
                // the proportional face; a tile in a grid of tiles does not.
                typeface = Style.monoMedium(ctx)
            }
            tileValues.add(v)
            box.addView(v, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                topMargin = Style.dp(ctx, 2f)
            })
            return box
        }

        fun bind(r: Report?) {
            val ctx = context
            if (r == null || !r.ok) {
                gathering.text = ctx.getString(R.string.health_gathering)
                gathering.visibility = VISIBLE
                tileGrid.visibility = GONE
                vitalsHead.visibility = GONE
                for (row in vitalRows) row.visibility = GONE
                footnote.visibility = GONE
                return
            }
            gathering.visibility = GONE
            tileGrid.visibility = VISIBLE
            footnote.visibility = VISIBLE
            val loc = java.util.Locale.getDefault()
            tileValues[0].text = String.format(loc, "%.2f", r.variety)
            tileValues[1].text = String.format(loc, "%.2f", r.pr)
            tileValues[2].text =
                if (r.recycleSeconds.isNaN()) "–"
                else ctx.getString(R.string.health_every, r.recycleSeconds.toInt())
            tileValues[3].text = "${r.locked} %"
            tileValues[4].text = if (r.adapt.isNaN()) "–" else String.format(loc, "%.2f", r.adapt)

            vitalsHead.visibility = if (r.vitals.isEmpty()) GONE else VISIBLE
            for ((k, row) in vitalRows.withIndex()) {
                val v = r.vitals.getOrNull(k)
                row.visibility = if (v == null) GONE else VISIBLE
                if (v != null) row.bind(v)
            }
        }
    }

    /** A section's name: small, receded, spaced — a label, not a heading that shouts. */
    private fun sectionLabel(ctx: Context, text: String) = TextView(ctx).apply {
        this.text = text
        setTextColor(Style.CHART_INK)
        textSize = Style.CHART_AXIS_SP
        typeface = Style.wordMedium(ctx)
        letterSpacing = 0.09f
        setPadding(0, 0, 0, Style.dp(ctx, 6f))
    }

    /**
     * One species' row: identity on the left, state on the right, and under them the reserve as a
     * meter with its number, then the population factor and where it is heading.
     *
     * The state is a word first and a colour second. Colour-only status is the failure mode the
     * whole legend argument on the charts is about, and it would be worse here — "critical" is the
     * one reading on this page a player must not miss.
     */
    private class VitalRow(ctx: Context) : LinearLayout(ctx) {
        private val dot = DotView(ctx)
        private val name = TextView(ctx)
        private val state = TextView(ctx)
        private val meter = MeterBar(ctx)
        private val reserve = TextView(ctx)
        private val factor = TextView(ctx)
        private val prey = TextView(ctx)

        init {
            orientation = VERTICAL
            setPadding(0, Style.dp(ctx, 10f), 0, Style.dp(ctx, 10f))
            val head = LinearLayout(ctx).apply { gravity = Gravity.CENTER_VERTICAL }
            head.addView(dot, LayoutParams(Style.dp(ctx, 9f), Style.dp(ctx, 9f)))
            name.apply {
                setTextColor(Style.TEXT)
                textSize = Style.CHART_LEGEND_SP + 0.5f
                typeface = Style.wordMedium(ctx)
            }
            head.addView(name, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f).apply {
                marginStart = Style.dp(ctx, 10f)
            })
            state.apply {
                textSize = Style.CHART_LEGEND_SP
                typeface = Style.word(ctx)
            }
            head.addView(state)
            addView(head, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))

            val bar = LinearLayout(ctx).apply { gravity = Gravity.CENTER_VERTICAL }
            bar.addView(meter, LayoutParams(0, Style.dp(ctx, 6f), 1f))
            reserve.apply {
                setTextColor(Style.TEXT)
                textSize = Style.CHART_AXIS_SP + 0.5f
                typeface = Style.mono(ctx)
            }
            bar.addView(reserve, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)
                .apply { marginStart = Style.dp(ctx, 10f) })
            factor.apply {
                setTextColor(Style.CHART_INK)
                textSize = Style.CHART_AXIS_SP + 0.5f
                typeface = Style.mono(ctx)
            }
            bar.addView(factor, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)
                .apply { marginStart = Style.dp(ctx, 14f) })
            addView(bar, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                topMargin = Style.dp(ctx, 8f)
                marginStart = Style.dp(ctx, 19f)
            })

            prey.apply {
                setTextColor(Style.CHART_INK)
                textSize = Style.CHART_AXIS_SP
                typeface = Style.word(ctx)
            }
            addView(prey, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                topMargin = Style.dp(ctx, 5f)
                marginStart = Style.dp(ctx, 19f)
            })
        }

        fun bind(v: Vital) {
            val ctx = context
            val loc = java.util.Locale.getDefault()
            dot.color = v.color
            name.text = v.name
            val words = ctx.resources.getStringArray(R.array.vital_states)
            // level < 0 is "measured, not judged" — the hunter's row. No word, no status colour.
            state.visibility = if (v.level < 0) GONE else VISIBLE
            state.text = words.getOrElse(v.level.coerceAtLeast(0)) { "" }
            val tone = when (v.level) {
                2 -> Style.STATUS_CRIT
                1 -> Style.STATUS_TENSE
                else -> Style.STATUS_CALM
            }
            state.setTextColor(tone)
            // The meter's fill is the SPECIES colour, not the status tone — with one exception.
            // A white bar beside the word "tense" read as the healthy one in the first photograph:
            // brightness says "full" before it says "watch me". So identity by default, and the
            // alarm hue only where there is an alarm.
            meter.set(v.reserve, if (v.level == 2) Style.STATUS_CRIT else v.color)
            // The arrow is the RESERVE's trend, so it rides the reserve. Beside the population
            // factor it read as that number's direction, which is a different measurement.
            val arrow = if (v.trend.isNaN()) ""
                else if (v.trend < -0.03f) " ↓" else if (v.trend > 0.03f) " ↑" else " →"
            reserve.text = "${(v.reserve * 100).toInt()} %$arrow"
            if (v.popFactor.isNaN()) factor.visibility = GONE else {
                factor.visibility = VISIBLE
                factor.text = ctx.getString(R.string.health_factor,
                    String.format(loc, "%.2f", v.popFactor))
            }
            if (v.preyLoss.isNaN()) prey.visibility = GONE else {
                prey.visibility = VISIBLE
                prey.text = ctx.getString(R.string.health_prey, v.preyLoss)
            }
        }
    }

    /** The identity dot a legend row and a vitals row share. */
    class DotView(ctx: Context) : View(ctx) {
        var color: Int = Color.GRAY
            set(v) { field = v; invalidate() }
        private val p = Paint(Paint.ANTI_ALIAS_FLAG)
        override fun onDraw(canvas: Canvas) {
            p.color = color
            canvas.drawCircle(width / 2f, height / 2f, minOf(width, height) / 2f, p)
        }
    }

    /**
     * A ratio against a limit. The track is the fill's own colour at a tenth — one ramp, so the
     * state reads across the whole bar rather than only across the filled part.
     */
    class MeterBar(ctx: Context) : View(ctx) {
        private var value = 0f
        private var tone = Style.DIM
        private val p = Paint(Paint.ANTI_ALIAS_FLAG)
        private val r = RectF()

        fun set(v: Float, color: Int) {
            value = v.coerceIn(0f, 1f)
            tone = color
            invalidate()
        }

        override fun onDraw(canvas: Canvas) {
            val rad = height / 2f
            p.color = (tone and 0xFFFFFF) or (38 shl 24)
            r.set(0f, 0f, width.toFloat(), height.toFloat())
            canvas.drawRoundRect(r, rad, rad, p)
            if (value <= 0f) return
            p.color = tone
            r.set(0f, 0f, width * value, height.toFloat())
            canvas.drawRoundRect(r, rad, rad, p)
        }
    }

    // ------------------------------------------------------------------ events

    /**
     * The world's story as styled text: the tick receded and in mono, the sentence in the word
     * face, the player's own doings in amber under their own label, and each impact line indented
     * beneath the intervention it belongs to.
     *
     * Rule 6 lives in the wording the core already chose ("since", never "because") — nothing here
     * rephrases it, and nothing here reorders the feed. All this does is stop it looking like a
     * log file.
     */
    fun events(ctx: Context, rows: List<Event>): CharSequence {
        val sb = SpannableStringBuilder()
        if (rows.isEmpty()) {
            append(ctx, sb, ctx.getString(R.string.events_none), Style.CHART_INK,
                Style.CHART_LEGEND_SP, Style.word(ctx))
            return sb
        }
        val indent = Style.dp(ctx, 62f)
        // The clock is a COLUMN, so every tick is padded to the widest one. Mono makes the space
        // exactly a digit wide, which is the whole reason numbers wear that face here.
        val digits = rows.maxOf { it.tick.toString().length }
        var section = -1
        for (row in rows) {
            val mine = if (row.hand) 1 else 0
            if (mine != section) {
                if (sb.isNotEmpty()) sb.append("\n")
                append(ctx, sb, ctx.getString(
                    if (row.hand) R.string.events_yours else R.string.events_world),
                    Style.CHART_INK, Style.CHART_AXIS_SP, Style.wordMedium(ctx))
                sb.append("\n\n")
                section = mine
            }
            val start = sb.length
            append(ctx, sb, "t ${row.tick.toString().padStart(digits)}",
                if (row.hand) Style.AMBER else Style.CHART_INK,
                Style.CHART_AXIS_SP + 0.5f, Style.mono(ctx))
            sb.append("   ")
            append(ctx, sb, row.text, Style.TEXT, Style.CHART_LEGEND_SP, Style.word(ctx))
            // a wrapped sentence hangs under the sentence, never under the clock
            sb.setSpan(LeadingMarginSpan.Standard(0, indent), start, sb.length,
                Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            sb.append("\n")
            if (row.detail != null) {
                val d0 = sb.length
                append(ctx, sb, row.detail, Style.CHART_INK, Style.CHART_AXIS_SP + 0.5f,
                    Style.word(ctx))
                sb.setSpan(LeadingMarginSpan.Standard(indent, indent), d0, sb.length,
                    Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                sb.append("\n")
            }
            sb.append("\n")
        }
        return sb
    }

    private fun append(
        ctx: Context, sb: SpannableStringBuilder, text: String,
        color: Int, sizeSp: Float, face: Typeface,
    ) {
        val s = sb.length
        sb.append(text)
        sb.setSpan(ForegroundColorSpan(color), s, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        sb.setSpan(FaceSpan(face, Style.sp(ctx, sizeSp)), s, sb.length,
            Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }

    /**
     * Typeface + size in one span. `TypefaceSpan(Typeface)` would do the first half and only from
     * API 28; the app ships from 26, and a span that sets both keeps the two decisions together.
     */
    private class FaceSpan(val face: Typeface, val sizePx: Float) : MetricAffectingSpan() {
        override fun updateDrawState(p: TextPaint) = apply(p)
        override fun updateMeasureState(p: TextPaint) = apply(p)
        private fun apply(p: TextPaint) {
            p.typeface = face
            p.textSize = sizePx
        }
    }

    /** A page's own scroll container, so every page gets the same air around it. */
    fun scroller(ctx: Context, content: View): ViewGroup = android.widget.ScrollView(ctx).apply {
        isFillViewport = true
        addView(content, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    }
}
