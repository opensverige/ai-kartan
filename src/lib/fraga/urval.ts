// Vilka organisationer ett svar visar. Får alla plats visas de i namnordning.
// Annars väljs fem med ett frö som är samma hela dagen, och de visas sedan i namnordning.
// Kartan rankar aldrig, så blandningen får inte gynna namn som börjar på A.

import { filterTillSok, type Filter } from '../filter.ts';
import { URVAL } from './typer.ts';

/** Samma frö hela dagen för samma filter. Nästa dag blir urvalet ett annat. */
export function urvalsfro(datum: string, f: Filter): string {
  return `${datum}|${filterTillSok(f)}`;
}

/**
 * 32-bitars FNV-1a. Närliggande strängar, som id som bara skiljer sig i sista
 * siffran, ger närliggande hashvärden. fmix32 sprider dem innan vi sorterar.
 */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Murmur3:s slutblandning. Aritmetiskt skift skulle dra in teckenbiten och klumpa ihop värdena. */
function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function blanda(s: string): number {
  return fmix32(fnv1a(s));
}

export function valjUt(ids: readonly string[], namn: (id: string) => string, fro: string): { visade: string[]; regel: 'alla' | 'dagligt' } {
  const paNamn = (a: string, b: string): number => namn(a).localeCompare(namn(b), 'sv');
  if (ids.length <= URVAL) return { visade: [...ids].sort(paNamn), regel: 'alla' };
  const visade = ids
    .map((id) => ({ id, nyckel: blanda(`${fro}|${id}`) }))
    .sort((a, b) => a.nyckel - b.nyckel || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, URVAL)
    .map((rad) => rad.id)
    .sort(paNamn);
  return { visade, regel: 'dagligt' };
}
