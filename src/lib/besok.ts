// Besöksräkningen. Två regler som går att pröva utan webbläsare: vad som får följa med en
// sidvisning, och vem som inte ska räknas alls. Skriptet som använder dem ligger i
// src/components/Besoksrakning.astro, och vad som sparas står på /integritet.

/**
 * Adressen som räknas: utan frågedel och ankare. Söktext och filter ligger där och ska inte
 * följa med en sidvisning. Webbläsaren skickar också sidans adress i Referer-huvudet. Det
 * stoppas av Referrer-Policy: strict-origin i vercel.json, som ett test håller fast.
 */
export function raknadAdress(adress: string): string {
  return adress.split(/[?#]/)[0];
}

/** Sant om besökaren har slagit på Do Not Track eller Global Privacy Control. Då laddas ingen räkning. */
export function vagrarRakning(webblasare: { doNotTrack?: string | null; globalPrivacyControl?: boolean }): boolean {
  return webblasare.doNotTrack === '1' || webblasare.doNotTrack === 'yes' || webblasare.globalPrivacyControl === true;
}
