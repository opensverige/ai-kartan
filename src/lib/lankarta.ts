// Länskartan: länets form, kommungränserna och en prick per kommun med organisationer, ritad som
// SVG i bygget. Samma ritning står på länets sida och i delningsbilden. Pricken står på kommunens
// punkt och är ingen adress, precis som kommunytan på kartsidan. Reglerna står här, utan sida och
// utan filer, så att de går att pröva.

/** En ring som [lng, lat], som i GeoJSON. */
export type Ring = [number, number][];

export interface Geometri {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

export interface Kommunprick {
  kod: string;
  namn: string;
  slug: string;
  lat: number;
  lng: number;
  antal: number;
}

export interface RitadPrick extends Kommunprick {
  x: number;
  y: number;
  r: number;
}

export interface Radie {
  /** Radien för en kommun med en organisation. */
  min: number;
  /** Hur mycket radien växer med roten ur antalet. Ytan följer då antalet. */
  steg: number;
  max: number;
}

export interface Ritad {
  bredd: number;
  hojd: number;
  /** Länets yta som en SVG-bana. */
  land: string;
  /** Kommunernas gränser som en SVG-bana. Länets egen kant ingår, men ritas ovanpå av land. */
  granser: string;
  /** Störst först, så att en liten kommun ritas ovanpå en stor granne. */
  prickar: RitadPrick[];
}

export interface Ritval {
  maxBredd: number;
  maxHojd: number;
  /** Luft runt länet, så att en prick vid kanten inte klipps. */
  marginal: number;
  radie: Radie;
  /** Punkter närmare varandra än så här, i pixlar, slås ihop. */
  tolerans?: number;
  /** Öar vars ruta är mindre än så här, i kvadratpixlar, ritas inte. */
  minYta?: number;
  /** Decimaler i banorna. En karta på en sida klarar sig med hela pixlar. */
  decimaler?: number;
}

/** Alla yttre och inre ringar i en geometri. */
export function ringar(g: Geometri): Ring[] {
  const polygoner = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as number[][][][];
  return polygoner.flatMap((p) => p.map((r) => r.map(([lng, lat]): [number, number] => [lng, lat])));
}

/**
 * Ritar om grader till pixlar. Längdgraderna krymps med cosinus för länets mittlatitud, så att
 * Norrbotten inte blir bredare än det är. Över ett län är felet mot en riktig projektion litet.
 */
export function projektion(form: Ring[], maxBredd: number, maxHojd: number, marginal: number) {
  const lat = form.flatMap((r) => r.map((p) => p[1]));
  const lng = form.flatMap((r) => r.map((p) => p[0]));
  const [lat0, lat1] = [Math.min(...lat), Math.max(...lat)];
  const [lng0, lng1] = [Math.min(...lng), Math.max(...lng)];
  const k = Math.cos((((lat0 + lat1) / 2) * Math.PI) / 180);
  const b = (lng1 - lng0) * k;
  const h = lat1 - lat0;
  const skala = Math.min((maxBredd - 2 * marginal) / b, (maxHojd - 2 * marginal) / h);
  const runda = (v: number) => Math.round(v * 10) / 10;
  return {
    bredd: Math.ceil(b * skala + 2 * marginal),
    hojd: Math.ceil(h * skala + 2 * marginal),
    punkt: (lngv: number, latv: number): [number, number] => [runda(marginal + (lngv - lng0) * k * skala), runda(marginal + (lat1 - latv) * skala)],
  };
}

/** Tar bort punkter som ligger närmare den förra än `tolerans`. Första och sista punkten behålls. */
export function forenkla(ring: [number, number][], tolerans: number): [number, number][] {
  if (ring.length <= 4) return ring;
  const ut: [number, number][] = [ring[0]];
  for (const p of ring.slice(1, -1)) {
    const [x, y] = ut[ut.length - 1];
    if (Math.hypot(p[0] - x, p[1] - y) >= tolerans) ut.push(p);
  }
  ut.push(ring[ring.length - 1]);
  return ut;
}

/** Ringarna som en SVG-bana. En ring vars ruta är mindre än `minYta` hoppas över. */
export function bana(ringarIPixlar: [number, number][][], minYta: number, decimaler: number = 1): string {
  const f = 10 ** decimaler;
  const tal = (v: number) => Math.round(v * f) / f;
  return ringarIPixlar
    .filter((r) => {
      if (r.length < 4) return false;
      const xs = r.map((p) => p[0]);
      const ys = r.map((p) => p[1]);
      return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) >= minYta;
    })
    .map((r) => `M${r.map(([x, y]) => `${tal(x)} ${tal(y)}`).join('L')}Z`)
    .join('');
}

/** Pricken växer med roten ur antalet, så att ytan säger antalet, men aldrig över max. */
export function prickradie(antal: number, r: Radie): number {
  return Math.round(Math.min(r.max, r.min + r.steg * (Math.sqrt(antal) - 1)) * 10) / 10;
}

/** Hela ritningen för ett län. `kommuner` är gränserna för länets alla kommuner, även de utan prick. */
export function ritaLan(lan: Geometri, kommuner: Geometri[], prickar: Kommunprick[], val: Ritval): Ritad {
  const { tolerans = 0.8, minYta = 2, decimaler = 1 } = val;
  const form = ringar(lan);
  const p = projektion(form, val.maxBredd, val.maxHojd, val.marginal);
  const iPixlar = (r: Ring) => forenkla(r.map(([lng, lat]) => p.punkt(lng, lat)), tolerans);
  return {
    bredd: p.bredd,
    hojd: p.hojd,
    land: bana(form.map(iPixlar), minYta, decimaler),
    granser: bana(kommuner.flatMap(ringar).map(iPixlar), minYta, decimaler),
    prickar: prickar
      .filter((k) => k.antal > 0)
      .map((k) => {
        const [x, y] = p.punkt(k.lng, k.lat);
        return { ...k, x, y, r: prickradie(k.antal, val.radie) };
      })
      .sort((a, b) => b.antal - a.antal || a.kod.localeCompare(b.kod)),
  };
}
