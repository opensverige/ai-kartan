// Sökindexet: texten en organisation går att hitta på, normaliserad en gång när datan har laddats.
// Kartan och Fråga kartan bygger det på samma sätt, så att samma sökning ger samma träffar.

import { normalisera } from './sok.ts';

/** Taxonomins etiketter, nyckel till svensk text. */
export interface Etiketter {
  typer: Record<string, string>;
  typerPlural: Record<string, string>;
  erbjuder: Record<string, string>;
  omraden: Record<string, string>;
  lan: Record<string, string>;
}

interface Indexerbar {
  id: string;
  n: string;
  d: string | null;
  kn: string | null;
  ln: string | null;
  t: string;
  o: string[];
  a: string[];
}

/** Posten med normaliserat namn (`nn`) och all sökbar text (`ns`). */
export function tillSokpost<T extends Indexerbar>(o: T, e: Etiketter): T & { nn: string; ns: string } {
  return {
    ...o,
    nn: normalisera(o.n),
    // Id:t är ofta förkortningen folk söker på: scb, foi, smhi.
    ns: normalisera(
      [o.n, o.id.replace(/-/g, ' '), o.d ?? '', o.kn ?? '', o.ln ?? '', e.typer[o.t] ?? '', ...o.o.map((x) => e.erbjuder[x] ?? ''), ...o.a.map((x) => e.omraden[x] ?? '')].join(' '),
    ),
  };
}
