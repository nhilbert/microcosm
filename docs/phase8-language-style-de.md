# Spielersprache Deutsch — der Schreibleitfaden

v1.0 · 2026-09-01 · Entstanden aus der Sprachsitzung mit dem Owner (A/B-Entscheidungen,
unten dokumentiert). Gilt für jedes deutsche Wort, das ein Spieler liest: die App-Oberfläche
(`res/values-de/strings.xml`), die Narration (`narration.xml`), das Level-Overlay
(`assets/levels.de.json`) und alle künftigen Übersetzungen (L7–L12).
**Der Leitfaden ist das Produkt; das Gate (`harness/prose-app.js`) ist nur sein Wächter** —
es hält die messbaren Böden, den Klang hält nur das Ohr beim Schreiben.

Das Verhältnis zum Kern bleibt wie in DE.1–DE.5: Deutsch ist eine reine Anzeigeschicht.
Das zertifizierte Englisch entscheidet die Urteile; ein Satz ohne deutsche Entsprechung
erscheint englisch statt paraphrasiert.

Die englische Grundlage — Leser, Stimme, Budgets, Ehrlichkeitsregeln — steht in
`phase8-language-style.md` und gilt unverändert. Hier steht nur, was Deutsch anders macht.

## 1. Der Leser, auf Deutsch

Derselbe Mensch: erwachsen, neugierig, Handy, halbe Aufmerksamkeit, Bio-Reste aus der
Schule. Auf Deutsch heißt das zusätzlich: er ist Sachtext-Nominalstil aus Behörden und
Bedienungsanleitungen gewohnt — und genau davon muss dieser Text frei sein, sonst klingt
der Teich nach Formular.

## 2. Grammatik der Stimme

- **du-Form, klein geschrieben.** Durchgehend. Kein Sie, kein Ihr.
- **Imperative in der Langform** (Owner-Entscheidung 2026-09-01): *tippe, ziehe, gieße,
  wähle, versuche, siedle an, hole, bringe, baue, zähle, schaue, drücke*. Die Kurzform
  („tipp", „zieh") wirkt hektischer, die Langform passt zum Freund am Teichrand.
  - Grammatik-Ausnahme: starke Verben mit e→i-Wechsel **haben keine Langform** —
    *gib, sieh, sprich, hilf* bleiben, wie sie sind. „Gebe" wäre falsch, nicht förmlich.
- **Verben tragen den Satz — Nominalstil-Verbot.** Keine „-ung"-Ketten, kein „erfolgt",
  kein „die Verteilung des Minerals geschieht". Höchstens ein Abstraktum pro Satz.
  Falsch: „Die Rückführung des Minerals erfolgt durch Zersetzung."
  Richtig: „Bacillus frisst die Toten und gibt ihr Mineral ans Wasser zurück."
- **Passiv sparsam.** Nur wenn der Handelnde wirklich unbekannt ist. Der Teich, die
  Matte, das Rudel handeln — die Stimme lebt davon. „werden gebunden" verliert den Täter;
  „ihre Opfer binden" behält ihn (Beispiel aus der Sitzung, §7).
