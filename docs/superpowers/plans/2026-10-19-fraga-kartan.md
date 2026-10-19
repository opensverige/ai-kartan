# Fråga kartan: byggplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mål:** På kartsidan kan besökaren fråga med egna ord. Ett svar består av organisationer som koden väljer ur kartans egen data, en tolkningsrad som en öppen modell hos Berget AI skriver, och en väg till Discord när frågan gäller människor.

**Arkitektur:** Den deterministiska kärnan ligger i rena moduler under `src/lib/fraga/`. Den används av både webbläsaren och serverfunktionen `api/fraga.ts`. Modellen gör bara om frågan till kartans `Filter` och skriver en mening. Utan modell går samma kärna på frågetexten direkt.

**Tekniker:** Astro 7 (statiskt), TypeScript strict, Vercel-funktion i repots rot, OpenAI-kompatibelt API hos Berget AI via `fetch`, `ajv` (finns redan), MapLibre (finns redan), `node --test`.

**Spec:** [docs/superpowers/specs/2026-10-19-fraga-kartan-design.md](../specs/2026-10-19-fraga-kartan-design.md). Läs den först. Planen avgör bara det specen lämnar öppet.

**Körordning:** 1, 8, 2–7, 9–16. Uppgift 8 är ett prov på driften och behöver bara `filter.ts`. Faller den ut fel krävs ett nytt beroende som Gustaf måste godkänna, och då ändras hela del B. Dess mänskliga steg kan pågå medan del A byggs.

**Avvikelser från specen:**
- Kunskapsfilen, etiketterna och platslistan serveras tillsammans som `/api/fraga-data.json`, inte som `/api/opensverige.json`. Det ger en fil färre att hämta för både server och webbläsare.
- Provskriptet och utvärderingen är ett och samma skript, `scripts/prova-fraga.mjs`.

## Globala krav

- Node 22 (`nvm use`, `.nvmrc` säger 22). Testerna importerar `.ts` direkt och kräver det.
- Inga nya beroenden. Anthropics SDK är avböjt, och `ajv` och `yaml` finns redan.
- Relativa importer mellan moduler i `src/lib/` skrivs med `.ts`-ändelse, som i `platsamne.ts`. Modulerna som `api/fraga.ts` använder får varken importera `astro`, använda `import.meta.env` eller använda alias som `@lib`.
- Svenska i text, kommentarer och commit-meddelanden. Konventionella commits, till exempel `feat(fraga): …` (repots CLAUDE.md).
- Inga `any`, inga `// TODO`, inga emojis. Glyfen ✦ (U+2726) är tillåten.
- Easing `cubic-bezier(0.16, 1, 0.3, 1)` på varje övergång, och `prefers-reduced-motion` stänger av rörelse.
- Koden lägger aldrig frågetexten i loggar, `localStorage`, `sessionStorage` eller händelser, och skickar den aldrig själv i en adress. Det enda undantaget är länken "Visa alla N på kartan". Den bär kartans filter, där `q` är kärnorden som faktiskt söktes (`karnord`, uppgift 7). Länken följs bara när besökaren själv klickar, precis som kartans sökruta gör i dag.
- Gränser: `MAX_TECKEN = 300`, `MAX_FRAGOR = 6` (aktuell fråga plus högst 5 tidigare), `URVAL = 5`, `TIDSGRANS_MS = 6000`, högst 1 nytt försök mot modellen.
- Miljövariabler: `FRAGA_API_BAS` (standard `https://api.berget.ai/v1`), `FRAGA_API_NYCKEL` (ingen standard, aldrig i repot), `FRAGA_MODELL` (standard `google/gemma-4-31B-it`).
- Innan varje commit: `npm test`, `npm run validera` och `npm run check` ska vara gröna.
- Allt nytt i gränssnittet visas bara med `?fraga=1` fram till fas 2 (specen 10).

## Granskningsfokus

Det här är indata som specen förutsätter men som inget enskilt testflöde naturligt täcker. Varje rad har ett test i den uppgift som äger koden:

1. **Manipulerad historik.** En klient skickar `tidigare` med filtervärden som inte finns i taxonomin, eller en sträng i stället för en lista. Väntat: 400, inte en krasch eller ett okänt filter. Testas i uppgift 9.
2. **Modellen ger ett giltigt schema men noll träffar,** till exempel ett område plus en typ som ingen har. Väntat: sökorden tas bort först (specen 5.7), därefter svaret för inga träffar. Inget påhittat. Testas i uppgift 7.
3. **Kartdatan går inte att hämta vid kallstart** (401 i förhandsversion, timeout). Väntat: 503 från funktionen och reservvägen i webbläsaren. Testas i uppgift 9.
4. **Tvetydig eller okänd plats.** "Stockholm" finns både som kommun och län, och "Norrland" finns inte. Väntat: kommunen vinner, och en okänd plats nämns i svaret i stället för att filtrera. Testas i uppgift 5.
5. **Ny fråga medan den förra väntar.** Väntat: den förra avbryts, och bara det senaste svaret ritas. Testas i uppgift 12 (vyfunktion) och prövas för hand i uppgift 13.

---

## Del A: den deterministiska kärnan

### Uppgift 1: Kartans filter som delad modul

**Filer:**
- Skapa: `src/lib/filter.ts`, `src/lib/filter.test.mjs`
- Skapa: `src/lib/sokindex.ts`, `src/lib/sokindex.test.mjs`
- Ändra: `src/components/KartApp.astro`. Ta bort de lokala `Filter`, `FacettNamn` och `passar` (cirka rad 259–260 och 547–560), byt bygget av `ns` (cirka rad 2253–2258) och frågedelen i `skrivUrl` (cirka rad 565–575).

