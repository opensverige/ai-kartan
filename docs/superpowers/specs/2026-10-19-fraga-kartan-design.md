# Fråga kartan: design

Datum: 2026-10-19
Status: granskat av en byggare, väntar på Gustafs godkännande (se avsnitt 11)
Bygger på: [PRD "AI OpenSverige på Tech Embassy"](2026-10-19-ai-opensverige-prd.md) (2026-10-19). Där designen och PRD:n skiljer sig gäller designen.
Prototyp: [2026-10-19-fraga-kartan-prototyp.html](2026-10-19-fraga-kartan-prototyp.html). Öppna filen i en webbläsare. Den hämtar riktig data från karta.opensverige.se. Steg 2 och 5 i motorn är där regler i JavaScript, inte modellanrop.

## 1. Avsikt

Kartan har 341 organisationer med källa och datum på varje uppgift. För att hitta rätt måste besökaren i dag kunna taxonomin och filtren. Fråga kartan låter besökaren skriva med egna ord och få ett källbundet svar på under en minut. När frågan kräver en människa leder svaret till OpenSveriges Discord.

Det är ett tunt lager ovanpå kartan. Kartan och YAML-filerna förblir källan. Chatten skriver aldrig tillbaka något, och den får aldrig bli det som avgör vem som syns.

## 2. Mål, icke-mål och anti-mål

**Mål**

- En fri fråga ger relevanta organisationer med förklaring, status och permalänk.
- Frågor om OpenSverige besvaras ur publicerade texter, med länk.
- Breda, tomma och orelaterade frågor får ärliga svar.
- Behov som kräver människor leder till Discord, utan att varje svar blir Discord-reklam.
- Sökningen fungerar som vanligt när modellen är avstängd.

**Icke-mål (som PRD:n):** konton, profiler, meddelanden, introduktioner, voice, Discord-skrapning, medlemsregistret, permanent chattminne, ranking.

**Anti-mål.** Det här är misslyckanden även om allt annat fungerar:

- Modellen påverkar vilka organisationer som visas eller i vilken ordning.
- En egen uppgift ser ut som en bekräftad.
- Svaret låter som marknadsföring eller som OpenSveriges rekommendation.
- "Visa alla N på kartan" visar ett annat antal än svaret.
- Kartsidan blir långsammare att rita för den som aldrig frågar.
- Hela sajten blir serverrenderad för chattens skull.

## 3. Upplevelsen (beslutad med Gustaf)

### 3.1 Första skärmen

Kartan fyller skärmen. Nertill, över en mjuk övertoning från sajtens yta:

1. H1. Förslaget i prototypen är "Fråga Sveriges AI-karta". Rubriken är inte slutvald (se 11).
2. Fältet. Till vänster finns en ✦ som glimtar långsamt. Placeholdern skriver ut exempelfrågor, en i taget, medan fältet är tomt. Exemplen är:
   - Vilka bygger röstagenter på svenska?
   - Jag behöver GPU-kapacitet i Sverige
   - AI inom hälsa i Göteborg
   - Var kan jag bolla en idé med builders?
   - Vad är OpenSverige?

   Med `prefers-reduced-motion` står ett fast exempel kvar. Skicka-knappen är rund och mossgrön med pil.
3. En rad under fältet. Till vänster: `AI · svarar med länkar till källorna`. Till höger: `eller utforska kartan själv →`.

Inga chips, ingen kicker och ingen ingress. Sidhuvudet har ingen egen sökruta på första skärmen.

### 3.2 Ett fält med tre platser

Det finns bara ett fält. Det glider mellan tre platser, och texten följer med. Övergången tar 560 ms med `cubic-bezier(0.16, 1, 0.3, 1)`.

| Läge | Var fältet står | Placeholder |
|---|---|---|
| Första skärmen | Nertill, stort | Exemplen skrivs ut |
| Kartläget | I sidhuvudet, där sökrutan står i dag | Sök eller fråga … |
| Samtalet | Längst ner i panelen | Fråga vidare … |

`⌘K` fokuserar fältet var det än står.

**Omfång:** fältet med AI finns bara på kartsidan `/`. På alla andra sidor, inklusive listsidan `/organisationer`, gör sidhuvudets sökruta samma vanliga sökning som i dag. Frågan förs aldrig mellan sidor i adressen.

### 3.3 Förslag medan man skriver

En lista öppnas, uppåt på första skärmen och nedåt i sidhuvudet:

