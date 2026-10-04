# Geodata: kommuner och län

Referensdata för AI-kartan: Sveriges 290 kommuner och 21 län med SCB:s koder och namn, slugar, en representativ punkt per enhet samt förenklade gränspolygoner. Filerna i den här mappen och i `public/geo/` är **genererade** av `scripts/geo/bygg-geodata.py`. Redigera dem inte för hand, kör skriptet igen (se längst ned).

Källorna hämtades **2026-10-04**.

## Filer

| Fil | Innehåll |
| --- | --- |
| `data/geo/kommuner.json` | 290 kommuner sorterade på kod: `kod`, `namn`, `slug`, `lan_kod`, `lan_namn`, `lat`, `lng` |
| `data/geo/lan.json` | 21 län sorterade på kod: `kod`, `namn`, `slug`, `lat`, `lng` |
| `public/geo/kommuner.geojson` | Kommunpolygoner (290 features), egenskaper `kod`, `namn`, `lan_kod` |
| `public/geo/lan.geojson` | Länspolygoner (21 features), egenskaper `kod`, `namn` |
| `scripts/geo/bygg-geodata.py` | Bygger alla fyra filerna |

- `kod` är SCB:s kommunkod (4 siffror) respektive länskod (2 siffror), som sträng med ledande nolla. `lan_kod` är kommunkodens två första siffror.
- `namn` är SCB:s namn utan ordet "kommun" (till exempel "Upplands Väsby", "Malung-Sälen", "Gotland"). Länsnamnen innehåller "län".
- `lat` och `lng` är WGS84-grader med 4 decimaler (ca 11 m). De är en representativ punkt, inte centralorten och aldrig en adress (se "Punkterna").

## Källor och licenser

| Data | Källa | Licens |
| --- | --- | --- |
| Koder och namn | SCB, "Län och kommuner i kodnummerordning", 2026 års indelning. <https://www.scb.se/hitta-statistik/regional-statistik-och-kartor/regionala-indelningar/lan-och-kommuner/lan-och-kommuner-i-kodnummerordning/> (SCB publicerar samma lista som Excel och PDF, länkade från sidan) | CC BY 4.0, ange "Källa: SCB" (se nedan) |
| Kommunpolygoner | geoBoundaries gbOpen, Sverige ADM2. <https://www.geoboundaries.org/api/current/gbOpen/SWE/ADM2/> | CC0 1.0 (se nedan) |
| Länspolygoner | geoBoundaries gbOpen, Sverige ADM1. <https://www.geoboundaries.org/api/current/gbOpen/SWE/ADM1/> | CC BY 3.0 (se nedan) |

### SCB