**Gränssnitt:**
- Använder: `Sokpost`, `Tolkning`, `traffar`, `normalisera` från `src/lib/sok.ts`.
- Ger:
  ```ts
  // filter.ts
  export interface Filter { q: string; erbjuder: string[]; typ: string[]; omrade: string[]; lan: string; kommun: string }
  export type FacettNamn = 'erbjuder' | 'typ' | 'omrade' | 'lan';
  export interface Filterpost extends Sokpost { id: string; n: string; k: string | null; l: string | null }
  export const TOMT_FILTER: Filter;
  export function passarFilter(o: Filterpost, f: Filter, tolkning: Tolkning, utom?: FacettNamn): boolean;
  export function filterTillSok(f: Filter): string; // samma ordning som skrivUrl: q, erbjuder, typ, omrade, lan, kommun; utan frågetecken
  export function arTomt(f: Filter): boolean;
  // sokindex.ts
  export interface Etiketter { typer: Record<string, string>; typerPlural: Record<string, string>; erbjuder: Record<string, string>; omraden: Record<string, string>; lan: Record<string, string> }
  export function tillSokpost<T extends { id: string; n: string; d: string | null; kn: string | null; ln: string | null; t: string; o: string[]; a: string[] }>(o: T, e: Etiketter): T & { nn: string; ns: string };
  ```

- [ ] **Steg 1: Skriv de fallerande testerna**

  I `filter.test.mjs`, med poster byggda som i `sok.test.mjs`:
  - `passarFilter: eller inom en facett, och mellan facetter`: med `{ omrade: ['halsa', 'datorseende'] }` matchar en post med område `halsa` och en med `datorseende`. Med `typ: ['bolag']` tillagt matchar inte en myndighet med `halsa`.
  - `passarFilter: kommun kräver koden och utom hoppar över facetten`.
  - `filterTillSok skriver i kartans ordning`: `filterTillSok({ q: 'röst', erbjuder: ['produkt', 'oppen_kallkod'], typ: [], omrade: ['halsa'], lan: '14', kommun: '1480' })` blir `'q=r%C3%B6st&erbjuder=produkt%2Coppen_kallkod&omrade=halsa&lan=14&kommun=1480'`.
  - `arTomt` är sant bara för `TOMT_FILTER`.

  I `sokindex.test.mjs`:
  - `tillSokpost tar med id, plats och etiketter i ns`: id `6g-ai-sweden` ger `ns` som innehåller `6g ai sweden`, och område `halsa` med etiketten `Hälsa och life science` ger `ns` som innehåller `halsa och life science`.

- [ ] **Steg 2:** `nvm use && npm ci && node --test src/lib/filter.test.mjs src/lib/sokindex.test.mjs`. Väntat: FAIL, modulerna finns inte. `npm ci` behövs eftersom `node_modules` är inaktuell (specen 5.9).
- [ ] **Steg 3:** Skriv `filter.ts` och `sokindex.ts`. Logiken flyttas oförändrad från `KartApp.astro`. `URLSearchParams` kodar kommat i listor som `%2C`, och det ska behållas.
- [ ] **Steg 4:** Låt `KartApp.astro` importera `passarFilter`, `filterTillSok` och `tillSokpost`. `skrivUrl` lägger fortfarande till `org` och `vy` efter filterdelen.
- [ ] **Steg 5:** `npm test && npm run check`. Väntat: allt grönt. Öppna `npm run dev`, sök "hälsa" och välj ett län. Adressen och listan ska vara som före ändringen.
- [ ] **Steg 6:** Commit `refactor(karta): filtret och sökindexet som delade moduler`.

### Uppgift 2: Synonymer för röst och tal

**Filer:** Ändra `src/lib/sok.ts` (`SYNONYMGRUPPER` och `ORDSTART`) och `src/lib/sok.test.mjs`.

**Känd fälla i datan i dag:** `finnsI` matchar delsträngar för ord längre än 3 tecken. Därför träffar `rost` (normaliserat "röst") orden prostata och prostatacancer, hos Elekta, EXINI Diagnostics och Stratipath. Och `voice` träffar invoice. Sökningen på "röst" ger alltså fel organisationer redan i dag.

- [ ] **Steg 1: Fallerande tester.**
  - `röst, voice och tts står i början av ett ord`: `post('Prostatabolaget', 'Analyserar bilder av prostatacancer.')` matchar inte `sok('röst')`, och `post('Fakturan', 'Automatiserar invoice-flöden.')` matchar inte `sok('voice')`.
  - `röst, voice och tts hittar varandra`: Lägg till posterna `post('Röstbolaget', 'Bygger röstagenter för kundtjänst.')` och `post('Talverket', 'Säljer TTS för svenska.')` i ett eget litet `ALLA`. Då ska `sok('voice')` ge båda och `sok('röst')` ge båda.
- [ ] **Steg 2:** Kör testet. Väntat: FAIL.
- [ ] **Steg 3:** Lägg till `rost`, `voice` och `tts` i `ORDSTART`. Lägg sedan till gruppen `['rost', 'voice', 'tts', 'talsyntes', 'text till tal', 'text-to-speech', 'rostagent', 'rostagenter', 'voice agent', 'voice agents']`. Lägg den inte i den befintliga gruppen för taligenkänning, som är en annan sak.
- [ ] **Steg 4:** `npm test`. Alla befintliga sökfall i `sok.test.mjs` ska vara oförändrat gröna. Det är regeln i `sok.ts`: ingen sökning som fungerar i dag får bli sämre.
- [ ] **Steg 5:** Kör en kontroll mot den riktiga datan, med ett kort Node-skript som läser `dist/api/karta.json` efter `npm run build`. `sok('röst')` ska inte ge Elekta, EXINI Diagnostics eller Stratipath, och ska ge Sinch.
- [ ] **Steg 6:** Commit `fix(sok): röst, voice och tts, utan träff i prostata och invoice`.

### Uppgift 3: Värdeorden delas

**Filer:** Skapa `scripts/lib/marknadsord.mjs` och `scripts/lib/marknadsord.test.mjs`. Ändra `scripts/validera.mjs:52` och `:168`.

**Ger:** `export const MARKNADSORD: RegExp` (uttrycket flyttas ordagrant från `validera.mjs:52`).

- [ ] **Steg 1: Test** `marknadsord träffar ledande och bästa men inte bestå`: `MARKNADSORD.test('Sveriges ledande bolag')`, `MARKNADSORD.test('det bästa')` och `MARKNADSORD.test('unikt')` är sanna. `MARKNADSORD.test('bestå av')` och `MARKNADSORD.test('ledamot')` är falska.
- [ ] **Steg 2:** Kör testet. Väntat: FAIL.
- [ ] **Steg 3:** Flytta uttrycket och låt `validera.mjs` importera det.
- [ ] **Steg 4:** `npm test && npm run validera`. Väntat: grönt, med samma varningar som före ändringen.
- [ ] **Steg 5:** Commit `refactor(validera): värdeorden i en egen modul`.

