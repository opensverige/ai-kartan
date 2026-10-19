// Webbläsarens väg till /api/fraga. Svarar servern används svaret. Nås den inte, eller är takten
// nådd, räknar webbläsaren fram svaret själv med samma motor utan modell. Bara den senaste frågan
// räknas: en ny fråga avbryter den som väntar, och den avbrutna ger null.

import type { Kropp } from './handler.ts';
import type { Svar } from './typer.ts';
import type { Klientlage } from './vy.ts';

export interface Klientsvar {
  svar: Svar;
  lage: Klientlage;
}

export interface Klient {
  /** Svaret, null om frågan ersattes av en nyare, eller ett kast om inte heller reservvägen går. */
  fraga(k: Kropp): Promise<Klientsvar | null>;
}

/** Längre än serverns egen tidsgräns för modellen, så att servern hinner gå sin reservväg först. */
const TIDSGRANS_MS = 12000;

export function skapaKlient(d: {
  lokalt: (k: Kropp) => Promise<Svar>;
  fetchFn?: typeof fetch;
  adress?: string;
  tidsgrans?: number;
}): Klient {
  const hamta = d.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const adress = d.adress ?? '/api/fraga';
  const tidsgrans = d.tidsgrans ?? TIDSGRANS_MS;
  let pagaende: AbortController | null = null;

  return {
    async fraga(k: Kropp): Promise<Klientsvar | null> {
      pagaende?.abort();
      const kontroll = new AbortController();
      pagaende = kontroll;
      let tidenGick = false;
      const timer = setTimeout(() => {
        tidenGick = true;
        kontroll.abort();
      }, tidsgrans);
      let lage: Klientlage = 'lokal';
      try {
        const svar = await hamta(adress, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(k),
          signal: kontroll.signal,
        });
        if (svar.ok) return { svar: (await svar.json()) as Svar, lage: 'server' };
        if (svar.status === 429) lage = 'takt';
      } catch {
        // En ny fråga avbröt den här. Annars nås servern inte, och reservvägen tar över nedan.
        if (kontroll.signal.aborted && !tidenGick) return null;
      } finally {
        clearTimeout(timer);
      }
      if (pagaende !== kontroll) return null;
      return { svar: await d.lokalt(k), lage };
    },
  };
}
