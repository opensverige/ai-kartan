// Varför en organisation visas på ett kort. Skälen byggs ur fälten som träffade,
// i en fast ordning, så att en språkmodell inte formulerar dem.

import type { Filter, Filterpost } from '../filter.ts';
import { finnsI, normalisera, ORDSTART, type Tolkning } from '../sok.ts';
import type { Etiketter } from '../sokindex.ts';

export type Skalpost = Filterpost & { d: string | null; kn: string | null; ln: string | null };


const ORDTECKEN = /^[\p{L}\p{N}-]$/u;
const CITAT = '\u201D';

type Etikettfalt = 't' | 'o' | 'a';
type Alternativ = string | readonly [Etikettfalt, string];

function lagg(ut: string[], skal: string | null): void {
  if (!skal || ut.includes(skal)) return;
  ut.push(skal);
}

function etikettSkal(falt: Etikettfalt, id: string, e: Etiketter): string | null {
  if (falt === 't') return e.typer[id] || null;
  if (falt === 'o') {
    const etikett = e.erbjuder[id];
    return etikett ? `erbjuder ${etikett.toLowerCase()}` : null;
  }
  const etikett = e.omraden[id];
  return etikett ? `område ${etikett}` : null;
}

function traffarAlt(post: Skalpost, alt: Alternativ): boolean {
  if (typeof alt === 'string') return alt.split(' ').every((ord) => finnsI(post.ns, ord));
  const [falt, id] = alt;
  if (falt === 't') return post.t === id;
  return post[falt].includes(id);
}

/** Index för samma träff som finnsI, med samma ORDSTART. -1 när ordet saknas. */
function traffIndex(text: string, ord: string): number {
  if (!ord || !finnsI(text, ord)) return -1;
  if (ord.length > 3 && !ORDSTART.has(ord)) return text.indexOf(ord);
  const monster = ord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const traff = new RegExp(`(^|[^a-z0-9])${monster}`).exec(text);
  return traff ? traff.index + traff[1].length : -1;
}

/** Hela ordet runt indexet. Ett ord är bokstäver, siffror och bindestreck. */
function helaOrdet(text: string, index: number): string {
  let start = index;
  let slut = index;
  while (start > 0 && ORDTECKEN.test(text.charAt(start - 1))) start -= 1;
  while (slut < text.length && ORDTECKEN.test(text.charAt(slut))) slut += 1;
  return text.slice(start, slut);
}

/**
 * Ordet som det står i originalet. Normaliseringen behåller längden för svenska
 * tecken, så indexet i den normaliserade texten pekar på samma tecken.
 */
function ordI(original: string, ord: string): string | null {
  const norm = normalisera(original);
  if (norm.length !== original.length) return null;
  const index = traffIndex(norm, ord);
  if (index < 0) return null;
  return helaOrdet(original, index) || null;
}

function citat(ord: string): string {
  return `${CITAT}${ord}${CITAT}`;
}

function ordSkal(post: Skalpost, alt: string): string {
  const ord = alt.split(' ')[0] ?? '';
  const iNamn = ordI(post.n, ord);
  if (iNamn) return `${citat(iNamn)} i namnet`;
  const iBeskrivning = ordI(post.d ?? '', ord);
  if (iBeskrivning) return `${citat(iBeskrivning)} i beskrivningen`;
  return citat(ord);
}

export function matchskal(o: Skalpost, f: Filter, t: Tolkning, e: Etiketter): string[] {
  const ut: string[] = [];
  if (f.typ.length && f.typ.includes(o.t)) lagg(ut, etikettSkal('t', o.t, e));
  for (const id of f.erbjuder) if (o.o.includes(id)) lagg(ut, etikettSkal('o', id, e));
  for (const id of f.omrade) if (o.a.includes(id)) lagg(ut, etikettSkal('a', id, e));
  if (f.kommun && o.k === f.kommun) lagg(ut, o.kn);
  else if (f.lan && o.l === f.lan) lagg(ut, o.ln);
  if (f.q) {
    for (const grupp of t.grupper) {
      for (const alt of grupp) {
        if (!traffarAlt(o, alt)) continue;
        lagg(ut, typeof alt === 'string' ? ordSkal(o, alt) : etikettSkal(alt[0], alt[1], e));
        break;
      }
    }
  }
  return ut;
}