### Uppgift 4: Kunskapsfilen och `/api/fraga-data.json`

**Filer:**
- Skapa: `data/fragor/opensverige.yaml`, `data/fragor/README.md`
- Ändra: `scripts/validera.mjs` (ny kontroll av kunskapsfilen), `scripts/validera.test.mjs`
- Skapa: `src/pages/api/fraga-data.json.ts`
- Skapa: `src/lib/fraga/typer.ts` med `Kunskap` och `Fragedata`. Uppgift 5 bygger vidare på filen.
- Ändra: `src/lib/data.ts` (`tillKartpost` får `ds` och `dv`), `vercel.json` (omskrivningen `/api/fraga-data` → `/api/fraga-data.json`, som för de andra)

**Gränssnitt:**
- Ger:
  ```ts
  // poster i opensverige.yaml
  interface Kunskap { id: string; fragor: string[]; svar: string; kalla_url: string; kontrollerad: string /* ÅÅÅÅ-MM-DD */ }
  // /api/fraga-data.json
  interface Fragedata { etiketter: Etiketter; faq: Kunskap[]; kommuner: { kod: string; namn: string }[]; lan: { kod: string; namn: string }[] }
  // tillKartpost får två fält till
  ds: 'confirmed' | 'claimed' | 'planned' | 'unknown'; // description.status
  dv: string | null;                                    // description.verified_at
  ```
- De nio id:na, i ordningen från PRD 6.5: `vad-ar-opensverige`, `ideell-forening`, `bli-medlem`, `kostnad`, `discord-medlem`, `bidra`, `projekt`, `meetups`, `opensverige-och-tech-embassy`.

- [ ] **Steg 1: Fallerande tester** i `validera.test.mjs`, i samma stil som filens andra kontroller:
  - `kunskap utan källa stoppas`
  - `kunskap med värdeord stoppas` (med `MARKNADSORD`)
  - `kunskap med dubbelt id stoppas`
  - `kunskap med datum i fel form stoppas`
- [ ] **Steg 2:** Kör testerna. Väntat: FAIL.
- [ ] **Steg 3:** Skriv kontrollen i `validera.mjs`. Ett svar får vara högst 400 tecken.
- [ ] **Steg 4: Utkast till svaren.** Läs varje källsida på opensverige.se med WebFetch: start, bli-medlem, stadgar och integritet, plus kartans `/om` och `/bidra`. Skriv ett svar per id, med neutral svenska, högst 3 meningar, och `kalla_url` till den sida som faktiskt visar uppgiften. Saknas en uppgift på sidorna skrivs posten inte (repots regel 1). Lista då id:t i `data/fragor/README.md` under "Saknar källa".
- [ ] **Steg 5: STOPP, Gustaf godkänner.** Visa varje svar med källa och vänta på godkännande per post. Ändra enligt hans svar.
- [ ] **Steg 6:** Lägg till `ds` och `dv` i `tillKartpost`. Skriv `fraga-data.json.ts`: etiketterna byggs som i `KartApp.astro` (rad 26–33, utan `typikoner`), `faq` kommer ur YAML-filen och `kommuner`/`lan` ur `hamtaData()`.
- [ ] **Steg 7:** `npm test && npm run validera && npm run build`. Kontrollera sedan:
  - `jq '.organisationer[0] | {ds, dv}' dist/api/karta.json` visar en status och ett datum.
  - `jq '.faq | length' dist/api/fraga-data.json` visar antalet godkända poster.
- [ ] **Steg 8:** Commit `feat(fraga): kunskapsfil om OpenSverige och fraga-data.json`.

### Uppgift 5: Förfilter, platser, kontroll och mall

**Filer:**
- Skapa i `src/lib/fraga/`: `forfilter.ts`, `platser.ts`, `kontroll.ts`, med tester `forfilter.test.mjs`, `platser.test.mjs`, `kontroll.test.mjs`
- Ändra: `src/lib/fraga/typer.ts` (skapad i uppgift 4) och `package.json`, där `"src/lib/fraga/*.test.mjs"` läggs till i skriptet `test`.

**Gränssnitt:**
- Ger:
  ```ts
  // typer.ts (läggs till i filen från uppgift 4)
  export const MAX_TECKEN = 300, MAX_FRAGOR = 6, URVAL = 5, TIDSGRANS_MS = 6000;
  export type Avsikt = 'hitta' | 'opensverige' | 'manniska' | 'ranking' | 'kontakt' | 'utanfor';
  export interface Modellsvar { avsikt: Avsikt; omrade: string[]; erbjuder: string[]; typ: string[]; plats: string; sokord: string[]; faq: string[]; manniska: boolean; tolkning: string }
  export interface Tidigare { fraga: string; filter: Filter }
  export type Svarssort = 'traffar' | 'bred' | 'tomt' | 'manniska' | 'ranking' | 'kontakt' | 'opensverige' | 'utanfor';
  export interface Svar {
    sort: Svarssort; tolkning: string; filter: Filter; borttaget: string[]; okandPlats: string | null;
    kartlank: string; totalt: number; ids: string[]; visade: string[]; regel: 'alla' | 'dagligt';
    skal: Record<string, string[]>; faq: string[]; manniska: boolean; utanModell: boolean;
  }
  // forfilter.ts
  export type Forfilter = 'ranking' | 'kontakt' | 'opensverige' | 'utanfor';
  export function forfilter(fraga: string): Forfilter | null;
  export function faqUtanModell(fraga: string): string[]; // nyckelord → id, annars ['vad-ar-opensverige']
  export function arManniska(fraga: string): boolean;
  // platser.ts
  export interface Plats { sort: 'kommun' | 'lan'; kod: string; namn: string }
  export function hittaPlats(text: string, kommuner: readonly { kod: string; namn: string }[], lan: readonly { kod: string; namn: string }[]): Plats | null;
  // kontroll.ts
  export function godkandRad(rad: string, orgnamn: readonly string[]): boolean;
  export function mallrad(f: Filter, e: Etiketter, plats: Plats | null): string;
  ```

