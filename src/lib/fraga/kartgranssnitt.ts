// Gränssnittet mellan kartan (KartApp.astro) och Fråga kartan (Fraga.astro). Kartan sätter det på
// window.aiKartan när sidan startar, före kartbiblioteket och datan, och säger till med händelser
// på document. Fråga kartan rör aldrig kartans tillstånd på annat sätt.

import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Filter } from '../filter.ts';
import type { Skalpost } from './skal.ts';

/** Organisationerna har kommit. `redo` på gränssnittet säger samma sak för den som lyssnar för sent. */
export const REDO = 'aikartan:redo';
/** Besökaren har gjort något på kartan. `detail` är handlingens typ, till exempel karta eller filter. */
export const HANDLING = 'aikartan:handling';
/** En organisation har öppnats i panelen, från en prick, listan eller sökningen. `detail` är id:t. */
export const ORG = 'aikartan:org';

/** Det som paletten och motorn läser om en organisation. Kartans egen post har fler fält. */
export type Kartrad = Skalpost & { ds: string; dv: string | null };

/** En kommun eller ett län i sökningen, med antalet organisationer där. */
export interface Platsrad {
  typ: 'kommun' | 'lan';
  kod: string;
  namn: string;
  /** Länet för en kommun, "Län" för ett län. */
  under: string;
  antal: number;
}

export interface Kartgranssnitt {
  /** Null tills kartbiblioteket har laddats, och om kartan inte gick att rita. */
  karta: MapLibreMap | null;
  redo: boolean;
  /** Alla organisationer, tomt tills datan har kommit. */
  poster(): readonly Kartrad[];
  /** Samma sökning som sidhuvudets sökruta, med bästa träffen först. */
  sok(q: string): { org: readonly Kartrad[]; platser: readonly Platsrad[] };
  oppnaOrg(id: string): void;
  /** Byter urvalet till filtret, stänger en öppen organisation och passar in kartan. */
  aterstall(f: Filter): void;
  /** Kartytans storlek har ändrats. Kartan ritas om, och ramas in när `ramaIn` är sant. */
  passa(ramaIn: boolean): void;
}

export function kartgranssnitt(): Kartgranssnitt | null {
  return (window as unknown as { aiKartan?: Kartgranssnitt }).aiKartan ?? null;
}
