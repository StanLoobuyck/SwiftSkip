# SwiftSkip - Installatiehandleiding (Nederlands)

## Overzicht

SwiftSkip is een krachtige Chrome/Edge/Firefox-extensie die volledige toetsenbordbesturing biedt voor video's op de Toledo/Ultra platforms die KU Leuven gebruikt.

**Functies:**
- Video overslaan (vooruit/achteruit)
- Geluid aanpassen
- Afspeelsnelheid wijzigen
- Dempen/ontdempen
- Volledig scherm
- Naar positie zoeken
- Volledig configureerbare toetsenbindingen

---

## Installatie

### Chrome installatie

#### Stap 1: Download het pakket
1. Ga naar de extensie-downloadlocatie
2. Download het SwiftSkip-pakket
3. Pak het uit naar een map naar keuze

#### Stap 2: Open Chrome Extensions
1. Open **Google Chrome**
2. Klik op het menu in de top-rechts
3. Ga naar **Meer hulpmiddelen** → **Extensies**
4. Of open direct: `chrome://extensions/`

#### Stap 3: Activeer Ontwikkelaarsstand
- Schakel **"Ontwikkelaarsstand"** in (knop rechts boven)

#### Stap 4: Laad de extensie
1. Klik op **"Gecomprimeerde extensie laden"** (linker bovenkant)
2. Navigeer naar de SwiftSkip-map
3. Selecteer de map en klik **"Select Map"**
4. De extensie verschijnt nu in uw lijst

Gereed! - SwiftSkip is nu actief in Chrome

---

### Edge installatie

#### Stap 1: Download het pakket
1. Ga naar de extensie-downloadlocatie
2. Download het SwiftSkip-pakket
3. Pak het uit naar een map naar keuze

#### Stap 2: Open Edge Extensions
1. Open **Microsoft Edge**
2. Klik op het menu in de top-rechts
3. Ga naar **Extensies** → **Extensies beheren**
4. Of open direct: `edge://extensions/`

#### Stap 3: Activeer Ontwikkelaarsstand
- Schakel **"Ontwikkelaarsstand"** in (knop links onderaan)

#### Stap 4: Laad de extensie
1. Klik op **"Uitpakken laden"** (linkerkant)
2. Navigeer naar de SwiftSkip-map
3. Selecteer de map en klik **"Map selecteren"**
4. De extensie verschijnt nu in uw lijst

Gereed! - SwiftSkip is nu actief in Edge

---

### Firefox installatie

#### Stap 1: Download het pakket
1. Ga naar de extensie-downloadlocatie
2. Download het SwiftSkip-pakket
3. Pak het uit naar een map naar keuze

#### Stap 2: Open Firefox Add-ons scherm
1. Open **Mozilla Firefox**
2. Klik op de **hamburger menu** in de top-rechts
3. Ga naar **Add-ons en thema's**
4. Of open direct: `about:addons`

#### Stap 3: Open Debugging instellingen
2. Klik op het **tandwiel** in de top-rechts
2. Selecteer **"Debugging voor add-ons"**
3. Of open direct: `about:debugging#/runtime/this-firefox`

#### Stap 4: Laad de extensie
1. Klik op **"Tijdelijke add-on laden..."**
2. Navigeer naar de SwiftSkip-map
3. Selecteer het **`manifest.json`** bestand
4. Klik **"Select"**
5. De extensie verschijnt nu in uw Add-ons lijst

Opmerking: In Firefox moet u de extensie telkens opnieuw laden wanneer u Firefox opnieuw start, omdat het als "tijdelijk" wordt geladen. Voor permanente installatie, zie de Firefox ESR-methode.

Gereed! - SwiftSkip is nu actief in Firefox

---

## Sneltoetsen

De sneltoetsen werken zodra een lesopname open staat — u hoeft niet eerst in de speler te klikken. Druk `?` op een lesopname om ze allemaal te zien.

| Actie | Toetsen |
|-------|---------|
| Afspelen / pauzeren | `Space` of `K` |
| Terug / vooruit springen | `←` / `→` (5, 10, 15 of 30 s) |
| Trager / sneller | `[` / `]` of `<` / `>` (op AZERTY ook `^` / `$`) |
| Normale snelheid | `R` |
| Volume omlaag / omhoog | `↓` / `↑` |
| Dempen | `M` |
| Volledig scherm | `F` |
| Naar 0% – 90% springen | `0` – `9` (op AZERTY ook zonder Shift) |
| Alle sneltoetsen tonen | `?` |

Elke sneltoets kan aangepast worden, en elke actie kan twee toetsen hebben (eventueel met Shift, Ctrl of Alt).

---

## Instellingen

Klik op het SwiftSkip-icoon voor de snelle bediening (downloaden, snelheid, spronginterval). **Instellingen** opent de volledige instellingenpagina:

- **Spronginterval** en **snelheidsstappen** (0,25× of 0,1×, van 0,25× tot 4×)
- **Afspeelsnelheid onthouden** — nieuwe lessen starten aan de snelheid die u laatst koos
- **Verdergaan waar u gebleven was** — een les opnieuw openen springt terug naar waar u stopte
- **Sneltoetsen** — klik op een toets om ze te wijzigen; **Standaard herstellen** zet ze terug
- **Taal** — Nederlands of Engels; *Automatisch* volgt je browser

---

## Probleemoplossing

### Extensie werkt niet op Toledo/Ultra

**Zorg ervoor dat:**
- U op een Toledo of Ultra-platform bent (kuleuven.cloud of kuleuven.be)
- De extensie is ingeschakeld in uw browserinstellingen
- Geen inhoudsblokkering interfereert (check console)

### Toetsenbind-commands werken niet

1. Controleer of de pagina een **actief videoelement** bevat
2. Zorg dat de focus niet op een **tekstinvoeringsveld** ligt
3. Probeer de extensie uit te schakelen en weer in te schakelen

### Firefox: Extensie werkt niet na herstart

Dit is normaal gedrag voor tijdelijk geladen add-ons in Firefox. U kunt:
- **A)** De extensie opnieuw laden via `about:debugging`
- **B)** Firefox ESR gebruiken voor permanente installatie

---

## Licentie

SwiftSkip is open source onder de [MIT-licentie](LICENSE). Het is een onafhankelijk studentenproject, niet verbonden aan, goedgekeurd door of ondersteund door KU Leuven.

---

## Vragen of feedback?

Neem contact op of meld problemen via het ondersteuningskanaal.

Veel plezier met SwiftSkip!