- **Komposita sind Freunde — zweigliedrig.** Ein starkes Kompositum schlägt eine
  Adjektivkette („Planktonfresser", „Mineralkreislauf"). Dreigliedrige sind verboten
  („Mineralkreislaufstörung" wäre keins mehr, sondern ein Verwaltungsakt).
- **Anglizismen-Inventar** (abschließend; alles andere gewinnt das deutsche Wort):
  *Sandbox*, *Reset*, *Recycler/Recycling*. Neue Einträge nur per Owner-Entscheidung.
- **Punkt statt Spannungs-Strich.** Der Gedankenstrich ist kein Dramaturgie-Gerät
  („— und hielt"). Kurze Sätze tragen die Überraschung selbst; ein Doppelpunkt darf
  eine Erklärung anschließen, ein echter Einschub darf Striche tragen. Die erste
  deutsche Fassung hatte über 40 Stück in sechs Leveln — nach dem Durchgang tragen
  Punkte, Kommas und Doppelpunkte die Sätze.
- **Keine Kalke.** Wörtlich übersetztes Englisch ist der häufigste Fehler der ersten
  Fassung: „die Blüte hielt" (held), „400 Solara, gehalten", „Dein Rudel hält".
  Deutsch sagt: *blieb dort*, *halte 400 Solara* (Verb an den Spieler), *Dein Rudel
  bleibt*. Beim Übersetzen jeden Satz laut prüfen: Würde ein Mensch das so sagen?
  Übersetzen heißt neu schreiben.

## 2b. Die Personifikations-Grenze (Owner-Entscheidung 2026-09-01)

Lebewesen dürfen **Verhaltensverben**: die Matte trinkt, das Rudel jagt, die Blüte
kriecht zurück, der Gärtner frisst sich arbeitslos (die Job-Metapher von L4 ist ein
dokumentiertes Stilmittel). Aber **Innenzustände und Besitz-Idiome sind verboten** —
für Teich, Wasser UND Kreaturen: kein *hungriger* Teich, kein *unfertiger* Teich,
kein *Mut*, der Jägern ausgeht, kein Plankton, das etwas *im Griff hat*, keine Welt,
die etwas *schluckt*, kein Teich, der etwas *entbehrt* (→ *übrig hat*).

Erlaubt bleibt die **eingebürgerte Gewässersprache**: „der Teich kippt (langsam) um"
ist das deutsche Wort für genau diesen Vorgang und ersetzt „erstickt".

**reich/arm nur stofflich, Lebensfülle heißt voll/mager**: „mageres Wasser" (wenig
Mineral), aber „ein voller Teich" / „der Teich wurde voller" (viel Leben). „reicher
Teich" und „armes Wasser" sind raus.

## 3. Das Weltvokabular (entschieden, nicht verhandelbar pro Text)

Ein Ding, ein Name — in jedem Satz derselbe. Die Sitzung vom 2026-09-01 hat entschieden:

| englisch (Kern) | deutsch | Anmerkung |
|---|---|---|
| mat | der **Algenteppich**, immer voll | Owner-Entscheid 2026-09-05: löst „die Algenmatte / die Matte" ab. Kein Kurzwort — solo klänge „der Teppich" nach Fußboden, wie „die Matte" nach Turnhalle klang. L1–L3-Register |
| meadow | die Wiese | Solaras zweites Bild, L4–L6-Register (die ausgebreitete, gesunde Form) |
| bloom | die Blüte | |
| plankton | das Plankton | |
| poor water | mageres Wasser | nie „armes Wasser" (klingt nach Mitleid) |
| richer (Leben) | voller / ein vollerer Teich | „reich" bleibt Stofflichem vorbehalten |
| energy income | die Energiequelle | die englische Konto-Metapher (income/earn/spend) stirbt im Deutschen: verbrauchen / bekommen / „Energie kommt aus dem Licht" |
| grazer / eater | der **Planktonfresser** | nie „Fresser" solo (klingt grob), nie „Räuber" (kollidiert mit dem Jäger — L6 braucht zwei klar getrennte Stufen) |
| hunter / apex | der Jäger / Spitzenjäger | |
| pack | das Rudel | |
| decomposer | der Zersetzer | Leiterwort, ab L3 |
| the dead / the mud | die Toten / der Schlamm | |
| mineral | das Mineral | nie „Nährstoff", nie „Ressourcen" — beides gebannt |
| pour (Substantiv) | die **Gabe** | Gärtner- und Aquaristik-Register („Düngergabe"); ersetzt „Dose" UND „Guss" |
| pour (Verb) | gießen | |
| seed (Verb) | **ansiedeln** | nie „aussetzen" (klingt nach verlassenem Haustier) |
| populations (Datenseite) | **Bestände** | statt „Kopfzahlen" |
| line / family (Evolution) | die Linie | nie das Individuum |

Titel sind eigene Kunstwerke und dürfen vom englischen Bild abweichen — aber die
Personifikations-Grenze gilt auch für sie (Owner-Entscheidung): „The Hungry Water" →
**„Das magere Wasser"**, „The Richer Pond" → **„Der vollere Teich"**,
„A Head Full of Hunters" → **„Der schmale Grat"** (nimmt das Bild aus dem eigenen
Fail-Text; das englische Stück-Vieh-Wortspiel ist unübersetzbar).

## 4. Die weil-Regel (Owner-Entscheidung 2026-09-01)

Regel 6 („seit, nie weil") gilt dort, wo der Text **dem Spieler eine Wirkung zuschreibt**:
Wirkungskarten, Narration, Chrome. Dort bleibt „weil" gebannt — die Karte berichtet
Gleichzeitigkeit, keine bewiesene Ursache.

Im **Leveltext** (Briefings, Debriefs, Reflects, Fail-Begründungen) ist „weil" erlaubt —
in beiden Sprachen. Begründung: Jede Level-Lektion ist per Null-, Lehr- und
Falschhebel-Lauf gemessen (das Honesty-Gate); nach Regel 8 der englischen Doku *verdient*
gemessene Kausalität das Wort. Disziplin dabei, die kein Gate sehen kann:
**„weil" nur für den gemessenen Lektionskern, nie für „seit deinem Eingriff".** Und
Umschreibungen wie „Der Grund:" bleiben oft die bessere Prosa — die Erlaubnis ist kein
Auftrag.

## 5. Teleologie auf Deutsch (die Evolutions-Level, ab L9)

Die englischen §7-Regeln, plus die deutschen Fallstricke:

- „**um zu**" ist auf Kreaturen verboten — es schmuggelt Absicht in jeden Satz
  („bildet Panzer, um zu überleben" ist Lamarck auf Deutsch).
- „**sich anpassen**" nur als beobachtetes Ergebnis einer Population, nie als Tun eines
  Tieres, nie mit Ziel. „Die Linie vor Ort wurde zäher" statt „Drifta passt sich an".
- Deutsche Reflexivverben täuschen Handlung vor: „die Art stellt sich um", „rüstet sich" —
  alle verboten. Linien **überleben** oder **sterben**; die nächste Generation **hat mehr**
  von einem Merkmal.

## 6. Messbare Böden (was das Gate hält)

Alles Weitere prüft `harness/prose-app.js` in `npm test`:

- **Wortbudgets = die englischen** (§4 der EN-Doku): Briefing 50, Frage 14, Prompt 12,
  Chip 9, Reflect 28, goalText 8, Fail-Begründung 30, Debrief 75. Deutsche Übersetzungen
  neigen zu +10–20 % — das Budget ist die Bremse.
- **Teilsatz-Deckel 18** (statt 20 im Englischen): kein Teilsatz über 18 Wörter, wobei
  auch Gedankenstrich und Doppelpunkt als Grenze zählen (Owner-Entscheidung b). Deutsche
  Wörter tragen mehr pro Wort; der Deckel misst, was der Leser wirklich am Stück trägt.
- **Wiener Sachtextformel ≤ 8** auf Fließtexten ab 25 Wörtern — das deutsche Gegenstück
  zu Flesch–Kincaid, für deutsche Silben und Komposita kalibriert. Gemessen bei
  Einführung: alle Bestandstexte zwischen 0,3 und 6,1.
- **Bannliste DE**: Biomasse, Nährstoff, abiotisch/biotisch, trophisch, Population,
  Organismus, Ökosystem, Paradigma, Mechanismus, Parameter, stochastisch, Allel, Genotyp,
  Ressource(n), Einkommen — und „weil" außerhalb des Leveltexts (§4). Dokumentierte Instrumentgrenze:
  das Gate prüft Wortanfänge; ein Bannwort als *zweites* Kompositumsglied
  („Hauptnährstoff") sieht es nicht — das fängt nur Review.
- **Begriffsleiter DE** — ein Wissenschaftsname pro Level, erst NACH seinem Phänomen:

| Level | deutsches Leiterwort |
|---|---|
| L1 | Tragfähigkeit |
| L3 | Zersetzer |
| L4 | Schlüsselart |
| L6 | Nahrungskette |
| L7 | Besiedlung *(bestätigt mit der L7-Übersetzung, 2026-09-01)* |
| L9 | natürliche Auslese (+ „Merkmal" als Arbeitswort) |
| L10 | Anpassung (lokal) |
| L11 | Zuflucht *(bestätigt mit der L11-Übersetzung, 2026-09-01)* |
| L12 | Variation |

## 7. Gearbeitete Beispiele (aus der Sitzung, als Maßstab)

**Der Zersetzer-Satz** (cycle, debrief.fail) — drei Fassungen:

> *Vorher:* „Fresser und Jäger schieben Materie nur zwischen Körpern hin und her — was
> sie töten, bindet noch mehr im Schlamm."
> *(„Fresser" solo grob; 19-Wort-Fügung)*
>
> *Owner-Entwurf:* „Räuber und Jäger bewegen lediglich Materie zwischen Körpern.
> Gleichzeitig werden durch ihre Opfer noch mehr Ressourcen im Schlamm gebunden."
> *(Räuber≈Jäger kollidiert mit der L6-Pyramide; „Ressourcen" ist Bannregister; Passiv
> nimmt dem Satz den Täter)*
>
> *Verabschiedet:* „Planktonfresser und Jäger bewegen Materie nur zwischen Körpern.
> Ihre Opfer binden zugleich noch mehr Mineral im Schlamm."

**Der Personifikations-Fall** (L5, debrief.pass, Schluss):

> *Vorher:* „Dieser Teich war nie hungrig. Er war unfertig."
> *(Menschenzustände auf dem Teich — „das ist auch kein Deutsch")*
>
> *Verabschiedet:* „Diesem Teich fehlte nie Nachschub. Ihm fehlte ein Planktonfresser."
> *(„fehlen" mit Dativ ist normales Deutsch, kein Innenleben)*

**Der Mut-Satz** (L6, debrief.fail): „Jägern geht nicht der Mut aus — ihnen geht die
Beute aus" → „Die Jäger verhungern, weil ihnen die Beute ausgeht." („weil" ist im
Leveltext erlaubt, §4 — und die Ursache ist gemessen.)

**Die A/B-Entscheidungen im Kleinen:** „noch 3 Gaben" statt „Güsse übrig 3" (deutsche
Wortstellung, ein Wort für die Sache) · „Tippen setzt zurück" statt „stellt zurück"
(„zurückstellen" heißt auch vertagen) · „Bestände" statt „Kopfzahlen" (das Alltagswort:
Fischbestand) · „kippt um" statt „erstickt" (Gewässersprache) · Wirkungskarten nüchtern:
„zu lange her — die Wirkung lässt sich nicht mehr abgrenzen" statt „die Geschichte ist
darüber hinweggezogen".

## 8. Die Zehn-Sekunden-Checkliste vor jedem deutschen Text

1. Laut lesen. Klingt es nach dem Freund am Teichrand — oder nach Beipackzettel?
2. Ein Teilsatz über 18 Wörter? Trennen.
3. Ein Substantiv auf „-ung", wo ein Verb stünde? Umbauen.
4. Ein Passiv mit bekanntem Täter? Aktiv machen.
5. Weltvokabular getroffen? (Planktonfresser, Gabe, ansiedeln, Mineral — §3.)
6. „weil" außerhalb des Leveltexts, „um zu" auf einer Kreatur? Raus.
7. Imperativ in der Langform (außer gib/sieh)?

## 9. Das Nachschlage-Register (Owner-Entscheidung, 2026-09-02)

Die Verbotsliste hält Fachsprache aus Text heraus, den niemand angefordert hat. Die Hilfeseite
ist der eine Ort, an dem doch jemand gefragt hat: Sie wird bewusst geöffnet, von der Startseite
aus, von jemandem, der es genauer wissen will. Dort zu verbieten, worum es geht, hieße der Seite
ihren Gegenstand zu nehmen.

Deshalb gelten für `help_*`-Schlüssel — und nur für die — andere Regeln: Die Fachwörter sind
erlaubt. Die Klammer bleibt, wo sie zählt: Der 18-Wörter-Deckel je Teilsatz gilt unverändert,
die Lesbarkeit wird auf Stufe 12 statt 8 gehalten und nicht etwa aufgehoben.

Das ist die Form, auf die es ankommt. Gelockert wird der **Wortschatz**, den ein Leser
nachschlagen kann. Nicht gelockert wird die **Satzlänge**, gegen die kein Leser etwas tun kann.
Das Gate hat den ersten Entwurf dieser Seite elfmal wegen zu langer Sätze abgewiesen, und jede
dieser Abweisungen war berechtigt.

## Offene Punkte (Owner-Veto ausstehend)

- **„schaue"**: Die Langform-Regel macht aus „schau zu" ein „schaue zu" — das klingt
  m. E. gespreizt. Angewendet wie entschieden; ein Wort vom Owner dreht es zurück.
- **narration.xml**: Die 19 Narrations-Templates und das Merkmals-Vokabular sind noch
  nicht gegen §2b/§3 durchgesehen (dort könnte noch „Matte" oder ein Kalk stehen) —
  eigener Durchgang, mit GermanTest als Netz.
- **Titel-/Untertitel-Budgets**: §4 (EN) verlangt Titel 2–4 Wörter, Untertitel ≤ 5 —
  ungeprüft in beiden Sprachen, und die *englische* L6 („A Head Full of Hunters", 5) und
  der deutsche L5-Untertitel („Struktur von oben · Nachschub von unten", 6) verletzen es
  bereits. Erst Entscheidung, dann Gate.
- **Sonnen-Badge-Semantik**: „Tippen setzt zurück" — technisch auf die *Gründungs*-Sonne,
  nicht den vorigen Zustand. Falls das im Spiel überrascht, wäre „setzt auf Anfang" die
  ehrlichere Kurzform.