- [ ] **Steg 1: Fallerande tester.**
  - `forfilter`:
    - "Vilket är Sveriges bästa AI-bolag?" och "Which is the leading AI company?" ger `ranking`.
    - "Introducera mig till vd:n för Sinch" och "Ge mig telefonnumret till …" ger `kontakt`.
    - "Måste jag vara medlem för Discord?" ger `opensverige`.
    - "Vad blir det för väder imorgon?" ger `utanfor`.
    - "Vilka bygger röstagenter?" ger `null`.
  - `faqUtanModell("Kostar medlemskap något?")` innehåller `kostnad`.
  - `arManniska("Jag behöver någon att bolla SIP med")` är sant.
  - `hittaPlats`:
    - "AI i Göteborg" ger `{ sort: 'kommun', kod: '1480', namn: 'Göteborg' }`.
    - "i Stockholm" ger kommunen, inte länet.
    - "Västerbotten" ger länet `24`.
    - "Norrland" ger `null`.
    - "Gotland" träffar inte Östergötland.
  - `godkandRad`:
    - falsk för en rad med "ledande"
    - falsk för en rad längre än 200 tecken
    - falsk för en rad med `https://`
    - falsk för en rad som nämner "Sinch" när `['Sinch']` skickas in
    - sann för "Jag tolkar det som att du söker organisationer som arbetar med röst."
  - `mallrad` med område `halsa` och kommunen Göteborg ger "Jag tolkar det som att du söker organisationer inom hälsa och life science i Göteborg."
- [ ] **Steg 2:** `npm test`. Väntat: FAIL.
- [ ] **Steg 3:** Skriv modulerna.
  - `forfilter` normaliserar med `normalisera` och matchar hela ord, som `finnsI`.
  - `hittaPlats` provar kommunnamn före länsnamn. Länsnamn jämförs utan "s län" och "län". Längsta namnet först.
  - `godkandRad` jämför organisationsnamn med `finnsI` på normaliserad text.
- [ ] **Steg 4:** `npm test`. Väntat: PASS.
- [ ] **Steg 5:** Commit `feat(fraga): förfilter, platser och kontroll av tolkningsraden`.

### Uppgift 6: Urval och matchskäl

**Filer:** Skapa `src/lib/fraga/urval.ts`, `src/lib/fraga/skal.ts`, `src/lib/fraga/urval.test.mjs` och `src/lib/fraga/skal.test.mjs`.

**Gränssnitt:**
- Ger:
  ```ts
  export function urvalsfro(datum: string, f: Filter): string; // `${datum}|${filterTillSok(f)}`
  export function valjUt(ids: readonly string[], namn: (id: string) => string, fro: string): { visade: string[]; regel: 'alla' | 'dagligt' };
  export function matchskal(o: Filterpost & { d: string | null }, f: Filter, t: Tolkning, e: Etiketter): string[];
  ```

- [ ] **Steg 1: Fallerande tester.**
  - `valjUt`:
    - 5 id ger alla, i namnordning med `localeCompare(…, 'sv')`, och `regel: 'alla'`.
    - 12 id ger 5, med `regel: 'dagligt'`, i namnordning.
    - Samma frö ger samma 5.
    - Fröna `2026-10-19|q=x` och `2026-10-20|q=x` ger olika urval för 40 id.
    - Över 1 000 frön med 40 id förekommer varje id i urvalet i mellan 8 % och 17 % av fallen. Det väntade värdet är 12,5 %. Det är testet för att A-namn inte gynnas.
  - `matchskal`:
    - en post som träffar `omrade: ['halsa']` och `q: 'röst'` ger `['område Hälsa och life science', '”röst” i beskrivningen']`
    - en post som bara träffar via kommunen ger `['Göteborg']`
- [ ] **Steg 2:** Kör testerna. Väntat: FAIL.
- [ ] **Steg 3:** Skriv modulerna.
  - `valjUt`: deterministisk blandning med FNV-1a-hash av fröet som startvärde, sedan de 5 första, sedan sortering efter namn.
  - `matchskal`: facetter i ordningen typ, erbjuder, område, plats. Sedan, för varje grupp i `t.grupper`, det första alternativet som träffar, visat med originaltextens ord. Normaliseringen behåller längden för svenska tecken, som `markera` i `KartApp.astro`.
- [ ] **Steg 4:** `npm test`. Väntat: PASS.
- [ ] **Steg 5:** Commit `feat(fraga): dagligt urval och skäl per träff`.

### Uppgift 7: Motorn

**Filer:** Skapa `src/lib/fraga/motor.ts` och `src/lib/fraga/motor.test.mjs`.

**Gränssnitt:**
- Använder: allt från uppgift 1, 5 och 6, och `tolka` från `sok.ts`.
- Ger:
  ```ts
  export type Tolkare = (fraga: string, tidigare: readonly Tidigare[]) => Promise<Modellsvar | null>;
  export interface Motordata { poster: readonly (Filterpost & { d: string | null })[]; etiketter: Etiketter; faqIds: readonly string[]; kommuner: readonly { kod: string; namn: string }[]; lan: readonly { kod: string; namn: string }[] }
  export async function svara(fraga: string, tidigare: readonly Tidigare[], data: Motordata, tolkare: Tolkare | null, idag: string): Promise<Svar>;
  ```

**Flödet** (specen 5.1–5.8):
1. Förfiltret avgör `ranking`, `kontakt` och `utanfor` direkt.
2. Modellsvaret, eller `null`, blir ett filter. `avsikt` från modellen vinner över förfiltret för `opensverige` och `manniska`.
3. Hämtning med `passarFilter`.
4. Noll träffar med sökord: sökorden tas bort och läggs i `borttaget`, och hämtningen körs igen.
5. Fortfarande noll ger `tomt`.
6. Ett tomt filter med avsikten att hitta ger `bred`.
7. Urval och skäl.
8. `godkandRad` på modellens rad, annars `mallrad`.

Utan modell blir `karnord(fraga)` till `q`. Om `karnord` är tom blir svaret `bred`.

