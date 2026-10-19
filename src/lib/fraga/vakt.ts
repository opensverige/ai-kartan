// Vakten slutar fråga modellen en stund när den inte kan svara, så att varje fråga inte väntar
// ut samma fel och inga anrop görs i onödan. Är krediterna slut eller nyckeln fel pausar den i
// 15 minuter. Är modellen upptagen, eller nere tre gånger i rad, pausar den i en minut. Under en
// paus kastar den samma fel direkt, och motorn tar reservvägen. Läget finns i serverns minne.

import { arModellfel, modellfel } from './inferens.ts';
import type { Tolkare } from './motor.ts';
import type { Modellfelsort } from './typer.ts';

export const PAUS_SLUT_MS = 15 * 60 * 1000;
export const PAUS_KORT_MS = 60 * 1000;
const FEL_I_RAD = 3;

export interface Vakt {
  /** Samma vakt för alla tolkare, så att en ny tolkare ärver en pågående paus. */
  omsluta(t: Tolkare): Tolkare;
}

export function skapaVakt(nu: () => number = Date.now): Vakt {
  let pausTill = 0;
  let pausSort: Modellfelsort = 'nere';
  let iRad = 0;

  function pausa(sort: Modellfelsort, ms: number): void {
    pausTill = nu() + ms;
    pausSort = sort;
    iRad = 0;
  }

  return {
    omsluta(t: Tolkare): Tolkare {
      return async (fraga, tidigare) => {
        if (nu() < pausTill) throw modellfel(pausSort);
        try {
          const svar = await t(fraga, tidigare);
          iRad = 0;
          return svar;
        } catch (e) {
          const sort: Modellfelsort = arModellfel(e) ? e.modellfel : 'nere';
          if (sort === 'slut' || sort === 'nyckel') pausa(sort, PAUS_SLUT_MS);
          else if (sort === 'begransad') pausa(sort, PAUS_KORT_MS);
          else if (++iRad >= FEL_I_RAD) pausa(sort, PAUS_KORT_MS);
          throw arModellfel(e) ? e : modellfel(sort);
        }
      };
    },
  };
}