SCB:s användningsvillkor (<https://www.scb.se/om-scb/om-scb.se-och-anvandningsvillkor/>) skiljer på statistik och geodata som tillgängliggörs som öppna data i statistikdatabasen och geodataplattformen (CC0 1.0) och "allt övrigt material" på webbplatsen (Creative Commons Erkännande 4.0 Internationell, CC BY 4.0, med krav på att ange SCB som källa: "Källa: SCB"). Kodlistan är en vanlig sida på scb.se, inte en tabell i statistikdatabasen, så den säkra tolkningen är CC BY 4.0.

Namnen används som SCB skriver dem. Därför står Falu kommun som "Falun" (SCB:s stavning, kommunen själv skriver Falu kommun) och namnen saknar genitiv-s som finns i de formella namnen ("Österåker" för Österåkers kommun, "Gotland" för Gotlands kommun).

### Kommungränser: geoBoundaries ADM2

Fälten som API:t returnerade 2026-10-04:

| Fält | Värde |
| --- | --- |
| `boundaryID` | SWE-ADM2-70781695 (bygge 2023-12-12) |
| `boundaryYearRepresented` | 2017 |
| `boundarySource` | geoBoundaries, Wikimedia Commons |
| `boundaryLicense` | CC0 1.0 Universal (CC0 1.0) Public Domain Dedication |
| `licenseDetail` | license of second source is Public Domain |
| `licenseSource` / `boundarySourceURL` | `commons.wikimedia.org/wiki/File` |

`licenseSource` och `boundarySourceURL` saknar filnamn, så den ursprungliga Commons-filen går inte att spåra via metadatan. Licensuppgiften (CC0 för bearbetningen, public domain för underlaget) är därför geoBoundaries egen och går inte att kontrollera närmare här.

Använd fil: `geoBoundaries-SWE-ADM2_simplified.geojson` från <https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/SWE/ADM2/geoBoundaries-SWE-ADM2_simplified.geojson> (den förenklade versionen, ca 970 kB, i snitt ca 70 hörn per kommun).

geoBoundaries ber om källhänvisning även för CC0-data (`geoBoundaries-SWE-ADM2-metaData.txt`: "Usage of the geoBoundaries Database requires citation"). Antingen Runfola, D. m.fl. (2020), *geoBoundaries: A global database of political administrative boundaries*, PLoS ONE 15(4): e0231866, <https://doi.org/10.1371/journal.pone.0231866>, eller en länk till geoboundaries.org, till exempel "Administrative boundaries courtesy of geoBoundaries.org".

### Länsgränser: geoBoundaries ADM1

| Fält | Värde |
| --- | --- |
| `boundaryID` | SWE-ADM1-68755315 (bygge 2023-12-12) |
| `boundaryYearRepresented` | 2009 |
| `boundarySource` | geoBoundaries, Erik Frohne |
| `boundaryLicense` | Creative Commons Attribution 3.0 License |
| `licenseDetail` | `nan` i API-svaret (tomt i metaData-filerna) |
| `licenseSource` | `commons.wikimedia.org/w/index.php?curid=5675559` |
| `boundarySourceURL` | `upload.wikimedia.org/wikipedia/commons/3/31/Sweden_Uppsala_location_map.svg` |

Använd fil: `geoBoundaries-SWE-ADM1_simplified.geojson` från <https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/SWE/ADM1/geoBoundaries-SWE-ADM1_simplified.geojson> (ca 1,4 MB).

CC BY 3.0 (<https://creativecommons.org/licenses/by/3.0/>) kräver att upphovspersonen anges, att licensen länkas och att det framgår att materialet bearbetats. Det gäller `lan.geojson` och, eftersom länens punkter räknas ur samma polygoner, också `lat` och `lng` i `lan.json`.

### Källhänvisning att visa på webbplatsen

- Koder och namn: "Källa: SCB".
- Kommungränser: "Administrative boundaries courtesy of geoBoundaries.org".
- Länsgränser: "Länsgränser: Erik Frohne, Wikimedia Commons (CC BY 3.0), via geoBoundaries.org. Förenklade."

Filerna ligger i projektets datamapp, men tredjepartsvillkoren ovan gäller även här (projektets egen datalicens finns i `LICENSE-DATA`).

## Punkterna

Per kommun och län:

1. Polygonen hämtas från geoBoundaries. Består den av flera delar (öar, skärgård) väljs den **största delen** efter yta, så att punkten hamnar på fastlandet eller huvudön.
2. Delens tyngdpunkt beräknas med polygonformeln (yttre ring minus hål) i en ytriktig projektion (Lambert azimutal equal-area, centrum 63° N 16° Ö, jordradie 6 371 007,2 m) och räknas tillbaka till WGS84. Ytriktig projektion gör att långa, smala kommuner i norr får rätt tyngdpunkt.
3. Ligger tyngdpunkten utanför delen (konkava former) används i stället mitten av det längsta intervallet inom delen längs samma breddgrad (samma princip som `ST_PointOnSurface`). Det gäller bara **Norrköping (0581)**, vars kommun kröker sig runt Bråviken: tyngdpunkten (58,6226, 16,2946) hamnar i viken och ersätts av 58,6229, 15,9625, ca 14 km väster om centrum.
4. Resultatet avrundas till 4 decimaler.

Punkten är alltså mittpunkten av kommunens polygon, inte centralorten. För stora kommuner kan den ligga långt från orten: Kiruna 40 km, Älvdalen 66 km, Storuman 62 km, Jokkmokk 62 km (jämfört med Wikidatas koordinater, oftast centralorten). Stockholm hamnar 6 km söder om centrum eftersom kommunen sträcker sig långt söderut.

Kommunpolygonerna omfattar landyta och insjöar men inte havet (kommunernas sammanlagda yta blir ca 447 000 km²). Ingen landmask har använts, så "på land" betyder "inom kommunens polygon".

Kontroller vid framtagningen: tyngdpunkterna jämfördes med en oberoende beräkning i shapely och PROJ (högst 6 m skillnad, dvs. avrundningen), alla 290 kommunpunkter och 21 länspunkter ligger inuti sin egen polygon, och alla 21 länspunkter ligger även inom de sammanslagna kommunerna.

## Namn och slugar

- **Namnmatchning:** SCB-posterna kopplas till geoBoundaries-polygoner via namn (exakt träff, därefter utan diakriter om det är entydigt). 289 av 290 kommuner och alla 21 län matchar exakt. Den enda manuella matchningen är **1480 Göteborg**, som heter "Gothenburg" i geoBoundaries (`GB_ALIAS` i skriptet).
- **Slug:** gemener, å och ä blir a, ö blir o, é blir e, mellanslag och övriga tecken blir `-` ("Upplands Väsby" blir `upplands-vasby`, "Östra Göinge" blir `ostra-goinge`). Länens slugar slutar på `-lan` (`uppsala-lan`), så kommun- och länsslugar kan delas i en gemensam namnrymd för platser.
- **Håbo och Habo:** regeln ovan ger `habo` för både Håbo (0305, Uppsala län) och Habo (0643, Jönköpings län). Håbo har därför undantaget `haabo` (`SLUGG_UNDANTAG` i skriptet). Räkna inte om slugar ur namn, slå upp via `kod` eller `slug` i `kommuner.json`.

## GeoJSON-filerna

- WGS84 (RFC 7946, ingen `crs`-medlem). Yttre ringar går moturs och hål medurs, som RFC 7946 anger. MapLibre bryr sig inte om lindningen. d3-geo använder motsatt lindning, vänd då ringarna (till exempel med Turfs `rewind` med `reverse: true`).
- Koordinater med högst 4 decimaler. En feature per rad, så att diffar blir läsbara.
- **Kommuner:** ingen förenkling utöver avrundning och städning. Filen blir ca 0,4 MB, långt under gränsen 1,5 MB.
- **Län:** utan förenkling blir filen ca 610 kB, strax över gränsen 600 kB. Skriptet förenklar därför med Douglas-Peucker och väljer den minsta toleransen i hela meter som ryms: vid byggdatum **101 m**, vilket ger ca 597 kB.
- **Städning och reparation** (båda lagren): vid avrundning till 4 decimaler kan några smala nålspetsar och trånga vikar i källan börja korsa eller nudda sig själva. Skriptet hanterar hörnen som heltal, tar bort upprepade hörn, hörn på rät linje och nålspetsar, och reparerar återstående konflikter genom att ta bort det hörn som ger minst arealändring. Vid byggdatum gällde det 41 av 20 365 hörn i kommunlagret och 7 av 33 799 i länslagret, och ingen del eller ö försvann (314 respektive 281 delar behålls).
- **Giltighet:** varje genväg i Douglas-Peucker kontrolleras mot featurens övriga sträckor, så förenklingen skapar inga korsande ringar (en naiv Douglas-Peucker gav självkorsande ringar i 14 av 21 län). Skriptet testar det med exakt heltalsaritmetik efter varje bygge, och vid framtagningen bekräftade shapely att alla 311 geometrier är giltiga.

## Kända begränsningar

- **Grov geometri.** Kommunpolygonerna har i snitt ca 70 hörn. De räcker för en riksöversikt men inte för inzoomning på kommunnivå.
- **Lagren passar inte ihop.** Länen kommer från en annan källa och ett annat år (2009, spårade ur en SVG-karta) än kommunerna (2017). Arealerna stämmer inom några procent men formerna är förskjutna: sammanslagna kommuner avviker från länspolygonen med i median 8,5 % av länets yta (högst ca 20 %, Blekinge och Stockholm), tyngdpunkterna ligger i median 2 km ifrån varandra och skärgårdens öar skiljer sig åt. Rita inte lagren över varandra och räkna inte med att länsgränserna följer kommungränserna. Två kommunpunkter ligger strax utanför sitt läns polygon: Uddevalla 0,5 km och Öckerö 0,2 km.
- **Kommunlagret** har 18 små glapp mellan grannkommuner (sammanlagt 0,43 km², det största 0,21 km²) och försumbara överlapp (sammanlagt 0,001 km²).
- **Årtal.** Koderna och namnen är SCB:s 2026, polygonerna avser 2017 (kommuner) och 2009 (län). Båda kommunkällorna har 290 kommuner, men eventuella gränsjusteringar efter 2017 finns inte i polygonerna.

## Generera om

Från projektroten:

```sh
python scripts/geo/bygg-geodata.py
```

Det kräver Python 3 (testat med 3.12) och internet, men inga paket. Skriptet:

1. hämtar SCB-sidan och geoBoundaries-filerna till en cache-mapp utanför projektet (standard `<systemets tempmapp>/ai-kartan-geo`),
2. matchar namn, beräknar punkter och bygger de fyra filerna,
3. kontrollerar resultatet (290 och 21 enheter, unika koder och slugar, `lan_kod` finns i `lan.json`, punkter inom Sverige, GeoJSON läsbar med slutna och icke korsande ringar, filstorlekar, punkter inuti sina polygoner) och avslutar med felkod om något inte stämmer.

Flaggor:

- `--cache MAPP` väljer annan cache-mapp.
- `--ny-nedladdning` hämtar källorna på nytt även om de finns i cachen.
- `--wikidata` kontrollerar dessutom att alla SCB-koder finns som kommunkod (P525) i Wikidata och visar vilka punkter som ligger längst från Wikidatas koordinater.

Samma källor ger exakt samma filer (byte för byte). Skriptet varnar om geoBoundaries har gett ut ett nytt bygge än det som beskrivs här; kontrollera då källa och licens och uppdatera den här filen. Om SCB ändrar sidans struktur eller antalet kommuner stannar skriptet med ett felmeddelande.