1. **Fråga AI: "det du skrev"**. Den är förvald, så Enter frågar AI.
2. **Direkt i kartan**: upp till fyra organisationer från samma sökning som sidhuvudets sökruta gör i dag. Piltangenterna flyttar markeringen.

I samtalsläget visas ingen lista. Där skickar Enter en följdfråga.

### 3.4 Vad som byter till kartläget

- Klick på en prick. Organisationen öppnas direkt i panelen.
- Att besökaren själv drar, zoomar eller nyper. Kartans egna rörelser räknas inte.
- Val av en organisation i förslagslistan.
- `eller utforska kartan själv →`.

Hovring räknas inte. Klick på loggan går tillbaka till första skärmen.

### 3.5 Samtalet

Samtalet öppnas i panelen: till vänster på desktop, i bottenbladet på mobil. Bottenbladet fälls då upp till ungefär 74 % av höjden.

Överst står `← Kartan`, `✦ Fråga kartan` och `Ny fråga`. Längst ner står fältet och raden "AI kan ta fel. Fakta och status kommer från kartans källor."

Ett svar med träffar består av:

1. **Tolkningsraden.** En mening, till exempel "Jag tolkar det som att du söker organisationer som arbetar med röst och tal." Den visas efter hand, som om den skrivs. Det är bara den raden som modellen skriver.
2. **Antal och länk.** "18 på kartan matchar · visar 5, urvalet byts varje dag" och **Visa alla 18 på kartan →**. Länken öppnar kartan med samma filter.
3. **Kort.** Vart och ett innehåller:
   - prick i typens färg, namn och typ · ort
   - beskrivningen ordagrant, högst tre rader
   - statusmärke (`egen uppgift` eller `bekräftad`) och "kontrollerad ÅÅÅÅ-MM-DD"
   - "Matchar: …" med de fält som träffade
   - **Visa på Tech Embassy →**
4. **"Så hittade jag dem"**, som kan fällas ut: filtren, antalet träffar, urvalsregeln och meningen "Modellen väljer inte vilka som visas eller i vilken ordning."
5. **Discord**, bara när det är relevant (3.7).
6. **Hjälpte det? Ja / Nej.**

En fråga börjar alltid från noll. Filter som besökaren har satt på kartan tas inte med. Under samtalet styr svaret vad kartan lyfter. `← Kartan` återställer kartan till de filter som gällde innan, och "Visa alla N på kartan" ersätter dem med svarets filter.

Kartan följer svaret. Organisationer utan träff dämpas till ungefär 15 % och kartan ramar in träffarna. Hovring över ett kort markerar pricken, och klick på namnet flyger dit.

### 3.6 Svar som inte är träfflistor

| Fall | Svar |
|---|---|
| Bred fråga, inga kriterier ("Hitta alla som arbetar med AI") | En följdfråga med fyra snabbsvar (område, ort, infrastruktur, lärosäten) och en länk till alla på kartan. Högst en följdfråga per fråga. |
| Ranking ("bästa", "ledande", "rekommendera") | Fast text: kartan rankar inte och ingen kan köpa en plats. Erbjud att visa vilka som bygger det man letar efter. |
| Kontakt eller introduktion ("introducera mig för vd:n") | Fast text: inga personuppgifter och inga introduktioner. Permalänken har organisationens egen sida. Discord-rutan visas. |
| OpenSverige | Svaret ur kunskapsfilen visas ordagrant, med källa och datum (5.6). |
| Inga träffar | "Jag hittar ingen på kartan som matchar det." Discord-rutan och länken "Saknas någon? Föreslå den →". |
| Utanför ämnet | "Jag är till för frågor om svenska AI-byggare, organisationer, infrastruktur och OpenSverige." |
| Modellen nere, över kostnadstaket eller avstängd | Samma flöde utan modell (5.8). Tolkningsraden byggs då av en mall. |

### 3.7 Discord

Rutan visas när frågan gäller människor ("bolla", "någon att", "samarbeta"), när inget hittades och vid kontaktfrågor. Den innehåller **Bolla med builders i Discord →**, som pekar på `SAJT.discord` i `src/lib/data.ts`, och **Kopiera frågan**. Kopieringen ger frågan plus en länk till urvalet på kartan.

Inget postas automatiskt och ingen Discord-identitet skapas.

## 4. Neutraliteten (beslutad med Gustaf)

Principen är att modellen håller så få spakar som möjligt:

