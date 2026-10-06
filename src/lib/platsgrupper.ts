// Kartans tre nivåer. Positionerna ligger på kommunnivå, så kartan räknar ihop
// organisationerna per plats i stället för per pixelavstånd: län när hela landet syns,
// kommuner på vägen in, och organisationerna själva närmast.

export type Niva = 'lan' | 'kommun' | 'poster';

/** Från den här zoomen visas kommuner i stället för län. */
export const ZOOM_KOMMUN = 6;
/** Från den här zoomen visas organisationerna själva. */
export const ZOOM_POSTER = 12;

export interface Platspost {
  id: string;
  k: string | null;
  kn: string | null;
  l: string | null;
  ln: string | null;
  lat: number | null;
  lng: number | null;
}

export interface Platsgrupp {
  kod: string;
  namn: string;
  antal: number;
  lng: number;
  lat: number;
}

export interface Plats {
  lan: string;
  kommun: string;
}

type Platsniva = 'lan' | 'kommun';

const kod = (o: Platspost, niva: Platsniva): string | null => (niva === 'lan' ? o.l : o.k);
const namn = (o: Platspost, niva: Platsniva): string | null => (niva === 'lan' ? o.ln : o.kn);
const harPlats = (o: Platspost): o is Platspost & { lat: number; lng: number } => o.lat !== null && o.lng !== null;

export function nivaForZoom(zoom: number): Niva {
  if (zoom < ZOOM_KOMMUN) return 'lan';
  return zoom < ZOOM_POSTER ? 'kommun' : 'poster';
}

/**
 * Mittpunkt per plats som [lng, lat]. Räknas på alla organisationer, inte på urvalet,
 * så att en grupp ligger still när ett filter ändrar antalet.
 */
export function platsmitt(alla: Platspost[], niva: Platsniva): Map<string, [number, number]> {
  const summor = new Map<string, { lng: number; lat: number; antal: number }>();
  for (const o of alla) {
    const k = kod(o, niva);
    if (!k || !harPlats(o)) continue;
    const s = summor.get(k) ?? { lng: 0, lat: 0, antal: 0 };
    s.lng += o.lng;
    s.lat += o.lat;
    s.antal += 1;
    summor.set(k, s);
  }
  return new Map([...summor].map(([k, s]) => [k, [s.lng / s.antal, s.lat / s.antal]]));
}

/**
 * Delar urvalet per plats. En plats med minst två organisationer blir en grupp med antal.
 * En organisation som är ensam på sin plats ritas som sig själv och hamnar i `ensamma`:
 * en bubbla med siffran 1 säger mindre än organisationen den döljer.
 */
export function grupperaPerPlats(
  urval: Platspost[],
  niva: Platsniva,
  mitt: Map<string, [number, number]>,
): { grupper: Platsgrupp[]; ensamma: Set<string> } {
  const perPlats = new Map<string, Platspost[]>();
  for (const o of urval) {
    const k = kod(o, niva);
    if (!k || !harPlats(o)) continue;
    perPlats.set(k, [...(perPlats.get(k) ?? []), o]);
  }
  const grupper: Platsgrupp[] = [];
  const ensamma = new Set<string>();
  for (const [k, poster] of perPlats) {
    const punkt = mitt.get(k);
    if (poster.length === 1 || !punkt) {
      for (const o of poster) ensamma.add(o.id);
      continue;
    }
    grupper.push({ kod: k, namn: namn(poster[0], niva) ?? k, antal: poster.length, lng: punkt[0], lat: punkt[1] });
  }
  // Störst först: den ritas underst, och dess namn får plats före de mindre.
  grupper.sort((a, b) => b.antal - a.antal || a.namn.localeCompare(b.namn, 'sv'));
  return { grupper, ensamma };
}

/**
 * Lägsta och högsta zoom när kartan passas in på ett urval. Ligger allt i en kommun
 * zoomas det in tills organisationerna syns, annars stannar kartan på kommunnivån.
 */
export function zoomgranser(urval: Platspost[]): [number, number] {
  const kommuner = new Set(urval.filter(harPlats).map((o) => o.k));
  if (kommuner.size <= 1) return [ZOOM_POSTER + 0.2, ZOOM_POSTER + 1.5];
  return [ZOOM_KOMMUN + 0.2, ZOOM_POSTER - 0.5];
}

/**
 * Platsen efter att besökaren själv har zoomat ut. Den som backar ur en nivå lämnar
 * platsen den hörde till, med marginal så att en liten rörelse inte ändrar något.
 */
export function platsEfterUtzoomning(zoom: number, plats: Plats): Plats {
  if (plats.lan && zoom < ZOOM_KOMMUN - 0.5) return { lan: '', kommun: '' };
  if (plats.kommun && zoom < ZOOM_POSTER - 2) return { lan: plats.lan, kommun: '' };
  return plats;
}
