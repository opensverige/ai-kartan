// Dagstaket: högst så många frågor går till modellen per dygn, räknat i svensk tid. Därefter
// kastar det felet tak, och motorn svarar utan modell med raden att AI-tolkningen är pausad.
// Räknaren finns i serverinstansens minne, så med flera instanser kan taket i värsta fall nås
// en gång per instans. Den förbetalda krediten hos leverantören är det hårda taket.

import { modellfel } from './inferens.ts';
import type { Tolkare } from './motor.ts';

export const STANDARDTAK = 500;

/** Taket ur en miljövariabel. Saknas den eller är den trasig gäller standardtaket. */
export function lasTak(varde: string | undefined): number {
  const tal = Number(varde);
  return varde?.trim() && Number.isInteger(tal) && tal >= 0 ? tal : STANDARDTAK;
}

export interface Dagstak {
  omsluta(t: Tolkare): Tolkare;
}

/** `idag` ger dagens datum, till exempel "2026-10-19". Ett nytt datum nollställer räknaren. */
export function skapaDagstak(tak: number, idag: () => string): Dagstak {
  let dag = '';
  let antal = 0;
  return {
    omsluta(t: Tolkare): Tolkare {
      return async (fraga, tidigare) => {
        const nu = idag();
        if (nu !== dag) {
          dag = nu;
          antal = 0;
        }
        if (antal >= tak) throw modellfel('tak');
        // Frågan räknas innan den skickas. Också ett anrop som misslyckas kan kosta.
        antal += 1;
        return t(fraga, tidigare);
      };
    },
  };
}