I `sok.ts` läggs till: `export function karnord(q: string): string`. Den tar bort skiljetecken (`?!.,;:`), orden i `UTFYLLNAD` och orden `hitta mig alla visa lista ge`, och behåller resten som besökaren skrev dem.

- [ ] **Steg 1: Fallerande tester.** En stubbad `Tolkare` och 8 påhittade poster:
  1. modellsvar `{ avsikt: 'hitta', omrade: ['datorseende'], plats: 'Västerbotten', … }` ger `traffar` med rätt `totalt`, och `kartlank === '/?omrade=datorseende&lan=24'`
  2. modellsvar med `sokord: ['känsliga']` och `erbjuder: ['infrastruktur']`, där inget nämner "känsliga", ger `traffar` med `borttaget: ['känsliga']`
  3. tom tolkning med `avsikt: 'hitta'` ger `bred`
  4. `tolkare === null` och "Hitta mig alla som arbetar med AI" ger `bred` och `utanModell: true`
  4b. `karnord('Vilka bygger röstagenter i Göteborg?')` blir `'röstagenter Göteborg'`, och `kartlank` för en fråga utan modell innehåller bara kärnorden
  5. `tolkare === null` och "voice" ger `traffar` via synonymerna i uppgift 2
  6. en tolkare som kastar fel ger samma svar som `null`
  7. "Vilket är det bästa bolaget?" anropar aldrig tolkaren. Tolkaren är en spion som räknar anrop.
  8. en modellrad med "ledande" ersätts av mallraden
  9. `avsikt: 'opensverige'` med `faq: ['bidra']` ger `sort: 'opensverige'` och `faq: ['bidra']`
  10. `manniska: true` med träffar ger `traffar` och `manniska: true`
  11. ett modellsvar med `plats: 'Norrland'` ger `okandPlats: 'Norrland'` och ett filter utan plats
- [ ] **Steg 2:** Kör testerna. Väntat: FAIL.
- [ ] **Steg 3:** Skriv `svara`. `kartlank` är `'/?' + filterTillSok(filter)`, eller `'/'` för ett tomt filter.
- [ ] **Steg 4:** `npm test`. Väntat: PASS.
- [ ] **Steg 5:** Commit `feat(fraga): motorn från fråga till svar`.

## Del B: servern och modellen

### Uppgift 8: Prov på driften (spik)

Målet är att visa att en funktion i `api/` kan importera moduler från `src/lib/` med `.ts`-ändelse på Vercel, innan del B byggs vidare.

**Filer:**
- Skapa: `api/fraga.ts`. Tillfälligt importerar den bara `filterTillSok` och `TOMT_FILTER` och svarar `{ ok: true, prov: filterTillSok(TOMT_FILTER) }` på POST.
- Ändra: `vercel.json`:
  - Header-regeln `/api/(.*)` blir `/api/((?!fraga$).*)`.
  - Ny regel för `/api/fraga` med `Cache-Control: no-store`.
  - `"functions": { "api/fraga.ts": { "maxDuration": 10, "regions": ["arn1"] } }`.
- Ändra: `tsconfig.json`. Lägg till `"api/**/*"` i `include`.

- [ ] **Steg 1:** `npm run check` ska vara grönt med den nya filen.
- [ ] **Steg 2: STOPP, Gustaf.** Be om lov att pusha branchen för en förhandsversion på Vercel, eller att länka projektet för `vercel build` lokalt. Pusha ingenting utan ett ja.
- [ ] **Steg 3:** Kör mot förhandsversionen och skriv ner utfallet i uppgiftens commit-meddelande:
  - `curl -s -X POST <förhandsadress>/api/fraga` ska svara `{"ok":true,…}`.
  - `curl -sI` på `/api/data`, `/api/data/<id>`, `/api/karta`, `/api/andringar` och `/api/status` ska ge 200.
  - `curl -sI <förhandsadress>/api/karta.json` utan bypass-huvud visar om Deployment Protection ger 401.
- [ ] **Steg 4: Beslut.**
  - Fungerar importen: fortsätt.
  - Fungerar den inte: stanna och visa felet för Gustaf. Alternativet är ett byggsteg som buntar `api/fraga.ts`, och det kräver ett nytt beroende (`esbuild`) som han måste godkänna.
- [ ] **Steg 5:** Commit `chore(fraga): prov på serverfunktionen och vercel.json`.

### Uppgift 9: Hanteraren

**Filer:** Skapa `src/lib/fraga/handler.ts` och `src/lib/fraga/handler.test.mjs`. Ändra `api/fraga.ts` så att den bara kopplar ihop delarna.

**Gränssnitt:**
- Ger:
  ```ts
  export interface Kropp { fraga: string; tidigare: Tidigare[] }
  export function lasKropp(json: unknown, e: Etiketter): Kropp | { fel: string };
  export interface Hanterardelar { ursprung: readonly string[]; hamtaData: () => Promise<Motordata>; tolkare: Tolkare | null; idag: () => string }
  export async function hanteraFraga(req: Request, d: Hanterardelar): Promise<Response>;
  ```
- `api/fraga.ts`:
  - `export function POST(request: Request)` anropar `hanteraFraga`.
  - `hamtaData` hämtar `https://${process.env.VERCEL_URL}/api/karta.json` och `/api/fraga-data.json` från den egna deploymenten, inte från produktionen, med huvudet `x-vercel-protection-bypass: ${process.env.VERCEL_AUTOMATION_BYPASS_SECRET}` när variabeln finns. Svaret cachas i modulen i 5 minuter. Posterna görs om med `tillSokpost`.
  - `tolkare` är `null` om `FRAGA_API_NYCKEL` saknas.
  - `ursprung` är `https://karta.opensverige.se`, `https://${process.env.VERCEL_URL}` och `https://${process.env.VERCEL_BRANCH_URL}` när de finns. Ett anrop utan `Origin` avvisas med 403. Webbläsare skickar alltid `Origin` på POST med `fetch`.

