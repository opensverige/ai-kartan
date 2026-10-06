# Medlemmar per region

`regioner.json` säger hur många på OpenSveriges Discord som har valt varje region. Kartan visar det i en egen vy: tryck på kräftan på kartan, eller öppna `/?vy=medlemmar`.

## Var siffrorna kommer ifrån

Nya medlemmar på föreningens Discord svarar på frågan "Var bor du?" och får en regionroll: en stad med tio mil runt om, eller "Bygger remote / annan ort". Filen innehåller antalet konton per roll och ingenting annat.

- Inga namn, konton eller adresser. Bara antal. Kartan vet aldrig vem som har valt vad.
- Medlemsregistret och Discords medlemslista används inte.
- **Ett antal mellan 1 och 4 skrivs som `"<5"`, aldrig som siffra.** Repot är publikt, så det räcker inte att sajten döljer siffran. Bygget och testerna stannar om en sådan siffra står i filen.
- Summan på kortet räknar bara regionerna, inte "annan ort". Finns ett `"<5"` med står summan som "drygt", utan att det dolda antalet räknas in.

## Uppdatera

1. Öppna serverinställningarna på Discord och gå till Roller. Antalet står bredvid varje roll.
2. Skriv in antalen i `regioner.json`: `0`, `"<5"` eller siffran om den är fem eller mer. Sätt `uppdaterad` till dagens datum.
3. Kör `npm test`.

En ny region behöver `namn`, `kommun` (kommunkoden för staden, ur `data/geo/kommuner.json`) och `antal`.
