# Säkerhet

## Inga hemligheter i repot

Sajten är statisk och behöver inga nycklar. De enda hemligheter som förekommer är valfria och sätts som GitHub-secrets, aldrig i filer: `DISCORD_WEBHOOK_URL` (färskhetslarm till Discord) och `BOT_TOKEN` (så att PR:er skapade ur ärenden triggar CI). Committa aldrig nycklar, tokens eller personuppgifter.

## Rapportera

- Sårbarhet i koden eller flödena: öppna ett ärende och skriv att du har en säkerhetsrapport, utan detaljer, så tar vi kontakten vidare. Eller skriv i [Discord](https://discord.gg/ZbV4qB34um).
- Personuppgift som hamnat i datan: [borttagningsärende](https://github.com/opensverige/ai-kartan/issues/new?template=borttagning.yml). Vi tar bort inom 14 dagar, oftast samma dag.

## Flöden med skrivrättigheter

- `andringar.yml` committar `history/changelog.json` till main med `GITHUB_TOKEN`.
- `ny-organisation.yml` skapar en gren och en pull request ur ett ärende. Innehållet valideras först; PR:en mergas aldrig automatiskt.
- `tips.yml` märker och kommenterar ärenden från det korta formuläret, och skriver om ärendetexten när den innehåller något som ser ut som ett personnummer. Flödet har bara läsrätt till koden.
- `farskhet.yml` och `lankkoll.yml` öppnar och kommenterar ärenden.

Inga flöden kör kod från pull requests med hemligheter (`pull_request`, inte `pull_request_target`).
