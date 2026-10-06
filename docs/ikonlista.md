# Ikonlista

Ikoner som kartan behöver, i den ordning de gör mest nytta. Filnamnet är kategorins id i datan, så att sajten kan hämta rätt ikon utan en översättningstabell.

## Format

- Kvadratisk bild med genomskinlig bakgrund, minst 96 × 96 pixlar. Ikonerna visas i 16 till 44 pixlar.
- Samma stil och linjetjocklek på alla. Motivet ska gå att känna igen i 16 pixlar, så ett föremål per ikon och inga detaljer.
- En färg, eller en färg plus kartnålens röda. Sajten har både ljus och mörk bakgrund på sikt.
- PNG eller SVG. Lägg dem i `public/ikoner/<grupp>/<id>.png`, till exempel `public/ikoner/typ/bolag.png`.

## Så läggs en ikon in

1. Beskär bilden tätt runt motivet och spara den som en kvadrat på 192 pixlar.
2. Lägg filen i `public/ikoner/typ/` med typens id som namn, till exempel `finansiar.png`.
3. Klart. Sajten letar efter filen när den byggs. Typen ritas då som landmärke på kartan, och ikonen syns på korten, i filtret och på organisationssidan. Typer utan fil har kvar sin färgprick.

På plats i dag: `myndighet` och `kommun_region`. Bara typer läses in på det här sättet än, inte de andra grupperna i listan.

## 1. Typ av organisation (8)

Syns som färgprick i filtret, på korten och på kartans punkter. Den viktigaste gruppen.

| Fil | Etikett | Förslag på motiv |
|---|---|---|
| `typ/bolag` | Bolag | Kontorshus |
| `typ/myndighet` | Myndighet | Byggnad med pelare |
| `typ/kommun_region` | Kommun eller region | Stadshus eller kartbit med gräns |
| `typ/larosate` | Lärosäte eller forskningsmiljö | Studentmössa eller mikroskop |
| `typ/community` | Community eller förening | Tre personer i ring |
| `typ/finansiar` | Finansiär | Mynt eller planta som växer ur ett mynt |
| `typ/infrastruktur` | Infrastruktur | Serverrack eller grafikkort |
| `typ/enskild_firma` | Enskild firma | En person med verktyg. Används först när enskilda firmor tas emot. |

## 2. Erbjuder (9)

Syns som etiketter på korten och i filtret Erbjuder.

| Fil | Etikett | Förslag på motiv |
|---|---|---|
| `erbjuder/produkt` | Egen produkt | Låda eller app-ruta |
| `erbjuder/utveckling` | Utveckling åt andra | Skiftnyckel eller kodtecken |
| `erbjuder/infrastruktur` | Infrastruktur och hosting | Samma som `typ/infrastruktur` |
| `erbjuder/data` | Data | Databascylinder |
| `erbjuder/forskning` | Forskning | Provrör eller atom |
| `erbjuder/utbildning` | Utbildning | Uppslagen bok |
| `erbjuder/community` | Community | Samma som `typ/community` |
| `erbjuder/finansiering` | Finansiering | Samma som `typ/finansiar` |
| `erbjuder/oppen_kallkod` | Öppen källkod | Öppet hänglås eller förgrening |

## 3. Status på en uppgift (4)

Syns bredvid varje uppgift på organisationssidan. I dag bara text och färg.

| Fil | Etikett | Förslag på motiv |
|---|---|---|
| `status/confirmed` | Bekräftad | Bock i cirkel |
| `status/claimed` | Egen uppgift | Pratbubbla |
| `status/planned` | Planerad | Klocka eller kalender |
| `status/unknown` | Okänd | Frågetecken |

## 4. Vägar in och åtgärder (9)

Syns på sidan Bidra och under Rätta eller ta bort.

| Fil | Används för | Förslag på motiv |
|---|---|---|
| `vag/discord` | Skriv till oss på Discord | Pratbubbla. Använd inte Discords logotyp utan att läsa deras regler. |
| `vag/github` | Lägg till via GitHub | Förgrening. Samma förbehåll för GitHubs logotyp. |
| `vag/epost` | E-post, kommer snart | Kuvert |
| `vag/formular` | Formulär, kommer snart | Blankett |
| `atgard/lagg-till` | Lägg till en organisation | Plus |
| `atgard/ratta` | Rätta en uppgift | Penna |
| `atgard/ta-bort` | Ta bort en post | Papperskorg |
| `atgard/dela` | Kopiera länk till urvalet | Kedjelänk |
| `atgard/ladda-ner` | Ladda ner urvalet | Pil ner i en låda |

