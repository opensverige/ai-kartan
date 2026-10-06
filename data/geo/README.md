# Geodata: kommuner och län

Referensdata för AI-kartan: Sveriges 290 kommuner och 21 län med SCB:s koder och namn, slugar, en punkt per enhet samt förenklade gränspolygoner. Filerna i den här mappen och i `public/geo/` är **genererade** av `scripts/geo/bygg-geodata.py`, utom `land.json` som byggs av `scripts/geo/bygg-land.mjs`. Redigera dem inte för hand, kör skripten igen (se längst ned).

Källorna hämtades **2026-10-04**.

## Filer

| Fil | Innehåll |
| --- | --- |
| `data/geo/kommuner.json` | 290 kommuner sorterade på kod: `kod`, `namn`, `slug`, `lan_kod`, `lan_namn`, `lat`, `lng`, `punkt_kalla` |
| `data/geo/lan.json` | 21 län sorterade på kod: `kod`, `namn`, `slug`, `lat`, `lng`, `punkt_kalla` |
| `public/geo/kommuner.geojson` | Kommunpolygoner (290 features), egenskaper `kod`, `namn`, `lan_kod` |
| `public/geo/lan.geojson` | Länspolygoner (21 features), egenskaper `kod`, `namn` |
| `scripts/geo/bygg-geodata.py` | Bygger de fyra filerna ovan |
| `data/geo/land.json` | Land och vatten runt varje kommuns punkt: en mask per kommunkod. Se "Land och vatten" |
| `scripts/geo/bygg-land.mjs` | Bygger `land.json` |

- `kod` är SCB:s kommunkod (4 siffror) respektive länskod (2 siffror), som sträng med ledande nolla. `lan_kod` är kommunkodens två första siffror.
- `namn` är SCB:s namn utan ordet "kommun" (till exempel "Upplands Väsby", "Malung-Sälen", "Gotland"). Länsnamnen innehåller "län".
- `lat` och `lng` är WGS84-grader med 4 decimaler (ca 11 m). Punkten är kommunens eller länets plats på kartan, aldrig en adress.
- `punkt_kalla` anger var punkten kommer ifrån: `wikidata` (koordinaten på kommunens eller länets Wikidata-objekt, oftast centralorten) eller `centroid` (polygonens egen punkt, reserv). Se "Punkterna".

## Källor och licenser

| Data | Källa | Licens |
| --- | --- | --- |
| Koder och namn | SCB, "Län och kommuner i kodnummerordning", 2026 års indelning. <https://www.scb.se/hitta-statistik/regional-statistik-och-kartor/regionala-indelningar/lan-och-kommuner/lan-och-kommuner-i-kodnummerordning/> (SCB publicerar samma lista som Excel och PDF, länkade från sidan) | CC BY 4.0, ange "Källa: SCB" (se nedan) |
| Punkter | Wikidata, koordinat (P625) på kommunens och länets objekt. Frågor mot <https://query.wikidata.org/sparql> | CC0 1.0 (se nedan) |
| Kommunpolygoner | geoBoundaries gbOpen, Sverige ADM2. <https://www.geoboundaries.org/api/current/gbOpen/SWE/ADM2/> | CC0 1.0 (se nedan) |
| Länspolygoner | geoBoundaries gbOpen, Sverige ADM1. <https://www.geoboundaries.org/api/current/gbOpen/SWE/ADM1/> | CC BY 3.0 (se nedan) |
| Land och vatten | OpenStreetMap, läst ur OpenFreeMaps vektorbrickor (OpenMapTiles-schemat, lagret `water`). <https://openfreemap.org/> | ODbL 1.0 (se "Land och vatten") |

### SCB

