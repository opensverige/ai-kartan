// Modellens mening visas bara om den börjar som prompten säger och inte rankar, länkar, ger ett
// nummer eller nämner en organisation. Annars byggs meningen ur filtret, så att kartan inte verkar
// rekommendera någon.

import type { Filter } from '../filter.ts';
import { finnsI, normalisera } from '../sok.ts';
import type { Etiketter } from '../sokindex.ts';
import { MARKNADSORD } from '../../../scripts/lib/marknadsord.mjs';
import { forfilter } from './forfilter.ts';
import type { Plats } from './platser.ts';

const MAX_RAD = 200;
/** Samma början som prompten kräver i inferens.ts. */
const BORJAN = 'Jag tolkar det som att du söker';
/** Sex siffror eller fler i följd, med mellanslag eller bindestreck: ett telefonnummer, inte ett årtal. */
const NUMMER = /(\d[\s-]?){6,}/;

export function godkandRad(rad: string, orgnamn: readonly string[]): boolean {
  if (!rad.startsWith(BORJAN)) return false;
  if (MARKNADSORD.test(rad)) return false;
  if (forfilter(rad) === 'ranking') return false;
  if (NUMMER.test(rad) || rad.includes('@')) return false;
  if (rad.length > MAX_RAD) return false;
  const lag = rad.toLowerCase();
  if (lag.includes('http') || lag.includes('www.')) return false;
  const text = normalisera(rad);
  for (const namn of orgnamn) {
    const nyckel = normalisera(namn);
    if (nyckel.length < 3) continue;
    if (finnsI(text, nyckel)) return false;
  }
  return true;
}

function gemener(ids: readonly string[], tabell: Record<string, string>, bind: string): string {
  return ids.map((id) => (tabell[id] ?? id).toLowerCase()).join(bind);
}

export function mallrad(f: Filter, e: Etiketter, plats: Plats | null): string {
  const vem = f.typ.length ? gemener(f.typ, e.typerPlural, ' och ') : 'organisationer';
  let delar = '';
  if (f.omrade.length) delar += ` inom ${gemener(f.omrade, e.omraden, ' och ')}`;
  if (f.erbjuder.length) delar += ` som erbjuder ${gemener(f.erbjuder, e.erbjuder, ' eller ')}`;
  if (plats) delar += ` i ${plats.namn}`;
  if (f.q) delar += `${f.erbjuder.length ? ' och' : ' som'} nämner ”${f.q}”`;
  return `Jag tolkar det som att du söker ${vem}${delar}.`;
}
