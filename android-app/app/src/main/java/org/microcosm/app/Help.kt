package org.microcosm.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.text.Html
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * THE HELP PAGE (owner request, 2026-09-02): the overview a beginner needs, and the depth a
 * curious player asks for afterwards.
 *
 * Three things make it a page rather than a wall of text: a drawn diagram of the mineral's round
 * (the one idea the whole world rests on), the species portraits the repo already owns, and a
 * card per creature that puts what it does HERE beside what its real model does out there.
 *
 * Two rules it keeps, both deliberate:
 *
 * 1. **Nothing here decides anything.** Every colour is the core's own bucket table (via
 *    `Native.specNum`), every word is a localized resource, every portrait is the committed art.
 *    A species renamed in the core surfaces as a missing profile, never a wrong one.
 * 2. **The science may be named, and only here.** The app-strings prose gate bans the vocabulary
 *    everywhere else, since chrome should not lecture a player who did not ask. This page is the
 *    place a player DID ask, so `harness/prose-app.js` grants `help_*` keys the reference
 *    register: the terms are allowed, the clause caps are not relaxed, and readability is held to
 *    a reference grade instead of being waived.
 */
object Help {

    /** The species the page profiles, in food-web order rather than table order. */
    private val ORDER = listOf("solara", "drifta", "cilio", "bacillus", "venator")

    /**
     * The seam in `help_titles`: chapters before it explain the metabolism and run above the
     * species cards, chapters from it on are the player's own hand and run below them. A chapter
     * added to the array lands in the metabolism half unless this index moves with it.
     */
    private const val AFTER_SPECIES = 10

