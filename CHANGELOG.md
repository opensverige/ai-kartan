# Vad vi byggt

Kodens och funktionernas historik. Dataändringar loggas separat och automatiskt i `history/changelog.json` och på sajten under Ändringar. Samma rader som här finns maskinläsbart i `history/bygglogg.json`.

## 2026-10-07

- Sökningen tål alla ord. Ordet "constructors" och några till slog ut kartan med felet "Kunde inte läsa datan". Nu ger de inga träffar, som de ska, och ett fel i sökningen kan inte längre tömma listan. Organisationer hittas på sitt id, så att "scb", "foi" och "smhi" ger rätt myndighet, och typernas pluralord ("myndigheter", "kommuner", "lärosäten") ger samma organisationer som filtret.
- Kolumnen Källa på organisationens sida bryter inte längre "Egen webbplats" mitt i ordet.
- Importen från AI-Infra sätter inte längre fältet Aktiv. Det byggde på om tjänsten var lanserad, och tre bolag visades därför som nedlagda. Valideringen varnar när en post är markerad som nedlagd utan belägg mot register.
- Formulären för nya organisationer tål mer. Ett streck eller ett "nej" i fältet för organisationsnummer byts inte längre ut i hela ärendet. Ett tips om ett lärosätes webbplats tas inte längre för en institution som redan finns. Det långa formuläret tar bort personnummer och samordningsnummer ur ärendet innan något annat händer, svarar i ärendet när posten redan finns, och känner igen en befintlig organisation på webbplatsen även under ett annat namn. Valideringen stoppar samordningsnummer, personprofiler på LinkedIn och samma webbplats med och utan www. Ärendets text skickas inte längre genom körningens miljö, där den skrevs ut i den publika loggen.
- Kriterierna gås igenom på varje pull request. En pull request som rör en organisation får en kommentar med granskningslistan ur kriterier.md som punkter, en uppsättning per organisation. Läget Granskning mot kriterierna är gult tills varje punkt är avbockad och en människa med skrivrätt har intygat det med `/granskad` i en egen kommentar. En bock gäller filens version och nollställs om filen ändras, och ett intyg gäller listan som den såg ut. Rutorna kan kryssas i av en bot, men ett intyg kan bara en människa skriva. Agenter bockar aldrig av listan och intygar aldrig, och det står nu i reglerna för dem. Symboliska länkar i data/organisationer stoppas av valideringen.
- Ny delningsbild: gul botten, handen med kartnålen stor från vänster och rubriken i gemener nere till höger, i samma stil som AI-Infra. Bilden bär adressen techembassy.se. Dess adress får en version ur innehållet, så att LinkedIn och andra tjänster hämtar den nya i stället för den de har sparat.
- Sajten räknar besök, utan kakor. Räkningen görs med Vercel Web Analytics. Vercel driver redan sajten, så ingen ny part får veta vem som besöker den. Adressen räknas utan frågedel, så söktext och filter följer inte med, och den som har slagit på Do Not Track eller Global Privacy Control räknas inte. Integritetssidan säger vad som sparas. Förut stod det där att sajten inte hade någon besöksstatistik.
- Myndigheternas och kommunernas ikoner ritas först när kartan är inzoomad till organisationerna. På översikten är en myndighet som är ensam på sin plats en prick som alla andra. Förut stod ikonen ensam bland gruppernas cirklar och drog blicken till sig.

## 2026-10-06

- Medlemsvyn fungerar bättre i telefon och med skärmläsare. Antalen per region står i kortets text även i smal vy, kartans källrad ligger fri från knapparna, kortet ligger vid sidan på en liggande telefon, och fokus följer med när vyn öppnas från sökningen eller stängs med Escape.
- Sökningen förstår mer. Engelska och vardagliga ord träffar etiketterna (computer vision, investors, konsult), synonymer räknas som samma ord (chatbot och chattbot, LLM och språkmodell), och ett kort ord som RAG träffar bara i början av ett ord. Ger en sökning ingenting prövas den utan utfyllnadsord ("vem bygger drönare" blir "drönare") och sedan i grundform. Den som söker jobb, certifikat, pris eller antal anställda får veta att kartan inte har det, och var det finns. Reglerna ligger i `src/lib/sok.ts` och är prövade mot 138 sökningar: andelen användbara svar gick från 49 till 80 procent.
- Ny vy: var OpenSveriges medlemmar finns. Knappen med kräftan på kartan visar regionerna med tio mils radie och antalet medlemmar i varje, plus hur många som bygger på annan ort. Underlaget är regionrollerna på föreningens Discord, som antal i `data/gemenskap/regioner.json`. Inga personer hämtas. Ett antal under fem skrivs som "färre än 5", också i filen i repot. Den som söker på kräfta eller opensverige hittar också dit, och vyn går att länka med `?vy=medlemmar`.
- Organisationer ritas inte längre i sjöar eller i havet. Organisationerna i en kommun radas upp i ett rutnät runt kommunens mittpunkt, och rutor i vatten hoppas över. I en kommun med få organisationer ligger de längre isär, så att namnen får plats. Var det är land står i `data/geo/land.json`, som byggs ur samma kartunderlag som kartan visar. Platsen i rutnätet säger ingenting om adressen.
- Kartan har tre nivåer i stället för kluster per pixelavstånd: län med namn och antal när hela landet syns, kommuner ett klick in, och organisationerna själva ett klick till. Ett klick eller dubbelklick på en grupp zoomar dit och visar platsen i panelen. En organisation som är ensam på sin plats ritas alltid som sig själv. Den som zoomar ut ur en nivå lämnar platsen.
- Myndigheter och kommuner ritas som landmärken på kartan, med en ikon i stället för en prick. Samma ikon syns på korten, i filtret Typ och på organisationssidan. En ny ikon börjar gälla när filen läggs i `public/ikoner/typ/`.
- Ny sida Varför vi finns ersätter Om. Den säger kort vad kartan är, hur den skiljer sig från en kurerad karta, vem som granskar och vem som står bakom. Resten ligger i fällbara avsnitt. Sidan står först i menyn.
- Arbetsflödena är härdade inför att repot blir publikt. Text ur ärenden och data hamnar aldrig i ett skalkommando, det långa formuläret kan inte skriva över en befintlig post, och varje ärende får en enda gren. Flödet för GitHub Pages startas bara för hand.
- Ändringshistoriken skrivs inte över om git-historiken är avkortad, till exempel i en grund klon.
- Texter som beskrev läget före lansering är rättade i README, metodsidan, integritetssidan och CONTRIBUTING.
- En död länk i datan är lagad, och åtta noter som angav postort för ett bolags adress är nedkortade.
- Ikonlista i `docs/ikonlista.md`: vilka ikoner kartan behöver, med filnamn och format.
- Länkkontrollen skiljer på döda länkar och länkar som inte gick att nå. Lärosäten och myndigheter nekar ofta trafik från GitHubs servrar, och det stoppade pull requests i onödan. Nu stoppar bara en länk som servern säger är borta, eller en domän som inte finns.
- Valideringen prövar belägg mot organisationstypen. Varje typ har en lista över sorters belägg som räknas, i `data/taxonomi/typer.json`, och en post behöver minst en länk som är dess egen. Båda ger en anmärkning, inte ett fel.
- Ett förslag till förfinade kriterier har prövats mot befintliga poster och ligger hos granskarna. Kriterierna i `kriterier.md` gäller tills förslaget är antaget.
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
