# PRD: AI OpenSverige på Tech Embassy

Status: utkast för discovery och implementation  
Datum: 2026-10-19  
Arbetsnamn: AI OpenSverige  
Yta: techembassy.se / karta.opensverige.se

> Kopia av PRD:n som Gustaf skickade i samtalet 2026-10-19. Designen står i [2026-10-19-fraga-kartan-design.md](2026-10-19-fraga-kartan-design.md) och går före PRD:n där de skiljer sig.

## 1. Sammanfattning

AI OpenSverige ska vara en liten, snabb och källbunden chatt på Tech Embassy. Besökaren ska kunna fråga med egna ord om Sveriges AI-ekosystem och få hjälp att:

1. hitta relevanta organisationer, projekt, resurser och infrastruktur i Tech Embassy,
2. förstå OpenSverige, dess projekt och hur communityn fungerar,
3. gå vidare till OpenSveriges Discord när behovet kräver en människa, praktisk hjälp eller någon att bolla med.

Produkten ska kännas som en enkel ChatGPT-liknande dialog, inte som ett formulär, en sökmotor med avancerade filter eller en ny social plattform.

Tech Embassy är den strukturerade kunskapsbasen. Discord är communityn där människor möts. AI OpenSverige är ett tunt lager som hjälper användaren att hitta rätt mellan dem.

## 2. Problemet

Tech Embassy innehåller en växande mängd källbelagd information, men en ny besökare behöver fortfarande förstå taxonomin, filtren och hur olika organisationer passar det egna behovet.

Samtidigt innehåller OpenSveriges Discord mänsklig erfarenhet som inte bör skrapas, kopieras eller ersättas av en bot. När frågan kräver bedömning, praktisk erfarenhet eller samarbete behöver användaren komma in i communityn och fråga där.

Nuvarande gap:

- användaren vet inte alltid vilka ord eller filter som ska användas,
- en vanlig sökning förstår inte målet bakom frågan,
- kartdata och information om OpenSverige ligger i olika delar av ekosystemet,
- det finns ingen tydlig övergång från publik information till mänsklig hjälp,
- en generisk chatbot riskerar att hallucinera, ranka aktörer eller bli en återvändsgränd utanför communityn.

## 3. Produktmål

### Primärt mål

En besökare ska på mindre än en minut kunna gå från en fri fråga till en källbelagd och användbar riktning framåt.

### Sekundära mål

- Göra Tech Embassys data mer tillgänglig utan att ändra dess metod eller neutralitet.
- Hjälpa nya personer förstå OpenSverige med korta, korrekta svar.
- Leda relevanta behov till Discord och därigenom stärka communityn.
- Synliggöra återkommande kunskaps- och kompetensluckor utan att lagra onödiga personuppgifter.
- Skapa en grund som senare kan förbättras med utvärderingar och aggregerade signaler.

### Icke-mål

MVP:n ska inte:

- skapa ett nytt medlems- eller profilsystem,
- bygga privata meddelanden eller en inbox,
- automatiskt introducera personer,
- skrapa eller indexera Discord-konversationer,
- läsa föreningens medlemsregister,
- ringa användare eller erbjuda en voice-agent,
- publicera användares behov på sajten,
- ranka vilka organisationer eller människor som är bäst,
- ersätta communityns mänskliga svar,
- bli en generell ChatGPT-klon för frågor utanför OpenSveriges område.

## 4. Produktlöfte

Rekommenderad huvudcopy:

> **Vad letar du efter?**
>
> Jag kan hjälpa dig hitta svenska AI-byggare, organisationer, projekt och infrastruktur — eller förklara vad OpenSverige är.

Placeholder i chatten:

> Jag behöver hjälp med …

AI:n ska inte lova att den kan hitta en specifik person eller ordna en introduktion. Den kan hitta relevanta poster och hjälpa användaren ta frågan vidare till communityn.

## 5. Målgrupper

### Builder

Bygger en produkt eller ett open-source-projekt och söker teknik, infrastruktur, kunskap, samarbeten eller någon att bolla med.

### Organisation