SCB:s användningsvillkor (<https://www.scb.se/om-scb/om-scb.se-och-anvandningsvillkor/>) skiljer på statistik och geodata som tillgängliggörs som öppna data i statistikdatabasen och geodataplattformen (CC0 1.0) och "allt övrigt material" på webbplatsen (Creative Commons Erkännande 4.0 Internationell, CC BY 4.0, med krav på att ange SCB som källa: "Källa: SCB"). Kodlistan är en vanlig sida på scb.se, inte en tabell i statistikdatabasen, så den säkra tolkningen är CC BY 4.0.

Namnen används som SCB skriver dem. Därför står Falu kommun som "Falun" (SCB:s stavning, kommunen själv skriver Falu kommun) och namnen saknar genitiv-s som finns i de formella namnen ("Österåker" för Österåkers kommun, "Gotland" för Gotlands kommun).

### Wikidata

Wikidatas licenssida (<https://www.wikidata.org/wiki/Wikidata:Licensing>) anger att all strukturerad data (huvud-, egenskaps-, lexem- och EntitySchema-namnrymderna) släpps som public domain under Creative Commons Zero. Koordinaterna är alltså CC0 och kräver ingen källhänvisning.

Två SPARQL-frågor ställs (se `WD_KOMMUNER` och `WD_LAN` i skriptet):

| | Kommuner | Län |
| --- | --- | --- |
| Objekt | instans av kommun (Q127448, "municipality of Sweden"), utan "upphört datum" (P576) eller slutdatum (P582) | instans av Sveriges län (Q200547, "county of Sweden") |
| Nyckel | kommunkod i Sverige (P525) = SCB:s kod | länskod (P507) = SCB:s kod |
| Värde | geografiska koordinater (P625) | geografiska koordinater (P625) |

Villkoret om upphört datum behövs eftersom Wikidata har gamla objekt med samma kommunkod (till exempel Svegs köping, Trosa stad, Salems landskommun). Med villkoret finns exakt ett nuvarande objekt med koordinat för var och en av SCB:s 290 kommunkoder och 21 länskoder. Finns det noll eller flera används polygonens punkt i stället.

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

CC BY 3.0 (<https://creativecommons.org/licenses/by/3.0/>) kräver att upphovspersonen anges, att licensen länkas och att det framgår att materialet bearbetats. Det gäller `lan.geojson`. Länens punkter kommer i första hand från Wikidata, men reservpunkterna (`punkt_kalla` = `centroid`) räknas ur samma polygoner.

### Källhänvisning att visa på webbplatsen

- Koder och namn: "Källa: SCB".
- Koordinater: Wikidata (CC0, ingen källhänvisning krävs men det är god sed att nämna den).
- Kommungränser: "Administrative boundaries courtesy of geoBoundaries.org".
- Länsgränser: "Länsgränser: Erik Frohne, Wikimedia Commons (CC BY 3.0), via geoBoundaries.org. Förenklade."
- Land och vatten: "© OpenStreetMap-bidragsgivare". Kartan visar redan den raden för kartunderlaget.

Filerna ligger i projektets datamapp, men tredjepartsvillkoren ovan gäller även här (projektets egen datalicens finns i `LICENSE-DATA`).

## Punkterna

Varje kommun och län har en punkt (`lat`, `lng`) och ett fält `punkt_kalla`:

- **`wikidata`:** koordinaten (P625) på kommunens eller länets nuvarande Wikidata-objekt, avrundad till 4 decimaler. Den ligger oftast i eller nära centralorten. Punkten godtas om den ligger inuti kommunens (länets) polygon eller högst 2 500 m utanför.
- **`centroid`:** polygonens egen punkt, som reserv när Wikidata saknar en entydig koordinat eller koordinaten ligger mer än 2 500 m utanför polygonen. Det är tyngdpunkten av polygonens största del, eller en inre punkt om tyngdpunkten hamnar utanför delen (se nedan).

Vid byggdatum fick **alla 290 kommuner och alla 21 län en Wikidata-punkt** (inga reservpunkter behövdes).

### Varför toleransen

geoBoundaries-polygonerna är grova (i snitt ca 70 hörn per kommun) och ställvis förskjutna. En strikt regel ("förkasta punkter utanför polygonen", `--punkt-tolerans 0`) skulle ge polygonens tyngdpunkt åt 25 kommuner och Stockholms län, trots att Wikidatas punkter ligger i rätt tätort: Stockholm 162 m utanför, Kalmar 0,5 km, Lund 1,5 km, Ystad 2,0 km, Burlöv 2,3 km. I 20 av de 25 fallen ligger närmaste polygonkant åt ett håll mellan nordväst och öster från punkten (oftast nordost), vilket tyder på en förskjutning i polygonkällan, och 16 av dem finns i Skåne och Västra Götaland. Toleransen på 2 500 m täcker polygonernas felmarginal och fångar ändå koordinater som ligger helt fel. Den kan ändras med `--punkt-tolerans`.

### Så väljs Wikidata-punkten

1. Kommunens objekt slås upp via kommunkoden (P525), länets via länskoden (P507), enligt tabellen under "Wikidata".
2. Finns det inte exakt ett objekt med koordinat används polygonens punkt.
3. Annars avrundas koordinaten till 4 decimaler och avståndet till polygonen i den skrivna GeoJSON-filen beräknas (0 m om punkten ligger inuti). Är avståndet högst toleransen blir punkten `wikidata`, annars `centroid`.

Wikidata-punkterna ligger i median 8,0 km från polygonernas egna punkter (högst 66 km, Älvdalen) för kommunerna och i median 24,8 km (högst 76 km) för länen.

### Polygonens egen punkt (reserven)

1. Polygonen hämtas från geoBoundaries. Består den av flera delar (öar, skärgård) väljs den **största delen** efter yta, så att punkten hamnar på fastlandet eller huvudön.
2. Delens tyngdpunkt beräknas med polygonformeln (yttre ring minus hål) i en ytriktig projektion (Lambert azimutal equal-area, centrum 63° N 16° Ö, jordradie 6 371 007,2 m) och räknas tillbaka till WGS84. Ytriktig projektion gör att långa, smala kommuner i norr får rätt tyngdpunkt.
3. Ligger tyngdpunkten utanför delen (konkava former) används i stället mitten av det längsta intervallet inom delen längs samma breddgrad (samma princip som `ST_PointOnSurface`). Det gäller bara **Norrköping (0581)**, vars kommun kröker sig runt Bråviken: tyngdpunkten (58,6226, 16,2946) hamnar i viken och ersätts av 58,6229, 15,9625.
4. Resultatet avrundas till 4 decimaler.

Reservpunkterna kan skrivas ut för alla enheter med `--utan-wikidata`. De jämfördes vid framtagningen med en oberoende beräkning i shapely och PROJ (högst 6 m skillnad, dvs. avrundningen) och ligger alla inuti sin egen polygon.

Polygonerna omfattar landyta och insjöar men inte havet (kommunernas sammanlagda yta blir ca 447 000 km²). Ingen landmask har använts.

### Kontroller

Skriptet kontrollerar efter varje bygge att `punkt_kalla` är `wikidata` eller `centroid`, att varje `centroid`-punkt ligger inuti sin polygon och att varje `wikidata`-punkt ligger högst toleransen utanför sin polygon i de skrivna filerna. Vid framtagningen jämfördes dessutom varje `wikidata`-punkt med Wikidatas rådata (samma värde avrundat till 4 decimaler).

## Land och vatten

Kartan ritar organisationer på kommunnivå: de radas upp i ett rutnät runt kommunens punkt. Många punkter ligger vid en sjö eller vid kusten, och utan hänsyn till vattnet hamnar organisationer i Vättern eller i Riddarfjärden. `land.json` säger därför vilka rutor som ligger på land.

- **Rutnätet** är detsamma för alla kommuner: 673 rutor i sexkantsmönster, 220 m mellan rutorna, upp till 3 km från punkten. Ordningen är fast, närmast punkten först. Det står i `scripts/lib/landplatser.mjs`.
- **Masken** är en hexsträng per kommunkod, fyra rutor per tecken med den första rutan i den högsta biten. En etta betyder land.
- **Land** betyder att rutans mitt och sex punkter 60 m därifrån alla ligger utanför vattenytorna. Marginalen gör att pricken inte ritas halvvägs ut i vattnet.
- **Vattnet** är lagret `water` i OpenFreeMaps vektorbrickor på zoom 12, samma underlag som kartan visar. Där finns hav, sjöar, breda vattendrag och även små ytor som dammar och fontäner.
- **Fördelningen** görs vid bygget: organisationerna i en kommun får var sin landruta, närmast punkten först. I en kommun med få organisationer används ett glesare rutnät (660 m eller 440 m mellan rutorna, inom 1,5 km) så att namnen får plats. Ordningen mellan organisationerna är godtycklig men stabil. Vilken ruta en organisation får säger ingenting om var den finns.

`land.json` är härledd ur OpenStreetMap och ligger därför under Open Database License 1.0 (<https://opendatacommons.org/licenses/odbl/1-0/>), © OpenStreetMap-bidragsgivare (<https://www.openstreetmap.org/copyright>). Det skiljer den från resten av mappen. Fälten `brickor` och `zoom` i filen säger vilken utgåva av brickorna masken byggdes på.

Kontroll vid bygget: 290 kommuner, i snitt 565 av 673 rutor på land. Minst land har Lysekil (165 rutor), Ystad (196) och Karlsborg (214). I 32 kommuner ligger själva punkten i vatten eller närmare stranden än 60 m, bland dem Jönköping, Göteborg, Karlstad och Kalmar. Där börjar raden i närmaste landruta.

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

- **Wikidatas punkter är inte alltid centrum.** Koordinaterna på kommunobjekten kommer från olika importer och redaktörer. 242 av 290 har bågminutsprecision (hela bågminuter, ca 1 till 2 km) och några ligger i kommunens mitt i stället för i centralorten: Malmö kommuns punkt (55,5650, 13,0186) ligger ca 4,5 km söder om Malmö centrum. Wikidata ändras dessutom löpande, så en ny nedladdning kan ge andra koordinater.
- **Grov geometri.** Kommunpolygonerna har i snitt ca 70 hörn. De räcker för en riksöversikt men inte för inzoomning på kommunnivå, och kanterna kan ligga upp till ca 2 km fel (se "Varför toleransen").
- **Lagren passar inte ihop.** Länen kommer från en annan källa och ett annat år (2009, spårade ur en SVG-karta) än kommunerna (2017). Arealerna stämmer inom några procent men formerna är förskjutna: sammanslagna kommuner avviker från länspolygonen med i median 8,5 % av länets yta (högst ca 20 %, Blekinge och Stockholm), tyngdpunkterna ligger i median 2 km ifrån varandra och skärgårdens öar skiljer sig åt. Rita inte lagren över varandra och räkna inte med att länsgränserna följer kommungränserna. Sju kommunpunkter ligger utanför sitt läns polygon (Kalmar, Karlskrona, Båstad, Ystad, Strömstad, Härnösand och Piteå), alla vid kusten.
- **Kommunlagret** har 18 små glapp mellan grannkommuner (sammanlagt 0,43 km², det största 0,21 km²) och försumbara överlapp (sammanlagt 0,001 km²).
- **Årtal.** Koderna och namnen är SCB:s 2026, polygonerna avser 2017 (kommuner) och 2009 (län). Båda kommunkällorna har 290 kommuner, men eventuella gränsjusteringar efter 2017 finns inte i polygonerna.

## Generera om

Från projektroten:

```sh
python scripts/geo/bygg-geodata.py
node scripts/geo/bygg-land.mjs
```

Det andra skriptet behöver bara köras när kommunernas punkter eller rutnätet har ändrats. Det hämtar ungefär 1 300 brickor (28 MB) till samma cache-mapp och skriver `land.json`. Med `--kontroll` skriver det ingenting och säger bara om filen stämmer med kartunderlaget. Resten av avsnittet gäller det första skriptet.

Det kräver Python 3 (testat med 3.12) och internet, men inga paket. Skriptet:

1. hämtar SCB-sidan, geoBoundaries-filerna och Wikidata-koordinaterna till en cache-mapp utanför projektet (standard `<systemets tempmapp>/ai-kartan-geo`),
2. matchar namn, bygger polygonerna, väljer punkter och skriver de fyra filerna (en fil som inte ändrats skrivs inte om),
3. kontrollerar resultatet (290 och 21 enheter, unika koder och slugar, `lan_kod` finns i `lan.json`, punkter inom Sverige, `punkt_kalla`, GeoJSON läsbar med slutna och icke korsande ringar, filstorlekar, punkter mot sina polygoner) och avslutar med felkod om något inte stämmer.

Flaggor:

- `--cache MAPP` väljer annan cache-mapp.
- `--ny-nedladdning` hämtar källorna på nytt även om de finns i cachen.
- `--utan-wikidata` hämtar inget från Wikidata och använder polygonernas punkter för alla (`punkt_kalla` blir `centroid`).
- `--punkt-tolerans METER` ändrar hur långt utanför polygonen en Wikidata-punkt får ligga (standard 2500, `0` betyder strikt inuti).

Samma cache ger exakt samma filer (byte för byte). Wikidata-svaret cachas under frågans hash och ändras när någon redigerar koordinaterna, så en ny nedladdning kan flytta enstaka punkter. Skriptet varnar om geoBoundaries har gett ut ett nytt bygge än det som beskrivs här; kontrollera då källa och licens och uppdatera den här filen. Om SCB ändrar sidans struktur eller antalet kommuner stannar skriptet med ett felmeddelande.
