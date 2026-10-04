# Bidra till AI-kartan

Tack. Kartan blir bara bättre av dem som står på den och av dem som granskar. Diskussion sker i [Discord](https://discord.gg/ZbV4qB34um); spårbara ärenden i GitHub Issues; ändringar via pull request. Allt följer [OpenSveriges manifest](https://github.com/opensverige/.github/blob/main/manifesto.md): transparens, öppenhet, inga hemligheter i repot.

## Lägga till en organisation

**Utan git:** [fyll i formuläret](https://github.com/opensverige/ai-kartan/issues/new?template=ny-organisation.yml). Ett flöde gör ärendet till en pull request och kommenterar i ärendet om valideringen hittar fel.

**Med git eller GitHubs webbgränssnitt:**

1. Kopiera [data/MALL.yaml](data/MALL.yaml) till `data/organisationer/<id>.yaml`. `id` är ett permanent slug-namn: små bokstäver, siffror, bindestreck.
2. Fyll i varje uppgift med `value`, `status`, `source_url`, `source_type` och `verified_at`. Kommunkoden står inom citattecken; listan finns i [data/geo/kommuner.json](data/geo/kommuner.json).
3. Minst ett belägg under `evidence`: en publik länk till något byggt med AI.
4. Öppna en pull request. CI kör `npm run validera`, kontrollerar länkarna i ändrade filer och bygger sajten.

Kriterierna står i [kriterier.md](kriterier.md). Tre stycken, inga andra.

## Statusdisciplinen

| Status | När |
|---|---|
| `confirmed` | Verifierad mot register, myndighet, oberoende tredje part eller akademisk källa. |
| `claimed` | Organisationens eget ord: webbplats, dokument, pressmeddelande, eget bidrag. |
| `planned` | Uttalat mål, inte uppnått. |
| `unknown` | Inte undersökt. Värdet är `null`. |

Källtypen styr vilken status som är möjlig. `own_site`, `own_docs`, `press` och `self_submitted` ger högst `claimed`. Valideringen stoppar `confirmed` med fel källtyp. Vi ändrar aldrig status på begäran, men vi läser bevis.

## Personuppgifter

- Schemat saknar fält för kontaktpersoner, anställda, ägare, e-post och telefon. Lägg inte till sådana. Valideringen stoppar dem.
- Enskilda firmor läggs bara till av personen själv (`self_submitted: true`), utan organisationsnummer och utan koordinater.
- Positioner är kommunens mittpunkt. Exakta koordinater bara när organisationen själv publicerar en kontorsadress.

## Rätta och ta bort

- [Rättelse](https://github.com/opensverige/ai-kartan/issues/new?template=rattelse.yml) med källa. Svar inom 14 dagar.
- [Borttagning](https://github.com/opensverige/ai-kartan/issues/new?template=borttagning.yml). Nedlagda organisationer markeras först `active: false`. Personuppgifter tas bort på begäran av personen, utan diskussion.

## Verifiera befintliga poster

Det mest värdefulla bidraget: höj ett fält från `claimed` till `confirmed` genom att slå upp organisationsnumret i ett register eller på en oberoende sida som speglar registret, och öppna en pull request som byter `source_url`, `source_type` och `status`. Uppdatera `verified_at` och `record_updated_at`.

## Kod

```bash
npm ci
npm run dev
npm run validera
npm run build
```

- Node 22. Inga andra verktyg.
- Svenska i gränssnitt, kommentarer, commit-meddelanden och dokumentation. Engelska nyckelnamn i datan, så att infra kan flytta in utan översättning.
- Ingen databas, inga nycklar, inga hemligheter. Allt byggs från repot.
- Håll sajten statisk och utan spårning.
- Commit-meddelanden: `data: lägg till Exempelbolaget`, `fix(karta): …`, `docs: …`.

## För den som granskar

Granskningslistan står längst ned i [kriterier.md](kriterier.md). Ett avslag skrivs i pull requesten med hänvisning till kriteriet. Två maintainers utöver initiativtagaren innan publik lansering, med den här filen som rutin.
