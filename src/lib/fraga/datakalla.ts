// Var serverfunktionen läser kartans data. Den läser från samma deployment som frågan kom till,
// så att en förhandsversion svarar med sin egen data. Förhandsversionerna kräver inloggning, och
// då följer besökarens egen inloggningskaka med, men bara den kakan och bara till den adressen.

/** Sajtens egna domäner. Andra adresser än dessa och deploymentens egna får aldrig fråga. */
export const EGNA_DOMANER: readonly string[] = [
  'https://karta.opensverige.se',
  'https://kartan.opensverige.se',
  'https://techembassy.se',
  'https://www.techembassy.se',
];

export const PRODUKTION = 'https://karta.opensverige.se';

/** De egna domänerna plus deploymentens och grenens adresser, som Vercel sätter i miljön. */
export function tillatnaUrsprung(miljo: { VERCEL_URL?: string; VERCEL_BRANCH_URL?: string }): string[] {
  const egna = [miljo.VERCEL_URL, miljo.VERCEL_BRANCH_URL].filter((v): v is string => Boolean(v)).map((v) => `https://${v}`);
  return [...EGNA_DOMANER, ...egna];
}

/** Adressen att läsa datan från: frågans egen, om den är tillåten, annars produktionen. */
export function datakalla(anropsadress: string, tillatna: readonly string[], standard: string): string {
  try {
    const egen = new URL(anropsadress).origin;
    return tillatna.includes(egen) ? egen : standard;
  } catch {
    return standard;
  }
}

/** Vercels inloggningskaka ur besökarens kakor, eller null. Inga andra kakor följer med. */
export function skyddskaka(kakor: string | null): string | null {
  if (!kakor) return null;
  const kaka = kakor
    .split(';')
    .map((del) => del.trim())
    .find((del) => del.startsWith('_vercel_jwt='));
  return kaka ?? null;
}