1. **Koden väljer vilka som visas.** Modellen fyller i samma filter som en besökare kan klicka i på kartan. Hämtningen är kartans egen filterfunktion.
2. **Koden bestämmer ordningen.** Regeln står i svaret (5.5).
3. **Koden ritar fakta.** Korten kommer ur datan, med beskrivningen ordagrant och statusen bredvid. Modellen ser aldrig organisationernas text.
4. **Modellens text är inlåst.** Den skriver bara tolkningsraden, i ett schema, och raden kontrolleras (5.4).
5. **Ranking och kontaktfrågor fångas i koden** innan modellen anropas, och igen ur modellens klassning.
6. **Organisationernas texter når aldrig modellen.** En instruktion som någon gömt i en beskrivning har därför ingenstans att verka.

Punkt 6 avviker medvetet från PRD 9.1, där modellen får kandidaterna för att formulera svaret. Det gör vi inte. Priset är att "Matchar: …" byggs av koden ur de fält som träffade och inte skrivs fritt.

## 5. Arkitektur

### 5.1 Översikt

```text
Webbläsaren (KartApp, redan laddad med /api/karta.json)
   │  POST /api/fraga  { fraga, tidigare: [{fraga, filter}] }
   ▼
Serverfunktionen /api/fraga  (den enda dynamiska delen)
   1 Förfilter ............ kod
   2 Tolkning ............. modell → Filter + tolkningsrad (schema)
   3 Hämtning ............. kod: kartans egen filterfunktion
   4 Urval och ordning .... kod
   5 Kontroll av raden .... kod: MARKNADSORD, längd, inga namn
   ▼
   { sort, tolkning, filter, kartlank, totalt, ids, visade, skal, faq, manniska }
   ▼
6 Rendering ............... webbläsaren ritar korten ur sin egen data
```

Svaret innehåller id:n och skäl men aldrig organisationstext. Webbläsaren har redan datan.

### 5.2 Kontraktet: modellen fyller i kartans filter

Kartans filter (`lasFilter` och `passar` i `src/components/KartApp.astro`) har formen:

```ts
interface Filter { q: string; erbjuder: string[]; typ: string[]; omrade: string[]; lan: string; kommun: string }
```

Inom en facett gäller eller, mellan facetter gäller och. Texten i `q` tolkas av `tolka` och `traffar` i `src/lib/sok.ts`.

Modellen ska producera exakt ett sådant filter, plus några fält till. Två saker följer av det:

- Hämtningen blir samma funktion som kartan använder, och länken "Visa alla N" är filtrets egen adress (`skrivUrl`). Antalet stämmer per konstruktion.
- Utan modell går frågan rakt in i `q`, och resten fungerar.

**Krav på bygget:** filterlogiken (`passar` och adressbygget i `skrivUrl`) flyttas till en ren modul, till exempel `src/lib/filter.ts`. Både kartan och serverfunktionen ska använda den, med tester.

### 5.3 Modellanropet

Det görs **ett anrop per fråga.** Det ger filter, klassning och tolkningsrad på en gång.

- **Svensk leverantör, öppna modeller (beslutat av Gustaf).** Anropet går till en svensk leverantör som kör öppna modeller på egen infrastruktur: Berget AI eller Grunden. Gustafs krav är svensk inferens. Bergets avtal lovar EES, inte Sverige, så det kontrolleras i provet (5.3.1). Båda finns på kartan och på infra.opensverige.se. Leverantör och modell väljs i 5.3.1.
- **Ingen leverantörsbindning.** Anropet följer det OpenAI-kompatibla formatet `POST {bas}/v1/chat/completions`. Bas-URL, nyckel och modell-id är miljövariabler (`FRAGA_API_BAS`, `FRAGA_API_NYCKEL`, `FRAGA_MODELL`). Att byta leverantör eller modell blir då en ändring av variabler, inte av kod.
- **Inget nytt beroende.** Anropet görs med `fetch`. Det behövs ingen SDK för ett enda anrop.
- **Begränsad utdata.** Leverantören ska kunna tvinga fram JSON enligt schemat, med `response_format: { type: "json_schema", json_schema: { strict: true, schema } }` eller motsvarande guidad avkodning. Schemat har `additionalProperties: false` och alla fält obligatoriska. Svaret valideras **alltid** mot schemat i koden, oavsett vad leverantören lovar. Det sker med `ajv`, som redan är ett beroende.
- **Inställningar:** låg temperatur (0 eller nära 0), eftersom samma fråga ska ge samma filter. `max_tokens` räcker till schemat med marginal, några hundra tokens.
- **Prompten:** systemprompten med taxonomin ligger först och är identisk mellan anrop, så att leverantörens prefixcache kan återanvända den om den finns. Taxonomin byggs ur `data/taxonomi/*.json` vid bygget, så att enum-värdena alltid är kartans.
- **Fel:** vid HTTP-fel eller timeout (cirka 6 s) används reservvägen (5.8). Vid ogiltig JSON eller värden utanför schemat görs högst ett nytt försök, om tiden räcker. Annars används reservvägen.

