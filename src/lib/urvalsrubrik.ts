// Rubriken över listan på /organisationer. Den följer filtret, så att en lista över ett län inte
// heter "Alla organisationer". Regeln står här, utan webbläsare, så att den går att pröva.

import { amnesrubrik } from './platsamne.ts';

export interface Urval {
  q: string;
  erbjuder: string[];
  typ: string[];
  omrade: string[];
  /** Vald kommun eller valt län, vid namn. */
  plats: string | null;
}

export interface Urvalsetiketter {
  omrade: (id: string) => string;
  /** Typen i plural: "Myndigheter". */
  typer: (id: string) => string;
}

export const RUBRIK_ALLA = 'Alla organisationer';

/**
 * Ett enda valt område eller en enda vald typ går att säga i en rubrik: "Datorseende i Lund",
 * "Myndigheter i Sverige". Fler val, en sökning eller något som erbjuds blir för långt att säga.
 * Då bär rubriken bara platsen, och filterknappen visar resten.
 */
export function urvalsrubrik(u: Urval, etikett: Urvalsetiketter): string {
  const valda = u.erbjuder.length + u.typ.length + u.omrade.length;
  if (!u.q && !valda && !u.plats) return RUBRIK_ALLA;
  const var_ = u.plats ?? 'Sverige';
  if (!u.q && valda === 1 && u.omrade.length) return `${amnesrubrik(u.omrade[0], etikett.omrade(u.omrade[0]))} i ${var_}`;
  if (!u.q && valda === 1 && u.typ.length) return `${etikett.typer(u.typ[0])} i ${var_}`;
  return u.plats ? `Organisationer i ${u.plats}` : 'Urval av organisationer';
}