Söker svenska AI-leverantörer, forskningsmiljöer, partners, projekt eller en bättre bild av ekosystemet.

### Ny communitymedlem

Vill förstå vad OpenSverige är, hur man går med, var aktiviteter finns och hur man bidrar.

### Researcher, journalist eller offentlig aktör

Vill hitta källbelagd information om vilka som bygger vad, inom vilken region och med vilken typ av erbjudande.

## 6. Kärnupplevelse

### 6.1 Första vyn

Chatten ska vara direkt användbar utan konto, cookie-banner eller onboarding.

Den ska innehålla:

- rubriken ”Vad letar du efter?”,
- en kort förklaring,
- ett chattfält med placeholder ”Jag behöver hjälp med …”,
- eventuellt tre eller fyra exempel som fyller chattfältet men inte fungerar som separata formulär,
- tydlig information om att användaren talar med AI.

Möjliga exempel:

- Vilka bygger svenska voice-agenter?
- Jag behöver svensk AI-infrastruktur.
- Vilka AI-projekt finns i Göteborg?
- Vad är OpenSverige?

### 6.2 Fråga

Användaren skriver naturlig text. AI:n ska normalt svara direkt.

AI:n får ställa högst en följdfråga innan den visar användbara resultat. En följdfråga används endast när svaret materiellt ändrar sökningen, exempelvis:

> Söker du en teknisk leverantör, någon att bygga tillsammans med eller bara en översikt?

AI:n ska inte starta en lång intervju.

### 6.3 Resultat

Ett normalt resultat innehåller:

1. en kort tolkning av vad användaren verkar söka,
2. två till fem relevanta resultat,
3. en konkret förklaring för varje resultat,
4. länk till den permanenta sidan på Tech Embassy eller en relevant OpenSverige-sida,
5. källstatus och datum när dessa påverkar hur säkert påståendet är,
6. ett relevant nästa steg.

Exempel:

> Jag tolkar det som att du söker svensk kompetens inom telefoni för en voice-agent.
>
> **Telness Tech**  
> Matchar eftersom organisationen arbetar med programmerbar telefoni och API:er.  
> [Visa på Tech Embassy]
>
> **Sinch**  
> Matchar telefoni och meddelandeinfrastruktur.  
> [Visa på Tech Embassy]

Resultaten ska inte visa en opak procentsiffra eller påstå att någon aktör är bäst.

### 6.4 Handoff till Discord

När användaren behöver praktisk hjälp, mänsklig bedömning, en diskussionspartner eller ett samarbete ska AI:n erbjuda en tydlig övergång:

> Vill du bolla detta med människor som bygger? Ta frågan till OpenSveriges Discord.

Primär knapp:

> **Bolla med builders i Discord**

Sekundär funktion kan kopiera en kort sammanfattning av frågan så att användaren slipper skriva om den i Discord. MVP:n ska inte posta automatiskt och ska inte skapa en Discord-identitet åt användaren.

### 6.5 Frågor om OpenSverige

AI:n ska kunna besvara exempelvis:

- Vad är OpenSverige?
- Är det en ideell förening?
- Hur går jag med?
- Kostar medlemskap?
- Måste jag vara medlem för att gå med i Discord?
- Hur lägger jag till eller rättar en organisation?
- Vilka projekt finns?
- Var hittar jag meetups och demos?
- Vad är skillnaden mellan OpenSverige och Tech Embassy?

Svar ska komma från publicerade OpenSverige-källor och länka vidare.

## 7. Svarsstil

Svar ska vara:

- på svenska som standard,
- korta och konkreta,
- källbundna,
- transparenta om osäkerhet,
- strukturerade för mobilskärm,
- fria från marknadsföringsspråk och överdrifter.

AI:n ska:

- säga när den inte hittar en relevant post,
- skilja mellan bekräftad uppgift och organisationens egen uppgift,
- undvika att anta att en organisation erbjuder personlig hjälp,
- aldrig hitta på kontaktpersoner, relationer eller medlemskap,
- erbjuda Discord när en människa behövs.

AI:n ska inte:

