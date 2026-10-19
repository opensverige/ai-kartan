// Reserven: svarar inte den första leverantören tar en annan frågan. Det gäller när krediten är
// slut, nyckeln fel, modellen borta, leverantören upptagen eller nere, och när vakten har pausat
// den. Det gäller inte vid tidsgräns eller ogiltigt svar, för då finns ingen tid kvar. Av samma
// skäl går frågan bara vidare om felet kom inom RESERV_SENAST_MS. Reservens egen tidsgräns är
// resten av den tid modellen får, så att hela frågan ryms i TIDSGRANS_MS.

import { arModellfel } from './inferens.ts';
import type { Tolkare } from './motor.ts';
import type { Modellfelsort } from './typer.ts';

export const RESERV_SENAST_MS = 2000;

const VIDARE: readonly Modellfelsort[] = ['slut', 'nyckel', 'modell', 'begransad', 'nere'];

export function medReserv(forsta: Tolkare, reserv: Tolkare, nu: () => number = Date.now): Tolkare {
  return async (fraga, tidigare) => {
    const start = nu();
    try {
      return await forsta(fraga, tidigare);
    } catch (e) {
      const vidare = arModellfel(e) && VIDARE.includes(e.modellfel) && nu() - start <= RESERV_SENAST_MS;
      if (!vidare) throw e;
      return reserv(fraga, tidigare);
    }
  };
}
