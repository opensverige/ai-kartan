# Bidra till AI-kartan

Tack. Kartan blir bara bättre av dem som står på den och av dem som granskar. Diskussion sker i [Discord](https://discord.gg/ZbV4qB34um); spårbara ärenden i GitHub Issues; ändringar via pull request. Allt följer [OpenSveriges manifest](https://github.com/opensverige/.github/blob/main/manifesto.md): transparens, öppenhet, inga hemligheter i repot.

## Lägga till en organisation

**Enklast:** [tre fält](https://github.com/opensverige/ai-kartan/issues/new?template=1-lagg-till.yml): namn, webbplats och en länk till något ni byggt med AI. Ett flöde svarar i ärendet, säger till om organisationen redan finns och tar bort nummer som ser ut som personnummer. Sedan skriver en granskare posten, se [Från tips till post](#från-tips-till-post).

**Hela posten själv, utan git:** [det långa formuläret](https://github.com/opensverige/ai-kartan/issues/new?template=ny-organisation.yml). Ett flöde gör ärendet till en pull request, sätter dig som medförfattare och kommenterar i ärendet om valideringen hittar fel.

**Med git eller GitHubs webbgränssnitt:**

1. Kopiera [data/MALL.yaml](data/MALL.yaml) till `data/organisationer/<id>.yaml`. `id` är ett permanent slug-namn: små bokstäver, siffror, bindestreck.
2. Fyll i varje uppgift med `value`, `status`, `source_url`, `source_type` och `verified_at`. Kommunkoden står inom citattecken; listan finns i [data/geo/kommuner.json](data/geo/kommuner.json).
3. Minst ett belägg under `evidence`: en publik länk till något byggt med AI.
4. Öppna en pull request. CI kör `npm run validera`, kontrollerar länkarna i ändrade filer och bygger sajten.

Kriterierna står i [kriterier.md](kriterier.md). Tre stycken, inga andra.

## Från tips till post

För granskare. Ett ärende med etiketten `tips` innehåller bara namn, webbplats och en länk. Resten skriver vi:

1. Läs webbplatsen och belägget. Uppfylls inte ett kriterium stängs ärendet med etiketten `kriterium-1`, `kriterium-2` eller `kriterium-3` och en mening om varför.
2. Kopiera [data/MALL.yaml](data/MALL.yaml) till `data/organisationer/<id>.yaml` och fyll i. Det som står på organisationens egen webbplats blir `claimed` med `own_site`. Det som går att slå upp i ett register blir `confirmed`.
3. En AI-agent får göra utkastet, märkt `verified_by: agent`. Tips om enskilda firmor läggs inte in än. Boten svarar att det kommer, och ärendet får ligga kvar.
4. Öppna en pull request med `Closes #<ärendets nummer>` i beskrivningen, så stängs ärendet när posten är inne.
5. Ge tipsaren erkännande. Lägg raden `Co-authored-by: <användarnamn> <<id>+<användarnamn>@users.noreply.github.com>` sist i commit-meddelandet, så syns de som bidragsgivare på repot. Id-numret står på `https://api.github.com/users/<användarnamn>`. Gör inte det för en enskild firma: namnet skulle ligga kvar i historiken även om posten tas bort.

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
- Enskilda firmor läggs bara till av personen själv (`self_submitted: true`), utan organisationsnummer och utan koordinater. Tills vidare tas de inte emot alls: det öppnar när det går att begära borttagning utan konto.
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
npm test
npm run build
```

- Node 22. Inga andra verktyg.
- Svenska i gränssnitt, kommentarer, commit-meddelanden och dokumentation. Engelska nyckelnamn i datan, så att infra kan flytta in utan översättning.
- Ingen databas, inga nycklar, inga hemligheter. Allt byggs från repot.
- Håll sajten statisk, utan kakor och utan spårning av enskilda. Besök räknas anonymt, se integritetssidan. Lägg inte till fler skript som räknar eller följer besökare, och anropa aldrig räkningens `identify`, `group` eller `enableCookie`: de gör räkningen till ett sparat id.
- Commit-meddelanden: `data: lägg till Exempelbolaget`, `fix(karta): …`, `docs: …`.

## För den som granskar

Varje pull request som rör en fil i `data/organisationer/` får en kommentar med rubriken Granskning mot kriterierna. Där står granskningslistan ur [kriterier.md](kriterier.md) som punkter, en uppsättning per organisation. Under varje organisation står det filen själv anger: namn, typ, organisationsnummer med källa, beskrivning, webbplats och belägg. Ingen maskin har öppnat källorna. Öppna dem, pröva varje punkt och bocka av den. Läget med samma namn är gult tills allt är avbockat.

- Du bockar av genom att klicka i rutorna. Det kräver skrivrätt i repot.
- En bock gäller filens text som den såg ut när du bockade. Ändras filen nollställs organisationens punkter.
- AI får hjälpa dig att kontrollera att ett belägg visar det som påstås, men listan är din. Bockar som en bot eller en app sätter tas bort igen. En agent som arbetar inloggad som du går inte att skilja från dig. Den regeln vilar därför på dig.
- Listan gäller organisationer. Ändringar av kriterier, schema, validering och flöden granskas inte av den, även när läget är grönt.
- Sista punkten i kriterier.md, att `npm run validera` är grön, prövas av kontrollen Validera data och bygg.
- Högst 30 organisationer per pull request. Fler än så delas upp.
- Ett avslag skrivs i pull requesten med hänvisning till kriteriet. Tips från det korta formuläret hanteras enligt [Från tips till post](#från-tips-till-post). Den här filen är rutinen för alla som granskar.

### Göra granskningen tvingande

Läget heter Granskning mot kriterierna. Det blir tvingande när det läggs till som obligatorisk kontroll för `main` under Settings → Rules, tillsammans med Validera data och bygg. Då går ingen pull request med en organisation att merga innan listan är avbockad, inte heller för den som äger repot. Raden Granskningslista / Skriv listan och sätt läget är flödets egen körning och ska inte väljas.

En pull request som var öppen innan flödet fanns får inget läge av sig själv. Kör flödet Granskningslista för hand med pull requestens nummer: Actions → Granskningslista → Run workflow. Pull requests ur ärendeformuläret startar flödet själva.