## 5. Tomma lägen och besked (5)

Större bilder, gärna i samma stil som handen med kartnålen.

| Fil | När den visas | Förslag på motiv |
|---|---|---|
| `lage/inga-traffar` | Filtret ger inga organisationer | Handen med förstoringsglas |
| `lage/saknas` | Sidan finns inte (404) | Handen med en tom nål |
| `lage/ingen-plats` | Organisationen saknar kommun | Nål med frågetecken |
| `lage/nykontrollerad` | Posten är kontrollerad nyligen | Bock med klocka |
| `lage/behover-koll` | Posten har gått 180 dagar utan omkontroll | Klocka med utropstecken |

## 6. Område (18)

Syns i filtret Område och på organisationssidan. Kan vänta: det är många, och filtret fungerar med bara text.

| Fil | Etikett | Förslag på motiv |
|---|---|---|
| `omrade/agenter_automation` | Agenter och automation | Robotarm eller kugghjul |
| `omrade/datorseende` | Datorseende | Öga |
| `omrade/energi_klimat` | Energi och klimat | Blixt eller vindkraftverk |
| `omrade/fastighet_bygg` | Fastighet och bygg | Lyftkran |
| `omrade/fintech` | Finans och försäkring | Sedel eller diagram |
| `omrade/forsvar_sakerhet` | Försvar och säkerhet | Sköld |
| `omrade/handel` | Handel och e-handel | Kundvagn |
| `omrade/halsa` | Hälsa och life science | Hjärta med puls |
| `omrade/industri` | Industri och tillverkning | Fabrik |
| `omrade/jordbruk_skog` | Jordbruk och skog | Gran |
| `omrade/juridik` | Juridik | Vågskål |
| `omrade/media_kreativt` | Media och kreativt | Pensel eller filmklappa |
| `omrade/offentlig_sektor` | Offentlig sektor | Samma som `typ/myndighet` |
| `omrade/robotik` | Robotik | Robot |
| `omrade/sprakteknik` | Språkteknik | Bokstäverna Å Ä Ö eller pratbubbla med text |
| `omrade/transport_mobilitet` | Transport och mobilitet | Lastbil |
| `omrade/utbildning` | Utbildning | Samma som `erbjuder/utbildning` |
| `omrade/generell` | Generell AI | Gnista |

## 7. Sorters belägg (10)

Syns framför varje belägglänk på organisationssidan. Kan vänta.

| Fil | Etikett | Förslag på motiv |
|---|---|---|
| `belagg/produkt` | Produkt eller tjänst | Samma som `erbjuder/produkt` |
| `belagg/repo` | Kodförråd | Förgrening |
| `belagg/modell` | Publicerad modell | Nätverk av noder |
| `belagg/dataset` | Publicerat dataset | Samma som `erbjuder/data` |
| `belagg/demo` | Demo | Spela-knapp |
| `belagg/publikation` | Publikation | Dokument |
| `belagg/case` | Dokumenterat case | Portfölj eller handslag |
| `belagg/resurs` | Resurs eller infrastruktur | Samma som `typ/infrastruktur` |
| `belagg/program` | Program eller utlysning | Kalender |
| `belagg/portfolj` | Portfölj | Mapp med flera kort |

## Antal

| Grupp | Unika motiv | Prioritet |
|---|---:|---|
| Typ | 8 | Först |
| Erbjuder | 6 nya, 3 återanvänds | Först |
| Status | 4 | Först |
| Vägar in och åtgärder | 9 | Sedan |
| Tomma lägen | 5 | Sedan |
| Område | 16 nya, 2 återanvänds | Kan vänta |
| Sorters belägg | 6 nya, 4 återanvänds | Kan vänta |

Första omgången är 18 ikoner. Allt tillsammans är 54.

Gränssnittets små linjeikoner (sök, pilar, kryss, meny, zoom) finns redan i `src/lib/ikoner.ts` och behöver inte ritas om.
