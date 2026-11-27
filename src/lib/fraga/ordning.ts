// Vilken grupp som står först i paletten medan man skriver: en plats, en organisation eller Fråga
// AI. Den första raden är den som Enter väljer, så den ska vara det man troligast menar. Den som
// skriver "Stockholm" vill till Stockholm, inte fråga en modell om ordet. Den som skriver "vilka
// bygger röst-AI i Malmö?" ställer en fråga.
//
// Ordningen, där första regeln som passar vinner:
//   1. Exakt namnet på en organisation: organisationen.
//   2. Exakt namnet på en kommun eller ett län, med eller utan "kommun" och "län": platsen.
//   3. Det ser ut som en fråga: Fråga AI.
//   4. Början av en plats, minst tre tecken: platsen.
//   5. Början av ett ord i en organisations namn: organisationen.
//   6. Annars: Fråga AI, som förut.

import { normalisera } from '../sok.ts';
import { arInfrafraga } from './forfilter.ts';

export type Forst = 'plats' | 'org' | 'ai';

/** Ord som börjar en fråga eller en uppmaning, normaliserade. */
const FRAGEORD: ReadonlySet<string> = new Set([
  'vad', 'vem', 'vems', 'vilka', 'vilken', 'vilket', 'var', 'vart', 'varifran', 'hur', 'varfor', 'nar',
  'finns', 'kan', 'ska', 'bor', 'har', 'ar', 'vill', 'visa', 'hitta', 'ge', 'lista', 'jamfor', 'beratta', 'forklara',
  'what', 'who', 'which', 'where', 'how', 'why', 'when', 'is', 'are', 'can', 'does', 'do', 'show', 'find', 'list', 'compare',
]);

/** Så många ord gör en fråga även utan frågeord. Ett namn är sällan så långt, och ett exakt namn vinner ändå. */
const FRAGA_ORD = 5;
/** Så många tecken behövs innan början av ett ortnamn räknas. "St" är inte Stockholm än. */
const PLATS_MIN = 3;

function ren(s: string): string {
  return normalisera(s.trim()).replace(/\s+/g, ' ');
}

/** Ortens kärna: "Stockholms län" och "Stockholm kommun" blir "stockholm", "Skåne län" blir "skane". */
export function platskarna(namn: string): string {
  const n = ren(namn);
  if (n.endsWith(' lan')) {
    const stam = n.slice(0, -' lan'.length);
    // Genitivets s: "Stockholms län", "Dalarnas län". "Skåne län" och "Uppsala län" har inget.
    // Inget länsnamn slutar på ett s som hör till namnet självt.
    return stam.endsWith('s') ? stam.slice(0, -1) : stam;
  }
  return n.replace(/ kommun$/, '');
}

/** Sant när frågan är platsens namn, med eller utan "kommun" och "län". */
export function arPlatsnamn(q: string, namn: string): boolean {
  const k = platskarna(q);
  return k.length > 0 && k === platskarna(namn);
}

/**
 * Hur väl platsen svarar mot det man skrev: 2 när namnet är exakt det, 1 när kärnan är det, annars 0.
 * "Stockholm" är då kommunen före länet, och "Stockholms län" länet före kommunen.
 */
export function platsvikt(q: string, namn: string): number {
  if (ren(q) === ren(namn)) return 2;
  return arPlatsnamn(q, namn) ? 1 : 0;
}

/** Sant när texten ser ut som en fråga eller en uppmaning, inte ett namn. */
export function arFraga(q: string): boolean {
  const t = q.trim();
  if (!t) return false;
  if (t.endsWith('?')) return true;
  const ord = ren(t).split(' ');
  if (ord.length >= FRAGA_ORD) return true;
  return FRAGEORD.has(ord[0]) || arInfrafraga(t);
}

function ordBorjar(namn: string, q: string): boolean {
  const n = ren(namn);
  return n.startsWith(q) || n.split(/[\s\-–.&]+/).some((w) => w.startsWith(q));
}

/** Gruppen som står först, och vars första rad Enter väljer. */
export function forstaGrupp(q: string, orgnamn: readonly string[], platsnamn: readonly string[]): Forst {
  const nq = ren(q);
  if (!nq) return 'ai';
  if (orgnamn.some((n) => ren(n) === nq)) return 'org';
  if (platsnamn.some((n) => arPlatsnamn(q, n))) return 'plats';
  if (arFraga(q)) return 'ai';
  if (nq.length >= PLATS_MIN && platsnamn.some((n) => ren(n).startsWith(nq))) return 'plats';
  if (orgnamn.some((n) => ordBorjar(n, nq))) return 'org';
  return 'ai';
}