#### 5.3.1 Leverantör och modell

**Beslut: Berget AI (Gustaf, 2026-10-19).** Föreningen har redan ett konto med cirka 1 000 kr i kredit. Modellen att börja med är `google/gemma-4-31B-it`, som Bergets dokumentation föreslår för svenska. Om den inte klarar svarstiden byts modellen till `mistralai/Mistral-Small-3.2-24B-Instruct-2506` hos Berget.

Det här säger Bergets egna dokument (lästa 2026-10-19), och det är skälen till valet:

- API:t är OpenAI-kompatibelt, med basen `https://api.berget.ai/v1`.
- Strikt `json_schema` i `response_format` stöds.
- Avtalet om personuppgiftsbiträde (DPA) lovar att frågor och svar inte sparas vid inferens, bara metadata, och att inget används för träning. Det stämmer med PRD 12.
- Inferensen sker inom EES enligt avtalet.

En genomgång av fler leverantörer finns som lokal arbetsfil och publiceras inte (repots regel om AI-lästa uppgifter om namngivna organisationer).

Kostnaden per fråga är ungefär en halv tusendels euro, räknat på 1 500 tokens in och 150 ut med Bergets listpris. Krediten räcker alltså till långt över 100 000 frågor. Siffran mäts under provet.

**Prov före bygget av modellsteget.** Ett litet skript, `scripts/prova-fraga.mjs`, kör utvärderingens frågor (6) mot Bergets modeller (Gemma 4 31B och Mistral Small 3.2) och skriver resultatet till terminalen. Det kostar några ören. Det ska svara på sex frågor. Fråga 6 besvaras av leverantören, inte av skriptet:

1. Avvisar Bergets `strict` värden utanför enum-listorna? Prova med frågor som försöker lura schemat.
2. Vilken av de två modellerna ger rätt filter oftast?
3. Hur långa är svarstiderna (p50 och p95) från Vercels region `arn1`, med cirka 50 anrop per modell?
4. Hur bra är tolkningsraden på svenska på cirka 20 riktiga frågor?
5. Vilken takt tillåter Bergets minsta plan?
6. Körs inferensen i Sverige? Bergets DPA lovar bara EES. Fråga Berget direkt och få svaret skriftligt.

Det är provet som avgör.

**Nyckeln.** En egen API-nyckel bara för kartan, så att den kan dras in utan att något annat påverkas. Den ligger som miljövariabel i Vercel (`FRAGA_API_NYCKEL`) och lokalt i en `.env`-fil som git ignorerar. Den hamnar aldrig i repot (CLAUDE.md, regel 8) och aldrig i chatten.

**Övrigt:**

- Modeller hos Berget kan pensioneras med 2–3 veckors varsel. Därför är modellen en miljövariabel, och provskriptet kan köras igen mot en ny modell på några minuter.
- Funktionen körs i regionen `arn1` (Stockholm). Vercels standard är `iad1` i USA, och en fråga till Sverige ska inte gå via USA. Regionen sätts under `functions` i `vercel.json` eller i projektinställningarna.

Schemat, i ord:

| Fält | Typ | Anmärkning |
|---|---|---|
| `avsikt` | enum: `hitta`, `opensverige`, `manniska`, `ranking`, `kontakt`, `utanfor` | Klassning. `ranking` och `kontakt` ger fasta svar. |
| `omrade` | enum[] ur `omraden.json` | |
| `erbjuder` | enum[] ur `erbjuder.json` | |
| `typ` | enum[] ur `typer.json` | |
| `plats` | sträng | Ortens eller länets namn som besökaren skrev det, eller tom. Koden slår upp det i `data/geo/kommuner.json` och länen. Okänd plats nämns i svaret och ignoreras. Bara en plats, som på kartan. |
| `sokord` | sträng[], högst 2 | Ord för det som inte finns i taxonomin ("röst"). Blir `q`. Som på kartan måste varje ord finnas, så modellen instrueras att välja det mest centrala begreppet, inte att räkna upp synonymer. Synonymerna sköts av `sok.ts` (se nedan). |
| `faq` | enum[] ur kunskapsfilens id:n | Bara för `avsikt: opensverige`. |
| `manniska` | boolean | Frågan gäller att hitta människor att bolla med. |
| `tolkning` | sträng, högst cirka 200 tecken | En mening på svenska om hur frågan tolkades. |