- [ ] **Steg 1: Fallerande tester:**
  - GET ger 405.
  - `Origin: https://evil.example` ger 403, och ett anrop helt utan `Origin` ger 403.
  - En kropp över 4 096 byte ger 413.
  - `fraga` med 301 tecken ger 400.
  - En fråga med bara blanksteg ger 400.
  - Sex tidigare frågor ger 400.
  - `tidigare[0].filter.omrade: ['finns-inte']` ger 400. Det är granskningsfokus 1.
  - `tidigare[0].filter` som sträng ger 400.
  - En `hamtaData` som kastar ger 503. Det är granskningsfokus 3.
  - Ett giltigt anrop ger 200 med `Cache-Control: no-store` och en kropp som har `sort`.
  - Hanteraren anropar aldrig `console.log` eller `console.error` med frågetexten. Testet ersätter `console` med en spion.
- [ ] **Steg 2:** Kör testerna. Väntat: FAIL.
- [ ] **Steg 3:** Skriv `handler.ts` och koppla `api/fraga.ts`. Fel loggas bara som `{ sort, ms, utanModell }`.
- [ ] **Steg 4:** `npm test && npm run check`. Väntat: grönt.
- [ ] **Steg 5:** Commit `feat(fraga): serverfunktionen tar emot frågor`.

### Uppgift 10: Anropet till modellen

**Filer:** Skapa `src/lib/fraga/inferens.ts` och `src/lib/fraga/inferens.test.mjs`. Ändra `api/fraga.ts` så att den skickar in `tolkaMedModell` när nyckeln finns.

**Gränssnitt:**
- Ger:
  ```ts
  export interface Inferens { bas: string; nyckel: string; modell: string; tidsgrans: number }
  export function byggSchema(e: Etiketter, faqIds: readonly string[]): Record<string, unknown>;
  export function systemprompt(e: Etiketter, faq: readonly { id: string; fragor: string[] }[]): string;
  export function skapaTolkare(inst: Inferens, e: Etiketter, faq: readonly { id: string; fragor: string[] }[], fetchFn?: typeof fetch): Tolkare;
  ```

**Anropet:** `POST ${bas}/chat/completions` med kroppen

```json
{ "model": "<modell>", "temperature": 0, "max_tokens": 400,
  "messages": [{"role": "system", "content": "<systemprompt>"}, …tidigare som user/assistant-par med filtret som JSON…, {"role": "user", "content": "<fråga>"}],
  "response_format": {"type": "json_schema", "json_schema": {"name": "tolkning", "strict": true, "schema": <byggSchema>}} }
```

Schemat:
- `additionalProperties: false`, och alla nio fält i `Modellsvar` är obligatoriska.
- `enum` ur etiketternas nycklar och `faqIds`.
- `sokord` har `maxItems: 2`. `tolkning` har `maxLength: 200`.

Systemprompten innehåller:
- reglerna från specen 4
- taxonomin med etiketter
- faq-id:n med frågevarianterna
- instruktionen att välja ett centralt sökord och inte räkna upp synonymer
- regeln att aldrig nämna en organisation
- tolkningsraden på svenska, även när frågan är på engelska

Prompten byggs bara ur etiketterna och kunskapsfilen. Den innehåller inget datum eller annat som varierar mellan anrop, så att leverantörens cache för början av prompten kan återanvändas.

Svaret valideras med `ajv` mot samma schema.

- [ ] **Steg 1: Fallerande tester** med en falsk `fetchFn`:
  - Kroppen har `response_format.type === 'json_schema'`, `temperature: 0` och huvudet `Authorization: Bearer <nyckel>`.
  - Ett giltigt `choices[0].message.content` ger ett `Modellsvar`.
  - Ogiltig JSON först och giltig andra gången ger svaret, efter exakt 2 anrop.
  - Ogiltig JSON två gånger ger `null`.
  - `omrade: ['finns-inte']` ger `null`.
  - HTTP 500 ger `null` efter 1 anrop.
  - Ett anrop som hänger längre än `tidsgrans` avbryts, och tolkaren ger `null` inom tidsgränsen plus 100 ms.
  - `systemprompt` är identisk mellan två anrop.
- [ ] **Steg 2:** Kör testerna. Väntat: FAIL.
- [ ] **Steg 3:** Skriv `inferens.ts`. Använd en `AbortController` med tidsgränsen. Ett nytt försök görs bara om mindre än halva tidsgränsen har gått.
- [ ] **Steg 4:** `npm test`. Väntat: PASS.
- [ ] **Steg 5:** Commit `feat(fraga): tolkning med öppen modell hos Berget`.

### Uppgift 11: Provet och utvärderingen

**Filer:**
- Skapa: `scripts/prova-fraga.mjs`, `scripts/fragefall.json`
- Ändra: `package.json` (`"prova:fraga": "node scripts/prova-fraga.mjs"`)
- Ändra: `README.md` (avsnittet "Fråga kartan" med nyckel, prov och brandvägg)

**Frågefallen:** `fragefall.json` innehåller de 17 fallen i specen 6. Varje fall har formen `{ fraga, forvantat: { sort?, omrade?, erbjuder?, typ?, plats?, manniska?, faq? } }`. Fall 16 är tre omskrivningar som ska ge samma filter.

**Skriptet:**
- Läser `FRAGA_API_NYCKEL` ur miljön. `--env-file=.env` fungerar med Node 22.
- Kör `svara` med `skapaTolkare` mot de modeller som ges med `--modell`. Standard är `google/gemma-4-31B-it,mistralai/Mistral-Small-3.2-24B-Instruct-2506`.
- Skriver ut per modell:
  - andel rätt filter
  - antal visade organisationer som inte matchar filtret, som ska vara 0
  - p50 och p95 för tiden
  - antal rader som ersattes av mallen
  - fallen som blev fel
- Utan nyckel kör det bara reservvägen och säger det.

- [ ] **Steg 1:** `node scripts/prova-fraga.mjs` utan nyckel. Väntat: en tabell för reservvägen och utskriften "ingen nyckel, bara reservvägen".
- [ ] **Steg 2: STOPP, Gustaf.** Be honom skapa en egen nyckel för kartan hos Berget och lägga den i `.env` som `FRAGA_API_NYCKEL=…`. Filen ignoreras redan av git. Nyckeln ska aldrig skrivas i chatten. Be honom också fråga Berget skriftligt om inferensen körs i Sverige (specen 5.3.1, punkt 6).
- [ ] **Steg 3:** `node --env-file=.env scripts/prova-fraga.mjs`. Väntat:
  - minst 80 % rätt filter för minst en modell
  - 0 felaktiga organisationer
  - p95 under 3 s
  
  Klarar ingen modell kraven: stanna och visa tabellen för Gustaf.