- ge långa essäer när tre kort räcker,
- svara på helt orelaterade frågor,
- skapa intrycket att OpenSverige rekommenderar eller garanterar en aktör,
- tagga eller kontakta Discord-medlemmar,
- använda dold popularitet eller betalning i ordningen på resultaten.

## 8. Informationskällor

MVP:n ska använda publika, godkända källor.

### Tech Embassy

- `/api/data.json`
- `/api/data/<id>.json`
- relevanta taxonomier och scheman
- organisationssidor och permanenta länkar
- källstatus, källtyp och verifieringsdatum

### OpenSverige

- publicerade sidor på opensverige.se,
- stadgar, regler och integritetspolicy,
- publika projektsidor och Showcase,
- publicerad information om Discord, aktiviteter och medlemskap,
- `llms.txt` eller annan bygggenererad kunskapsfil när den är lämplig.

### Ej tillåtna källor i MVP

- föreningens medlemsregister,
- privata Discord-kanaler,
- systematisk indexering av Discord-meddelanden,
- privata e-postmeddelanden,
- data som kräver inloggning och inte uttryckligen är avsedd för AI:n,
- automatiskt skrapade personprofiler.

## 9. Sök- och svarsbeteende

Implementationen är medvetet inte låst till en viss modell, databas eller vektortjänst. Följande beteende är däremot obligatoriskt.

### 9.1 Retrieval först

AI:n ska inte få hela organisationsdatasetet i varje prompt.

En fråga ska först översättas till relevanta sökbegrepp och filter, exempelvis:

```json
{
  "intent": "find_organisations",
  "topics": ["voice-agenter", "telefoni", "språkteknik"],
  "offers": ["egen-produkt", "utveckling-at-andra"],
  "geography": ["sverige"],
  "human_help_requested": true
}
```

Söklagret hämtar ett begränsat antal kandidater. Modellen får därefter kandidaterna tillsammans med källstatus och länkar för att formulera svaret.

### 9.2 Neutral relevans

Resultat får ordnas efter hur väl de uttryckligen matchar användarens fråga, men ordningen får inte presenteras som kvalitet, popularitet eller OpenSveriges rekommendation.

Varje resultat ska kunna förklaras genom observerbara fält:

- område,
- erbjudande,
- beskrivning,
- geografi,
- publik evidens,
- användarens uttryckliga kriterier.

### 9.3 OpenSverige-kunskap

Frågor om föreningen eller communityn ska besvaras från ett litet, versionshanterat kunskapsunderlag. AI:n ska länka till originaltexten i stället för att försöka återge juridiska eller organisatoriska detaljer ur minnet.

### 9.4 Avgränsning

När frågan ligger utanför produktens område ska AI:n svara kort:

> Jag är till för frågor om svenska AI-byggare, organisationer, infrastruktur och OpenSverige.

## 10. Konceptuella verktyg

Namnen är illustrativa och låser inte implementationen.

### `search_tech_embassy`

Input:

- fri fråga,
- strukturerade ämnen,
- valfria filter för region, organisationstyp och erbjudande.

Output:

- högst ett begränsat antal kandidater,
- stabilt ID och permanent URL,
- relevanta fält,
- källstatus och datum,
- kort maskinläsbar matchförklaring.

### `search_opensverige`

Input:

- fråga om föreningen, communityn, medlemskap, projekt eller aktiviteter.

Output:

- relevanta textavsnitt,
- sidtitel,
- URL,
- senaste uppdateringsdatum när det finns.

### `prepare_discord_handoff`

Input:

- användarens fråga,
- AI:ns korta tolkning.

Output:

- Discord-länk,
- kort text som användaren kan kopiera,
- ingen automatisk postning.

## 11. Arkitekturprinciper

