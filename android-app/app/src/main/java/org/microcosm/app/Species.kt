package org.microcosm.app

import android.graphics.Color

/**
 * What never changes about a species while the app runs: its name, its locus words, whether it
 * is in play, and its identity colour. All of it lives in the core's trait rows and bucket
 * table, and all of it is fixed per build — so it is read ONCE, on the first touch, and served
 * from here after that.
 *
 * Two reasons this table exists instead of asking `Native` each time:
 *
 *  - The core is single-threaded state. `Native.traitText` and `Native.specNum` walk `Vec`s the
 *    render thread REPLACES — the trait rows on every load, the grammar on every
 *    `surfaceCreated` — and the HUD used to ask for them from the UI thread four times a second.
 *    The first touch happens in `MainActivity.onCreate`, right after `Native.boot()` and before
 *    any render thread exists, so the one read the table ever makes is safe by construction.
 *
 *  - The identity colour is the MIDDLE bucket of both dials, not bucket (0,0). The dials are
 *    genotype; (0,0) is a rail of the tint dial, and asking for it painted Drifta and Bacillus in
 *    a hue that was neither their body on the water nor their portrait on the help page.
 *    `Help.identity()` had this right; now every chip, pill, legend and swatch reads the same
 *    answer. The corpse ghost and the sprite sheet keep reading the bucket table directly — they
 *    are the world's own painter, not the chrome.
 */
object Species {
    /** The species table's height: seven rows, five of them live. */
    const val N = 7

    private class Table(
        val name: Array<String>,
        val colour: IntArray,
        val live: List<Int>,
        val apex: BooleanArray,
        val locusText: Array<Array<Array<String>>>,
    )

    private val table: Table by lazy {
        val name = Array(N) { Native.traitText(it, 0) }
        val colour = IntArray(N) { sp ->
            // A species without a grammar reports -1 for both dial widths; (0,0) is then the
            // base colour itself, which is what `specNum` returns for it.
            val tb = Native.grammarNum(sp, 4).toInt().coerceAtLeast(1) / 2
            val mb = Native.grammarNum(sp, 5).toInt().coerceAtLeast(1) / 2
            Color.rgb(
                Native.specNum(sp, tb, mb, 0).toInt(),
                Native.specNum(sp, tb, mb, 1).toInt(),
                Native.specNum(sp, tb, mb, 2).toInt(),
            )
        }
        val live = (0 until N).filter { Native.speciesFlag(it, 0) != 0 }
        val apex = BooleanArray(N) { Native.speciesFlag(it, 1) != 0 }
        val locusText = Array(N) { sp ->
            Array(Native.locusCount(sp)) { k ->
                arrayOf(Native.traitText(sp, 10 + k), Native.traitText(sp, 20 + k), Native.traitText(sp, 30 + k))
            }
        }
        Table(name, colour, live, apex, locusText)
    }

    /** Read the table now. Call once after `Native.boot()`, before the render thread exists. */
    fun load() { table }

    fun name(sp: Int): String = table.name[sp]

    /** The identity colour: the founding genotype's body, the middle of both dials. */
    fun colour(sp: Int): Int = table.colour[sp]

    /** The species actually in play, asked of the core rather than listed here. */
    val live: List<Int> get() = table.live

    /** The apex carries no locus (Phase 5 decision 3). */
    fun isApex(sp: Int): Boolean = table.apex[sp]

    fun locusCount(sp: Int): Int = table.locusText[sp].size

    /** A locus's own word (0), its high-end word (1) and its low-end word (2), as the core spells them. */
    fun locusText(sp: Int, k: Int, which: Int): String = table.locusText[sp][k][which]
}
