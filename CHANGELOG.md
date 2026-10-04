# Vad vi byggt

Kodens och funktionernas historik. Dataändringar loggas separat och automatiskt i `history/changelog.json` och på sajten under Ändringar. Samma rader som här finns maskinläsbart i `history/bygglogg.json`.

## 2026-10-04

- Första versionen av Tech Embassy – Sveriges öppna AI-karta.
- Datamodell: en YAML-fil per organisation, varje fält med källa, datum och status (`confirmed`, `claimed`, `planned`, `unknown`). JSON Schema och validering med regler för statusdisciplin och personuppgifter.
- Sajt (Astro, statisk): karta med filter på erbjuder, typ, område och län; lista; en sida per organisation med källa och datum per fält, citatblock och utskriftsläge; sidor per kommun och län; ändringshistorik; metod, kriterier, bidra, om, integritet, data.
- Karta: MapLibre GL med OpenFreeMap-kartunderlag, kluster, färg per organisationstyp, positioner på kommunnivå.
- Nedladdning och API: JSON, CSV, GeoJSON, per organisation, ändringar, status, llms.txt, llms-full.txt, Atom-flöde, sitemap.
- Automatik: validering och länkkoll på varje pull request, ändringshistorik ur git, dagligt färskhetslarm (10 dagar utan rad, 180 dagar utan omkontroll), veckovis länkkontroll, ärendeformulär som blir pull request.
- Import av svenska leverantörer från infra.opensverige.se som typen infrastruktur.