**Synonymer:** ord som besökare och modellen använder, men som saknar grupp i `sok.ts`, läggs till i `SYNONYMGRUPPER`. Det gäller till exempel röst, voice, tts, talsyntes och röstagent. Det förbättrar också kartans vanliga sökning. Regeln från `sok.ts` gäller: ingen sökning som fungerar i dag får bli sämre, och `npm test` ska vara grönt. På så sätt stämmer antalet i svaret med "Visa alla N", och ingen ny syntax för eller-sökning behövs i adressen.

**Historik:** en följdfråga skickas med de tidigare frågorna och deras filter, aldrig svaren eller organisationerna. "Bara i Göteborg" blir då föregående filter plus en plats. Samtalet tillåter högst 6 frågor. Därefter föreslår svaret "Ny fråga".

### 5.4 Kontroll av tolkningsraden

Raden ersätts av en mall som byggs ur filtret om något av detta gäller:

- den träffar `MARKNADSORD` i `scripts/validera.mjs`. Uttrycket flyttas till en delad modul så att datan och chatten använder samma lista.
- den är längre än gränsen
- den innehåller en adress
- den nämner en organisation vid namn

### 5.5 Urval och ordning

- **Högst 5 träffar:** alla visas, i namnordning A–Ö (`localeCompare` med `sv`).
- **Fler än 5:** 5 väljs med en blandning vars frö är `dagens datum + normaliserat filter`. De visas i namnordning. Samma fråga samma dag ger samma urval, och nästa dag ett annat. Ingen organisation hamnar först bara för att namnet börjar på A.
- Regeln står alltid i svaret, och länken visar alla.

### 5.6 Kunskap om OpenSverige

Kunskapen ligger i en liten, versionshanterad fil, till exempel `data/fragor/opensverige.yaml`. Varje post har:

- `id`
- frågan i några varianter
- ett kort svar
- `kalla_url`
- `kontrollerad` (datum)

Det är samma metod som kartans data.

Claude skriver ett utkast ur de publicerade sidorna på opensverige.se, med källa och datum per svar. Gustaf godkänner varje svar innan det går in (beslutat av Gustaf). Inget svar publiceras utan källa.

Modellen väljer bara vilka id:n som passar. Svaret visas ordagrant med "Källa: … · kontrollerad …". Inget om stadgar, medlemskap eller avgifter skrivs fritt. Den första versionen täcker frågorna i PRD 6.5.

### 5.7 Hämtning när kriterierna inte ger något

Det sker i samma ordning som `sok.ts` redan gör:

1. Alla kriterier.
2. Om det ger noll träffar och `sokord` finns: ta bort sökorden och behåll facetterna. Svaret säger det: "Ingen nämner ”känsliga”. Här är alla som erbjuder infrastruktur."
3. Om det fortfarande ger noll träffar: svaret för inga träffar (3.6).

Filtret i svaret och länken är alltid det som faktiskt användes.

### 5.8 Reservvägen utan modell

Reservvägen används när det inte finns någon API-nyckel, när brytaren är på (se 5.10) eller när anropet fallerar:

1. Förfiltret i koden: regex för ranking, kontakt, OpenSverige-ord och utanför ämnet. Samma idé som `tomtSvar`.
2. Frågan blir `q` i filtret, och `sok.ts` sköter utfyllnadsord och grundformer.
3. Tolkningsraden byggs av en mall ur filtret.

Svaret märks inte som fel. Raden "Så hittade jag dem" säger att tolkningen gjordes utan AI.

Om serverfunktionen inte nås alls, till exempel på reservsajten på GitHub Pages, gör webbläsaren samma sak lokalt med samma moduler. Fältet fungerar alltså överallt.

### 5.9 Var det körs

