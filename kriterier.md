# Kriterier för att vara med på AI-kartan

Kartan är för alla som bygger AI i Sverige, inte bara för dem som en kommitté har godkänt. Tre kriterier gäller. Alla är objektiva. Det finns inga andra.

## 1. Svensk koppling

Organisationen är registrerad i Sverige, i vilken form som helst: aktiebolag, enskild firma, handelsbolag, ekonomisk eller ideell förening, stiftelse, myndighet, kommun, region eller lärosäte. Ett svenskt dotterbolag räknas. Ett utländskt bolags säljkontor utan svensk registrering gör det inte.

## 2. Har byggt något med AI

En publik länk till en produkt, ett kodförråd, en modell, ett dataset, en demo eller en publikation. Länken är belägget (`evidence`) och visas på organisationens sida. **Att använda AI räcker inte.** En konsult som bygger AI-lösningar åt andra är med om det syns i publika case, kod eller produkter. En finansiär är med om den finansierar AI och visar det publikt. En community är med om den samlar byggare och visar det publikt.

## 3. Finns på riktigt

Länken fungerar och organisationen är inte avregistrerad. Länkar kontrolleras automatiskt varje vecka. En nedlagd organisation markeras först som inaktiv (`active: false`) och tas sedan bort, med spår i ändringshistoriken.

## Vad som inte är ett kriterium

- Storlek, antal anställda eller omsättning.
- Ålder.
- Bolagsform eller finansiering.
- Om verksamheten är konsultbaserad.
- Om någon tycker att organisationen är bra. Kvaliteten visas med verifieringsstatus och används aldrig för att stänga ute.

## Personer lägger till sig själva

En soloutvecklare eller enskild firma är en personuppgift. Sådana poster skapas bara av personen själv (`self_submitted: true`), vilket är samtycket, och tas bort på begäran utan diskussion. Vi skrapar aldrig enskilda firmor och registrerar aldrig deras organisationsnummer, eftersom det är ett personnummer. Schemat saknar fält för kontaktpersoner, anställda och ägare.

## Hur ett beslut fattas och bestrids

En pull request granskas av en människa mot de tre kriterierna och mot metoden. AI får hjälpa till att kontrollera att belägget visar det som påstås, men bedömer aldrig om någon förtjänar att vara med. Ett avslag skrivs i pull requesten med hänvisning till kriteriet (1, 2 eller 3). Den som inte håller med öppnar en ny pull request eller ett ärende med ytterligare belägg. Vi svarar inom 14 dagar.

## Granskningslista för den som granskar

- [ ] Kriterium 1: svensk registrering framgår av källa (register, egen sida eller oberoende sida som speglar register).
- [ ] Kriterium 2: minst ett belägg som visar något byggt med AI, inte bara användning.
- [ ] Kriterium 3: webbplats och belägg svarar; organisationen är inte avregistrerad.
- [ ] Varje fält har källa, datum och status; egen webbplats ger högst `claimed`.
- [ ] Inga personuppgifter. Enskild firma har `self_submitted: true` och inga koordinater.
- [ ] Beskrivningen är neutral och beskriver vad som byggs.
- [ ] `npm run validera` är grön.
