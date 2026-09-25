# SwiftSkip — handleiding

SwiftSkip maakt lesopnames in Toledo (Kaltura) aangenamer om te bekijken:

- **Sneltoetsen** om te springen, pauzeren, sneller/trager af te spelen, het volume te regelen … — ook zonder eerst in de speler te klikken
- **Verdergaan waar je gebleven was** bij het heropenen van een les
- **Je afspeelsnelheid onthouden**
- **Lessen downloaden** als `.mp4`, met een duidelijke naam (vak – les – datum)

Werkt in **Zen, Firefox, LibreWolf** en **Chrome, Edge, Brave, Opera, Vivaldi, Arc**.

---

## Installeren

### Zen, Firefox of LibreWolf (aanbevolen: updatet vanzelf)

1. Download **[swiftskip-firefox.xpi](https://github.com/StanLoobuyck/SwiftSkip/releases/latest/download/swiftskip-firefox.xpi)**.
2. Open in je browser `about:addons`, klik op het **tandwiel** (⚙) → **Add-on installeren via bestand…** en kies het gedownloade bestand. (Het bestand in het venster slepen werkt ook.)
3. Klik op **Toevoegen**.

Nieuwe versies worden daarna **automatisch** geïnstalleerd.

### Chrome, Edge, Brave, Opera, Vivaldi of Arc

1. Download **[swiftskip-chrome.zip](https://github.com/StanLoobuyck/SwiftSkip/releases/latest/download/swiftskip-chrome.zip)** en pak het uit naar een map die je **laat staan** (bv. `Documenten/SwiftSkip`). Als je de map verwijdert, verdwijnt de extensie.
2. Open `chrome://extensions` (Edge: `edge://extensions`).
3. Zet **Ontwikkelaarsmodus** aan (rechtsboven; in Edge links).
4. Klik op **Uitgepakte extensie laden** en kies de uitgepakte map.

**Updaten:** Chrome updatet dit niet vanzelf. Download bij een nieuwe versie de zip opnieuw, pak hem uit **over dezelfde map** en klik bij SwiftSkip in `chrome://extensions` op het **herlaad-icoon** (↻).

### Het icoon vastzetten

Klik op het **puzzelstukje** naast de adresbalk en zet SwiftSkip vast. Via dat icoon download je de les, verander je de snelheid en open je de instellingen.

---

## Gebruiken

Open een lesopname in Toledo. Druk **`?`** om alle sneltoetsen te zien.

| Actie | Toetsen |
|-------|---------|
| Afspelen / pauzeren | `Spatie` of `K` |
| Terug / vooruit springen | `←` / `→` (5, 10, 15 of 30 s) |
| Trager / sneller | `[` / `]` of `<` / `>` (op AZERTY ook `^` / `$`) |
| Normale snelheid | `R` |
| Zachter / luider | `↓` / `↑` |
| Dempen | `M` |
| Volledig scherm | `F` |
| Naar 0% – 90% springen | `0` – `9` (op AZERTY ook zonder Shift) |
| Alle sneltoetsen tonen | `?` |

**Downloaden:** klik linksboven in de speler op **Downloaden** (of in het menu van het icoon). Met **‹** klap je de knop in tot een klein rondje; tijdens een download toont het rondje de voortgang.

### Instellingen

Klik op het icoon → **Instellingen**:

- **Taal** — Nederlands of Engels; *Automatisch* volgt je browser
- **Spronginterval** en **snelheidsstappen** (0,25× of 0,1×, van 0,25× tot 4×)
- **Afspeelsnelheid onthouden** en **Verdergaan waar je gebleven was**
- **Sneltoetsen** — klik op een toets om ze te wijzigen (tot twee toetsen per actie, ook met Shift/Ctrl/Alt)
- **Sites** — SwiftSkip werkt altijd op Toledo en in Kaltura-spelers; op een andere site zet je het aan via **Aanzetten op …** in het menu van het icoon

---

## Problemen oplossen

**Sneltoetsen doen niets**
- Staat SwiftSkip aan? (schakelaar in het menu van het icoon)
- Typ je in een tekstveld? Daar werken de sneltoetsen bewust niet.
- Herlaad de pagina één keer.

**Geen downloadknop**
- Speel de opname een paar seconden af; de knop verschijnt zodra de video geladen is.

**Het icoon is niet zichtbaar (Zen)**
- Zen verbergt de extensieknop soms. Zet in `about:config` `zen.theme.hide-unified-extensions-button` op `false`, en zet SwiftSkip daarna vast.

**Iets anders?** Meld het via [GitHub](https://github.com/StanLoobuyck/SwiftSkip/issues) of het menu van SwiftSkip → Instellingen → *Probleem melden*.

---

SwiftSkip is een onafhankelijk, open-source studentenproject ([MIT-licentie](LICENSE)). Het is niet verbonden aan, goedgekeurd door of ondersteund door KU Leuven, en verzamelt geen gegevens ([privacy](PRIVACY.md)). Gedownloade opnames zijn enkel voor je eigen studie: deel ze niet.