- Den befintliga Astro-sajten och Git/YAML-datan ska förbli primär källa.
- Funktionen ska läggas ovanpå kartan, inte skriva tillbaka AI-genererade uppgifter till organisationernas YAML-filer.
- Undvik att göra hela den statiska sajten serverrenderad enbart för chatten.
- Modell, sökmetod och hosting ska kunna bytas utan att UX-kontraktet ändras.
- Modellen får aldrig vara enda källan till faktapåståenden om organisationer eller föreningen.
- Det ska finnas en deterministisk fallback som kan visa vanliga sökresultat om modellen är nere.
- Rate limiting, kostnadstak och maximal konversationslängd ska finnas från start.
- Inga hemligheter eller administrativa API-nycklar får exponeras i webbläsaren.

Möjlig men ej föreskriven topologi:

```text
Chat UI på Tech Embassy
        │
        ▼
Tunn serverfunktion / chat-endpoint
        │
        ├── sökindex byggt från befintlig YAML/JSON
        ├── OpenSverige-kunskapsindex
        └── utbytbar språkmodell
```

## 12. Integritet och dataminimering

MVP:n kräver inget konto och ska inte be om namn, e-post eller telefonnummer.

Standard:

- konversationen behöver bara finnas under den aktiva sessionen,
- råa frågor ska inte sparas långsiktigt som standard,
- inga chattar används för modellträning,
- inga personprofiler skapas,
- medlemsregistret hålls helt separat,
- Discord-handoff sker genom användarens eget initiativ.

Om produktanalys behövs bör systemet i första hand lagra aggregerade, icke identifierande händelser, exempelvis:

- frågekategori,
- om sökningen gav resultat,
- vilka organisations-ID:n som visades,
- om en Tech Embassy-länk klickades,
- om Discord-handoff klickades,
- frivillig tumme upp eller ned.

Rå frågetext eller fullständiga chattar kräver ett separat beslut, tydligt ändamål, retentionstid och uppdaterad integritetsinformation.

## 13. Markovkedjan: möjliga nedströmseffekter

Produkten bör byggas så att ett enkelt första steg kan ge fler nyttiga tillstånd senare, utan att alla dessa funktioner byggs nu.

```text
Fråga
  → källbelagt resultat
    → klick till organisation eller resurs
      → löst informationsbehov
    → handoff till Discord
      → mänskligt svar
        → samarbete, meetup eller projekt
        → ny resurs eller Showcase-post
          → rikare OpenSverige-kunskap
            → bättre framtida svar
    → inget relevant resultat
      → aggregerad kompetenslucka
        → förbättrad taxonomi eller karta
        → riktad aktivitet eller rekrytering till communityn
```

### Möjliga framtida nyttor

- Återkommande frågekategorier kan visa vilka guider som saknas.
- Många frågor om samma teknik kan motivera en meetup eller arbetsgrupp.
- Tomma resultat kan avslöja luckor i kartan eller taxonomin.
- Klick utan senare nytta kan avslöja missvisande matchlogik.
- Discord-handoffs kan ge nya kvalificerade communitymedlemmar.
- Communityprojekt kan senare återföras till Tech Embassy och Showcase.
- Ett opt-in-baserat lager av personer som vill hjälpa kan byggas senare, om behov och supply först har bevisats.

### Begränsning

MVP:n ska inte implementera denna kedja som ett komplext automatiserat system. Den ska endast bevara de nödvändiga gränserna och minimala signalerna så att framtida steg är möjliga.

## 14. Minfält

### Generisk chatbot

Risk: Resultatet blir en trevlig men opålitlig chatbot som svarar från modellens minne.

Motmedel: Retrieval och källor är obligatoriska för faktasvar.

### Ogenomskinlig ranking

Risk: ”Bästa bolaget” eller procentmatchningar bryter mot kartans neutralitet.

Motmedel: Visa observerbar överlappning och förklara varför en post visas.

### Communityn kringgås

Risk: Chatten försöker lösa allt och användaren kommer aldrig in i Discord.

Motmedel: Handoff ska vara naturligt när behovet kräver människor, utan att varje enkel faktasökning blir en Discord-reklam.

### Communityn spämmas

Risk: Varje fråga postas automatiskt i Discord.

Motmedel: MVP:n postar aldrig automatiskt. Användaren väljer och delar själv.

### Persondata smyger in i kartan

