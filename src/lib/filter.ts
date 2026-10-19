// Kartans filter: vilka organisationer ett urval släpper igenom, och hur urvalet skrivs i adressen.
// Samma regler gäller i kartan, i listan och i svaren från Fråga kartan, så att ett antal i ett
// svar alltid är samma antal som kartan visar för samma adress. Inget här får bero på Astro eller
// webbläsaren: serverfunktionen i api/ använder modulen också.

import { traffar, type Sokpost, type Tolkning } from './sok.ts';

export interface Filter {
  q: string;
  erbjuder: string[];
  typ: string[];
  omrade: string[];
  lan: string;
  kommun: string;
}

/** Facetterna som går att välja i filterraden. Kommunen hör till länet. */
export type FacettNamn = 'erbjuder' | 'typ' | 'omrade' | 'lan';

/** Det filtret behöver veta om en organisation. Samma nycklar som kartposten. */
export interface Filterpost extends Sokpost {
  id: string;
  n: string;
  k: string | null;
  l: string | null;
}

export const TOMT_FILTER: Filter = Object.freeze({ q: '', erbjuder: [], typ: [], omrade: [], lan: '', kommun: '' }) as Filter;

/**
 * Sant om posten klarar filtret. Inom en facett räcker ett av valen, mellan facetterna måste alla
 * stämma. `utom` hoppar över en facett, för att räkna antal per val.
 */
export function passarFilter(o: Filterpost, f: Filter, tolkning: Tolkning, utom?: FacettNamn): boolean {
  if (!traffar(o, tolkning)) return false;
  if (utom !== 'erbjuder' && f.erbjuder.length && !f.erbjuder.some((x) => o.o.includes(x))) return false;
  if (utom !== 'typ' && f.typ.length && !f.typ.includes(o.t)) return false;
  if (utom !== 'omrade' && f.omrade.length && !f.omrade.some((x) => o.a.includes(x))) return false;
  if (utom !== 'lan') {
    if (f.lan && o.l !== f.lan) return false;
    if (f.kommun && o.k !== f.kommun) return false;
  }
  return true;
}

/** Filtrets del av kartans adress, utan frågetecken. Ordningen är den kartan alltid skriver. */
export function filterTillSok(f: Filter): string {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.erbjuder.length) p.set('erbjuder', f.erbjuder.join(','));
  if (f.typ.length) p.set('typ', f.typ.join(','));
  if (f.omrade.length) p.set('omrade', f.omrade.join(','));
  if (f.lan) p.set('lan', f.lan);
  if (f.kommun) p.set('kommun', f.kommun);
  return p.toString();
}

/** Sant när inget är valt och inget är sökt. */
export function arTomt(f: Filter): boolean {
  return !f.q && !f.erbjuder.length && !f.typ.length && !f.omrade.length && !f.lan && !f.kommun;
}
