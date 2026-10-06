<div align="center">

# AI-kartan

**Tech Embassy – Sveriges öppna AI-karta.** Alla som bygger AI i Sverige, inte bara de som en kommitté har godkänt.

[![Kod: AGPL-3.0](https://img.shields.io/badge/kod-AGPL--3.0-2d492d?style=flat-square)](LICENSE)
[![Data: CC BY 4.0](https://img.shields.io/badge/data-CC%20BY%204.0-2d492d?style=flat-square)](LICENSE-DATA)
[![Validera data och bygg](https://github.com/opensverige/ai-kartan/actions/workflows/validera.yml/badge.svg)](https://github.com/opensverige/ai-kartan/actions/workflows/validera.yml)
[![Discord](https://img.shields.io/discord/1466847548864987289?label=Discord&logo=discord&logoColor=white&color=b72c07&style=flat-square)](https://discord.gg/ZbV4qB34um)

</div>

---

Kartor över svensk AI är ofta kurerade: man ansöker och en grupp väljer. Den här kartan gör ett annat val. Tre kriterier avgör, och vem som helst kan föreslå en organisation. Enskilda firmor tas inte emot än, se [kriterierna](kriterier.md).

**Varje uppgift har källa, datum och status.** Inget rankas, och ingen kan köpa en plats. Koden och datan är öppna, och vem som helst kan lägga till sig själv med en pull request. Byggt av [OpenSverige](https://opensverige.se), med samma metod som [infra.opensverige.se](https://infra.opensverige.se). Oberoende och inte statlig.

→ **Sajten:** [karta.opensverige.se](https://karta.opensverige.se)<br>
→ **Lägg till en organisation:** [tre fält i ett formulär](https://github.com/opensverige/ai-kartan/issues/new?template=1-lagg-till.yml) · [kriterierna](kriterier.md)<br>
→ **Diskutera:** [Discord](https://discord.gg/ZbV4qB34um)

## Principer

Allt ärvs från infra. Bryter en funktion mot en princip, stryks funktionen.

1. **Källa och datum på varje uppgift.** Varje fält har status: `confirmed` (bekräftad), `claimed` (egen uppgift), `planned` (planerad) eller `unknown` (okänd).
2. **Organisationer är källor, aldrig författare.** De kan skicka in uppgifter, men posten ägs av kartan och märks som egen uppgift.
3. **Ingen rankning, inga rekommendationer.** Kartan visar vad som finns, inte vad som är bäst.
4. **Inga betalplatser.**
5. **Öppen kod, öppen data.**
6. **Historiken är vallgraven.** Varje ändring loggas publikt, byggt ur git.
7. **Färskhet bevakas automatiskt.** Larm efter 10 dagar utan ändring och 180 dagar utan omkontroll.
8. **Inga mörka mönster.**
9. **Ordval.** Karta eller översikt, inte register.

## Det här repot

Git-repot är sanningen. Sajten, nedladdningarna och ändringshistoriken byggs från det och kan alltid återskapas.

```
data/organisationer/   en YAML-fil per organisation – den kanoniska datan
data/taxonomi/         organisationstyper, erbjuder, områden, statusar, källtyper
data/geo/              kommuner och län med koder och mittpunkter (CC0), land och vatten (ODbL)
data/MALL.yaml         mall för en ny post, med kommentarer
schema/                JSON Schema för en post
scripts/               validering, ändringshistorik, färskhet, länkkoll, import
src/                   Astro-sajten: karta, lista, organisationssidor, platssidor, API
history/               changelog.json (genereras ur git) och bygglogg.json
.github/               CI, färskhetslarm, ärendemallar, ärende-till-PR
kriterier.md           de tre kriterierna för att vara med
```

### En post

```yaml
id: exempelbolaget
name:
  value: Exempelbolaget
  status: claimed
  source_url: https://exempelbolaget.se
  source_type: own_site
  verified_at: 2026-10-04
org_number:
  value: "556000-0000"
  status: confirmed
  source_url: https://www.allabolag.se/5560000000
  source_type: third_party
  verified_at: 2026-10-04
kommun:
  value: "0180"
  status: confirmed
  source_url: https://www.allabolag.se/5560000000
  source_type: third_party
  verified_at: 2026-10-04
evidence:
  - url: https://github.com/exempelbolaget/svensk-llm
    kind: repo
    verified_at: 2026-10-04
```

Hela mallen: [data/MALL.yaml](data/MALL.yaml). Schemat: [schema/organisation.schema.json](schema/organisation.schema.json). Egen webbplats ger högst `claimed`; bara register, myndighet, oberoende tredje part och akademiska källor ger `confirmed`. Regeln ligger i [scripts/validera.mjs](scripts/validera.mjs) och stoppar en PR som bryter mot den. Schemat saknar fält för kontaktpersoner, anställda och e-post, och valideringen stoppar personuppgifter.

## Bygga lokalt

Kräver Node 22.

```bash
npm ci
npm run dev          # http://localhost:4321
npm run validera     # schema, regler, personuppgifter
npm run build        # validerar och bygger till dist/
```

| Skript | Gör |
|---|---|
| `npm run validera` | Validerar varje fil i `data/organisationer` mot schemat och kartans regler. Exit 1 vid fel. |
| `npm run andringar` | Bygger `history/changelog.json` ur git-historiken: varje ändrat fält med datum. |
| `npm run farskhet` | Färskhetsrapport. Exit 1 när loggen stått still i 10 dagar eller en post gått 180 dagar utan kontroll. |
| `npm run lankkoll` | Kontrollerar att alla länkar i datan svarar. `--andrade main --strikt` för PR-kontroll. |
| `npm run importera:infra` | Importerar svenska leverantörer från infra.opensverige.se som typen `infrastruktur`. |
| `node scripts/ny-organisation.mjs --fil arende.md` | Gör det långa ärendeformuläret till en YAML-fil. |
| `node scripts/tips.mjs --fil arende.md` | Läser det korta formuläret och skriver svaret som boten ger i ärendet. |
| `npm test` | Kör testerna för intaget av nya organisationer och för nedladdningen av ett urval. |

Miljövariabler vid bygge: `SITE_URL` (standard `https://karta.opensverige.se`) och `BASE_PATH` (standard `/`).

## Bidra

Enklast är att skriva i [Discord](https://discord.gg/ZbV4qB34um). Den som hellre använder GitHub har tre vägar, och ingen kräver att du frågar om lov:

1. **Formulär.** [Lägg till en organisation](https://github.com/opensverige/ai-kartan/issues/new?template=1-lagg-till.yml) med tre fält: namn, webbplats och en länk till något ni byggt med AI. Vi skriver posten. Den som vill skriva allt själv använder [det långa formuläret](https://github.com/opensverige/ai-kartan/issues/new?template=ny-organisation.yml), som blir en pull request automatiskt.
2. **Pull request.** Kopiera `data/MALL.yaml` till `data/organisationer/<id>.yaml` direkt i GitHubs webbgränssnitt. CI validerar.
3. **Rättelse eller borttagning.** [Ärendemallar](https://github.com/opensverige/ai-kartan/issues/new/choose). Svar inom 14 dagar.

Läs [CONTRIBUTING.md](CONTRIBUTING.md), [kriterier.md](kriterier.md) och [OpenSveriges manifest](https://github.com/opensverige/.github/blob/main/manifesto.md). AI-agenter som jobbar i repot läser [CLAUDE.md](CLAUDE.md).

## Data och API

Allt publiceras av sajten vid bygge:

- `/api/data.json` – allt, med källa och status per fält
- `/api/data/<id>.json` – en organisation med sin ändringshistorik
- `/api/data.csv`, `/api/data.geojson`
- `/api/andringar.json`, `/api/status.json`
- `/llms.txt`, `/llms-full.txt`, `/feed.xml`

Citera med status och datum: *OpenSverige AI-kartan, ”Organisation”, hämtad ÅÅÅÅ-MM-DD, https://karta.opensverige.se/organisation/id. Data: CC BY 4.0.*

## Licens

- **Kod:** [AGPL-3.0](LICENSE).
- **Data:** [CC BY 4.0](LICENSE-DATA) med attribution ”OpenSverige AI-kartan, karta.opensverige.se”. Enskilda fakta är fria. Uppgifter om enskilda firmor är personuppgifter och omfattas inte av licensen som sådana.
- Kartunderlag: © OpenFreeMap, © OpenMapTiles, data från OpenStreetMap-bidragsgivare. Gränser: geoBoundaries (CC0 / CC BY 3.0). Typsnitt: SIL OFL.

---

*opensverige, ideell förening (org.nr 802557-3422). Vi tar inte emot pengar för att driva någons agenda.*