Risk: Kontaktpersoner och användarfrågor blandas med det öppna CC BY-datasetet och Git-historiken.

Motmedel: Chattsessioner och eventuell senare persondata hålls utanför organisations-YAML och publik historik.

### Föreningsmedlemskap används som produktprofil

Risk: Medlemsregistret får ett nytt ändamål och blir implicit communitydatabas.

Motmedel: Ingen koppling till medlemsregistret i MVP.

### Hela datasetet stoppas i prompten

Risk: Hög kostnad, långsamhet, dålig precision och stale context.

Motmedel: Separat retrieval och ett litet kandidatset per svar.

### Källstatus tappas bort

Risk: Organisationens egen uppgift presenteras som verifierat faktum.

Motmedel: Status och datum följer kandidaten genom hela svarspipelinen.

### Prompt injection i källmaterial

Risk: Text från organisationers sajter eller beskrivningar innehåller instruktioner till modellen.

Motmedel: Källmaterial behandlas som data, avgränsas och får aldrig ändra systeminstruktionen eller verktygsbehörigheter.

### Tomma resultat maskeras

Risk: Modellen hittar på när sökningen inte ger något.

Motmedel: Ett tomt eller svagt resultat ska uttryckligen kunna visas.

### Inloggning före värde

Risk: Besökaren tvingas skapa konto innan första frågan.

Motmedel: Ingen inloggning i MVP.

### Arkitekturen växer okontrollerat

Risk: Teamet bygger profiler, chattminne, vector DB, Discord-bot och matchmaking innan grundupplevelsen är bevisad.

Motmedel: Varje ny komponent måste kopplas till ett observerat misslyckande i den enklare lösningen.

### AI-regler och transparens

Risk: Användaren tror att svaret kommer från en mänsklig representant eller officiell bedömning.

Motmedel: Produkten identifieras tydligt som AI och skiljer mellan fakta, egen uppgift och tolkning.

### Kostnads- och missbruksrisk

Risk: Bottrafik, långa konversationer eller loopar skapar oväntade modellkostnader.

Motmedel: Rate limit, maximal konversationslängd, inputgräns, budgetlarm och billig modell som standard.

## 15. Framgångsmått

### Kvalitet före publik lansering

- Minst 80 procent av en manuellt kuraterad evaluppsättning ska få ett relevant resultat bland de tre första posterna.
- Faktapåståenden om organisationer och OpenSverige ska ha fungerande källänk.
- Noll fabricerade personer, medlemskap eller organisationer i evaluppsättningen.
- Systemet ska korrekt säga ”jag hittar inget tydligt” när underlag saknas.
- En användare ska kunna få första användbara svaret utan konto.
- Mobilupplevelsen ska vara fullständig och tangentbords-/skärmläsaranvändbar.

### Produktmått efter lansering

- Andel sessioner som leder till klick på relevant Tech Embassy-resultat.
- Frivillig feedback: hjälpsamt eller inte hjälpsamt.
- Andel relevanta sessioner som går vidare till Discord.
- Vanligaste anonymiserade frågekategorierna.
- Andel frågor där inget relevant underlag hittas.

Discord-klick ska inte maximeras blint. Ett informationsbehov som löses direkt på Tech Embassy är också ett lyckat resultat.

## 16. Evaluppsättning

Följande typer av frågor ska finnas som tester innan lansering:

1. Vilka bygger datorseende i Västerbotten?
2. Jag behöver svensk AI-infrastruktur för känsliga uppgifter.
3. Vilka arbetar med voice-agenter eller svensk TTS?
4. Finns det open-source-projekt för AI-agenter?
5. Vad är OpenSverige?
6. Måste jag vara föreningsmedlem för att gå med i Discord?
7. Hur lägger jag till mitt bolag på kartan?
8. Jag behöver någon att bolla SIP och telefoni med.
9. Vilket är Sveriges bästa AI-bolag?
10. Introducera mig till vd:n för en viss organisation.
11. En fråga på engelska om svenska AI-leverantörer.
12. En fråga som saknar relevanta träffar.
13. En prompt-injection-text inbäddad i användarfrågan.
14. En helt orelaterad fråga.