Funktionen är en fristående Vercel-funktion, `api/fraga.ts` i repots rot (inte under `src/`), med `export function POST(request: Request)`. Det kräver ingen ny adapter, och Astro-bygget, `dist/` och GitHub Pages-flödet påverkas inte. Den andra vägen, `@astrojs/vercel` med `prerender = false`, skulle föra över hela sajten till Vercels serverformat och ändra Pages-flödet. Den är inte värd det för en enda route.

Följderna:

- **Rena moduler.** Funktionen kan inte importera `src/lib/data.ts` (den använder `import.meta.env`), och Vercels kompilator förstår inte alias från tsconfig. Delad kod (`sok.ts`, `filter.ts`, `src/lib/fraga/`) ska vara ren TypeScript med relativa importer och utan Astro-beroenden. Taxonomins JSON-filer importeras med relativ sökväg.
- **Data.** Funktionen hämtar sajtens egen `/api/karta.json` och `/api/opensverige.json` (ny statisk route ur kunskapsfilen) vid kallstart och håller dem i minnet några minuter. Servern och webbläsaren ser då samma data och samma id:n.
- **`vercel.json`.** Regeln för `/api/(.*)` ger i dag `Access-Control-Allow-Origin: *` och en timmes publik cache. `/api/fraga` ska undantas, till exempel med `source: "/api/((?!fraga).*)"`, och få `Cache-Control: no-store`. `maxDuration` sätts lågt under `functions`.
- **`tsconfig.json`.** Lägg till `api/**/*` i `include`, annars kontrollerar `astro check` inte filen.
- **Saknad endpoint.** På GitHub Pages och lokalt med `astro dev` finns ingen `/api/fraga`. Webbläsaren tolkar 404, 403, 405, 429 och nätverksfel som "använd reservvägen lokalt" (5.8).
- **Första förhandsversionen.** Kontrollera med curl att de fem omskrivna `/api`-adresserna fortfarande svarar och att `POST /api/fraga` når funktionen. Vercel lägger en catch-all-404 för `/api/*` efter de statiska filerna. Det ska fungera, men det är inte verifierat.
- **Kartdatan i förhandsversioner.** Funktionen hämtar sajtens egen `/api/karta.json`. Med Vercels Deployment Protection kan det anropet få 401 i förhandsversioner. Det löses med huvudet `x-vercel-protection-bypass` och projektets bypass-hemlighet, eller genom att datan följer med funktionen. Det ska kontrolleras med curl i samma förhandsversion som routningen ovan. Inte verifierat.
- **Lokal utveckling:** `vercel dev` kör både sajten och funktionen. Med `npm run dev` används reservvägen.

`node_modules` har astro 7.3.5 medan `package.json` säger `^7.3.8`. Kör `npm ci` först.

### 5.10 Skydd mot kostnad och missbruk

- **Längd:** frågan får vara högst 300 tecken. Samtalet får ha högst 6 frågor. Kroppen får vara högst några kB.
- **Takt:** en regel för taktbegränsning i Vercels brandvägg på `/api/fraga`, till exempel 10 anrop per minut och IP. Den finns på alla planer (Hobby har en sådan regel), men den går inte att sätta i `vercel.json`. Den sätts i dashboarden eller med `vercel firewall`, och steget dokumenteras i README. Inget nytt beroende och ingen databas.
- **Utgiftstak:** en egen API-nyckel bara för kartan, med ett tak eller en budgetvarning hos leverantören om det finns (se 5.3.1). Det är det enda verkliga taket på notan. Kostnaden per fråga mäts med `usage` under betan.
- **Brytare:** en regel i brandväggen som nekar `/api/fraga` gäller direkt utan ny deploy. Webbläsaren får 403 och använder reservvägen. Att dra in nyckeln har samma effekt. Miljövariabeln för modellen kräver en ny deploy och är till för att byta modell, inte för att stänga av.
- **Ursprung:** funktionen avvisar anrop vars `Origin` inte är sajtens egen. Undantaget i `vercel.json` (5.9) tar bort CORS-jokertecknet.
- **Loggar:** frågans text loggas aldrig. Bara sort, tid och om reservvägen användes.

### 5.11 Integritet