- [ ] **Steg 4:** Sätt standardmodellen i `api/fraga.ts` till vinnaren och skriv tabellen i README.
- [ ] **Steg 5:** Commit `feat(fraga): prov och utvärdering mot Berget`.

## Del C: gränssnittet

Visuell kontroll görs i webbläsarpanelen med `npm run dev` på `/?fraga=1`, på desktop och i mobilvyn (375 × 812). Ta bort Astros verktygslist i dev innan du klickar. Jämför med prototypen i `docs/superpowers/specs/2026-10-19-fraga-kartan-prototyp.html`.

### Uppgift 12: Vyfunktioner och klient

**Filer:** Skapa `src/lib/fraga/vy.ts`, `src/lib/fraga/klient.ts`, `src/lib/fraga/vy.test.mjs` och `src/lib/fraga/klient.test.mjs`.

**Gränssnitt:**
- Ger:
  ```ts
  // vy.ts: rena funktioner som ger HTML-strängar; all text escapas
  export function kortHtml(o: Kartpost, skal: readonly string[], e: Etiketter): string;
  export function svarHtml(s: Svar, poster: ReadonlyMap<string, Kartpost>, faq: readonly Kunskap[], e: Etiketter): string;
  export function overlamnaHtml(fraga: string, kartlank: string): string; // Discord-rutan, SAJT.discord som argument från anroparen
  // klient.ts
  export function skapaKlient(d: { fetchFn?: typeof fetch; lokalt: (k: Kropp) => Promise<Svar> }): { fraga(k: Kropp): Promise<Svar | null> };
  ```
- `fraga` avbryter föregående anrop. Det ger `null` för ett avbrutet anrop och använder `lokalt` vid 403, 404, 405, 429, 503 och nätverksfel.

- [ ] **Steg 1: Fallerande tester.**
  - `kortHtml`:
    - beskrivningen visas ordagrant och escapad (`<script>` blir `&lt;script&gt;`)
    - `ds: 'claimed'` ger märket "egen uppgift" och `ds: 'confirmed'` ger "bekräftad"
    - "kontrollerad 2026-10-04" står med
    - permalänken är `/organisation/<id>`
  - `svarHtml`:
    - `traffar` med 18 träffar och 5 visade ger texten "18 på kartan matchar · visar 5, urvalet byts varje dag" och länken "Visa alla 18 på kartan →" till `kartlank`
    - `bred` ger fyra snabbsvar
    - `ranking` ger inga kort
    - `opensverige` visar svaret med "Källa:" och datum
    - `borttaget: ['känsliga']` ger raden "Ingen nämner ”känsliga”."
    - `tomt`, `kontakt` och ett svar med `manniska: true` ger Discord-rutan. `traffar` utan `manniska` ger den inte.
    - `utanModell: true` ger raden "Tolkningen gjordes utan AI." i "Så hittade jag dem"
    - `traffar` och `opensverige` har "Hjälpte det? Ja / Nej"
  - `klient`:
    - 404 ger det lokala svaret
    - två anrop i följd, där det första är långsamt, ger att bara det andra löses med ett svar och att det första blir `null`. Det är granskningsfokus 5.
- [ ] **Steg 2:** Kör testerna. Väntat: FAIL.
- [ ] **Steg 3:** Skriv modulerna. Texterna är de i specen 3.5–3.7 och 3.6-tabellen, ordagrant.
- [ ] **Steg 4:** `npm test`. Väntat: PASS.
- [ ] **Steg 5:** Commit `feat(fraga): svaren som HTML och klienten mot servern`.

### Uppgift 13: Första skärmen, fältet och samtalet

**Filer:**
- Skapa: `src/components/Fraga.astro`. Den innehåller fältet, förslagslistan, raden under, samtalspanelen, stilarna och ett `<script>` som binder ihop dem.
- Ändra: `src/components/KartApp.astro`:
  - montera `<Fraga />` när `lage === 'karta'`
  - utöka `window.aiKartan`
- Ändra: `src/components/Sidhuvud.astro`. Platsen `huvudplats` står bredvid sökformen, och sökformen döljs när `html[data-fraga]` är satt.
- Ändra: `src/layouts/Bas.astro`. Ett inline-skript före första ritningen sätter `document.documentElement.dataset.fraga = '1'` bara på kartsidan (sajtens rot, med hänsyn till `BASE_PATH`) och bara när adressen har `fraga=1`. På alla andra sidor är sidhuvudet oförändrat.

**Gränssnitt mot kartan:**

```ts
interface Kartgranssnitt {
  karta: maplibregl.Map;
  sok(q: string): { org: Kartpost[] };
  oppnaOrg(id: string): void;
  lyft(ids: readonly string[] | null): void;
  sparaFilter(): Filter;
  aterstall(f: Filter): void;
}
```

Gränssnittet sätts på `window.aiKartan` i `KartApp.astro`, och händelsen `aikartan:redo` skickas när datan finns.

**Beteendet** är det i specen 3.1–3.7. Sammanfattat:
- Lägena `hem`, `karta` och `chatt`. Fältet glider mellan `#hemplats`, `#huvudplats` och `#chattplats` på 560 ms.
- Placeholdern skriver ut de fem exemplen och står still med `prefers-reduced-motion`.
- H1 är "Fråga Sveriges AI-karta", och raden under fältet har exakt texterna i specen 3.1.
- Förslagslistan har "Fråga AI" först och högst 4 träffar. I samtalsläget visas ingen lista.
- Tolkningsraden skrivs ut efter hand i webbläsaren, och står färdig direkt med `prefers-reduced-motion`.
- Efter 6 frågor tar fältet inte emot fler, och svaret föreslår "Ny fråga".
- `⌘K` fokuserar fältet.
- Klick på en prick, eget drag eller zoom, val i listan och "utforska" byter till kartläget. Loggan går tillbaka.
- Panelen visar samtalet. Bottenbladet fälls upp till 74 % på mobil.
- `← Kartan` återställer de sparade filtren.

