# För AI-agenter som arbetar i det här repot

Läs först [OpenSveriges regler för agenter](https://github.com/opensverige/.github/blob/main/FOR_AGENTS.md) och [manifestet](https://github.com/opensverige/.github/blob/main/manifesto.md). Sedan det här.

## Vad repot är

Tech Embassy – Sveriges öppna AI-karta. En statisk Astro-sajt byggd från `data/organisationer/*.yaml`. Varje fält i en post är en uppgift med `value`, `status`, `source_url`, `source_type` och `verified_at`. Metoden är ärvd från infra.opensverige.se och står i `src/pages/metod.astro`. Kriterierna för vem som får vara med står i `kriterier.md`.

## Regler som inte förhandlas

1. **Hitta aldrig på en källa.** Varje `source_url` ska vara en sida du faktiskt har öppnat och som visar värdet. Kan du inte belägga en uppgift: `status: unknown`, `value: null`.
2. **Egen webbplats ger högst `claimed`.** `confirmed` kräver `company_register`, `regulator`, `third_party`, `academic` eller `infra_dataset`. Valideringen stoppar annat.
3. **Inga personuppgifter.** Inga namn, e-postadresser, telefonnummer, gatuadresser eller personnummer. Enskilda firmor läggs aldrig till av en agent, bara av personen själv.
4. **Andra kartor och listor är bara tips om namn.** Kopiera aldrig deras beskrivningar eller uppgifter. Gå alltid till primärkällan. Skälet är katalogskydd (49 § upphovsrättslagen) och metoden.
5. **Neutral svenska.** Beskriv vad som byggs, inte hur bra det är. Inga värdeord.
6. **Märk dig.** `verified_by: agent` på allt du verifierat. AI kontrollerar belägg, aldrig värde: du avgör aldrig om en organisation förtjänar att vara med, bara om länken visar det som påstås.
7. **Ändra aldrig status på begäran** av en organisation. Läs bevis, uppdatera källa och datum.
8. **Inga hemligheter i repot.** Inga nycklar, tokens eller `.env`-filer.
9. **Kör `npm run validera`** innan du är klar. Grön validering är ett krav, inte ett mål.
10. **Bocka aldrig av granskningslistan.** Kommentaren Granskning mot kriterierna på en pull request är människans. Redigera den aldrig, och merga aldrig en pull request som rör en organisation innan en människa har bockat av den.

## Arbetsflöde

```bash
npm ci
npm run validera          # alltid före commit
npm run dev               # förhandsgranska
node scripts/andringar.mjs --skriv-ut   # se vad som ändrats
```

- Ny organisation: kopiera `data/MALL.yaml`, fyll i, validera. Filnamn = `id`.
- Kommunkod: slå upp i `data/geo/kommuner.json`, skriv inom citattecken.
- Datum: dagens datum i `verified_at`, `record_created_at`, `record_updated_at` (ÅÅÅÅ-MM-DD).
- Rör aldrig `history/changelog.json` för hand; den genereras.
- Språk: svenska i text, kommentarer och commit-meddelanden. Engelska nyckelnamn i datan.

## Struktur

| Sökväg | Innehåll |
|---|---|
| `data/organisationer/` | Den kanoniska datan, en fil per organisation |
| `data/taxonomi/` | Tillåtna värden med svenska etiketter |
| `schema/organisation.schema.json` | JSON Schema draft-07 |
| `scripts/validera.mjs` | Schema plus kartans regler, med felmeddelanden på svenska |
| `scripts/lib/organisationer.mjs` | Läsare och härledningar (län, position, färskhet) |
| `src/lib/data.ts` | Laddar allt en gång per bygge |
| `src/components/KartApp.astro` | Karta, filter och lista (MapLibre, OpenFreeMap) |
| `src/pages/organisation/[id].astro` | Permalänk per organisation |
| `scripts/lib/granskning.mjs` | Granskningslistan som en människa bockar av på varje pull request med organisationer |
| `scripts/lib/granskningskorning.mjs` | Körningen som läser pull requesten, skriver listan och sätter läget |
| `.github/workflows/` | Validering, granskning mot kriterierna, historik, färskhet, länkkoll, ärende till PR, Pages |