- Samtalet finns bara i sidans minne. Det sparas inte i `localStorage` och försvinner vid omladdning.
- Servern sparar ingenting.
- **Nytt:** frågans text skickas till den svenska inferensleverantören för tolkning. Det är en ny part, till skillnad från Vercel som redan driver sajten. `/integritet` uppdateras **före den dolda betan** (beslutat av Gustaf), med vad som skickas, varför, till vem, var det körs och leverantörens lagringstid enligt dess villkor.
- **Leverantören är också en organisation på kartan.** Att föreningen köper inferens av den är ett inköp, inte en rekommendation. Det står öppet på `/integritet` och `/om`. Leverantörens post på kartan behandlas exakt som alla andras.
- Mätning sker med de befintliga händelserna i `src/lib/handelser.ts`, med samma regel: fasta värden, aldrig text. Förslag:

  ```ts
  fraga_stalld: { sort: ['traffar', 'bred', 'tomt', 'manniska', 'ranking', 'kontakt', 'opensverige', 'utanfor'] },
  fraga_klick:  { mal: ['kort', 'alla_pa_kartan', 'discord', 'kopiera'] },
  fraga_tumme:  { svar: ['ja', 'nej'] },
  ```

  Dessutom läggs `ai` till i `forsta_handling.typ`. Värdet `fraga` finns redan och betyder frågepillren. Vercel tar emot högst två egenskaper per händelse, så modellens användning skickas inte som händelse. Den syns i serverns loggar som räknare.

## 6. Utvärdering

Utvärderingen är ett skript, till exempel `npm run prova:fraga`, med frågetyperna i PRD 16 och dessa tillägg:

- 15: en bred fråga ("Hitta mig alla som arbetar med AI")
- 16: stabilitet. Tre omskrivningar av samma fråga ska ge samma filter.
- 17: samma fråga två gånger samma dag ska ge samma urval.

Varje fall anger förväntat beteende, inte exakt text:

| # | Fråga (PRD 16) | Förväntat |
|---|---|---|
| 1 | Datorseende i Västerbotten | `omrade: datorseende`, länet; träffar med permalänk |
| 2 | Svensk AI-infrastruktur för känsliga uppgifter | `erbjuder: infrastruktur`; sökord tas bort om de ger noll, och svaret säger det |
| 3 | Voice-agenter eller svensk TTS | `sokord` med röst/tal; träffar |
| 4 | Öppen källkod för AI-agenter | `erbjuder: oppen_kallkod`, `omrade: agenter_automation` |
| 5 | Vad är OpenSverige? | `opensverige`, rätt faq-id, källänk |
| 6 | Måste jag vara medlem för Discord? | `opensverige`, faq-id för Discord |
| 7 | Lägga till mitt bolag | `opensverige`, faq-id för Bidra |
| 8 | Bolla SIP och telefoni | `manniska: true`, träffar och Discord-rutan |
| 9 | Sveriges bästa AI-bolag | `ranking`, fast svar, inga kort |
| 10 | Introducera mig för vd:n | `kontakt`, fast svar, inga namn |
| 11 | Fråga på engelska | samma filter som på svenska, svar på svenska |
| 12 | Inga relevanta träffar | svar för inga träffar; ingen påhittad organisation |
| 13 | Prompt injection i frågan | inga avvikande fält; raden klarar kontrollen |
| 14 | Orelaterad fråga | `utanfor` |

Kvalitetskravet följer PRD 15, med en anpassning. Eftersom ordningen inte är relevans ersätts "relevant bland de tre första" av två krav: minst 80 % av fallen ska ge rätt filter, och inget fall får visa en organisation som inte matchar filtret.

Det deterministiska skiktet (filter, urval, mallar, kontroller) testas med `node --test` som resten av `src/lib`. Modellskiktet körs mot API:t för hand före lansering och efter varje ändring av prompten. Det kostar pengar, så det ingår inte i CI.

## 7. Det som ändras i repot

Det här är en karta, inte en plan.

- `src/lib/filter.ts`: ny, ren filterlogik flyttad från `KartApp.astro`, med tester.
- `src/lib/fraga/`: förfilter, schema, mallar, urval och kontroll av raden, med tester. Används av både server och webbläsare.
- `src/lib/text.ts` eller ny modul: `MARKNADSORD` delas med `scripts/validera.mjs`.
- `data/fragor/opensverige.yaml`: kunskapsfilen. Den valideras i `npm run validera`.
- `/api/karta.json`: får beskrivningens status och datum per organisation (två korta fält), så att korten kan visa dem utan extra anrop. Ändringen är additiv och bryter inte API:t.
- `api/fraga.ts`: serverfunktionen i repots rot (5.9).
- `src/pages/api/opensverige.json.ts`: kunskapsfilen som statisk JSON.
- `vercel.json`: undantag för `/api/fraga` i header-regeln, `maxDuration` och regionen `arn1`.
- `scripts/prova-fraga.mjs`: provet mot leverantörerna (5.3.1). Det körs för hand och ingår inte i CI.
- `tsconfig.json`: `api/**/*` i `include`.
- `KartApp.astro`, `Sidhuvud.astro`, `index.astro`: första skärmen, fältet, samtalet i panelen och kartans lyft.
- `src/lib/handelser.ts`, `/integritet`, `/om`: de nya händelserna och texterna.
- `CHANGELOG.md` enligt repots vana.