    fun page(ctx: Context, onClose: () -> Unit): LinearLayout {
        val panel = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Style.ABYSS)
            visibility = ViewGroup.GONE
            isClickable = true
        }
        val body = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad(ctx), Style.dp(ctx, 18f), pad(ctx), Style.dp(ctx, 28f))
        }

        // ---- the door plate: the page says what it is before it explains anything ----
        body.addView(TextView(ctx).apply {
            text = ctx.getString(R.string.help_title)
            setTextColor(Style.BRIGHT)
            textSize = 30f
            typeface = Style.wordBold(ctx)
        })
        body.addView(TextView(ctx).apply {
            text = ctx.getString(R.string.help_lede)
            setTextColor(Style.DIM)
            textSize = 14.5f
            typeface = Style.word(ctx)
            setLineSpacing(0f, 1.25f)
            setPadding(0, Style.dp(ctx, 6f), 0, Style.dp(ctx, 4f))
        })

        val titles = ctx.resources.getStringArray(R.array.help_titles)
        val bodies = ctx.resources.getStringArray(R.array.help_bodies)
        val n = min(titles.size, bodies.size)

        // ---- chapters 1..3: what this is, the house rule, who eats whom ----
        for (k in 0 until min(3, n)) body.addView(chapter(ctx, titles[k], bodies[k]))

        // ---- the diagram: the mineral's round, drawn in the world's own colours ----
        body.addView(heading(ctx, ctx.getString(R.string.help_h_cycle)))
        body.addView(CycleView(ctx), LinearLayout.LayoutParams(MATCH, Style.dp(ctx, 236f)).apply {
            topMargin = Style.dp(ctx, 4f)
        })
        body.addView(TextView(ctx).apply {
            text = ctx.getString(R.string.help_cycle_caption)
            setTextColor(Style.DIM)
            textSize = 12.5f
            typeface = Style.word(ctx)
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(0, Style.dp(ctx, 8f), 0, Style.dp(ctx, 4f))
        })

        // ---- chapters 4..10: the four accounts through to what closes the circle ----
        for (k in 3 until min(AFTER_SPECIES, n)) body.addView(chapter(ctx, titles[k], bodies[k]))

        // ---- the five, and the real creatures they are built on ----
        body.addView(heading(ctx, ctx.getString(R.string.help_h_species)))
        body.addView(TextView(ctx).apply {
            text = ctx.getString(R.string.help_species_lede)
            setTextColor(Style.TEXT)
            textSize = 14f
            typeface = Style.word(ctx)
            setLineSpacing(0f, 1.3f)
            setPadding(0, 0, 0, Style.dp(ctx, 4f))
        })
        val reals = ctx.resources.getStringArray(R.array.help_real)
        val sources = ctx.resources.getStringArray(R.array.help_sources)
        for ((k, key) in ORDER.withIndex()) {
            body.addView(speciesCard(ctx, key, reals.getOrNull(k), sources.getOrNull(k)))
        }

        // ---- chapters 11..: your hand, the levers, the experiments ----
        for (k in AFTER_SPECIES until n) body.addView(chapter(ctx, titles[k], bodies[k]))

        // ---- where the living-model notes come from ----
        body.addView(heading(ctx, ctx.getString(R.string.help_h_sources)))
        body.addView(TextView(ctx).apply {
            text = ctx.getString(R.string.help_sources_note)
            setTextColor(Style.DIM)
            textSize = 12.5f
            typeface = Style.word(ctx)
            setLineSpacing(0f, 1.3f)
            setPadding(0, 0, 0, Style.dp(ctx, 10f))
        })
        // the list itself, so the citations stand together and not only under their own card
        for ((k, key) in ORDER.withIndex()) {
            val src = sources.getOrNull(k) ?: continue
            val sp = (0 until 7).firstOrNull { Native.traitText(it, 0).lowercase() == key }
            body.addView(TextView(ctx).apply {
                text = "${if (sp != null) Native.traitText(sp, 0) else key}  ·  $src"
                setTextColor(Style.TEXT)
                textSize = 12f
                typeface = Style.mono(ctx)
                setLineSpacing(0f, 1.3f)
                setPadding(0, Style.dp(ctx, 6f), 0, 0)
            })
        }

        panel.addView(android.widget.ScrollView(ctx).apply { addView(body) },
            LinearLayout.LayoutParams(MATCH, 0, 1f))
        panel.addView(Chrome.button(ctx, ctx.getString(R.string.btn_close)) { onClose() })
        return panel
    }

    private const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
    private const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT

    private fun pad(ctx: Context) = Style.dp(ctx, 24f)

    /** A section heading with the hairline that separates one idea from the last. */
    private fun heading(ctx: Context, text: String) = TextView(ctx).apply {
        this.text = text
        setTextColor(Style.BRIGHT)
        textSize = 19f
        typeface = Style.wordBold(ctx)
        setPadding(0, Style.dp(ctx, 26f), 0, Style.dp(ctx, 8f))
    }

    /** One chapter: a title in the bright voice, its paragraph in the reading voice. */
    private fun chapter(ctx: Context, title: String, text: String) = LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(0, Style.dp(ctx, 18f), 0, 0)
        addView(TextView(ctx).apply {
            this.text = title
            setTextColor(Style.BRIGHT)
            textSize = 15f
            typeface = Style.wordMedium(ctx)
        })
        addView(TextView(ctx).apply {
            this.text = text
            setTextColor(Style.TEXT)
            textSize = 14f
            typeface = Style.word(ctx)
            setLineSpacing(0f, 1.35f)
            setPadding(0, Style.dp(ctx, 4f), 0, 0)
        })
    }

    /**
     * One creature: its own art, its own colour, what it does in the pond, and what the real
     * animal it was built on actually does. The name and the colour come from the core, the words
     * from resources, the picture from the committed assets — a species without art loses the
     * picture and keeps everything else, exactly like the specimen card.
     */
    /**
     * A species' IDENTITY colour: the middle bucket of both dials, which is the genotype the
     * world was founded with. Bucket (0,0) is a RAIL of the tint dial, not the species — asking
     * for it paints Bacillus's olive as rust, which is what the first draft of the diagram did.
     * The dials are genotype; only their middle is identity.
     */
    private fun identity(sp: Int): Int {
        val tb = (Native.grammarNum(sp, 4).toInt().coerceAtLeast(1)) / 2
        val mb = (Native.grammarNum(sp, 5).toInt().coerceAtLeast(1)) / 2
        return Color.rgb(
            Native.specNum(sp, tb, mb, 0).toInt(),
            Native.specNum(sp, tb, mb, 1).toInt(),
            Native.specNum(sp, tb, mb, 2).toInt(),
        )
    }

    private fun speciesCard(ctx: Context, key: String, real: String?, source: String?): View {
        val sp = (0 until 7).firstOrNull { Native.traitText(it, 0).lowercase() == key }
        val name = if (sp != null) Native.traitText(sp, 0) else key
        val colour = if (sp != null) identity(sp) else Style.DIM

        return LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            background = Style.card(ctx)
            setPadding(Style.dp(ctx, 16f), Style.dp(ctx, 16f), Style.dp(ctx, 16f), Style.dp(ctx, 16f))
            layoutParams = LinearLayout.LayoutParams(MATCH, WRAP).apply {
                topMargin = Style.dp(ctx, 12f)
            }
            // the head: portrait beside name and role
            addView(LinearLayout(ctx).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                Profiles.portrait(ctx, key)?.let { bm ->
                    addView(PortraitView(ctx).apply { show(bm) },
                        LinearLayout.LayoutParams(Style.dp(ctx, 76f), Style.dp(ctx, 76f)).apply {
                            rightMargin = Style.dp(ctx, 14f)
                        })
                }
                addView(LinearLayout(ctx).apply {
                    orientation = LinearLayout.VERTICAL
                    addView(LinearLayout(ctx).apply {
                        orientation = LinearLayout.HORIZONTAL
                        gravity = Gravity.CENTER_VERTICAL
                        addView(View(ctx).apply {
                            background = android.graphics.drawable.GradientDrawable().apply {
                                setColor(colour)
                                cornerRadius = Style.dp(ctx, 5f).toFloat()
                            }
                        }, LinearLayout.LayoutParams(Style.dp(ctx, 10f), Style.dp(ctx, 10f)).apply {
                            rightMargin = Style.dp(ctx, 8f)
                        })
                        addView(TextView(ctx).apply {
                            text = name
                            setTextColor(Style.BRIGHT)
                            textSize = 18f
                            typeface = Style.wordBold(ctx)
                        })
                    })
                    Profiles.role(key).takeIf { it != 0 }?.let { res ->
                        addView(TextView(ctx).apply {
                            text = ctx.getString(res)
                            setTextColor(Style.DIM)
                            textSize = 12.5f
                            typeface = Style.word(ctx)
                            setPadding(0, Style.dp(ctx, 3f), 0, 0)
                        })
                    }
                }, LinearLayout.LayoutParams(0, WRAP, 1f))
            }, LinearLayout.LayoutParams(MATCH, WRAP))

            Profiles.about(key).takeIf { it != 0 }?.let { res ->
                addView(label(ctx, ctx.getString(R.string.help_label_pond), colour))
                addView(para(ctx, ctx.getString(res)))
            }
            if (!real.isNullOrBlank()) {
                addView(label(ctx, ctx.getString(R.string.help_label_real), colour))
                addView(para(ctx, real))
            }
            if (!source.isNullOrBlank()) addView(TextView(ctx).apply {
                text = source
                setTextColor(Style.DIM)
                textSize = 11.5f
                typeface = Style.word(ctx)
                setPadding(0, Style.dp(ctx, 10f), 0, 0)
            })
        }
    }

    /** A small caps-ish label in the species' own colour: the card's two halves are named. */
    private fun label(ctx: Context, text: String, colour: Int) = TextView(ctx).apply {
        this.text = text
        setTextColor(colour)
        textSize = 11.5f
        typeface = Style.monoMedium(ctx)
        letterSpacing = 0.08f
        setPadding(0, Style.dp(ctx, 14f), 0, Style.dp(ctx, 4f))
    }

    /** Body copy that may carry the one bit of markup the model notes use: an italic binomial. */
    private fun para(ctx: Context, text: String) = TextView(ctx).apply {
        @Suppress("DEPRECATION")
        this.text = if (text.contains("<i>")) Html.fromHtml(text) else text
        setTextColor(Style.TEXT)
        textSize = 13.5f
        typeface = Style.word(ctx)
        setLineSpacing(0f, 1.35f)
    }

    /**
     * THE DIAGRAM: one unit of mineral going round, drawn rather than shipped as an image, so it
     * carries the world's real colours and scales to any screen.
     *
     * Four stations on a ring — water, plant, hunter, remains — with the arrows between them. The
     * return arrow is the one that matters and is therefore the one that is labelled: Bacillus
     * sits on it, in its own colour, because that leg is the whole K6 lesson. Nothing here is
     * measured from the running world; it is the shape of the rule, not a read-out, and it says
     * so by never showing a number.
     */
    class CycleView(ctx: Context) : View(ctx) {

        private val dp = ctx.resources.displayMetrics.density
        private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 1.2f * dp
            color = Style.HAIRLINE
        }
        private val node = Paint(Paint.ANTI_ALIAS_FLAG)
        private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textAlign = Paint.Align.CENTER
            textSize = 12f * dp
            typeface = Style.wordMedium(ctx)
        }
        private val small = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textAlign = Paint.Align.CENTER
            textSize = 10.5f * dp
            typeface = Style.mono(ctx)
        }
        private val arrow = Path()
        private val oval = RectF()
        private val labels = ctx.resources.getStringArray(R.array.help_cycle_labels)

        /** Station colours: the water is slate, the rest are the creatures' own identity. */
        private fun speciesColour(sp: Int) = identity(sp)

        private fun idOf(name: String) =
            (0 until 7).firstOrNull { Native.traitText(it, 0).lowercase() == name }

        override fun onDraw(c: Canvas) {
            val w = width.toFloat()
            val h = height.toFloat()
            val cx = w / 2f
            val cy = h / 2f - 6f * dp
            val r = min(w / 2f, h / 2f) - 40f * dp
            if (r <= 0f) return

            val plant = idOf("solara")?.let { speciesColour(it) } ?: Style.TEXT
            val hunter = idOf("venator")?.let { speciesColour(it) } ?: Style.TEXT
            val crew = idOf("bacillus")?.let { speciesColour(it) } ?: Style.TEXT
            val water = Color.rgb(120, 158, 190)
            val remains = Color.rgb(158, 168, 178)
            val cols = intArrayOf(water, plant, hunter, remains)

            // The ring the mineral travels, clockwise from the top. Three legs are plain track;
            // the fourth — remains back to water — is the one a living thing has to walk, so it
            // is drawn in that guild's own colour and is the only leg that wears a name.
            oval.set(cx - r, cy - r, cx + r, cy + r)
            ring.color = Style.HAIRLINE
            ring.strokeWidth = 1.2f * dp
            c.drawArc(oval, -90f, 270f, false, ring)
            ring.color = crew
            ring.strokeWidth = 2.4f * dp
            c.drawArc(oval, 180f, 90f, false, ring)

            // one arrowhead per leg, at its midpoint, pointing the way round
            for (k in 0 until 4) {
                val a = Math.PI * (2.0 * k / 4.0) - Math.PI / 2 + Math.PI / 4
                head(c, cx + (cos(a) * r).toFloat(), cy + (sin(a) * r).toFloat(),
                    (a + Math.PI / 2).toFloat(), if (k == 3) crew else Style.DIM)
            }

            // the stations
            for (k in 0 until 4) {
                val a = Math.PI * (2.0 * k / 4.0) - Math.PI / 2
                val x = cx + (cos(a) * r).toFloat()
                val y = cy + (sin(a) * r).toFloat()
                node.color = Style.ABYSS // punch the track out from behind the dot
                c.drawCircle(x, y, 20f * dp, node)
                node.color = Color.argb(46, Color.red(cols[k]), Color.green(cols[k]), Color.blue(cols[k]))
                c.drawCircle(x, y, 16f * dp, node)
                node.color = cols[k]
                c.drawCircle(x, y, 5.5f * dp, node)
                text.color = Style.BRIGHT
                // the top station labels above itself; the others below, so no label meets the ring
                val dy = if (k == 0) -26f * dp else 32f * dp
                c.drawText(labels.getOrElse(k) { "" }, x, y + dy, text)
            }

            // the return leg's walker, set outside its own arc and nowhere near a station
            val la = Math.PI * 1.25 // the midpoint of the remains -> water quarter
            small.color = crew
            c.drawText(idOf("bacillus")?.let { Native.traitText(it, 0) } ?: "",
                cx + (cos(la) * (r + 22f * dp)).toFloat(),
                cy + (sin(la) * (r + 22f * dp)).toFloat() + 4f * dp, small)
        }

        /** A small filled arrowhead pointing along the ring's direction of travel. */
        private fun head(c: Canvas, x: Float, y: Float, ang: Float, colour: Int) {
            val s = 6f * dp
            arrow.reset()
            arrow.moveTo(x + cos(ang.toDouble()).toFloat() * s, y + sin(ang.toDouble()).toFloat() * s)
            val back = ang + 2.5f
            val back2 = ang - 2.5f
            arrow.lineTo(x + cos(back.toDouble()).toFloat() * s, y + sin(back.toDouble()).toFloat() * s)
            arrow.lineTo(x + cos(back2.toDouble()).toFloat() * s, y + sin(back2.toDouble()).toFloat() * s)
            arrow.close()
            node.color = colour
            c.drawPath(arrow, node)
        }
    }
}