För varje test ska förväntat beteende anges, inte en exakt formulering.

## 17. Lanseringsplan

### Fas 0: lokal prototyp

- Enkel chattyta.
- Sökning mot befintlig Tech Embassy-data.
- Svar med länkar och matchförklaringar.
- Fast, källbunden OpenSverige-kunskap.
- Ingen lagring av konversationer.

### Fas 1: dold beta

- Test med personer från befintlig Discord.
- Kör evaluppsättningen och logga kvalitetsfel.
- Mät resultatklick, tomma resultat och frivillig feedback.
- Justera sökindex, taxonomi, copy och handoff.

### Fas 2: publik lansering

- Lägg chatten på Tech Embassy.
- Tydlig AI-transparens och integritetstext.
- Budgetlarm och rate limiting aktiverade.
- En ansvarig person kan snabbt stänga av modellen och lämna vanlig sökfallback aktiv.

### Senare, endast efter observerat behov

- bättre semantisk retrieval,
- opt-in-baserad ”jag kan hjälpa med”-signal,
- Discord-app som kan ta emot en explicit fråga,
- aggregerad behovsanalys,
- fler språk,
- publicerat maskinläsbart frågegränssnitt.

## 18. Öppna beslut

PRD:n låser inte följande:

- modellleverantör,
- exakt sökteknik,
- om retrieval är fulltext, embeddings eller hybrid,
- hosting för chat-endpoint,
- komponentbibliotek,
- exakt streamingimplementation,
- om sessionen ligger i minne, signerad cookie eller endast i klienten,
- analyticsleverantör,
- slutligt produktnamn.

Implementationen ska välja minsta lösning som uppfyller beteendet och passar det befintliga repot.

## 19. Definition of done för MVP

MVP:n är klar när:

- chatten fungerar på mobil och desktop,
- en fri svensk fråga kan söka kartan,
- relevanta resultat visas med förklaring och permanent länk,
- frågor om OpenSverige besvaras från publicerade källor,
- systemet kan säga att underlag saknas,
- Discord-handoff visas när mänsklig hjälp är relevant,
- ingen inloggning eller personprofil krävs,
- inga råa chattar lagras långsiktigt som standard,
- källstatus och datum inte förloras,
- evaluppsättningen når kvalitetskraven,
- rate limits, budgettak och en avstängningsmekanism finns,
- vanlig Tech Embassy-sökning fortfarande fungerar om AI-funktionen är avstängd.

## 20. Instruktion till en kodagent

Följande kan skickas tillsammans med PRD:n och repot:

> Läs hela PRD:n och repots instruktioner innan du ändrar något. Inspektera först befintlig Astro-arkitektur, datagenerering, sökfunktion, designsystem, API-filer och deploykonfiguration. Föreslå därefter den minsta arkitektur som uppfyller PRD:ns beteende utan att göra den statiska kartan onödigt dynamisk. Bevara Git/YAML som källa för organisationsdata, kartans källstatus och neutralitetsprinciper. Implementera en vertikal MVP: fri fråga → retrieval → källbundet svar → relevanta länkar → frivillig Discord-handoff. Lägg till evals för de angivna frågetyperna, fallback utan modell, rate limiting och kostnadsskydd. Välj leverantörer och tekniska komponenter utifrån befintligt repo och dokumentera valen; PRD:n föreskriver inte en viss modell eller vektordatabas. Bygg inte profiler, matchmaking, meddelanden, voice, Discord-skrapning eller permanent chattminne.

## 21. Referenser till nuvarande system

- Tech Embassy: https://karta.opensverige.se/
- Öppen data och API: https://karta.opensverige.se/data
- Metod och status: https://karta.opensverige.se/metod
- Kriterier: https://karta.opensverige.se/kriterier
- Kod och data: https://github.com/opensverige/ai-kartan
- OpenSverige: https://opensverige.se/
- Medlemskap: https://opensverige.se/bli-medlem
- Stadgar: https://opensverige.se/stadgar
- Integritet: https://opensverige.se/integritet
