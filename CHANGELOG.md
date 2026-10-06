# Vad vi byggt

Kodens och funktionernas historik. Dataändringar loggas separat och automatiskt i `history/changelog.json` och på sajten under Ändringar. Samma rader som här finns maskinläsbart i `history/bygglogg.json`.

## 2026-10-06

- Valideringen prövar belägg mot organisationstypen. Varje typ har en lista över sorters belägg som räknas, i `data/taxonomi/typer.json`, och en post behöver minst en länk som är dess egen. Båda ger en anmärkning, inte ett fel.
- Förslag till förfinade kriterier i `docs/kriterier-forslag.md`, prövat mot befintliga poster i `docs/kriterieprov-2026-10-06.md`. Kriterierna i `kriterier.md` gäller tills förslaget är antaget.
- Tätare lista på kartsidan: varje organisation tar en tredjedel så mycket höjd som förut, så att fler syns direkt. Beskrivningen visas på en rad, resten i detaljvyn. Listsidan har kvar de större korten.
- Koppling till AI-Infra: organisationer som finns där är märkta i listan och länkar till sin sida i detaljvyn. Den som filtrerar på infrastruktur får en länk till jämförelsen överst i listan, och AI-Infra står i menyn.
- Sidan Bidra går att skumma: vägarna in och vad vi behöver syns direkt, och resten ligger i fällbara avsnitt. Kodexemplet är kortare och visas först när man öppnar "Skriv hela posten själv". Avsnittet Rätta eller ta bort på organisationssidorna är också kortare.
- Enskilda firmor tas inte emot än. Det öppnar när det går att begära borttagning utan konto, och det står i formulären, på sidan Bidra, i kriterierna och på integritetssidan.
- Vägarna in är tydligare: sidan Bidra leder med Discord (kanalen infra-intag) och sedan GitHub, och säger vilket konto som krävs. E-post och ett formulär utan konto står som kommande. Samma val finns under Rätta eller ta bort på varje organisationssida.
- Sajten säger tydligare att den drivs ideellt av föreningen OpenSverige och inte av ett företag: i sidhuvudet, i kartans ingress och på sidan Bidra.
- Filtret Bekräftat är borttaget. Nästan alla poster har minst ett bekräftat fält, så det sorterade inte bort något.
- Länken till AI-Infra visar systersajtens logotyp.
- Ladda ner urvalet som CSV från kartan och listan, med källa och datum per uppgift. Samma kolumner som hela datasetet, men med semikolon mellan fälten så att filen öppnas direkt i Excel.

## 2026-10-05

- Ny logotyp: en hand i pixelstil som håller en röd kartnål. Alla ikoner och delningsbilder byggs nu ur en enda bild, `scripts/brand/logotyp.png`, i stället för ur ett pixelraster i skriptet. `logo.svg` är borttagen; sidhuvudet och webbläsarikonen använder PNG.
- Kortare väg in på kartan: formuläret "Lägg till en organisation" har tre fält (namn, webbplats, länk till något byggt med AI). Ett flöde svarar i ärendet, säger till om organisationen redan finns och tar bort nummer som ser ut som personnummer. Posten skrivs sedan av en granskare.
- Det tidigare formuläret finns kvar som "Lägg in hela posten själv". Den som skickar in det står som medförfattare till ändringen och syns som bidragsgivare på repot.
- Första testerna: `npm test` kör reglerna för intaget och går i CI.
- Nytt gränssnitt för kartan och listan: kartan fyller skärmen, sökfältet ligger mitt i sidhuvudet och visar träffar på organisationer, kommuner och län medan man skriver.
- Filtren är piller som flyter över kartan, med antal per val räknat på det aktuella urvalet. I smal vy ligger de i ett blad bakom knappen Filter.
- Vänsterpanelen visar brödsmulor, antal och kort per organisation. Ett kort eller en punkt på kartan öppnar en detaljvy med länk till källor och belägg. I smal vy är panelen ett bottenblad. Bakåt i webbläsaren stänger detaljvyn.
- Sidhuvudet säger att kartan är oberoende och inte statlig. Varje kort visar hur många fält som är bekräftade, och detaljvyn länkar till rättelse.
- Kluster där alla organisationer hör till samma kommun öppnar kommunen i panelen. Den valda organisationen ritas alltid synligt, även inne i ett kluster.

## 2026-10-04

- Första versionen av Tech Embassy – Sveriges öppna AI-karta.
- Datamodell: en YAML-fil per organisation, varje fält med källa, datum och status (`confirmed`, `claimed`, `planned`, `unknown`). JSON Schema och validering med regler för statusdisciplin och personuppgifter.
- Sajt (Astro, statisk): karta med filter på erbjuder, typ, område och län; lista; en sida per organisation med källa och datum per fält, citatblock och utskriftsläge; sidor per kommun och län; ändringshistorik; metod, kriterier, bidra, om, integritet, data.
- Karta: MapLibre GL med OpenFreeMap-kartunderlag, kluster, färg per organisationstyp, positioner på kommunnivå.
- Nedladdning och API: JSON, CSV, GeoJSON, per organisation, ändringar, status, llms.txt, llms-full.txt, Atom-flöde, sitemap.
- Automatik: validering och länkkoll på varje pull request, ändringshistorik ur git, dagligt färskhetslarm (10 dagar utan rad, 180 dagar utan omkontroll), veckovis länkkontroll, ärendeformulär som blir pull request.
- Import av svenska leverantörer från infra.opensverige.se som typen infrastruktur.
