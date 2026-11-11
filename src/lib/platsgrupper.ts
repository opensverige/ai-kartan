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
  /** Platser utöver sätet, var och en med en egen ruta i sin kommun. */
  p?: readonly { k: string; kn: string; l: string; ln: string | null; lat: number; lng: number }[];
}

/** En nål på kartan: sätet eller en plats utöver det. `nyckel` är id för sätet och id@kommunkod för en plats. */
export interface Nal {
  nyckel: string;
  id: string;
  k: string | null;
  kn: string | null;
  l: string | null;
  ln: string | null;
  lat: number | null;
  lng: number | null;
  plats: boolean;
}

/** Nyckeln för en plats utöver sätet. Samma form som i scripts/lib/landplatser.mjs. */
export const platsnyckel = (id: string, kod: string): string => `${id}@${kod}`;

/** Organisationens nålar: sätet först, sedan en per plats. */
export function nalar(o: Platspost): Nal[] {
  return [
    { nyckel: o.id, id: o.id, k: o.k, kn: o.kn, l: o.l, ln: o.ln, lat: o.lat, lng: o.lng, plats: false },
    ...(o.p ?? []).map((p) => ({ nyckel: platsnyckel(o.id, p.k), id: o.id, k: p.k, kn: p.kn, l: p.l, ln: p.ln, lat: p.lat, lng: p.lng, plats: true })),
  ];
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

const kod = (o: Nal, niva: Platsniva): string | null => (niva === 'lan' ? o.l : o.k);
const namn = (o: Nal, niva: Platsniva): string | null => (niva === 'lan' ? o.ln : o.kn);
const harPlats = <T extends { lat: number | null; lng: number | null }>(o: T): o is T & { lat: number; lng: number } => o.lat !== null && o.lng !== null;

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
  for (const o of alla.flatMap(nalar)) {
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
 * Gruppen räknar organisationer, inte nålar: ett bolag med två kontor i länet räknas en gång.
 * En organisation som är ensam på sin plats ritas som sig själv, och dess nålar där hamnar i
 * `ensamma` med sina nycklar: en bubbla med siffran 1 säger mindre än organisationen den döljer.
 */
export function grupperaPerPlats(
  urval: Platspost[],
  niva: Platsniva,
  mitt: Map<string, [number, number]>,
): { grupper: Platsgrupp[]; ensamma: Set<string> } {
  const perPlats = new Map<string, Nal[]>();
  for (const o of urval.flatMap(nalar)) {
    const k = kod(o, niva);
    if (!k || !harPlats(o)) continue;
    perPlats.set(k, [...(perPlats.get(k) ?? []), o]);
  }
  const grupper: Platsgrupp[] = [];
  const ensamma = new Set<string>();
  for (const [k, nalarHar] of perPlats) {
    const punkt = mitt.get(k);
    const antal = new Set(nalarHar.map((o) => o.id)).size;
    if (antal === 1 || !punkt) {
      for (const o of nalarHar) ensamma.add(o.nyckel);
      continue;
    }
    grupper.push({ kod: k, namn: namn(nalarHar[0], niva) ?? k, antal, lng: punkt[0], lat: punkt[1] });
  }
  // Störst först: den ritas underst, och dess namn får plats före de mindre.
  grupper.sort((a, b) => b.antal - a.antal || a.namn.localeCompare(b.namn, 'sv'));
  return { grupper, ensamma };
}

/**
 * Lägsta och högsta zoom när kartan passas in på ett urval. Ligger allt i en kommun
 * zoomas det in tills organisationerna syns, annars stannar kartan på kommunnivån.
 * Den lägsta gränsen ligger strax över nivåbytet: i smal vy får en tät kommun annars inte plats.
 */
export function zoomgranser(urval: Platspost[]): [number, number] {
  const kommuner = new Set(urval.filter(harPlats).map((o) => o.k));
  if (kommuner.size <= 1) return [ZOOM_POSTER + 0.02, ZOOM_POSTER + 1.5];
  return [ZOOM_KOMMUN + 0.2, ZOOM_POSTER - 0.5];
}

/**
 * Platsen efter att besökaren själv har zoomat från `fran` till `zoom`. Den som backar ur
 * en nivå lämnar platsen den hörde till, med marginal så att en liten rörelse inte ändrar
 * något. Den som zoomar in lämnar aldrig en plats, var zoomen än slutar.
 */
export function platsEfterUtzoomning(zoom: number, plats: Plats, fran = Infinity): Plats {
  if (zoom >= fran) return plats;
  if (plats.lan && zoom < ZOOM_KOMMUN - 0.5) return { lan: '', kommun: '' };
  if (plats.kommun && zoom < ZOOM_POSTER - 2) return { lan: plats.lan, kommun: '' };
  return plats;
}
