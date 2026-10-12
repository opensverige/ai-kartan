// Texten i bottenbladets nedfällda läge i telefon: en rubrik och en rad under den. Det är det
// första en besökare i telefon läser, och det enda som står på skärmen innan kartan har laddat.
// Raden svarar också på varje tryck: ett valt län eller en vald fråga säger sitt antal och vilka
// som finns där. Regeln står här, utan webbläsare, så att den går att pröva.

export interface Tittlage {
  /** Bladet är uppfällt. Då är handtaget bara vägen tillbaka till kartan. */
  oppet: boolean;
  /** Vald organisation, när detaljvyn ligger i det nedfällda bladet. */
  vald: { namn: string; under: string } | null;
  /** Urvalets rubrik, till exempel "Datorseende i Göteborg". Null när hela kartan visas. */
  urval: string | null;
  antal: number;
  totalt: number;
  kommuner: number;
  /** Nya organisationer de senaste sju dagarna. Noll sägs inte. */
  nya: number;
  /** Urvalets första namn, i listans ordning. */
  namn: string[];
}

export interface Tittext {
  rubrik: string;
  not: string;
}

export const RUBRIK_KARTAN = 'Alla som bygger AI i Sverige';

/** Så många namn räknas upp innan resten blir ett antal. */
const ANTAL_NAMN = 3;

const plural = (n: number): string => (n === 1 ? 'organisation' : 'organisationer');

/** "A, B och C", eller "A, B, C och 10 till" när urvalet är större än det som räknas upp. */
export function uppraknade(namn: string[], antal: number): string {
  const visade = namn.slice(0, ANTAL_NAMN);
  const resten = antal - visade.length;
  if (resten > 0) return `${visade.join(', ')} och ${resten} till`;
  if (visade.length < 2) return visade.join('');
  return `${visade.slice(0, -1).join(', ')} och ${visade.at(-1)}`;
}

export function tittext(l: Tittlage): Tittext {
  if (l.oppet) return { rubrik: 'Visa kartan', not: '' };
  if (l.vald) return { rubrik: l.vald.namn, not: l.vald.under };
  if (l.urval === null) {
    const nya = l.nya > 0 ? ` · ${l.nya} ${l.nya === 1 ? 'ny' : 'nya'} i veckan` : '';
    return { rubrik: RUBRIK_KARTAN, not: `${l.totalt} ${plural(l.totalt)} i ${l.kommuner} kommuner${nya}. Källa och datum på varje uppgift.` };
  }
  if (l.antal === 0) return { rubrik: l.urval, not: 'Inga organisationer matchar. Ta bort ett filter eller sök bredare.' };
  // Ordet böjs efter talet närmast: "1 av 328 organisationer".
  return { rubrik: l.urval, not: `${l.antal} av ${l.totalt} ${plural(l.totalt)}: ${uppraknade(l.namn, l.antal)}.` };
}