## 8. Mina beslut, som kan prövas

Gustaf har inte valt dessa uttryckligen:

1. Samtalet visas i panelen, inte i ett eget lager.
2. Breda frågor får en följdfråga med snabbsvar.
3. Vid fler än 5 träffar visas 5 i ett dagligt urval i namnordning, med regeln utskriven.
4. Ett modellanrop per fråga, och modellen ser aldrig organisationstext (avvikelse från PRD 9.1).
5. OpenSverige-svar visas ordagrant ur en kunskapsfil. Modellen väljer bara id.
6. Hämtningen är kartans egen filterfunktion, och "Visa alla" är filtrets adress.
7. Högst 300 tecken per fråga och 6 frågor per samtal.
8. Samtalet sparas inte ens i `localStorage`.
9. Fältet med AI finns bara på `/`. Övriga sidor behåller dagens sökruta.
10. En fråga börjar från noll och tar inte med kartans aktuella filter.
11. Ord utanför taxonomin hanteras med nya synonymgrupper i `sok.ts`, inte med ny syntax. Prototypens egen eller-matchning för "röst och tal" är en förenkling. Dess länk "Visa alla" visar därför inte exakt samma antal.

## 9. Lämnat åt byggaren

- Hur `KartApp.astro` (cirka 4 000 rader) delas upp. Fältet och samtalet kan bli egna komponenter.
- Exakta animationer, så länge sajtens easing och `prefers-reduced-motion` följs.
- Om tolkningsraden strömmas från servern eller bara skrivs ut i webbläsaren. Svaret är litet, så det senare räcker.
- Prompttexten, och om schemat skickas som `response_format` eller som ett verktyg, beroende på vad leverantören stöder bäst.
- Testernas och filernas namn.

## 10. Fasindelning (från PRD 17)

- **Fas 0:** allt ovan lokalt. Först reservvägen och gränssnittet, sedan provet mot leverantörerna, sist modellsteget.
- **Fas 1:** dold beta bakom en adressparameter, till exempel `?fraga=1`, för folk från Discord. Utvärderingen körs och tummarna läses.
- **Fas 2:** första skärmen blir standard. Brytaren och utgiftstaket är på.

## 11. Beslut efter byggarens granskning

Byggarens frågor och svaren på dem:

| Fråga | Svar | Vem |
|---|---|---|
| Hur kombineras flera sökord i kartans textsökning? | Varje ord måste finnas, som i dag. Modellen väljer ett eller två centrala ord, och synonymerna läggs i `sok.ts` (5.3). | Claude |
| Finns AI-fältet utanför `/`? | Nej. Övriga sidor behåller dagens sökruta, och ingen fråga förs i adressen (3.2). | Claude |
| Vem skriver svaren om OpenSverige? | Claude skriver utkast ur opensverige.se med källa och datum. Gustaf godkänner varje svar (5.6). | Gustaf |
| Tas kartans aktuella filter med i en fråga? | Nej, en fråga börjar från noll (3.5). | Claude |
| När uppdateras `/integritet`? | Före den dolda betan (5.11). | Gustaf |
| Vilken leverantör och modell? | Egen inferens hos en svensk leverantör med öppna modeller. Ingen Anthropic-SDK (5.3). | Gustaf |
| Berget AI eller Grunden? | Berget AI. Föreningen har ett konto med kredit. Modellen väljs av provet i 5.3.1 och börjar med Gemma 4 31B. | Gustaf |

Kvar att bestämma, men det blockerar inte bygget:

- **Inferens i Sverige eller i EES.** Bergets DPA lovar EES. Fråga Berget om inferensen körs i Sverige, och få svaret skriftligt. Svaret avgör vad som står på `/integritet`.

- **H1.** Prototypen använder "Fråga Sveriges AI-karta". Det är copy och kan ändras sent.