- [ ] **Steg 1:** Bygg komponenten. `Fraga.astro` använder `skapaKlient` och `svarHtml` från uppgift 12. `lokalt` kör `svara(…, null, …)` med kartans data och `/api/fraga-data.json`, som hämtas första gången samtalet öppnas.
- [ ] **Steg 2:** Kör `npm run dev` och öppna `/?fraga=1` i webbläsarpanelen. Kontrollera på desktop och mobil:
  1. första skärmen är som prototypen
  2. "voice" ger förslagslistan med "Fråga AI" först
  3. Enter ger ett svar i panelen, från reservvägen eftersom `dev` saknar funktionen
  4. kartan dämpar organisationerna utan träff
  5. drag på kartan byter till kartläget
  6. `← Kartan` återställer filtren
  7. två snabba frågor i följd ger bara det sista svaret
  8. `/` utan parametern ser ut exakt som i dag
- [ ] **Steg 3:** Kör med tangentbord och skärmläsare:
  - Tab-ordningen fungerar.
  - Förslagslistan har `role="listbox"` och `aria-activedescendant`.
  - Samtalsloggen har `aria-live="polite"`.
  - Kontrasten är minst AA. Kontrollera den med `javascript_tool` på de nya färgerna.
- [ ] **Steg 4:** `npm test && npm run check && npm run build`. Väntat: grönt.
- [ ] **Steg 5:** Ta skärmbilder på desktop och mobil och visa dem för Gustaf.
- [ ] **Steg 6:** Commit `feat(fraga): första skärmen, fältet och samtalet bakom ?fraga=1`.

### Uppgift 14: Kartan lyfter svaret

**Filer:** Ändra `src/components/KartApp.astro`, där `lyft` är en del av `window.aiKartan`.

- [ ] **Steg 1:** Implementera `lyft(ids)`:
  - `null` återställer allt.
  - Med id:n dämpas prickarna och kommunytorna utan träff till cirka 15 % opacitet, via paint-uttryck på kartans befintliga lager.
  - `fitBounds` görs mot träffarna med panelens marginal, med `kartMarginal()` som bas och `setPadding` nollställd först.
  - Hovring över ett kort markerar pricken. Klick på namnet flyger dit.
- [ ] **Steg 2:** Kontrollera i webbläsarpanelen:
  - "datorseende i Västerbotten" lyfter bara de 5 och ramar in dem.
  - `← Kartan` tar tillbaka hela kartan.
  - Dämpningen fungerar på exakta adresser (fyllda prickar) och på kommunnivå (konturer).
- [ ] **Steg 3:** `npm run check && npm run build`.
- [ ] **Steg 4:** Commit `feat(karta): kartan lyfter svarets träffar`.

### Uppgift 15: Händelser, integritet och texter

**Filer:**
- Ändra: `src/lib/handelser.ts` och `src/lib/handelser.test.mjs`
- Ändra: `src/pages/integritet.astro`, `src/pages/om.astro` och `CHANGELOG.md`

- [ ] **Steg 1: Fallerande tester** i `handelser.test.mjs`:
  - `fraga_stalld` med `{ sort: 'traffar' }` är tillåten.
  - `fraga_stalld` med `{ sort: 'traffar', text: 'x' }` stoppas.
  - `fraga_klick` med `{ mal: 'discord' }` är tillåten.
  - `fraga_tumme` med `{ svar: 'ja' }` är tillåten.
  - `forsta_handling` med `{ typ: 'ai' }` är tillåten.
- [ ] **Steg 2:** Kör testerna. Väntat: FAIL.
- [ ] **Steg 3:** Lägg till händelserna exakt som i specen 5.11 och anropa dem från `Fraga.astro`.
- [ ] **Steg 4: Texterna.**
  - `/integritet` får ett avsnitt "När du frågar kartan" med:
    - vad som skickas (frågan och tidigare frågor i samma samtal, aldrig något annat)
    - till vem (Berget AI, organisationsnummer 559504-7522)
    - var det körs (enligt Bergets skriftliga svar, annars "inom EES enligt avtalet")
    - att Berget inte sparar frågorna enligt sitt DPA
    - att inget sparas hos oss
    - att samtalet försvinner vid omladdning
    - att de tre händelserna bara bär fasta värden
  - `/om` får en mening om att föreningen köper inferens av Berget AI, att det inte är en rekommendation och att posten på kartan behandlas som alla andra.
  - `CHANGELOG.md` får en rad i repots stil.
- [ ] **Steg 5: STOPP, Gustaf.** Visa texterna och vänta på godkännande. Specen kräver att `/integritet` är uppdaterad före den dolda betan.
- [ ] **Steg 6:** `npm test && npm run check && npm run build`.
- [ ] **Steg 7:** Commit `feat(fraga): händelser och integritetstext`.

## Del D: betan

### Uppgift 16: Dold beta

Allt här görs av Gustaf eller med hans uttryckliga ja, eftersom det rör produktionen.

- [ ] **Steg 1:** Gustaf lägger `FRAGA_API_NYCKEL` i Vercels miljövariabler för Production och Preview.
- [ ] **Steg 2:** Gustaf skapar en regel för taktbegränsning i Vercels brandvägg: `/api/fraga`, 10 anrop per 60 s och IP, åtgärden `deny`. Han förbereder också en avstängd regel som nekar hela `/api/fraga`, som brytare. Båda står i README från uppgift 11.
- [ ] **Steg 3:** Gustaf sätter en budgetvarning hos Berget, om sådan finns.
- [ ] **Steg 4:** PR mot `main` med Gustafs ja. Efter merge: kontrollera i produktionen att `/?fraga=1` svarar med `utanModell: false`, och att `/` ser ut som i dag.
- [ ] **Steg 5:** Kör `npm run prova:fraga` mot produktionen en gång och lägg resultatet i PR-kommentaren.
- [ ] **Steg 6:** Länken `/?fraga=1` delas i Discord av Gustaf, inte av en agent.

Fas 2, där första skärmen blir standard, är en egen ändring efter betan och ingår inte i den här planen.
