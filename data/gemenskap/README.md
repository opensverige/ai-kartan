# Medlemmar per region

`regioner.json` säger hur många av OpenSveriges medlemmar som finns i varje region. Kartan visar det i en egen vy: tryck på kräftan på kartan, eller öppna `/?vy=medlemmar`.

## Var siffrorna kommer ifrån

Nya medlemmar på föreningens Discord svarar på frågan "Var bor du?" och får en regionroll: en stad med tio mil runt om, eller "Bygger remote / annan ort". Filen innehåller antalet medlemmar per roll och ingenting annat.

- Inga namn, konton eller adresser. Bara antal.
- Medlemsregistret och Discords medlemslista används inte.
- Ett antal under fem skrivs aldrig ut på sajten. Det står som "färre än 5", och summan avrundas då så att antalet inte går att räkna fram. Regeln ligger i `src/lib/medlemmar.ts`.

## Uppdatera

1. Öppna serverinställningarna på Discord och gå till Roller. Antalet står bredvid varje roll.
2. Skriv in antalen i `regioner.json` och sätt `uppdaterad` till dagens datum.
3. Kör `npm test`.

En ny region behöver `namn`, `kommun` (kommunkoden för staden, ur `data/geo/kommuner.json`) och `antal`.
