// Palettens läge utan DOM: vad den ska visa för texten i fältet, och om ett svar som kommer
// fortfarande gäller. Varje byte av innehållet räknar upp ett nummer, och ett svar ritas bara när
// dess fråga har det senaste numret. Det enda som inte byter innehållet är att paletten öppnas
// igen medan svaret på samma fråga väntar. Det senaste svaret sparas, så att samma fråga visar
// det igen utan nytt anrop. Fraga.astro ritar, och här går kapplöpningarna att pröva.

import { MAX_TECKEN } from './typer.ts';

export type Tillstand = 'tom' | 'forslag' | 'vantar' | 'svar';

/** Det som ska stå i paletten för texten i fältet. `kvar`: innehållet står kvar, svaret väntar. */
export type Visning<S> = { sort: 'kvar' } | { sort: 'tom' } | { sort: 'forslag'; q: string } | { sort: 'svar'; sparat: S };

/** En fråga som väntar på svar. Numret avgör om svaret fortfarande gäller när det kommer. */
export interface Stalld {
  q: string;
  nummer: number;
}

/** Det en fråga leder till: inget, det sparade svaret, eller ett anrop som paletten väntar på. */
export type Fragestart<S> = { sort: 'ingen' } | { sort: 'svar'; sparat: S } | { sort: 'vantar'; stalld: Stalld };

export interface Palettlage<S> {
  tillstand(): Tillstand;
  /** Det senast sparade svaret, eller null. */
  senaste(): S | null;
  /** Fältets text ändrades, eller paletten öppnades. */
  visa(text: string): Visning<S>;
  /** Besökaren frågar. En tom eller för lång fråga ändrar ingenting. */
  fraga(text: string): Fragestart<S>;
  /** Sant när svaret på frågan fortfarande ska ritas. */
  aktuell(f: Stalld): boolean;
  /** Svaret kom och ritas. Sparas bara när frågan fortfarande gäller, och säger då sant. */
  svarat(f: Stalld, sparat: S): boolean;
  /** Frågan gick inte att besvara. Sant när raden om det ska ritas. */
  misslyckad(f: Stalld): boolean;
  /** Glömmer det sparade svaret, när sidan går tillbaka till första skärmen. */
  glom(): void;
}

export function skapaPalettlage<S>(): Palettlage<S> {
  let tillstand: Tillstand = 'tom';
  let senaste: { q: string; sparat: S } | null = null;
  // Räknas upp när det som står i paletten byts. Ett svar som kommer för en äldre text ritas inte.
  let nummer = 0;
  /** Frågan som väntar på svar, så att paletten kan öppnas igen utan att svaret slängs. */
  let vantande = '';

  return {
    tillstand: () => tillstand,
    senaste: () => senaste?.sparat ?? null,

    visa(text: string): Visning<S> {
      const q = text.trim();
      // Paletten öppnades igen medan svaret på samma fråga väntar. Det får komma.
      if (tillstand === 'vantar' && q === vantande) return { sort: 'kvar' };
      // Allt annat byter innehållet, och ett svar som väntar på en annan text ritas inte.
      nummer += 1;
      if (senaste && q === senaste.q) {
        tillstand = 'svar';
        return { sort: 'svar', sparat: senaste.sparat };
      }
      if (!q) {
        tillstand = 'tom';
        return { sort: 'tom' };
      }
      tillstand = 'forslag';
      return { sort: 'forslag', q };
    },

    fraga(text: string): Fragestart<S> {
      const q = text.trim();
      if (!q || q.length > MAX_TECKEN) return { sort: 'ingen' };
      nummer += 1;
      if (senaste && senaste.q === q) {
        tillstand = 'svar';
        return { sort: 'svar', sparat: senaste.sparat };
      }
      tillstand = 'vantar';
      vantande = q;
      return { sort: 'vantar', stalld: { q, nummer } };
    },

    aktuell: (f: Stalld): boolean => f.nummer === nummer,

    svarat(f: Stalld, sparat: S): boolean {
      if (f.nummer !== nummer) return false;
      senaste = { q: f.q, sparat };
      tillstand = 'svar';
      return true;
    },

    misslyckad(f: Stalld): boolean {
      if (f.nummer !== nummer) return false;
      tillstand = 'svar';
      return true;
    },

    glom(): void {
      senaste = null;
    },
  };
}
