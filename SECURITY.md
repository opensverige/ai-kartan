# Säkerhet

## Inga hemligheter i repot

Sajten är statisk och behöver inga nycklar. De enda hemligheter som förekommer är valfria och sätts som GitHub-secrets, aldrig i filer: `DISCORD_WEBHOOK_URL` (färskhetslarm till Discord), `BOT_TOKEN` (så att PR:er skapade ur ärenden triggar CI), `VERCEL_TOKEN` (frågestatistiken läser Vercels logg) och `HISTORIK_NYCKEL` (deploy-nyckeln som pushar ändringshistoriken till main). Committa aldrig nycklar, tokens eller personuppgifter.

## Rapportera

- Sårbarhet i koden eller flödena: öppna ett ärende och skriv att du har en säkerhetsrapport, utan detaljer, så tar vi kontakten vidare. Eller skriv i [Discord](https://discord.gg/ZbV4qB34um). Samma vägar står i [security.txt](https://karta.opensverige.se/.well-known/security.txt).
- Personuppgift som hamnat i datan: [borttagningsärende](https://github.com/opensverige/ai-kartan/issues/new?template=borttagning.yml). Vi tar bort inom 14 dagar, oftast samma dag.

## Flöden med skrivrättigheter

- `andringar.yml` committar `history/changelog.json` till main. Regeln för main kräver pull request, så pushen går med deploy-nyckeln i `HISTORIK_NYCKEL`, som står på regelns bypass-lista.
- `ny-organisation.yml` skapar en gren och en pull request ur ett ärende. Innehållet valideras först; PR:en mergas aldrig automatiskt.
- `tips.yml` märker och kommenterar ärenden från det korta formuläret, och skriver om ärendetexten när den innehåller något som ser ut som ett personnummer. Flödet har bara läsrätt till koden.
- `farskhet.yml` och `lankkoll.yml` öppnar och kommenterar ärenden.
- `fragestatistik.yml` committar frågestatistiken till grenen `statistik` och öppnar larmärenden.
- `granskning.yml` skriver granskningslistan och sätter läget Granskning mot kriterierna på pull requests. Det körs på `pull_request_target`, och därför gäller: flödet och skripten körs alltid ur main, pull requestens commits hämtas bara som git-data och checkas aldrig ut, inget ur pull requesten eller kommentarerna sätts in i ett skalkommando, och token får bara skriva kommentarer och lägen (`pull-requests: write`, `statuses: write`), inte kod.

Inga andra flöden kör på `pull_request_target`. `validera.yml` kör på `pull_request` och får därmed inga hemligheter när pull requesten kommer från en kopia av repot.

## Sajten

Svarshuvudena sätts i `vercel.json`: HSTS med preload, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` och `Permissions-Policy`. Content Security Policy sätts av Astro vid bygget (`security.csp` i `astro.config.mjs`) som en `meta`-tagg med hashar för sajtens inline-skript och inline-stilar, så ett skript som inte byggdes in körs inte.
