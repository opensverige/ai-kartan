# Vad vi byggt

Kodens och funktionernas historik. Dataändringar loggas separat och automatiskt i `history/changelog.json` och på sajten under Ändringar. Samma rader som här finns maskinläsbart i `history/bygglogg.json`.

## 2026-10-05

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
